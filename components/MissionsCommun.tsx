'use client'

import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import type { Article } from '@/lib/types'
import { cle, dicoAnglais } from '@/lib/missives'
import { etatMission, TEXTES_FEUILLETS, TEXTES_INTENDANCE } from '@/lib/intendance'
import { feuilletClos, ICONES_TYPES, livraisonDe, missionOuverte, TEXTES, VERBES, type Demande, type DonneesMissions, type Livraison, type Mission, type TypeMission } from '@/lib/missions'
import { Action, Icone, Plume } from './Ornements'
import type { CtxRegistre, RechercheLocale } from './Missives'

/*
 * The small pieces the book of Missions (components/Missions.tsx) and the Livre de l'Intendance
 * (components/Intendance.tsx) share: the registre's state said in character, a mission's glyph and line, the
 * points (internal: shown only to who opens the Trésor), the sealing of a note, a number cell, and the editor of
 * the lines of a hand-over (what, how many, for which mission). No effect sets state unconditionally here: the
 * suggestions and the mission a line fills are computed at render.
 */

export type Reponse = { ok: boolean; message: string; numero?: string; reserves?: string[] }

export const moiDe = (reg: CtxRegistre) => reg.r.marchand?.identite ?? reg.m?.donnees?.moi ?? null

/** Not linked, not read yet, unreadable: said in character (nothing else is shown then). */
export function Ferme({ reg }: { reg: CtxRegistre }) {
  const m = reg.m
  if (!m) return null
  if (m.erreur && !m.donnees)
    return (
      <div className="registre-ferme">
        <p>{m.erreur}</p>
        <Action icone="coursier" onClick={m.relire}>
          renvoyer le coursier
        </Action>
      </div>
    )
  if (!m.donnees) return <p className="registre-ferme attente-encre">Le scribe déroule le registre des missions…</p>
  if (!m.donnees.relie) return <p className="registre-ferme">Le registre des missions n&apos;est pas encore relié au grimoire. Qu&apos;un patriarche y pourvoie.</p>
  return null
}

/** Before the sheet's script knows the missions (v3m), or the Livre de l'Intendance (v3r): read, nothing written. */
export function Inactif({ reg, intendance = false }: { reg: CtxRegistre; intendance?: boolean }) {
  const d = reg.m?.donnees
  if (!d?.relie) return null
  if (!d.actif) return <p className="missions-inactif">{TEXTES.inactif}</p>
  if (intendance && !d.intendanceActive) return <p className="missions-inactif">{TEXTES_INTENDANCE.inactif}</p>
  return null
}

/** The registre's answer to the last gesture. */
export function Message({ reg }: { reg: CtxRegistre }) {
  const m = reg.m?.message
  if (!m) return null
  return (
    <p key={m.n} className={`message-encre ${m.ok ? 'ok' : 'erreur'}`} role="status">
      {m.texte}
    </p>
  )
}

export function GlypheType({ type, icones }: { type: TypeMission; icones: Record<string, string> }) {
  return (
    <span className={`glyphe-mission glyphe-${type === 'récolte' ? 'recolte' : type}`} title={type}>
      <Icone corps={icones[ICONES_TYPES[type]]} />
    </span>
  )
}

/* ───────────────────────── The Livraison, every sheet's last task (lot 2c) ───────────────────────── */

/** A sheet's Livraison (lib/missions.ts `livraisonDe`), its missive found among the computed ones. */
export function livraisonDu(reg: CtxRegistre, dm: Demande): Livraison {
  const d = reg.m!.donnees!
  const missive = dm.missive ? reg.r.calcul?.etats.find((e) => e.missive.numero === dm.missive)?.missive : undefined
  return livraisonDe(dm, d.missions, d.intendance, missive)
}

/** « à destination de Kesha » (who wrote the sheet, or the missive's client). */
export const destination = (l: Livraison) => (l.destination ? `à destination de ${l.destination}` : 'pour la caravane')

/** The Livraison's state in one or two words (a table cell). */
export const MOT_COURT_LIVRAISON: Record<Livraison['etat'], string> = { attend: 'à faire', prete: 'prête', livree: 'livrée', abandonnee: 'abandonnée', close: 'close' }

export function GlypheLivraison({ icones }: { icones: Record<string, string> }) {
  return (
    <span className="glyphe-mission glyphe-livraison" title="livraison">
      <Icone corps={icones['hand-truck']} />
    </span>
  )
}

