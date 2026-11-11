'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PageSecrets } from '@/lib/types'
import { dateTamrielique } from '@/lib/format'
import { TEXTES as OMBRE } from '@/lib/ombre'
import {
  contributions,
  ETATS,
  estUrgente,
  filtrer,
  FILTRES_VIDES,
  jourEntete,
  LIMITES,
  MOT_ETAT,
  parUrgence,
  PORTEES,
  URGENCES,
  valeurs,
  vivante,
  type ActionSecret,
  type Etat,
  type Filtres,
  type MonSecret,
  type Secret,
  type VueOmbre,
} from '@/lib/secrets'
import { Action } from './Ornements'
import { Geste as GesteBouton, type CtxRegistre } from './Missives'

/*
 * The Livre d'ombre v2 (lib/secrets.ts, app/api/ombre): « Transmettre un secret » (a letter in the style of the Table's
 * « création d'affaire » billet, then « Mes secrets »), « Le tri » (the sealed envelopes, the notes: open, classify, merge,
 * correct, remove), « Archives » (everything, searched and filtered; the removed notes given back), and the contraband list
 * (« Gestion de la contrebande »), shown where goods are listed. The server decides what each reader receives; the page only
 * draws it. Since 2026-11-11 the letter, one's own secrets, the envelopes and the notes open in a note laid on the left page
 * (components/Fiche.tsx, `contenuSecret`); the lists stay on the right page. The letter's draft and the filters survive page
 * turns (kept in the hook).
 */

export type Brouillon = { titre: string; contenu: string; urgence: string; prix: string; provenance: string; destinataire: string; faction: string; portee: string }
const BROUILLON_VIDE: Brouillon = { titre: '', contenu: '', urgence: '', prix: '', provenance: '', destinataire: '', faction: '', portee: '' }

type Reponse = { ok: boolean; message: string; numero?: string }

const ECHEC = "Le coursier n'est pas revenu de l'ombre. Rien n'a été écrit : réessaie."
const FERME = "Le registre de l'ombre ne répond pas : le coursier n'a pu l'ouvrir."

