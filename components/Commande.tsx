'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Article } from '@/lib/types'
import { prix } from '@/lib/format'
import { calculerLigne, centimes, LIBELLES_STATUT, lirePrix, statut, type CommandeEnvoyee, type LigneCommande } from '@/lib/commande'
import { Icone } from './Ornements'

/*
 * Order mode. Desktop: a paper strip lies on the table under the search field; clicking it carries
 * the order sheet onto the left page of the open book. While the sheet is out, clicking a row of a
 * price ledger writes the article on it. Mobile: the strip is folded at the bottom of the screen.
 * The order lives in localStorage until it is sealed (sent to /api/commande) or thrown away.
 */

const CLE_COMMANDE = 'caravane.commande'
const CLE_VENDEUR = 'caravane.vendeur'
const DUREE_DEROULE = 950
const DUREE_CONFIRMATION = 3500

export type Message = { genre: 'ok' | 'erreur' | 'conseil'; texte: string }

function lire<T>(cle: string): T | null {
  try {
    const v = window.localStorage.getItem(cle)
    return v === null ? null : (JSON.parse(v) as T)
  } catch {
    return null
  }
}

function ecrire(cle: string, v: unknown) {
  try {
    if (v === null) window.localStorage.removeItem(cle)
    else window.localStorage.setItem(cle, JSON.stringify(v))
  } catch {
    // Private window or blocked storage: the order simply lives as long as the page.
  }
}

const prixSaisi = (v: number | null) => (v === null ? '' : String(v).replace('.', ','))

/** Line maths for display; `null` total while the unit price is not readable. */
export function calculer(l: LigneCommande) {
  const p = lirePrix(l.prix)
  return p === null ? null : calculerLigne(l.qte, p, l.min, l.max)
}

