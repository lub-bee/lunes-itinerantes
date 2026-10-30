import { NextResponse, type NextRequest } from 'next/server'
import { identite, trouverMembre, type Identite } from '@/lib/identite'
import { peut } from '@/lib/droits'
import { chargerArticles } from '@/lib/livre'
import { cle } from '@/lib/missives'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'
import {
  ACTIONS_PAIE,
  bornes,
  calculerSemaine,
  CATEGORIES,
  lignesCloture,
  patriarchesDe,
  REGLAGES_PAIE,
  REGLAGES_PAIE_DEFAUT,
  reglagesPaieEnLignes,
  semaineDe,
  TEXTES_PAIE,
  JOURS,
  type ActionPaie,
  type Catalogue,
  type DonneesPaie,
  type ReglagesPaie,
} from '@/lib/paie'

// The pay (prototype). GET ?semaine=S-YYYY-MM-DD: the week computed (or as sealed), the invoices, events,
// closings. POST { action, ... }: one write, signed, through lib/droits.ts. Every sum is computed here from
// the registre; the page sends only what a Patriarch types. Until the sheet's script knows the pay (v3n),
// every write is refused in character.

export const dynamic = 'force-dynamic'

type Lu = Awaited<ReturnType<typeof lireRegistre>>

const refus = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

/** Price list of the whole catalogue: the published copy, the sheet's rows over it. */
async function catalogue(lu: Lu): Promise<Catalogue> {
  const c: Catalogue = new Map()
  for (const a of await chargerArticles()) c.set(cle(a.fr), { min: a.min, lot: a.lot ?? null, ombre: Boolean(a.ombre) })
  for (const a of lu.catalogue) c.set(cle(a.fr), { min: a.min, lot: a.lot ?? null, ombre: Boolean(a.ombre) })
  return c
}

async function semaine(lu: Lu, cleSemaine: string) {
  const p = lu.paie
  return calculerSemaine({
    semaine: cleSemaine,
    reglages: p.reglages,
    ventes: lu.ventes ?? [],
    catalogue: await catalogue(lu),
    points: lu.missions.points,
    factures: p.factures,
    evenements: p.evenements,
    ecritures: p.ecritures,
    clotures: p.clotures,
    patriarches: patriarchesDe(p.reglages, lu.membres),
  })
}

async function vue(lu: Lu, qui: Identite | null, voulue?: string | null): Promise<DonneesPaie> {
  const p = lu.paie
  const courante = semaineDe(Date.now(), p.reglages.jour)
  const s = voulue && /^S-\d{4}-\d{2}-\d{2}$/.test(voulue) ? voulue : courante
  return {
    relie: true,
    actif: p.actif,
    reglages: p.reglages,
    semaine: await semaine(lu, s),
    courante,
    scellees: [...new Set(p.clotures.map((l) => l.semaine))].sort().reverse(),
    factures: p.factures,
    evenements: p.evenements,
    ecritures: p.ecritures,
    clotures: p.clotures,
    moi: qui?.nom ?? null,
    version: lu.version,
  }
}

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('semaine')
  if (!registreRelie()) return NextResponse.json({ ok: true, donnees: null })
  try {
    const lu = await lireRegistre(Number(req.nextUrl.searchParams.get('v')) || 0)
    return NextResponse.json({ ok: true, donnees: await vue(lu, await identite(req.cookies, lu.membres), s) })
  } catch (e) {
    console.error('[paie] read failed', e)
    return refus("Le livre du trésor reste fermé pour l'heure : le coursier n'a pas pu l'ouvrir.", 502)
  }
}

/* ───────────────────────── Reading what the page sends ───────────────────────── */

class Refus extends Error {}
const non = (message: string): never => {
  throw new Refus(message)
}
const mot = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function montant(v: unknown, quoi: string, max = 1e8): number {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > max) non(`${quoi} : un nombre de septims, de 0 à ${max}, est attendu.`)
  return Math.round(n * 100) / 100
}

