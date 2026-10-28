// Missions (prototype, branch `missions`): a demand for merchandise is translated into small missions —
// harvests of raw resources, crafts of the intermediate products and of the final product —
// put out to the caravan as an internal call for tenders. A member takes a mission, gives it back or
// completes it; completed, its points are credited to them (ledger « Points »).
//
// Pure logic, shared by the page (live preview of a demand) and /api/missions (which recomputes every
// number: the page's are never trusted). The sheet's tabs (Pondération, Réglages missions, Demandes,
// Missions, Points) are written by the Apps Script from v3m on; with an older script the tabs are not
// read (`actif` false): the pages show the defaults and every write is refused in character.

import { cle, Cycle, recetteUsage, repartir, type Onglets, type Recette } from './missives'

/* ───────────────────────── Types ───────────────────────── */

/** Two kinds only (Ludo, 2026-10-28): crafting an intermediate (Cuir from Peaux) is a « fabrication » too. */
export type TypeMission = 'récolte' | 'fabrication'
export type StatutMission = 'ouverte' | 'en cours' | 'accomplie'
export const TYPES_MISSION: TypeMission[] = ['récolte', 'fabrication']

/** An effort class: a weight per unit (effort units); null = « à fixer ». */
export type Classe = { code: string; nom: string; poids: number | null; note: string }
/** A resource put in a class, with an optional weight of its own (overrides the class's). */
export type Assignation = { nom: string; classe: string; poids: number | null; note: string }

export type Reglages = {
  /** Effort units one mission holds (a short game session). */
  budget: number
  /** Missions « en cours » one member may hold at once. */
  maxEnCours: number
  /** Objects per crafting mission of the final product. */
  objetsParFabrication: number
  /** Share of the article's floor price × quantity paid to harvests and intermediates' crafts (%). */
  partRessources: number
  /** Share of the floor price × quantity paid to the final crafts (%). */
  partFabrication: number
  /** Weight used to size (and weigh) a resource whose weight is « à fixer ». */
  poidsRepli: number
}

/**
 * How many units one mission holds for an item, set by hand (« Blé par 40 », « Bière par 20 »): it
 * overrides the effort-budget sizing of a harvest or of an intermediate's craft, and the « objets par
 * mission » of the final product's craft. Rows « lot » of the Pondération tab (the number in its « Poids » column).
 */
export type LotMission = { nom: string; lot: number }

/** `source`: read from the registre, or the built-in defaults (tab empty, or a script before v3m). */
export type Ponderation = { classes: Classe[]; ressources: Assignation[]; lots: LotMission[]; reglages: Reglages; source: 'registre' | 'defaut' }

export type Demande = {
  numero: string
  horodatage: string
  membre: string
  article: string
  quantite: number
  plancher: number | null
  pointsRessources: number
  pointsFabrication: number
  statut: string
  note: string
}

export type Mission = {
  numero: string
  demande: string
  type: TypeMission
  objet: string
  quantite: number
  /** Weight per unit used (null: « poids à fixer », sized by the fallback weight). */
  poids: number | null
  effort: number
  points: number
  statut: StatutMission
  prisPar: string
  prisLe: string
  accomplieLe: string
  note: string
  /** Who took it and gave it back, when (one line per gesture). */
  journal: string
  /** Written on the page, the registre's answer still awaited. */
  enAttente?: boolean
}

export type LignePoints = { horodatage: string; membre: string; points: number; raison: string; mission: string; enAttente?: boolean }

/** What the page receives. `moi`: the signed member (their missions and points). */
export type DonneesMissions = {
  relie: boolean
  /** The sheet's script knows the missions (v3m): writes are possible. */
  actif: boolean
  ponderation: Ponderation
  demandes: Demande[]
  missions: Mission[]
  points: LignePoints[]
  moi: string | null
  version: number
}

/** Actions of the missions (each one goes through lib/droits.ts). */
export type ActionMission = 'demande' | 'prendre' | 'rendre' | 'accomplir' | 'ponderation'
export const ACTIONS_MISSION: ActionMission[] = ['demande', 'prendre', 'rendre', 'accomplir', 'ponderation']

