'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Article } from '@/lib/types'
import { prix } from '@/lib/format'
import { ARTISANS } from '@/lib/recherche'
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
  type Ressource,
} from '@/lib/missives'
import { auCoffre, idMissive, quantite, Signature, type CtxRegistre, type Fiche } from './Missives'
import { Icone } from './Ornements'

/*
 * A loose slip laid on the left page (on the whole screen on mobile): a recipe's tree, or the form
 * of one action (write a missive, count the chest, deposit, craft, deliver, close, edit a recipe or
 * a resource). It is set down with a short fall (transform and opacity only) and taken away the
 * same way; it goes when the page turns.
 */

const DUREE_DEPART = 170

export function FicheVolante({
  fiche,
  reg,
  articles,
  icones,
  mobile,
  fermer,
}: {
  fiche: Fiche
  reg: CtxRegistre
  articles: Article[]
  icones: Record<string, string>
  mobile: boolean
  fermer: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  const [vue, setVue] = useState<Fiche>(fiche)
  useEffect(() => setVue(fiche), [fiche])

  const partir = () => {
    const el = ref.current
    if (!el || el.dataset.part !== undefined) return
    el.dataset.part = ''
    setTimeout(fermer, DUREE_DEPART)
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && partir()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { surtitre, titre, corps } = contenu(vue, { reg, articles, icones, changer: setVue, fermer: partir })

  return (
    <aside ref={ref} className={`fiche ${mobile ? 'mobile' : ''}`} aria-label={titre} onPointerDown={(e) => e.stopPropagation()}>
      <svg className="fiche-defs" width="0" height="0" aria-hidden focusable="false">
        <filter id="fiche-barbes" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.08 0.06" numOctaves="3" seed="9" result="b" />
          <feDisplacementMap in="SourceGraphic" in2="b" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="fiche-papier" aria-hidden />
      <span className="fiche-epingle" aria-hidden />
      <header className="fiche-tete">
        <div className="fiche-surtitre">{surtitre}</div>
        <h2 className="fiche-titre">{titre}</h2>
        <button type="button" className="fiche-ranger" onClick={partir}>
          Ranger
        </button>
      </header>
      <div className="fiche-corps">{corps}</div>
    </aside>
  )
}

type Env = { reg: CtxRegistre; articles: Article[]; icones: Record<string, string>; changer: (f: Fiche) => void; fermer: () => void }

function contenu(f: Fiche, env: Env): { surtitre: string; titre: string; corps: ReactNode } {
  const missive = 'numero' in f && f.numero ? env.reg.r.calcul?.etats.find((e) => e.missive.numero === f.numero) : undefined
  switch (f.genre) {
    case 'recette':
      return { surtitre: 'Recette', titre: f.nom, corps: <VueRecette nom={f.nom} env={env} /> }
    case 'edition-recette':
      return { surtitre: f.nom ? 'Corriger la recette' : 'Consigner une recette', titre: f.nom || 'Nouvelle recette', corps: <Signe env={env} action="recette"><FormRecette nom={f.nom} env={env} /></Signe> }
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
    case 'abandonner':
      return { surtitre: missive?.missive.titre ?? 'Missive', titre: 'Abandonner la missive', corps: <Signe env={env} action="cloture"><FormCloture env={env} numero={f.numero} livrer={false} /></Signe> }
  }
}

/** Forms need a signed member allowed to take the action. */
function Signe({ env, action, children }: { env: Env; action: ActionRegistre; children: ReactNode }) {
  const m = env.reg.r.marchand
  if (!m?.identite) return <Signature r={env.reg.r} icones={env.icones} invite="Avant d'écrire au registre, signe de ton nom, tel que la caravane le connaît." />
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

/** Rows "name · quantity" with a quill to strike a row out and a line to add one. */
function Lignes({
  lignes,
  setLignes,
  liste,
  mot = 'Quantité',
  aide,
}: {
  lignes: Ligne[]
  setLignes: (l: Ligne[]) => void
  liste: string
  mot?: string
  aide?: (l: Ligne) => ReactNode
}) {
  const regler = (i: number, p: Partial<Ligne>) => setLignes(lignes.map((l, k) => (k === i ? { ...l, ...p } : l)))
  return (
    <div className="fiche-lignes">
      {lignes.map((l, i) => (
        <div key={i} className="fiche-ligne">
          <input type="text" list={liste} value={l.objet} onChange={(e) => regler(i, { objet: e.target.value })} placeholder="Objet" aria-label="Objet" maxLength={120} />
          <input type="text" inputMode="numeric" className="fiche-qte" value={l.qte} onChange={(e) => regler(i, { qte: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9) })} placeholder="Qté" aria-label={mot} />
          <button type="button" className="fiche-rayer" aria-label="Rayer la ligne" title="Rayer la ligne" onClick={() => setLignes(lignes.length > 1 ? lignes.filter((_, k) => k !== i) : [{ objet: '', qte: '' }])}>
            ✕
          </button>
          {aide && <p className="fiche-aide">{aide(l)}</p>}
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
  const article = env.articles.find((a) => cle(a.fr) === cle(nom))
  const [combien, setCombien] = useState(String(recette?.rendement ?? 1))
  useEffect(() => setCombien(String(recette?.rendement ?? 1)), [recette?.rendement, nom])
  if (!c || !d?.relie) return <p className="registre-ferme">Le livre des recettes n&apos;est pas encore relié au grimoire.</p>
  const valeur = c.valeur(nom)
  const droits = env.reg.r.marchand?.droits
  const n = Math.max(1, Math.min(99999, Math.round(entier(combien)) || 1))
  const cycle = recette ? trouverCycle(nom, c.recettes) : null
  return (
    <div className="vue-recette">
      {(article?.en || ressource?.en) && <p className="fiche-en">{article?.en || ressource?.en}</p>}
      {recette ? (
        <>
          <p className="fiche-note">
            Une fournée donne <strong>{quantite(recette.rendement)}</strong> {recette.produit}
            {recette.artisan && <> · {ARTISANS[recette.artisan as keyof typeof ARTISANS] ?? recette.artisan}</>}
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

function FormRecette({ nom, env }: { nom: string; env: Env }) {
  const c = env.reg.r.calcul
  const ancienne = nom ? c?.recettes.get(cle(nom)) : undefined
  const noms = useNoms(env)
  const [produit, setProduit] = useState(ancienne?.produit ?? nom)
  const [rendement, setRendement] = useState(String(ancienne?.rendement ?? 1))
  const [artisan, setArtisan] = useState(ancienne?.artisan ?? '')
  const [note, setNote] = useState(ancienne?.note ?? '')
  const [lignes, setLignes] = useState<Ligne[]>(ancienne?.ingredients.length ? ancienne.ingredients.map((i) => ({ objet: i.nom, qte: String(i.quantite) })) : [{ objet: '', qte: '' }])
  const [effacer, setEffacer] = useState(false)
  const { message, setMessage, confier } = useEnvoi(env)

  const ecrire = (ingredients: Ligne[]) => {
    const p = produit.trim()
    if (!p) return setMessage({ ok: false, texte: 'Le nom de l’ouvrage manque.' })
    const ings = remplies(ingredients).map((l) => ({ nom: l.objet.trim(), quantite: entier(l.qte) }))
    if (ings.some((i) => !(i.quantite > 0))) return setMessage({ ok: false, texte: 'Chaque matière attend une quantité plus grande que zéro.' })
    const nouvelle: Recette = { produit: p, rendement: Math.max(1, Math.round(entier(rendement)) || 1), artisan, note, ingredients: ings }
    const autres = env.reg.r.donnees?.recettes.filter((r) => cle(r.produit) !== cle(p) && (!ancienne || cle(r.produit) !== cle(ancienne.produit))) ?? []
    const cycle = ings.length ? trouverCycle(p, indexRecettes([...autres, nouvelle])) : null
    if (cycle) return setMessage({ ok: false, texte: texteCycle(cycle) })
    confier(
      'recette',
      {
        produit: p,
        ancienProduit: ancienne && cle(ancienne.produit) !== cle(p) ? ancienne.produit : undefined,
        rendement: nouvelle.rendement,
        artisan,
        note,
        ingredients: ings.map((i) => ({ nom: i.nom, quantite: String(i.quantite) })),
      },
      (d) => ({ ...d, recettes: ings.length ? [...d.recettes.filter((r) => cle(r.produit) !== cle(p) && (!ancienne || cle(r.produit) !== cle(ancienne.produit))), nouvelle] : d.recettes.filter((r) => cle(r.produit) !== cle(p)) }),
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
      <label className="fiche-champ">
        <span>Ouvrage</span>
        <input type="text" list="fiche-produits" value={produit} onChange={(e) => setProduit(e.target.value)} maxLength={120} required placeholder="Bière, Potion de soin…" />
      </label>
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Rendement</span>
          <input type="text" inputMode="numeric" value={rendement} onChange={(e) => setRendement(e.target.value.replace(/\D/g, '').slice(0, 4))} title="Unités obtenues par fournée" />
        </label>
        <label className="fiche-champ">
          <span>Artisan</span>
          <select value={artisan} onChange={(e) => setArtisan(e.target.value)}>
            <option value="">—</option>
            {Object.entries(ARTISANS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="fiche-sous-titre">Pour une fournée</p>
      <Lignes lignes={lignes} setLignes={setLignes} liste="fiche-tous" />
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
            <span>Attendu</span>
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
