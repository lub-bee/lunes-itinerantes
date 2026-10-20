'use client'

import { useRef, useState } from 'react'
import { CoinLaiton, Embleme, Fleuron } from './Ornements'

type Etat = 'repos' | 'essai' | 'refus' | 'ouvert'

/**
 * Forged-iron look for an SVG shape: a CC0 photo of worn metal (desaturated, darkened), lit as a
 * relief. The height map mixes the blurred silhouette (bevelled edges) and the photo's own
 * luminance (pitting, rough patches).
 */
function FiltreFer({ id, l, h }: { id: string; l: number; h: number }) {
  const cote = Math.max(l, h) * 1.2
  return (
    <filter id={id} filterUnits="userSpaceOnUse" x="0" y="0" width={l} height={h} colorInterpolationFilters="sRGB">
      <feImage href="/textures/fer.jpg" x="0" y="0" width={cote} height={cote} preserveAspectRatio="xMidYMid slice" result="photo" />
      <feColorMatrix in="photo" type="saturate" values="0.12" result="gris" />
      <feComponentTransfer in="gris" result="sombre">
        <feFuncR type="linear" slope="0.62" intercept="0.02" />
        <feFuncG type="linear" slope="0.6" intercept="0.02" />
        <feFuncB type="linear" slope="0.6" intercept="0.03" />
      </feComponentTransfer>
      <feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="biseau" />
      <feColorMatrix in="photo" type="luminanceToAlpha" result="aspérités" />
      <feComposite in="biseau" in2="aspérités" operator="arithmetic" k1="0" k2="1" k3="0.45" k4="0" result="relief" />
      <feDiffuseLighting in="relief" surfaceScale="3.2" diffuseConstant="1.15" lightingColor="#f2ede4" result="diffus">
        <feDistantLight azimuth="235" elevation="42" />
      </feDiffuseLighting>
      <feSpecularLighting in="relief" surfaceScale="3.6" specularConstant="0.5" specularExponent="26" lightingColor="#e9e4da" result="reflet">
        <feDistantLight azimuth="235" elevation="42" />
      </feSpecularLighting>
      <feBlend in="sombre" in2="diffus" mode="multiply" result="eclaire" />
      <feComposite in="reflet" in2="SourceAlpha" operator="in" result="refletForme" />
      <feComposite in="eclaire" in2="refletForme" operator="arithmetic" k1="0" k2="1" k3="0.55" k4="0" result="metal" />
      <feComposite in="metal" in2="SourceAlpha" operator="in" />
    </filter>
  )
}

/**
 * Iron lock plate on the cover. Its keyhole is the key's cross-section at the key's scale
 * (the plate is drawn for a 340px key): the round is the shaft, the slot below is the bit.
 */
function Serrure() {
  return (
    <svg className="serrure" viewBox="0 0 84 140" aria-hidden>
      <defs>
        <FiltreFer id="fer-serrure" l={84} h={140} />
        <linearGradient id="trou-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" />
          <stop offset="100%" stopColor="#15100c" />
        </linearGradient>
      </defs>
      <g filter="url(#fer-serrure)">
        <path
          transform="scale(1.1667 1.2069)"
          d="M36 3C46 10 59 11 67 7C69 24 66 34 59 40C66 46 69 52 69 58C69 65 65 70 59 76C66 83 69 92 67 109C59 105 46 106 36 113C26 106 13 105 5 109C3 92 6 83 13 76C7 70 3 65 3 58C3 52 6 46 13 40C6 34 3 24 5 7C13 11 26 10 36 3Z"
          fill="#fff"
        />
        {[
          [15, 23],
          [69, 23],
          [15, 117],
          [69, 117],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#fff" />
        ))}
      </g>
      {/* Keyhole: shaft round (r 16) and bit slot (down to the bit's depth) */}
      <path d="M37.5 70L36 98H48L46.5 70A16.1 16.1 0 1 0 37.5 70Z" fill="url(#trou-g)" />
      <path d="M26 58A16 16 0 0 1 58 58" fill="none" stroke="#000" strokeOpacity=".7" strokeWidth="2" />
      <path d="M28 64A15 15 0 0 0 56 64" fill="none" stroke="#d8d2c6" strokeOpacity=".22" strokeWidth="1" />
    </svg>
  )
}

