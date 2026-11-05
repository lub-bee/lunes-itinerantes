'use client'

import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { cle } from '@/lib/missives'
import { nomDuRegistre, nomsProches } from '@/lib/noms'

/*
 * A member's name typed in a form, with the register's closest names under the line (lib/noms.ts: cle()
 * comparison, the same name first, then a beginning, a part, a near spelling). One component for every such
 * field: `ChampNom` for one name, `ChampNoms` for several (each chosen name becomes a small tag with its ✕).
 * The names come from the register (`useRegistre().noms`). Touching a name chooses it (phones: a tap); the
 * arrows and Enter do the same on a keyboard. No effect, no timer: the suggestions are computed from what is
 * typed, at render.
 */

const MAX = 5

type Commun = {
  /** The register's names. */
  noms: readonly string[]
  /** A name the register does not hold may be kept (a new name); otherwise the line says it is not there. */
  libre?: boolean
  placeholder?: string
  /** The field's accessible name (the visible label is the caller's). */
  etiquette: string
  /** Names not to suggest (already chosen). */
  exclure?: readonly string[]
  maxLength?: number
}

/** The line, its suggestions and its word on the name typed; `choisir`: a suggestion (or Enter) was taken. */
function Ligne({ valeur, changer, choisir, noms, libre, placeholder, etiquette, exclure = [], maxLength = 80, mot }: Commun & { valeur: string; changer: (v: string) => void; choisir: (nom: string) => void; mot: boolean }) {
  const id = useId()
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(-1)
  const connu = nomDuRegistre(valeur, noms)
  const proches = useMemo(() => {
    const p = nomsProches(valeur, noms, MAX, exclure)
    // The very name, in the register's spelling, needs no suggestion.
    return connu && connu === valeur.trim() ? p.filter((n) => n !== connu) : p
  }, [valeur, noms, exclure, connu])
  const montre = ouvert && proches.length > 0
  const prendre = (n: string) => {
    choisir(n)
    setActif(-1)
    setOuvert(false)
  }
  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && proches.length) {
      e.preventDefault()
      setOuvert(true)
      setActif((a) => (a + 1) % proches.length)
    } else if (e.key === 'ArrowUp' && proches.length) {
      e.preventDefault()
      setActif((a) => (a <= 0 ? proches.length - 1 : a - 1))
    } else if (e.key === 'Escape' && montre) {
      e.preventDefault()
      setOuvert(false)
    } else if (e.key === 'Enter') {
      if (montre && actif >= 0) {
        e.preventDefault()
        prendre(proches[actif])
      } else if (!mot && valeur.trim()) {
        // Several names: Enter adds the one typed instead of sending the form.
        e.preventDefault()
        prendre(valeur)
      }
    }
  }
  const avis = !valeur.trim() || ouvert ? null : connu ? null : libre ? 'nouveau nom' : 'pas au registre des membres'
  return (
    <span className="champ-nom">
      <input
        type="text"
        value={valeur}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={etiquette}
        autoComplete="off"
        role="combobox"
        aria-expanded={montre}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={montre && actif >= 0 ? `${id}-${actif}` : undefined}
        onChange={(e) => {
          changer(e.target.value)
          setOuvert(true)
          setActif(-1)
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={touche}
      />
      {montre && (
        <span className="champ-nom-proches" role="listbox" id={id} aria-label="Noms du registre">
          {proches.map((n, k) => (
            <button
              key={n}
              id={`${id}-${k}`}
              type="button"
              role="option"
              aria-selected={k === actif}
              className={`champ-nom-proche ${k === actif ? 'actif' : ''}`}
              // Keep the focus on the line: the choice lands before the line closes its list.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => prendre(n)}
            >
              {n}
            </button>
          ))}
        </span>
      )}
      {mot && avis && <em className={`champ-nom-avis ${libre ? '' : 'inconnu'}`}>{avis}</em>}
    </span>
  )
}

/** One member's name: the line and its suggestions; a suggestion taken replaces what is typed. */
export function ChampNom({ valeur, changer, ...commun }: Commun & { valeur: string; changer: (v: string) => void }) {
  return <Ligne {...commun} valeur={valeur} changer={changer} choisir={changer} mot />
}

/** Several names: those chosen (`noms` of the value) and the line being typed (`saisie`). */
export type ValeurNoms = { choisis: string[]; saisie: string }
export const VIDE_NOMS: ValeurNoms = { choisis: [], saisie: '' }

/**
 * Every name of the value, the line still typed included (a name typed but not yet added is not lost when the
 * form is sent), in the register's spelling when it holds it, without doubles (cle()).
 */
export function tousLesNoms(v: ValeurNoms, noms: readonly string[]): string[] {
  const res: string[] = []
  for (const n of [...v.choisis, v.saisie]) {
    const t = n.replace(/\s+/g, ' ').trim()
    if (!t || res.some((x) => cle(x) === cle(t))) continue
    res.push(nomDuRegistre(t, noms) ?? t)
  }
  return res
}

/** Several members' names: the chosen ones as tags (✕ takes one off), the line to add another. */
export function ChampNoms({ valeur, changer, noms, libre, ...commun }: Commun & { valeur: ValeurNoms; changer: (v: ValeurNoms) => void }) {
  const [refus, setRefus] = useState<string | null>(null)
  const ajouter = (n: string) => {
    const t = n.replace(/\s+/g, ' ').trim()
    if (!t) return
    const k = nomDuRegistre(t, noms)
    if (!k && !libre) return setRefus(`« ${t} » n’est pas au registre des membres.`)
    setRefus(null)
    const nom = k ?? t
    changer({ choisis: valeur.choisis.some((x) => cle(x) === cle(nom)) ? valeur.choisis : [...valeur.choisis, nom], saisie: '' })
  }
  return (
    <span className="champ-noms">
      {valeur.choisis.length > 0 && (
        <span className="champ-noms-choisis">
          {valeur.choisis.map((n) => (
            <span key={n} className="champ-noms-nom">
              {n}
              <button type="button" className="fiche-rayer" aria-label={`Retirer ${n}`} title="Retirer" onClick={() => changer({ ...valeur, choisis: valeur.choisis.filter((x) => x !== n) })}>
                ✕
              </button>
            </span>
          ))}
        </span>
      )}
      <span className="champ-noms-ligne">
        <Ligne
          {...commun}
          noms={noms}
          libre={libre}
          exclure={[...(commun.exclure ?? []), ...valeur.choisis]}
          valeur={valeur.saisie}
          changer={(saisie) => {
            setRefus(null)
            changer({ ...valeur, saisie })
          }}
          choisir={ajouter}
          mot={false}
        />
        <button type="button" className="lien-encre champ-noms-ajouter" disabled={!valeur.saisie.trim()} onClick={() => ajouter(valeur.saisie)}>
          ajouter
        </button>
      </span>
      {refus && <em className="champ-nom-avis inconnu">{refus}</em>}
    </span>
  )
}
