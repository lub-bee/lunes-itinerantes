'use client'

import type { CSSProperties, ReactNode } from 'react'

/**
 * A turning leaf. It is cut into vertical strips chained from the spine; each strip is nested in the
 * previous one and rotates a little more, which bends the paper. Every strip shows its own window of
 * the full page (recto) and of the page printed on its back (verso).
 *
 * - `droit`  : a right-hand page turning forward, hinged on its left edge.
 * - `gauche` : a left-hand page turning backward, hinged on its right edge.
 * - `unique` : the single page of the narrow layout, hinged on its left edge.
 */
export type Cote = 'droit' | 'gauche' | 'unique'

export function Feuillet({
  cote,
  tranches,
  recto,
  verso,
  classeRecto,
  classeVerso,
}: {
  cote: Cote
  tranches: number
  recto: ReactNode
  verso: ReactNode
  classeRecto: string
  classeVerso: string
}) {
  const fenetre = (decalage: number, classe: string, contenu: ReactNode) => (
    <div className={`fenetre ${classe}`} style={{ '--d': decalage } as CSSProperties}>
      {contenu}
      {/* The shadow book's burn and dim light, carried by the turning leaf too (shown only in the shadow). */}
      <div className="brulure-volet" aria-hidden />
    </div>
  )
  const tranche = (k: number): ReactNode => {
    // Distance from the spine, in strips, of the window each face shows.
    const dRecto = cote === 'gauche' ? tranches - 1 - k : k
    const dVerso = cote === 'gauche' ? k : tranches - 1 - k
    return (
      <div className="tranche" data-tranche={k}>
        <div className="piece recto" data-face="recto">
          {fenetre(dRecto, classeRecto, recto)}
          <div className="ombre-pli" data-ombre />
        </div>
        <div className="piece verso" data-face="verso">
          {fenetre(dVerso, classeVerso, verso)}
          <div className="ombre-pli" data-ombre />
        </div>
        {k + 1 < tranches && tranche(k + 1)}
      </div>
    )
  }
  return (
    <div className={`volet volet-${cote}`} data-volet style={{ '--n': tranches } as CSSProperties}>
      {tranche(0)}
    </div>
  )
}

const ECHANTILLONS = 48

const lisser = (p: number) => p * p * (3 - 2 * p)

/**
 * Builds the animations of one leaf. Progress p ∈ [0,1] maps linearly to time, so a paused set of
 * animations can be driven by the pointer through `currentTime`.
 *
 * @param sens     -1 rotates toward negative angles (forward / `unique`), +1 toward positive (`gauche`).
 * @param inverse  plays the turn backward in time (the `unique` leaf coming back onto the page).
 * @param manuel   angle linear in p (the hand drives it) instead of eased.
 */
export function animerFeuillet(
  volet: HTMLElement,
  o: { sens: 1 | -1; inverse: boolean; manuel: boolean; duree: number; delai: number; z: number; souplesse: number },
): Animation[] {
  const tranches = Array.from(volet.querySelectorAll<HTMLElement>('[data-tranche]'))
  const n = tranches.length
  const cadres = tranches.map(() => [] as Keyframe[])
  const rectos = tranches.map(() => [] as Keyframe[])
  const versos = tranches.map(() => [] as Keyframe[])
  const ombres = tranches.map(() => [] as Keyframe[])

  for (let s = 0; s <= ECHANTILLONS; s++) {
    const t = s / ECHANTILLONS
    const p = o.inverse ? 1 - t : t
    const theta = o.sens * 180 * (o.manuel ? p : lisser(p))
    // The free edge leads while the page rises, then trails behind as it falls.
    const flexion = (o.sens * o.souplesse * Math.sin(2 * Math.PI * p)) / Math.max(1, n - 1)
    for (let k = 0; k < n; k++) {
      const monde = theta + k * flexion
      cadres[k].push({ transform: k === 0 ? `rotateY(${theta}deg) translateZ(${o.z}px)` : `rotateY(${flexion}deg)` })
      const face = Math.abs(monde) < 90
      rectos[k].push({ opacity: face ? 1 : 0 })
      versos[k].push({ opacity: face ? 0 : 1 })
      ombres[k].push({ opacity: 0.46 * Math.pow(Math.abs(Math.sin((monde * Math.PI) / 180)), 1.6) })
    }
  }

  const temps: KeyframeAnimationOptions = { duration: o.duree, delay: o.delai, easing: 'linear', fill: 'both' }
  return tranches.flatMap((tr, k) => {
    const [recto, verso] = Array.from(tr.children).filter((c) => (c as HTMLElement).dataset.face) as HTMLElement[]
    return [
      tr.animate(cadres[k], temps),
      recto.animate(rectos[k], temps),
      verso.animate(versos[k], temps),
      ...Array.from(recto.querySelectorAll<HTMLElement>(':scope > [data-ombre]'), (e) => e.animate(ombres[k], temps)),
      ...Array.from(verso.querySelectorAll<HTMLElement>(':scope > [data-ombre]'), (e) => e.animate(ombres[k], temps)),
    ]
  })
}

/** Shadow cast by the leaf on the pages underneath. */
export function animerPortee(el: HTMLElement, o: { duree: number; delai: number }): Animation {
  const images: Keyframe[] = []
  for (let s = 0; s <= ECHANTILLONS; s++) images.push({ opacity: 0.55 * Math.sin((Math.PI * s) / ECHANTILLONS) })
  return el.animate(images, { duration: o.duree, delay: o.delai, easing: 'linear', fill: 'both' })
}
