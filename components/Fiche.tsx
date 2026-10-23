'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Article } from '@/lib/types'
import { prix } from '@/lib/format'
import { proches } from '@/lib/recherche'
import { METIERS, metierDe, SANS_METIER } from '@/lib/metiers'
import { estImage, RANGS, SANS_RANG } from '@/lib/rangs'
import { divinite, poemesDe } from '@/lib/oeufs'
import {
  arbre,
  cle,
  coutMatieres,
  enStock,
  estClose,
  indexRecettes,
  PART_COMMUNE_DEFAUT,
  partager,
  rejouer,
  texteCycle,
  trouverCycle,
  type ActionRegistre,
  type DonneesRegistre,
  type Mouvement,
  type Noeud,
  type Recette,
  type ArticleVente,
  type Ressource,
} from '@/lib/missives'
import { auCoffre, idMissive, quand as quandComplet, quantite, type CtxRegistre, type Fiche } from './Missives'
import { Icone } from './Ornements'

/*
 * A loose slip laid on the left page (on the whole screen on mobile): a recipe's tree, or the form
 * of one action (write a missive, count the chest, deposit, craft, deliver, close, edit a recipe or
 * a resource). It is set down with a short fall (transform and opacity only) and taken away the
 * same way; it goes when the page turns.
 */

/** Unrolling and rolling up, as the order sheet (transforms and opacity only, the roll glued to the paper's edge). */
const DUREE_DEROULE = 560
const DUREE_ENROULE = 480
const EPAIS_ROULEAU = 16

