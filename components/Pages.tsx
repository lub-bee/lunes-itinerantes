'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Livre, Page, PageChapitre } from '@/lib/types'
import { articleCorrespond, plages } from '@/lib/recherche'
import { dateTamrielique, prix, romain } from '@/lib/format'
import { Fleuron, Lunes, Plume, SceauArtisan } from './Ornements'

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

function Folio({ n }: { n: number }) {
  return <div className="folio">— {romain(n)} —</div>
}

/* ───────────────────────────── Left pages ───────────────────────────── */

export function PageGauche({ page, ctx, compact = false }: { page: Page; ctx: Ctx; compact?: boolean }) {
  const corps = (() => {
    switch (page.type) {
      case 'sommaire':
        return <Frontispice ctx={ctx} compact={compact} />
      case 'chapitre':
        return <TeteChapitre page={page} ctx={ctx} compact={compact} />
      case 'note':
        return (
          <EnTete surtitre="Pense-bête" titre={page.titre} compact={compact}>
            {page.resume && <p className="intro lettrine">{page.resume}</p>}
            {page.auteur && <p className="signature">Consigné par {page.auteur}</p>}
          </EnTete>
        )
      case 'avenir':
        return (
          <EnTete surtitre={ctx.livre.parties.find((p) => p.id === page.partie)?.titre ?? ''} titre={page.titre} compact={compact}>
            <p className="intro lettrine">{page.intro}</p>
          </EnTete>
        )
    }
  })()
  if (compact) return corps
  return (
    <div className="contenu gauche-contenu">
      {corps}
      <Folio n={ctx.index * 2 + 1} />
    </div>
  )
}

function EnTete({ surtitre, titre, sousTitre, compact, children }: { surtitre: string; titre: string; sousTitre?: string; compact?: boolean; children?: ReactNode }) {
  return (
    <header className={`en-tete ${compact ? 'compact' : ''}`}>
      <div className="surtitre">{surtitre}</div>
      <h2 className="titre-page">{titre}</h2>
      {sousTitre && <div className="sous-titre">{sousTitre}</div>}
      <Fleuron />
      {children}
    </header>
  )
}

function Frontispice({ ctx, compact }: { ctx: Ctx; compact: boolean }) {
  return (
    <div className={`frontispice ${compact ? 'compact' : ''}`}>
      <Lunes taille={compact ? 72 : 120} className="frontispice-lunes" />
      <div className="frontispice-sur">Grimoire de la</div>
      <h2 className="frontispice-titre">Caravane des Lunes Itinérantes</h2>
      <Fleuron />
      <p className="citation">« Khajiit a des marchandises, si tu as la pièce. »</p>
      {!compact && (
        <p className="frontispice-texte">
          Registre des prix tenu par les marchands de la caravane, de Rorikbourg à Aubétoile. Qu&apos;on le consulte avant chaque vente, et
          qu&apos;on ne le prête jamais à un Nordique.
        </p>
      )}
      <p className="consigne">Prix consignés le {dateTamrielique(ctx.livre.consigneLe)}</p>
    </div>
  )
}

function TeteChapitre({ page, ctx, compact }: { page: PageChapitre; ctx: Ctx; compact: boolean }) {
  const surtitre = `Livre des Marchandises · Chapitre ${romain(ctx.livre.pages.filter((p) => p.type === 'chapitre').indexOf(page) + 1).toUpperCase()}`
  const prixConnus = page.articles.flatMap((a) => [a.min, a.max]).filter((v): v is number => v !== null)
  return (
    <EnTete surtitre={surtitre} titre={page.titre} sousTitre={page.titreEn} compact={compact}>
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
            <span><SceauArtisan artisan="alchimiste" /> Alchimiste</span>
            <span><SceauArtisan artisan="forgeron" /> Forgeron</span>
            <span><SceauArtisan artisan="couturier" /> Couturier</span>
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
      case 'sommaire':
        return <TableDesMatieres ctx={ctx} />
      case 'chapitre':
        return <ListeArticles page={page} ctx={ctx} />
      case 'note':
        return <div className="prose" dangerouslySetInnerHTML={{ __html: page.html }} />
      case 'avenir':
        return (
          <div className="attente">
            <div className="griffonnages" aria-hidden>
              <span /><span /><span /><span /><span />
            </div>
            <p>{page.attente}</p>
          </div>
        )
    }
  })()
  if (integre) return corps
  return (
    <div className="contenu droite-contenu">
      <Defile ctx={ctx}>{corps}</Defile>
      <Folio n={ctx.index * 2 + 2} />
    </div>
  )
}

/** Single page for narrow screens: the left page condensed above the right page. */
export function PageUnique({ page, ctx }: { page: Page; ctx: Ctx }) {
  return (
    <div className="contenu unique-contenu">
      <Defile ctx={ctx}>
        <PageGauche page={page} ctx={ctx} compact />
        <PageDroite page={page} ctx={ctx} integre />
        <Folio n={ctx.index + 1} />
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
                      <span className="renvoi">{romain(i * 2 + 1)}</span>
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

  const filtres = page.articles.filter((a) => articleCorrespond(a, montre.requete) && articleCorrespond(a, montre.locale))
  const requetes = [montre.requete, montre.locale].filter(Boolean)

  useEffect(() => {
    if (!ctx.interactif || !ctx.cible || !liste.current) return
    const el = liste.current.querySelector<HTMLElement>(`[data-article="${ctx.cible}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [ctx.cible, ctx.interactif, generation])

  return (
    <div className="registre">
      <div className="registre-entete" role="row">
        <span>Article</span>
        <span>Coût</span>
        <span>Plancher</span>
        <span>Plafond</span>
      </div>
      <div ref={liste} key={generation} className={`registre-corps ${efface ? 'efface' : ''}`}>
        {filtres.map((a, i) => (
          <div
            key={a.id}
            data-article={a.id}
            className={`ligne ${generation > 0 ? 'ecrit' : ''} ${ctx.cible === a.id ? 'cible' : ''}`}
            style={{ '--i': Math.min(i, 16) } as React.CSSProperties}
          >
            <SceauArtisan artisan={a.artisan} />
            <div className="noms">
              <span className="nom-fr"><Surligne texte={a.fr} requetes={requetes} /></span>
              <span className="nom-en"><Surligne texte={a.en} requetes={requetes} /></span>
              {a.note && <span className="note-article">{a.note}</span>}
            </div>
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
      <p className="registre-pied">Prix exprimés en septims.</p>
    </div>
  )
}
