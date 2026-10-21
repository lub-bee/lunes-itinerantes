'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Article } from '@/lib/types'
import { prix } from '@/lib/format'
import { ARTISANS } from '@/lib/recherche'
import {
  arbre,
  cle,
  enStock,
  PART_COMMUNE_DEFAUT,
  partager,
  rejouer,
  texteCycle,
  trouverCycle,
  type ActionRegistre,
  type Noeud,
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
      return { surtitre: missive?.missive.titre ?? 'Missive', titre: 'Déposer au coffre', corps: <Signe env={env} action="depot"><FormDepot env={env} numero={f.numero} /></Signe> }
    case 'fabrication':
      return { surtitre: missive?.missive.titre ?? 'Missive', titre: 'Façonner', corps: <Signe env={env} action="fabrication"><FormFabrication env={env} numero={f.numero} /></Signe> }
    case 'livraison':
      return { surtitre: missive?.missive.titre ?? 'Missive', titre: 'Livrer', corps: <Signe env={env} action="livraison"><FormLivraison env={env} numero={f.numero} /></Signe> }
    case 'cloture':
      return { surtitre: missive?.missive.titre ?? 'Missive', titre: 'Clore la missive', corps: <Signe env={env} action="cloture"><FormCloture env={env} numero={f.numero} /></Signe> }
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

function useEnvoi(env: Env) {
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const envoyer = async (action: ActionRegistre, corps: Record<string, unknown>, apres?: (r: { numero?: string }) => void) => {
    if (envoi) return
    setEnvoi(true)
    setMessage(null)
    const r = await env.reg.r.agir(action, corps)
    setEnvoi(false)
    setMessage({ ok: r.ok, texte: r.message })
    if (r.ok) apres?.(r)
  }
  return { envoi, message, setMessage, envoyer }
}

function Message({ m }: { m: { ok: boolean; texte: string } | null }) {
  if (!m) return null
  return (
    <p className={`message-encre ${m.ok ? 'ok' : 'erreur'}`} role={m.ok ? 'status' : 'alert'}>
      {m.texte}
    </p>
  )
}

function Sceller({ envoi, children, icones, confirmer }: { envoi: boolean; children: ReactNode; icones: Record<string, string>; confirmer?: boolean }) {
  return (
    <button type="submit" className={`commande-sceller fiche-sceller ${confirmer ? 'confirmer' : ''}`} disabled={envoi}>
      <span className="commande-cire" aria-hidden>
        <Icone corps={icones['wax-seal']} />
      </span>
      {envoi ? 'Le coursier part…' : children}
    </button>
  )
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
  const valeur = env.reg.r.calcul?.valeur(n.nom) ?? 0
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
        {valeur > 0 && <span className="branche-valeur">{prix(Math.round(valeur * n.quantite * 100) / 100)}</span>}
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
            <ul className="branches racine">
              {arbre(nom, n, c.recettes).enfants.map((e, i) => (
                <Branche key={`${e.nom}-${i}`} n={e} profondeur={0} env={env} />
              ))}
            </ul>
          )}
        </>
      ) : ressource ? (
        <p className="fiche-note">
          Matière première{ressource.categorie && <> ({ressource.categorie})</>}, que l&apos;on récolte plutôt qu&apos;on ne la façonne.
          {ressource.valeur !== null && <> Elle vaut {prix(ressource.valeur)} septims l&apos;unité.</>}
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
  const { envoi, message, envoyer } = useEnvoi(env)

  const charge = (ingredients: Ligne[]) => ({
    produit: produit.trim(),
    ancienProduit: ancienne && cle(ancienne.produit) !== cle(produit) ? ancienne.produit : undefined,
    rendement: rendement || '1',
    artisan,
    note,
    ingredients: remplies(ingredients).map((l) => ({ nom: l.objet.trim(), quantite: l.qte })),
  })
  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    envoyer('recette', charge(lignes), () => env.changer({ genre: 'recette', nom: produit.trim() }))
  }
  return (
    <form className="fiche-form" onSubmit={soumettre}>
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
            disabled={envoi}
            onClick={() => {
              if (!effacer) return setEffacer(true)
              setEffacer(false)
              envoyer('recette', { ...charge([]), ingredients: [] }, () => env.changer({ genre: 'recette', nom: ancienne.produit }))
            }}
          >
            {effacer ? 'Vraiment ? Au feu !' : 'Effacer la recette'}
          </button>
        )}
        <Sceller envoi={envoi} icones={env.icones}>Consigner la recette</Sceller>
      </div>
    </form>
  )
}

