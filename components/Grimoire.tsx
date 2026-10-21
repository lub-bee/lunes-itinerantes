'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Article, Livre, Page, PageChapitre, PageExLibris, PageMetier, PageMissive, PartieId } from '@/lib/types'
import { idMetier } from '@/lib/metiers'
import { estClose } from '@/lib/missives'
import { articleCorrespond, compterDans, jetons, plages } from '@/lib/recherche'
import { PageDroite, PageGauche, PageUnique, type Ctx } from './Pages'
import { CoinLaiton, Embleme, Icone, Plume } from './Ornements'
import { animerFeuillet, animerPortee, Feuillet } from './Feuillet'
import { CleRefermer, Verrou } from './Fer'
import { ICONE_COPIE } from '@/lib/copie'
import { BandeCommande, BarreCommande, FeuilleCommande, useCommande } from './Commande'
import { useRegistre } from './Registre'
import { idMissive, metiersDe, type CtxRegistre, type Fiche } from './Missives'
import { FicheVolante } from './Fiche'

type Tourne = { de: number; vers: number; manuel: boolean }
type Resultat = { i: number; page: Page; total: number; articles: Article[] }
type Geste = {
  id: number
  x0: number
  y0: number
  mode: 'coin' | 'glisse'
  cote: 'droit' | 'gauche' | null
  avant: boolean
  lance: boolean
  trace: { x: number; t: number }[]
}

const DUREE_TOURNE = 1050
const DECALAGE_FEUILLETS = 140
const MAX_FEUILLETS = 3
const TRANCHES = 10
const TRANCHES_ETROIT = 8
const SOUPLESSE = 62
const SOUPLESSE_ETROIT = 44
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

const borner = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v))

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

const COURT_MAX = 18