/** A day typed (YYYY-MM-DD), as noon in Japan (so it never slips to the day before), or now. */
function jour(v: unknown): string {
  const t = mot(v, 10)
  if (!t) return new Date().toISOString()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) non('La date est illisible.')
  return new Date(`${t}T12:00:00+09:00`).toISOString()
}

function numero(prefixe: string): string {
  const j = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '')
  const hasard = Array.from(crypto.getRandomValues(new Uint8Array(3)), (o) => o.toString(36).padStart(2, '0')).join('').toUpperCase()
  return `${prefixe}-${j}-${hasard.slice(0, 4)}`
}

type Ecriture = { action: string; charge: Record<string, unknown>; message: string }
const paie = (onglet: string, x: Record<string, unknown>) => ({ paie: { onglet, ...x } })

async function preparer(action: ActionPaie, b: Record<string, unknown>, lu: Lu, qui: Identite): Promise<Ecriture> {
  const p = lu.paie
  const quand = new Date().toISOString()
  switch (action) {
    case 'reglagesPaie': {
      const brut = (b.reglages ?? {}) as Record<string, unknown>
      const r = { ...REGLAGES_PAIE_DEFAUT } as ReglagesPaie
      for (const d of REGLAGES_PAIE) {
        const v = brut[d.cle]
        if (d.texte) (r as Record<string, unknown>)[d.cle] = mot(v ?? d.defaut, 400)
        else {
          const n = Number(String(v ?? d.defaut).replace(',', '.'))
          if (!Number.isFinite(n) || n < d.min || n > d.max) non(`${d.libelle} : de ${d.min} à ${d.max}.`)
          ;(r as Record<string, unknown>)[d.cle] = Math.round(n * 100) / 100
        }
      }
      if (!JOURS.includes(cle(r.jour))) non(`Le premier jour de la semaine : ${JOURS.join(', ')}.`)
      r.jour = cle(r.jour)
      if (r.vendeurPlancher + r.ressources + r.fabrication > 100) non('Ressources, fabrication et vendeur prennent plus que le plancher entier : c’est trop.')
      return { action: 'paie', charge: paie('reglagesPaie', { remplacer: true, lignes: reglagesPaieEnLignes(r) }), message: 'Les réglages de la paie sont gravés au registre.' }
    }

    case 'facture': {
      const id = mot(b.id, 40)
      if (b.supprimer) {
        if (!p.factures.some((f) => f.id === id)) non('Cette facture est introuvable dans le registre.')
        return { action: 'paie', charge: paie('factures', { supprimer: [id] }), message: 'La facture est rayée du registre.' }
      }
      const libelle = mot(b.libelle, 120) || non('Une facture sans libellé ne s’inscrit pas.')
      const categorie = CATEGORIES.find((c) => c === b.categorie) ?? non('Choisis la catégorie de la facture.')
      const evenement = mot(b.evenement, 40)
      if (evenement && !p.evenements.some((e) => e.id === evenement)) non('Cet événement est introuvable dans le registre.')
      const ligne = { id: id || numero('F'), date: jour(b.date), libelle, montant: montant(b.montant, 'Le montant'), categorie, evenement, note: mot(b.note, 200), par: qui.nom }
      if (id && !p.factures.some((f) => f.id === id)) non('Cette facture est introuvable dans le registre.')
      return { action: 'paie', charge: paie('factures', { lignes: [ligne] }), message: `Facture ${id ? 'corrigée' : 'inscrite'} : ${libelle}, ${ligne.montant} septims.` }
    }

    case 'evenement': {
      const id = mot(b.id, 40)
      if (b.supprimer) {
        if (p.ecritures.some((x) => x.evenement === id) || p.factures.some((f) => f.evenement === id)) non('Cet événement a déjà des écritures : raye-les d’abord.')
        return { action: 'paie', charge: paie('evenements', { supprimer: [id] }), message: 'L’événement est rayé du registre.' }
      }
      const nom = mot(b.nom, 120) || non('Un événement sans nom ne s’inscrit pas.')
      if (id && !p.evenements.some((e) => e.id === id)) non('Cet événement est introuvable dans le registre.')
      const compensation = b.compensation === '' || b.compensation === null || b.compensation === undefined ? '' : montant(b.compensation, 'La compensation', 1e6)
      const ligne = { id: id || numero('E'), nom, date: jour(b.date), note: mot(b.note, 200), compensation, statut: mot(b.statut, 20) || 'ouvert' }
      return { action: 'paie', charge: paie('evenements', { lignes: [ligne] }), message: `L’événement « ${nom} » est ${id ? 'corrigé' : 'inscrit'} au registre.` }
    }

    case 'ecriture': {
      if (b.supprimer) {
        const id = mot(b.supprimer, 40)
        const x = p.ecritures.find((e) => e.id === id) ?? non('Cette écriture est introuvable dans le registre.')
        if (x.genre === 'participant' && x.statut === 'payé') non('Cette compensation est déjà payée : marque-la d’abord « à payer ».')
        return { action: 'paie', charge: paie('ecrituresEvenement', { supprimer: [id] }), message: 'L’écriture est rayée du registre.' }
      }
      const e = p.evenements.find((x) => x.id === mot(b.evenement, 40)) ?? non('Cet événement est introuvable dans le registre.')
      const genre = (['entrée', 'dépense', 'lot', 'participant'] as const).find((g) => g === b.genre) ?? non('Choisis le genre de l’écriture.')
      const base = { id: numero('W'), evenement: e.id, date: quand, genre, libelle: mot(b.libelle, 120), montant: 0, membre: '', objet: '', quantite: '', statut: '', payePar: '', payeLe: '', par: qui.nom }
      if (genre === 'participant') {
        const m = trouverMembre(mot(b.membre, 80), lu.membres) ?? non(`« ${mot(b.membre, 80)} » n’est pas au registre des membres.`)
        if (p.ecritures.some((x) => x.evenement === e.id && x.genre === 'participant' && cle(x.membre) === cle(m.nom))) non(`${m.nom} est déjà inscrit à cet événement.`)
        const c = b.montant === '' || b.montant === undefined ? (e.compensation ?? p.reglages.compensation) : montant(b.montant, 'La compensation', 1e6)
        return {
          action: 'paie',
          charge: paie('ecrituresEvenement', { lignes: [{ ...base, libelle: base.libelle || 'Compensation', membre: m.nom, montant: c, statut: c > 0 ? 'à payer' : '' }] }),
          message: `${m.nom} participe à « ${e.nom} »${c > 0 ? ` : ${c} septims de compensation à payer` : ''}.`,
        }
      }
      if (genre === 'lot') {
        const objet = mot(b.objet, 120) || non('Quel lot ?')
        const quantite = Math.round(montant(b.quantite, 'La quantité', 1e6))
        if (quantite < 1) non('La quantité : une pièce au moins.')
        const mouvements = b.coffre ? [{ horodatage: quand, action: '', missive: '', membre: qui.nom, objet, quantite: -quantite, note: `lot de l’événement « ${e.nom} »` }] : []
        return {
          action: 'paie',
          charge: paie('ecrituresEvenement', { lignes: [{ ...base, libelle: base.libelle || 'Lot offert', objet, quantite, montant: b.montant ? montant(b.montant, 'La valeur') : 0, statut: b.coffre ? 'sorti du coffre' : '' }], mouvements }),
          message: `Lot inscrit : ${quantite} ${objet}${b.coffre ? ', sorti du coffre' : ''}.`,
        }
      }
      const libelle = base.libelle || non('Un libellé, pour qu’on sache d’où vient ou où va l’argent.')
      const m = montant(b.montant, 'Le montant')
      return { action: 'paie', charge: paie('ecrituresEvenement', { lignes: [{ ...base, libelle, montant: m }] }), message: `${genre === 'entrée' ? 'Entrée' : 'Dépense'} inscrite : ${libelle}, ${m} septims.` }
    }

    case 'clotureSemaine': {
      const s = mot(b.semaine, 20)
      if (!/^S-\d{4}-\d{2}-\d{2}$/.test(s)) non('Quelle semaine ?')
      if (p.clotures.some((l) => l.semaine === s)) non('Cette semaine est déjà close : ses comptes ne bougent plus.')
      if (bornes(s).debut > Date.now()) non('Cette semaine n’a pas encore commencé.')
      const calcul = await semaine(lu, s)
      const lignes = lignesCloture(calcul, quand, qui.nom, (n) => `${s}-${String(n).padStart(2, '0')}`)
      return {
        action: 'clotureSemaine',
        charge: { cloture: { semaine: s, lignes } },
        message: calcul.deficit > 0
          ? `Semaine close, en déficit de ${calcul.deficit} septims : nul n’est payé, le déficit passe à la semaine suivante.`
          : `Semaine close : ${calcul.reste} septims à répartir, ${calcul.partPatriarches} aux Patriarches, le point vaut ${calcul.valeurPoint} septim.`,
      }
    }

    case 'paiement': {
      const onglet = b.onglet === 'ecrituresEvenement' ? 'ecrituresEvenement' : 'clotures'
      const id = mot(b.id, 40)
      const ligne = onglet === 'clotures' ? p.clotures.find((l) => l.id === id) : p.ecritures.find((l) => l.id === id && l.genre === 'participant')
      if (!ligne || !ligne.statut) non('Cette ligne n’a rien à payer.')
      const paye = b.paye === true
      const qui2 = 'membre' in ligne! ? ligne!.membre : ''
      return {
        action: 'paie',
        charge: paie(onglet, { lignes: [{ id, statut: paye ? 'payé' : 'à payer', payePar: paye ? qui.nom : '', payeLe: paye ? quand : '' }] }),
        message: paye ? `Payé : ${qui2}, ${ligne!.montant} septims.` : `Le paiement de ${qui2} est rayé : à payer.`,
      }
    }
  }
}

