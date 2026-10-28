// Missives, recipes and the Missive chest: shared types and pure arithmetic (used by the page and
// by /api/registre). The ledger of movements (tab "Mouvements") is the source of truth: the chest's
// stock, each missive's needs and each member's contribution are all computed from it.

import { normaliser } from './recherche'
import { estOmbre } from './ombre'

/** game-icons.net glyphs of the missives (loaded with the book's other icons). */
export const ICONES_MISSIVES = ['wooden-crate', 'cauldron', 'open-chest', 'anvil-impact', 'hand-truck', 'two-coins', 'magnifying-glass', 'scroll-quill', 'wheat', 'quill']

/** Comparable name: no case, accents, apostrophes, spaces or punctuation ("Ma’Dran-jo" = "madranjo"). */
export const cle = (s: string) =>
  normaliser(String(s ?? ''))
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '')

/** Default share of a reward split equally between every member of the caravan (the rest goes by merit). */
export const PART_COMMUNE_DEFAUT = 20

/**
 * A raw material: goods the caravan harvests, loots, crafts or buys (never sells). `prix`: the usual
 * buying price per unit (weighs contributions); `bonneAffaire`: buy without hesitation at or below it.
 */
/** `lot`: how many units `prix` and `bonneAffaire` buy (« 1 septim les 3 »); 1 when the sheet says nothing. */
export type Ressource = { nom: string; en: string; origine: string; prix: number | null; bonneAffaire: number | null; note: string; lot?: number }

/** A raw material's exact price per unit (its price ÷ its lot, never rounded), or null. */
export const prixUnite = (r: Pick<Ressource, 'prix' | 'lot'>) => (r.prix === null ? null : r.prix / Math.max(1, r.lot ?? 1))
export type Ingredient = { nom: string; quantite: number }
/** `rendement`: units of the product made by one craft. */
/** `en`: the product's English name (Recettes « Produit EN », for products not in the catalogue). */
/**
 * One recipe of a product. A product may have several (`variante` 1, 2, 3…, kept as written: deleting
 * one renumbers nothing); `usage` marks the « recette d'usage » (else variant 1, else the lowest), the
 * one that drives costs, values, trees and the missives' needs unless a missive chooses another.
 */
/** `ombre`: a recipe of the shadow book (Recettes « Livre » = Ombre, read from a v3l script): hidden by day. */
export type Recette = { produit: string; en: string; variante: number; usage: boolean; rendement: number; artisan: string; note: string; ingredients: Ingredient[]; ombre?: boolean }
/**
 * A missive's choice for one item: make it by recipe `variante`, or 0 = buy it (raw materials that
 * also have a recipe are bought unless the missive says otherwise).
 */
export type ChoixRecette = { nom: string; variante: number }
export type LigneMissive = { produit: string; quantite: number }
/**
 * A catalogue row written by the grimoire (« mettre en vente ») that the published CSV does not show yet
 * (Google republishes it every few minutes): `chapitre` is a chapter id of content/chapitres.json.
 */
/** One sealed order as the « Commandes » tab holds it (one row per article). */
export type LigneVente = { article: string; quantite: number; prixUnitaire: number | null; total: number | null; prixReel: number | null; statut: string; unite: string; horsCatalogue: boolean }
/**
 * `versee`: the caravan's share of this sale handed over to its coffer (who, when, how much — the amount
 * is the Patriarchs' to set, it may stay empty).
 */
export type Vente = {
  numero: string
  horodatage: string
  vendeur: string
  total: number | null
  lignes: LigneVente[]
  versee: boolean
  verseeLe: string
  verseePar: string
  montantVerse: number | null
}
export type ArticleVente = { chapitre: string; fr: string; en: string; prod: number | null; min: number | null; max: number | null; artisan: string; note: string; lot?: number | null; ombre?: boolean; enAttente?: boolean }
export type Missive = {
  numero: string
  horodatage: string
  titre: string
  commanditaire: string
  echeance: string
  /** livrée: delivered and closed; inachevée: closed without being completed. */
  statut: StatutMissive
  ecritePar: string
  lignes: LigneMissive[]
  recompense: number | null
  partCommune: number | null
  closeLe: string
  closePar: string
  /** Recipes chosen for this missive (Missives « Recettes »: « Potion de vigueur=2; Rubis=acheter »). */
  choix: ChoixRecette[]
  /** Optional word written when closing (e.g. why it could not be completed). */
  noteCloture: string
}

