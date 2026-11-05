'use client'

import { useMemo, useState } from 'react'
import type { Article, PageIntendance } from '@/lib/types'
import { dateTamrielique } from '@/lib/format'
import { cle, enStock, recetteUsage, rejouer, variantesDe } from '@/lib/missives'
import { nomDuRegistre } from '@/lib/noms'
import { nomsCorrespondent } from '@/lib/recherche'
import { estEntree, etatFaconnage, etatMission, objetQ, PETITES_LUNES, quoiLigne, tauxDe, type LigneIntendance } from '@/lib/intendance'
import { avancement, pointsDon, VERBES, type DonneesMissions } from '@/lib/missions'
import { Action } from './Ornements'
import { ChampNom } from './ChampNom'
import { Geste, Jauge, quand, Signature, type CtxRegistre, type RechercheLocale } from './Missives'
import { Sceller } from './Fiche'
import {
  ChampRecherche,
  ciblesDe,
  Ferme,
  GlypheType,
  Inactif,
  LIGNE_VIDE,
  lignesEnvoyees,
  LignesObjets,
  Message,
  Meta,
  moiDe,
  nf,
  nomsObjets,
  ouvert,
  permis,
  pts,
  useScelle,
  voitPoints,
  type LigneSaisie,
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
  const vus = lignes
    .filter((l) => requetes.every((q) => !q.trim() || nomsCorrespondent([l.objet, l.membre, l.par, l.note, titreDe(d, l.demande)], q)))
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
          <Message reg={reg} />
          <div className="gestes">
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
          {page.vue !== 'ecrire' && <ChampRecherche recherche={recherche} placeholder={page.vue === 'reception' ? 'Chercher une entrée, un nom…' : 'Chercher une sortie, un nom…'} />}
          {page.vue === 'ecrire' && <ChampRecherche recherche={recherche} placeholder="Chercher un feuillet…" />}
        </>
      )}
    </>
  )
}

export function DroiteIntendance({ page, reg, icones, interactif, requetes = [] }: { page: PageIntendance; reg?: CtxRegistre; icones: Record<string, string>; interactif: boolean; requetes?: string[] }) {
  const d = reg?.m?.donnees
  if (!reg || !d?.relie) return null
  const tab = interactif ? 0 : -1
  if (page.vue === 'reception')
    return (
      <div className="intendance-droite">
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
  // « Écrire une mission »: the sheets written, their progress; the standing missions.
  const feuillets = [...d.demandes].reverse().filter((x) => requetes.every((q) => !q.trim() || nomsCorrespondent([x.titre, x.article, x.membre], q)))
  return (
    <div className="intendance-droite">
      <h3 className="titre-section">Les feuillets écrits</h3>
      {feuillets.length ? (
        <ul className="liste-demandes">
          {feuillets.map((x) => {
            const a = avancement(x, d.missions, d.intendance)
            return (
              <li key={x.numero} className="demande">
                <button type="button" className="lien-encre demande-titre" tabIndex={tab} onClick={() => reg.allerA(idDemande(x.numero))}>
                  {x.titre || `${nf(x.quantite)} ${x.article}`}
                </button>
                <span className="demande-meta">
                  {x.horodatage && <>le {dateTamrielique(x.horodatage)}</>}
                  {x.membre && <> par {x.membre}</>}
                  {x.missive && <> · missive</>}
                </span>
                <span className="demande-avance">
                  <Jauge avance={a.avance} titre={`${a.comblees} missions comblées sur ${a.total}`} />
                  <span>
                    {a.comblees}/{a.total} comblées{voitPoints(reg) && <> · {pts(a.points)}</>}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="vide-encre">Nul feuillet n’est encore écrit.</p>
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

/* ───────────────────────── The notes ───────────────────────── */

/** The first line of a note opened from a mission: its item, what it still lacks, the mission itself. */
function premiereLigne(d: DonneesMissions, ref?: string): LigneSaisie {
  if (!ref) return LIGNE_VIDE
  const m = d.missions.find((x) => x.numero === ref)
  if (m) return { objet: m.objet, quantite: String(etatMission(m, d.intendance).manque || ''), mission: m.numero }
  const p = d.permanentes.find((x) => x.id === ref)
  return p ? { objet: p.objet, quantite: '', mission: p.id } : LIGNE_VIDE
}

/** A member's declaration (S5): left in the petites lunes chest, or handed to someone; it waits for a yes / no. */
export function FicheSignaler({ reg, articles, icones, fermer, mission }: EnvMission & { mission?: string }) {
  const d = reg.m!.donnees!
  const noms = useMemo(() => nomsObjets(reg, articles), [reg, articles])
  const cibles = useMemo(() => ciblesDe(d), [d])
  const [lignes, setLignes] = useState<LigneSaisie[]>([premiereLigne(d, mission)])
  const [ou, setOu] = useState<'petites' | 'main'>('petites')
  const [note, setNote] = useState('')
  const { etat, erreur, envoyer } = useScelle(fermer)
  const envoyees = lignesEnvoyees(lignes, cibles, noms)
  return (
    <form
      className="fiche-form intendance-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (envoyees) envoyer(() => reg.m!.agir('signaler', { lignes: envoyees, coffre: ou === 'petites' ? PETITES_LUNES : 'main', note }))
      }}
    >
      <p className="fiche-aide">Ce que tu as remis pour la caravane. Une patte de l’Intendance répondra « reçu » ; d’ici là, rien n’est compté.</p>
      <LignesObjets lignes={lignes} changer={setLignes} noms={noms} cibles={cibles} fige={Boolean(mission)} />
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
    if (m) return t + Math.round(tauxDe(m) * l.quantite)
    return t + pointsDon(l.objet, l.quantite, recettes, articles, d.ponderation, false).points
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
  const [lignes, setLignes] = useState<LigneSaisie[]>(f ? [{ objet: f.objet, quantite: String(retour?.attendu || ''), mission: f.mission }] : [mission ? premiereLigne(d, mission) : { ...LIGNE_VIDE, mission: don ? '' : '?' }])
  const [rentrees, setRentrees] = useState<LigneSaisie[]>([{ ...LIGNE_VIDE, mission: '' }])
  const [note, setNote] = useState('')
  const { etat, erreur, envoyer } = useScelle(fermer)
  const envoyees = lignesEnvoyees(lignes, cibles, noms)
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
      <LignesObjets lignes={lignes} changer={setLignes} noms={noms} cibles={cibles} fige={Boolean(mission || f)} />
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
  const nom = produits.find((p) => cle(p) === cle(v.produit)) ?? ''
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
          <datalist id="produits-faconner">
            {produits.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
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

