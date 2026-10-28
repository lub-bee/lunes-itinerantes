'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import type { Article, PageChapitre, PageMissions, PagePatriarche, PagePoints } from '@/lib/types'
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
  type ActionMission,
  type Assignation,
  type Classe,
  type DonneesMissions,
  type Mission,
  type MissionPrevue,
  type Ponderation,
  type TypeMission,
} from '@/lib/missions'
import { Action, Icone } from './Ornements'
import { Geste, Jauge, quand, quantite, Signature, type CtxRegistre } from './Missives'
import { Sceller } from './Fiche'

/*
 * The book of Missions (prototype): the call for missions (open ones to take, the member's own to give
 * back or complete), the member's points, and the Patriarch's table — demands for merchandise with a live
 * preview of the missions they make, every member's points, the pondération's editor. One hook holds the
 * missions' data and the state the left and right pages share (filter, draft demand, pondération edited).
 */

/* ───────────────────────── The hook ───────────────────────── */

type Reponse = { ok: boolean; message: string; numero?: string }
type Prevision = { id: number; prevoir: (d: DonneesMissions) => DonneesMissions }
export type Brouillon = { article: string; quantite: string; note: string }

const ECHEC = "Le coursier n'est pas revenu. Rien n'a été consigné : réessaie."
const FERME = "Le registre des missions ne répond pas : le coursier n'a pu l'ouvrir. Réessaie dans un moment."

export function useMissions(signe: string | null) {
  const [base, setBase] = useState<DonneesMissions | null>(null)
  const [previsions, setPrevisions] = useState<Prevision[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  /** The last answer of the registre to a gesture (shown on the missions' pages). */
  const [message, setMessage] = useState<{ ok: boolean; texte: string; n: number } | null>(null)
  const [filtre, setFiltre] = useState<TypeMission | 'toutes'>('toutes')
  const [brouillon, setBrouillon] = useState<Brouillon>({ article: '', quantite: '', note: '' })
  /** The pondération being edited (null: not touched, the registre's is shown). */
  const [edition, setEdition] = useState<Ponderation | null>(null)
  const [scelle, setScelle] = useState<'repos' | 'ecrit' | 'scelle'>('repos')
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

  return { donnees, erreur, message, relire: lire, agir, filtre, setFiltre, brouillon, setBrouillon, edition, setEdition, scelle, setScelle }
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
function poids(m: Pick<Mission, 'type' | 'poids'>): ReactNode {
  if (m.type === 'fabrication') return null
  return m.poids === null ? <span className="a-fixer">{TEXTES.aFixer}</span> : <span>poids {prix(m.poids)}</span>
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
  const nom = { toutes: 'Toutes', récolte: 'Récoltes', transformation: 'Transformations', fabrication: 'Fabrications' } as const
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
                    {g.length > 1 && <span className="mission-fois" title={`${g.length} missions pareilles`}> ×{g.length}</span>}
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

type Marchandise = Article & { chapitre: string }

/** The day book's merchandise that has a recipe (what a demand can ask for), by chapter. */
function marchandises(chapitres: PageChapitre[], recettes: Recette[]): { titre: string; articles: Marchandise[] }[] {
  return chapitres
    .filter((c) => c.partie === 'marchandises')
    .map((c) => ({ titre: c.titre, articles: c.articles.filter((a) => !a.ombre && recetteDe(recettes, a.fr)).map((a) => ({ ...a, chapitre: c.id })) }))
    .filter((g) => g.articles.length)
}

/** The preview of the draft demand (null: nothing chosen yet). */
function useApercu(reg: CtxRegistre | undefined, chapitres: PageChapitre[]) {
  const m = reg?.m
  const recettes = reg?.r.donnees?.recettes
  const ponderation = m?.donnees?.ponderation
  const b = m?.brouillon
  return useMemo(() => {
    if (!b || !recettes || !ponderation || !b.article) return null
    const article = chapitres.flatMap((c) => c.articles).find((a) => cle(a.fr) === cle(b.article))
    const q = Number(b.quantite)
    if (!article || !Number.isInteger(q) || q <= 0) return null
    return traduire(article, q, recettes, ponderation)
  }, [b, recettes, ponderation, chapitres])
}

export function GauchePatriarche({ page, reg, icones, compact, chapitres }: { page: PagePatriarche; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean; chapitres: PageChapitre[] }) {
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
          {page.vue === 'demandes' && <FormDemande reg={reg} icones={icones} chapitres={chapitres} />}
          {page.vue === 'points' && <ResumePoints reg={reg} />}
          {page.vue === 'ponderation' && <Reglages reg={reg} icones={icones} />}
        </>
      )}
    </>
  )
}

