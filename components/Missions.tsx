'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Article, PageCarnet, PageDemande, PageMissions, PagePatriarche } from '@/lib/types'
import { dateTamrielique, prix } from '@/lib/format'
import { cle, estClose, rejouer, enStock, type EtatMissive } from '@/lib/missives'
import { nomsCorrespondent } from '@/lib/recherche'
import { estEntree, etatMission, porteurs, PETITES_LUNES, TEXTES_INTENDANCE, type LigneIntendance } from '@/lib/intendance'
import {
  avancement,
  CODE_TRANSFORMATION,
  ORIGINES,
  pointsDeLigne,
  pointsParPrise,
  peser,
  proposer,
  quantiteParMission,
  REGLAGES,
  soldes,
  TEXTES,
  VERBES,
  type ActionMission,
  type Assignation,
  type Classe,
  type Demande,
  type DonneesMissions,
  type Mission,
  type Ponderation,
} from '@/lib/missions'
import { Action, Icone } from './Ornements'
import { Coche, Geste, idMissive, Jauge, quand, quantite, Signature, echeance, type CtxRegistre, type RechercheLocale } from './Missives'
import { Sceller } from './Fiche'
import { ChampNombre, ChampRecherche, ciblesDe, Ferme, GlypheType, Inactif, Message, Meta, moiDe, nf, nomsObjets, ouvert, permis, poids, Pts, pts, useScelle, voitPoints, type Reponse } from './MissionsCommun'
import { EnAttente, FicheEntree, FicheFaconnage, FichePerte, FicheSignaler } from './Intendance'

/*
 * The book of Missions (Missions v2, lot 2), in the missives' interface: the call lists the missives in progress
 * (each with its sponsor's seal and the missions it spawned), the caravan's own sheets of missions and the standing
 * missions, each mission with what it still lacks; nobody takes a mission first. A member signals what they handed
 * over or left in the « coffre des petites lunes » (it waits for a yes / no), someone allowed records what they
 * received (components/Intendance.tsx). « Mon carnet »: the member's own hand-overs and private progress. One page per
 * sheet (opened from the call, no side tab). Points are internal: only who opens the Trésor sees them (its « Points »
 * page, and beside each mission). Every form is a note laid over the left page (components/Fiche.tsx).
 */

/* ───────────────────────── The hook ───────────────────────── */

type Prevision = { id: number; prevoir: (d: DonneesMissions) => DonneesMissions }

const ECHEC = "Le coursier n'est pas revenu. Rien n'a été consigné : réessaie."
const FERME = "Le registre des missions ne répond pas : le coursier n'a pu l'ouvrir. Réessaie dans un moment."

/**
 * The missions' data. `apres`: called after a write the registre accepted, with its version and the names just
 * reserved in Membres (the chest's page and the names' suggestions read again).
 */
