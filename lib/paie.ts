// The caravan's pay (economy proposal, option B, validated by Ludo 2026-10-30): the grimoire's sheet is
// the whole accounting. Every sale is shared in points — trésorerie (10 % of the real price), vendeur (10 %
// of the floor + 90 % of what is above it) — while the resources' (75 %) and crafting (5 %) shares come
// from the missions, credited at completion (lib/missions.ts). At the week's closing: sales − invoices =
// what is left; the Patriarchs take their share (15 %, equal parts); the rest is split pro rata of the
// week's points, the trésorerie included. Events keep their own ledger; their balance goes to the
// trésorerie, not into the week's pot. The Livre d'ombre's sales are left out entirely, for now.
//
// Pure logic, shared by the page and /api/paie. The tabs (Réglages paie, Factures, Événements, Écritures
// événements, Clôtures) are written by the Apps Script from v3n on (asked with `paie: true`).

import { cle, repartir, type Onglets, type Vente } from './missives'

/* ───────────────────────── Settings ───────────────────────── */

export type ReglagesPaie = {
  tresorerie: number
  ressources: number
  fabrication: number
  vendeurPlancher: number
  vendeurSurplus: number
  patriarches: number
  loyer: number
  compensation: number
  /** First day of the week (JST): « lundi »… */
  jour: string
  /** The Patriarchs, comma-separated (empty: the members whose « Rôle » says Patriarche). */
  listePatriarches: string
}

type DefReglage = { cle: keyof ReglagesPaie; libelle: string; note: string } & ({ texte: true; defaut: string } | { texte?: false; defaut: number; min: number; max: number })

export const REGLAGES_PAIE: DefReglage[] = [
  { cle: 'tresorerie', libelle: 'Trésorerie (% du prix de vente réel)', defaut: 10, min: 0, max: 100, note: 'à chaque vente' },
  { cle: 'ressources', libelle: 'Ressources (% du plancher)', defaut: 75, min: 0, max: 100, note: 'payée par les missions de récolte (et les fabrications d’intermédiaires)' },
  { cle: 'fabrication', libelle: 'Fabrication (% du plancher)', defaut: 5, min: 0, max: 100, note: 'payée par les missions de fabrication du produit fini' },
  { cle: 'vendeurPlancher', libelle: 'Vendeur (% du plancher)', defaut: 10, min: 0, max: 100, note: 'à chaque vente' },
  { cle: 'vendeurSurplus', libelle: 'Vendeur (% de ce qui dépasse le plancher)', defaut: 90, min: 0, max: 100, note: 'sous le plancher, le manque est pris sur sa part' },
  { cle: 'patriarches', libelle: 'Patriarches (% du reste de la semaine)', defaut: 15, min: 0, max: 100, note: 'à parts égales' },
  { cle: 'loyer', libelle: 'Loyer du camp (septims par semaine)', defaut: 500, min: 0, max: 1e7, note: 'compté chaque semaine, sauf facture « loyer » inscrite' },
  { cle: 'compensation', libelle: 'Compensation d’un participant d’événement', defaut: 20, min: 0, max: 1e6, note: 'par défaut ; chaque événement peut fixer la sienne' },
  { cle: 'jour', libelle: 'Premier jour de la semaine', defaut: 'lundi', texte: true, note: 'heure du Japon' },
  { cle: 'listePatriarches', libelle: 'Liste des Patriarches', defaut: '', texte: true, note: 'séparés par des virgules ; vide : le rôle Patriarche du registre' },
]

export const REGLAGES_PAIE_DEFAUT = Object.fromEntries(REGLAGES_PAIE.map((r) => [r.cle, r.defaut])) as ReglagesPaie

export const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/* ───────────────────────── Rows ───────────────────────── */

export type CategorieFacture = 'loyer' | 'uniformes' | 'achats' | 'autre'
export const CATEGORIES: CategorieFacture[] = ['loyer', 'uniformes', 'achats', 'autre']

