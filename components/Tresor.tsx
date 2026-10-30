'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { PageTresor } from '@/lib/types'
import { dateTamrielique, prix } from '@/lib/format'
import { cle } from '@/lib/missives'
import {
  bornes,
  CATEGORIES,
  JOURS,
  REGLAGES_PAIE,
  semaineVoisine,
  soldeEvenement,
  TEXTES_PAIE,
  TRESORERIE,
  type ActionPaie,
  type DonneesPaie,
  type Ecriture,
  type Evenement,
  type Facture,
  type GenreEcriture,
  type ReglagesPaie,
} from '@/lib/paie'
import { Action } from './Ornements'
import { Geste, Signature, type CtxRegistre } from './Missives'
import { ChampNombre, useScelle, type Reponse } from './Missions'
import { Sceller } from './Fiche'

/*
 * The Livre du Trésor (the pay, lib/paie.ts): the week's accounts and pay (sealed weeks as they were
 * sealed), the invoices, the events and their ledgers, the closings, the settings. The pages only show;
 * every form is a note over the left page (components/Fiche.tsx). Paying is one gesture on a line.
 */

/* ───────────────────────── The hook ───────────────────────── */

const ECHEC = "Le coursier n'est pas revenu. Rien n'a été consigné : réessaie."
const FERME = "Le livre du trésor ne répond pas : le coursier n'a pu l'ouvrir. Réessaie dans un moment."

