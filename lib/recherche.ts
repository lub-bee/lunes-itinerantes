import type { Article } from './types'

export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** An article's id from its name (« Épée en fer » → « epee-en-fer »). */
export function slug(s: string): string {
  return normaliser(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function jetons(requete: string): string[] {
  return normaliser(requete).split(/\s+/).filter(Boolean)
}

export function articleCorrespond(a: Article, requete: string): boolean {
  const js = jetons(requete)
  if (!js.length) return true
  const foin = normaliser(`${a.fr} ${a.en} ${a.artisan} ${a.note}`)
  return js.every((j) => foin.includes(j))
}

/** Every word of the query found in one of the names (French, English, craft…), accents and case ignored. */
export function nomsCorrespondent(noms: string[], requete: string): boolean {
  const js = jetons(requete)
  if (!js.length) return true
  const foin = normaliser(noms.join(' '))
  return js.every((j) => foin.includes(j))
}

export function compterDans(texte: string, requete: string): number {
  const js = jetons(requete)
  if (!js.length) return 0
  const foin = normaliser(texte)
  if (!js.every((j) => foin.includes(j))) return 0
  return foin.split(js[0]).length - 1
}

/** Ranges [start, end) in the ORIGINAL string that match any token (accent-insensitive). */
export function plages(texte: string, requete: string): [number, number][] {
  const js = jetons(requete)
  if (!js.length) return []
  let norm = ''
  const carte: number[] = []
  for (let i = 0; i < texte.length; i++) {
    const n = normaliser(texte[i])
    for (let k = 0; k < n.length; k++) carte.push(i)
    norm += n
  }
  const marques = new Array<boolean>(texte.length).fill(false)
  for (const j of js) {
    let p = norm.indexOf(j)
    while (p !== -1) {
      for (let k = p; k < p + j.length; k++) marques[carte[k]] = true
      p = norm.indexOf(j, p + 1)
    }
  }
  const res: [number, number][] = []
  for (let i = 0; i < marques.length; i++) {
    if (!marques[i]) continue
    let f = i
    while (f < marques.length && marques[f]) f++
    res.push([i, f])
    i = f
  }
  return res
}

/** Letters and digits only, no accents, lower case (« Potion de soin » → « potiondesoin »). */
const compact = (s: string) => normaliser(s).replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '')

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const ligne = [i]
    for (let j = 1; j <= b.length; j++) ligne.push(Math.min(prec[j] + 1, ligne[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)))
    prec = ligne
  }
  return prec[b.length]
}

/**
 * How close a typed name is to a known one, 0 to 1, ignoring case, accents, spaces and punctuation:
 * the same name, a beginning, a part, every typed word found, or a near spelling (a letter or two off).
 */
export function ressemblance(tape: string, nom: string): number {
  const q = compact(tape)
  const n = compact(nom)
  if (!q || !n) return 0
  if (q === n) return 1
  if (n.startsWith(q)) return 0.95
  if (n.includes(q)) return 0.85
  const mots = jetons(tape).map(compact).filter((m) => m.length > 1)
  if (mots.length > 1 && mots.every((m) => n.includes(m))) return 0.8
  if (q.includes(n) && n.length >= 4) return 0.75
  const proche = 1 - levenshtein(q, n) / Math.max(q.length, n.length)
  // A near spelling of the start (« potion de so » ~ « potion de soin »), or of the whole name.
  const debut = n.length > q.length ? 1 - levenshtein(q, n.slice(0, q.length)) / q.length : 0
  return Math.max(proche, debut * 0.9)
}

/** The known items closest to what is being typed (each item may carry several names, FR and EN). */
export function proches<T>(tape: string, items: T[], noms: (x: T) => string[], max = 5, seuil = 0.72): T[] {
  if (compact(tape).length < 2) return []
  return items
    .map((x) => ({ x, s: Math.max(0, ...noms(x).filter(Boolean).map((n) => ressemblance(tape, n))) }))
    .filter((r) => r.s >= seuil)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((r) => r.x)
}