function FormRessource({ nom, env }: { nom: string; env: Env }) {
  const d = env.reg.r.donnees
  const ancienne = d?.ressources.find((r) => cle(r.nom) === cle(nom))
  const sortes = [...new Set((d?.ressources ?? []).map((r) => r.categorie).filter(Boolean))]
  const [v, setV] = useState({ nom: ancienne?.nom ?? nom, en: ancienne?.en ?? '', categorie: ancienne?.categorie ?? '', valeur: ancienne?.valeur === null || ancienne?.valeur === undefined ? '' : String(ancienne.valeur).replace('.', ','), note: ancienne?.note ?? '' })
  const { envoi, message, envoyer } = useEnvoi(env)
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
        envoyer('ressource', { ...v, ancienNom: ancienne && cle(ancienne.nom) !== cle(v.nom) ? ancienne.nom : undefined })
      }}
    >
      <Suggestions id="fiche-sortes" noms={sortes} />
      {champ('nom', 'Matière', { required: true, placeholder: 'Blé, Lavande…' })}
      {champ('en', 'Nom anglais', { placeholder: 'Wheat, Lavender…' })}
      <div className="fiche-deux">
        {champ('categorie', 'Sorte', { list: 'fiche-sortes', placeholder: 'céréale, plante…' })}
        {champ('valeur', 'Valeur', { inputMode: 'decimal', placeholder: 'septims' })}
      </div>
      {champ('note', 'Note', { placeholder: 'facultative' })}
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller envoi={envoi} icones={env.icones}>Inscrire la matière</Sceller>
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
  const { envoi, message, envoyer } = useEnvoi(env)
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
        <Sceller envoi={envoi} icones={env.icones}>Sceller la missive</Sceller>
      </div>
    </form>
  )
}

/* ───────────────────────── The chest: counting, depositing, crafting, delivering ───────────────────────── */

