import { NextResponse, type NextRequest } from 'next/server'
import { identite, type Identite } from '@/lib/identite'
import { peut } from '@/lib/droits'
import { chargerArticles } from '@/lib/livre'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'
import {
  cle,
  contributions,
  evaluateur,
  indexRecettes,
  partager,
  rejouer,
  texteCycle,
  trouverCycle,
  type ActionRegistre,
  type DonneesRegistre,
  type Recette,
} from '@/lib/missives'

// Missives, the Missive chest, recipes and resources. GET: what the page needs (never the members'
// names, only how many they are). POST { action, ... }: one write, made in the name of the member
// who signed (lib/identite.ts) — never a name sent by the page — after the permission hook
// (lib/droits.ts); answers with the fresh data.

export const dynamic = 'force-dynamic'

type Lu = Awaited<ReturnType<typeof lireRegistre>>

const refus = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

const VIDE: DonneesRegistre = { relie: false, recettes: [], ressources: [], missives: [], mouvements: [], nbMembres: 0 }

/** The page's view: shares paid to members who brought nothing are summed up, not named. */
function vue(lu: Lu): DonneesRegistre {
  const contributeurs = new Map<string, Set<string>>()
  for (const m of lu.mouvements) {
    if (m.type !== 'dépôt' && m.type !== 'fabrication') continue
    const s = contributeurs.get(m.missive) ?? new Set()
    s.add(cle(m.membre))
    contributeurs.set(m.missive, s)
  }
  return {
    relie: true,
    recettes: lu.recettes,
    ressources: lu.ressources,
    missives: lu.missives,
    mouvements: lu.mouvements.filter((m) => m.type !== 'partage' || contributeurs.get(m.missive)?.has(cle(m.membre))),
    nbMembres: lu.membres.length,
  }
}

export async function GET() {
  if (!registreRelie()) return NextResponse.json({ ok: true, donnees: VIDE })
  try {
    return NextResponse.json({ ok: true, donnees: vue(await lireRegistre()) })
  } catch (e) {
    console.error('[registre] read failed', e)
    return refus("Le registre des missives reste fermé pour l'heure : le coursier n'a pas pu l'ouvrir.", 502)
  }
}

/* ───────────────────────── Reading what the page sends ───────────────────────── */

class Refus extends Error {}
const non = (message: string): never => {
  throw new Refus(message)
}

const mot = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function entier(v: unknown, min: number, max: number, quoi: string): number {
  const n = Number(String(v ?? '').replace(',', '.'))
  if (!Number.isInteger(n) || n < min || n > max) non(`${quoi} : un nombre entier, de ${min} à ${max}, est attendu.`)
  return n
}

function nombreOuVide(v: unknown, max: number, quoi: string): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > max) non(`${quoi} : la valeur est illisible.`)
  return Math.round(n * 1000) / 1000
}

function liste(v: unknown, max: number, quoi: string): Record<string, unknown>[] {
  if (!Array.isArray(v) || !v.length) non(`${quoi} : rien n'est inscrit.`)
  const l = v as unknown[]
  if (l.length > max) non(`${quoi} : trop de lignes pour un seul feuillet.`)
  return l.map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
}

/** Every name the registre knows (catalogue, recipes and their ingredients, resources, the chest). */
function nomsConnus(lu: Lu, articles: { fr: string; en: string }[]): Map<string, string> {
  const res = new Map<string, string>()
  const ajouter = (n: string) => n && !res.has(cle(n)) && res.set(cle(n), n)
  articles.forEach((a) => ajouter(a.fr))
  lu.recettes.forEach((r) => {
    ajouter(r.produit)
    r.ingredients.forEach((i) => ajouter(i.nom))
  })
  lu.ressources.forEach((r) => ajouter(r.nom))
  rejouer(lu.mouvements).stock.forEach((s) => ajouter(s.nom))
  articles.forEach((a) => a.en && !res.has(cle(a.en)) && res.set(cle(a.en), a.fr))
  return res
}

const horodatage = () => new Date().toISOString()

