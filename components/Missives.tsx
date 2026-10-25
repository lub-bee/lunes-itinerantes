'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import type { PageAtelier, PageCoffre, PageMetier, PageMissive, PageMissives, PageVentes } from '@/lib/types'
import { idMetier, metierDe, SANS_METIER } from '@/lib/metiers'
import { dateTamrielique, prix, prixParLot, septims } from '@/lib/format'
import { nomsCorrespondent } from '@/lib/recherche'
import { quantiteLue } from '@/lib/commande'
import { arbre, cle, coutMatieres, enStock, estClose, estMatiere, parProduit, recetteUsage, variantesDe, type Recette, type Ressource, type Vente, partager, rejouer, texteCycle, type EtatMissive, type LigneBesoin, type Mouvement, type Niveau } from '@/lib/missives'
import type { EtatRegistre } from './Registre'
import { Action, Icone, Plume, Septims } from './Ornements'

/*
 * The book of Missives: the list of missives, one page per missive (needs, contributions, ledger),
 * the Missive chest (stock and inventory checks with their gaps) and the workshop (recipes and
 * resources). Actions open a slip laid on the left page (components/Fiche.tsx).
 */

export type Fiche =
  | { genre: 'recette'; nom: string; variante?: number }
  /** `variante`: the recipe edited (else the usual one); `nouvelle`: a new recipe (variant) of that product. */
  | { genre: 'edition-recette'; nom: string; artisan?: string; variante?: number; nouvelle?: boolean }
  | { genre: 'ressource'; nom: string }
  | { genre: 'missive' }
  | { genre: 'releve'; numero?: string }
  | { genre: 'depot'; numero: string; objet?: string; quantite?: number }
  | { genre: 'fabrication'; numero: string; produit?: string }
  | { genre: 'livrer' | 'abandonner'; numero: string }
  | { genre: 'mouvement'; lignes: Mouvement[] }
  | { genre: 'rang'; cle: string }
  /** `chapitre`: the chapter page it is added from (a merchandise with no recipe yet). */
  | { genre: 'vente'; nom: string; chapitre?: string }
  | { genre: 'poeme'; divinite: string; n: number }

export type CtxRegistre = {
  r: EtatRegistre
  ouvrir: (f: Fiche) => void
  /** Turns to the page of that id. */
  allerA: (id: string) => void
}

export const idMissive = (numero: string) => `missive-${numero}`

export const quantite = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)

/** Tamrielic day and the hour (JST), for the ledger. */
export function quand(iso: string): string {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return iso
  const h = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  return `${dateTamrielique(iso)}, ${h.replace(':', ' h ')}`
}

/** The day above the hour (narrow columns of the ledger). */
function Quand({ iso }: { iso: string }) {
  const [jour, heure] = quand(iso).split(', ')
  return (
    <>
      <span className="quand-jour">{jour}</span>
      {heure && <span className="quand-heure">{heure}</span>}
    </>
  )
}

/** An échéance typed as a date reads as a Tamrielic day; free text stays as written. */
export const echeance = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? dateTamrielique(s) : s)

/* ───────────────────────── Small pieces ───────────────────────── */

/** Progress drawn in ink: a ruled line, the inked part over it. Static (no animation). */
export function Jauge({ avance, titre }: { avance: number; titre?: string }) {
  const a = Math.max(0, Math.min(1, avance))
  return (
    <span className="jauge" role="img" aria-label={titre ?? `${Math.round(a * 100)} %`}>
      <span className="jauge-encre" style={{ transform: `scaleX(${a})` }} />
    </span>
  )
}

export function Geste({ icone, children, onClick, disabled }: { icone?: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="geste" onClick={onClick} disabled={disabled}>
      <span className="geste-cachet" aria-hidden>
        <Icone corps={icone} />
      </span>
      <span className="geste-mot">{children}</span>
    </button>
  )
}

/**
 * The book is signed once, on its ex-libris; nothing is shown here then. Not signed (it should not
 * happen: the book stays on its ex-libris until it is signed) → a way back to it.
 */
export function Signature({ reg }: { reg: CtxRegistre }) {
  const m = reg.r.marchand
  if (!m || !m.relie || m.identite) return null
  return (
    <p className="signature-membre">
      Ton nom n&apos;est pas encore écrit à l&apos;ex-libris.{' '}
      <Action icone="signer" onClick={() => reg.allerA('ex-libris')}>
        signer l&apos;ex-libris
      </Action>
    </p>
  )
}

function Ferme({ r }: { r: EtatRegistre }) {
  if (r.erreur && !r.donnees)
    return (
      <div className="registre-ferme">
        <p>{r.erreur}</p>
        <Action icone="coursier" onClick={r.relire}>
          renvoyer le coursier
        </Action>
      </div>
    )
  if (!r.donnees) return <p className="registre-ferme attente-encre">Le scribe déroule le registre…</p>
  if (!r.donnees.relie) return <p className="registre-ferme">Le registre des missives n&apos;est pas encore relié au grimoire. Qu&apos;un patriarche y pourvoie.</p>
  return null
}

const ouvert = (r: EtatRegistre) => Boolean(r.donnees?.relie && r.calcul)

/* ───────────────────────── The list of missives ───────────────────────── */

export function GaucheMissives({ page, reg, icones, compact }: { page: PageMissives; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const r = reg?.r
  const enCours = r?.calcul?.etats.filter((e) => !estClose(e.missive)).length ?? 0
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {r && <Ferme r={r} />}
      {r && reg && ouvert(r) && (
        <>
          <Signature reg={reg} />
          {r.marchand?.droits?.missive !== false && (
            <div className="gestes">
              <Geste icone={icones['scroll-quill']} onClick={() => reg.ouvrir({ genre: 'missive' })}>
                Écrire une missive
              </Geste>
            </div>
          )}
          <p className="decompte">
            {enCours ? `${enCours} missive${enCours > 1 ? 's' : ''} en cours` : 'Aucune missive en cours : la caravane attend ses commanditaires.'}
          </p>
        </>
      )}
    </>
  )
}