export default function Grimoire({ livre: livreServeur }: { livre: Livre }) {
  const { parties, icones } = livreServeur
  const articles = useMemo(() => livreServeur.pages.flatMap((p) => (p.type === 'chapitre' ? (p as PageChapitre).articles : [])), [livreServeur])
  const registre = useRegistre(articles)

  // The ex-libris first (when the registre is linked), and one page per missive after the list of
  // missives: open ones (oldest first), then closed ones.
  const relie = Boolean(registre.marchand?.relie)
  const livre = useMemo((): Livre => {
    const etats = registre.calcul?.etats ?? []
    const vues: PageMissive[] = [...etats.filter((e) => !estClose(e.missive)), ...etats.filter((e) => estClose(e.missive))].map((e) => ({
      type: 'missive',
      id: idMissive(e.missive.numero),
      partie: 'missives',
      numero: e.missive.numero,
      close: estClose(e.missive),
      titre: e.missive.titre,
      court: e.missive.titre.length > COURT_MAX ? `${e.missive.titre.slice(0, COURT_MAX - 1).trimEnd()}…` : e.missive.titre,
      icone: estClose(e.missive) ? 'wax-seal' : 'tied-scroll',
    }))
    const exLibris: PageExLibris[] = relie ? [{ type: 'exlibris', id: 'ex-libris', partie: 'sommaire', titre: 'Ex-libris', court: 'Ex-libris', icone: 'quill' }] : []
    // One page per craft of the workshop, after the recipes' contents.
    const metiers: PageMetier[] = metiersDe(registre.donnees?.recettes ?? []).map((m) => ({
      type: 'metier', id: idMetier(m.cle), partie: 'atelier', metier: m.cle === 'sans-metier' ? '' : m.nom, titre: m.nom, court: m.nom, icone: m.icone,
    }))
    if (!vues.length && !exLibris.length && !metiers.length) return livreServeur
    const p = livreServeur.pages
    const apresRecettes = p.findIndex((x) => x.id === 'recettes') + 1
    const apresMissives = p.findIndex((x) => x.type === 'missives') + 1
    return {
      ...livreServeur,
      pages: [...exLibris, ...p.slice(0, apresRecettes), ...metiers, ...p.slice(apresRecettes, apresMissives), ...vues, ...p.slice(apresMissives)],
    }
  }, [livreServeur, registre.calcul, registre.donnees, relie])
  const { pages } = livre

  const [index, setIndex] = useState(0)
  const [tourne, setTourne] = useState<Tourne | null>(null)
  const enAttente = useRef<number | null>(null)
  const [saisie, setSaisie] = useState('')
  const [requete, setRequete] = useState('')
  const [locales, setLocales] = useState<Record<string, string>>({})
  const [cible, setCible] = useState<string | null>(null)
  const [indexOuvert, setIndexOuvert] = useState(false)
  const scrolls = useRef<Record<string, number>>({})
  const feuillets = useRef<HTMLDivElement>(null)
  const volets = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLInputElement>(null)
  const etroit = useMedia('(max-width: 860px)')
  const sansAnimation = useMedia('(prefers-reduced-motion: reduce)')
  const commande = useCommande(registre)
  const [fiche, setFiche] = useState<Fiche | null>(null)
  const [versId, setVersId] = useState<string | null>(null)
  const bande = useRef<HTMLButtonElement>(null)

  // Latest values for the window-level pointer handlers.
  const indexRef = useRef(index)
  indexRef.current = index
  const tourneRef = useRef(tourne)
  tourneRef.current = tourne
  const etroitRef = useRef(etroit)
  etroitRef.current = etroit

  /* ── Page turning ───────────────────────────────────────── */

  const moteur = useRef<{ anims: Animation[]; jeton: number } | null>(null)
  const jeton = useRef(0)
  const progression = useRef(0)

  const aller = useCallback(
    (vers: number, cibleArticle?: string) => {
      if (vers < 0 || vers >= pages.length) return
      if (cibleArticle) setCible(cibleArticle)
      if (tourneRef.current) {
        enAttente.current = vers
        return
      }
      if (vers === indexRef.current) return
      if (sansAnimation) {
        setIndex(vers)
        return
      }
      setTourne({ de: indexRef.current, vers, manuel: false })
    },
    [pages.length, sansAnimation],
  )

  /** Waits for the leaves to land (or fall back), then settles the book. */
  const conclure = useCallback((anims: Animation[], vers: number | null, j: number) => {
    Promise.all(anims.map((a) => a.finished))
      .then(() => {
        if (jeton.current !== j) return
        moteur.current = null
        if (vers !== null) setIndex(vers)
        setTourne(null)
      })
      .catch(() => {})
  }, [])

  useLayoutEffect(() => {
    if (!tourne || !volets.current || !feuillets.current) return
    const avant = tourne.vers > tourne.de
    const leaves = Array.from(volets.current.querySelectorAll<HTMLElement>('[data-volet]'))
    const n = leaves.length
    const anims = leaves.flatMap((el, k) =>
      animerFeuillet(el, {
        sens: etroit || avant ? -1 : 1,
        inverse: Boolean(etroit) && !avant,
        manuel: tourne.manuel,
        duree: DUREE_TOURNE,
        delai: tourne.manuel ? 0 : k * DECALAGE_FEUILLETS,
        z: (n - k) * 0.7,
        souplesse: etroit ? SOUPLESSE_ETROIT : SOUPLESSE,
      }),
    )
    feuillets.current
      .querySelectorAll<HTMLElement>('[data-portee]')
      .forEach((el) => anims.push(animerPortee(el, { duree: DUREE_TOURNE + (n - 1) * DECALAGE_FEUILLETS, delai: 0 })))

    const j = ++jeton.current
    moteur.current = { anims, jeton: j }
    if (tourne.manuel) {
      anims.forEach((a) => {
        a.pause()
        a.currentTime = progression.current * DUREE_TOURNE
      })
    } else {
      conclure(anims, tourne.vers, j)
    }
  }, [tourne, etroit, conclure])

  // A destination requested mid-turn is honoured once the leaves have landed.
  useEffect(() => {
    if (tourne || enAttente.current === null) return
    const vers = enAttente.current
    enAttente.current = null
    if (vers !== index) setTourne({ de: index, vers, manuel: false })
  }, [tourne, index])

  /* ── Turning by hand: drag a corner, or swipe on touch screens ── */

  const geste = useRef<Geste | null>(null)
  const clicIgnore = useRef(false)

  const debutGeste = (e: React.PointerEvent) => {
    if (tourneRef.current || geste.current || sansAnimation) return
    const coin = (e.target as HTMLElement).closest<HTMLButtonElement>('.coin')
    if (coin?.disabled) return
    if (!coin && e.pointerType !== 'touch') return
    if (coin) e.preventDefault()
    geste.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      mode: coin ? 'coin' : 'glisse',
      cote: coin ? (coin.classList.contains('coin-droit') ? 'droit' : 'gauche') : null,
      avant: true,
      lance: false,
      trace: [],
    }
  }

  useEffect(() => {
    const avancement = (g: Geste, x: number): number => {
      const r = feuillets.current!.getBoundingClientRect()
      if (etroitRef.current) {
        if (g.mode === 'coin') return borner(g.avant ? (r.right - x) / r.width : (x - r.left) / r.width)
        return borner((g.avant ? g.x0 - x : x - g.x0) / (r.width * 0.9))
      }
      const largeur = r.width / 2
      const dos = r.left + largeur
      if (g.mode === 'glisse') return borner((g.avant ? g.x0 - x : x - g.x0) / (largeur * 1.4))
      // The corner follows the pointer: its screen position is cos(angle) from the spine.
      const xr = g.avant ? (x - dos) / largeur : (dos - x) / largeur
      return Math.acos(borner(xr, -1, 1)) / Math.PI
    }

    const bouger = (e: PointerEvent) => {
      const g = geste.current
      if (!g || e.pointerId !== g.id) return
      const dx = e.clientX - g.x0
      const dy = e.clientY - g.y0
      if (!g.lance) {
        if (g.mode === 'glisse') {
          if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
            geste.current = null // the finger is scrolling the page
            return
          }
          if (Math.abs(dx) < 14) return
          g.avant = dx < 0
        } else {
          if (Math.hypot(dx, dy) < 5) return
          g.avant = g.cote === 'droit'
        }
        const vers = indexRef.current + (g.avant ? 1 : -1)
        if (tourneRef.current || vers < 0 || vers >= pages.length) {
          geste.current = null
          return
        }
        g.lance = true
        clicIgnore.current = true
        progression.current = avancement(g, e.clientX)
        setTourne({ de: indexRef.current, vers, manuel: true })
      }
      progression.current = avancement(g, e.clientX)
      moteur.current?.anims.forEach((a) => (a.currentTime = progression.current * DUREE_TOURNE))
      g.trace.push({ x: e.clientX, t: e.timeStamp })
      if (g.trace.length > 6) g.trace.shift()
    }

    const lacher = (e: PointerEvent) => {
      const g = geste.current
      if (!g || e.pointerId !== g.id) return
      geste.current = null
      if (!g.lance) return
      setTimeout(() => (clicIgnore.current = false), 60)
      const t = tourneRef.current
      const m = moteur.current
      if (!t || !m) {
        setTourne(null)
        return
      }
      // A flick in the turning direction completes the turn even before mid-way.
      const [a, b] = [g.trace[0], g.trace[g.trace.length - 1]]
      const vitesse = a && b && b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * (g.avant ? -1 : 1) : 0
      const complet = e.type === 'pointerup' && (progression.current > 0.5 || vitesse > 0.45)
      const restant = complet ? 1 - progression.current : progression.current
      const rythme = borner(1 / Math.max(restant, 0.15) / 1.6, 1.2, 3.5)
      m.anims.forEach((anim) => {
        anim.playbackRate = complet ? rythme : -rythme
        anim.play()
      })
      conclure(m.anims, complet ? t.vers : null, m.jeton)
    }

    window.addEventListener('pointermove', bouger)
    window.addEventListener('pointerup', lacher)
    window.addEventListener('pointercancel', lacher)
    return () => {
      window.removeEventListener('pointermove', bouger)
      window.removeEventListener('pointerup', lacher)
      window.removeEventListener('pointercancel', lacher)
    }
  }, [pages.length, conclure])

  /* ── Pages added or moved (missives read from the sheet) ── */

  // The open page stays open when missive pages appear before it.
  const idCourant = useRef<string | null>(null)
  useLayoutEffect(() => {
    const i = idCourant.current === null ? -1 : pages.findIndex((p) => p.id === idCourant.current)
    if (i >= 0 && i !== indexRef.current) setIndex(i)
    else if (indexRef.current >= pages.length) setIndex(pages.length - 1)
  }, [pages])
  useEffect(() => {
    idCourant.current = pages[index]?.id ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])
  // A page asked for by id (e.g. a missive just written) is opened once it exists.
  useEffect(() => {
    if (!versId) return
    const i = pages.findIndex((p) => p.id === versId)
    if (i < 0) return
    setVersId(null)
    aller(i)
  }, [versId, pages, aller])

  /* ── First opening: the ex-libris ───────────────────────── */

  // The pages wait for the reader's signature to be known (a quick call, no sheet), so a reader not yet
  // recognized opens the book on its ex-libris, and a known one on the title page.
  const [pretSignature, setPretSignature] = useState(false)
  useEffect(() => {
    if (registre.marchand) return setPretSignature(true)
    const t = setTimeout(() => setPretSignature(true), 1500)
    return () => clearTimeout(t)
  }, [registre.marchand])
  const premiereOuverture = useRef(true)
  useEffect(() => {
    if (!registre.marchand || !premiereOuverture.current) return
    premiereOuverture.current = false
    if (registre.marchand.relie && !registre.marchand.identite && !window.location.hash) setIndex(0)
  }, [registre.marchand])

  /* ── Deep links ─────────────────────────────────────────── */

  // The page named in the address opens once it exists (a missive's page appears only after the
  // registre is read); until then the address keeps it.
  const lienInitial = useRef<string | null>(null)
  useEffect(() => {
    if (lienInitial.current === null) lienInitial.current = decodeURIComponent(window.location.hash.slice(1))
    if (!lienInitial.current) return
    const i = pages.findIndex((p) => p.id === lienInitial.current)
    if (i < 0) return
    lienInitial.current = ''
    setIndex(i)
  }, [pages])
  useEffect(() => {
    if (lienInitial.current) return
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

  /* ── Keyboard ───────────────────────────────────────────── */

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const dansChamp = (e.target as HTMLElement)?.closest('input, textarea')
      if (e.key === '/' && !dansChamp) {
        e.preventDefault()
        champ.current?.focus()
      } else if (!dansChamp && e.key === 'ArrowRight') aller((enAttente.current ?? indexRef.current) + 1)
      else if (!dansChamp && e.key === 'ArrowLeft') aller((enAttente.current ?? indexRef.current) - 1)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [aller])

  // A slip goes when the page turns.
  const destinationFiche = tourne?.vers ?? index
  useEffect(() => setFiche(null), [destinationFiche])

  const ctxRegistre = useMemo((): CtxRegistre => ({ r: registre, ouvrir: setFiche, allerA: setVersId }), [registre])

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
      commande: interactif && commande.ouverte ? { ajouter: commande.ajouter } : undefined,
      registre: ctxRegistre,
    }
  }

  // The order sheet is lifted aside for the turn and laid back as soon as the leaf has cleared the
  // left page: a forward leaf lands on it (back just before it settles flat), a backward leaf leaves
  // it (back once past the vertical). Hand-dragged turns: back when the leaf has snapped.
  const ecartee = useMemo(() => {
    if (!tourne) return null
    if (tourne.manuel) return { retour: null }
    const n = Math.min(Math.abs(tourne.vers - tourne.de), MAX_FEUILLETS)
    const dernier = (n - 1) * DECALAGE_FEUILLETS
    return { retour: tourne.vers > tourne.de ? dernier + DUREE_TOURNE - 60 : dernier + DUREE_TOURNE * 0.56 }
  }, [tourne])

  const destination = tourne?.vers ?? index
  const partieActive: PartieId = pages[destination].partie
  const partieOnglets: PartieId = partieActive === 'sommaire' ? 'marchandises' : partieActive
  // Closed missives keep their page (reached from the list) but get no side tab.
  const onglets = pages.map((p, i) => ({ p, i })).filter(({ p }) => p.partie === partieOnglets && !(p.type === 'missive' && p.close))
  const avant = tourne ? tourne.vers > tourne.de : true

  const voletsDoubles = () => {
    if (!tourne) return null
    const pas = etapes(tourne.de, tourne.vers)
    const bout = (i: number) => i === tourne.de || i === tourne.vers
    return pas.slice(0, -1).map((m, k) => {
      const suivante = pas[k + 1]
      const cm = ctx(m, false, !bout(m))
      const cs = ctx(suivante, false, !bout(suivante))
      return (
        <Feuillet
          key={`${m}-${suivante}`}
          cote={avant ? 'droit' : 'gauche'}
          tranches={TRANCHES}
          recto={avant ? <PageDroite page={pages[m]} ctx={cm} /> : <PageGauche page={pages[m]} ctx={cm} />}
          verso={avant ? <PageGauche page={pages[suivante]} ctx={cs} /> : <PageDroite page={pages[suivante]} ctx={cs} />}
          classeRecto={`page ${avant ? 'droite' : 'gauche'}`}
          classeVerso={`page ${avant ? 'gauche' : 'droite'}`}
        />
      )
    })
  }

  const gaucheBase = tourne ? (avant ? tourne.de : tourne.vers) : index
  const droiteBase = tourne ? (avant ? tourne.vers : tourne.de) : index
  const uniqueBase = tourne ? (avant ? tourne.vers : tourne.de) : index
  const uniqueVolet = tourne ? (avant ? tourne.de : tourne.vers) : null
  const portee = tourne ? <div className="ombre-portee" data-portee aria-hidden /> : null

  return (
    <div className={`scene ${tourne?.manuel ? 'en-tourne' : ''}`}>
      <header className="entete">
        <div className="blason">
          <Embleme taille={64} className="embleme-entete" />
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
          {/* Out of the layout flow (absolute): opens the printable copy of the whole register in a new tab. */}
          <a
            className="copie-registre"
            href="/copie"
            target="_blank"
            rel="noopener"
            title="Faire une copie du registre"
            aria-label="Faire une copie du registre"
          >
            <svg width="0" height="0" aria-hidden className="copie-registre-defs">
              <defs>
                <linearGradient id="copie-or" x1="0" y1="0" x2="0.35" y2="1">
                  <stop offset="0%" stopColor="#fff2c4" />
                  <stop offset="30%" stopColor="#e3b964" />
                  <stop offset="62%" stopColor="#a87a2c" />
                  <stop offset="100%" stopColor="#e9c878" />
                </linearGradient>
              </defs>
            </svg>
            <Icone corps={icones[ICONE_COPIE]} />
          </a>
          {/* Order mode: a rolled scroll on the table under the field (absolute, desktop only). */}
          {etroit === false && <BandeCommande c={commande} bande={bande} icones={icones} />}
          {indexOuvert && requete && (
            <div className="index-recherche" role="listbox">
              {resultats.length === 0 ? (
                <p className="index-vide">Khajiit ne connaît aucun article de ce nom… pas encore.</p>
              ) : (
                resultats.map((r) => (
                  <section key={r.page.id}>
                    <button type="button" className="index-page" onMouseDown={(e) => e.preventDefault()} onClick={() => aller(r.i)}>
                      <Icone corps={icones[r.page.icone]} />
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

        <CleRefermer onRefermer={refermer} />
      </header>

      <main className={`livre-zone ${etroit === null ? 'en-attente' : ''}`}>
        <nav className="rubans" aria-label="Livres du grimoire">
          {parties.map((p) =>
            // The Sommaire ribbon is bare: only its shape and its forked end.
            p.id === 'sommaire' ? (
              <button
                key={p.id}
                type="button"
                className={`ruban minimal ${partieActive === p.id ? 'actif' : ''}`}
                style={{ '--c': p.couleur } as CSSProperties}
                aria-label={p.titre}
                title={p.titre}
                onClick={() => aller(pages.findIndex((pg) => pg.type === 'sommaire'))}
              />
            ) : (
              <button
                key={p.id}
                type="button"
                className={`ruban ${partieActive === p.id ? 'actif' : ''}`}
                style={{ '--c': p.couleur } as CSSProperties}
                onClick={() => aller(pages.findIndex((pg) => pg.partie === p.id))}
              >
                <Icone corps={icones[p.icone]} className="ruban-icone" />
                <span className="ruban-nom">{p.court}</span>
              </button>
            ),
          )}
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
              <Icone corps={icones[p.icone]} className="onglet-icone" />
              <span className="onglet-nom">{p.court}</span>
            </button>
          ))}
        </nav>

        <div className="couverture">
          <Verrou onRefermer={refermer} />
          <CoinLaiton className="hg" />
          <CoinLaiton className="hd" />
          <CoinLaiton className="bg" />
          <CoinLaiton className="bd" />
          <div className="bloc-papier" aria-hidden />
          <div className="feuillets" ref={feuillets} onPointerDown={debutGeste}>
            {etroit === null || !pretSignature ? null : etroit ? (
              <>
                <div className="page unique">
                  <PageUnique key={pages[uniqueBase].id} page={pages[uniqueBase]} ctx={ctx(uniqueBase, !tourne)} />
                  {portee}
                </div>
                {tourne && uniqueVolet !== null && (
                  <div className="volets" ref={volets} inert>
                    <Feuillet
                      cote="unique"
                      tranches={TRANCHES_ETROIT}
                      recto={<PageUnique page={pages[uniqueVolet]} ctx={ctx(uniqueVolet, false)} />}
                      verso={null}
                      classeRecto="page unique"
                      classeVerso="page unique dos"
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="page gauche">
                  <PageGauche key={pages[gaucheBase].id} page={pages[gaucheBase]} ctx={ctx(gaucheBase, !tourne)} />
                  {portee}
                </div>
                <div className="page droite">
                  <PageDroite key={pages[droiteBase].id} page={pages[droiteBase]} ctx={ctx(droiteBase, !tourne)} />
                  {portee}
                </div>
                <div className="pli" aria-hidden />
                {tourne && (
                  <div className="volets" ref={volets} inert>
                    {voletsDoubles()}
                  </div>
                )}
              </>
            )}
            <button
              type="button"
              className="coin coin-gauche"
              aria-label="Page précédente"
              title="Tirer ou cliquer pour revenir en arrière"
              disabled={destination === 0}
              onClick={() => !clicIgnore.current && aller(destination - 1)}
            />
            <button
              type="button"
              className="coin coin-droit"
              aria-label="Page suivante"
              title="Tirer ou cliquer pour tourner la page"
              disabled={destination === pages.length - 1}
              onClick={() => !clicIgnore.current && aller(destination + 1)}
            />
            {etroit === false && commande.ouverte && (
              <FeuilleCommande c={commande} icones={icones} mobile={false} bande={bande} sansAnimation={Boolean(sansAnimation)} ecartee={ecartee} />
            )}
            {etroit === false && fiche && !tourne && (
              <FicheVolante key={JSON.stringify(fiche)} fiche={fiche} reg={ctxRegistre} articles={articles} icones={icones} mobile={false} sansAnimation={Boolean(sansAnimation)} fermer={() => setFiche(null)} />
            )}
          </div>
        </div>
      </main>

      {/* A write shown at once and then refused by the registre: an in-character notice, taken away on click. */}
      {registre.avis && (
        <button type="button" key={registre.avis.n} className="avis-registre" role="alert" onClick={registre.fermerAvis}>
          {registre.avis.texte}
        </button>
      )}

      {etroit && (
        <>
          {commande.ouverte && commande.deployee && <FeuilleCommande c={commande} icones={icones} mobile sansAnimation={Boolean(sansAnimation)} />}
          {fiche && !tourne && <FicheVolante key={JSON.stringify(fiche)} fiche={fiche} reg={ctxRegistre} articles={articles} icones={icones} mobile sansAnimation={Boolean(sansAnimation)} fermer={() => setFiche(null)} />}
          <BarreCommande c={commande} icones={icones} />
        </>
      )}
    </div>
  )
}
