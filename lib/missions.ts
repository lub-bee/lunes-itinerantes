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
/** « remise »: the holder handed the loot over, waiting for another member's confirmation (v3n). */
export type StatutMission = 'ouverte' | 'en cours' | 'remise' | 'accomplie'
export const TYPES_MISSION: TypeMission[] = ['récolte', 'fabrication']

/**
 * A rarity level (Ludo, 2026-10-30): how many units one mission gathers (« combien en ramasse-t-on en une
 * courte session ? »); null = « à fixer ». Its weight per unit stays internal: effort budget ÷ that quantity.
 */
export type Classe = { code: string; nom: string; quantite: number | null; note: string }
/**
 * A resource put in a rarity level, with its origin (a tag, display and filter only: Ferme, Chasse…) and an
 * optional « quantité de référence » of its own (what one gathers in a solid session): it overrides the
 * level's, and sets the weight (effort budget ÷ it), the lot per mission and the donation minimum by default.
 */
export type Assignation = { nom: string; classe: string; origine: string; reference: number | null; note: string }

/** A level's weight per unit (effort units), from its quantity per mission; null: « à fixer ». */
export const poidsClasse = (c: Pick<Classe, 'quantite'> | null | undefined, budget: number) => (c?.quantite && c.quantite > 0 ? budget / c.quantite : null)

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
  /** Quantity per mission of a resource whose rarity is « à fixer » (its weight: budget ÷ it). */
  quantiteRepli: number
  /** A free donation earns points from this many times the item's quantity per mission (its default minimum). */
  multipleDon: number
  /** Bonus (%) on a donation from `seuilBonusDon` times the quantity per mission (0: none). */
  bonusDon: number
  seuilBonusDon: number
}

/** The weight of a resource « à fixer ». */
export const poidsRepli = (r: Reglages) => r.budget / Math.max(0.01, r.quantiteRepli)

/**
 * How many units one mission holds for an item, set by hand (« Blé par 40 », « Bière par 20 »): it
 * overrides the effort-budget sizing of a harvest or of an intermediate's craft, and the « objets par
 * mission » of the final product's craft. Rows « lot » of the Pondération tab (the number in its « Poids » column).
 */
export type LotMission = { nom: string; lot: number }

/** `source`: read from the registre, or the built-in defaults (tab empty, or a script before v3m). */
/** `donsMin`: an item's own minimum for a free donation to earn points (« don minimum : N »). */
export type Ponderation = { classes: Classe[]; ressources: Assignation[]; lots: LotMission[]; donsMin: LotMission[]; reglages: Reglages; source: 'registre' | 'defaut' }

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
  /** Handed over (v3n), and who confirmed it. */
  remiseLe: string
  confirmePar: string
  note: string
  /** Who took it and gave it back, when (one line per gesture). */
  journal: string
  /** Written on the page, the registre's answer still awaited. */
  enAttente?: boolean
}

export type LignePoints = { horodatage: string; membre: string; points: number; raison: string; mission: string; confirmePar?: string; enAttente?: boolean }

/**
 * A standing mission (« mission permanente », v3n): always open, a fixed quantity and points per take; each
 * take is an ordinary mission (its « demande » is this id). `plafond`: takes per week at most (null: none).
 */
export type Permanente = { id: string; type: TypeMission; objet: string; quantite: number; points: number; poids: number | null; plafond: number | null; statut: 'ouverte' | 'en pause' | 'close'; par: string; date: string; note: string }

/** What the page receives. `moi`: the signed member (their missions and points). */
export type DonneesMissions = {
  relie: boolean
  /** The sheet's script knows the missions (v3m): writes are possible. */
  actif: boolean
  ponderation: Ponderation
  demandes: Demande[]
  missions: Mission[]
  points: LignePoints[]
  permanentes: Permanente[]
  /** Takes of each standing mission this week (taken, handed over or confirmed in it), for its weekly ceiling. */
  prises: Record<string, number>
  moi: string | null
  version: number
}