export function useMissions(signe: string | null, apres?: (version: number, reserves: string[]) => void) {
  const [base, setBase] = useState<DonneesMissions | null>(null)
  const [previsions, setPrevisions] = useState<Prevision[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  /** The last answer of the registre to a gesture (shown on the missions' pages). */
  const [message, setMessage] = useState<{ ok: boolean; texte: string; n: number } | null>(null)
  const compteur = useRef(0)
  const version = useRef(0)
  const apresRef = useRef(apres)
  apresRef.current = apres

  const recevoir = useCallback((d: DonneesMissions) => {
    version.current = Math.max(version.current, d.version ?? 0)
    setBase(d)
  }, [])

  const lire = useCallback(() => {
    setErreur(null)
    return fetch(`/api/missions?v=${version.current}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { donnees?: DonneesMissions; message?: string } | null
        if (r.ok && j?.donnees) recevoir(j.donnees)
        else setErreur(j?.message ?? FERME)
      })
      .catch(() => setErreur(FERME))
  }, [recevoir])

  // Read again when the reader signs (their own hand-overs).
  const luLe = useRef(0)
  useEffect(() => {
    luLe.current = Date.now()
    lire()
  }, [lire, signe])
  // And when the book comes back to the front after a while (the Intendance answers what others declared meanwhile):
  // one listener, at most one read per half-minute; nothing runs while the page stays in view.
  useEffect(() => {
    const revenir = () => {
      if (document.visibilityState !== 'visible' || Date.now() - luLe.current < 30000) return
      luLe.current = Date.now()
      lire()
    }
    document.addEventListener('visibilitychange', revenir)
    window.addEventListener('focus', revenir)
    return () => {
      document.removeEventListener('visibilitychange', revenir)
      window.removeEventListener('focus', revenir)
    }
  }, [lire])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 9000)
    return () => clearTimeout(t)
  }, [message])

  /** One gesture; with `prevoir`, written on the page at once (fresh ink) and taken back if refused. */
  const agir = useCallback(
    async (action: ActionMission, corps: Record<string, unknown>, prevoir?: Prevision['prevoir']): Promise<Reponse> => {
      const id = ++compteur.current
      if (prevoir) setPrevisions((ps) => [...ps, { id, prevoir }])
      let res: Reponse
      let frais = false
      try {
        const rep = await fetch('/api/missions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, vu: version.current, ...corps }) })
        const r = (await rep.json().catch(() => null)) as { ok?: boolean; message?: string; numero?: string; reserves?: string[]; donnees?: DonneesMissions | null } | null
        if (r?.donnees) {
          recevoir(r.donnees)
          frais = true
        }
        res = { ok: Boolean(rep.ok && r?.ok), message: r?.message ?? ECHEC, numero: r?.numero, reserves: r?.reserves ?? [] }
        if (res.ok) apresRef.current?.(r?.donnees?.version ?? version.current, res.reserves ?? [])
      } catch {
        res = { ok: false, message: ECHEC }
      }
      if (prevoir) setPrevisions((ps) => ps.filter((p) => p.id !== id))
      setMessage({ ok: res.ok, texte: res.ok ? res.message : `L’encre n’a pas pris : ${res.message}`, n: id })
      // Refused by the sheet (another paw was quicker…): read it again.
      if (!frais) lire()
      return res
    },
    [recevoir, lire],
  )

  const donnees = useMemo(() => {
    if (!base) return null
    return previsions.reduce((d, p) => {
      try {
        return p.prevoir(d)
      } catch {
        return d
      }
    }, base)
  }, [base, previsions])

  return { donnees, erreur, message, relire: lire, agir }
}

export type EtatMissions = ReturnType<typeof useMissions>

export const idDemande = (numero: string) => `demande-${numero}`

/** The settings shown: nobody takes a mission any more (lot 2), so the hold limit and the crafts' split are left out. */
const REGLAGES_VUS = REGLAGES.filter((r) => r.cle !== 'maxEnCours' && r.cle !== 'objetsParFabrication')

/** A sheet's title: the one written, else « 1 000 Flèches en fer ». */
export const titreDemande = (d: Pick<Demande, 'titre' | 'quantite' | 'article'>) => d.titre || `${nf(d.quantite)} ${d.article}`

/* ───────────────────────── The call: missives, sheets, standing missions ───────────────────────── */

/** The missions of a sheet that a member can work on (the prototype's donations and standing takes left out). */
const missionsDe = (d: DonneesMissions, numero: string) => d.missions.filter((m) => m.demande === numero)
const enJeu = (m: Mission) => !/^(don|p-)/i.test(m.demande)

/** A missive's wax seal, with its sponsor's initial (plain colour: no filter). */
export function SceauMissive({ commanditaire }: { commanditaire: string }) {
  const lettre = (commanditaire.trim().match(/\p{L}/u)?.[0] ?? '✶').toUpperCase()
  return (
    <span className="sceau-missive" aria-hidden title={commanditaire ? `Sceau de ${commanditaire}` : undefined}>
      {lettre}
    </span>
  )
}

/** One mission and what it still lacks; the member signals a hand-over, someone allowed records one. */
function LigneMission({ m, reg, icones, tab }: { m: Mission; reg: CtxRegistre; icones: Record<string, string>; tab: number }) {
  const d = reg.m!.donnees!
  const e = etatMission(m, d.intendance)
  const actif = d.intendanceActive
  return (
    <li className={`mission ${e.comblee ? 'comblee' : ''} ${m.enAttente ? 'en-attente' : ''}`}>
      <GlypheType type={m.type} icones={icones} />
      <span className="mission-texte">
        <span className="mission-intitule">
          {VERBES[m.type]} {m.objet}
        </span>
        <span className="mission-avance">
          <Jauge avance={e.avance} titre={`${nf(e.recu)} reçus sur ${nf(e.requis)}`} />
          <span>
            {nf(e.recu)} / {nf(e.requis)}
          </span>
        </span>
        <Meta parts={[e.attente > 0 && `${nf(e.attente)} en attente de confirmation`, poids(m)]} />
      </span>
      <span className="mission-cote">
        {e.comblee ? <span className="mission-comblee"><Coche titre="comblée" /> comblée</span> : <span className="mission-manque">manque {nf(e.manque)}</span>}
        <Pts reg={reg} n={m.points} />
        <span className="mission-gestes">
          {permis(reg, 'signaler') && (
            <Action icone="signaler" tabIndex={tab} disabled={!actif} title={actif ? 'Tu as remis ou déposé de quoi remplir cette mission' : TEXTES_INTENDANCE.inactif} onClick={() => reg.ouvrir({ genre: 'signaler', mission: m.numero })}>
              j’en ai remis
            </Action>
          )}
          {permis(reg, 'entree') && (
            <Action icone="entree" tabIndex={tab} disabled={!actif} title={actif ? 'Consigner ce qu’on t’a remis pour cette mission' : TEXTES_INTENDANCE.inactif} onClick={() => reg.ouvrir({ genre: 'entree', mission: m.numero })}>
              consigner
            </Action>
          )}
        </span>
      </span>
    </li>
  )
}

/** A sheet in the call: its title (to its page; under a missive of the same title, a plain link), who wrote it, its missions. */
function BlocDemande({ dm, ms, reg, icones, tab, missive }: { dm: Demande; ms: Mission[]; reg: CtxRegistre; icones: Record<string, string>; tab: number; missive?: string }) {
  const meme = missive !== undefined && cle(missive) === cle(titreDemande(dm))
  return (
    <li className="feuillet">
      <button type="button" className={meme ? 'lien-encre feuillet-lien' : 'feuillet-titre'} tabIndex={tab} onClick={() => reg.allerA(idDemande(dm.numero))}>
        {meme ? 'ses missions' : titreDemande(dm)}
      </button>
      <span className="feuillet-meta">
        {dm.membre && <>écrit par {dm.membre}</>}
        {dm.horodatage && <> le {dateTamrielique(dm.horodatage)}</>}
      </span>
      <ul className="missions-liste">
        {ms.map((m) => (
          <LigneMission key={m.numero} m={m} reg={reg} icones={icones} tab={tab} />
        ))}
      </ul>
    </li>
  )
}

/** Whether a sheet, a mission or a missive matches the page's search (title, sponsor, item). */
const cherche = (requetes: string[], noms: string[]) => requetes.every((q) => !q.trim() || nomsCorrespondent(noms, q))

export function GaucheMissions({ page, reg, icones, compact, recherche }: { page: PageMissions; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean; recherche?: RechercheLocale }) {
  const d = reg?.m?.donnees
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {reg && <Ferme reg={reg} />}
      {reg && d && ouvert(reg) && (
        <>
          <Signature reg={reg} />
          <Inactif reg={reg} intendance />
          <Message reg={reg} />
          <div className="gestes">
            {permis(reg, 'signaler') && (
              <Geste icone={icones['hand']} disabled={!d.intendanceActive} onClick={() => reg.ouvrir({ genre: 'signaler' })}>
                Signaler une remise
              </Geste>
            )}
            {permis(reg, 'entree') && (
              <Geste icone={icones['entry-door']} disabled={!d.intendanceActive} onClick={() => reg.ouvrir({ genre: 'entree' })}>
                Consigner une remise
              </Geste>
            )}
            {permis(reg, 'demande') && (
              <Geste icone={icones['scroll-quill']} disabled={!d.actif} onClick={() => reg.ouvrir({ genre: 'ecrire' })}>
                Écrire une mission
              </Geste>
            )}
          </div>
          <p className="note-encre">
            Tu as récolté ou façonné pour une mission ? Remets-le à une patte de l’Intendance, ou dépose-le au coffre des petites lunes et signale-le ici : on te
            répondra « reçu ». Pas besoin d’ouvrir le grimoire pour aider : qui reçoit écrit ton nom.
          </p>
          <ChampRecherche recherche={recherche} placeholder="Chercher une mission, une missive…" />
        </>
      )}
    </>
  )
}

export function DroiteMissions({ reg, icones, interactif, citation, requetes = [] }: { reg?: CtxRegistre; icones: Record<string, string>; interactif: boolean; citation: ReactNode; requetes?: string[] }) {
  const d = reg?.m?.donnees
  if (!reg || !d?.relie) return null
  const tab = interactif ? 0 : -1
  const etats = reg.r.calcul?.etats ?? []
  const missivesEnCours = etats.filter((e) => !estClose(e.missive))
  const ouvertes = new Set(missivesEnCours.map((e) => e.missive.numero))
  const demandes = [...d.demandes].reverse()
  const avec = demandes.map((dm) => ({ dm, ms: missionsDe(d, dm.numero).filter(enJeu) })).filter((x) => x.ms.length)
  const comblee = (x: { ms: Mission[] }) => x.ms.every((m) => etatMission(m, d.intendance).comblee)
  const trouve = (x: { dm: Demande; ms: Mission[] }, e?: EtatMissive) =>
    cherche(requetes, [titreDemande(x.dm), x.dm.article, ...x.ms.map((m) => m.objet), ...(e ? [e.missive.titre, e.missive.commanditaire] : [])])
  const internes = avec.filter((x) => !ouvertes.has(x.dm.missive) && trouve(x))
  const enCours = internes.filter((x) => !comblee(x))
  const comblees = internes.filter(comblee)
  const permanentes = d.permanentes.filter((x) => x.statut === 'ouverte' && cherche(requetes, [x.objet]))
  const missives = missivesEnCours
    .map((e) => ({ e, feuillets: avec.filter((x) => x.dm.missive === e.missive.numero) }))
    .filter(({ e, feuillets }) => (feuillets.length ? feuillets.some((x) => trouve(x, e)) : cherche(requetes, [e.missive.titre, e.missive.commanditaire, ...e.missive.lignes.map((l) => l.produit)])))
  const rien = !missives.length && !enCours.length && !permanentes.length && !comblees.length
  return (
    <div className="missions-droite">
      {/* What waits for a yes / no, for who may answer but does not open the Intendance (a Voix, a Maître). */}
      {permis(reg, 'recevoir') && reg.r.marchand?.droits?.intendance !== true && <EnAttente reg={reg} icones={icones} tab={tab} />}
      {missives.length > 0 && (
        <>
          <h3 className="titre-section">Missives en cours</h3>
          <ul className="liste-feuillets">
            {missives.map(({ e, feuillets }) => (
              <li key={e.missive.numero} className="bloc-missive">
                <div className="bloc-missive-tete">
                  <SceauMissive commanditaire={e.missive.commanditaire} />
                  <button type="button" className="feuillet-titre" tabIndex={tab} onClick={() => reg.allerA(idMissive(e.missive.numero))}>
                    {e.missive.titre}
                  </button>
                  <span className="feuillet-meta">
                    {e.missive.commanditaire && <>pour {e.missive.commanditaire}</>}
                    {e.missive.echeance && <> · échéance : {echeance(e.missive.echeance)}</>}
                  </span>
                </div>
                {feuillets.length ? (
                  <ul className="liste-feuillets">
                    {feuillets.map((x) => (
                      <BlocDemande key={x.dm.numero} dm={x.dm} ms={x.ms} reg={reg} icones={icones} tab={tab} missive={e.missive.titre} />
                    ))}
                  </ul>
                ) : (
                  <p className="vide-encre">
                    Nulle mission n’est encore écrite pour cette missive.{' '}
                    {permis(reg, 'demande') && (
                      <Action icone="ligne" tabIndex={tab} disabled={!d.intendanceActive} onClick={() => reg.ouvrir({ genre: 'ecrire', missive: e.missive.numero, objet: e.missive.lignes[0]?.produit, quantite: e.missive.lignes[0]?.quantite })}>
                        écrire ses missions
                      </Action>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {enCours.length > 0 && (
        <>
          <h3 className="titre-section">Pour la caravane</h3>
          <ul className="liste-feuillets">
            {enCours.map((x) => (
              <BlocDemande key={x.dm.numero} dm={x.dm} ms={x.ms} reg={reg} icones={icones} tab={tab} />
            ))}
          </ul>
        </>
      )}
      {permanentes.length > 0 && (
        <>
          <h3 className="titre-section">Missions permanentes</h3>
          <p className="note-encre">Toujours ouvertes : la caravane en a toujours besoin.</p>
          <ul className="missions-liste">
            {permanentes.map((x) => (
              <li key={x.id} className="mission permanente">
                <GlypheType type={x.type} icones={icones} />
                <span className="mission-texte">
                  <span className="mission-intitule">
                    {VERBES[x.type]} {x.objet}
                  </span>
                  <Meta parts={[<span key="t" className="toujours">toujours ouverte</span>]} />
                </span>
                <span className="mission-cote">
                  <Pts reg={reg} n={x.points} />
                  <span className="mission-gestes">
                    {permis(reg, 'signaler') && (
                      <Action icone="signaler" tabIndex={tab} disabled={!d.intendanceActive} onClick={() => reg.ouvrir({ genre: 'signaler', mission: x.id })}>
                        j’en ai remis
                      </Action>
                    )}
                    {permis(reg, 'entree') && (
                      <Action icone="entree" tabIndex={tab} disabled={!d.intendanceActive} onClick={() => reg.ouvrir({ genre: 'entree', mission: x.id })}>
                        consigner
                      </Action>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {comblees.length > 0 && (
        <>
          <h3 className="titre-section">Comblées, on y livre encore</h3>
          <ul className="inventaire missions-comblees">
            {comblees.map((x) => (
              <li key={x.dm.numero}>
                <button type="button" className="lien-encre" tabIndex={tab} onClick={() => reg.allerA(idDemande(x.dm.numero))}>
                  {titreDemande(x.dm)}
                </button>
                <span className="points" />
                <Coche titre="comblée" />
              </li>
            ))}
          </ul>
        </>
      )}
      {rien && <p className="vide-encre">{requetes.some((q) => q.trim()) ? 'Nulle mission ne répond à ce nom.' : 'Nulle mission n’est encore écrite : la caravane ne manque de rien, pour l’heure.'}</p>}
      {citation}
    </div>
  )
}

/* ───────────────────────── My notebook ───────────────────────── */

const STATUTS: Record<LigneIntendance['statut'], string> = { 'en attente': 'en attente', reçue: 'reçu', refusée: 'pas reçu', 'en cours': 'en cours', close: 'clos', sortie: 'sorti' }

export function GaucheCarnet({ page, reg, icones, compact }: { page: PageCarnet; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const d = reg?.m?.donnees
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {reg && <Ferme reg={reg} />}
      {reg && d && ouvert(reg) && (
        <>
          <Signature reg={reg} />
          <Inactif reg={reg} intendance />
          <Message reg={reg} />
          {permis(reg, 'signaler') && (
            <div className="gestes">
              <Geste icone={icones['hand']} disabled={!d.intendanceActive} onClick={() => reg.ouvrir({ genre: 'signaler' })}>
                Signaler une remise
              </Geste>
            </div>
          )}
        </>
      )}
    </>
  )
}

/** The member's own progress on missions (« 60 sur 100 »): kept in this browser only, never sent (Missions v2, S7). */
function Avancement({ reg, moi, tab }: { reg: CtxRegistre; moi: string; tab: number }) {
  const d = reg.m!.donnees!
  const cleStock = `caravane-carnet:${cle(moi)}`
  const [notes, setNotes] = useState<{ k: string; v: Record<string, number> } | null>(null)
  useEffect(() => {
    try {
      const t = window.localStorage.getItem(cleStock)
      const v = t ? (JSON.parse(t) as Record<string, number>) : null
      if (v && typeof v === 'object') setNotes({ k: cleStock, v })
    } catch {
      // No storage (private window…): the notes simply are not kept.
    }
  }, [cleStock])
  const v = notes?.k === cleStock ? notes.v : {}
  const garder = (x: Record<string, number>) => {
    setNotes({ k: cleStock, v: x })
    try {
      window.localStorage.setItem(cleStock, JSON.stringify(x))
    } catch {
      // Not kept: shown for this visit only.
    }
  }
  const suivies = d.missions.filter((m) => m.numero in v)
  const libres = d.missions.filter((m) => enJeu(m) && !(m.numero in v) && !etatMission(m, d.intendance).comblee)
  const titres = new Map(d.demandes.map((x) => [x.numero, titreDemande(x)]))
  return (
    <section className="avancement">
      <h3 className="titre-section">Où j’en suis</h3>
      <p className="note-encre">Pour toi seul : ces notes restent dans ce grimoire-ci, nul autre ne les voit.</p>
      {suivies.length > 0 && (
        <ul className="missions-liste">
          {suivies.map((m) => {
            const n = v[m.numero] ?? 0
            return (
              <li key={m.numero} className="mission avancement-ligne">
                <span className="mission-texte">
                  <span className="mission-intitule">
                    {VERBES[m.type]} {m.objet}
                  </span>
                  <span className="mission-meta">{titres.get(m.demande) ?? ''}</span>
                  <Jauge avance={m.quantite ? n / m.quantite : 0} />
                </span>
                <span className="mission-cote avancement-saisie">
                  <label>
                    <span className="sr">J’en ai</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      tabIndex={tab}
                      value={n ? String(n) : ''}
                      placeholder="0"
                      aria-label={`${m.objet} : où j’en suis`}
                      onChange={(e) => garder({ ...v, [m.numero]: Number(e.target.value.replace(/\D/g, '').slice(0, 7)) || 0 })}
                    />
                  </label>
                  <span className="mission-meta">sur {nf(m.quantite)}</span>
                  <button
                    type="button"
                    className="fiche-rayer"
                    tabIndex={tab}
                    aria-label={`Ne plus suivre ${m.objet}`}
                    title="Ne plus suivre"
                    onClick={() => {
                      const { [m.numero]: _, ...reste } = v
                      garder(reste)
                    }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {libres.length > 0 && (
        <label className="fiche-champ suivre-mission">
          <span>Suivre une mission</span>
          <select tabIndex={tab} value="" onChange={(e) => e.target.value && garder({ ...v, [e.target.value]: 0 })}>
            <option value="">— choisir —</option>
            {libres.map((m) => (
              <option key={m.numero} value={m.numero}>
                {VERBES[m.type]} {m.objet} ({titres.get(m.demande) ?? m.demande})
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  )
}

export function DroiteCarnet({ reg, interactif }: { reg?: CtxRegistre; interactif: boolean }) {
  const d = reg?.m?.donnees
  if (!reg || !d?.relie) return null
  const moi = moiDe(reg)
  if (!moi) return <p className="vide-encre">Signe d’abord l’ex-libris : le carnet est celui de ton nom.</p>
  const tab = interactif ? 0 : -1
  const mien = d.intendance.filter((l) => estEntree(l) && l.genre !== 'rentrée' && cle(l.membre) === cle(moi)).sort((a, b) => (b.date || b.le).localeCompare(a.date || a.le))
  const anciennes = d.missions.filter((m) => m.statut === 'accomplie' && cle(m.prisPar) === cle(moi))
  return (
    <div className="carnet-droite">
      <h3 className="titre-section">Ce que j’ai remis</h3>
      {mien.length || anciennes.length ? (
        <ul className="missions-liste">
          {mien.map((l) => (
            <li key={l.id} className={`mission remise-carnet statut-${cle(l.statut)} ${l.enAttente ? 'en-attente' : ''}`}>
              <span className="mission-texte">
                <span className="mission-intitule">
                  {nf(l.quantite)} {l.objet}
                </span>
                <Meta parts={[(l.date || l.le) && `le ${dateTamrielique(l.date || l.le)}`, l.coffre === PETITES_LUNES ? 'au coffre des petites lunes' : null, l.statut !== 'en attente' && l.par && `${l.statut === 'reçue' ? 'reçu' : 'répondu'} par ${l.par}`]} />
              </span>
              <span className="mission-cote">
                <span className={`tampon petit ${l.statut === 'refusée' ? 'refuse' : ''}`}>{STATUTS[l.statut]}</span>
              </span>
            </li>
          ))}
          {anciennes.map((m) => (
            <li key={m.numero} className="mission remise-carnet statut-recue">
              <span className="mission-texte">
                <span className="mission-intitule">
                  {nf(m.quantite)} {m.objet}
                </span>
                <Meta parts={[m.accomplieLe && `le ${dateTamrielique(m.accomplieLe)}`, m.confirmePar && `reçu par ${m.confirmePar}`]} />
              </span>
              <span className="mission-cote">
                <span className="tampon petit">reçu</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide-encre">Rien encore à ton nom. Remets une récolte à l’Intendance, ou signale ce que tu as déposé.</p>
      )}
      <Avancement reg={reg} moi={moi} tab={tab} />
    </div>
  )
}

/* ───────────────────────── One sheet's page (the missive interface) ───────────────────────── */

const demandeDe = (reg: CtxRegistre | undefined, numero: string) => reg?.m?.donnees?.demandes.find((x) => x.numero === numero)

export function GaucheDemande({ page, reg, icones }: { page: PageDemande; reg?: CtxRegistre; icones: Record<string, string> }) {
  const dm = demandeDe(reg, page.numero)
  if (!reg || !dm) return reg ? <Ferme reg={reg} /> : null
  const d = reg.m!.donnees!
  const missive = dm.missive ? reg.r.calcul?.etats.find((e) => e.missive.numero === dm.missive)?.missive : undefined
  const a = avancement(dm, d.missions, d.intendance)
  const premiere = missionsDe(d, dm.numero).find((m) => !etatMission(m, d.intendance).comblee) ?? missionsDe(d, dm.numero)[0]
  return (
    <>
      <div className="missive-meta">
        {missive ? (
          <p className="missive-pour feuillet-missive">
            <SceauMissive commanditaire={missive.commanditaire} /> pour la missive{' '}
            <button type="button" className="lien-encre" onClick={() => reg.allerA(idMissive(missive.numero))}>
              {missive.titre}
            </button>
            {missive.commanditaire && <> de {missive.commanditaire}</>}
          </p>
        ) : (
          <p className="missive-pour">pour la caravane</p>
        )}
        <p>
          Écrit par {dm.membre || 'une patte anonyme'}
          {dm.horodatage && <> le {dateTamrielique(dm.horodatage)}</>}
        </p>
        {dm.note && <p className="note-encre">{dm.note}</p>}
      </div>
      <p className="missive-resume">
        {a.total} mission{a.total > 1 ? 's' : ''} · {a.comblees === a.total ? 'toutes comblées' : `${a.comblees} comblée${a.comblees > 1 ? 's' : ''}`} · {Math.round(a.avance * 100)} % réuni
      </p>
      <Signature reg={reg} />
      <Inactif reg={reg} intendance />
      <Message reg={reg} />
      <div className="gestes">
        {permis(reg, 'signaler') && premiere && (
          <Geste icone={icones['hand']} disabled={!d.intendanceActive} onClick={() => reg.ouvrir({ genre: 'signaler', mission: premiere.numero })}>
            Signaler une remise
          </Geste>
        )}
        {permis(reg, 'entree') && premiere && (
          <Geste icone={icones['entry-door']} disabled={!d.intendanceActive} onClick={() => reg.ouvrir({ genre: 'entree', mission: premiere.numero })}>
            Consigner une remise
          </Geste>
        )}
      </div>
    </>
  )
}

export function DroiteDemande({ page, reg, icones, interactif }: { page: PageDemande; reg?: CtxRegistre; icones: Record<string, string>; interactif: boolean }) {
  const dm = demandeDe(reg, page.numero)
  if (!reg || !dm) return null
  const d = reg.m!.donnees!
  const ms = missionsDe(d, dm.numero)
  const numeros = new Set(ms.map((m) => m.numero))
  const qui = porteurs(numeros, d.intendance, ms)
  const journal = d.intendance.filter((l) => numeros.has(l.mission) && estEntree(l)).sort((a, b) => (b.date || b.le).localeCompare(a.date || a.le))
  const tab = interactif ? 0 : -1
  const ouvrir = (m: Mission) => (permis(reg, 'entree') ? reg.ouvrir({ genre: 'entree', mission: m.numero }) : permis(reg, 'signaler') ? reg.ouvrir({ genre: 'signaler', mission: m.numero }) : undefined)
  const actionnable = interactif && d.intendanceActive && (permis(reg, 'entree') || permis(reg, 'signaler'))
  return (
    <div className="missive-droite demande-droite">
      <h3 className="titre-section">Ce qu’il faut réunir</h3>
      <div className="besoins" role="table">
        <div className="besoins-entete" role="row">
          <span>Mission</span>
          <span>Requis</span>
          <span>Reçu</span>
          <span>Manque</span>
        </div>
        {ms.map((m) => {
          const e = etatMission(m, d.intendance)
          return (
            <div
              key={m.numero}
              role="row"
              className={`besoins-ligne ${e.manque > 0 ? 'manquant' : 'reuni'} ${actionnable ? 'actionnable' : ''}`}
              {...(actionnable
                ? {
                    tabIndex: tab,
                    title: permis(reg, 'entree') ? `Consigner une remise pour ${m.objet}` : `Signaler une remise pour ${m.objet}`,
                    onClick: () => ouvrir(m),
                    onKeyDown: (ev: React.KeyboardEvent) => {
                      if (ev.target !== ev.currentTarget || (ev.key !== 'Enter' && ev.key !== ' ')) return
                      ev.preventDefault()
                      ouvrir(m)
                    },
                  }
                : {})}
            >
              <span className="besoins-nom">
                <span className="besoins-mot">
                  <GlypheType type={m.type} icones={icones} /> {VERBES[m.type]} {m.objet}
                </span>
                {e.attente > 0 && <em>{nf(e.attente)} en attente de confirmation</em>}
                {voitPoints(reg) && <em>{pts(m.points)}</em>}
                <Jauge avance={e.avance} />
              </span>
              <span>{nf(e.requis)}</span>
              <span>{nf(e.recu)}</span>
              <span className="besoins-manque">{e.manque > 0 ? nf(e.manque) : <Coche />}</span>
            </div>
          )
        })}
      </div>
      <h3 className="titre-section">Les pattes de la mission</h3>
      {qui.length ? (
        <ul className="inventaire">
          {qui.map((p) => (
            <li key={p.membre}>
              <span>{p.membre}</span>
              <span className="points" />
              <em>
                {p.fois} remise{p.fois > 1 ? 's' : ''}
              </em>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide-encre">Nulle patte n’a encore rien remis pour ce feuillet.</p>
      )}
      <h3 className="titre-section">Journal des remises</h3>
      {journal.length ? (
        <ol className="journal">
          {journal.slice(0, 40).map((l) => (
            <li key={l.id} className={`journal-${l.statut === 'reçue' ? 'depot' : 'attente'} ${l.enAttente ? 'encre-fraiche' : ''}`}>
              <span className="journal-ligne">
                <strong className="journal-qui">{l.membre || 'Anonyme'}</strong>
                <span className="journal-quand">{quand(l.date || l.le)}</span>
                <span className="journal-quoi">
                  {nf(l.quantite)} {l.objet} · {STATUTS[l.statut]}
                  {l.statut === 'reçue' && l.par ? ` par ${l.par}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="vide-encre">Rien encore n’est écrit dans ce journal.</p>
      )}
    </div>
  )
}

/* ───────────────────────── Writing a sheet: the tree, sorted before publishing (S8) ───────────────────────── */

type Choix = Record<string, { garde?: boolean; q?: string }>

function FicheEcrire({ reg, articles, icones, fermer, objet: objet0 = '', quantite: q0, missive: missive0 }: EnvMission & { objet?: string; quantite?: number; missive?: string }) {
  const m = reg.m!
  const d = m.donnees!
  const recettes = useMemo(() => (reg.r.donnees?.recettes ?? []).filter((r) => !r.ombre), [reg.r.donnees?.recettes])
  const noms = useMemo(() => nomsObjets(reg, articles), [reg, articles])
  const stock = useMemo(() => rejouer(reg.r.donnees?.mouvements ?? []).stock, [reg.r.donnees?.mouvements])
  const [v, setV] = useState({ objet: objet0, quantite: q0 ? String(q0) : '', titre: '', note: '', missive: false, commanditaire: '', echeance: '' })
  const [choix, setChoix] = useState<Choix>({})
  const missiveLiee = missive0 ? reg.r.calcul?.etats.find((e) => e.missive.numero === missive0)?.missive : undefined
  const nom = noms.get(cle(v.objet)) ?? ''
  const article = articles.find((a) => !a.ombre && cle(a.fr) === cle(nom))
  const Q = Number(v.quantite)
  const p = useMemo(() => (nom && Q >= 1 ? proposer(article ? { fr: article.fr, min: article.min } : { fr: nom, min: null }, Q, recettes, d.ponderation, articles) : null), [nom, Q, article, recettes, d.ponderation, articles])
  const { etat, erreur, envoyer } = useScelle(fermer)
  // A line's state: ticked by default unless the chest already holds what the tree needs; its quantity what is missing.
  const ligne = (l: { cle: string; objet: string; total: number }) => {
    const c = choix[l.cle] ?? {}
    const auCoffre = Math.max(0, enStock(stock, l.objet))
    const manque = Math.max(0, l.total - auCoffre)
    const q = c.q ?? String(manque || l.total)
    return { auCoffre, manque, garde: c.garde ?? manque > 0, q, n: Number(q) }
  }
  const lignes = p?.ok ? p.lignes.map((l) => ({ l, ...ligne(l) })) : []
  const gardees = lignes.filter((x) => x.garde && x.n >= 1)
  const pret = Boolean(p?.ok) && gardees.length > 0 && (!v.missive || v.commanditaire.trim()) && lignes.every((x) => !x.garde || x.n >= 1)
  const changer = (k: string, x: Choix[string]) => setChoix({ ...choix, [k]: { ...choix[k], ...x } })
  const publier = (e: FormEvent) => {
    e.preventDefault()
    if (!pret) return
    envoyer(() =>
      m.agir('demande', {
        objet: nom,
        quantite: Q,
        titre: v.titre,
        note: v.note,
        lignes: gardees.map((x) => ({ cle: x.l.cle, quantite: x.n })),
        ...(missiveLiee ? { missive: missiveLiee.numero } : v.missive ? { missive: { commanditaire: v.commanditaire, echeance: v.echeance } } : {}),
      }),
    )
  }
  const liste = [...noms.values()].sort((a, b) => a.localeCompare(b, 'fr'))
  return (
    <form className="fiche-form demande-form" onSubmit={publier}>
      {missiveLiee && (
        <p className="fiche-aide feuillet-missive">
          <SceauMissive commanditaire={missiveLiee.commanditaire} /> Pour la missive « {missiveLiee.titre} »{missiveLiee.commanditaire ? ` de ${missiveLiee.commanditaire}` : ''}.
        </p>
      )}
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Ce qu’il faut réunir</span>
          <input type="text" list="objets-ecrire" value={v.objet} placeholder="Flèches en fer, Blé…" maxLength={120} onChange={(e) => (setV({ ...v, objet: e.target.value }), setChoix({}))} />
          <datalist id="objets-ecrire">
            {liste.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="fiche-champ">
          <span>Combien</span>
          <input type="text" inputMode="numeric" value={v.quantite} placeholder="1000" onChange={(e) => (setV({ ...v, quantite: e.target.value.replace(/\D/g, '').slice(0, 6) }), setChoix({}))} />
        </label>
      </div>
      {v.objet && !nom && <p className="message-encre erreur">Khajiit ne connaît nulle ressource ni marchandise de ce nom.</p>}
      <label className="fiche-champ">
        <span>Titre (facultatif)</span>
        <input type="text" value={v.titre} maxLength={120} placeholder={nom && Q ? `${nf(Q)} ${nom}` : 'Les flèches du Jarl'} onChange={(e) => setV({ ...v, titre: e.target.value })} />
      </label>
      {!missiveLiee && (
        <label className="fiche-coche">
          <input type="checkbox" checked={v.missive} disabled={!d.intendanceActive} onChange={(e) => setV({ ...v, missive: e.target.checked })} />
          <span>C’est une missive (une commande venue du dehors)</span>
        </label>
      )}
      {!missiveLiee && !d.intendanceActive && <p className="fiche-aide">{TEXTES_INTENDANCE.inactif}</p>}
      {v.missive && !missiveLiee && (
        <div className="fiche-deux">
          <label className="fiche-champ">
            <span>Qui commande</span>
            <input type="text" value={v.commanditaire} maxLength={80} placeholder="le Jarl de Blancherive" onChange={(e) => setV({ ...v, commanditaire: e.target.value })} />
          </label>
          <label className="fiche-champ">
            <span>Échéance</span>
            <input type="text" value={v.echeance} maxLength={40} placeholder="dans dix jours" onChange={(e) => setV({ ...v, echeance: e.target.value })} />
          </label>
        </div>
      )}
      {p && !p.ok && <p className="message-encre erreur">{p.erreur}</p>}
      {p?.ok && (
        <>
          <h3 className="fiche-sous-titre">Les missions proposées</h3>
          <p className="fiche-aide">Décoche ce que la caravane a déjà ; change une quantité sur sa ligne. Rien n’est écrit avant « Publier ».</p>
          <div className="tri-missions" role="table">
            <div className="tri-entete" role="row">
              <span>Mission</span>
              <span>Il en faut</span>
              <span>Au coffre</span>
              <span>À demander</span>
            </div>
            {lignes.map(({ l, auCoffre, garde, q, n }) => (
              <div key={l.cle} className={`tri-ligne ${garde ? '' : 'retiree'}`} role="row">
                <label className="tri-nom">
                  <input type="checkbox" checked={garde} onChange={(e) => changer(l.cle, { garde: e.target.checked })} />
                  <GlypheType type={l.type} icones={icones} />
                  <span>
                    {VERBES[l.type]} {l.objet}
                    {l.aFixer && <em className="a-fixer"> · {TEXTES.aFixer}</em>}
                    {voitPoints(reg) && garde && n >= 1 && <em className="tri-points"> · {pts(pointsDeLigne(l, n))}</em>}
                  </span>
                </label>
                <span>{nf(l.total)}</span>
                <span>{nf(auCoffre)}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={q}
                  disabled={!garde}
                  aria-label={`${l.objet} : quantité à demander`}
                  onChange={(e) => changer(l.cle, { q: e.target.value.replace(/\D/g, '').slice(0, 7) })}
                />
              </div>
            ))}
          </div>
          <p className="fiche-partage">
            <strong>{gardees.length}</strong> mission{gardees.length > 1 ? 's' : ''} à publier
            {lignes.length > gardees.length && <>, {lignes.length - gardees.length} retirée{lignes.length - gardees.length > 1 ? 's' : ''}</>}.
          </p>
        </>
      )}
      <label className="fiche-champ">
        <span>Note (facultative)</span>
        <input type="text" value={v.note} maxLength={200} placeholder="pour la foire de Blancherive" onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!pret}>
          Publier
        </Sceller>
      </div>
    </form>
  )
}

/* ───────────────────────── Every member's points (the Trésor) and the pondération (the Intendance) ───────────────────────── */

export function GauchePatriarche({ page, reg, icones, compact }: { page: PagePatriarche; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const d = reg?.m?.donnees
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {reg && <Ferme reg={reg} />}
      {reg && d && ouvert(reg) && (
        <>
          <Signature reg={reg} />
          <Inactif reg={reg} />
          <Message reg={reg} />
          {page.vue === 'points' && <ResumePoints reg={reg} />}
          {page.vue === 'ponderation' && <ResumeReglages reg={reg} icones={icones} />}
        </>
      )}
    </>
  )
}

export function DroitePatriarche({ page, reg }: { page: PagePatriarche; reg?: CtxRegistre }) {
  if (!reg?.m?.donnees?.relie) return null
  if (page.vue === 'points') return <TableauPoints reg={reg} />
  return <VuePonderation reg={reg} />
}

function ResumePoints({ reg }: { reg: CtxRegistre }) {
  const d = reg.m!.donnees!
  const total = d.points.reduce((t, p) => t + p.points, 0)
  const n = new Set(d.points.map((p) => cle(p.membre))).size
  return (
    <p className="missive-resume">
      {pts(total)} crédités à {n} membre{n > 1 ? 's' : ''}
    </p>
  )
}

function TableauPoints({ reg }: { reg: CtxRegistre }) {
  const d = reg.m!.donnees!
  const liste = soldes(d.points, d.missions, d.intendance)
  if (!liste.length) return <p className="vide-encre">Nul point n’est encore inscrit au registre.</p>
  return (
    <div className="tableau-points" role="table">
      <div className="tableau-points-entete" role="row">
        <span>Membre</span>
        <span>Points</span>
        <span>Remises</span>
      </div>
      {liste.map((s) => (
        <div key={s.membre} className="tableau-points-ligne" role="row">
          <span>{s.membre}</span>
          <strong>{nf(s.total)}</strong>
          <span>{s.remises || '—'}</span>
        </div>
      ))}
    </div>
  )
}


/* ── The pondération: shown on the page, changed on notes ── */


/** Every item the recipes use (raw or intermediate) and every raw material; then the final products. */
function matieres(reg: CtxRegistre, p: Ponderation) {
  const recettes = (reg.r.donnees?.recettes ?? []).filter((r) => !r.ombre)
  const noms = new Map<string, string>()
  const ajouter = (n: string) => n && !noms.has(cle(n)) && noms.set(cle(n), n)
  ;(reg.r.donnees?.ressources ?? []).forEach((r) => ajouter(r.nom))
  recettes.forEach((r) => r.ingredients.forEach((i) => ajouter(i.nom)))
  p.ressources.forEach((r) => ajouter(r.nom))
  const produits = new Map(recettes.map((r) => [cle(r.produit), r.produit]))
  const liste = [...noms.values()].map((nom) => ({ nom, intermediaire: produits.has(cle(nom)) })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  const finis = [...produits.values()].filter((n) => !noms.has(cle(n))).sort((a, b) => a.localeCompare(b, 'fr'))
  return { liste, finis }
}

/** A pondération written whole (one call): the registre's, with one change. */
const graver = (reg: CtxRegistre, p: Ponderation) =>
  reg.m!.agir('ponderation', { ponderation: { classes: p.classes, ressources: p.ressources, lots: p.lots, donsMin: p.donsMin, reglages: p.reglages } })

const lotDe = (p: Ponderation, nom: string) => p.lots.find((l) => cle(l.nom) === cle(nom))?.lot ?? null

function ResumeReglages({ reg, icones }: { reg: CtxRegistre; icones: Record<string, string> }) {
  const d = reg.m!.donnees!
  const p = d.ponderation
  const peut = reg.r.marchand?.droits?.ponderation !== false && Boolean(moiDe(reg))
  return (
    <>
      <p className="note-encre">
        {p.source === 'registre'
          ? 'Lue au registre (onglets Pondération et Réglages missions, cachés dans la feuille ; on peut aussi les corriger à la main).'
          : 'Les valeurs par défaut du grimoire : rien n’est encore gravé au registre.'}{' '}
        Seule l’alchimie est éprouvée ; le reste est une première estimation. Touche une ressource, à droite, pour la ranger.
      </p>
      <h3 className="titre-section">Réglages</h3>
      <ul className="inventaire reglages-missions">
        {REGLAGES_VUS.map((r) => (
          <li key={r.cle}>
            <span>{r.libelle}</span>
            <span className="points" />
            <strong>{prix(p.reglages[r.cle])}</strong>
          </li>
        ))}
      </ul>
      {peut && (
        <div className="gestes">
          <Geste icone={icones['weight-scale']} onClick={() => reg.ouvrir({ genre: 'reglages-missions' })}>
            Changer les réglages
          </Geste>
        </div>
      )}
    </>
  )
}

/** « Blé — Abondant · Ferme — 40 par mission (réglé à la main) » */
function descriptionMatiere(p: Ponderation, nom: string, intermediaire: boolean, fini: boolean) {
  const { assignee, classeDe, poidsDe } = peser(p)
  const a = assignee(nom)
  const c = fini ? null : classeDe(nom) ?? (intermediaire && !a?.classe ? p.classes.find((x) => x.code === CODE_TRANSFORMATION) ?? null : null)
  const lot = lotDe(p, nom)
  const w = poidsDe(nom, intermediaire)
  const reference = fini ? null : w ? Math.max(1, Math.round(p.reglages.budget / w)) : null
  const parMission = lot ?? (fini ? p.reglages.objetsParFabrication : (reference ?? p.reglages.quantiteRepli))
  const donMin = p.donsMin.find((x) => cle(x.nom) === cle(nom))?.lot ?? null
  return {
    niveau: fini ? 'produit fini' : (c?.nom ?? 'rareté à fixer'),
    aFixer: !fini && w === null,
    origine: a?.origine || '',
    reference,
    referencePropre: Boolean(a?.reference),
    parMission,
    source: lot ? 'réglé à la main' : fini ? 'réglage' : w === null ? 'repli' : a?.reference ? 'référence propre' : '',
    donMin: donMin ?? parMission * p.reglages.multipleDon,
    donMinPropre: donMin !== null,
  }
}

function VuePonderation({ reg }: { reg: CtxRegistre }) {
  const p = reg.m!.donnees!.ponderation
  const peut = reg.r.marchand?.droits?.ponderation !== false && Boolean(moiDe(reg))
  const { assignee, poidsDe } = peser(p)
  const { liste, finis } = matieres(reg, p)
  const [origine, setOrigine] = useState('')
  const origines = [...new Set([...ORIGINES, ...p.ressources.map((r) => r.origine).filter(Boolean)])]
  const groupe = (x: { nom: string; intermediaire: boolean }) => {
    const a = assignee(x.nom)
    if (!a?.classe) return x.intermediaire ? CODE_TRANSFORMATION : ''
    return poidsDe(x.nom) === null ? '' : a.classe
  }
  const groupes = [{ code: '', titre: 'Rareté à fixer' }, ...p.classes.map((c) => ({ code: c.code, titre: c.nom }))]
  const ligne = (nom: string, intermediaire: boolean, fini: boolean) => {
    const x = descriptionMatiere(p, nom, intermediaire, fini)
    return (
      <button key={nom} type="button" className="ressource-ponderee" disabled={!peut} onClick={() => reg.ouvrir({ genre: 'matiere-mission', nom })} title={peut ? `Régler ${nom}` : undefined}>
        <span className="ressource-nom">{nom}</span>
        <span className="ressource-desc">
          <span className={x.aFixer ? 'a-fixer' : ''}>{x.niveau}</span>
          {x.origine && <> · {x.origine}</>} — <b className={x.source === 'réglé à la main' ? 'fixe' : ''}>{quantite(x.parMission)} par mission</b>
          {x.source && <em> ({x.source})</em>}
          {x.donMinPropre && <em> · don minimum {quantite(x.donMin)}</em>}
        </span>
      </button>
    )
  }
  const visible = (nom: string) => !origine || cle(assignee(nom)?.origine ?? '') === cle(origine)
  return (
    <div className="ponderation-droite">
      <h3 className="titre-section">Niveaux de rareté</h3>
      <p className="note-encre">Combien en ramasse-t-on en une courte session ? C’est ce nombre qui règle les missions (et, en coulisse, le partage des points).</p>
      <ul className="inventaire niveaux-rarete">
        {p.classes.map((c) => (
          <li key={c.code}>
            <span>{c.nom}</span>
            <span className="points" />
            <strong className={c.quantite === null ? 'a-fixer' : ''}>{c.quantite === null ? 'à fixer' : `${quantite(c.quantite)} par mission`}</strong>
          </li>
        ))}
      </ul>
      {peut && (
        <p className="ponderation-action">
          <Action icone="peser" onClick={() => reg.ouvrir({ genre: 'classes-missions' })}>
            corriger les niveaux
          </Action>
        </p>
      )}
      <div className="filtre-missions" role="group" aria-label="Filtrer par origine">
        {['', ...origines].map((o) => (
          <button key={o || 'toutes'} type="button" className={`lien-encre ${origine === o ? 'actif' : ''}`} aria-pressed={origine === o} onClick={() => setOrigine(o)}>
            {o || 'Toutes origines'}
          </button>
        ))}
      </div>
      {groupes.map((g) => {
        const membres = liste.filter((x) => groupe(x) === g.code && visible(x.nom))
        if (!membres.length) return null
        return (
          <section key={g.code || 'a-fixer'} className={`groupe-ressources ${g.code ? '' : 'a-fixer-groupe'}`}>
            <h4 className="fiche-sous-titre">
              {g.titre} <span className="compte-missions">{membres.length}</span>
            </h4>
            {!g.code && <p className="note-encre">Sans rareté : leurs missions prennent {prix(p.reglages.quantiteRepli)} par défaut et sont marquées « {TEXTES.aFixer} ».</p>}
            {membres.map((x) => ligne(x.nom, x.intermediaire, false))}
          </section>
        )
      })}
      {finis.length > 0 && !origine && (
        <section className="groupe-ressources">
          <h4 className="fiche-sous-titre">
            Produits finis <span className="compte-missions">{finis.length}</span>
          </h4>
          {finis.map((nom) => ligne(nom, true, true))}
        </section>
      )}
    </div>
  )
}

/** The settings' note. */
function FicheReglages({ reg, icones, fermer }: EnvMission) {
  const p = reg.m!.donnees!.ponderation
  const [r, setR] = useState(p.reglages)
  const { etat, erreur, envoyer } = useScelle(fermer)
  return (
    <form
      className="fiche-form ponderation-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(() => graver(reg, { ...p, reglages: r }))
      }}
    >
      {REGLAGES_VUS.map((x) => (
        <label key={x.cle} className="fiche-champ reglage">
          <span>{x.libelle}</span>
          <ChampNombre valeur={r[x.cle]} changer={(v) => setR({ ...r, [x.cle]: v ?? 0 })} />
          <em className="fiche-aide">{x.note}</em>
        </label>
      ))}
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones}>
          Graver les réglages
        </Sceller>
      </div>
    </form>
  )
}

