'use client'

import { useState } from 'react'
import { CoinLaiton, Fleuron, Lunes } from './Ornements'

export default function Sceau() {
  const [motDePasse, setMotDePasse] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [etat, setEtat] = useState<'repos' | 'attente' | 'brise'>('repos')

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (etat !== 'repos' || !motDePasse.trim()) return
    setEtat('attente')
    setMessage(null)
    const rep = await fetch('/api/sceau', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motDePasse }),
    }).catch(() => null)
    if (rep?.ok) {
      setEtat('brise')
      setTimeout(() => window.location.replace('/'), 900)
      return
    }
    const corps = rep ? ((await rep.json().catch(() => ({}))) as { message?: string }) : {}
    setMessage(corps.message ?? 'Les vents de Bordeciel ont emporté ta voix. Réessaie, ami.')
    setEtat('repos')
  }

  return (
    <main className="seuil">
      <form className={`tome ${etat === 'brise' ? 'ouvert' : ''}`} onSubmit={soumettre}>
        <CoinLaiton className="hg" />
        <CoinLaiton className="hd" />
        <CoinLaiton className="bg" />
        <CoinLaiton className="bd" />
        <Lunes taille={96} />
        <p className="tome-sur">Grimoire de la</p>
        <h1 className="tome-titre">Caravane des Lunes Itinérantes</h1>
        <Fleuron className="tome-fleuron" />
        <p className="tome-texte">
          Le gardien khajiit pose une patte sur la couverture.
          <br />
          <em>« Ce livre n&apos;est pas pour tous les yeux. Murmure le mot de la caravane. »</em>
        </p>
        <input
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="Le mot de la caravane"
          autoComplete="current-password"
          autoFocus
          aria-label="Mot de passe de la caravane"
        />
        <button type="submit" className={`cachet ${etat}`} disabled={etat !== 'repos'} aria-label="Briser le sceau">
          <span>{etat === 'brise' ? '✦' : 'Briser le sceau'}</span>
        </button>
        <p className="tome-message" role="status">
          {etat === 'brise' ? 'Le sceau cède. Bienvenue parmi nous, ami.' : message}
        </p>
      </form>
    </main>
  )
}