/** Actions of the missions (each one goes through lib/droits.ts). */
/** `rendre`: give a mission up (« renoncer »); `remettre`: hand its loot over; `confirmer` / `refuser`: another member's answer. */
export type ActionMission = 'demande' | 'prendre' | 'rendre' | 'remettre' | 'confirmer' | 'refuser' | 'ponderation' | 'permanente' | 'prendrePermanente' | 'don'
export const ACTIONS_MISSION: ActionMission[] = ['demande', 'prendre', 'rendre', 'remettre', 'confirmer', 'refuser', 'ponderation', 'permanente', 'prendrePermanente', 'don']

/* ───────────────────────── Defaults (missions/ponderation.md, 2026-10-28) ───────────────────────── */

/** The level of intermediate products (Cuir from Peaux, Bande de cuir from Cuir, Sels…). */
export const CODE_TRANSFORMATION = 'T'

// Ludo vouches for the alchemy; the other levels are a first guess, to be corrected in the tab.
export const CLASSES_DEFAUT: Classe[] = [
  { code: 'R1', nom: 'Abondant', quantite: 120, note: '' },
  { code: 'R2', nom: 'Commun', quantite: 60, note: '' },
  { code: 'R3', nom: 'Peu commun', quantite: 40, note: '' },
  { code: 'R4', nom: 'Rare', quantite: 30, note: '' },
  { code: 'R5', nom: 'Très rare', quantite: 15, note: '' },
  { code: 'R6', nom: 'Exceptionnel', quantite: 8, note: '' },
  { code: CODE_TRANSFORMATION, nom: 'Fabrication intermédiaire', quantite: 60, note: 'tanner, couper, distiller' },
]

/** Origins of a resource (a tag, no effect on points); the list is free, these are proposed. */
export const ORIGINES = ['Ferme', 'Cueillette', 'Cueillette / récolte localisée', 'Chasse', 'Créature', 'Mine', 'Achat']

/** The prototype's first classes (2026-10-28) and the rarity level each one becomes. */
const ANCIENNES: Record<string, { classe: string; origine: string }> = {
  C1: { classe: 'R1', origine: 'Cueillette' },
  C2: { classe: 'R2', origine: 'Cueillette / récolte localisée' },
  C3: { classe: 'R3', origine: 'Chasse' },
  C4: { classe: 'R4', origine: 'Chasse' },
  C5: { classe: 'R5', origine: 'Créature' },
  C6: { classe: 'R6', origine: 'Créature' },
  C7: { classe: '', origine: 'Mine' },
  F: { classe: 'R1', origine: 'Ferme' },
  T: { classe: CODE_TRANSFORMATION, origine: '' },
}

/** [level, origin] → resources, by default. */
const PAR_DEFAUT: [string, string, string[]][] = [
  ['R1', 'Ferme', ['Blé', 'Carotte', 'Tomate', 'Poireau', 'Pomme de terre', 'Ail']],
  [
    'R1',
    'Cueillette',
    [
      'Lavande', 'Lys Bleu', 'Lys jaune', 'Lys rouge', 'Lys violet', "Cosse d'herbe", 'Cloquerille', 'Chapeau blanc',
      'Champignon luminescent', 'Branche de chardon', 'Coton de toundra', 'Langue de dragon', 'Lichen géant', 'Baies de genièvre',
      'Genièvres', 'Hivernelle', 'Griveboise', 'Sel',
    ],
  ],
  [
    'R2',
    'Cueillette / récolte localisée',
    [
      'Pied de lutin', "Oreille d'elfe", 'Couronne sanglante', 'Mousse pendante', 'Grappe rampante', 'Campanule mortelle',
      'Racine de canis', 'Pulpe de racine', 'Fronde de somnalius', 'Tapinelle mora', 'Coupe de tache verte', 'Obscurcine',
      'Raisins Jazbay', 'Morelle noire', 'Myrrhe givrée', 'Amanite tue-mouches', 'Pholiotes à écailles', 'Mycènes des marais',
      'Amanites jaunes',
    ],
  ],
  ['R3', 'Chasse', ['Oeuf de Fauvette', 'Œuf de poisson carnassier', 'Écailles de poisson carnassier', 'Chitine de crabe de vase', 'Rayon de miel', 'Miel', 'Peau de ragnard carbonisée', 'Lapin cru']],
  [
    'R4',
    'Chasse',
    ['Peau de loup', 'Peau de loup des neiges', "Peau d'ours", "Peau d'ours des neiges", 'Peau de Smilodon', 'Peau de Smilodon des neiges', "Griffes d'ours", 'Croc de smilodon', 'Venaison', 'Horqueur cru', 'Bœuf cru', 'Grands bois'],
  ],
  ['R5', 'Créature', ['Graisse de troll', 'Œufs de chaurus', 'Chitine de chaurus', 'Venin de givre', 'Ectoplasme', 'Dents de spectre de glace', 'Défense de mammouth', 'Plumes de harfreuse', "Poudre d'os"]],
  ['R6', 'Créature', ['Coeur de Daedra']],
  ['R6', 'Achat', ['Huile dwemer']],
  ['', 'Mine', ["Minerai de fer", 'Minerai de corindon', "Minerai d'or", "Minerai d'argent", 'Minerai de vif-argent', 'Gemme spirituelle insignifiante', 'Rubis', 'Saphir', 'Améthyste', 'Charbon', 'Charbon pauvre']],
  ['', 'Achat', ['Sucrelune', 'Morceau de Lin', 'Petit bois']],
]