export type Facture = { id: string; date: string; libelle: string; montant: number; categorie: CategorieFacture; evenement: string; note: string; par: string; auto?: boolean }
export type Evenement = { id: string; nom: string; date: string; note: string; compensation: number | null; statut: string }
/** One line of an event's ledger: an entry (+), an expense (−), a lot given from the chest, a participant (paid a compensation). */
export type GenreEcriture = 'entrée' | 'dépense' | 'lot' | 'participant'
export type Ecriture = { id: string; evenement: string; date: string; genre: GenreEcriture; libelle: string; montant: number; membre: string; objet: string; quantite: number; statut: string; payePar: string; payeLe: string; par: string }
/** One line of a sealed week (frozen): `genre` compte (the week's sums), paie (a member's pay), patriarche, tresorerie. */
export type LigneCloture = { id: string; semaine: string; genre: string; libelle: string; membre: string; points: number; montant: number; statut: string; payePar: string; payeLe: string; scelleeLe: string; scelleePar: string }

export type DonneesPaieLues = { actif: boolean; reglages: ReglagesPaie; factures: Facture[]; evenements: Evenement[]; ecritures: Ecriture[]; clotures: LigneCloture[] }

const nombre = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')
  if (!t || t === '-' || t === '.') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const texte = (v: unknown) => String(v ?? '').trim()
const date = (v: unknown) => {
  const t = texte(v)
  if (!t) return ''
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toISOString()
}

export function reglagesPaieLus(lignes: Record<string, unknown>[] = []): ReglagesPaie {
  const res = { ...REGLAGES_PAIE_DEFAUT }
  for (const l of lignes) {
    const k = cle(texte(l.reglage))
    // The row's label first (exactly), then the setting's key.
    const def = REGLAGES_PAIE.find((r) => cle(r.libelle) === k) ?? REGLAGES_PAIE.find((r) => cle(r.cle) === k)
    if (!def) continue
    if (def.texte) (res as Record<string, unknown>)[def.cle] = texte(l.valeur)
    else {
      const v = nombre(l.valeur)
      if (v !== null) (res as Record<string, unknown>)[def.cle] = Math.min(def.max, Math.max(def.min, v))
    }
  }
  if (!JOURS.includes(cle(res.jour))) res.jour = 'lundi'
  return res
}

export const reglagesPaieEnLignes = (r: ReglagesPaie) => REGLAGES_PAIE.map((d) => ({ reglage: d.libelle, valeur: r[d.cle], note: d.note }))

const genreLu = (s: unknown): GenreEcriture => {
  const k = cle(texte(s))
  return k.startsWith('dep') ? 'dépense' : k.startsWith('lot') ? 'lot' : k.startsWith('part') ? 'participant' : 'entrée'
}

/** The pay's tabs (from a v3n script asked with `paie: true`; absent keys: an older script). */
export function lirePaie(o: Onglets): DonneesPaieLues {
  const factures: Facture[] = (o.factures ?? [])
    .map((r) => ({
      id: texte(r.id),
      date: date(r.date),
      libelle: texte(r.libelle),
      montant: nombre(r.montant) ?? 0,
      categorie: (CATEGORIES.find((c) => cle(c) === cle(texte(r.categorie))) ?? 'autre') as CategorieFacture,
      evenement: texte(r.evenement),
      note: texte(r.note),
      par: texte(r.par),
    }))
    .filter((f) => f.id)
  const evenements: Evenement[] = (o.evenements ?? [])
    .map((r) => ({ id: texte(r.id), nom: texte(r.nom), date: date(r.date), note: texte(r.note), compensation: nombre(r.compensation), statut: texte(r.statut) }))
    .filter((e) => e.id)
  const ecritures: Ecriture[] = (o.ecrituresEvenement ?? [])
    .map((r) => ({
      id: texte(r.id),
      evenement: texte(r.evenement),
      date: date(r.date),
      genre: genreLu(r.genre),
      libelle: texte(r.libelle),
      montant: nombre(r.montant) ?? 0,
      membre: texte(r.membre),
      objet: texte(r.objet),
      quantite: nombre(r.quantite) ?? 0,
      statut: texte(r.statut),
      payePar: texte(r.payePar),
      payeLe: date(r.payeLe),
      par: texte(r.par),
    }))
    .filter((e) => e.id && e.evenement)
  const clotures: LigneCloture[] = (o.clotures ?? [])
    .map((r) => ({
      id: texte(r.id),
      semaine: texte(r.semaine),
      genre: cle(texte(r.genre)),
      libelle: texte(r.libelle),
      membre: texte(r.membre),
      points: nombre(r.points) ?? 0,
      montant: nombre(r.montant) ?? 0,
      statut: texte(r.statut),
      payePar: texte(r.payePar),
      payeLe: date(r.payeLe),
      scelleeLe: date(r.scelleeLe),
      scelleePar: texte(r.scelleePar),
    }))
    .filter((l) => l.id && l.semaine)
  return { actif: Array.isArray(o.reglagesPaie), reglages: reglagesPaieLus(o.reglagesPaie ?? []), factures, evenements, ecritures, clotures }
}

