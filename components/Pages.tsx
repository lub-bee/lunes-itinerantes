'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Article, Livre, Page, PageChapitre } from '@/lib/types'
import { articleCorrespond, plages } from '@/lib/recherche'
import { dateTamrielique, prix, romain } from '@/lib/format'
import { Action, Embleme, Fleuron, GlypheArtisan, Icone, Plume } from './Ornements'
import { cle } from '@/lib/missives'
import { motLot } from '@/lib/commande'
import { COLOPHON } from '@/lib/credits'
import { divinite, poemesDe, PRESENCE } from '@/lib/oeufs'
import { ExLibris, Gaufrage } from './ExLibris'
import { ArbreRangs } from './Caravane'
import { DroiteVentes, GaucheVentes, DroiteAtelier, DroiteMetier, GaucheMetier, DroiteCoffre, DroiteMissive, DroiteMissives, GaucheAtelier, GaucheCoffre, GaucheMissive, GaucheMissives, type CtxRegistre } from './Missives'

export type Ctx = {
  livre: Livre
  index: number
  /** false for the faces of a turning leaf: no inputs, no animations. */
  interactif: boolean
  requete: string
  locale: string
  setLocale?: (v: string) => void
  aller?: (i: number, cible?: string) => void
  cible?: string | null
  scrollInitial?: number
  onScroll?: (v: number) => void
  /** Order mode: present while the order sheet is out; clicking a ledger row writes the article on it. */
  commande?: { ajouter: (a: Article) => number }
  /** Missives, recipes and the chest (absent on the faces of a turning leaf: static rendering). */
  registre?: CtxRegistre
  /** The ex-libris was just signed: open the book where the reader was going. */
  signe?: () => void
  /** How many times an unsigned reader tried to turn past the ex-libris (shows Azurah's word). */
  refus?: number
  /** A god's name was signed on the ex-libris (an egg): the book turns to that god's pages. */
  invoquer?: (divinite: string) => void
}

/** Pages without a folio: the ex-libris and a god's pages (not part of the book proper). */
const sansFolio = (p: Page) => p.type === 'exlibris' || p.type === 'divinite' || p.type === 'poemes'

/** Pages before the title page (the ex-libris) carry no folio: the numbering starts at the title page. */
const avantSommaire = (ctx: Ctx) => Math.max(0, ctx.livre.pages.findIndex((p) => p.type === 'sommaire'))
const folio = (ctx: Ctx) => ctx.index - avantSommaire(ctx)

/** A page's own search field (recipes), kept per page like the chapters' one. */
const rechercheLocale = (ctx: Ctx) => ({ valeur: ctx.locale, changer: ctx.setLocale, interactif: ctx.interactif })

/** English name of an item: the catalogue's, else the raw material's. */
function nomAnglais(ctx: Ctx, nom: string): string {
  const k = cle(nom)
  for (const p of ctx.livre.pages) if (p.type === 'chapitre') for (const a of p.articles) if (cle(a.fr) === k && a.en) return a.en
  const d = ctx.registre?.r.donnees
  return d?.recettes.find((r) => cle(r.produit) === k)?.en || d?.ressources.find((r) => cle(r.nom) === k)?.en || ''
}

const EFFACEMENT_MS = 320

/** Highlights every token of the query in red ink. */
function Surligne({ texte, requetes }: { texte: string; requetes: string[] }) {
  const r = plages(texte, requetes.join(' '))
  if (!r.length) return <>{texte}</>
  const morceaux: ReactNode[] = []
  let pos = 0
  r.forEach(([d, f], k) => {
    if (d > pos) morceaux.push(texte.slice(pos, d))
    morceaux.push(<mark key={k}>{texte.slice(d, f)}</mark>)
    pos = f
  })
  morceaux.push(texte.slice(pos))
  return <>{morceaux}</>
}

/** Scroll container that remembers its position across page turns. */
function Defile({ ctx, className, children }: { ctx: Ctx; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (ref.current && ctx.scrollInitial) ref.current.scrollTop = ctx.scrollInitial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={ref} className={`defile ${className ?? ''}`} onScroll={ctx.onScroll ? (e) => ctx.onScroll!(e.currentTarget.scrollTop) : undefined}>
      {children}
    </div>
  )
}

export function CitationFin({ texte }: { texte: string }) {
  return (
    <blockquote className="citation-fin">
      <p>{texte}</p>
    </blockquote>
  )
}

function Folio({ n }: { n: number }) {
  return <div className="folio">{romain(n)}</div>
}

