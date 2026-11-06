// The Livre de l'Intendance (Missions v2, lot 2): everything that enters the caravan's chest or leaves it, recorded
// by someone allowed (an aide de camp, a Patriarch…). One row of the « Intendance » tab per thing (script v3r, asked
// with `intendance: true`; an older script does not send the tab: `actif` false, every new gesture is refused in
// character and the pages say the registre is not ready yet).
//
// - Entries (Réception): a hand-over for a mission (« remise »), a gift (« don », named or anonymous), what comes back
//   from a craft (a « remise » linked to its « façonnage »), unused materials put back (« rentrée »). A member may
//   declare one himself (he handed it to someone, or left it in the « coffre des petites lunes »): it waits « en
//   attente » until someone allowed answers yes or no, line by line. What waits is not stock.
// - Exits (Sorties): materials taken out to craft (« façonnage », open until the goods come back or it is closed), a
//   sale's goods taken from the chest (« vente », declared on the order sheet, waiting for its confirmation), a loss
//   (« perte »).
// The chest's stock stays the Mouvements ledger (lib/missives.ts `rejouer`): an entry received writes a « dépôt » row,
// an exit a « livraison » row (negative), so every older reader of the chest sees the same stock.
// Pure: no server-only import.

import { cle, type Onglets } from './missives'
import type { Mission, Permanente } from './missions'

export type GenreIntendance = 'remise' | 'don' | 'rentrée' | 'façonnage' | 'vente' | 'perte'
export type StatutIntendance = 'en attente' | 'reçue' | 'refusée' | 'en cours' | 'close' | 'sortie'

export type LigneIntendance = {
  id: string
  date: string
  genre: GenreIntendance
  statut: StatutIntendance
  /** Who handed it over, gave it, crafts it, sold it ('' for an anonymous gift). */
  membre: string
  objet: string
  quantite: number
  /** The mission it fills (a Missions row's N°, or a standing mission's « P-… »). */
  mission: string
  demande: string
  missive: string
  commande: string
  /** A return's or a rentrée's façonnage. */
  lien: string
  /** « petites lunes »: it went through the open chest. */
  coffre: string
  /** Who recorded or answered it, and when. */
  par: string
  le: string
  /** Points credited (internal: sent only to who opens the Trésor). */
  points: number | null
  note: string
  /** Written on the page, the registre's answer still awaited. */
  enAttente?: boolean
}

export const PETITES_LUNES = 'petites lunes'
/** The Rôle a name reserved at the Réception gets (Ludo, S1): a « Petite lune » with no Discord seal yet. */
export const ROLE_RESERVE = 'Petite lune'

export const ENTREES: GenreIntendance[] = ['remise', 'don', 'rentrée']
export const SORTIES: GenreIntendance[] = ['façonnage', 'vente', 'perte']
export const estEntree = (l: Pick<LigneIntendance, 'genre'>) => ENTREES.includes(l.genre)

/** game-icons.net glyphs of the Intendance (loaded with the book's other icons). */
export const ICONES_INTENDANCE = ['cargo-crate', 'entry-door', 'exit-door', 'notebook', 'moon', 'hand', 'quill-ink', 'drop', 'sell-card', 'scroll-quill', 'magnifying-glass']

export const TEXTES_INTENDANCE = {
  /** Before the sheet's script knows the Livre de l'Intendance (v3r). */
  inactif:
    'Le scribe du registre ne tient pas encore le Livre de l’Intendance : les pages se lisent, mais rien ne s’y inscrit tant que le dernier script du grimoire (v3r) n’est pas recopié dans la feuille.',
  refus: 'Le scribe du registre ne sait pas encore tenir le Livre de l’Intendance : qu’on recopie le dernier script du grimoire (v3r) dans la feuille, puis qu’on réessaie.',
  dejaRepondu: 'Une autre patte a déjà répondu pour cette ligne : le registre est à jour.',
  soiMeme: 'Nul ne reçoit ce qu’il a lui-même déposé : qu’une autre patte réponde.',
}

/** Lot 2b: the sheets and missions edited, closed and reopened from the Intendance (script v3s). */
export const TEXTES_FEUILLETS = {
  inactif: 'Le scribe du registre ne sait pas encore corriger ni clore une mission mère : les missions se lisent, mais ces gestes attendent que le dernier script du grimoire (v3s) soit recopié dans la feuille.',
  refus: 'Le scribe du registre ne sait pas encore corriger ni clore une mission mère : qu’on recopie le dernier script du grimoire (v3s) dans la feuille, puis qu’on réessaie.',
  change: 'Une autre patte a touché cette mission mère entre-temps : le registre est relu, regarde et recommence.',
  missionClose: (objet: string) => `La mission « ${objet} » est close : rouvre-la depuis le Livre de l’Intendance, ou consigne ce qui arrive comme un don.`,
}

/* ───────────────────────── Reading ───────────────────────── */

const texte = (v: unknown) => String(v ?? '').trim()
const nombre = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')
  if (!t || t === '-' || t === '.') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const date = (v: unknown) => {
  const t = texte(v)
  if (!t) return ''
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toISOString()
}

