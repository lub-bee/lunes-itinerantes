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
}

/** Payload sent by the page to /api/commande. */
export type CommandeEnvoyee = {
  vendeur: string
  lignes: { id: string; article: string; articleEn: string; quantite: number; prixUnitaire: number; min: number | null; max: number | null }[]
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
