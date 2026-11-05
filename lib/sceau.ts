// Session "seal". Two ways in:
// - Discord (when DISCORD_* are set): a member of the caravan's guild whose ranks (their Discord roles mapped by
//   the sheet's « Rôles » tab) may « Entrer dans le grimoire » (lib/droits.ts, checked at /api/discord/retour). The
//   cookie holds a signed record (id, display name, role IDs, 24 h expiry).
// - The shared password (when Discord is not configured, or alongside it with
//   SCEAU_MOT_DE_PASSE_COMMUN=1): the cookie holds HMAC(secret, password), so changing the
//   password breaks every such seal.
// - A tester's « qualité » (lot 1c): a tester may view the book as a chosen set of ranks (COOKIE_QUALITE, signed, tied
//   to their Discord user ID, re-checked against TESTEURS_DISCORD_IDS on every request). The session then carries
//   `qualite`: lib/identite.ts reads its ranks instead of the seal's and suspends the tester flag; the middleware
//   shows the refusal when those ranks may not enter. The real identity (ID, name, Discord roles) never changes.
// Web Crypto only: this file runs in the middleware (edge) as well as in route handlers.

import { estTesteur } from './testeurs'

export const COOKIE_SCEAU = 'caravane_sceau'
export const DUREE_SCEAU = 60 * 60 * 24 * 30

/** Discord session record. Kept 30 days so an expired one can be renewed silently. */
export const COOKIE_MEMBRE = 'caravane_membre'
/** Roles are re-checked at most every 24 h. */
export const DUREE_MEMBRE = 60 * 60 * 24
/** "Known visitor": once in through Discord, an expired session is renewed with prompt=none. */
export const COOKIE_CONNU = 'caravane_connu'
export const DUREE_CONNU = 60 * 60 * 24 * 365
/** OAuth state (CSRF), signed, 10 minutes. */
export const COOKIE_ETAT = 'caravane_etat'
/** Set when a silent renewal failed: no new silent attempt for 10 minutes (no redirect loop). */
export const COOKIE_SILENCE = 'caravane_silence'

/** A tester's chosen ranks (lot 1c, lib/qualite.ts): a browser-session cookie, signed, 24 h at most. */
export const COOKIE_QUALITE = 'caravane_qualite'
export const DUREE_QUALITE = 60 * 60 * 24

/** Name carried by password sessions (they have no identity). */
export const NOM_COMMUN = 'Un marchand de la caravane'

const encodeur = new TextEncoder()
const decodeur = new TextDecoder()