/** The rarity levels' note: names and quantity per mission. */
function FicheClasses({ reg, icones, fermer }: EnvMission) {
  const p = reg.m!.donnees!.ponderation
  const [classes, setClasses] = useState<Classe[]>(p.classes)
  const changer = (i: number, x: Partial<Classe>) => setClasses(classes.map((c, k) => (k === i ? { ...c, ...x } : c)))
  const { etat, erreur, envoyer } = useScelle(fermer)
  return (
    <form
      className="fiche-form ponderation-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(() => graver(reg, { ...p, classes }))
      }}
    >
      <p className="fiche-aide">Combien en ramasse-t-on en une courte session ? Vide : « à fixer ».</p>
      <div className="classes-ponderation classes-fiche">
        {classes.map((c, i) => (
          <div key={c.code} className="classes-ligne niveau-ligne">
            <input type="text" value={c.nom} aria-label={`Nom du niveau ${c.code}`} onChange={(e) => changer(i, { nom: e.target.value.slice(0, 60) })} />
            <ChampNombre valeur={c.quantite} placeholder="à fixer" aria-label={`Quantité par mission du niveau ${c.nom}`} changer={(v) => changer(i, { quantite: v === null ? null : Math.round(v) })} />
            <span className="classe-lot">par mission</span>
          </div>
        ))}
      </div>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones}>
          Graver les niveaux
        </Sceller>
      </div>
    </form>
  )
}