/* ───────────────────────── Weeks (JST) ───────────────────────── */

const JST = 9 * 3600 * 1000
const JOUR_MS = 86400 * 1000

/** The week holding an instant: its key « S-2026-10-26 » (its first day, JST). */
export function semaineDe(iso: string | number | Date, jour: string): string {
  const t = new Date(iso).getTime() + JST
  const d = new Date(t)
  const debut = JOURS.indexOf(cle(jour))
  const recul = (d.getUTCDay() - (debut < 0 ? 1 : debut) + 7) % 7
  const j = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - recul * JOUR_MS)
  return `S-${j.toISOString().slice(0, 10)}`
}

/** A week's bounds (UTC instants) from its key. */
export function bornes(semaine: string): { debut: number; fin: number } {
  const debut = Date.parse(`${semaine.slice(2)}T00:00:00Z`) - JST
  return { debut, fin: debut + 7 * JOUR_MS }
}

export const semaineVoisine = (semaine: string, n: number) => `S-${new Date(Date.parse(`${semaine.slice(2)}T00:00:00Z`) + n * 7 * JOUR_MS).toISOString().slice(0, 10)}`

const dans = (iso: string, b: { debut: number; fin: number }) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= b.debut && t < b.fin
}

/* ───────────────────────── A week computed ───────────────────────── */

export const TRESORERIE = 'Trésorerie'

/** What a sale line is worth: its floor (catalogue price × quantity, by the piece of a lot when so sold). */
export type Catalogue = Map<string, { min: number | null; lot: number | null; ombre: boolean }>

export type LignePaie = {
  membre: string
  missions: number
  ventes: number
  /** The trésorerie's line: its 10 %, and the resources' and crafting shares of goods sold that came from no mission. */
  orphelins?: number
  points: number
  montant: number
  patriarche: number
  /** Sealed: its row (payment status). */
  ligne?: LigneCloture
  ligneP?: LigneCloture
}

export type Semaine = {
  semaine: string
  scellee: boolean
  scelleeLe: string
  scelleePar: string
  ventes: number
  /** Sale lines counted (the shadow book's left out) and those without a known floor. */
  nbVentes: number
  sansPlancher: number
  factures: Facture[]
  totalFactures: number
  reste: number
  partPatriarches: number
  pot: number
  totalPoints: number
  valeurPoint: number
  deficit: number
  /** Events of the week: their balance goes to the trésorerie, not into the pot. */
  evenements: { evenement: Evenement; entrees: number; depenses: number; compensations: number; solde: number }[]
  lignes: LignePaie[]
  patriarches: string[]
}

/** The floor of one sale line, or null (outside the catalogue, or no floor). */
function plancherLigne(l: Vente['lignes'][number], catalogue: Catalogue): number | null {
  if (l.horsCatalogue) return null
  const a = catalogue.get(cle(l.article))
  if (!a || a.min === null) return null
  const piece = /pi[eè]ce/i.test(l.unite)
  const lot = Number(l.unite.match(/de (\d+)/)?.[1] ?? a.lot ?? 0)
  return (piece && lot ? a.min / lot : a.min) * l.quantite
}

export const estOmbreVente = (l: Vente['lignes'][number], catalogue: Catalogue) => Boolean(catalogue.get(cle(l.article))?.ombre)