export type StatutMissive = 'en cours' | 'livrée' | 'inachevée'
export const estClose = (m: { statut: StatutMissive }) => m.statut !== 'en cours'
export type TypeMouvement = 'relevé' | 'dépôt' | 'fabrication' | 'livraison' | 'partage'
/**
 * One ledger row. `quantite` is signed (dépôt +, livraison −, fabrication − inputs / + outputs), except
 * for a relevé, where it is the counted quantity of the item in the chest. `action` groups the rows
 * of one gesture (a craft's inputs and outputs).
 */
export type Mouvement = {
  horodatage: string
  action: string
  missive: string
  membre: string
  type: TypeMouvement
  objet: string
  quantite: number
  note: string
  /** Written on the page, the registre's answer still awaited (shown in fresh, faded ink). */
  enAttente?: boolean
}

/** What the page receives (never the members' names: only how many they are). */
export type DonneesRegistre = {
  relie: boolean
  recettes: Recette[]
  ressources: Ressource[]
  missives: Missive[]
  mouvements: Mouvement[]
  /** Catalogue rows the sheet holds but the published CSV does not show yet (absent with an older script). */
  catalogue?: ArticleVente[]
  /**
   * Articles the published CSV still shows but the sheet no longer holds (taken out of the catalogue):
   * hidden at once, the sheet's copy wins (names, compared by `cle`).
   */
  retires?: string[]
  /** `catalogue` is the whole Catalogues tab (the one the CSV publishes): its rows win over the page's CSV copy. */
  catalogueComplet?: boolean
  /** The signed member's sealed orders, one per order (null: a script before v3h, which does not read them). */
  ventes?: Vente[] | null
  nbMembres: number
  /** The registre's state number (see lib/registre.ts); 0 with an older script. */
  version: number
}

/** Actions a member can take; each one goes through the permission hook (lib/droits.ts). */
/** `cloture`: deliver the missive (success) or give it up (inachevée); both close it and share the reward. */
/** `vente`: a recipe's product put up for sale (a row added to the Catalogues tab). */
/** `usage`: a product's usual recipe chosen; `choix`: a missive's recipe for one of its items. */
/** `versement`: the caravan's share of a sealed order marked as handed over (or taken back). */
export type ActionRegistre = 'missive' | 'releve' | 'depot' | 'fabrication' | 'cloture' | 'recette' | 'ressource' | 'vente' | 'usage' | 'choix' | 'versement' | 'deplacer' | 'retirer' | 'livre'

/* ───────────────────────── Lookups ───────────────────────── */

/** Every recipe of each product (key `cle(produit)`), in variant order. */
export function parProduit(recettes: Recette[]): Map<string, Recette[]> {
  const m = new Map<string, Recette[]>()
  for (const r of recettes) {
    const k = cle(r.produit)
    m.set(k, [...(m.get(k) ?? []), r])
  }
  for (const vs of m.values()) vs.sort((a, b) => a.variante - b.variante)
  return m
}

/** The usual recipe among a product's recipes: the one marked, else variant 1, else the lowest. */
export const recetteUsage = (vs: Recette[]): Recette | undefined => vs.find((v) => v.usage) ?? vs.find((v) => v.variante === 1) ?? vs[0]

/** A product's recipes (by name). */
export const variantesDe = (recettes: Recette[], nom: string) => recettes.filter((r) => cle(r.produit) === cle(nom)).sort((a, b) => a.variante - b.variante)

/** Whether an item is a raw material (bought by default even when it has a recipe). */
export const estMatiere = (ressources: Ressource[], nom: string) => ressources.some((r) => cle(r.nom) === cle(nom) || (r.en && cle(r.en) === cle(nom)))

/**
 * The recipe used for each product: the usual one; a raw material is bought (no recipe) unless a
 * missive's choice says to make it; `choix` (a missive's) picks a variant, or 0 = buy.
 */
export function indexRecettes(recettes: Recette[], ressources: Ressource[] = [], choix: ChoixRecette[] = []): Map<string, Recette> {
  const voulu = new Map(choix.map((c) => [cle(c.nom), c.variante]))
  const res = new Map<string, Recette>()
  for (const [k, vs] of parProduit(recettes)) {
    const c = voulu.get(k)
    if (c === 0) continue
    const r = (c !== undefined && vs.find((v) => v.variante === c)) || (c === undefined && estMatiere(ressources, vs[0].produit) ? undefined : recetteUsage(vs))
    if (r) res.set(k, r)
  }
  return res
}

