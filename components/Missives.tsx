'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import type { PageAtelier, PageCoffre, PageMissive, PageMissives } from '@/lib/types'
import { dateTamrielique, prix } from '@/lib/format'
import { cle, enStock, partager, rejouer, texteCycle, type EtatMissive, type LigneBesoin, type Mouvement, type Niveau } from '@/lib/missives'
import type { EtatRegistre } from './Registre'
import { Icone } from './Ornements'

/*
 * The book of Missives: the list of missives, one page per missive (needs, contributions, ledger),
 * the Missive chest (stock and inventory checks with their gaps) and the workshop (recipes and
 * resources). Actions open a slip laid on the left page (components/Fiche.tsx).
 */

export type Fiche =
  | { genre: 'recette'; nom: string }
  | { genre: 'edition-recette'; nom: string }
  | { genre: 'ressource'; nom: string }
  | { genre: 'missive' }
  | { genre: 'releve'; numero?: string }
  | { genre: 'depot' | 'fabrication' | 'livraison' | 'cloture'; numero: string }

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

/** The member's signature: their name once recognized, else a field to sign with it. */
export function Signature({ r, invite, icones }: { r: EtatRegistre; invite?: string; icones: Record<string, string> }) {
  const [nom, setNom] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const m = r.marchand
  if (!m || !m.relie) return null
  if (m.identite) {
    return (
      <p className="signature-membre">
        Tu signes de la patte de <strong>{m.identite}</strong>
        {!m.discord && (
          <button type="button" className="lien-encre" onClick={r.oublier}>
            ce n&apos;est pas mon nom
          </button>
        )}
      </p>
    )
  }
  const envoyer = async (e: FormEvent) => {
    e.preventDefault()
    if (!nom.trim() || envoi) return
    setEnvoi(true)
    setMessage(null)
    const rep = await r.signer(nom.trim())
    setEnvoi(false)
    if (!rep.ok) setMessage(rep.message)
  }
  return (
    <form className="signature-form" onSubmit={envoyer}>
      <p className="signature-invite">{invite ?? 'Avant de prendre part aux missives, inscris ton nom tel que la caravane le connaît.'}</p>
      <div className="signature-ligne">
        <input
          type="text"
          value={nom}
          maxLength={80}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Ton nom de marchand"
          autoComplete="off"
          name="nom-membre"
          aria-label="Ton nom de marchand"
        />
        <button type="submit" className="commande-sceller signature-sceller" disabled={envoi || !nom.trim()}>
          <span className="commande-cire" aria-hidden>
            <Icone corps={icones['quill']} />
          </span>
          {envoi ? 'Le scribe cherche…' : 'Signer'}
        </button>
      </div>
      {message && (
        <p className="message-encre erreur" role="alert">
          {message}
        </p>
      )}
    </form>
  )
}

function Ferme({ r }: { r: EtatRegistre }) {
  if (r.erreur) return <p className="registre-ferme">{r.erreur}</p>
  if (!r.donnees) return <p className="registre-ferme attente-encre">Le scribe déroule le registre…</p>
  if (!r.donnees.relie) return <p className="registre-ferme">Le registre des missives n&apos;est pas encore relié au grimoire. Qu&apos;un patriarche y pourvoie.</p>
  return null
}

const ouvert = (r: EtatRegistre) => Boolean(r.donnees?.relie && r.calcul)

/* ───────────────────────── The list of missives ───────────────────────── */

