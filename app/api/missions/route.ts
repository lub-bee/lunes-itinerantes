import { NextResponse, type NextRequest } from 'next/server'
import { identite, type Identite } from '@/lib/identite'
import { peut } from '@/lib/droits'
import { chargerArticles } from '@/lib/livre'
import { cle } from '@/lib/missives'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'
import {
  ACTIONS_MISSION,
  enCoursDe,
  PONDERATION_DEFAUT,
  ponderationEnLignes,
  raisonPoints,
  recetteDe,
  REGLAGES,
  TEXTES,
  traduire,
  type ActionMission,
  type Classe,
  type Assignation,
  type DonneesMissions,
  type Ponderation,
  type Reglages,
} from '@/lib/missions'

// The missions (prototype). GET: what the missions' pages need. POST { action, ... }: one write, in the
// name of the member who signed (lib/identite.ts), after the permission hook (lib/droits.ts). Every number
// of a demand (missions, quantities, points) is computed here again from the registre: the page's preview
// is never trusted. Until the sheet's script knows the missions (v3m), every write is refused in character.

export const dynamic = 'force-dynamic'

type Lu = Awaited<ReturnType<typeof lireRegistre>>

const refus = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

function vide(relie: boolean): DonneesMissions {
  return { relie, actif: false, ponderation: PONDERATION_DEFAUT, demandes: [], missions: [], points: [], moi: null, version: 0 }
}

function vue(lu: Lu, qui: Identite | null): DonneesMissions {
  const m = lu.missions
  return { relie: true, actif: m.actif, ponderation: m.ponderation, demandes: m.demandes, missions: m.missions, points: m.points, moi: qui?.nom ?? null, version: lu.version }
}

export async function GET(req: NextRequest) {
  if (!registreRelie()) return NextResponse.json({ ok: true, donnees: vide(false) })
  try {
    const lu = await lireRegistre(Number(req.nextUrl.searchParams.get('v')) || 0)
    return NextResponse.json({ ok: true, donnees: vue(lu, await identite(req.cookies, lu.membres)) })
  } catch (e) {
    console.error('[missions] read failed', e)
    return refus("Le registre des missions reste fermé pour l'heure : le coursier n'a pas pu l'ouvrir.", 502)
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

function poidsOuVide(v: unknown, quoi: string): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0 || n > 1000) non(`${quoi} : un poids plus grand que zéro (1000 au plus), ou rien pour « à fixer ».`)
  return Math.round(n * 100) / 100
}

function numero(prefixe: string): string {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .replace(/-/g, '')
  const hasard = Array.from(crypto.getRandomValues(new Uint8Array(3)), (o) => o.toString(36).padStart(2, '0')).join('').toUpperCase()
  return `${prefixe}-${jour}-${hasard.slice(0, 4)}`
}

/** Missions in one demand, at most (one write; the sheet takes one row per mission). */
const MAX_MISSIONS = 300

/** The pondération the page sends, checked (classes with a code, resources in a known class). */
function ponderationLue(b: Record<string, unknown>): Ponderation {
  const brut = (b.ponderation ?? {}) as { classes?: unknown; ressources?: unknown; reglages?: unknown }
  if (!Array.isArray(brut.classes) || !Array.isArray(brut.ressources)) non('La pondération est illisible : rien n’a été gravé.')
  const classes: Classe[] = []
  for (const c of (brut.classes as Record<string, unknown>[]).slice(0, 40)) {
    const code = mot(c?.code, 12)
    if (!code) continue
    if (classes.some((x) => cle(x.code) === cle(code))) non(`La classe ${code} est inscrite deux fois.`)
    classes.push({ code, nom: mot(c?.nom, 60) || code, poids: poidsOuVide(c?.poids, `Poids de la classe ${code}`), note: mot(c?.note, 120) })
  }
  if (!classes.length) non('Une pondération sans classe ne se grave pas.')
  const ressources: Assignation[] = []
  for (const r of (brut.ressources as Record<string, unknown>[]).slice(0, 600)) {
    const nom = mot(r?.nom, 120)
    const classe = mot(r?.classe, 12)
    if (!nom || !classe) continue
    if (!classes.some((c) => cle(c.code) === cle(classe))) non(`${nom} est rangé dans une classe inconnue (${classe}).`)
    if (ressources.some((x) => cle(x.nom) === cle(nom))) continue
    ressources.push({ nom, classe: classes.find((c) => cle(c.code) === cle(classe))!.code, poids: poidsOuVide(r?.poids, `Poids de ${nom}`), note: mot(r?.note, 120) })
  }
  const reglagesBruts = (brut.reglages ?? {}) as Record<string, unknown>
  const reglages = {} as Reglages
  for (const def of REGLAGES) {
    const n = Number(String(reglagesBruts[def.cle] ?? def.defaut).replace(',', '.'))
    if (!Number.isFinite(n) || n < def.min || n > def.max) non(`${def.libelle} : de ${def.min} à ${def.max}.`)
    reglages[def.cle] = def.cle === 'poidsRepli' ? Math.round(n * 100) / 100 : Math.round(n)
  }
  return { classes, ressources, reglages, source: 'registre' }
}