export function useCommande() {
  const [lignes, setLignes] = useState<LigneCommande[]>([])
  const [ouverte, setOuverte] = useState(false)
  const [deployee, setDeployee] = useState(false)
  const [vendeur, setVendeur] = useState('')
  const [message, setMessage] = useState<Message | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [pret, setPret] = useState(false)
  const [nouvelle, setNouvelle] = useState<{ id: string; n: number } | null>(null)
  /** The next sheet mount unrolls from the strip (not on reload). */
  const deroule = useRef(false)
  const lignesRef = useRef(lignes)
  lignesRef.current = lignes

  useEffect(() => {
    const c = lire<{ lignes?: LigneCommande[]; ouverte?: boolean }>(CLE_COMMANDE)
    if (c && Array.isArray(c.lignes)) setLignes(c.lignes.filter((l) => l && typeof l.id === 'string'))
    if (c?.ouverte) setOuverte(true)
    setVendeur(lire<string>(CLE_VENDEUR) ?? '')
    setPret(true)
  }, [])
  useEffect(() => {
    if (pret) ecrire(CLE_COMMANDE, lignes.length || ouverte ? { lignes, ouverte } : null)
  }, [lignes, ouverte, pret])
  useEffect(() => {
    if (pret) ecrire(CLE_VENDEUR, vendeur || null)
  }, [vendeur, pret])

  useEffect(() => {
    if (message?.genre !== 'ok' && message?.genre !== 'conseil') return
    const t = setTimeout(() => setMessage(null), message.genre === 'ok' ? 6000 : 4200)
    return () => clearTimeout(t)
  }, [message])

  /** Writes an article on the order (+1 if already there). Returns the new quantity. */
  const ajouter = useCallback((a: Article): number => {
    const deja = lignesRef.current.find((l) => l.id === a.id)
    const qte = deja && !deja.rayee ? deja.qte + 1 : 1
    setLignes((ls) =>
      ls.some((l) => l.id === a.id)
        ? ls.map((l) => (l.id === a.id ? { ...l, qte: l.rayee ? 1 : l.qte + 1, rayee: false } : l))
        : [...ls, { id: a.id, fr: a.fr, en: a.en, min: a.min, max: a.max, qte: 1, prix: prixSaisi(a.max), rayee: false }],
    )
    setNouvelle({ id: a.id, n: Date.now() })
    setMessage((m) => (m?.genre === 'erreur' ? m : null))
    return qte
  }, [])

  const regler = useCallback((id: string, patch: Partial<LigneCommande>) => {
    setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }, [])

  const ouvrir = useCallback(() => {
    deroule.current = true
    setMessage(null)
    setOuverte(true)
  }, [])
  const ranger = useCallback(() => {
    setOuverte(false)
    setDeployee(false)
  }, [])
  const jeter = useCallback(() => {
    setLignes([])
    setMessage({ genre: 'conseil', texte: 'La feuille part au feu. Une autre attend sous la plume.' })
  }, [])

  const sceller = useCallback(async () => {
    const actives = lignesRef.current.filter((l) => !l.rayee)
    if (!vendeur.trim()) return setMessage({ genre: 'erreur', texte: 'Qui tient la plume ? Inscris le nom du vendeur.' })
    if (!actives.length) return setMessage({ genre: 'erreur', texte: 'Une commande sans article ne se scelle pas.' })
    if (actives.some((l) => lirePrix(l.prix) === null)) {
      return setMessage({ genre: 'erreur', texte: 'Un article attend encore son prix. Fixe-le avant de sceller.' })
    }
    const envoyee: CommandeEnvoyee = {
      vendeur: vendeur.trim(),
      lignes: actives.map((l) => ({ id: l.id, article: l.fr, articleEn: l.en, quantite: l.qte, prixUnitaire: lirePrix(l.prix)!, min: l.min, max: l.max })),
    }
    setEnvoi(true)
    setMessage(null)
    try {
      const rep = await fetch('/api/commande', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envoyee) })
      const r = (await rep.json().catch(() => null)) as { ok?: boolean; message?: string; numero?: string } | null
      if (!rep.ok || !r?.ok) {
        setMessage({ genre: 'erreur', texte: r?.message ?? "Le coursier n'est pas revenu. Ta commande reste sur la table : réessaie." })
        return
      }
      setLignes([])
      setMessage({ genre: 'ok', texte: `Marché conclu, l'encre sèche dans le registre.${r.numero ? ` (n° ${r.numero})` : ''}` })
    } catch {
      setMessage({ genre: 'erreur', texte: "Le coursier n'est pas revenu. Ta commande reste sur la table : réessaie." })
    } finally {
      setEnvoi(false)
    }
  }, [vendeur])

  return { lignes, ouverte, deployee, setDeployee, vendeur, setVendeur, message, envoi, pret, nouvelle, deroule, ajouter, regler, ouvrir, ranger, jeter, sceller }
}

export type EtatCommande = ReturnType<typeof useCommande>

/** Totals over the lines still standing (struck lines and unpriced lines count for nothing). */
export function bilan(lignes: LigneCommande[]) {
  const calc = lignes.filter((l) => !l.rayee).map(calculer).filter((c): c is NonNullable<typeof c> => c !== null)
  const total = centimes(calc.reduce((t, c) => t + c.total, 0))
  const totalMini = centimes(calc.reduce((t, c) => t + c.totalMini, 0))
  const totalIdeal = centimes(calc.reduce((t, c) => t + c.totalIdeal, 0))
  const actives = lignes.filter((l) => !l.rayee)
  return { total, totalMini, totalIdeal, statut: statut(total, totalMini, totalIdeal), articles: actives.reduce((t, l) => t + l.qte, 0), lignes: actives.length }
}

const CLASSES_STATUT = { 'à perte': 'perte', honnête: 'honnete', 'excellente affaire': 'excellente', négocié: 'negocie' } as const

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/* ─────────────────────────── Desktop strip on the table ─────────────────────────── */

