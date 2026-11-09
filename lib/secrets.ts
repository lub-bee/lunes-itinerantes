// The Livre d'ombre v2 (2026-11-09): the secrets the shadow members send, their sorting, merging and archives, and the
// contraband list. Everything lives in two hidden tabs written by the sheet's script (grimoire.gs v3u, asked with
// `ombre: true`): « Secrets » (one row per note) and « Contrebande » (one row per line of the list). Pure: no server-only
// import (the page reads the types, the words and the merge format too).
//
// Who sees what (lib/droits.ts, every rule checked by app/api/ombre and again by the script):
// - `secret` (Patriarches, « . », Voix de la sécurité): send a secret; read only the ones they sent, with their state;
// - `secretTri` (Patriarches, Voix de la sécurité): the sealed envelopes and the notes: open, classify, merge, correct, remove;
// - `secretArchives` (the same): every note, with search and filters; a removed note is given back from there;
// - `contrebande` (Patriarches, Voix de la sécurité, Voix du commerce): read and correct the contraband list.
// A removed note (« retirée ») leaves every page, its informant's included; its row stays in the sheet.

import { cle } from './missives'

/** What the shadow book's pages ask of /api/ombre. `retirerSecret`: a note removed; `rendre`: given back from the archives. */
export type ActionSecret = 'secret' | 'ouvrir' | 'classer' | 'corriger' | 'fusionner' | 'retirerSecret' | 'rendre' | 'contrebande'

/** A note's states, as written in the « État » column. */
export const ETATS = { scellee: 'scellée', ouverte: 'ouverte', classee: 'classée', fusionnee: 'fusionnée', retiree: 'retirée' } as const
export type Etat = (typeof ETATS)[keyof typeof ETATS]

/** The urgency, a short list (the most pressing first); « Brûlante » and « Pressante » come first everywhere. */
export const URGENCES = ['Brûlante', 'Pressante', 'Ordinaire', 'Sans hâte'] as const
export const URGENTES = ['Brûlante', 'Pressante']
/** Inside or outside the caravan. */
export const PORTEES = ['Interne', 'Externe'] as const

export const LIMITES = { titre: 120, contenu: 6000, texte: 40000, champ: 120, prix: 80, contrebande: 4000 }

export type Secret = {
  id: string
  /** When it was sent (ISO). */
  depose: string
  informateur: string
  titre: string
  contenu: string
  urgence: string
  prix: string
  provenance: string
  destinataire: string
  faction: string
  /** « Interne » / « Externe » (or empty). */
  portee: string
  etat: Etat
  ouvertPar: string
  ouvertLe: string
  /** A merged note: the number of the note it joined. */
  fusionneeDans: string
  corrigeePar: string
  corrigeeLe: string
  retireePar: string
  retireeLe: string
}

export type Contrebande = { lignes: string[]; par: string; le: string }

const texte = (v: unknown) => String(v ?? '').trim()
const date = (v: unknown) => {
  const t = texte(v)
  if (!t) return ''
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toISOString()
}

/** A state read leniently (case, accents); an empty or unknown cell is a sealed envelope. */
export function etatLu(v: unknown): Etat {
  const k = cle(texte(v))
  if (k.startsWith('retir')) return ETATS.retiree
  if (k.startsWith('fusion') || k.startsWith('joint')) return ETATS.fusionnee
  if (k.startsWith('class')) return ETATS.classee
  if (k.startsWith('ouvert') || k.startsWith('lu')) return ETATS.ouverte
  return ETATS.scellee
}

/**
 * The two tabs, typed. `actif`: the script answered them (v3u, asked with `ombre: true`); with an older script the shadow
 * book's new pages say so in character and nothing is written.
 */
