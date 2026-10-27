// Permission hook of the missives, recipes and resources: one rule per action. Everyone may do
// everything for now (Ludo, 2026-10-21); to restrict an action later, list the roles allowed to take
// it (a role comes from the "Rôle" column of the Membres tab, or "patriarche" from the Discord seal).
// The server checks it on every write; the page only uses it to hide what a member may not do.

import type { ActionRegistre } from './missives'

/** Role names are compared like member names (lib/missives.ts `cle`): "Maître artisan" → 'maitreartisan'. */
export type Role = 'patriarche' | 'maitreartisan' | (string & {})

/** null = every member of the caravan; otherwise the roles allowed (any one is enough). */
export const ROLES_REQUIS: Record<ActionRegistre, Role[] | null> = {
  missive: null, // later perhaps ['patriarche']
  releve: null,
  depot: null,
  fabrication: null,
  cloture: null, // deliver or give up a missive; later perhaps ['patriarche']
  recette: null, // later perhaps ['maitreartisan', 'patriarche']
  ressource: null, // later perhaps ['maitreartisan', 'patriarche']
  vente: null, // a recipe's product added to the catalogue; later perhaps ['patriarche']
  usage: null, // which recipe of a product is the usual one
  choix: null, // a missive's recipe for one of its items
  deplacer: null, // an article of the catalogue moved to another chapter
  livre: null, // an article and its recipe moved to the Livre d'ombre (or back); later perhaps ['patriarche']
  retirer: null, // an article taken out of the catalogue; later perhaps ['patriarche']
  versement: null, // the caravan's share of a sale marked as handed over; later ['patriarche']
}

export function peut(action: ActionRegistre, roles: Role[]): boolean {
  const requis = ROLES_REQUIS[action]
  return requis === null || requis.some((r) => roles.includes(r))
}

export function droitsDe(roles: Role[]): Record<ActionRegistre, boolean> {
  return Object.fromEntries(Object.keys(ROLES_REQUIS).map((a) => [a, peut(a as ActionRegistre, roles)])) as Record<ActionRegistre, boolean>
}