/** A missive's choices as written in the sheet: « Potion de vigueur=2; Rubis=acheter ». */
export const choixEnTexte = (choix: ChoixRecette[]) => choix.map((c) => `${c.nom}=${c.variante === 0 ? 'acheter' : c.variante}`).join('; ')

export function choixLus(t: string): ChoixRecette[] {
  const res: ChoixRecette[] = []
  for (const morceau of String(t ?? '').split(/[;\n]/)) {
    const i = morceau.lastIndexOf('=')
    if (i < 0) continue
    const nom = morceau.slice(0, i).trim()
    const v = morceau.slice(i + 1).trim()
    const variante = /^(acheter|achat|achete|buy)$/i.test(v) ? 0 : Math.round(Number(v))
    if (nom && Number.isFinite(variante) && variante >= 0 && !res.some((c) => cle(c.nom) === cle(nom))) res.push({ nom, variante })
  }
  return res
}

/** Raised when recipes loop (A needs B needs A); `chemin` names the loop. */
export class Cycle extends Error {
  constructor(public chemin: string[]) {
    super(`cycle: ${chemin.join(' → ')}`)
  }
}

/** RP wording of a recipe loop. */
export const texteCycle = (chemin: string[]) =>
  `Les recettes tournent en rond : ${chemin.join(' → ')}. Qu'un artisan démêle ce sortilège avant d'aller plus loin.`

type ArticleValeur = { fr: string; en: string; prod: number | null }

/**
 * Value of an item, in septims per unit (weighs contributions): its catalogue production cost, else
 * the sum of its recipe's ingredients ÷ its yield, else its Ressources « prix courant », else 0.
 */
export function evaluateur(articles: ArticleValeur[], recettes: Recette[], ressources: Ressource[]) {
  const catalogue = new Map<string, number>()
  for (const a of articles) {
    if (a.prod === null || a.prod <= 0) continue
    if (!catalogue.has(cle(a.fr))) catalogue.set(cle(a.fr), a.prod)
    if (a.en && !catalogue.has(cle(a.en))) catalogue.set(cle(a.en), a.prod)
  }
  // The usual recipes; a raw material that also has one is valued at its price (bought by default).
  const recs = indexRecettes(recettes, ressources)
  const res = new Map<string, number>()
  for (const r of ressources) if (r.prix !== null) res.set(cle(r.nom), prixUnite(r)!)
  const memo = new Map<string, number>()
  const valeur = (nom: string, chemin: string[] = []): number => {
    const k = cle(nom)
    if (memo.has(k)) return memo.get(k)!
    let v = catalogue.get(k)
    if (v === undefined) {
      const r = recs.get(k)
      if (r && r.ingredients.length && !chemin.includes(k)) {
        v = r.ingredients.reduce((t, i) => t + i.quantite * valeur(i.nom, [...chemin, k]), 0) / Math.max(1, r.rendement)
      }
    }
    if (v === undefined) v = res.get(k) ?? 0
    memo.set(k, v)
    return v
  }
  return (nom: string) => valeur(nom)
}

/* ───────────────────────── Recipe tree ───────────────────────── */

export type Noeud = { nom: string; quantite: number; fournees: number; rendement: number; enfants: Noeud[]; cycle: boolean }

/**
 * Recipe tree to make `quantite` units of `nom` from nothing: whole crafts at every level (rounded
 * up to the yield). A node whose name already appears above it is marked `cycle` and not opened.
 */
export function arbre(nom: string, quantite: number, recettes: Map<string, Recette>, chemin: string[] = []): Noeud {
  const k = cle(nom)
  const r = recettes.get(k)
  if (chemin.includes(k)) return { nom, quantite, fournees: 0, rendement: 1, enfants: [], cycle: true }
  if (!r || !r.ingredients.length) return { nom, quantite, fournees: 0, rendement: 1, enfants: [], cycle: false }
  const fournees = Math.ceil(quantite / Math.max(1, r.rendement))
  return {
    nom: r.produit,
    quantite,
    fournees,
    rendement: r.rendement,
    cycle: false,
    enfants: r.ingredients.map((i) => arbre(i.nom, i.quantite * fournees, recettes, [...chemin, k])),
  }
}