export function FicheVolante({
  fiche,
  reg,
  articles,
  chapitres = [],
  icones,
  mobile,
  sansAnimation = false,
  fermer,
}: {
  fiche: Fiche
  reg: CtxRegistre
  articles: Article[]
  /** The catalogue's chapters (for putting a product up for sale). */
  chapitres?: Chapitre[]
  icones: Record<string, string>
  mobile: boolean
  sansAnimation?: boolean
  fermer: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  const voile = useRef<HTMLDivElement>(null)
  const papier = useRef<HTMLDivElement>(null)
  const rouleau = useRef<HTMLDivElement>(null)
  const enCours = useRef<Animation[]>([])
  const partie = useRef(false)
  const [vue, setVue] = useState<Fiche>(fiche)
  useEffect(() => setVue(fiche), [fiche])

  /**
   * The slip unrolls down from its top edge (or rolls back up): the veil slides down clipping the
   * paper, which slides up by as much and so stays still; the roll hangs at the veil's bottom edge.
   * Veil, paper and roll share the same keyframes and easing, so the roll is on the paper's edge at
   * every frame.
   */
  const animer = (enroule: boolean): Animation[] | null => {
    const el = ref.current
    if (!el || !voile.current || !papier.current || !rouleau.current || sansAnimation) return null
    enCours.current.forEach((a) => a.cancel())
    const h = el.offsetHeight
    const temps: KeyframeAnimationOptions = {
      duration: enroule ? DUREE_ENROULE : DUREE_DEROULE,
      easing: enroule ? 'cubic-bezier(.5,0,.6,1)' : 'cubic-bezier(.25,.1,.25,1)',
      fill: 'both',
      direction: enroule ? 'reverse' : 'normal',
    }
    el.dataset.deroule = ''
    const anims = [
      voile.current.animate([{ transform: `translateY(${-h}px)` }, { transform: 'translateY(0px)' }], temps),
      papier.current.animate([{ transform: `translateY(${h}px)` }, { transform: 'translateY(0px)' }], temps),
      rouleau.current.animate(
        [
          { offset: 0, opacity: 1, transform: 'scaleY(1.25)' },
          { offset: 0.9, opacity: 1, transform: 'scaleY(0.9)' },
          { offset: 1, opacity: 0, transform: 'scaleY(0.8)' },
        ],
        temps,
      ),
    ]
    if (enroule) anims.push(el.animate([{ offset: 0, opacity: 0 }, { offset: 0.12, opacity: 1 }, { offset: 1, opacity: 1 }], temps))
    enCours.current = anims
    return anims
  }

  useLayoutEffect(() => {
    const anims = animer(false)
    if (!anims) return
    Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (enCours.current !== anims) return
        anims.forEach((a) => a.cancel())
        enCours.current = []
        delete ref.current?.dataset.deroule
      },
      () => {},
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const partir = () => {
    if (partie.current) return
    partie.current = true
    const anims = animer(true)
    if (!anims) return fermer()
    Promise.all(anims.map((a) => a.finished)).then(fermer, () => {})
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && partir()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { surtitre, titre, sousTitre, corps, embleme } = contenu(vue, { reg, articles, chapitres, icones, changer: setVue, fermer: partir })

  return (
    <aside ref={ref} className={`fiche ${mobile ? 'mobile' : ''}`} aria-label={titre} onPointerDown={(e) => e.stopPropagation()}>
      <svg className="fiche-defs" width="0" height="0" aria-hidden focusable="false">
        <filter id="fiche-barbes" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.08 0.06" numOctaves="3" seed="9" result="b" />
          <feDisplacementMap in="SourceGraphic" in2="b" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="fiche-voile" ref={voile}>
        <div className="fiche-masque">
          <div className="fiche-contenu" ref={papier}>
            <div className="fiche-papier" aria-hidden />
            <span className="fiche-epingle" aria-hidden />
            <header className="fiche-tete">
              {embleme && <div className="fiche-embleme">{embleme}</div>}
              <div className="fiche-surtitre">{surtitre}</div>
              <h2 className="fiche-titre">{titre}</h2>
              {sousTitre && <div className="fiche-titre-en">{sousTitre}</div>}
              <button type="button" className="fiche-ranger" onClick={partir}>
                Ranger
              </button>
            </header>
            <div className="fiche-corps">{corps}</div>
          </div>
        </div>
        <div className="fiche-rouleau" ref={rouleau} style={{ height: EPAIS_ROULEAU }} aria-hidden />
      </div>
    </aside>
  )
}

/** A catalogue chapter and the ids of its articles. */
type Chapitre = { id: string; titre: string; ids: string[] }
type Env = { reg: CtxRegistre; articles: Article[]; chapitres: Chapitre[]; icones: Record<string, string>; changer: (f: Fiche) => void; fermer: () => void }

function contenu(f: Fiche, env: Env): { surtitre: string; titre: string; sousTitre?: string; corps: ReactNode; embleme?: ReactNode } {
  const missive = 'numero' in f && f.numero ? env.reg.r.calcul?.etats.find((e) => e.missive.numero === f.numero) : undefined
  switch (f.genre) {
    case 'recette':
      return { surtitre: 'Recette', titre: f.nom, corps: <VueRecette nom={f.nom} env={env} /> }
    case 'edition-recette':
      return { surtitre: f.nom ? 'Corriger la recette' : 'Consigner une recette', titre: f.nom || 'Nouvelle recette', corps: <Signe env={env} action="recette"><FormRecette nom={f.nom} artisanPropose={f.artisan} env={env} /></Signe> }
    case 'vente':
      return { surtitre: 'Livre des Marchandises', titre: 'Mettre en vente', corps: <Signe env={env} action="vente"><FormVente nom={f.nom} env={env} /></Signe> }
    case 'ressource':
      return { surtitre: f.nom ? 'Corriger la matière' : 'Inscrire une matière', titre: f.nom || 'Nouvelle matière', corps: <Signe env={env} action="ressource"><FormRessource nom={f.nom} env={env} /></Signe> }
    case 'missive':
      return { surtitre: 'Livre des Missives', titre: 'Écrire une missive', corps: <Signe env={env} action="missive"><FormMissive env={env} /></Signe> }
    case 'releve':
      return { surtitre: 'Le coffre des missives', titre: 'Relever le coffre', corps: <Signe env={env} action="releve"><FormReleve env={env} numero={f.numero} /></Signe> }
    case 'depot':
      return { surtitre: missive?.missive.titre ?? 'Missive', titre: 'Déposer au coffre', corps: <Signe env={env} action="depot"><FormDepot env={env} numero={f.numero} objet={f.objet} qte={f.quantite} /></Signe> }
    case 'fabrication':
      return { surtitre: missive?.missive.titre ?? 'Missive', titre: 'Façonner', corps: <Signe env={env} action="fabrication"><FormFabrication env={env} numero={f.numero} produit={f.produit} /></Signe> }
    case 'livrer':
      return { surtitre: missive?.missive.titre ?? 'Missive', titre: 'Livrer la missive', corps: <Signe env={env} action="cloture"><FormCloture env={env} numero={f.numero} livrer /></Signe> }
    case 'rang': {
      const r = RANGS.find((x) => x.cle === f.cle)
      return {
        surtitre: 'Livre de la Caravane',
        titre: r?.nom ?? SANS_RANG.nom,
        sousTitre: r?.nomEn ?? SANS_RANG.nomEn,
        embleme: r && estImage(r.icone) ? <img className="fiche-medaillon" src={r.icone} alt="" width={118} height={118} /> : r ? <span className="fiche-sceau" style={{ background: r.couleur }} /> : undefined,
        corps: <MembresDuRang cle={f.cle} env={env} />,
      }
    }
    case 'poeme': {
      const d = divinite(f.divinite)
      const p = poemesDe(f.divinite)[f.n]
      return {
        surtitre: `Dévotions · ${d?.nom ?? ''}`,
        titre: p?.titre ?? '',
        corps: (
          <div className="poeme">
            {(p?.vers ?? []).map((v, i) => (v ? <p key={i}>{v}</p> : <p key={i} className="strophe" aria-hidden />))}
          </div>
        ),
      }
    }
    case 'mouvement':
      return { surtitre: 'Journal du coffre', titre: TITRES_MOUVEMENT[f.lignes[0]?.type] ?? 'Écriture', corps: <DetailMouvement lignes={f.lignes} env={env} /> }
    case 'abandonner':
      return { surtitre: missive?.missive.titre ?? 'Missive', titre: 'Abandonner la missive', corps: <Signe env={env} action="cloture"><FormCloture env={env} numero={f.numero} livrer={false} /></Signe> }
  }
}

/** The members who hold a rank (names only, for signed readers). */
function MembresDuRang({ cle: k, env }: { cle: string; env: Env }) {
  const h = env.reg.r.hierarchie
  if (!env.reg.r.marchand?.identite) return <p className="fiche-note">Seuls les membres qui ont signé l&apos;ex-libris lisent ce registre.</p>
  if (!h) return <p className="fiche-note">Le scribe déroule le registre des membres…</p>
  const noms = h[k] ?? []
  const rang = RANGS.find((x) => x.cle === k)
  const citation = (rang ?? (k === SANS_RANG.cle ? SANS_RANG : undefined))?.citation
  return (
    <div className="membres-rang">
      {k === SANS_RANG.cle && <p className="fiche-note">Ceux dont le rôle n&apos;est pas encore inscrit au registre des membres.</p>}
      {noms.length ? (
        <ul className={`liste-membres${rang?.disposition === 'cote-a-cote' ? ' cote-a-cote' : ''}`}>
          {noms.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : (
        <p className="fiche-note">Nul membre ne porte encore ce rang.</p>
      )}
      {citation && (
        <blockquote className="citation-fin citation-rang">
          <p>{citation}</p>
        </blockquote>
      )}
    </div>
  )
}

const TITRES_MOUVEMENT: Record<string, string> = { relevé: 'Relevé du coffre', dépôt: 'Dépôt', fabrication: 'Façonnage', livraison: 'Livraison', partage: 'Partage' }

/** One gesture of the ledger in full: who, when, for which missive, every item with its quantity. */
function DetailMouvement({ lignes, env }: { lignes: Mouvement[]; env: Env }) {
  const m = lignes[0]
  if (!m) return null
  const d = env.reg.r.donnees
  const missive = d?.missives.find((x) => x.numero === m.missive)
  const releves = m.type === 'relevé' && d ? rejouer(d.mouvements).releves.filter((x) => x.horodatage === m.horodatage) : []
  const signe = (q: number) => (q > 0 ? `+${quantite(q)}` : quantite(q))
  return (
    <div className="detail-mouvement">
      <p className="fiche-note">
        <strong>{m.membre}</strong>, {quandComplet(m.horodatage)}
        {missive && (
          <>
            <br />
            pour la missive « {missive.titre} »
          </>
        )}
      </p>
      {m.type === 'relevé' ? (
        <div className="fiche-releve">
          <div className="fiche-releve-entete detail-releve">
            <span>Objet</span>
            <span>Selon le registre</span>
            <span>Compté</span>
            <span>Écart</span>
          </div>
          {lignes.map((x, i) => {
            const r = releves.find((y) => cle(y.objet) === cle(x.objet))
            return (
              <div key={i} className={`fiche-releve-ligne detail-releve ${r && r.ecart ? 'ecart' : ''}`}>
                <span>{x.objet}</span>
                <span className="fiche-releve-attendu">{r && !r.premier ? quantite(r.attendu) : '—'}</span>
                <span>{quantite(x.quantite)}</span>
                <span>{!r || r.premier ? 'premier compte' : r.ecart ? signe(r.ecart) : 'juste'}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          {m.type === 'fabrication' && <p className="fiche-sous-titre">Mis au coffre</p>}
          <ul className="detail-lignes">
            {lignes
              .filter((x) => m.type !== 'fabrication' || x.quantite > 0)
              .map((x, i) => (
                <li key={i}>
                  <span>{m.type === 'partage' ? 'Septims' : x.objet}</span>
                  <span className="points" />
                  <strong>{m.type === 'partage' ? quantite(x.quantite) : signe(x.quantite)}</strong>
                </li>
              ))}
          </ul>
          {m.type === 'fabrication' && lignes.some((x) => x.quantite < 0) && (
            <>
              <p className="fiche-sous-titre">Pris dans le coffre</p>
              <ul className="detail-lignes">
                {lignes
                  .filter((x) => x.quantite < 0)
                  .map((x, i) => (
                    <li key={i}>
                      <span>{x.objet}</span>
                      <span className="points" />
                      <strong>{signe(x.quantite)}</strong>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </>
      )}
      {m.note && m.type !== 'relevé' && <p className="fiche-note"><em>{m.note}</em></p>}
      {m.enAttente && <p className="fiche-note"><em>L&apos;encre n&apos;est pas encore sèche : le registre confirme.</em></p>}
    </div>
  )
}

/** Forms need a signed member allowed to take the action. */
function Signe({ env, action, children }: { env: Env; action: ActionRegistre; children: ReactNode }) {
  const m = env.reg.r.marchand
  if (!m?.identite) {
    return (
      <div className="fiche-non-signe">
        <p className="fiche-note">Ce registre ne se signe qu&apos;à l&apos;ex-libris du grimoire, une fois pour toutes.</p>
        <button type="button" className="lien-encre" onClick={() => env.reg.allerA('ex-libris')}>
          aller à l&apos;ex-libris
        </button>
      </div>
    )
  }
  if (m.droits && !m.droits[action]) return <p className="message-encre erreur">Cette page du registre est réservée à d&apos;autres pattes que les tiennes.</p>
  return <>{children}</>
}

/* ───────────────────────── Shared bits of the forms ───────────────────────── */

const entier = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

type Etat = 'repos' | 'ecrit' | 'scelle'

/**
 * Sending a slip. `envoyer` waits for the registre (writing a missive, closing one: the answer is
 * needed) while the scribe writes, then stamps the seal; `confier` writes the change on the page at
 * once and puts the slip away (a refusal comes back as a notice and the change is taken back).
 */
function useEnvoi(env: Env) {
  const [etat, setEtat] = useState<Etat>('repos')
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const envoyer = async (action: ActionRegistre, corps: Record<string, unknown>, apres?: (r: { numero?: string }) => void) => {
    if (etat !== 'repos') return
    setEtat('ecrit')
    setMessage(null)
    const r = await env.reg.r.agir(action, corps)
    if (!r.ok) {
      setEtat('repos')
      setMessage({ ok: false, texte: r.message })
      return
    }
    setEtat('scelle')
    setMessage({ ok: true, texte: r.message })
    setTimeout(() => apres?.(r), DUREE_SCEAU)
  }
  const confier = (action: ActionRegistre, corps: Record<string, unknown>, prevoir: (d: DonneesRegistre) => DonneesRegistre, apres?: () => void) => {
    env.reg.r.agir(action, corps, prevoir)
    if (apres) apres()
    else env.fermer()
  }
  return { etat, envoi: etat !== 'repos', message, setMessage, envoyer, confier }
}

const DUREE_SCEAU = 1100

function Message({ m }: { m: { ok: boolean; texte: string } | null }) {
  if (!m) return null
  return (
    <p className={`message-encre ${m.ok ? 'ok' : 'erreur'}`} role={m.ok ? 'status' : 'alert'}>
      {m.texte}
    </p>
  )
}

/**
 * The slip's seal button; while the registre writes, a scribe's quill runs along a line of fresh
 * ink (« Le scribe consigne… »), then a wax seal is stamped (« Consigné. »). Transforms and opacity only.
 */
function Sceller({ etat = 'repos', children, icones, confirmer, disabled }: { etat?: Etat; children: ReactNode; icones: Record<string, string>; confirmer?: boolean; disabled?: boolean }) {
  if (etat !== 'repos') {
    return (
      <div className={`scribe ${etat}`} role="status">
        <span className="scribe-ligne" aria-hidden>
          <span className="scribe-encre" />
          <span className="scribe-plume">
            <Icone corps={icones['quill']} />
          </span>
        </span>
        <span className="scribe-cachet" aria-hidden>
          <Icone corps={icones['wax-seal']} />
        </span>
        <span className="scribe-mot">{etat === 'ecrit' ? 'Le scribe consigne…' : 'Consigné.'}</span>
      </div>
    )
  }
  return (
    <button type="submit" className={`commande-sceller fiche-sceller ${confirmer ? 'confirmer' : ''}`} disabled={disabled}>
      <span className="commande-cire" aria-hidden>
        <Icone corps={icones['wax-seal']} />
      </span>
      {children}
    </button>
  )
}

/** A ledger row written on the page before the registre answers. */
function prevu(env: Env, m: Omit<Mouvement, 'horodatage' | 'membre' | 'enAttente'>): Mouvement {
  return { ...m, horodatage: new Date().toISOString(), membre: env.reg.r.marchand?.identite ?? '', enAttente: true }
}

/** Every name the registre and the catalogue know, for the quill's suggestions. */
function useNoms(env: Env) {
  return useMemo(() => {
    const d = env.reg.r.donnees
    const produits = new Map<string, string>()
    env.articles.forEach((a) => produits.set(cle(a.fr), a.fr))
    d?.recettes.forEach((r) => produits.has(cle(r.produit)) || produits.set(cle(r.produit), r.produit))
    const tous = new Map(produits)
    d?.recettes.forEach((r) => r.ingredients.forEach((i) => tous.has(cle(i.nom)) || tous.set(cle(i.nom), i.nom)))
    d?.ressources.forEach((r) => tous.has(cle(r.nom)) || tous.set(cle(r.nom), r.nom))
    if (d) rejouer(d.mouvements).stock.forEach((s, k) => tous.has(k) || tous.set(k, s.nom))
    const tri = (m: Map<string, string>) => [...m.values()].sort((a, b) => a.localeCompare(b, 'fr'))
    return { produits: tri(produits), tous: tri(tous) }
  }, [env.articles, env.reg.r.donnees])
}

function Suggestions({ id, noms }: { id: string; noms: string[] }) {
  return (
    <datalist id={id}>
      {noms.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  )
}

type Ligne = { objet: string; qte: string }

/** An item the registre or the catalogue already knows, by its names. */
type Connu = { nom: string; en: string }

/** Known names offered under a field while typing (picked with a touch; the field keeps the focus). */
function Propositions({ connus, choisir, titre = 'Déjà connu :' }: { connus: Connu[]; choisir: (nom: string) => void; titre?: string }) {
  if (!connus.length) return null
  return (
    <div className="fiche-propositions">
      <span>{titre}</span>
      {connus.map((c) => (
        <button key={c.nom} type="button" className="lien-encre" onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(c.nom)}>
          {c.nom}
          {c.en && <em> · {c.en}</em>}
        </button>
      ))}
    </div>
  )
}

/** Rows "name · quantity" with a quill to strike a row out and a line to add one. */
function Lignes({
  lignes,
  setLignes,
  liste,
  mot = 'Quantité',
  aide,
  proposer,
}: {
  lignes: Ligne[]
  setLignes: (l: Ligne[]) => void
  liste: string
  mot?: string
  aide?: (l: Ligne) => ReactNode
  /** Known names close to what is typed in a row (instead of the browser's list): the same item never under two spellings. */
  proposer?: (tape: string) => Connu[]
}) {
  const regler = (i: number, p: Partial<Ligne>) => setLignes(lignes.map((l, k) => (k === i ? { ...l, ...p } : l)))
  const [active, setActive] = useState<number | null>(null)
  return (
    <div className="fiche-lignes">
      {lignes.map((l, i) => (
        <div key={i} className="fiche-ligne">
          <input
            type="text"
            list={proposer ? undefined : liste}
            value={l.objet}
            onChange={(e) => regler(i, { objet: e.target.value })}
            onFocus={() => setActive(i)}
            onBlur={() => setActive((a) => (a === i ? null : a))}
            placeholder="Objet"
            aria-label="Objet"
            maxLength={120}
            autoComplete="off"
          />
          <input type="text" inputMode="numeric" className="fiche-qte" value={l.qte} onChange={(e) => regler(i, { qte: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9) })} placeholder="Qté" aria-label={mot} />
          <button type="button" className="fiche-rayer" aria-label="Rayer la ligne" title="Rayer la ligne" onClick={() => setLignes(lignes.length > 1 ? lignes.filter((_, k) => k !== i) : [{ objet: '', qte: '' }])}>
            ✕
          </button>
          {aide && <p className="fiche-aide">{aide(l)}</p>}
          {proposer && active === i && <Propositions connus={proposer(l.objet)} choisir={(n) => regler(i, { objet: n })} />}
        </div>
      ))}
      <button type="button" className="lien-encre fiche-ajouter" onClick={() => setLignes([...lignes, { objet: '', qte: '' }])}>
        + une ligne
      </button>
    </div>
  )
}

const remplies = (ls: Ligne[]) => ls.filter((l) => l.objet.trim() && l.qte.trim())

/* ───────────────────────── Recipe: the tree ───────────────────────── */

function Branche({ n, profondeur, env }: { n: Noeud; profondeur: number; env: Env }) {
  const [ouverte, setOuverte] = useState(profondeur < 2)
  const pliable = n.enfants.length > 0
  return (
    <li className={`branche ${pliable ? 'composee' : 'simple'}`}>
      <div className="branche-ligne">
        {pliable ? (
          <button type="button" className={`branche-pli ${ouverte ? 'ouverte' : ''}`} onClick={() => setOuverte((o) => !o)} aria-expanded={ouverte} aria-label={ouverte ? `Replier ${n.nom}` : `Déplier ${n.nom}`}>
            ❧
          </button>
        ) : (
          <span className="branche-puce" aria-hidden>
            ·
          </span>
        )}
        <span className="branche-qte">{quantite(n.quantite)}</span>
        <button type="button" className="branche-nom" onClick={() => env.changer({ genre: 'recette', nom: n.nom })} title={`Ouvrir la recette de ${n.nom}`}>
          {n.nom}
        </button>
        {pliable && <em className="branche-fournees">{n.fournees} fournée{n.fournees > 1 ? 's' : ''}</em>}
        {n.cycle && <em className="branche-cycle">recette en boucle</em>}
      </div>
      {pliable && ouverte && (
        <ul className="branches">
          {n.enfants.map((e, i) => (
            <Branche key={`${e.nom}-${i}`} n={e} profondeur={profondeur + 1} env={env} />
          ))}
        </ul>
      )}
    </li>
  )
}

function VueRecette({ nom, env }: { nom: string; env: Env }) {
  const c = env.reg.r.calcul
  const d = env.reg.r.donnees
  const recette = c?.recettes.get(cle(nom))
  const ressource = d?.ressources.find((r) => cle(r.nom) === cle(nom))
  const article = env.articles.find((a) => cle(a.fr) === cle(nom) || (a.en && cle(a.en) === cle(nom)))
  const [combien, setCombien] = useState(String(recette?.rendement ?? 1))
  useEffect(() => setCombien(String(recette?.rendement ?? 1)), [recette?.rendement, nom])
  if (!c || !d?.relie) return <p className="registre-ferme">Le livre des recettes n&apos;est pas encore relié au grimoire.</p>
  const valeur = c.valeur(nom)
  const droits = env.reg.r.marchand?.droits
  const n = Math.max(1, Math.min(99999, Math.round(entier(combien)) || 1))
  const cycle = recette ? trouverCycle(nom, c.recettes) : null
  return (
    <div className="vue-recette">
      {(article?.en || recette?.en || ressource?.en) && <p className="fiche-en">{article?.en || recette?.en || ressource?.en}</p>}
      {recette ? (
        <>
          <p className="fiche-note">
            Une fournée donne <strong>{quantite(recette.rendement)}</strong> {recette.produit}
            {recette.artisan && <> · {metierDe(recette.artisan).nom}</>}
            {valeur > 0 && <> · valeur {prix(Math.round(valeur * 100) / 100)} septims l&apos;unité</>}
          </p>
          {recette.note && <p className="fiche-note"><em>{recette.note}</em></p>}
          <label className="fiche-combien">
            Pour
            <input type="text" inputMode="numeric" value={combien} onChange={(e) => setCombien(e.target.value.replace(/\D/g, '').slice(0, 5))} aria-label="Quantité à façonner" />
            {recette.produit}
          </label>
          {cycle ? (
            <p className="message-encre erreur">{texteCycle(cycle)}</p>
          ) : (
            <>
              <ul className="branches racine">
                {arbre(nom, n, c.recettes).enfants.map((e, i) => (
                  <Branche key={`${e.nom}-${i}`} n={e} profondeur={0} env={env} />
                ))}
              </ul>
              <CoutMatieres nom={nom} n={n} rendement={recette.rendement} env={env} />
            </>
          )}
        </>
      ) : ressource ? (
        <p className="fiche-note">
          Matière première{ressource.origine && <> ({ressource.origine})</>}, que la caravane se procure sans jamais la revendre.
          {ressource.prix !== null && <> Prix courant : <strong>{prix(ressource.prix)}</strong> septims l&apos;unité.</>}
          {ressource.bonneAffaire !== null && <> Bonne affaire à <strong>{prix(ressource.bonneAffaire)}</strong> ou moins : qu&apos;on achète sans hésiter.</>}
          {ressource.note && <em> {ressource.note}</em>}
        </p>
      ) : (
        <p className="fiche-note">
          Nulle recette n&apos;est consignée pour cet ouvrage. Qu&apos;un artisan en écrive une, et la caravane saura ce qu&apos;il faut réunir.
        </p>
      )}
      {recette && <AuCatalogue recette={recette} env={env} />}
      <div className="fiche-actions">
        {droits?.recette !== false && !ressource && (
          <button type="button" className="lien-encre" onClick={() => env.changer({ genre: 'edition-recette', nom: recette?.produit ?? nom })}>
            {recette ? 'Corriger la recette' : 'Consigner la recette'}
          </button>
        )}
        {droits?.ressource !== false && ressource && (
          <button type="button" className="lien-encre" onClick={() => env.changer({ genre: 'ressource', nom: ressource.nom })}>
            Corriger la matière
          </button>
        )}
      </div>
    </div>
  )
}

/** The catalogue article of a recipe's product (by its French or English name), if the caravan sells it. */
function articleDe(recette: Recette, env: Env): Article | undefined {
  const noms = [recette.produit, recette.en].filter(Boolean).map(cle)
  return env.articles.find((a) => noms.includes(cle(a.fr)) || (a.en && noms.includes(cle(a.en))))
}

/** Whether the caravan sells a recipe's product: where it stands in the catalogue, or the way to put it up for sale. */
function AuCatalogue({ recette, env }: { recette: Recette; env: Env }) {
  const article = articleDe(recette, env)
  const enAttente = env.reg.r.donnees?.catalogue?.some((a) => a.enAttente && cle(a.fr) === cle(article?.fr ?? ''))
  if (article) {
    return (
      <div className={`fiche-catalogue ${enAttente ? 'en-attente' : ''}`}>
        <p className="fiche-note">
          <strong>Au catalogue de la caravane.</strong>{' '}
          {article.min === null && article.max === null ? (
            <>Prix à négocier.</>
          ) : (
            <>
              Plancher <strong>{prix(article.min)}</strong>, plafond <strong>{prix(article.max)}</strong> septims.
            </>
          )}
        </p>
        <button type="button" className="lien-encre" onClick={() => env.reg.allerA(chapitreDeArticle(article, env) ?? '')}>
          voir au catalogue
        </button>
      </div>
    )
  }
  if (env.reg.r.marchand?.droits?.vente === false) return null
  return (
    <div className="fiche-catalogue">
      <p className="fiche-note">Cet ouvrage n’est pas encore au catalogue : la caravane ne le vend pas.</p>
      <button type="button" className="lien-encre" onClick={() => env.changer({ genre: 'vente', nom: recette.produit })}>
        le mettre en vente
      </button>
    </div>
  )
}

/** The chapter page holding an article (its id), found through the slip's chapters and the sold rows. */
function chapitreDeArticle(article: Article, env: Env): string | undefined {
  const vendu = env.reg.r.donnees?.catalogue?.find((a) => cle(a.fr) === cle(article.fr))
  if (vendu) return vendu.chapitre
  return env.chapitres.find((c) => c.ids.includes(article.id))?.id
}

/**
 * Putting a recipe's product up for sale: a row of the catalogue, its names and craft taken from the
 * recipe, its cost from the recipe's materials, the floor and ceiling proposed from the chapter's
 * usual margins (to accept or change).
 */
function FormVente({ nom, env }: { nom: string; env: Env }) {
  const c = env.reg.r.calcul
  const recette = c?.recettes.get(cle(nom))
  const cout = recette && c ? Math.round(c.valeur(recette.produit) * 100) / 100 : 0
  const [chapitre, setChapitre] = useState(() => {
    const voulu = metierDe(recette?.artisan ?? '').chapitre
    return env.chapitres.some((x) => x.id === voulu) ? voulu : (env.chapitres.find((x) => x.id === 'divers')?.id ?? env.chapitres[0]?.id ?? '')
  })
  const ecrit = (v: number | null) => (v === null || !v ? '' : String(v).replace('.', ','))
  const [v, setV] = useState({ fr: recette?.produit ?? nom, en: recette?.en ?? '', prod: ecrit(cout || null), min: '', max: '', note: '' })
  // The chapter's usual margins: median floor / cost and ceiling / cost of its articles.
  const marges = useMemo(() => {
    const ids = new Set(env.chapitres.find((x) => x.id === chapitre)?.ids ?? [])
    const dans = env.articles.filter((a) => ids.has(a.id) && a.prod && a.prod > 0)
    const mediane = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null)
    return {
      min: mediane(dans.flatMap((a) => (a.min ? [a.min / a.prod!] : []))) ?? 1.5,
      max: mediane(dans.flatMap((a) => (a.max ? [a.max / a.prod!] : []))) ?? 2,
    }
  }, [env.articles, env.chapitres, chapitre])
  const base = entier(v.prod)
  const proposes = base > 0 ? { min: Math.ceil(base * marges.min), max: Math.ceil(base * marges.max) } : null
  const { message, setMessage, confier } = useEnvoi(env)
  const champ = (k: keyof typeof v, mot: string, extra: Record<string, unknown> = {}) => (
    <label className="fiche-champ">
      <span>{mot}</span>
      <input type="text" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={120} {...extra} />
    </label>
  )
  if (!recette) return <p className="fiche-note">Nulle recette n&apos;est consignée pour cet ouvrage.</p>
  return (
    <form
      className="fiche-form"
      onSubmit={(e) => {
        e.preventDefault()
        const fr = v.fr.trim()
        if (!fr) return setMessage({ ok: false, texte: 'Le nom de l’ouvrage manque.' })
        if (!chapitre) return setMessage({ ok: false, texte: 'Choisis le chapitre du catalogue.' })
        const lu = (s: string) => (s.trim() ? entier(s) : null)
        const prod = lu(v.prod)
        const min = lu(v.min)
        const max = lu(v.max)
        if ([prod, min, max].some((x) => x !== null && !(x >= 0))) return setMessage({ ok: false, texte: 'Un prix est illisible : un nombre de septims est attendu.' })
        if (min !== null && max !== null && min > max) return setMessage({ ok: false, texte: 'Le plancher ne peut dépasser le plafond.' })
        const article: ArticleVente = { chapitre, fr, en: v.en.trim(), prod, min, max, artisan: recette.artisan, note: v.note.trim(), enAttente: true }
        confier(
          'vente',
          { ...article, enAttente: undefined },
          (d) => ({ ...d, catalogue: [...(d.catalogue ?? []).filter((a) => cle(a.fr) !== cle(fr)), article] }),
          () => env.changer({ genre: 'recette', nom: recette.produit }),
        )
      }}
    >
      <p className="fiche-note">
        L’ouvrage rejoint le catalogue de la caravane : chacun pourra le vendre et l’inscrire au bon de commande.
      </p>
      <label className="fiche-champ">
        <span>Chapitre</span>
        <select value={chapitre} onChange={(e) => setChapitre(e.target.value)}>
          {env.chapitres.map((x) => (
            <option key={x.id} value={x.id}>
              {x.titre}
            </option>
          ))}
        </select>
      </label>
      {champ('fr', 'Ouvrage', { required: true })}
      {champ('en', 'Nom anglais', { placeholder: 'facultatif' })}
      {champ('prod', 'Coût', { inputMode: 'decimal', placeholder: 'septims l’unité', title: 'Ce que l’ouvrage coûte à l’atelier (ses matières, d’après la recette)' })}
      <div className="fiche-deux">
        {champ('min', 'Plancher', { inputMode: 'decimal', placeholder: proposes ? `p. ex. ${proposes.min}` : 'à négocier' })}
        {champ('max', 'Plafond', { inputMode: 'decimal', placeholder: proposes ? `p. ex. ${proposes.max}` : 'à négocier' })}
      </div>
      {proposes && !v.min && !v.max && (
        <button type="button" className="lien-encre fiche-ajouter" onClick={() => setV({ ...v, min: String(proposes.min), max: String(proposes.max) })}>
          prendre les marges d’usage du chapitre
        </button>
      )}
      {champ('note', 'Note', { placeholder: 'facultative' })}
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller icones={env.icones}>Mettre en vente</Sceller>
      </div>
    </form>
  )
}

/** What the raw materials of one craft (and of « Pour N ») cost at their « prix courant ». */
function CoutMatieres({ nom, n, rendement, env }: { nom: string; n: number; rendement: number; env: Env }) {
  const c = env.reg.r.calcul
  const ressources = env.reg.r.donnees?.ressources ?? []
  if (!c) return null
  const une = coutMatieres(arbre(nom, rendement, c.recettes), ressources)
  const toutes = coutMatieres(arbre(nom, n, c.recettes), ressources)
  if (!une.cout && !une.sansPrix.length) return null
  return (
    <div className="fiche-cout">
      <p>
        Matières d&apos;une fournée : <strong>{prix(une.cout)}</strong> septims
      </p>
      {n !== rendement && (
        <p>
          Pour {quantite(n)} : <strong>{prix(toutes.cout)}</strong> septims
        </p>
      )}
      {toutes.sansPrix.length > 0 && <p className="fiche-cout-note">sans prix courant au registre : {toutes.sansPrix.join(', ')}</p>}
    </div>
  )
}

/* ───────────────────────── Recipe and resource forms ───────────────────────── */

function FormRecette({ nom, artisanPropose, env }: { nom: string; artisanPropose?: string; env: Env }) {
  const c = env.reg.r.calcul
  const ancienne = nom ? c?.recettes.get(cle(nom)) : undefined
  const noms = useNoms(env)
  const [produit, setProduit] = useState(ancienne?.produit ?? nom)
  const [rendement, setRendement] = useState(String(ancienne?.rendement ?? 1))
  const [artisan, setArtisan] = useState(ancienne?.artisan ?? artisanPropose ?? '')
  const [en, setEn] = useState(ancienne?.en ?? '')
  const enCatalogue = env.articles.find((a) => cle(a.fr) === cle(produit))?.en ?? ''
  const metiers = [...new Set([...Object.values(METIERS).map((m) => m.nom), ...(env.reg.r.donnees?.recettes ?? []).map((r) => metierDe(r.artisan).nom)])].filter((m) => m !== SANS_METIER.nom).sort((a, b) => a.localeCompare(b, 'fr'))
  const [note, setNote] = useState(ancienne?.note ?? '')
  const [lignes, setLignes] = useState<Ligne[]>(ancienne?.ingredients.length ? ancienne.ingredients.map((i) => ({ objet: i.nom, qte: String(i.quantite) })) : [{ objet: '', qte: '' }])
  const [effacer, setEffacer] = useState(false)
  const { message, setMessage, confier } = useEnvoi(env)
  const d = env.reg.r.donnees

  // Items the registre knows, FR and EN: raw materials, products (recipes, catalogue), ingredients.
  const { connus, ressourcesEtProduits } = useMemo(() => {
    const m = new Map<string, Connu>()
    const ajouter = (nom: string, en = '') => {
      if (!nom) return
      const k = cle(nom)
      const c = m.get(k)
      if (!c) m.set(k, { nom, en })
      else if (!c.en && en) c.en = en
    }
    d?.ressources.forEach((r) => ajouter(r.nom, r.en))
    d?.recettes.forEach((r) => ajouter(r.produit, r.en))
    env.articles.forEach((a) => ajouter(a.fr, a.en))
    const ressourcesEtProduits = new Set([...m.values()].flatMap((c) => [cle(c.nom), c.en ? cle(c.en) : '']).filter(Boolean))
    d?.recettes.forEach((r) => r.ingredients.forEach((i) => ajouter(i.nom)))
    return { connus: [...m.values()], ressourcesEtProduits }
  }, [d, env.articles])
  const estConnu = (t: string) => connus.some((c) => cle(c.nom) === cle(t) || (c.en && cle(c.en) === cle(t)))
  const proposer = (t: string) => (estConnu(t) ? [] : proches(t, connus, (c) => [c.nom, c.en], 4))
  // While naming a new recipe (or renaming one): the recipes already written under a close name.
  const autresRecettes = (d?.recettes ?? []).filter((r) => !ancienne || cle(r.produit) !== cle(ancienne.produit))
  const doublons = [produit, en]
    .filter((t) => t.trim())
    .flatMap((t) => proches(t, autresRecettes, (r) => [r.produit, r.en], 3))
    .filter((r, i, l) => l.findIndex((x) => x.produit === r.produit) === i)
    .slice(0, 3)
  const memeNom = doublons.some((r) => [produit, en].some((t) => t.trim() && (cle(t) === cle(r.produit) || (r.en && cle(t) === cle(r.en)))))

  const ecrire = (ingredients: Ligne[]) => {
    const p = produit.trim()
    if (!p) return setMessage({ ok: false, texte: 'Le nom de l’ouvrage manque.' })
    const ings = remplies(ingredients).map((l) => ({ nom: l.objet.trim(), quantite: entier(l.qte) }))
    if (ings.some((i) => !(i.quantite > 0))) return setMessage({ ok: false, texte: 'Chaque matière attend une quantité plus grande que zéro.' })
    const nouvelle: Recette = { produit: p, en: en.trim(), rendement: Math.max(1, Math.round(entier(rendement)) || 1), artisan, note, ingredients: ings }
    const autres = env.reg.r.donnees?.recettes.filter((r) => cle(r.produit) !== cle(p) && (!ancienne || cle(r.produit) !== cle(ancienne.produit))) ?? []
    const cycle = ings.length ? trouverCycle(p, indexRecettes([...autres, nouvelle])) : null
    if (cycle) return setMessage({ ok: false, texte: texteCycle(cycle) })
    confier(
      'recette',
      {
        produit: p,
        ancienProduit: ancienne && cle(ancienne.produit) !== cle(p) ? ancienne.produit : undefined,
        en: en.trim(),
        rendement: nouvelle.rendement,
        artisan,
        note,
        ingredients: ings.map((i) => ({ nom: i.nom, quantite: String(i.quantite) })),
      },
      (dd) => {
        // Ingredients known nowhere join the raw materials at once (prices to fill), as the registre will do.
        const nouvelles: Ressource[] = ings
          .filter((i) => !ressourcesEtProduits.has(cle(i.nom)) && cle(i.nom) !== cle(p) && !dd.ressources.some((r) => cle(r.nom) === cle(i.nom)))
          .map((i) => ({ nom: i.nom, en: '', origine: '', prix: null, bonneAffaire: null, note: '' }))
        return {
          ...dd,
          ressources: [...dd.ressources, ...nouvelles],
          recettes: ings.length ? [...dd.recettes.filter((r) => cle(r.produit) !== cle(p) && (!ancienne || cle(r.produit) !== cle(ancienne.produit))), nouvelle] : dd.recettes.filter((r) => cle(r.produit) !== cle(p)),
        }
      },
      () => env.changer({ genre: 'recette', nom: p }),
    )
  }
  return (
    <form
      className="fiche-form"
      onSubmit={(e) => {
        e.preventDefault()
        ecrire(lignes)
      }}
    >
      <Suggestions id="fiche-tous" noms={noms.tous} />
      <Suggestions id="fiche-produits" noms={noms.produits} />
      <Suggestions id="fiche-metiers" noms={metiers} />
      <label className="fiche-champ">
        <span>Ouvrage</span>
        <input type="text" value={produit} onChange={(e) => setProduit(e.target.value)} maxLength={120} required placeholder="Bière, Potion de soin…" autoComplete="off" />
      </label>
      <label className="fiche-champ">
        <span>Nom anglais</span>
        <input type="text" value={en} onChange={(e) => setEn(e.target.value)} maxLength={120} placeholder={enCatalogue ? `${enCatalogue} (au catalogue)` : 'facultatif'} />
      </label>
      {doublons.length > 0 && (
        <div className={`fiche-propositions doublons ${memeNom ? 'meme' : ''}`} role="status">
          <span>{memeNom ? 'Cette recette est déjà consignée :' : 'Déjà au registre, peut-être :'}</span>
          {doublons.map((r) => (
            <button key={r.produit} type="button" className="lien-encre" onClick={() => env.changer({ genre: 'recette', nom: r.produit })}>
              ouvrir {r.produit}
              {r.en && <em> · {r.en}</em>}
            </button>
          ))}
        </div>
      )}
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Rendement</span>
          <input type="text" inputMode="numeric" value={rendement} onChange={(e) => setRendement(e.target.value.replace(/\D/g, '').slice(0, 4))} title="Unités obtenues par fournée" />
        </label>
        <label className="fiche-champ">
          <span>Métier</span>
          <input type="text" list="fiche-metiers" value={artisan} onChange={(e) => setArtisan(e.target.value)} maxLength={40} placeholder="Alchimiste, Forgeron…" />
        </label>
      </div>
      <p className="fiche-sous-titre">Pour une fournée</p>
      <Lignes lignes={lignes} setLignes={setLignes} liste="fiche-tous" proposer={proposer} />
      <label className="fiche-champ">
        <span>Note</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="facultative" />
      </label>
      <Message m={message} />
      <div className="fiche-pied">
        {ancienne && (
          <button
            type="button"
            className={`commande-jeter ${effacer ? 'confirmer' : ''}`}
            onClick={() => {
              if (!effacer) return setEffacer(true)
              setEffacer(false)
              ecrire([])
            }}
          >
            {effacer ? 'Vraiment ? Au feu !' : 'Effacer la recette'}
          </button>
        )}
        <Sceller icones={env.icones}>Consigner la recette</Sceller>
      </div>
    </form>
  )
}

function FormRessource({ nom, env }: { nom: string; env: Env }) {
  const d = env.reg.r.donnees
  const ancienne = d?.ressources.find((r) => cle(r.nom) === cle(nom))
  const origines = [...new Set(['récolte', 'loot', 'achat', 'craft', ...(d?.ressources ?? []).map((r) => r.origine).filter(Boolean)])]
  const ecrit = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','))
  const [v, setV] = useState({ nom: ancienne?.nom ?? nom, en: ancienne?.en ?? '', origine: ancienne?.origine ?? '', prix: ecrit(ancienne?.prix), bonneAffaire: ecrit(ancienne?.bonneAffaire), note: ancienne?.note ?? '' })
  const { message, setMessage, confier } = useEnvoi(env)
  const champ = (k: keyof typeof v, mot: string, extra: Record<string, unknown> = {}) => (
    <label className="fiche-champ">
      <span>{mot}</span>
      <input type="text" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={120} {...extra} />
    </label>
  )
  return (
    <form
      className="fiche-form"
      onSubmit={(e) => {
        e.preventDefault()
        const n = v.nom.trim()
        if (!n) return setMessage({ ok: false, texte: 'Le nom de la matière manque.' })
        const lu = (s: string) => (s.trim() ? entier(s) : null)
        const prixCourant = lu(v.prix)
        const bonne = lu(v.bonneAffaire)
        if ((prixCourant !== null && !(prixCourant >= 0)) || (bonne !== null && !(bonne >= 0))) return setMessage({ ok: false, texte: 'Un prix est illisible : un nombre de septims est attendu.' })
        const ancienNom = ancienne && cle(ancienne.nom) !== cle(n) ? ancienne.nom : undefined
        const r: Ressource = { nom: n, en: v.en.trim(), origine: v.origine.trim(), prix: prixCourant, bonneAffaire: bonne, note: v.note.trim() }
        confier('ressource', { ...v, nom: n, ancienNom }, (dd) => ({ ...dd, ressources: [...dd.ressources.filter((x) => cle(x.nom) !== cle(ancienNom ?? n)), r] }))
      }}
    >
      <Suggestions id="fiche-origines" noms={origines} />
      {champ('nom', 'Matière', { required: true, placeholder: 'Blé, Lavande…' })}
      {champ('en', 'Nom anglais', { placeholder: 'facultatif' })}
      <div className="fiche-deux">
        {champ('prix', 'Prix courant', { inputMode: 'decimal', placeholder: 'septims l’unité', title: 'Le prix d’achat habituel ; il pèse aussi les dépôts dans les parts des missives' })}
        {champ('bonneAffaire', 'Bonne affaire', { inputMode: 'decimal', placeholder: 'facultatif', title: 'À ce prix ou moins, qu’on achète sans hésiter' })}
      </div>
      {champ('origine', 'Origine', { list: 'fiche-origines', placeholder: 'facultatif : récolte, loot, achat, craft…' })}
      {champ('note', 'Note', { placeholder: 'facultative' })}
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller icones={env.icones}>Inscrire la matière</Sceller>
      </div>
    </form>
  )
}

/* ───────────────────────── Writing a missive ───────────────────────── */

function FormMissive({ env }: { env: Env }) {
  const noms = useNoms(env)
  const [titre, setTitre] = useState('')
  const [commanditaire, setCommanditaire] = useState('')
  const [ech, setEch] = useState('')
  const [lignes, setLignes] = useState<Ligne[]>([{ objet: '', qte: '' }])
  const { etat, message, envoyer } = useEnvoi(env)
  return (
    <form
      className="fiche-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer('missive', { titre, commanditaire, echeance: ech, lignes: remplies(lignes).map((l) => ({ produit: l.objet, quantite: l.qte })) }, (r) => {
          if (r.numero) env.reg.allerA(idMissive(r.numero))
          env.fermer()
        })
      }}
    >
      <Suggestions id="fiche-produits" noms={noms.produits} />
      <label className="fiche-champ">
        <span>Titre</span>
        <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} required placeholder="La soif du Jarl" />
      </label>
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Commanditaire</span>
          <input type="text" value={commanditaire} onChange={(e) => setCommanditaire(e.target.value)} maxLength={120} placeholder="facultatif" />
        </label>
        <label className="fiche-champ">
          <span>Échéance</span>
          <input type="text" value={ech} onChange={(e) => setEch(e.target.value)} maxLength={80} placeholder="facultative" />
        </label>
      </div>
      <p className="fiche-sous-titre">Ouvrages demandés</p>
      <Lignes lignes={lignes} setLignes={setLignes} liste="fiche-produits" />
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller etat={etat} icones={env.icones}>Sceller la missive</Sceller>
      </div>
    </form>
  )
}

/* ───────────────────────── The chest: counting, depositing, crafting ───────────────────────── */

function FormReleve({ env, numero }: { env: Env; numero?: string }) {
  const d = env.reg.r.donnees
  const noms = useNoms(env)
  const { stock } = useMemo(() => rejouer(d?.mouvements ?? []), [d])
  // Items worth counting: what the ledger says is in the chest, and what open missives need.
  const objets = useMemo(() => {
    const m = new Map<string, string>()
    stock.forEach((s, k) => s.qte !== 0 && m.set(k, s.nom))
    for (const e of env.reg.r.calcul?.etats ?? []) {
      if (estClose(e.missive) || (numero && e.missive.numero !== numero)) continue
      e.besoins.forEach((b) => m.has(cle(b.nom)) || m.set(cle(b.nom), b.nom))
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'fr'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numero])
  const [comptes, setComptes] = useState<Record<string, string>>({})
  const [autres, setAutres] = useState<Ligne[]>([{ objet: '', qte: '' }])
  const { message, setMessage, confier } = useEnvoi(env)
  return (
    <form
      className="fiche-form"
      onSubmit={(e) => {
        e.preventDefault()
        const lignes = [
          ...Object.entries(comptes).filter(([, v]) => v.trim()).map(([objet, v]) => ({ objet, compte: v })),
          ...remplies(autres).map((l) => ({ objet: l.objet.trim(), compte: l.qte })),
        ]
        if (!lignes.length) return setMessage({ ok: false, texte: 'Inscris au moins un compte : ce que tu vois dans le coffre.' })
        confier('releve', { missive: numero ?? '', lignes }, (dd) => ({
          ...dd,
          mouvements: [...dd.mouvements, ...lignes.map((l) => prevu(env, { action: '', missive: numero ?? '', type: 'relevé', objet: l.objet, quantite: entier(l.compte) || 0, note: '' }))],
        }))
      }}
    >
      <Suggestions id="fiche-tous" noms={noms.tous} />
      <p className="fiche-note">Compte ce que le coffre des missives contient vraiment. Laisse vide ce que tu n&apos;as pas compté.</p>
      {objets.length > 0 && (
        <div className="fiche-releve">
          <div className="fiche-releve-entete">
            <span>Objet</span>
            <span>Selon le registre</span>
            <span>Compté</span>
          </div>
          {objets.map((o) => {
            const attendu = enStock(stock, o)
            const v = comptes[o] ?? ''
            const ecart = v.trim() ? entier(v) - attendu : 0
            return (
              <label key={o} className={`fiche-releve-ligne ${ecart ? 'ecart' : ''}`}>
                <span>{o}</span>
                <span className="fiche-releve-attendu">{quantite(attendu)}</span>
                <input type="text" inputMode="numeric" value={v} onChange={(e) => setComptes({ ...comptes, [o]: e.target.value.replace(/\D/g, '').slice(0, 7) })} placeholder={String(attendu)} aria-label={`Compte de ${o}`} />
                {ecart !== 0 && !Number.isNaN(ecart) && <em className="fiche-ecart">écart {ecart > 0 ? `+${ecart}` : ecart}</em>}
              </label>
            )
          })}
        </div>
      )}
      <p className="fiche-sous-titre">Autre chose dans le coffre</p>
      <Lignes lignes={autres} setLignes={setAutres} liste="fiche-tous" mot="Compte" />
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller icones={env.icones}>Consigner le relevé</Sceller>
      </div>
    </form>
  )
}

function useMissive(env: Env, numero: string) {
  return env.reg.r.calcul?.etats.find((e) => e.missive.numero === numero)
}

function FormDepot({ env, numero, objet, qte }: { env: Env; numero: string; objet?: string; qte?: number }) {
  const noms = useNoms(env)
  const [lignes, setLignes] = useState<Ligne[]>([{ objet: objet ?? '', qte: qte ? String(qte) : '' }])
  const [note, setNote] = useState('')
  const { message, setMessage, confier } = useEnvoi(env)
  return (
    <form
      className="fiche-form"
      onSubmit={(ev) => {
        ev.preventDefault()
        const ls = remplies(lignes).map((l) => ({ objet: l.objet.trim(), quantite: entier(l.qte) }))
        if (!ls.length) return setMessage({ ok: false, texte: 'Inscris ce que tu déposes, et combien.' })
        if (ls.some((l) => !(l.quantite >= 1) || !Number.isInteger(l.quantite))) return setMessage({ ok: false, texte: 'Une quantité est illisible : un nombre entier est attendu.' })
        confier('depot', { missive: numero, note, lignes: ls }, (dd) => ({
          ...dd,
          mouvements: [...dd.mouvements, ...ls.map((l) => prevu(env, { action: '', missive: numero, type: 'dépôt', objet: l.objet, quantite: l.quantite, note }))],
        }))
      }}
    >
      <Suggestions id="fiche-depot" noms={noms.tous} />
      <p className="fiche-note">Ce que tu poses dans le coffre des missives, matière brute ou ouvrage fini, est porté à ton crédit.</p>
      <Lignes lignes={lignes} setLignes={setLignes} liste="fiche-depot" />
      <label className="fiche-champ">
        <span>Note</span>
        <input type="text" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={200} placeholder="facultative" />
      </label>
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller icones={env.icones}>Déposer au coffre</Sceller>
      </div>
    </form>
  )
}

function FormFabrication({ env, numero, produit: impose }: { env: Env; numero: string; produit?: string }) {
  const e = useMissive(env, numero)
  const c = env.reg.r.calcul
  const recettes = useMemo(() => [...(env.reg.r.donnees?.recettes ?? [])].sort((a, b) => a.produit.localeCompare(b.produit, 'fr')), [env.reg.r.donnees])
  const conseil = impose
    ? e?.besoins.find((b) => cle(b.nom) === cle(impose))
    : (e?.besoins.find((b) => b.fournees > 0 && b.niveau === 'intermediaire') ?? e?.besoins.find((b) => b.fournees > 0))
  const [produit, setProduit] = useState(c?.recettes.get(cle(impose ?? ''))?.produit ?? conseil?.nom ?? recettes[0]?.produit ?? '')
  const recette = c?.recettes.get(cle(produit))
  const [fournees, setFournees] = useState(String(conseil && cle(conseil.nom) === cle(produit) && conseil.fournees ? conseil.fournees : 1))
  const nf = Math.max(0, Math.round(entier(fournees)) || 0)
  const [sortie, setSortie] = useState('')
  const [entrees, setEntrees] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const { message, setMessage, confier } = useEnvoi(env)

  // A new product or a new number of crafts rewrites the quantities from the recipe.
  useEffect(() => {
    if (!recette) return
    setSortie(String(nf * recette.rendement))
    setEntrees(Object.fromEntries(recette.ingredients.map((i) => [i.nom, String(Math.round(i.quantite * nf * 1000) / 1000)])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produit, nf, recette?.rendement])

  return (
    <form
      className="fiche-form"
      onSubmit={(ev) => {
        ev.preventDefault()
        if (!recette) return
        const q = entier(sortie)
        if (!(q >= 1)) return setMessage({ ok: false, texte: 'Combien en as-tu façonné ?' })
        const prises = Object.entries(entrees).map(([objet, v]) => ({ objet, quantite: entier(v) || 0 })).filter((x) => x.quantite > 0)
        const id = `prevu-${Date.now()}`
        confier('fabrication', { missive: numero, note, sorties: [{ objet: recette.produit, quantite: q }], entrees: prises }, (dd) => ({
          ...dd,
          mouvements: [
            ...dd.mouvements,
            ...prises.map((p) => prevu(env, { action: id, missive: numero, type: 'fabrication', objet: p.objet, quantite: -p.quantite, note })),
            prevu(env, { action: id, missive: numero, type: 'fabrication', objet: recette.produit, quantite: q, note }),
          ],
        }))
      }}
    >
      <p className="fiche-note">Prends les matières dans le coffre, façonne, et repose l&apos;ouvrage : ce qu&apos;il vaut de plus que ses matières est porté à ton crédit.</p>
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Ouvrage</span>
          <select value={produit} onChange={(ev) => setProduit(ev.target.value)}>
            {recettes.map((r) => (
              <option key={r.produit} value={r.produit}>{r.produit}</option>
            ))}
          </select>
        </label>
        <label className="fiche-champ">
          <span>Fournées</span>
          <input type="text" inputMode="numeric" value={fournees} onChange={(ev) => setFournees(ev.target.value.replace(/\D/g, '').slice(0, 5))} title={recette ? `Une fournée donne ${recette.rendement} ${recette.produit}` : undefined} />
        </label>
      </div>
      {recette ? (
        <>
          <p className="fiche-sous-titre">Mis au coffre</p>
          <label className="fiche-releve-ligne fiche-plain">
            <span>{recette.produit}</span>
            <span className="fiche-signe">+</span>
            <input type="text" inputMode="numeric" value={sortie} onChange={(ev) => setSortie(ev.target.value.replace(/\D/g, '').slice(0, 7))} aria-label={`Quantité de ${recette.produit} façonnée`} />
          </label>
          <p className="fiche-sous-titre">Pris dans le coffre</p>
          <div className="fiche-releve">
            {recette.ingredients.map((i) => {
              const dispo = auCoffre(env.reg, i.nom)
              const q = entier(entrees[i.nom] ?? '') || 0
              return (
                <label key={i.nom} className={`fiche-releve-ligne fiche-plain ${q > dispo ? 'ecart' : ''}`}>
                  <span>{i.nom}</span>
                  <span className="fiche-signe">−</span>
                  <input type="text" inputMode="numeric" value={entrees[i.nom] ?? ''} onChange={(ev) => setEntrees({ ...entrees, [i.nom]: ev.target.value.replace(/[^\d.,]/g, '').slice(0, 8) })} aria-label={`Quantité de ${i.nom} prise`} />
                  {q > dispo && <em className="fiche-ecart">le registre n&apos;en compte que {quantite(dispo)} au coffre</em>}
                </label>
              )
            })}
          </div>
          <label className="fiche-champ">
            <span>Note</span>
            <input type="text" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={200} placeholder="facultative" />
          </label>
        </>
      ) : (
        <p className="fiche-note">Choisis un ouvrage dont la recette est consignée.</p>
      )}
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller icones={env.icones} disabled={!recette}>Façonner</Sceller>
      </div>
    </form>
  )
}

/* ───────────────────────── Closing: delivered, or given up ───────────────────────── */

/**
 * « Livrer la missive »: the requested goods still owed leave the chest for the client, the reward is
 * shared, the missive is closed (livrée). « Abandonner la missive »: closed without being completed
 * (inachevée), a reason and a reward both optional.
 */
function FormCloture({ env, numero, livrer }: { env: Env; numero: string; livrer: boolean }) {
  const e = useMissive(env, numero)
  const [recompense, setRecompense] = useState('')
  const [pc, setPc] = useState(String(PART_COMMUNE_DEFAUT))
  const [note, setNote] = useState('')
  const [confirmer, setConfirmer] = useState(false)
  const { etat, message, envoyer } = useEnvoi(env)
  useEffect(() => {
    if (!confirmer) return
    const t = setTimeout(() => setConfirmer(false), 4000)
    return () => clearTimeout(t)
  }, [confirmer])
  if (!e) return null
  const nb = env.reg.r.donnees?.nbMembres ?? 0
  const r = Math.max(0, entier(recompense) || 0)
  const p = partager(r, Math.min(100, Math.max(0, entier(pc) || 0)), nb, e.contributions)
  const autres = Math.max(0, nb - p.parts.length)
  return (
    <form
      className="fiche-form"
      onSubmit={(ev) => {
        ev.preventDefault()
        if (!confirmer) return setConfirmer(true)
        setConfirmer(false)
        envoyer('cloture', { missive: numero, issue: livrer ? 'livree' : 'inachevee', recompense: recompense || (livrer ? '' : '0'), partCommune: pc, note }, () => env.fermer())
      }}
    >
      {livrer ? (
        <>
          <p className="fiche-note">Les ouvrages quittent le coffre pour {e.missive.commanditaire || 'le commanditaire'} ; la récompense reçue est partagée et la missive est close.</p>
          <div className="fiche-releve">
            <div className="fiche-releve-entete">
              <span>Ouvrage</span>
              <span>Au coffre</span>
              <span>Livré</span>
            </div>
            {e.lignes.map((l) => {
              const dispo = auCoffre(env.reg, l.produit)
              return (
                <div key={l.produit} className={`fiche-releve-ligne fiche-plain ${l.reste > dispo ? 'ecart' : ''}`}>
                  <span>{l.produit}</span>
                  <span className="fiche-releve-attendu">{quantite(dispo)}</span>
                  <strong className="fiche-livre">{quantite(l.reste)}</strong>
                  {l.reste > dispo && <em className="fiche-ecart">le registre n&apos;en compte que {quantite(dispo)} au coffre</em>}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <p className="fiche-note">La missive n&apos;a pu être menée à bien : elle est close, inachevée. Si le commanditaire a tout de même payé quelque chose, inscris-le : il sera partagé de même.</p>
          <label className="fiche-champ">
            <span>Raison</span>
            <input type="text" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={200} placeholder="facultative" />
          </label>
        </>
      )}
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Récompense</span>
          <input type="text" inputMode="numeric" value={recompense} onChange={(ev) => setRecompense(ev.target.value.replace(/[^\d]/g, '').slice(0, 9))} placeholder={livrer ? 'septims reçus' : '0'} required={livrer} />
        </label>
        <label className="fiche-champ">
          <span>Part commune</span>
          <span className="fiche-unite">
            <input type="text" inputMode="numeric" value={pc} onChange={(ev) => setPc(ev.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="Part commune, en centièmes" />%
          </span>
        </label>
      </div>
      {r > 0 && (
        <div className="fiche-partage">
          <p>
            Part commune : <strong>{prix(p.base * p.nbMembres)}</strong> septims, soit <strong>{prix(p.base)}</strong> à chacun des {p.nbMembres} membres.
          </p>
          <p>
            Au mérite : <strong>{prix(p.merite)}</strong> septims, selon la valeur apportée.
          </p>
          {p.parts.length > 0 ? (
            <div className="fiche-parts">
              {p.parts.map((x) => (
                <div key={x.membre} className="fiche-part">
                  <span>{x.membre}</span>
                  <span className="fiche-part-detail">
                    {prix(x.base)} + {prix(x.merite)}
                  </span>
                  <strong>{prix(x.total)}</strong>
                </div>
              ))}
              {autres > 0 && (
                <div className="fiche-part autres">
                  <span>Les {autres} autres membres</span>
                  <span className="fiche-part-detail">chacun</span>
                  <strong>{prix(p.base)}</strong>
                </div>
              )}
            </div>
          ) : (
            <p>
              <em>Nulle patte n&apos;a porté cette missive : tout ira en parts égales.</em>
            </p>
          )}
        </div>
      )}
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller etat={etat} icones={env.icones} confirmer={confirmer}>
          {confirmer ? 'Vraiment ? Le registre sera scellé' : livrer ? 'Livrer et partager' : 'Clore, inachevée'}
        </Sceller>
      </div>
    </form>
  )
}
