import type { Artisan } from '@/lib/types'
import { ARTISANS } from '@/lib/recherche'

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
      </defs>
      <circle cx="30" cy="34" r="30" fill="url(#lueur)" />
      <circle cx="26" cy="34" r="20" fill="#c0492f" mask="url(#croissant-masser)" />
      <circle cx="46" cy="17" r="8" fill="#e9dcc0" mask="url(#croissant-secunda)" />
      <circle cx="15" cy="10" r="1.2" fill="#f3d27a" />
      <circle cx="56" cy="44" r="1" fill="#f3d27a" />
      <circle cx="40" cy="56" r=".9" fill="#f3d27a" />
    </svg>
  )
}

export function Fleuron({ className }: { className?: string }) {
  return (
    <svg className={`fleuron ${className ?? ''}`} viewBox="0 0 240 20" aria-hidden>
      <path d="M8 10H96M144 10H232" stroke="currentColor" strokeWidth="1" />
      <path d="M96 10c6-8 14-8 24 0c10 8 18 8 24 0c-6 -8 -14 -8 -24 0c-10 8 -18 8 -24 0z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="120" cy="10" r="2.4" fill="currentColor" />
      <circle cx="4" cy="10" r="1.6" fill="currentColor" />
      <circle cx="236" cy="10" r="1.6" fill="currentColor" />
    </svg>
  )
}

const TRACES: Record<Artisan, string> = {
  alchimiste: 'M9.5 3h5M10.5 3v5.5L5.2 17.6A2.2 2.2 0 0 0 7.1 21h9.8a2.2 2.2 0 0 0 1.9-3.4L13.5 8.5V3M7.5 14h9',
  forgeron: 'M13.5 4.5l6 6-2.6 2.6-6-6zM11.6 8.4L3.5 16.5l4 4 8.1-8.1M15 3l1.5-1.5M21 9l1.5-1.5',
  couturier: 'M19.5 3.5L5 18M17 3.2a1.8 1.8 0 1 1 3.8 3.8M5 18c-1.6 1.6-2.6 2.2-2 3s2.8-.3 4.4-2.2c1.8-2.1 4-1.8 4.6.2',
  divers: 'M9 4h6l-1.4 3.2C17 8.4 19.5 11.8 19.5 15A5 5 0 0 1 14.5 20h-5A5 5 0 0 1 4.5 15c0-3.2 2.5-6.6 5.9-7.8zM9.5 13.5h5M12 11v5',
}

export function SceauArtisan({ artisan }: { artisan: Artisan }) {
  return (
    <span className={`sceau sceau-${artisan}`} title={ARTISANS[artisan]}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={TRACES[artisan]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="visuellement-cache">{ARTISANS[artisan]}</span>
    </span>
  )
}

export function Plume({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path d="M21 3C13 3.5 7.5 9 5.5 18.5M21 3c-.5 6.5-5 11-11.6 12.4M9.8 11.2l4.4.6M5.5 18.5L3 21" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
