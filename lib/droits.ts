// Who may do what (Missions v2, lot 1b). Everything comes from the sheet, read through the script (v3p, `rangs: true`):
// - « Rôles » (edited by hand): one row per rank, its label and the ID of the Discord role that carries it. A
//   member's ranks are the labels whose Discord role they hold, read at their Discord seal (lib/sceau.ts) — never
//   the Membres « Rôle » column, which only mirrors them for the listings of other members (lib/rangs.ts, lib/paie.ts).
// - « Permissions », shared with the Table (contract § 5): Outil | Geste | Clé | one checkbox column per rank
//   (header = the rank's label). The grimoire reads and writes only its rows (Outil « Grimoire »). Unchecked,
//   a missing row or a missing column = no. Every caravan member holds the Discord role « Membre »: a gesture
//   open to all is the « Membre » box (no « Tout membre » column).
// - « Membre » is the prerequisite: without it (its Discord role, as mapped in Rôles), no gesture and no entry,
//   whatever the other ranks (a rule of the code, not a box); with it, the union of the boxes of all one's ranks.
// - Entering the grimoire is a gesture (« Entrer dans le grimoire », `entrer`), checked at the Discord seal.
// The defaults below only SEED the Grimoire's rows once, when the tab holds none (lib/registre.ts semerPermissions,
// the secret page); a gesture added later arrives unchecked, except one marked `semee` (lot 2: `sortie`), whose missing
// row the next seal writes once with its defaults (lib/registre.ts semerSiBesoin). A failed read grants nothing (`lu` false).
// Testers (TESTEURS_DISCORD_IDS, never the sheet; lib/testeurs.ts) hold every gesture and the secret page, even when
// the tabs cannot be read.
// The server checks every write (and the Trésor's reads); the page only hides what a member may not do.
// Pure: no server-only import (the page reads the types and the labels too).

import { cle } from './missives'
import type { ActionRegistre } from './missives'
import type { ActionMission } from './missions'
import type { ActionPaie } from './paie'

/** Every action a member can take: the registre's, the missions' and the pay's. */
export type Action = ActionRegistre | ActionMission | ActionPaie

/** A rank's key: a known rank's `cle` below, or the letters of any other label (`cle` of lib/missives.ts). */
export type Role = string

/** The « Outil » of the grimoire's rows in the shared Permissions tab. */
export const OUTIL = 'Grimoire'

/* ───────────────────────── Ranks ───────────────────────── */

export type DefRole = { cle: Role; nom: string; alias?: string[] }

/** Known ranks (their defaults below); the Rôles tab may name others, which start with nothing. */
export const ROLES: DefRole[] = [
  { cle: 'membre', nom: 'Membre', alias: ['Membres'] },
  { cle: 'patriarche', nom: 'Patriarche', alias: ['Patriarches'] },
  { cle: 'argentier', nom: 'Argentier', alias: ['Argentiers', 'Argentière', 'Argentier / Argentière', 'Argentier / Argentiere'] },
  { cle: 'aide-de-camp', nom: 'Aide de camp', alias: ['Aides de camp'] },
  { cle: 'maitre-des-routes', nom: 'Maître des routes' },
  { cle: 'voix-du-commerce', nom: 'Voix du commerce' },
  { cle: 'voix-de-la-securite', nom: 'Voix de la sécurité' },
  { cle: 'marchand-de-lune', nom: 'Marchand de lune', alias: ['Marchands de lune', 'Marchande de lune'] },
  { cle: 'petites-lunes', nom: 'Petites lunes', alias: ['Petite lune'] },
  { cle: 'ami-des-lunes', nom: 'Ami des Lunes', alias: ['Amie des Lunes', 'Amis des Lunes'] },
]

export const MEMBRE: Role = 'membre'
/** « Ami des Lunes »: a rank that never links nor signs (lib/identite.ts), whatever its boxes. */
export const AMI: Role = 'ami-des-lunes'

