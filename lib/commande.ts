// Order mode: shared types and the arithmetic of an order (used by the page and by /api/commande).

/** game-icons.net glyphs of the order mode (loaded with the book's other icons). */
export const ICONES_COMMANDE = ['tied-scroll', 'wax-seal', 'quill']

/** A line as the seller writes it on the order sheet (browser state, saved in localStorage). */
export type LigneCommande = {
  id: string
  fr: string
  en: string
  min: number | null
  max: number | null
  qte: number
  /** Unit price as typed (decimal comma or point); empty until set for an article "à négocier". */
  prix: string
  rayee: boolean
  /** The catalogue's lot (80 arrows to the quiver); `piece`: this line sells by the piece, not by the lot. */
  lot?: number | null
  piece?: boolean
  /** A line typed by hand, not in the catalogue: no floor, no ceiling. */
  horsCatalogue?: boolean
}

/** « carquois » for arrows and bolts, else « lot ». */
export const motLot = (fr: string) => (/fl[eè]che|carreau/i.test(fr) ? 'carquois' : 'lot')

/** Floor and ceiling of a line in its own unit: by the piece they are the lot's, divided by the lot. */
export function bornesLigne(l: Pick<LigneCommande, 'min' | 'max' | 'lot' | 'piece'>): { min: number | null; max: number | null } {
  if (!l.piece || !l.lot) return { min: l.min, max: l.max }
  const par = (v: number | null) => (v === null ? null : centimes(v / l.lot!))
  return { min: par(l.min), max: par(l.max) }
}

/** What the sheet writes in « Unité »: « pièce (carquois de 80) », « carquois de 80 », or nothing. */
export function uniteLigne(fr: string, lot: number | null | undefined, piece: boolean | undefined): string {
  if (!lot) return ''
  return piece ? `pièce (${motLot(fr)} de ${lot})` : `${motLot(fr)} de ${lot}`
}

/** A sold quantity read back with its unit: « 40 (½ carquois) », « 2 carquois de 80 ». */
export function quantiteLue(quantite: number, unite: string): string {
  const m = unite.match(/(carquois|lot) de (\d+)/)
  if (!m) return ''
  const lot = Number(m[2])
  if (!/pi[eè]ce/.test(unite)) return `${m[1]} de ${lot}`
  const f = quantite / lot
  const jolies: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾', '1': '1', '1.5': '1 ½', '2': '2' }
  const t = jolies[String(Math.round(f * 100) / 100)] ?? String(Math.round(f * 100) / 100).replace('.', ',')
  return `${t} ${m[1]}`
}

/** Payload sent by the page to /api/commande. */
export type CommandeEnvoyee = {
  vendeur: string
  /** Price agreed for the whole order (lump sum or rounding); lines are then shared out pro rata. */
  prixGlobal?: number | null
  lignes: {
    id: string
    article: string
    articleEn: string
    quantite: number
    prixUnitaire: number
    min: number | null
    max: number | null
    /** 'piece': quantity and price by the piece of a lot (the server prorates the floor and ceiling). */
    unite?: 'piece' | 'lot'
    horsCatalogue?: boolean
  }[]
}

export type Statut = 'à perte' | 'honnête' | 'excellente affaire' | 'négocié'

/** Wording shown on the sheet for each status. */
export const LIBELLES_STATUT: Record<Statut, string> = {
  'à perte': 'À perte',
  honnête: 'Marché honnête',
  'excellente affaire': 'Excellente affaire',
  négocié: 'Prix négocié',
}

export const centimes = (v: number) => Math.round(v * 100) / 100

export function lirePrix(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function statut(total: number, mini: number, ideal: number): Exclude<Statut, 'négocié'> {
  if (total < mini - 0.004) return 'à perte'
  if (total >= ideal - 0.004) return 'excellente affaire'
  return 'honnête'
}

export type LigneCalculee = {
  quantite: number
  prixUnitaire: number
  total: number
  totalMini: number
  totalIdeal: number
  statut: Statut
  sousPlancher: boolean
}

/**
 * One line: quantity × unit price, against quantity × floor (mini) and quantity × ceiling (idéal).
 * An article "à négocier" (no floor nor ceiling) is measured against its own price, so it never
 * tips the order's status; a missing floor or ceiling borrows the other one.
 */
export function calculerLigne(quantite: number, prixUnitaire: number, min: number | null, max: number | null): LigneCalculee {
  const total = centimes(quantite * prixUnitaire)
  const negocie = min === null && max === null
  const plancher = min ?? max ?? prixUnitaire
  const plafond = max ?? min ?? prixUnitaire
  const totalMini = centimes(quantite * plancher)
  const totalIdeal = centimes(quantite * plafond)
  return {
    quantite,
    prixUnitaire,
    total,
    totalMini,
    totalIdeal,
    statut: negocie ? 'négocié' : statut(total, totalMini, totalIdeal),
    sousPlancher: min !== null && prixUnitaire < min - 0.004,
  }
}

export function totaux(lignes: Pick<LigneCalculee, 'total' | 'totalMini' | 'totalIdeal'>[]) {
  const total = centimes(lignes.reduce((t, l) => t + l.total, 0))
  const totalMini = centimes(lignes.reduce((t, l) => t + l.totalMini, 0))
  const totalIdeal = centimes(lignes.reduce((t, l) => t + l.totalIdeal, 0))
  return { total, totalMini, totalIdeal, statut: statut(total, totalMini, totalIdeal) }
}

/* ─── Lump sum (« prix convenu pour l'ensemble »): a price agreed for the whole order ─── */

/** Weight of a line in a lump sum: its « total idéal » (quantity × ceiling, else floor, else its own price, else 1). */
export function poidsLigne(quantite: number, min: number | null, max: number | null, prix: number | null): number {
  const u = max ?? min ?? prix ?? 1
  return quantite * (u > 0 ? u : 1)
}

/** A lump sum split pro rata to the weights, in cents, the sum exact (largest remainders). */
export function repartirGlobal(total: number, poids: number[]): number[] {
  const cents = Math.round(total * 100)
  const somme = poids.reduce((t, p) => t + p, 0)
  if (!poids.length) return []
  const brut = poids.map((p) => (somme > 0 ? (cents * p) / somme : cents / poids.length))
  const bas = brut.map(Math.floor)
  let reste = cents - bas.reduce((t, v) => t + v, 0)
  brut
    .map((v, i) => ({ i, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f)
    .forEach((o) => {
      if (reste-- > 0) bas[o.i]++
    })
  return bas.map((c) => c / 100)
}