function EntreeMissive({ e, reg, tab }: { e: EtatMissive; reg: CtxRegistre; tab: number }) {
  const m = e.missive
  const close = estClose(m)
  return (
    <li>
      <button type="button" className={`entree-missive ${close ? 'close' : ''} ${m.statut === 'inachevée' ? 'inachevee' : ''}`} tabIndex={tab} onClick={() => reg.allerA(idMissive(m.numero))}>
        <span className="entree-missive-titre">{m.titre}</span>
        <span className="entree-missive-gauche">
          {m.commanditaire && <span>pour {m.commanditaire}</span>}
          {close ? (
            <span>
              {m.statut}
              {m.recompense ? `, ${prix(m.recompense)} septims partagés` : ''}
            </span>
          ) : (
            m.echeance && <span>échéance : {echeance(m.echeance)}</span>
          )}
          {!close && (
            <span className="entree-missive-avance">
              <Jauge avance={e.avance} />
              <span className="avance-chiffre">{Math.round(e.avance * 100)} %</span>
            </span>
          )}
        </span>
        <span className="entree-missive-biens">
          {m.lignes.map((l) => (
            <span key={l.produit}>
              <b>{quantite(l.quantite)}</b> {l.produit}
            </span>
          ))}
        </span>
      </button>
    </li>
  )
}

export function DroiteMissives({ reg, interactif }: { reg?: CtxRegistre; interactif: boolean }) {
  const etats = reg?.r.calcul?.etats ?? []
  const enCours = etats.filter((e) => !estClose(e.missive)).reverse()
  const closes = etats.filter((e) => estClose(e.missive)).reverse()
  const tab = interactif ? 0 : -1
  if (!reg?.r.donnees?.relie) return null
  return (
    <div className="missives-liste">
      <h3 className="titre-section">Missives en cours</h3>
      {enCours.length ? (
        <ul className="liste-missives">{enCours.map((e) => <EntreeMissive key={e.missive.numero} e={e} reg={reg} tab={tab} />)}</ul>
      ) : (
        <p className="vide-encre">Nulle missive n&apos;attend la caravane.</p>
      )}
      {closes.length > 0 && (
        <>
          <h3 className="titre-section">Missives closes</h3>
          <ul className="liste-missives">{closes.map((e) => <EntreeMissive key={e.missive.numero} e={e} reg={reg} tab={tab} />)}</ul>
        </>
      )}
    </div>
  )
}

/* ───────────────────────── One missive ───────────────────────── */

const etatDe = (reg: CtxRegistre | undefined, numero: string) => reg?.r.calcul?.etats.find((e) => e.missive.numero === numero)