export const ASSIGNATIONS_DEFAUT: Assignation[] = PAR_DEFAUT.flatMap(([classe, origine, noms]) => noms.map((nom) => ({ nom, classe, origine, reference: null, note: '' })))

/** A resource's origin by default (by name), for rows that have none. */
const origineDefaut = (nom: string) => ASSIGNATIONS_DEFAUT.find((a) => cle(a.nom) === cle(nom))?.origine ?? ''

/** The settings, as the « Réglages missions » tab names them (the label is the row's key). */
export const REGLAGES: { cle: keyof Reglages; libelle: string; defaut: number; min: number; max: number; note: string }[] = [
  { cle: 'budget', libelle: 'Effort par mission', defaut: 120, min: 1, max: 100000, note: 'échelle interne : le poids d’une unité est cet effort ÷ sa quantité par mission' },
  { cle: 'maxEnCours', libelle: 'Missions en cours par membre', defaut: 5, min: 1, max: 99, note: 'une mission remise ne compte plus ; au-delà, il faut en remettre ou y renoncer' },
  { cle: 'objetsParFabrication', libelle: 'Objets par mission de fabrication', defaut: 10, min: 1, max: 10000, note: 'pour le produit final' },
  { cle: 'quantiteRepli', libelle: 'Quantité par mission de repli (rareté à fixer)', defaut: 30, min: 1, max: 100000, note: 'taille les missions des ressources sans rareté' },
  { cle: 'multipleDon', libelle: 'Multiple minimum pour un don', defaut: 1, min: 1, max: 100, note: 'un don rapporte des points à partir de ce multiple de la quantité par mission' },
  { cle: 'bonusDon', libelle: 'Bonus des gros dons (%)', defaut: 0, min: 0, max: 100, note: '0 : aucun bonus' },
  { cle: 'seuilBonusDon', libelle: 'Gros don : à partir de (× la quantité par mission)', defaut: 3, min: 1, max: 100, note: 'seuil du bonus' },
]

// The resources' and crafting shares are the pay's settings (lib/paie.ts, « Réglages paie »): one source.
export const REGLAGES_DEFAUT = { ...Object.fromEntries(REGLAGES.map((r) => [r.cle, r.defaut])), partRessources: 75, partFabrication: 5 } as Reglages

export const PONDERATION_DEFAUT: Ponderation = { classes: CLASSES_DEFAUT, ressources: ASSIGNATIONS_DEFAUT, lots: [], donsMin: [], reglages: REGLAGES_DEFAUT, source: 'defaut' }

/* ───────────────────────── In-character texts ───────────────────────── */

