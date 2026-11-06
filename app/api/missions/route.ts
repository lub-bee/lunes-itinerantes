import { NextResponse, type NextRequest } from 'next/server'
import { identite, type Identite } from '@/lib/identite'
import { peut } from '@/lib/droits'
import { chargerArticles } from '@/lib/livre'
import { cle, estClose, recetteUsage, repartir, variantesDe } from '@/lib/missives'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'
import { etatFaconnage, etatMission, objetQ, PETITES_LUNES, ROLE_RESERVE, tauxDe, TEXTES_FEUILLETS, TEXTES_INTENDANCE, type LigneIntendance } from '@/lib/intendance'
import {
  ACTIONS_MISSION,
  cleLigne,
  feuilletClos,
  missionOuverte,
  statutClos,
  partager,
  peser,
  prixDon,
  pointsDeLigne,
  pointsDon,
  poidsRepli,
  PONDERATION_DEFAUT,
  ponderationEnLignes,
  proposer,
  raisonPoints,
  recetteDe,
  REGLAGES,
  REGLAGES_DEFAUT,
  TEXTES,
  pointsParPrise,
  VERBES,
  type ActionMission,
  type Classe,
  type Assignation,
  type LotMission,
  type DonneesMissions,
  type Mission,
  type Permanente,
  type Ponderation,
  type Reglages,
} from '@/lib/missions'

// The missions and the Livre de l'Intendance (Missions v2, lot 2). GET: what their pages need. POST { action, ... }:
// one write, in the name of the member who signed (lib/identite.ts), after the permission hook (lib/droits.ts). Every
// number (a sheet's missions and points, a hand-over's points, the materials of a craft) is computed here again from
// the registre: the page's are never trusted. Before v3m nothing of the missions is written; before v3r nothing of
// the Intendance (refused in character).

export const dynamic = 'force-dynamic'

type Lu = Awaited<ReturnType<typeof lireRegistre>>

const refus = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

function vide(relie: boolean): DonneesMissions {
  return { relie, actif: false, intendanceActive: false, feuilletsActifs: false, ponderation: PONDERATION_DEFAUT, demandes: [], missions: [], points: [], permanentes: [], intendance: [], moi: null, version: 0 }
}

function vue(lu: Lu, qui: Identite | null): DonneesMissions {
  const m = lu.missions
  // Points are internal (Missions v2): the ledger and each row's points go only to who opens the Trésor.
  const tresor = peut('tresor', qui, lu.droits)
  return {
    relie: true,
    actif: m.actif,
    intendanceActive: lu.intendance.actif,
    feuilletsActifs: lu.feuillets,
    ponderation: m.ponderation,
    demandes: m.demandes,
    missions: m.missions,
    points: tresor ? m.points : [],
    permanentes: m.permanentes,
    intendance: tresor ? lu.intendance.lignes : lu.intendance.lignes.map((l) => ({ ...l, points: null })),
    moi: qui?.nom ?? null,
    version: lu.version,
  }
}

