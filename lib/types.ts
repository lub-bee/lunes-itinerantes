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

export type PartieId = 'sommaire' | 'marchandises' | 'pense-betes' | 'missives' | 'caravane'

export type Partie = { id: PartieId; titre: string; court: string; couleur: string; icone: string }

/** `icone` is a game-icons.net name, resolved to its SVG body in `Livre.icones`. */
type Base = { id: string; partie: PartieId; titre: string; court: string; icone: string }

/** `citation`: closing quote at the foot of the right page. */
export type PageSommaire = Base & { type: 'sommaire'; citation: string }
export type PageChapitre = Base & { type: 'chapitre'; titreEn: string; intro: string; articles: Article[] }
/** `citation` / `citationAuteur`: optional saying under the memo's summary, on the left page. */
export type PageNote = Base & { type: 'note'; resume: string; auteur: string; citation: string; citationAuteur: string; html: string; texte: string }
export type PageAvenir = Base & { type: 'avenir'; intro: string; attente: string; citation: string }

export type Page = PageSommaire | PageChapitre | PageNote | PageAvenir

export type Livre = { parties: Partie[]; pages: Page[]; consigneLe: string; icones: Record<string, string> }
