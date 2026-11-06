'use client'

import { useMemo, useState } from 'react'
import type { Article, PageIntendance } from '@/lib/types'
import { dateTamrielique } from '@/lib/format'
import { avecAnglais, cle, dicoAnglais, enStock, recetteUsage, rejouer, variantesDe, type Stock } from '@/lib/missives'
import { nomDuRegistre } from '@/lib/noms'
import { nomsCorrespondent } from '@/lib/recherche'
import { estEntree, etatFaconnage, etatMission, objetQ, PETITES_LUNES, quoiLigne, tauxDe, TEXTES_FEUILLETS, type LigneIntendance } from '@/lib/intendance'
import { allegements, feuilletClos, fermeLe, pointsDon, prixDon, VERBES, type Allegement, type Demande, type DonneesMissions, type Livraison, type Mission, type Permanente } from '@/lib/missions'
import { Action, Icone } from './Ornements'
import { ChampNom } from './ChampNom'
import { Coche, Geste, Jauge, quand, Signature, type CtxRegistre, type RechercheLocale } from './Missives'
import { Sceller } from './Fiche'
import {
  ChampRecherche,
  ciblesDe,
  destination,
  Ferme,
  gesteLivraison,
  GlypheLivraison,
  GlypheType,
  Inactif,
  LIGNE_VIDE,
  lignesEnvoyees,
  LignesObjets,
  livraisonDu,
  Message,
  Meta,
  MOT_COURT_LIVRAISON,
  moiDe,
  nf,
  nomsObjets,
  OptionsObjets,
  ouvert,
  permis,
  pts,
  useScelle,
  voitPoints,
  type Cible,
  type LigneSaisie,
  type NomsObjets,
} from './MissionsCommun'
import type { EnvMission } from './Missions'

/*
 * The Livre de l'Intendance (Missions v2, lot 2), for the aides de camp, the Argentier and the Patriarchs: « Le
 * coffre » (components/Missives.tsx), « Réception » (everything that enters: hand-overs, gifts, returns from the
 * artisans; the members' declarations answered yes / no line by line), « Sorties » (materials out to craft, a sale's
 * goods taken from the chest, losses), « Écrire une mission » and the pondération (components/Missions.tsx). Its
 * notes: a member's declaration (« Signaler une remise »), a hand-over or a gift recorded, a craft, an exit. Rules and
 * rows: lib/intendance.ts; the server: app/api/missions.
 */

const idDemande = (numero: string) => `demande-${numero}`
const titreDe = (d: DonneesMissions, numero: string) => {
  const x = d.demandes.find((y) => y.numero === numero)
  return x ? x.titre || `${nf(x.quantite)} ${x.article}` : ''
}
const quandDe = (l: LigneIntendance) => l.le || l.date

/* ───────────────────────── What waits for a yes / no ───────────────────────── */

/**
 * The declarations waiting for someone allowed (« Reçu 50 Bière de Ko'Rasha ? Oui / Non »), and the hand-overs made the
 * prototype's way (a mission « remise »). A member never answers their own.
 */