export function useTresor(signe: string | null) {
  const [donnees, setDonnees] = useState<DonneesPaie | null | undefined>(undefined)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string; n: number } | null>(null)
  /** The week shown (null: the current one). */
  const [semaine, setSemaine] = useState<string | null>(null)
  const version = useRef(0)
  const compteur = useRef(0)

  const recevoir = useCallback((d: DonneesPaie | null) => {
    if (d) version.current = Math.max(version.current, d.version ?? 0)
    setDonnees(d)
  }, [])
  const lire = useCallback(() => {
    setErreur(null)
    return fetch(`/api/paie?v=${version.current}${semaine ? `&semaine=${semaine}` : ''}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { donnees?: DonneesPaie | null; message?: string } | null
        if (r.ok && j && 'donnees' in j) recevoir(j.donnees ?? null)
        else setErreur(j?.message ?? FERME)
      })
      .catch(() => setErreur(FERME))
  }, [recevoir, semaine])
  useEffect(() => {
    lire()
  }, [lire, signe])
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 9000)
    return () => clearTimeout(t)
  }, [message])

  const agir = useCallback(
    async (action: ActionPaie, corps: Record<string, unknown>): Promise<Reponse> => {
      const id = ++compteur.current
      let res: Reponse
      try {
        const rep = await fetch('/api/paie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, vu: version.current, semaineVue: semaine, ...corps }) })
        const r = (await rep.json().catch(() => null)) as { ok?: boolean; message?: string; donnees?: DonneesPaie | null } | null
        if (r?.donnees) recevoir(r.donnees)
        else if (rep.ok) lire()
        res = { ok: Boolean(rep.ok && r?.ok), message: r?.message ?? ECHEC }
      } catch {
        res = { ok: false, message: ECHEC }
      }
      setMessage({ ok: res.ok, texte: res.ok ? res.message : `L’encre n’a pas pris : ${res.message}`, n: id })
      return res
    },
    [recevoir, lire, semaine],
  )
  return { donnees, erreur, message, relire: lire, agir, semaine, setSemaine }
}

export type EtatTresor = ReturnType<typeof useTresor>

/* ───────────────────────── Small pieces ───────────────────────── */

const sept = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} septim${Math.abs(n) >= 2 ? 's' : ''}`
const pts = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} pt${Math.abs(n) > 1 ? 's' : ''}`
const jourDe = (iso: string) => (iso ? dateTamrielique(iso) : '')
/** « semaine du 26 de Soufflegivre » */
export const nomSemaine = (s: string) => `semaine du ${dateTamrielique(new Date(bornes(s).debut + 12 * 3600 * 1000).toISOString())}`
const isoJour = (iso: string) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) : '')

function Ferme({ reg }: { reg: CtxRegistre }) {
  const t = reg.t
  if (!t) return null
  if (t.erreur && t.donnees === undefined)
    return (
      <div className="registre-ferme">
        <p>{t.erreur}</p>
        <Action icone="coursier" onClick={t.relire}>
          renvoyer le coursier
        </Action>
      </div>
    )
  if (t.donnees === undefined) return <p className="registre-ferme attente-encre">Le scribe ouvre le livre du trésor…</p>
  if (t.donnees === null) return <p className="registre-ferme">Le livre du trésor n&apos;est pas encore relié au grimoire. Qu&apos;un patriarche y pourvoie.</p>
  return null
}

function Avis({ reg }: { reg: CtxRegistre }) {
  const d = reg.t?.donnees
  const m = reg.t?.message
  return (
    <>
      {d && !d.actif && <p className="missions-inactif">{TEXTES_PAIE.inactif}</p>}
      {m && (
        <p key={m.n} className={`message-encre ${m.ok ? 'ok' : 'erreur'}`} role="status">
          {m.texte}
        </p>
      )}
    </>
  )
}

const peutFaire = (reg: CtxRegistre, a: ActionPaie) => Boolean(reg.r.marchand?.identite) && reg.r.marchand?.droits?.[a] !== false

/** « payé par X le … · annuler », or « à payer · payer » (one gesture, no note). */
function Paiement({ reg, onglet, id, statut, par, le }: { reg: CtxRegistre; onglet: 'clotures' | 'ecrituresEvenement'; id: string; statut: string; par: string; le: string }) {
  const t = reg.t!
  const [envoi, setEnvoi] = useState(false)
  const peut = peutFaire(reg, 'paiement') && Boolean(t.donnees?.actif)
  const payer = async (paye: boolean) => {
    setEnvoi(true)
    await t.agir('paiement', { onglet, id, paye })
    setEnvoi(false)
  }
  if (!statut) return <span className="statut-paie">—</span>
  if (statut === 'payé')
    return (
      <span className="statut-paie paye">
        <span className="tampon petit">payé</span>
        <em title={le ? `le ${jourDe(le)}` : undefined}>{par}</em>
        {peut && (
          <Action icone="annuler" disabled={envoi} onClick={() => payer(false)}>
            annuler
          </Action>
        )}
      </span>
    )
  return (
    <span className="statut-paie">
      <span className="a-verser">à payer</span>
      {peut && (
        <Action icone="verser" disabled={envoi} onClick={() => payer(true)}>
          payé
        </Action>
      )}
    </span>
  )
}

/* ───────────────────────── Pages ───────────────────────── */

export function GaucheTresor({ page, reg, icones, compact }: { page: PageTresor; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const d = reg?.t?.donnees
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {reg && <Ferme reg={reg} />}
      {reg && d && (
        <>
          <Signature reg={reg} />
          <Avis reg={reg} />
          {page.vue === 'semaine' && <CompteSemaine reg={reg} icones={icones} />}
          {page.vue === 'factures' && peutFaire(reg, 'facture') && (
            <div className="gestes">
              <Geste icone={icones['scroll-unfurled']} onClick={() => reg.ouvrir({ genre: 'facture' })}>
                Inscrire une facture
              </Geste>
            </div>
          )}
          {page.vue === 'evenements' && peutFaire(reg, 'evenement') && (
            <div className="gestes">
              <Geste icone={icones['party-flags']} onClick={() => reg.ouvrir({ genre: 'evenement' })}>
                Inscrire un événement
              </Geste>
            </div>
          )}
          {page.vue === 'reglages' && <ResumeReglagesPaie reg={reg} icones={icones} />}
        </>
      )}
    </>
  )
}

export function DroiteTresor({ page, reg }: { page: PageTresor; reg?: CtxRegistre }) {
  const d = reg?.t?.donnees
  if (!reg || !d) return null
  if (page.vue === 'semaine') return <PaieSemaine reg={reg} />
  if (page.vue === 'factures') return <ListeFactures reg={reg} />
  if (page.vue === 'evenements') return <ListeEvenements reg={reg} />
  if (page.vue === 'clotures') return <ListeClotures reg={reg} />
  return <NotePaie reg={reg} />
}

/* ── The week ── */

function CompteSemaine({ reg, icones }: { reg: CtxRegistre; icones: Record<string, string> }) {
  const t = reg.t!
  const d = t.donnees!
  const s = d.semaine
  const aller = (x: string | null) => t.setSemaine(x === d.courante ? null : x)
  const evenements = s.evenements.reduce((x, e) => x + e.solde, 0)
  return (
    <>
      <div className="navigation-semaine">
        <Action icone="annuler" onClick={() => aller(semaineVoisine(s.semaine, -1))}>
          ‹ précédente
        </Action>
        <strong>{nomSemaine(s.semaine)}</strong>
        {s.semaine !== d.courante && (
          <Action icone="lumiere" onClick={() => aller(semaineVoisine(s.semaine, 1))}>
            suivante ›
          </Action>
        )}
      </div>
      <p className="decompte">
        {s.scellee ? (
          <>
            <span className="tampon petit">close</span> le {jourDe(s.scelleeLe)} par {s.scelleePar}
          </>
        ) : s.semaine === d.courante ? (
          'Semaine en cours : les comptes bougent encore.'
        ) : (
          'Semaine passée, pas encore close.'
        )}
      </p>
      <ul className="inventaire compte-semaine">
        <li>
          <span>Ventes{s.nbVentes ? ` (${s.nbVentes} lignes)` : ''}</span>
          <span className="points" />
          <strong>{sept(s.ventes)}</strong>
        </li>
        <li>
          <span>− Factures</span>
          <span className="points" />
          <strong>{sept(s.totalFactures)}</strong>
        </li>
        <li className="total">
          <span>= Reste à répartir</span>
          <span className="points" />
          <strong>{sept(s.reste)}</strong>
        </li>
        {s.deficit > 0 && (
          <li className="deficit">
            <span>Déficit (reporté à la semaine suivante)</span>
            <span className="points" />
            <strong>{sept(s.deficit)}</strong>
          </li>
        )}
        <li>
          <span>Patriarches ({d.reglages.patriarches} %)</span>
          <span className="points" />
          <strong>{sept(s.partPatriarches)}</strong>
        </li>
        <li>
          <span>Pour les points</span>
          <span className="points" />
          <strong>{sept(s.pot)}</strong>
        </li>
        <li>
          <span>Valeur du point ({pts(s.totalPoints)})</span>
          <span className="points" />
          <strong>{s.valeurPoint ? `${prix(s.valeurPoint)} septim` : '—'}</strong>
        </li>
        {s.evenements.length > 0 && (
          <li>
            <span>Événements → trésorerie</span>
            <span className="points" />
            <strong>{sept(evenements)}</strong>
          </li>
        )}
      </ul>
      {!s.scellee && s.sansPlancher > 0 && <p className="note-encre">{s.sansPlancher} ligne{s.sansPlancher > 1 ? 's' : ''} vendue{s.sansPlancher > 1 ? 's' : ''} sans plancher connu (hors catalogue, à négocier) : leur prix tient lieu de plancher.</p>}
      {!s.scellee && d.actif && peutFaire(reg, 'clotureSemaine') && (
        <div className="gestes">
          <Geste icone={icones['locked-chest']} onClick={() => reg.ouvrir({ genre: 'cloture-semaine', semaine: s.semaine })}>
            Clore la semaine
          </Geste>
        </div>
      )}
    </>
  )
}

function PaieSemaine({ reg }: { reg: CtxRegistre }) {
  const d = reg.t!.donnees!
  const s = d.semaine
  const b = bornes(s.semaine)
  const compensations = d.ecritures.filter((x) => {
    const e = d.evenements.find((y) => y.id === x.evenement)
    const t = Date.parse(e?.date ?? '')
    return x.genre === 'participant' && x.statut && t >= b.debut && t < b.fin
  })
  return (
    <div className="paie-droite">
      <h3 className="titre-section">La paie, par rang</h3>
      <div className="tableau-paie" role="table">
        <div className="tableau-paie-entete" role="row">
          <span>Membre</span>
          <span>Points</span>
          <span>Paie</span>
          <span>{s.scellee ? 'Statut' : ''}</span>
        </div>
        {s.lignes.map((l, i) => (
          <div key={l.membre} className={`tableau-paie-ligne ${l.membre === TRESORERIE ? 'tresorerie' : ''}`} role="row">
            <span className="paie-membre">
              <b>{i + 1}.</b> {l.membre}
              {!s.scellee && (l.missions > 0 || l.ventes > 0 || l.orphelins) ? (
                <em>
                  {[l.missions && `missions ${prix(Math.round(l.missions * 100) / 100)}`, l.ventes && `ventes ${prix(Math.round(l.ventes * 100) / 100)}`, l.orphelins && `sans mission ${prix(Math.round(l.orphelins * 100) / 100)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </em>
              ) : null}
            </span>
            <span>{prix(l.points)}</span>
            <strong>{sept(l.montant)}</strong>
            <span>{s.scellee && l.ligne && l.membre !== TRESORERIE && <Paiement reg={reg} onglet="clotures" id={l.ligne.id} statut={l.ligne.statut} par={l.ligne.payePar} le={l.ligne.payeLe} />}</span>
            {l.patriarche > 0 && (
              <>
                <span className="paie-membre paie-patriarche">salaire de Patriarche</span>
                <span />
                <strong>{sept(l.patriarche)}</strong>
                <span>{s.scellee && l.ligneP && <Paiement reg={reg} onglet="clotures" id={l.ligneP.id} statut={l.ligneP.statut} par={l.ligneP.payePar} le={l.ligneP.payeLe} />}</span>
              </>
            )}
          </div>
        ))}
      </div>
      {!s.lignes.length && <p className="vide-encre">Nul point cette semaine.</p>}
      {compensations.length > 0 && (
        <>
          <h3 className="titre-section">Compensations d’événements</h3>
          <div className="tableau-paie" role="table">
            {compensations.map((x) => (
              <div key={x.id} className="tableau-paie-ligne" role="row">
                <span className="paie-membre">
                  {x.membre} <em>{d.evenements.find((e) => e.id === x.evenement)?.nom}</em>
                </span>
                <span />
                <strong>{sept(x.montant)}</strong>
                <span>
                  <Paiement reg={reg} onglet="ecrituresEvenement" id={x.id} statut={x.statut} par={x.payePar} le={x.payeLe} />
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <h3 className="titre-section">Factures de la semaine</h3>
      <ul className="inventaire">
        {s.factures.map((f) => (
          <li key={f.id}>
            <span>
              {f.libelle}
              {f.auto && <em className="facture-auto"> (automatique)</em>}
            </span>
            <span className="points" />
            <strong>{sept(f.montant)}</strong>
          </li>
        ))}
      </ul>
      <p className="note-encre">
        Les ventes du Livre d’ombre ne sont comptées nulle part pour l’instant. La part des ressources et de la fabrication des marchandises vendues qu’aucune mission
        de la semaine n’a payée revient à la trésorerie.
      </p>
    </div>
  )
}

/* ── Invoices ── */

function ListeFactures({ reg }: { reg: CtxRegistre }) {
  const d = reg.t!.donnees!
  const peut = peutFaire(reg, 'facture')
  const parSemaine = new Map<string, Facture[]>()
  for (const f of [...d.factures].sort((a, b) => b.date.localeCompare(a.date))) {
    const k = semaineDeFacture(f, d)
    parSemaine.set(k, [...(parSemaine.get(k) ?? []), f])
  }
  return (
    <div className="factures-droite">
      <p className="note-encre">
        Le loyer ({sept(d.reglages.loyer)}) est compté chaque semaine sans qu’on l’inscrive, sauf si une facture « loyer » est inscrite cette semaine-là. Une facture liée à un événement compte
        dans les comptes de l’événement, pas dans ceux de la semaine.
      </p>
      {!d.factures.length && <p className="vide-encre">Nulle facture n’est encore inscrite.</p>}
      {[...parSemaine].map(([k, fs]) => (
        <section key={k}>
          <h3 className="titre-section">{nomSemaine(k)}</h3>
          {fs.map((f) => (
            <button key={f.id} type="button" className="ligne-tresor" disabled={!peut} onClick={() => reg.ouvrir({ genre: 'facture', id: f.id })}>
              <span>
                {f.libelle}
                <em>
                  {f.categorie}
                  {f.evenement && ` · ${d.evenements.find((e) => e.id === f.evenement)?.nom ?? f.evenement}`} · {jourDe(f.date)}
                </em>
              </span>
              <strong>{sept(f.montant)}</strong>
            </button>
          ))}
        </section>
      ))}
    </div>
  )
}

const semaineDeFacture = (f: Facture, d: DonneesPaie) => {
  // The week's key from the settings' first day (the same rule as the closing).
  const j = JOURS.indexOf(cle(d.reglages.jour))
  const t = new Date(new Date(f.date).getTime() + 9 * 3600 * 1000)
  const recul = (t.getUTCDay() - (j < 0 ? 1 : j) + 7) % 7
  return `S-${new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - recul * 86400000).toISOString().slice(0, 10)}`
}

/* ── Events ── */

function ListeEvenements({ reg }: { reg: CtxRegistre }) {
  const d = reg.t!.donnees!
  const evs = [...d.evenements].sort((a, b) => b.date.localeCompare(a.date))
  if (!evs.length) return <p className="vide-encre">Nul événement n’est encore inscrit.</p>
  return (
    <div className="evenements-droite">
      <h3 className="titre-section">Les événements</h3>
      {evs.map((e) => {
        const s = soldeEvenement(e, d.ecritures, d.factures)
        const participants = d.ecritures.filter((x) => x.evenement === e.id && x.genre === 'participant').length
        return (
          <button key={e.id} type="button" className="ligne-tresor" onClick={() => reg.ouvrir({ genre: 'evenement', id: e.id })}>
            <span>
              {e.nom}
              <em>
                {jourDe(e.date)} · {participants} participant{participants > 1 ? 's' : ''} · entrées {prix(s.entrees)}, dépenses {prix(s.depenses)}, compensations {prix(s.compensations)}
              </em>
            </span>
            <strong className={s.solde < 0 ? 'negatif' : ''}>{sept(s.solde)}</strong>
          </button>
        )
      })}
      <p className="note-encre">Le solde d’un événement va à la trésorerie ; il n’entre pas dans le partage des points de la semaine.</p>
    </div>
  )
}

/* ── Closings ── */

function ListeClotures({ reg }: { reg: CtxRegistre }) {
  const t = reg.t!
  const d = t.donnees!
  if (!d.scellees.length) return <p className="vide-encre">Nulle semaine n’est encore close.</p>
  return (
    <div className="clotures-droite">
      <h3 className="titre-section">Semaines closes</h3>
      {d.scellees.map((s) => {
        const ls = d.clotures.filter((l) => l.semaine === s)
        const compte = (k: string) => ls.find((l) => l.genre === 'compte' && cle(l.libelle) === cle(k))?.montant ?? 0
        const aPayer = ls.filter((l) => l.statut === 'à payer')
        return (
          <button
            key={s}
            type="button"
            className="ligne-tresor"
            onClick={() => {
              t.setSemaine(s === d.courante ? null : s)
              reg.allerA('tresor-semaine')
            }}
          >
            <span>
              {nomSemaine(s)}
              <em>
                ventes {prix(compte('Ventes'))} · reste {prix(compte('Reste'))}
                {compte('Déficit') > 0 && ` · déficit ${prix(compte('Déficit'))}`} · le point {prix(compte('Valeur du point'))}
              </em>
            </span>
            <strong className={aPayer.length ? 'a-verser' : ''}>{aPayer.length ? `${aPayer.length} à payer` : 'tout payé'}</strong>
          </button>
        )
      })}
    </div>
  )
}

/* ── Settings ── */

const valeurReglage = (r: ReglagesPaie, k: keyof ReglagesPaie) => {
  const v = r[k]
  return typeof v === 'number' ? prix(v) : v || '—'
}

function ResumeReglagesPaie({ reg, icones }: { reg: CtxRegistre; icones: Record<string, string> }) {
  const d = reg.t!.donnees!
  return (
    <>
      <ul className="inventaire reglages-missions">
        {REGLAGES_PAIE.map((r) => (
          <li key={r.cle}>
            <span>{r.libelle}</span>
            <span className="points" />
            <strong>{valeurReglage(d.reglages, r.cle)}</strong>
          </li>
        ))}
      </ul>
      {peutFaire(reg, 'reglagesPaie') && (
        <div className="gestes">
          <Geste icone={icones['cog']} onClick={() => reg.ouvrir({ genre: 'reglages-paie' })}>
            Changer les réglages
          </Geste>
        </div>
      )}
    </>
  )
}

function NotePaie({ reg }: { reg: CtxRegistre }) {
  const d = reg.t!.donnees!
  const s = d.semaine
  const patriarches = s.patriarches
  return (
    <div className="paie-droite">
      <h3 className="titre-section">La clé de partage</h3>
      <p className="note-encre">
        Chaque vente rapporte autant de points que de septims : {d.reglages.tresorerie} % du prix réel à la trésorerie ; {d.reglages.ressources} % du plancher aux ressources et {d.reglages.fabrication} % à la fabrication
        (par les missions, à leur remise) ; au vendeur {d.reglages.vendeurPlancher} % du plancher et {d.reglages.vendeurSurplus} % de ce qui le dépasse. À la clôture : ventes − factures = reste ; {d.reglages.patriarches} % aux
        Patriarches, à parts égales ; le reste au prorata des points de la semaine, trésorerie comprise. Les missions lisent ces mêmes parts.
      </p>
      <h3 className="titre-section">Les Patriarches</h3>
      <p className="note-encre">{patriarches.length ? patriarches.join(', ') : 'Aucun : leur part reste dans le pot.'}</p>
    </div>
  )
}

/* ───────────────────────── The notes ───────────────────────── */

type EnvTresor = { reg: CtxRegistre; icones: Record<string, string>; fermer: () => void }
export type FicheTresor = { genre: 'facture'; id?: string } | { genre: 'evenement'; id?: string } | { genre: 'reglages-paie' } | { genre: 'cloture-semaine'; semaine: string }

export function contenuTresor(f: FicheTresor, env: EnvTresor): { surtitre: string; titre: string; corps: ReactNode; action: ActionPaie } {
  const d = env.reg.t?.donnees
  if (!d) return { surtitre: 'Livre du Trésor', titre: 'Le trésor', corps: <p className="registre-ferme attente-encre">Le scribe ouvre le livre du trésor…</p>, action: 'facture' }
  switch (f.genre) {
    case 'facture':
      return { surtitre: 'Livre du Trésor', titre: f.id ? 'Corriger la facture' : 'Inscrire une facture', corps: <FicheFacture {...env} id={f.id} />, action: 'facture' }
    case 'evenement': {
      const e = d.evenements.find((x) => x.id === f.id)
      return { surtitre: 'Les événements', titre: e?.nom ?? 'Inscrire un événement', corps: <FicheEvenement key={f.id ?? 'nouveau'} {...env} id={f.id} />, action: 'evenement' }
    }
    case 'reglages-paie':
      return { surtitre: 'Livre du Trésor', titre: 'Les réglages de la paie', corps: <FicheReglagesPaie {...env} />, action: 'reglagesPaie' }
    case 'cloture-semaine':
      return { surtitre: 'Livre du Trésor', titre: 'Clore la semaine', corps: <FicheCloture {...env} semaine={f.semaine} />, action: 'clotureSemaine' }
  }
}

function Erreur({ texte }: { texte: string | null }) {
  return texte ? <p className="message-encre erreur">{texte}</p> : null
}

function FicheFacture({ reg, icones, fermer, id }: EnvTresor & { id?: string }) {
  const t = reg.t!
  const d = t.donnees!
  const f = d.factures.find((x) => x.id === id)
  const [v, setV] = useState({ date: isoJour(f?.date ?? new Date().toISOString()), libelle: f?.libelle ?? '', montant: f ? String(f.montant) : '', categorie: f?.categorie ?? 'autre', evenement: f?.evenement ?? '', note: f?.note ?? '' })
  const { etat, erreur, envoyer } = useScelle(fermer)
  const [rayer, setRayer] = useState(false)
  return (
    <form
      className="fiche-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        envoyer(() => t.agir('facture', { id, ...v }))
      }}
    >
      <label className="fiche-champ">
        <span>Libellé</span>
        <input type="text" value={v.libelle} maxLength={120} placeholder="Uniformes de la nouvelle lune" onChange={(e) => setV({ ...v, libelle: e.target.value })} />
      </label>
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Montant (septims)</span>
          <input type="text" inputMode="decimal" value={v.montant} placeholder="500" onChange={(e) => setV({ ...v, montant: e.target.value.replace(/[^\d.,]/g, '') })} />
        </label>
        <label className="fiche-champ">
          <span>Date</span>
          <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </label>
      </div>
      <div className="fiche-deux">
        <label className="fiche-champ">
          <span>Catégorie</span>
          <select value={v.categorie} onChange={(e) => setV({ ...v, categorie: e.target.value as Facture['categorie'] })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="fiche-champ">
          <span>Événement</span>
          <select value={v.evenement} onChange={(e) => setV({ ...v, evenement: e.target.value })}>
            <option value="">— aucun (facture de la semaine) —</option>
            {d.evenements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="fiche-champ">
        <span>Note</span>
        <input type="text" value={v.note} maxLength={200} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      <Erreur texte={erreur} />
      <div className="fiche-pied">
        {f && etat === 'repos' && (
          <Action icone="retirer" onClick={() => (rayer ? envoyer(() => t.agir('facture', { id, supprimer: true })) : setRayer(true))}>
            {rayer ? 'rayer pour de bon' : 'rayer la facture'}
          </Action>
        )}
        <Sceller etat={etat} icones={icones}>
          {f ? 'Corriger' : 'Inscrire'}
        </Sceller>
      </div>
    </form>
  )
}

const GENRES: { g: GenreEcriture; mot: string }[] = [
  { g: 'entrée', mot: 'Entrée (+)' },
  { g: 'dépense', mot: 'Dépense (−)' },
  { g: 'lot', mot: 'Lot offert' },
  { g: 'participant', mot: 'Participant' },
]

function FicheEvenement({ reg, icones, fermer, id }: EnvTresor & { id?: string }) {
  const t = reg.t!
  const d = t.donnees!
  const e = d.evenements.find((x) => x.id === id)
  const [v, setV] = useState({ nom: e?.nom ?? '', date: isoJour(e?.date ?? new Date().toISOString()), note: e?.note ?? '', compensation: e?.compensation === null || e?.compensation === undefined ? '' : String(e.compensation) })
  const [edition, setEdition] = useState(!e)
  const { etat, erreur, envoyer } = useScelle(e ? () => setEdition(false) : fermer)
  if (!e || edition)
    return (
      <form
        className="fiche-form"
        onSubmit={(x: FormEvent) => {
          x.preventDefault()
          envoyer(() => t.agir('evenement', { id, ...v }))
        }}
      >
        <label className="fiche-champ">
          <span>Nom</span>
          <input type="text" value={v.nom} maxLength={120} placeholder="La tombola de la pleine lune" onChange={(x) => setV({ ...v, nom: x.target.value })} />
        </label>
        <div className="fiche-deux">
          <label className="fiche-champ">
            <span>Date</span>
            <input type="date" value={v.date} onChange={(x) => setV({ ...v, date: x.target.value })} />
          </label>
          <label className="fiche-champ">
            <span>Compensation / participant</span>
            <input type="text" inputMode="decimal" value={v.compensation} placeholder={`${prix(d.reglages.compensation)} (réglage)`} onChange={(x) => setV({ ...v, compensation: x.target.value.replace(/[^\d.,]/g, '') })} />
          </label>
        </div>
        <label className="fiche-champ">
          <span>Note</span>
          <input type="text" value={v.note} maxLength={200} onChange={(x) => setV({ ...v, note: x.target.value })} />
        </label>
        <Erreur texte={erreur} />
        <div className="fiche-pied">
          {e && etat === 'repos' && (
            <Action icone="annuler" onClick={() => setEdition(false)}>
              revenir au registre
            </Action>
          )}
          <Sceller etat={etat} icones={icones}>
            {e ? 'Corriger' : 'Inscrire l’événement'}
          </Sceller>
        </div>
      </form>
    )
  return <RegistreEvenement reg={reg} icones={icones} e={e} corriger={() => setEdition(true)} />
}

/** An event's ledger in its note: its lines (strike one out), its balance, a line to add. */
function RegistreEvenement({ reg, icones, e, corriger }: { reg: CtxRegistre; icones: Record<string, string>; e: Evenement; corriger: () => void }) {
  const t = reg.t!
  const d = t.donnees!
  const lignes = d.ecritures.filter((x) => x.evenement === e.id)
  const factures = d.factures.filter((f) => f.evenement === e.id)
  const s = soldeEvenement(e, d.ecritures, d.factures)
  const [n, setN] = useState({ genre: 'entrée' as GenreEcriture, libelle: '', montant: '', membre: '', objet: '', quantite: '', coffre: true })
  const { etat, erreur, envoyer } = useScelle(() => setN({ ...n, libelle: '', montant: '', membre: '', objet: '', quantite: '' }))
  const peut = peutFaire(reg, 'ecriture') && d.actif
  const compensation = e.compensation ?? d.reglages.compensation
  const ligne = (x: Ecriture) => (
    <li key={x.id}>
      <span>
        {x.genre === 'participant' ? x.membre : x.genre === 'lot' ? `${prix(x.quantite)} ${x.objet}` : x.libelle}
        <em>
          {' '}
          {x.genre}
          {x.genre === 'lot' && x.statut ? ` · ${x.statut}` : ''}
        </em>
      </span>
      <span className="points" />
      <strong className={x.genre === 'entrée' ? '' : 'negatif'}>{x.genre === 'lot' && !x.montant ? '—' : `${x.genre === 'entrée' ? '+' : '−'}${prix(x.montant)}`}</strong>
      {x.genre === 'participant' && <Paiement reg={reg} onglet="ecrituresEvenement" id={x.id} statut={x.statut} par={x.payePar} le={x.payeLe} />}
      {peut && x.statut !== 'payé' && (
        <button type="button" className="fiche-rayer" title="Rayer" aria-label={`Rayer ${x.libelle || x.membre}`} onClick={() => t.agir('ecriture', { supprimer: x.id })}>
          ✕
        </button>
      )}
    </li>
  )
  return (
    <div className="fiche-form registre-evenement">
      <p className="fiche-aide">
        {jourDe(e.date)}
        {e.note && ` · ${e.note}`} · compensation {sept(compensation)} par participant{' '}
        {peutFaire(reg, 'evenement') && (
          <Action icone="corriger" onClick={corriger}>
            corriger
          </Action>
        )}
      </p>
      <ul className="inventaire ecritures-evenement">
        {lignes.map(ligne)}
        {factures.map((f) => (
          <li key={f.id}>
            <span>
              {f.libelle} <em>facture</em>
            </span>
            <span className="points" />
            <strong className="negatif">−{prix(f.montant)}</strong>
          </li>
        ))}
        <li className="total">
          <span>Solde → trésorerie</span>
          <span className="points" />
          <strong className={s.solde < 0 ? 'negatif' : ''}>{sept(s.solde)}</strong>
        </li>
      </ul>
      {peut && (
        <form
          className="fiche-form"
          onSubmit={(x: FormEvent) => {
            x.preventDefault()
            envoyer(() => t.agir('ecriture', { evenement: e.id, ...n, montant: n.genre === 'participant' && !n.montant ? '' : n.montant }))
          }}
        >
          <h3 className="fiche-sous-titre">Ajouter une ligne</h3>
          <div className="choix-genre" role="group">
            {GENRES.map((g) => (
              <button key={g.g} type="button" className={`lien-encre ${n.genre === g.g ? 'actif' : ''}`} aria-pressed={n.genre === g.g} onClick={() => setN({ ...n, genre: g.g })}>
                {g.mot}
              </button>
            ))}
          </div>
          {n.genre === 'participant' ? (
            <div className="fiche-deux">
              <label className="fiche-champ">
                <span>Membre</span>
                <input type="text" value={n.membre} placeholder="son nom au registre" onChange={(x) => setN({ ...n, membre: x.target.value })} />
              </label>
              <label className="fiche-champ">
                <span>Compensation</span>
                <input type="text" inputMode="decimal" value={n.montant} placeholder={prix(compensation)} onChange={(x) => setN({ ...n, montant: x.target.value.replace(/[^\d.,]/g, '') })} />
              </label>
            </div>
          ) : n.genre === 'lot' ? (
            <>
              <div className="fiche-deux">
                <label className="fiche-champ">
                  <span>Objet</span>
                  <input type="text" value={n.objet} placeholder="Potion de soin" onChange={(x) => setN({ ...n, objet: x.target.value })} />
                </label>
                <label className="fiche-champ">
                  <span>Quantité</span>
                  <input type="text" inputMode="numeric" value={n.quantite} placeholder="3" onChange={(x) => setN({ ...n, quantite: x.target.value.replace(/\D/g, '') })} />
                </label>
              </div>
              <label className="fiche-coche">
                <input type="checkbox" checked={n.coffre} onChange={(x) => setN({ ...n, coffre: x.target.checked })} /> sortir du coffre des missives (une ligne au journal du coffre)
              </label>
            </>
          ) : (
            <div className="fiche-deux">
              <label className="fiche-champ">
                <span>Libellé</span>
                <input type="text" value={n.libelle} placeholder={n.genre === 'entrée' ? 'Billets de tombola' : 'Les bardes'} onChange={(x) => setN({ ...n, libelle: x.target.value })} />
              </label>
              <label className="fiche-champ">
                <span>Montant</span>
                <input type="text" inputMode="decimal" value={n.montant} placeholder="120" onChange={(x) => setN({ ...n, montant: x.target.value.replace(/[^\d.,]/g, '') })} />
              </label>
            </div>
          )}
          <Erreur texte={erreur} />
          <div className="fiche-pied">
            <Sceller etat={etat} icones={icones}>
              Inscrire la ligne
            </Sceller>
          </div>
        </form>
      )}
    </div>
  )
}

function FicheReglagesPaie({ reg, icones, fermer }: EnvTresor) {
  const t = reg.t!
  const [r, setR] = useState<ReglagesPaie>(t.donnees!.reglages)
  const { etat, erreur, envoyer } = useScelle(fermer)
  return (
    <form
      className="fiche-form ponderation-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        envoyer(() => t.agir('reglagesPaie', { reglages: r }))
      }}
    >
      {REGLAGES_PAIE.map((x) => (
        <label key={x.cle} className="fiche-champ reglage">
          <span>{x.libelle}</span>
          {x.cle === 'jour' ? (
            <select value={r.jour} onChange={(e) => setR({ ...r, jour: e.target.value })}>
              {JOURS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          ) : x.texte ? (
            <input type="text" value={String(r[x.cle])} maxLength={400} onChange={(e) => setR({ ...r, [x.cle]: e.target.value })} />
          ) : (
            <ChampNombre valeur={r[x.cle] as number} changer={(v) => setR({ ...r, [x.cle]: v ?? 0 })} />
          )}
          <em className="fiche-aide">{x.note}</em>
        </label>
      ))}
      <Erreur texte={erreur} />
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones}>
          Graver les réglages
        </Sceller>
      </div>
    </form>
  )
}

function FicheCloture({ reg, icones, fermer, semaine }: EnvTresor & { semaine: string }) {
  const t = reg.t!
  const s = t.donnees!.semaine
  const { etat, erreur, envoyer } = useScelle(fermer)
  if (s.semaine !== semaine) return <p className="fiche-aide">Retourne à la {nomSemaine(semaine)} pour la clore.</p>
  const enCours = Date.now() < bornes(semaine).fin
  return (
    <form
      className="fiche-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        envoyer(() => t.agir('clotureSemaine', { semaine }))
      }}
    >
      <p className="fiche-aide">
        {nomSemaine(semaine)} : {sept(s.ventes)} de ventes, {sept(s.totalFactures)} de factures,{' '}
        {s.deficit > 0 ? <strong className="a-fixer">un déficit de {sept(s.deficit)} : nul ne sera payé, le déficit passe à la semaine suivante.</strong> : <>{sept(s.reste)} à répartir, le point à {prix(s.valeurPoint)} septim.</>}
      </p>
      {enCours && <p className="message-encre erreur">La semaine n’est pas finie : ce qui se vendra encore n’y sera pas compté.</p>}
      <p className="fiche-aide">Une fois close, la semaine ne bouge plus : ses lignes de paie attendent d’être payées.</p>
      <Erreur texte={erreur} />
      <div className="fiche-pied">
        <Sceller etat={etat} icones={icones} confirmer={enCours}>
          Sceller la semaine
        </Sceller>
      </div>
    </form>
  )
}