/** A rank's key from any spelling of its label (case, accents, punctuation ignored; a known alias counts). */
export function cleRole(nom: string): Role {
  const k = cle(nom)
  if (!k) return ''
  const r = ROLES.find((x) => cle(x.nom) === k || (x.alias ?? []).some((a) => cle(a) === k))
  return r ? r.cle : k
}

/* ───────────────────────── Gestures ───────────────────────── */

export type Geste =
  | 'entrer'
  | 'vente'
  | 'prix'
  | 'retirer'
  | 'deplacer'
  | 'livre'
  | 'versement'
  | 'recette'
  | 'recetteCorriger'
  | 'usage'
  | 'ressource'
  | 'ecrire'
  | 'remise'
  | 'cloture'
  | 'choix'
  | 'releve'
  | 'depot'
  | 'fabrication'
  | 'missionsMembre'
  | 'don'
  | 'ponderation'
  | 'sortie'
  | 'intendance'
  | 'tresor'
  | 'reglagesPaie'
  | 'facture'
  | 'evenement'
  | 'ecriture'
  | 'clotureSemaine'
  | 'paiement'

/**
 * `defaut`: the ranks whose box the seed checks; 'tous' = the « Membre » box (every caravan member holds it).
 * `semee`: a gesture added after the first seed whose row is seeded once with its defaults when the tab lacks it
 * (lot 2: the brief asks the new gestures to arrive with the round-4 defaults, not unchecked); once the row exists,
 * the sheet decides alone.
 */
export type DefGeste = { cle: Geste; groupe: string; libelle: string; defaut: 'tous' | Role[]; note?: string; semee?: boolean }

const P = 'patriarche'
const A = 'argentier'
const ADC = 'aide-de-camp'
const VOIX = ['maitre-des-routes', 'voix-du-commerce', 'voix-de-la-securite']
const MARCHAND = 'marchand-de-lune'
/** Everyone but the Petites lunes. */
const SAUF_PETITES = [P, A, ADC, ...VOIX, MARCHAND]
const TRESOR = [P, A]

