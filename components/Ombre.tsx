'use client'

import { createContext, useContext, useRef } from 'react'
import { CLICS_SECRET, DELAI_CLICS, DEVISE_JOUR, DEVISE_OMBRE, MOT_SECRET } from '@/lib/ombre'

/*
 * The « Livre d'ombre »: its motto, the ink effects of its reveal and their SVG filters (ported from the
 * approved prototype, _atelier/caravane/ombre-samples: ink A, darkness B). The sequence itself is run by
 * Grimoire.tsx, which owns the pages and their turning. Animations: transform, opacity, filter, text- and
 * box-shadow only, through the Web Animations API, cancellable.
 */

export type EtatOmbre = 'jour' | 'ombre'

export type CtxOmbre = {
  etat: EtatOmbre
  /** The motto reads « Septims, Septims, Septims » (from beat 1 until the book is closed). */
  septims: boolean
  /** A sequence is running (no second one, no clicks counted). */
  joue: boolean
  /** Five clicks on « Honnêteté »: the motto element where it happened. */
  ouvrir: (devise: HTMLElement) => void
  /** The inverted emblem was touched: back to the day book. */
  fermer: () => void
}

export const OmbreContexte = createContext<CtxOmbre>({ etat: 'jour', septims: false, joue: false, ouvrir: () => {}, fermer: () => {} })
export const useOmbre = () => useContext(OmbreContexte)

/**
 * « Fidélité, Honnêteté, Septims ». Five clicks on « Honnêteté » (a pause over 3 s starts over), with no
 * feedback before the fifth, open the shadow book. Each word sits in its own slot (an inline grid) so a
 * word can be re-inked in place without moving its neighbours.
 */
export function Devise({ className }: { className?: string }) {
  const o = useOmbre()
  const ref = useRef<HTMLParagraphElement>(null)
  const clics = useRef({ n: 0, t: 0 })
  const mots = o.septims ? DEVISE_OMBRE : DEVISE_JOUR
  const compter = () => {
    if (o.joue || o.septims || o.etat !== 'jour' || !ref.current) return
    const t = performance.now()
    if (t - clics.current.t > DELAI_CLICS) clics.current.n = 0
    clics.current.t = t
    if (++clics.current.n >= CLICS_SECRET) {
      clics.current.n = 0
      o.ouvrir(ref.current)
    }
  }
  return (
    <p ref={ref} className={`devise ${className ?? ''}`} data-devise>
      {mots.map((m, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <span className="pivot" data-mot={i}>
            <span className={`mot ancien ${o.septims ? 'rouge' : ''}`} onClick={i === MOT_SECRET ? compter : undefined}>
              {m}
            </span>
          </span>
        </span>
      ))}
    </p>
  )
}

/* ───────────────────────── Ink ───────────────────────── */

/** The ink filters (feather the glyphs, then re-form them). Each has a twin: Safari repaints an HTML
 *  element only when the filter it references changes, so the element alternates between the two. */
export function FiltresOmbre() {
  const filtre = (id: string, seed: number, x: 'R' | 'G', y: 'R' | 'G') => (
    <filter id={id} x="-40%" y="-120%" width="180%" height="340%">
      <feTurbulence data-r="t" type="fractalNoise" baseFrequency="0.09 0.14" numOctaves={3} seed={seed} result="bruit" />
      <feDisplacementMap data-r="d" in="SourceGraphic" in2="bruit" scale="0" xChannelSelector={x} yChannelSelector={y} result="dep" />
      <feGaussianBlur data-r="b" in="dep" stdDeviation="0" />
    </filter>
  )
  return (
    <svg width="0" height="0" className="filtres-ombre" aria-hidden focusable="false">
      <defs>
        {filtre('f-dissout', 7, 'R', 'G')}
        {filtre('f-dissout-b', 7, 'R', 'G')}
        {filtre('f-forme', 19, 'G', 'R')}
        {filtre('f-forme-b', 19, 'G', 'R')}
        <filter id="f-brule" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves={3} seed={9} result="bruit" />
          <feDisplacementMap in="SourceGraphic" in2="bruit" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  )
}

function regler(id: string, r: string, attr: string, v: string | number) {
  for (const f of [document.getElementById(id), document.getElementById(`${id}-b`)]) f?.querySelector(`[data-r="${r}"]`)?.setAttribute(attr, String(v))
}
function reinitFiltres() {
  for (const id of ['f-dissout', 'f-forme']) {
    regler(id, 'd', 'scale', 0)
    regler(id, 'b', 'stdDeviation', 0)
  }
}