export const TEXTES = {
  /** Writes before the sheet's script knows the missions (v3m). */
  refus: 'Le scribe du registre ne sait pas encore tenir les missions : qu’on recopie le dernier script du grimoire (v3m) dans la feuille, puis qu’on réessaie.',
  inactif:
    'Le scribe du registre ne connaît pas encore les missions. Les pages se lisent, l’aperçu se calcule, mais rien ne s’inscrit tant que le dernier script du grimoire (v3m) n’est pas recopié dans la feuille.',
  sansRecette: (nom: string) => `Nulle recette n’est consignée pour ${nom} : qu’un artisan l’écrive au Livre des Recettes avant d’en demander.`,
  aFixer: 'rareté à fixer',
  limite: (max: number) => `Tes pattes sont pleines : ${max} missions en cours, pas une de plus. Remets-en une, ou renonces-y.`,
  /** The confirmation needs the v3n script. */
  refusV3n: 'Le scribe du registre ne sait pas encore qu’un butin se remet et se confirme : qu’on recopie le dernier script du grimoire (v3n) dans la feuille.',
  pasRemise: 'Ce butin n’a pas été remis : rien à confirmer.',
  soiMeme: 'Nul ne confirme son propre butin : qu’une autre patte le reçoive.',
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
  let repli = false
  let ancienPoids: number | null = null
  for (const l of lignes) {
    const k = cle(texte(l.reglage))
    const v = nombre(l.valeur)
    // The first layout's « Poids de repli (poids à fixer) » becomes a quantity per mission (budget ÷ weight).
    if (k.startsWith('poidsderepli')) ancienPoids = v
    const def = REGLAGES.find((r) => cle(r.libelle) === k || cle(r.cle) === k)
    if (def && v !== null) {
      res[def.cle] = Math.min(def.max, Math.max(def.min, v))
      if (def.cle === 'quantiteRepli') repli = true
    }
  }
  if (!repli && ancienPoids && ancienPoids > 0) res.quantiteRepli = Math.max(1, Math.round(res.budget / ancienPoids))
  return res
}

/**
 * The pondération from the Pondération tab: « classe » rows (a rarity level: Code, Nom, « Par mission »),
 * « ressource » rows (Code = its level, « Origine », « Poids » an older own weight) and « lot » rows (an
 * item's units per mission, in « Par mission », or « Poids » in the first layout), and the « Réglages
 * missions » tab. An empty tab: the defaults. The first layout (classes C1…C7 with a weight per unit) is
 * read into the levels — C1 → Abondant… —, the tab's own edits kept (lots, assignments, own weights); the
 * new layout is written only when the pondération is next engraved.
 */