export const GESTES: DefGeste[] = [
  { cle: 'entrer', groupe: 'Grimoire', libelle: 'Entrer dans le grimoire', defaut: 'tous', note: 'vérifié au sceau Discord' },
  { cle: 'vente', groupe: 'Marchandises', libelle: 'Inscrire une marchandise / mettre en vente', defaut: [P, A, ...VOIX] },
  { cle: 'prix', groupe: 'Marchandises', libelle: 'Changer un prix (vente ou achat)', defaut: SAUF_PETITES, note: 'avec la page Achat, à venir' },
  { cle: 'retirer', groupe: 'Marchandises', libelle: 'Retirer un article du catalogue', defaut: [P, A, ADC, ...VOIX] },
  { cle: 'deplacer', groupe: 'Marchandises', libelle: 'Déplacer un article vers un autre chapitre', defaut: 'tous' },
  { cle: 'livre', groupe: 'Marchandises', libelle: 'Passer un article au Livre d’ombre (ou l’en sortir)', defaut: 'tous' },
  { cle: 'versement', groupe: 'Marchandises', libelle: 'Marquer versée la part d’une vente', defaut: TRESOR },
  { cle: 'recette', groupe: 'Recettes', libelle: 'Consigner une recette', defaut: SAUF_PETITES },
  { cle: 'recetteCorriger', groupe: 'Recettes', libelle: 'Corriger une recette / ajouter une variante', defaut: SAUF_PETITES },
  { cle: 'usage', groupe: 'Recettes', libelle: 'Choisir la recette d’usage d’un ouvrage', defaut: 'tous' },
  { cle: 'ressource', groupe: 'Recettes', libelle: 'Inscrire / mettre à jour une matière', defaut: [P, A, ...VOIX, MARCHAND] },
  { cle: 'ecrire', groupe: 'Missives et missions', libelle: 'Écrire une mission ou une missive', defaut: [P, A, ADC], note: 'missive, mission mère et ses missions enfants (l’écrire, la corriger, la clore), mission permanente' },
  { cle: 'remise', groupe: 'Missives et missions', libelle: 'Consigner une remise ou un don', defaut: [P, A, ADC, ...VOIX], note: 'et répondre oui / non à ce qui a été déposé' },
  { cle: 'cloture', groupe: 'Missives et missions', libelle: 'Clore une missive (livrée ou inachevée)', defaut: 'tous' },
  { cle: 'choix', groupe: 'Missives et missions', libelle: 'Choisir la recette d’une ligne de missive', defaut: 'tous' },
  { cle: 'releve', groupe: 'Missives et missions', libelle: 'Relever le coffre (compter)', defaut: 'tous' },
  { cle: 'depot', groupe: 'Missives et missions', libelle: 'Déposer au coffre', defaut: 'tous' },
  { cle: 'fabrication', groupe: 'Missives et missions', libelle: 'Façonner pour une missive', defaut: 'tous', note: 'plus proposé : on façonne depuis les Sorties' },
  { cle: 'missionsMembre', groupe: 'Missives et missions', libelle: 'Signaler une remise ou un dépôt', defaut: 'tous', note: 'au coffre des petites lunes, ou remis en main propre : il attend qu’on réponde' },
  { cle: 'don', groupe: 'Missives et missions', libelle: 'Déclarer un don libre', defaut: 'tous', note: 'plus proposé : on le signale comme une remise' },
  { cle: 'ponderation', groupe: 'Missives et missions', libelle: 'Régler la pondération des efforts', defaut: [P] },
  { cle: 'sortie', groupe: 'Missives et missions', libelle: 'Consigner une sortie du coffre', defaut: [P, A, ADC], note: 'sortir pour façonner, confirmer une vente prise au coffre, une perte', semee: true },
  { cle: 'intendance', groupe: 'Livres', libelle: 'Ouvrir le livre de l’Intendance', defaut: [P, A, ADC] },
  { cle: 'tresor', groupe: 'Livres', libelle: 'Ouvrir le livre du Trésor (et voir les points)', defaut: TRESOR },
  { cle: 'reglagesPaie', groupe: 'Trésor', libelle: 'Régler la paie', defaut: TRESOR },
  { cle: 'facture', groupe: 'Trésor', libelle: 'Inscrire, corriger ou rayer une facture', defaut: TRESOR },
  { cle: 'evenement', groupe: 'Trésor', libelle: 'Inscrire ou corriger un événement', defaut: TRESOR },
  { cle: 'ecriture', groupe: 'Trésor', libelle: 'Tenir le registre d’un événement', defaut: TRESOR },
  { cle: 'clotureSemaine', groupe: 'Trésor', libelle: 'Clore la période', defaut: TRESOR },
  { cle: 'paiement', groupe: 'Trésor', libelle: 'Marquer une paie payée', defaut: TRESOR },
]

/** The gesture each action needs ('recette' becomes 'recetteCorriger' when the product already has a recipe: the route decides). */
export const GESTE_DE: Record<Action, Geste> = {
  missive: 'ecrire',
  releve: 'releve',
  depot: 'depot',
  fabrication: 'fabrication',
  cloture: 'cloture',
  recette: 'recette',
  ressource: 'ressource',
  vente: 'vente',
  usage: 'usage',
  choix: 'choix',
  deplacer: 'deplacer',
  livre: 'livre',
  retirer: 'retirer',
  versement: 'versement',
  demande: 'ecrire',
  entree: 'remise',
  signaler: 'missionsMembre',
  recevoir: 'remise',
  faconnage: 'sortie',
  sortie: 'sortie',
  sortir: 'sortie',
  clore: 'sortie',
  confirmer: 'remise',
  refuser: 'remise',
  ponderation: 'ponderation',
  permanente: 'ecrire',
  // Lot 2b: correcting, closing and reopening a sheet or a mission: who writes missions (Patriarche, Argentier, Aide de camp).
  feuillet: 'ecrire',
  fermer: 'ecrire',
  reglagesPaie: 'reglagesPaie',
  facture: 'facture',
  evenement: 'evenement',
  ecriture: 'ecriture',
  clotureSemaine: 'clotureSemaine',
  paiement: 'paiement',
}

/* ───────────────────────── The table, read from the sheet ───────────────────────── */

