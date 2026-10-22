'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { EMBLEME_TRACE, EMBLEME_VIEWBOX } from '@/lib/embleme'

/*
 * What the easter eggs show over the book (triggers and texts: lib/oeufs.ts). Everything here is
 * decoration laid over the pages: pointer-events none, transform and opacity animations only, gone on
 * its own after a few seconds.
 */

export type Oeuf = { genre: 'skooma' | 'sucre' | 'genou' | 'fus' | 'lunes'; n: number; note?: string }

/** How long each egg stays (ms), before it is taken away. */
export const DUREES_OEUFS: Record<Oeuf['genre'], number> = { skooma: 11000, sucre: 6500, genou: 6500, fus: 2600, lunes: 7000 }

/** How long the skooma sways the book (ms); its note is written once the book stands still again. */
const DUREE_IVRESSE = 5600

/**
 * Skooma: the book sways like a drunkard (a slow sway, a jitter, small rotations and swells), the ink
 * blurs, its colours drift and a ghost of the page doubles it, all rising then fading smoothly. Only
 * transforms on the book and filters on the pages' content layers, through the Web Animations API
 * (gone when they end). Reduced motion: a gentle blur only.
 */
export function ivresse(livre: HTMLElement | null, calme: boolean) {
  if (!livre) return
  const contenus = Array.from(livre.querySelectorAll<HTMLElement>('.feuillets .contenu'))
  if (calme) {
    const flou = [{ filter: 'blur(0px)' }, { offset: 0.2, filter: 'blur(0.9px)' }, { offset: 0.8, filter: 'blur(0.9px)' }, { filter: 'blur(0px)' }]
    contenus.forEach((c) => c.animate(flou, { duration: 1800 }))
    return
  }
  let g = 4242
  const hasard = () => ((g = (g * 16807) % 2147483647) / 2147483647) - 0.5
  // Rises over the first 15 %, holds, and dies away over the last 30 %.
  const enveloppe = (t: number) => {
    const e = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1
    return e * e * (3 - 2 * e)
  }
  const onde = (s: number, f: number, phase = 0) => Math.sin(2 * Math.PI * f * s + phase)
  const pas = (n: number) => Array.from({ length: n + 1 }, (_, k) => ({ t: k / n, s: ((k / n) * DUREE_IVRESSE) / 1000 }))
  livre.animate(
    pas(64).map(({ t, s }) => {
      const e = enveloppe(t)
      const x = e * (11 * onde(s, 0.42) + 3.2 * hasard())
      const y = e * (4.5 * onde(s, 0.31, 1) + 2 * hasard())
      const r = e * (1.3 * onde(s, 0.37, 0.5) + 0.25 * hasard())
      const z = 1 + e * 0.02 * onde(s, 0.9)
      return { transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(${z.toFixed(4)})` }
    }),
    { duration: DUREE_IVRESSE, easing: 'linear' },
  )
  const encre = pas(32).map(({ t, s }) => {
    const e = enveloppe(t)
    const flou = e * (1.7 + 0.9 * onde(s, 0.8))
    const sature = 1 + e * (0.55 + 0.45 * onde(s, 0.5))
    const teinte = e * 32 * onde(s, 0.33)
    const dx = e * 8 * onde(s, 0.45, 2)
    const dy = e * 3 * onde(s, 0.6)
    return {
      filter: `blur(${flou.toFixed(2)}px) saturate(${sature.toFixed(2)}) hue-rotate(${teinte.toFixed(1)}deg) drop-shadow(${dx.toFixed(1)}px ${dy.toFixed(1)}px 0 rgba(80, 30, 70, ${(0.38 * e).toFixed(2)}))`,
    }
  })
  contenus.forEach((c) => c.animate(encre, { duration: DUREE_IVRESSE, easing: 'linear' }))
}

/** A note written in the margin of the right page, then fading. */
function NoteMarge({ texte, retard = 0 }: { texte: string; retard?: number }) {
  return (
    <p className="oeuf-note" role="status" style={retard ? { animationDelay: `${retard}ms` } : undefined}>
      {texte}
    </p>
  )
}

/** Fine golden flakes of moon sugar falling over the book (few, transform-only, seeded so they never jump). */
function Flocons({ sansAnimation }: { sansAnimation: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [chute, setChute] = useState(600)
  useEffect(() => {
    if (ref.current) setChute(ref.current.clientHeight + 30)
  }, [])
  const flocons = useMemo(() => {
    let g = 1234
    const h = () => (g = (g * 16807) % 2147483647) / 2147483647
    return Array.from({ length: 34 }, () => ({
      x: h() * 100,
      taille: 4 + h() * 5,
      delai: h() * 1.8,
      duree: 2.8 + h() * 1.8,
      dx: (h() - 0.5) * 80,
      rot: (h() - 0.5) * 540,
    }))
  }, [])
  return (
    <div ref={ref} className={`oeuf-flocons ${sansAnimation ? 'immobiles' : ''}`} aria-hidden>
      {flocons.map((f, i) => (
        <span
          key={i}
          style={
            {
              left: `${f.x}%`,
              top: sansAnimation ? `${(i * 37) % 90}%` : undefined,
              width: f.taille,
              height: f.taille * 0.8,
              animationDelay: `${f.delai}s`,
              animationDuration: `${f.duree}s`,
              '--dx': `${f.dx}px`,
              '--rot': `${f.rot}deg`,
              '--chute': `${chute}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

/** Bands of the emblem lit one after the other (left to right), and when the whole emblem glows. */
const BANDES = 9
const PAS_BANDE = 0.16

/**
 * The whole emblem pressed into the paper lights up (moons, star, cross, ring): a glow sweeping across
 * it band by band, held, then fading all at once. Its own outline over the relief, at the same place as
 * the pressed image (centred on the spine on a spread, on the page on a phone). Opacity only.
 */
function EmblemeIllumine() {
  const [x0, y0, l, h] = EMBLEME_VIEWBOX.split(' ').map(Number)
  const largeur = l / BANDES
  return (
    <svg className="oeuf-lunes" viewBox={EMBLEME_VIEWBOX} aria-hidden>
      <defs>
        <filter id="halo-lune" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        {Array.from({ length: BANDES }, (_, k) => (
          <clipPath key={k} id={`bande-embleme-${k}`}>
            <rect x={x0 + k * largeur - 0.5} y={y0} width={largeur + 1} height={h} />
          </clipPath>
        ))}
      </defs>
      {Array.from({ length: BANDES }, (_, k) => (
        <g key={k} clipPath={`url(#bande-embleme-${k})`} style={{ animationDelay: `${k * PAS_BANDE}s`, animationDuration: `${6.2 - k * PAS_BANDE}s` }}>
          <path d={EMBLEME_TRACE} fillRule="evenodd" className="halo" filter="url(#halo-lune)" />
          <path d={EMBLEME_TRACE} fillRule="evenodd" className="trait" />
        </g>
      ))}
    </svg>
  )
}

export function EffetsOeufs({ oeuf, sansAnimation }: { oeuf: Oeuf | null; sansAnimation: boolean }) {
  if (!oeuf) return null
  return (
    <div className={`oeufs ${sansAnimation ? 'sans-animation' : ''}`} key={oeuf.n} aria-live="polite">
      {oeuf.genre === 'sucre' && <Flocons sansAnimation={sansAnimation} />}
      {oeuf.genre === 'lunes' && <EmblemeIllumine />}
      {oeuf.note && <NoteMarge texte={oeuf.note} retard={sansAnimation ? 0 : oeuf.genre === 'skooma' ? DUREE_IVRESSE - 900 : oeuf.genre === 'lunes' ? BANDES * PAS_BANDE * 1000 : 0} />}
    </div>
  )
}
