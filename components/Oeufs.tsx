'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { EMBLEME_TRACE, EMBLEME_VIEWBOX } from '@/lib/embleme'
import { MINUIT } from '@/lib/oeufs'

/*
 * What the easter eggs show over the book (triggers and texts: lib/oeufs.ts). Everything here is
 * decoration laid over the pages: pointer-events none, transform and opacity animations only, gone on
 * its own after a few seconds.
 */

export type Oeuf = { genre: 'skooma' | 'sucre' | 'genou' | 'fus' | 'lunes'; n: number; note?: string }

/** How long each egg stays (ms), before it is taken away. */
export const DUREES_OEUFS: Record<Oeuf['genre'], number> = { skooma: 6200, sucre: 6500, genou: 6500, fus: 2600, lunes: 7000 }

/** The reader's clock reads the midnight hour (checked every minute). */
export function useMinuit(): boolean {
  const [minuit, setMinuit] = useState(false)
  useEffect(() => {
    const voir = () => setMinuit(new Date().getHours() === MINUIT.heure)
    voir()
    const t = setInterval(voir, 60_000)
    return () => clearInterval(t)
  }, [])
  return minuit
}

/** A note written in the margin of the right page, then fading. */
function NoteMarge({ texte }: { texte: string }) {
  return (
    <p className="oeuf-note" role="status">
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

/**
 * The two moons of the emblem pressed into the paper light up, Jone (left) then Jode (right): the
 * emblem's own outline, cut in halves, glowing softly over the relief (same placement as the pressed
 * image: centred on the spine on a spread, on the page on a phone).
 */
function Lunes() {
  const [x0, y0, l, h] = EMBLEME_VIEWBOX.split(' ').map(Number)
  return (
    <svg className="oeuf-lunes" viewBox={EMBLEME_VIEWBOX} aria-hidden>
      <defs>
        <filter id="halo-lune" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <clipPath id="moitie-jone">
          <rect x={x0} y={y0} width={l * 0.36} height={h} />
        </clipPath>
        <clipPath id="moitie-jode">
          <rect x={x0 + l * 0.64} y={y0} width={l * 0.36} height={h} />
        </clipPath>
      </defs>
      {(['jone', 'jode'] as const).map((lune) => (
        <g key={lune} className={`lune-${lune}`} clipPath={`url(#moitie-${lune})`}>
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
      {oeuf.genre === 'lunes' && <Lunes />}
      {oeuf.note && <NoteMarge texte={oeuf.note} />}
    </div>
  )
}