/**
 * A page's chapter in its part: its rank among the part's pages that have a side tab, in the book's order
 * (so crafts and missives renumber themselves as they come and go). None for the front matter (ex-libris,
 * Sommaire) and for closed missives (opened from the list, no side tab).
 */
export function chapitreDe(pages: Page[], page: Page): number | null {
  const sansOnglet = (p: Page) => p.partie === 'sommaire' || (p.type === 'missive' && p.close)
  // The member's own sales: a tab set apart, not a chapter.
  if (sansOnglet(page) || page.type === 'ventes') return null
  const n = pages.filter((p) => p.partie === page.partie && !sansOnglet(p) && p.type !== 'ventes').findIndex((p) => p.id === page.id)
  return n < 0 ? null : n + 1
}

/** The surtitle of every page of a part: « Livre des Marchandises · Chapitre II », or the part's book alone. */
export function surtitreDe(livre: Livre, page: Page): string {
  const livreDe = livre.parties.find((p) => p.id === page.partie)?.titre ?? ''
  const n = chapitreDe(livre.pages, page)
  return n ? `${livreDe} · Chapitre ${romain(n).toUpperCase()}` : livreDe
}

const teinte = (ctx: Ctx, page: Page) => ({ '--teinte': ctx.livre.parties.find((p) => p.id === page.partie)?.couleur } as CSSProperties)

/* ───────────────────────────── Left pages ───────────────────────────── */

export function PageGauche({ page, ctx, compact = false }: { page: Page; ctx: Ctx; compact?: boolean }) {
  const corps = (() => {
    switch (page.type) {
      case 'exlibris':
        return compact ? null : <Gaufrage cote="gauche" />
      case 'sommaire':
        return <Frontispice ctx={ctx} compact={compact} />
      case 'divinite':
        return null
      case 'ventes':
        return (
          <EnTete surtitre={surtitreDe(ctx.livre, page)} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
            <GaucheVentes page={page} reg={ctx.registre} compact={compact} />
          </EnTete>
        )
      case 'colophon':
        return (
          <EnTete surtitre={COLOPHON.surtitre} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
            <p className="intro lettrine">{COLOPHON.intro}</p>
            <p className="intro">{COLOPHON.enluminures}</p>
            <p className="signature">{COLOPHON.signature}</p>
            {!compact && <CitationFin texte={COLOPHON.citation} />}
          </EnTete>
        )
      case 'poemes': {
        const d = divinite(page.divinite)
        return (
          <EnTete surtitre="Dévotions" titre={d?.nom ?? page.titre} compact={compact}>
            {d && <p className="dedicace">{d.dedicace}</p>}
            {!compact && <p className="note-encre devotion-note">Ce que les Khajiits de la caravane chantent à sa gloire. Touche un titre pour lire le poème.</p>}
            <Action icone="annuler" tabIndex={ctx.interactif ? 0 : -1} onClick={() => ctx.aller?.(0)}>
              ce n&apos;est pas mon nom
            </Action>
          </EnTete>
        )
      }
      case 'chapitre':
        return <TeteChapitre page={page} ctx={ctx} compact={compact} />
      case 'note':
        return (
          <EnTete surtitre={surtitreDe(ctx.livre, page)} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
            {page.resume && <p className="intro lettrine">{page.resume}</p>}
            {page.auteur && <p className="signature">Consigné par {page.auteur}</p>}
            {page.citation && (
              <blockquote className="citation-fin citation-note">
                <p>{page.citation}</p>
                {page.citationAuteur && <p className="citation-auteur">— {page.citationAuteur}</p>}
              </blockquote>
            )}
          </EnTete>
        )
      case 'missives':
        return (
          <EnTete surtitre={surtitreDe(ctx.livre, page)} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
            <GaucheMissives page={page} reg={ctx.registre} icones={ctx.livre.icones} compact={compact} />
          </EnTete>
        )
      case 'missive': {
        return (
          <EnTete
            surtitre={surtitreDe(ctx.livre, page)}
            titre={page.titre}
            icone={ctx.livre.icones[page.icone]}
            compact={compact}
          >
            <GaucheMissive page={page} reg={ctx.registre} icones={ctx.livre.icones} />
          </EnTete>
        )
      }
      case 'coffre':
        return (
          <EnTete surtitre={surtitreDe(ctx.livre, page)} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
            <GaucheCoffre page={page} reg={ctx.registre} icones={ctx.livre.icones} compact={compact} />
          </EnTete>
        )
      case 'atelier':
        return (
          <EnTete surtitre={surtitreDe(ctx.livre, page)} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
            <GaucheAtelier page={page} reg={ctx.registre} icones={ctx.livre.icones} compact={compact} recherche={rechercheLocale(ctx)} />
          </EnTete>
        )
      case 'caravane':
        return (
          <EnTete surtitre={surtitreDe(ctx.livre, page)} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
            {!compact && <p className="intro lettrine">{page.intro}</p>}
          </EnTete>
        )
      case 'metier':
        return (
          <EnTete surtitre={surtitreDe(ctx.livre, page)} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
            <GaucheMetier page={page} reg={ctx.registre} icones={ctx.livre.icones} compact={compact} recherche={rechercheLocale(ctx)} />
          </EnTete>
        )
      case 'avenir':
        return (
          <EnTete
            surtitre={surtitreDe(ctx.livre, page)}
            titre={page.titre}
            sousTitre={page.titreEn}
            icone={ctx.livre.icones[page.icone]}
            compact={compact}
          >
            <p className="intro lettrine">{page.intro}</p>
          </EnTete>
        )
    }
  })()
  if (compact) return corps
  return (
    <div className={`contenu gauche-contenu contenu-${page.type}`} style={teinte(ctx, page)}>
      {/* Scrolls inside the page's margins, as the right page does: the folio and the frame stay clear. */}
      <div className="defile defile-gauche">{corps}</div>
      {!sansFolio(page) && <Folio n={folio(ctx) * 2 + 1} />}
    </div>
  )
}