function genreLu(v: unknown): GenreIntendance | null {
  const k = cle(texte(v))
  if (k.startsWith('remise')) return 'remise'
  if (k.startsWith('don')) return 'don'
  if (k.startsWith('rentr')) return 'rentrée'
  if (k.startsWith('faconn')) return 'façonnage'
  if (k.startsWith('vente')) return 'vente'
  if (k.startsWith('perte') || k.startsWith('sortie')) return 'perte'
  return null
}
function statutLu(v: unknown, genre: GenreIntendance): StatutIntendance {
  const k = cle(texte(v))
  if (k.startsWith('attente') || k.startsWith('enattente')) return 'en attente'
  if (k.startsWith('refus')) return 'refusée'
  if (k.startsWith('encours')) return 'en cours'
  if (k.startsWith('clos')) return 'close'
  if (k.startsWith('sorti')) return 'sortie'
  if (k.startsWith('recu')) return 'reçue'
  // A row typed by hand without a status: an entry is received, an exit done, a craft running.
  return genre === 'façonnage' ? 'en cours' : estEntree({ genre }) ? 'reçue' : 'sortie'
}

/** The Intendance tab (v3r, asked with `intendance: true`); `actif` false with an older script. */
export function lireIntendance(o: Onglets & { intendance?: Record<string, unknown>[] }): { actif: boolean; lignes: LigneIntendance[] } {
  const actif = Array.isArray(o.intendance)
  const lignes: LigneIntendance[] = []
  for (const r of o.intendance ?? []) {
    const genre = genreLu(r.genre)
    const id = texte(r.id)
    const objet = texte(r.objet)
    if (!genre || !id || !objet) continue
    lignes.push({
      id,
      date: date(r.date),
      genre,
      statut: statutLu(r.statut, genre),
      membre: texte(r.membre),
      objet,
      quantite: nombre(r.quantite) ?? 0,
      mission: texte(r.mission),
      demande: texte(r.demande),
      missive: texte(r.missive),
      commande: texte(r.commande),
      lien: texte(r.lien),
      coffre: texte(r.coffre),
      par: texte(r.par),
      le: date(r.le),
      points: nombre(r.points),
      note: texte(r.note),
    })
  }
  return { actif, lignes }
}

/* ───────────────────────── What a mission has received ───────────────────────── */

/**
 * A mission's progress: `requis` (its quantity), `recu` (received: the rows « reçue » that name it, plus a mission
 * completed the prototype's way — « accomplie »), `attente` (declared, not yet answered), `manque`, `comblee`. A filled
 * mission is never closed: later hand-overs still count.
 */
export function etatMission(m: Pick<Mission, 'numero' | 'quantite' | 'statut'>, lignes: LigneIntendance[]) {
  let recu = m.statut === 'accomplie' ? m.quantite : 0
  let attente = 0
  for (const l of lignes) {
    if (l.mission !== m.numero || !estEntree(l)) continue
    if (l.statut === 'reçue') recu += l.quantite
    else if (l.statut === 'en attente') attente += l.quantite
  }
  const manque = Math.max(0, m.quantite - recu)
  return { requis: m.quantite, recu, attente, manque, comblee: manque === 0, avance: m.quantite > 0 ? Math.min(1, recu / m.quantite) : 1 }
}

/** Who brought what to these missions (rows received), most first: names only, never points. */
export function porteurs(numeros: Set<string>, lignes: LigneIntendance[], missions: Mission[] = []) {
  const par = new Map<string, { membre: string; quantite: number; fois: number }>()
  const ajouter = (membre: string, q: number) => {
    const nom = membre || 'Anonyme'
    const k = cle(nom)
    const p = par.get(k) ?? { membre: nom, quantite: 0, fois: 0 }
    p.quantite += q
    p.fois++
    par.set(k, p)
  }
  for (const l of lignes) if (numeros.has(l.mission) && l.statut === 'reçue' && estEntree(l)) ajouter(l.membre, l.quantite)
  for (const m of missions) if (numeros.has(m.numero) && m.statut === 'accomplie' && m.prisPar) ajouter(m.prisPar, m.quantite)
  return [...par.values()].sort((a, b) => b.fois - a.fois || a.membre.localeCompare(b.membre, 'fr'))
}

/** A craft out of the chest: what came back (its returns received) and what is still awaited. */
export function etatFaconnage(f: LigneIntendance, lignes: LigneIntendance[]) {
  const revenu = lignes.filter((l) => l.lien === f.id && l.genre === 'remise' && l.statut === 'reçue').reduce((t, l) => t + l.quantite, 0)
  const attendu = Math.max(0, f.quantite - revenu)
  return { revenu, attendu, ouvert: f.statut === 'en cours' && attendu > 0 }
}

/** Points per unit of a mission or a standing mission (late or extra deliveries earn at the same rate). */
export const tauxDe = (x: Pick<Mission, 'points' | 'quantite'> | Pick<Permanente, 'points' | 'quantite'>) => (x.quantite > 0 ? x.points / x.quantite : 0)

/** « 50 Bière » */
export const objetQ = (q: number, objet: string) => `${new Intl.NumberFormat('fr-FR').format(q)} ${objet}`

/** A row's few words: « remise de J'Zahir », « don anonyme », « sortie pour façonner chez X »… */
export function quoiLigne(l: LigneIntendance): string {
  const qui = l.membre || 'une patte anonyme'
  switch (l.genre) {
    case 'remise':
      return l.lien ? `revenu de chez ${qui}` : `remis par ${qui}`
    case 'don':
      return l.membre ? `don de ${qui}` : 'don anonyme'
    case 'rentrée':
      return `rentré de chez ${qui}`
    case 'façonnage':
      return `sorti pour façonner chez ${qui}`
    case 'vente':
      return `vendu par ${qui}${l.commande ? ` (bon ${l.commande})` : ''}`
    case 'perte':
      return l.note || 'sorti du coffre'
  }
}
