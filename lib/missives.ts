// Missives, recipes and the Missive chest: shared types and pure arithmetic (used by the page and
// by /api/registre). The ledger of movements (tab "Mouvements") is the source of truth: the chest's
// stock, each missive's needs and each member's contribution are all computed from it.

import { normaliser } from './recherche'

/** game-icons.net glyphs of the missives (loaded with the book's other icons). */
export const ICONES_MISSIVES = ['cauldron', 'open-chest', 'anvil-impact', 'hand-truck', 'two-coins', 'magnifying-glass', 'scroll-quill', 'wheat', 'quill']

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
export type Ressource = { nom: string; en: string; origine: string; prix: number | null; bonneAffaire: number | null; note: string }
export type Ingredient = { nom: string; quantite: number }
/** `rendement`: units of the product made by one craft. */
/** `en`: the product's English name (Recettes « Produit EN », for products not in the catalogue). */
export type Recette = { produit: string; en: string; rendement: number; artisan: string; note: string; ingredients: Ingredient[] }
export type LigneMissive = { produit: string; quantite: number }
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
  nbMembres: number
  /** The registre's state number (see lib/registre.ts); 0 with an older script. */
  version: number
}

/** Actions a member can take; each one goes through the permission hook (lib/droits.ts). */
/** `cloture`: deliver the missive (success) or give it up (inachevée); both close it and share the reward. */
export type ActionRegistre = 'missive' | 'releve' | 'depot' | 'fabrication' | 'cloture' | 'recette' | 'ressource'

/* ───────────────────────── Lookups ───────────────────────── */

export function indexRecettes(recettes: Recette[]): Map<string, Recette> {
  return new Map(recettes.map((r) => [cle(r.produit), r]))
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
  const recs = indexRecettes(recettes)
  const res = new Map<string, number>()
  for (const r of ressources) if (r.prix !== null) res.set(cle(r.nom), r.prix)
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
  const prix = new Map(ressources.map((r) => [cle(r.nom), r.prix]))
  let cout = 0
  const sansPrix = new Set<string>()
  const visiter = (x: Noeud) => {
    if (x.enfants.length) return x.enfants.forEach(visiter)
    const p = prix.get(cle(x.nom))
    if (p === undefined || p === null) sansPrix.add(x.nom)
    else cout += p * x.quantite
  }
  n.enfants.forEach(visiter)
  return { cout: Math.round(cout * 100) / 100, sansPrix: [...sansPrix] }
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

export type Releve = { horodatage: string; membre: string; objet: string; compte: number; attendu: number; ecart: number; missive: string }
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
    const s = stock.get(k) ?? { nom: m.objet, qte: 0 }
    if (m.type === 'relevé') {
      releves.push({ horodatage: m.horodatage, membre: m.membre, objet: m.objet, compte: m.quantite, attendu: s.qte, ecart: m.quantite - s.qte, missive: m.missive })
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
export type LigneBesoin = { nom: string; niveau: Niveau; besoin: number; auCoffre: number; manque: number; fournees: number; rendement: number | null }

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
    const ligne = res.get(k) ?? { nom: r?.produit ?? nom, niveau, besoin: 0, auCoffre: 0, manque: 0, fournees: 0, rendement: r && r.ingredients.length ? r.rendement : null }
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
  const recettes = indexRecettes(d.recettes)
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

export type Onglets = {
  membres?: Record<string, unknown>[]
  ressources?: Record<string, unknown>[]
  recettes?: Record<string, unknown>[]
  missives?: Record<string, unknown>[]
  mouvements?: Record<string, unknown>[]
}

/** Typed data from the script's raw rows (lenient: blank or unreadable rows are dropped). */
export function lireOnglets(o: Onglets) {
  const membres = (o.membres ?? []).map((r) => ({ nom: texte(r.nom), role: texte(r.role) })).filter((m) => m.nom)

  const ressources: Ressource[] = (o.ressources ?? [])
    .map((r) => ({ nom: texte(r.nom), en: texte(r.en), origine: texte(r.origine), prix: nombre(r.prix), bonneAffaire: nombre(r.bonneAffaire), note: texte(r.note) }))
    .filter((r) => r.nom)

  const recettes: Recette[] = []
  for (const r of o.recettes ?? []) {
    const produit = texte(r.produit)
    const nom = texte(r.ingredient)
    if (!produit) continue
    let rec = recettes.find((x) => cle(x.produit) === cle(produit))
    if (!rec) {
      rec = { produit, en: '', rendement: Math.max(1, Math.round(nombre(r.rendement) ?? 1)), artisan: texte(r.artisan), note: texte(r.note), ingredients: [] }
      recettes.push(rec)
    }
    if (!rec.en) rec.en = texte(r.produitEn)
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
      }
      missives.push(m)
    }
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

  return { membres, ressources, recettes, missives, mouvements }
}