/**
 * Cost of the raw materials of a recipe tree, at their « prix courant »; `sansPrix`: leaves with no
 * known price (not counted).
 */
export function coutMatieres(n: Noeud, ressources: Ressource[]): { cout: number; sansPrix: string[] } {
  const prix = new Map(ressources.map((r) => [cle(r.nom), prixUnite(r)]))
  let cout = 0
  const sansPrix = new Set<string>()
  const visiter = (x: Noeud) => {
    if (x.enfants.length) return x.enfants.forEach(visiter)
    const p = prix.get(cle(x.nom))
    if (p === undefined || p === null) sansPrix.add(x.nom)
    else cout += p * x.quantite
  }
  n.enfants.forEach(visiter)
  // Exact: rounded only where it is shown (whole septims, costs rounded up).
  return { cout, sansPrix: [...sansPrix] }
}

/** The first recipe loop reachable from `nom`, or null. */
export function trouverCycle(nom: string, recettes: Map<string, Recette>, chemin: string[] = [], noms: string[] = []): string[] | null {
  const k = cle(nom)
  if (chemin.includes(k)) return [...noms.slice(chemin.indexOf(k)), nom]
  const r = recettes.get(k)
  if (!r) return null
  for (const i of r.ingredients) {
    const c = trouverCycle(i.nom, recettes, [...chemin, k], [...noms, r.produit])
    if (c) return c
  }
  return null
}

/* ───────────────────────── The Missive chest ───────────────────────── */

/** `premier`: the first time this item appears in the ledger (nothing to compare with: no gap). */
export type Releve = { horodatage: string; membre: string; objet: string; compte: number; attendu: number; ecart: number; missive: string; premier: boolean }
export type Stock = Map<string, { nom: string; qte: number }>

const parDate = <T extends { horodatage: string }>(xs: T[]) =>
  xs.map((x, i) => ({ x, i })).sort((a, b) => a.x.horodatage.localeCompare(b.x.horodatage) || a.i - b.i).map((p) => p.x)

/**
 * Replays the ledger: the chest's stock per item, and every inventory check with the gap between
 * the counted quantity and the quantity the ledger expected at that moment (for investigations).
 */
export function rejouer(mouvements: Mouvement[]): { stock: Stock; releves: Releve[] } {
  const stock: Stock = new Map()
  const releves: Releve[] = []
  for (const m of parDate(mouvements)) {
    if (m.type === 'partage') continue
    const k = cle(m.objet)
    if (!k) continue
    const premier = !stock.has(k)
    const s = stock.get(k) ?? { nom: m.objet, qte: 0 }
    if (m.type === 'relevé') {
      releves.push({ horodatage: m.horodatage, membre: m.membre, objet: m.objet, compte: m.quantite, attendu: s.qte, ecart: premier ? 0 : m.quantite - s.qte, missive: m.missive, premier })
      s.qte = m.quantite
    } else {
      s.qte += m.quantite
    }
    stock.set(k, s)
  }
  return { stock, releves }
}

export const enStock = (stock: Stock, nom: string) => stock.get(cle(nom))?.qte ?? 0

/* ───────────────────────── Needs of a missive ───────────────────────── */

export type Niveau = 'fini' | 'intermediaire' | 'brut'
/** `rendement`: units per craft when the item has a recipe (null: no recipe); `fournees`: crafts needed for what is missing. */
export type LigneBesoin = { nom: string; niveau: Niveau; besoin: number; auCoffre: number; manque: number; fournees: number; rendement: number | null; variante: number | null }

/** Delivered quantity per requested product (livraison rows of that missive). */
export function livres(numero: string, mouvements: Mouvement[]): Map<string, number> {
  const res = new Map<string, number>()
  for (const m of mouvements) {
    if (m.type !== 'livraison' || m.missive !== numero) continue
    res.set(cle(m.objet), (res.get(cle(m.objet)) ?? 0) - m.quantite)
  }
  return res
}

/**
 * Needs of what is still to deliver, against the chest (`reserve` is consumed: missives running at
 * the same time share the chest, the oldest served first). Each item takes what the chest holds;
 * the rest is crafted in whole crafts from its recipe, exploded further down to raw resources.
 * Throws Cycle when recipes loop.
 */