export function EnTete({
  surtitre,
  titre,
  sousTitre,
  icone,
  compact,
  children,
}: {
  surtitre: string
  titre: string
  sousTitre?: string
  icone?: string
  compact?: boolean
  children?: ReactNode
}) {
  return (
    <header className={`en-tete ${compact ? 'compact' : ''}`}>
      <div className="surtitre">{surtitre}</div>
      <div className="titre-ligne">
        {icone && (
          <span className="medaillon" aria-hidden>
            <Icone corps={icone} />
          </span>
        )}
        <h2 className="titre-page">{titre}</h2>
      </div>
      {sousTitre && <div className="sous-titre">{sousTitre}</div>}
      <Fleuron />
      {children}
    </header>
  )
}

export function Frontispice({ ctx, compact }: { ctx: Ctx; compact: boolean }) {
  // The midnight hour (an egg): the title page turns night-blue and says something else.
  return (
    <div className={`frontispice ${compact ? 'compact' : ''}`}>
      <Embleme taille={160} className="frontispice-embleme" />
      <div className="frontispice-sur">Grimoire de la</div>
      <h2 className="frontispice-titre">Caravane des Lunes Itinérantes</h2>
      <Fleuron />
      <p className="citation">« Il n’existe rien qu’un bon Khajiit ne saurait vendre. »</p>
      {!compact && (
        <p className="frontispice-texte">
          Registre de la Caravane des Lunes Itinérantes. Qu&apos;on le consulte avant chaque vente, et que jamais d&apos;yeux non
          Khajiit ne le consultent.
        </p>
      )}
      <p className="consigne">Prix consignés le {dateTamrielique(ctx.livre.consigneLe)}</p>
      {!compact && <p className="colophon">Enluminures d&apos;après les graveurs de game-icons.net</p>}
    </div>
  )
}