export function ponderationLue(lignes: Record<string, unknown>[] = [], reglages: Record<string, unknown>[] = []): Ponderation {
  const r = reglagesLus(reglages)
  const ancienne = lignes.some((l) => cle(texte(l.genre)).startsWith('class') && /^c\d$/i.test(texte(l.code)))
  // A resource's own reference: « Par mission »; an older own weight (« Poids ») is read as budget ÷ it.
  const reference = (l: Record<string, unknown>): number | null => {
    const q = nombre(l.quantite)
    if (q && q > 0) return Math.round(q)
    const w = nombre(l.poids)
    return w && w > 0 ? Math.max(1, Math.round(r.budget / w)) : null
  }
  const classes: Classe[] = []
  const ressources: Assignation[] = []
  const lots: LotMission[] = []
  const donsMin: LotMission[] = []
  for (const l of lignes) {
    const genre = cle(texte(l.genre))
    const code = texte(l.code)
    const nom = texte(l.nom)
    if (genre.startsWith('don')) {
      const n = Math.round(nombre(l.quantite) ?? nombre(l.poids) ?? 0)
      if (nom && n >= 1 && !donsMin.some((x) => cle(x.nom) === cle(nom))) donsMin.push({ nom, lot: Math.min(1000000, n) })
    } else if (genre.startsWith('lot')) {
      const n = Math.round(nombre(l.quantite) ?? nombre(l.poids) ?? nombre(l.code) ?? 0)
      if (nom && n >= 1 && !lots.some((x) => cle(x.nom) === cle(nom))) lots.push({ nom, lot: Math.min(100000, n) })
    } else if (genre.startsWith('class')) {
      if (ancienne) {
        // An old class: its level takes the quantity its weight gave (C2 at weight 2 → 60), under the level's name.
        const a = ANCIENNES[code.toUpperCase()]
        const d = CLASSES_DEFAUT.find((c) => c.code === a?.classe)
        const w = nombre(l.poids)
        if (d && !classes.some((c) => c.code === d.code)) classes.push({ ...d, quantite: w && w > 0 ? Math.max(1, Math.round(r.budget / w)) : d.quantite })
      } else if (code && !classes.some((c) => cle(c.code) === cle(code))) classes.push({ code, nom: nom || code, quantite: nombre(l.quantite), note: texte(l.note) })
    } else if (nom && !ressources.some((x) => cle(x.nom) === cle(nom))) {
      if (ancienne) {
        const a = ANCIENNES[code.toUpperCase()]
        const defaut = ASSIGNATIONS_DEFAUT.find((x) => cle(x.nom) === cle(nom))
        // Farm produce left in C1 joins « Ferme »: the default origin wins over the old class's.
        ressources.push({ nom, classe: a ? a.classe : code, origine: defaut?.origine || a?.origine || '', reference: reference(l), note: texte(l.note) })
      } else ressources.push({ nom, classe: code, origine: texte(l.origine) || origineDefaut(nom), reference: reference(l), note: texte(l.note) })
    }
  }
  if (!classes.length && !ressources.length) return { ...PONDERATION_DEFAUT, lots, donsMin, reglages: r, source: lots.length || donsMin.length ? 'registre' : 'defaut' }
  // Every default level the tab lacks joins it (its own levels untouched).
  for (const d of CLASSES_DEFAUT) if (!classes.some((c) => cle(c.code) === cle(d.code))) classes.push(d)
  return { classes, ressources, lots, donsMin, reglages: r, source: 'registre' }
}