/** The secrets as the signed reader may see them, and the state the pages share. */
export function useSecrets(signe: string | null) {
  const [donnees, setDonnees] = useState<VueOmbre | null | undefined>(undefined)
  const [erreur, setErreur] = useState<string | null>(null)
  const [brouillon, setBrouillon] = useState<Brouillon>(BROUILLON_VIDE)
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES)
  /** « Le tri »'s own filters (urgency, inside / outside), apart from the archives'. */
  const [filtresTri, setFiltresTri] = useState<Filtres>(FILTRES_VIDES)
  const version = useRef(0)
  const recevoir = useCallback((d: VueOmbre | null) => {
    if (d) version.current = Math.max(version.current, d.version ?? 0)
    setDonnees(d)
  }, [])
  const lire = useCallback(() => {
    setErreur(null)
    return fetch(`/api/ombre?v=${version.current}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { donnees?: VueOmbre | null; message?: string } | null
        if (r.ok && j && 'donnees' in j) recevoir(j.donnees ?? null)
        else setErreur(j?.message ?? FERME)
      })
      .catch(() => setErreur(FERME))
  }, [recevoir])
  useEffect(() => {
    lire()
  }, [lire, signe])
  const agir = useCallback(
    async (action: ActionSecret, corps: Record<string, unknown>): Promise<Reponse> => {
      try {
        const rep = await fetch('/api/ombre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, vu: version.current, ...corps }) })
        const r = (await rep.json().catch(() => null)) as { ok?: boolean; message?: string; numero?: string; donnees?: VueOmbre | null } | null
        if (r?.donnees) recevoir(r.donnees)
        return { ok: Boolean(rep.ok && r?.ok), message: r?.message ?? ECHEC, numero: r?.numero }
      } catch {
        return { ok: false, message: ECHEC }
      }
    },
    [recevoir],
  )
  return { donnees, erreur, relire: lire, agir, brouillon, setBrouillon, filtres, setFiltres, filtresTri, setFiltresTri }
}

export type EtatSecrets = ReturnType<typeof useSecrets>

/* ───────────────────────── Small pieces ───────────────────────── */

const jour = (iso: string) => (iso ? dateTamrielique(iso) : '')

/** The day in Tamriel's months, the real day on hover. */
function Jour({ iso }: { iso: string }) {
  if (!iso) return null
  return <span title={jourEntete(iso)}>{jour(iso)}</span>
}

/** An in-character answer of the registre, under the gesture. */
function Mot({ m }: { m: { ok: boolean; texte: string } | null }) {
  if (!m) return null
  return (
    <p className={`message-encre ${m.ok ? 'ok' : 'erreur'}`} role={m.ok ? 'status' : 'alert'}>
      {m.texte}
    </p>
  )
}

/**
 * The page's state before its data: reading, unreadable, not linked, a script too old. `sansScript`: the page shows anyway
 * under the « not ready » notice when the sheet's script is still older than v3u (the letter: its seal then answers why
 * nothing is written, in character, 2026-11-09).
 */
function EtatPage({ o, sansScript = false, children }: { o?: EtatSecrets; sansScript?: boolean; children: (d: VueOmbre) => ReactNode }) {
  if (!o) return null
  if (o.erreur && o.donnees === undefined)
    return (
      <div className="registre-ferme">
        <p>{o.erreur}</p>
        <Action icone="coursier" onClick={o.relire}>
          renvoyer le coursier
        </Action>
      </div>
    )
  if (o.donnees === undefined) return <p className="registre-ferme attente-encre">Le scribe de l’ombre déroule ses plis…</p>
  if (o.donnees === null) return <p className="registre-ferme">Le registre n’est pas encore relié au grimoire.</p>
  if (!o.donnees.moi) return <p className="registre-ferme">Signe d’abord l’ex-libris : l’ombre ne reçoit que les membres de la caravane.</p>
  if (!o.donnees.actif)
    return sansScript ? (
      <>
        <p className="registre-ferme">{OMBRE.pasPret}</p>
        {children(o.donnees)}
      </>
    ) : (
      <p className="registre-ferme">{OMBRE.pasPret}</p>
    )
  return <>{children(o.donnees)}</>
}

/** The urgency as a small ink stamp (red when urgent). */
function Urgence({ u }: { u: string }) {
  if (!u) return null
  return <span className={`secret-urgence ${estUrgente({ urgence: u }) ? 'urgente' : ''}`}>{u}</span>
}

/** A merged note's text: each contribution under its heading (author, a rule, the day), the rest as written. */
export function TexteNote({ contenu }: { contenu: string }) {
  const parts = contributions(contenu)
  return (
    <div className="secret-texte">
      {parts.map((p, i) => (
        <div key={i} className="secret-apport">
          {p.auteur && (
            <p className="secret-apport-tete">
              <span className="apport-auteur">{p.auteur}</span>
              <span className="apport-filet" aria-hidden />
              <span className="apport-jour">{p.jour}</span>
            </p>
          )}
          <p className="secret-apport-texte">{p.texte}</p>
        </div>
      ))}
    </div>
  )
}

/** A note's fields as a short ledger (only those filled). */
function Champs({ s }: { s: Pick<Secret, 'urgence' | 'prix' | 'provenance' | 'destinataire' | 'faction' | 'portee'> }) {
  const lignes: [string, string][] = (
    [
      ['Urgence', s.urgence],
      ['Prix', s.prix],
      ['Interne ou externe', s.portee],
      ['Provenance', s.provenance],
      ['Destinataire', s.destinataire],
      ['Faction', s.faction],
    ] as [string, string][]
  ).filter(([, v]) => v)
  if (!lignes.length) return null
  return (
    <dl className="secret-champs">
      {lignes.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Two inked stamps to choose from (urgency, inside / outside), the chosen one pressed; touched again: none. */
function Tampons({ liste, valeur, changer, fige, etiquette }: { liste: readonly string[]; valeur: string; changer: (v: string) => void; fige: boolean; etiquette: string }) {
  return (
    <div className="lettre-choix" role="radiogroup" aria-label={etiquette}>
      {liste.map((x) => (
        <button
          key={x}
          type="button"
          role="radio"
          aria-checked={valeur === x}
          className={`lettre-tampon ${valeur === x ? 'choisi' : ''} ${estUrgente({ urgence: x }) ? 'urgente' : ''}`}
          disabled={fige}
          onClick={() => changer(valeur === x ? '' : x)}
        >
          {x}
        </button>
      ))}
    </div>
  )
}

/** The free fields of a note (Prix, Provenance, Destinataire, Faction), on ruled lines. */
function ChampsLibres({ v, changer, fige, id }: { v: Pick<Brouillon, 'prix' | 'provenance' | 'destinataire' | 'faction'>; changer: (k: 'prix' | 'provenance' | 'destinataire' | 'faction', t: string) => void; fige: boolean; id: string }) {
  const champ = (k: 'prix' | 'provenance' | 'destinataire' | 'faction', mot: string, aide: string, max: number) => (
    <label className="lettre-champ" htmlFor={`${id}-${k}`}>
      <span className="lettre-rubrique">{mot}</span>
      <input id={`${id}-${k}`} className="lettre-ligne" value={v[k]} onChange={(e) => changer(k, e.target.value)} maxLength={max} placeholder={aide} disabled={fige} autoComplete="off" />
    </label>
  )
  return (
    <div className="lettre-champs">
      {champ('prix', 'Prix', 'ce qu’il vaut, ce qu’il a coûté…', LIMITES.prix)}
      {champ('provenance', 'Provenance', 'd’où, de qui vient-il ?', LIMITES.champ)}
      {champ('destinataire', 'Destinataire', 'à qui le dire ?', LIMITES.champ)}
      {champ('faction', 'Faction', 'la garde, la Confrérie, un jarl…', LIMITES.champ)}
    </div>
  )
}

/* ───────────────────────── « Transmettre un secret » ───────────────────────── */

/** The letter: in the style of the Table's « création d'affaire » billet; sealed when sent. */
function Lettre({ o, d, interactif }: { o: EtatSecrets; d: VueOmbre; interactif: boolean }) {
  const id = useId()
  const b = o.brouillon
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'scellee'>('saisie')
  const [numero, setNumero] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const fige = !interactif || etat !== 'saisie'
  const changer = (k: keyof Brouillon, v: string) => o.setBrouillon((x) => ({ ...x, [k]: v }))
  const pret = b.titre.trim() !== '' && b.contenu.trim() !== ''
  const sceller = async () => {
    if (!pret || etat !== 'saisie') return
    setEtat('envoi')
    setMessage(null)
    const r = await o.agir('secret', b)
    if (!r.ok) {
      setEtat('saisie')
      setMessage({ ok: false, texte: r.message })
      return
    }
    setNumero(r.numero ?? null)
    setEtat('scellee')
    setMessage({ ok: true, texte: r.message })
  }
  const recommencer = () => {
    o.setBrouillon(BROUILLON_VIDE)
    setNumero(null)
    setMessage(null)
    setEtat('saisie')
  }
  return (
    <form
      className={`lettre-ombre ${etat === 'scellee' ? 'scellee' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        sceller()
      }}
    >
      <div className="lettre-entete">
        <dl className="lettre-tete">
          <div>
            <dt>Transmis par</dt>
            <dd className="lettre-auteur">{d.moi}</dd>
          </div>
          <div>
            <dt>Le</dt>
            <dd>{jour(new Date().toISOString())}</dd>
          </div>
          <div>
            <dt>Pli</dt>
            <dd>{numero ? <span className="lettre-numero">n° {numero}</span> : <span className="sig-vide">{etat === 'envoi' ? 'l’ombre l’inscrit…' : 'numéro donné au sceau'}</span>}</dd>
          </div>
        </dl>
        <div className="lettre-verdict">{etat === 'scellee' && <span className="tampon-lettre">Scellée</span>}</div>
      </div>
      <p className="lettre-adresse">{OMBRE.secrets.lettre}</p>

      <p className="lettre-rubrique centre">Urgence</p>
      <Tampons liste={URGENCES} valeur={b.urgence} changer={(v) => changer('urgence', v)} fige={fige} etiquette="Urgence" />
      <ChampsLibres v={b} changer={changer} fige={fige} id={id} />
      <p className="lettre-rubrique centre">Interne ou externe</p>
      <Tampons liste={PORTEES} valeur={b.portee} changer={(v) => changer('portee', v)} fige={fige} etiquette="Interne ou externe" />

      <label className="lettre-rubrique" htmlFor={`${id}-titre`}>
        Titre
      </label>
      <input id={`${id}-titre`} className="lettre-titre" value={b.titre} onChange={(e) => changer('titre', e.target.value)} maxLength={LIMITES.titre} placeholder="Ce que tu as appris, en quelques mots…" disabled={fige} autoComplete="off" />
      <label className="lettre-rubrique" htmlFor={`${id}-contenu`}>
        Contenu
      </label>
      <textarea id={`${id}-contenu`} className="lettre-contenu" value={b.contenu} onChange={(e) => changer('contenu', e.target.value)} maxLength={LIMITES.contenu} rows={7} placeholder="Qui, où, quand, ce que tu as vu ou entendu…" disabled={fige} />

      <div className="lettre-pied">
        <Mot m={message} />
        {etat === 'scellee' ? (
          <Action icone="consigner" onClick={recommencer} disabled={!interactif}>
            écrire une autre lettre
          </Action>
        ) : (
          <button type="submit" className="commande-sceller lettre-sceller" disabled={fige || !pret} aria-busy={etat === 'envoi'}>
            <span className="commande-cire" aria-hidden />
            {etat === 'envoi' ? 'La lettre part dans l’ombre…' : 'Sceller la lettre'}
          </button>
        )}
      </div>
    </form>
  )
}