/** A rank column: a label of the Rôles tab (`dansFeuille`: the Permissions tab already has its column). */
export type Colonne = { cle: Role; nom: string; dansFeuille: boolean }

/** A rank of the « Rôles » tab: its Discord role ID ('' when not filled; `illisible`: a number the sheet rounded). */
export type RoleDiscord = { nom: string; cle: Role; id: string; illisible: boolean }

export type TablePermissions = {
  /** The script answered the Rôles and Permissions tabs (v3p, asked with `rangs: true`); false: nothing is granted. */
  lu: boolean
  /** The ranks of the Rôles tab, in its order (one per key). */
  colonnes: Colonne[]
  /** Per gesture, per rank key: checked in the sheet (a missing row or cell: false). */
  cases: Record<Geste, Record<Role, boolean>>
  /** Per gesture: whether its Grimoire row is in the tab. */
  ecrites: Record<Geste, boolean>
  /** The tab holds at least one Grimoire row (else the next write seeds the defaults). */
  semees: boolean
  /** Grimoire rows of keys the grimoire does not know (kept as they are). */
  inconnues: { geste: string; cle: string }[]
  /** Headers of the tab's rank columns that no Rôles label names (never written, never removed). */
  orphelines: string[]
  roles: RoleDiscord[]
}

/** A checked cell, read leniently: TRUE, « oui », ✓, x… */
export function coche(v: unknown): boolean {
  if (v === true) return true
  if (typeof v === 'number') return v !== 0
  const t = String(v ?? '').trim().toLowerCase()
  return ['true', 'vrai', 'oui', 'o', 'yes', 'y', 'x', '1', '✓', '✔', '☑', '✅', 'v'].includes(t)
}

/** The seed's box for this gesture and rank (only when the tab holds no Grimoire row). */
export const defautDe = (g: DefGeste, role: Role) => (g.defaut === 'tous' ? role === MEMBRE : g.defaut.includes(role))

type LigneBrute = { outil?: unknown; geste?: unknown; cle?: unknown; cases?: unknown }
const FIXES = ['outil', 'geste', 'cle', 'code']

/** The Rôles tab and the Grimoire's rows of Permissions (v3p) read into the table; an older script: `lu` false. */
export function lirePermissions(o: { roles?: Record<string, unknown>[]; permissions?: Record<string, unknown>[]; permissionsEntete?: unknown[] }): TablePermissions {
  const lu = Array.isArray(o.roles) && Array.isArray(o.permissions)
  const roles: RoleDiscord[] = (o.roles ?? []).flatMap((r) => {
    const nom = String(r.role ?? '').trim()
    if (!nom) return []
    // A Discord ID has 17 to 20 digits: typed as a number, the sheet keeps only 15 of them.
    const illisible = typeof r.id === 'number' && r.id > Number.MAX_SAFE_INTEGER
    const id = illisible ? '' : String(r.id ?? '').replace(/\D/g, '')
    return [{ nom, cle: cleRole(nom), id, illisible }]
  })
  const entete = (Array.isArray(o.permissionsEntete) ? o.permissionsEntete : []).map((h) => String(h ?? '').trim()).filter(Boolean)
  const enTete = new Set(entete.map(cleRole))
  const colonnes: Colonne[] = []
  for (const r of roles) if (r.cle && !colonnes.some((c) => c.cle === r.cle)) colonnes.push({ cle: r.cle, nom: r.nom, dansFeuille: enTete.has(r.cle) })
  const orphelines = entete.filter((h) => !FIXES.includes(cle(h)) && !colonnes.some((c) => c.cle === cleRole(h)))

  const lignes = ((o.permissions ?? []) as LigneBrute[]).filter((l) => cle(String(l.outil ?? OUTIL)) === cle(OUTIL))
  const cases = {} as Record<Geste, Record<Role, boolean>>
  const ecrites = {} as Record<Geste, boolean>
  const prises = new Set<LigneBrute>()
  for (const g of GESTES) {
    const ligne = lignes.find((l) => !prises.has(l) && cle(String(l.cle ?? '')) === cle(g.cle))
    if (ligne) prises.add(ligne)
    const cellules = new Map<Role, unknown>()
    if (ligne?.cases && typeof ligne.cases === 'object') for (const [h, v] of Object.entries(ligne.cases as Record<string, unknown>)) if (!cellules.has(cleRole(h))) cellules.set(cleRole(h), v)
    ecrites[g.cle] = Boolean(ligne)
    cases[g.cle] = Object.fromEntries(colonnes.map((c) => [c.cle, lu && cellules.has(c.cle) ? coche(cellules.get(c.cle)) : false]))
  }
  const inconnues = lignes.filter((l) => !prises.has(l)).map((l) => ({ geste: String(l.geste ?? ''), cle: String(l.cle ?? '') }))
  return { lu, colonnes, cases, ecrites, semees: lignes.length > 0, inconnues, orphelines, roles }
}