/* ───────────────────────── Writes ───────────────────────── */

type Ecriture = { action: string; charge: Record<string, unknown>; message: string; numero?: string }

async function preparer(action: ActionMission, b: Record<string, unknown>, lu: Lu, qui: Identite): Promise<Ecriture> {
  const m = lu.missions
  const quand = new Date().toISOString()
  const mission = () => {
    const x = m.missions.find((y) => y.numero === mot(b.numero, 40))
    if (!x) non('Cette mission est introuvable dans le registre.')
    return x!
  }

  switch (action) {
    case 'demande': {
      // A merchandise of the day book (the published catalogue, and the sheet's rows that win over it) with a recipe.
      const nom = mot(b.article, 120) || non('Choisis la marchandise demandée.')
      const publies = (await chargerArticles()).filter((a) => !a.ombre)
      const feuille = lu.catalogue.filter((a) => !a.ombre)
      const article = feuille.find((a) => cle(a.fr) === cle(nom)) ?? publies.find((a) => cle(a.fr) === cle(nom))
      if (!article || lu.catalogue.some((a) => a.ombre && cle(a.fr) === cle(nom))) non(`« ${nom} » n’est pas une marchandise du livre de jour.`)
      if (!recetteDe(lu.recettes, article!.fr)) non(TEXTES.sansRecette(article!.fr))
      const quantite = entier(b.quantite, 1, 100000, 'La quantité')
      const t = traduire({ fr: article!.fr, min: article!.min }, quantite, lu.recettes, m.ponderation)
      if (!t.ok) non(t.erreur)
      if (!t.ok) throw new Error('unreachable')
      if (t.missions.length > MAX_MISSIONS) non(`Cette demande ferait ${t.missions.length} missions : c’est trop pour un seul feuillet (${MAX_MISSIONS} au plus). Demande moins à la fois.`)
      const n = numero('D')
      const missions = t.missions.map((x, i) => ({
        numero: `${n}-${String(i + 1).padStart(2, '0')}`,
        type: x.type,
        objet: x.objet,
        quantite: x.quantite,
        poids: x.poids ?? '',
        effort: Math.round(x.effort * 100) / 100,
        points: x.points,
        note: x.type !== 'fabrication' && x.poids === null ? TEXTES.aFixer : '',
      }))
      return {
        action,
        charge: {
          demande: {
            numero: n,
            horodatage: quand,
            membre: qui.nom,
            article: t.article,
            quantite,
            plancher: t.plancher,
            pointsRessources: t.pointsRessources,
            pointsFabrication: t.pointsFabrication,
            note: mot(b.note, 200),
            missions,
          },
          // A first demand seeds the Pondération tab with what it was computed with (the defaults), so the
          // tab can be edited by hand at once; the script writes it only if the tab is still empty.
          ...(m.ponderation.source === 'defaut' ? { ponderation: ponderationEnLignes(m.ponderation) } : {}),
        },
        message: `La demande de ${quantite} ${t.article} est scellée (n° ${n}) : ${missions.length} mission${missions.length > 1 ? 's' : ''} ${missions.length > 1 ? 'sont lancées' : 'est lancée'} à la caravane.`,
        numero: n,
      }
    }

    case 'prendre': {
      const x = mission()
      if (x.statut !== 'ouverte') non(TEXTES.prise)
      const max = m.ponderation.reglages.maxEnCours
      if (enCoursDe(m.missions, qui.nom).length >= max) non(TEXTES.limite(max))
      return { action: 'mission', charge: { mission: { numero: x.numero, geste: 'prendre', membre: qui.nom, quand, max } }, message: `Mission prise : ${x.objet}. Que la route soit bonne.` }
    }

    case 'rendre': {
      const x = mission()
      if (x.statut !== 'en cours' || cle(x.prisPar) !== cle(qui.nom)) non(TEXTES.pasLaTienne)
      return { action: 'mission', charge: { mission: { numero: x.numero, geste: 'rendre', membre: qui.nom, quand } }, message: 'Mission rendue : elle retourne à l’appel de la caravane.' }
    }

    case 'accomplir': {
      const x = mission()
      if (x.statut !== 'en cours' || cle(x.prisPar) !== cle(qui.nom)) non(TEXTES.pasLaTienne)
      return {
        action: 'mission',
        charge: { mission: { numero: x.numero, geste: 'accomplir', membre: qui.nom, quand, raison: raisonPoints(x) } },
        message: `Mission accomplie : ${x.points} point${x.points > 1 ? 's' : ''} au crédit de ${qui.nom}.`,
      }
    }

    case 'ponderation': {
      const p = ponderationLue(b)
      return { action, charge: { ponderation: ponderationEnLignes(p) }, message: `La pondération est gravée au registre : ${p.classes.length} classes, ${p.ressources.length} ressources rangées.` }
    }
  }
}

