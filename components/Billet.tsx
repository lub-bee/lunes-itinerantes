'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Ri'Oblan's note (lib/billets.ts, app/api/billet/route.ts): once per opening of the grimoire (a page load), a small
// slip pinned over the book that must be crumpled before anything else. The texts come from the server, which answers
// Dar'Riyo's Discord seal only, by its user ID (and a tester's with `?billet` in the address); for anyone else the route answers 404 and
// nothing shows. The order: every note read once, in a random order, then a new round (kept in this browser).

type Billet = { id: number; texte: string }
/** `reste`: the notes not yet read in this round; `dernier`: the last one read (never the first of the next round). */
type Tour = { reste: number[]; dernier: number | null }

const CLE_TOUR = 'caravane-billets'
const DUREE_FROISSE = 320

function lireTour(): Tour | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_TOUR) ?? 'null') as Partial<Tour> | null
    if (!v || !Array.isArray(v.reste)) return null
    return { reste: v.reste.filter((x): x is number => typeof x === 'number'), dernier: typeof v.dernier === 'number' ? v.dernier : null }
  } catch {
    return null
  }
}

function ecrireTour(t: Tour): boolean {
  try {
    localStorage.setItem(CLE_TOUR, JSON.stringify(t))
    return true
  } catch {
    return false
  }
}

const auHasard = <T,>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)]

/** The note to show: one not yet read in this round (a new round when all were); at random when nothing can be kept. */
function choisir(billets: Billet[]): Billet {
  const ids = billets.map((b) => b.id)
  const tour = lireTour()
  if (!tour) return auHasard(billets)
  let reste = tour.reste.filter((id) => ids.includes(id))
  if (!reste.length) {
    // A new round: every note again.
    reste = ids
    ecrireTour({ reste, dernier: tour.dernier })
  }
  // The first of a round is never the one just read (while a round is whole, e.g. its first note left open).
  const candidats = reste.length === ids.length && ids.length > 1 ? reste.filter((id) => id !== tour.dernier) : reste
  const id = auHasard(candidats)
  return billets.find((b) => b.id === id) ?? auHasard(billets)
}

/** A note counts as read once crumpled: it leaves the round. */
function lu(billets: Billet[], id: number) {
  const tour = lireTour() ?? { reste: billets.map((b) => b.id), dernier: null }
  ecrireTour({ reste: tour.reste.filter((x) => x !== id), dernier: id })
}

/** The text and its signature (« — Un Admirateur SECRET »), set apart at the foot of the slip. */
function scinder(texte: string): [string, string | null] {
  const i = texte.indexOf(' — ')
  return i < 0 ? [texte, null] : [texte.slice(0, i), texte.slice(i + 1)]
}

/**
 * `pret`: the reader is known (the /api/marchand answer came); `discord`: their seal is a Discord one (a password
 * session never gets a note: no request). The route is asked once per page load.
 */
export default function Billet({ pret, discord }: { pret: boolean; discord: boolean }) {
  const [billets, setBillets] = useState<Billet[] | null>(null)
  const [billet, setBillet] = useState<Billet | null>(null)
  const [froisse, setFroisse] = useState(false)
  const demande = useRef(false)
  const fermer = useRef<HTMLButtonElement>(null)
  const avant = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!pret || !discord || demande.current) return
    let apercu = false
    try {
      apercu = new URLSearchParams(window.location.search).has('billet')
    } catch {
      // No address to read: no preview.
    }
    demande.current = true
    fetch(`/api/billet${apercu ? '?billet' : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { billets?: Billet[] } | null) => {
        const l = (j?.billets ?? []).filter((b) => typeof b?.id === 'number' && typeof b?.texte === 'string')
        if (!l.length) return
        avant.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setBillets(l)
        setBillet(choisir(l))
      })
      .catch(() => {})
  }, [pret, discord])

  useEffect(() => {
    if (billet) fermer.current?.focus({ preventScroll: true })
  }, [billet])

  const froisser = useCallback(() => {
    if (!billet || !billets || froisse) return
    lu(billets, billet.id)
    const fin = () => {
      setBillet(null)
      setFroisse(false)
      avant.current?.focus?.({ preventScroll: true })
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return fin()
    setFroisse(true)
    window.setTimeout(fin, DUREE_FROISSE)
  }, [billet, billets, froisse])

  // Escape crumples it; Tab stays on the slip (its only control); nothing reaches the book underneath.
  useEffect(() => {
    if (!billet) return
    const touche = (e: KeyboardEvent) => {
      // Stopped at the window's capture: the book's own keys (arrows, search…) never run; Enter / Space still press the
      // button (its default action is left alone).
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        froisser()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        fermer.current?.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', touche, true)
    return () => window.removeEventListener('keydown', touche, true)
  }, [billet, froisser])

  if (!billet) return null
  const [corps, signature] = scinder(billet.texte)
  return createPortal(
    <div className={`billet-voile ${froisse ? 'froisse' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="billet" role="dialog" aria-modal="true" aria-labelledby="billet-texte">
        <div className="billet-papier" aria-hidden />
        <span className="billet-epingle" aria-hidden />
        <button ref={fermer} type="button" className="billet-froisser" aria-label="Froisser le billet" title="Froisser le billet" onClick={froisser}>
          ×
        </button>
        <p className="billet-texte" id="billet-texte">
          {corps}
        </p>
        {signature && <p className="billet-signature">{signature}</p>}
      </div>
    </div>,
    document.body,
  )
}