/** The seed of the Grimoire's rows: every gesture, its defaults checked for the ranks of the Rôles tab. */
export function semis(t: TablePermissions) {
  return GESTES.map((g) => ({ cle: g.cle, geste: g.libelle, valeurs: Object.fromEntries(t.colonnes.map((c) => [c.nom, defautDe(g, c.cle)])) }))
}

/** The rows of the gestures added later (`semee`) that the tab lacks, with their defaults (seeded once, lot 2). */
export function semisNouveaux(t: TablePermissions) {
  return semis(t).filter((l) => GESTES.find((g) => g.cle === l.cle)?.semee && !t.ecrites[l.cle as Geste])
}

/* ───────────────────────── Who may ───────────────────────── */

/** What the server knows of the one asking: their ranks' keys and whether they are a tester. */
export type Qualites = { roles: Role[]; testeur: boolean }

export const estGeste = (x: string): x is Geste => GESTES.some((g) => g.cle === x)

/**
 * Whether `qui` may take this gesture (or the gesture of this action): a tester always may; nobody on a failed read;
 * nobody without the rank « Membre »; else the union of the boxes of « Membre » and of every other rank they hold.
 */
export function peut(quoi: Action | Geste, qui: Qualites | null, table: TablePermissions): boolean {
  if (!qui) return false
  if (qui.testeur) return true
  if (!table.lu) return false
  // « Membre » is the prerequisite (contract § 5): without it, no gesture at all, whatever the other ranks.
  if (!qui.roles.includes(MEMBRE)) return false
  const g: Geste | undefined = estGeste(quoi) ? quoi : GESTE_DE[quoi as Action]
  const c = g ? table.cases[g] : undefined
  if (!c) return false
  return qui.roles.some((r) => c[r])
}

export type Droits = Record<Action | Geste, boolean>

/** Every action and every gesture, allowed or not, for the page (it hides what is not). */
export function droitsDe(qui: Qualites, table: TablePermissions): Droits {
  const cles = [...Object.keys(GESTE_DE), ...GESTES.map((g) => g.cle)] as (Action | Geste)[]
  return Object.fromEntries(cles.map((k) => [k, peut(k, qui, table)])) as Droits
}

/* ───────────────────────── Ranks of a seal ───────────────────────── */

/** The ranks (Rôles rows, in the tab's order, one per key) whose Discord role ID is among `discord`. */
export function rangsDuSceau(discord: string[] | null | undefined, table: TablePermissions): RoleDiscord[] {
  const ids = new Set(discord ?? [])
  const res: RoleDiscord[] = []
  for (const r of table.roles) if (r.id && ids.has(r.id) && !res.some((x) => x.cle === r.cle)) res.push(r)
  return res
}

/**
 * What the Membres « Rôle » cell says of a seal: its ranks other than « Membre », else « Membre » alone (a seal
 * without « Membre » keeps whatever it holds; none: empty, read « Sans rang » by lib/rangs.ts).
 */
export function rangsEcrits(rangs: RoleDiscord[]): string[] {
  const autres = rangs.filter((r) => r.cle !== MEMBRE)
  return (autres.length ? autres : rangs).map((r) => r.nom)
}