/** A run that can be cancelled: every wait checks it is still the current one. */
export class Annule extends Error {}
export type Course = { vivant: () => boolean }
const verifier = (c: Course) => {
  if (!c.vivant()) throw new Annule()
}
export const pause = async (c: Course, ms: number) => {
  await new Promise((r) => setTimeout(r, ms))
  verifier(c)
}
export const fin = async (c: Course, a: Animation | Animation[]) => {
  await (Array.isArray(a) ? Promise.all(a.map((x) => x.finished)) : a.finished)
  verifier(c)
}
const image = (c: Course, ms: number, f: (t: number) => void) =>
  new Promise<void>((res, rej) => {
    const t0 = performance.now()
    const pas = (now: number) => {
      if (!c.vivant()) return rej(new Annule())
      const t = Math.min(1, (now - t0) / ms)
      f(t)
      if (t < 1) requestAnimationFrame(pas)
      else res()
    }
    requestAnimationFrame(pas)
  })

/** The element's own ink colour at a given alpha. */
const encreDe = (el: Element, a: number) => {
  const [r, g, b] = (getComputedStyle(el).color.match(/[\d.]+/g) ?? ['42', '24', '11']).map(Number)
  return `rgba(${r},${g},${b},${a})`
}
/** Wet ink soaking in: a tight halo in the text's own colour (≤ ~5 px), peaking at 30–55 %, then thinning. */
function haloEncre(el: HTMLElement, duree: number) {
  const c = (a: number) => encreDe(el, a)
  return el.animate(
    [
      { textShadow: `0 0 0px ${c(0)}, 0 0 0px ${c(0)}` },
      { offset: 0.3, textShadow: `0 0 1.5px ${c(0.8)}, 0 0 4px ${c(0.6)}` },
      { offset: 0.55, textShadow: `0 0 2px ${c(0.65)}, 0 0 5px ${c(0.5)}` },
      { textShadow: `0 0 3px ${c(0)}, 0 0 6px ${c(0)}` },
    ],
    { duration: duree, easing: 'linear', fill: 'forwards' },
  )
}

const ROUGE = '#c8101c'

/**
 * Re-inks the words of the motto in place (ink A): each word of `indices` turns red, feathers out and
 * « Septims » condenses in its slot (held at the wider width, then closing gently onto the new word);
 * the words already reading « Septims » just turn red.
 */
