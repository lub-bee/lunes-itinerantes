'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Article, Livre, Page, PartieId } from '@/lib/types'
import { articleCorrespond, compterDans, jetons, plages } from '@/lib/recherche'
import { PageDroite, PageGauche, PageUnique, type Ctx } from './Pages'
import { Lunes, Plume } from './Ornements'

type Tourne = { de: number; vers: number }
type Resultat = { i: number; page: Page; total: number; articles: Article[] }

const DUREE_TOURNE = 900
const DECALAGE_FEUILLETS = 110
const MAX_FEUILLETS = 4
const DEBOUNCE_MS = 380

function useMedia(requete: string): boolean | null {
  const [v, setV] = useState<boolean | null>(null)
  useEffect(() => {
    const m = window.matchMedia(requete)
    setV(m.matches)
    const f = () => setV(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [requete])
  return v
}

/** Spreads crossed by a multi-leaf turn, evenly spaced from `de` to `vers` (both included). */
function etapes(de: number, vers: number): number[] {
  const n = Math.min(Math.abs(vers - de), MAX_FEUILLETS)
  return Array.from({ length: n + 1 }, (_, k) => Math.round(de + ((vers - de) * k) / n))
}

function Surligne({ texte, requete }: { texte: string; requete: string }) {
  const r = plages(texte, requete)
  if (!r.length) return <>{texte}</>
  const out: React.ReactNode[] = []
  let pos = 0
  r.forEach(([d, f], k) => {
    out.push(texte.slice(pos, d), <mark key={k}>{texte.slice(d, f)}</mark>)
    pos = f
  })
  out.push(texte.slice(pos))
  return <>{out}</>
}

export default function Grimoire({ livre }: { livre: Livre }) {
  const { pages, parties } = livre
  const [index, setIndex] = useState(0)
  const [tourne, setTourne] = useState<Tourne | null>(null)
  const enAttente = useRef<number | null>(null)
  const [saisie, setSaisie] = useState('')
  const [requete, setRequete] = useState('')
  const [locales, setLocales] = useState<Record<string, string>>({})
  const [cible, setCible] = useState<string | null>(null)
  const [indexOuvert, setIndexOuvert] = useState(false)
  const scrolls = useRef<Record<string, number>>({})
  const volets = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLInputElement>(null)
  const etroit = useMedia('(max-width: 860px)')
  const sansAnimation = useMedia('(prefers-reduced-motion: reduce)')

  const indexRef = useRef(index)
  indexRef.current = index

  /* ── Navigation ─────────────────────────────────────────── */

  const aller = useCallback(
    (vers: number, cibleArticle?: string) => {
      if (vers < 0 || vers >= pages.length) return
      if (cibleArticle) setCible(cibleArticle)
      if (tourne) {
        enAttente.current = vers
        return
      }
      if (vers === indexRef.current) return
      if (sansAnimation) {
        setIndex(vers)
        return
      }
      setTourne({ de: indexRef.current, vers })
    },
    [pages.length, tourne, sansAnimation],
  )

  // Animate the leaves of the current turn, then settle on the destination.
  useLayoutEffect(() => {
    if (!tourne || !volets.current) return
    const avant = tourne.vers > tourne.de
    const feuillets = Array.from(volets.current.querySelectorAll<HTMLElement>('[data-volet]'))
    const n = feuillets.length
    const animations = feuillets.flatMap((el, k) => {
      const z = (n - k) * 0.6
      const fin = avant ? -180 : 180
      const [a, b] = etroit && !avant ? [-180, 0] : [0, etroit ? -180 : fin]
      const timing: KeyframeAnimationOptions = {
        duration: DUREE_TOURNE,
        delay: k * DECALAGE_FEUILLETS,
        easing: 'cubic-bezier(.42,.02,.24,1)',
        fill: 'both',
      }
      const anims = [
        el.animate(
          [
            { transform: `rotateY(${a}deg) translateZ(${z}px)` },
            { transform: `rotateY(${(a + b) / 2}deg) translateZ(${z}px) scaleX(1.02)`, offset: 0.5 },
            { transform: `rotateY(${b}deg) translateZ(${z}px)` },
          ],
          timing,
        ),
      ]
      el.querySelectorAll<HTMLElement>('[data-ombre="recto"]').forEach((o) =>
        anims.push(o.animate(etroit && !avant ? [{ opacity: 0.6 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 0.6 }], timing)),
      )
      el.querySelectorAll<HTMLElement>('[data-ombre="verso"]').forEach((o) =>
        anims.push(o.animate([{ opacity: 0.6 }, { opacity: 0 }], timing)),
      )
      return anims
    })
    let annule = false
    Promise.all(animations.map((a) => a.finished))
      .then(() => {
        if (annule) return
        setIndex(tourne.vers)
        setTourne(null)
      })
      .catch(() => {})
    return () => {
      annule = true
    }
  }, [tourne, etroit])

  // A destination requested mid-turn is honoured once the leaves have landed.
  useEffect(() => {
    if (tourne || enAttente.current === null) return
    const vers = enAttente.current
    enAttente.current = null
    if (vers !== index) setTourne({ de: index, vers })
  }, [tourne, index])

  // Deep links: #armes opens the grimoire on that chapter.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    const i = pages.findIndex((p) => p.id === id)
    if (i > 0) setIndex(i)
  }, [pages])
  useEffect(() => {
    window.history.replaceState(null, '', index === 0 ? window.location.pathname : `#${pages[index].id}`)
  }, [index, pages])

  useEffect(() => {
    if (!cible) return
    const t = setTimeout(() => setCible(null), 2600)
    return () => clearTimeout(t)
  }, [cible])

  /* ── Global search ──────────────────────────────────────── */

  useEffect(() => {
    const t = setTimeout(() => setRequete(saisie.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [saisie])

  const resultats = useMemo((): Resultat[] => {
    if (!jetons(requete).length) return []
    return pages.flatMap((p, i): Resultat[] => {
      if (p.type === 'chapitre') {
        const articles = p.articles.filter((a) => articleCorrespond(a, requete))
        return articles.length ? [{ i, page: p, total: articles.length, articles }] : []
      }
      if (p.type === 'note') {
        const total = compterDans(p.texte, requete)
        return total ? [{ i, page: p, total, articles: [] }] : []
      }
      return []
    })
  }, [pages, requete])

  // Searching turns the pages: stay if the current page holds matches, else open the first one that does.
  useEffect(() => {
    if (!requete || !resultats.length) return
    const ici = resultats.some((r) => r.i === (enAttente.current ?? indexRef.current))
    if (!ici) aller(resultats[0].i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requete])

  /* ── Keyboard & swipe ───────────────────────────────────── */

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const cibleSaisie = (e.target as HTMLElement)?.closest('input, textarea')
      if (e.key === '/' && !cibleSaisie) {
        e.preventDefault()
        champ.current?.focus()
      } else if (!cibleSaisie && e.key === 'ArrowRight') aller((enAttente.current ?? indexRef.current) + 1)
      else if (!cibleSaisie && e.key === 'ArrowLeft') aller((enAttente.current ?? indexRef.current) - 1)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [aller])

  const toucher = useRef<{ x: number; y: number } | null>(null)
  const debutToucher = (e: React.TouchEvent) => {
    toucher.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const finToucher = (e: React.TouchEvent) => {
    if (!toucher.current) return
    const dx = e.changedTouches[0].clientX - toucher.current.x
    const dy = e.changedTouches[0].clientY - toucher.current.y
    toucher.current = null
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) aller(index + (dx < 0 ? 1 : -1))
  }

  const refermer = async () => {
    await fetch('/api/sceau', { method: 'DELETE' })
    window.location.href = '/sceau'
  }

  /* ── Rendering ──────────────────────────────────────────── */

  const ctx = (i: number, interactif: boolean, sansFiltre = false): Ctx => {
    const id = pages[i].id
    return {
      livre,
      index: i,
      interactif,
      requete: sansFiltre ? '' : requete,
      locale: sansFiltre ? '' : (locales[id] ?? ''),
      setLocale: (v) => setLocales((s) => ({ ...s, [id]: v })),
      aller,
      cible: interactif ? cible : null,
      scrollInitial: scrolls.current[id],
      onScroll: interactif ? (v) => (scrolls.current[id] = v) : undefined,
    }
  }

  const destination = tourne?.vers ?? index
  const partieActive: PartieId = pages[destination].partie
  const partieOnglets: PartieId = partieActive === 'sommaire' ? 'marchandises' : partieActive
  const onglets = pages.map((p, i) => ({ p, i })).filter(({ p }) => p.partie === partieOnglets)

  const voletsDoubles = () => {
    if (!tourne) return null
    const avant = tourne.vers > tourne.de
    const pas = etapes(tourne.de, tourne.vers)
    const bout = (i: number) => i === tourne.de || i === tourne.vers
    return pas.slice(0, -1).map((m, k) => {
      const suivante = pas[k + 1]
      const cm = ctx(m, false, !bout(m))
      const cs = ctx(suivante, false, !bout(suivante))
      return (
        <div key={`${m}-${suivante}`} data-volet className={`volet ${avant ? 'volet-droit' : 'volet-gauche'}`}>
          <div className={`face recto page ${avant ? 'droite' : 'gauche'}`} inert>
            {avant ? <PageDroite page={pages[m]} ctx={cm} /> : <PageGauche page={pages[m]} ctx={cm} />}
            <div className="ombre" data-ombre="recto" />
          </div>
          <div className={`face verso page ${avant ? 'gauche' : 'droite'}`} inert>
            {avant ? <PageGauche page={pages[suivante]} ctx={cs} /> : <PageDroite page={pages[suivante]} ctx={cs} />}
            <div className="ombre" data-ombre="verso" />
          </div>
        </div>
      )
    })
  }

  const gaucheBase = tourne ? (tourne.vers > tourne.de ? tourne.de : tourne.vers) : index
  const droiteBase = tourne ? (tourne.vers > tourne.de ? tourne.vers : tourne.de) : index
  const uniqueBase = tourne ? (tourne.vers > tourne.de ? tourne.vers : tourne.de) : index
  const uniqueVolet = tourne ? (tourne.vers > tourne.de ? tourne.de : tourne.vers) : null

  return (
    <div className="scene">
      <header className="entete">
        <div className="blason">
          <Lunes taille={46} />
          <div>
            <h1>Caravane des Lunes Itinérantes</h1>
            <p>Grimoire des marchands</p>
          </div>
        </div>

        <div className={`recherche-globale ${requete ? 'avec-trouvailles' : ''}`}>
          <Plume className="plume" />
          <input
            ref={champ}
            type="search"
            value={saisie}
            onChange={(e) => {
              setSaisie(e.target.value)
              setIndexOuvert(false)
            }}
            onBlur={() => setTimeout(() => setIndexOuvert(false), 160)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSaisie('')
                setRequete('')
                e.currentTarget.blur()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndexOuvert(true)
              } else if (e.key === 'Enter') {
                setRequete(saisie.trim())
                setIndexOuvert(false)
                e.currentTarget.blur()
              }
            }}
            placeholder="Chercher dans tout le grimoire (FR ou EN)…"
            aria-label="Chercher dans tout le grimoire"
          />
          {requete && saisie.trim() === requete && (
            <button
              type="button"
              className={`trouvailles ${indexOuvert ? 'ouvert' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setIndexOuvert((o) => !o)}
              aria-expanded={indexOuvert}
            >
              {(() => {
                const n = resultats.reduce((t, r) => t + r.total, 0)
                return n ? `${n} trouvaille${n > 1 ? 's' : ''}` : 'rien'
              })()}{' '}
              ▾
            </button>
          )}
          {saisie && (
            <button
              type="button"
              className="effacer"
              aria-label="Effacer la recherche"
              onClick={() => {
                setSaisie('')
                setRequete('')
              }}
            >
              ✕
            </button>
          )}
          {indexOuvert && requete && (
            <div className="index-recherche" role="listbox">
              {resultats.length === 0 ? (
                <p className="index-vide">Khajiit ne connaît aucun article de ce nom… pas encore.</p>
              ) : (
                resultats.map((r) => (
                  <section key={r.page.id}>
                    <button type="button" className="index-page" onMouseDown={(e) => e.preventDefault()} onClick={() => aller(r.i)}>
                      <span>{r.page.titre}</span>
                      <span className="index-total">
                        {r.total} {r.page.type === 'note' ? 'mention' : 'article'}
                        {r.total > 1 ? 's' : ''}
                      </span>
                    </button>
                    {r.articles.slice(0, 6).map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        className="index-article"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          aller(r.i, a.id)
                          setIndexOuvert(false)
                        }}
                      >
                        <span>
                          <Surligne texte={a.fr} requete={requete} />
                        </span>
                        <em>
                          <Surligne texte={a.en} requete={requete} />
                        </em>
                      </button>
                    ))}
                    {r.articles.length > 6 && <div className="index-plus">et {r.articles.length - 6} autres…</div>}
                  </section>
                ))
              )}
            </div>
          )}
        </div>

        <button type="button" className="refermer" onClick={refermer}>
          Refermer le grimoire
        </button>
      </header>

      <main className={`livre-zone ${etroit === null ? 'en-attente' : ''}`}>
        <nav className="rubans" aria-label="Livres du grimoire">
          {parties.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`ruban ${partieActive === p.id ? 'actif' : ''}`}
              style={{ '--c': p.couleur } as CSSProperties}
              onClick={() => aller(pages.findIndex((pg) => pg.partie === p.id))}
            >
              <span>{p.court}</span>
            </button>
          ))}
        </nav>

        <nav className="onglets" aria-label="Chapitres">
          {onglets.map(({ p, i }) => (
            <button
              key={p.id}
              type="button"
              className={`onglet ${destination === i ? 'actif' : ''} ${resultats.some((r) => r.i === i) ? 'trouve' : ''}`}
              onClick={() => aller(i)}
              title={p.titre}
            >
              <span className="onglet-initiale">{p.court.slice(0, 1)}</span>
              <span className="onglet-nom">{p.court}</span>
            </button>
          ))}
        </nav>

        <div className="couverture">
          <div className="feuillets" onTouchStart={debutToucher} onTouchEnd={finToucher}>
            {etroit === null ? null : etroit ? (
              <>
                <div className="page unique">
                  <PageUnique key={pages[uniqueBase].id} page={pages[uniqueBase]} ctx={ctx(uniqueBase, !tourne)} />
                </div>
                {tourne && uniqueVolet !== null && (
                  <div className="volets" ref={volets}>
                    <div data-volet className="volet volet-unique">
                      <div className="face recto page unique" inert>
                        <PageUnique page={pages[uniqueVolet]} ctx={ctx(uniqueVolet, false)} />
                        <div className="ombre" data-ombre="recto" />
                      </div>
                      <div className="face verso page unique dos" inert />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="page gauche">
                  <PageGauche key={pages[gaucheBase].id} page={pages[gaucheBase]} ctx={ctx(gaucheBase, !tourne)} />
                </div>
                <div className="page droite">
                  <PageDroite key={pages[droiteBase].id} page={pages[droiteBase]} ctx={ctx(droiteBase, !tourne)} />
                </div>
                <div className="pli" aria-hidden />
                {tourne && (
                  <div className="volets" ref={volets}>
                    {voletsDoubles()}
                  </div>
                )}
              </>
            )}
            <button type="button" className="coin coin-gauche" aria-label="Page précédente" disabled={destination === 0} onClick={() => aller(destination - 1)} />
            <button
              type="button"
              className="coin coin-droit"
              aria-label="Page suivante"
              disabled={destination === pages.length - 1}
              onClick={() => aller(destination + 1)}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