function numero(prefixe: string): string {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .replace(/-/g, '')
  const hasard = Array.from(crypto.getRandomValues(new Uint8Array(3)), (o) => o.toString(36).padStart(2, '0')).join('').toUpperCase()
  return `${prefixe}-${jour}-${hasard.slice(0, 4)}`
}

const signee = (q: number) => (q > 0 ? `+${q}` : String(q))

/* ───────────────────────── Writes ───────────────────────── */

type Ecriture = { action: ActionRegistre; charge: Record<string, unknown>; message: string }

async function preparer(action: ActionRegistre, b: Record<string, unknown>, lu: Lu, qui: Identite): Promise<Ecriture> {
  const articles = await chargerArticles()
  const noms = nomsConnus(lu, articles)
  const nommer = (v: unknown, quoi: string) => {
    const n = mot(v, 120)
    if (!n) non(`${quoi} : un nom manque.`)
    return noms.get(cle(n)) ?? n
  }
  const missiveOuverte = () => {
    const m = lu.missives.find((x) => x.numero === mot(b.missive, 40))
    if (!m) non('Cette missive est introuvable dans le registre.')
    if (m!.statut === 'close') non('Cette missive est déjà close : son registre ne bouge plus.')
    return m!
  }
  const quand = horodatage()

  switch (action) {
    case 'missive': {
      const titre = mot(b.titre, 120)
      if (!titre) non("Une missive sans titre ne s'écrit pas.")
      const produits = new Map<string, string>()
      articles.forEach((a) => produits.set(cle(a.fr), a.fr))
      lu.recettes.forEach((r) => produits.has(cle(r.produit)) || produits.set(cle(r.produit), r.produit))
      articles.forEach((a) => a.en && !produits.has(cle(a.en)) && produits.set(cle(a.en), a.fr))
      const lignes = new Map<string, { produit: string; quantite: number }>()
      for (const l of liste(b.lignes, 40, 'Les ouvrages demandés')) {
        const tape = mot(l.produit, 120)
        if (!tape) continue
        const produit = produits.get(cle(tape)) ?? non(`Khajiit ne connaît nul ouvrage nommé « ${tape} » : qu'on consigne d'abord sa recette.`)
        const quantite = entier(l.quantite, 1, 99999, `Quantité de ${produit}`)
        const deja = lignes.get(cle(produit))
        lignes.set(cle(produit), { produit, quantite: (deja?.quantite ?? 0) + quantite })
      }
      if (!lignes.size) non("Une missive sans ouvrage demandé ne s'écrit pas.")
      const n = numero('M')
      return {
        action,
        charge: {
          missive: { numero: n, horodatage: quand, titre, commanditaire: mot(b.commanditaire, 120), echeance: mot(b.echeance, 80), membre: qui.nom, lignes: [...lignes.values()] },
        },
        message: `La missive « ${titre} » est scellée dans le registre (n° ${n}).`,
      }
    }

    case 'releve': {
      const { stock } = rejouer(lu.mouvements)
      const vus = new Set<string>()
      const mouvements = liste(b.lignes, 200, 'Le relevé').flatMap((l) => {
        const objet = nommer(l.objet, 'Un objet du relevé')
        if (vus.has(cle(objet))) return []
        vus.add(cle(objet))
        const compte = entier(l.compte, 0, 1_000_000, `Compte de ${objet}`)
        const attendu = stock.get(cle(objet))?.qte ?? 0
        const ecart = compte - attendu
        return [{ horodatage: quand, action: '', missive: mot(b.missive, 40), membre: qui.nom, objet, quantite: compte, note: `attendu ${attendu}${ecart ? `, écart ${signee(ecart)}` : ', juste'}` }]
      })
      const ecarts = mouvements.filter((m) => !m.note.endsWith('juste')).length
      return {
        action,
        charge: { mouvements },
        message: ecarts
          ? `Relevé consigné. ${ecarts} écart${ecarts > 1 ? 's' : ''} avec le registre : l'enquête est ouverte.`
          : 'Relevé consigné : le coffre et le registre disent la même chose.',
      }
    }

    case 'depot': {
      const m = missiveOuverte()
      const note = mot(b.note, 200)
      const mouvements = liste(b.lignes, 40, 'Le dépôt').map((l) => {
        const objet = nommer(l.objet, 'Un objet déposé')
        return { horodatage: quand, action: '', missive: m.numero, membre: qui.nom, objet, quantite: entier(l.quantite, 1, 1_000_000, `Quantité de ${objet}`), note }
      })
      return { action, charge: { mouvements }, message: `Dépôt consigné au coffre, au crédit de ${qui.nom}.` }
    }

    case 'fabrication': {
      const m = missiveOuverte()
      const note = mot(b.note, 200)
      const id = numero('A')
      const sorties = liste(b.sorties, 10, 'Les ouvrages façonnés').map((l) => {
        const objet = nommer(l.objet, 'Un ouvrage façonné')
        return { horodatage: quand, action: id, missive: m.numero, membre: qui.nom, objet, quantite: entier(l.quantite, 1, 1_000_000, `Quantité de ${objet}`), note }
      })
      const entrees = (Array.isArray(b.entrees) ? liste(b.entrees, 40, 'Les matières prises') : []).flatMap((l) => {
        const objet = nommer(l.objet, 'Une matière prise')
        const q = entier(l.quantite, 0, 1_000_000, `Quantité de ${objet}`)
        return q ? [{ horodatage: quand, action: id, missive: m.numero, membre: qui.nom, objet, quantite: -q, note }] : []
      })
      return { action, charge: { mouvements: [...entrees, ...sorties] }, message: `Façonnage consigné : ${sorties.map((s) => `${s.quantite} ${s.objet}`).join(', ')} au coffre.` }
    }

    case 'livraison': {
      const m = missiveOuverte()
      const demandes = new Map(m.lignes.map((l) => [cle(l.produit), l.produit]))
      const note = mot(b.note, 200)
      const mouvements = liste(b.lignes, 40, 'La livraison').flatMap((l) => {
        const tape = mot(l.objet, 120)
        const objet = demandes.get(cle(tape)) ?? non(`« ${tape} » n'est pas demandé par cette missive.`)
        const q = entier(l.quantite, 0, 1_000_000, `Quantité de ${objet}`)
        return q ? [{ horodatage: quand, action: '', missive: m.numero, membre: qui.nom, objet, quantite: -q, note }] : []
      })
      if (!mouvements.length) non('Rien à livrer sur ce feuillet.')
      return { action, charge: { mouvements }, message: `Livraison consignée : les ouvrages ont quitté le coffre pour ${m.commanditaire || 'le commanditaire'}.` }
    }

    case 'cloture': {
      const m = missiveOuverte()
      const recompense = nombreOuVide(b.recompense, 1e9, 'La récompense') ?? non('Inscris la récompense reçue, même nulle.')
      const partCommune = nombreOuVide(b.partCommune, 100, 'La part commune') ?? non('Inscris la part commune, en centièmes.')
      const valeur = evaluateur(articles, lu.recettes, lu.ressources)
      const p = partager(recompense, partCommune, lu.membres.map((x) => x.nom), contributions(m.numero, lu.mouvements, valeur))
      const parMembre = new Map<string, { membre: string; base: number; merite: number }>()
      for (const x of lu.membres) parMembre.set(cle(x.nom), { membre: x.nom, base: p.base, merite: 0 })
      for (const x of p.parts) parMembre.set(cle(x.membre), { membre: x.membre, base: x.base, merite: x.merite })
      const partage = [...parMembre.values()]
        .filter((x) => x.base + x.merite > 0)
        .map((x) => ({ membre: x.membre, montant: x.base + x.merite, note: `part commune ${x.base} + mérite ${x.merite}` }))
      return {
        action,
        charge: { cloture: { numero: m.numero, action: numero('A'), horodatage: quand, membre: qui.nom, recompense: p.recompense, partCommune: p.partCommune, partage } },
        message: `La missive est close : ${p.recompense} septims partagés entre ${partage.length} membre${partage.length > 1 ? 's' : ''}.`,
      }
    }

    case 'recette': {
      const produit = mot(b.produit, 120) || non('Le nom de l’ouvrage manque.')
      const ancien = mot(b.ancienProduit, 120)
      const rendement = entier(b.rendement ?? 1, 1, 1000, 'Le rendement')
      const vus = new Set<string>()
      const ingredients = (Array.isArray(b.ingredients) ? (b.ingredients as Record<string, unknown>[]).slice(0, 30) : []).flatMap((i) => {
        const nom = mot(i?.nom, 120)
        if (!nom) return []
        const canon = noms.get(cle(nom)) ?? nom
        if (cle(canon) === cle(produit)) non(`« ${produit} » ne peut entrer dans sa propre recette.`)
        if (vus.has(cle(canon))) non(`« ${canon} » est inscrit deux fois.`)
        vus.add(cle(canon))
        const q = nombreOuVide(i?.quantite, 100000, `Quantité de ${canon}`) || non(`Quantité de ${canon} : un nombre plus grand que zéro est attendu.`)
        return [{ ingredient: canon, quantite: q }]
      })
      const autres = lu.recettes.filter((r) => cle(r.produit) !== cle(produit) && (!ancien || cle(r.produit) !== cle(ancien)))
      const nouvelle: Recette = { produit, rendement, artisan: mot(b.artisan, 40), note: mot(b.note, 200), ingredients: ingredients.map((i) => ({ nom: i.ingredient, quantite: i.quantite })) }
      const cycle = trouverCycle(produit, indexRecettes([...autres, nouvelle]))
      if (cycle) non(texteCycle(cycle))
      return {
        action,
        charge: { recette: { produit, ancienProduit: ancien || undefined, rendement, artisan: nouvelle.artisan, note: nouvelle.note, ingredients } },
        message: ingredients.length ? `La recette de ${produit} est consignée.` : `La recette de ${produit} est effacée du registre.`,
      }
    }

    case 'ressource': {
      const nom = mot(b.nom, 120) || non('Le nom de la ressource manque.')
      const ancien = mot(b.ancienNom, 120)
      const ressource = { nom, ancienNom: ancien || undefined, en: mot(b.en, 120), categorie: mot(b.categorie, 60), valeur: nombreOuVide(b.valeur, 1e7, 'La valeur'), note: mot(b.note, 200) }
      return { action, charge: { ressource }, message: `La ressource ${nom} est inscrite au registre.` }
    }
  }
}