/** One item's note: rarity and origin, its « quantité de référence », and the two overrides (lot per mission, donation minimum). */
function FicheMatiere({ reg, icones, fermer, nom }: EnvMission & { nom: string }) {
  const p = reg.m!.donnees!.ponderation
  const recettes = (reg.r.donnees?.recettes ?? []).filter((r) => !r.ombre)
  const intermediaire = recettes.some((r) => cle(r.produit) === cle(nom))
  const fini = intermediaire && !recettes.some((r) => r.ingredients.some((i) => cle(i.nom) === cle(nom))) && !(reg.r.donnees?.ressources ?? []).some((r) => cle(r.nom) === cle(nom))
  const a = p.ressources.find((r) => cle(r.nom) === cle(nom))
  const [classe, setClasse] = useState(a?.classe ?? '')
  const [origine, setOrigine] = useState(a?.origine ?? '')
  const [reference, setReference] = useState<number | null>(a?.reference ?? null)
  const [lot, setLot] = useState<number | null>(lotDe(p, nom))
  const [donMin, setDonMin] = useState<number | null>(p.donsMin.find((x) => cle(x.nom) === cle(nom))?.lot ?? null)
  const { etat, erreur, envoyer } = useScelle(fermer)
  const origines = [...new Set([...ORIGINES, ...p.ressources.map((r) => r.origine).filter(Boolean)])]
  const avec = (ref: number | null, l: number | null, dm: number | null): Ponderation => {
    const garde = classe || origine.trim() || ref
    const ressources: Assignation[] = [...p.ressources.filter((r) => cle(r.nom) !== cle(nom)), ...(garde ? [{ nom, classe, origine: origine.trim(), reference: ref, note: a?.note ?? '' }] : [])]
    const lots = [...p.lots.filter((x) => cle(x.nom) !== cle(nom)), ...(l ? [{ nom, lot: Math.round(l) }] : [])]
    const donsMin = [...p.donsMin.filter((x) => cle(x.nom) !== cle(nom)), ...(dm ? [{ nom, lot: Math.round(dm) }] : [])]
    return { ...p, ressources, lots, donsMin }
  }
  const x = descriptionMatiere(avec(reference, lot, donMin), nom, intermediaire, fini)
  const defaut = descriptionMatiere(avec(null, null, null), nom, intermediaire, fini)
  const sans = descriptionMatiere(avec(reference, null, null), nom, intermediaire, fini)
  return (
    <form
      className="fiche-form ponderation-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(() => graver(reg, avec(reference, lot, donMin)))
      }}
    >
      <p className="fiche-aide">
        {nom} — {x.niveau}
        {x.origine && ` · ${x.origine}`} — {quantite(x.parMission)} par mission{x.source && ` (${x.source})`} · don minimum {quantite(x.donMin)}
      </p>
      {!fini && (
        <>
          <label className="fiche-champ">
            <span>Rareté</span>
            <select value={classe} onChange={(e) => setClasse(e.target.value)}>
              <option value="">{intermediaire ? 'Fabrication intermédiaire (par défaut : se fabrique)' : 'à fixer'}</option>
              {p.classes.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.nom}
                  {c.quantite === null ? ' (à fixer)' : ` (référence ~${quantite(c.quantite)})`}
                </option>
              ))}
            </select>
          </label>
          {intermediaire && <p className="fiche-aide">Rangé dans un niveau de rareté, il se récolte ou s’achète au lieu de se fabriquer.</p>}
          <label className="fiche-champ">
            <span>Origine</span>
            <input type="text" list="origines-matieres" value={origine} maxLength={60} placeholder="Ferme, Chasse, Mine…" onChange={(e) => setOrigine(e.target.value)} />
            <datalist id="origines-matieres">
              {origines.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label className="fiche-champ">
            <span>Quantité de référence</span>
            <ChampNombre valeur={reference} placeholder={defaut.reference ? `${quantite(defaut.reference)} (sa rareté)` : 'à fixer'} changer={(v) => setReference(v === null ? null : Math.round(v))} />
          </label>
          <p className="fiche-aide">Ce qu’on en ramasse en une bonne session. Elle règle le poids (le partage des points), et par défaut la taille des missions et le minimum d’un don.</p>
        </>
      )}
      <label className="fiche-champ">
        <span>Lot par mission</span>
        <ChampNombre valeur={lot} placeholder={`${quantite(sans.parMission)} (par défaut)`} changer={(v) => setLot(v === null ? null : Math.round(v))} />
      </label>
      <p className="fiche-aide">Ce que tient une mission, s’il diffère{fini ? ' (par défaut : le réglage « objets par mission »)' : ' de la référence'} ; ne change pas le poids. Des paquets pleins, le reste en dernier.</p>
      <label className="fiche-champ">
        <span>Don minimum</span>
        <ChampNombre valeur={donMin} placeholder={`${quantite(sans.donMin)} (référence × ${prix(p.reglages.multipleDon)})`} changer={(v) => setDonMin(v === null ? null : Math.round(v))} />
      </label>
      <p className="fiche-aide">Un don libre rapporte des points à partir de cette quantité ; en dessous, il est reçu au coffre sans point. Ne change pas le poids.</p>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones}>
          Graver
        </Sceller>
      </div>
    </form>
  )
}