export function DroitePatriarche({ page, reg, icones, chapitres }: { page: PagePatriarche; reg?: CtxRegistre; icones: Record<string, string>; chapitres: PageChapitre[] }) {
  if (!reg?.m?.donnees?.relie) return null
  if (page.vue === 'demandes') return <Demandes reg={reg} icones={icones} chapitres={chapitres} />
  if (page.vue === 'points') return <TableauPoints reg={reg} />
  return <Classes reg={reg} />
}

/* ── Demands ── */

function FormDemande({ reg, icones, chapitres }: { reg: CtxRegistre; icones: Record<string, string>; chapitres: PageChapitre[] }) {
  const m = reg.m!
  const d = m.donnees!
  const recettes = reg.r.donnees?.recettes ?? []
  const groupes = useMemo(() => marchandises(chapitres, recettes), [chapitres, recettes])
  const apercu = useApercu(reg, chapitres)
  const b = m.brouillon
  const changer = (x: Partial<typeof b>) => m.setBrouillon({ ...b, ...x })
  const peutDemander = reg.r.marchand?.droits?.demande !== false && Boolean(moiDe(reg))
  const sceller = async (e: FormEvent) => {
    e.preventDefault()
    if (!apercu?.ok || m.scelle !== 'repos') return
    m.setScelle('ecrit')
    const r = await m.agir('demande', { article: b.article, quantite: Number(b.quantite), note: b.note })
    if (r.ok) {
      m.setScelle('scelle')
      setTimeout(() => m.setScelle('repos'), 1100)
      m.setBrouillon({ article: '', quantite: '', note: '' })
    } else m.setScelle('repos')
  }
  if (!reg.r.donnees) return <p className="registre-ferme attente-encre">Le scribe déroule le Livre des Recettes…</p>
  return (
    <form className="fiche-form demande-form" onSubmit={sceller}>
      <h3 className="titre-section">Demander une marchandise</h3>
      <label className="fiche-champ">
        <span>Marchandise</span>
        <select value={b.article} onChange={(e) => changer({ article: e.target.value })}>
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
        <div className="fiche-partage demande-resume">
          <p>
            <strong>{apercu.missions.length}</strong> mission{apercu.missions.length > 1 ? 's' : ''} : {apercu.missions.filter((x) => x.type === 'récolte').length} de récolte,{' '}
            {apercu.missions.filter((x) => x.type === 'transformation').length} de transformation, {apercu.missions.filter((x) => x.type === 'fabrication').length} de fabrication.
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
      )}
      {peutDemander && (
        <div className="fiche-pied">
          <Sceller etat={m.scelle} icones={icones} disabled={!apercu?.ok}>
            Sceller la demande
          </Sceller>
        </div>
      )}
    </form>
  )
}

function LigneApercu({ x, n, icones }: { x: MissionPrevue; n: number; icones: Record<string, string> }) {
  return (
    <li className="mission apercu">
      <GlypheType type={x.type} icones={icones} />
      <span className="mission-texte">
        <span className="mission-intitule">
          {intitule(x)}
          {n > 1 && <span className="mission-fois" title={`${n} missions pareilles`}> ×{n}</span>}
        </span>
        <Meta parts={[poids(x), x.type !== 'fabrication' && `effort ${prix(Math.round(x.effort))}`]} />
      </span>
      <strong className="mission-points">{pts(x.points)}</strong>
    </li>
  )
}

/** Identical missions in a row, together (« ×5 »). */
function pareilles<T extends Pick<Mission, 'type' | 'objet' | 'quantite' | 'points'>>(xs: T[]): T[][] {
  const res: T[][] = []
  for (const x of xs) {
    const der = res[res.length - 1]
    if (der && der[0].type === x.type && der[0].objet === x.objet && der[0].quantite === x.quantite && der[0].points === x.points) der.push(x)
    else res.push([x])
  }
  return res
}

