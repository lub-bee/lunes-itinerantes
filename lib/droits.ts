// Who may do what (Missions v2, lot 1). The source is the sheet's « Permissions » tab: one row per gesture,
// one column per role, a box checked or not; it is edited from the secret page /permissions (testers only).
// This file keeps the defaults (proposal v4, section 6), used when the tab is missing, or a row or a
// column of it is absent; a cell present in the tab always wins, checked or not.
//
// A member's roles come from Discord: the « Rôles » tab maps a role name to the ID of the Discord role
// that carries it, and the Discord seal keeps the member's role IDs (lib/sceau.ts). TRANSITION: the
// Membres « Rôle » column is read only when none of the member's Discord roles is mapped (a password
// session, a seal from before lot 1, an empty « Rôles » tab); it is to be removed later.
// Testers (TESTEURS_DISCORD_IDS, Discord user IDs, never the sheet; lib/identite.ts) hold every permission,
// the secret page included. A role with no checked box has no reserved gesture; « Tout membre » opens a
// gesture to every signed member, whatever their roles (none included).
// The server checks every write (and the Trésor's reads); the page only hides what a member may not do.
// Pure: no server-only import (the page reads the types and the labels too).

import { cle } from './missives'
import type { ActionRegistre } from './missives'
import type { ActionMission } from './missions'
import type { ActionPaie } from './paie'

/** Every action a member can take: the registre's, the missions' and the pay's. */
export type Action = ActionRegistre | ActionMission | ActionPaie

/** A role's key: a known role's `cle` below, or the letters of any other name (`cle` of lib/missives.ts). */
export type Role = string

/* ───────────────────────── Roles ───────────────────────── */

/** The « Tout membre » column: a gesture open to every signed member. */
export const TOUT_MEMBRE = 'tout-membre'

export type DefRole = { cle: Role; nom: string; alias?: string[] }

/** The roles of the caravan, in the order of the Permissions tab's columns (lib/rangs.ts for the ranks' names). */
export const ROLES: DefRole[] = [
  { cle: 'patriarche', nom: 'Patriarche', alias: ['Patriarches'] },
  { cle: 'argentier', nom: 'Argentier', alias: ['Argentiers', 'Argentière'] },
  { cle: 'aide-de-camp', nom: 'Aide de camp', alias: ['Aides de camp'] },
  { cle: 'maitre-des-routes', nom: 'Maître des routes' },
  { cle: 'voix-du-commerce', nom: 'Voix du commerce' },
  { cle: 'voix-de-la-securite', nom: 'Voix de la sécurité' },
  { cle: 'marchand-de-lune', nom: 'Marchand de lune', alias: ['Marchands de lune', 'Marchande de lune'] },
  { cle: 'petites-lunes', nom: 'Petites lunes', alias: ['Petite lune'] },
]

/** A role's key from any spelling of its name (case, accents, punctuation ignored; a known alias counts). */
export function cleRole(nom: string): Role {
  const k = cle(nom)
  if (!k) return ''
  if (k === cle('Tout membre') || k === cle('Tous') || k === cle('Tous les membres')) return TOUT_MEMBRE
  const r = ROLES.find((x) => cle(x.nom) === k || (x.alias ?? []).some((a) => cle(a) === k))
  return r ? r.cle : k
}

/** The roles written in a Membres « Rôle » cell (several may be separated by commas): the transition fallback. */
export const rolesEcrits = (cellule: string): Role[] => [...new Set(String(cellule ?? '').split(/[,;/]/).map(cleRole).filter((r) => r && r !== TOUT_MEMBRE))]

/* ───────────────────────── Gestures ───────────────────────── */

export type Geste =
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
  | 'intendance'
  | 'tresor'
  | 'reglagesPaie'
  | 'facture'
  | 'evenement'
  | 'ecriture'
  | 'clotureSemaine'
  | 'paiement'

/** `defaut`: the roles whose box is checked by default, or 'tous' (« Tout membre » checked, no role box). */
export type DefGeste = { cle: Geste; groupe: string; libelle: string; defaut: 'tous' | Role[]; note?: string }

const P = 'patriarche'
const A = 'argentier'
const ADC = 'aide-de-camp'
const VOIX = ['maitre-des-routes', 'voix-du-commerce', 'voix-de-la-securite']
const MARCHAND = 'marchand-de-lune'
/** Everyone but the Petites lunes. */
const SAUF_PETITES = [P, A, ADC, ...VOIX, MARCHAND]
const TRESOR = [P, A]

