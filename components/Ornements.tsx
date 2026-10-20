import type { Artisan } from '@/lib/types'
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

/** Masser (red, large) and Secunda (pale, small): the wandering moons of the caravan. */
export function Lunes({ taille = 48, className }: { taille?: number; className?: string }) {
  return (
    <svg className={className} width={taille} height={taille} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <mask id="croissant-masser">
          <rect width="64" height="64" fill="#fff" />
          <circle cx="34" cy="28" r="17" fill="#000" />
        </mask>
        <mask id="croissant-secunda">
          <rect width="64" height="64" fill="#fff" />
          <circle cx="50" cy="14" r="6.5" fill="#000" />
        </mask>
        <radialGradient id="lueur" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f3d27a" stopOpacity=".45" />
          <stop offset="100%" stopColor="#f3d27a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="masser" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e0694a" />
          <stop offset="100%" stopColor="#8e2416" />
        </linearGradient>
      </defs>
      <circle cx="30" cy="34" r="30" fill="url(#lueur)" />
      <circle cx="26" cy="34" r="20" fill="url(#masser)" mask="url(#croissant-masser)" />
      <circle cx="46" cy="17" r="8" fill="#ece0c4" mask="url(#croissant-secunda)" />
      <circle cx="15" cy="10" r="1.2" fill="#f3d27a" />
      <circle cx="56" cy="44" r="1" fill="#f3d27a" />
      <circle cx="40" cy="56" r=".9" fill="#f3d27a" />
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