export function BandeCommande({ c, bande, icones }: { c: EtatCommande; bande: RefObject<HTMLButtonElement | null>; icones: Record<string, string> }) {
  const b = bilan(c.lignes)
  const [revenue, setRevenue] = useState(false)
  const avant = useRef(c.ouverte)
  useEffect(() => {
    if (avant.current && !c.ouverte) setRevenue(true)
    avant.current = c.ouverte
  }, [c.ouverte])
  return (
    <button
      ref={bande}
      type="button"
      className={`commande-bande ${c.ouverte ? 'emportee' : ''} ${revenue ? 'revenue' : ''} ${c.pret ? '' : 'en-attente'}`}
      onClick={c.ouvrir}
      tabIndex={c.ouverte ? -1 : 0}
      aria-hidden={c.ouverte}
      title="Préparer une commande"
    >
      <span className="commande-bande-sceau" aria-hidden>
        <Icone corps={icones['tied-scroll']} />
      </span>
      <span className="commande-bande-texte">
        <span className="commande-bande-titre">
          <span className="long">{c.lignes.length ? 'Reprendre la commande' : 'Préparer une commande'}</span>
          <span className="court">Commande</span>
        </span>
        {c.lignes.length > 0 && (
          <span className="commande-bande-sous">
            <span className="long">{pluriel(b.lignes, 'ligne')} · </span>
            {prix(b.total)} septims
          </span>
        )}
      </span>
    </button>
  )
}

/* ─────────────────────────── The order sheet ─────────────────────────── */

