'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { defautDe, GESTES, type Geste } from '@/lib/droits'
import type { VuePermissions } from '@/app/api/permissions/route'

// The secret page (/permissions, testers only; the middleware answers 403 to anyone else): the Grimoire's rows of
// the shared Permissions tab as checkboxes, one row per gesture, one column per rank of the Rôles tab. A box the
// sheet does not hold yet is marked « à graver ». Nothing is written until the tester confirms; the route writes
// the Grimoire's rows only (lib/droits.ts, script v3p 'permissions'), never the Table's.

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

  const absente = (g: Geste, c: { dansFeuille: boolean }) => !(d?.ecrites[g] && c.dansFeuille)
  const aGraver = d ? GESTES.some((g) => d.colonnes.some((c) => absente(g.cle, c))) : false

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
  const sansMembre = !d.roles.some((r) => r.cle === 'membre' && r.id)

  return (
    <>
      <p className="perm-etat">
        {!d.lu
          ? 'Le script de la feuille ne lit pas encore les onglets « Rôles » et « Permissions » (v3p) : nul n’entre ni n’agit, hormis les testeurs, et rien ne peut être gravé.'
          : !d.colonnes.length
            ? 'L’onglet « Rôles » ne nomme aucun rang : qu’on y inscrive chaque rang et l’ID de son rôle Discord, « Membre » le premier. D’ici là, nul n’entre hormis les testeurs.'
            : d.semees
              ? 'Lu dans les lignes « Grimoire » de l’onglet « Permissions ». Une case marquée d’un point n’y est pas encore : décochée tant qu’on ne l’a pas gravée.'
              : 'L’onglet « Permissions » ne tient encore aucune ligne du grimoire : voici les valeurs de départ. Tant qu’elles ne sont pas gravées, nul n’entre hormis les testeurs.'}
      </p>
      {d.lu && d.colonnes.length > 0 && sansMembre && (
        <p className="perm-etat perm-alerte">Aucun rang « Membre » (avec l’ID de son rôle Discord) dans l’onglet « Rôles » : sans lui, personne n’entre ni n’agit, quels que soient ses autres rangs.</p>
      )}

      <div className="perm-cadre">
        <table className="perm-table">
          <thead>
            <tr>
              <th className="perm-geste-tete" scope="col">
                Geste
              </th>
              {d.colonnes.map((c) => (
                <th key={c.cle} scope="col" className={`perm-role ${c.cle === 'membre' ? 'perm-tous' : ''}`} title={c.dansFeuille ? c.nom : `${c.nom} — colonne à graver`}>
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
                      {d.lu && d.semees && !d.ecrites[g.cle] && <span className="perm-depart">à graver</span>}
                    </th>
                    {d.colonnes.map((c) => {
                      const v = Boolean(cases[g.cle]?.[c.cle])
                      const change = v !== Boolean((d.cases as Cases)[g.cle]?.[c.cle])
                      return (
                        <td key={c.cle} className={`${change ? 'perm-change' : ''} ${c.cle === 'membre' ? 'perm-tous' : ''} ${absente(g.cle, c) ? 'perm-absente' : ''}`}>
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
            <button type="button" className="perm-bouton" disabled={!d.lu || !d.colonnes.length || envoi || (changes === 0 && !aGraver)} onClick={() => setConfirmer(true)}>
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
              Graver ce tableau dans les lignes « Grimoire » de l’onglet « Permissions » ? Les lignes de la Table n’y sont pas touchées ; chaque membre verra ses gestes changer à sa prochaine page, et l’entrée à son prochain sceau.
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
        <h2>Les rangs et leur sceau Discord</h2>
        <p>
          Un membre tient chaque rang dont il porte le rôle Discord, d’après l’onglet « Rôles » de la feuille (tenu à la main). Sans le rang « Membre », nul geste ni entrée, quels que soient ses autres rangs ; avec lui, ses gestes sont ceux
          de tous ses rangs réunis. La colonne « Rôle » de Membres n’en est que le reflet, réécrit à chaque sceau, pour les listes des autres membres.
        </p>
        {d.roles.length ? (
          <ul>
            {d.roles.map((r) => (
              <li key={`${r.nom}-${r.id}`}>
                <strong>{r.nom}</strong> · {r.id ? <code>{r.id}</code> : <em>{r.illisible ? 'ID illisible : tape-le comme texte, précédé d’une apostrophe' : 'ID à inscrire'}</em>}
                {d.lu && !d.colonnes.find((c) => c.cle === r.cle)?.dansFeuille && <em className="perm-note"> — sa colonne naîtra au bout de l’onglet au prochain « Graver »</em>}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            <em>{d.lu ? 'L’onglet « Rôles » est vide ou absent : qu’on le crée à la main (Rôle | ID du rôle Discord), un rang par ligne.' : 'Le script de la feuille ne lit pas encore l’onglet « Rôles ».'}</em>
          </p>
        )}
        {sansId.length > 0 && d.roles.length > 0 && (
          <p className="perm-note">
            {sansId.length} rang{sansId.length > 1 ? 's' : ''} sans ID : nul ne le{sansId.length > 1 ? 's' : ''} tient par Discord pour l’heure.
          </p>
        )}
        {d.orphelines.length > 0 && (
          <p className="perm-note">
            Colonne{d.orphelines.length > 1 ? 's' : ''} de l’onglet qu’aucun rang ne nomme, laissée{d.orphelines.length > 1 ? 's' : ''} telle{d.orphelines.length > 1 ? 's' : ''} quelle{d.orphelines.length > 1 ? 's' : ''} : {d.orphelines.join(', ')}.
          </p>
        )}
        {d.inconnues.length > 0 && (
          <p className="perm-note">
            Ligne{d.inconnues.length > 1 ? 's' : ''} « Grimoire » que ce grimoire ne connaît pas, laissée{d.inconnues.length > 1 ? 's' : ''} telle{d.inconnues.length > 1 ? 's' : ''} quelle{d.inconnues.length > 1 ? 's' : ''} : {d.inconnues.map((l) => l.cle || l.geste).join(', ')}.
          </p>
        )}
        <p className="perm-moi">
          Ton sceau ({d.moi.nom}) :{' '}
          {d.moi.sceauAncien
            ? 'scellé avant que le grimoire ne lise les rôles Discord ; rouvre-le pour qu’il les retienne.'
            : d.moi.rangs.length
              ? `tu portes ${d.moi.rangs.join(', ')}${d.moi.membre ? '' : ' — mais pas « Membre »'}.`
              : 'aucun de tes rôles Discord n’est inscrit dans l’onglet « Rôles ».'}{' '}
          Testeur, tu tiens de toute façon chaque geste.
        </p>
      </section>
    </>
  )
}