/* ───────────────────────── Defaults (missions/ponderation.md, 2026-10-28) ───────────────────────── */

/** The class of intermediate products (Cuir from Peaux, Bande de cuir from Cuir, Sels…). */
export const CODE_TRANSFORMATION = 'T'

// Ludo vouches for the alchemy; the other classes are a first guess, to be corrected in the tab.
export const CLASSES_DEFAUT: Classe[] = [
  { code: 'C1', nom: 'Cueillette commune', poids: 1, note: '~120 par mission' },
  { code: 'C2', nom: 'Cueillette localisée', poids: 2, note: '~60 par mission' },
  { code: 'C3', nom: 'Petit butin animal', poids: 3, note: '~40 par mission' },
  { code: 'C4', nom: 'Chasse', poids: 4, note: '~30 par mission' },
  { code: 'C5', nom: 'Créature dangereuse', poids: 8, note: '~15 par mission' },
  { code: 'C6', nom: 'Rare', poids: 15, note: '~8 par mission' },
  { code: 'C7', nom: 'Mine / achat', poids: null, note: 'à fixer' },
  { code: CODE_TRANSFORMATION, nom: 'Transformation', poids: 2, note: 'produits intermédiaires : tanner, couper, distiller' },
]

const PAR_CLASSE: Record<string, string[]> = {
  C1: [
    'Blé', 'Lavande', 'Lys Bleu', 'Lys jaune', 'Lys rouge', 'Lys violet', "Cosse d'herbe", 'Cloquerille', 'Chapeau blanc',
    'Champignon luminescent', 'Branche de chardon', 'Coton de toundra', 'Langue de dragon', 'Lichen géant', 'Baies de genièvre',
    'Genièvres', 'Hivernelle', 'Griveboise', 'Sel', 'Ail', 'Carotte', 'Tomate', 'Poireau', 'Pomme de terre',
  ],
  C2: [
    'Pied de lutin', "Oreille d'elfe", 'Couronne sanglante', 'Mousse pendante', 'Grappe rampante', 'Campanule mortelle',
    'Racine de canis', 'Pulpe de racine', 'Fronde de somnalius', 'Tapinelle mora', 'Coupe de tache verte', 'Obscurcine',
    'Raisins Jazbay', 'Morelle noire', 'Myrrhe givrée', 'Amanite tue-mouches', 'Pholiotes à écailles', 'Mycènes des marais',
    'Amanites jaunes',
  ],
  C3: [
    'Oeuf de Fauvette', 'Œuf de poisson carnassier', 'Écailles de poisson carnassier', 'Chitine de crabe de vase', 'Rayon de miel',
    'Miel', 'Peau de ragnard carbonisée', 'Lapin cru',
  ],
  C4: [
    'Peau de loup', 'Peau de loup des neiges', "Peau d'ours", "Peau d'ours des neiges", 'Peau de Smilodon', 'Peau de Smilodon des neiges',
    "Griffes d'ours", 'Croc de smilodon', 'Venaison', 'Horqueur cru', 'Bœuf cru', 'Grands bois',
  ],
  C5: [
    'Graisse de troll', 'Œufs de chaurus', 'Chitine de chaurus', 'Venin de givre', 'Ectoplasme', 'Dents de spectre de glace',
    'Défense de mammouth', 'Plumes de harfreuse', "Poudre d'os",
  ],
  C6: ['Coeur de Daedra', 'Huile dwemer'],
  C7: [
    'Lingot de fer', "Lingot d'acier", "Lingot d'or", "Lingot d'argent", 'Minerai de fer', 'Gemme spirituelle insignifiante', 'Rubis',
    'Saphir', 'Améthyste', 'Sucrelune', 'Morceau de Lin', 'Fil', 'Petit bois', 'Corindon',
  ],
}

export const ASSIGNATIONS_DEFAUT: Assignation[] = Object.entries(PAR_CLASSE).flatMap(([classe, noms]) =>
  noms.map((nom) => ({ nom, classe, poids: null, note: '' })),
)