export function lireSecrets(o: { secrets?: Record<string, unknown>[]; contrebande?: Record<string, unknown>[] }) {
  const actif = Array.isArray(o.secrets) && Array.isArray(o.contrebande)
  const secrets: Secret[] = (o.secrets ?? [])
    .map((r) => ({
      id: texte(r.id),
      depose: date(r.depose),
      informateur: texte(r.informateur),
      titre: texte(r.titre),
      contenu: String(r.contenu ?? '').replace(/\r\n?/g, '\n').trim(),
      urgence: texte(r.urgence),
      prix: texte(r.prix),
      provenance: texte(r.provenance),
      destinataire: texte(r.destinataire),
      faction: texte(r.faction),
      portee: texte(r.portee),
      etat: etatLu(r.etat),
      ouvertPar: texte(r.ouvertPar),
      ouvertLe: date(r.ouvertLe),
      fusionneeDans: texte(r.fusionneeDans),
      corrigeePar: texte(r.corrigeePar),
      corrigeeLe: date(r.corrigeeLe),
      retireePar: texte(r.retireePar),
      retireeLe: date(r.retireeLe),
    }))
    .filter((s) => s.id)
  const rangs = (o.contrebande ?? []).filter((r) => texte(r.ligne))
  const dernier = rangs[rangs.length - 1]
  const contrebande: Contrebande = { lignes: rangs.map((r) => texte(r.ligne)), par: texte(dernier?.par), le: date(dernier?.le) }
  return { actif, secrets, contrebande }
}

/** Urgent first (« Brûlante », then « Pressante »…), then the newest. */
export const rangUrgence = (u: string) => {
  const i = URGENCES.findIndex((x) => cle(x) === cle(u))
  return i < 0 ? URGENCES.length : i
}
export const estUrgente = (s: Pick<Secret, 'urgence'>) => URGENTES.some((u) => cle(u) === cle(s.urgence))
export const parUrgence = (a: Secret, b: Secret) => rangUrgence(a.urgence) - rangUrgence(b.urgence) || b.depose.localeCompare(a.depose)

/** A note still in play (neither merged into another nor removed). */
export const vivante = (s: Secret) => s.etat !== ETATS.fusionnee && s.etat !== ETATS.retiree

/* ───────────────────────── Merging ───────────────────────── */