type Entree = {
  semaine: string
  reglages: ReglagesPaie
  ventes: Vente[]
  catalogue: Catalogue
  points: { horodatage: string; membre: string; points: number }[]
  factures: Facture[]
  evenements: Evenement[]
  ecritures: Ecriture[]
  clotures: LigneCloture[]
  patriarches: string[]
}

/** The Patriarchs: the settings' list, else the members whose role says Patriarche. */
export function patriarchesDe(r: ReglagesPaie, membres: { nom: string; role: string }[]): string[] {
  const liste = r.listePatriarches.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)
  if (liste.length) return liste.map((n) => membres.find((m) => cle(m.nom) === cle(n))?.nom ?? n)
  return membres.filter((m) => m.role.split(/[,;/]/).some((x) => cle(x) === 'patriarche')).map((m) => m.nom)
}

/** An event's balance: entries − expenses (its own and the invoices linked to it) − compensations. */
export function soldeEvenement(e: Evenement, ecritures: Ecriture[], factures: Facture[] = []) {
  const ls = ecritures.filter((x) => x.evenement === e.id)
  const entrees = ls.filter((x) => x.genre === 'entrée').reduce((t, x) => t + x.montant, 0)
  const depenses = ls.filter((x) => x.genre === 'dépense').reduce((t, x) => t + x.montant, 0) + factures.filter((f) => f.evenement === e.id).reduce((t, f) => t + f.montant, 0)
  const compensations = ls.filter((x) => x.genre === 'participant').reduce((t, x) => t + x.montant, 0)
  return { entrees, depenses, compensations, solde: entrees - depenses - compensations }
}

/**
 * One week: sealed, as it was sealed (Clôtures rows); open, computed now. The pot is never more than
 * what came in: a negative remainder pays nobody and is carried to the next week as an invoice.
 */