/** Whether an item is only a final product (a craft of it, its crafting share). */
function estFini(reg: CtxRegistre, articles: Article[], nom: string) {
  const recettes = (reg.r.donnees?.recettes ?? []).filter((r) => !r.ombre)
  return recettes.some((r) => cle(r.produit) === cle(nom)) && articles.some((a) => !a.ombre && cle(a.fr) === cle(nom)) && !recettes.some((r) => r.ingredients.some((i) => cle(i.nom) === cle(nom)))
}

/** A standing mission: always open; its points per « quantité de référence » set the rate of every hand-over. */
function FichePermanente({ reg, icones, fermer, id, articles }: EnvMission & { id?: string }) {
  const d = reg.m!.donnees!
  const x = d.permanentes.find((y) => y.id === id)
  const recettes = reg.r.donnees?.recettes ?? []
  const noms = useMemo(() => nomsObjets(reg, articles), [reg, articles])
  const [v, setV] = useState({ objet: x?.objet ?? '', quantite: x ? String(x.quantite) : '', points: x ? String(x.points) : '', statut: x?.statut ?? 'ouverte', note: x?.note ?? '' })
  const objet = noms.get(cle(v.objet)) ?? ''
  const fini = objet ? estFini(reg, articles, objet) : false
  const qDefaut = objet ? quantiteParMission(d.ponderation, objet, recettes, fini) : 0
  const q = Number(v.quantite) || qDefaut
  const pDefaut = objet ? pointsParPrise(objet, q, recettes, articles, d.ponderation, fini) : 0
  const { etat, erreur, envoyer } = useScelle(fermer)
  return (
    <form
      className="fiche-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(() => reg.m!.agir('permanente', { id, objet: objet || v.objet, quantite: q, points: v.points, statut: v.statut, note: v.note }))
      }}
    >
      <label className="fiche-champ">
        <span>Ressource ou ouvrage</span>
        <input type="text" list="objets-permanente" value={v.objet} placeholder="Blé" onChange={(e) => setV({ ...v, objet: e.target.value })} />
        <datalist id="objets-permanente">
          {[...noms.values()].sort((a, b) => a.localeCompare(b, 'fr')).map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      {v.objet && !objet && <p className="message-encre erreur">Khajiit ne connaît nulle ressource ni ouvrage de ce nom.</p>}
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Quantité de référence</span>
          <input type="text" inputMode="numeric" value={v.quantite} placeholder={qDefaut ? String(qDefaut) : '40'} onChange={(e) => setV({ ...v, quantite: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
        </label>
        {voitPoints(reg) && (
          <label className="fiche-champ">
            <span>Points pour cette quantité</span>
            <input type="text" inputMode="numeric" value={v.points} placeholder={String(pDefaut)} onChange={(e) => setV({ ...v, points: e.target.value.replace(/\D/g, '').slice(0, 7) })} />
          </label>
        )}
      </div>
      <p className="fiche-aide">Chaque remise rapporte au même taux, quelle qu’en soit la quantité.{voitPoints(reg) && ` Par défaut : ce que rapporte cette quantité dans les recettes qui l’emploient (${pts(pDefaut)}).`}</p>
      <label className="fiche-champ">
        <span>État</span>
        <select value={v.statut} onChange={(e) => setV({ ...v, statut: e.target.value as typeof v.statut })}>
          <option value="ouverte">ouverte</option>
          <option value="en pause">en pause</option>
          <option value="close">close</option>
        </select>
      </label>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!objet}>
          {x ? 'Graver' : 'Ouvrir la mission'}
        </Sceller>
      </div>
    </form>
  )
}

/** A hand-over made the prototype's way (before lot 2), not received: a short word. */
function FicheRefus({ reg, icones, fermer, numero }: EnvMission & { numero: string }) {
  const m = reg.m!.donnees!.missions.find((x) => x.numero === numero)
  const [note, setNote] = useState('')
  const { etat, erreur, envoyer } = useScelle(fermer)
  if (!m || m.statut !== 'remise') return <p className="fiche-aide">{TEXTES.pasRemise}</p>
  return (
    <form
      className="fiche-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(() => reg.m!.agir('refuser', { numero, note }))
      }}
    >
      <p className="fiche-aide">
        {nf(m.quantite)} {m.objet}, remis par {m.prisPar}.
      </p>
      <label className="fiche-champ">
        <span>Pourquoi</span>
        <input type="text" value={note} maxLength={120} placeholder="incomplet : 80 lys au lieu de 100" onChange={(e) => setNote(e.target.value)} />
      </label>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones}>
          Pas reçu
        </Sceller>
      </div>
    </form>
  )
}

