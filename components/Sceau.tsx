'use client'

import { useEffect, useRef, useState } from 'react'
import { Fleuron } from './Ornements'
import { Cle } from './Fer'
import { FaceCouverture } from './Couverture'

type Etat = 'repos' | 'essai' | 'refus' | 'ouvert'

/** Refusals sent back by /api/discord/retour (?refus=…). */
const REFUS: Record<string, string> = {
  membre: "Ce sceau n'est pas celui de la caravane : Khajiit ne te connaît pas, voyageur.",
  rang: "La caravane te connaît, mais ton rang n'ouvre pas ce grimoire. Parle aux Patriarches.",
  discord: "Le sceau n'a pas été présenté. La serrure reste close.",
  ruse: 'La serrure a senti une ruse. Recommence, ami.',
}

/**
 * The locked book and its key. With Discord configured the key's shaft reads « Présenter son
 * sceau »: turning it goes through Discord, and coming back with the right role plays the opening.
 * With the shared password (alone, or as a second way when allowed) the shaft is the password field.
 */
export default function Sceau({ discord = false, motDePasse: avecMotDePasse = true }: { discord?: boolean; motDePasse?: boolean }) {
  const [motDePasse, setMotDePasse] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [etat, setEtat] = useState<Etat>('repos')
  const [variante, setVariante] = useState<'sceau' | 'mot'>(discord ? 'sceau' : 'mot')
  const champ = useRef<HTMLInputElement>(null)

  // Back from Discord: open the book, or say why the lock stays closed.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const refus = p.get('refus')
    if (p.has('ouvert') || refus) window.history.replaceState(null, '', '/sceau')
    if (p.has('ouvert')) {
      const t1 = setTimeout(() => setEtat('essai'), 350)
      const t2 = setTimeout(() => setEtat('ouvert'), 900)
      const t3 = setTimeout(() => window.location.replace('/'), 3000)
      return () => [t1, t2, t3].forEach(clearTimeout)
    }
    if (refus) setMessage(REFUS[refus] ?? REFUS.discord)
  }, [])
  // Coming back with the browser's Back button from Discord: the key returns to rest.
  useEffect(() => {
    const f = (e: PageTransitionEvent) => e.persisted && setEtat('repos')
    window.addEventListener('pageshow', f)
    return () => window.removeEventListener('pageshow', f)
  }, [])

  const tourner = async (e: React.FormEvent) => {
    e.preventDefault()
    if (etat !== 'repos') return
    if (variante === 'sceau') {
      setEtat('essai')
      setMessage(null)
      setTimeout(() => window.location.assign('/api/discord/depart'), 520) // let the key reach the lock
      return
    }
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
          <FaceCouverture />
          </div>
        </div>

        <div className="cle-fourreau">
        <form className="cle" onSubmit={tourner}>
          <Cle />
          {variante === 'sceau' ? (
            <button
              type="submit"
              className="cle-tige cle-tige-sceau"
              disabled={etat !== 'repos'}
              title="Le sceau de la caravane se présente par son repaire, sur Discord"
            >
              Présenter son sceau
            </button>
          ) : (
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
          )}
          <button type="submit" className="cle-anneau" title="Tourner la clé" aria-label="Tourner la clé" disabled={etat !== 'repos'} />
        </form>
        </div>
      </div>
      <p className="tome-message" role="status">
        {message}
      </p>
      {/* Both ways open (transition): the other one, out of the layout flow so nothing moves. */}
      {discord && avecMotDePasse && etat === 'repos' && (
        <button
          type="button"
          className="seuil-variante"
          onClick={() => {
            setMessage(null)
            setVariante((v) => (v === 'sceau' ? 'mot' : 'sceau'))
          }}
        >
          {variante === 'sceau' ? 'ou murmurer la clef des lunes' : 'ou présenter son sceau'}
        </button>
      )}
    </main>
  )
}