/** « Mes secrets »: what the reader sent, with its state; touched, it opens in a note on the left (2026-11-11). */
function MesSecrets({ reg, d, interactif }: { reg: CtxRegistre; d: VueOmbre; interactif: boolean }) {
  const o = reg.o!
  return (
    <section className="mes-secrets">
      <h3 className="titre-section">{OMBRE.secrets.miens}</h3>
      {d.miens.length ? (
        <ul className="secrets-liste">
          {d.miens.map((s: MonSecret) => (
            <li key={s.id} className={`secret-carte etat-${cleEtat(s.etat)}`}>
              <button type="button" className="secret-tete" onClick={() => reg.ouvrir({ genre: 'mon-secret', id: s.id })} tabIndex={interactif ? 0 : -1}>
                <span className="secret-titre">{s.titre}</span>
                <Urgence u={s.urgence} />
                <span className="secret-meta">
                  <Jour iso={s.depose} /> · <em className="secret-etat">{MOT_ETAT[s.etat]}</em>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide-encre">{OMBRE.secrets.miensVide}</p>
      )}
      {o.erreur && <p className="message-encre erreur">{o.erreur}</p>}
    </section>
  )
}

const cleEtat = (e: Etat) => ({ scellée: 'scellee', ouverte: 'ouverte', classée: 'classee', fusionnée: 'fusionnee', retirée: 'retiree' })[e]

/* ───────────────────────── « Le tri » and « Archives » ───────────────────────── */

/** The two filters of « Le tri » and « Archives »: urgency and inside / outside, as inked stamps (touched again: all). */
function FiltresPlis({ f, changer, interactif }: { f: Filtres; changer: (k: 'urgence' | 'portee', v: string) => void; interactif: boolean }) {
  return (
    <div className="filtres-plis">
      <p className="lettre-rubrique centre">Urgence</p>
      <Tampons liste={URGENCES} valeur={f.urgence} changer={(v) => changer('urgence', v)} fige={!interactif} etiquette="Filtrer par urgence" />
      <p className="lettre-rubrique centre">Interne ou externe</p>
      <Tampons liste={PORTEES} valeur={f.portee} changer={(v) => changer('portee', v)} fige={!interactif} etiquette="Filtrer : interne ou externe" />
    </div>
  )
}

/** « Le tri », left page: the filters and what they leave (the lists are on the right page). */
function FiltresTri({ o, d, interactif }: { o: EtatSecrets; d: VueOmbre; interactif: boolean }) {
  const f = o.filtresTri
  const vivantes = d.notes.filter(vivante)
  const scelles = filtrer(vivantes.filter((s) => s.etat === ETATS.scellee), f).length
  const ouverts = filtrer(vivantes.filter((s) => s.etat !== ETATS.scellee), f).length
  return (
    <div className="filtres-tri">
      <FiltresPlis f={f} changer={(k, v) => o.setFiltresTri({ ...f, [k]: v })} interactif={interactif} />
      <p className="decompte">
        {scelles} pli{scelles > 1 ? 's' : ''} scellé{scelles > 1 ? 's' : ''}, {ouverts} pli{ouverts > 1 ? 's' : ''} ouvert{ouverts > 1 ? 's' : ''}
        {(f.urgence || f.portee) && <> (sur {vivantes.length})</>}
      </p>
      {(f.urgence || f.portee) && (
        <Action icone="annuler" onClick={() => o.setFiltresTri(FILTRES_VIDES)} disabled={!interactif}>
          effacer les filtres
        </Action>
      )}
    </div>
  )
}

/** One envelope or note in a list (right page): its title, urgency, who and when; touched, it opens in a note on the left. */
function LignePli({ s, d, reg, interactif, archives = false }: { s: Secret; d: VueOmbre; reg: CtxRegistre; interactif: boolean; archives?: boolean }) {
  const scelle = s.etat === ETATS.scellee
  const cible = d.notes.find((x) => x.id === s.fusionneeDans)
  return (
    <li className={`secret-carte note-carte etat-${cleEtat(s.etat)} ${estUrgente(s) ? 'urgente' : ''}`}>
      <button type="button" className="secret-tete" onClick={() => reg.ouvrir({ genre: 'pli', id: s.id })} tabIndex={interactif ? 0 : -1}>
        {scelle && <span className="pli-cire pli-cire-petite" aria-hidden />}
        <span className="secret-titre">{s.titre}</span>
        <Urgence u={s.urgence} />
        {s.portee && <span className="secret-portee">{s.portee}</span>}
        {s.faction && <span className="secret-faction">{s.faction}</span>}
        <span className="secret-meta">
          de {s.informateur || 'un inconnu'} · <Jour iso={s.depose} />
          {archives && s.etat !== ETATS.ouverte && <> · <em>{s.etat === ETATS.fusionnee ? `jointe à « ${cible?.titre ?? s.fusionneeDans} »` : s.etat}</em></>}
        </span>
      </button>
    </li>
  )
}

/** « Le tri », right page: « Plis scellés » then « Plis ouverts » (opened or classified), urgent first, as filtered on the left. */
function Plis({ reg, d, interactif }: { reg: CtxRegistre; d: VueOmbre; interactif: boolean }) {
  const f = reg.o!.filtresTri
  const vivantes = d.notes.filter(vivante)
  const scelles = filtrer(vivantes.filter((s) => s.etat === ETATS.scellee), f).sort(parUrgence)
  const ouverts = filtrer(vivantes.filter((s) => s.etat !== ETATS.scellee), f).sort(parUrgence)
  const section = (titre: string, liste: Secret[], vide: string, cls: string) => (
    <section className={cls}>
      <h3 className="titre-section">
        {titre}
        {liste.length > 0 && <span className="compte-plis"> · {liste.length}</span>}
      </h3>
      {liste.length ? (
        <ul className="secrets-liste">
          {liste.map((s) => (
            <LignePli key={s.id} s={s} d={d} reg={reg} interactif={interactif} />
          ))}
        </ul>
      ) : (
        <p className="vide-encre">{vide}</p>
      )}
    </section>
  )
  return (
    <>
      {section(OMBRE.tri.scelles, scelles, OMBRE.tri.scellesVide, 'plis-scelles')}
      {section(OMBRE.tri.notes, ouverts, OMBRE.tri.notesVide, 'plis-ouverts')}
    </>
  )
}

type Geste = null | 'classer' | 'corriger' | 'joindre' | 'retirer'

/**
 * A note, in the note laid on the left page (« Le tri », « Archives »): sealed, its envelope and « briser le sceau »; open,
 * its fields, its text, its trace and the sorting gestures; removed, « rendre au registre ».
 */
function CorpsPli({ s, o, d, changer, fermer }: { s: Secret; o: EtatSecrets; d: VueOmbre; changer: (f: FicheSecret) => void; fermer: () => void }) {
  const [geste, setGeste] = useState<Geste>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const cible = d.notes.find((x) => x.id === s.fusionneeDans)
  const agir = async (action: ActionSecret, corps: Record<string, unknown>) => {
    setEnvoi(true)
    setMessage(null)
    const r = await o.agir(action, { id: s.id, ...corps })
    setEnvoi(false)
    setMessage({ ok: r.ok, texte: r.message })
    if (r.ok) setGeste(null)
    return r
  }
  const meta = (
    <p className="fiche-note secret-meta-fiche">
      De <strong>{s.informateur || 'un inconnu'}</strong>, le <Jour iso={s.depose} /> · <em>{s.etat === ETATS.fusionnee ? `jointe à « ${cible?.titre ?? s.fusionneeDans} »` : s.etat}</em>
    </p>
  )
  if (s.etat === ETATS.scellee)
    return (
      <div className="secret-fiche pli-ferme">
        {meta}
        <div className="pli-enveloppe">
          <span className="pli-cire" aria-hidden />
          <Urgence u={s.urgence} />
        </div>
        {d.droits.tri ? (
          <div className="secret-form-pied">
            <button type="button" className="commande-sceller" disabled={envoi} onClick={() => agir('ouvrir', {})}>
              <span className="commande-cire" aria-hidden />
              {envoi ? 'Le sceau cède…' : 'Briser le sceau'}
            </button>
          </div>
        ) : (
          <p className="fiche-note">Seuls la Voix de la sécurité et les Patriarches brisent les sceaux.</p>
        )}
        <Mot m={message} />
      </div>
    )
  const peutTrier = d.droits.tri && vivante(s)
  return (
    <div className="secret-fiche">
      {meta}
      <Champs s={s} />
      <TexteNote contenu={s.contenu} />
      <p className="secret-trace">
        N° {s.id}
        {s.ouvertPar && <> · ouverte par {s.ouvertPar}{s.ouvertLe && <>, le <Jour iso={s.ouvertLe} /></>}</>}
        {s.corrigeePar && <> · corrigée par {s.corrigeePar}{s.corrigeeLe && <>, le <Jour iso={s.corrigeeLe} /></>}</>}
        {s.etat === ETATS.retiree && s.retireePar && <> · retirée par {s.retireePar}{s.retireeLe && <>, le <Jour iso={s.retireeLe} /></>}</>}
      </p>
      {s.etat === ETATS.fusionnee && cible && (
        <Action icone="fusionner" onClick={() => changer({ genre: 'pli', id: cible.id })}>
          lire « {cible.titre} »
        </Action>
      )}
      {s.etat === ETATS.retiree && d.droits.archives && (
        <Action icone="rendre" onClick={() => agir('rendre', {})} disabled={envoi}>
          {envoi ? 'le scribe la rend…' : 'rendre au registre'}
        </Action>
      )}
      {peutTrier && (
        <>
          {!geste && (
            <div className="secret-gestes">
              <Action icone="usage" onClick={() => setGeste('classer')}>
                classer
              </Action>
              <Action icone="corriger" onClick={() => setGeste('corriger')}>
                corriger
              </Action>
              {d.notes.some((x) => x.id !== s.id && vivante(x)) && (
                <Action icone="fusionner" onClick={() => setGeste('joindre')}>
                  joindre à une autre note
                </Action>
              )}
              <Action icone="retirer" className="action-discrete" onClick={() => setGeste('retirer')}>
                retirer
              </Action>
            </div>
          )}
          {geste === 'classer' && <FormClasser s={s} envoi={envoi} annuler={() => setGeste(null)} envoyer={(c) => agir('classer', c)} />}
          {geste === 'corriger' && <FormCorriger s={s} envoi={envoi} annuler={() => setGeste(null)} envoyer={(c) => agir('corriger', c)} />}
          {geste === 'joindre' && <FormJoindre s={s} notes={d.notes} envoi={envoi} annuler={() => setGeste(null)} envoyer={(c) => agir('fusionner', { cible: c }).then((r) => r.ok && changer({ genre: 'pli', id: c }))} />}
          {geste === 'retirer' && (
            <p className="confirmer-retrait" role="alert">
              Retirer « {s.titre} » de toutes les pages ? Ni son informateur ni le tri ne la verront plus ; les archives la gardent, d’où l’on peut la rendre.{' '}
              <Action icone="retirer" onClick={() => agir('retirerSecret', {}).then((r) => r.ok && fermer())} disabled={envoi}>
                oui, la retirer
              </Action>{' '}
              <Action icone="annuler" onClick={() => setGeste(null)}>
                non
              </Action>
            </p>
          )}
        </>
      )}
      <Mot m={message} />
    </div>
  )
}

/** Classify a note: its urgency, inside or outside, its free fields. Classifying opens it too. */
function FormClasser({ s, envoi, annuler, envoyer }: { s: Secret; envoi: boolean; annuler: () => void; envoyer: (c: Record<string, unknown>) => void }) {
  const id = useId()
  const [v, setV] = useState({ urgence: s.urgence, portee: s.portee, prix: s.prix, provenance: s.provenance, destinataire: s.destinataire, faction: s.faction })
  return (
    <form
      className="secret-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(v)
      }}
    >
      <p className="lettre-rubrique centre">Urgence</p>
      <Tampons liste={URGENCES} valeur={v.urgence} changer={(x) => setV({ ...v, urgence: x })} fige={envoi} etiquette="Urgence" />
      <p className="lettre-rubrique centre">Interne ou externe</p>
      <Tampons liste={PORTEES} valeur={v.portee} changer={(x) => setV({ ...v, portee: x })} fige={envoi} etiquette="Interne ou externe" />
      <ChampsLibres v={v} changer={(k, t) => setV({ ...v, [k]: t })} fige={envoi} id={id} />
      <div className="secret-form-pied">
        <button type="submit" className="commande-sceller" disabled={envoi}>
          <span className="commande-cire" aria-hidden />
          {envoi ? 'Le scribe classe…' : 'Classer la note'}
        </button>
        <Action icone="annuler" onClick={annuler}>
          renoncer
        </Action>
      </div>
    </form>
  )
}

/** Correct a note: its title and its whole text (authors, days, contents: one plain text), and its fields. */
function FormCorriger({ s, envoi, annuler, envoyer }: { s: Secret; envoi: boolean; annuler: () => void; envoyer: (c: Record<string, unknown>) => void }) {
  const id = useId()
  const [v, setV] = useState({ titre: s.titre, contenu: s.contenu, urgence: s.urgence, portee: s.portee, prix: s.prix, provenance: s.provenance, destinataire: s.destinataire, faction: s.faction })
  return (
    <form
      className="secret-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(v)
      }}
    >
      <label className="lettre-rubrique" htmlFor={`${id}-titre`}>
        Titre
      </label>
      <input id={`${id}-titre`} className="lettre-titre" value={v.titre} onChange={(e) => setV({ ...v, titre: e.target.value })} maxLength={LIMITES.titre} disabled={envoi} autoComplete="off" />
      <label className="lettre-rubrique" htmlFor={`${id}-contenu`}>
        Texte de la note
      </label>
      <textarea id={`${id}-contenu`} className="lettre-contenu" value={v.contenu} onChange={(e) => setV({ ...v, contenu: e.target.value })} maxLength={LIMITES.texte} rows={10} disabled={envoi} />
      <p className="note-encre secret-aide">Chaque apport commence par une ligne <span className="sans-coupure">« Nom ----------- jj/mm/aaaa »</span> : on peut la corriger comme le reste.</p>
      <p className="lettre-rubrique centre">Urgence</p>
      <Tampons liste={URGENCES} valeur={v.urgence} changer={(x) => setV({ ...v, urgence: x })} fige={envoi} etiquette="Urgence" />
      <p className="lettre-rubrique centre">Interne ou externe</p>
      <Tampons liste={PORTEES} valeur={v.portee} changer={(x) => setV({ ...v, portee: x })} fige={envoi} etiquette="Interne ou externe" />
      <ChampsLibres v={v} changer={(k, t) => setV({ ...v, [k]: t })} fige={envoi} id={id} />
      <div className="secret-form-pied">
        <button type="submit" className="commande-sceller" disabled={envoi || !v.titre.trim() || !v.contenu.trim()}>
          <span className="commande-cire" aria-hidden />
          {envoi ? 'Le scribe recopie…' : 'Consigner la correction'}
        </button>
        <Action icone="annuler" onClick={annuler}>
          renoncer
        </Action>
      </div>
    </form>
  )
}