/* ── The notes of the missions and of the Intendance, laid over the left page (components/Fiche.tsx) ── */

/** A catalogue chapter and the ids of its articles (as the slips receive them). */
type Chapitre = { id: string; titre: string; ids: string[] }
export type EnvMission = { reg: CtxRegistre; articles: Article[]; chapitres: Chapitre[]; icones: Record<string, string>; fermer: () => void }
export type FicheMission =
  | { genre: 'ecrire'; objet?: string; quantite?: number; missive?: string }
  | { genre: 'signaler'; mission?: string }
  | { genre: 'entree'; mission?: string; lien?: string; don?: boolean; petites?: boolean }
  | { genre: 'faconnage'; produit?: string; mission?: string }
  | { genre: 'perte' }
  | { genre: 'reglages-missions' }
  | { genre: 'classes-missions' }
  | { genre: 'matiere-mission'; nom: string }
  | { genre: 'refus-mission'; numero: string }
  | { genre: 'permanente'; id?: string }

export const GENRES_MISSION: FicheMission['genre'][] = ['ecrire', 'signaler', 'entree', 'faconnage', 'perte', 'reglages-missions', 'classes-missions', 'matiere-mission', 'refus-mission', 'permanente']

export function contenuMission(f: FicheMission, env: EnvMission): { surtitre: string; titre: string; corps: ReactNode; action: ActionMission } {
  if (!env.reg.m?.donnees) return { surtitre: 'Livre des Missions', titre: 'Missions', corps: <p className="registre-ferme attente-encre">Le scribe déroule le registre des missions…</p>, action: 'demande' }
  switch (f.genre) {
    case 'ecrire':
      return { surtitre: 'Livre de l’Intendance', titre: 'Écrire une mission', corps: <FicheEcrire {...env} objet={f.objet} quantite={f.quantite} missive={f.missive} />, action: 'demande' }
    case 'signaler':
      return { surtitre: 'L’appel aux missions', titre: 'Signaler une remise', corps: <FicheSignaler {...env} mission={f.mission} />, action: 'signaler' }
    case 'entree':
      return { surtitre: 'Réception', titre: f.lien ? 'Le retour de chez l’artisan' : f.petites ? 'Le coffre des petites lunes' : f.don ? 'Consigner un don' : 'Consigner une remise', corps: <FicheEntree {...env} mission={f.mission} lien={f.lien} don={f.don} petites={f.petites} />, action: 'entree' }
    case 'faconnage':
      return { surtitre: 'Sorties', titre: 'Sortir pour façonner', corps: <FicheFaconnage {...env} produit={f.produit} mission={f.mission} />, action: 'faconnage' }
    case 'perte':
      return { surtitre: 'Sorties', titre: 'Consigner une sortie', corps: <FichePerte {...env} />, action: 'sortie' }
    case 'reglages-missions':
      return { surtitre: 'La pondération des efforts', titre: 'Les réglages', corps: <FicheReglages {...env} />, action: 'ponderation' }
    case 'classes-missions':
      return { surtitre: 'La pondération des efforts', titre: 'Les niveaux de rareté', corps: <FicheClasses {...env} />, action: 'ponderation' }
    case 'matiere-mission':
      return { surtitre: 'La pondération des efforts', titre: f.nom, corps: <FicheMatiere {...env} nom={f.nom} />, action: 'ponderation' }
    case 'refus-mission':
      return { surtitre: 'À confirmer', titre: 'Pas reçu', corps: <FicheRefus {...env} numero={f.numero} />, action: 'refuser' }
    case 'permanente':
      return { surtitre: 'Livre de l’Intendance', titre: f.id ? 'Régler la mission permanente' : 'Ouvrir une mission permanente', corps: <FichePermanente {...env} id={f.id} />, action: 'permanente' }
  }
}
