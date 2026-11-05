// The caravan's sheet, seen from the server: reads go through the Apps Script (action 'lire').
//
// Each call to the script costs Google's fixed overhead (seconds), so calls are rare:
// - reads are kept in Next's Data Cache, shared by every server instance (stale after 45 s, then
//   refreshed in the background while the old copy is served);
// - the script numbers the registre's states (`version`, +1 per write); a reader who has already
//   seen a newer version than the shared copy gets a fresh read, so one's own writes never vanish;
// - a write answers with every tab: the writing instance keeps that copy, nothing is read again.
// COMMANDES_SCRIPT_URL and COMMANDES_JETON never leave the server, nor does the members' list.

import { revalidateTag, unstable_cache } from 'next/cache'
import { lireOnglets, type Onglets } from './missives'
import { lireMissions } from './missions'
import { lirePaie } from './paie'
import { lirePermissions, MEMBRE, semis } from './droits'

export const ETIQUETTE_REGISTRE = 'registre'
/** Seconds a read of the sheet is reused. */
const FRAICHEUR = 45

export const registreRelie = () => Boolean(process.env.COMMANDES_SCRIPT_URL && process.env.COMMANDES_JETON)

export class ErreurScript extends Error {}

/** One call to the Apps Script web app (it answers a POST with a redirect to the result; fetch follows it). */
export async function appelerScript<T = Record<string, unknown>>(corps: Record<string, unknown>): Promise<T & { ok: true }> {
  const url = process.env.COMMANDES_SCRIPT_URL
  const jeton = process.env.COMMANDES_JETON
  if (!url || !jeton) throw new ErreurScript('script not configured')
  const rep = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jeton, ...corps }),
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
  const texte = await rep.text()
  let r: { ok?: boolean; erreur?: string } | null = null
  try {
    r = JSON.parse(texte)
  } catch {
    r = null
  }
  if (!rep.ok || !r?.ok) throw new ErreurScript(`HTTP ${rep.status}: ${r?.erreur ?? texte.slice(0, 200)}`)
  return r as T & { ok: true }
}

type Lecture = { onglets: Onglets; version: number }
type ReponseLire = { onglets: Onglets; version?: number; ms?: number; cache?: boolean }

/** The last script call's own execution time, for Server-Timing. */
export let dernierScript: { ms: number | null; cache: boolean | null } = { ms: null, cache: null }

// `missions: true` asks a v3m script for the missions' tabs too (lib/missions.ts), `paie: true` a v3n script
// for the pay's (lib/paie.ts), `discord: true` for the members' Discord ID (lib/identite.ts), `rangs: true` a
// v3p script for the Rôles tab and the Grimoire's rows of Permissions (lib/droits.ts), and its 'membre' writing the
// ranks in « Rôle »; an older script ignores them (then nothing is granted but to testers).
const DRAPEAUX = { missions: true, paie: true, discord: true, rangs: true }

async function lireScript(): Promise<Lecture> {
  const r = await appelerScript<ReponseLire>({ action: 'lire', ...DRAPEAUX })
  dernierScript = { ms: r.ms ?? null, cache: r.cache ?? null }
  return { onglets: r.onglets, version: r.version ?? 0 }
}

const lirePartage = unstable_cache(lireScript, ['registre-onglets-v3p'], { revalidate: FRAICHEUR, tags: [ETIQUETTE_REGISTRE] })

/** This instance's newest copy (from its own writes or fresh reads). */
let frais: (Lecture & { le: number }) | null = null

/** The last read that succeeded on this instance, kept for a short outage of the script (lireRegistreOuSecours). */
let dernierBon: (Lecture & { le: number }) | null = null
/** How long the last good read stands in for a failed one (ms). */
const SECOURS = 10 * 60 * 1000

/** A write that does not answer with the tabs (a sealed order): the next read goes to the sheet. */
export function oublierRegistre() {
  frais = null
  revalidateTag(ETIQUETTE_REGISTRE)
}

