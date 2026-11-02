// Who holds the pen, for missives and orders: a name from the Membres tab (the whitelist). A member
// types their name once; the server matches it against the list (case, accents, apostrophes and
// spaces ignored) and keeps the sheet's spelling in a signed cookie. A Discord seal maps the
// member's server nickname to the list the same way. The list never reaches the page.

import type { NextResponse } from 'next/server'
import { cle } from './missives'
import { lireSession, signer, verifier } from './sceau'
import type { Role } from './droits'

export const COOKIE_NOM = 'caravane_nom'
const DUREE_NOM = 60 * 60 * 24 * 400

type Biscuits = { get(nom: string): { value: string } | undefined }
/** `discord`: the member's Discord user ID (Membres « Discord ID »), linked at their first Discord seal (v3n). */
type Membre = { nom: string; role: string; discord?: string; pseudo?: string }

export const REFUS_SCEAU = 'Ce nom porte déjà le sceau d’un autre marchand.'

export type Identite = { nom: string; roles: Role[]; source: 'discord' | 'signature' }

export function trouverMembre(nom: string, membres: Membre[]): Membre | null {
  const k = cle(nom)
  return k ? (membres.find((m) => cle(m.nom) === k) ?? null) : null
}

/** The row that carries this Discord user ID. */
export function trouverParDiscord(id: string, membres: Membre[]): Membre | null {
  return id ? (membres.find((m) => m.discord && m.discord === id) ?? null) : null
}

/**
 * Whether a Discord session may take a row by its name: only a row without a Discord ID, or with this
 * session's own.
 */
export const libreDe = (m: Membre, id: string) => !m.discord || m.discord === id

export const REFUS_AMI = 'Un ami des Lunes ne signe pas le registre de la caravane.'

export const rolesDe = (m: Membre, patriarche = false): Role[] => {
  const roles = m.role.split(/[,;/]/).map(cle).filter(Boolean)
  if (patriarche && !roles.includes('patriarche')) roles.push('patriarche')
  return roles
}

/** The name in the signed cookie, as validated when it was set (not re-checked against the list). */
export async function nomSigne(biscuits: Biscuits): Promise<string | null> {
  const v = await verifier<{ nom?: string }>('nom', biscuits.get(COOKIE_NOM)?.value)
  return typeof v?.nom === 'string' && v.nom ? v.nom : null
}

/**
 * Quick identity for display (no call to the sheet): the signed cookie's name, as validated when it
 * was set. Discord sessions need the list (their nickname is mapped to it): null here.
 */
export async function identiteSignee(biscuits: Biscuits): Promise<string | null> {
  const s = await lireSession(biscuits)
  if (!s.valide || s.genre === 'discord') return null
  return nomSigne(biscuits)
}

/**
 * The visitor's identity checked against the current members' list (null: unknown or not signed).
 * `sceaux`: the script reads the Membres' Discord IDs (v3n): a Discord seal is then its linked row only
 * (linked at the ex-libris), never a nickname. With an older script: the nickname, then the typed name.
 */
export async function identite(biscuits: Biscuits, membres: Membre[], sceaux = false): Promise<Identite | null> {
  const s = await lireSession(biscuits)
  if (!s.valide) return null
  if (s.genre === 'discord') {
    // 1. By the Discord user ID; 2. by the server nickname, only onto a row without an ID (the
    // transition while the column is filled): a row that has an ID is never reached by nickname.
    const parId = trouverParDiscord(s.membre.id, membres)
    if (parId) return { nom: parId.nom, roles: rolesDe(parId, s.membre.patriarche), source: 'discord' }
    if (sceaux) return null
    const m = trouverMembre(s.membre.nom, membres.filter((x) => !x.discord))
    if (m) return { nom: m.nom, roles: rolesDe(m, s.membre.patriarche), source: 'discord' }
  }
  const signe = await nomSigne(biscuits)
  const m = signe ? trouverMembre(signe, membres) : null
  // 3. A typed name, under the same rule: never a row that carries another seal's ID.
  if (m && s.genre === 'discord' && !libreDe(m, s.membre.id)) return null
  return m ? { nom: m.nom, roles: rolesDe(m), source: 'signature' } : null
}

export async function poserNom(rep: NextResponse, nom: string | null) {
  rep.cookies.set(COOKIE_NOM, nom ? await signer('nom', { nom }) : '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: nom ? DUREE_NOM : 0,
  })
}