function FormReleve({ env, numero }: { env: Env; numero?: string }) {
  const d = env.reg.r.donnees
  const noms = useNoms(env)
  const { stock } = useMemo(() => rejouer(d?.mouvements ?? []), [d])
  // Items worth counting: what the ledger says is in the chest, and what open missives need.
  const objets = useMemo(() => {
    const m = new Map<string, string>()
    stock.forEach((s, k) => s.qte !== 0 && m.set(k, s.nom))
    for (const e of env.reg.r.calcul?.etats ?? []) {
      if (e.missive.statut === 'close' || (numero && e.missive.numero !== numero)) continue
      e.besoins.forEach((b) => m.has(cle(b.nom)) || m.set(cle(b.nom), b.nom))
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [stock, env.reg.r.calcul, numero])
  const [comptes, setComptes] = useState<Record<string, string>>({})
  const [autres, setAutres] = useState<Ligne[]>([{ objet: '', qte: '' }])
  const { envoi, message, setMessage, envoyer } = useEnvoi(env)
  return (
    <form
      className="fiche-form"
      onSubmit={(e) => {
        e.preventDefault()
        const lignes = [
          ...Object.entries(comptes).filter(([, v]) => v.trim()).map(([objet, v]) => ({ objet, compte: v })),
          ...remplies(autres).map((l) => ({ objet: l.objet, compte: l.qte })),
        ]
        if (!lignes.length) return setMessage({ ok: false, texte: 'Inscris au moins un compte : ce que tu vois dans le coffre.' })
        envoyer('releve', { missive: numero ?? '', lignes }, () => {
          setComptes({})
          setAutres([{ objet: '', qte: '' }])
        })
      }}
    >
      <Suggestions id="fiche-tous" noms={noms.tous} />
      <p className="fiche-note">Compte ce que le coffre des missives contient vraiment. Laisse vide ce que tu n&apos;as pas compté.</p>
      {objets.length > 0 && (
        <div className="fiche-releve">
          <div className="fiche-releve-entete">
            <span>Objet</span>
            <span>Registre</span>
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
        <Sceller envoi={envoi} icones={env.icones}>Consigner le relevé</Sceller>
      </div>
    </form>
  )
}

function useMissive(env: Env, numero: string) {
  return env.reg.r.calcul?.etats.find((e) => e.missive.numero === numero)
}

function FormDepot({ env, numero }: { env: Env; numero: string }) {
  const e = useMissive(env, numero)
  const noms = useNoms(env)
  const manquants = (e?.besoins ?? []).filter((b) => b.manque > 0).map((b) => b.nom)
  const [lignes, setLignes] = useState<Ligne[]>([{ objet: '', qte: '' }])
  const [note, setNote] = useState('')
  const { envoi, message, envoyer } = useEnvoi(env)
  const valeur = env.reg.r.calcul?.valeur ?? (() => 0)
  const merite = remplies(lignes).reduce((t, l) => t + (entier(l.qte) || 0) * valeur(l.objet), 0)
  return (
    <form
      className="fiche-form"
      onSubmit={(ev) => {
        ev.preventDefault()
        envoyer('depot', { missive: numero, note, lignes: remplies(lignes).map((l) => ({ objet: l.objet, quantite: l.qte })) }, () => setLignes([{ objet: '', qte: '' }]))
      }}
    >
      <Suggestions id="fiche-depot" noms={[...manquants, ...noms.tous.filter((n) => !manquants.includes(n))]} />
      <p className="fiche-note">Ce que tu poses dans le coffre des missives, matière brute ou ouvrage fini, est porté à ton crédit.</p>
      {manquants.length > 0 && <p className="fiche-note"><em>Il manque encore : {manquants.slice(0, 6).join(', ')}{manquants.length > 6 ? '…' : ''}</em></p>}
      <Lignes lignes={lignes} setLignes={setLignes} liste="fiche-depot" aide={(l) => (l.objet && valeur(l.objet) === 0 ? 'sans valeur au registre : ne pèse rien dans les parts' : null)} />
      <label className="fiche-champ">
        <span>Note</span>
        <input type="text" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={200} placeholder="facultative" />
      </label>
      {merite > 0 && <p className="fiche-merite">Mérite estimé : <strong>{prix(Math.round(merite * 100) / 100)}</strong> septims</p>}
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller envoi={envoi} icones={env.icones}>Déposer au coffre</Sceller>
      </div>
    </form>
  )
}

function FormFabrication({ env, numero }: { env: Env; numero: string }) {
  const e = useMissive(env, numero)
  const c = env.reg.r.calcul
  const recettes = useMemo(() => [...(env.reg.r.donnees?.recettes ?? [])].sort((a, b) => a.produit.localeCompare(b.produit, 'fr')), [env.reg.r.donnees])
  const conseil = e?.besoins.find((b) => b.fournees > 0 && b.niveau === 'intermediaire') ?? e?.besoins.find((b) => b.fournees > 0)
  const [produit, setProduit] = useState(conseil?.nom ?? recettes[0]?.produit ?? '')
  const recette = c?.recettes.get(cle(produit))
  const [fournees, setFournees] = useState(String(conseil && cle(conseil.nom) === cle(produit) ? conseil.fournees : 1))
  const nf = Math.max(0, Math.round(entier(fournees)) || 0)
  const [sortie, setSortie] = useState('')
  const [entrees, setEntrees] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const { envoi, message, envoyer } = useEnvoi(env)

  // A new product or a new number of crafts rewrites the quantities from the recipe.
  useEffect(() => {
    if (!recette) return
    setSortie(String(nf * recette.rendement))
    setEntrees(Object.fromEntries(recette.ingredients.map((i) => [i.nom, String(Math.round(i.quantite * nf * 1000) / 1000)])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produit, nf, recette?.rendement])

  const valeur = c?.valeur ?? (() => 0)
  const vIn = Object.entries(entrees).reduce((t, [n, q]) => t + (entier(q) || 0) * valeur(n), 0)
  const vOut = (entier(sortie) || 0) * valeur(produit)
  return (
    <form
      className="fiche-form"
      onSubmit={(ev) => {
        ev.preventDefault()
        envoyer(
          'fabrication',
          { missive: numero, note, sorties: [{ objet: produit, quantite: sortie }], entrees: Object.entries(entrees).map(([objet, q]) => ({ objet, quantite: q || '0' })) },
          () => setFournees('1'),
        )
      }}
    >
      <p className="fiche-note">Prends les matières dans le coffre, façonne, et repose l&apos;ouvrage : la valeur ajoutée est portée à ton crédit.</p>
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
          <input type="text" inputMode="numeric" value={fournees} onChange={(ev) => setFournees(ev.target.value.replace(/\D/g, '').slice(0, 5))} />
        </label>
      </div>
      {recette ? (
        <>
          <p className="fiche-sous-titre">Pris dans le coffre</p>
          <div className="fiche-releve">
            {recette.ingredients.map((i) => {
              const dispo = auCoffre(env.reg, i.nom)
              const q = entier(entrees[i.nom] ?? '') || 0
              return (
                <label key={i.nom} className={`fiche-releve-ligne ${q > dispo ? 'ecart' : ''}`}>
                  <span>{i.nom}</span>
                  <span className="fiche-releve-attendu">au coffre {quantite(dispo)}</span>
                  <input type="text" inputMode="numeric" value={entrees[i.nom] ?? ''} onChange={(ev) => setEntrees({ ...entrees, [i.nom]: ev.target.value.replace(/[^\d.,]/g, '').slice(0, 8) })} aria-label={`Quantité de ${i.nom} prise`} />
                  {q > dispo && <em className="fiche-ecart">le registre n&apos;en compte que {quantite(dispo)}</em>}
                </label>
              )
            })}
          </div>
          <p className="fiche-sous-titre">Reposé au coffre</p>
          <label className="fiche-releve-ligne">
            <span>{recette.produit}</span>
            <span className="fiche-releve-attendu">{nf} × {recette.rendement}</span>
            <input type="text" inputMode="numeric" value={sortie} onChange={(ev) => setSortie(ev.target.value.replace(/\D/g, '').slice(0, 7))} aria-label={`Quantité de ${recette.produit} façonnée`} />
          </label>
          <label className="fiche-champ">
            <span>Note</span>
            <input type="text" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={200} placeholder="facultative" />
          </label>
          <p className="fiche-merite">
            Matières {prix(Math.round(vIn * 100) / 100)} → ouvrage {prix(Math.round(vOut * 100) / 100)} : mérite <strong>{prix(Math.round(Math.max(0, vOut - vIn) * 100) / 100)}</strong> septims
          </p>
        </>
      ) : (
        <p className="fiche-note">Choisis un ouvrage dont la recette est consignée.</p>
      )}
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller envoi={envoi || !recette} icones={env.icones}>Façonner</Sceller>
      </div>
    </form>
  )
}

function FormLivraison({ env, numero }: { env: Env; numero: string }) {
  const e = useMissive(env, numero)
  const [q, setQ] = useState<Record<string, string>>(() =>
    Object.fromEntries((e?.lignes ?? []).map((l) => [l.produit, String(Math.max(0, Math.min(l.reste, auCoffre(env.reg, l.produit))) || '')])),
  )
  const [note, setNote] = useState('')
  const { envoi, message, envoyer } = useEnvoi(env)
  if (!e) return null
  return (
    <form
      className="fiche-form"
      onSubmit={(ev) => {
        ev.preventDefault()
        envoyer('livraison', { missive: numero, note, lignes: Object.entries(q).filter(([, v]) => v.trim()).map(([objet, v]) => ({ objet, quantite: v })) })
      }}
    >
      <p className="fiche-note">Les ouvrages quittent le coffre pour {e.missive.commanditaire || 'le commanditaire'}.</p>
      <div className="fiche-releve">
        <div className="fiche-releve-entete">
          <span>Ouvrage</span>
          <span>Reste · coffre</span>
          <span>Livré</span>
        </div>
        {e.lignes.map((l) => {
          const dispo = auCoffre(env.reg, l.produit)
          const n = entier(q[l.produit] ?? '') || 0
          return (
            <label key={l.produit} className={`fiche-releve-ligne ${n > dispo || n > l.reste ? 'ecart' : ''}`}>
              <span>{l.produit}</span>
              <span className="fiche-releve-attendu">
                {quantite(l.reste)} · {quantite(dispo)}
              </span>
              <input type="text" inputMode="numeric" value={q[l.produit] ?? ''} onChange={(ev) => setQ({ ...q, [l.produit]: ev.target.value.replace(/\D/g, '').slice(0, 7) })} aria-label={`Quantité de ${l.produit} livrée`} />
              {n > l.reste && <em className="fiche-ecart">plus que demandé</em>}
              {n <= l.reste && n > dispo && <em className="fiche-ecart">le registre n&apos;en compte que {quantite(dispo)} au coffre</em>}
            </label>
          )
        })}
      </div>
      <label className="fiche-champ">
        <span>Note</span>
        <input type="text" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={200} placeholder="facultative" />
      </label>
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller envoi={envoi} icones={env.icones}>Livrer</Sceller>
      </div>
    </form>
  )
}

function FormCloture({ env, numero }: { env: Env; numero: string }) {
  const e = useMissive(env, numero)
  const [recompense, setRecompense] = useState('')
  const [pc, setPc] = useState(String(PART_COMMUNE_DEFAUT))
  const [confirmer, setConfirmer] = useState(false)
  const { envoi, message, envoyer } = useEnvoi(env)
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
        envoyer('cloture', { missive: numero, recompense, partCommune: pc })
      }}
    >
      <p className="fiche-note">La récompense reçue est partagée : une part commune égale pour chaque membre de la caravane, le reste au mérite de chacun.</p>
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Récompense</span>
          <input type="text" inputMode="numeric" value={recompense} onChange={(ev) => setRecompense(ev.target.value.replace(/[^\d]/g, '').slice(0, 9))} placeholder="septims" required />
        </label>
        <label className="fiche-champ">
          <span>Part commune</span>
          <span className="fiche-unite">
            <input type="text" inputMode="numeric" value={pc} onChange={(ev) => setPc(ev.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="Part commune, en centièmes" />
            %
          </span>
        </label>
      </div>
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
          <p><em>Nulle patte n&apos;a porté cette missive : tout ira en parts égales.</em></p>
        )}
      </div>
      <Message m={message} />
      <div className="fiche-pied">
        <Sceller envoi={envoi} icones={env.icones} confirmer={confirmer}>
          {confirmer ? 'Vraiment ? Le registre sera scellé' : 'Clore et partager'}
        </Sceller>
      </div>
    </form>
  )
}
