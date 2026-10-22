import type { Article, Artisan } from './types'

export const ARTISANS: Record<Artisan, string> = {
  alchimiste: 'Alchimiste',
  forgeron: 'Forgeron',
  couturier: 'Couturier',
  divers: 'Divers',
}

export const ICONES_ARTISANS: Record<Artisan, string> = {
  alchimiste: 'drink-me',
  forgeron: 'anvil',
  couturier: 'sewing-needle',
  divers: 'two-coins',
}

export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function jetons(requete: string): string[] {
  return normaliser(requete).split(/\s+/).filter(Boolean)
}

export function articleCorrespond(a: Article, requete: string): boolean {
  const js = jetons(requete)
  if (!js.length) return true
  const foin = normaliser(`${a.fr} ${a.en} ${ARTISANS[a.artisan]} ${a.note}`)
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
