import { useId } from 'react'
import type { Artisan } from '@/lib/types'
import { EMBLEME_TRACE, EMBLEME_VIEWBOX } from '@/lib/embleme'
import { ARTISANS, ICONES_ARTISANS } from '@/lib/recherche'

/** A game-icons.net glyph (512×512, filled with currentColor). */
export function Icone({ corps, className }: { corps?: string; className?: string }) {
  if (!corps) return null
  return <svg className={`icone ${className ?? ''}`} viewBox="0 0 512 512" aria-hidden dangerouslySetInnerHTML={{ __html: corps }} />
}

export function GlypheArtisan({ artisan, icones }: { artisan: Artisan; icones: Record<string, string> }) {
  return (
    <span className={`glyphe glyphe-${artisan}`} title={ARTISANS[artisan]}>
      <Icone corps={icones[ICONES_ARTISANS[artisan]]} />
      <span className="visuellement-cache">{ARTISANS[artisan]}</span>
    </span>
  )
}

/** The caravan's emblem, gilded: gold leaf gradient, a dark tooled outline and a soft relief. */
export function Embleme({ taille = 48, className }: { taille?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const [, , l, h] = EMBLEME_VIEWBOX.split(' ').map(Number)
  return (
    <svg className={`embleme ${className ?? ''}`} width={(taille * l) / h} height={taille} viewBox={EMBLEME_VIEWBOX} aria-hidden>
      <defs>
        <linearGradient id={`${id}-or`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#fff2c4" />
          <stop offset="22%" stopColor="#e9c470" />
          <stop offset="48%" stopColor="#b8862f" />
          <stop offset="62%" stopColor="#f2d58c" />
          <stop offset="80%" stopColor="#9c6f24" />
          <stop offset="100%" stopColor="#dcb565" />
        </linearGradient>
        <filter id={`${id}-relief`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="flou" />
          <feSpecularLighting in="flou" surfaceScale="6" specularConstant="0.9" specularExponent="24" lightingColor="#fff6d8" result="reflet">
            <feDistantLight azimuth="235" elevation="48" />
          </feSpecularLighting>
          <feComposite in="reflet" in2="SourceAlpha" operator="in" result="refletForme" />
          <feComposite in="SourceGraphic" in2="refletForme" operator="arithmetic" k2="1" k3="0.6" />
        </filter>
      </defs>
      <path
        d={EMBLEME_TRACE}
        fill={`url(#${id}-or)`}
        fillRule="evenodd"
        stroke="#4a3010"
        strokeOpacity="0.55"
        strokeWidth="4"
        filter={`url(#${id}-relief)`}
      />
    </svg>
  )
}

export function Fleuron({ className }: { className?: string }) {
  return (
    <svg className={`fleuron ${className ?? ''}`} viewBox="0 0 240 24" aria-hidden>
      <path d="M10 12H92M148 12H230" stroke="currentColor" strokeWidth=".9" />
      <path d="M18 9.5H86M154 9.5H222" stroke="currentColor" strokeWidth=".5" opacity=".6" />
      <path
        d="M92 12c5-7 13-8 20-3c3 2 5 3 8 3s5-1 8-3c7-5 15-4 20 3c-5 7-13 8-20 3c-3-2-5-3-8-3s-5 1-8 3c-7 5-15 4-20-3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path d="M120 4l3 8l-3 8l-3-8z" fill="currentColor" />
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="235" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

/** Brass corner guard of the binding. Drawn for the top-left corner; CSS mirrors it for the others. */
export function CoinLaiton({ className }: { className: string }) {
  return (
    <svg className={`laiton ${className}`} viewBox="0 0 80 80" aria-hidden>
      <defs>
        <linearGradient id="laiton-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f6dc95" />
          <stop offset="35%" stopColor="#c99a3e" />
          <stop offset="70%" stopColor="#8a6320" />
          <stop offset="100%" stopColor="#5b3f12" />
        </linearGradient>
        <radialGradient id="rivet-g" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fff1c2" />
          <stop offset="60%" stopColor="#b98a35" />
          <stop offset="100%" stopColor="#4f360d" />
        </radialGradient>
      </defs>
      <path d="M0 0H80C74 4 68 6 60 8C46 12 38 14 30 22C22 30 14 38 10 52C8 60 6 70 0 80Z" fill="url(#laiton-g)" stroke="#3b2608" strokeWidth="1.2" />
      <path d="M8 8H58C48 12 36 16 28 26C20 34 14 44 10 58Z" fill="none" stroke="#fbe7ad" strokeOpacity=".55" strokeWidth="1" />
      <path d="M8 8C20 14 24 18 26 26" fill="none" stroke="#3b2608" strokeOpacity=".5" strokeWidth="1" />
      <circle cx="11" cy="11" r="3.4" fill="url(#rivet-g)" stroke="#3b2608" strokeWidth=".6" />
      <circle cx="40" cy="8" r="2.6" fill="url(#rivet-g)" stroke="#3b2608" strokeWidth=".6" />
      <circle cx="8" cy="40" r="2.6" fill="url(#rivet-g)" stroke="#3b2608" strokeWidth=".6" />
    </svg>
  )
}

export function Plume({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path d="M21 3C13 3.5 7.5 9 5.5 18.5M21 3c-.5 6.5-5 11-11.6 12.4M9.8 11.2l4.4.6M5.5 18.5L3 21" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