export function FeuilleCommande({
  c,
  icones,
  mobile,
  bande,
  sansAnimation,
}: {
  c: EtatCommande
  icones: Record<string, string>
  mobile: boolean
  bande?: RefObject<HTMLElement | null>
  sansAnimation: boolean
}) {
  const feuille = useRef<HTMLElement>(null)
  const rouleau = useRef<HTMLDivElement>(null)
  const [confirmer, setConfirmer] = useState(false)
  const [repli, setRepli] = useState(false)
  const b = bilan(c.lignes)

  useEffect(() => {
    if (!confirmer) return
    const t = setTimeout(() => setConfirmer(false), DUREE_CONFIRMATION)
    return () => clearTimeout(t)
  }, [confirmer])

  /** Keyframes carrying the sheet from the strip (desktop) and unrolling it down the page. */
  const animations = useCallback((): Animation[] | null => {
    const el = feuille.current
    const src = bande?.current?.getBoundingClientRect()
    if (!el || !src || !src.width || mobile || sansAnimation) return null
    const r = el.getBoundingClientRect()
    const s = src.width / r.width
    const dx = src.left - r.left
    const dy = src.top - r.top
    const bord = Math.max(0, r.height - src.height / s)
    const temps: KeyframeAnimationOptions = { duration: DUREE_DEROULE, fill: 'both' }
    const anims = [
      el.animate(
        [
          { offset: 0, transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(3deg)`, clipPath: `inset(0 0 ${bord}px 0)`, easing: 'cubic-bezier(.3,.1,.25,1)' },
          { offset: 0.48, transform: 'translate(0, 0) scale(1) rotate(0deg)', clipPath: `inset(0 0 ${bord}px 0)`, easing: 'cubic-bezier(.45,.05,.3,1)' },
          { offset: 1, transform: 'translate(0, 0) scale(1) rotate(0deg)', clipPath: 'inset(0 0 0px 0)' },
        ],
        temps,
      ),
    ]
    if (rouleau.current) {
      anims.push(
        rouleau.current.animate(
          [
            { offset: 0, transform: `translateY(${r.height - bord}px)`, opacity: 1 },
            { offset: 0.48, transform: `translateY(${r.height - bord}px)`, opacity: 1, easing: 'cubic-bezier(.45,.05,.3,1)' },
            { offset: 0.94, transform: `translateY(${r.height - 4}px)`, opacity: 1 },
            { offset: 1, transform: `translateY(${r.height - 4}px)`, opacity: 0 },
          ],
          temps,
        ),
      )
    }
    return anims
  }, [bande, mobile, sansAnimation])

  useLayoutEffect(() => {
    if (!c.deroule.current) return
    c.deroule.current = false
    animations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const replier = () => {
    if (mobile) return c.setDeployee(false)
    const anims = animations()
    if (!anims) return c.ranger()
    setRepli(true)
    anims.forEach((a) => a.reverse())
    Promise.all(anims.map((a) => a.finished)).then(() => c.ranger(), () => {})
  }

  return (
    <aside
      ref={feuille}
      className={`commande-feuille ${mobile ? 'mobile' : ''} ${repli ? 'repli' : ''}`}
      aria-label="Bon de commande"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="commande-rouleau" ref={rouleau} aria-hidden />
      <span className="commande-clou" aria-hidden />
      <header className="commande-tete">
        <div className="commande-surtitre">Caravane des Lunes Itinérantes</div>
        <h2 className="commande-titre">Bon de commande</h2>
        <button type="button" className="commande-replier" onClick={replier} title={mobile ? 'Replier la feuille' : 'Replier la feuille sur la table'}>
          Replier
        </button>
      </header>

      <label className="commande-vendeur">
        <span>Vendeur</span>
        <input
          type="text"
          value={c.vendeur}
          maxLength={80}
          onChange={(e) => c.setVendeur(e.target.value)}
          placeholder="Qui tient la plume ?"
          autoComplete="off"
        />
      </label>

      <div className="commande-lignes">
        {c.lignes.length === 0 ? (
          <p className="commande-vide">
            {mobile
              ? 'Replie la feuille et touche un article du registre : Khajiit l’inscrira ici.'
              : 'Désigne un article dans le registre de droite : Khajiit l’inscrira ici.'}
          </p>
        ) : (
          c.lignes.map((l) => <LigneFeuille key={l.id} l={l} c={c} icones={icones} nouvelle={c.nouvelle?.id === l.id ? c.nouvelle.n : 0} />)
        )}
      </div>

      <footer className="commande-pied">
        <div className="commande-totaux">
          <span>
            Total mini <b>{prix(b.totalMini)}</b>
          </span>
          <span>
            Total idéal <b>{prix(b.totalIdeal)}</b>
          </span>
        </div>
        <div className="commande-total">
          <span className="commande-total-mot">Total</span>
          <span className="commande-total-points" aria-hidden />
          <strong>{prix(b.total)}</strong>
          <span className="commande-total-unite">septims</span>
        </div>
        {b.lignes > 0 && b.total > 0 && <div className={`commande-statut statut-${CLASSES_STATUT[b.statut]}`}>{LIBELLES_STATUT[b.statut]}</div>}
        {c.message && (
          <p className={`commande-message ${c.message.genre}`} role={c.message.genre === 'erreur' ? 'alert' : 'status'}>
            {c.message.texte}
          </p>
        )}
        <div className="commande-actions">
          <button
            type="button"
            className={`commande-jeter ${confirmer ? 'confirmer' : ''}`}
            disabled={!c.lignes.length || c.envoi}
            onClick={() => {
              if (!confirmer) return setConfirmer(true)
              setConfirmer(false)
              c.jeter()
            }}
          >
            {confirmer ? 'Vraiment ? Au feu !' : 'Jeter la commande'}
          </button>
          <button type="button" className="commande-sceller" disabled={c.envoi} onClick={c.sceller}>
            <span className="commande-cire" aria-hidden>
              <Icone corps={icones['wax-seal']} />
            </span>
            {c.envoi ? 'Le coursier part…' : 'Sceller la commande'}
          </button>
        </div>
      </footer>
    </aside>
  )
}

function LigneFeuille({ l, c, icones, nouvelle }: { l: LigneCommande; c: EtatCommande; icones: Record<string, string>; nouvelle: number }) {
  const calc = calculer(l)
  const [qte, setQte] = useState(String(l.qte))
  useEffect(() => setQte(String(l.qte)), [l.qte])
  const ref = useRef<HTMLDivElement>(null)

  // Fresh ink when the article is written or its quantity grows from the ledger.
  useEffect(() => {
    if (!nouvelle || !ref.current) return
    ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    ref.current.classList.remove('encre-fraiche')
    void ref.current.offsetWidth
    ref.current.classList.add('encre-fraiche')
  }, [nouvelle])

  const fixerQte = (v: number) => c.regler(l.id, { qte: Math.max(1, Math.min(9999, Math.round(v) || 1)) })
  const sansPrix = lirePrix(l.prix) === null

  return (
    <div ref={ref} className={`commande-ligne ${l.rayee ? 'rayee' : ''}`}>
      <div className="commande-ligne-nom">
        <span className="fr">{l.fr}</span>
        <span className="repere">
          {l.min === null && l.max === null ? 'à négocier' : `plancher ${prix(l.min)} · plafond ${prix(l.max)}`}
        </span>
      </div>
      <button
        type="button"
        className="commande-rayer"
        onClick={() => c.regler(l.id, { rayee: !l.rayee })}
        title={l.rayee ? 'Rétablir la ligne' : 'Rayer la ligne'}
        aria-label={l.rayee ? `Rétablir ${l.fr}` : `Rayer ${l.fr}`}
      >
        {l.rayee ? 'rétablir' : <Icone corps={icones['quill']} />}
      </button>
      <div className="commande-calcul">
        <span className="commande-qte">
          <button type="button" aria-label="Un de moins" disabled={l.rayee || l.qte <= 1} onClick={() => fixerQte(l.qte - 1)}>
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={qte}
            disabled={l.rayee}
            aria-label={`Quantité de ${l.fr}`}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4)
              setQte(v)
              if (Number(v) >= 1) c.regler(l.id, { qte: Number(v) })
            }}
            onBlur={() => fixerQte(Number(qte))}
          />
          <button type="button" aria-label="Un de plus" disabled={l.rayee} onClick={() => fixerQte(l.qte + 1)}>
            +
          </button>
        </span>
        <span className="signe">×</span>
        <input
          className={`commande-prix ${sansPrix ? 'a-fixer' : ''}`}
          type="text"
          inputMode="decimal"
          value={l.prix}
          disabled={l.rayee}
          placeholder="prix ?"
          aria-label={`Prix unitaire de ${l.fr}`}
          onChange={(e) => c.regler(l.id, { prix: e.target.value.replace(/[^\d.,]/g, '').slice(0, 10) })}
        />
        <span className="signe">=</span>
        <span className="commande-ligne-total">{calc ? prix(calc.total) : '—'}</span>
      </div>
      {!l.rayee && calc?.sousPlancher && <p className="commande-alerte">Sous le plancher — Khajiit y perd sa fourrure !</p>}
      {!l.rayee && sansPrix && <p className="commande-alerte douce">À négocier : inscris le prix convenu.</p>}
    </div>
  )
}

/* ─────────────────────────── Mobile: the strip folded at the bottom ─────────────────────────── */

export function BarreCommande({ c, icones }: { c: EtatCommande; icones: Record<string, string> }) {
  const b = bilan(c.lignes)
  const [pouce, setPouce] = useState<{ texte: string; n: number } | null>(null)

  useEffect(() => {
    if (!c.nouvelle || !c.ouverte || c.deployee) return
    const l = c.lignes.find((x) => x.id === c.nouvelle!.id)
    if (!l) return
    setPouce({ texte: `${l.qte > 1 ? `+1 · ${l.qte}×` : 'Inscrit :'} ${l.fr}`, n: c.nouvelle.n })
    const t = setTimeout(() => setPouce(null), 1600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.nouvelle])

  if (!c.pret) return null
  if (!c.ouverte) {
    return (
      <button type="button" className="commande-barre au-repos" onClick={c.ouvrir}>
        <Icone corps={icones['tied-scroll']} />
        <span>{c.lignes.length ? `Reprendre la commande · ${prix(b.total)} septims` : 'Préparer une commande'}</span>
      </button>
    )
  }
  return (
    <div className={`commande-barre ouverte ${pouce ? 'pouce' : ''}`} key={pouce?.n}>
      <button type="button" className="commande-barre-ranger" onClick={c.ranger} aria-label="Ranger la commande (les lignes sont gardées)">
        Ranger
      </button>
      <button type="button" className="commande-barre-deplier" onClick={() => c.setDeployee(true)} aria-expanded={c.deployee}>
        <Icone corps={icones['tied-scroll']} />
        <span className="commande-barre-texte">
          {pouce ? (
            <em>{pouce.texte}</em>
          ) : c.lignes.length ? (
            <>Commande · {pluriel(b.articles, 'article')}</>
          ) : (
            <em>Touche un article pour l’inscrire</em>
          )}
        </span>
        <strong>{prix(b.total)}</strong>
        <span className="commande-barre-fleche" aria-hidden>
          ▴
        </span>
      </button>
    </div>
  )
}
