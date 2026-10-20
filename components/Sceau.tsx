'use client'

import { useRef, useState } from 'react'
import { CoinLaiton, Fleuron, Lunes } from './Ornements'

type Etat = 'repos' | 'essai' | 'refus' | 'ouvert'

/** Brass lock plate of the clasp, with its keyhole. */
function Serrure() {
  return (
    <svg className="serrure" viewBox="0 0 72 116" aria-hidden>
      <defs>
        <linearGradient id="serrure-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8e2a0" />
          <stop offset="38%" stopColor="#c99a3e" />
          <stop offset="72%" stopColor="#8a6320" />
          <stop offset="100%" stopColor="#4f360d" />
        </linearGradient>
        <radialGradient id="serrure-rivet" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fff1c2" />
          <stop offset="60%" stopColor="#b98a35" />
          <stop offset="100%" stopColor="#4f360d" />
        </radialGradient>
      </defs>
      <path
        d="M36 2C46 10 60 10 68 6C70 24 66 34 60 40C66 46 70 52 70 58C70 64 66 70 60 76C66 82 70 92 68 110C60 106 46 106 36 114C26 106 12 106 4 110C2 92 6 82 12 76C6 70 2 64 2 58C2 52 6 46 12 40C6 34 2 24 4 6C12 10 26 10 36 2Z"
        fill="url(#serrure-g)"
        stroke="#3b2608"
        strokeWidth="1.4"
      />
      <path
        d="M36 10C44 16 54 17 61 14C62 26 58 34 52 40C58 46 62 52 62 58C62 64 58 70 52 76C58 82 62 90 61 102C54 99 44 100 36 106C28 100 18 99 11 102C10 90 14 82 20 76C14 70 10 64 10 58C10 52 14 46 20 40C14 34 10 26 11 14C18 17 28 16 36 10Z"
        fill="none"
        stroke="#fbe7ad"
        strokeOpacity=".45"
      />
      <circle cx="36" cy="52" r="7.5" fill="#140a02" />
      <path d="M32 56L29.5 72H42.5L40 56Z" fill="#140a02" />
      <circle cx="36" cy="52" r="7.5" fill="none" stroke="#3b2608" strokeWidth="1.2" />
      {[
        [12, 18],
        [60, 18],
        [12, 98],
        [60, 98],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="url(#serrure-rivet)" stroke="#3b2608" strokeWidth=".6" />
      ))}
    </svg>
  )
}

/** Ornate brass key, drawn pointing left. The password field sits on its shaft. */
function Cle() {
  return (
    <svg className="cle-dessin" viewBox="0 0 380 120" aria-hidden>
      <defs>
        <linearGradient id="cle-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe7ad" />
          <stop offset="30%" stopColor="#d7ab4d" />
          <stop offset="65%" stopColor="#8a6320" />
          <stop offset="100%" stopColor="#c99a3e" />
        </linearGradient>
        <linearGradient id="cle-anneau-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbe7ad" />
          <stop offset="40%" stopColor="#c99a3e" />
          <stop offset="100%" stopColor="#5b3f12" />
        </linearGradient>
      </defs>
      {/* Bit */}
      <path d="M6 44H66V76H58V104H48V92H38V104H26V86H16V76H6Z" fill="url(#cle-g)" stroke="#3b2608" strokeWidth="1.4" strokeLinejoin="round" />
      {/* Shaft */}
      <rect x="60" y="42" width="214" height="36" rx="5" fill="url(#cle-g)" stroke="#3b2608" strokeWidth="1.4" />
      <rect x="66" y="47" width="202" height="26" rx="3" fill="#2a1a08" fillOpacity=".16" stroke="#3b2608" strokeOpacity=".5" />
      {/* Collar */}
      <rect x="270" y="34" width="10" height="52" rx="3" fill="url(#cle-g)" stroke="#3b2608" strokeWidth="1.4" />
      <rect x="284" y="38" width="7" height="44" rx="3" fill="url(#cle-g)" stroke="#3b2608" strokeWidth="1.4" />
      {/* Bow: a ring with a quatrefoil, the caravan's moon at its heart */}
      <circle cx="330" cy="60" r="46" fill="url(#cle-anneau-g)" stroke="#3b2608" strokeWidth="1.6" />
      <path
        d="M330 24C342 24 348 36 344 46C354 42 366 48 366 60C366 72 354 78 344 74C348 84 342 96 330 96C318 96 312 84 316 74C306 78 294 72 294 60C294 48 306 42 316 46C312 36 318 24 330 24Z"
        fill="#140a02"
        fillOpacity=".88"
        stroke="#3b2608"
      />
      <circle cx="330" cy="60" r="13" fill="url(#cle-anneau-g)" stroke="#3b2608" strokeWidth="1.2" />
      <circle cx="334" cy="56" r="10" fill="#140a02" fillOpacity=".88" />
      <circle cx="330" cy="60" r="44" fill="none" stroke="#fbe7ad" strokeOpacity=".4" />
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
            <p>Bienvenue parmi nous, ami.</p>
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
              <Lunes taille={88} />
              <h1 className="tome-titre">Lunes Itinérantes</h1>
              <Fleuron className="tome-fleuron" />
            </div>
          </div>
          </div>
          <div className="fermoir" aria-hidden>
            <div className="fermoir-sangle" />
            <Serrure />
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
            placeholder="Le mot de la caravane"
            autoComplete="current-password"
            autoFocus
            disabled={etat !== 'repos'}
            aria-label="Mot de passe de la caravane"
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
