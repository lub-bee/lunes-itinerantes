/** A craft's key (lib/metiers.ts: 'alchimiste', 'chasseur'…, 'divers' when none is written). */
export type Artisan = string

export type Article = {
  id: string
  fr: string
  en: string
  prod: number | null
  min: number | null
  max: number | null
  artisan: Artisan
  note: string
  /** Sold by lot (Catalogues « Lot »: e.g. 80 arrows to the quiver); null: not a lot. */
  lot?: number | null
  /** In the shadow book (Catalogues « Livre » = Ombre): hidden from the day book, shown only in the Livre d'ombre. */
  ombre?: boolean
}

export type PartieId = 'sommaire' | 'marchandises' | 'atelier' | 'missives' | 'missions' | 'tresor' | 'caravane' | 'ombre'

export type Partie = { id: PartieId; titre: string; court: string; couleur: string; icone: string }

/**
 * `icone` is a game-icons.net name, resolved to its SVG body in `Livre.icones`. `titreEn`: the English title shown
 * in italics under the page's title (fixed titles only; a missive's title, written by a member, has none).
 */
type Base = { id: string; partie: PartieId; titre: string; court: string; icone: string; titreEn?: string }

/** `citation`: closing quote at the foot of the right page. */
export type PageSommaire = Base & { type: 'sommaire'; citation: string }
/** `vide`: what the page says when it holds no article (the shadow book's chapter). */
export type PageChapitre = Base & { type: 'chapitre'; titreEn: string; intro: string; articles: Article[]; vide?: string }
/** `citation` / `citationAuteur`: optional saying under the memo's summary, on the left page. */
export type PageNote = Base & { type: 'note'; resume: string; auteur: string; citation: string; citationAuteur: string; html: string; texte: string }
export type PageAvenir = Base & { type: 'avenir'; intro: string; attente: string; citation: string }

/** Missives book: the list (static), one page per missive (added by the page once the registre is read), the chest, the workshop. */
export type PageMissives = Base & { type: 'missives'; intro: string; citation: string }
/** `close`: delivered or given up — still a page, but no side tab. */
/** One craft of the workshop and its recipes (added by the page from the Recettes tab). */
/** `ombre`: the shadow book's recipes page (every recipe with « Livre » = Ombre, whatever its craft). */
export type PageMetier = Base & { type: 'metier'; metier: string; ombre?: boolean; intro?: string }

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
/** The shadow book's first spread: the section « Caravane de l'Ombre » and its « Enseignements » (lib/ombre.ts). */
export type PageOmbre = Base & { type: 'ombre' }
/** The signed member's sales (sealed orders whose seller is them), in the Marchandises part, after the chapters. */
export type PageVentes = Base & { type: 'ventes'; intro: string }

/** The missions (prototype, lib/missions.ts): the call for missions (open ones, the member's own), their points. */
export type PageMissions = Base & { type: 'missions'; intro: string; citation: string }
export type PagePoints = Base & { type: 'points'; intro: string }
/** The Patriarch's table: the demands for merchandise, every member's points, the pondération (open to all for now). */
export type PagePatriarche = Base & { type: 'patriarche'; vue: 'demandes' | 'points' | 'ponderation'; intro: string }

/** The Livre du Trésor (the pay, lib/paie.ts): the week, the invoices, the events, the closings, the settings. */
export type PageTresor = Base & { type: 'tresor'; vue: 'semaine' | 'factures' | 'evenements' | 'clotures' | 'reglages'; intro: string }

export type PageDivinite = Base & { type: 'divinite'; divinite: string }
export type PagePoemes = Base & { type: 'poemes'; divinite: string }

export type Page = PageExLibris | PageSommaire | PageChapitre | PageNote | PageAvenir | PageMissives | PageMissive | PageMetier | PageCaravane | PageCoffre | PageAtelier | PageDivinite | PagePoemes | PageColophon | PageVentes | PageOmbre | PageMissions | PagePoints | PagePatriarche | PageTresor

/**
 * `caches`: the articles of hidden chapters (content/chapitres.json « masque »), with their chapter id.
 * `ombre`: the shadow book's articles (« Livre » = Ombre), shown only in the Livre d'ombre.
 */
export type Livre = { parties: Partie[]; pages: Page[]; consigneLe: string; icones: Record<string, string>; caches?: (Article & { chapitre: string })[]; ombre?: Article[] }
