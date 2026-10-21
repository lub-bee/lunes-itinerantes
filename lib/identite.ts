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
type Membre = { nom: string; role: string }

export type Identite = { nom: string; roles: Role[]; source: 'discord' | 'signature' }

export function trouverMembre(nom: string, membres: Membre[]): Membre | null {
  const k = cle(nom)
  return k ? (membres.find((m) => cle(m.nom) === k) ?? null) : null
}

const rolesDe = (m: Membre, patriarche = false): Role[] => {
  const roles = m.role.split(/[,;/]/).map(cle).filter(Boolean)
  if (patriarche && !roles.includes('patriarche')) roles.push('patriarche')
  return roles
}

/** The name in the signed cookie, as validated when it was set (not re-checked against the list). */
export async function nomSigne(biscuits: Biscuits): Promise<string | null> {
  const v = await verifier<{ nom?: string }>('nom', biscuits.get(COOKIE_NOM)?.value)
  return typeof v?.nom === 'string' && v.nom ? v.nom : null
}

/** The visitor's identity checked against the current members' list (null: unknown or not signed). */
export async function identite(biscuits: Biscuits, membres: Membre[]): Promise<Identite | null> {
  const s = await lireSession(biscuits)
  if (!s.valide) return null
  if (s.genre === 'discord') {
    const m = trouverMembre(s.membre.nom, membres)
    if (m) return { nom: m.nom, roles: rolesDe(m, s.membre.patriarche), source: 'discord' }
  }
  const signe = await nomSigne(biscuits)
  const m = signe ? trouverMembre(signe, membres) : null
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