function refusScript(s: string): string {
  if (s.includes('unknown action')) return TEXTES_PAIE.refus
  if (s.includes('already sealed')) return 'Cette semaine est déjà close : ses comptes ne bougent plus.'
  return "Le registre a refusé le feuillet. Rien n'a été consigné : réessaie plus tard."
}

export async function POST(req: NextRequest) {
  if (!registreRelie()) return refus("Le livre du trésor n'est pas encore relié au grimoire.", 503)
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const action = b.action as ActionPaie
  if (!ACTIONS_PAIE.includes(action)) return refus('Khajiit ne comprend pas ce que tu demandes au trésor.')
  let lu: Lu
  try {
    lu = await lireRegistre(Number(b.vu) || 0)
  } catch (e) {
    console.error('[paie] read failed', e)
    return refus("Le registre reste fermé pour l'heure : rien n'a été consigné.", 502)
  }
  const qui = await identite(req.cookies, lu.membres)
  if (!qui) return refus("Signe d'abord de ton nom : seul un membre inscrit au registre de la caravane peut y écrire.", 401)
  if (!peut(action, qui.roles)) return refus("Cette page du registre est réservée à d'autres pattes que les tiennes.", 403)
  if (!lu.paie.actif) return refus(TEXTES_PAIE.refus, 409)
  let e: Ecriture
  try {
    e = await preparer(action, b, lu, qui)
  } catch (err) {
    if (err instanceof Refus) return refus(err.message)
    throw err
  }
  let ecrit: Awaited<ReturnType<typeof ecrireRegistre>>
  try {
    ecrit = await ecrireRegistre(e.action, e.charge)
  } catch (err) {
    console.error(`[paie] ${action} refused by the script`, err)
    return refus(refusScript(String(err)), 502)
  }
  return NextResponse.json({ ok: true, message: e.message, donnees: ecrit.lu ? await vue(ecrit.lu, qui, mot(b.semaineVue, 20) || null) : null })
}