/** Hand-forged iron key, drawn pointing left. The password field sits on its shaft. */
function Cle() {
  return (
    <svg className="cle-dessin" viewBox="0 0 380 120" aria-hidden>
      <defs>
        <FiltreFer id="fer-cle" l={380} h={120} />
        <mask id="anneau-ajoure" maskUnits="userSpaceOnUse" x="0" y="0" width="380" height="120">
          <rect width="380" height="120" fill="#fff" />
          <circle cx="334" cy="46" r="10.5" fill="#000" />
          <circle cx="334" cy="74" r="10.5" fill="#000" />
          <circle cx="320" cy="60" r="10.5" fill="#000" />
          <circle cx="348" cy="60" r="10.5" fill="#000" />
          <circle cx="334" cy="60" r="7" fill="#000" />
        </mask>
      </defs>
      <g filter="url(#fer-cle)">
        {/* Bit */}
        <path d="M4 46L11 43L64 44L65 77L57 78L57 103L47 104L46 92L37 92L38 103L25 104L24 86L15 87L14 77L5 76Z" fill="#fff" />
        {/* Shaft, slightly uneven like hammered iron */}
        <path d="M58 43C110 40 190 45 270 41L271 79C190 76 112 81 58 77Z" fill="#fff" />
        {/* Collars */}
        <path d="M266 33L280 34L281 87L265 86Z" fill="#fff" />
        <path d="M284 38L293 37L294 83L284 84Z" fill="#fff" />
        {/* Bow, pierced with a quatrefoil */}
        <path d="M290 60C290 34 309 15 335 16C359 17 377 36 376 61C375 86 356 104 332 104C308 103 290 85 290 60Z" fill="#fff" mask="url(#anneau-ajoure)" />
      </g>
    </svg>
  )
}

export default function Sceau() {
  const [motDePasse, setMotDePasse] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [etat, setEtat] = useState<Etat>('repos')
  const champ = useRef<HTMLInputElement>(null)

  const tourner = async (e: React.FormEvent) => {
    e.preventDefault()
    if (etat !== 'repos') return
    if (!motDePasse.trim()) {
      champ.current?.focus()
      return
    }
    setEtat('essai')
    setMessage(null)
    const [rep] = await Promise.all([
      fetch('/api/sceau', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motDePasse }),
      }).catch(() => null),
      new Promise((r) => setTimeout(r, 500)), // let the key reach the lock
    ])
    if (rep?.ok) {
      setEtat('ouvert')
      setTimeout(() => window.location.replace('/'), 2100)
      return
    }
    const corps = rep ? ((await rep.json().catch(() => ({}))) as { message?: string }) : {}
    setEtat('refus')
    setMessage(corps.message ?? "La clé s'est coincée. Réessaie, ami.")
    setTimeout(() => {
      setEtat('repos')
      champ.current?.select()
    }, 900)
  }

  return (
    <main className="seuil">
      <div className={`table-tome etat-${etat}`}>
        <div className="tome">
          <div className="tome-pages" aria-hidden />
          <div className="tome-garde" aria-hidden>
            <Fleuron />
            <p>Jobal kha'jay, trevan.</p>
          </div>
          <div className="tome-battant">
          <div className="tome-doublure" aria-hidden />
          <div className="tome-couverture">
            <div className="tome-charniere" aria-hidden />
            <CoinLaiton className="hg" />
            <CoinLaiton className="bg" />
            <CoinLaiton className="hd" />
            <CoinLaiton className="bd" />
            <div className="tome-cadre">
              <Embleme taille={150} className="tome-embleme" />
              <h1 className="tome-titre">Lunes Itinérantes</h1>
              <Fleuron className="tome-fleuron" />
            </div>
            <div className="fermoir" aria-hidden>
              <Serrure />
            </div>
          </div>
          </div>
        </div>

        <div className="cle-fourreau">
        <form className="cle" onSubmit={tourner}>
          <Cle />
          <input
            ref={champ}
            className="cle-tige"
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder="Clef des lunes"
            autoComplete="current-password"
            autoFocus
            disabled={etat !== 'repos'}
            aria-label="Clef des lunes (mot de passe)"
          />
          <button type="submit" className="cle-anneau" title="Tourner la clé" aria-label="Tourner la clé" disabled={etat !== 'repos'} />
        </form>
        </div>
      </div>
      <p className="tome-message" role="status">
        {message}
      </p>
    </main>
  )
}