async function hmac(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey('raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cle, encodeur.encode(message))
  return Array.from(new Uint8Array(signature), (o) => o.toString(16).padStart(2, '0')).join('')
}

export function egaux(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* ── Configuration ─────────────────────────────────────────── */

export function discordConfigure(): boolean {
  const e = process.env
  // No role list here (lot 1b): who may enter is the sheet's « Entrer dans le grimoire » row.
  return Boolean(e.DISCORD_CLIENT_ID && e.DISCORD_CLIENT_SECRET && e.DISCORD_GUILD_ID && e.CARAVANE_SECRET)
}

export function sceauConfigure(): boolean {
  return Boolean(process.env.CARAVANE_MOT_DE_PASSE && process.env.CARAVANE_SECRET)
}

/** The shared password opens the book when Discord is absent, or alongside it when allowed. */
export function motDePasseAccepte(): boolean {
  return sceauConfigure() && (!discordConfigure() || process.env.SCEAU_MOT_DE_PASSE_COMMUN === '1')
}

/* ── Shared password ───────────────────────────────────────── */

export async function jetonPour(motDePasse: string): Promise<string | null> {
  const secret = process.env.CARAVANE_SECRET
  if (!secret) return null
  return hmac(secret, `sceau:${motDePasse}`)
}

export async function jetonAttendu(): Promise<string | null> {
  const motDePasse = process.env.CARAVANE_MOT_DE_PASSE
  return motDePasse ? jetonPour(motDePasse) : null
}

/* ── Signed values (Discord session, OAuth state) ──────────── */

function versBase64Url(octets: Uint8Array): string {
  let bin = ''
  octets.forEach((o) => (bin += String.fromCharCode(o)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function depuisBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** `base64url(JSON).hmac` — readable by anyone, forgeable by no one without CARAVANE_SECRET. */
export async function signer(usage: string, valeur: unknown): Promise<string> {
  const secret = process.env.CARAVANE_SECRET
  if (!secret) throw new Error('CARAVANE_SECRET missing')
  const corps = versBase64Url(encodeur.encode(JSON.stringify(valeur)))
  return `${corps}.${await hmac(secret, `${usage}:${corps}`)}`
}

export async function verifier<T>(usage: string, signe: string | undefined): Promise<T | null> {
  const secret = process.env.CARAVANE_SECRET
  if (!secret || !signe) return null
  const [corps, sig] = signe.split('.')
  if (!corps || !sig || !egaux(sig, await hmac(secret, `${usage}:${corps}`))) return null
  try {
    return JSON.parse(decodeur.decode(depuisBase64Url(corps))) as T
  } catch {
    return null
  }
}

/**
 * `roles`: the member's Discord role IDs in the caravan's guild, as read at the seal (mapped to the grimoire's
 * ranks by the sheet's « Rôles » tab, lib/droits.ts). Absent from a seal made before lot 1 (no rank until renewed).
 * `patriarche`: written by seals made before lot 1b (DISCORD_ROLE_PATRIARCHE), never read any more.
 */
export type Membre = { id: string; nom: string; patriarche?: boolean; roles?: string[]; exp: number }

/**
 * A tester viewing the book « en la qualité de » some ranks (lot 1c). `id`: the tester's Discord user ID (the cookie
 * is void for any other seal); `rangs`: the ranks' keys (lib/droits.ts), [] = no rank; `noms`: their labels as the
 * Rôles tab spelled them when chosen; `refus`: null when those ranks may « Entrer dans le grimoire » (decided when
 * chosen, as a real seal's entry is decided at the seal), else the lock page's refusal (`rang` or `registre`).
 */
export type Qualite = { id: string; rangs: string[]; noms: string[]; refus: null | 'rang' | 'registre'; exp: number }

/* ── Who is at the door ────────────────────────────────────── */

export type Session =
  | { valide: true; genre: 'discord'; membre: Membre; qualite?: Qualite }
  | { valide: true; genre: 'commun' }
  | { valide: false; expiree: boolean }

type Biscuits = { get(nom: string): { value: string } | undefined }

export async function lireSession(biscuits: Biscuits): Promise<Session> {
  let expiree = false
  if (discordConfigure()) {
    const m = await verifier<Membre>('membre', biscuits.get(COOKIE_MEMBRE)?.value)
    if (m && typeof m.exp === 'number') {
      if (m.exp > Date.now()) {
        const qualite = await lireQualite(biscuits, m.id)
        return qualite ? { valide: true, genre: 'discord', membre: m, qualite } : { valide: true, genre: 'discord', membre: m }
      }
      expiree = true
    }
  }
  if (motDePasseAccepte()) {
    const jeton = biscuits.get(COOKIE_SCEAU)?.value
    const attendu = await jetonAttendu()
    if (jeton && attendu && egaux(jeton, attendu)) return { valide: true, genre: 'commun' }
  }
  return { valide: false, expiree }
}

/** The tester's chosen ranks: only when signed, unexpired, tied to this seal's ID, and that ID is still a tester. */
async function lireQualite(biscuits: Biscuits, id: string): Promise<Qualite | null> {
  const brut = biscuits.get(COOKIE_QUALITE)?.value
  if (!brut || !estTesteur(id)) return null
  const q = await verifier<Qualite>('qualite', brut)
  if (!q || q.id !== id || typeof q.exp !== 'number' || q.exp <= Date.now() || !Array.isArray(q.rangs)) return null
  return { id, rangs: q.rangs.map(String), noms: Array.isArray(q.noms) ? q.noms.map(String) : [], refus: q.refus === 'rang' || q.refus === 'registre' ? q.refus : null, exp: q.exp }
}

/** Display name of the session: the member's name, or the generic one for the shared password. */
export function nomDe(s: Session): string | null {
  if (!s.valide) return null
  return s.genre === 'discord' ? s.membre.nom : NOM_COMMUN
}