export function calculerSemaine(x: Entree): Semaine {
  const b = bornes(x.semaine)
  const r = x.reglages
  const scellees = x.clotures.filter((l) => l.semaine === x.semaine)
  const evenements = x.evenements
    .filter((e) => dans(e.date, b))
    .map((e) => ({ evenement: e, ...soldeEvenement(e, x.ecritures, x.factures) }))

  if (scellees.length) {
    const compte = (k: string) => scellees.find((l) => l.genre === 'compte' && cle(l.libelle) === cle(k))?.montant ?? 0
    const parMembre = new Map<string, LignePaie>()
    for (const l of scellees) {
      if (l.genre !== 'paie' && l.genre !== 'patriarche' && l.genre !== 'tresorerie') continue
      const nom = l.genre === 'tresorerie' ? TRESORERIE : l.membre
      const p = parMembre.get(cle(nom)) ?? { membre: nom, missions: 0, ventes: 0, points: 0, montant: 0, patriarche: 0 }
      if (l.genre === 'patriarche') {
        p.patriarche = l.montant
        p.ligneP = l
      } else {
        p.points = l.points
        p.montant = l.montant
        p.ligne = l
      }
      parMembre.set(cle(nom), p)
    }
    const s0 = scellees[0]
    return {
      semaine: x.semaine,
      scellee: true,
      scelleeLe: s0.scelleeLe,
      scelleePar: s0.scelleePar,
      ventes: compte('Ventes'),
      nbVentes: 0,
      sansPlancher: 0,
      factures: (() => {
        // The invoices written that week, and what the closing counted besides (the rent, a deficit carried).
        const fs = x.factures.filter((f) => !f.evenement && dans(f.date, b))
        const reste = compte('Factures') - fs.reduce((t, f) => t + f.montant, 0)
        return reste > 0.005 ? [...fs, { id: 'auto-scelle', date: '', libelle: 'Loyer et reports, comptés à la clôture', montant: Math.round(reste * 100) / 100, categorie: 'loyer' as const, evenement: '', note: '', par: '', auto: true }] : fs
      })(),
      totalFactures: compte('Factures'),
      reste: compte('Reste'),
      partPatriarches: compte('Patriarches'),
      pot: compte('Pot'),
      totalPoints: compte('Points'),
      valeurPoint: compte('Valeur du point'),
      deficit: compte('Déficit'),
      evenements,
      lignes: [...parMembre.values()].sort((a, c) => c.points - a.points || c.patriarche - a.patriarche),
      patriarches: [...parMembre.values()].filter((p) => p.ligneP).map((p) => p.membre),
    }
  }

  // Points of the week: the missions completed in it, and the sales' vendeur and trésorerie shares.
  const parMembre = new Map<string, LignePaie>()
  const de = (nom: string) => {
    const k = cle(nom)
    const p = parMembre.get(k) ?? { membre: nom, missions: 0, ventes: 0, points: 0, montant: 0, patriarche: 0 }
    parMembre.set(k, p)
    return p
  }
  const tresor = de(TRESORERIE)
  tresor.orphelins = 0
  let missions = 0
  for (const p of x.points) {
    if (!dans(p.horodatage, b)) continue
    de(p.membre).missions += p.points
    missions += p.points
  }
  let ventes = 0
  let nbVentes = 0
  let sansPlancher = 0
  let partMissions = 0
  for (const v of x.ventes) {
    if (!dans(v.horodatage, b)) continue
    for (const l of v.lignes) {
      if (estOmbreVente(l, x.catalogue)) continue
      const prixReel = l.prixReel ?? l.total ?? 0
      let pl = plancherLigne(l, x.catalogue)
      if (pl === null) {
        // Outside the catalogue or « à négocier »: its own price stands as its floor.
        pl = prixReel
        sansPlancher++
      }
      nbVentes++
      ventes += prixReel
      tresor.ventes += (r.tresorerie / 100) * prixReel
      // Under the floor, the shortfall comes off the seller's share (never below nothing).
      de(v.vendeur).ventes += Math.max(0, (r.vendeurPlancher / 100) * pl + (r.vendeurSurplus / 100) * (prixReel - pl))
      partMissions += ((r.ressources + r.fabrication) / 100) * pl
    }
  }
  // The resources' and crafting shares of goods sold that no mission paid this week stay with the trésorerie.
  tresor.orphelins = Math.max(0, partMissions - missions)
  for (const p of parMembre.values()) p.points = Math.round((p.missions + p.ventes + (p.orphelins ?? 0)) * 100) / 100

  // Invoices of the week (not those of an event), the rent unless one is written, the deficit carried.
  const factures = x.factures.filter((f) => !f.evenement && dans(f.date, b))
  if (!factures.some((f) => f.categorie === 'loyer') && r.loyer > 0)
    factures.push({ id: 'loyer-auto', date: new Date(b.debut).toISOString(), libelle: 'Loyer du camp (réglage)', montant: r.loyer, categorie: 'loyer', evenement: '', note: '', par: '', auto: true })
  const avant = semaineVoisine(x.semaine, -1)
  const deficitAvant = x.clotures.find((l) => l.semaine === avant && l.genre === 'compte' && cle(l.libelle) === 'deficit')?.montant ?? 0
  if (deficitAvant > 0)
    factures.push({ id: 'deficit-reporte', date: new Date(b.debut).toISOString(), libelle: `Déficit reporté de la semaine du ${avant.slice(2)}`, montant: deficitAvant, categorie: 'autre', evenement: '', note: '', par: '', auto: true })
  const totalFactures = factures.reduce((t, f) => t + f.montant, 0)
  const brut = Math.floor(ventes - totalFactures)
  const reste = Math.max(0, brut)
  const deficit = brut < 0 ? -brut : 0

  const patriarches = x.patriarches
  const partPatriarches = patriarches.length ? Math.floor((reste * r.patriarches) / 100) : 0
  repartir(partPatriarches, patriarches.map(() => 1)).forEach((v, i) => (de(patriarches[i]).patriarche = v))
  const pot = reste - partPatriarches
  const lignes = [...parMembre.values()].filter((p) => p.points > 0 || p.patriarche > 0 || p.membre === TRESORERIE)
  const totalPoints = lignes.reduce((t, p) => t + p.points, 0)
  repartir(pot, lignes.map((p) => p.points)).forEach((v, i) => (lignes[i].montant = totalPoints > 0 ? v : 0))
  // Nobody earned a point: the pot stays with the trésorerie.
  if (totalPoints <= 0) tresor.montant = pot
  return {
    semaine: x.semaine,
    scellee: false,
    scelleeLe: '',
    scelleePar: '',
    ventes: Math.round(ventes * 100) / 100,
    nbVentes,
    sansPlancher,
    factures,
    totalFactures,
    reste,
    partPatriarches,
    pot,
    totalPoints: Math.round(totalPoints * 100) / 100,
    valeurPoint: totalPoints > 0 ? Math.round((pot / totalPoints) * 1000) / 1000 : 0,
    deficit,
    evenements,
    lignes: lignes.sort((a, c) => c.points - a.points || c.patriarche - a.patriarche),
    patriarches,
  }
}