/** The script's refusals, in character. */
function refusScript(s: string): string {
  if (s.includes('unknown action')) return TEXTES.refus
  if (s.includes('mission taken')) return TEXTES.prise
  if (s.includes('too many missions')) return 'Tes pattes sont pleines : accomplis ou rends une mission avant d’en prendre une autre.'
  if (s.includes('not held')) return TEXTES.pasLaTienne
  if (s.includes('unknown mission')) return 'Cette mission est introuvable dans le registre.'
  return "Le registre a refusé le feuillet. Rien n'a été consigné : réessaie plus tard."
}

export async function POST(req: NextRequest) {
  if (!registreRelie()) return refus("Le registre des missions n'est pas encore relié au grimoire.", 503)
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const action = b.action as ActionMission
  if (!ACTIONS_MISSION.includes(action)) return refus('Khajiit ne comprend pas ce que tu demandes au registre.')

  const t0 = performance.now()
  let lu: Lu
  try {
    lu = await lireRegistre(Number(b.vu) || 0)
  } catch (e) {
    console.error('[missions] read failed', e)
    return refus("Le registre reste fermé pour l'heure : rien n'a été consigné.", 502)
  }
  const qui = await identite(req.cookies, lu.membres)
  if (!qui) return refus("Signe d'abord de ton nom : seul un membre inscrit au registre de la caravane peut y écrire.", 401)
  if (!peut(action, qui.roles)) return refus("Cette page du registre est réservée à d'autres pattes que les tiennes.", 403)
  // The sheet's script does not know the missions yet (before v3m): refused in character, nothing sent.
  if (!lu.missions.actif) return refus(TEXTES.refus, 409)

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
    console.error(`[missions] ${action} refused by the script`, err)
    return refus(refusScript(String(err)), 502)
  }
  console.log(`[missions] ${action}: read ${(t1 - t0).toFixed(0)} ms, write ${(performance.now() - t1).toFixed(0)} ms, tabs in answer: ${ecrit.lu ? 'yes' : 'no'}`)
  return NextResponse.json({ ok: true, message: e.message, numero: e.numero, donnees: ecrit.lu ? vue(ecrit.lu, qui) : null })
}
