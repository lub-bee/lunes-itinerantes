import { NextResponse, type NextRequest } from 'next/server'
import { identite, type Identite } from '@/lib/identite'
import { peut } from '@/lib/droits'
import { chargerArticles } from '@/lib/livre'
import chapitres from '@/content/chapitres.json'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'
import {
  cle,
  contributions,
  estClose,
  evaluateur,
  livres,
  PART_COMMUNE_DEFAUT,
  indexRecettes,
  choixEnTexte,
  estMatiere,
  recetteUsage,
  variantesDe,
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

const VIDE: DonneesRegistre = { relie: false, recettes: [], ressources: [], missives: [], mouvements: [], nbMembres: 0, version: 0 }

/** The Catalogues rows that the published CSV (what the book shows) does not hold yet. */
async function catalogueEnRetard(lu: Lu) {
  if (!lu.catalogue.length) return []
  const vus = new Set<string>()
  ;(await chargerArticles()).forEach((a) => {
    vus.add(cle(a.fr))
    if (a.en) vus.add(cle(a.en))
  })
  return lu.catalogue.filter((a) => !vus.has(cle(a.fr)))
}

/** The page's view: shares paid to members who brought nothing are summed up, not named. */
/** `qui`: the signed member, who alone sees their own sales. */
async function vue(lu: Lu, qui: string | null = null): Promise<DonneesRegistre> {
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
    catalogue: await catalogueEnRetard(lu),
    // A script before v3h does not read the orders: null (the page says so in character).
    ventes: lu.ventes === null ? null : qui ? lu.ventes.filter((v) => cle(v.vendeur) === cle(qui)) : [],
    nbMembres: lu.membres.length,
    version: lu.version,
  }
}

