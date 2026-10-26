'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import type { Livre, Page, PageChapitre, PageNote } from '@/lib/types'
import { prix, romain } from '@/lib/format'
import { chapitreDe, CitationFin, EnTete, Frontispice, surtitreDe, type Ctx } from './Pages'
import { Fleuron, GlypheArtisan } from './Ornements'
import { glypheMetier } from '@/lib/metiers'
import { DosCouverture, FaceCouverture } from './Couverture'

/**
 * The whole register laid out as a printable document: title page, contents, every price chapter,
 * every memo. On load it waits for fonts and images, then opens the print dialog
 * ("Save as PDF" is the export).
 */
export default function Copie({ livre }: { livre: Livre }) {
  const lance = useRef(false)

  useEffect(() => {
    if (lance.current) return
    lance.current = true
    const images = Array.from(document.images).filter((img) => !img.complete)
    // The covers' textures are CSS backgrounds and SVG filter images, invisible to document.images.
    const textures = TEXTURES.map((src) => {
      const img = new Image()
      img.src = src
      return img.decode().catch(() => {})
    })
    Promise.all([document.fonts.ready, ...textures, ...images.map((img) => new Promise((r) => (img.onload = img.onerror = r)))]).then(() =>
      // Two frames so the layout with the loaded fonts is painted before printing.
      requestAnimationFrame(() => requestAnimationFrame(() => window.print())),
    )
  }, [])

  const ctx: Ctx = { livre, index: 0, interactif: false, requete: '', locale: '' }
  const chapitres = livre.pages.filter((p): p is PageChapitre => p.type === 'chapitre')
  const notes = livre.pages.filter((p): p is PageNote => p.type === 'note')
  const sommaire = livre.pages.find((p) => p.type === 'sommaire')

  return (
    <div className="copie">
      <nav className="copie-retour">
        <a href="/">❧ Retourner au grimoire</a>
        <button type="button" onClick={() => window.print()}>
          Recopier encore
        </button>
      </nav>

      <section className="copie-couverture" aria-hidden>
        <div className="couverture-imprimee">
          <FaceCouverture />
        </div>
      </section>

      <section className="feuille feuille-titre" style={teinte(livre, 'sommaire')}>
        <Frontispice ctx={ctx} compact={false} />
      </section>

      <section className="feuille" style={teinte(livre, 'sommaire')}>
        <header className="en-tete">
          <div className="surtitre">Registre de la Caravane</div>
          <h2 className="titre-page">{sommaire?.titre ?? 'Sommaire'}</h2>
          {sommaire?.titreEn && <div className="sous-titre">{sommaire.titreEn}</div>}
          <Fleuron />
        </header>
        <SommaireCopie livre={livre} />
        {sommaire?.type === 'sommaire' && <CitationFin texte={sommaire.citation} />}
      </section>

      {chapitres.map((page) => (
        <ChapitreCopie key={page.id} page={page} livre={livre} />
      ))}

      {notes.map((page) => (
        <section key={page.id} id={page.id} className="feuille" style={teinte(livre, page.partie)}>
          <EnTete surtitre={surtitreDe(livre, page)} titre={page.titre} sousTitre={page.titreEn} icone={livre.icones[page.icone]}>
            {page.resume && <p className="intro">{page.resume}</p>}
            {page.auteur && <p className="signature">Consigné par {page.auteur}</p>}
            {page.citation && (
              <blockquote className="citation-fin citation-note">
                <p>{page.citation}</p>
                {page.citationAuteur && <p className="citation-auteur">— {page.citationAuteur}</p>}
              </blockquote>
            )}
          </EnTete>
          <div className="prose" dangerouslySetInnerHTML={{ __html: page.html }} />
        </section>
      ))}

      <p className="copie-fin">
        <Fleuron />
        Ici s&apos;arrête la copie. Qu&apos;elle ne quitte jamais la caravane.
      </p>

      <section className="copie-couverture copie-dos" aria-hidden>
        <div className="couverture-imprimee">
          <DosCouverture />
        </div>
      </section>
    </div>
  )
}

const TEXTURES = ['/textures/cuir-impression.jpg', '/textures/fer.jpg', '/textures/parchemin-impression.jpg']

const teinte = (livre: Livre, partie: Page['partie']) => ({ '--teinte': livre.parties.find((p) => p.id === partie)?.couleur } as CSSProperties)