function garder(l: Lecture) {
  if (!frais || l.version >= frais.version) frais = { ...l, le: Date.now() }
}

/**
 * Every tab of the registre, typed (members included: server use only), at least as new as
 * `versionVue` (the newest version the reader has seen).
 */
export async function lireRegistre(versionVue = 0) {
  let l: Lecture | null = frais && Date.now() - frais.le < FRAICHEUR * 1000 && frais.version >= versionVue ? frais : null
  if (!l) {
    const partage = await lirePartage()
    l = frais && frais.version > partage.version && frais.version >= versionVue ? frais : partage
    if (l.version < versionVue) {
      l = await lireScript()
      garder(l)
    }
  }
  dernierBon = { ...l, le: Date.now() }
  return lu(l)
}

/**
 * A read straight from the script (never the shared copy, which may lag 45 s behind a hand edit of the sheet): the
 * Discord seal asks it before refusing anyone, so a rank just mapped in « Rôles » opens the door at once.
 */
export async function lireRegistreFrais() {
  const l = await lireScript()
  garder(l)
  dernierBon = { ...l, le: Date.now() }
  return lu(l)
}

/**
 * lireRegistre, or — when the script cannot be reached — this instance's last good read if it is less than ten
 * minutes old (contract § 5: a short outage may be bridged, a failed read never grants). Throws otherwise.
 */
export async function lireRegistreOuSecours(versionVue = 0) {
  try {
    return await lireRegistre(versionVue)
  } catch (e) {
    if (dernierBon && Date.now() - dernierBon.le < SECOURS) {
      console.error('[registre] script unreachable, last good read used', e)
      return lu(dernierBon)
    }
    throw e
  }
}

/** Every tab typed: the registre's, the missions' and the pay's (the missions read their shares from the pay's settings). */
function lu(l: Lecture) {
  const paie = lirePaie(l.onglets)
  const missions = lireMissions(l.onglets)
  if (paie.actif) missions.ponderation = { ...missions.ponderation, reglages: { ...missions.ponderation.reglages, partRessources: paie.reglages.ressources, partFabrication: paie.reglages.fabrication } }
  return { ...lireOnglets(l.onglets), missions, paie, droits: lirePermissions(l.onglets), version: l.version }
}

/** A write action of the script; its answer carries the tabs as they now are (null with an older script). */
export async function ecrireRegistre(action: string, charge: Record<string, unknown>) {
  const r = await appelerScript<{ onglets?: Onglets; version?: number; ms?: number; etapes?: Record<string, number> }>({ action, ...DRAPEAUX, ...charge })
  dernierScript = { ms: r.ms ?? null, cache: null }
  if (!r.onglets) return { ...r, lu: null }
  const l = { onglets: r.onglets, version: r.version ?? 0 }
  garder(l)
  return { ...r, lu: lu(l) }
}

type Registre = Awaited<ReturnType<typeof lireRegistre>>

/**
 * The Grimoire's rows of the Permissions tab seeded once with the defaults (contract § 5), when the tab holds
 * none yet and the Rôles tab maps « Membre » to a Discord role (else the open gestures would be seeded on no
 * column). The script writes nothing if another call seeded first. Answers the registre as it now is.
 */
export async function semerSiBesoin(l: Registre): Promise<Registre> {
  const t = l.droits
  if (!t.lu || t.semees || !t.roles.some((r) => r.cle === MEMBRE && r.id)) return l
  const r = await ecrireRegistre('permissions', { droits: { semer: true, rangs: t.colonnes.map((c) => c.nom), lignes: semis(t) } })
  console.log(`[permissions] seeded: ${(r as { seme?: boolean }).seme ? `${(r as { ajoutees?: number }).ajoutees ?? 0} rows` : 'already there'}`)
  return r.lu ?? (await lireRegistre(r.version ?? 0))
}