const ACTIONS: ActionRegistre[] = ['missive', 'releve', 'depot', 'fabrication', 'livraison', 'cloture', 'recette', 'ressource']

export async function POST(req: NextRequest) {
  if (!registreRelie()) return refus("Le registre des missives n'est pas encore relié au grimoire.", 503)
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const action = b.action as ActionRegistre
  if (!ACTIONS.includes(action)) return refus('Khajiit ne comprend pas ce que tu demandes au registre.')

  let lu: Lu
  try {
    lu = await lireRegistre()
  } catch (e) {
    console.error('[registre] read failed', e)
    return refus("Le registre reste fermé pour l'heure : rien n'a été consigné.", 502)
  }
  const qui = await identite(req.cookies, lu.membres)
  if (!qui) return refus("Signe d'abord de ton nom : seul un membre inscrit au registre de la caravane peut y écrire.", 401)
  if (!peut(action, qui.roles)) return refus("Cette page du registre est réservée à d'autres pattes que les tiennes.", 403)

  let e: Ecriture
  try {
    e = await preparer(action, b, lu, qui)
  } catch (err) {
    if (err instanceof Refus) return refus(err.message)
    throw err
  }
  try {
    await ecrireRegistre(e.action, e.charge)
  } catch (err) {
    console.error(`[registre] ${action} refused by the script`, err)
    return refus("Le registre a refusé le feuillet. Rien n'a été consigné : réessaie plus tard.", 502)
  }
  let donnees: DonneesRegistre | null = null
  try {
    donnees = vue(await lireRegistre())
  } catch {
    donnees = null
  }
  return NextResponse.json({ ok: true, message: e.message, donnees })
}