export function GaucheMissives({ page, reg, icones, compact }: { page: PageMissives; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const r = reg?.r
  const enCours = r?.calcul?.etats.filter((e) => e.missive.statut !== 'close').length ?? 0
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {r && <Ferme r={r} />}
      {r && reg && ouvert(r) && (
        <>
          <Signature r={r} icones={icones} />
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
  const close = m.statut === 'close'
  return (
    <li>
      <button type="button" className={`entree-missive ${close ? 'close' : ''}`} tabIndex={tab} onClick={() => reg.allerA(idMissive(m.numero))}>
        <span className="entree-missive-titre">{m.titre}</span>
        <span className="entree-missive-meta">
          {m.commanditaire && <>pour {m.commanditaire} · </>}
          {close ? (
            <>close{m.recompense !== null ? `, ${prix(m.recompense)} septims partagés` : ''}</>
          ) : (
            <>
              {m.lignes.map((l) => `${quantite(l.quantite)} ${l.produit}`).join(', ')}
              {m.echeance && <> · échéance : {echeance(m.echeance)}</>}
            </>
          )}
        </span>
        {!close && (
          <span className="entree-missive-avance">
            <Jauge avance={e.avance} />
            <span className="avance-chiffre">{Math.round(e.avance * 100)} %</span>
          </span>
        )}
      </button>
    </li>
  )
}

export function DroiteMissives({ reg, interactif }: { reg?: CtxRegistre; interactif: boolean }) {
  const etats = reg?.r.calcul?.etats ?? []
  const enCours = etats.filter((e) => e.missive.statut !== 'close').reverse()
  const closes = etats.filter((e) => e.missive.statut === 'close').reverse()
  const tab = interactif ? 0 : -1
  return (
    <div className="missives-liste">
      <h3 className="titre-section">Missives en cours</h3>
      {enCours.length ? (
        <ul className="liste-missives">{enCours.map((e) => <EntreeMissive key={e.missive.numero} e={e} reg={reg!} tab={tab} />)}</ul>
      ) : (
        <p className="vide-encre">Nulle missive n&apos;attend la caravane.</p>
      )}
      {closes.length > 0 && (
        <>
          <h3 className="titre-section">Missives closes</h3>
          <ul className="liste-missives">{closes.map((e) => <EntreeMissive key={e.missive.numero} e={e} reg={reg!} tab={tab} />)}</ul>
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
  const close = m.statut === 'close'
  const droits = reg.r.marchand?.droits
  const permis = (a: keyof NonNullable<typeof droits>) => droits?.[a] !== false
  return (
    <>
      <div className="missive-meta">
        {m.echeance && !close && <p>Échéance : <strong>{echeance(m.echeance)}</strong></p>}
        <p>
          Écrite par {m.ecritePar || 'une patte anonyme'}
          {m.horodatage && <> le {dateTamrielique(m.horodatage)}</>}
        </p>
        {close && (
          <p className="missive-close">
            Close le {dateTamrielique(m.closeLe)} par {m.closePar}
            {m.recompense !== null && <> — récompense de {prix(m.recompense)} septims</>}
          </p>
        )}
      </div>
      <h3 className="titre-section">Ouvrages demandés</h3>
      <ul className="lignes-missive">
        {e.lignes.map((l) => (
          <li key={l.produit}>
            <div className="ligne-missive-nom">
              <span>
                <strong>{quantite(l.quantite)}</strong> {l.produit}
              </span>
              <span className="ligne-missive-etat">
                {l.livre > 0 && <>{quantite(l.livre)} livré{l.livre > 1 ? 's' : ''}</>}
                {l.livre > 0 && l.auCoffre > 0 && ' · '}
                {l.auCoffre > 0 && <>{quantite(l.auCoffre)} au coffre</>}
              </span>
            </div>
            <Jauge avance={close ? 1 : l.avance} />
          </li>
        ))}
      </ul>
      {!close && (
        <p className="avance-totale">
          <span>Avancement</span>
          <Jauge avance={e.avance} />
          <strong>{Math.round(e.avance * 100)} %</strong>
        </p>
      )}
      {!close && (
        <>
          <Signature r={reg.r} icones={icones} invite="Pour écrire au registre de cette missive, signe de ton nom." />
          <div className="gestes">
            {permis('releve') && <Geste icone={icones['magnifying-glass']} onClick={() => reg.ouvrir({ genre: 'releve', numero: m.numero })}>Relever le coffre</Geste>}
            {permis('depot') && <Geste icone={icones['open-chest']} onClick={() => reg.ouvrir({ genre: 'depot', numero: m.numero })}>Déposer au coffre</Geste>}
            {permis('fabrication') && <Geste icone={icones['anvil-impact']} onClick={() => reg.ouvrir({ genre: 'fabrication', numero: m.numero })}>Façonner</Geste>}
            {permis('livraison') && <Geste icone={icones['hand-truck']} onClick={() => reg.ouvrir({ genre: 'livraison', numero: m.numero })}>Livrer au commanditaire</Geste>}
            {permis('cloture') && <Geste icone={icones['wax-seal']} onClick={() => reg.ouvrir({ genre: 'cloture', numero: m.numero })}>Clore la missive</Geste>}
          </div>
        </>
      )}
    </>
  )
}

const NIVEAUX: { n: Niveau; titre: string }[] = [
  { n: 'fini', titre: 'Ouvrages demandés' },
  { n: 'intermediaire', titre: 'Ouvrages intermédiaires' },
  { n: 'brut', titre: 'Matières premières' },
]

function TableBesoins({ besoins }: { besoins: LigneBesoin[] }) {
  return (
    <div className="besoins" role="table" aria-label="Besoins de la missive">
      <div className="besoins-entete" role="row">
        <span>Objet</span>
        <span>Requis</span>
        <span>Au coffre</span>
        <span>Manque</span>
      </div>
      {NIVEAUX.map(({ n, titre }) => {
        const ls = besoins.filter((b) => b.niveau === n)
        if (!ls.length) return null
        return (
          <div key={n} className={`besoins-niveau niveau-${n}`} role="rowgroup">
            <div className="besoins-titre" role="row">{titre}</div>
            {ls.map((b) => (
              <div key={b.nom} className={`besoins-ligne ${b.manque > 0 ? 'manquant' : 'reuni'}`} role="row">
                <span className="besoins-nom">
                  {b.nom}
                  {b.fournees > 0 && <em>{b.fournees} fournée{b.fournees > 1 ? 's' : ''} à façonner</em>}
                </span>
                <span>{quantite(b.besoin)}</span>
                <span>{quantite(b.auCoffre)}</span>
                <span className="besoins-manque">{b.manque > 0 ? quantite(b.manque) : 'réuni'}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const VERBES: Record<Mouvement['type'], string> = { relevé: 'compte', dépôt: 'dépose', fabrication: 'façonne', livraison: 'livre', partage: 'reçoit' }

/** Ledger rows, a craft's inputs and outputs grouped on one line. */
export function Journal({ mouvements, limite = 40 }: { mouvements: Mouvement[]; limite?: number }) {
  const groupes: Mouvement[][] = []
  for (const m of mouvements) {
    const dernier = groupes[groupes.length - 1]
    if (m.action && dernier && dernier[0].action === m.action && dernier[0].type === m.type) dernier.push(m)
    else groupes.push([m])
  }
  const vus = groupes.reverse().slice(0, limite)
  if (!vus.length) return <p className="vide-encre">Rien encore n&apos;est écrit dans ce journal.</p>
  return (
    <ol className="journal">
      {vus.map((g, i) => {
        const m = g[0]
        const objets =
          m.type === 'fabrication'
            ? `${g.filter((x) => x.quantite > 0).map((x) => `${quantite(x.quantite)} ${x.objet}`).join(', ')}${g.some((x) => x.quantite < 0) ? ` de ${g.filter((x) => x.quantite < 0).map((x) => `${quantite(-x.quantite)} ${x.objet}`).join(', ')}` : ''}`
            : m.type === 'partage'
              ? `${quantite(m.quantite)} septims`
              : m.type === 'relevé'
                ? `${quantite(m.quantite)} ${m.objet}`
                : `${quantite(Math.abs(m.quantite))} ${m.objet}`
        return (
          <li key={i} className={`journal-${cle(m.type)}`}>
            <span className="journal-quand"><Quand iso={m.horodatage} /></span>
            <span className="journal-quoi">
              <strong>{m.membre}</strong> {VERBES[m.type]} {objets}
              {m.note && m.type !== 'partage' && <em> — {m.note}</em>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Contributions({ e, nbMembres }: { e: EtatMissive; nbMembres: number }) {
  const m = e.missive
  const close = m.statut === 'close'
  if (!e.contributions.length) return <p className="vide-encre">Nulle patte n&apos;a encore porté cette missive.</p>
  const p = close && m.recompense !== null ? partager(m.recompense, m.partCommune ?? 0, nbMembres, e.contributions) : null
  const recus = new Map(e.journal.filter((x) => x.type === 'partage').map((x) => [cle(x.membre), x.quantite]))
  return (
    <>
      <div className="parts">
        {e.contributions.map((c) => (
          <div key={c.membre} className="part">
            <span className="part-nom">{c.membre}</span>
            <span className="part-detail">
              {c.depots > 0 && <>dépôts {prix(Math.round(c.depots * 100) / 100)}</>}
              {c.depots > 0 && c.facons > 0 && ' · '}
              {c.facons > 0 && <>façonnage {prix(Math.round(c.facons * 100) / 100)}</>}
            </span>
            <Jauge avance={c.part} />
            <strong className="part-pc">{Math.round(c.part * 100)} %</strong>
            {p && <span className="part-recu">{prix(recus.get(cle(c.membre)) ?? p.parts.find((x) => cle(x.membre) === cle(c.membre))?.total ?? 0)} septims</span>}
          </div>
        ))}
      </div>
      {p && (
        <p className="partage-commun">
          Part commune de {prix(p.partCommune)} % : {prix(p.base)} septims à chacun des {p.nbMembres} membres de la caravane ; le reste, {prix(p.merite)} septims, au mérite.
        </p>
      )}
    </>
  )
}

export function DroiteMissive({ page, reg }: { page: PageMissive; reg?: CtxRegistre }) {
  const e = etatDe(reg, page.numero)
  if (!reg || !e) return null
  const close = e.missive.statut === 'close'
  return (
    <div className="missive-droite">
      {!close && (
        <>
          <h3 className="titre-section">Ce qu&apos;il faut réunir</h3>
          {e.cycle ? <p className="message-encre erreur">{texteCycle(e.cycle)}</p> : <TableBesoins besoins={e.besoins} />}
        </>
      )}
      <h3 className="titre-section">{close ? 'Partage de la récompense' : 'Les pattes de la missive'}</h3>
      <Contributions e={e} nbMembres={reg.r.donnees?.nbMembres ?? 0} />
      <h3 className="titre-section">Journal du coffre</h3>
      <Journal mouvements={e.journal} />
    </div>
  )
}

/* ───────────────────────── The chest ───────────────────────── */

export function GaucheCoffre({ page, reg, icones, compact }: { page: PageCoffre; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean }) {
  const r = reg?.r
  const stock = r?.donnees ? [...rejouer(r.donnees.mouvements).stock.values()].filter((s) => s.qte !== 0).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) : []
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {r && <Ferme r={r} />}
      {r && reg && ouvert(r) && (
        <>
          {r.marchand?.droits?.releve !== false && (
            <div className="gestes">
              <Geste icone={icones['magnifying-glass']} onClick={() => reg.ouvrir({ genre: 'releve' })}>
                Relever le coffre
              </Geste>
            </div>
          )}
          <h3 className="titre-section">Dans le coffre, selon le registre</h3>
          {stock.length ? (
            <ul className="inventaire">
              {stock.map((s) => (
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
        </>
      )}
    </>
  )
}

export function DroiteCoffre({ reg }: { reg?: CtxRegistre }) {
  const d = reg?.r.donnees
  if (!d?.relie) return null
  const { releves } = rejouer(d.mouvements)
  const ecarts = releves.filter((x) => x.ecart !== 0)
  return (
    <div className="coffre-droite">
      <h3 className="titre-section">Relevés et écarts</h3>
      <p className="note-encre">
        Chaque compte du coffre face à ce que le registre attendait.{' '}
        {ecarts.length ? `${ecarts.length} écart${ecarts.length > 1 ? 's' : ''} à éclaircir.` : 'Aucun écart : la caravane est honnête.'}
      </p>
      {releves.length ? (
        <div className="releves" role="table">
          <div className="releves-entete" role="row">
            <span>Quand, qui</span>
            <span>Objet</span>
            <span>Compté</span>
            <span>Attendu</span>
            <span>Écart</span>
          </div>
          {[...releves].reverse().map((x, i) => (
            <div key={i} className={`releves-ligne ${x.ecart ? 'ecart' : ''}`} role="row">
              <span className="releves-qui">
                <Quand iso={x.horodatage} />
                <em>{x.membre}</em>
              </span>
              <span>{x.objet}</span>
              <span>{quantite(x.compte)}</span>
              <span>{quantite(x.attendu)}</span>
              <strong>{x.ecart ? (x.ecart > 0 ? `+${quantite(x.ecart)}` : quantite(x.ecart)) : 'juste'}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="vide-encre">Personne n&apos;a encore compté le coffre.</p>
      )}
      <h3 className="titre-section">Tout le journal</h3>
      <Journal mouvements={d.mouvements} limite={60} />
    </div>
  )
}

/* ───────────────────────── The workshop ───────────────────────── */

export function GaucheAtelier({ page, reg, icones, compact, interactif }: { page: PageAtelier; reg?: CtxRegistre; icones: Record<string, string>; compact: boolean; interactif: boolean }) {
  const r = reg?.r
  const recettes = [...(r?.donnees?.recettes ?? [])].sort((a, b) => a.produit.localeCompare(b.produit, 'fr'))
  return (
    <>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      {r && <Ferme r={r} />}
      {r && reg && ouvert(r) && (
        <>
          {r.marchand?.droits?.recette !== false && (
            <div className="gestes">
              <Geste icone={icones['cauldron']} onClick={() => reg.ouvrir({ genre: 'edition-recette', nom: '' })}>
                Consigner une recette
              </Geste>
            </div>
          )}
          <h3 className="titre-section">Recettes consignées</h3>
          {recettes.length ? (
            <ul className="liste-recettes">
              {recettes.map((x) => (
                <li key={x.produit}>
                  <button type="button" tabIndex={interactif ? 0 : -1} onClick={() => reg.ouvrir({ genre: 'recette', nom: x.produit })}>
                    <span className="entree">{x.produit}</span>
                    <span className="points" />
                    <span className="renvoi">{x.ingredients.map((i) => i.nom).join(', ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vide-encre">Aucune recette encore : que les artisans prennent la plume.</p>
          )}
        </>
      )}
    </>
  )
}

export function DroiteAtelier({ reg, icones, interactif }: { reg?: CtxRegistre; icones: Record<string, string>; interactif: boolean }) {
  const r = reg?.r
  if (!r?.donnees?.relie || !reg) return null
  const ressources = [...r.donnees.ressources].sort((a, b) => a.categorie.localeCompare(b.categorie, 'fr') || a.nom.localeCompare(b.nom, 'fr'))
  return (
    <div className="atelier-droite">
      <h3 className="titre-section">Matières et leur valeur</h3>
      <p className="note-encre">La valeur d&apos;une matière pèse les dépôts : une gerbe de blé ne vaut pas une potion.</p>
      <div className="ressources" role="table">
        <div className="ressources-entete" role="row">
          <span>Matière</span>
          <span>Sorte</span>
          <span>Valeur</span>
        </div>
        {ressources.map((x) => (
          <button key={x.nom} type="button" tabIndex={interactif ? 0 : -1} className="ressources-ligne" role="row" onClick={() => reg.ouvrir({ genre: 'ressource', nom: x.nom })}>
            <span className="noms">
              <span className="nom-fr">{x.nom}</span>
              {x.en && <span className="nom-en">{x.en}</span>}
            </span>
            <span className="ressources-sorte">{x.categorie}</span>
            <span className="prix">{prix(x.valeur)}</span>
          </button>
        ))}
      </div>
      {r.marchand?.droits?.ressource !== false && (
        <div className="gestes">
          <Geste icone={icones['wheat']} onClick={() => reg.ouvrir({ genre: 'ressource', nom: '' })}>
            Inscrire une matière
          </Geste>
        </div>
      )}
    </div>
  )
}

/** Stock in the chest of one item (for the slips). */
export const auCoffre = (reg: CtxRegistre, nom: string) => (reg.r.donnees ? enStock(rejouer(reg.r.donnees.mouvements).stock, nom) : 0)