/** The settings, as the « Réglages missions » tab names them (the label is the row's key). */
export const REGLAGES: { cle: keyof Reglages; libelle: string; defaut: number; min: number; max: number; note: string }[] = [
  { cle: 'budget', libelle: 'Effort par mission', defaut: 120, min: 1, max: 100000, note: 'unités d’effort d’une courte session de jeu' },
  { cle: 'maxEnCours', libelle: 'Missions en cours par membre', defaut: 5, min: 1, max: 99, note: 'au-delà, il faut en accomplir ou en rendre' },
  { cle: 'objetsParFabrication', libelle: 'Objets par mission de fabrication', defaut: 10, min: 1, max: 10000, note: 'pour le produit final' },
  { cle: 'partRessources', libelle: 'Part ressources (% du plancher)', defaut: 75, min: 0, max: 100, note: 'récoltes et fabrications d’intermédiaires, au prorata de l’effort' },
  { cle: 'partFabrication', libelle: 'Part fabrication (% du plancher)', defaut: 5, min: 0, max: 100, note: 'fabrications du produit final' },
  { cle: 'poidsRepli', libelle: 'Poids de repli (poids à fixer)', defaut: 4, min: 0.1, max: 1000, note: 'taille les missions des ressources sans poids' },
]

export const REGLAGES_DEFAUT = Object.fromEntries(REGLAGES.map((r) => [r.cle, r.defaut])) as Reglages

export const PONDERATION_DEFAUT: Ponderation = { classes: CLASSES_DEFAUT, ressources: ASSIGNATIONS_DEFAUT, lots: [], reglages: REGLAGES_DEFAUT, source: 'defaut' }

/* ───────────────────────── In-character texts ───────────────────────── */

export const TEXTES = {
  /** Writes before the sheet's script knows the missions (v3m). */
  refus: 'Le scribe du registre ne sait pas encore tenir les missions : qu’on recopie le dernier script du grimoire (v3m) dans la feuille, puis qu’on réessaie.',
  inactif:
    'Le scribe du registre ne connaît pas encore les missions. Les pages se lisent, l’aperçu se calcule, mais rien ne s’inscrit tant que le dernier script du grimoire (v3m) n’est pas recopié dans la feuille.',
  sansRecette: (nom: string) => `Nulle recette n’est consignée pour ${nom} : qu’un artisan l’écrive au Livre des Recettes avant d’en demander.`,
  aFixer: 'poids à fixer',
  limite: (max: number) => `Tes pattes sont pleines : ${max} missions en cours, pas une de plus. Accomplis-en une, ou rends-la.`,
  prise: 'Une autre patte a saisi cette mission avant toi. Le désert est ainsi.',
  pasLaTienne: 'Cette mission n’est pas entre tes pattes.',
}

export const VERBES: Record<TypeMission, string> = { récolte: 'Récolter', fabrication: 'Fabriquer' }
export const ICONES_TYPES: Record<TypeMission, string> = { récolte: 'sickle', fabrication: 'anvil-impact' }
/** game-icons.net glyphs of the missions (loaded with the book's other icons). */
export const ICONES_MISSIONS = ['hunting-horn', 'laurel-crown', 'throne-king', 'podium', 'weight-scale', 'treasure-map', 'sickle', 'hammer-drop', 'anvil-impact', 'hand', 'return-arrow', 'check-mark']

/* ───────────────────────── The pondération, as read ───────────────────────── */

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

/** The settings read from rows `{ reglage, valeur }` (a missing or unreadable one keeps its default). */
function reglagesLus(lignes: Record<string, unknown>[]): Reglages {
  const res = { ...REGLAGES_DEFAUT }
  for (const l of lignes) {
    const k = cle(texte(l.reglage))
    const def = REGLAGES.find((r) => cle(r.libelle) === k || cle(r.cle) === k)
    const v = nombre(l.valeur)
    if (def && v !== null) res[def.cle] = Math.min(def.max, Math.max(def.min, v))
  }
  return res
}

