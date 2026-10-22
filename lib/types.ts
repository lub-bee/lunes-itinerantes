export type Artisan = 'alchimiste' | 'forgeron' | 'couturier' | 'divers'

export type Article = {
  id: string
  fr: string
  en: string
  prod: number | null
  min: number | null
  max: number | null
  artisan: Artisan
  note: string
}

export type PartieId = 'sommaire' | 'marchandises' | 'atelier' | 'missives' | 'caravane'

export type Partie = { id: PartieId; titre: string; court: string; couleur: string; icone: string }

/**
 * `icone` is a game-icons.net name, resolved to its SVG body in `Livre.icones`. `titreEn`: the English title shown
 * in italics under the page's title (fixed titles only; a missive's title, written by a member, has none).
 */
type Base = { id: string; partie: PartieId; titre: string; court: string; icone: string; titreEn?: string }

/** `citation`: closing quote at the foot of the right page. */
export type PageSommaire = Base & { type: 'sommaire'; citation: string }
export type PageChapitre = Base & { type: 'chapitre'; titreEn: string; intro: string; articles: Article[] }
/** `citation` / `citationAuteur`: optional saying under the memo's summary, on the left page. */
export type PageNote = Base & { type: 'note'; resume: string; auteur: string; citation: string; citationAuteur: string; html: string; texte: string }
export type PageAvenir = Base & { type: 'avenir'; intro: string; attente: string; citation: string }

/** Missives book: the list (static), one page per missive (added by the page once the registre is read), the chest, the workshop. */
export type PageMissives = Base & { type: 'missives'; intro: string; citation: string }
/** `close`: delivered or given up — still a page, but no side tab. */
/** One craft of the workshop and its recipes (added by the page from the Recettes tab). */
export type PageMetier = Base & { type: 'metier'; metier: string }

/** The caravan's ranks drawn as a tree; touching a rank lists its members. */
export type PageCaravane = Base & { type: 'caravane'; intro: string; citation: string }

export type PageMissive = Base & { type: 'missive'; numero: string; close: boolean }
export type PageCoffre = Base & { type: 'coffre'; intro: string }
/** The workshop: `vue` « recettes » (every recipe) or « matieres » (the raw materials' buying ledger). */
export type PageAtelier = Base & { type: 'atelier'; vue: 'recettes' | 'matieres'; intro: string }

/** The bookplate pasted inside the cover: the reader signs it with their name (added by the page when the registre is linked). */
export type PageExLibris = Base & { type: 'exlibris' }

/**
 * A god signed the ex-libris (lib/oeufs.ts): a blank page that bows, then the poems sung to that god.
 * Not chapters: no side tab, not in the contents, no folio; turning back returns to the ex-libris.
 */
/** The book's last leaf: colophon and credits (lib/credits.ts). Back matter: no chapter; on it, its own side tab only. */
export type PageColophon = Base & { type: 'colophon' }

export type PageDivinite = Base & { type: 'divinite'; divinite: string }
export type PagePoemes = Base & { type: 'poemes'; divinite: string }

export type Page = PageExLibris | PageSommaire | PageChapitre | PageNote | PageAvenir | PageMissives | PageMissive | PageMetier | PageCaravane | PageCoffre | PageAtelier | PageDivinite | PagePoemes | PageColophon

export type Livre = { parties: Partie[]; pages: Page[]; consigneLe: string; icones: Record<string, string> }
