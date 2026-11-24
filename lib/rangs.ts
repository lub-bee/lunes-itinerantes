// Ranks of the caravan, as the « Caravane » page draws them: order (level), names, colours and, later,
// an engraved icon per rank (a game-icons.net name in `icone`; until then a coloured seal). A member's
// rank is read from the « Rôle » column of the Membres tab (written at each Discord seal, lot 1b): the rank's name (or one of its `alias`),
// case, accents and punctuation ignored. Anyone else is « Sans rang ».

import { cle } from './missives'

export type Rang = {
  cle: string
  nom: string
  /** The English name, in italics under the title of the rank's members note. */
  nomEn: string
  /**
   * The rank's Khajiit title (the in-character name): shown before the English name under the title of the members
   * note and in the seal's label for screen readers (the tree keeps the French name: no room for both). Also accepted
   * in the « Rôle » column, like an alias (« Ros » alone is not: three ranks share it).
   */
  nomKhajiit?: string
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

// The hierarchy of 2026-11-24 (Ludo): every rank has a Khajiit title (`nomKhajiit`) and a French name, in two tiers (TIERS).
// Keys never change (the Permissions columns and the defaults of lib/droits.ts are read by key): a renamed rank keeps its
// former names in `alias`, so the « Rôle » cells and the Rôles labels already written still resolve (and the rename can be undone).
export const RANGS: Rang[] = [
  // Conseil restreint
  { cle: 'patriarche', nom: 'Patriarches', nomEn: 'Patriarchs', nomKhajiit: 'Ahnurra', niveau: 1, couleur: '#8a1c12', alias: ['Patriarche'], icone: '/rangs/patriarche.webp', disposition: 'cote-a-cote', citation: "Les Patriarches ne marchent pas devant : ils portent sur leurs épaules ce que la caravane ne saurait porter seule." },
  // The three Ros (Ludo, 2026-11-24): Wodro ros, Bajiit ros, Rasina ros.
  { cle: 'maitre-des-routes', nom: 'Maître des routes', nomEn: 'Master of Roads', nomKhajiit: 'Wodro ros', niveau: 2, couleur: '#1f3a5f', lignes: ['Maître', 'des routes'], icone: '/rangs/maitre-des-routes.webp', citation: "Le Maître des routes marche devant et la caravane le suit : toute route mène quelque part, lui sait laquelle ramène Khajiit sous Jone et Jode." },
  { cle: 'voix-du-commerce', nom: 'Voix du commerce', nomEn: 'Voice of Trade', nomKhajiit: 'Bajiit ros', niveau: 2, couleur: '#9a7420', lignes: ['Voix', 'du commerce'], icone: '/rangs/voix-du-commerce.webp', citation: "Une pièce bien comptée vaut dix pièces promises. La Voix du commerce compte pour toute la caravane." },
  { cle: 'voix-de-la-securite', nom: 'Voix de la sécurité', nomEn: 'Voice of Security', nomKhajiit: 'Rasina ros', niveau: 2, couleur: '#2f5b3a', lignes: ['Voix', 'de la sécurité'], icone: '/rangs/voix-de-la-securite.webp', citation: "Khajiit dort tranquille sous Jone et Jode, car d'autres yeux veillent dans le noir." },
  // Membres. « Pleine lune » is the former « Marchand de lune », renamed (Ludo, 2026-11-24).
  { cle: 'marchand-de-lune', nom: 'Pleine lune', nomEn: 'Full Moon', nomKhajiit: "Teko'i", niveau: 3, couleur: '#5a2d6b', alias: ['Pleines lunes', 'Marchand de lune', 'Marchands de lune', 'Marchande de lune'], icone: '/rangs/marchand-de-lune.webp', citation: "Khajiit a des marchandises, si tu as de l'or. Le reste, les lunes le règlent." },
  // One Intendant for now; later one per craft (its chest's accounts, its missions opened and closed).
  { cle: 'intendant', nom: 'Intendant', nomEn: 'Steward', nomKhajiit: 'Etiit', niveau: 3, couleur: '#2f6461', alias: ['Intendants', 'Intendante'], icone: 'locked-chest', citation: "Rien n'entre au coffre ni n'en sort sans que l'Intendant le sache : un coffre bien tenu nourrit toute la caravane." },
  // The grimoire's keeper (Ludo's rank).
  { cle: 'scribe-des-lunes', nom: 'Scribe des lunes', nomEn: 'Scribe of Moons', nomKhajiit: 'Durrarriit', niveau: 3, couleur: '#5e3b24', alias: ['Scribes des lunes', "Kha'jay Durrarriit"], icone: 'quill-ink', citation: "Les routes s'effacent sous le sable, les comptes jamais : ce que la caravane a vécu, le Scribe des lunes l'a déjà écrit." },
  // « Lune montante » is the former « Petites lunes », renamed (Ludo, 2026-11-24).
  { cle: 'petites-lunes', nom: 'Lune montante', nomEn: 'Rising Moon', nomKhajiit: 'Jranti', niveau: 4, couleur: '#5d6a86', alias: ['Lunes montantes', 'Petites lunes', 'Petite lune'], icone: '/rangs/petites-lunes.webp', citation: "La lune montante grandit à chaque route parcourue ; un jour, elle éclairera le chemin des autres." },
  // The recruits, not yet members of the caravan but asking to become one.
  { cle: 'nouvelle-lune', nom: 'Nouvelle lune', nomEn: 'New Moon', nomKhajiit: 'Ifa', niveau: 5, couleur: '#363b4c', alias: ['Nouvelles lunes', "Ifa Kha'jay"], icone: 'moon', citation: "La nouvelle lune ne brille pas encore, mais elle est déjà dans le ciel : qu'elle suive la caravane, et la caravane lui fera une place." },
]

/** The two tiers of the hierarchy (Ludo, 2026-11-24), by level: drawn as brackets in the tree's margin. */
export const TIERS: { nom: string; niveaux: number[] }[] = [
  { nom: 'Conseil restreint', niveaux: [1, 2] },
  { nom: 'Membres', niveaux: [3, 4, 5] },
]

export const SANS_RANG = {
  cle: 'sans-rang',
  nom: 'Sans rang',
  nomEn: 'Unranked',
  citation: "Nul nom au registre, mais les mêmes lunes au-dessus de la tête : qui marche avec la caravane est de la caravane.",
}

/** An image medallion (a path), as opposed to a game-icons glyph. */
export const estImage = (icone?: string) => Boolean(icone && icone.startsWith('/'))

export const ICONES_RANGS = RANGS.flatMap((r) => (r.icone && !estImage(r.icone) ? [r.icone] : []))

/**
 * The rank written in a « Rôle » cell, or null (« Sans rang »: « Membre » alone, or nothing). Since lot 1b the cell is
 * written at each Discord seal with all the member's ranks joined by « , » (the Rôles tab's order): the highest one
 * (lowest `niveau`) is kept.
 */
export function rangDe(role: string): Rang | null {
  let res: Rang | null = null
  for (const morceau of String(role ?? '').split(/[,;/]/)) {
    const k = cle(morceau)
    if (!k) continue
    const r = RANGS.find((x) => cle(x.nom) === k || (x.nomKhajiit && cle(x.nomKhajiit) === k) || (x.alias ?? []).some((a) => cle(a) === k))
    if (r && (!res || r.niveau < res.niveau)) res = r
  }
  return res
}

/** What signed readers receive: member names grouped by rank key (and « sans-rang »). */
export type Hierarchie = Record<string, string[]>