/**
 * The gesture that does the Livraison: « Livrer la missive » for a missive not yet delivered (its own form, Fiche.tsx),
 * else « Clore la mission mère » (closing the caravan's own sheet is delivering it). Null when the reader may not, or
 * when the sheet is already closed.
 */
export function gesteLivraison(reg: CtxRegistre, dm: Demande, l: Livraison): { texte: string; ouvrir: () => void; pret: boolean; aide?: string } | null {
  const d = reg.m!.donnees!
  if (feuilletClos(dm)) return null
  if (l.missive && (l.etat === 'attend' || l.etat === 'prete')) {
    if (!permis(reg, 'cloture')) return null
    return { texte: 'Livrer la missive', ouvrir: () => reg.ouvrir({ genre: 'livrer', numero: dm.missive }), pret: true }
  }
  if (!permis(reg, 'fermer')) return null
  return { texte: 'Clore la mission mère', ouvrir: () => reg.ouvrir({ genre: 'fermer', cible: 'feuillet', numero: dm.numero }), pret: d.feuilletsActifs, aide: d.feuilletsActifs ? undefined : TEXTES_FEUILLETS.inactif }
}

export const pts = (n: number) =>`${new Intl.NumberFormat('fr-FR').format(n)} pt${Math.abs(n) > 1 ? 's' : ''}`
/** Points are internal (Missions v2): shown only to who opens the Trésor (lib/droits.ts « tresor »). */
export const voitPoints = (reg?: CtxRegistre) => reg?.r.marchand?.droits?.tresor === true
/** A mission's points, or nothing for a member who may not see them. */
export function Pts({ reg, n }: { reg?: CtxRegistre; n: number }) {
  return voitPoints(reg) ? <strong className="mission-points">{pts(n)}</strong> : null
}

/** « rareté à fixer » when a mission was sized without a known rarity (the weight itself stays internal). */
export function poids(m: Pick<Mission, 'type' | 'poids'> & { intermediaire?: boolean; note?: string }): ReactNode {
  if (m.poids !== null) return null
  return m.type === 'récolte' || m.intermediaire || /fixer/.test(m.note ?? '') ? <span className="a-fixer">{TEXTES.aFixer}</span> : null
}

/** A mission's small line: its parts, the empty ones left out, separated by a middle dot. */
export function Meta({ parts }: { parts: ReactNode[] }) {
  const pleins = parts.filter((x) => x !== null && x !== undefined && x !== false && x !== '')
  if (!pleins.length) return null
  return (
    <span className="mission-meta">
      {pleins.map((x, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {x}
        </span>
      ))}
    </span>
  )
}

export const ouvert = (reg?: CtxRegistre) => Boolean(reg?.m?.donnees?.relie)
/** The reader may take this action (the page hides what the server would refuse). */
export const permis = (reg: CtxRegistre, action: string) => Boolean(moiDe(reg)) && (reg.r.marchand?.droits as Record<string, boolean> | null | undefined)?.[action] !== false
export const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(n)