/** The pondération as the tabs' rows (what 'ponderation' writes, and the seed of a first demand). */
export function ponderationEnLignes(p: Ponderation) {
  return {
    lignes: [
      ...p.classes.map((c) => ({ genre: 'classe', code: c.code, nom: c.nom, quantite: c.quantite ?? '', origine: '', poids: '', note: c.note })),
      ...p.ressources.map((r) => ({ genre: 'ressource', code: r.classe, nom: r.nom, quantite: r.reference ?? '', origine: r.origine, poids: '', note: r.note })),
      ...p.lots.map((l) => ({ genre: 'lot', code: '', nom: l.nom, quantite: l.lot, origine: '', poids: '', note: 'par mission' })),
      ...(p.donsMin ?? []).map((l) => ({ genre: 'don', code: '', nom: l.nom, quantite: l.lot, origine: '', poids: '', note: 'don minimum' })),
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
    return a?.classe ? (classes.get(cle(a.classe)) ?? null) : null
  }
  /** Weight per unit (internal): budget ÷ the item's own reference, else its level's quantity; null: « à fixer ». */
  const poidsDe = (nom: string, transformation = false): number | null => {
    const a = assignee(nom)
    if (a?.reference && a.reference > 0) return p.reglages.budget / a.reference
    const c = a?.classe ? classes.get(cle(a.classe)) : transformation ? classes.get(cle(CODE_TRANSFORMATION)) : undefined
    return poidsClasse(c, p.reglages.budget)
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
    return a?.classe && cle(a.classe) !== cle(CODE_TRANSFORMATION) ? null : r
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
    const w = poids ?? poidsRepli(reglages)
    const classe = r ? assignee(nom)?.classe || CODE_TRANSFORMATION : assignee(nom)?.classe || null
    if (r) {
      // Whole crafts: a mission holds as many crafts as its effort allows (at least one).
      const rend = Math.max(1, r.rendement)
      for (const q of couper('fabrication', nom, (fournees.get(k) ?? 0) * rend, rend, Math.floor(budget / w + 1e-9), 'effort'))
        missions.push({ type: 'fabrication', intermediaire: true, objet: nom, quantite: q, poids, effort: q * w, points: 0, classe, ligne: cleLigne('fabrication', nom) })
    } else {
      const total = Math.ceil((besoin.get(k) ?? 0) - 1e-9)
      if (total <= 0) continue
      brut.push({ nom, quantite: total })
      for (const q of couper('récolte', nom, total, 1, Math.max(1, Math.floor(budget / w + 1e-9)), 'effort'))
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
  return k.startsWith('encours') || k.startsWith('prise') ? 'en cours' : k.startsWith('remise') ? 'remise' : k.startsWith('accompli') ? 'accomplie' : 'ouverte'
}

export type MissionsLues = { actif: boolean; ponderation: Ponderation; demandes: Demande[]; missions: Mission[]; points: LignePoints[]; permanentes: Permanente[] }

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
      remiseLe: date(r.remiseLe),
      confirmePar: texte(r.confirmePar),
      note: texte(r.note),
      journal: texte(r.journal),
    }))
    // A take of a standing mission given up (« abandonnée ») is gone.
    .filter((m, i) => m.numero && m.objet && !/^(abandon|refus)/.test(cle(texte((o.missions ?? [])[i]?.statut))))
  const points: LignePoints[] = (o.points ?? [])
    .map((r) => ({ horodatage: date(r.horodatage), membre: texte(r.membre), points: nombre(r.points) ?? 0, raison: texte(r.raison), mission: texte(r.mission), confirmePar: texte(r.confirmePar) }))
    .filter((p) => p.membre)
  const permanentes: Permanente[] = (o.permanentes ?? [])
    .map((r) => {
      const st = cle(texte(r.statut))
      return {
        id: texte(r.id),
        type: TYPES[cle(texte(r.type))] ?? 'récolte',
        objet: texte(r.objet),
        quantite: nombre(r.quantite) ?? 0,
        points: nombre(r.points) ?? 0,
        poids: nombre(r.poids),
        plafond: nombre(r.plafond),
        statut: (st.startsWith('pause') || st.startsWith('enpause') ? 'en pause' : st.startsWith('clos') ? 'close' : 'ouverte') as Permanente['statut'],
        par: texte(r.par),
        date: date(r.date),
        note: texte(r.note),
      }
    })
    .filter((x) => x.id && x.objet && x.quantite > 0)
  return { actif, ponderation: ponderationLue(o.ponderation ?? [], o.reglagesMissions ?? []), demandes, missions, points, permanentes }
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
    if ((m.statut !== 'en cours' && m.statut !== 'remise') || !m.prisPar) continue
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

/**
 * Points of one take of a standing mission, by default: what that quantity earns as part of the usual
 * recipes that use it. For each merchandise of the day book with a floor whose usual recipe takes the
 * item directly: its resources' share (75 % of the floor) × the item's part of the recipe's effort
 * (quantity × weight of the item ÷ Σ over the ingredients) ÷ the item's quantity per craft — the points one
 * unit earns there; the average over those recipes × the quantity. A product of the catalogue (a craft of
 * the final product): its crafting share (5 % of the floor) × the quantity.
 */
export function pointsParPrise(objet: string, quantite: number, recettes: Recette[], articles: { fr: string; min: number | null; ombre?: boolean }[], p: Ponderation, fini: boolean): number {
  const r = p.reglages
  if (fini) {
    const a = articles.find((x) => !x.ombre && cle(x.fr) === cle(objet))
    return a?.min ? Math.round((a.min * quantite * r.partFabrication) / 100) : 0
  }
  const { poidsDe } = peser(p)
  const parUnite: number[] = []
  for (const a of articles) {
    if (a.ombre || !a.min) continue
    const rec = recetteDe(recettes, a.fr)
    const ing = rec?.ingredients.find((i) => cle(i.nom) === cle(objet))
    if (!rec || !ing) continue
    const w = (nom: string) => poidsDe(nom, Boolean(recetteDe(recettes, nom))) ?? poidsRepli(r)
    const total = rec.ingredients.reduce((t, i) => t + i.quantite * w(i.nom), 0)
    if (total <= 0) continue
    parUnite.push(((a.min / Math.max(1, rec.rendement)) * (r.partRessources / 100) * ((ing.quantite * w(ing.nom)) / total)) / ing.quantite)
  }
  if (!parUnite.length) return 0
  return Math.round((parUnite.reduce((t, x) => t + x, 0) / parUnite.length) * quantite)
}