export async function GET(req: NextRequest) {
  if (!registreRelie()) return NextResponse.json({ ok: true, donnees: vide(false) })
  try {
    const lu = await lireRegistre(Number(req.nextUrl.searchParams.get('v')) || 0)
    return NextResponse.json({ ok: true, donnees: vue(lu, await identite(req.cookies, lu)) })
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

function numero(prefixe: string): string {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .replace(/-/g, '')
  const hasard = Array.from(crypto.getRandomValues(new Uint8Array(3)), (o) => o.toString(36).padStart(2, '0')).join('').toUpperCase()
  return `${prefixe}-${jour}-${hasard.slice(0, 4)}`
}

/** Missions in one sheet, at most; lines in one hand-over or gift; missions one line may be split into. */
const MAX_MISSIONS = 120
const MAX_LIGNES = 30
const MAX_PARTS = 50

/** The pondération the page sends, checked (classes with a code, resources in a known class). */
function ponderationLue(b: Record<string, unknown>): Ponderation {
  const brut = (b.ponderation ?? {}) as { classes?: unknown; ressources?: unknown; lots?: unknown; donsMin?: unknown; reglages?: unknown }
  if (!Array.isArray(brut.classes) || !Array.isArray(brut.ressources)) non('La pondération est illisible : rien n’a été gravé.')
  const classes: Classe[] = []
  for (const c of (brut.classes as Record<string, unknown>[]).slice(0, 40)) {
    const code = mot(c?.code, 12)
    if (!code) continue
    if (classes.some((x) => cle(x.code) === cle(code))) non(`La classe ${code} est inscrite deux fois.`)
    const q = c?.quantite === null || c?.quantite === undefined || String(c.quantite).trim() === '' ? null : entier(c.quantite, 1, 100000, `Quantité par mission du niveau ${code}`)
    classes.push({ code, nom: mot(c?.nom, 60) || code, quantite: q, note: mot(c?.note, 120) })
  }
  if (!classes.length) non('Une pondération sans niveau de rareté ne se grave pas.')
  const ressources: Assignation[] = []
  for (const r of (brut.ressources as Record<string, unknown>[]).slice(0, 600)) {
    const nom = mot(r?.nom, 120)
    const classe = mot(r?.classe, 12)
    const origine = mot(r?.origine, 60)
    // A resource is kept when it has a level or an origin (« à fixer » with its origin is a row too).
    if (!nom || (!classe && !origine && !r?.reference)) continue
    if (classe && !classes.some((c) => cle(c.code) === cle(classe))) non(`${nom} est rangé dans un niveau inconnu (${classe}).`)
    if (ressources.some((x) => cle(x.nom) === cle(nom))) continue
    const reference = r?.reference === null || r?.reference === undefined || String(r.reference).trim() === '' ? null : entier(r.reference, 1, 100000, `Quantité de référence de ${nom}`)
    ressources.push({ nom, classe: classe ? classes.find((c) => cle(c.code) === cle(classe))!.code : '', origine, reference, note: mot(r?.note, 120) })
  }
  const lots: LotMission[] = []
  for (const l of (Array.isArray(brut.lots) ? (brut.lots as Record<string, unknown>[]) : []).slice(0, 600)) {
    const nom = mot(l?.nom, 120)
    if (!nom || lots.some((x) => cle(x.nom) === cle(nom))) continue
    lots.push({ nom, lot: entier(l?.lot, 1, 100000, `Lot par mission de ${nom}`) })
  }
  const donsMin: LotMission[] = []
  for (const l of (Array.isArray(brut.donsMin) ? (brut.donsMin as Record<string, unknown>[]) : []).slice(0, 600)) {
    const nom = mot(l?.nom, 120)
    if (!nom || donsMin.some((x) => cle(x.nom) === cle(nom))) continue
    donsMin.push({ nom, lot: entier(l?.lot, 1, 1000000, `Don minimum de ${nom}`) })
  }
  const reglagesBruts = (brut.reglages ?? {}) as Record<string, unknown>
  const reglages = { ...REGLAGES_DEFAUT } as Reglages
  for (const def of REGLAGES) {
    const n = Number(String(reglagesBruts[def.cle] ?? def.defaut).replace(',', '.'))
    if (!Number.isFinite(n) || n < def.min || n > def.max) non(`${def.libelle} : de ${def.min} à ${def.max}.`)
    reglages[def.cle] = Math.round(n)
  }
  return { classes, ressources, lots, donsMin, reglages, source: 'registre' }
}

type ArticleJour = { fr: string; en?: string; min: number | null; lot?: number | null; ombre?: boolean }

/** The day book's merchandise: the published catalogue and the sheet's rows (which win), the shadow book left out. */
async function articlesJour(lu: Lu): Promise<ArticleJour[]> {
  const par = new Map<string, ArticleJour>()
  for (const a of await chargerArticles()) if (!a.ombre) par.set(cle(a.fr), { fr: a.fr, en: a.en, min: a.min, lot: a.lot ?? null })
  for (const a of lu.catalogue) {
    if (a.ombre) par.delete(cle(a.fr))
    else par.set(cle(a.fr), { fr: a.fr, en: a.en, min: a.min, lot: a.lot ?? null })
  }
  return [...par.values()]
}

/**
 * An item's name as the registre spells it (raw material, recipe product or ingredient, day-book merchandise), found by
 * its French name or its English one (lot 2b: every search also knows the English names).
 */
function nomConnu(lu: Lu, articles: ArticleJour[], nom: string): string {
  const connus = new Map<string, string>()
  const ajouter = (n: string, fr = n) => n && !connus.has(cle(n)) && connus.set(cle(n), fr)
  lu.ressources.forEach((r) => ajouter(r.nom))
  lu.recettes.filter((r) => !r.ombre).forEach((r) => (ajouter(r.produit), r.ingredients.forEach((i) => ajouter(i.nom))))
  articles.forEach((a) => ajouter(a.fr))
  // English names last: a French name always wins.
  lu.ressources.forEach((r) => r.en && ajouter(r.en, r.nom))
  lu.recettes.filter((r) => !r.ombre && r.en).forEach((r) => ajouter(r.en, r.produit))
  articles.forEach((a) => a.en && ajouter(a.en, a.fr))
  return connus.get(cle(nom)) ?? non(`Khajiit ne connaît nulle ressource ni marchandise nommée « ${nom} ».`)
}

/** Whether an item is only a final product (its crafting share, for a gift's points). */
const estFini = (lu: Lu, articles: ArticleJour[], nom: string) =>
  Boolean(recetteDe(lu.recettes, nom)) && articles.some((a) => cle(a.fr) === cle(nom)) && !lu.recettes.some((r) => r.ingredients.some((i) => cle(i.nom) === cle(nom)))

/**
 * Who handed it over / gives it / crafts it: a name of the register (its spelling), else a new name, reserved at once
 * in Membres as a « Petite lune » without a Discord seal (S1: the seal links to it later, everything recorded under it
 * follows). « Ami des Lunes »: known, never reserved, no points.
 */
function donneurDe(lu: Lu, tape: string, quoi = 'Qui l’a remis ?'): { nom: string; nouveau: boolean; ami: boolean } {
  const nom = mot(tape, 80)
  if (cle(nom).length < 2) non(`${quoi} Écris son nom (deux lettres au moins).`)
  const membre = lu.membres.find((x) => cle(x.nom) === cle(nom))
  if (membre) return { nom: membre.nom, nouveau: false, ami: false }
  const ami = lu.amis.find((x) => cle(x) === cle(nom))
  if (ami) return { nom: ami, nouveau: false, ami: true }
  return { nom, nouveau: true, ami: false }
}

/**
 * The mission a line names: a Missions row, or a standing mission (« P-… »). `ouverte`: a new hand-over may not name a
 * mission closed by hand, nor one of a closed sheet (lot 2b); a declaration already waiting is still answered.
 */
function cibleDe(lu: Lu, ref: string, ouverte = false): { mission?: Mission; permanente?: Permanente } {
  if (!ref) return {}
  const mission = lu.missions.missions.find((x) => x.numero === ref)
  if (mission && ouverte && !missionOuverte(mission, lu.missions.demandes)) return non(TEXTES_FEUILLETS.missionClose(mission.objet))
  if (mission) return { mission }
  const permanente = lu.missions.permanentes.find((x) => x.id === ref)
  if (permanente && ouverte && permanente.statut !== 'ouverte') return non(TEXTES_FEUILLETS.missionClose(permanente.objet))
  if (permanente) return { permanente }
  return non('Cette mission est introuvable dans le registre.')
}

/** The missive a mission belongs to (through its sheet). */
const missiveDe = (lu: Lu, m?: Mission) => (m ? (lu.missions.demandes.find((d) => d.numero === m.demande)?.missive ?? '') : '')

type LigneLue = { objet: string; quantite: number; mission?: Mission; permanente?: Permanente }

/** The lines of a hand-over or a gift: the item (a mission's own), the quantity, the mission they fill. */
function lignesLues(lu: Lu, articles: ArticleJour[], brutes: unknown): LigneLue[] {
  return ((Array.isArray(brutes) ? brutes : []).slice(0, MAX_LIGNES) as Record<string, unknown>[]).map((l) => {
    const c = cibleDe(lu, mot(l?.mission, 40), true)
    const objet = c.mission?.objet ?? c.permanente?.objet ?? nomConnu(lu, articles, mot(l?.objet, 120) || non('Une ligne n’a pas d’objet.'))
    return { objet, quantite: entier(l?.quantite, 1, 1000000, `La quantité de ${objet}`), ...c }
  })
}

/** A line's points when received: its mission's rate (late or extra units earn the same), else (no mission, or a rate of 0) a gift's. */
function pointsDe(lu: Lu, articles: ArticleJour[], l: LigneLue): number {
  // A mission's rate; a mission written without any (no floor, a craft) earns as a named gift would (lot 2b: never 0).
  if (l.mission && tauxDe(l.mission) > 0) return Math.round(tauxDe(l.mission) * l.quantite)
  if (l.permanente && tauxDe(l.permanente) > 0) return Math.round(tauxDe(l.permanente) * l.quantite)
  return pointsDon(l.objet, l.quantite, lu.recettes, articles, lu.missions.ponderation, estFini(lu, articles, l.objet), prixDon(l.objet, lu.ressources, articles)).points
}

/** The reason written on a Points row. */
function raisonDe(l: LigneLue): string {
  const q = objetQ(l.quantite, l.objet)
  if (l.mission) return `Remise pour « ${VERBES[l.mission.type]} ${l.mission.objet} » : ${q}`
  if (l.permanente) return `Mission permanente : ${q}`
  return `Don : ${q}`
}

/* ───────────────────────── Writes ───────────────────────── */

/** `puis`: a second write made right after the first succeeded (lot 2c: the placeholder of a sheet without missions removed). */
type Ecriture = { action: string; charge: Record<string, unknown>; message: string; numero?: string; puis?: { action: string; charge: Record<string, unknown> } }
/** The v3r payload: Intendance rows to add / update, chest rows, points, names to reserve. */
type Coffre = { lignes?: Partial<LigneIntendance>[]; maj?: { id: string; si: string[]; champs: Record<string, unknown> }[]; mouvements?: Record<string, unknown>[]; points?: Record<string, unknown>[]; reserver?: { nom: string; role: string }[] }
const coffre = (c: Coffre): Record<string, unknown> => ({ coffre: c })

async function preparer(action: ActionMission, b: Record<string, unknown>, lu: Lu, qui: Identite): Promise<Ecriture> {
  const m = lu.missions
  const quand = new Date().toISOString()
  const ligneDe = (genres: LigneIntendance['genre'][], statuts: LigneIntendance['statut'][]) => {
    const l = lu.intendance.lignes.find((x) => x.id === mot(b.id, 40))
    if (!l || !genres.includes(l.genre)) return non('Cette ligne est introuvable dans le Livre de l’Intendance.')
    if (!statuts.includes(l.statut)) non(TEXTES_INTENDANCE.dejaRepondu)
    return l
  }

  switch (action) {
    case 'demande': {
      // A sheet of missions: one merchandise (or any known item), its tree sorted before publishing (S8).
      const articles = await articlesJour(lu)
      const nom = mot(b.objet, 120) || non('Choisis ce qu’il faut réunir.')
      if (lu.catalogue.some((a) => a.ombre && cle(a.fr) === cle(nom))) non(`« ${nom} » appartient au Livre d’ombre.`)
      const article = articles.find((a) => cle(a.fr) === cle(nom))
      const objet = article ?? { fr: nomConnu(lu, articles, nom), min: null }
      const quantite = entier(b.quantite, 1, 100000, 'La quantité')
      const p = proposer(objet, quantite, lu.recettes, m.ponderation, articles)
      if (!p.ok) return non(p.erreur)
      // The lines kept and their quantities (`lignes`: [{ cle, quantite }]); none sent: every line, as proposed.
      const choisies = Array.isArray(b.lignes) ? (b.lignes as Record<string, unknown>[]).slice(0, 200) : null
      const gardees = choisies
        ? choisies.map((c) => {
            const l = p.lignes.find((x) => x.cle === mot(c?.cle, 160)) ?? non('Une ligne de la mission mère ne correspond plus à la recette : relis l’arbre et réessaie.')
            const q = entier(c?.quantite, 1, 1000000, `La quantité de ${l.objet}`)
            // Lot 2b: a line may be split into several missions (`parts`, 1 by default), never more than its units.
            const parts = c?.parts === undefined || c?.parts === null || c?.parts === '' ? 1 : entier(c.parts, 1, Math.min(MAX_PARTS, q), `Le nombre de missions de ${l.objet}`)
            return { l, q, parts }
          })
        : p.lignes.map((l) => ({ l, q: l.total, parts: 1 }))
      // Lot 2c: every line unticked is allowed (everything is already in the chest): the sheet's only task is then its
      // delivery. The script (v3m) refuses a sheet without missions, so one placeholder mission is written with it, then
      // « retirée » at once by the 'feuillet' action (v3s): no row is deleted, the reader leaves a removed line out.
      const seule = !gardees.length
      if (seule && !lu.feuillets) non(TEXTES_FEUILLETS.refus)
      const nbMissions = gardees.reduce((t, x) => t + x.parts, 0)
      if (nbMissions > MAX_MISSIONS) non(`Cette mission mère ferait ${nbMissions} missions enfants : c’est trop pour une seule (${MAX_MISSIONS} au plus).`)
      // A missive: a new one (« C'est une missive »: its client), or one already written (its number). Needs v3r.
      const lien = typeof b.missive === 'string' ? mot(b.missive, 40) : ''
      const neuve = b.missive && typeof b.missive === 'object' ? (b.missive as Record<string, unknown>) : null
      if ((lien || neuve) && !lu.intendance.actif) non(TEXTES_INTENDANCE.refus)
      if (lien && !lu.missives.some((x) => x.numero === lien && !estClose(x))) non('Cette missive est introuvable, ou déjà close.')
      const commanditaire = neuve ? mot(neuve.commanditaire, 80) || non('Qui commande ? Le commanditaire de la missive manque.') : ''
      const titre = mot(b.titre, 120)
      const note = mot(b.note, 200)
      const n = numero('D')
      const mNum = neuve ? numero('M') : lien
      const w = (l: (typeof gardees)[number]['l']) => l.poids ?? (l.type === 'récolte' || l.intermediaire ? poidsRepli(m.ponderation.reglages) : 0)
      // Each kept line: one mission, or `parts` missions sharing its quantity and its points (lot 2b).
      const parLigne = gardees.flatMap(({ l, q, parts }) => {
        const qs = partager(q, parts)
        const ps = repartir(pointsDeLigne(l, q), qs)
        return qs.map((qi, k) => ({ l, q: qi, points: ps[k] }))
      })
      const missions = parLigne.map(({ l, q, points }, i) => ({
        numero: `${n}-${String(i + 1).padStart(2, '0')}`,
        type: l.type,
        objet: l.objet,
        quantite: q,
        poids: l.poids ?? '',
        effort: Math.round(w(l) * q * 100) / 100,
        points,
        note: l.aFixer ? TEXTES.aFixer : '',
      }))
      const placeholder = { numero: `${n}-01`, type: 'fabrication' as const, objet: p.article, quantite, poids: '', effort: 0, points: 0, note: 'livraison seule (retirée aussitôt)' }
      const amont = missions.filter((x, i) => x.type === 'récolte' || parLigne[i].l.intermediaire).reduce((t, x) => t + x.points, 0)
      const nomFeuillet = titre || objetQ(quantite, p.article)
      return {
        action,
        charge: {
          demande: {
            numero: n,
            horodatage: quand,
            membre: qui.nom,
            article: p.article,
            quantite,
            plancher: p.plancher,
            pointsRessources: amont,
            pointsFabrication: missions.reduce((t, x) => t + x.points, 0) - amont,
            // Before v3r the title has no column: it is kept in the note.
            note: lu.intendance.actif ? note : [titre, note].filter(Boolean).join(' — '),
            titre,
            missive: mNum,
            missions: seule ? [placeholder] : missions,
          },
          ...(neuve ? { missive: { numero: mNum, horodatage: quand, titre: nomFeuillet, commanditaire, echeance: mot(neuve.echeance, 40), membre: qui.nom, lignes: [{ produit: p.article, quantite }] } } : {}),
          // A first sheet seeds the Pondération tab with what it was computed with (the defaults).
          ...(m.ponderation.source === 'defaut' ? { ponderation: ponderationEnLignes(m.ponderation) } : {}),
        },
        message: seule
          ? `${neuve ? `La missive « ${nomFeuillet} » est écrite, et sa` : 'La'} mission mère est publiée (n° ${n}) : nulle mission enfant, tout est déjà au coffre ; il ne reste que la livraison.`
          : missions.length > 1
            ? `${neuve ? `La missive « ${nomFeuillet} » est écrite, et ses` : 'Les'} ${missions.length} missions enfants sont publiées à la caravane (mission mère n° ${n}), la livraison pour dernière tâche.`
            : `${neuve ? `La missive « ${nomFeuillet} » est écrite, et sa` : 'La'} mission enfant est publiée à la caravane (mission mère n° ${n}), la livraison pour dernière tâche.`,
        numero: n,
        ...(seule ? { puis: { action: 'feuillet', charge: { feuillet: { numero: n, missions: [{ numero: placeholder.numero, si: ['ouverte', ''], champs: { statut: 'retirée' }, journal: `retirée : livraison seule ${journalDe(qui.nom)}` }] } } } } : {}),
      }
    }

    case 'entree': {
      // Someone allowed records what they received (S1, S2, S4, S5, S6): named or anonymous, for missions or as a gift.
      const articles = await articlesJour(lu)
      const anonyme = b.anonyme === true
      const donneur = anonyme ? null : donneurDe(lu, mot(b.membre, 80))
      const petites = b.coffre === PETITES_LUNES
      const lienF = mot(b.lien, 40)
      const f = lienF ? (lu.intendance.lignes.find((x) => x.id === lienF && x.genre === 'façonnage') ?? non('Ce façonnage est introuvable.')) : null
      const lignes = lignesLues(lu, articles, b.lignes)
      const rentrees = f ? lignesLues(lu, articles, b.rentrees) : []
      if (!lignes.length && !rentrees.length) non('Rien à consigner : ajoute au moins une ligne.')
      const membre = donneur?.nom ?? ''
      const sansPoints = anonyme || Boolean(donneur?.ami)
      const rows: Partial<LigneIntendance>[] = []
      const mouvements: Record<string, unknown>[] = []
      const points: Record<string, unknown>[] = []
      const base = numero('I')
      let k = 0
      for (const l of lignes) {
        const id = `${base}-${++k}`
        const pts = sansPoints ? 0 : pointsDe(lu, articles, l)
        const missive = missiveDe(lu, l.mission)
        rows.push({
          id, date: quand, genre: l.mission || l.permanente || f ? 'remise' : 'don', statut: 'reçue', membre, objet: l.objet, quantite: l.quantite,
          mission: l.mission?.numero ?? l.permanente?.id ?? '', demande: l.mission?.demande ?? '', missive, lien: f?.id ?? '', coffre: petites ? PETITES_LUNES : '',
          par: qui.nom, le: quand, points: pts, note: mot(b.note, 120),
        })
        mouvements.push({ horodatage: quand, action: id, missive, membre, type: 'dépôt', objet: l.objet, quantite: l.quantite, note: f ? `retour du façonnage ${f.id}` : anonyme ? 'don anonyme' : petites ? 'coffre des petites lunes' : `reçu par ${qui.nom}` })
        if (pts > 0) points.push({ horodatage: quand, membre, points: pts, raison: raisonDe(l), mission: l.mission?.numero ?? l.permanente?.id ?? id, confirmePar: qui.nom })
      }
      for (const l of rentrees) {
        const id = `${base}-${++k}`
        rows.push({ id, date: quand, genre: 'rentrée', statut: 'reçue', membre, objet: l.objet, quantite: l.quantite, lien: f!.id, par: qui.nom, le: quand, points: 0 })
        mouvements.push({ horodatage: quand, action: id, missive: '', membre, type: 'dépôt', objet: l.objet, quantite: l.quantite, note: `rentré du façonnage ${f!.id}` })
      }
      const quoi = [...lignes, ...rentrees].map((l) => objetQ(l.quantite, l.objet)).join(', ')
      return {
        action: 'intendance',
        charge: coffre({ lignes: rows, mouvements, points, reserver: donneur?.nouveau ? [{ nom: donneur.nom, role: ROLE_RESERVE }] : [] }),
        message: `Consigné : ${quoi}, ${anonyme ? 'don anonyme' : `de ${membre}`}. Le coffre est à jour.${donneur?.nouveau ? ` « ${membre} » est inscrit au registre des membres (Petite lune).` : ''}`,
      }
    }

    case 'signaler': {
      // A member's own declaration (S5): left in the petites lunes chest, or handed to someone; it waits for a yes / no.
      const articles = await articlesJour(lu)
      const lignes = lignesLues(lu, articles, b.lignes)
      if (!lignes.length) non('Rien à signaler : ajoute au moins une ligne.')
      const petites = b.coffre !== 'main'
      const base = numero('I')
      const rows = lignes.map((l, i): Partial<LigneIntendance> => ({
        id: `${base}-${i + 1}`,
        date: quand,
        genre: l.mission || l.permanente ? 'remise' : 'don',
        statut: 'en attente',
        membre: qui.nom,
        objet: l.objet,
        quantite: l.quantite,
        mission: l.mission?.numero ?? l.permanente?.id ?? '',
        demande: l.mission?.demande ?? '',
        missive: missiveDe(lu, l.mission),
        coffre: petites ? PETITES_LUNES : '',
        note: mot(b.note, 120),
      }))
      return {
        action: 'intendance',
        charge: coffre({ lignes: rows }),
        message: `Signalé : ${lignes.map((l) => objetQ(l.quantite, l.objet)).join(', ')}${petites ? ', au coffre des petites lunes' : ''}. Une patte de l’Intendance confirmera ce qu’elle a reçu.`,
      }
    }

    case 'recevoir': {
      // The yes / no to a declaration, line by line (« Reçu 50 Bière de Ko'Rasha ? »).
      const l = ligneDe(['remise', 'don'], ['en attente'])
      if (cle(l.membre) === cle(qui.nom)) non(TEXTES_INTENDANCE.soiMeme)
      if (b.oui !== true)
        return {
          action: 'intendance',
          charge: coffre({ maj: [{ id: l.id, si: ['en attente'], champs: { statut: 'refusée', par: qui.nom, le: quand, note: [l.note, mot(b.note, 120)].filter(Boolean).join(' · ') } }] }),
          message: `Pas reçu : ${objetQ(l.quantite, l.objet)} de ${l.membre}. La ligne est rayée.`,
        }
      const articles = await articlesJour(lu)
      const ligne: LigneLue = { objet: l.objet, quantite: l.quantite, ...cibleDe(lu, l.mission) }
      // The declarer is a member (a declaration needs a signature); an « Ami des Lunes » earns nothing.
      const pts = lu.membres.some((x) => cle(x.nom) === cle(l.membre)) ? pointsDe(lu, articles, ligne) : 0
      return {
        action: 'intendance',
        charge: coffre({
          maj: [{ id: l.id, si: ['en attente'], champs: { statut: 'reçue', par: qui.nom, le: quand, points: pts } }],
          mouvements: [{ horodatage: quand, action: l.id, missive: l.missive, membre: l.membre, type: 'dépôt', objet: l.objet, quantite: l.quantite, note: l.coffre ? 'coffre des petites lunes' : `reçu par ${qui.nom}` }],
          points: pts > 0 ? [{ horodatage: quand, membre: l.membre, points: pts, raison: raisonDe(ligne), mission: l.mission || l.id, confirmePar: qui.nom }] : [],
        }),
        message: `Reçu : ${objetQ(l.quantite, l.objet)} de ${l.membre}. Le coffre est à jour.`,
      }
    }

    case 'faconnage': {
      // S6: materials out of the chest to an artisan; the goods are awaited back (Réception).
      const articles = await articlesJour(lu)
      const artisan = donneurDe(lu, mot(b.artisan, 80), 'Chez qui ?')
      const produit = nomConnu(lu, articles, mot(b.produit, 120) || non('Quel ouvrage façonner ?'))
      const vs = variantesDe(lu.recettes.filter((r) => !r.ombre && r.ingredients.length), produit)
      const r = vs.find((x) => x.variante === Number(b.variante)) ?? recetteUsage(vs) ?? non(TEXTES.sansRecette(produit))
      const voulu = entier(b.quantite, 1, 100000, 'La quantité à façonner')
      const fournees = Math.ceil(voulu / Math.max(1, r.rendement))
      const quantite = fournees * Math.max(1, r.rendement)
      const c = cibleDe(lu, mot(b.mission, 40))
      const id = numero('I')
      const sorties = r.ingredients.map((i) => ({ objet: i.nom, quantite: Math.ceil(i.quantite * fournees - 1e-9) }))
      return {
        action: 'intendance',
        charge: coffre({
          lignes: [
            {
              id, date: quand, genre: 'façonnage', statut: 'en cours', membre: artisan.nom, objet: r.produit, quantite, mission: c.mission?.numero ?? c.permanente?.id ?? '',
              demande: c.mission?.demande ?? '', missive: missiveDe(lu, c.mission), par: qui.nom, le: quand, note: `recette ${r.variante} : ${sorties.map((s) => objetQ(s.quantite, s.objet)).join(', ')}`,
            },
          ],
          mouvements: sorties.map((s) => ({ horodatage: quand, action: id, missive: '', membre: artisan.nom, type: 'livraison', objet: s.objet, quantite: -s.quantite, note: `sorti pour façonner ${objetQ(quantite, r.produit)} chez ${artisan.nom}` })),
          reserver: artisan.nouveau ? [{ nom: artisan.nom, role: ROLE_RESERVE }] : [],
        }),
        message: `Sorti du coffre : ${sorties.map((s) => objetQ(s.quantite, s.objet)).join(', ')}. Chez ${artisan.nom} : ${objetQ(quantite, r.produit)} attendus.`,
      }
    }

    case 'sortie': {
      // A loss or any other exit, recorded at once.
      const articles = await articlesJour(lu)
      const objet = nomConnu(lu, articles, mot(b.objet, 120) || non('Qu’est-ce qui sort du coffre ?'))
      const quantite = entier(b.quantite, 1, 1000000, 'La quantité')
      const note = mot(b.note, 120) || non('Pourquoi sort-il ? Un mot suffit (perdu, gâté, offert…).')
      const id = numero('I')
      return {
        action: 'intendance',
        charge: coffre({
          lignes: [{ id, date: quand, genre: 'perte', statut: 'sortie', membre: '', objet, quantite, par: qui.nom, le: quand, note }],
          mouvements: [{ horodatage: quand, action: id, missive: '', membre: qui.nom, type: 'livraison', objet, quantite: -quantite, note }],
        }),
        message: `Sorti du coffre : ${objetQ(quantite, objet)} (${note}).`,
      }
    }

    case 'sortir': {
      // S10: a sale's line ticked « pris au coffre » on the order sheet; confirmed, its goods leave the chest.
      const l = ligneDe(['vente'], ['en attente'])
      if (b.oui !== true)
        return { action: 'intendance', charge: coffre({ maj: [{ id: l.id, si: ['en attente'], champs: { statut: 'refusée', par: qui.nom, le: quand } }] }), message: `Rien n’est sorti : ${objetQ(l.quantite, l.objet)} du bon ${l.commande} ne venait pas du coffre.` }
      return {
        action: 'intendance',
        charge: coffre({
          maj: [{ id: l.id, si: ['en attente'], champs: { statut: 'sortie', par: qui.nom, le: quand } }],
          mouvements: [{ horodatage: quand, action: l.id, missive: '', membre: l.membre, type: 'livraison', objet: l.objet, quantite: -l.quantite, note: `vendu (bon ${l.commande})` }],
        }),
        message: `Sorti du coffre : ${objetQ(l.quantite, l.objet)}, vendu par ${l.membre}.`,
      }
    }

    case 'clore': {
      // A craft whose rest will not come back: no longer awaited.
      const l = ligneDe(['façonnage'], ['en cours'])
      const e = etatFaconnage(l, lu.intendance.lignes)
      return { action: 'intendance', charge: coffre({ maj: [{ id: l.id, si: ['en cours'], champs: { statut: 'close', par: qui.nom, le: quand } }] }), message: `Façonnage clos chez ${l.membre} : ${objetQ(e.revenu, l.objet)} revenus sur ${objetQ(l.quantite, l.objet)}.` }
    }

    case 'confirmer':
    case 'refuser': {
      // A hand-over made the prototype's way (a mission « remise » before lot 2): answered as then.
      if (!lu.paie.actif) non(TEXTES.refusV3n)
      const x = m.missions.find((y) => y.numero === mot(b.numero, 40)) ?? non('Cette mission est introuvable dans le registre.')
      if (x.statut !== 'remise') non(TEXTES.pasRemise)
      if (cle(x.prisPar) === cle(qui.nom)) non(TEXTES.soiMeme)
      return action === 'confirmer'
        ? { action: 'mission', charge: { mission: { numero: x.numero, geste: 'confirmer', membre: qui.nom, quand, raison: raisonPoints(x) } }, message: `Reçu : ${objetQ(x.quantite, x.objet)} de ${x.prisPar}.` }
        : { action: 'mission', charge: { mission: { numero: x.numero, geste: 'refuser', membre: qui.nom, quand, note: mot(b.note, 120) } }, message: `Pas reçu : la remise de ${x.prisPar} est rayée.` }
    }

    case 'permanente': {
      // A standing mission opened or changed (v3n): its item, its reference quantity and points, its state.
      if (!lu.paie.actif) non(TEXTES.refusV3n)
      const id = mot(b.id, 40)
      const avant = id ? (m.permanentes.find((x) => x.id === id) ?? non('Cette mission permanente est introuvable.')) : null
      const articles = await articlesJour(lu)
      const objet = nomConnu(lu, articles, mot(b.objet, 120) || non('Quelle ressource, ou quel ouvrage ?'))
      const recette = recetteDe(lu.recettes, objet)
      const type = recette ? 'fabrication' : 'récolte'
      const quantite = entier(b.quantite, 1, 100000, 'La quantité de référence')
      const points =
        b.points === '' || b.points === undefined || b.points === null ? pointsParPrise(objet, quantite, lu.recettes, articles, m.ponderation, estFini(lu, articles, objet)) : entier(b.points, 0, 1000000, 'Les points')
      const statut = (['ouverte', 'en pause', 'close'] as const).find((x) => x === b.statut) ?? 'ouverte'
      const w = peser(m.ponderation).poidsDe(objet, Boolean(recette))
      const ligne = { id: id || numero('P'), type, objet, quantite, points, poids: w ?? '', plafond: avant?.plafond ?? '', statut, par: avant?.par ?? qui.nom, date: avant?.date ?? quand, note: mot(b.note, 200) }
      return { action: 'paie', charge: { paie: { onglet: 'permanentes', lignes: [ligne] } }, message: `Mission permanente ${id ? 'corrigée' : 'ouverte'} : ${VERBES[type]} ${objet}, toujours ouverte.` }
    }

    case 'feuillet': {
      // Lot 2b: a sheet corrected from the Intendance: its title and note, a line's quantity (its rate per unit kept, so
      // what was received and credited never moves), a line removed (only when nothing was received nor declared for
      // it: else it is closed), a line added (the rate the sheet's tree gives that item, else the standing missions').
      const dm = m.demandes.find((x) => x.numero === mot(b.numero, 40)) ?? non('Cette mission mère est introuvable dans le registre.')
      if (feuilletClos(dm)) non('Cette mission mère est close : rouvre-la avant de la corriger.')
      const articles = await articlesJour(lu)
      const jour = journalDe(qui.nom)
      // Why (the lightening after a hand-over), written in each mission's journal.
      const raison = b.allegement === true ? ' (plus utile après une remise)' : ''
      const champs: Record<string, string> = {}
      if (typeof b.titre === 'string' && mot(b.titre, 120) !== dm.titre) champs.titre = mot(b.titre, 120)
      if (typeof b.note === 'string' && mot(b.note, 200) !== dm.note) champs.note = mot(b.note, 200)
      const ms = m.missions.filter((x) => x.demande === dm.numero)
      const majs: { numero: string; si: string[]; quantite?: number; champs: Record<string, unknown>; journal: string }[] = []
      const dits: string[] = []
      for (const l of (Array.isArray(b.lignes) ? (b.lignes as Record<string, unknown>[]) : []).slice(0, MAX_MISSIONS)) {
        const x = ms.find((y) => y.numero === mot(l?.numero, 40)) ?? non('Une mission enfant est introuvable : relis la mission mère et réessaie.')
        if (x.statut !== 'ouverte' && x.statut !== 'close') non(`« ${VERBES[x.type]} ${x.objet} » a été prise à l’ancienne manière : réponds d’abord à sa remise.`)
        const e = etatMission(x, lu.intendance.lignes)
        // Lot 2b: an upstream mission no longer needed (`allegements`), closed with the rest of the correction.
        if (l?.fermer === true) {
          if (x.statut !== 'ouverte') continue
          majs.push({ numero: x.numero, si: siDe(x.statut), champs: { statut: 'close' }, journal: `close${raison} ${jour}` })
          dits.push(`${x.objet} clos`)
          continue
        }
        if (l?.retirer === true) {
          if (e.recu > 0 || e.attente > 0) non(`« ${VERBES[x.type]} ${x.objet} » a déjà reçu ou attend une remise : on ne la retire pas, on la clôt.`)
          majs.push({ numero: x.numero, si: siDe(x.statut), champs: { statut: 'retirée' }, journal: `retirée ${jour}` })
          dits.push(`${x.objet} retiré`)
          continue
        }
        if (l?.quantite === undefined || l?.quantite === null || l?.quantite === '') continue
        const q = entier(l.quantite, 1, 1000000, `La quantité de ${x.objet}`)
        if (q === x.quantite) continue
        const effort = x.quantite > 0 ? Math.round(((x.effort / x.quantite) * q) * 100) / 100 : x.effort
        majs.push({ numero: x.numero, si: siDe(x.statut), quantite: x.quantite, champs: { quantite: q, points: Math.round(tauxDe(x) * q), effort }, journal: `quantité ${x.quantite} → ${q}${raison} ${jour}` })
        dits.push(`${x.objet} : ${nfr(x.quantite)} → ${nfr(q)}`)
      }
      // The lines added: numbered after every number the sheet ever used (the removed lines' included).
      const pris = [...ms.map((x) => x.numero), ...m.retirees.filter((r) => r.startsWith(`${dm.numero}-`))]
      let suivant = pris.reduce((t, r) => Math.max(t, Number(r.slice(dm.numero.length + 1)) || 0), 0)
      const article = articles.find((a) => cle(a.fr) === cle(dm.article))
      const arbre = article || recetteDe(lu.recettes, dm.article) ? proposer(article ? { fr: article.fr, min: article.min } : { fr: dm.article, min: null }, Math.max(1, dm.quantite), lu.recettes, m.ponderation, articles) : null
      const ajouts = ((Array.isArray(b.ajouts) ? b.ajouts : []) as Record<string, unknown>[]).slice(0, 20).map((a) => {
        const objet = nomConnu(lu, articles, mot(a?.objet, 120) || non('Une ligne ajoutée n’a pas d’objet.'))
        const q = entier(a?.quantite, 1, 1000000, `La quantité de ${objet}`)
        const recette = recetteDe(lu.recettes, objet)
        const type = recette ? 'fabrication' : 'récolte'
        const ligne = arbre?.ok ? (arbre.lignes.find((x) => x.cle === cleLigne(type, objet)) ?? arbre.lignes.find((x) => cle(x.objet) === cle(objet))) : undefined
        const points = ligne ? pointsDeLigne(ligne, q) : type === 'récolte' ? pointsParPrise(objet, q, lu.recettes, articles, m.ponderation, false) : cle(objet) === cle(dm.article) && dm.plancher ? Math.round((dm.plancher * q * m.ponderation.reglages.partFabrication) / 100) : 0
        const poids = ligne?.poids ?? peser(m.ponderation).poidsDe(objet, Boolean(recette))
        const w = poids ?? (type === 'récolte' ? poidsRepli(m.ponderation.reglages) : 0)
        dits.push(`+ ${objetQ(q, objet)}`)
        return { numero: `${dm.numero}-${String(++suivant).padStart(2, '0')}`, type: ligne?.type ?? type, objet, quantite: q, poids: poids ?? '', effort: Math.round(w * q * 100) / 100, points, note: poids === null && type === 'récolte' ? TEXTES.aFixer : '', journal: `ajoutée ${jour}` }
      })
      if (!Object.keys(champs).length && !majs.length && !ajouts.length) non('Rien n’a changé sur cette mission mère.')
      // Lot 2c: every child may be removed: the mother keeps its last task, the delivery.
      if (champs.titre !== undefined) dits.unshift('titre')
      if (champs.note !== undefined) dits.push('note')
      return {
        action,
        charge: { feuillet: { numero: dm.numero, si: siDe(dm.statut), champs, missions: majs, ajouts } },
        message: `La mission mère « ${champs.titre || dm.titre || objetQ(dm.quantite, dm.article)} » est corrigée (${dits.join(', ')}). Ce qui a été reçu reste compté.`,
      }
    }

    case 'fermer': {
      // Lot 2b: a mission, or a whole sheet, closed by hand (it leaves the call; its receipts stay; what waits for an
      // answer can still be received), or reopened.
      const ouvrir = b.ouvrir === true
      const jour = journalDe(qui.nom)
      if (b.cible === 'feuillet') {
        const dm = m.demandes.find((x) => x.numero === mot(b.numero, 40)) ?? non('Cette mission mère est introuvable dans le registre.')
        if (feuilletClos(dm) === !ouvrir) non(ouvrir ? 'Cette mission mère est déjà ouverte.' : 'Cette mission mère est déjà close.')
        const nom = dm.titre || objetQ(dm.quantite, dm.article)
        return {
          action: 'feuillet',
          // Lot 2c: the closing date kept in the « Statut » itself (« close le 2026-11-06 14:20 »): no new column.
          charge: { feuillet: { numero: dm.numero, si: siDe(dm.statut), champs: { statut: ouvrir ? 'ouverte' : statutClos() } } },
          message: ouvrir
            ? `La mission mère « ${nom} » est rouverte : ses missions enfants reviennent à l’appel.`
            : `La mission mère « ${nom} » est close${dm.missive ? '' : ', sa livraison faite'} : ses missions enfants quittent l’appel. Ce qui a été reçu reste compté ; on peut la rouvrir.`,
        }
      }
      const x = m.missions.find((y) => y.numero === mot(b.numero, 40)) ?? non('Cette mission est introuvable dans le registre.')
      if (ouvrir ? x.statut !== 'close' : x.statut !== 'ouverte') non(ouvrir ? 'Cette mission n’est pas close.' : x.statut === 'close' ? 'Cette mission est déjà close.' : 'Cette mission a été prise à l’ancienne manière : réponds d’abord à sa remise.')
      const e = etatMission(x, lu.intendance.lignes)
      return {
        action: 'feuillet',
        charge: { feuillet: { numero: x.demande, missions: [{ numero: x.numero, si: siDe(x.statut), champs: { statut: ouvrir ? 'ouverte' : 'close' }, journal: `${ouvrir ? 'rouverte' : 'close'} ${jour}` }] } },
        message: ouvrir
          ? `« ${VERBES[x.type]} ${x.objet} » est rouverte : elle revient à l’appel.`
          : `« ${VERBES[x.type]} ${x.objet} » est close (${nfr(e.recu)} reçus sur ${nfr(e.requis)}). Elle quitte l’appel${e.attente > 0 ? ` ; les ${nfr(e.attente)} en attente pourront encore être reçus` : ''}. On peut la rouvrir.`,
      }
    }

    case 'ponderation': {
      const p = ponderationLue(b)
      return { action, charge: { ponderation: ponderationEnLignes(p) }, message: `La pondération est gravée au registre : ${p.classes.length} classes, ${p.ressources.length} ressources rangées.` }
    }
  }
}

/** Actions that need the Livre de l'Intendance (v3r). */
const INTENDANCE: ActionMission[] = ['entree', 'signaler', 'recevoir', 'faconnage', 'sortie', 'sortir', 'clore']
/** Actions that need the sheets' corrections (v3s). */
const FEUILLETS: ActionMission[] = ['feuillet', 'fermer']

/** The « Statut » the script must still find: an open row may hold « ouverte » or nothing (typed by hand). */
const siDe = (statut: string) => (cle(statut) === 'ouverte' || !statut ? ['ouverte', ''] : [statut])
const nfr = (n: number) => new Intl.NumberFormat('fr-FR').format(n)
/** « par Kesha le 2026-11-05 14:20 » (Tokyo time), appended to a mission's journal. */
function journalDe(nom: string): string {
  const t = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date())
  return `par ${nom} le ${t}`
}

/** The script's refusals, in character. */
function refusScript(s: string): string {
  if (s.includes('unknown action feuillet')) return TEXTES_FEUILLETS.refus
  if (s.includes('sheet changed')) return TEXTES_FEUILLETS.change
  if (s.includes('unknown sheet')) return 'Cette mission mère est introuvable dans le registre.'
  if (s.includes('unknown action intendance')) return TEXTES_INTENDANCE.refus
  if (s.includes('unknown action')) return TEXTES.refus
  if (s.includes('already answered')) return TEXTES_INTENDANCE.dejaRepondu
  if (s.includes('no members tab')) return 'Le registre des membres est introuvable dans la feuille : le nom n’a pas pu être inscrit. Rien n’a été consigné.'
  if (s.includes('not handed over')) return TEXTES.pasRemise
  if (s.includes('own mission')) return TEXTES.soiMeme
  if (s.includes('unknown gesture')) return TEXTES.refusV3n
  if (s.includes('unknown mission') || s.includes('unknown row')) return 'Cette ligne est introuvable dans le registre.'
  return "Le registre a refusé l'écrit. Rien n'a été consigné : réessaie plus tard."
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
  const qui = await identite(req.cookies, lu)
  if (!qui) return refus("Signe d'abord de ton nom : seul un membre inscrit au registre de la caravane peut y écrire.", 401)
  if (!peut(action, qui, lu.droits)) return refus("Cette page du registre est réservée à d'autres pattes que les tiennes.", 403)
  // The sheet's script does not know the missions yet (before v3m), or the Intendance (before v3r): refused in character.
  if (!lu.missions.actif) return refus(TEXTES.refus, 409)
  if (INTENDANCE.includes(action) && !lu.intendance.actif) return refus(TEXTES_INTENDANCE.refus, 409)
  if (FEUILLETS.includes(action) && !lu.feuillets) return refus(TEXTES_FEUILLETS.refus, 409)

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
  let message = e.message
  if (e.puis) {
    try {
      const ensuite = await ecrireRegistre(e.puis.action, e.puis.charge)
      if (ensuite.lu) ecrit = { ...ecrit, lu: ensuite.lu }
    } catch (err) {
      console.error(`[missions] ${action}: the second write (${e.puis.action}) refused by the script`, err)
      message = `${e.message} Mais le scribe n’a pu retirer la ligne d’attente qu’il avait dû écrire avec : retire-la avec « corriger » depuis l’Intendance (onglet En cours).`
    }
  }
  console.log(`[missions] ${action}: read ${(t1 - t0).toFixed(0)} ms, write ${(performance.now() - t1).toFixed(0)} ms, tabs in answer: ${ecrit.lu ? 'yes' : 'no'}`)
  // `reserves`: names just written in Membres (the page reads the register's names again).
  const reserves = (ecrit as { reserves?: unknown }).reserves
  return NextResponse.json({ ok: true, message, numero: e.numero, reserves: Array.isArray(reserves) ? reserves : [], donnees: ecrit.lu ? vue(ecrit.lu, qui) : null })
}