/**
 * The pondération from the Pondération tab (rows `{ genre, code, nom, poids, note }`: « classe » rows,
 * « ressource » rows, and « lot » rows — an item's units per mission, in the « Poids » column) and the
 * « Réglages missions » tab. An empty tab: the defaults. A class « T » (Transformation) is always there.
 */
export function ponderationLue(lignes: Record<string, unknown>[] = [], reglages: Record<string, unknown>[] = []): Ponderation {
  const classes: Classe[] = []
  const ressources: Assignation[] = []
  const lots: LotMission[] = []
  for (const l of lignes) {
    const genre = cle(texte(l.genre))
    const code = texte(l.code)
    const nom = texte(l.nom)
    if (genre.startsWith('lot')) {
      const n = Math.round(nombre(l.poids) ?? nombre(l.code) ?? 0)
      if (nom && n >= 1 && !lots.some((x) => cle(x.nom) === cle(nom))) lots.push({ nom, lot: Math.min(100000, n) })
    } else if (genre.startsWith('class')) {
      if (code && !classes.some((c) => cle(c.code) === cle(code))) classes.push({ code, nom: nom || code, poids: nombre(l.poids), note: texte(l.note) })
    } else if (nom && !ressources.some((r) => cle(r.nom) === cle(nom))) {
      ressources.push({ nom, classe: code, poids: nombre(l.poids), note: texte(l.note) })
    }
  }
  if (!classes.length && !ressources.length) return { ...PONDERATION_DEFAUT, lots, reglages: reglagesLus(reglages), source: lots.length ? 'registre' : 'defaut' }
  if (!classes.some((c) => cle(c.code) === cle(CODE_TRANSFORMATION))) classes.push(CLASSES_DEFAUT.find((c) => c.code === CODE_TRANSFORMATION)!)
  return { classes, ressources, lots, reglages: reglagesLus(reglages), source: 'registre' }
}

/** The pondération as the tabs' rows (what 'ponderation' writes, and the seed of a first demand). */
export function ponderationEnLignes(p: Ponderation) {
  return {
    lignes: [
      ...p.classes.map((c) => ({ genre: 'classe', code: c.code, nom: c.nom, poids: c.poids ?? '', note: c.note })),
      ...p.ressources.map((r) => ({ genre: 'ressource', code: r.classe, nom: r.nom, poids: r.poids ?? '', note: r.note })),
      ...p.lots.map((l) => ({ genre: 'lot', code: '', nom: l.nom, poids: l.lot, note: 'par mission' })),
    ],
    reglages: REGLAGES.map((r) => ({ reglage: r.libelle, valeur: p.reglages[r.cle], note: r.note })),
  }
}

/** Lookups on a pondération: an item's class and its weight per unit (null: « à fixer »). */
export function peser(p: Ponderation) {
  const classes = new Map(p.classes.map((c) => [cle(c.code), c]))
  const assignees = new Map(p.ressources.map((r) => [cle(r.nom), r]))
  const assignee = (nom: string) => assignees.get(cle(nom))
  const classeDe = (nom: string): Classe | null => {
    const a = assignee(nom)
    return a ? (classes.get(cle(a.classe)) ?? null) : null
  }
  const poidsDe = (nom: string, transformation = false): number | null => {
    const a = assignee(nom)
    if (a?.poids !== null && a?.poids !== undefined && a.poids > 0) return a.poids
    const c = a ? classes.get(cle(a.classe)) : transformation ? classes.get(cle(CODE_TRANSFORMATION)) : undefined
    return c?.poids && c.poids > 0 ? c.poids : null
  }
  return { assignee, classeDe, poidsDe, classes }
}

/* ───────────────────────── A demand translated into missions ───────────────────────── */

export type MissionPrevue = {
  type: TypeMission
  objet: string
  quantite: number
  /** Weight per unit (null: « à fixer », sized and weighed by the fallback). */
  poids: number | null
  effort: number
  points: number
  /** The class's code (null: none, « à fixer »). */
  classe: string | null
  /** Its line of the demand (`cleLigne`): the missions of one item and one type. */
  ligne: string
  /** A craft of an intermediate product (paid from the resources' share, by effort), not of the final one. */
  intermediaire?: boolean
}