export function besoins(lignes: LigneMissive[], recettes: Map<string, Recette>, reserve: Map<string, number>): LigneBesoin[] {
  const finis = new Set(lignes.map((l) => cle(l.produit)))
  const res = new Map<string, LigneBesoin>()
  const visiter = (nom: string, qte: number, chemin: string[], noms: string[]) => {
    const k = cle(nom)
    if (chemin.includes(k)) throw new Cycle([...noms.slice(chemin.indexOf(k)), nom])
    const r = recettes.get(k)
    const niveau: Niveau = finis.has(k) ? 'fini' : r && r.ingredients.length ? 'intermediaire' : 'brut'
    const ligne = res.get(k) ?? { nom: r?.produit ?? nom, niveau, besoin: 0, auCoffre: 0, manque: 0, fournees: 0, rendement: r && r.ingredients.length ? r.rendement : null, variante: r && r.ingredients.length ? r.variante : null }
    res.set(k, ligne)
    ligne.besoin += qte
    const pris = Math.min(Math.max(0, reserve.get(k) ?? 0), qte)
    reserve.set(k, (reserve.get(k) ?? 0) - pris)
    ligne.auCoffre += pris
    const manque = qte - pris
    ligne.manque += manque
    if (manque > 0 && r && r.ingredients.length) {
      const f = Math.ceil(manque / Math.max(1, r.rendement))
      ligne.fournees += f
      for (const i of r.ingredients) visiter(i.nom, i.quantite * f, [...chemin, k], [...noms, ligne.nom])
    }
  }
  for (const l of lignes) if (l.quantite > 0) visiter(l.produit, l.quantite, [], [])
  const ordre: Record<Niveau, number> = { fini: 0, intermediaire: 1, brut: 2 }
  return [...res.values()].sort((a, b) => ordre[a.niveau] - ordre[b.niveau])
}

/* ───────────────────────── Contributions and the reward ───────────────────────── */

export type Contribution = { membre: string; depots: number; facons: number; total: number; part: number }

/**
 * Value each member brought to a missive: a deposit is worth quantity × value; a craft earns the
 * value it adds (outputs − inputs, never below 0). `part` is the member's share of the total (0–1).
 */
export function contributions(numero: string, mouvements: Mouvement[], valeur: (nom: string) => number): Contribution[] {
  const par = new Map<string, Contribution>()
  const de = (membre: string) => {
    const k = cle(membre)
    const c = par.get(k) ?? { membre, depots: 0, facons: 0, total: 0, part: 0 }
    par.set(k, c)
    return c
  }
  const crafts = new Map<string, { membre: string; valeur: number }>()
  mouvements.forEach((m, i) => {
    if (m.missive !== numero) return
    if (m.type === 'dépôt' && m.quantite > 0) de(m.membre).depots += m.quantite * valeur(m.objet)
    if (m.type === 'fabrication') {
      const id = m.action || `${m.horodatage}|${m.membre}|${i}`
      const f = crafts.get(id) ?? { membre: m.membre, valeur: 0 }
      f.valeur += m.quantite * valeur(m.objet)
      crafts.set(id, f)
    }
  })
  for (const f of crafts.values()) de(f.membre).facons += Math.max(0, f.valeur)
  const liste = [...par.values()].filter((c) => c.depots + c.facons > 0)
  const total = liste.reduce((t, c) => t + c.depots + c.facons, 0)
  for (const c of liste) {
    c.total = c.depots + c.facons
    c.part = total > 0 ? c.total / total : 0
  }
  return liste.sort((a, b) => b.total - a.total)
}

/** Whole septims shared pro rata to `poids`, the remainders going to the largest fractions (sum = total). */
export function repartir(total: number, poids: number[]): number[] {
  const somme = poids.reduce((t, p) => t + p, 0)
  if (total <= 0 || !poids.length) return poids.map(() => 0)
  const brut = poids.map((p) => (somme > 0 ? (total * p) / somme : total / poids.length))
  const bas = brut.map(Math.floor)
  let reste = total - bas.reduce((t, v) => t + v, 0)
  const ordre = brut.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f)
  for (const o of ordre) {
    if (reste <= 0) break
    bas[o.i]++
    reste--
  }
  return bas
}

export type Partage = {
  recompense: number
  partCommune: number
  /** Whole septims given to every member of the caravan. */
  base: number
  nbMembres: number
  /** Pool shared by merit (what the equal part leaves). */
  merite: number
  /** Septims too few to split equally when nobody brought anything (stay with the caravan). */
  reste: number
  /** Participants: base (when on the members' list) + their merit share. */
  parts: { membre: string; base: number; merite: number; total: number; part: number }[]
}