/**
 * Takes of each standing mission in the week [debut, fin): the confirmed ones confirmed in it, and those
 * still running (en cours, remise), so the ceiling cannot be passed.
 */
export function prisesDeLaSemaine(missions: Mission[], debut: number, fin: number): Record<string, number> {
  const res: Record<string, number> = {}
  for (const m of missions) {
    if (!/^p-/i.test(m.demande)) continue
    const t = Date.parse(m.accomplieLe)
    if (m.statut === 'en cours' || m.statut === 'remise' || (m.statut === 'accomplie' && t >= debut && t < fin)) res[m.demande] = (res[m.demande] ?? 0) + 1
  }
  return res
}

/** An item's quantity per mission: its lot set by hand, else its rarity's (or the settings' for a final product). */
export function quantiteParMission(p: Ponderation, nom: string, recettes: Recette[], fini = false): number {
  const lot = p.lots.find((l) => cle(l.nom) === cle(nom))?.lot
  if (lot) return lot
  if (fini) return p.reglages.objetsParFabrication
  return quantiteReference(p, nom, recettes) ?? p.reglages.quantiteRepli
}

/** An item's « quantité de référence »: its own, else its rarity level's (Fabrication intermédiaire for an intermediate); null: « à fixer ». */
export function quantiteReference(p: Ponderation, nom: string, recettes: Recette[]): number | null {
  const w = peser(p).poidsDe(nom, Boolean(recetteDe(recettes, nom)))
  return w ? Math.max(1, Math.round(p.reglages.budget / w)) : null
}

/** A free donation's minimum to earn points: the item's own (« don minimum »), else its quantity per mission × the multiple. */
export const minimumDon = (p: Ponderation, nom: string, recettes: Recette[], fini = false) =>
  p.donsMin?.find((l) => cle(l.nom) === cle(nom))?.lot ?? quantiteParMission(p, nom, recettes, fini) * p.reglages.multipleDon

/**
 * A free donation's points: the missions' rate per unit for that item (pointsParPrise) × quantity, only from
 * its minimum (below: 0, accepted all the same); + the big donations' bonus from the threshold, if set.
 */
export function pointsDon(objet: string, quantite: number, recettes: Recette[], articles: { fr: string; min: number | null; ombre?: boolean }[], p: Ponderation, fini: boolean) {
  const minimum = minimumDon(p, objet, recettes, fini)
  if (quantite < minimum) return { points: 0, minimum, bonus: false }
  const base = pointsParPrise(objet, quantite, recettes, articles, p, fini)
  const bonus = p.reglages.bonusDon > 0 && quantite >= quantiteParMission(p, objet, recettes, fini) * p.reglages.seuilBonusDon
  return { points: bonus ? Math.round(base * (1 + p.reglages.bonusDon / 100)) : base, minimum, bonus }
}

export const estDon = (m: Pick<Mission, 'demande'>) => /^don/i.test(m.demande)

/** « Récolter 120 Blé » */
export const intitule = (m: Pick<Mission, 'type' | 'quantite' | 'objet'>) => `${VERBES[m.type]} ${new Intl.NumberFormat('fr-FR').format(m.quantite)} ${m.objet}`

/** The reason written on a points row. */
export const raisonPoints = (m: Pick<Mission, 'type' | 'quantite' | 'objet'> & { demande?: string }) =>
  m.demande && /^don/i.test(m.demande) ? `Don : ${new Intl.NumberFormat('fr-FR').format(m.quantite)} ${m.objet}` : `Mission de ${m.type} : ${intitule(m)}`
