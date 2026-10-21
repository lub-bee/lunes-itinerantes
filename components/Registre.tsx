'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Article } from '@/lib/types'
import { calculerMissives, evaluateur, indexRecettes, type ActionRegistre, type DonneesRegistre } from '@/lib/missives'

/*
 * The registre as the page sees it: who holds the pen (the member's name, checked by the server
 * against the caravan's list), the missives, recipes, resources and the chest's ledger. One hook,
 * shared by the ex-libris, the order sheet (the seller) and the missives (every action is signed
 * with that name).
 *
 * Writes can be written on the page at once (`prevoir`): the change shows in fresh ink while the
 * registre answers, is replaced by the registre's own data when it does, and is taken back with an
 * in-character notice (`avis`) if it refuses.
 */

export type InfoMarchand = {
  /** Name of the Discord seal, or the generic name of the shared password. */
  nom: string | null
  discord: boolean
  /** Seller typed by hand on the order sheet (kept in a cookie). */
  vendeur: string
  /** The sheet is linked (Apps Script configured). */
  relie: boolean
  /** The member's name as the Membres tab spells it, once recognized. */
  identite: string | null
  droits: Record<ActionRegistre, boolean> | null
}

export type Reponse = { ok: boolean; message: string; numero?: string }

type Prevision = { id: number; prevoir: (d: DonneesRegistre) => DonneesRegistre }

const ECHEC = "Le coursier n'est pas revenu. Rien n'a été consigné : réessaie."
const FERME = "Le registre des missives ne répond pas : le coursier n'a pu l'ouvrir. Les missives attendent dans le coffre de la caravane ; réessaie dans un moment."

export function useRegistre(articles: Article[]) {
  const [marchand, setMarchand] = useState<InfoMarchand | null>(null)
  const [base, setBase] = useState<DonneesRegistre | null>(null)
  const [previsions, setPrevisions] = useState<Prevision[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [avis, setAvis] = useState<{ texte: string; n: number } | null>(null)
  const compteur = useRef(0)

  const lireMarchand = useCallback(
    () =>
      fetch('/api/marchand')
        .then((r) => (r.ok ? r.json() : null))
        .then((r: InfoMarchand | null) => r && setMarchand(r))
        .catch(() => {}),
    [],
  )
  const lireDonnees = useCallback(() => {
    setErreur(null)
    return fetch('/api/registre')
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { ok?: boolean; donnees?: DonneesRegistre; message?: string } | null
        if (r.ok && j?.donnees) setBase(j.donnees)
        else setErreur(j?.message ?? FERME)
      })
      .catch(() => setErreur(FERME))
  }, [])

  useEffect(() => {
    lireMarchand()
    lireDonnees()
  }, [lireMarchand, lireDonnees])

  useEffect(() => {
    if (!avis) return
    const t = setTimeout(() => setAvis(null), 9000)
    return () => clearTimeout(t)
  }, [avis])

  /** Signs with a name: the server checks it against the caravan's list. */
  const signer = useCallback(async (nom: string): Promise<Reponse> => {
    try {
      const rep = await fetch('/api/identite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom }) })
      const r = (await rep.json().catch(() => null)) as { ok?: boolean; nom?: string; message?: string; droits?: InfoMarchand['droits'] } | null
      if (!rep.ok || !r?.ok || !r.nom) return { ok: false, message: r?.message ?? ECHEC }
      setMarchand((m) => (m ? { ...m, identite: r.nom!, droits: r.droits ?? m.droits } : m))
      return { ok: true, message: r.nom }
    } catch {
      return { ok: false, message: ECHEC }
    }
  }, [])

  const oublier = useCallback(async () => {
    setMarchand((m) => (m ? { ...m, identite: null, droits: null } : m))
    await fetch('/api/identite', { method: 'DELETE' }).catch(() => {})
  }, [])

  /**
   * One write in the registre; the fresh data comes back with the answer. With `prevoir`, the change
   * is shown at once and the caller need not wait (a refusal comes back as an `avis`).
   */
  const agir = useCallback(
    async (action: ActionRegistre, corps: Record<string, unknown>, prevoir?: Prevision['prevoir']): Promise<Reponse> => {
      const id = ++compteur.current
      if (prevoir) setPrevisions((ps) => [...ps, { id, prevoir }])
      let res: Reponse
      try {
        const rep = await fetch('/api/registre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...corps }) })
        const r = (await rep.json().catch(() => null)) as { ok?: boolean; message?: string; numero?: string; donnees?: DonneesRegistre | null } | null
        if (r?.donnees) setBase(r.donnees)
        if (rep.status === 401) setMarchand((m) => (m ? { ...m, identite: null } : m))
        res = { ok: Boolean(rep.ok && r?.ok), message: r?.message ?? ECHEC, numero: r?.numero }
      } catch {
        res = { ok: false, message: ECHEC }
      }
      if (prevoir) {
        setPrevisions((ps) => ps.filter((p) => p.id !== id))
        if (!res.ok) setAvis({ texte: `L'encre n'a pas pris : ${res.message}`, n: id })
      }
      return res
    },
    [],
  )

  const donnees = useMemo(() => {
    if (!base) return null
    return previsions.reduce((d, p) => {
      try {
        return p.prevoir(d)
      } catch {
        return d
      }
    }, base)
  }, [base, previsions])

  const calcul = useMemo(() => {
    if (!donnees) return null
    const valeur = evaluateur(articles, donnees.recettes, donnees.ressources)
    return { valeur, recettes: indexRecettes(donnees.recettes), etats: calculerMissives(donnees, valeur) }
  }, [donnees, articles])

  return { marchand, donnees, erreur, calcul, avis, fermerAvis: () => setAvis(null), signer, oublier, agir, relire: lireDonnees }
}

export type EtatRegistre = ReturnType<typeof useRegistre>