/** Join this note to another: its text goes after the other's, each under its author and day; it leaves the lists. */
function FormJoindre({ s, notes, envoi, annuler, envoyer }: { s: Secret; notes: Secret[]; envoi: boolean; annuler: () => void; envoyer: (cible: string) => void }) {
  const autres = notes.filter((x) => x.id !== s.id && vivante(x)).sort(parUrgence)
  const [cible, setCible] = useState('')
  const c = autres.find((x) => x.id === cible)
  return (
    <form
      className="secret-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (cible) envoyer(cible)
      }}
    >
      <label className="fiche-champ">
        <span>Joindre à la note</span>
        <select value={cible} onChange={(e) => setCible(e.target.value)} disabled={envoi}>
          <option value="">— choisir la note —</option>
          {autres.map((x) => (
            <option key={x.id} value={x.id}>
              {x.titre} ({x.informateur || 'inconnu'}, {jour(x.depose)})
            </option>
          ))}
        </select>
      </label>
      {c && (
        <p className="note-encre">
          Le texte de « {s.titre} » rejoindra la suite de « {c.titre} », sous la ligne « {s.informateur || 'Anonyme'} ----------- {jourEntete(s.depose)} ». « {s.titre} » quittera le tri ; son informateur la verra « jointe à une autre note ».
        </p>
      )}
      <div className="secret-form-pied">
        <button type="submit" className="commande-sceller" disabled={envoi || !cible}>
          <span className="commande-cire" aria-hidden />
          {envoi ? 'Le scribe réunit…' : 'Joindre les deux notes'}
        </button>
        <Action icone="annuler" onClick={annuler}>
          renoncer
        </Action>
      </div>
    </form>
  )
}