/** One line of a demand: every mission of one item and one type, and how many units each one holds. */
export type LigneDemande = {
  cle: string
  type: TypeMission
  objet: string
  /** Units in all (whole crafts × yield for a craft). */
  total: number
  /** Units per mission used; `defaut`: what the pondération (or the effort budget) gives. */
  lot: number
  defaut: number
  /** Where the lot comes from: chosen on the demand, the pondération's « lot », the effort budget, the settings. */
  source: 'demande' | 'ponderation' | 'effort' | 'reglage'
  /** Units per craft (1 for a harvest): a lot is rounded down to whole crafts. */
  rendement: number
  /** A craft of an intermediate product. */
  intermediaire: boolean
}

/** A demand's line key: « récolte|ble ». */
export const cleLigne = (type: TypeMission, objet: string) => `${type}|${cle(objet)}`

export type Traduction =
  | {
      ok: true
      article: string
      quantite: number
      plancher: number | null
      recette: Recette
      missions: MissionPrevue[]
      pointsRessources: number
      pointsFabrication: number
      /** Raw resources (and intermediates) whose weight is « à fixer ». */
      aFixer: string[]
      /** Every raw resource needed, in all (before splitting). */
      brut: { nom: string; quantite: number }[]
      /** One line per item and type, with its lot per mission (editable on the demand). */
      lignes: LigneDemande[]
    }
  | { ok: false; erreur: string }

/** The recipe a demand follows for an item: its « recette d'usage », else variant 1; the day book's first. */
export function recetteDe(recettes: Recette[], nom: string): Recette | undefined {
  const toutes = recettes.filter((r) => cle(r.produit) === cle(nom) && r.ingredients.length).sort((a, b) => a.variante - b.variante)
  const jour = toutes.filter((r) => !r.ombre)
  return recetteUsage(jour.length ? jour : toutes)
}

/**
 * Splits `total` into parts of at most `lot`, as even as can be; with lots of 10 or more, the parts are
 * rounded to a round number (5 or 10) and the last one takes the rest (350 by 120 → 120, 120, 110;
 * 25 by 10 → 10, 10, 5), unless that rest would be under half a part.
 */
export function decouper(total: number, lot: number, arrondir = true): number[] {
  const t = Math.max(0, Math.round(total))
  const l = Math.max(1, Math.floor(lot))
  if (t <= l) return t > 0 ? [t] : []
  const k = Math.ceil(t / l)
  const pas = !arrondir ? 1 : l >= 100 ? 10 : l >= 10 ? 5 : 1
  if (pas > 1) {
    // Round parts, the last one taking the rest — unless it would be left much smaller than the others.
    const taille = Math.ceil(t / k / pas) * pas
    const dernier = t - taille * (k - 1)
    if (taille <= l && dernier > 0 && dernier * 2 >= taille) return [...Array(k - 1).fill(taille), dernier]
  }
  const base = Math.floor(t / k)
  const plus = t - base * k
  return Array.from({ length: k }, (_, i) => base + (i < plus ? 1 : 0))
}

/** Exact packs: as many full lots as fit, then the rest (250 by 40 → 40 ×6, 10). */
export function paquets(total: number, lot: number): number[] {
  const t = Math.max(0, Math.round(total))
  const l = Math.max(1, Math.floor(lot))
  const n = Math.floor(t / l)
  return [...Array(n).fill(l), ...(t % l ? [t % l] : [])]
}

/**
 * Translates a demand (`quantite` of `article`) into missions. The final product follows its recipe;
 * every ingredient that has a recipe of its own (and is not put in a raw class by the pondération) is an
 * intermediate product, made by fabrication missions of its own; the rest are raw resources, harvested. Needs are
 * summed over the whole tree before whole crafts are counted (Cuir needed by the gloves and by their
 * leather strips is tanned once). Throws nothing: a loop of recipes or a missing recipe is an `erreur`.
 */
/**
 * `lots`: units per mission chosen on the demand for some lines (key `cleLigne`), over the pondération's
 * « lot » of the item, over the effort budget (harvest, intermediate) or the settings (final craft). A lot
 * set by hand cuts exact packs (250 Blé by 40 → 40 ×6 + 10); the computed sizing keeps its even split.
 */
