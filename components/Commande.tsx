'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Article } from '@/lib/types'
import { prix } from '@/lib/format'
import { calculerLigne, centimes, LIBELLES_STATUT, lirePrix, statut, type CommandeEnvoyee, type LigneCommande } from '@/lib/commande'
import { Icone } from './Ornements'

/*
 * Order mode. Desktop: a rolled scroll lies on the table under the search field; clicking it unrolls
 * the order sheet onto the left page of the open book. While the sheet is out, clicking a row of a
 * price ledger writes the article on it; when a page turns, the sheet is lifted aside onto the table
 * and laid back once the leaf has landed. Mobile: the scroll lies rolled at the bottom of the screen.
 * The order lives in localStorage until it is sealed (sent to /api/commande) or thrown away. The
 * seller's typed name is kept in localStorage and in a cookie set by /api/marchand (Safari wipes
 * script storage after 7 days without a visit; a server cookie lasts).
 */

const CLE_COMMANDE = 'caravane.commande'
const CLE_VENDEUR = 'caravane.vendeur'
const DUREE_DEROULE = 1050
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
  /** Seller known from the session (Discord): their name signs the order and is not editable. */
  const [membre, setMembre] = useState<string | null>(null)
  /** The next sheet mount unrolls from the scroll on the table (not on reload). */
  const deroule = useRef(false)
  const lignesRef = useRef(lignes)
  lignesRef.current = lignes
  /** Seller name last known to be in the cookie (avoids posting it back unchanged). */
  const vendeurServeur = useRef<string | null>(null)

  useEffect(() => {
    const c = lire<{ lignes?: LigneCommande[]; ouverte?: boolean }>(CLE_COMMANDE)
    if (c && Array.isArray(c.lignes)) setLignes(c.lignes.filter((l) => l && typeof l.id === 'string'))
    if (c?.ouverte) setOuverte(true)
    const local = lire<string>(CLE_VENDEUR)
    if (local) setVendeur(local)
    setPret(true)
    fetch('/api/marchand')
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { discord?: boolean; nom?: string; vendeur?: string } | null) => {
        if (r?.discord && r.nom) setMembre(r.nom)
        // Local storage wiped (Safari, cleared site data): the cookie still knows the seller.
        else if (!local && r?.vendeur) {
          vendeurServeur.current = r.vendeur
          setVendeur((v) => v || r.vendeur!)
        }
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (pret) ecrire(CLE_COMMANDE, lignes.length || ouverte ? { lignes, ouverte } : null)
  }, [lignes, ouverte, pret])
  // The seller's name stays until it is edited: browser storage at once, the cookie shortly after.
  useEffect(() => {
    if (!pret || membre) return
    ecrire(CLE_VENDEUR, vendeur.trim() ? vendeur : null)
    const nom = vendeur.trim()
    if (nom === (vendeurServeur.current ?? '')) return
    const t = setTimeout(() => {
      vendeurServeur.current = nom
      fetch('/api/marchand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendeur: nom }) }).catch(() => {})
    }, 700)
    return () => clearTimeout(t)
  }, [vendeur, pret, membre])

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
    const signe = membre ?? vendeur.trim()
    if (!signe) return setMessage({ genre: 'erreur', texte: 'Qui tient la plume ? Inscris le nom du vendeur.' })
    if (!actives.length) return setMessage({ genre: 'erreur', texte: 'Une commande sans article ne se scelle pas.' })
    if (actives.some((l) => lirePrix(l.prix) === null)) {
      return setMessage({ genre: 'erreur', texte: 'Un article attend encore son prix. Fixe-le avant de sceller.' })
    }
    const envoyee: CommandeEnvoyee = {
      vendeur: signe,
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
  }, [vendeur, membre])

  return { membre, lignes, ouverte, deployee, setDeployee, vendeur, setVendeur, message, envoi, pret, nouvelle, deroule, ajouter, regler, ouvrir, ranger, jeter, sceller }
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

/* ─────────────────────────── Desktop: the rolled scroll on the table ─────────────────────────── */

