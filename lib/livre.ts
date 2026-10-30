import fs from 'node:fs/promises'
import path from 'node:path'
import { marked } from 'marked'
import { parserCsv } from './csv'
import { ICONE_COPIE } from './copie'
import { ICONES_COMMANDE } from './commande'
import { ICONES_MISSIVES } from './missives'
import { ICONES_METIERS } from './metiers'
import { ICONES_RANGS } from './rangs'
import { ICONES_ACTIONS } from './actions'
import { icones } from './icones'
import { COLOPHON } from './credits'
import { normaliser, slug } from './recherche'
import { artisanDe } from './metiers'
import { estOmbre, ICONES_OMBRE } from './ombre'
import { ICONES_MISSIONS } from './missions'
import { ICONES_PAIE } from './paie'
import type { Article, Livre, Page, PageChapitre, PageNote, Partie } from './types'

const CONTENU = path.join(process.cwd(), 'content')

/** The parts of the grimoire; `titre` (« Livre de/des … ») is also the surtitle of every page of the part. */
export const PARTIES: Partie[] = [
  { id: 'sommaire', titre: 'Sommaire', court: 'Sommaire', couleur: '#8a6a1f', icone: 'open-book' },
  { id: 'marchandises', titre: 'Livre des Marchandises', court: 'Marchandises', couleur: '#8a1c12', icone: 'coins' },
  // id kept 'atelier' (links, saved state); shown as the Livre des Recettes.
  { id: 'atelier', titre: 'Livre des Recettes', court: 'Recettes', couleur: '#2f5b3a', icone: 'cauldron' },
  { id: 'missives', titre: 'Livre des Missives', court: 'Missives', couleur: '#1f3a5f', icone: 'wax-seal' },
  // The missions (prototype, branch `missions`).
  { id: 'missions', titre: 'Livre des Missions', court: 'Missions', couleur: '#8a4b12', icone: 'treasure-map' },
  // The pay (prototype, branch `missions`).
  { id: 'tresor', titre: 'Livre du Trésor', court: 'Trésor', couleur: '#1f5a56', icone: 'open-treasure-chest' },
  { id: 'caravane', titre: 'Livre de la Caravane', court: 'Caravane', couleur: '#5a2d6b', icone: 'lynx-head' },
]

/** `masque`: a chapter kept in the catalogue (prices, values, the sheet's ids) but not shown in the book (no page, no side tab). */
type DefChapitre = { id: string; titre: string; titreEn: string; court: string; icone?: string; intro: string; masque?: boolean }


