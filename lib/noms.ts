// Members' names typed in a form (event participants, the Patriarchs' list, the ex-libris…): the register's
// names (Membres tab) closest to what is typed, compared with cle() (case, accents, apostrophes and spaces
// ignored, as the server matches them), the same name first, then a beginning, a part, a near spelling.

import { cle } from './missives'
import { ressemblance } from './recherche'

/** The register's spelling of a typed name, when the register holds it (cle() equal), else null. */
export function nomDuRegistre(tape: string, noms: readonly string[]): string | null {
  const k = cle(tape)
  return k ? (noms.find((n) => cle(n) === k) ?? null) : null
}

/**
 * The names closest to `tape`, best first (ties in alphabetical order), at most `max`. `exclure`: names already
 * chosen (compared with cle()). Below two letters, nothing: a single letter matches half the caravan.
 */
export function nomsProches(tape: string, noms: readonly string[], max = 5, exclure: readonly string[] = [], seuil = 0.6): string[] {
  const k = cle(tape)
  if (k.length < 2) return []
  const deja = new Set(exclure.map(cle))
  const vus = new Set<string>()
  const res: { n: string; s: number }[] = []
  for (const n of noms) {
    const kn = cle(n)
    if (!kn || deja.has(kn) || vus.has(kn)) continue
    vus.add(kn)
    const s = kn === k ? 1 : ressemblance(tape, n)
    if (s >= seuil) res.push({ n, s })
  }
  return res
    .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n, 'fr'))
    .slice(0, max)
    .map((r) => r.n)
}

/** A comma-separated list of names (a setting's text) as a list, and back. */
export const nomsDeTexte = (t: string) => t.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)
export const texteDeNoms = (noms: readonly string[]) => noms.join(', ')