function TeteChapitre({ page, ctx, compact }: { page: PageChapitre; ctx: Ctx; compact: boolean }) {
  const prixConnus = page.articles.flatMap((a) => [a.min, a.max]).filter((v): v is number => v !== null)
  return (
    <EnTete surtitre={surtitreDe(ctx.livre, page)} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
      {!compact && <p className="intro lettrine">{page.intro}</p>}
      <label className="recherche-locale">
        <Plume className="plume" />
        <input
          type="search"
          value={ctx.interactif ? ctx.locale : ''}
          readOnly={!ctx.interactif}
          tabIndex={ctx.interactif ? 0 : -1}
          onChange={(e) => ctx.setLocale?.(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && ctx.setLocale?.('')}
          placeholder="Chercher en ce chapitre…"
          aria-label={`Chercher dans le chapitre ${page.titre}`}
        />
      </label>
      {!compact && (
        <>
          <p className="decompte">
            {page.articles.length} article{page.articles.length > 1 ? 's' : ''} consigné{page.articles.length > 1 ? 's' : ''}
            {prixConnus.length > 0 && <>, de {prix(Math.min(...prixConnus))} à {prix(Math.max(...prixConnus))} septims</>}
            {(() => {
              // To help complete the registre: the articles whose cost is still unknown.
              const n = page.articles.filter((a) => a.prod === null).length
              return n ? <><br /><span className="sans-prix-compte">{n} sans coût inscrit</span></> : null
            })()}
          </p>
          <dl className="legende">
            <div><dt>Coût</dt><dd>ce que l&apos;objet coûte à l&apos;atelier</dd></div>
            <div><dt>Plancher</dt><dd>jamais une pièce de moins</dd></div>
            <div><dt>Plafond</dt><dd>le prix fort, à annoncer d&apos;abord</dd></div>
          </dl>
          <div className="legende-sceaux">
            <span><GlypheArtisan artisan="alchimiste" icones={ctx.livre.icones} /> Alchimiste</span>
            <span><GlypheArtisan artisan="forgeron" icones={ctx.livre.icones} /> Forgeron</span>
            <span><GlypheArtisan artisan="couturier" icones={ctx.livre.icones} /> Couturier</span>
          </div>
        </>
      )}
    </EnTete>
  )
}

/* ───────────────────────────── Right pages ───────────────────────────── */

export function PageDroite({ page, ctx, integre = false }: { page: Page; ctx: Ctx; integre?: boolean }) {
  const corps = (() => {
    switch (page.type) {
      case 'exlibris':
        return (
          <>
            <Gaufrage cote={integre ? 'unique' : 'droite'} />
            <ExLibris ctx={ctx} />
          </>
        )
      case 'ventes':
        return <DroiteVentes reg={ctx.registre} />
      case 'colophon':
        return (
          <div className="credits">
            {COLOPHON.rubriques.map((r) => (
              <section key={r.titre}>
                <h4>{r.titre}</h4>
                <p>{r.texte}</p>
              </section>
            ))}
            <Fleuron />
          </div>
        )
      case 'divinite':
        return (
          <div className="presence">
            <p>{PRESENCE}</p>
          </div>
        )
      case 'poemes':
        return (
          <ol className="liste-poemes">
            {poemesDe(page.divinite).map((p, n) => (
              <li key={n}>
                <button
                  type="button"
                  tabIndex={ctx.interactif ? 0 : -1}
                  onClick={() => ctx.registre?.ouvrir({ genre: 'poeme', divinite: page.divinite, n })}
                >
                  <span className="renvoi">{romain(n + 1).toUpperCase()}.</span>
                  <span className="entree">{p.titre}</span>
                </button>
              </li>
            ))}
          </ol>
        )
      case 'sommaire':
        return (
          <>
            <TableDesMatieres ctx={ctx} />
            <CitationFin texte={page.citation} />
          </>
        )
      case 'chapitre':
        return <ListeArticles page={page} ctx={ctx} />
      case 'note':
        return <div className="prose" dangerouslySetInnerHTML={{ __html: page.html }} />
      case 'missives':
        return (
          <>
            <DroiteMissives reg={ctx.registre} interactif={ctx.interactif} />
            <CitationFin texte={page.citation} />
          </>
        )
      case 'missive':
        return <DroiteMissive page={page} reg={ctx.registre} interactif={ctx.interactif} icones={ctx.livre.icones} />
      case 'coffre':
        return <DroiteCoffre reg={ctx.registre} />
      case 'atelier':
        return <DroiteAtelier page={page} reg={ctx.registre} interactif={ctx.interactif} icones={ctx.livre.icones} requetes={[ctx.requete, ctx.locale]} />
      case 'caravane':
        return (
          <>
            <ArbreRangs reg={ctx.registre} icones={ctx.livre.icones} interactif={ctx.interactif} />
            <CitationFin texte={page.citation} />
          </>
        )
      case 'metier':
        return <DroiteMetier page={page} reg={ctx.registre} interactif={ctx.interactif} anglais={(nom) => nomAnglais(ctx, nom)} requetes={[ctx.requete, ctx.locale]} />
      case 'avenir':
        return (
          <div className="attente">
            <div className="griffonnages" aria-hidden>
              <span /><span /><span /><span /><span />
            </div>
            <p>{page.attente}</p>
            <CitationFin texte={page.citation} />
          </div>
        )
    }
  })()
  if (integre) return corps
  return (
    <div className={`contenu droite-contenu contenu-${page.type}`} style={teinte(ctx, page)}>
      <Defile ctx={ctx}>{corps}</Defile>
      {!sansFolio(page) && <Folio n={folio(ctx) * 2 + 2} />}
    </div>
  )
}

/** Single page for narrow screens: the left page condensed above the right page. */
export function PageUnique({ page, ctx }: { page: Page; ctx: Ctx }) {
  return (
    <div className="contenu unique-contenu" style={teinte(ctx, page)}>
      <Defile ctx={ctx}>
        <PageGauche page={page} ctx={ctx} compact />
        <PageDroite page={page} ctx={ctx} integre />
        {!sansFolio(page) && <Folio n={folio(ctx) + 1} />}
      </Defile>
    </div>
  )
}

function TableDesMatieres({ ctx }: { ctx: Ctx }) {
  const { parties, pages } = ctx.livre
  const sommaireEn = pages.find((p) => p.type === 'sommaire')?.titreEn
  return (
    <nav className="table-matieres" aria-label="Table des matières">
      <h3 className="titre-table">Table des matières</h3>
      {sommaireEn && <div className="sous-titre sous-titre-table">{sommaireEn}</div>}
      {parties
        .filter((p) => p.id !== 'sommaire')
        .map((partie) => (
          <section key={partie.id}>
            <h4 style={{ color: partie.couleur }}>{partie.titre}</h4>
            <ol>
              {pages.map((p, i) =>
                p.partie !== partie.id ? null : (
                  <li key={p.id}>
                    <button type="button" tabIndex={ctx.interactif ? 0 : -1} onClick={() => ctx.aller?.(i)}>
                      <span className="entree">{p.titre}</span>
                      <span className="points" />
                      <span className="renvoi">{romain((i - avantSommaire(ctx)) * 2 + 1)}</span>
                    </button>
                  </li>
                ),
              )}
            </ol>
          </section>
        ))}
      {pages.map((p, i) =>
        p.type !== 'colophon' ? null : (
          <ol key={p.id} className="table-fin">
            <li>
              <button type="button" tabIndex={ctx.interactif ? 0 : -1} onClick={() => ctx.aller?.(i)}>
                <span className="entree">{p.titre}</span>
                <span className="points" />
                <span className="renvoi">{romain((i - avantSommaire(ctx)) * 2 + 1)}</span>
              </button>
            </li>
          </ol>
        ),
      )}
    </nav>
  )
}

const VIDES = [
  "Khajiit a beau fouiller ses sacoches… rien de tel en ce chapitre.",
  "Aucun article ne répond à ce nom, ami. Peut-être sous une autre lune ?",
  "Le registre reste muet. Essaie un autre mot, ou une autre langue.",
]

function ListeArticles({ page, ctx }: { page: PageChapitre; ctx: Ctx }) {
  // The list shown lags behind the query: the old ink fades, then the page is rewritten.
  const [montre, setMontre] = useState({ requete: ctx.requete, locale: ctx.locale })
  const [efface, setEfface] = useState(false)
  const [generation, setGeneration] = useState(0)
  const liste = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctx.interactif) return
    if (montre.requete === ctx.requete && montre.locale === ctx.locale) {
      setEfface(false)
      return
    }
    setEfface(true)
    const t = setTimeout(() => {
      setMontre({ requete: ctx.requete, locale: ctx.locale })
      setEfface(false)
      setGeneration((g) => g + 1)
    }, EFFACEMENT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.requete, ctx.locale, ctx.interactif])

  // Order mode: a drop of ink and a "+1" where the row was clicked.
  const [gouttes, setGouttes] = useState<{ id: string; x: number; y: number; texte: string; n: number }[]>([])
  const inscrire = (a: Article, e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    if (!ctx.commande) return
    const qte = ctx.commande.ajouter(a)
    const r = e.currentTarget.getBoundingClientRect()
    const x = 'clientX' in e && e.clientX ? e.clientX - r.left : r.width / 2
    const y = 'clientY' in e && e.clientY ? e.clientY - r.top : r.height / 2
    const n = Date.now() + Math.random()
    setGouttes((g) => [...g.slice(-4), { id: a.id, x, y, texte: qte > 1 ? `+1 (${qte})` : 'inscrit', n }])
    setTimeout(() => setGouttes((g) => g.filter((d) => d.n !== n)), 1100)
  }

  // Recipes: outside order mode a row opens the article's recipe slip; a small cauldron marks the
  // articles that have one and opens it in both modes.
  const reg = ctx.interactif && ctx.registre?.r.donnees?.relie ? ctx.registre : undefined
  const recettes = ctx.registre?.r.calcul?.recettes
  const voirRecette = (a: Article) => reg?.ouvrir({ genre: 'recette', nom: a.fr })

  const filtres = page.articles.filter((a) => articleCorrespond(a, montre.requete) && articleCorrespond(a, montre.locale))
  const requetes = [montre.requete, montre.locale].filter(Boolean)

  useEffect(() => {
    if (!ctx.interactif || !ctx.cible || !liste.current) return
    const el = liste.current.querySelector<HTMLElement>(`[data-article="${ctx.cible}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [ctx.cible, ctx.interactif, generation])

  return (
    <div className={`registre ${ctx.commande ? 'en-commande' : reg ? 'en-recettes' : ''}`}>
      <div className="registre-entete" role="row">
        <span className="col-article">Article</span>
        <span>Coût</span>
        <span><span className="long">Plancher</span><span className="court">Bas</span></span>
        <span><span className="long">Plafond</span><span className="court">Haut</span></span>
      </div>
      <div ref={liste} key={generation} className={`registre-corps ${efface ? 'efface' : ''}`}>
        {filtres.map((a, i) => (
          <div
            key={a.id}
            data-article={a.id}
            className={`ligne ${generation > 0 ? 'ecrit' : ''} ${ctx.cible === a.id ? 'cible' : ''}`}
            style={{ '--i': Math.min(i, 16) } as React.CSSProperties}
            {...(ctx.commande
              ? {
                  role: 'button',
                  tabIndex: 0,
                  title: `Inscrire ${a.fr} sur la commande`,
                  onClick: (e: React.MouseEvent<HTMLDivElement>) => inscrire(a, e),
                  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      inscrire(a, e)
                    }
                  },
                }
              : reg
                ? {
                    role: 'button',
                    tabIndex: 0,
                    title: `Voir la recette de ${a.fr}`,
                    onClick: () => voirRecette(a),
                    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        voirRecette(a)
                      }
                    },
                  }
                : {})}
          >
            {gouttes
              .filter((d) => d.id === a.id)
              .map((d) => (
                <span key={d.n} className="goutte" style={{ left: d.x, top: d.y } as React.CSSProperties} aria-hidden>
                  <span className="goutte-tache" />
                  <span className="goutte-mot">{d.texte}</span>
                </span>
              ))}
            <GlypheArtisan artisan={a.artisan} icones={ctx.livre.icones} />
            <div className="noms">
              <span className="nom-fr">
                <Surligne texte={a.fr} requetes={requetes} />
                {recettes?.has(cle(a.fr)) &&
                  (reg ? (
                    <button
                      type="button"
                      className="glyphe-recette"
                      title={`Recette de ${a.fr}`}
                      aria-label={`Recette de ${a.fr}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        voirRecette(a)
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Icone corps={ctx.livre.icones['scroll-quill']} />
                    </button>
                  ) : (
                    <span className="glyphe-recette" aria-hidden>
                      <Icone corps={ctx.livre.icones['scroll-quill']} />
                    </span>
                  ))}
              </span>
              <span className="nom-en"><Surligne texte={a.en} requetes={requetes} /></span>
              {a.lot && <span className="note-article lot-article">le {motLot(a.fr)} de {a.lot}</span>}
              {a.note && <span className="note-article">{a.note}</span>}
            </div>
            <span className="points-conduite" aria-hidden />
            {a.min === null && a.max === null ? (
              <span className="a-negocier">à négocier</span>
            ) : (
              <>
                <span className="prix prix-cout">{prix(a.prod)}</span>
                <span className="prix prix-min">{prix(a.min)}</span>
                <span className="prix prix-max">{prix(a.max)}</span>
              </>
            )}
          </div>
        ))}
        {filtres.length === 0 && <p className={`vide ${generation > 0 ? 'ecrit' : ''}`}>{VIDES[requetes.join('').length % VIDES.length]}</p>}
      </div>
      {/* A merchandise of its own (no recipe needed): only its name is required. */}
      {ctx.interactif && ctx.registre?.r.donnees?.relie && ctx.registre.r.marchand?.droits?.vente !== false && (
        <Action icone="vendre" className="inscrire-marchandise" onClick={() => ctx.registre!.ouvrir({ genre: 'vente', nom: '', chapitre: page.id })}>
          inscrire une marchandise
        </Action>
      )}
      <p className="registre-pied">Prix exprimés en septims d&apos;or</p>
    </div>
  )
}
