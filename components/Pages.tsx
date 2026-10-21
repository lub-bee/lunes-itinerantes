'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Article, Livre, Page, PageChapitre } from '@/lib/types'
import { articleCorrespond, plages } from '@/lib/recherche'
import { dateTamrielique, prix, romain } from '@/lib/format'
import { Embleme, Fleuron, GlypheArtisan, Icone, Plume } from './Ornements'
import { cle } from '@/lib/missives'
import { ContreGarde, ExLibris } from './ExLibris'
import { DroiteAtelier, DroiteCoffre, DroiteMissive, DroiteMissives, GaucheAtelier, GaucheCoffre, GaucheMissive, GaucheMissives, type CtxRegistre } from './Missives'

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
}

/** Pages before the title page (the ex-libris) carry no folio: the numbering starts at the title page. */
const avantSommaire = (ctx: Ctx) => Math.max(0, ctx.livre.pages.findIndex((p) => p.type === 'sommaire'))
const folio = (ctx: Ctx) => ctx.index - avantSommaire(ctx)

/** English name of an item: the catalogue's, else the raw material's. */
function nomAnglais(ctx: Ctx, nom: string): string {
  const k = cle(nom)
  for (const p of ctx.livre.pages) if (p.type === 'chapitre') for (const a of p.articles) if (cle(a.fr) === k) return a.en
  return ctx.registre?.r.donnees?.ressources.find((r) => cle(r.nom) === k)?.en ?? ''
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

const teinte = (ctx: Ctx, page: Page) => ({ '--teinte': ctx.livre.parties.find((p) => p.id === page.partie)?.couleur } as CSSProperties)

/* ───────────────────────────── Left pages ───────────────────────────── */

export function PageGauche({ page, ctx, compact = false }: { page: Page; ctx: Ctx; compact?: boolean }) {
  const corps = (() => {
    switch (page.type) {
      case 'exlibris':
        return compact ? null : <ContreGarde />
      case 'sommaire':
        return <Frontispice ctx={ctx} compact={compact} />
      case 'chapitre':
        return <TeteChapitre page={page} ctx={ctx} compact={compact} />
      case 'note':
        return (
          <EnTete surtitre="Pense-bête" titre={page.titre} icone={ctx.livre.icones[page.icone]} compact={compact}>
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
          <EnTete surtitre="Livre des Missives" titre={page.titre} icone={ctx.livre.icones[page.icone]} compact={compact}>
            <GaucheMissives page={page} reg={ctx.registre} icones={ctx.livre.icones} compact={compact} />
          </EnTete>
        )
      case 'missive': {
        const m = ctx.registre?.r.calcul?.etats.find((e) => e.missive.numero === page.numero)?.missive
        return (
          <EnTete
            surtitre={`Missive n° ${page.numero}`}
            titre={page.titre}
            sousTitre={m?.commanditaire ? `pour ${m.commanditaire}` : undefined}
            icone={ctx.livre.icones[page.icone]}
            compact={compact}
          >
            <GaucheMissive page={page} reg={ctx.registre} icones={ctx.livre.icones} />
          </EnTete>
        )
      }
      case 'coffre':
        return (
          <EnTete surtitre="Livre des Missives" titre={page.titre} icone={ctx.livre.icones[page.icone]} compact={compact}>
            <GaucheCoffre page={page} reg={ctx.registre} icones={ctx.livre.icones} compact={compact} />
          </EnTete>
        )
      case 'atelier':
        return (
          <EnTete surtitre="L'Atelier" titre={page.titre} icone={ctx.livre.icones[page.icone]} compact={compact}>
            <GaucheAtelier page={page} reg={ctx.registre} icones={ctx.livre.icones} compact={compact} />
          </EnTete>
        )
      case 'avenir':
        return (
          <EnTete
            surtitre={ctx.livre.parties.find((p) => p.id === page.partie)?.titre ?? ''}
            titre={page.titre}
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
    <div className="contenu gauche-contenu" style={teinte(ctx, page)}>
      {corps}
      {page.type !== 'exlibris' && <Folio n={folio(ctx) * 2 + 1} />}
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
  return (
    <div className={`frontispice ${compact ? 'compact' : ''}`}>
      <Embleme taille={160} className="frontispice-embleme" />
      <div className="frontispice-sur">Grimoire de la</div>
      <h2 className="frontispice-titre">Caravane des Lunes Itinérantes</h2>
      <Fleuron />
      <p className="citation">« Il n&apos;existe rien qu&apos;un bon Khajiit ne saurait vendre. »</p>
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
  const surtitre = `Livre des Marchandises · Chapitre ${romain(ctx.livre.pages.filter((p) => p.type === 'chapitre').indexOf(page) + 1).toUpperCase()}`
  const prixConnus = page.articles.flatMap((a) => [a.min, a.max]).filter((v): v is number => v !== null)
  return (
    <EnTete surtitre={surtitre} titre={page.titre} sousTitre={page.titreEn} icone={ctx.livre.icones[page.icone]} compact={compact}>
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
        return <ExLibris ctx={ctx} />
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
        return <DroiteAtelier page={page} reg={ctx.registre} interactif={ctx.interactif} anglais={(nom) => nomAnglais(ctx, nom)} />
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
    <div className="contenu droite-contenu" style={teinte(ctx, page)}>
      <Defile ctx={ctx}>{corps}</Defile>
      {page.type !== 'exlibris' && <Folio n={folio(ctx) * 2 + 2} />}
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
        {page.type !== 'exlibris' && <Folio n={folio(ctx) + 1} />}
      </Defile>
    </div>
  )
}

function TableDesMatieres({ ctx }: { ctx: Ctx }) {
  const { parties, pages } = ctx.livre
  return (
    <nav className="table-matieres" aria-label="Table des matières">
      <h3 className="titre-table">Table des matières</h3>
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
                      <Icone corps={ctx.livre.icones['cauldron']} />
                    </button>
                  ) : (
                    <span className="glyphe-recette" aria-hidden>
                      <Icone corps={ctx.livre.icones['cauldron']} />
                    </span>
                  ))}
              </span>
              <span className="nom-en"><Surligne texte={a.en} requetes={requetes} /></span>
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
      <p className="registre-pied">Prix exprimés en septims d&apos;or</p>
    </div>
  )
}
