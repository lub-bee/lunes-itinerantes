'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import type { PageAtelier, PageCoffre, PageMetier, PageMissive, PageMissives } from '@/lib/types'
import { idMetier, metierDe, SANS_METIER } from '@/lib/metiers'
import { dateTamrielique, prix } from '@/lib/format'
import { arbre, cle, coutMatieres, enStock, estClose, type Recette, partager, rejouer, texteCycle, type EtatMissive, type LigneBesoin, type Mouvement, type Niveau } from '@/lib/missives'
import type { EtatRegistre } from './Registre'
import { Icone } from './Ornements'

/*
 * The book of Missives: the list of missives, one page per missive (needs, contributions, ledger),
 * the Missive chest (stock and inventory checks with their gaps) and the workshop (recipes and
 * resources). Actions open a slip laid on the left page (components/Fiche.tsx).
 */

export type Fiche =
  | { genre: 'recette'; nom: string }
  | { genre: 'edition-recette'; nom: string; artisan?: string }
  | { genre: 'ressource'; nom: string }
  | { genre: 'missive' }
  | { genre: 'releve'; numero?: string }
  | { genre: 'depot'; numero: string; objet?: string; quantite?: number }
  | { genre: 'fabrication'; numero: string; produit?: string }
  | { genre: 'livrer' | 'abandonner'; numero: string }
  | { genre: 'mouvement'; lignes: Mouvement[] }
  | { genre: 'rang'; cle: string }

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
      <button type="button" className="lien-encre" onClick={() => reg.allerA('ex-libris')}>
        signer l&apos;ex-libris
      </button>
    </p>
  )
}

function Ferme({ r }: { r: EtatRegistre }) {
  if (r.erreur && !r.donnees)
    return (
      <div className="registre-ferme">
        <p>{r.erreur}</p>
        <button type="button" className="lien-encre" onClick={r.relire}>
          renvoyer le coursier
        </button>
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
          <button
            type="button"
            className="lien-encre"
            onClick={() => document.querySelector('[data-pattes]')?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
          >
            voir le partage
          </button>
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
                  a apporté <strong>{prix(Math.round(c.total * 100) / 100)}</strong> septims de valeur
                  {c.depots > 0 && c.facons > 0 && <> (dépôts {prix(Math.round(c.depots * 100) / 100)}, façonnage {prix(Math.round(c.facons * 100) / 100)})</>}
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

export function GaucheAtelier({ page, reg, icones, compact }: { page: PageAtelier; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const r = reg?.r
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
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

export function DroiteAtelier({ page, reg, interactif, icones }: { page: PageAtelier; reg?: CtxRegistre; interactif: boolean; icones: Record<string, string> }) {
  const r = reg?.r
  if (!r?.donnees?.relie || !reg) return null
  const recettes = [...r.donnees.recettes].sort((a, b) => a.produit.localeCompare(b.produit, 'fr'))
  const ressources = [...r.donnees.ressources].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  const tab = interactif ? 0 : -1
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
                    {m.recettes.length} recette{m.recettes.length > 1 ? 's' : ''}
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
  return (
    <div className="atelier-droite">
      <h3 className="titre-section">Le registre des matières</h3>
      <p className="note-encre">Ce que la caravane récolte, pille, façonne ou achète, sans jamais le revendre. Le prix courant pèse aussi les dépôts des missives.</p>
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
          {ressources.map((x) => (
            <div
              key={x.nom}
              role="button"
              tabIndex={tab}
              className="ligne matiere"
              onClick={() => reg.ouvrir({ genre: 'ressource', nom: x.nom })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                reg.ouvrir({ genre: 'ressource', nom: x.nom })
              }}
            >
              <span className="noms">
                <span className="nom-fr">{x.nom}</span>
                {x.en && <span className="nom-en">{x.en}</span>}
              </span>
              <span className="points-conduite" aria-hidden />
              <span className="prix">{prix(x.prix)}</span>
              <span className="prix prix-affaire">{prix(x.bonneAffaire)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Stock in the chest of one item (for the slips). */
export const auCoffre = (reg: CtxRegistre, nom: string) => (reg.r.donnees ? enStock(rejouer(reg.r.donnees.mouvements).stock, nom) : 0)

/* ───────────────────────── One craft of the workshop ───────────────────────── */

/** Recipes grouped by craft (« Artisan »), known crafts by name, « Sans métier » last. */
export function metiersDe(recettes: Recette[]) {
  const par = new Map<string, ReturnType<typeof metierDe> & { recettes: Recette[] }>()
  for (const r of recettes) {
    const m = metierDe(r.artisan)
    const g = par.get(m.cle) ?? { ...m, recettes: [] }
    g.recettes.push(r)
    par.set(m.cle, g)
  }
  return [...par.values()].sort((a, b) => (a.cle === SANS_METIER.cle ? 1 : b.cle === SANS_METIER.cle ? -1 : a.nom.localeCompare(b.nom, 'fr')))
}

export function GaucheMetier({ page, reg, icones, compact }: { page: PageMetier; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const r = reg?.r
  const m = metierDe(page.metier)
  return (
    <>
      {!compact && m.intro && <p className="intro lettrine">{m.intro}</p>}
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

export function DroiteMetier({ page, reg, interactif, anglais }: { page: PageMetier; reg?: CtxRegistre; interactif: boolean; anglais: (nom: string) => string }) {
  const r = reg?.r
  if (!r?.donnees?.relie || !reg) return null
  const c = r.calcul
  const k = metierDe(page.metier).cle
  const recettes = r.donnees.recettes.filter((x) => metierDe(x.artisan).cle === k).sort((a, b) => a.produit.localeCompare(b.produit, 'fr'))
  const tab = interactif ? 0 : -1
  return (
    <div className="atelier-droite">
      <h3 className="titre-section">Recettes consignées</h3>
      <p className="note-encre">Touche une recette pour voir tout ce qu’elle demande, jusqu’aux matières premières, et ce qu’elles coûtent.</p>
      {recettes.length ? (
        <ul className="liste-recettes">
          {recettes.map((x) => (
            <li key={x.produit}>
              <button type="button" tabIndex={tab} onClick={() => reg.ouvrir({ genre: 'recette', nom: x.produit })}>
                <span className="noms">
                  <span className="entree">{x.produit}</span>
                  {anglais(x.produit) && <span className="nom-en">{anglais(x.produit)}</span>}
                </span>
                <span className="points" />
                <span className="renvoi">
                  {c && (() => {
                    const cout = coutMatieres(arbre(x.produit, x.rendement, c.recettes), r.donnees!.ressources).cout
                    return cout ? <b>{prix(cout)} septims</b> : null
                  })()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide-encre">Plus aucune recette pour ce métier.</p>
      )}
    </div>
  )
}
