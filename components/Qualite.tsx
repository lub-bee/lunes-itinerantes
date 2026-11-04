'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/*
 * « Voir le registre en la qualité de… » (Missions v2, lot 1c), for testers only (TESTEURS_DISCORD_IDS). The server
 * decides everything (app/api/qualite, lib/identite.ts); this file only shows it:
 * - `BandeauQualite`, on every page (the root layout): while a tester views the book as chosen ranks, a ribbon
 *   « Tu portes le rang de : … » and « Reprendre mon sceau » (back to the tester's own rights); otherwise, for a tester
 *   on the grimoire, a small discreet seal leading to the choice on the secret page.
 * - `ChoixQualite`, on the secret page /permissions: the Rôles tab's ranks to check (« Membre » included), or none.
 */

type Etat = { rangs: string[]; noms: string[]; refus: null | 'rang' | 'registre' }
type Info = { testeur: boolean; qualite: Etat | null; rangs?: { cle: string; nom: string }[]; lu?: boolean }

const lire = (choix = false): Promise<Info | null> =>
  fetch(`/api/qualite${choix ? '?choix=1' : ''}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)

/** Back to the tester's own seal: the cookie is dropped and the book reopens at its first page. */
async function reprendre() {
  await fetch('/api/qualite', { method: 'DELETE' }).catch(() => {})
  window.location.assign('/')
}

const listeRangs = (noms: string[]) => (noms.length ? noms.join(', ') : 'aucun rang')

export function BandeauQualite() {
  const chemin = usePathname()
  const [info, setInfo] = useState<Info | null>(null)
  const [enCours, setEnCours] = useState(false)
  const bandeau = useRef<HTMLDivElement>(null)
  const actif = Boolean(info?.testeur && info.qualite)
  // The page makes room for the ribbon, whatever its height (two lines on a phone).
  useEffect(() => {
    const el = bandeau.current
    if (!actif || !el) return
    const racine = document.documentElement
    const o = new ResizeObserver(() => racine.style.setProperty('--h-bandeau', `${el.offsetHeight}px`))
    o.observe(el)
    return () => {
      o.disconnect()
      racine.style.removeProperty('--h-bandeau')
    }
  }, [actif])
  useEffect(() => {
    let vivant = true
    lire().then((i) => vivant && setInfo(i))
    return () => {
      vivant = false
    }
  }, [chemin])
  if (!info?.testeur) return null
  const q = info.qualite
  if (!q) {
    // The tester's own seal: only a discreet way to the choice, on the grimoire itself.
    if (chemin !== '/') return null
    return (
      <a className="qualite-sceau" href="/permissions#qualite" title="Voir le registre en la qualité de…" aria-label="Voir le registre en la qualité de…">
        <span aria-hidden>⚜</span>
      </a>
    )
  }
  return (
    <div className="qualite-bandeau" role="status" ref={bandeau}>
      <span className="qualite-texte">
        <span className="qualite-mention">En qualité · </span>
        Tu portes le rang de : <strong>{listeRangs(q.noms)}</strong>
        {q.refus && <em className="qualite-refus"> — la serrure te reste close</em>}
      </span>
      <span className="qualite-gestes">
        {chemin !== '/permissions' && (
          <a className="qualite-changer" href="/permissions#qualite">
            changer
          </a>
        )}
        <button
          type="button"
          className="qualite-reprendre"
          disabled={enCours}
          onClick={() => {
            setEnCours(true)
            reprendre()
          }}
        >
          Reprendre mon sceau
        </button>
      </span>
    </div>
  )
}

const AUCUN = '__aucun__'

export function ChoixQualite() {
  const [info, setInfo] = useState<Info | null>(null)
  const [coches, setCoches] = useState<Set<string>>(new Set())
  const [aucun, setAucun] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const charger = useCallback(() => {
    lire(true).then((i) => {
      setInfo(i)
      if (i?.qualite) {
        setCoches(new Set(i.qualite.rangs))
        setAucun(i.qualite.rangs.length === 0)
      }
    })
  }, [])
  useEffect(charger, [charger])

  if (!info) return null
  const rangs = info.rangs ?? []
  const pret = aucun || coches.size > 0

  const basculer = (cle: string) => {
    setMessage(null)
    if (cle === AUCUN) {
      setAucun((a) => !a)
      setCoches(new Set())
      return
    }
    setAucun(false)
    setCoches((c) => {
      const n = new Set(c)
      if (n.has(cle)) n.delete(cle)
      else n.add(cle)
      return n
    })
  }

  const porter = async () => {
    setEnCours(true)
    setMessage(null)
    const r = await fetch('/api/qualite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rangs: aucun ? [] : rangs.filter((x) => coches.has(x.cle)).map((x) => x.cle) }),
    }).catch(() => null)
    const j = r ? ((await r.json().catch(() => null)) as { ok?: boolean; message?: string } | null) : null
    if (!r?.ok || !j?.ok) {
      setEnCours(false)
      setMessage(j?.message ?? "Le coursier n'est pas revenu. Rien n'a changé : réessaie.")
      return
    }
    // The whole book is read again under those ranks (the lock page, if they may not enter).
    window.location.assign('/')
  }

  return (
    <section className="qualite-choix" id="qualite" aria-labelledby="qualite-titre">
      <h2 id="qualite-titre">Voir le registre en la qualité de…</h2>
      <p className="qualite-aide">
        Le temps d’une visite, porte les rangs de ton choix : le grimoire entier, ses pages, ses gestes, le Trésor et la serrure même te traitent alors
        comme un marchand qui les tiendrait, selon les cases gravées ici. Ton nom et ton sceau restent les tiens : ce que tu écris l’est sous ton nom, et
        ton rang véritable demeure au registre. Rien n’est écrit ni sur Discord ni dans la feuille.
      </p>
      {info.qualite && (
        <p className="qualite-actuel">
          Tu portes en ce moment le rang de : <strong>{listeRangs(info.qualite.noms)}</strong>.
        </p>
      )}
      {!rangs.length ? (
        <p className="perm-etat">
          {info.lu === false ? 'Le registre des rangs ne se lit pas pour l’heure : nul rang à emprunter.' : 'L’onglet « Rôles » ne nomme encore aucun rang : seul « aucun rang » se peut porter.'}
        </p>
      ) : null}
      <div className="qualite-rangs" role="group" aria-label="Rangs à porter">
        {rangs.map((r) => (
          <label key={r.cle} className={`qualite-rang ${r.cle === 'membre' ? 'qualite-membre' : ''}`}>
            <input type="checkbox" checked={coches.has(r.cle)} onChange={() => basculer(r.cle)} />
            <span>{r.nom}</span>
          </label>
        ))}
        <label className="qualite-rang qualite-aucun">
          <input type="checkbox" checked={aucun} onChange={() => basculer(AUCUN)} />
          <span>aucun rang</span>
        </label>
      </div>
      {!aucun && coches.size > 0 && !coches.has('membre') && (
        <p className="qualite-avertir">Sans « Membre », la serrure du grimoire reste close : tu verras le refus qu’essuierait un tel marchand.</p>
      )}
      <div className="perm-actions">
        <button type="button" className="perm-bouton" disabled={!pret || enCours} onClick={porter}>
          {enCours ? 'Le sceau change de main…' : 'Porter ces rangs'}
        </button>
        {info.qualite && (
          <button type="button" className="perm-lien" disabled={enCours} onClick={() => (setEnCours(true), reprendre())}>
            Reprendre mon sceau
          </button>
        )}
      </div>
      {message && <p className="perm-message perm-alerte">{message}</p>}
    </section>
  )
}