export function traduire(article: { fr: string; min: number | null }, quantite: number, recettes: Recette[], p: Ponderation, lots: Record<string, number> = {}): Traduction {
  const Q = Math.max(0, Math.round(quantite))
  const racine = recetteDe(recettes, article.fr)
  if (!racine) return { ok: false, erreur: TEXTES.sansRecette(article.fr) }
  if (Q <= 0) return { ok: false, erreur: 'Une demande se fait pour une pièce au moins.' }
  const { assignee, poidsDe } = peser(p)
  const reglages = p.reglages
  const kRacine = cle(racine.produit)

  /** An item's recipe when it is made here (an intermediate), else null (a raw resource). */
  const intermediaire = (nom: string): Recette | null => {
    if (cle(nom) === kRacine) return racine
    const r = recetteDe(recettes, nom)
    if (!r) return null
    const a = assignee(nom)
    return a && cle(a.classe) !== cle(CODE_TRANSFORMATION) ? null : r
  }

  // Topological order (an item after everything that consumes it), loops refused.
  const noms = new Map<string, string>()
  const fini = new Set<string>()
  const ordre: string[] = []
  const visiter = (nom: string, chemin: string[], vus: string[]) => {
    const k = cle(nom)
    if (vus.includes(k)) throw new Cycle([...chemin.slice(vus.indexOf(k)), nom])
    if (fini.has(k)) return
    const r = intermediaire(nom)
    if (!noms.has(k)) noms.set(k, r?.produit ?? nom)
    if (r) for (const i of r.ingredients) visiter(i.nom, [...chemin, r.produit], [...vus, k])
    fini.add(k)
    ordre.push(k)
  }
  try {
    visiter(racine.produit, [], [])
  } catch (e) {
    if (e instanceof Cycle) return { ok: false, erreur: `Les recettes tournent en rond : ${e.chemin.join(' → ')}. Qu’un artisan démêle ce sortilège avant d’en faire des missions.` }
    throw e
  }
  ordre.reverse()

  const besoin = new Map<string, number>()
  const fournees = new Map<string, number>()
  const ajouter = (nom: string, q: number) => besoin.set(cle(nom), (besoin.get(cle(nom)) ?? 0) + q)
  besoin.set(kRacine, Q)
  for (const k of ordre) {
    const r = intermediaire(noms.get(k)!)
    if (!r) continue
    const f = Math.ceil((besoin.get(k) ?? 0) / Math.max(1, r.rendement) - 1e-9)
    fournees.set(k, f)
    for (const i of r.ingredients) ajouter(i.nom, i.quantite * f)
  }

  const missions: MissionPrevue[] = []
  const aFixer = new Set<string>()
  const brut: { nom: string; quantite: number }[] = []
  const lignes: LigneDemande[] = []
  const budget = reglages.budget
  const lotsPonderation = new Map((p.lots ?? []).map((l) => [cle(l.nom), l.lot]))
  /**
   * The units per mission of a line, and how it is cut: a lot set by hand (on the demand, or in the
   * pondération) cuts exact packs, the computed one splits evenly. Lots are whole crafts (at least one).
   */
  const couper = (type: TypeMission, nom: string, total: number, rend: number, calcule: number, sourceCalcul: LigneDemande['source']): number[] => {
    const k = cleLigne(type, nom)
    const parCraft = (u: number) => Math.max(1, Math.floor(u / rend)) * rend
    const pond = lotsPonderation.get(cle(nom))
    const defaut = parCraft(pond ?? calcule)
    const choisi = lots[k] && lots[k] >= 1 ? parCraft(lots[k]) : null
    const lot = choisi ?? defaut
    lignes.push({ cle: k, type, objet: nom, total, lot, defaut, source: choisi ? 'demande' : pond ? 'ponderation' : sourceCalcul, rendement: rend, intermediaire: type === 'fabrication' && cle(nom) !== kRacine })
    const crafts = Math.round(total / rend)
    const parts = choisi || pond ? paquets(crafts, lot / rend) : decouper(crafts, lot / rend, rend === 1)
    return parts.map((n) => n * rend)
  }
  for (const k of ordre) {
    if (k === kRacine) continue
    const nom = noms.get(k)!
    const r = intermediaire(nom)
    const poids = poidsDe(nom, Boolean(r))
    if (poids === null) aFixer.add(nom)
    const w = poids ?? reglages.poidsRepli
    const classe = r ? (assignee(nom)?.classe ?? CODE_TRANSFORMATION) : (assignee(nom)?.classe ?? null)
    if (r) {
      // Whole crafts: a mission holds as many crafts as its effort allows (at least one).
      const rend = Math.max(1, r.rendement)
      for (const q of couper('fabrication', nom, (fournees.get(k) ?? 0) * rend, rend, Math.floor(budget / w), 'effort'))
        missions.push({ type: 'fabrication', intermediaire: true, objet: nom, quantite: q, poids, effort: q * w, points: 0, classe, ligne: cleLigne('fabrication', nom) })
    } else {
      const total = Math.ceil((besoin.get(k) ?? 0) - 1e-9)
      if (total <= 0) continue
      brut.push({ nom, quantite: total })
      for (const q of couper('récolte', nom, total, 1, Math.max(1, Math.floor(budget / w)), 'effort'))
        missions.push({ type: 'récolte', objet: nom, quantite: q, poids, effort: q * w, points: 0, classe, ligne: cleLigne('récolte', nom) })
    }
  }
  const rend0 = Math.max(1, racine.rendement)
  for (const q of couper('fabrication', racine.produit, (fournees.get(kRacine) ?? 0) * rend0, rend0, reglages.objetsParFabrication, 'reglage'))
    missions.push({ type: 'fabrication', objet: racine.produit, quantite: q, poids: null, effort: 0, points: 0, classe: null, ligne: cleLigne('fabrication', racine.produit) })

  // Points: the floor price × quantity, the resources' share split by effort, the crafting share by objects.
  const plancher = article.min
  const pointsRessources = plancher ? Math.round((plancher * Q * reglages.partRessources) / 100) : 0
  const pointsFabrication = plancher ? Math.round((plancher * Q * reglages.partFabrication) / 100) : 0
  // Harvests and the crafts of intermediates share the resources' part by effort; the final crafts, the crafting part.
  const amont = missions.filter((m) => m.type === 'récolte' || m.intermediaire)
  repartir(pointsRessources, amont.map((m) => m.effort)).forEach((v, i) => (amont[i].points = v))
  const aval = missions.filter((m) => m.type === 'fabrication' && !m.intermediaire)
  repartir(pointsFabrication, aval.map((m) => m.quantite)).forEach((v, i) => (aval[i].points = v))

  const rang = (m: MissionPrevue) => (m.type === 'récolte' ? 0 : m.intermediaire ? 1 : 2)
  missions.sort((a, b) => rang(a) - rang(b))
  lignes.sort((a, b) => (a.type === 'récolte' ? 0 : a.intermediaire ? 1 : 2) - (b.type === 'récolte' ? 0 : b.intermediaire ? 1 : 2))
  return { ok: true, article: article.fr, quantite: Q, plancher, recette: racine, missions, pointsRessources, pointsFabrication, aFixer: [...aFixer], brut, lignes }
}