/** The rows a closing writes (frozen from then on). */
export function lignesCloture(s: Semaine, quand: string, par: string, id: (n: number) => string): Omit<LigneCloture, 'payeLe'>[] {
  let n = 0
  const base = { semaine: s.semaine, statut: '', payePar: '', scelleeLe: quand, scelleePar: par, membre: '', points: 0 }
  const comptes: [string, number][] = [
    ['Ventes', s.ventes],
    ['Factures', s.totalFactures],
    ['Reste', s.reste],
    ['Patriarches', s.partPatriarches],
    ['Pot', s.pot],
    ['Points', s.totalPoints],
    ['Valeur du point', s.valeurPoint],
    ['Déficit', s.deficit],
    ['Événements → trésorerie', s.evenements.reduce((t, e) => t + e.solde, 0)],
  ]
  return [
    ...comptes.map(([libelle, montant]) => ({ ...base, id: id(++n), genre: 'compte', libelle, montant })),
    ...s.lignes.map((l) => ({
      ...base,
      id: id(++n),
      genre: l.membre === TRESORERIE ? 'tresorerie' : 'paie',
      libelle: l.membre === TRESORERIE ? 'Trésorerie' : `Paie de ${l.membre}`,
      membre: l.membre,
      points: l.points,
      montant: l.montant,
      statut: l.membre === TRESORERIE ? '' : l.montant > 0 ? 'à payer' : '',
    })),
    ...s.lignes
      .filter((l) => l.patriarche > 0)
      .map((l) => ({ ...base, id: id(++n), genre: 'patriarche', libelle: `Salaire de Patriarche`, membre: l.membre, montant: l.patriarche, statut: 'à payer' })),
  ]
}

/* ───────────────────────── What the page receives ───────────────────────── */

export type ActionPaie = 'reglagesPaie' | 'facture' | 'evenement' | 'ecriture' | 'clotureSemaine' | 'paiement'
export const ACTIONS_PAIE: ActionPaie[] = ['reglagesPaie', 'facture', 'evenement', 'ecriture', 'clotureSemaine', 'paiement']

export type DonneesPaie = {
  relie: boolean
  /** The sheet's script knows the pay (v3n): writes are possible. */
  actif: boolean
  reglages: ReglagesPaie
  /** The week shown, and the current one. */
  semaine: Semaine
  courante: string
  /** Every sealed week, newest first. */
  scellees: string[]
  factures: Facture[]
  evenements: Evenement[]
  ecritures: Ecriture[]
  clotures: LigneCloture[]
  moi: string | null
  version: number
}

export const TEXTES_PAIE = {
  refus: 'Le scribe du registre ne sait pas encore tenir la paie : qu’on recopie le dernier script du grimoire (v3n) dans la feuille, puis qu’on réessaie.',
  inactif: 'Le scribe du registre ne connaît pas encore la paie. Les comptes se lisent avec les réglages par défaut, mais rien ne s’inscrit tant que le dernier script du grimoire (v3n) n’est pas recopié dans la feuille.',
}

export const ICONES_PAIE = ['open-treasure-chest', 'abacus', 'scroll-unfurled', 'party-flags', 'locked-chest', 'cog', 'pay-money', 'ticket']