/** The day of a contribution, as its heading writes it: 12/11/2026 (Tokyo time). */
export function jourEntete(iso: string): string {
  const d = new Date(iso || Date.now())
  if (Number.isNaN(d.getTime())) return ''
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year}`
}

/** A contribution's heading: « Elijah ----------- 12/11/2026 » (the script writes the same, grimoire.gs v3u `enteteFusion`). */
export const enteteContribution = (auteur: string, iso: string) => `${auteur || 'Anonyme'} ----------- ${jourEntete(iso)}`

/** A heading line of a merged note (author, a run of dashes, a day). */
export const RE_ENTETE = /^(.+?)\s+-{3,}\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*$/

/** A merged note's text cut at its headings, to draw them (the text itself stays one plain text, editable whole). */
export function contributions(contenu: string): { auteur: string; jour: string; texte: string }[] {
  const res: { auteur: string; jour: string; texte: string }[] = []
  let cur: { auteur: string; jour: string; lignes: string[] } | null = null
  const avant: string[] = []
  for (const ligne of contenu.split('\n')) {
    const m = ligne.match(RE_ENTETE)
    if (m) {
      if (cur) res.push({ auteur: cur.auteur, jour: cur.jour, texte: cur.lignes.join('\n').trim() })
      cur = { auteur: m[1].trim(), jour: m[2], lignes: [] }
    } else if (cur) cur.lignes.push(ligne)
    else avant.push(ligne)
  }
  if (cur) res.push({ auteur: cur.auteur, jour: cur.jour, texte: cur.lignes.join('\n').trim() })
  const tete = avant.join('\n').trim()
  return tete ? [{ auteur: '', jour: '', texte: tete }, ...res] : res
}

/**
 * The text of a note once another one is merged into it: each contribution under its heading (the target's own heading
 * added when it has none yet), one plain text. The script does the same under its lock (it holds both rows).
 */
export function texteFusionne(cible: Pick<Secret, 'contenu' | 'informateur' | 'depose'>, source: Pick<Secret, 'contenu' | 'informateur' | 'depose'>): string {
  const avecEntete = (s: Pick<Secret, 'contenu' | 'informateur' | 'depose'>) => {
    const t = s.contenu.trim()
    return RE_ENTETE.test(t.split('\n')[0] ?? '') ? t : `${enteteContribution(s.informateur, s.depose)}\n${t}`
  }
  return `${avecEntete(cible)}\n\n${avecEntete(source)}`
}

/* ───────────────────────── What a reader receives ───────────────────────── */

export type DroitsOmbre = { secret: boolean; tri: boolean; archives: boolean; contrebande: boolean }

/** A note as its informant sees it among « Mes secrets »: what they wrote and its state, nothing of the sorting. */
export type MonSecret = Pick<Secret, 'id' | 'depose' | 'titre' | 'contenu' | 'urgence' | 'prix' | 'provenance' | 'destinataire' | 'faction' | 'portee' | 'etat'>

export type VueOmbre = {
  /** The script holds the shadow book's tabs (v3u). */
  actif: boolean
  droits: DroitsOmbre
  /** The signed member (the informant of « Mes secrets »). */
  moi: string | null
  /** The signed member's own notes (not removed), newest first. */
  miens: MonSecret[]
  /** Every note but the removed ones (sorters and archives); empty for anyone else. */
  notes: Secret[]
  /** The removed notes (archives only). */
  retirees: Secret[]
  /** The contraband list (who may hold it), else null. */
  contrebande: Contrebande | null
  version: number
}

/** Only what this reader may see (lib/droits.ts gestures); the rest never leaves the server. */
export function vueOmbre(l: ReturnType<typeof lireSecrets>, moi: string | null, d: DroitsOmbre, version: number): VueOmbre {
  const tous = [...l.secrets].sort((a, b) => b.depose.localeCompare(a.depose))
  const miens: MonSecret[] =
    d.secret && moi
      ? tous
          .filter((s) => cle(s.informateur) === cle(moi) && s.etat !== ETATS.retiree)
          .map(({ id, depose, titre, contenu, urgence, prix, provenance, destinataire, faction, portee, etat }) => ({ id, depose, titre, contenu, urgence, prix, provenance, destinataire, faction, portee, etat }))
      : []
  const voitTout = d.tri || d.archives
  return {
    actif: l.actif,
    droits: d,
    moi,
    miens,
    notes: voitTout ? tous.filter((s) => s.etat !== ETATS.retiree) : [],
    retirees: d.archives ? tous.filter((s) => s.etat === ETATS.retiree) : [],
    contrebande: d.contrebande ? l.contrebande : null,
    version,
  }
}

/** What the informant reads of a state. */
export const MOT_ETAT: Record<Etat, string> = {
  scellée: 'scellé, pas encore ouvert',
  ouverte: 'ouvert par la Voix de la sécurité',
  classée: 'lu et classé',
  fusionnée: 'joint à une autre note',
  retirée: 'retiré',
}

/** The archives' filters: what each one may match. */
export type Filtres = { requete: string; faction: string; provenance: string; urgence: string; informateur: string; du: string; au: string }
export const FILTRES_VIDES: Filtres = { requete: '', faction: '', provenance: '', urgence: '', informateur: '', du: '', au: '' }

/** The day of an ISO date in Tokyo (YYYY-MM-DD), for the date filters. */
export const jourIso = (iso: string) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) : '')

export function filtrer(notes: Secret[], f: Filtres): Secret[] {
  const contient = (a: string, b: string) => !b.trim() || cle(a).includes(cle(b))
  const mots = f.requete.split(/\s+/).map(cle).filter(Boolean)
  return notes.filter((s) => {
    const tout = cle([s.titre, s.contenu, s.faction, s.provenance, s.destinataire, s.informateur, s.prix, s.id].join(' '))
    if (mots.some((m) => !tout.includes(m))) return false
    if (!contient(s.faction, f.faction) || !contient(s.provenance, f.provenance) || !contient(s.informateur, f.informateur)) return false
    if (f.urgence && cle(s.urgence) !== cle(f.urgence)) return false
    const j = jourIso(s.depose)
    if (f.du && j < f.du) return false
    if (f.au && j > f.au) return false
    return true
  })
}

/** The distinct values of a field (the archives' suggestions), in the order of the French alphabet. */
export const valeurs = (notes: Secret[], champ: 'faction' | 'provenance' | 'informateur' | 'destinataire') =>
  [...new Map(notes.map((s) => s[champ]).filter(Boolean).map((v) => [cle(v), v])).values()].sort((a, b) => a.localeCompare(b, 'fr'))