/* ───────────────────────── Rows read from the sheet ───────────────────────── */

// « Transformation » (the prototype's first wording) reads as a fabrication.
const TYPES: Record<string, TypeMission> = { recolte: 'récolte', transformation: 'fabrication', fabrication: 'fabrication' }
const statutLu = (s: unknown): StatutMission => {
  const k = cle(texte(s))
  return k.startsWith('encours') || k.startsWith('prise') ? 'en cours' : k.startsWith('accompli') ? 'accomplie' : 'ouverte'
}

export type MissionsLues = { actif: boolean; ponderation: Ponderation; demandes: Demande[]; missions: Mission[]; points: LignePoints[] }

/** The missions' tabs (from a v3m script, asked with `missions: true`; absent keys: an older script). */
export function lireMissions(o: Onglets): MissionsLues {
  const actif = Array.isArray(o.ponderation)
  const demandes: Demande[] = (o.demandes ?? [])
    .map((r) => ({
      numero: texte(r.numero),
      horodatage: date(r.horodatage),
      membre: texte(r.membre),
      article: texte(r.article),
      quantite: nombre(r.quantite) ?? 0,
      plancher: nombre(r.plancher),
      pointsRessources: nombre(r.pointsRessources) ?? 0,
      pointsFabrication: nombre(r.pointsFabrication) ?? 0,
      statut: texte(r.statut) || 'ouverte',
      note: texte(r.note),
    }))
    .filter((d) => d.numero)
  const missions: Mission[] = (o.missions ?? [])
    .map((r) => ({
      numero: texte(r.numero),
      demande: texte(r.demande),
      type: TYPES[cle(texte(r.type))] ?? 'récolte',
      objet: texte(r.objet),
      quantite: nombre(r.quantite) ?? 0,
      poids: nombre(r.poids),
      effort: nombre(r.effort) ?? 0,
      points: nombre(r.points) ?? 0,
      statut: statutLu(r.statut),
      prisPar: texte(r.prisPar),
      prisLe: date(r.prisLe),
      accomplieLe: date(r.accomplieLe),
      note: texte(r.note),
      journal: texte(r.journal),
    }))
    .filter((m) => m.numero && m.objet)
  const points: LignePoints[] = (o.points ?? [])
    .map((r) => ({ horodatage: date(r.horodatage), membre: texte(r.membre), points: nombre(r.points) ?? 0, raison: texte(r.raison), mission: texte(r.mission) }))
    .filter((p) => p.membre)
  return { actif, ponderation: ponderationLue(o.ponderation ?? [], o.reglagesMissions ?? []), demandes, missions, points }
}