/**
 * A scroll lying on the table, its free end unrolled away from the reader: the label is written on
 * that flat end, the roll itself (spiral ends, red ribbon, wax seal) lies nearest the reader.
 */
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
      className={`commande-bande ${c.ouverte ? 'emportee' : ''} ${revenue ? 'revenue' : ''} ${c.pret ? '' : 'en-attente'} ${c.lignes.length ? 'avec-lignes' : ''}`}
      onClick={c.ouvrir}
      tabIndex={c.ouverte ? -1 : 0}
      aria-hidden={c.ouverte}
      title={c.lignes.length ? 'Reprendre la commande' : 'Préparer une commande'}
    >
      <span className="rouleau-feuille">
        <span className="commande-bande-titre">
          <span className="long">{c.lignes.length ? 'Reprendre la commande' : 'Préparer une commande'}</span>
          <span className="court">Commande</span>
        </span>
      </span>
      <span className="rouleau-cylindre" data-cylindre>
        <span className="rouleau-lien" aria-hidden />
        {c.lignes.length > 0 && (
          <span className="commande-bande-sous">
            <span className="long">{pluriel(b.lignes, 'ligne')} · </span>
            {prix(b.total)} septims
          </span>
        )}
      </span>
      <span className="commande-bande-sceau" aria-hidden>
        <Icone corps={icones['wax-seal']} />
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
  ecartee = null,
}: {
  c: EtatCommande
  icones: Record<string, string>
  mobile: boolean
  bande?: RefObject<HTMLElement | null>
  sansAnimation: boolean
  /**
   * A page is turning: the sheet is lifted off the left page onto the table, then laid back after
   * `retour` ms (as soon as the leaf has cleared the left page), or when the prop goes back to null
   * (hand-dragged turns: once the leaf has snapped). The object must be stable for one turn.
   */
  ecartee?: { retour: number | null } | null
}) {
  const feuille = useRef<HTMLElement>(null)
  const voile = useRef<HTMLDivElement>(null)
  const corps = useRef<HTMLDivElement>(null)
  const rouleau = useRef<HTMLDivElement>(null)
  const ombre = useRef<HTMLDivElement>(null)
  const lien = useRef<HTMLSpanElement>(null)
  const [confirmer, setConfirmer] = useState(false)
  const b = bilan(c.lignes)

  useEffect(() => {
    if (!confirmer) return
    const t = setTimeout(() => setConfirmer(false), DUREE_CONFIRMATION)
    return () => clearTimeout(t)
  }, [confirmer])

  // Lifted aside / laid back through a data attribute toggled on the element itself: no React render
  // in the middle of a page turn, and the CSS transitions (transform only) run on the compositor.
  useLayoutEffect(() => {
    const el = feuille.current
    if (!el || mobile) return
    if (!ecartee) {
      delete el.dataset.ecartee
      return
    }
    el.dataset.ecartee = ''
    if (ecartee.retour === null) return
    const t = setTimeout(() => delete el.dataset.ecartee, ecartee.retour)
    return () => clearTimeout(t)
  }, [ecartee, mobile])

  /** Animations of the unroll in flight (cancelled when a new one starts). */
  const enCours = useRef<Animation[]>([])

  /**
   * Keyframes carrying the scroll from the table (desktop) and unrolling it down the page: the sheet
   * flies at the scale of the scroll on the table, only its unrolled end showing above the roll; then
   * the roll travels down the page, thinner and thinner, and the paper appears behind it.
   *
   * Transforms and opacity only, so the compositor plays it at full frame rate. The reveal is a
   * counter-translation: the veil (clipping its content, the roll hung at its bottom edge) slides
   * down from above while the paper inside slides up by the same amount and so stays still. Veil,
   * paper and roll share the same keyframe offsets and easings: the roll sits on the paper's edge at
   * every frame by construction.
   */
  const animations = useCallback((enroule = false): Animation[] | null => {
    const el = feuille.current
    const btn = bande?.current
    const src = btn?.getBoundingClientRect()
    const cyl = btn?.querySelector('[data-cylindre]')?.getBoundingClientRect()
    if (!el || !voile.current || !corps.current || !rouleau.current || !src || !cyl || !src.width || mobile || sansAnimation) return null
    enCours.current.forEach((a) => a.cancel())
    const r = el.getBoundingClientRect()
    const largeur = el.offsetWidth
    const hauteur = el.offsetHeight
    const s = src.width / largeur
    const dx = src.left - r.left
    const dy = src.top - r.top
    // Unrolled end on the table, then the roll, both in sheet pixels.
    const bout = Math.max(12, (cyl.top - src.top) / s)
    const epais0 = Math.max(16, cyl.height / s)
    const epais1 = 15
    // The roll is laid out once at a middle thickness, then only scaled.
    const epais = Math.round(Math.sqrt(epais0 * epais1))
    rouleau.current.style.height = `${epais}px`
    // Hung at the veil's bottom edge, the paper entering it a little below its top (scaled from there).
    rouleau.current.style.top = `calc(100% - ${(epais * 0.18).toFixed(2)}px)`
    const cache = hauteur - bout
    // Rolling back plays the same keyframes in reverse (a positive rate, so it stays on the compositor).
    const temps: KeyframeAnimationOptions = { duration: DUREE_DEROULE, fill: 'both', direction: enroule ? 'reverse' : 'normal' }
    const vol = 'cubic-bezier(.3,.1,.25,1)'
    const deroule = 'cubic-bezier(.45,.05,.3,1)'
    const pose = 'translate(0, 0) scale(1) rotate(0deg)'
    // A data attribute, not a class: React rewrites className on every render (e.g. « Rouler »).
    el.dataset.deroule = ''
    const glisse = (y0: number) => [
      { offset: 0, transform: `translateY(${y0}px)` },
      { offset: 0.44, transform: `translateY(${y0}px)`, easing: deroule },
      { offset: 1, transform: 'translateY(0px)' },
    ]
    const anims = [
      el.animate(
        [
          { offset: 0, transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-1deg)`, easing: vol },
          { offset: 0.44, transform: pose },
          { offset: 1, transform: pose },
        ],
        temps,
      ),
      voile.current.animate(glisse(-cache), temps),
      corps.current.animate(glisse(cache), temps),
      rouleau.current.animate(
        [
          { offset: 0, transform: `scaleY(${epais0 / epais})`, opacity: 1 },
          { offset: 0.44, transform: `scaleY(${epais0 / epais})`, opacity: 1, easing: deroule },
          { offset: 0.94, opacity: 1 },
          { offset: 1, transform: `scaleY(${epais1 / epais})`, opacity: 0 },
        ],
        temps,
      ),
    ]
    if (ombre.current) {
      anims.push(
        ombre.current.animate(
          [
            { offset: 0, opacity: 0 },
            { offset: 0.88, opacity: 0 },
            { offset: 1, opacity: 1 },
          ],
          temps,
        ),
      )
    }
    if (lien.current) {
      anims.push(
        lien.current.animate(
          [
            { offset: 0, opacity: 1 },
            { offset: 0.36, opacity: 1 },
            { offset: 0.5, opacity: 0 },
            { offset: 1, opacity: 0 },
          ],
          temps,
        ),
      )
    }
    enCours.current = anims
    return anims
  }, [bande, mobile, sansAnimation])

  /** Once unrolled, the sheet goes back to its plain CSS (no clip, no held keyframes). */
  const deroule = (anims: Animation[]) =>
    Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (enCours.current !== anims) return
        anims.forEach((a) => a.cancel())
        enCours.current = []
        delete feuille.current?.dataset.deroule
      },
      () => {},
    )

  useLayoutEffect(() => {
    if (!c.deroule.current) return
    c.deroule.current = false
    const anims = animations()
    if (anims) deroule(anims)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const replier = () => {
    if (mobile) return c.setDeployee(false)
    const anims = animations(true)
    if (!anims) return c.ranger()
    Promise.all(anims.map((a) => a.finished)).then(() => enCours.current === anims && c.ranger(), () => {})
  }

  return (
    <aside
      ref={feuille}
      className={`commande-feuille ${mobile ? 'mobile' : ''}`}
      aria-label="Bon de commande"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Rough deckled edge of the rag paper (applied to the paper layer only, the ink stays crisp). */}
      <svg className="commande-defs" width="0" height="0" aria-hidden focusable="false">
        <filter id="commande-barbes" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09 0.07" numOctaves="3" seed="5" result="b" />
          <feDisplacementMap in="SourceGraphic" in2="b" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="commande-ombre" ref={ombre} aria-hidden />
      <div className="commande-voile" ref={voile}>
      <div className="commande-masque">
      <div className="commande-corps" ref={corps}>
        <div className="commande-papier" aria-hidden />
        <span className="commande-clou" aria-hidden />
        <header className="commande-tete">
          <div className="commande-surtitre">Caravane des Lunes Itinérantes</div>
          <h2 className="commande-titre">Bon de commande</h2>
          <button type="button" className="commande-replier" onClick={replier} title={mobile ? 'Replier la feuille' : 'Rouler la feuille et la reposer sur la table'}>
            {mobile ? 'Replier' : 'Rouler'}
          </button>
        </header>

        {c.membre ? (
          <div className="commande-vendeur">
            <span>Vendeur</span>
            <strong className="commande-vendeur-nom" title="Le nom de ton sceau signe la commande">
              {c.membre}
            </strong>
          </div>
        ) : (
          <label className="commande-vendeur">
            <span>Vendeur</span>
            <input
              type="text"
              value={c.vendeur}
              maxLength={80}
              onChange={(e) => c.setVendeur(e.target.value)}
              placeholder="Qui tient la plume ?"
              autoComplete="off"
              name="vendeur"
            />
          </label>
        )}

        <div className="commande-lignes">
          {c.lignes.length === 0 ? (
            <p className="commande-vide">
              {mobile
                ? 'Replie la feuille et touche un article du registre : Khajiit l’inscrira ici.'
                : 'Désigne un article dans le registre de droite : Khajiit l’inscrira ici.'}
            </p>
          ) : (
            <>
              <div className="commande-colonnes" aria-hidden>
                <span className="col-article">Article</span>
                <span className="col-qte">Qté</span>
                <span className="col-prix">Prix</span>
                <span className="col-somme">Somme</span>
                <span />
              </div>
              {c.lignes.map((l) => (
                <LigneFeuille key={l.id} l={l} c={c} icones={icones} nouvelle={c.nouvelle?.id === l.id ? c.nouvelle.n : 0} />
              ))}
            </>
          )}
        </div>

        <footer className="commande-pied">
          <div className="commande-totaux">
            <span>
              Total mini <b>{prix(b.totalMini)}</b>
            </span>
            {b.lignes > 0 && b.total > 0 && <span className={`commande-statut statut-${CLASSES_STATUT[b.statut]}`}>{LIBELLES_STATUT[b.statut]}</span>}
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
      </div>
      </div>
      <div className="commande-rouleau" ref={rouleau} aria-hidden>
        <span className="commande-rouleau-lien" ref={lien} />
      </div>
      </div>
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
  const negocie = l.min === null && l.max === null
  const bornes = negocie ? 'à négocier' : `${prix(l.min)}–${prix(l.max)}`
  const sous = !l.rayee && calc?.sousPlancher

  return (
    <div ref={ref} className={`commande-ligne ${l.rayee ? 'rayee' : ''} ${sous ? 'sous-plancher' : ''}`}>
      <div className="commande-ligne-nom" title={`${l.fr} — ${l.en}${negocie ? ' — à négocier' : ` — plancher ${prix(l.min)}, plafond ${prix(l.max)}`}`}>
        <span className="fr">{l.fr}</span>
        <sup className="repere">{bornes}</sup>
      </div>
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
      <span className="commande-ligne-total">{calc ? prix(calc.total) : '—'}</span>
      <button
        type="button"
        className="commande-rayer"
        onClick={() => c.regler(l.id, { rayee: !l.rayee })}
        title={l.rayee ? 'Rétablir la ligne' : 'Rayer la ligne'}
        aria-label={l.rayee ? `Rétablir ${l.fr}` : `Rayer ${l.fr}`}
      >
        <Icone corps={icones['quill']} />
      </button>
      {sous && <p className="commande-alerte">sous le plancher ({prix(l.min)}) — à perte</p>}
      {!l.rayee && sansPrix && <p className="commande-alerte douce">à négocier : inscris le prix convenu</p>}
    </div>
  )
}

/* ─────────────────────────── Mobile: the scroll rolled at the bottom ─────────────────────────── */

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