export async function GET(req: NextRequest) {
  if (!registreRelie()) return NextResponse.json({ ok: true, donnees: VIDE })
  try {
    // `v`: the newest version this reader has seen (its own writes must not vanish).
    const lu = await lireRegistre(Number(req.nextUrl.searchParams.get('v')) || 0)
    const qui = await identite(req.cookies, lu.membres)
    return NextResponse.json({ ok: true, donnees: await vue(lu, qui?.nom ?? null) })
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
  // The raw materials' own spelling wins over an ingredient's (« lys bleu » → « Lys Bleu »), and an
  // English name of the catalogue or of a raw material leads to its French name.
  articles.forEach((a) => ajouter(a.fr))
  lu.ressources.forEach((r) => ajouter(r.nom))
  lu.recettes.forEach((r) => {
    ajouter(r.produit)
    r.ingredients.forEach((i) => ajouter(i.nom))
  })
  rejouer(lu.mouvements).stock.forEach((s) => ajouter(s.nom))
  articles.forEach((a) => a.en && !res.has(cle(a.en)) && res.set(cle(a.en), a.fr))
  lu.ressources.forEach((r) => r.en && !res.has(cle(r.en)) && res.set(cle(r.en), r.nom))
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

/** `nouvellesRessources`: ingredients of a recipe known nowhere, to add to the Ressources tab (prices left empty). */
type Ecriture = { action: ActionRegistre; charge: Record<string, unknown>; message: string; numero?: string; nouvellesRessources?: string[] }

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
    if (estClose(m!)) non('Cette missive est déjà close : son registre ne bouge plus.')
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
        numero: n,
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
        const connu = stock.get(cle(objet))
        const attendu = connu?.qte ?? 0
        const ecart = compte - attendu
        const note = !connu ? 'premier compte' : `selon le registre ${attendu}${ecart ? `, écart ${signee(ecart)}` : ', juste'}`
        return [{ horodatage: quand, action: '', missive: mot(b.missive, 40), membre: qui.nom, objet, quantite: compte, note }]
      })
      const ecarts = mouvements.filter((m) => m.note.includes('écart')).length
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

    case 'cloture': {
      // Two ways out: « livrée » (the requested goods still owed leave the chest for the client) or
      // « inachevée » (closed without being completed, reward optional). Both share the reward.
      const m = missiveOuverte()
      const livree = b.issue !== 'inachevee'
      const recompense = nombreOuVide(b.recompense, 1e9, 'La récompense') ?? (livree ? non('Inscris la récompense reçue, même nulle.') : 0)
      const partCommune = nombreOuVide(b.partCommune, 100, 'La part commune') ?? PART_COMMUNE_DEFAUT
      const note = mot(b.note, 200)
      const valeur = evaluateur(articles, lu.recettes, lu.ressources)
      const p = partager(recompense, partCommune, lu.membres.map((x) => x.nom), contributions(m.numero, lu.mouvements, valeur))
      const parMembre = new Map<string, { membre: string; base: number; merite: number }>()
      for (const x of lu.membres) parMembre.set(cle(x.nom), { membre: x.nom, base: p.base, merite: 0 })
      for (const x of p.parts) parMembre.set(cle(x.membre), { membre: x.membre, base: x.base, merite: x.merite })
      const partage = [...parMembre.values()]
        .filter((x) => x.base + x.merite > 0)
        .map((x) => ({ membre: x.membre, montant: x.base + x.merite, note: `part commune ${x.base} + mérite ${x.merite}` }))
      const deja = livres(m.numero, lu.mouvements)
      const livraisons = livree
        ? m.lignes.flatMap((l) => {
            const reste = l.quantite - (deja.get(cle(l.produit)) ?? 0)
            return reste > 0 ? [{ objet: l.produit, quantite: -reste, note: 'livré au commanditaire' }] : []
          })
        : []
      const statut = livree ? 'livrée' : 'inachevée'
      return {
        action,
        charge: { cloture: { numero: m.numero, action: numero('A'), horodatage: quand, membre: qui.nom, statut, recompense: p.recompense, partCommune: p.partCommune, note, livraisons, partage } },
        message: livree
          ? `Missive livrée et close${p.recompense ? ` : ${p.recompense} septims partagés entre ${partage.length} membre${partage.length > 1 ? 's' : ''}` : ''}.`
          : `Missive close, inachevée${p.recompense ? ` : ${p.recompense} septims partagés malgré tout` : ''}.`,
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
      // One recipe (variant) of a product is written at a time. Editing keeps its number; a new recipe of a
      // product that already has some becomes its next variant (never overwrites one); moved to another
      // product's name, it becomes that product's next variant.
      const ancienneVariante = ancien ? Math.max(1, Math.round(Number(b.ancienneVariante) || 1)) : 0
      const editee = ancien ? lu.recettes.find((r) => cle(r.produit) === cle(ancien) && r.variante === ancienneVariante) : undefined
      const deplacee = Boolean(editee) && cle(ancien) !== cle(produit)
      const soeurs = variantesDe(lu.recettes, produit).filter((r) => r !== editee)
      const variante = editee && !deplacee ? editee.variante : soeurs.length ? Math.max(...soeurs.map((r) => r.variante)) + 1 : 1
      const usage = Boolean(editee && !deplacee && editee.usage)
      if (!ingredients.length && !editee) non('Une recette sans matière ne se consigne pas.')
      // A script before v3g replaces every row of the product: it would erase the other recipes.
      if (!lu.variantes && (variante !== 1 || soeurs.length > 0 || (deplacee && variantesDe(lu.recettes, ancien).length > 1)))
        non('Le scribe du registre ne sait pas encore tenir plusieurs recettes pour un même ouvrage : qu’on recopie le dernier script du grimoire dans la feuille, puis qu’on réessaie.')
      const autres = lu.recettes.filter((r) => r !== editee)
      const nouvelle: Recette = { produit, en: mot(b.en, 120), variante, usage, rendement, artisan: mot(b.artisan, 40), note: mot(b.note, 200), ingredients: ingredients.map((i) => ({ nom: i.ingredient, quantite: i.quantite })) }
      const index = indexRecettes(autres, lu.ressources)
      index.set(cle(produit), nouvelle)
      const cycle = trouverCycle(produit, index)
      if (cycle) non(texteCycle(cycle))
      // Ingredients known nowhere (not a raw material, not a product of a recipe or of the catalogue)
      // join the raw materials, their prices left to fill.
      const connus = new Set<string>()
      const connaitre = (n: string) => n && connus.add(cle(n))
      lu.ressources.forEach((r) => (connaitre(r.nom), connaitre(r.en)))
      ;[...autres, nouvelle].forEach((r) => (connaitre(r.produit), connaitre(r.en)))
      ;[...articles, ...lu.catalogue].forEach((a) => (connaitre(a.fr), connaitre(a.en)))
      const nouvellesRessources = ingredients.map((i) => i.ingredient).filter((n) => !connus.has(cle(n)))
      return {
        action,
        charge: {
          recette: { produit, variante, usage, ancienProduit: editee ? ancien : undefined, ancienneVariante: editee ? ancienneVariante : undefined, en: nouvelle.en, rendement, artisan: nouvelle.artisan, note: nouvelle.note, ingredients, nouvellesRessources },
        },
        message: ingredients.length
          ? `La recette${variante > 1 || soeurs.length ? ` n° ${variante}` : ''} de ${produit} est consignée.${nouvellesRessources.length ? ` ${nouvellesRessources.join(', ')} ${nouvellesRessources.length > 1 ? 'rejoignent' : 'rejoint'} les matières premières, prix à inscrire.` : ''}`
          : `La recette${ancienneVariante > 1 || soeurs.length ? ` n° ${ancienneVariante}` : ''} de ${produit} est effacée du registre.`,
        nouvellesRessources,
      }
    }

    case 'ressource': {
      const nom = mot(b.nom, 120) || non('Le nom de la ressource manque.')
      const ancien = mot(b.ancienNom, 120)
      const ressource = {
        nom,
        ancienNom: ancien || undefined,
        en: mot(b.en, 120),
        origine: mot(b.origine, 60),
        prix: nombreOuVide(b.prix, 1e7, 'Le prix courant'),
        bonneAffaire: nombreOuVide(b.bonneAffaire, 1e7, 'La bonne affaire'),
        note: mot(b.note, 200),
      }
      return { action, charge: { ressource }, message: `La ressource ${nom} est inscrite au registre.` }
    }

    case 'usage': {
      // Which recipe of a product is its usual one (drives costs, values and the missives' needs).
      const vs = variantesDe(lu.recettes, mot(b.produit, 120))
      if (!vs.length) non('Nulle recette n’est consignée pour cet ouvrage.')
      const v = vs.find((r) => r.variante === Math.round(Number(b.variante)))
      if (!v) non('Cette recette est introuvable dans le registre.')
      return { action, charge: { usage: { produit: v!.produit, variante: v!.variante } }, message: `La recette n° ${v!.variante} devient la recette d’usage de ${v!.produit}.` }
    }

    case 'choix': {
      // A missive's recipe for one of its items (« usage » = back to the usual recipe; 0 / « acheter » = buy).
      const m = missiveOuverte()
      const nom = mot(b.nom, 120) || non('L’ouvrage manque.')
      const vs = variantesDe(lu.recettes, nom)
      if (!vs.length) non('Nulle recette n’est consignée pour cet ouvrage.')
      const matiere = estMatiere(lu.ressources, nom)
      const voulu = String(b.variante ?? '')
      const variante = voulu === 'usage' ? null : voulu === 'acheter' || voulu === '0' ? 0 : Math.round(Number(voulu))
      if (variante === 0 && !matiere) non('Seule une matière première s’achète : cet ouvrage se façonne.')
      if (variante !== null && variante !== 0 && !vs.some((r) => r.variante === variante)) non('Cette recette est introuvable dans le registre.')
      // The default needs no line: the usual recipe, or buying a raw material.
      const parDefaut = variante === null || (matiere ? variante === 0 : variante === recetteUsage(vs)!.variante)
      const choix = [...m.choix.filter((c) => cle(c.nom) !== cle(nom)), ...(parDefaut ? [] : [{ nom: vs[0].produit, variante: variante! }])]
      return {
        action,
        charge: { choix: { numero: m.numero, recettes: choixEnTexte(choix) } },
        message:
          variante === 0 || (variante === null && matiere)
            ? `Pour cette missive, ${vs[0].produit} s’achète.`
            : `Pour cette missive, ${vs[0].produit} se façonne par la recette n° ${variante ?? recetteUsage(vs)!.variante}.`,
      }
    }

    case 'vente': {
      // A product put up for sale: one row added to the Catalogues tab (the book shows it at once,
      // the published CSV a few minutes later).
      const fr = mot(b.fr, 120) || non('Le nom de l’ouvrage manque.')
      const en = mot(b.en, 120)
      const deja = [...articles, ...lu.catalogue].find((a) => cle(a.fr) === cle(fr) || (en && a.en && cle(a.en) === cle(en)))
      if (deja) non(`« ${deja.fr} » est déjà au catalogue de la caravane.`)
      // A chapter of the book (a hidden one is refused); none chosen: « Divers ».
      const visibles = (chapitres as { id: string; masque?: boolean }[]).filter((c) => !c.masque)
      const chapitre = mot(b.chapitre, 40) || 'divers'
      if (!visibles.some((c) => c.id === chapitre)) non('Choisis le chapitre du catalogue où l’inscrire.')
      const prod = nombreOuVide(b.prod, 1e7, 'Le coût')
      const min = nombreOuVide(b.min, 1e7, 'Le plancher')
      const max = nombreOuVide(b.max, 1e7, 'Le plafond')
      if (min !== null && max !== null && min > max) non('Le plancher ne peut dépasser le plafond.')
      const article = { chapitre, fr, en, prod, min, max, artisan: mot(b.artisan, 40), note: mot(b.note, 200) }
      return { action, charge: { article }, message: `${fr} rejoint le catalogue de la caravane : Khajiit a de nouvelles marchandises.` }
    }
  }
}

