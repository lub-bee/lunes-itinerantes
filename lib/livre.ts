import fs from 'node:fs/promises'
import path from 'node:path'
import { marked } from 'marked'
import { parserCsv } from './csv'
import { icones } from './icones'
import { ICONES_ARTISANS, normaliser } from './recherche'
import type { Article, Artisan, Livre, Page, PageChapitre, PageNote, Partie } from './types'

const CONTENU = path.join(process.cwd(), 'content')

export const PARTIES: Partie[] = [
  { id: 'sommaire', titre: 'Sommaire', court: 'Sommaire', couleur: '#8a6a1f', icone: 'open-book' },
  { id: 'marchandises', titre: 'Livre des Marchandises', court: 'Marchandises', couleur: '#8a1c12', icone: 'coins' },
  { id: 'pense-betes', titre: 'Pense-bêtes', court: 'Pense-bêtes', couleur: '#2f5b3a', icone: 'scroll-quill' },
  { id: 'missives', titre: 'Missives en cours', court: 'Missives', couleur: '#1f3a5f', icone: 'wax-seal' },
  { id: 'caravane', titre: 'La Caravane', court: 'Caravane', couleur: '#5a2d6b', icone: 'lynx-head' },
]

type DefChapitre = { id: string; titre: string; titreEn: string; court: string; icone?: string; intro: string }

function slug(s: string): string {
  return normaliser(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function nombre(s: string | undefined): number | null {
  const t = (s ?? '').replace(/\s/g, '').replace(',', '.')
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

function lireArticles(csv: string): (Article & { chapitre: string })[] {
  const [entete, ...lignes] = parserCsv(csv)
  const col = (nom: string) => entete.findIndex((c) => normaliser(c.trim()) === nom)
  const i = { chapitre: col('chapitre'), fr: col('fr'), en: col('en'), prod: col('prod'), min: col('min'), max: col('max'), artisan: col('artisan'), note: col('note') }
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
        en: en || fr,
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
        partie: 'pense-betes' as const,
        titre,
        court: meta.court || titre,
        icone: meta.icone || 'scroll-unfurled',
        resume: meta.resume || '',
        auteur: meta.auteur || '',
        html: marked.parse(corps, { async: false }),
        texte: `${titre} ${meta.resume ?? ''} ${corps.replace(/[#*_>`\-[\]()]/g, ' ')}`,
      }
    }),
  )
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
    { type: 'sommaire', id: 'sommaire', partie: 'sommaire', titre: 'Sommaire', court: 'Sommaire', icone: 'open-book' },
    ...chapitres,
    ...(await lireNotes()),
    {
      type: 'avenir', id: 'missives', partie: 'missives', titre: 'Missives en cours', court: 'Missives', icone: 'wax-seal',
      intro: 'Les commandes de la caravane : ingrédients à dénicher, objets à fabriquer, curiosités à rechercher.',
      attente: "L'encre de ce chapitre n'est pas encore sèche. Reviens à la prochaine halte, ami.",
    },
    {
      type: 'avenir', id: 'caravane', partie: 'caravane', titre: 'La Caravane', court: 'Caravane', icone: 'lynx-head',
      intro: 'Les membres de la Caravane des Lunes Itinérantes, et le rôle que chacun tient sur la route.',
      attente: 'Le scribe compte encore les moustaches. Ce registre sera bientôt rempli.',
    },
  ]

  const noms = [...PARTIES.map((p) => p.icone), ...pages.map((p) => p.icone), ...Object.values(ICONES_ARTISANS), 'padlock']
  return { parties: PARTIES, pages, consigneLe: new Date().toISOString(), icones: icones(noms) }
}