/**
 * Splits a reward: `partCommune` % (rounded down to whole septims per member) goes equally to every
 * member of the caravan, participants or not; the rest goes to participants pro rata to the value
 * they brought. If nobody brought anything, the whole reward goes in equal parts (`reste`: the few
 * septims that do not divide evenly). `membres`: names of every member
 * (server), or only how many they are (page preview: participants are then assumed on the list).
 */
export function partager(recompense: number, partCommune: number, membres: string[] | number, contribs: Contribution[]): Partage {
  const total = Math.max(0, Math.round(recompense))
  const participants = contribs.filter((c) => c.total > 0)
  // Nobody brought anything: everything goes in equal parts.
  const pc = participants.length ? Math.min(100, Math.max(0, partCommune)) : 100
  const nbMembres = typeof membres === 'number' ? membres : membres.length
  const base = nbMembres > 0 ? Math.floor((total * pc) / 100 / nbMembres) : 0
  const merite = participants.length ? total - base * nbMembres : 0
  const surListe = (m: string) => (typeof membres === 'number' ? true : membres.some((x) => cle(x) === cle(m)))
  const parts = participants.map((c) => ({ membre: c.membre, base: surListe(c.membre) ? base : 0, merite: 0, total: 0, part: c.part }))
  if (participants.length) {
    repartir(merite, participants.map((c) => c.total)).forEach((v, i) => (parts[i].merite = v))
  }
  for (const p of parts) p.total = p.base + p.merite
  return { recompense: total, partCommune: pc, base, nbMembres, merite, reste: total - base * nbMembres - merite, parts }
}

/* ───────────────────────── One missive, computed ───────────────────────── */

export type EtatLigne = LigneMissive & { livre: number; auCoffre: number; reste: number; avance: number }
export type EtatMissive = {
  missive: Missive
  lignes: EtatLigne[]
  besoins: LigneBesoin[]
  cycle: string[] | null
  /** 0–1, weighted by the value of each requested line (by quantity when values are unknown). */
  avance: number
  contributions: Contribution[]
  journal: Mouvement[]
}

/**
 * Every missive computed: open ones share the chest in order of writing (oldest first). A closed
 * missive is shown as it stood when it was closed: the ledger up to its closing, the whole chest.
 */
export function calculerMissives(d: DonneesRegistre, valeur: (nom: string) => number): EtatMissive[] {
  const { stock } = rejouer(d.mouvements)
  const reserve = new Map([...stock].map(([k, s]) => [k, s.qte]))
  const ordonnees = [...d.missives].sort((a, b) => a.horodatage.localeCompare(b.horodatage))
  return ordonnees.map((m): EtatMissive => {
    const close = estClose(m)
    const avantCloture = close && m.closeLe ? d.mouvements.filter((x) => x.horodatage < m.closeLe) : d.mouvements
    const liv = livres(m.numero, avantCloture)
    const lignes = m.lignes.map((l) => {
      const livre = liv.get(cle(l.produit)) ?? 0
      const reste = Math.max(0, l.quantite - livre)
      return { ...l, livre, auCoffre: 0, reste, avance: 0 }
    })
    const coffre = close ? new Map([...rejouer(avantCloture).stock].map(([k, s]) => [k, s.qte])) : reserve
    let bs: LigneBesoin[] = []
    let cycle: string[] | null = null
    // The usual recipes, but this missive's own choices first.
    const recettes = indexRecettes(d.recettes, d.ressources, m.choix)
    try {
      bs = besoins(lignes.map((l) => ({ produit: l.produit, quantite: l.reste })), recettes, coffre)
    } catch (e) {
      if (e instanceof Cycle) cycle = e.chemin
      else throw e
    }
    for (const l of lignes) {
      l.auCoffre = bs.find((b) => b.niveau === 'fini' && cle(b.nom) === cle(l.produit))?.auCoffre ?? 0
      l.avance = l.quantite > 0 ? Math.min(1, (l.livre + l.auCoffre) / l.quantite) : 1
    }
    const poids = lignes.map((l) => l.quantite * (valeur(l.produit) || 1))
    const somme = poids.reduce((t, p) => t + p, 0)
    const avance = somme > 0 ? lignes.reduce((t, l, i) => t + l.avance * poids[i], 0) / somme : 0
    return {
      missive: m,
      lignes,
      besoins: bs,
      cycle,
      avance: m.statut === 'livrée' ? 1 : avance,
      contributions: contributions(m.numero, d.mouvements, valeur),
      journal: d.mouvements.filter((x) => x.missive === m.numero),
    }
  })
}

