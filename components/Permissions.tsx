'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { defautDe, GESTES, TOUT_MEMBRE, type Geste } from '@/lib/droits'
import type { VuePermissions } from '@/app/api/permissions/route'

// The secret page (/permissions, testers only; the middleware answers 403 to anyone else): the sheet's
// Permissions tab as checkboxes, one row per gesture, one column per role. Nothing is written until the
// tester confirms; the route rewrites the whole tab (lib/droits.ts, script v3o 'permissions').

type Cases = Record<Geste, Record<string, boolean>>

const copie = (c: Cases): Cases => Object.fromEntries(Object.entries(c).map(([g, v]) => [g, { ...v }])) as Cases

export default function Permissions() {
  const [d, setD] = useState<VuePermissions | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [cases, setCases] = useState<Cases | null>(null)
  const [confirmer, setConfirmer] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)

  const recevoir = useCallback((v: VuePermissions) => {
    setD(v)
    setCases(copie(v.cases as Cases))
  }, [])

  useEffect(() => {
    fetch('/api/permissions')
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { donnees?: VuePermissions; message?: string } | null
        if (r.ok && j?.donnees) recevoir(j.donnees)
        else setErreur(j?.message ?? "Le registre reste fermé pour l'heure.")
      })
      .catch(() => setErreur("Le coursier n'a pas pu atteindre le registre."))
  }, [recevoir])

  const changes = useMemo(() => {
    if (!d || !cases) return 0
    let n = 0
    for (const g of GESTES) for (const c of d.colonnes) if (Boolean(cases[g.cle]?.[c.cle]) !== Boolean((d.cases as Cases)[g.cle]?.[c.cle])) n++
    return n
  }, [d, cases])

  if (erreur) return <p className="perm-ferme">{erreur}</p>
  if (!d || !cases) return <p className="perm-ferme attente-encre">Le scribe déroule le registre des permissions…</p>

  const basculer = (g: Geste, role: string) => {
    setMessage(null)
    setConfirmer(false)
    setCases((x) => (x ? { ...x, [g]: { ...x[g], [role]: !x[g][role] } } : x))
  }
  const departs = () => {
    setMessage(null)
    setCases(Object.fromEntries(GESTES.map((g) => [g.cle, Object.fromEntries(d.colonnes.map((c) => [c.cle, defautDe(g, c.cle)]))])) as Cases)
  }
  const graver = async () => {
    setEnvoi(true)
    setMessage(null)
    try {
      const r = await fetch('/api/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cases }) })
      const j = (await r.json().catch(() => null)) as { donnees?: VuePermissions; message?: string } | null
      if (r.ok && j?.donnees) {
        recevoir(j.donnees)
        setMessage({ ok: true, texte: j.message ?? 'Les permissions sont gravées.' })
      } else setMessage({ ok: false, texte: j?.message ?? "Le registre a refusé le feuillet. Rien n'a été gravé." })
    } catch {
      setMessage({ ok: false, texte: "Le coursier s'est perdu en route. Rien n'a été gravé." })
    } finally {
      setEnvoi(false)
      setConfirmer(false)
    }
  }

  const groupes = [...new Set(GESTES.map((g) => g.groupe))]
  const largeur = d.colonnes.length + 1
  const sansId = d.roles.filter((r) => !r.id)

  return (
    <>
      <p className="perm-etat">
        {!d.lu
          ? 'Le script de la feuille ne lit pas encore ces onglets (v3o) : le grimoire suit les valeurs de départ, et rien ne peut être gravé.'
          : d.onglet
            ? 'Lu dans l’onglet « Permissions » de la feuille. Une ligne marquée « départ » n’y est pas encore : elle suit les valeurs de départ.'
            : 'L’onglet « Permissions » est vide ou absent : le grimoire suit les valeurs de départ. Graver les inscrit dans la feuille.'}
      </p>

      <div className="perm-cadre">
        <table className="perm-table">
          <thead>
            <tr>
              <th className="perm-geste-tete" scope="col">
                Geste
              </th>
              {d.colonnes.map((c) => (
                <th key={c.cle} scope="col" className={`perm-role ${c.cle === TOUT_MEMBRE ? 'perm-tous' : ''}`} title={c.nom}>
                  <span>{c.nom}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupes.map((gr) => (
              <Fragment key={gr}>
                <tr className="perm-groupe">
                  <th colSpan={largeur} scope="rowgroup">
                    {gr}
                  </th>
                </tr>
                {GESTES.filter((g) => g.groupe === gr).map((g) => (
                  <tr key={g.cle}>
                    <th scope="row" className="perm-geste">
                      {g.libelle}
                      {g.note && <em className="perm-note"> — {g.note}</em>}
                      {d.lu && d.onglet && !d.ecrites[g.cle] && <span className="perm-depart">départ</span>}
                    </th>
                    {d.colonnes.map((c) => {
                      const v = Boolean(cases[g.cle]?.[c.cle])
                      const change = v !== Boolean((d.cases as Cases)[g.cle]?.[c.cle])
                      return (
                        <td key={c.cle} className={`${change ? 'perm-change' : ''} ${c.cle === TOUT_MEMBRE ? 'perm-tous' : ''}`}>
                          <input type="checkbox" checked={v} onChange={() => basculer(g.cle, c.cle)} aria-label={`${g.libelle} : ${c.nom}`} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="perm-groupe">
              <th colSpan={largeur} scope="rowgroup">
                Page secrète
              </th>
            </tr>
            <tr>
              <th scope="row" className="perm-geste">
                Ouvrir la page des permissions
                <em className="perm-note"> — les testeurs seuls, par leur identifiant Discord</em>
              </th>
              {d.colonnes.map((c) => (
                <td key={c.cle} className="perm-fige">
                  <input type="checkbox" checked={false} disabled aria-label={`Page des permissions : ${c.nom}`} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="perm-actions">
        {!confirmer ? (
          <>
            <button type="button" className="perm-bouton" disabled={!d.lu || envoi || (changes === 0 && d.onglet && GESTES.every((g) => d.ecrites[g.cle]))} onClick={() => setConfirmer(true)}>
              Graver les permissions
            </button>
            <button type="button" className="perm-lien" disabled={envoi} onClick={departs}>
              revenir aux valeurs de départ
            </button>
            {changes > 0 && (
              <button type="button" className="perm-lien" disabled={envoi} onClick={() => setCases(copie(d.cases as Cases))}>
                défaire mes changements
              </button>
            )}
          </>
        ) : (
          <div className="perm-confirmer" role="alertdialog" aria-label="Confirmer">
            <p>
              {changes > 0 ? `${changes} case${changes > 1 ? 's' : ''} change${changes > 1 ? 'nt' : ''}. ` : ''}
              Graver ce tableau dans l’onglet « Permissions » de la feuille ? Il remplace celui qui s’y trouve, et chaque membre verra ses gestes changer à sa prochaine page.
            </p>
            <button type="button" className="perm-bouton" disabled={envoi} onClick={graver}>
              {envoi ? 'Le scribe grave…' : 'Graver'}
            </button>
            <button type="button" className="perm-lien" disabled={envoi} onClick={() => setConfirmer(false)}>
              renoncer
            </button>
          </div>
        )}
        {message && <p className={`perm-message ${message.ok ? '' : 'erreur'}`}>{message.texte}</p>}
      </div>

      <section className="perm-roles">
        <h2>Les rôles et leur sceau Discord</h2>
        <p>
          Un membre tient chaque rôle dont il porte le rôle Discord, d’après l’onglet « Rôles » de la feuille. Tant qu’aucun de ses rôles Discord n’y est inscrit (ou s’il entre par le mot de passe), le grimoire lit encore la colonne « Rôle » de
          Membres, appelée à disparaître.
        </p>
        {d.roles.length ? (
          <ul>
            {d.roles.map((r) => (
              <li key={`${r.nom}-${r.id}`}>
                <strong>{r.nom}</strong> · {r.id ? <code>{r.id}</code> : <em>{r.illisible ? 'ID illisible : tape-le comme texte, précédé d’une apostrophe' : 'ID à inscrire'}</em>}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            <em>{d.lu ? 'L’onglet « Rôles » est vide ou absent : il naîtra au premier « Graver », avec un rôle par ligne, ses ID à inscrire.' : 'Le script de la feuille ne lit pas encore l’onglet « Rôles ».'}</em>
          </p>
        )}
        {sansId.length > 0 && d.roles.length > 0 && (
          <p className="perm-note">
            {sansId.length} rôle{sansId.length > 1 ? 's' : ''} sans ID : nul ne le{sansId.length > 1 ? 's' : ''} tient par Discord pour l’heure.
          </p>
        )}
        <p className="perm-moi">
          Ton sceau ({d.moi.nom}) :{' '}
          {d.moi.sceauAncien
            ? 'scellé avant que le grimoire ne lise les rôles Discord ; rouvre-le pour qu’il les retienne.'
            : d.moi.roles.length
              ? `tu portes ${d.moi.roles.join(', ')}.`
              : 'aucun de tes rôles Discord n’est inscrit dans l’onglet « Rôles ».'}{' '}
          Testeur, tu tiens de toute façon chaque geste.
        </p>
      </section>
    </>
  )
}