const ACTIONS: ActionRegistre[] = ['missive', 'releve', 'depot', 'fabrication', 'cloture', 'recette', 'ressource', 'vente', 'usage', 'choix']

export async function POST(req: NextRequest) {
  if (!registreRelie()) return refus("Le registre des missives n'est pas encore relié au grimoire.", 503)
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const action = b.action as ActionRegistre
  if (!ACTIONS.includes(action)) return refus('Khajiit ne comprend pas ce que tu demandes au registre.')

  // Timings (Server-Timing header and logs): the read before the write (often cached), the write
  // (Vercel → Apps Script → back, the fresh tabs coming with the answer).
  const t0 = performance.now()
  let lu: Lu
  try {
    lu = await lireRegistre(Number(b.vu) || 0)
  } catch (e) {
    console.error('[registre] read failed', e)
    return refus("Le registre reste fermé pour l'heure : rien n'a été consigné.", 502)
  }
  const tLire = performance.now() - t0
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
  const t1 = performance.now()
  let ecrit: Awaited<ReturnType<typeof ecrireRegistre>>
  try {
    ecrit = await ecrireRegistre(e.action, e.charge)
  } catch (err) {
    console.error(`[registre] ${action} refused by the script`, err)
    const s = String(err)
    return refus(
      s.includes('already closed')
        ? 'Cette missive est déjà close : son registre ne bouge plus.'
        : s.includes('unknown action')
          ? 'Le scribe du registre ne connaît pas encore ce feuillet-là : qu’on recopie le dernier script du grimoire dans la feuille, puis qu’on réessaie.'
          : s.includes('no catalogue')
            ? 'Le registre ne trouve pas son onglet Catalogues : rien n’a été inscrit.'
            : s.includes('already in catalogue')
              ? 'Cet ouvrage est déjà au catalogue de la caravane.'
              : "Le registre a refusé le feuillet. Rien n'a été consigné : réessaie plus tard.",
      502,
    )
  }
  // An older script (before v3f) does not add a recipe's unknown ingredients itself: one 'ressource'
  // write each, then (best effort: the recipe is written either way).
  if (e.nouvellesRessources?.length && !Array.isArray((ecrit as { ressourcesAjoutees?: unknown }).ressourcesAjoutees)) {
    for (const nom of e.nouvellesRessources) {
      try {
        ecrit = await ecrireRegistre('ressource', { ressource: { nom, en: '', origine: '', prix: null, bonneAffaire: null, note: '' } })
      } catch (err) {
        console.error(`[registre] could not add the resource ${nom}`, err)
      }
    }
  }
  const tEcrire = performance.now() - t1
  // Never read again after a write: the script's answer carries every tab (an older script does not;
  // the page then keeps what it shows and reads later).
  const donnees = ecrit.lu ? await vue(ecrit.lu, qui.nom) : null
  const script = ecrit.ms ?? null
  console.log(`[registre] ${action}: read ${tLire.toFixed(0)} ms, write ${tEcrire.toFixed(0)} ms (script ${script ?? '?'} ms ${JSON.stringify(ecrit.etapes ?? {})}), tabs in answer: ${ecrit.lu ? 'yes' : 'no'}`)
  const rep = NextResponse.json({ ok: true, message: e.message, numero: e.numero, donnees })
  rep.headers.set(
    'Server-Timing',
    [
      `lire;dur=${tLire.toFixed(0)}, ecrire;dur=${tEcrire.toFixed(0)}, script;dur=${script ?? 0}, relire;dur=0, onglets;desc=${ecrit.lu ? 'oui' : 'non'}`,
      // The script's own steps (from a script that reports them): lock, write, version, cache…
      ...Object.entries(ecrit.etapes ?? {}).map(([k, v]) => `gs-${k};dur=${v}`),
    ].join(', '),
  )
  return rep
}