export async function encrerDevise(c: Course, devise: HTMLElement, calme: boolean) {
  const pivots = Array.from(devise.querySelectorAll<HTMLElement>('.pivot'))
  const mots = pivots.map((p) => p.querySelector<HTMLElement>('.ancien')!)
  const changer = pivots.filter((p) => p.textContent !== 'Septims')
  const rester = pivots.filter((p) => p.textContent === 'Septims').map((p) => p.querySelector<HTMLElement>('.ancien')!)
  const nouveaux = changer.map((p) => {
    const n = document.createElement('span')
    n.className = 'mot nouveau'
    n.textContent = 'Septims'
    n.style.opacity = '0'
    p.append(n)
    return n
  })
  const largeurs = changer.map((p, i) => {
    const w0 = p.querySelector('.ancien')!.getBoundingClientRect().width
    const w1 = nouveaux[i].getBoundingClientRect().width
    p.style.width = `${Math.max(w0, w1)}px`
    return { fente: Math.max(w0, w1), w1 }
  })
  const anciens = changer.map((p) => p.querySelector<HTMLElement>('.ancien')!)
  if (calme) {
    await fin(c, [
      ...anciens.map((a) => a.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' })),
      ...nouveaux.map((n) => n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' })),
      ...rester.map((m) => m.animate([{ color: getComputedStyle(m).color }, { color: ROUGE }], { duration: 400, fill: 'forwards' })),
    ])
    return
  }
  // The words turn red first.
  await fin(c, mots.map((m) => m.animate([{ color: getComputedStyle(m).color }, { color: ROUGE }], { duration: 320, easing: 'ease-out', fill: 'forwards' })))
  await pause(c, 60)
  anciens.forEach((a) => haloEncre(a, 1100))
  rester.forEach((m) => haloEncre(m, 1100))
  let k = 0
  await image(c, 900, (t) => {
    k ^= 1
    for (const a of anciens) a.style.filter = `url(#f-dissout${k ? '-b' : ''})`
    for (const n of nouveaux) n.style.filter = `url(#f-forme${k ? '-b' : ''})`
    const a = Math.min(1, t / 0.55)
    const e = 1 - (1 - a) * (1 - a)
    regler('f-dissout', 'd', 'scale', (e * 5).toFixed(2))
    regler('f-dissout', 'b', 'stdDeviation', (e * 0.8).toFixed(2))
    for (const x of anciens) x.style.opacity = String(1 - a * a)
    const f = Math.max(0, (t - 0.35) / 0.65)
    const g = f * f * (3 - 2 * f)
    regler('f-forme', 'd', 'scale', ((1 - g) * 6).toFixed(2))
    regler('f-forme', 'b', 'stdDeviation', ((1 - g) * 1.4).toFixed(2))
    for (const n of nouveaux) n.style.opacity = String(g)
  })
  for (const x of [...anciens, ...nouveaux]) x.style.filter = ''
  reinitFiltres()
  anciens.forEach((a) => (a.style.visibility = 'hidden'))
  await pause(c, 120)
  // The slots close gently onto « Septims » (no jump of the line).
  await fin(
    c,
    changer.flatMap((p, i) =>
      Math.abs(largeurs[i].fente - largeurs[i].w1) < 0.5 ? [] : [p.animate([{ width: `${largeurs[i].fente}px` }, { width: `${largeurs[i].w1}px` }], { duration: 560, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' })],
    ),
  )
}

/**
 * All the text of a page diffuses at once in its own ink (ink A): a dense halo soaks out around the glyphs
 * while the letters feather, then the residue fades. Nothing grows past the text by more than ~5 px.
 */
export async function dissoudre(c: Course, els: HTMLElement[], duree = 1700) {
  const anims = els.flatMap((e) => [
    haloEncre(e, duree),
    e.animate([{ opacity: 1 }, { offset: 0.3, opacity: 0.92 }, { offset: 0.55, opacity: 0.6 }, { opacity: 0 }], { duration: duree, easing: 'linear', fill: 'forwards' }),
  ])
  let k = 0
  await Promise.all([
    fin(c, anims),
    image(c, duree, (t) => {
      k ^= 1
      const a = Math.min(1, t / 0.4)
      const e = 1 - (1 - a) * (1 - a)
      regler('f-dissout', 'd', 'scale', (e * 4 + t * 1.5).toFixed(2))
      regler('f-dissout', 'b', 'stdDeviation', (e * 0.5 + t * 0.6).toFixed(2))
      for (const el of els) el.style.filter = `url(#f-dissout${k ? '-b' : ''})`
    }),
  ])
  reinitFiltres()
}

/** A page's text written in, every block at the same moment (a pen stroke from the left). */
export function ecrire(c: Course, els: HTMLElement[], duree: number) {
  return fin(
    c,
    els.map((e) =>
      e.animate(
        [
          { opacity: 0, clipPath: 'inset(-20% 100% -20% 0)' },
          { offset: 0.25, opacity: 1 },
          { opacity: 1, clipPath: 'inset(-20% 0% -20% 0)' },
        ],
        { duration: duree, easing: 'cubic-bezier(.35,.1,.35,1)', fill: 'backwards' },
      ),
    ),
  )
}

/** The text blocks of the pages on display (headings, paragraphs, lists, folios…). */
export function blocsTexte(racine: Element): HTMLElement[] {
  const sel = [
    '.en-tete > .surtitre',
    '.en-tete .titre-page',
    '.en-tete > .sous-titre',
    '.en-tete > .fleuron',
    '.en-tete > :not(.surtitre):not(.titre-ligne):not(.sous-titre):not(.fleuron)',
    '.devise',
    '.maxime',
    '.prose > *',
    '.defile > :not(.en-tete)',
    '.folio',
  ].join(', ')
  const tous = Array.from(racine.querySelectorAll<HTMLElement>(sel)).filter((e) => !e.closest('.fiche') && (e.textContent?.trim() || e.querySelector('svg')))
  // Each block once: none inside another one already taken.
  return tous.filter((e) => !tous.some((x) => x !== e && x.contains(e)))
}
