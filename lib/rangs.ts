// Ranks of the caravan, as the « Caravane » page draws them: order (level), names, colours and, later,
// an engraved icon per rank (a game-icons.net name in `icone`; until then a coloured seal). A member's
// rank is read from the « Rôle » column of the Membres tab: the rank's name (or one of its `alias`),
// case, accents and punctuation ignored. Anyone else is « Sans rang ».

import { cle } from './missives'

export type Rang = {
  cle: string
  nom: string
  /** 1 = top of the tree; ranks of the same level are siblings. */
  niveau: number
  couleur: string
  /**
   * The rank's medallion: an image path under public/ (e.g. '/rangs/voix-du-commerce.webp', round, transparent
   * outside, drawn instead of the coloured seal), or a game-icons.net name drawn inside the seal. None: the seal.
   */
  icone?: string
  /** Other spellings accepted in the « Rôle » column. */
  alias?: string[]
  /** The name cut in lines under the seal (defaults to the name). */
  lignes?: string[]
  /**
   * How the members note lays out the names: one per line (default, a roll of honour), or side by side
   * on one line ('cote-a-cote', wrapping only when needed) for a rank whose holders are equals.
   */
  disposition?: 'cote-a-cote'
  /** The closing quote at the foot of the rank's members note (❦ then italic). */
  citation?: string
}

export const RANGS: Rang[] = [
  { cle: 'patriarche', nom: 'Patriarche', niveau: 1, couleur: '#8a1c12', alias: ['Patriarches'], icone: '/rangs/patriarche.webp', disposition: 'cote-a-cote', citation: "Ceux qui marchent devant portent la lanterne. Khajiit suit leur lumière, et la caravane ne se perd jamais." },
  { cle: 'maitre-des-routes', nom: 'Maître des routes', niveau: 2, couleur: '#1f3a5f', lignes: ['Maître', 'des routes'], icone: '/rangs/maitre-des-routes.webp', citation: "Toute route mène quelque part ; le Maître des routes sait laquelle ramène Khajiit sous les lunes." },
  { cle: 'voix-du-commerce', nom: 'Voix du commerce', niveau: 2, couleur: '#9a7420', lignes: ['Voix', 'du commerce'], icone: '/rangs/voix-du-commerce.webp', citation: "Une pièce bien comptée vaut dix pièces promises. La Voix du commerce compte pour toute la caravane." },
  { cle: 'voix-de-la-securite', nom: 'Voix de la sécurité', niveau: 2, couleur: '#2f5b3a', lignes: ['Voix', 'de la sécurité'], icone: '/rangs/voix-de-la-securite.webp', citation: "Khajiit dort tranquille sous Jone et Jode, car d'autres yeux veillent dans le noir." },
  { cle: 'marchand-de-lune', nom: 'Marchand de lune', niveau: 3, couleur: '#5a2d6b', alias: ['Marchands de lune', 'Marchande de lune'], icone: '/rangs/marchand-de-lune.webp', citation: "Khajiit a des marchandises, si tu as de l'or. Le reste, les lunes le règlent." },
  { cle: 'petites-lunes', nom: 'Petites lunes', niveau: 4, couleur: '#5d6a86', alias: ['Petite lune'], icone: '/rangs/petites-lunes.webp', citation: "Les petites lunes grandissent à chaque route parcourue ; un jour, elles éclaireront le chemin des autres." },
]

export const SANS_RANG = {
  cle: 'sans-rang',
  nom: 'Sans rang',
  citation: "Nul nom au registre, mais les mêmes lunes au-dessus de la tête : qui marche avec la caravane est de la caravane.",
}

/** An image medallion (a path), as opposed to a game-icons glyph. */
export const estImage = (icone?: string) => Boolean(icone && icone.startsWith('/'))

export const ICONES_RANGS = RANGS.flatMap((r) => (r.icone && !estImage(r.icone) ? [r.icone] : []))

/** The rank written in a « Rôle » cell (several roles may be separated by commas), or null. */
export function rangDe(role: string): Rang | null {
  for (const morceau of String(role ?? '').split(/[,;/]/)) {
    const k = cle(morceau)
    if (!k) continue
    const r = RANGS.find((x) => cle(x.nom) === k || (x.alias ?? []).some((a) => cle(a) === k))
    if (r) return r
  }
  return null
}

/** What signed readers receive: member names grouped by rank key (and « sans-rang »). */
export type Hierarchie = Record<string, string[]>