/* ───────────────────────── Rows read from the sheet ───────────────────────── */

const nombre = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const texte = (v: unknown) => String(v ?? '').trim()
/** A marker cell (« Usage »): oui, x, 1, vrai… */
const marque = (v: unknown) => ['oui', 'x', '1', 'vrai', 'true', 'yes', 'usage'].includes(cle(texte(v)))
const date = (v: unknown) => {
  const t = texte(v)
  if (!t) return ''
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toISOString()
}

/** Status as written in the sheet (a bare "close" counts as delivered). */
function statutLu(s: string): StatutMissive {
  const k = cle(s)
  if (k.startsWith('inach') || k.startsWith('aband')) return 'inachevée'
  if (k.startsWith('livr') || k.startsWith('clos')) return 'livrée'
  return 'en cours'
}

/** Roles of people outside the caravan, though listed in the Membres tab. */
export const HORS_CARAVANE = ['Ami des Lunes', 'Amie des Lunes', 'Amis des Lunes']
export const horsCaravane = (role: string) => String(role ?? '').split(/[,;/]/).some((x) => HORS_CARAVANE.some((h) => cle(h) === cle(x)))

export type Onglets = {
  membres?: Record<string, unknown>[]
  ressources?: Record<string, unknown>[]
  recettes?: Record<string, unknown>[]
  missives?: Record<string, unknown>[]
  mouvements?: Record<string, unknown>[]
  /** The Catalogues tab (from a v3f script on). */
  catalogue?: Record<string, unknown>[]
  /** The Commandes tab (sealed orders; from a v3h script on). */
  commandes?: Record<string, unknown>[]
  /** The missions' tabs (lib/missions.ts), from a v3m script asked with `missions: true`. */
  ponderation?: Record<string, unknown>[]
  reglagesMissions?: Record<string, unknown>[]
  demandes?: Record<string, unknown>[]
  missions?: Record<string, unknown>[]
  points?: Record<string, unknown>[]
}