/* ───────────────────────── Members, demands ───────────────────────── */

export const enCoursDe = (missions: Mission[], membre: string | null) =>
  membre ? missions.filter((m) => m.statut === 'en cours' && cle(m.prisPar) === cle(membre)) : []

/** Each member's points (credited), most first. */
export function soldes(points: LignePoints[], missions: Mission[] = []) {
  const par = new Map<string, { membre: string; total: number; accomplies: number; enCours: number; promis: number }>()
  const de = (membre: string) => {
    const k = cle(membre)
    const s = par.get(k) ?? { membre, total: 0, accomplies: 0, enCours: 0, promis: 0 }
    par.set(k, s)
    return s
  }
  for (const p of points) {
    const s = de(p.membre)
    s.total += p.points
    if (p.mission) s.accomplies++
  }
  for (const m of missions) {
    if (m.statut !== 'en cours' || !m.prisPar) continue
    const s = de(m.prisPar)
    s.enCours++
    s.promis += m.points
  }
  return [...par.values()].sort((a, b) => b.total - a.total || a.membre.localeCompare(b.membre, 'fr'))
}

/** A demand's progress: its missions by state, its points credited and still to earn. */
export function avancement(d: Demande, missions: Mission[]) {
  const ms = missions.filter((m) => m.demande === d.numero)
  const accomplies = ms.filter((m) => m.statut === 'accomplie')
  return {
    total: ms.length,
    ouvertes: ms.filter((m) => m.statut === 'ouverte').length,
    enCours: ms.filter((m) => m.statut === 'en cours').length,
    accomplies: accomplies.length,
    points: ms.reduce((t, m) => t + m.points, 0),
    credites: accomplies.reduce((t, m) => t + m.points, 0),
    avance: ms.length ? accomplies.length / ms.length : 0,
  }
}

/** « Récolter 120 Blé » */
export const intitule = (m: Pick<Mission, 'type' | 'quantite' | 'objet'>) => `${VERBES[m.type]} ${new Intl.NumberFormat('fr-FR').format(m.quantite)} ${m.objet}`

/** The reason written on a points row. */
export const raisonPoints = (m: Pick<Mission, 'type' | 'quantite' | 'objet'>) => `Mission de ${m.type} : ${intitule(m)}`
