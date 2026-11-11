// The « Livre d'ombre »: the caravan's secret book, opened by five clicks on « Honnêteté » in its motto.
// Every text of the shadow book lives here (easy to replace); its goods and recipes are the catalogue's
// and the recipes' rows whose « Livre » column says « Ombre ».

import type { Article, PageChapitre, PageMetier, PageOmbre, PageSecrets, Partie } from './types'

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
  titre: 'Les Ombres des Lunes Itinérantes',
  titreEn: 'The Shadows of the Wandering Moons',
  maxime: 'Celui qui voit dans l’ombre est puissant à la lumière.',
  /** The way out of the shadow book (a link at the foot of its first page and above the book; the inverted emblem too). */
  sortir: 'Quitter les ombres',
  /**
   * The opening page's text (left page, under the motto, with the drop cap): the shadow members' presentation, as Elijah
   * gave it (v2, 2026-11-08; its French lightly mended on 2026-11-09), signed by him.
   */
  presentation: {
    texte: 'Une caravane informée est une caravane sauvée. Les ombres vont là où personne ne va ; entendre et vendre sont leur apanage. Le savoir est une clé, et nous la posséderons.',
    toujours: 'Toujours masquées, toujours sauvages, toujours plusieurs.',
    signature: 'Elijah, Voix de la sécurité',
    /** The way to the letter (the page the members look for first). */
    transmettre: 'Transmettre un secret',
  },
  /** The opening page's right side: the teachings (v1) and the shadow book's own table of its pages. */
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
    table: 'Les pages de l’ombre',
  },
  secrets: {
    titre: 'Transmettre un secret',
    titreEn: 'Whisper a Secret',
    court: 'Transmettre',
    intro: 'Ce que tu as vu, entendu ou volé, couche-le sur une lettre et scelle-la. Seuls la Voix de la sécurité et les Patriarches en briseront le sceau ; toi seul relis ce que tu as transmis.',
    /** The button that lays the letter on the page (a note, 2026-11-11), and the same once a draft is begun. */
    ecrire: 'Écrire une lettre',
    reprendre: 'Reprendre ma lettre',
    lettre: 'Lettre à la Voix de la sécurité',
    miens: 'Mes secrets',
    miensVide: 'Tu n’as encore rien transmis à l’ombre.',
  },
  tri: {
    titre: 'Le tri',
    titreEn: 'The Sorting',
    court: 'Le tri',
    intro: 'Les plis arrivent scellés. Touche-en un, en face : brise le sceau, lis, classe ; joins ensemble ce qui parle de la même chose, corrige, ou retire ce qui ne doit plus se lire. Les plus brûlants passent devant.',
    scelles: 'Plis scellés',
    scellesVide: 'Nul pli ne t’attend : l’ombre se tait pour l’heure.',
    notes: 'Plis ouverts',
    notesVide: 'Aucun pli ouvert pour l’heure.',
  },
  archives: {
    titre: 'Archives',
    titreEn: 'The Archives',
    court: 'Archives',
    intro: 'Tout ce que l’ombre a recueilli, dans l’ordre où elle l’a reçu. Trie par urgence, interne ou externe ; cherche par un mot, une faction, une provenance, un informateur ou une date.',
    vide: 'Rien ne répond à ces filtres.',
    retirees: 'Notes retirées',
  },
  contrebande: {
    titre: 'Gestion de la contrebande',
    intro: 'Les ressources et marchandises interdites, une par ligne.',
    vide: 'La liste de la contrebande est vierge.',
    avis: 'Toutes les ressources et marchandises interdites doivent être remises à la Voix de la sécurité pour être détruites.',
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
  /** The secrets' pages before the sheet's script holds them (v3u). */
  pasPret: 'Le registre de l’ombre n’est pas encore relié : qu’on colle la v3u du script dans la feuille. D’ici là, nul secret ne s’y écrit.',
}

export const PARTIE_OMBRE: Partie = { id: 'ombre', titre: 'Livre d’ombre', court: 'Ombre', couleur: '#c8101c', icone: 'hood' }

/** Which of the secrets' pages the reader may open (lib/droits.ts: `secret`, `secretTri`, `secretArchives`). */
export type AccesOmbre = { secret: boolean; tri: boolean; archives: boolean }

/**
 * The shadow book's pages, in tab order: « Les Ombres des Lunes Itinérantes » and its « Ombre » teachings first (it opens there), then
 * « Transmettre un secret », « Le tri » (each to who may), Marchandises, Recettes, and « Archives » last (its tab apart, at the foot).
 */
export function pagesOmbre(articles: Article[], acces: AccesOmbre = { secret: false, tri: false, archives: false }): (PageOmbre | PageSecrets | PageChapitre | PageMetier)[] {
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
  const secret = (vue: PageSecrets['vue'], t: { titre: string; titreEn: string; court: string; intro: string }, icone: string): PageSecrets => ({
    type: 'secrets',
    id: `ombre-${vue}`,
    partie: 'ombre',
    vue,
    titre: t.titre,
    titreEn: t.titreEn,
    court: t.court,
    icone,
    intro: t.intro,
  })
  return [
    enseignements,
    ...(acces.secret ? [secret('transmettre', TEXTES.secrets, 'envelope')] : []),
    ...(acces.tri ? [secret('tri', TEXTES.tri, 'wax-seal')] : []),
    marchandises,
    recettes,
    // Last, set apart at the foot of the tabs (2026-11-11).
    ...(acces.archives ? [secret('archives', TEXTES.archives, 'archive-research')] : []),
  ]
}

export const ICONES_OMBRE = ['hood', 'evil-eyes', 'swap-bag', 'poison-bottle', 'envelope', 'wax-seal', 'archive-research', 'cancel']
