'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import type { Article, PageMissions, PagePatriarche, PagePoints } from '@/lib/types'
import { dateTamrielique, prix } from '@/lib/format'
import { cle, type Recette } from '@/lib/missives'
import {
  avancement,
  CODE_TRANSFORMATION,
  enCoursDe,
  ICONES_TYPES,
  intitule,
  peser,
  raisonPoints,
  recetteDe,
  REGLAGES,
  soldes,
  TEXTES,
  traduire,
  TYPES_MISSION,
  VERBES,
  type LigneDemande,
  type ActionMission,
  type Assignation,
  type Classe,
  type DonneesMissions,
  type Mission,
  type Ponderation,
  type TypeMission,
} from '@/lib/missions'
import { Action, Icone } from './Ornements'
import { Geste, Jauge, quand, quantite, Signature, type CtxRegistre } from './Missives'
import { Sceller } from './Fiche'

/*
 * The book of Missions (prototype): the call for missions (open ones to take, the member's own to give
 * back or complete), the member's points, and the Patriarch's table — demands for merchandise, every
 * member's points, the pondération. The pages only show; every form is a note laid over the left page
 * (components/Fiche.tsx): the demand with its live, line-by-line preview, the settings, the classes, one
 * item's class / weight / lot. One hook holds the missions' data, the filter and the demand's draft.
 */

/* ───────────────────────── The hook ───────────────────────── */

type Reponse = { ok: boolean; message: string; numero?: string }
type Prevision = { id: number; prevoir: (d: DonneesMissions) => DonneesMissions }
/** The demand being written on its note; `lots`: the units per mission typed for some lines (key `cleLigne`). */
export type Brouillon = { article: string; quantite: string; note: string; lots: Record<string, string> }

export const BROUILLON_VIDE: Brouillon = { article: '', quantite: '', note: '', lots: {} }

const ECHEC = "Le coursier n'est pas revenu. Rien n'a été consigné : réessaie."
const FERME = "Le registre des missions ne répond pas : le coursier n'a pu l'ouvrir. Réessaie dans un moment."