export function GaucheMissive({ page, reg, icones }: { page: PageMissive; reg?: CtxRegistre; icones: Record<string, string> }) {
  const e = etatDe(reg, page.numero)
  if (!reg || !e) return reg ? <Ferme r={reg.r} /> : null
  const m = e.missive
  const close = estClose(m)
  const droits = reg.r.marchand?.droits
  const permis = (a: keyof NonNullable<typeof droits>) => droits?.[a] !== false
  return (
    <>
      <div className="missive-meta">
        {m.commanditaire && <p className="missive-pour">pour {m.commanditaire}</p>}
        {m.echeance && !close && <p>Échéance : <strong>{echeance(m.echeance)}</strong></p>}
        <p>
          Écrite par {m.ecritePar || 'une patte anonyme'}
          {m.horodatage && <> le {dateTamrielique(m.horodatage)}</>}
        </p>
        {close && (
          <p className={`missive-close ${m.statut === 'inachevée' ? 'inachevee' : ''}`}>
            {m.statut === 'livrée' ? 'Livrée' : 'Close inachevée'}
            {m.closeLe && <> le {dateTamrielique(m.closeLe)}</>}
            {m.closePar && <> par {m.closePar}</>}
            {m.recompense ? <> — récompense de {prix(m.recompense)} septims</> : null}
            {m.noteCloture && <em> ({m.noteCloture})</em>}
          </p>
        )}
        {close && (
          <Action icone="partage" onClick={() => document.querySelector('[data-pattes]')?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
            voir le partage
          </Action>
        )}
      </div>
      {/* The goods themselves are in the table on the right page: one line here, the actions right after. */}
      <p className="missive-resume">
        {e.lignes.length} marchandise{e.lignes.length > 1 ? 's' : ''} demandée{e.lignes.length > 1 ? 's' : ''}
        {!close && <> · {Math.round(e.avance * 100)} % réuni</>}
      </p>
      {!close && (
        <>
          <Signature reg={reg} />
          <div className="gestes">
            {permis('releve') && <Geste icone={icones['magnifying-glass']} onClick={() => reg.ouvrir({ genre: 'releve', numero: m.numero })}>Relever le coffre</Geste>}
            {permis('depot') && <Geste icone={icones['open-chest']} onClick={() => reg.ouvrir({ genre: 'depot', numero: m.numero })}>Déposer au coffre</Geste>}
            {permis('fabrication') && <Geste icone={icones['anvil-impact']} onClick={() => reg.ouvrir({ genre: 'fabrication', numero: m.numero })}>Façonner</Geste>}
            {permis('cloture') && <Geste icone={icones['hand-truck']} onClick={() => reg.ouvrir({ genre: 'livrer', numero: m.numero })}>Livrer la missive</Geste>}
            {permis('cloture') && <Geste icone={icones['wax-seal']} onClick={() => reg.ouvrir({ genre: 'abandonner', numero: m.numero })}>Abandonner la missive</Geste>}
          </div>
        </>
      )}
    </>
  )
}

/** « à façonner : N » for an item with a recipe, when some must be made: units for what is missing (whole crafts). */
function AFaconner({ b }: { b: LigneBesoin }) {
  if (b.rendement === null || !b.fournees) return null
  const n = b.fournees * b.rendement
  return (
    <em className="a-faconner" title={`${b.fournees} fournée${b.fournees > 1 ? 's' : ''} à faire pour ce qui manque (une fournée donne ${quantite(b.rendement)})`}>
      à façonner : {quantite(n)}
    </em>
  )
}

/** A quill's tick, slightly irregular: all is gathered. */
export function Coche({ titre = 'réuni' }: { titre?: string }) {
  return (
    <svg className="coche" viewBox="0 0 24 18" role="img" aria-label={titre}>
      <title>{titre}</title>
      <path d="M2.2 9.6c1.6 1 3 2.3 4.3 4.1.3.4.7.4 1 0C10.6 9 14.5 4.8 21.6 1.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.4 10.6c1.2.9 2.3 2 3.3 3.4" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".55" />
    </svg>
  )
}

/**
 * « par la recette N »: for an item with several recipes (or a raw material that also has one), the
 * recipe this missive uses, or buying it; changed at once for everyone (stored with the missive).
 */
function ChoixRecette({ nom, e, reg, ouverte }: { nom: string; e: EtatMissive; reg: CtxRegistre; ouverte: boolean }) {
  const d = reg.r.donnees
  if (!d) return null
  const vs = variantesDe(d.recettes, nom)
  const matiere = estMatiere(d.ressources, nom)
  if (!(vs.length > 1 || (matiere && vs.length > 0))) return null
  const usage = recetteUsage(vs)!
  const voulu = e.missive.choix.find((c) => cle(c.nom) === cle(nom))?.variante
  const actuel = voulu ?? (matiere ? 0 : usage.variante)
  const mot = (v: number) => (v === 0 ? 'acheté' : `par la recette ${v}${v === usage.variante && vs.length > 1 ? ' (d’usage)' : ''}`)
  if (!ouverte || reg.r.marchand?.droits?.choix === false) return <em className="besoins-recette">{mot(actuel)}</em>
  const changer = (v: number) => {
    const parDefaut = matiere ? v === 0 : v === usage.variante
    reg.r.agir('choix', { missive: e.missive.numero, nom: vs[0].produit, variante: v === 0 ? 'acheter' : String(v) }, (dd) => ({
      ...dd,
      missives: dd.missives.map((m) =>
        m.numero !== e.missive.numero ? m : { ...m, choix: [...m.choix.filter((c) => cle(c.nom) !== cle(nom)), ...(parDefaut ? [] : [{ nom: vs[0].produit, variante: v }])] },
      ),
    }))
  }
  return (
    <select
      className="besoins-recette"
      value={actuel}
      aria-label={`Recette de ${nom} pour cette missive`}
      onClick={(ev) => ev.stopPropagation()}
      onKeyDown={(ev) => ev.stopPropagation()}
      onChange={(ev) => changer(Number(ev.target.value))}
    >
      {matiere && <option value={0}>acheté</option>}
      {vs.map((v) => (
        <option key={v.variante} value={v.variante}>
          {mot(v.variante)}
        </option>
      ))}
    </select>
  )
}

function LigneBesoinVue({ b, e, reg, ouverte, icones }: { b: LigneBesoin; e: EtatMissive; reg: CtxRegistre; ouverte: boolean; icones: Record<string, string> }) {
  const droits = reg.r.marchand?.droits
  // Progress of the row: what the chest holds (and, for a requested good, what was delivered).
  const fini = e.lignes.find((l) => cle(l.produit) === cle(b.nom) && b.niveau === 'fini')
  const avance = fini ? fini.avance : b.besoin > 0 ? b.auCoffre / b.besoin : 1
  const deposer = ouverte && b.manque > 0 && droits?.depot !== false
  const faconner = ouverte && b.rendement !== null && b.fournees > 0 && droits?.fabrication !== false
  const ouvrirDepot = () => reg.ouvrir({ genre: 'depot', numero: e.missive.numero, objet: b.nom, quantite: b.manque })
  return (
    <div
      className={`besoins-ligne ${b.manque > 0 ? 'manquant' : 'reuni'} ${deposer ? 'actionnable' : ''}`}
      role="row"
      {...(deposer
        ? {
            tabIndex: 0,
            title: `Déposer ${quantite(b.manque)} ${b.nom} au coffre`,
            onClick: ouvrirDepot,
            onKeyDown: (ev: React.KeyboardEvent) => {
              if (ev.target !== ev.currentTarget || (ev.key !== 'Enter' && ev.key !== ' ')) return
              ev.preventDefault()
              ouvrirDepot()
            },
          }
        : {})}
    >
      <span className="besoins-nom">
        <span className="besoins-mot">
          {b.nom}
          {faconner && (
            <button
              type="button"
              className="besoins-faconner"
              title={`Façonner ${b.nom}`}
              aria-label={`Façonner ${b.nom}`}
              onClick={(ev) => {
                ev.stopPropagation()
                reg.ouvrir({ genre: 'fabrication', numero: e.missive.numero, produit: b.nom })
              }}
              onKeyDown={(ev) => ev.stopPropagation()}
            >
              <Icone corps={icones['anvil-impact']} />
            </button>
          )}
        </span>
        <ChoixRecette nom={b.nom} e={e} reg={reg} ouverte={ouverte} />
        {b.niveau !== 'fini' && <AFaconner b={b} />}
        <Jauge avance={avance} />
      </span>
      <span>{quantite(b.besoin)}</span>
      <span>{quantite(b.auCoffre)}</span>
      <span className="besoins-manque">{b.manque > 0 ? quantite(b.manque) : <Coche />}</span>
    </div>
  )
}

/** Needs: the requested goods and their intermediates in one table, the raw materials in another. */
function TableBesoins({ e, reg, interactif, icones, niveaux, premiere }: { e: EtatMissive; reg: CtxRegistre; interactif: boolean; icones: Record<string, string>; niveaux: Niveau[]; premiere: string }) {
  const ouverte = !estClose(e.missive) && interactif && Boolean(reg.r.marchand)
  const groupes = niveaux.map((n) => ({ n, ls: e.besoins.filter((b) => b.niveau === n) })).filter((g) => g.ls.length)
  if (!groupes.length) return null
  return (
    <div className="besoins" role="table">
      <div className="besoins-entete" role="row">
        <span>{premiere}</span>
        <span>Requis</span>
        <span>Au coffre</span>
        <span>Manque</span>
      </div>
      {groupes.map(({ n, ls }, i) => (
        <div key={n} className={`besoins-niveau niveau-${n}`} role="rowgroup">
          {i > 0 && n === 'intermediaire' && <div className="besoins-titre" role="row">Ouvrages intermédiaires</div>}
          {ls.map((b) => (
            <LigneBesoinVue key={b.nom} b={b} e={e} reg={reg} ouverte={ouverte} icones={icones} />
          ))}
        </div>
      ))}
    </div>
  )
}

const VERBES: Record<Mouvement['type'], string> = { relevé: 'compte', dépôt: 'dépose', fabrication: 'façonne', livraison: 'livre', partage: 'reçoit' }

/** One gesture of the ledger in a few words (a craft's inputs and outputs grouped). */
function quoi(g: Mouvement[]): string {
  const m = g[0]
  if (m.type === 'fabrication') return g.filter((x) => x.quantite > 0).map((x) => `${quantite(x.quantite)} ${x.objet}`).join(', ')
  if (m.type === 'partage') return `${quantite(m.quantite)} septims`
  return g.map((x) => `${quantite(Math.abs(x.quantite))} ${x.objet}`).join(', ')
}

/** Ledger rows grouped by gesture (one craft = inputs and outputs). */
function grouper(mouvements: Mouvement[]): Mouvement[][] {
  const groupes: Mouvement[][] = []
  for (const m of mouvements) {
    const dernier = groupes[groupes.length - 1]
    if (m.action && dernier && dernier[0].action === m.action && dernier[0].type === m.type) dernier.push(m)
    else groupes.push([m])
  }
  return groupes
}

/**
 * The ledger, one short line per gesture (who, when, what); touching a line pins a note with its
 * details on the right page. Rows still on their way are faded.
 */
export function Journal({ mouvements, limite = 40, reg, interactif = true }: { mouvements: Mouvement[]; limite?: number; reg?: CtxRegistre; interactif?: boolean }) {
  const vus = grouper(mouvements).reverse().slice(0, limite)
  if (!vus.length) return <p className="vide-encre">Rien encore n&apos;est écrit dans ce journal.</p>
  return (
    <ol className="journal">
      {vus.map((g, i) => {
        const m = g[0]
        return (
          <li key={i} className={`journal-${cle(m.type)} ${m.enAttente ? 'encre-fraiche' : ''}`}>
            <button type="button" tabIndex={interactif ? 0 : -1} disabled={!reg} onClick={() => reg?.ouvrir({ genre: 'mouvement', lignes: g })} title="Voir le détail">
              <strong className="journal-qui">{m.membre}</strong>
              <span className="journal-quand">{quand(m.horodatage)}</span>
              <span className="journal-quoi">
                {VERBES[m.type]} {quoi(g)}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function Contributions({ e, nbMembres }: { e: EtatMissive; nbMembres: number }) {
  const m = e.missive
  const close = estClose(m)
  const p = close && m.recompense ? partager(m.recompense, m.partCommune ?? 0, nbMembres, e.contributions) : null
  const recus = new Map(e.journal.filter((x) => x.type === 'partage').map((x) => [cle(x.membre), x.quantite]))
  return (
    <>
      {!e.contributions.length ? (
        <p className="vide-encre">Nulle patte n&apos;a encore porté cette missive.</p>
      ) : (
        <div className="parts">
          {e.contributions.map((c) => {
            const recu = recus.get(cle(c.membre)) ?? p?.parts.find((x) => cle(x.membre) === cle(c.membre))?.total
            return (
              <div key={c.membre} className="part">
                <span className="part-nom">{c.membre}</span>
                <span className="part-detail">
                  a apporté <strong><Septims v={c.total} /></strong> septims de valeur
                  {c.depots > 0 && c.facons > 0 && <> (dépôts <Septims v={c.depots} />, façonnage <Septims v={c.facons} />)</>}
                  {c.depots === 0 && c.facons > 0 && <> en façonnant</>}
                  {recu !== undefined && <> · a reçu <strong>{prix(recu)}</strong> septims</>}
                </span>
                <Jauge avance={c.part} />
                <span className="part-pc">
                  {Math.round(c.part * 100)} % <em>du mérite</em>
                </span>
              </div>
            )
          })}
        </div>
      )}
      {p && (
        <p className="partage-commun">
          Part commune de {prix(p.partCommune)} % : {prix(p.base)} septims à chacun des {p.nbMembres} membres de la caravane ; le reste, {prix(p.merite)} septims, au
          mérite.
        </p>
      )}
    </>
  )
}

const EXPLICATION_PARTS =
  "Chaque apport est pesé en septims : le coût de production consigné au registre, sinon celui de sa recette, sinon la valeur de la matière. Façonner rapporte ce que l'ouvrage vaut de plus que ses matières."

export function DroiteMissive({ page, reg, interactif, icones }: { page: PageMissive; reg?: CtxRegistre; interactif: boolean; icones: Record<string, string> }) {
  const e = etatDe(reg, page.numero)
  if (!reg || !e) return null
  const close = estClose(e.missive)
  return (
    <div className="missive-droite">
      <h3 className="titre-section">{close ? 'Ce qu’il fallait réunir, à la clôture' : 'Ce qu’il faut réunir'}</h3>
      {e.cycle ? (
        <p className="message-encre erreur">{texteCycle(e.cycle)}</p>
      ) : (
        <>
          <TableBesoins e={e} reg={reg} interactif={interactif} icones={icones} niveaux={['fini', 'intermediaire']} premiere="Marchandises demandées" />
          {e.besoins.some((b) => b.niveau === 'brut') && (
            <>
              <h3 className="titre-section">Matières premières</h3>
              <TableBesoins e={e} reg={reg} interactif={interactif} icones={icones} niveaux={['brut']} premiere="Matière" />
            </>
          )}
        </>
      )}
      <h3 className="titre-section" title={EXPLICATION_PARTS} data-pattes>
        Les pattes de la missive
      </h3>
      <Contributions e={e} nbMembres={reg.r.donnees?.nbMembres ?? 0} />
      <h3 className="titre-section">Journal du coffre</h3>
      <Journal mouvements={e.journal} reg={reg} interactif={interactif} />
    </div>
  )
}

/* ───────────────────────── The chest ───────────────────────── */

export function GaucheCoffre({ page, reg, icones, compact }: { page: PageCoffre; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const r = reg?.r
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {r && <Ferme r={r} />}
      {r && reg && ouvert(r) && (
        <>
          <Signature reg={reg} />
          {r.marchand?.droits?.releve !== false && (
            <div className="gestes">
              <Geste icone={icones['magnifying-glass']} onClick={() => reg.ouvrir({ genre: 'releve' })}>
                Relever le coffre
              </Geste>
            </div>
          )}
        </>
      )}
    </>
  )
}

export function DroiteCoffre({ reg }: { reg?: CtxRegistre }) {
  const d = reg?.r.donnees
  if (!d?.relie) return null
  const { stock, releves } = rejouer(d.mouvements)
  const contenu = [...stock.values()].filter((s) => s.qte !== 0).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  const ecarts = releves.filter((x) => x.ecart !== 0)
  return (
    <div className="coffre-droite">
      <h3 className="titre-section">Dans le coffre, selon le registre</h3>
      {contenu.length ? (
        <ul className="inventaire">
          {contenu.map((s) => (
            <li key={s.nom}>
              <span>{s.nom}</span>
              <span className="points" />
              <strong className={s.qte < 0 ? 'negatif' : ''}>{quantite(s.qte)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide-encre">Le coffre sonne creux.</p>
      )}
      <h3 className="titre-section">Relevés du coffre</h3>
      <p className="note-encre">
        Ce qu&apos;on a compté en ouvrant le coffre, face à ce que le registre annonçait. Si le coffre et le registre ne disent pas
        la même chose, quelqu&apos;un a pris ou oublié de consigner.{' '}
        {ecarts.length ? `${ecarts.length} écart${ecarts.length > 1 ? 's' : ''} à éclaircir.` : 'Aucun écart.'}
      </p>
      {releves.length ? (
        <div className="releves" role="table">
          <div className="releves-entete" role="row">
            <span>Quand, qui</span>
            <span>Objet</span>
            <span>Selon le registre</span>
            <span>Compté</span>
            <span>Écart</span>
          </div>
          {[...releves].reverse().map((x, i) => (
            <div key={i} className={`releves-ligne ${x.ecart ? 'ecart' : ''}`} role="row">
              <span className="releves-qui">
                <Quand iso={x.horodatage} />
                <em>{x.membre}</em>
              </span>
              <span>{x.objet}</span>
              <span>{x.premier ? '—' : quantite(x.attendu)}</span>
              <span>{quantite(x.compte)}</span>
              <strong className={x.premier ? 'premier' : ''} title={x.premier ? 'Premier compte de cet objet : rien à comparer.' : undefined}>
                {x.premier ? 'premier compte' : x.ecart ? (x.ecart > 0 ? `+${quantite(x.ecart)}` : quantite(x.ecart)) : 'juste'}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="vide-encre">Personne n&apos;a encore compté le coffre.</p>
      )}
      <h3 className="titre-section">Tout le journal</h3>
      <Journal mouvements={d.mouvements} limite={60} reg={reg} />
    </div>
  )
}

/* ───────────────────────── The workshop ───────────────────────── */

/** A page's own search field (the recipes: by their French or English name). */
export type RechercheLocale = { valeur: string; changer?: (v: string) => void; interactif: boolean }

function ChampRecette({ recherche }: { recherche?: RechercheLocale }) {
  if (!recherche) return null
  return (
    <label className="recherche-locale">
      <Plume className="plume" />
      <input
        type="search"
        value={recherche.interactif ? recherche.valeur : ''}
        readOnly={!recherche.interactif}
        tabIndex={recherche.interactif ? 0 : -1}
        onChange={(e) => recherche.changer?.(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && recherche.changer?.('')}
        placeholder="Chercher une recette (FR ou EN)…"
        aria-label="Chercher une recette, en français ou en anglais"
      />
    </label>
  )
}

/** A recipe matches the page's search and the global one by its French or English name, or its craft. */
const recetteCherchee = (x: Recette & { toutes?: Recette[] }, requetes: string[]) =>
  requetes.every((q) => (x.toutes ?? [x]).some((v) => nomsCorrespondent([v.produit, v.en, metierDe(v.artisan).nom], q)))

/** « 2 recettes » after a product that has several. */
function MentionVariantes({ n }: { n: number }) {
  return n > 1 ? <span className="tampon petit">{n} variantes</span> : null
}

/**
 * What a product's materials cost per unit, recipe by recipe: the usual one first, then the others
 * (« 12 / 15 »), each recipe's own cost visible.
 */
function CoutsRecettes({ x, reg }: { x: Recette & { toutes: Recette[] }; reg: CtxRegistre }) {
  const c = reg.r.calcul
  const ressources = reg.r.donnees?.ressources ?? []
  if (!c) return null
  const ordre = [x, ...x.toutes.filter((v) => v.variante !== x.variante)]
  const couts = ordre.map((v) => {
    const index = new Map(c.recettes).set(cle(v.produit), v)
    return { v, cout: coutMatieres(arbre(v.produit, v.rendement, index), ressources).cout / Math.max(1, v.rendement) }
  })
  if (!couts.some((k) => k.cout > 0)) return null
  return (
    <b title={couts.map((k) => `recette ${k.v.variante}${k.v === x ? ' (d’usage)' : ''} : ${k.cout > 0 ? `${septims(k.cout, true).texte} septims l’unité (${septims(k.cout, true).exactement ?? 'compte rond'})` : 'prix inconnu'}`).join('\n')}>
      {couts.map((k) => (k.cout > 0 ? septims(k.cout, true).texte : '?')).join(' / ')}
    </b>
  )
}

/** The head of a recipe list, as the price ledger's. */
function EnteteRecettes() {
  return (
    <div className="recettes-entete" role="row">
      <span>Ouvrage</span>
      <span>
        Coût <em>l’unité</em>
      </span>
    </div>
  )
}

export function GaucheAtelier({ page, reg, icones, compact, recherche }: { page: PageAtelier; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean; recherche?: RechercheLocale }) {
  const r = reg?.r
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {page.vue === 'recettes' && r?.donnees?.relie && <ChampRecette recherche={recherche} />}
      {r && <Ferme r={r} />}
      {r && reg && ouvert(r) && (
        <div className="gestes">
          {page.vue === 'recettes' && r.marchand?.droits?.recette !== false && (
            <Geste icone={icones['cauldron']} onClick={() => reg.ouvrir({ genre: 'edition-recette', nom: '' })}>
              Consigner une recette
            </Geste>
          )}
          {page.vue === 'matieres' && r.marchand?.droits?.ressource !== false && (
            <Geste icone={icones['wheat']} onClick={() => reg.ouvrir({ genre: 'ressource', nom: '' })}>
              Inscrire une matière
            </Geste>
          )}
        </div>
      )}
    </>
  )
}

export function DroiteAtelier({ page, reg, interactif, icones, requetes = [] }: { page: PageAtelier; reg?: CtxRegistre; interactif: boolean; icones: Record<string, string>; requetes?: string[] }) {
  const r = reg?.r
  if (!r?.donnees?.relie || !reg) return null
  const recettes = [...r.donnees.recettes].sort((a, b) => a.produit.localeCompare(b.produit, 'fr'))
  const ressources = [...r.donnees.ressources].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  const tab = interactif ? 0 : -1
  if (page.vue === 'recettes' && requetes.some(Boolean)) {
    // Searching: every recipe whose French or English name answers, with its craft.
    const trouvees = produitsDe(recettes).filter((x) => recetteCherchee(x, requetes)).sort((a, b) => a.produit.localeCompare(b.produit, 'fr'))
    return (
      <div className="atelier-droite">
        <h3 className="titre-section">Recettes trouvées</h3>
        {trouvees.length > 0 && <EnteteRecettes />}
        {trouvees.length ? (
          <ul className="liste-recettes">
            {trouvees.map((x) => (
              <li key={x.produit}>
                <button type="button" tabIndex={tab} onClick={() => reg.ouvrir({ genre: 'recette', nom: x.produit })}>
                  <span className="noms">
                    <span className="entree">
                      {x.produit} <MentionVariantes n={x.nbRecettes} />
                    </span>
                    {x.en && <span className="nom-en">{x.en}</span>}
                  </span>
                  <span className="points" />
                  <span className="renvoi">
                    <em>{metierDe(x.artisan).nom}</em> <CoutsRecettes x={x} reg={reg} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vide-encre">Nulle recette de ce nom, ni en français ni en anglais.</p>
        )}
      </div>
    )
  }
  if (page.vue === 'recettes') {
    // The recipes' contents: one entry per craft, with its count of recipes.
    const metiers = metiersDe(recettes)
    return (
      <div className="atelier-droite">
        <h3 className="titre-section">Les métiers de l’atelier</h3>
        <p className="note-encre">Chaque métier a son onglet et ses recettes. Touche un métier pour l’ouvrir.</p>
        {metiers.length ? (
          <ul className="liste-recettes liste-metiers">
            {metiers.map((m) => (
              <li key={m.cle}>
                <button type="button" tabIndex={tab} onClick={() => reg.allerA(idMetier(m.cle))}>
                  <span className="metier-icone" aria-hidden>
                    <Icone corps={icones[m.icone]} />
                  </span>
                  <span className="entree">{m.nom}</span>
                  <span className="points" />
                  <span className="renvoi">
                    {m.recettes.length} ouvrage{m.recettes.length > 1 ? 's' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vide-encre">Aucune recette encore : que les artisans prennent la plume.</p>
        )}
      </div>
    )
  }
  return <RegistreMatieres reg={reg} tab={tab} ressources={ressources} />
}

/**
 * The raw materials' buying ledger, filtered by craft (a material belongs to every craft whose recipes
 * use it, several at once) or to those still without a price, so the registre gets completed.
 */
function RegistreMatieres({ reg, tab, ressources }: { reg: CtxRegistre; tab: number; ressources: Ressource[] }) {
  const d = reg.r.donnees!
  const [filtre, setFiltre] = useState<string>('')
  // Raw materials that also have a recipe (bought by default; a missive may craft them).
  const fabricables = new Set(d.recettes.map((x) => cle(x.produit)))
  // The crafts of each material: those of the recipes using it.
  const metiersDe_ = new Map<string, Set<string>>()
  for (const x of d.recettes) for (const i of x.ingredients) {
    const k = cle(i.nom)
    metiersDe_.set(k, (metiersDe_.get(k) ?? new Set()).add(metierDe(x.artisan).nom))
  }
  const metiers = [...new Set([...metiersDe_.values()].flatMap((m) => [...m]))].sort((a, b) => a.localeCompare(b, 'fr'))
  const sansPrix = ressources.filter((x) => x.prix === null)
  const montrees = ressources.filter((x) => (filtre === 'sans-prix' ? x.prix === null : !filtre || metiersDe_.get(cle(x.nom))?.has(filtre)))
  const puce = (k: string, mot: ReactNode) => (
    <button type="button" tabIndex={tab} className={`puce ${filtre === k ? 'active' : ''}`} aria-pressed={filtre === k} onClick={() => setFiltre(filtre === k ? '' : k)}>
      {mot}
    </button>
  )
  return (
    <div className="atelier-droite">
      <h3 className="titre-section">Le registre des matières</h3>
      <p className="note-encre">
        Ce que la caravane récolte, pille, façonne ou achète, sans jamais le revendre. Le prix courant pèse aussi les dépôts des missives.
        {sansPrix.length > 0 && <> <strong className="sans-prix-compte">{sansPrix.length} matière{sansPrix.length > 1 ? 's' : ''} sans prix</strong> : qu’on les estime.</>}
      </p>
      <div className="puces" role="group" aria-label="Filtrer les matières">
        {puce('', 'Toutes')}
        {sansPrix.length > 0 && puce('sans-prix', <>sans prix <em>({sansPrix.length})</em></>)}
        {metiers.map((m) => puce(m, m))}
      </div>
      <div className="registre matieres">
        <div className="registre-entete matieres-entete" role="row">
          <span className="col-article">Matière</span>
          <span>
            <span className="long">Prix courant</span>
            <span className="court">Prix</span>
          </span>
          <span>
            <span className="long">Bonne affaire</span>
            <span className="court">Affaire</span>
          </span>
        </div>
        <div className="registre-corps">
          {montrees.map((x) => (
            <div
              key={x.nom}
              role="button"
              tabIndex={tab}
              className={`ligne matiere ${x.prix === null ? 'sans-prix' : ''}`}
              onClick={() => reg.ouvrir(fabricables.has(cle(x.nom)) ? { genre: 'recette', nom: x.nom } : { genre: 'ressource', nom: x.nom })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                reg.ouvrir(fabricables.has(cle(x.nom)) ? { genre: 'recette', nom: x.nom } : { genre: 'ressource', nom: x.nom })
              }}
            >
              <span className="noms">
                <span className="nom-fr">
                  {x.nom}
                  {fabricables.has(cle(x.nom)) && <span className="tampon petit">se fabrique aussi</span>}
                </span>
                {x.en && <span className="nom-en">{x.en}</span>}
              </span>
              <span className="points-conduite" aria-hidden />
              {/* Prices of one lot (« 1 les 3 »); the computations use price ÷ lot. */}
              <span className="prix" title={x.prix !== null ? prixParLot(x.prix, x.lot) : undefined}>
                {x.prix === null ? <em className="a-estimer">à estimer</em> : prix(x.prix)}
                {x.prix !== null && (x.lot ?? 1) > 1 && <em className="par-lot">les {x.lot}</em>}
              </span>
              <span className="prix prix-affaire" title={x.bonneAffaire !== null ? prixParLot(x.bonneAffaire, x.lot) : undefined}>
                {prix(x.bonneAffaire)}
                {x.bonneAffaire !== null && (x.lot ?? 1) > 1 && <em className="par-lot">les {x.lot}</em>}
              </span>
            </div>
          ))}
          {!montrees.length && <p className="vide-encre">Nulle matière ici.</p>}
        </div>
      </div>
    </div>
  )
}

/** Stock in the chest of one item (for the slips). */
export const auCoffre = (reg: CtxRegistre, nom: string) => (reg.r.donnees ? enStock(rejouer(reg.r.donnees.mouvements).stock, nom) : 0)

/* ───────────────────────── One craft of the workshop ───────────────────────── */

/** One entry per product: its usual recipe, and how many it has. */
export function produitsDe(recettes: Recette[]): (Recette & { nbRecettes: number; toutes: Recette[] })[] {
  return [...parProduit(recettes).values()].map((vs) => ({ ...recetteUsage(vs)!, nbRecettes: vs.length, toutes: vs }))
}

/** Products grouped by craft (« Artisan » of the usual recipe), known crafts by name, « Sans métier » last. */
export function metiersDe(recettes: Recette[]) {
  const par = new Map<string, ReturnType<typeof metierDe> & { recettes: Recette[] }>()
  for (const r of produitsDe(recettes)) {
    const m = metierDe(r.artisan)
    const g = par.get(m.cle) ?? { ...m, recettes: [] }
    g.recettes.push(r)
    par.set(m.cle, g)
  }
  return [...par.values()].sort((a, b) => (a.cle === SANS_METIER.cle ? 1 : b.cle === SANS_METIER.cle ? -1 : a.nom.localeCompare(b.nom, 'fr')))
}

export function GaucheMetier({ page, reg, icones, compact, recherche }: { page: PageMetier; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean; recherche?: RechercheLocale }) {
  const r = reg?.r
  const m = metierDe(page.metier)
  return (
    <>
      {!compact && m.intro && <p className="intro lettrine">{m.intro}</p>}
      {r?.donnees?.relie && <ChampRecette recherche={recherche} />}
      {r && <Ferme r={r} />}
      {r && reg && ouvert(r) && r.marchand?.droits?.recette !== false && (
        <div className="gestes">
          <Geste icone={icones['cauldron']} onClick={() => reg.ouvrir({ genre: 'edition-recette', nom: '', artisan: m.cle === SANS_METIER.cle ? '' : m.nom })}>
            Consigner une recette
          </Geste>
        </div>
      )}
    </>
  )
}

export function DroiteMetier({ page, reg, interactif, anglais, requetes = [] }: { page: PageMetier; reg?: CtxRegistre; interactif: boolean; anglais: (nom: string) => string; requetes?: string[] }) {
  const r = reg?.r
  if (!r?.donnees?.relie || !reg) return null
  const c = r.calcul
  const k = metierDe(page.metier).cle
  const toutes = produitsDe(r.donnees.recettes).filter((x) => metierDe(x.artisan).cle === k)
  const recettes = toutes.filter((x) => recetteCherchee(x, requetes)).sort((a, b) => a.produit.localeCompare(b.produit, 'fr'))
  const tab = interactif ? 0 : -1
  return (
    <div className="atelier-droite">
      <h3 className="titre-section">Recettes consignées</h3>
      <p className="note-encre">Touche une recette pour voir tout ce qu’elle demande, jusqu’aux matières premières, et ce qu’elles coûtent.</p>
      {recettes.length > 0 && <EnteteRecettes />}
      {recettes.length ? (
        <ul className="liste-recettes">
          {recettes.map((x) => (
            <li key={x.produit}>
              <button type="button" tabIndex={tab} onClick={() => reg.ouvrir({ genre: 'recette', nom: x.produit })}>
                <span className="noms">
                  <span className="entree">
                    {x.produit} <MentionVariantes n={x.nbRecettes} />
                  </span>
                  {(x.en || anglais(x.produit)) && <span className="nom-en">{x.en || anglais(x.produit)}</span>}
                </span>
                <span className="points" />
                <span className="renvoi">
                  <CoutsRecettes x={x} reg={reg} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide-encre">{toutes.length ? 'Nulle recette de ce nom pour ce métier, ni en français ni en anglais.' : 'Plus aucune recette pour ce métier.'}</p>
      )}
    </div>
  )
}

/* ───────────────────────── The signed member's sales ───────────────────────── */

/** Septims an order brought (the prices really agreed when written, else the lines' totals). */
const montantVente = (v: Vente) => v.lignes.reduce((t, l) => t + (l.prixReel ?? l.total ?? 0), 0)

export function GaucheVentes({ page, reg, compact }: { page: PageVentes; reg?: CtxRegistre; compact: boolean }) {
  const r = reg?.r
  const ventes = r?.donnees?.ventes
  const aVerser = ventes?.filter((v) => !v.versee).length ?? 0
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {r && <Ferme r={r} />}
      {reg && <Signature reg={reg} />}
      {ventes && ventes.length > 0 && (
        <p className="missive-resume">
          {ventes.length} vente{ventes.length > 1 ? 's' : ''}, {aVerser ? <strong className="a-verser">{aVerser} part{aVerser > 1 ? 's' : ''} à verser</strong> : 'toutes les parts versées'}
          <br />
          <Septims v={ventes.reduce((t, v) => t + montantVente(v), 0)} /> septims en tout
        </p>
      )}
    </>
  )
}

/**
 * The caravan's share of one sale: « Part à verser » with an optional amount (the Patriarchs set it) and
 * the gesture to record it as handed over; once recorded, who and when, and the way to take it back.
 */
function Versement({ v, reg }: { v: Vente; reg: CtxRegistre }) {
  const [montant, setMontant] = useState('')
  const peut = reg.r.marchand?.droits?.versement !== false
  const ecrire = (versee: boolean) => {
    const m = montant.trim() ? Number(montant.replace(',', '.')) : null
    reg.r.agir('versement', { numero: v.numero, versee, montant: m }, (d) => ({
      ...d,
      ventes: d.ventes?.map((x) =>
        x.numero !== v.numero
          ? x
          : versee
            ? { ...x, versee, verseeLe: new Date().toISOString(), verseePar: reg.r.marchand?.identite ?? '', montantVerse: m !== null && Number.isFinite(m) ? m : null }
            : { ...x, versee, verseeLe: '', verseePar: '', montantVerse: null },
      ),
    }))
    setMontant('')
  }
  if (v.versee)
    return (
      <div className="versement versee">
        <span className="tampon petit">Part versée</span>
        <em>
          {v.verseeLe && <>le {dateTamrielique(v.verseeLe)}</>}
          {v.verseePar && <> par {v.verseePar}</>}
          {v.montantVerse !== null && <> · {prix(v.montantVerse)} septims</>}
        </em>
        {peut && (
          <Action icone="annuler" onClick={() => ecrire(false)}>
            annuler
          </Action>
        )}
      </div>
    )
  return (
    <div className="versement">
      <span className="a-verser">Part à verser</span>
      {peut && (
        <>
          <input
            type="text"
            inputMode="decimal"
            value={montant}
            onChange={(e) => setMontant(e.target.value.replace(/[^\d.,]/g, '').slice(0, 10))}
            placeholder="montant ?"
            aria-label={`Montant versé au coffre pour le bon n° ${v.numero} (facultatif)`}
            title="Facultatif : le montant est fixé par les Patriarches"
          />
          <Action icone="verser" onClick={() => ecrire(true)}>
            versée au coffre
          </Action>
        </>
      )}
    </div>
  )
}

export function DroiteVentes({ reg }: { reg?: CtxRegistre }) {
  const r = reg?.r
  if (!r?.donnees?.relie || !reg) return null
  if (!r.marchand?.identite) return <p className="vide-encre">Signe d’abord l’ex-libris : le registre ne montre à chacun que ses propres ventes.</p>
  const ventes = r.donnees.ventes
  if (ventes === null || ventes === undefined)
    return <p className="vide-encre">Le scribe du registre ne sait pas encore relire les bons scellés : qu’on recopie le dernier script du grimoire dans la feuille.</p>
  if (!ventes.length) return <p className="vide-encre">Nul bon de commande n’est encore scellé à ton nom. Que la route soit bonne, et la bourse lourde.</p>
  return (
    <div className="ventes">
      {ventes.map((v) => (
        <section key={v.numero} className={`vente ${v.versee ? 'versee' : ''}`}>
          <h4>
            <span>{v.horodatage ? dateTamrielique(v.horodatage) : v.numero}</span>
            <em>n° {v.numero}</em>
          </h4>
          <ul className="detail-lignes">
            {v.lignes.map((l, i) => {
              const unite = quantiteLue(l.quantite, l.unite)
              return (
                <li key={i}>
                  <span>
                    {quantite(l.quantite)} {l.article}
                    {unite && <em className="vente-statut"> ({unite})</em>}
                    {l.horsCatalogue && <em className="vente-statut"> · hors catalogue</em>}
                    {l.statut && <em className="vente-statut"> · {l.statut}</em>}
                  </span>
                  <span className="points" />
                  <strong>
                    <Septims v={l.prixReel ?? l.total} />
                  </strong>
                </li>
              )
            })}
          </ul>
          <p className="vente-total">
            Total <strong><Septims v={montantVente(v)} /></strong> septims
          </p>
          <Versement v={v} reg={reg} />
        </section>
      ))}
    </div>
  )
}
