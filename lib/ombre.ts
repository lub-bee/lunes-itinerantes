// The « Livre d'ombre »: the caravan's secret book, opened by five clicks on « Honnêteté » in its motto.
// Every text of the shadow book lives here (easy to replace); its goods and recipes are the catalogue's
// and the recipes' rows whose « Livre » column says « Ombre ».

import type { Article, PageChapitre, PageMetier, PageOmbre, Partie } from './types'

/** The motto, by day, then in the shadow (each word in its slot). */
export const DEVISE_JOUR = ['Fidélité', 'Honnêteté', 'Septims'] as const
export const DEVISE_OMBRE = ['Septims', 'Septims', 'Septims'] as const
/** The word to click (its index in the motto), and how many clicks, at most this far apart (ms). */
export const MOT_SECRET = 1
export const CLICS_SECRET = 5
export const DELAI_CLICS = 3000

/** The memo page the sequence turns to (content/pense-betes/02-ombre-de-la-caravane.md). */
export const PAGE_DEVISE = 'note-ombre-de-la-caravane'

/** A « Livre » cell that sends a row to the shadow book (« Ombre », « ombre », « Livre d'ombre »…). */
export const estOmbre = (v: unknown) => /ombre|shadow/i.test(String(v ?? ''))

/**
 * Writes to the shadow book. The sheet's script does not yet know the « Livre » column (it would write a
 * regular row, shown in the day book): until it does (v3l), the server refuses them in character.
 */
export const OMBRE_ECRITURE = true

export const TEXTES = {
  surtitre: 'Livre d’ombre',
  titre: 'Caravane de l’Ombre',
  titreEn: 'The Caravan’s Shadow',
  maxime: 'Celui qui voit dans l’ombre est puissant à la lumière.',
  intro:
    'Ce que le jour achète au prix du marché, l’ombre le revend au prix du silence. Ce livre ne s’ouvre qu’à qui a su lire la devise à l’envers.',
  /** The way out of the shadow book (a link at the foot of its first page and above the book; the inverted emblem too). */
  sortir: 'Quitter les ombres',
  enseignements: {
    titre: 'Ombre',
    intro:
      'Ne demande jamais d’où vient la marchandise ; demande seulement ce qu’elle vaut, et à qui elle manque. Ce qui s’écrit ici ne se répète pas au grand jour.',
    // Placeholder maxims: replace freely.
    lecons: [
      'Le vrai prix se dit à voix basse.',
      'Une dette rappelée deux fois se paie double.',
      'Ce que la garde n’a pas vu, la caravane ne l’a pas vendu.',
    ],
  },
  marchandises: {
    titre: 'Marchandises de l’ombre',
    titreEn: 'Shadow Goods',
    intro: 'Ce qui ne s’étale pas sur l’étal : le skooma, le fromage de mammouth et tout ce que la garde aimerait trouver.',
    vide: 'Aucune marchandise de l’ombre n’est encore consignée.',
  },
  recettes: {
    titre: 'Recettes de l’ombre',
    titreEn: 'Shadow Recipes',
    intro: 'Ce qui se distille à l’abri des lanternes. Chaque recette lue ici s’oublie au matin.',
    vide: 'Aucune recette de l’ombre n’est encore consignée.',
  },
  refus: 'Le scribe de l’ombre n’a pas encore d’encre pour ce registre : qu’on recopie le script du grimoire qui connaît le livre d’ombre.',
}

export const PARTIE_OMBRE: Partie = { id: 'ombre', titre: 'Livre d’ombre', court: 'Ombre', couleur: '#c8101c', icone: 'hood' }

/** The shadow book's three pages, in tab order: « Caravane de l'Ombre » and its « Ombre » section first (it opens there), then Marchandises, Recettes. */
export function pagesOmbre(articles: Article[]): [PageOmbre, PageChapitre, PageMetier] {
  const marchandises: PageChapitre = {
    type: 'chapitre',
    id: 'ombre-marchandises',
    partie: 'ombre',
    titre: TEXTES.marchandises.titre,
    titreEn: TEXTES.marchandises.titreEn,
    court: 'Marchandises',
    icone: 'swap-bag',
    intro: TEXTES.marchandises.intro,
    articles,
    vide: TEXTES.marchandises.vide,
  }
  const recettes: PageMetier = {
    type: 'metier',
    id: 'ombre-recettes',
    partie: 'ombre',
    metier: '',
    ombre: true,
    intro: TEXTES.recettes.intro,
    titre: TEXTES.recettes.titre,
    titreEn: TEXTES.recettes.titreEn,
    court: 'Recettes',
    icone: 'poison-bottle',
  }
  const enseignements: PageOmbre = { type: 'ombre', id: 'ombre', partie: 'ombre', titre: TEXTES.titre, titreEn: TEXTES.titreEn, court: 'Ombre', icone: 'evil-eyes' }
  return [enseignements, marchandises, recettes]
}

export const ICONES_OMBRE = ['hood', 'evil-eyes', 'swap-bag', 'poison-bottle']
