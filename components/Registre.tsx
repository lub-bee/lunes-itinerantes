'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Article } from '@/lib/types'
import { calculerMissives, evaluateur, indexRecettes, type ActionRegistre, type DonneesRegistre } from '@/lib/missives'

/*
 * The registre as the page sees it: who holds the pen (the member's name, checked by the server
 * against the caravan's list), the missives, recipes, resources and the chest's ledger. One hook,
 * shared by the order sheet (the seller) and the missives (every action is signed with that name).
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

const ECHEC = "Le coursier n'est pas revenu. Rien n'a été consigné : réessaie."

export function useRegistre(articles: Article[]) {
  const [marchand, setMarchand] = useState<InfoMarchand | null>(null)
  const [donnees, setDonnees] = useState<DonneesRegistre | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const lireMarchand = useCallback(
    () =>
      fetch('/api/marchand')
        .then((r) => (r.ok ? r.json() : null))
        .then((r: InfoMarchand | null) => r && setMarchand(r))
        .catch(() => {}),
    [],
  )
  const lireDonnees = useCallback(
    () =>
      fetch('/api/registre')
        .then(async (r) => {
          const j = (await r.json().catch(() => null)) as { ok?: boolean; donnees?: DonneesRegistre; message?: string } | null
          if (r.ok && j?.donnees) {
            setDonnees(j.donnees)
            setErreur(null)
          } else setErreur(j?.message ?? "Le registre des missives reste fermé pour l'heure.")
        })
        .catch(() => setErreur("Le registre des missives reste fermé pour l'heure.")),
    [],
  )

  useEffect(() => {
    lireMarchand()
    lireDonnees()
  }, [lireMarchand, lireDonnees])

  /** Signs with a name: the server checks it against the caravan's list. */
  const signer = useCallback(
    async (nom: string): Promise<Reponse> => {
      try {
        const rep = await fetch('/api/identite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom }) })
        const r = (await rep.json().catch(() => null)) as { ok?: boolean; nom?: string; message?: string } | null
        if (!rep.ok || !r?.ok || !r.nom) return { ok: false, message: r?.message ?? ECHEC }
        setMarchand((m) => (m ? { ...m, identite: r.nom! } : m))
        await lireMarchand()
        return { ok: true, message: `Bienvenue, ${r.nom}.` }
      } catch {
        return { ok: false, message: ECHEC }
      }
    },
    [lireMarchand],
  )

  const oublier = useCallback(async () => {
    await fetch('/api/identite', { method: 'DELETE' }).catch(() => {})
    setMarchand((m) => (m ? { ...m, identite: null, droits: null } : m))
  }, [])

  /** One write in the registre; the fresh data comes back with the answer. */
  const agir = useCallback(async (action: ActionRegistre, corps: Record<string, unknown>): Promise<Reponse> => {
    try {
      const rep = await fetch('/api/registre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...corps }) })
      const r = (await rep.json().catch(() => null)) as { ok?: boolean; message?: string; numero?: string; donnees?: DonneesRegistre | null } | null
      if (r?.donnees) setDonnees(r.donnees)
      if (rep.status === 401) setMarchand((m) => (m ? { ...m, identite: null } : m))
      return { ok: Boolean(rep.ok && r?.ok), message: r?.message ?? ECHEC, numero: r?.numero }
    } catch {
      return { ok: false, message: ECHEC }
    }
  }, [])

  const calcul = useMemo(() => {
    if (!donnees) return null
    const valeur = evaluateur(articles, donnees.recettes, donnees.ressources)
    return { valeur, recettes: indexRecettes(donnees.recettes), etats: calculerMissives(donnees, valeur) }
  }, [donnees, articles])

  return { marchand, donnees, erreur, calcul, signer, oublier, agir, relire: lireDonnees }
}

export type EtatRegistre = ReturnType<typeof useRegistre>