/** Typed data from the script's raw rows (lenient: blank or unreadable rows are dropped). */
export function lireOnglets(o: Onglets) {
  // « Ami des Lunes » is not part of the caravan (no access to the grimoire): such rows are not members
  // at all — they cannot sign, are not listed, and get no share of a reward.
  const membres = (o.membres ?? [])
    .map((r) => ({ nom: texte(r.nom), role: texte(r.role) }))
    .filter((m) => m.nom && !horsCaravane(m.role))

  const ressources: Ressource[] = (o.ressources ?? [])
    .map((r) => ({ nom: texte(r.nom), en: texte(r.en), origine: texte(r.origine), prix: nombre(r.prix), bonneAffaire: nombre(r.bonneAffaire), note: texte(r.note), lot: Math.max(1, Math.round(nombre(r.lot) ?? 1)) }))
    .filter((r) => r.nom)

  const recettes: Recette[] = []
  for (const r of o.recettes ?? []) {
    const produit = texte(r.produit)
    const nom = texte(r.ingredient)
    if (!produit) continue
    // Empty « Variante » (or an older sheet without the column) = 1.
    const variante = Math.max(1, Math.round(nombre(r.variante) ?? 1))
    let rec = recettes.find((x) => cle(x.produit) === cle(produit) && x.variante === variante)
    if (!rec) {
      rec = { produit, en: '', variante, usage: false, rendement: Math.max(1, Math.round(nombre(r.rendement) ?? 1)), artisan: texte(r.artisan), note: texte(r.note), ingredients: [] }
      recettes.push(rec)
    }
    if (!rec.en) rec.en = texte(r.produitEn)
    if (marque(r.usage)) rec.usage = true
    if (estOmbre(r.livre)) rec.ombre = true
    const q = nombre(r.quantite)
    if (nom && q !== null && q > 0) rec.ingredients.push({ nom, quantite: q })
  }

  const missives: Missive[] = []
  for (const r of o.missives ?? []) {
    const numero = texte(r.numero)
    if (!numero) continue
    let m = missives.find((x) => x.numero === numero)
    if (!m) {
      m = {
        numero,
        horodatage: date(r.horodatage),
        titre: texte(r.titre) || numero,
        commanditaire: texte(r.commanditaire),
        echeance: texte(r.echeance),
        statut: statutLu(texte(r.statut)),
        ecritePar: texte(r.ecritePar),
        lignes: [],
        recompense: nombre(r.recompense),
        partCommune: nombre(r.partCommune),
        closeLe: date(r.closeLe),
        closePar: texte(r.closePar),
        noteCloture: texte(r.noteCloture),
        choix: [],
      }
      missives.push(m)
    }
    if (!m.choix.length && texte(r.recettes)) m.choix = choixLus(texte(r.recettes))
    const produit = texte(r.produit)
    const q = nombre(r.quantite)
    if (produit && q !== null && q > 0) m.lignes.push({ produit, quantite: q })
  }

  const TYPES: Record<string, TypeMouvement> = { releve: 'relevé', depot: 'dépôt', fabrication: 'fabrication', livraison: 'livraison', partage: 'partage' }
  const mouvements: Mouvement[] = (o.mouvements ?? [])
    .map((r) => ({
      horodatage: date(r.horodatage),
      action: texte(r.action),
      missive: texte(r.missive),
      membre: texte(r.membre),
      type: TYPES[cle(texte(r.type))],
      objet: texte(r.objet),
      quantite: nombre(r.quantite) ?? 0,
      note: texte(r.note),
    }))
    .filter((m) => m.type && m.objet)

  const catalogue: ArticleVente[] = (o.catalogue ?? [])
    .map((r) => ({
      chapitre: texte(r.chapitre),
      fr: texte(r.fr),
      en: texte(r.en),
      prod: nombre(r.prod),
      min: nombre(r.min),
      max: nombre(r.max),
      artisan: texte(r.artisan),
      note: texte(r.note),
      ombre: estOmbre(r.livre),
      lot: (() => {
        const n = Math.round(nombre(r.lot) ?? 0)
        return n > 1 ? n : null
      })(),
    }))
    .filter((a) => a.fr)

  // A script that knows recipe variants (v3g) reads the « Variante » column (even empty): every row has the key.
  const variantes = !(o.recettes ?? []).length || 'variante' in (o.recettes ?? [])[0]
  // A script that writes the raw materials' « Lot » (v3j) reads the column: every row has the key.
  const lotsMatieres = !(o.ressources ?? []).length || 'lot' in (o.ressources ?? [])[0]

  // Sealed orders, grouped by number (null: the script does not read them).
  let ventes: Vente[] | null = null
  if (o.commandes) {
    const par = new Map<string, Vente>()
    for (const r of o.commandes) {
      const numero = texte(r.numero)
      const article = texte(r.article)
      if (!numero || !article) continue
      const v = par.get(numero) ?? {
        numero,
        horodatage: date(r.horodatage),
        vendeur: texte(r.vendeur),
        total: nombre(r.totalCommande),
        lignes: [],
        versee: marque(r.versee),
        verseeLe: date(r.verseeLe),
        verseePar: texte(r.verseePar),
        montantVerse: nombre(r.montantVerse),
      }
      par.set(numero, v)
      v.lignes.push({
        article,
        quantite: nombre(r.quantite) ?? 0,
        prixUnitaire: nombre(r.prixUnitaire),
        total: nombre(r.total),
        prixReel: nombre(r.prixReel),
        statut: texte(r.statut),
        unite: texte(r.unite),
        horsCatalogue: marque(r.horsCatalogue),
      })
    }
    ventes = [...par.values()].sort((a, b) => b.horodatage.localeCompare(a.horodatage))
  }

  return { membres, ressources, recettes, missives, mouvements, catalogue, variantes, lotsMatieres, ventes }
}

/**
 * An item's English name, to show beside its French one: a raw material's, else a recipe's product's,
 * else the catalogue's (`articles`); '' when none is known.
 */
export function anglaisDe(d: Pick<DonneesRegistre, 'ressources' | 'recettes'> | null | undefined, nom: string, articles: { fr: string; en: string }[] = []): string {
  const k = cle(nom)
  return (
    d?.ressources.find((r) => cle(r.nom) === k)?.en ||
    d?.recettes.find((r) => cle(r.produit) === k && r.en)?.en ||
    articles.find((a) => cle(a.fr) === k && a.en)?.en ||
    ''
  )
}