export const GESTES: DefGeste[] = [
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
  { cle: 'ecrire', groupe: 'Missives et missions', libelle: 'Écrire une mission ou une missive', defaut: [P, A, ADC], note: 'missive, demande, mission permanente' },
  { cle: 'remise', groupe: 'Missives et missions', libelle: 'Consigner une remise ou un don', defaut: [P, A, ADC, ...VOIX], note: 'confirmer ou refuser ce qui a été remis' },
  { cle: 'cloture', groupe: 'Missives et missions', libelle: 'Clore une missive (livrée ou inachevée)', defaut: 'tous' },
  { cle: 'choix', groupe: 'Missives et missions', libelle: 'Choisir la recette d’une ligne de missive', defaut: 'tous' },
  { cle: 'releve', groupe: 'Missives et missions', libelle: 'Relever le coffre (compter)', defaut: 'tous' },
  { cle: 'depot', groupe: 'Missives et missions', libelle: 'Déposer au coffre', defaut: 'tous' },
  { cle: 'fabrication', groupe: 'Missives et missions', libelle: 'Façonner pour une missive', defaut: 'tous' },
  { cle: 'missionsMembre', groupe: 'Missives et missions', libelle: 'Prendre, rendre ou remettre une mission', defaut: 'tous' },
  { cle: 'don', groupe: 'Missives et missions', libelle: 'Déclarer un don libre', defaut: 'tous', note: 'il attend qu’on le consigne' },
  { cle: 'ponderation', groupe: 'Missives et missions', libelle: 'Régler la pondération des efforts', defaut: [P] },
  { cle: 'intendance', groupe: 'Livres', libelle: 'Ouvrir le livre de l’Intendance', defaut: [P, A, ADC], note: 'le livre viendra au lot 2' },
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
  prendre: 'missionsMembre',
  rendre: 'missionsMembre',
  remettre: 'missionsMembre',
  confirmer: 'remise',
  refuser: 'remise',
  ponderation: 'ponderation',
  permanente: 'ecrire',
  prendrePermanente: 'missionsMembre',
  don: 'don',
  reglagesPaie: 'reglagesPaie',
  facture: 'facture',
  evenement: 'evenement',
  ecriture: 'ecriture',
  clotureSemaine: 'clotureSemaine',
  paiement: 'paiement',
}

/* ───────────────────────── The table, read from the sheet ───────────────────────── */

/** A column of the table: « Tout membre », a known role, or a role the sheet names (Rôles tab, a column added by hand). */
export type Colonne = { cle: Role; nom: string; connue: boolean }

/** A row of the tab whose key the grimoire does not know: kept as it is when the page rewrites the tab. */
export type LigneInconnue = { groupe: string; geste: string; cle: string; valeurs: Record<string, boolean> }

/** A role of the « Rôles » tab: its Discord role ID ('' when not filled; `illisible`: a number the sheet rounded). */
export type RoleDiscord = { nom: string; cle: Role; id: string; illisible: boolean }

export type TablePermissions = {
  colonnes: Colonne[]
  /** Per gesture, per role key: checked or not (the tab's cell, else the default). */
  cases: Record<Geste, Record<Role, boolean>>
  /** Per gesture: whether its row is in the tab (else every box is the default). */
  ecrites: Record<Geste, boolean>
  inconnues: LigneInconnue[]
  /** The script reads the Rôles and Permissions tabs (v3o, asked with `permissions: true`). */
  lu: boolean
  /** The Permissions tab holds rows. */
  onglet: boolean
  roles: RoleDiscord[]
}

/** A checked cell, read leniently: TRUE, « oui », ✓, x… */
export function coche(v: unknown): boolean {
  if (v === true) return true
  if (typeof v === 'number') return v !== 0
  const t = String(v ?? '').trim().toLowerCase()
  return ['true', 'vrai', 'oui', 'o', 'yes', 'y', 'x', '1', '✓', '✔', '☑', '✅', 'v'].includes(t)
}

export const defautDe = (g: DefGeste, role: Role) => (g.defaut === 'tous' ? role === TOUT_MEMBRE : g.defaut.includes(role))

type LigneBrute = { groupe?: unknown; geste?: unknown; cle?: unknown; roles?: unknown }