function Demandes({ reg, icones, chapitres }: { reg: CtxRegistre; icones: Record<string, string>; chapitres: PageChapitre[] }) {
  const d = reg.m!.donnees!
  const apercu = useApercu(reg, chapitres)
  const demandes = [...d.demandes].sort((a, b) => b.horodatage.localeCompare(a.horodatage))
  return (
    <div className="demandes-droite">
      {apercu?.ok && (
        <>
          <h3 className="titre-section">Aperçu des missions</h3>
          <p className="note-encre">
            {quantite(apercu.quantite)} {apercu.article}, par la recette n° {apercu.recette.variante}
            {apercu.brut.length > 0 && <> — matières en tout : {apercu.brut.map((x) => `${quantite(x.quantite)} ${x.nom}`).join(', ')}</>}.
          </p>
          <ul className="missions-liste apercu-missions">
            {pareilles(apercu.missions).map((g, i) => (
              <LigneApercu key={i} x={g[0]} n={g.length} icones={icones} />
            ))}
          </ul>
          <p className="apercu-total">
            En tout <strong>{pts(apercu.missions.reduce((t, x) => t + x.points, 0))}</strong>
          </p>
        </>
      )}
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

/* ── Every member's points ── */

function ResumePoints({ reg }: { reg: CtxRegistre }) {
  const d = reg.m!.donnees!
  const total = d.points.reduce((t, p) => t + p.points, 0)
  const enJeu = d.missions.filter((m) => m.statut !== 'accomplie').reduce((t, m) => t + m.points, 0)
  return (
    <p className="missive-resume">
      {pts(total)} crédités à {new Set(d.points.map((p) => cle(p.membre))).size} membre{new Set(d.points.map((p) => cle(p.membre))).size > 1 ? 's' : ''}
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

/* ── The pondération ── */

/** Every item the recipes use (raw or intermediate) and every raw material, for the editor. */
function matieres(reg: CtxRegistre, p: Ponderation) {
  const recettes = (reg.r.donnees?.recettes ?? []).filter((r) => !r.ombre)
  const noms = new Map<string, string>()
  const ajouter = (n: string) => n && !noms.has(cle(n)) && noms.set(cle(n), n)
  ;(reg.r.donnees?.ressources ?? []).forEach((r) => ajouter(r.nom))
  recettes.forEach((r) => r.ingredients.forEach((i) => ajouter(i.nom)))
  p.ressources.forEach((r) => ajouter(r.nom))
  const produits = new Set(recettes.map((r) => cle(r.produit)))
  return [...noms.values()].map((nom) => ({ nom, intermediaire: produits.has(cle(nom)) })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
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

function Reglages({ reg, icones }: { reg: CtxRegistre; icones: Record<string, string> }) {
  const m = reg.m!
  const d = m.donnees!
  const p = m.edition ?? d.ponderation
  const peut = reg.r.marchand?.droits?.ponderation !== false && Boolean(moiDe(reg))
  const graver = async (e: FormEvent) => {
    e.preventDefault()
    if (!m.edition || m.scelle !== 'repos') return
    m.setScelle('ecrit')
    const r = await m.agir('ponderation', { ponderation: { classes: m.edition.classes, ressources: m.edition.ressources, reglages: m.edition.reglages } })
    if (r.ok) {
      m.setScelle('scelle')
      setTimeout(() => m.setScelle('repos'), 1100)
      m.setEdition(null)
    } else m.setScelle('repos')
  }
  return (
    <form className="fiche-form ponderation-form" onSubmit={graver}>
      <p className="note-encre">
        {d.ponderation.source === 'registre'
          ? 'Lue au registre (onglets Pondération et Réglages missions, cachés dans la feuille ; on peut aussi les corriger à la main).'
          : 'Les valeurs par défaut du grimoire : rien n’est encore gravé au registre. La première demande scellée les y inscrit.'}
        {' '}Seule l’alchimie est éprouvée ; le reste est une première estimation.
      </p>
      <h3 className="titre-section">Réglages</h3>
      {REGLAGES.map((r) => (
        <label key={r.cle} className="fiche-champ reglage">
          <span>{r.libelle}</span>
          <ChampNombre valeur={p.reglages[r.cle]} disabled={!peut} changer={(v) => m.setEdition({ ...p, reglages: { ...p.reglages, [r.cle]: v ?? 0 } })} />
          <em className="fiche-aide">{r.note}</em>
        </label>
      ))}
      {peut && (
        <div className="fiche-pied">
          {m.edition && m.scelle === 'repos' && (
            <Action icone="annuler" onClick={() => m.setEdition(null)}>
              oublier les changements
            </Action>
          )}
          <Sceller etat={m.scelle} icones={icones} disabled={!m.edition || !d.actif}>
            Graver la pondération
          </Sceller>
        </div>
      )}
      {m.edition && <p className="note-encre">Changements non gravés : l’aperçu des demandes suit la pondération du registre tant qu’elle n’est pas gravée.</p>}
    </form>
  )
}

function Classes({ reg }: { reg: CtxRegistre }) {
  const m = reg.m!
  const d = m.donnees!
  const p = m.edition ?? d.ponderation
  const peut = reg.r.marchand?.droits?.ponderation !== false && Boolean(moiDe(reg))
  const { assignee, poidsDe } = peser(p)
  const liste = matieres(reg, p)
  const changerClasse = (i: number, x: Partial<Classe>) => m.setEdition({ ...p, classes: p.classes.map((c, k) => (k === i ? { ...c, ...x } : c)) })
  const ranger = (nom: string, classe: string, poids: number | null) => {
    const autres = p.ressources.filter((r) => cle(r.nom) !== cle(nom))
    const a: Assignation[] = classe ? [...autres, { nom, classe, poids, note: assignee(nom)?.note ?? '' }] : autres
    m.setEdition({ ...p, ressources: a })
  }
  // Groups: « à fixer » first (no class, or a class without weight), then each class, then the intermediates left to Transformation.
  const groupe = (x: { nom: string; intermediaire: boolean }) => {
    const a = assignee(x.nom)
    if (!a) return x.intermediaire ? CODE_TRANSFORMATION : ''
    return poidsDe(x.nom) === null ? '' : a.classe
  }
  const groupes = [{ code: '', titre: 'À fixer' }, ...p.classes.map((c) => ({ code: c.code, titre: `${c.code} · ${c.nom}` }))]
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
        {p.classes.map((c, i) => (
          <div key={i} className="classes-ligne" role="row">
            <span className="classe-code">{c.code}</span>
            <input type="text" value={c.nom} disabled={!peut} aria-label={`Nom de la classe ${c.code}`} onChange={(e) => changerClasse(i, { nom: e.target.value.slice(0, 60) })} />
            <ChampNombre valeur={c.poids} placeholder="à fixer" disabled={!peut} aria-label={`Poids de la classe ${c.code}`} changer={(v) => changerClasse(i, { poids: v })} />
            <span className="classe-lot">{c.poids ? `~${Math.floor(p.reglages.budget / c.poids)}` : '—'}</span>
          </div>
        ))}
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
              return (
                <div key={x.nom} className="ressource-ponderee">
                  <span className="ressource-nom">
                    {x.nom}
                    {x.intermediaire && <em className="ressource-inter"> intermédiaire</em>}
                  </span>
                  <select value={a?.classe ?? ''} disabled={!peut} aria-label={`Classe de ${x.nom}`} onChange={(e) => ranger(x.nom, e.target.value, a?.poids ?? null)}>
                    <option value="">{x.intermediaire ? 'Transformation (par défaut)' : 'sans classe (à fixer)'}</option>
                    {p.classes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.nom}
                      </option>
                    ))}
                  </select>
                  <ChampNombre
                    valeur={a?.poids ?? null}
                    placeholder={poidsDe(x.nom, x.intermediaire) === null ? 'à fixer' : `${prix(poidsDe(x.nom, x.intermediaire))}`}
                    title="Poids propre à cette ressource (vide : celui de sa classe)"
                    disabled={!peut || !a}
                    aria-label={`Poids propre de ${x.nom}`}
                    changer={(v) => ranger(x.nom, a?.classe ?? '', v)}
                  />
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