export function useMissions(signe: string | null) {
  const [base, setBase] = useState<DonneesMissions | null>(null)
  const [previsions, setPrevisions] = useState<Prevision[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  /** The last answer of the registre to a gesture (shown on the missions' pages). */
  const [message, setMessage] = useState<{ ok: boolean; texte: string; n: number } | null>(null)
  const [filtre, setFiltre] = useState<TypeMission | 'toutes'>('toutes')
  const [brouillon, setBrouillon] = useState<Brouillon>(BROUILLON_VIDE)
  const compteur = useRef(0)
  const version = useRef(0)

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

  // Read again when the reader signs (their own missions and points).
  useEffect(() => {
    lire()
  }, [lire, signe])

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
        const r = (await rep.json().catch(() => null)) as { ok?: boolean; message?: string; numero?: string; donnees?: DonneesMissions | null } | null
        if (r?.donnees) {
          recevoir(r.donnees)
          frais = true
        }
        res = { ok: Boolean(rep.ok && r?.ok), message: r?.message ?? ECHEC, numero: r?.numero }
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

  return { donnees, erreur, message, relire: lire, agir, filtre, setFiltre, brouillon, setBrouillon }
}

export type EtatMissions = ReturnType<typeof useMissions>

/* ───────────────────────── Small pieces ───────────────────────── */

const moiDe = (reg: CtxRegistre) => reg.r.marchand?.identite ?? reg.m?.donnees?.moi ?? null

/** Not linked, not read yet, unreadable: said in character (nothing else is shown then). */
function Ferme({ reg }: { reg: CtxRegistre }) {
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

/** Before the sheet's script knows the missions (v3m): the pages are read, nothing is written. */
function Inactif({ reg }: { reg: CtxRegistre }) {
  const d = reg.m?.donnees
  if (!d?.relie || d.actif) return null
  return <p className="missions-inactif">{TEXTES.inactif}</p>
}

/** The registre's answer to the last gesture. */
function Message({ reg }: { reg: CtxRegistre }) {
  const m = reg.m?.message
  if (!m) return null
  return (
    <p key={m.n} className={`message-encre ${m.ok ? 'ok' : 'erreur'}`} role="status">
      {m.texte}
    </p>
  )
}

function GlypheType({ type, icones }: { type: TypeMission; icones: Record<string, string> }) {
  return (
    <span className={`glyphe-mission glyphe-${type === 'récolte' ? 'recolte' : type}`} title={type}>
      <Icone corps={icones[ICONES_TYPES[type]]} />
    </span>
  )
}

const pts = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} pt${Math.abs(n) > 1 ? 's' : ''}`

/** The weight a mission was sized with: « poids 2 », or « poids à fixer » (none for a craft of the final product). */
function poids(m: Pick<Mission, 'type' | 'poids'> & { intermediaire?: boolean; note?: string }): ReactNode {
  if (m.poids !== null) return <span>poids {prix(m.poids)}</span>
  // A harvest (or an intermediate's craft) without weight; the final product's crafts have none.
  return m.type === 'récolte' || m.intermediaire || m.note === TEXTES.aFixer ? <span className="a-fixer">{TEXTES.aFixer}</span> : null
}

/** A mission's small line: its parts, the empty ones left out, separated by a middle dot. */
function Meta({ parts }: { parts: ReactNode[] }) {
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

const ouvert = (reg?: CtxRegistre) => Boolean(reg?.m?.donnees?.relie)

/* ───────────────────────── The call for missions ───────────────────────── */

export function GaucheMissions({ page, reg, icones, compact }: { page: PageMissions; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
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
          <MesMissions reg={reg} icones={icones} />
        </>
      )}
    </>
  )
}

function MesMissions({ reg, icones }: { reg: CtxRegistre; icones: Record<string, string> }) {
  const d = reg.m!.donnees!
  const moi = moiDe(reg)
  if (!moi) return null
  const miennes = enCoursDe(d.missions, moi)
  const max = d.ponderation.reglages.maxEnCours
  const droits = reg.r.marchand?.droits
  const geste = (m: Mission, action: 'rendre' | 'accomplir') =>
    reg.m!.agir(action, { numero: m.numero }, (x) => ({
      ...x,
      missions: x.missions.map((y) =>
        y.numero !== m.numero ? y : action === 'rendre' ? { ...y, statut: 'ouverte', prisPar: '', prisLe: '', enAttente: true } : { ...y, statut: 'accomplie', accomplieLe: new Date().toISOString(), enAttente: true },
      ),
      points: action === 'accomplir' ? [...x.points, { horodatage: new Date().toISOString(), membre: moi, points: m.points, raison: raisonPoints(m), mission: m.numero, enAttente: true }] : x.points,
    }))
  return (
    <section className="mes-missions">
      <h3 className="titre-section">
        Mes missions en cours <span className="compte-missions">{miennes.length} / {max}</span>
      </h3>
      {miennes.length ? (
        <ul className="missions-liste">
          {miennes.map((m) => (
            <li key={m.numero} className={`mission tenue ${m.enAttente ? 'en-attente' : ''}`}>
              <GlypheType type={m.type} icones={icones} />
              <span className="mission-texte">
                <span className="mission-intitule">{intitule(m)}</span>
                <Meta parts={[m.prisLe && `prise le ${dateTamrielique(m.prisLe)}`, poids(m)]} />
              </span>
              <span className="mission-cote">
                <strong className="mission-points">{pts(m.points)}</strong>
                <span className="mission-gestes">
                  {droits?.rendre !== false && (
                    <Action icone="rendre" disabled={m.enAttente} onClick={() => geste(m, 'rendre')}>
                      rendre
                    </Action>
                  )}
                  {droits?.accomplir !== false && (
                    <Action icone="accomplir" disabled={m.enAttente} onClick={() => geste(m, 'accomplir')}>
                      accomplie
                    </Action>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide-encre">Tes pattes sont libres : prends une mission à l’appel de la caravane.</p>
      )}
    </section>
  )
}

function FiltreMissions({ reg }: { reg: CtxRegistre }) {
  const m = reg.m!
  const ouvertes = m.donnees!.missions.filter((x) => x.statut === 'ouverte')
  const choix: (TypeMission | 'toutes')[] = ['toutes', ...TYPES_MISSION]
  const nom = { toutes: 'Toutes', récolte: 'Récoltes', fabrication: 'Fabrications' } as const
  return (
    <div className="filtre-missions" role="group" aria-label="Filtrer les missions ouvertes">
      {choix.map((c) => (
        <button key={c} type="button" className={`lien-encre ${m.filtre === c ? 'actif' : ''}`} aria-pressed={m.filtre === c} onClick={() => m.setFiltre(c)}>
          {nom[c]} <span className="compte-missions">{c === 'toutes' ? ouvertes.length : ouvertes.filter((x) => x.type === c).length}</span>
        </button>
      ))}
    </div>
  )
}

export function DroiteMissions({ reg, icones, interactif, citation }: { reg?: CtxRegistre; icones: Record<string, string>; interactif: boolean; citation: ReactNode }) {
  const d = reg?.m?.donnees
  if (!reg || !d?.relie) return null
  const m = reg.m!
  const moi = moiDe(reg)
  const max = d.ponderation.reglages.maxEnCours
  const pleines = moi ? enCoursDe(d.missions, moi).length >= max : false
  const peutPrendre = Boolean(moi) && reg.r.marchand?.droits?.prendre !== false
  const demandes = new Map(d.demandes.map((x) => [x.numero, x]))
  // Identical open missions of one demand are one row (« ×6 »): taking it takes the first of them.
  const ouvertes: Mission[][] = []
  for (const x of d.missions) {
    if (x.statut !== 'ouverte' || (m.filtre !== 'toutes' && x.type !== m.filtre)) continue
    const der = ouvertes[ouvertes.length - 1]
    const pareille = (y: Mission) => y.demande === x.demande && y.type === x.type && y.objet === x.objet && y.quantite === x.quantite && y.points === x.points
    if (der && pareille(der[0])) der.push(x)
    else ouvertes.push([x])
  }
  const ailleurs = d.missions.filter((x) => x.statut === 'en cours' && (!moi || cle(x.prisPar) !== cle(moi)))
  const prendre = (x: Mission) =>
    m.agir('prendre', { numero: x.numero }, (y) => ({
      ...y,
      missions: y.missions.map((z) => (z.numero === x.numero ? { ...z, statut: 'en cours', prisPar: moi ?? '', prisLe: new Date().toISOString(), enAttente: true } : z)),
    }))
  const tab = interactif ? 0 : -1
  return (
    <div className="missions-droite">
      <h3 className="titre-section">Missions ouvertes</h3>
      <FiltreMissions reg={reg} />
      {pleines && <p className="note-encre">{TEXTES.limite(max)}</p>}
      {ouvertes.length ? (
        <ul className="missions-liste">
          {ouvertes.map((g) => {
            const x = g.find((y) => !y.enAttente) ?? g[0]
            const dm = demandes.get(x.demande)
            return (
              <li key={g[0].numero} className={`mission ${g.every((y) => y.enAttente) ? 'en-attente' : ''}`}>
                <GlypheType type={x.type} icones={icones} />
                <span className="mission-texte">
                  <span className="mission-intitule">
                    {intitule(x)}
                    {g.length > 1 && <span className="mission-fois"> · {g.length} missions pareilles</span>}
                  </span>
                  <Meta parts={[dm && `pour ${quantite(dm.quantite)} ${dm.article}`, poids(x)]} />
                </span>
                <span className="mission-cote">
                  <strong className="mission-points">{pts(x.points)}</strong>
                  <span className="mission-gestes">
                    {peutPrendre && (
                      <Action icone="prendre" tabIndex={tab} disabled={pleines || !d.actif || x.enAttente} title={!d.actif ? TEXTES.inactif : pleines ? TEXTES.limite(max) : undefined} onClick={() => prendre(x)}>
                        prendre
                      </Action>
                    )}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="vide-encre">{d.missions.length ? 'Nulle mission ouverte de cette sorte : la caravane ne manque de rien, pour l’heure.' : 'Nulle mission n’est encore lancée. Le Patriarche n’a rien demandé.'}</p>
      )}
      {ailleurs.length > 0 && (
        <>
          <h3 className="titre-section">Entre d’autres pattes</h3>
          <ul className="inventaire missions-ailleurs">
            {ailleurs.map((x) => (
              <li key={x.numero}>
                <span>{intitule(x)}</span>
                <span className="points" />
                <em>{x.prisPar}</em>
              </li>
            ))}
          </ul>
        </>
      )}
      {citation}
    </div>
  )
}

/* ───────────────────────── My points ───────────────────────── */

export function GauchePoints({ page, reg, compact }: { page: PagePoints; reg?: CtxRegistre; compact: boolean }) {
  const d = reg?.m?.donnees
  const moi = reg ? moiDe(reg) : null
  const mien = d && moi ? soldes(d.points.filter((p) => cle(p.membre) === cle(moi)), d.missions).find((s) => cle(s.membre) === cle(moi)) : null
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {reg && <Ferme reg={reg} />}
      {reg && d && ouvert(reg) && (
        <>
          <Signature reg={reg} />
          <Inactif reg={reg} />
          {moi && (
            <div className="points-total">
              <span className="points-nom">{moi}</span>
              <strong>{new Intl.NumberFormat('fr-FR').format(mien?.total ?? 0)}</strong>
              <span>point{(mien?.total ?? 0) > 1 ? 's' : ''}</span>
              <p className="points-detail">
                {mien?.accomplies ?? 0} mission{(mien?.accomplies ?? 0) > 1 ? 's' : ''} accomplie{(mien?.accomplies ?? 0) > 1 ? 's' : ''}
                {mien?.enCours ? (
                  <>
                    <br />
                    {mien.enCours} en cours, {pts(mien.promis)} promis
                  </>
                ) : null}
              </p>
            </div>
          )}
        </>
      )}
    </>
  )
}

export function DroitePoints({ reg }: { reg?: CtxRegistre }) {
  const d = reg?.m?.donnees
  if (!reg || !d?.relie) return null
  const moi = moiDe(reg)
  if (!moi) return <p className="vide-encre">Signe d’abord l’ex-libris : le registre ne montre à chacun que ses propres points.</p>
  const lignes = d.points.filter((p) => cle(p.membre) === cle(moi)).sort((a, b) => b.horodatage.localeCompare(a.horodatage))
  return (
    <div className="points-droite">
      <h3 className="titre-section">Le livre de mes points</h3>
      {lignes.length ? (
        <ul className="detail-lignes historique-points">
          {lignes.map((p, i) => (
            <li key={`${p.mission}-${i}`} className={p.enAttente ? 'en-attente' : ''}>
              <span className="historique-quand">{p.horodatage ? quand(p.horodatage) : '—'}</span>
              <span className="historique-raison">{p.raison || p.mission}</span>
              <span className="points" />
              <strong>{pts(p.points)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide-encre">Nul point n’est encore inscrit à ton nom. Une mission accomplie, et l’encre coulera.</p>
      )}
    </div>
  )
}

/* ───────────────────────── The Patriarch's table ───────────────────────── */

/** A catalogue chapter of the day book and the ids of its articles (as the slips receive them). */
type Chapitre = { id: string; titre: string; ids: string[] }

/** The day book's merchandise that has a recipe (what a demand can ask for), by chapter. */
function marchandises(chapitres: Chapitre[], articles: Article[], recettes: Recette[]): { titre: string; articles: Article[] }[] {
  return chapitres
    .map((c) => ({ titre: c.titre, articles: articles.filter((a) => c.ids.includes(a.id) && !a.ombre && recetteDe(recettes, a.fr)) }))
    .filter((g) => g.articles.length)
}

export function GauchePatriarche({ page, reg, icones, compact }: { page: PagePatriarche; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const d = reg?.m?.donnees
  const droits = reg?.r.marchand?.droits
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {reg && <Ferme reg={reg} />}
      {reg && d && ouvert(reg) && (
        <>
          <Signature reg={reg} />
          <Inactif reg={reg} />
          <Message reg={reg} />
          {page.vue === 'demandes' && (
            <>
              {droits?.demande !== false && (
                <div className="gestes">
                  <Geste icone={icones['throne-king']} onClick={() => reg.ouvrir({ genre: 'demande' })}>
                    Demander une marchandise
                  </Geste>
                </div>
              )}
              <p className="decompte">
                {d.demandes.length
                  ? `${d.demandes.length} demande${d.demandes.length > 1 ? 's' : ''} scellée${d.demandes.length > 1 ? 's' : ''}, ${d.missions.filter((x) => x.statut === 'ouverte').length} mission${d.missions.filter((x) => x.statut === 'ouverte').length > 1 ? 's' : ''} ouverte${d.missions.filter((x) => x.statut === 'ouverte').length > 1 ? 's' : ''}`
                  : 'Nulle demande encore : la caravane attend la parole du Patriarche.'}
              </p>
            </>
          )}
          {page.vue === 'points' && <ResumePoints reg={reg} />}
          {page.vue === 'ponderation' && <ResumeReglages reg={reg} icones={icones} />}
        </>
      )}
    </>
  )
}

export function DroitePatriarche({ page, reg }: { page: PagePatriarche; reg?: CtxRegistre }) {
  if (!reg?.m?.donnees?.relie) return null
  if (page.vue === 'demandes') return <Demandes reg={reg} />
  if (page.vue === 'points') return <TableauPoints reg={reg} />
  return <VuePonderation reg={reg} />
}

/** Identical missions in a row, together (« 5 missions »). */
function pareilles<T extends Pick<Mission, 'type' | 'objet' | 'quantite' | 'points'>>(xs: T[]): T[][] {
  const res: T[][] = []
  for (const x of xs) {
    const der = res[res.length - 1]
    if (der && der[0].type === x.type && der[0].objet === x.objet && der[0].quantite === x.quantite && der[0].points === x.points) der.push(x)
    else res.push([x])
  }
  return res
}

/* ── Demands ── */

function Demandes({ reg }: { reg: CtxRegistre }) {
  const d = reg.m!.donnees!
  const demandes = [...d.demandes].sort((a, b) => b.horodatage.localeCompare(a.horodatage))
  return (
    <div className="demandes-droite">
      <h3 className="titre-section">Demandes scellées</h3>
      {demandes.length ? (
        <ul className="liste-demandes">
          {demandes.map((x) => {
            const a = avancement(x, d.missions)
            return (
              <li key={x.numero} className="demande">
                <span className="demande-titre">
                  {quantite(x.quantite)} {x.article}
                </span>
                <span className="demande-meta">
                  {x.horodatage && <>le {dateTamrielique(x.horodatage)}</>}
                  {x.membre && <> par {x.membre}</>} · n° {x.numero}
                  {x.note && <> · {x.note}</>}
                </span>
                <span className="demande-avance">
                  <Jauge avance={a.avance} titre={`${a.accomplies} missions accomplies sur ${a.total}`} />
                  <span>
                    {a.accomplies}/{a.total} accomplies, {a.enCours} en cours · {pts(a.credites)} sur {pts(a.points)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="vide-encre">Nulle demande n’est encore scellée.</p>
      )}
    </div>
  )
}

/** The sealing of a note: the scribe writes, the seal is stamped, the note goes. */
function useScelle(fermer: () => void) {
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
    }, 1100)
  }
  return { etat, erreur, envoyer }
}

const SOURCES: Record<LigneDemande['source'], string> = { demande: 'choisi ici', ponderation: 'lot de la pondération', effort: 'selon l’effort', reglage: 'réglage' }

/** The demand note: merchandise, quantity, and every line of missions with its lot per mission, live. */
function FicheDemande({ reg, articles, chapitres, icones, fermer }: EnvMission) {
  const m = reg.m!
  const d = m.donnees
  const recettes = useMemo(() => reg.r.donnees?.recettes ?? [], [reg.r.donnees?.recettes])
  const groupes = useMemo(() => marchandises(chapitres, articles, recettes), [chapitres, articles, recettes])
  const b = m.brouillon
  const changer = (x: Partial<Brouillon>) => m.setBrouillon({ ...b, ...x })
  const lots = useMemo(() => {
    const res: Record<string, number> = {}
    for (const [k, v] of Object.entries(b.lots)) {
      const n = Number(v)
      if (Number.isInteger(n) && n >= 1) res[k] = n
    }
    return res
  }, [b.lots])
  const apercu = useMemo(() => {
    const article = articles.find((a) => !a.ombre && cle(a.fr) === cle(b.article))
    const q = Number(b.quantite)
    if (!article || !d || !Number.isInteger(q) || q <= 0) return null
    return traduire(article, q, recettes, d.ponderation, lots)
  }, [articles, b.article, b.quantite, d, recettes, lots])
  const { etat, erreur, envoyer } = useScelle(fermer)
  if (!d) return null
  const sceller = (e: FormEvent) => {
    e.preventDefault()
    if (!apercu?.ok) return
    envoyer(
      () => m.agir('demande', { article: b.article, quantite: Number(b.quantite), note: b.note, lots }),
      () => m.setBrouillon(BROUILLON_VIDE),
    )
  }
  return (
    <form className="fiche-form demande-form" onSubmit={sceller}>
      <label className="fiche-champ">
        <span>Marchandise</span>
        <select value={b.article} onChange={(e) => changer({ article: e.target.value, lots: {} })}>
          <option value="">— choisir dans le catalogue —</option>
          {groupes.map((g) => (
            <optgroup key={g.titre} label={g.titre}>
              {g.articles.map((a) => (
                <option key={a.id} value={a.fr}>
                  {a.fr}
                  {a.min !== null ? ` (plancher ${prix(a.min)})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Quantité</span>
          <input type="text" inputMode="numeric" value={b.quantite} placeholder="50" onChange={(e) => changer({ quantite: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
        </label>
        <label className="fiche-champ">
          <span>Note</span>
          <input type="text" value={b.note} placeholder="pour la foire de Blancherive" maxLength={200} onChange={(e) => changer({ note: e.target.value })} />
        </label>
      </div>
      {apercu && !apercu.ok && <p className="message-encre erreur">{apercu.erreur}</p>}
      {apercu?.ok && (
        <>
          <h3 className="fiche-sous-titre">Les missions, ligne par ligne</h3>
          <p className="fiche-aide">« Par mission » : ce que tient une mission ; change-le, la ligne se redécoupe.</p>
          <ul className="lignes-demande">
            {apercu.lignes.map((l) => {
              const ms = apercu.missions.filter((x) => x.ligne === l.cle)
              const choisi = b.lots[l.cle]
              return (
                <li key={l.cle} className="ligne-demande">
                  <GlypheType type={l.type} icones={icones} />
                  <span className="ligne-demande-nom">
                    <span className="mission-intitule">
                      {VERBES[l.type]} {l.objet}
                    </span>
                    <span className="mission-meta">
                      {quantite(l.total)} en tout{l.intermediaire ? ' · intermédiaire' : ''}
                      {ms[0] && poids(ms[0]) && <> · {poids(ms[0])}</>}
                    </span>
                  </span>
                  <label className="ligne-demande-lot">
                    <span>par mission</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={choisi ?? String(l.lot)}
                      aria-label={`${l.objet} : quantité par mission`}
                      onChange={(e) => changer({ lots: { ...b.lots, [l.cle]: e.target.value.replace(/\D/g, '').slice(0, 6) } })}
                    />
                    <em title={`par défaut : ${quantite(l.defaut)}`}>
                      {l.source === 'demande' ? (
                        <button type="button" className="lien-encre" onClick={() => { const { [l.cle]: _, ...reste } = b.lots; changer({ lots: reste }) }}>
                          revenir à {quantite(l.defaut)}
                        </button>
                      ) : (
                        SOURCES[l.source]
                      )}
                    </em>
                  </label>
                  <span className="ligne-demande-decoupe">
                    {pareilles(ms).map((g, i) => (
                      <span key={i}>
                        {g.length > 1 ? `${g.length} missions` : '1 mission'} de {quantite(g[0].quantite)} <strong>{pts(g[0].points)}</strong>
                        {g.length > 1 ? ' chacune' : ''}
                      </span>
                    ))}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="fiche-partage demande-resume">
            <p>
              <strong>{apercu.missions.length}</strong> mission{apercu.missions.length > 1 ? 's' : ''} : {apercu.missions.filter((x) => x.type === 'récolte').length} de récolte,{' '}
              {apercu.missions.filter((x) => x.type === 'fabrication').length} de fabrication.
            </p>
            {apercu.plancher !== null ? (
              <p>
                Plancher {prix(apercu.plancher)} × {quantite(apercu.quantite)} : <strong>{pts(apercu.pointsRessources)}</strong> pour les ressources ({d.ponderation.reglages.partRessources} %),{' '}
                <strong>{pts(apercu.pointsFabrication)}</strong> pour la fabrication ({d.ponderation.reglages.partFabrication} %).
              </p>
            ) : (
              <p className="a-fixer">Cette marchandise n’a pas de plancher : ses missions ne rapportent aucun point.</p>
            )}
            {apercu.aFixer.length > 0 && (
              <p className="a-fixer">
                Poids à fixer : {apercu.aFixer.join(', ')} (taillées au poids de repli, {prix(d.ponderation.reglages.poidsRepli)}).
              </p>
            )}
          </div>
        </>
      )}
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!apercu?.ok}>
          Sceller la demande
        </Sceller>
      </div>
    </form>
  )
}

/* ── Every member's points ── */

function ResumePoints({ reg }: { reg: CtxRegistre }) {
  const d = reg.m!.donnees!
  const total = d.points.reduce((t, p) => t + p.points, 0)
  const enJeu = d.missions.filter((m) => m.statut !== 'accomplie').reduce((t, m) => t + m.points, 0)
  const n = new Set(d.points.map((p) => cle(p.membre))).size
  return (
    <p className="missive-resume">
      {pts(total)} crédités à {n} membre{n > 1 ? 's' : ''}
      <br />
      {pts(enJeu)} encore en jeu
    </p>
  )
}

function TableauPoints({ reg }: { reg: CtxRegistre }) {
  const d = reg.m!.donnees!
  const liste = soldes(d.points, d.missions)
  if (!liste.length) return <p className="vide-encre">Nul point n’est encore inscrit au registre.</p>
  return (
    <div className="tableau-points" role="table">
      <div className="tableau-points-entete" role="row">
        <span>Membre</span>
        <span>Points</span>
        <span>Accomplies</span>
        <span>En cours</span>
      </div>
      {liste.map((s) => (
        <div key={s.membre} className="tableau-points-ligne" role="row">
          <span>{s.membre}</span>
          <strong>{new Intl.NumberFormat('fr-FR').format(s.total)}</strong>
          <span>{s.accomplies}</span>
          <span title={s.enCours ? `${pts(s.promis)} promis` : undefined}>{s.enCours ? `${s.enCours} (${pts(s.promis)})` : '—'}</span>
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
  reg.m!.agir('ponderation', { ponderation: { classes: p.classes, ressources: p.ressources, lots: p.lots, reglages: p.reglages } })

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
        {REGLAGES.map((r) => (
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

function VuePonderation({ reg }: { reg: CtxRegistre }) {
  const p = reg.m!.donnees!.ponderation
  const peut = reg.r.marchand?.droits?.ponderation !== false && Boolean(moiDe(reg))
  const { assignee, poidsDe } = peser(p)
  const { liste, finis } = matieres(reg, p)
  const groupe = (x: { nom: string; intermediaire: boolean }) => {
    const a = assignee(x.nom)
    if (!a) return x.intermediaire ? CODE_TRANSFORMATION : ''
    return poidsDe(x.nom) === null ? '' : a.classe
  }
  const groupes = [{ code: '', titre: 'À fixer' }, ...p.classes.map((c) => ({ code: c.code, titre: `${c.code} · ${c.nom}` }))]
  const ligne = (nom: string, classe: ReactNode, w: ReactNode, lot: number | null, defautLot: string) => (
    <button key={nom} type="button" className="ressource-ponderee" disabled={!peut} onClick={() => reg.ouvrir({ genre: 'matiere-mission', nom })} title={peut ? `Ranger ${nom}` : undefined}>
      <span className="ressource-nom">{nom}</span>
      <span className="ressource-classe">{classe}</span>
      <span className="ressource-poids">{w}</span>
      <span className={`ressource-lot ${lot ? 'fixe' : ''}`}>{lot ? `par ${quantite(lot)}` : defautLot}</span>
    </button>
  )
  return (
    <div className="ponderation-droite">
      <h3 className="titre-section">Classes d’effort</h3>
      <div className="classes-ponderation" role="table">
        <div className="classes-entete" role="row">
          <span>Code</span>
          <span>Classe</span>
          <span>Poids</span>
          <span>Par mission</span>
        </div>
        {p.classes.map((c) => (
          <div key={c.code} className="classes-ligne" role="row">
            <span className="classe-code">{c.code}</span>
            <span>{c.nom}</span>
            <span className={c.poids === null ? 'a-fixer' : ''}>{c.poids === null ? 'à fixer' : prix(c.poids)}</span>
            <span className="classe-lot">{c.poids ? `~${Math.floor(p.reglages.budget / c.poids)}` : '—'}</span>
          </div>
        ))}
      </div>
      {peut && (
        <p className="ponderation-action">
          <Action icone="peser" onClick={() => reg.ouvrir({ genre: 'classes-missions' })}>
            corriger les classes
          </Action>
        </p>
      )}
      <div className="ponderation-entete">
        <span>Ressource</span>
        <span>Classe</span>
        <span>Poids</span>
        <span>Par mission</span>
      </div>
      {groupes.map((g) => {
        const membres = liste.filter((x) => groupe(x) === g.code)
        if (!membres.length) return null
        return (
          <section key={g.code || 'a-fixer'} className={`groupe-ressources ${g.code ? '' : 'a-fixer-groupe'}`}>
            <h4 className="fiche-sous-titre">
              {g.titre} <span className="compte-missions">{membres.length}</span>
            </h4>
            {!g.code && <p className="note-encre">Sans classe ou sans poids : leurs missions sont taillées au poids de repli ({prix(p.reglages.poidsRepli)}) et marquées « {TEXTES.aFixer} ».</p>}
            {membres.map((x) => {
              const a = assignee(x.nom)
              const w = poidsDe(x.nom, x.intermediaire)
              return ligne(
                x.nom,
                a ? a.classe : x.intermediaire ? <em>T (défaut)</em> : <em className="a-fixer">aucune</em>,
                w === null ? <em className="a-fixer">à fixer</em> : `${prix(w)}${a?.poids ? ' (propre)' : ''}`,
                lotDe(p, x.nom),
                w ? `~${Math.floor(p.reglages.budget / w)}` : '—',
              )
            })}
          </section>
        )
      })}
      {finis.length > 0 && (
        <section className="groupe-ressources">
          <h4 className="fiche-sous-titre">
            Produits finis <span className="compte-missions">{finis.length}</span>
          </h4>
          <p className="note-encre">Leurs fabrications : {prix(p.reglages.objetsParFabrication)} objets par mission, sauf lot propre.</p>
          {finis.map((nom) => ligne(nom, '—', '—', lotDe(p, nom), `${prix(p.reglages.objetsParFabrication)} (réglage)`))}
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
      {REGLAGES.map((x) => (
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

/** The classes' note: names and weights per unit. */
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
      <p className="fiche-aide">Le poids d’une unité ; vide : « à fixer ». Une mission tient {prix(p.reglages.budget)} d’effort.</p>
      <div className="classes-ponderation classes-fiche">
        {classes.map((c, i) => (
          <div key={c.code} className="classes-ligne">
            <span className="classe-code">{c.code}</span>
            <input type="text" value={c.nom} aria-label={`Nom de la classe ${c.code}`} onChange={(e) => changer(i, { nom: e.target.value.slice(0, 60) })} />
            <ChampNombre valeur={c.poids} placeholder="à fixer" aria-label={`Poids de la classe ${c.code}`} changer={(v) => changer(i, { poids: v })} />
            <span className="classe-lot">{c.poids ? `~${Math.floor(p.reglages.budget / c.poids)}` : '—'}</span>
          </div>
        ))}
      </div>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones}>
          Graver les classes
        </Sceller>
      </div>
    </form>
  )
}

/** One item's note: its class, its own weight, its lot per mission. */
function FicheMatiere({ reg, icones, fermer, nom }: EnvMission & { nom: string }) {
  const p = reg.m!.donnees!.ponderation
  const recettes = (reg.r.donnees?.recettes ?? []).filter((r) => !r.ombre)
  const intermediaire = recettes.some((r) => cle(r.produit) === cle(nom))
  const fini = intermediaire && !recettes.some((r) => r.ingredients.some((i) => cle(i.nom) === cle(nom))) && !(reg.r.donnees?.ressources ?? []).some((r) => cle(r.nom) === cle(nom))
  const a = p.ressources.find((r) => cle(r.nom) === cle(nom))
  const [classe, setClasse] = useState(a?.classe ?? '')
  const [w, setW] = useState<number | null>(a?.poids ?? null)
  const [lot, setLot] = useState<number | null>(lotDe(p, nom))
  const { etat, erreur, envoyer } = useScelle(fermer)
  const nouvelle = (): Ponderation => {
    const ressources: Assignation[] = [...p.ressources.filter((r) => cle(r.nom) !== cle(nom)), ...(classe ? [{ nom, classe, poids: w, note: a?.note ?? '' }] : [])]
    const lots = [...p.lots.filter((l) => cle(l.nom) !== cle(nom)), ...(lot ? [{ nom, lot: Math.round(lot) }] : [])]
    return { ...p, ressources, lots }
  }
  const essai = peser(nouvelle())
  const poidsVu = essai.poidsDe(nom, intermediaire)
  return (
    <form
      className="fiche-form ponderation-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(() => graver(reg, nouvelle()))
      }}
    >
      {!fini && (
        <>
          <label className="fiche-champ">
            <span>Classe d’effort</span>
            <select value={classe} onChange={(e) => setClasse(e.target.value)}>
              <option value="">{intermediaire ? 'Transformation (par défaut : se fabrique)' : 'sans classe (à fixer)'}</option>
              {p.classes.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.nom}
                  {c.poids === null ? ' (à fixer)' : ` (poids ${prix(c.poids)})`}
                </option>
              ))}
            </select>
          </label>
          {intermediaire && <p className="fiche-aide">Rangé dans une autre classe que T, il se récolte ou s’achète au lieu de se fabriquer.</p>}
          <label className="fiche-champ">
            <span>Poids propre</span>
            <ChampNombre valeur={w} placeholder={classe ? 'celui de la classe' : '—'} disabled={!classe} changer={setW} />
          </label>
          <p className="fiche-aide">
            Poids retenu : {poidsVu === null ? <span className="a-fixer">à fixer (repli {prix(p.reglages.poidsRepli)})</span> : prix(poidsVu)}
            {poidsVu ? ` · ~${Math.floor(p.reglages.budget / poidsVu)} par mission selon l’effort` : ''}
          </p>
        </>
      )}
      <label className="fiche-champ">
        <span>Lot par mission</span>
        <ChampNombre valeur={lot} placeholder={fini ? `${prix(p.reglages.objetsParFabrication)} (réglage)` : 'selon l’effort'} changer={(v) => setLot(v === null ? null : Math.round(v))} />
      </label>
      <p className="fiche-aide">
        {fini || intermediaire
          ? 'Combien en fabrique une mission (ex. Bière par 20) ; vide : '
          : 'Combien en récolte une mission (ex. Blé par 40) ; vide : '}
        {fini ? 'le réglage « objets par mission de fabrication ».' : 'la taille donnée par l’effort.'} Les missions sont alors des paquets pleins, le reste en dernier.
      </p>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones}>
          Graver
        </Sceller>
      </div>
    </form>
  )
}

/* ── The notes of the missions, laid over the left page (components/Fiche.tsx) ── */

type EnvMission = { reg: CtxRegistre; articles: Article[]; chapitres: Chapitre[]; icones: Record<string, string>; fermer: () => void }
export type FicheMission = { genre: 'demande' } | { genre: 'reglages-missions' } | { genre: 'classes-missions' } | { genre: 'matiere-mission'; nom: string }

export function contenuMission(f: FicheMission, env: EnvMission): { surtitre: string; titre: string; corps: ReactNode; action: ActionMission } {
  if (!env.reg.m?.donnees) return { surtitre: 'Livre des Missions', titre: 'Missions', corps: <p className="registre-ferme attente-encre">Le scribe déroule le registre des missions…</p>, action: 'demande' }
  switch (f.genre) {
    case 'demande':
      return { surtitre: 'Les demandes du Patriarche', titre: 'Demander une marchandise', corps: <FicheDemande {...env} />, action: 'demande' }
    case 'reglages-missions':
      return { surtitre: 'La pondération des efforts', titre: 'Les réglages', corps: <FicheReglages {...env} />, action: 'ponderation' }
    case 'classes-missions':
      return { surtitre: 'La pondération des efforts', titre: 'Les classes d’effort', corps: <FicheClasses {...env} />, action: 'ponderation' }
    case 'matiere-mission':
      return { surtitre: 'La pondération des efforts', titre: f.nom, corps: <FicheMatiere {...env} nom={f.nom} />, action: 'ponderation' }
  }
}

const nombreSaisi = (s: string) => {
  const t = s.replace(',', '.').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A number typed in a cell: the text is kept as typed (« 1, » on the way to « 1,5 »), the value follows. */
function ChampNombre({ valeur, changer, ...props }: { valeur: number | null; changer: (v: number | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
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