/** The Rôles and Permissions tabs (v3o) read into the table; an older script (no such tabs): the defaults. */
export function lirePermissions(o: { roles?: Record<string, unknown>[]; permissions?: Record<string, unknown>[] }): TablePermissions {
  const lu = Array.isArray(o.roles) && Array.isArray(o.permissions)
  const roles: RoleDiscord[] = (o.roles ?? []).flatMap((r) => {
    const nom = String(r.role ?? '').trim()
    if (!nom) return []
    // A Discord ID has 17 to 20 digits: typed as a number, the sheet keeps only 15 of them.
    const illisible = typeof r.id === 'number' && r.id > Number.MAX_SAFE_INTEGER
    const id = illisible ? '' : String(r.id ?? '').replace(/\D/g, '')
    return [{ nom, cle: cleRole(nom), id, illisible }]
  })
  const colonnes: Colonne[] = [{ cle: TOUT_MEMBRE, nom: 'Tout membre', connue: true }, ...ROLES.map((r) => ({ cle: r.cle, nom: r.nom, connue: true }))]
  const ajouter = (nom: string) => {
    const k = cleRole(nom)
    if (k && !colonnes.some((c) => c.cle === k)) colonnes.push({ cle: k, nom: nom.trim(), connue: false })
  }
  roles.forEach((r) => ajouter(r.nom))
  const lignes = (o.permissions ?? []) as LigneBrute[]
  for (const l of lignes) if (l.roles && typeof l.roles === 'object') Object.keys(l.roles).forEach(ajouter)

  const cases = {} as Record<Geste, Record<Role, boolean>>
  const ecrites = {} as Record<Geste, boolean>
  const prises = new Set<LigneBrute>()
  for (const g of GESTES) {
    const ligne =
      lignes.find((l) => !prises.has(l) && cle(String(l.cle ?? '')) === cle(g.cle)) ??
      lignes.find((l) => !prises.has(l) && !String(l.cle ?? '').trim() && cle(String(l.geste ?? '')) === cle(g.libelle))
    if (ligne) prises.add(ligne)
    const cellules = new Map<Role, unknown>()
    if (ligne?.roles && typeof ligne.roles === 'object') for (const [h, v] of Object.entries(ligne.roles as Record<string, unknown>)) cellules.set(cleRole(h), v)
    ecrites[g.cle] = Boolean(ligne)
    cases[g.cle] = Object.fromEntries(colonnes.map((c) => [c.cle, cellules.has(c.cle) ? coche(cellules.get(c.cle)) : defautDe(g, c.cle)]))
  }
  const inconnues: LigneInconnue[] = lignes
    .filter((l) => !prises.has(l))
    .map((l) => ({
      groupe: String(l.groupe ?? ''),
      geste: String(l.geste ?? ''),
      cle: String(l.cle ?? ''),
      valeurs: Object.fromEntries(Object.entries((l.roles ?? {}) as Record<string, unknown>).map(([h, v]) => [h, coche(v)])),
    }))
  return { colonnes, cases, ecrites, inconnues, lu, onglet: lignes.length > 0, roles }
}

/** The defaults alone (no sheet). */
export const PERMISSIONS_DEFAUT = lirePermissions({})

/* ───────────────────────── Who may ───────────────────────── */

/** What the server knows of the one asking: their roles' keys and whether they are a tester. */
export type Qualites = { roles: Role[]; testeur: boolean }

export const estGeste = (x: string): x is Geste => GESTES.some((g) => g.cle === x)

/** Whether `qui` may take this gesture (or the gesture of this action); a tester always may, nobody unsigned. */
export function peut(quoi: Action | Geste, qui: Qualites | null, table: TablePermissions = PERMISSIONS_DEFAUT): boolean {
  if (!qui) return false
  if (qui.testeur) return true
  const g: Geste | undefined = estGeste(quoi) ? quoi : GESTE_DE[quoi as Action]
  const c = g ? table.cases[g] : undefined
  if (!c) return false
  return Boolean(c[TOUT_MEMBRE]) || qui.roles.some((r) => c[r])
}

export type Droits = Record<Action | Geste, boolean>

/** Every action and every gesture, allowed or not, for the page (it hides what is not). */
export function droitsDe(qui: Qualites, table: TablePermissions): Droits {
  const cles = [...Object.keys(GESTE_DE), ...GESTES.map((g) => g.cle)] as (Action | Geste)[]
  return Object.fromEntries(cles.map((k) => [k, peut(k, qui, table)])) as Droits
}

/* ───────────────────────── Roles of a member ───────────────────────── */

/**
 * A member's roles: the mapped Discord roles of their seal; when none is mapped (password session, seal from
 * before lot 1, empty « Rôles » tab), the Membres « Rôle » cell (TRANSITION, until the column goes). The
 * DISCORD_ROLE_PATRIARCHE flag of the seal adds 'patriarche' either way.
 */
export function rolesDuMembre(a: { cellule: string; discord?: string[] | null; patriarche?: boolean; table: TablePermissions }): { roles: Role[]; origine: 'discord' | 'feuille' } {
  const parId = new Map(a.table.roles.filter((r) => r.id).map((r) => [r.id, r.cle]))
  const mappes = [...new Set((a.discord ?? []).flatMap((id) => (parId.has(id) ? [parId.get(id)!] : [])))].filter((r) => r !== TOUT_MEMBRE)
  const origine: 'discord' | 'feuille' = mappes.length ? 'discord' : 'feuille'
  const roles = mappes.length ? mappes : rolesEcrits(a.cellule)
  if (a.patriarche && !roles.includes('patriarche')) roles.push('patriarche')
  return { roles, origine }
}