export function EnAttente({ reg, icones, tab, titre = 'À confirmer' }: { reg: CtxRegistre; icones: Record<string, string>; tab: number; titre?: string }) {
  const d = reg.m!.donnees!
  const moi = moiDe(reg)
  const lignes = d.intendance.filter((l) => estEntree(l) && l.statut === 'en attente')
  const anciennes = d.missions.filter((m) => m.statut === 'remise')
  if (!lignes.length && !anciennes.length) return null
  const repondre = (l: LigneIntendance, oui: boolean) =>
    reg.m!.agir('recevoir', { id: l.id, oui }, (x) => ({ ...x, intendance: x.intendance.map((y) => (y.id === l.id ? { ...y, statut: oui ? 'reçue' : 'refusée', par: moi ?? '', le: new Date().toISOString(), enAttente: true } : y)) }))
  return (
    <section className="en-attente-liste">
      <h3 className="titre-section">
        {titre} <span className="compte-missions">{lignes.length + anciennes.length}</span>
      </h3>
      <ul className="missions-liste">
        {lignes.map((l) => {
          const sienne = Boolean(moi) && cle(l.membre) === cle(moi!)
          return (
            <li key={l.id} className={`mission a-repondre ${l.enAttente ? 'en-attente' : ''}`}>
              <span className="mission-texte">
                <span className="mission-intitule">
                  Reçu {objetQ(l.quantite, l.objet)} de {l.membre} ?
                </span>
                <Meta parts={[l.coffre === PETITES_LUNES ? 'au coffre des petites lunes' : 'remis en main propre', l.mission && (titreDe(d, l.demande) || 'mission permanente'), l.date && `signalé le ${dateTamrielique(l.date)}`, l.note]} />
              </span>
              <span className="mission-cote">
                <span className="mission-gestes">
                  {sienne ? (
                    <em className="mission-meta">une autre patte répondra</em>
                  ) : permis(reg, 'recevoir') ? (
                    <>
                      <Action icone="recu" tabIndex={tab} disabled={l.enAttente || !d.intendanceActive} onClick={() => repondre(l, true)}>
                        oui, reçu
                      </Action>
                      <Action icone="annuler" tabIndex={tab} disabled={l.enAttente || !d.intendanceActive} onClick={() => repondre(l, false)}>
                        non
                      </Action>
                    </>
                  ) : null}
                </span>
              </span>
            </li>
          )
        })}
        {anciennes.map((m) => {
          const sienne = Boolean(moi) && cle(m.prisPar) === cle(moi!)
          return (
            <li key={m.numero} className={`mission a-repondre ${m.enAttente ? 'en-attente' : ''}`}>
              <GlypheType type={m.type} icones={icones} />
              <span className="mission-texte">
                <span className="mission-intitule">
                  Reçu {objetQ(m.quantite, m.objet)} de {m.prisPar} ?
                </span>
                <Meta parts={[m.remiseLe && `remis le ${dateTamrielique(m.remiseLe)}`, 'remise d’avant le Livre de l’Intendance']} />
              </span>
              <span className="mission-cote">
                <span className="mission-gestes">
                  {sienne ? (
                    <em className="mission-meta">une autre patte répondra</em>
                  ) : permis(reg, 'confirmer') ? (
                    <>
                      <Action icone="recu" tabIndex={tab} disabled={m.enAttente} onClick={() => reg.m!.agir('confirmer', { numero: m.numero }, (x) => ({ ...x, missions: x.missions.map((y) => (y.numero === m.numero ? { ...y, statut: 'accomplie', enAttente: true } : y)) }))}>
                        oui, reçu
                      </Action>
                      <Action icone="annuler" tabIndex={tab} disabled={m.enAttente} onClick={() => reg.ouvrir({ genre: 'refus-mission', numero: m.numero })}>
                        non
                      </Action>
                    </>
                  ) : null}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The sales' goods ticked « pris au coffre » (S10), waiting for their exit to be confirmed. */
function VentesEnAttente({ reg, tab }: { reg: CtxRegistre; tab: number }) {
  const d = reg.m!.donnees!
  const lignes = d.intendance.filter((l) => l.genre === 'vente' && l.statut === 'en attente')
  if (!lignes.length) return null
  const repondre = (l: LigneIntendance, oui: boolean) =>
    reg.m!.agir('sortir', { id: l.id, oui }, (x) => ({ ...x, intendance: x.intendance.map((y) => (y.id === l.id ? { ...y, statut: oui ? 'sortie' : 'refusée', enAttente: true } : y)) }))
  return (
    <section className="en-attente-liste">
      <h3 className="titre-section">
        Ventes prises au coffre <span className="compte-missions">{lignes.length}</span>
      </h3>
      <ul className="missions-liste">
        {lignes.map((l) => (
          <li key={l.id} className={`mission a-repondre ${l.enAttente ? 'en-attente' : ''}`}>
            <span className="mission-texte">
              <span className="mission-intitule">Sortir {objetQ(l.quantite, l.objet)} du coffre ?</span>
              <Meta parts={[`vendu par ${l.membre}`, l.commande && `bon ${l.commande}`, l.date && `le ${dateTamrielique(l.date)}`]} />
            </span>
            <span className="mission-cote">
              <span className="mission-gestes">
                {permis(reg, 'sortir') && (
                  <>
                    <Action icone="sortir" tabIndex={tab} disabled={l.enAttente} onClick={() => repondre(l, true)}>
                      oui, sorti
                    </Action>
                    <Action icone="annuler" tabIndex={tab} disabled={l.enAttente} onClick={() => repondre(l, false)}>
                      non, pas du coffre
                    </Action>
                  </>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The crafts out of the chest: what each artisan holds, what came back; « consigner le retour », « clore ». */
function ChezLesArtisans({ reg, tab, sorties }: { reg: CtxRegistre; tab: number; sorties: boolean }) {
  const d = reg.m!.donnees!
  const lignes = d.intendance.filter((l) => l.genre === 'façonnage' && l.statut === 'en cours')
  if (!lignes.length) return null
  return (
    <section className="chez-artisans">
      <h3 className="titre-section">Chez les artisans</h3>
      <ul className="missions-liste">
        {lignes.map((l) => {
          const e = etatFaconnage(l, d.intendance)
          return (
            <li key={l.id} className={`mission ${l.enAttente ? 'en-attente' : ''}`}>
              <span className="mission-texte">
                <span className="mission-intitule">
                  {objetQ(l.quantite, l.objet)} chez {l.membre}
                </span>
                <span className="mission-avance">
                  <Jauge avance={l.quantite ? e.revenu / l.quantite : 0} />
                  <span>{nf(e.revenu)} revenus</span>
                </span>
                <Meta parts={[l.date && `sorti le ${dateTamrielique(l.date)}`, l.note]} />
              </span>
              <span className="mission-cote">
                <span className="mission-gestes">
                  {!sorties && permis(reg, 'entree') && (
                    <Action icone="entree" tabIndex={tab} disabled={l.enAttente} onClick={() => reg.ouvrir({ genre: 'entree', lien: l.id })}>
                      consigner le retour
                    </Action>
                  )}
                  {sorties && permis(reg, 'clore') && (
                    <Action icone="annuler" tabIndex={tab} disabled={l.enAttente} title="Le reste ne reviendra pas" onClick={() => reg.m!.agir('clore', { id: l.id })}>
                      clore
                    </Action>
                  )}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The ledger: every entry (or exit), newest first, filtered by the page's search. */
function Registre({ reg, lignes, requetes }: { reg: CtxRegistre; lignes: LigneIntendance[]; requetes: string[] }) {
  const d = reg.m!.donnees!
  const dico = dicoAnglais(reg.r.donnees)
  const vus = lignes
    .filter((l) => requetes.every((q) => !q.trim() || nomsCorrespondent([...avecAnglais([l.objet], dico), l.membre, l.par, l.note, titreDe(d, l.demande)], q)))
    .sort((a, b) => quandDe(b).localeCompare(quandDe(a)))
    .slice(0, 60)
  if (!vus.length) return <p className="vide-encre">{requetes.some((q) => q.trim()) ? 'Rien ne répond à ce nom.' : 'Rien encore n’est écrit ici.'}</p>
  return (
    <ol className="journal registre-intendance">
      {vus.map((l) => (
        <li key={l.id} className={`journal-${l.statut === 'refusée' ? 'refus' : estEntree(l) ? 'depot' : 'livraison'} ${l.enAttente ? 'encre-fraiche' : ''}`}>
          <span className="journal-ligne">
            <strong className="journal-qui">{objetQ(l.quantite, l.objet)}</strong>
            <span className="journal-quand">{quand(quandDe(l))}</span>
            <span className="journal-quoi">
              {quoiLigne(l)}
              {l.statut === 'refusée' ? ' · pas reçu' : l.statut === 'en attente' ? ' · en attente' : ''}
              {l.demande && ` · ${titreDe(d, l.demande)}`}
              {l.coffre === PETITES_LUNES && ' · coffre des petites lunes'}
              {voitPoints(reg) && l.points ? ` · ${pts(l.points)}` : ''}
              {l.par && ` · consigné par ${l.par}`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/* ───────────────────────── The pages ───────────────────────── */

export function GaucheIntendance({ page, reg, icones, compact, recherche }: { page: PageIntendance; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean; recherche?: RechercheLocale }) {
  const d = reg?.m?.donnees
  const pret = Boolean(d?.intendanceActive)
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {reg && <Ferme reg={reg} />}
      {reg && d && ouvert(reg) && (
        <>
          <Signature reg={reg} />
          <Inactif reg={reg} intendance />
          {page.vue === 'encours' && d.intendanceActive && !d.feuilletsActifs && <p className="missions-inactif">{TEXTES_FEUILLETS.inactif}</p>}
          <Message reg={reg} />
          <div className="gestes">
            {page.vue === 'encours' && permis(reg, 'demande') && (
              <Geste icone={icones['scroll-quill']} disabled={!d.actif} onClick={() => reg.ouvrir({ genre: 'ecrire' })}>
                Écrire une mission ou une missive
              </Geste>
            )}
            {page.vue === 'reception' && permis(reg, 'entree') && (
              <>
                <Geste icone={icones['entry-door']} disabled={!pret} onClick={() => reg.ouvrir({ genre: 'entree' })}>
                  Consigner une remise
                </Geste>
                <Geste icone={icones['hand']} disabled={!pret} onClick={() => reg.ouvrir({ genre: 'entree', don: true })}>
                  Consigner un don
                </Geste>
                <Geste icone={icones['moon']} disabled={!pret} onClick={() => reg.ouvrir({ genre: 'entree', don: true, petites: true })}>
                  Vider le coffre des petites lunes
                </Geste>
              </>
            )}
            {page.vue === 'sorties' && permis(reg, 'faconnage') && (
              <>
                <Geste icone={icones['anvil-impact']} disabled={!pret} onClick={() => reg.ouvrir({ genre: 'faconnage' })}>
                  Sortir pour façonner
                </Geste>
                <Geste icone={icones['exit-door']} disabled={!pret} onClick={() => reg.ouvrir({ genre: 'perte' })}>
                  Consigner une sortie
                </Geste>
              </>
            )}
            {page.vue === 'ecrire' && permis(reg, 'demande') && (
              <>
                <Geste icone={icones['scroll-quill']} disabled={!d.actif} onClick={() => reg.ouvrir({ genre: 'ecrire' })}>
                  Écrire une mission ou une missive
                </Geste>
                <Geste icone={icones['hunting-horn']} disabled={!d.actif} onClick={() => reg.ouvrir({ genre: 'permanente' })}>
                  Ouvrir une mission permanente
                </Geste>
              </>
            )}
          </div>
          {page.vue === 'reception' && <p className="note-encre">Ce qui attend au coffre des petites lunes n’est pas encore dans le coffre de la caravane : réponds « reçu » ligne par ligne en le vidant. Ce que personne n’a signalé, consigne-le au nom de qui l’a déposé, ou comme don anonyme.</p>}
          {page.vue === 'sorties' && <p className="note-encre">Une vente ne touche pas au coffre, sauf ses lignes cochées « pris au coffre » sur le bon : elles attendent ici qu’on confirme la sortie.</p>}
          {page.vue === 'encours' && (
            <p className="note-encre">
              Une mission mère attend ses missions enfants, puis sa livraison. Une mission enfant comblée reste ouverte : ce qui arrive après compte encore. Quand toutes sont comblées, vérifie le coffre, puis clos la mission mère : c’est sa livraison ; ce qu’elle a reçu reste compté.
            </p>
          )}
          {page.vue === 'encours' && <ChampRecherche recherche={recherche} placeholder="Chercher une mission mère, un objet, un nom…" />}
          {(page.vue === 'reception' || page.vue === 'sorties') && <ChampRecherche recherche={recherche} placeholder={page.vue === 'reception' ? 'Chercher une entrée, un nom…' : 'Chercher une sortie, un nom…'} />}
          {page.vue === 'ecrire' && <ChampRecherche recherche={recherche} placeholder="Chercher une mission mère…" />}
        </>
      )}
    </>
  )
}

export function DroiteIntendance({ page, reg, icones, interactif, requetes = [] }: { page: PageIntendance; reg?: CtxRegistre; icones: Record<string, string>; interactif: boolean; requetes?: string[] }) {
  const d = reg?.m?.donnees
  if (!reg || !d?.relie) return null
  const tab = interactif ? 0 : -1
  if (page.vue === 'encours') return <EnCours reg={reg} icones={icones} tab={tab} requetes={requetes} />
  if (page.vue === 'reception')
    return (
      <div className="intendance-droite">
        <AvisAllegement reg={reg} tab={tab} />
        <EnAttente reg={reg} icones={icones} tab={tab} titre="Déposé, à confirmer" />
        <ChezLesArtisans reg={reg} tab={tab} sorties={false} />
        <h3 className="titre-section">Tout ce qui est entré</h3>
        <Registre reg={reg} requetes={requetes} lignes={d.intendance.filter((l) => estEntree(l) && l.statut !== 'en attente')} />
      </div>
    )
  if (page.vue === 'sorties')
    return (
      <div className="intendance-droite">
        <VentesEnAttente reg={reg} tab={tab} />
        <ChezLesArtisans reg={reg} tab={tab} sorties />
        <h3 className="titre-section">Tout ce qui est sorti</h3>
        <Registre reg={reg} requetes={requetes} lignes={d.intendance.filter((l) => !estEntree(l) && l.statut !== 'en attente')} />
      </div>
    )
  // « Écrire une mission »: the sheets written, what each still lacks in words (a closed one under a « Terminée » stamp);
  // the standing missions.
  const dico = dicoAnglais(reg.r.donnees)
  const feuillets = [...d.demandes].reverse().filter((x) => requetes.every((q) => !q.trim() || nomsCorrespondent([x.titre, ...avecAnglais([x.article], dico), x.membre], q)))
  return (
    <div className="intendance-droite">
      <h3 className="titre-section">Les missions mères écrites</h3>
      {feuillets.length ? (
        <ul className="liste-demandes">
          {feuillets.map((x) => {
            const clos = feuilletClos(x)
            const ms = d.missions.filter((m) => m.demande === x.numero)
            const points = ms.reduce((t, m) => t + m.points, 0)
            const le = fermeLe(x)
            return (
              <li key={x.numero} className={`demande ${clos ? 'terminee' : ''}`}>
                <button type="button" className="lien-encre demande-titre" tabIndex={tab} onClick={() => reg.allerA(idDemande(x.numero))}>
                  {x.titre || `${nf(x.quantite)} ${x.article}`}
                </button>
                <span className="demande-meta">
                  {x.horodatage && <>le {dateTamrielique(x.horodatage)}</>}
                  {x.membre && <> par {x.membre}</>}
                  {x.missive && <> · missive</>}
                </span>
                <span className="demande-manque">
                  {clos ? <>Terminée{le && <> le {dateTamrielique(le)}</>}.</> : <CeQuiManque reg={reg} dm={x} ms={ms} />}
                  {voitPoints(reg) && points > 0 && <> · {pts(points)}</>}
                </span>
                {clos && (
                  <span className="tampon tampon-terminee" aria-hidden>
                    Terminée
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="vide-encre">Nulle mission mère n’est encore écrite.</p>
      )}
      {d.permanentes.length > 0 && (
        <>
          <h3 className="titre-section">Missions permanentes</h3>
          <ul className="missions-liste">
            {d.permanentes.map((x) => (
              <li key={x.id} className={`mission permanente ${x.statut !== 'ouverte' ? 'fermee' : ''}`}>
                <GlypheType type={x.type} icones={icones} />
                <span className="mission-texte">
                  <span className="mission-intitule">
                    {VERBES[x.type]} {x.objet}
                  </span>
                  <Meta parts={[x.statut, voitPoints(reg) && `${pts(x.points)} pour ${nf(x.quantite)}`]} />
                </span>
                <span className="mission-cote">
                  <span className="mission-gestes">
                    {permis(reg, 'permanente') && (
                      <Action icone="corriger" tabIndex={tab} onClick={() => reg.ouvrir({ genre: 'permanente', id: x.id })}>
                        régler
                      </Action>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** What an open mother still lacks, in words (lot 2c): which child missions, how many; or that only its delivery is left. */
const MAX_MANQUES = 4
function CeQuiManque({ reg, dm, ms }: { reg: CtxRegistre; dm: Demande; ms: Mission[] }) {
  const d = reg.m!.donnees!
  const l = livraisonDu(reg, dm)
  if (l.etat !== 'attend') {
    if (l.etat === 'prete') return <>{l.enfants - l.closes ? 'Toutes ses missions enfants sont comblées' : 'Nulle mission enfant à remplir'} : reste la livraison.</>
    return <>{l.etat === 'livree' ? 'Missive livrée' : 'Missive abandonnée'} : reste à clore la mission mère.</>
  }
  const manques = ms
    .filter((m) => m.statut !== 'close')
    .map((m) => ({ m, e: etatMission(m, d.intendance) }))
    .filter((x) => x.e.manque > 0)
  return (
    <>
      Il manque {manques.slice(0, MAX_MANQUES).map((x) => objetQ(x.e.manque, x.m.objet)).join(', ')}
      {manques.length > MAX_MANQUES && <> et {manques.length - MAX_MANQUES} autre{manques.length - MAX_MANQUES > 1 ? 's' : ''}</>} ({manques.length} mission{manques.length > 1 ? 's' : ''} enfant{manques.length > 1 ? 's' : ''} sur {l.enfants - l.closes}), puis la livraison.
    </>
  )
}

/* ───────────────────────── The notes ───────────────────────── */

/** The first line of a note opened from a mission: its item, what it still lacks, the mission itself. */
function premiereLigne(d: DonneesMissions, ref?: string): LigneSaisie {
  if (!ref) return LIGNE_VIDE
  const m = d.missions.find((x) => x.numero === ref)
  if (m) return { objet: m.objet, quantite: String(etatMission(m, d.intendance).manque || ''), mission: m.numero }
  const p = d.permanentes.find((x) => x.id === ref)
  return p ? { objet: p.objet, quantite: '', mission: p.id } : LIGNE_VIDE
}

/* ───────────────────────── One hand-over, several missions (lot 2b) ───────────────────────── */

/** The missions ticked on a hand-over and the quantity typed for each (ref → text). */
type Choisies = Record<string, string>

const MAX_VUES = 24

/**
 * The missions a hand-over can fill, to tick (lot 2b, Ludo: one giver, several missions in one go): those that still lack
 * something first, a search by item (French or English) or sheet; a ticked one gets its quantity, pre-filled with what it
 * lacks. Filled missions only show when searched (a late delivery still counts).
 */
function ChoixMissions({ cibles, choisies, changer, dico }: { cibles: Cible[]; choisies: Choisies; changer: (c: Choisies) => void; dico: Map<string, string> }) {
  const [q, setQ] = useState('')
  const cherche = q.trim()
  const cochees = cibles.filter((c) => c.ref in choisies)
  const autres = cibles.filter((c) => !(c.ref in choisies) && (cherche ? nomsCorrespondent([...avecAnglais([c.objet], dico), c.libelle], cherche) : c.manque > 0))
  const vues = [...cochees, ...autres.slice(0, MAX_VUES)]
  const cocher = (c: Cible, oui: boolean) => {
    const x = { ...choisies }
    if (oui) x[c.ref] = /^p-/i.test(c.ref) || c.manque <= 0 ? '' : String(c.manque)
    else delete x[c.ref]
    changer(x)
  }
  if (!cibles.length) return <p className="fiche-aide">Nulle mission n’attend rien pour l’heure : ce qui est remis est un don.</p>
  return (
    <div className="choix-missions">
      {cibles.length > 6 && (
        <input type="search" className="choix-missions-cherche" value={q} placeholder="Chercher une mission (Blé, Wheat…)" aria-label="Chercher une mission" onChange={(e) => setQ(e.target.value)} />
      )}
      <ul className="choix-missions-liste">
        {vues.map((c) => {
          const oui = c.ref in choisies
          return (
            <li key={c.ref} className={oui ? 'cochee' : ''}>
              <label className="fiche-coche">
                <input type="checkbox" checked={oui} onChange={(e) => cocher(c, e.target.checked)} />
                <span>{c.libelle}</span>
              </label>
              {oui && (
                <input
                  type="text"
                  inputMode="numeric"
                  className="choix-missions-qte"
                  value={choisies[c.ref]}
                  placeholder="combien"
                  aria-label={`Combien pour ${c.libelle}`}
                  onChange={(e) => changer({ ...choisies, [c.ref]: e.target.value.replace(/\D/g, '').slice(0, 7) })}
                />
              )}
            </li>
          )
        })}
      </ul>
      {autres.length > MAX_VUES && <p className="fiche-aide">Et {autres.length - MAX_VUES} autres : cherche-les par leur nom.</p>}
      {cherche && !autres.length && <p className="fiche-aide">Nulle mission ne répond à ce nom.</p>}
    </div>
  )
}

/** The missions ticked as the server reads them; `null` while a ticked one has no quantity. */
function lignesChoisies(choisies: Choisies, cibles: Cible[]) {
  const res: { objet: string; quantite: number; mission: string }[] = []
  for (const [ref, t] of Object.entries(choisies)) {
    const c = cibles.find((x) => x.ref === ref)
    if (!c) continue
    if (!(Number(t) >= 1)) return null
    res.push({ objet: c.objet, quantite: Number(t), mission: ref })
  }
  return res
}

/** The gift lines (not tied to a mission): [] when none is filled, `null` while one is incomplete. */
const lignesDons = (lignes: LigneSaisie[], noms: NomsObjets) => (lignes.some((l) => l.objet.trim() || l.quantite) ? lignesEnvoyees(lignes, [], noms)?.map((l) => ({ ...l, mission: '' })) ?? null : [])

/** « Blé » typed as a gift while a mission waits for it: said, so it is ticked above if it was for her. */
function AvisDons({ dons, cibles, choisies, noms }: { dons: LigneSaisie[]; cibles: Cible[]; choisies: Choisies; noms: NomsObjets }) {
  const pour = [...new Set(dons.map((l) => noms.get(cle(l.objet))).filter((x): x is string => Boolean(x)))].filter((fr) => cibles.some((c) => cle(c.objet) === cle(fr) && c.manque > 0 && !(c.ref in choisies)))
  if (!pour.length) return null
  return <p className="fiche-aide avis-don">{pour.join(', ')} : une mission en attend. Si c’était pour elle, coche-la plus haut ; sinon c’est un don.</p>
}

/** The two parts of a hand-over: the missions ticked, then what is given outside any mission (a gift). */
function RemiseEtDons({ cibles, choisies, setChoisies, dons, setDons, noms, dico }: { cibles: Cible[]; choisies: Choisies; setChoisies: (c: Choisies) => void; dons: LigneSaisie[]; setDons: (l: LigneSaisie[]) => void; noms: NomsObjets; dico: Map<string, string> }) {
  return (
    <>
      <h3 className="fiche-sous-titre">Pour des missions</h3>
      <ChoixMissions cibles={cibles} choisies={choisies} changer={setChoisies} dico={dico} />
      <h3 className="fiche-sous-titre">Hors mission : un don</h3>
      <p className="fiche-aide">Tout ce qui ne remplit aucune mission est un don.</p>
      <LignesObjets lignes={dons} changer={setDons} noms={noms} cibles={[]} sansMission />
      <AvisDons dons={dons} cibles={cibles} choisies={choisies} noms={noms} />
    </>
  )
}

/** The mission a note was opened from, pre-ticked with what it lacks. */
function choisiesDe(cibles: Cible[], mission?: string): Choisies {
  const c = mission ? cibles.find((x) => x.ref === mission) : undefined
  return c ? { [c.ref]: /^p-/i.test(c.ref) || c.manque <= 0 ? '' : String(c.manque) } : {}
}

/** A member's declaration (S5): left in the petites lunes chest, or handed to someone; it waits for a yes / no. */
export function FicheSignaler({ reg, articles, icones, fermer, mission }: EnvMission & { mission?: string }) {
  const d = reg.m!.donnees!
  const noms = useMemo(() => nomsObjets(reg, articles), [reg, articles])
  const dico = useMemo(() => dicoAnglais(reg.r.donnees, articles), [reg.r.donnees, articles])
  const cibles = useMemo(() => ciblesDe(d), [d])
  const [choisies, setChoisies] = useState<Choisies>(() => choisiesDe(cibles, mission))
  const [dons, setDons] = useState<LigneSaisie[]>([{ ...LIGNE_VIDE, mission: '' }])
  const [ou, setOu] = useState<'petites' | 'main'>('petites')
  const [note, setNote] = useState('')
  const { etat, erreur, envoyer } = useScelle(fermer)
  const pourMissions = lignesChoisies(choisies, cibles)
  const horsMission = lignesDons(dons, noms)
  const envoyees = pourMissions && horsMission && pourMissions.length + horsMission.length ? [...pourMissions, ...horsMission] : null
  return (
    <form
      className="fiche-form intendance-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (envoyees) envoyer(() => reg.m!.agir('signaler', { lignes: envoyees, coffre: ou === 'petites' ? PETITES_LUNES : 'main', note }))
      }}
    >
      <p className="fiche-aide">Ce que tu as remis pour la caravane : coche les missions, ajoute ce qui n’en remplit aucune. Une patte de l’Intendance répondra « reçu » ; d’ici là, rien n’est compté.</p>
      <RemiseEtDons cibles={cibles} choisies={choisies} setChoisies={setChoisies} dons={dons} setDons={setDons} noms={noms} dico={dico} />
      <fieldset className="fiche-choix">
        <legend>Où est-ce ?</legend>
        <label className="fiche-coche">
          <input type="radio" name="ou" checked={ou === 'petites'} onChange={() => setOu('petites')} />
          <span>Déposé au coffre des petites lunes</span>
        </label>
        <label className="fiche-coche">
          <input type="radio" name="ou" checked={ou === 'main'} onChange={() => setOu('main')} />
          <span>Remis en main propre à une patte de l’Intendance</span>
        </label>
      </fieldset>
      <label className="fiche-champ">
        <span>Un mot (facultatif)</span>
        <input type="text" value={note} maxLength={120} placeholder="au coffre de Blancherive, ce soir" onChange={(e) => setNote(e.target.value)} />
      </label>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!envoyees}>
          Signaler
        </Sceller>
      </div>
    </form>
  )
}

/** Points of the lines as the page can foresee them (the server computes them again), for who opens the Trésor. */
function pointsPrevus(reg: CtxRegistre, articles: Article[], lignes: { objet: string; quantite: number; mission: string }[]) {
  const d = reg.m!.donnees!
  const recettes = reg.r.donnees?.recettes ?? []
  return lignes.reduce((t, l) => {
    const m = d.missions.find((x) => x.numero === l.mission) ?? d.permanentes.find((x) => x.id === l.mission)
    if (m && tauxDe(m) > 0) return t + Math.round(tauxDe(m) * l.quantite)
    return t + pointsDon(l.objet, l.quantite, recettes, articles, d.ponderation, false, prixDon(l.objet, reg.r.donnees?.ressources ?? [], articles)).points
  }, 0)
}

/**
 * Someone allowed records what they received (S1, S2, S4, S5, S6): who gave it (a name of the register, or a new one,
 * reserved at once as a « Petite lune »; or « anonyme »: no points), what, for which mission. Opened on a craft's
 * return (`lien`): the product awaited, and the materials put back.
 */
export function FicheEntree({ reg, articles, icones, fermer, mission, lien, don = false, petites: petites0 = false }: EnvMission & { mission?: string; lien?: string; don?: boolean; petites?: boolean }) {
  const d = reg.m!.donnees!
  const noms = useMemo(() => nomsObjets(reg, articles), [reg, articles])
  const cibles = useMemo(() => ciblesDe(d), [d])
  const f = lien ? d.intendance.find((x) => x.id === lien) : undefined
  const retour = f ? etatFaconnage(f, d.intendance) : null
  const [qui, setQui] = useState(f?.membre ?? '')
  const [anonyme, setAnonyme] = useState(false)
  const [petites, setPetites] = useState(petites0)
  // A craft's return: its product (and its mission) set. Otherwise (lot 2b): the missions ticked, and the gifts.
  const [lignes, setLignes] = useState<LigneSaisie[]>(f ? [{ objet: f.objet, quantite: String(retour?.attendu || ''), mission: f.mission }] : [])
  const dico = useMemo(() => dicoAnglais(reg.r.donnees, articles), [reg.r.donnees, articles])
  const [choisies, setChoisies] = useState<Choisies>(() => choisiesDe(cibles, mission))
  const [dons, setDons] = useState<LigneSaisie[]>([{ ...LIGNE_VIDE, mission: '' }])
  const [rentrees, setRentrees] = useState<LigneSaisie[]>([{ ...LIGNE_VIDE, mission: '' }])
  const [note, setNote] = useState('')
  const { etat, erreur, envoyer } = useScelle(fermer)
  const pourMissions = f ? lignesEnvoyees(lignes, cibles, noms) : lignesChoisies(choisies, cibles)
  const horsMission = f ? [] : lignesDons(dons, noms)
  const envoyees = pourMissions && horsMission && pourMissions.length + horsMission.length ? [...pourMissions, ...horsMission] : null
  const rentreesEnvoyees = f ? lignesEnvoyees(rentrees, [], noms) : null
  const nomTape = qui.trim()
  const connu = nomDuRegistre(nomTape, reg.r.noms)
  const pret = Boolean(envoyees) && (anonyme || nomTape.length >= 2) && (!f || !rentrees.some((l) => l.objet.trim() || l.quantite) || Boolean(rentreesEnvoyees))
  const prevus = envoyees && voitPoints(reg) && !anonyme ? pointsPrevus(reg, articles, envoyees) : 0
  return (
    <form
      className="fiche-form intendance-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pret || !envoyees) return
        envoyer(() =>
          reg.m!.agir('entree', {
            membre: anonyme ? '' : nomTape,
            anonyme,
            coffre: petites ? PETITES_LUNES : '',
            lien: f?.id ?? '',
            lignes: envoyees,
            rentrees: rentreesEnvoyees ?? [],
            note,
          }),
        )
      }}
    >
      {f && (
        <p className="fiche-aide">
          Chez {f.membre} : {objetQ(f.quantite, f.objet)} attendus, {nf(retour?.revenu ?? 0)} déjà revenus.
        </p>
      )}
      {!f && (
        <>
          <label className="fiche-champ">
            <span>{don ? 'Qui le donne' : 'Qui l’a remis'}</span>
            {anonyme ? (
              <input type="text" value="une patte anonyme" readOnly aria-label="Donateur" />
            ) : (
              <ChampNom valeur={qui} changer={setQui} noms={reg.r.noms} libre placeholder="J’Zahir" etiquette={don ? 'Qui le donne' : 'Qui l’a remis'} />
            )}
          </label>
          {!anonyme && nomTape.length >= 2 && !connu && <p className="fiche-aide">Ce nom n’est pas encore au registre : il y sera inscrit comme Petite lune, et la recrue retrouvera ses dons en signant l’ex-libris de ce nom.</p>}
          <label className="fiche-coche">
            <input type="checkbox" checked={petites} onChange={(e) => setPetites(e.target.checked)} />
            <span>Trouvé au coffre des petites lunes</span>
          </label>
          <label className="fiche-coche">
            <input type="checkbox" checked={anonyme} onChange={(e) => setAnonyme(e.target.checked)} />
            <span>Nul ne sait qui l’a déposé : don anonyme, sans points</span>
          </label>
        </>
      )}
      {f ? <LignesObjets lignes={lignes} changer={setLignes} noms={noms} cibles={cibles} fige /> : <RemiseEtDons cibles={cibles} choisies={choisies} setChoisies={setChoisies} dons={dons} setDons={setDons} noms={noms} dico={dico} />}
      {f && (
        <>
          <h3 className="fiche-sous-titre">Matières rentrées (facultatif)</h3>
          <p className="fiche-aide">Ce que l’artisan rapporte sans l’avoir employé : il rentre au coffre, sans points.</p>
          <LignesObjets lignes={rentrees} changer={setRentrees} noms={noms} cibles={[]} sansMission />
        </>
      )}
      <label className="fiche-champ">
        <span>Un mot (facultatif)</span>
        <input type="text" value={note} maxLength={120} placeholder="remis à la halte de Rorikbourg" onChange={(e) => setNote(e.target.value)} />
      </label>
      {voitPoints(reg) && envoyees && !anonyme && <p className="fiche-partage">Points prévus : <strong>{pts(prevus)}</strong>, crédités à la consignation.</p>}
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!pret}>
          Consigner
        </Sceller>
      </div>
    </form>
  )
}

/** S6: materials out of the chest to an artisan; the goods are awaited back (Réception). */
export function FicheFaconnage({ reg, articles, icones, fermer, produit: produit0, mission }: EnvMission & { produit?: string; mission?: string }) {
  const d = reg.m!.donnees!
  const recettes = useMemo(() => (reg.r.donnees?.recettes ?? []).filter((r) => !r.ombre && r.ingredients.length), [reg.r.donnees?.recettes])
  const produits = useMemo(() => [...new Map(recettes.map((r) => [cle(r.produit), r.produit])).values()].sort((a, b) => a.localeCompare(b, 'fr')), [recettes])
  const stock = useMemo(() => rejouer(reg.r.donnees?.mouvements ?? []).stock, [reg.r.donnees?.mouvements])
  const m0 = mission ? d.missions.find((x) => x.numero === mission) : undefined
  const [v, setV] = useState({ artisan: '', produit: produit0 ?? m0?.objet ?? '', variante: '', quantite: m0 ? String(etatMission(m0, d.intendance).manque || '') : '', mission: mission ?? '' })
  const { etat, erreur, envoyer } = useScelle(fermer)
  // Found by its French or its English name (lot 2b).
  const noms = useMemo(() => nomsObjets(reg, articles), [reg, articles])
  const tape = noms.get(cle(v.produit)) ?? v.produit
  const nom = produits.find((p) => cle(p) === cle(tape)) ?? ''
  const vs = nom ? variantesDe(recettes, nom) : []
  const r = vs.find((x) => String(x.variante) === v.variante) ?? recetteUsage(vs)
  const Q = Number(v.quantite)
  const fournees = r && Q >= 1 ? Math.ceil(Q / Math.max(1, r.rendement)) : 0
  const sorties = r ? r.ingredients.map((i) => ({ objet: i.nom, quantite: Math.ceil(i.quantite * fournees - 1e-9), auCoffre: enStock(stock, i.nom) })) : []
  const pour = nom ? d.missions.filter((x) => x.type === 'fabrication' && cle(x.objet) === cle(nom) && !/^(don|p-)/i.test(x.demande)) : []
  const pret = Boolean(r) && Q >= 1 && v.artisan.trim().length >= 2
  return (
    <form
      className="fiche-form intendance-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (pret) envoyer(() => reg.m!.agir('faconnage', { artisan: v.artisan, produit: nom, variante: r?.variante, quantite: Q, mission: v.mission }))
      }}
    >
      <label className="fiche-champ">
        <span>Chez qui</span>
        <ChampNom valeur={v.artisan} changer={(x) => setV({ ...v, artisan: x })} noms={reg.r.noms} libre placeholder="l’alchimiste" etiquette="Chez qui" />
      </label>
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Quel ouvrage</span>
          <input type="text" list="produits-faconner" value={v.produit} placeholder="Potion de soin" onChange={(e) => setV({ ...v, produit: e.target.value, variante: '', mission: '' })} />
          <OptionsObjets id="produits-faconner" noms={noms} seuls={(fr) => produits.some((p) => cle(p) === cle(fr))} />
        </label>
        <label className="fiche-champ">
          <span>Combien</span>
          <input type="text" inputMode="numeric" value={v.quantite} placeholder="100" onChange={(e) => setV({ ...v, quantite: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
        </label>
      </div>
      {v.produit && !nom && <p className="message-encre erreur">Nulle recette n’est consignée pour cet ouvrage.</p>}
      {vs.length > 1 && (
        <label className="fiche-champ">
          <span>Recette</span>
          <select value={String(r?.variante ?? '')} onChange={(e) => setV({ ...v, variante: e.target.value })}>
            {vs.map((x) => (
              <option key={x.variante} value={x.variante}>
                Recette {x.variante}
                {x === recetteUsage(vs) ? ' (d’usage)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {pour.length > 0 && (
        <label className="fiche-champ">
          <span>Pour la mission</span>
          <select value={v.mission} onChange={(e) => setV({ ...v, mission: e.target.value })}>
            <option value="">aucune</option>
            {pour.map((x) => (
              <option key={x.numero} value={x.numero}>
                {VERBES[x.type]} {x.objet} · {titreDe(d, x.demande)}
              </option>
            ))}
          </select>
        </label>
      )}
      {r && fournees > 0 && (
        <>
          <h3 className="fiche-sous-titre">Ce qui sort du coffre</h3>
          <p className="fiche-aide">
            {fournees} fournée{fournees > 1 ? 's' : ''} : {objetQ(fournees * Math.max(1, r.rendement), r.produit)} attendus au retour.
          </p>
          <ul className="inventaire">
            {sorties.map((s) => (
              <li key={s.objet} className={s.auCoffre < s.quantite ? 'manquant' : ''}>
                <span>{s.objet}</span>
                <span className="points" />
                <strong>{nf(s.quantite)}</strong>
                <em className={s.auCoffre < s.quantite ? 'a-fixer' : ''}>(au coffre : {nf(s.auCoffre)})</em>
              </li>
            ))}
          </ul>
          {sorties.some((s) => s.auCoffre < s.quantite) && <p className="fiche-aide a-fixer">Le registre n’en compte pas assez au coffre : vérifie-le avant de sortir (le coffre peut aller sous zéro, un relevé le corrigera).</p>}
        </>
      )}
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!pret}>
          Sortir du coffre
        </Sceller>
      </div>
    </form>
  )
}

/** A loss or any other exit, with its reason. */
export function FichePerte({ reg, articles, icones, fermer }: EnvMission) {
  const noms = useMemo(() => nomsObjets(reg, articles), [reg, articles])
  const [lignes, setLignes] = useState<LigneSaisie[]>([{ ...LIGNE_VIDE, mission: '' }])
  const [note, setNote] = useState('')
  const { etat, erreur, envoyer } = useScelle(fermer)
  const l = lignesEnvoyees(lignes, [], noms)?.[0]
  return (
    <form
      className="fiche-form intendance-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (l && note.trim()) envoyer(() => reg.m!.agir('sortie', { objet: l.objet, quantite: l.quantite, note }))
      }}
    >
      <LignesObjets lignes={lignes} changer={setLignes} noms={noms} cibles={[]} sansMission unique />
      <label className="fiche-champ">
        <span>Pourquoi</span>
        <input type="text" value={note} maxLength={120} placeholder="gâté par la pluie, offert au Jarl…" onChange={(e) => setNote(e.target.value)} />
      </label>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!l || !note.trim()}>
          Sortir du coffre
        </Sceller>
      </div>
    </form>
  )
}


/* ───────────────────────── The missions in progress (lot 2b) ───────────────────────── */

const titreFeuillet = (dm: Demande) => dm.titre || `${nf(dm.quantite)} ${dm.article}`

/** The upstream missions each open sheet's hand-overs make unnecessary (lib/missions.ts `allegements`), by sheet. */
export function aAlleger(reg: CtxRegistre): { dm: Demande; liste: Allegement[] }[] {
  const d = reg.m?.donnees
  if (!d) return []
  const recettes = (reg.r.donnees?.recettes ?? []).filter((r) => !r.ombre)
  return d.demandes.filter((dm) => !feuilletClos(dm)).map((dm) => ({ dm, liste: allegements(dm, d.missions, d.intendance, recettes, d.ponderation) })).filter((x) => x.liste.length)
}

/**
 * « Ce qui a été reçu rend des missions inutiles » (lot 2b): shown on the Réception, the missions in progress and the sheet's
 * page while a sheet's hand-overs make upstream missions unnecessary; nothing is changed before someone confirms.
 */
export function AvisAllegement({ reg, numero, tab }: { reg: CtxRegistre; numero?: string; tab: number }) {
  if (!permis(reg, 'feuillet')) return null
  const x = aAlleger(reg).filter((y) => !numero || y.dm.numero === numero)
  if (!x.length) return null
  return (
    <div className="avis-allegement" role="status">
      {x.map(({ dm, liste }) => (
        <p key={dm.numero}>
          Ce qui a été reçu pour « {titreFeuillet(dm)} » rend {liste.length > 1 ? `${liste.length} missions en amont inutiles` : 'une mission en amont inutile'}.{' '}
          <Action icone="clore" tabIndex={tab} onClick={() => reg.ouvrir({ genre: 'alleger', numero: dm.numero })}>
            voir et alléger
          </Action>
        </p>
      ))}
    </div>
  )
}

/** A child mission's state in words (lot 2c, Ludo: « comblée » written, not a tick under « Manque »). */
function etatEnfant(m: Mission, e: ReturnType<typeof etatMission>, mereClose = false) {
  if (m.statut === 'close' || mereClose) return { mot: 'close', classe: 'close' }
  return e.manque > 0 ? { mot: `manque ${nf(e.manque)}`, classe: 'manquant' } : { mot: 'comblée', classe: 'reuni' }
}

/** The mother's state in words, on its header (lot 2c). */
function etatMere(l: Livraison): { texte: string; classe: string } {
  const ouvertes = l.enfants - l.closes
  if (l.etat === 'livree') return { texte: l.missive ? 'La missive est livrée.' : 'Livrée.', classe: 'faite' }
  if (l.etat === 'abandonnee') return { texte: 'La missive est abandonnée.', classe: 'faite' }
  if (l.etat === 'prete') return { texte: ouvertes ? 'Toutes ses missions enfants sont comblées.' : 'Nulle mission enfant à remplir : tout est déjà au coffre.', classe: 'prete' }
  return { texte: `En cours : ${l.comblees} mission${l.comblees > 1 ? 's' : ''} enfant${l.comblees > 1 ? 's' : ''} comblée${l.comblees > 1 ? 's' : ''} sur ${ouvertes}.`, classe: 'attend' }
}

/** The children of a sheet and its Livraison as the rows of a table: Mission · Requis · Reçu · État. */
function TableEnfants({ dm, ms, l, reg, icones, tab, gestes, auCoffre }: { dm: Demande; ms: Mission[]; l: Livraison; reg: CtxRegistre; icones: Record<string, string>; tab: number; gestes: boolean; auCoffre: number }) {
  const d = reg.m!.donnees!
  const pret = d.feuilletsActifs
  const aide = pret ? undefined : TEXTES_FEUILLETS.inactif
  return (
    <div className="besoins encours-besoins mere-table" role="table">
      <div className="besoins-entete" role="row">
        <span>Mission</span>
        <span>Requis</span>
        <span>Reçu</span>
        <span>État</span>
      </div>
      {ms.map((m) => {
        const e = etatMission(m, d.intendance)
        const close = m.statut === 'close'
        const x = etatEnfant(m, e)
        return (
          <div key={m.numero} role="row" className={`besoins-ligne ${x.classe}`}>
            <span className="besoins-nom">
              <span className="besoins-mot">
                <GlypheType type={m.type} icones={icones} /> {VERBES[m.type]} {m.objet}
              </span>
              {close && <em>close : elle a quitté l’appel</em>}
              {e.attente > 0 && <em>{nf(e.attente)} en attente de confirmation</em>}
              {gestes && (m.statut === 'ouverte' || close) && (
                <span className="encours-gestes">
                  <Action icone={close ? 'rouvrir' : 'clore'} tabIndex={tab} disabled={!pret} title={aide} onClick={() => reg.ouvrir({ genre: 'fermer', cible: 'mission', numero: m.numero, ouvrir: close })}>
                    {close ? 'rouvrir' : 'clore'}
                  </Action>
                </span>
              )}
            </span>
            <span>{nf(e.requis)}</span>
            <span>{nf(e.recu)}</span>
            <span className="besoins-etat">{x.mot}</span>
          </div>
        )
      })}
      <div role="row" className={`besoins-ligne livraison ${l.etat}`}>
        <span className="besoins-nom">
          <span className="besoins-mot">
            <GlypheLivraison icones={icones} /> Livraison
          </span>
          <em>
            {objetQ(l.quantite, l.objet)} {destination(l)}
            {l.etat === 'attend' && <> · au coffre, le registre en compte {nf(auCoffre)}</>}
          </em>
        </span>
        <span>{nf(l.quantite)}</span>
        <span>—</span>
        <span className="besoins-etat">{MOT_COURT_LIVRAISON[l.etat]}</span>
      </div>
    </div>
  )
}

/**
 * One open mother in the missions in progress (lot 2c): a card of its own, the mother as its header (its state in words),
 * its child missions under it, indented, then its last task, the Livraison. When everything is gathered the card says so
 * and gives the next step: check the chest, then close the mother (or deliver the missive).
 */
function BlocEnCours({ dm, ms, reg, icones, tab, stock }: { dm: Demande; ms: Mission[]; reg: CtxRegistre; icones: Record<string, string>; tab: number; stock: Stock }) {
  const d = reg.m!.donnees!
  const peut = permis(reg, 'fermer')
  const pret = d.feuilletsActifs
  const aide = pret ? undefined : TEXTES_FEUILLETS.inactif
  const missive = dm.missive ? reg.r.calcul?.etats.find((e) => e.missive.numero === dm.missive)?.missive : undefined
  const l = livraisonDu(reg, dm)
  const etat = etatMere(l)
  const geste = gesteLivraison(reg, dm, l)
  const auCoffre = Math.max(0, enStock(stock, dm.article))
  const prete = l.etat === 'prete'
  return (
    <li className={`carte-mere ${etat.classe}`}>
      <div className="mere-tete">
        <span className="mere-surtitre">Mission mère{missive ? ' · missive' : ''}</span>
        <button type="button" className="feuillet-titre" tabIndex={tab} onClick={() => reg.allerA(idDemande(dm.numero))}>
          {titreFeuillet(dm)}
        </button>
        <span className="feuillet-meta">
          {missive ? <>missive de {missive.commanditaire || missive.titre}</> : <>pour la caravane</>}
          {dm.membre && <> · écrite par {dm.membre}</>}
          {dm.horodatage && <> le {dateTamrielique(dm.horodatage)}</>}
        </span>
        <p className={`mere-etat ${etat.classe}`}>{etat.texte}</p>
        {peut && (
          <span className="mission-gestes">
            <Action icone="corriger" tabIndex={tab} disabled={!pret} title={aide} onClick={() => reg.ouvrir({ genre: 'feuillet', numero: dm.numero })}>
              corriger
            </Action>
            <Action icone="clore" tabIndex={tab} disabled={!pret} title={aide} onClick={() => reg.ouvrir({ genre: 'fermer', cible: 'feuillet', numero: dm.numero })}>
              clore la mission mère
            </Action>
          </span>
        )}
      </div>
      {(prete || l.etat === 'livree' || l.etat === 'abandonnee') && (
        <div className="mere-suite" role="status">
          {prete ? (
            <p>
              <strong>Prochaine étape :</strong> vérifie de tes yeux qu’il y a bien au coffre {objetQ(dm.quantite, dm.article)} (le registre en compte {nf(auCoffre)}
              {auCoffre < dm.quantite ? <>, <span className="a-fixer">il en manquerait {nf(dm.quantite - auCoffre)}</span></> : null}), puis{' '}
              {l.missive ? <>livre la missive {destination(l)}.</> : <>clos la mission mère : c’est sa livraison {destination(l)}.</>}
            </p>
          ) : (
            <p>
              <strong>Prochaine étape :</strong> {l.etat === 'livree' ? 'la missive est livrée' : 'la missive est abandonnée'} ; clos la mission mère pour qu’elle quitte l’appel.
            </p>
          )}
          {geste && (
            <button type="button" className="geste-mere" tabIndex={tab} disabled={!geste.pret} title={geste.aide} onClick={geste.ouvrir}>
              <Icone corps={icones[geste.texte === 'Livrer la missive' ? 'hand-truck' : 'padlock']} />
              <span>{geste.texte}</span>
            </button>
          )}
        </div>
      )}
      <div className="mere-enfants">
        <p className="mere-enfants-titre">
          {ms.length ? `Ses missions enfants (${ms.length}), puis la livraison` : 'Nulle mission enfant : la livraison seule'}
        </p>
        <TableEnfants dm={dm} ms={ms} l={l} reg={reg} icones={icones} tab={tab} gestes={peut} auCoffre={auCoffre} />
      </div>
    </li>
  )
}

/** The words of a closed mother's goods (lot 2c): delivered, given up, closed before being gathered. */
function motObjetClos(l: Livraison) {
  if (l.etat === 'livree') return l.missive ? 'missive livrée' : 'livraison faite'
  if (l.etat === 'abandonnee') return 'missive abandonnée'
  if (l.etat === 'close') return 'clos avant d’être réuni'
  return 'missive pas encore livrée'
}

/** « 5 missions enfants » and their state, on one line. */
function motEnfants(l: Livraison) {
  if (!l.enfants) return { quoi: 'Nulle mission enfant', etat: 'tout venait du coffre', fait: true }
  const quoi = `${l.enfants} mission${l.enfants > 1 ? 's' : ''} enfant${l.enfants > 1 ? 's' : ''}`
  if (!l.closes && l.comblees === l.enfants) return { quoi, etat: l.enfants > 1 ? 'toutes comblées' : 'comblée', fait: true }
  const parts = [`${l.comblees} comblée${l.comblees > 1 ? 's' : ''} sur ${l.enfants - l.closes}`]
  if (l.closes) parts.push(`${l.closes} close${l.closes > 1 ? 's' : ''} à la main`)
  return { quoi, etat: parts.join(', '), fait: false }
}

/**
 * A closed mother, compact (lot 2c, Ludo: « [titre] [date] … [rouvrir] · [marchandise] [état] [à destination de…] ·
 * [nb missions enfants] [état] »): no author.
 */
function BlocClos({ dm, reg, tab }: { dm: Demande; reg: CtxRegistre; tab: number }) {
  const d = reg.m!.donnees!
  const l = livraisonDu(reg, dm)
  const le = fermeLe(dm)
  const enfants = motEnfants(l)
  return (
    <li className="mere-close">
      <div className="mere-close-tete">
        <button type="button" className="feuillet-titre" tabIndex={tab} onClick={() => reg.allerA(idDemande(dm.numero))}>
          {titreFeuillet(dm)}
        </button>
        <span className="mere-close-date">{le ? `close le ${dateTamrielique(le)}` : 'close'}</span>
        {permis(reg, 'fermer') && (
          <Action icone="rouvrir" tabIndex={tab} disabled={!d.feuilletsActifs} title={d.feuilletsActifs ? undefined : TEXTES_FEUILLETS.inactif} onClick={() => reg.ouvrir({ genre: 'fermer', cible: 'feuillet', numero: dm.numero, ouvrir: true })}>
            rouvrir
          </Action>
        )}
      </div>
      <ul className="mere-close-lignes">
        <li>
          <span>{objetQ(l.quantite, l.objet)}</span>
          <em className={l.etat === 'livree' ? 'fait' : ''}>{motObjetClos(l)}</em>
          <span className="mere-close-dest">{destination(l)}</span>
        </li>
        <li>
          <span>{enfants.quoi}</span>
          <em className={enfants.fait ? 'fait' : ''}>{enfants.etat}</em>
        </li>
      </ul>
    </li>
  )
}

/** « Les missions en cours »: every open mother (a card each), the standing missions, the closed mothers (to reopen). */
function EnCours({ reg, icones, tab, requetes }: { reg: CtxRegistre; icones: Record<string, string>; tab: number; requetes: string[] }) {
  const d = reg.m!.donnees!
  const dico = dicoAnglais(reg.r.donnees)
  const peut = permis(reg, 'fermer')
  const etats = reg.r.calcul?.etats ?? []
  const stock = useMemo(() => rejouer(reg.r.donnees?.mouvements ?? []).stock, [reg.r.donnees?.mouvements])
  const missiveDe = (n: string) => etats.find((e) => e.missive.numero === n)?.missive
  const trouve = (dm: Demande, ms: Mission[]) =>
    requetes.every((q) => !q.trim() || nomsCorrespondent([titreFeuillet(dm), dm.membre, missiveDe(dm.missive)?.titre ?? '', missiveDe(dm.missive)?.commanditaire ?? '', ...avecAnglais([dm.article, ...ms.map((m) => m.objet)], dico)], q))
  // Lot 2c: a mother without any child (everything was in the chest) is shown too: its only task is the delivery.
  const feuillets = [...d.demandes]
    .reverse()
    .map((dm) => ({ dm, ms: d.missions.filter((m) => m.demande === dm.numero) }))
    .filter((x) => trouve(x.dm, x.ms))
  const ouverts = feuillets.filter((x) => !feuilletClos(x.dm))
  const clos = feuillets.filter((x) => feuilletClos(x.dm))
  const permanentes = d.permanentes.filter((x) => requetes.every((q) => !q.trim() || nomsCorrespondent(avecAnglais([x.objet], dico), q)))
  const cherche = requetes.some((q) => q.trim())
  return (
    <div className="intendance-droite encours-droite">
      <AvisAllegement reg={reg} tab={tab} />
      <h3 className="titre-section">Les missions mères ouvertes</h3>
      {ouverts.length ? (
        <ul className="liste-meres">
          {ouverts.map((x) => (
            <BlocEnCours key={x.dm.numero} dm={x.dm} ms={x.ms} reg={reg} icones={icones} tab={tab} stock={stock} />
          ))}
        </ul>
      ) : (
        <p className="vide-encre">{cherche ? 'Nulle mission mère ouverte ne répond à ce nom.' : 'Nulle mission mère n’est ouverte : la caravane n’attend rien, pour l’heure.'}</p>
      )}
      {permanentes.length > 0 && (
        <>
          <h3 className="titre-section">Missions permanentes</h3>
          <ul className="missions-liste">
            {permanentes.map((x) => (
              <li key={x.id} className={`mission permanente ${x.statut !== 'ouverte' ? 'fermee' : ''}`}>
                <GlypheType type={x.type} icones={icones} />
                <span className="mission-texte">
                  <span className="mission-intitule">
                    {VERBES[x.type]} {x.objet}
                  </span>
                  <Meta parts={[x.statut === 'ouverte' ? 'toujours ouverte' : x.statut, voitPoints(reg) && `${pts(x.points)} pour ${nf(x.quantite)}`]} />
                </span>
                <span className="mission-cote">
                  {permis(reg, 'permanente') && (
                    <span className="mission-gestes">
                      {x.statut === 'ouverte' ? (
                        <>
                          <Action icone="pause" tabIndex={tab} onClick={() => reg.ouvrir({ genre: 'etat-permanente', id: x.id, statut: 'en pause' })}>
                            en pause
                          </Action>
                          <Action icone="clore" tabIndex={tab} onClick={() => reg.ouvrir({ genre: 'etat-permanente', id: x.id, statut: 'close' })}>
                            clore
                          </Action>
                        </>
                      ) : (
                        <Action icone="rouvrir" tabIndex={tab} onClick={() => reg.ouvrir({ genre: 'etat-permanente', id: x.id, statut: 'ouverte' })}>
                          rouvrir
                        </Action>
                      )}
                      <Action icone="corriger" tabIndex={tab} onClick={() => reg.ouvrir({ genre: 'permanente', id: x.id })}>
                        régler
                      </Action>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {clos.length > 0 && (
        <>
          <h3 className="titre-section">Missions mères closes</h3>
          <p className="note-encre">Elles ont quitté l’appel ; ce qu’elles ont reçu reste compté. On peut les rouvrir.</p>
          <ul className="liste-meres-closes">
            {clos.map((x) => (
              <BlocClos key={x.dm.numero} dm={x.dm} reg={reg} tab={tab} />
            ))}
          </ul>
        </>
      )}
      {!peut && <p className="note-encre">Corriger ou clore une mission mère est réservé à qui écrit les missions.</p>}
    </div>
  )
}

/* ───────────────────────── Correcting, closing, lightening (lot 2b) ───────────────────────── */

type LigneCorrigee = { q: string; retirer: boolean }

/**
 * Correct a sheet: its title and note, each line's quantity (what was received stays: never below it is proposed), a line
 * removed (only when nothing was received nor declared for it: else it is closed), lines added (the item, how many).
 */
export function FicheFeuillet({ reg, articles, icones, fermer, numero }: EnvMission & { numero: string }) {
  const d = reg.m!.donnees!
  const dm = d.demandes.find((x) => x.numero === numero)
  const ms = useMemo(() => d.missions.filter((m) => m.demande === numero), [d.missions, numero])
  const noms = useMemo(() => nomsObjets(reg, articles), [reg, articles])
  const [v, setV] = useState({ titre: dm?.titre ?? '', note: dm?.note ?? '' })
  const [lignes, setLignes] = useState<Record<string, LigneCorrigee>>({})
  const [ajouts, setAjouts] = useState<LigneSaisie[]>([{ ...LIGNE_VIDE, mission: '' }])
  const { etat, erreur, envoyer } = useScelle(fermer)
  if (!dm) return <p className="fiche-aide">Cette mission mère est introuvable dans le registre.</p>
  const ligne = (m: Mission) => lignes[m.numero] ?? { q: String(m.quantite), retirer: false }
  const changer = (m: Mission, x: Partial<LigneCorrigee>) => setLignes({ ...lignes, [m.numero]: { ...ligne(m), ...x } })
  const ajoutes = lignesDons(ajouts, noms)
  const envoyees = ms
    .filter((m) => m.statut === 'ouverte' || m.statut === 'close')
    .flatMap((m): { numero: string; retirer?: boolean; quantite?: number }[] => {
      const l = ligne(m)
      if (l.retirer) return [{ numero: m.numero, retirer: true }]
      return Number(l.q) >= 1 && Number(l.q) !== m.quantite ? [{ numero: m.numero, quantite: Number(l.q) }] : []
    })
  const incomplet = ms.some((m) => !ligne(m).retirer && !(Number(ligne(m).q) >= 1)) || !ajoutes
  const change = envoyees.length > 0 || (ajoutes?.length ?? 0) > 0 || v.titre.trim() !== dm.titre || v.note.trim() !== dm.note
  const pret = change && !incomplet && d.feuilletsActifs
  return (
    <form
      className="fiche-form intendance-form demande-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (pret) envoyer(() => reg.m!.agir('feuillet', { numero, titre: v.titre, note: v.note, lignes: envoyees, ajouts: (ajoutes ?? []).map((x) => ({ objet: x.objet, quantite: x.quantite })) }))
      }}
    >
      {!d.feuilletsActifs && <p className="fiche-aide">{TEXTES_FEUILLETS.inactif}</p>}
      <label className="fiche-champ">
        <span>Titre</span>
        <input type="text" value={v.titre} maxLength={120} placeholder={`${nf(dm.quantite)} ${dm.article}`} onChange={(e) => setV({ ...v, titre: e.target.value })} />
      </label>
      <h3 className="fiche-sous-titre">Ses missions enfants</h3>
      <p className="fiche-aide">Change une quantité sur sa ligne. Ce qui a été reçu reste compté. Une mission enfant qui a déjà reçu ne se retire pas : on la clôt depuis « En cours ». Retirées toutes, il reste la livraison.</p>
      <div className="tri-missions corriger-missions" role="table">
        <div className="tri-entete" role="row">
          <span>Mission</span>
          <span>Reçu</span>
          <span>Il en faut</span>
        </div>
        {ms.map((m) => {
          const e = etatMission(m, d.intendance)
          const l = ligne(m)
          const prise = m.statut !== 'ouverte' && m.statut !== 'close'
          const retirable = !prise && e.recu === 0 && e.attente === 0
          return (
            <div key={m.numero} className={`tri-ligne ${l.retirer ? 'retiree' : ''}`} role="row">
              <span className="tri-nom">
                <GlypheType type={m.type} icones={icones} />
                <span>
                  {VERBES[m.type]} {m.objet}
                  {m.statut === 'close' && <em> · close</em>}
                  {e.attente > 0 && <em> · {nf(e.attente)} en attente</em>}
                  {retirable && (
                    <button type="button" className="lien-encre tri-retirer" onClick={() => changer(m, { retirer: !l.retirer })}>
                      {l.retirer ? 'la garder' : 'retirer'}
                    </button>
                  )}
                </span>
              </span>
              <span>{nf(e.recu)}</span>
              <input type="text" inputMode="numeric" value={l.q} disabled={l.retirer || prise} aria-label={`${m.objet} : il en faut`} onChange={(x) => changer(m, { q: x.target.value.replace(/\D/g, '').slice(0, 7) })} />
            </div>
          )
        })}
      </div>
      <h3 className="fiche-sous-titre">Ajouter une mission enfant</h3>
      <LignesObjets lignes={ajouts} changer={setAjouts} noms={noms} cibles={[]} sansMission />
      <label className="fiche-champ">
        <span>Note (facultative)</span>
        <input type="text" value={v.note} maxLength={200} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!pret}>
          Graver les corrections
        </Sceller>
      </div>
    </form>
  )
}

/**
 * Closing (or reopening) a mission or a whole sheet: said in character, then confirmed. Closing a mother (lot 2c) lists
 * each child (requis · reçu · manque / comblée) and what the register counts in the chest of what the mother asks for.
 */
export function FicheFermer({ reg, icones, fermer, cible, numero, ouvrir }: EnvMission & { cible: 'mission' | 'feuillet'; numero: string; ouvrir?: boolean }) {
  const d = reg.m!.donnees!
  const { etat, erreur, envoyer } = useScelle(fermer)
  const stock = useMemo(() => rejouer(reg.r.donnees?.mouvements ?? []).stock, [reg.r.donnees?.mouvements])
  const m = cible === 'mission' ? d.missions.find((x) => x.numero === numero) : undefined
  const dm = cible === 'feuillet' ? d.demandes.find((x) => x.numero === numero) : undefined
  if (!m && !dm) return <p className="fiche-aide">Introuvable dans le registre.</p>
  const ms = dm ? d.missions.filter((x) => x.demande === dm.numero) : [m!]
  const attente = ms.reduce((t, x) => t + etatMission(x, d.intendance).attente, 0)
  const recu = ms.reduce((t, x) => t + etatMission(x, d.intendance).recu, 0)
  const nom = m ? `« ${VERBES[m.type]} ${m.objet} »` : `la mission mère « ${titreFeuillet(dm!)} »`
  const l = dm ? livraisonDu(reg, dm) : null
  const auCoffre = dm ? Math.max(0, enStock(stock, dm.article)) : 0
  return (
    <form
      className="fiche-form intendance-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(() => reg.m!.agir('fermer', { cible, numero, ouvrir: ouvrir === true }))
      }}
    >
      {!d.feuilletsActifs && <p className="fiche-aide">{TEXTES_FEUILLETS.inactif}</p>}
      {ouvrir ? (
        <p className="fiche-aide">Rouvrir {nom} ? {m ? 'Elle revient' : 'Ses missions enfants reviennent'} à l’appel aux missions, et chacun peut de nouveau y remettre.</p>
      ) : dm && l ? (
        <>
          <p className="fiche-aide">
            Clore {nom} ? C’est sa livraison : ses missions enfants quittent l’appel aux missions, nul n’y remettra plus rien.
          </p>
          <h3 className="fiche-sous-titre">Ce qui a été réuni</h3>
          <div className="besoins fermer-enfants" role="table">
            <div className="besoins-entete" role="row">
              <span>Mission enfant</span>
              <span>Requis</span>
              <span>Reçu</span>
              <span>État</span>
            </div>
            {ms.map((x) => {
              const e = etatMission(x, d.intendance)
              const t = etatEnfant(x, e)
              return (
                <div key={x.numero} role="row" className={`besoins-ligne ${t.classe}`}>
                  <span className="besoins-nom">
                    <span className="besoins-mot">
                      {VERBES[x.type]} {x.objet}
                    </span>
                    {e.attente > 0 && <em>{nf(e.attente)} en attente de confirmation</em>}
                  </span>
                  <span>{nf(e.requis)}</span>
                  <span>{nf(e.recu)}</span>
                  <span className="besoins-etat">{t.mot}</span>
                </div>
              )
            })}
            {!ms.length && <p className="fiche-aide">Nulle mission enfant : tout était déjà au coffre.</p>}
          </div>
          <h3 className="fiche-sous-titre">Au coffre, selon le registre</h3>
          <ul className="inventaire">
            <li className={auCoffre < dm.quantite ? 'manquant' : ''}>
              <span>{dm.article}</span>
              <span className="points" />
              <strong>{nf(auCoffre)}</strong>
              <em className={auCoffre < dm.quantite ? 'a-fixer' : ''}>(il en faut {nf(dm.quantite)} {destination(l)})</em>
            </li>
          </ul>
          <ul className="fiche-aide-liste">
            {auCoffre < dm.quantite && <li className="a-fixer">Le registre n’en compte pas assez au coffre : vérifie le coffre lui-même avant de clore.</li>}
            {l.etat === 'attend' && <li>Toutes ses missions enfants ne sont pas comblées : la clore maintenant, c’est la livrer incomplète.</li>}
            {l.missive && (l.etat === 'attend' || l.etat === 'prete') && <li>La missive elle-même n’est pas encore livrée : on la livre depuis sa page (« Livrer la missive »).</li>}
            <li>Ce qui a été reçu ({nf(recu)}) reste compté : le coffre et les points ne bougent pas.</li>
            {attente > 0 && <li>Les {nf(attente)} encore en attente de confirmation pourront toujours être reçus (ou refusés) à la Réception.</li>}
            <li>On peut la rouvrir à tout moment depuis « En cours ».</li>
          </ul>
        </>
      ) : (
        <>
          <p className="fiche-aide">Clore {nom} ? Elle quitte l’appel aux missions : nul n’y remettra plus rien.</p>
          <ul className="fiche-aide-liste">
            <li>Ce qui a été reçu ({nf(recu)}) reste compté : le coffre et les points ne bougent pas.</li>
            {attente > 0 && <li>Les {nf(attente)} encore en attente de confirmation pourront toujours être reçus (ou refusés) à la Réception.</li>}
            <li>On peut la rouvrir à tout moment depuis « En cours ».</li>
          </ul>
        </>
      )}
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!d.feuilletsActifs}>
          {ouvrir ? 'Rouvrir' : dm ? 'Clore la mission mère' : 'Clore'}
        </Sceller>
      </div>
    </form>
  )
}

/** A standing mission paused, closed or reopened (its other settings unchanged), confirmed. */
export function FicheEtatPermanente({ reg, icones, fermer, id, statut }: EnvMission & { id: string; statut: Permanente['statut'] }) {
  const d = reg.m!.donnees!
  const x = d.permanentes.find((y) => y.id === id)
  const { etat, erreur, envoyer } = useScelle(fermer)
  if (!x) return <p className="fiche-aide">Cette mission permanente est introuvable.</p>
  const texte =
    statut === 'ouverte'
      ? 'Elle revient à l’appel : chacun peut de nouveau y remettre.'
      : statut === 'en pause'
        ? 'Elle quitte l’appel pour un temps : ce qui a été reçu reste compté, on la rouvre quand on veut.'
        : 'Elle quitte l’appel : ce qui a été reçu reste compté. On peut la rouvrir.'
  return (
    <form
      className="fiche-form intendance-form"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(() => reg.m!.agir('permanente', { id: x.id, objet: x.objet, quantite: x.quantite, points: x.points, statut, note: x.note }))
      }}
    >
      <p className="fiche-aide">
        {VERBES[x.type]} {x.objet} : {texte}
      </p>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones}>
          {statut === 'ouverte' ? 'Rouvrir' : statut === 'en pause' ? 'Mettre en pause' : 'Clore'}
        </Sceller>
      </div>
    </form>
  )
}

/**
 * The upstream missions a sheet's hand-overs make unnecessary (lot 2b): each one ticked, lowered to what the tree still
 * needs, or closed when it received nothing; untick what should stay. Nothing changes before « Alléger ».
 */
export function FicheAlleger({ reg, icones, fermer, numero }: EnvMission & { numero: string }) {
  const d = reg.m!.donnees!
  const dm = d.demandes.find((x) => x.numero === numero)
  const liste = useMemo(() => aAlleger(reg).find((x) => x.dm.numero === numero)?.liste ?? [], [reg, numero])
  const [non, setNon] = useState<Record<string, boolean>>({})
  const { etat, erreur, envoyer } = useScelle(fermer)
  if (!dm) return <p className="fiche-aide">Cette mission mère est introuvable dans le registre.</p>
  if (!liste.length) return <p className="fiche-aide">Rien n’est à alléger : chaque mission enfant sert encore.</p>
  const gardees = liste.filter((x) => !non[x.numero])
  const recus = d.missions
    .filter((m) => m.demande === numero && (m.type === 'fabrication' || cle(m.objet) === cle(dm.article)))
    .map((m) => ({ m, e: etatMission(m, d.intendance) }))
    .filter((x) => x.e.recu > 0)
  return (
    <form
      className="fiche-form intendance-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (gardees.length)
          envoyer(() => reg.m!.agir('feuillet', { numero, allegement: true, lignes: gardees.map((x) => (x.fermer ? { numero: x.numero, fermer: true } : { numero: x.numero, quantite: x.apres })) }))
      }}
    >
      {!d.feuilletsActifs && <p className="fiche-aide">{TEXTES_FEUILLETS.inactif}</p>}
      <p className="fiche-aide">
        Déjà reçu pour « {titreFeuillet(dm)} » : {recus.map((x) => objetQ(x.e.recu, x.m.objet)).join(', ')}. Il n’en faut donc plus autant en amont :
      </p>
      <ul className="choix-missions-liste">
        {liste.map((x) => (
          <li key={x.numero} className={non[x.numero] ? '' : 'cochee'}>
            <label className="fiche-coche">
              <input type="checkbox" checked={!non[x.numero]} onChange={(e) => setNon({ ...non, [x.numero]: !e.target.checked })} />
              <span>
                {VERBES[x.type]} {x.objet} : {x.fermer ? <>plus utile, la clore ({nf(x.avant)} demandés, rien reçu)</> : <>{nf(x.avant)} → {nf(x.apres)}{x.recu > 0 && <> (déjà {nf(x.recu)} reçus)</>}</>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="fiche-aide">Ce qui a été reçu reste compté. Une mission close se rouvre depuis « En cours ».</p>
      {erreur && <p className="message-encre erreur">{erreur}</p>}
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} disabled={!gardees.length || !d.feuilletsActifs}>
          Alléger
        </Sceller>
      </div>
    </form>
  )
}