/** A page's own search field (the call, the Réception, the Sorties, the chest), kept per page like the chapters'. */
export function ChampRecherche({ recherche, placeholder }: { recherche?: RechercheLocale; placeholder: string }) {
  if (!recherche) return null
  return (
    <label className="recherche-locale">
      <Plume className="plume" />
      <input
        type="search"
        value={recherche.interactif ? recherche.valeur : ''}
        readOnly={!recherche.interactif}
        tabIndex={recherche.interactif ? 0 : -1}
        onChange={(e) => recherche.changer?.(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && recherche.changer?.('')}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  )
}

/** The sealing of a note: the scribe writes, the seal is stamped, the note goes. */
export function useScelle(fermer: () => void, reste = false) {
  const [etat, setEtat] = useState<'repos' | 'ecrit' | 'scelle'>('repos')
  const [erreur, setErreur] = useState<string | null>(null)
  const envoyer = async (f: () => Promise<Reponse>, apres?: () => void) => {
    if (etat !== 'repos') return
    setEtat('ecrit')
    setErreur(null)
    const r = await f()
    if (!r.ok) {
      setEtat('repos')
      setErreur(r.message)
      return
    }
    setEtat('scelle')
    setTimeout(() => {
      apres?.()
      fermer()
      // `reste`: the form stays on its note (an event's ledger, its « corriger »), back at rest so it can be sent
      // again. Otherwise the note rolls up showing « Consigné. ».
      if (reste) setEtat('repos')
    }, 1100)
  }
  return { etat, erreur, envoyer }
}

const nombreSaisi = (s: string) => {
  const t = s.replace(',', '.').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A number typed in a cell: the text is kept as typed (« 1, » on the way to « 1,5 »), the value follows. */
export function ChampNombre({ valeur, changer, ...props }: { valeur: number | null; changer: (v: number | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [t, setT] = useState(valeur === null ? '' : String(valeur).replace('.', ','))
  useEffect(() => {
    if (nombreSaisi(t) !== valeur) setT(valeur === null ? '' : String(valeur).replace('.', ','))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur])
  return (
    <input
      type="text"
      inputMode="decimal"
      value={t}
      onChange={(e) => {
        const s = e.target.value.replace(/[^\d.,]/g, '').slice(0, 8)
        setT(s)
        changer(nombreSaisi(s))
      }}
      {...props}
    />
  )
}

/* ───────────────────────── Items and missions a hand-over can name ───────────────────────── */

/**
 * Every name a mission or a gift can be about: raw materials, recipe ingredients and products, the day book's merchandise,
 * keyed by `cle` of the French name AND of the English one (lot 2b: « Wheat » finds « Blé »); the value is always the
 * French name. `anglais`: [English, French] pairs, for the fields' suggestions.
 */
export type NomsObjets = Map<string, string> & { anglais: [string, string][] }
export function nomsObjets(reg: CtxRegistre, articles: Article[]): NomsObjets {
  const noms = new Map<string, string>()
  const ajouter = (n: string) => n && !noms.has(cle(n)) && noms.set(cle(n), n)
  ;(reg.r.donnees?.ressources ?? []).forEach((r) => ajouter(r.nom))
  ;(reg.r.donnees?.recettes ?? []).filter((r) => !r.ombre).forEach((r) => (ajouter(r.produit), r.ingredients.forEach((i) => ajouter(i.nom))))
  articles.filter((a) => !a.ombre).forEach((a) => ajouter(a.fr))
  const dico = dicoAnglais(reg.r.donnees, articles)
  const anglais: [string, string][] = []
  for (const fr of [...noms.values()]) {
    const en = dico.get(cle(fr))
    if (en && !noms.has(cle(en))) {
      noms.set(cle(en), fr)
      anglais.push([en, fr])
    }
  }
  return Object.assign(noms, { anglais })
}

/** The French names of `nomsObjets`, once each, in alphabetical order. */
export const nomsFrancais = (noms: Map<string, string>) => [...new Set(noms.values())].sort((a, b) => a.localeCompare(b, 'fr'))

/** An item field's suggestions: every French name, then every English one (its French name as the label). */
export function OptionsObjets({ id, noms, seuls }: { id: string; noms: NomsObjets; seuls?: (fr: string) => boolean }) {
  const fr = nomsFrancais(noms).filter((n) => !seuls || seuls(n))
  return (
    <datalist id={id}>
      {fr.map((n) => (
        <option key={n} value={n} />
      ))}
      {noms.anglais
        .filter(([, f]) => !seuls || seuls(f))
        .map(([en, f]) => (
          <option key={`en-${en}`} value={en} label={f} />
        ))}
    </datalist>
  )
}

/** A mission a line can fill: a Missions row or a standing mission, with what it still lacks. */
export type Cible = { ref: string; objet: string; libelle: string; manque: number }

/** The missions the caravan still works on (filled ones included: a late delivery counts), newest sheets first. */
export function ciblesDe(d: DonneesMissions): Cible[] {
  const titres = new Map(d.demandes.map((x) => [x.numero, x.titre || `${nf(x.quantite)} ${x.article}`]))
  const res: Cible[] = []
  for (const m of [...d.missions].reverse()) {
    // Closed by hand, or its sheet (lot 2b): no new hand-over names it.
    if (/^(don|p-)/i.test(m.demande) || !missionOuverte(m, d.demandes)) continue
    const e = etatMission(m, d.intendance)
    res.push({ ref: m.numero, objet: m.objet, libelle: `${VERBES[m.type]} ${m.objet} · ${titres.get(m.demande) ?? m.demande}${e.comblee ? ' (comblée)' : ` (manque ${nf(e.manque)})`}`, manque: e.manque })
  }
  // A standing mission paused or closed is not offered (lot 2b: paused from « En cours »).
  for (const p of d.permanentes) if (p.statut === 'ouverte') res.push({ ref: p.id, objet: p.objet, libelle: `${VERBES[p.type]} ${p.objet} · mission permanente`, manque: 1 })
  return res
}

/** A line typed on a hand-over: `mission` '?' = the first mission of that item that lacks something (computed). */
export type LigneSaisie = { objet: string; quantite: string; mission: string }
export const LIGNE_VIDE: LigneSaisie = { objet: '', quantite: '', mission: '?' }

/** The mission a line fills: the one chosen, else (« ? ») the first one of its item that lacks something, else none. */
export function missionDe(l: LigneSaisie, cibles: Cible[], noms: Map<string, string>): string {
  if (l.mission !== '?') return l.mission
  const k = cle(noms.get(cle(l.objet)) ?? l.objet)
  const pour = cibles.filter((c) => cle(c.objet) === k)
  return (pour.find((c) => c.manque > 0) ?? pour[0])?.ref ?? ''
}

/** The lines as the server reads them; `null` while a line is incomplete. */
export function lignesEnvoyees(lignes: LigneSaisie[], cibles: Cible[], noms: Map<string, string>) {
  const pleines = lignes.filter((l) => l.objet.trim() || l.quantite)
  if (!pleines.length || pleines.some((l) => !noms.has(cle(l.objet)) || !(Number(l.quantite) >= 1))) return null
  return pleines.map((l) => ({ objet: noms.get(cle(l.objet))!, quantite: Number(l.quantite), mission: missionDe(l, cibles, noms) }))
}

/**
 * The editor of a hand-over's lines: what (the known items suggested), how many, for which mission (only the missions
 * of that item; « aucune : un don »). `fige`: the first line's item and mission are set (opened from a mission);
 * `unique`: one line only.
 */
export function LignesObjets({ lignes, changer, noms, cibles, fige = false, sansMission = false, unique = false }: { lignes: LigneSaisie[]; changer: (l: LigneSaisie[]) => void; noms: NomsObjets; cibles: Cible[]; fige?: boolean; sansMission?: boolean; unique?: boolean }) {
  const id = useId()
  const regler = (i: number, x: Partial<LigneSaisie>) => changer(lignes.map((l, k) => (k === i ? { ...l, ...x } : l)))
  return (
    <div className="lignes-objets">
      <OptionsObjets id={id} noms={noms} />
      {lignes.map((l, i) => {
        const k = cle(l.objet)
        const connu = noms.get(k)
        const pour = connu ? cibles.filter((c) => cle(c.objet) === k) : []
        const choisie = missionDe(l, cibles, noms)
        const bloque = fige && i === 0
        return (
          <div key={i} className="ligne-objet">
            <label className="fiche-champ ligne-objet-quoi">
              <span>Quoi</span>
              <input type="text" list={id} value={l.objet} readOnly={bloque} placeholder="Blé, Bière…" maxLength={120} onChange={(e) => regler(i, { objet: e.target.value, mission: '?' })} />
            </label>
            <label className="fiche-champ ligne-objet-combien">
              <span>Combien</span>
              <input type="text" inputMode="numeric" value={l.quantite} placeholder="50" onChange={(e) => regler(i, { quantite: e.target.value.replace(/\D/g, '').slice(0, 7) })} />
            </label>
            {!sansMission && (
              <label className="fiche-champ ligne-objet-pour">
                <span>Pour</span>
                <select value={choisie} disabled={bloque || !connu} onChange={(e) => regler(i, { mission: e.target.value })}>
                  <option value="">aucune mission : un don</option>
                  {pour.map((c) => (
                    <option key={c.ref} value={c.ref}>
                      {c.libelle}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {lignes.length > 1 && !bloque && (
              <button type="button" className="fiche-rayer ligne-objet-rayer" aria-label={`Retirer la ligne ${l.objet || i + 1}`} title="Retirer la ligne" onClick={() => changer(lignes.filter((_, x) => x !== i))}>
                ✕
              </button>
            )}
            {l.objet.trim() && !connu && <em className="champ-nom-avis inconnu ligne-objet-avis">Khajiit ne connaît nulle ressource ni marchandise de ce nom.</em>}
          </div>
        )
      })}
      {!unique && lignes.length < 30 && (
        <button type="button" className="lien-encre ligne-objet-ajouter" onClick={() => changer([...lignes, LIGNE_VIDE])}>
          + une autre ligne
        </button>
      )}
    </div>
  )
}
