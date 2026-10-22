import fs from 'node:fs/promises'
import path from 'node:path'
import { marked } from 'marked'
import { parserCsv } from './csv'
import { ICONE_COPIE } from './copie'
import { ICONES_COMMANDE } from './commande'
import { ICONES_MISSIVES } from './missives'
import { ICONES_METIERS } from './metiers'
import { ICONES_RANGS } from './rangs'
import { icones } from './icones'
import { ICONES_ARTISANS, normaliser } from './recherche'
import type { Article, Artisan, Livre, Page, PageChapitre, PageNote, Partie } from './types'

const CONTENU = path.join(process.cwd(), 'content')

/** The parts of the grimoire; `titre` (« Livre de/des … ») is also the surtitle of every page of the part. */
export const PARTIES: Partie[] = [
  { id: 'sommaire', titre: 'Sommaire', court: 'Sommaire', couleur: '#8a6a1f', icone: 'open-book' },
  { id: 'marchandises', titre: 'Livre des Marchandises', court: 'Marchandises', couleur: '#8a1c12', icone: 'coins' },
  { id: 'atelier', titre: "Livre de l'Atelier", court: 'Atelier', couleur: '#2f5b3a', icone: 'cauldron' },
  { id: 'missives', titre: 'Livre des Missives', court: 'Missives', couleur: '#1f3a5f', icone: 'wax-seal' },
  { id: 'caravane', titre: 'Livre de la Caravane', court: 'Caravane', couleur: '#5a2d6b', icone: 'lynx-head' },
]

type DefChapitre = { id: string; titre: string; titreEn: string; court: string; icone?: string; intro: string }

function slug(s: string): string {
  return normaliser(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function nombre(s: string | undefined): number | null {
  // Tolerates units and symbols typed in a sheet ("25 septims", "12,5 ¤").
  const t = (s ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function artisan(s: string | undefined): Artisan {
  const n = normaliser(s ?? '')
  if (n.includes('alchim')) return 'alchimiste'
  if (n.includes('forge')) return 'forgeron'
  if (n.includes('coutur')) return 'couturier'
  return 'divers'
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
        artisan: artisan(l[i.artisan]),
        note: (l[i.note] ?? '').trim(),
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
export async function chargerArticles(): Promise<Article[]> {
  return lireArticles(await lireCatalogue())
}

export async function chargerLivre(): Promise<Livre> {
  const defs = JSON.parse(await fs.readFile(path.join(CONTENU, 'chapitres.json'), 'utf8')) as DefChapitre[]
  const articles = lireArticles(await lireCatalogue())

  const chapitres: PageChapitre[] = defs.map((d) => ({
    type: 'chapitre',
    partie: 'marchandises',
    ...d,
    icone: d.icone || 'swap-bag',
    articles: articles.filter((a) => a.chapitre === d.id),
  }))
  // Articles pointing to an unknown chapter are never lost: they land in a last chapter.
  const egares = articles.filter((a) => !defs.some((d) => d.id === a.chapitre))
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
    {
      type: 'caravane', id: 'caravane', partie: 'caravane', titre: 'La Caravane', titreEn: 'The Caravan', court: 'Caravane', icone: 'lynx-head',
      intro: 'Les membres de la Caravane des Lunes Itinérantes, et le rang que chacun tient sur la route. Touche un sceau pour lire les noms de ceux qui le portent.',
      citation: "Une caravane n'est forte que de ceux qui marchent avec elle.",
    },
    // The memos (« pense-bêtes ») live in the Caravane's book, after its roster.
    ...(await lireNotes()),
  ]

  const noms = [...PARTIES.map((p) => p.icone), ...pages.map((p) => p.icone), ...Object.values(ICONES_ARTISANS), ICONE_COPIE, ...ICONES_COMMANDE, ...ICONES_MISSIVES, ...ICONES_METIERS, ...ICONES_RANGS]
  return { parties: PARTIES, pages, consigneLe: new Date().toISOString(), icones: icones(noms) }
}