/** The archives' search and filters: urgency and inside / outside as on « Le tri », then faction, provenance, informant, days. */
function FiltresArchives({ o, d, interactif }: { o: EtatSecrets; d: VueOmbre; interactif: boolean }) {
  const f = o.filtres
  const id = useId()
  const changer = (k: keyof Filtres, v: string) => o.setFiltres({ ...f, [k]: v })
  const n = filtrer(d.notes, f).length
  const liste = (k: 'faction' | 'provenance' | 'informateur', mot: string) => (
    <label className="fiche-champ">
      <span>{mot}</span>
      <input value={f[k]} onChange={(e) => changer(k, e.target.value)} list={`${id}-${k}`} disabled={!interactif} autoComplete="off" placeholder="toutes" />
      <datalist id={`${id}-${k}`}>
        {valeurs(d.notes, k).map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
    </label>
  )
  const actifs = Object.values(f).some((x) => x.trim())
  return (
    <div className="archives-filtres">
      <FiltresPlis f={f} changer={changer} interactif={interactif} />
      <label className="fiche-champ archives-requete">
        <span>Chercher</span>
        <input type="search" value={f.requete} onChange={(e) => changer('requete', e.target.value)} placeholder="un mot, un nom, un lieu…" disabled={!interactif} />
      </label>
      <div className="archives-grille">
        {liste('faction', 'Faction')}
        {liste('provenance', 'Provenance')}
        {liste('informateur', 'Informateur')}
        <span />
        <label className="fiche-champ">
          <span>Du</span>
          <input type="date" value={f.du} onChange={(e) => changer('du', e.target.value)} disabled={!interactif} />
        </label>
        <label className="fiche-champ">
          <span>Au</span>
          <input type="date" value={f.au} onChange={(e) => changer('au', e.target.value)} disabled={!interactif} />
        </label>
      </div>
      <p className="decompte">
        {n} note{n > 1 ? 's' : ''} sur {d.notes.length}
        {d.retirees.length > 0 && <>, et {d.retirees.length} retirée{d.retirees.length > 1 ? 's' : ''}</>}
      </p>
      {actifs && (
        <Action icone="annuler" onClick={() => o.setFiltres(FILTRES_VIDES)} disabled={!interactif}>
          effacer les filtres
        </Action>
      )}
    </div>
  )
}

/** The archives: every note matching the filters (merged ones too), then the removed ones; each opens in a note on the left. */
function Archives({ reg, d, interactif }: { reg: CtxRegistre; d: VueOmbre; interactif: boolean }) {
  const o = reg.o!
  const notes = filtrer(d.notes, o.filtres)
  const retirees = filtrer(d.retirees, o.filtres)
  return (
    <section className="archives-ombre">
      <h3 className="titre-section">{OMBRE.archives.titre}</h3>
      {notes.length ? (
        <ul className="secrets-liste">
          {notes.map((s) => (
            <LignePli key={s.id} s={s} d={d} reg={reg} interactif={interactif} archives />
          ))}
        </ul>
      ) : (
        <p className="vide-encre">{OMBRE.archives.vide}</p>
      )}
      {d.droits.archives && retirees.length > 0 && (
        <>
          <h3 className="titre-section">{OMBRE.archives.retirees}</h3>
          <ul className="secrets-liste retirees">
            {retirees.map((s) => (
              <LignePli key={s.id} s={s} d={d} reg={reg} interactif={interactif} archives />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/* ───────────────────────── The notes (components/Fiche.tsx) ───────────────────────── */

/** The shadow book's notes, laid on the left page like every slip of the grimoire (2026-11-11). */
export type FicheSecret = { genre: 'lettre-ombre' } | { genre: 'mon-secret'; id: string } | { genre: 'pli'; id: string }

export const GENRES_SECRET: FicheSecret['genre'][] = ['lettre-ombre', 'mon-secret', 'pli']

/** A shadow note's head and body, and the gesture its reader must hold (checked by Fiche.tsx `Signe`). */
export function contenuSecret(
  f: FicheSecret,
  env: { reg: CtxRegistre; changer: (f: FicheSecret) => void; fermer: () => void },
): { surtitre: string; titre: string; corps: ReactNode; action: 'secret' | 'secretTri' | 'secretArchives' } {
  const o = env.reg.o
  const d = o?.donnees
  if (f.genre === 'lettre-ombre')
    return {
      surtitre: OMBRE.surtitre,
      titre: OMBRE.secrets.titre,
      action: 'secret',
      corps: <EtatPage o={o} sansScript>{(v) => <Lettre o={o!} d={v} interactif />}</EtatPage>,
    }
  if (f.genre === 'mon-secret') {
    const s = d?.miens.find((x) => x.id === f.id)
    return {
      surtitre: `${OMBRE.surtitre} · ${OMBRE.secrets.miens}`,
      titre: s?.titre ?? OMBRE.secrets.miens,
      action: 'secret',
      corps: s ? (
        <div className="secret-fiche">
          <p className="fiche-note secret-meta-fiche">
            Transmis le <Jour iso={s.depose} /> · <em>{MOT_ETAT[s.etat]}</em>
          </p>
          <Champs s={s} />
          <TexteNote contenu={s.contenu} />
          <p className="secret-trace">N° {s.id}</p>
        </div>
      ) : (
        <p className="fiche-note">Ce secret n’est plus dans ton registre.</p>
      ),
    }
  }
  const s = d ? [...d.notes, ...d.retirees].find((x) => x.id === f.id) : undefined
  return {
    surtitre: `${OMBRE.surtitre} · ${s?.etat === ETATS.scellee ? 'Pli scellé' : s?.etat === ETATS.retiree ? OMBRE.archives.retirees : 'Note'}`,
    titre: s?.titre ?? 'Note',
    action: d?.droits.tri ? 'secretTri' : 'secretArchives',
    corps: s && o && d ? <CorpsPli key={s.id} s={s} o={o} d={d} changer={env.changer} fermer={env.fermer} /> : <p className="fiche-note">Cette note n’est plus dans le registre de l’ombre.</p>,
  }
}

/* ───────────────────────── The pages ───────────────────────── */

export function GaucheSecrets({ page, reg, interactif, icone }: { page: PageSecrets; reg?: CtxRegistre; interactif: boolean; compact?: boolean; icone?: string }) {
  const o = reg?.o
  return (
    <div className={`secrets-gauche secrets-${page.vue}`}>
      <EtatPage o={o} sansScript={page.vue === 'transmettre'}>
        {(d) =>
          page.vue === 'transmettre' ? (
            d.droits.secret ? (
              <div className="gestes gestes-lettre">
                <GesteBouton icone={icone} onClick={() => reg!.ouvrir({ genre: 'lettre-ombre' })} disabled={!interactif}>
                  {estBrouillon(o!.brouillon) ? OMBRE.secrets.reprendre : OMBRE.secrets.ecrire}
                </GesteBouton>
              </div>
            ) : (
              <p className="registre-ferme">Cette page de l’ombre est réservée à d’autres pattes que les tiennes.</p>
            )
          ) : page.vue === 'tri' ? (
            d.droits.tri ? <FiltresTri o={o!} d={d} interactif={interactif} /> : <p className="registre-ferme">Le tri est réservé à la Voix de la sécurité et aux Patriarches.</p>
          ) : d.droits.archives ? (
            <FiltresArchives o={o!} d={d} interactif={interactif} />
          ) : (
            <p className="registre-ferme">Les archives sont réservées à la Voix de la sécurité et aux Patriarches.</p>
          )
        }
      </EtatPage>
    </div>
  )
}

const estBrouillon = (b: Brouillon) => Object.values(b).some((v) => v.trim())

export function DroiteSecrets({ page, reg, interactif }: { page: PageSecrets; reg?: CtxRegistre; interactif: boolean }) {
  const o = reg?.o
  // On a phone the left page above already says why the data is missing: nothing twice.
  if (!reg || !o?.donnees?.moi || (!o.donnees.actif && page.vue !== 'transmettre')) return null
  const d = o.donnees
  return (
    <div className={`secrets-droite secrets-${page.vue}`}>
      {page.vue === 'transmettre' && d.droits.secret && <MesSecrets reg={reg} d={d} interactif={interactif} />}
      {page.vue === 'tri' && d.droits.tri && <Plis reg={reg} d={d} interactif={interactif} />}
      {page.vue === 'archives' && d.droits.archives && <Archives reg={reg} d={d} interactif={interactif} />}
    </div>
  )
}

/* ───────────────────────── « Gestion de la contrebande » ───────────────────────── */

/**
 * Where goods and resources are listed: the notice, to everyone (day book only), and the contraband list to who holds the
 * `contrebande` gesture (folded by day, open in the shadow book), with « corriger la liste ».
 */
export function Contrebande({ reg, interactif, ombre, compact }: { reg?: CtxRegistre; interactif: boolean; ombre: boolean; compact: boolean }) {
  const o = reg?.o
  const d = o?.donnees
  const liste = d?.actif ? d.contrebande : null
  const avis = !ombre ? <p className="avis-contrebande">{OMBRE.contrebande.avis}</p> : null
  if (!liste) return avis
  const corps = <ListeContrebande o={o!} liste={liste} interactif={interactif} />
  return (
    <div className={`contrebande ${ombre ? 'contrebande-ombre' : 'contrebande-jour'} ${compact ? 'compact' : ''}`}>
      {avis}
      {ombre ? (
        <section className="contrebande-bloc">
          <h3 className="titre-contrebande">{OMBRE.contrebande.titre}</h3>
          {corps}
        </section>
      ) : (
        <details className="contrebande-bloc">
          <summary>
            {OMBRE.contrebande.titre}
            <span className="compte-plis"> · {liste.lignes.length}</span>
          </summary>
          {corps}
        </details>
      )}
    </div>
  )
}

function ListeContrebande({ o, liste, interactif }: { o: EtatSecrets; liste: NonNullable<VueOmbre['contrebande']>; interactif: boolean }) {
  const [edition, setEdition] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const texte = useMemo(() => liste.lignes.join('\n'), [liste.lignes])
  const consigner = async () => {
    if (edition === null) return
    setEnvoi(true)
    setMessage(null)
    const r = await o.agir('contrebande', { texte: edition })
    setEnvoi(false)
    setMessage({ ok: r.ok, texte: r.message })
    if (r.ok) setEdition(null)
  }
  return (
    <>
      <p className="note-encre">{OMBRE.contrebande.intro}</p>
      {edition === null ? (
        <>
          {liste.lignes.length ? (
            <ul className="contrebande-lignes">
              {liste.lignes.map((l, i) => (
                <li key={`${i}-${l}`}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="vide-encre">{OMBRE.contrebande.vide}</p>
          )}
          {liste.par && (
            <p className="secret-trace">
              Tenue par {liste.par}
              {liste.le && <>, le <Jour iso={liste.le} /></>}
            </p>
          )}
          {interactif && (
            <Action icone="corriger" onClick={() => setEdition(texte)}>
              corriger la liste
            </Action>
          )}
        </>
      ) : (
        <form
          className="secret-form"
          onSubmit={(e) => {
            e.preventDefault()
            consigner()
          }}
        >
          <textarea className="lettre-contenu contrebande-texte" value={edition} onChange={(e) => setEdition(e.target.value)} rows={8} maxLength={LIMITES.contrebande} disabled={envoi} placeholder={'Skooma\nSucre de lune\nPoudre de rêve…'} aria-label={OMBRE.contrebande.titre} />
          <div className="secret-form-pied">
            <button type="submit" className="commande-sceller" disabled={envoi}>
              <span className="commande-cire" aria-hidden />
              {envoi ? 'Le scribe consigne…' : 'Consigner la liste'}
            </button>
            <Action icone="annuler" onClick={() => setEdition(null)}>
              renoncer
            </Action>
          </div>
        </form>
      )}
      <Mot m={message} />
    </>
  )
}
