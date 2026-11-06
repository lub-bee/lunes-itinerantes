'use client'

import { useSyncExternalStore } from 'react'

/*
 * What pins the loose parchments (the slips of Fiche.tsx, the order sheet of Commande.tsx): a dagger planted
 * through the paper, or an arrow (a trial, chosen by the testers on the secret page /permissions). The choice
 * lives in this browser only (localStorage, every access guarded); the dagger by default and whenever storage
 * is unavailable. Images: public/attache/*.webp, made in the atelier (couteau-source.png cut out, the arrow
 * drawn as SVG), the slit and the cast shadow baked in.
 */

export type GenreAttache = 'couteau' | 'fleche'

const CLE = 'caravane-attache'
const EVENEMENT = 'caravane-attache'
const PAR_DEFAUT: GenreAttache = 'couteau'

function lire(): GenreAttache {
  try {
    return window.localStorage.getItem(CLE) === 'fleche' ? 'fleche' : PAR_DEFAUT
  } catch {
    return PAR_DEFAUT
  }
}

export function choisirAttache(genre: GenreAttache) {
  try {
    if (genre === PAR_DEFAUT) window.localStorage.removeItem(CLE)
    else window.localStorage.setItem(CLE, genre)
  } catch {
    // Storage refused (private window, blocked site data): the dagger stays.
  }
  window.dispatchEvent(new Event(EVENEMENT))
}

function abonner(rappel: () => void) {
  window.addEventListener('storage', rappel)
  window.addEventListener(EVENEMENT, rappel)
  return () => {
    window.removeEventListener('storage', rappel)
    window.removeEventListener(EVENEMENT, rappel)
  }
}

export function useAttache(): GenreAttache {
  return useSyncExternalStore(abonner, lire, () => PAR_DEFAUT)
}

/** The planted object, inside the paper layer (it follows every fall, unroll and lift of the sheet). */
export function Attache() {
  const genre = useAttache()
  return <span className={`attache attache-${genre}`} aria-hidden />
}

const CHOIX: { genre: GenreAttache; nom: string; aide: string }[] = [
  { genre: 'couteau', nom: 'La dague', aide: 'plantée à travers le parchemin, la garde de laiton dressée' },
  { genre: 'fleche', nom: 'La flèche', aide: 'fichée dans la page, l’empennage d’oie au vent' },
]

/** On the secret page: which steel pins the parchments, in this browser only. */
export function ChoixAttache() {
  const genre = useAttache()
  return (
    <section className="qualite-choix attache-choix" id="attache" aria-labelledby="attache-titre">
      <h2 id="attache-titre">Ce qui cloue les parchemins</h2>
      <p className="qualite-aide">
        Les feuillets volants et le bon de commande tiennent à la page par un fer planté au travers. Choisis lequel, le temps de comparer : le choix ne vaut que pour ce
        navigateur, rien n’est écrit ni dans la feuille ni ailleurs.
      </p>
      <div className="qualite-rangs" role="radiogroup" aria-label="Ce qui cloue les parchemins">
        {CHOIX.map((c) => (
          <label key={c.genre} className={`qualite-rang attache-option ${genre === c.genre ? 'qualite-membre' : ''}`}>
            <input type="radio" name="attache" checked={genre === c.genre} onChange={() => choisirAttache(c.genre)} />
            <span className={`attache-apercu attache-${c.genre}`} aria-hidden />
            <span>
              {c.nom}
              <small> — {c.aide}</small>
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}