/** Contents of the copy: chapters and memos link to their pages; unwritten books are only named. */
function SommaireCopie({ livre }: { livre: Livre }) {
  const numero = (p: Page) => {
    const n = chapitreDe(livre.pages, p)
    return n ? <span className="renvoi">{romain(n).toUpperCase()}.</span> : null
  }
  return (
    <nav className="table-matieres copie-sommaire">
      {livre.parties
        .filter((p) => p.id !== 'sommaire')
        .map((partie) => {
          // Only chapters and memos are copied; the missives live in the grimoire alone.
          const pages = livre.pages.filter((p) => p.partie === partie.id && (p.type === 'chapitre' || p.type === 'note'))
          const avenir = pages.length === 0
          return (
            <section key={partie.id}>
              <h4 style={{ color: partie.couleur }}>{partie.titre}</h4>
              {avenir ? (
                <p className="copie-avenir">
                  {partie.id === 'missives'
                    ? 'Les missives vivent dans le grimoire : leur encre bouge trop pour être copiée.'
                    : partie.id === 'atelier'
                      ? 'Recettes et matières vivent dans le grimoire, où les artisans les corrigent.'
                      : <>L&apos;encre de ce livre n&apos;est pas encore sèche.</>}
                </p>
              ) : (
                <ol>
                  {pages.map((p, i) => (
                    <li key={p.id}>
                      <a href={`#${p.id}`}>
                        {numero(p)}
                        <span className="entree">{p.titre}</span>
                        <span className="points" />
                        {p.type === 'chapitre' && (
                          <span className="renvoi">
                            {p.articles.length} article{p.articles.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )
        })}
    </nav>
  )
}

function ChapitreCopie({ page, livre }: { page: PageChapitre; livre: Livre }) {
  const prixConnus = page.articles.flatMap((a) => [a.min, a.max]).filter((v): v is number => v !== null)
  return (
    <section id={page.id} className="feuille" style={teinte(livre, page.partie)}>
      <EnTete
        surtitre={surtitreDe(livre, page)}
        titre={page.titre}
        sousTitre={page.titreEn}
        icone={livre.icones[page.icone]}
      >
        <p className="intro lettrine">{page.intro}</p>
        <p className="decompte">
          {page.articles.length} article{page.articles.length > 1 ? 's' : ''} consigné{page.articles.length > 1 ? 's' : ''}
          {prixConnus.length > 0 && <>, de {prix(Math.min(...prixConnus))} à {prix(Math.max(...prixConnus))} septims</>}
        </p>
      </EnTete>

      <table className="copie-registre-table">
        <thead>
          <tr>
            <th className="col-article" colSpan={2}>Article</th>
            <th>Coût</th>
            <th>Plancher</th>
            <th>Plafond</th>
          </tr>
        </thead>
        <tbody>
          {page.articles.map((a) => (
            <tr key={a.id}>
              <td className="col-glyphe">
                <GlypheArtisan artisan={a.artisan} icones={livre.icones} />
              </td>
              <td className="noms">
                <span className="copie-nom">
                  <span className="nom-fr">{a.fr}</span>
                  <span className="points-conduite" aria-hidden />
                </span>
                <span className="nom-en">{a.en}</span>
                {a.note && <span className="note-article">{a.note}</span>}
              </td>
              {a.min === null && a.max === null ? (
                <td className="a-negocier" colSpan={3}>
                  à négocier
                </td>
              ) : (
                <>
                  <td className="prix prix-cout">{prix(a.prod)}</td>
                  <td className="prix prix-min">{prix(a.min)}</td>
                  <td className="prix prix-max">{prix(a.max)}</td>
                </>
              )}
            </tr>
          ))}
          {page.articles.length === 0 && (
            <tr>
              <td colSpan={5} className="vide">
                Aucun article n&apos;est encore consigné en ce chapitre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="registre-pied">Prix exprimés en septims d&apos;or</p>
      <div className="legende-sceaux">
        {[...new Set(livre.pages.flatMap((p) => (p.type === 'chapitre' ? p.articles.map((a) => a.artisan) : [])))].sort().map((k) => (
          <span key={k}>
            <GlypheArtisan artisan={k} icones={livre.icones} /> {glypheMetier(k).nom}
          </span>
        ))}
      </div>
    </section>
  )
}