function nombre(s: string | undefined): number | null {
  // Tolerates units and symbols typed in a sheet ("25 septims", "12,5 ¤").
  const t = (s ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}


async function lireCatalogue(): Promise<string> {
  const url = process.env.CATALOGUE_CSV_URL
  if (url) {
    try {
      const rep = await fetch(url, { next: { revalidate: 300 } })
      if (rep.ok) return await rep.text()
      console.error(`[catalogue] ${url} → HTTP ${rep.status}, falling back to content/marchandises.csv`)
    } catch (e) {
      console.error('[catalogue] sheet unreachable, falling back to content/marchandises.csv', e)
    }
  }
  return fs.readFile(path.join(CONTENU, 'marchandises.csv'), 'utf8')
}

/**
 * Accepted header names per column (compared without case, accents or punctuation). The sheet of
 * the caravan's owner names its columns in plain French ("Détail", "Prix de prod", "Prix mini",
 * "Prix idéal"); the original `marchandises.csv` names stay valid. A header that matches no alias
 * exactly may still start with one ("Prix idéal (septims)"). Documented in README.md.
 */
export const ALIAS_COLONNES = {
  chapitre: ['chapitre', 'categorie', 'rubrique', 'section'],
  fr: ['fr', 'article', 'articles', 'detail', 'details', 'designation', 'nom', 'objet', 'produit'],
  en: ['en', 'anglais', 'english', 'nom anglais', 'nom en', 'article en', 'article anglais', 'detail en', 'designation en'],
  prod: ['prod', 'prix de prod', 'prix prod', 'prix de production', 'cout', 'cout de prod', 'cout de production'],
  min: ['min', 'mini', 'minimum', 'prix mini', 'prix minimum', 'prix min', 'plancher', 'prix plancher'],
  max: ['max', 'maxi', 'ideal', 'prix ideal', 'prix max', 'prix maxi', 'plafond', 'prix plafond'],
  artisan: ['artisan', 'metier', 'atelier'],
  note: ['note', 'notes', 'remarque', 'commentaire'],
  lot: ['lot', 'par', 'par lot', 'unites par lot', 'taille du lot', 'contenance'],
  // « Régulier » (or empty) / « Ombre »: which book shows the article (the shadow book's goods).
  livre: ['livre', 'registre', 'book'],
} as const

type Colonne = keyof typeof ALIAS_COLONNES

const cle = (s: string) => normaliser(s).replace(/[^a-z0-9]+/g, ' ').trim()

/** Column index of each known field (-1 when absent). Exact aliases first, then prefixes. */
function colonnes(entete: string[]): Record<Colonne, number> {
  const noms = entete.map(cle)
  const pris = new Set<number>()
  const res = {} as Record<Colonne, number>
  const champs = Object.keys(ALIAS_COLONNES) as Colonne[]
  for (const champ of champs) {
    const i = noms.findIndex((n, k) => !pris.has(k) && (ALIAS_COLONNES[champ] as readonly string[]).includes(n))
    res[champ] = i
    if (i >= 0) pris.add(i)
  }
  for (const champ of champs) {
    if (res[champ] >= 0) continue
    const alias = [...ALIAS_COLONNES[champ]].filter((a) => a.length > 2).sort((a, b) => b.length - a.length)
    const i = noms.findIndex((n, k) => !pris.has(k) && alias.some((a) => n.startsWith(`${a} `)))
    res[champ] = i
    if (i >= 0) pris.add(i)
  }
  return res
}

function lireArticles(csv: string): (Article & { chapitre: string })[] {
  const [entete = [], ...lignes] = parserCsv(csv)
  const i = colonnes(entete)
  const vus = new Set<string>()
  return lignes
    .map((l) => {
      const fr = (l[i.fr] ?? '').trim()
      const en = (l[i.en] ?? '').trim()
      let id = slug(fr || en)
      for (let n = 2; vus.has(id); n++) id = `${slug(fr || en)}-${n}`
      vus.add(id)
      return {
        id,
        chapitre: slug(l[i.chapitre] ?? ''),
        fr: fr || en,
        en: i.en < 0 ? '' : en || fr, // no English column: no English name (rather than the French one twice)
        prod: nombre(l[i.prod]),
        min: nombre(l[i.min]),
        max: nombre(l[i.max]),
        artisan: artisanDe(l[i.artisan]),
        note: (l[i.note] ?? '').trim(),
        ombre: i.livre >= 0 && estOmbre(l[i.livre]),
        lot: i.lot < 0 ? null : (() => {
          const n = Math.round(nombre(l[i.lot]) ?? 0)
          return n > 1 ? n : null
        })(),
      }
    })
    .filter((a) => a.fr)
}

function frontmatter(source: string): { meta: Record<string, string>; corps: string } {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { meta: {}, corps: source }
  const meta: Record<string, string> = {}
  for (const ligne of m[1].split(/\r?\n/)) {
    const p = ligne.indexOf(':')
    if (p > 0) meta[ligne.slice(0, p).trim()] = ligne.slice(p + 1).trim()
  }
  return { meta, corps: m[2] }
}

async function lireNotes(): Promise<PageNote[]> {
  const dossier = path.join(CONTENU, 'pense-betes')
  const fichiers = (await fs.readdir(dossier)).filter((f) => f.endsWith('.md')).sort()
  return Promise.all(
    fichiers.map(async (f) => {
      const { meta, corps } = frontmatter(await fs.readFile(path.join(dossier, f), 'utf8'))
      const titre = meta.titre || f.replace(/^\d+-|\.md$/g, '')
      return {
        type: 'note' as const,
        id: `note-${slug(f.replace(/\.md$/, '').replace(/^\d+-/, ''))}`,
        partie: 'caravane' as const,
        titre,
        titreEn: meta.titre_en || '',
        court: meta.court || titre,
        icone: meta.icone || 'scroll-unfurled',
        resume: meta.resume || '',
        auteur: meta.auteur || '',
        citation: meta.citation || '',
        citationAuteur: meta.citation_auteur || '',
        html: marked.parse(corps, { async: false }),
        texte: `${titre} ${meta.resume ?? ''} ${corps.replace(/[#*_>`\-[\]()]/g, ' ')}`,
      }
    }),
  )
}

/** Every article of the catalogue (CSV or published sheet), for the order route. */
export async function chargerArticles(): Promise<(Article & { chapitre: string })[]> {
  return lireArticles(await lireCatalogue())
}

export async function chargerLivre(): Promise<Livre> {
  const defs = JSON.parse(await fs.readFile(path.join(CONTENU, 'chapitres.json'), 'utf8')) as DefChapitre[]
  const articles = lireArticles(await lireCatalogue())

  const chapitres: PageChapitre[] = defs.filter((d) => !d.masque).map(({ masque: _masque, ...d }) => ({
    type: 'chapitre',
    partie: 'marchandises',
    ...d,
    icone: d.icone || 'swap-bag',
    articles: articles.filter((a) => a.chapitre === d.id && !a.ombre),
  }))
  // Articles pointing to an unknown chapter are never lost: they land in a last chapter.
  const egares = articles.filter((a) => !a.ombre && !defs.some((d) => d.id === a.chapitre))
  if (egares.length) {
    chapitres.push({
      type: 'chapitre', partie: 'marchandises', id: 'non-classes', titre: 'Non classés', titreEn: 'Unsorted', court: 'Non classés', icone: 'swap-bag',
      intro: "Des articles égarés, sans chapitre connu. Qu'un scribe leur trouve une place.",
      articles: egares,
    })
  }

  const pages: Page[] = [
    { type: 'sommaire', id: 'sommaire', partie: 'sommaire', titre: 'Sommaire', titreEn: 'Contents', court: 'Sommaire', icone: 'open-book',
      citation: "Un marchand sans registre est un marchand qui oublie ; un marchand qui oublie est un marchand ruiné." },
    ...chapitres,
    // The signed member's own sales (sealed orders), set apart after the chapters.
    {
      type: 'ventes', id: 'mes-ventes', partie: 'marchandises', titre: 'Mes ventes', titreEn: 'My Sales', court: 'Mes ventes', icone: 'two-coins',
      intro: 'Les bons de commande scellés à ton nom, du plus récent au plus ancien : ce que tu as vendu, à quel prix, et ce que la caravane en a tiré.',
    },
    {
      type: 'atelier', vue: 'recettes', id: 'recettes', partie: 'atelier', titre: 'Sommaire des recettes', titreEn: 'Recipe Index', court: 'Sommaire', icone: 'cauldron',
      intro: 'Les recettes des artisans, rangées par métier : ce qu’il faut pour une fournée, et ce que coûtent ses matières. Chacun peut en consigner une nouvelle ou corriger une quantité.',
    },
    {
      type: 'atelier', vue: 'matieres', id: 'matieres', partie: 'atelier', titre: 'Matières premières', titreEn: 'Raw Materials', court: 'Matières', icone: 'wheat',
      intro: 'Ce que la caravane récolte, pille, façonne ou achète, sans jamais le revendre : le prix qu’on en paie d’ordinaire, et celui auquel on achète sans hésiter.',
    },
    {
      type: 'missives', id: 'missives', partie: 'missives', titre: 'Missives', titreEn: 'Commissions', court: 'Missives', icone: 'wax-seal',
      intro: 'Les commandes confiées à la caravane : ce qu’on nous demande, ce qu’il faut réunir, et qui a porté quoi. Chaque patte qui aide est inscrite ; chaque septim gagné est partagé.',
      citation: "Ce que le client désire, Khajiit le trouve. Ce que Khajiit ne trouve pas, le client ne le désirait pas vraiment.",
    },
    {
      type: 'coffre', id: 'coffre', partie: 'missives', titre: 'Le coffre des missives', titreEn: 'The Missive Chest', court: 'Le coffre', icone: 'open-chest',
      intro: 'Tout ce qui entre dans le coffre des missives et tout ce qui en sort est écrit ici. Quand on compte le coffre, le registre dit ce qu’il attendait : un écart, et l’on enquête.',
    },
    // The missions (prototype): the call for missions and the member's points, then the Patriarch's table.
    {
      type: 'missions', id: 'missions', partie: 'missions', titre: 'L’appel aux missions', titreEn: 'The Call for Missions', court: 'Missions', icone: 'hunting-horn',
      intro: 'Ce dont la caravane a besoin, coupé en petites missions qu’on boucle en une courte veillée : une récolte, un tannage, une fournée. Prends-en une, rapporte le butin à un officier, et les points tombent dans ta bourse.',
      citation: 'Mille pattes qui portent chacune un sac vont plus loin qu’un mammouth qui porte tout.',
    },
    {
      type: 'points', id: 'mes-points', partie: 'missions', titre: 'Mes points', titreEn: 'My Points', court: 'Mes points', icone: 'laurel-crown',
      intro: 'Chaque mission accomplie inscrit ses points à ton nom. À la clôture de la semaine, la caisse se partage au prorata des points : ce qui est écrit ici, c’est ta part du butin.',
    },
    {
      type: 'patriarche', vue: 'demandes', id: 'demandes', partie: 'missions', titre: 'Les demandes du Patriarche', titreEn: 'Requests for Goods', court: 'Demandes', icone: 'throne-king',
      intro: 'Demande une marchandise, et le grimoire la découpe en missions : les matières à récolter, ce qu’il faut tanner ou distiller, les fournées à façonner. Chaque mission dit d’avance ce qu’elle rapporte.',
    },
    {
      type: 'patriarche', vue: 'points', id: 'points-caravane', partie: 'missions', titre: 'Les points de la caravane', titreEn: 'The Caravan’s Tally', court: 'Points', icone: 'podium',
      intro: 'Les points de chaque membre, ce qu’il a accompli et ce qu’il tient encore entre ses pattes. La renommée viendra plus tard ; ici, on compte.',
    },
    {
      type: 'patriarche', vue: 'ponderation', id: 'ponderation', partie: 'missions', titre: 'La pondération des efforts', titreEn: 'Weights of Effort', court: 'Pondération', icone: 'weight-scale',
      intro: 'Combien pèse une unité de chaque ressource : un brin de blé ne vaut pas une peau d’ours. Le poids taille les missions (une veillée = un budget d’effort) et partage les points des ressources au prorata de l’effort.',
    },
    // The pay (prototype): the Patriarchs' accounts, open to every member for now.
    {
      type: 'tresor', vue: 'semaine', id: 'tresor-semaine', partie: 'tresor', titre: 'La paie de la semaine', titreEn: 'The Week’s Pay', court: 'Semaine', icone: 'abacus',
      intro: 'Ce que la semaine a vendu, ce qu’elle a payé, et ce qui reste à partager : la part des Patriarches, puis chacun au prorata de ses points. La caravane ne distribue jamais plus que ce qui est entré.',
    },
    {
      type: 'tresor', vue: 'factures', id: 'factures', partie: 'tresor', titre: 'Les factures', titreEn: 'Bills', court: 'Factures', icone: 'scroll-unfurled',
      intro: 'Le loyer du camp, les uniformes, les achats de matières : tout ce que la caravane paie avant de se payer elle-même.',
    },
    {
      type: 'tresor', vue: 'evenements', id: 'evenements', partie: 'tresor', titre: 'Les événements', titreEn: 'Events', court: 'Événements', icone: 'party-flags',
      intro: 'Tombolas, jeux, soirées : chaque événement tient son propre registre — ce qui entre, ce qui sort, les lots offerts, et une petite compensation pour qui a mis la patte à la pâte.',
    },
    {
      type: 'tresor', vue: 'clotures', id: 'clotures', partie: 'tresor', titre: 'Les semaines closes', titreEn: 'Closed Weeks', court: 'Clôtures', icone: 'locked-chest',
      intro: 'Chaque semaine close est scellée telle qu’elle était : ses comptes ne bougent plus, il ne reste qu’à payer chacun.',
    },
    {
      type: 'tresor', vue: 'reglages', id: 'reglages-paie', partie: 'tresor', titre: 'Les réglages de la paie', titreEn: 'Pay Settings', court: 'Réglages', icone: 'cog',
      intro: 'La clé de partage d’une vente, la part des Patriarches, le loyer, le premier jour de la semaine. Rien n’est gravé dans la pierre : les Patriarches l’ajustent.',
    },
    {
      type: 'caravane', id: 'caravane', partie: 'caravane', titre: 'La Caravane', titreEn: 'The Caravan', court: 'Caravane', icone: 'lynx-head',
      intro: 'Les membres de la Caravane des Lunes Itinérantes, et le rang que chacun tient sur la route. Touche un sceau pour lire les noms de ceux qui le portent.',
      citation: "Une caravane n'est forte que de ceux qui marchent avec elle.",
    },
    // The memos (« pense-bêtes ») live in the Caravane's book, after its roster.
    ...(await lireNotes()),
    // The last leaf: who copied the book, and the credits (lib/credits.ts).
    { type: 'colophon', id: 'colophon', partie: 'sommaire', titre: COLOPHON.titre, titreEn: COLOPHON.titreEn, court: 'Achevé', icone: 'quill' },
  ]

  // Articles of the hidden chapters (« masque »): not in the book, but known to the sale slip, so it can
  // say where an article is and offer to move it to a chapter of the book.
  const caches = articles.filter((a) => defs.some((d) => d.masque && d.id === a.chapitre))

  const noms = [...PARTIES.map((p) => p.icone), ...pages.map((p) => p.icone), ICONE_COPIE, ...ICONES_COMMANDE, ...ICONES_MISSIVES, ...ICONES_METIERS, ...ICONES_RANGS, ...Object.values(ICONES_ACTIONS), ...ICONES_OMBRE, ...ICONES_MISSIONS, ...ICONES_PAIE]
  // The shadow book's goods, whatever their chapter (shown only in the Livre d'ombre).
  const ombre = articles.filter((a) => a.ombre)
  return { parties: PARTIES, pages, caches, ombre, consigneLe: new Date().toISOString(), icones: icones(noms) }
}
