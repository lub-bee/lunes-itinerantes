'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import type { Article, Livre, Page, PageChapitre, PageExLibris, PageMetier, PageMissive, PartieId } from '@/lib/types'
import { ATTENTE_RECHERCHE_MS, divinite as divin, EMBLEME, oeufDeRecherche } from '@/lib/oeufs'
import { idMetier } from '@/lib/metiers'
import { estClose } from '@/lib/missives'
import { GAUFRAGE } from '@/lib/gaufrage'
import { articleCorrespond, compterDans, jetons, nomsCorrespondent, plages, slug } from '@/lib/recherche'
import { artisanDe, metierDe } from '@/lib/metiers'
import CHAPITRES from '@/content/chapitres.json'
import { cle, type Recette } from '@/lib/missives'
import { PageDroite, PageGauche, PageUnique, type Ctx } from './Pages'
import { CoinLaiton, Embleme, Icone, IconesLivre, Plume } from './Ornements'
import { animerFeuillet, animerPortee, Feuillet } from './Feuillet'
import { CleRefermer, Verrou } from './Fer'
import { ICONE_COPIE } from '@/lib/copie'
import { BandeCommande, BarreCommande, FeuilleCommande, useCommande } from './Commande'
import { useRegistre } from './Registre'
import { idMissive, metiersDe, produitsDe, type CtxRegistre, type Fiche } from './Missives'
import { FicheVolante } from './Fiche'
import { DUREES_OEUFS, EffetsOeufs, ivresse, type Oeuf } from './Oeufs'
import { Annule, blocsTexte, dissoudre, ecrire, encrerDevise, fin, FiltresOmbre, OmbreContexte, pause, type Course, type CtxOmbre, type EtatOmbre } from './Ombre'
import { PAGE_DEVISE, PARTIE_OMBRE, pagesOmbre, TEXTES as OMBRE_TEXTES } from '@/lib/ombre'

/** `rapide`: a riffle (the « fus ro dah » egg), leaves turning much faster. */
type Tourne = { de: number; vers: number; manuel: boolean; rapide?: boolean }
/** `autres`: raw materials and missives found (name, English name, the slip to open if any). */
type Resultat = { i: number; page: Page; total: number; articles: Article[]; recettes?: Recette[]; autres?: { cle: string; fr: string; en: string; fiche?: Fiche }[] }
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
const DUREE_RAPIDE = 430
const DECALAGE_RAPIDE = 70
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

/** A recipe matches a query by its French or English name, or its craft. */
const recetteCorrespond = (r: Recette, requete: string) => nomsCorrespondent([r.produit, r.en, metierDe(r.artisan).nom], requete)

export default function Grimoire({ livre: livreServeur }: { livre: Livre }) {
  const { parties, icones } = livreServeur
  const articles = useMemo(() => livreServeur.pages.flatMap((p) => (p.type === 'chapitre' ? (p as PageChapitre).articles : [])), [livreServeur])
  const registre = useRegistre(articles)

  // The ex-libris first (when the registre is linked), and one page per missive after the list of
  // missives: open ones (oldest first), then closed ones.
  const relie = Boolean(registre.marchand?.relie)
  // A god signed the ex-libris (an egg, lib/oeufs.ts): its two pages follow the ex-libris until the
  // reader turns back to it. Nothing is signed.
  const [divinite, setDivinite] = useState<string | null>(null)
  // The Livre d'ombre (lib/ombre.ts): the shadow book replaces the pages while it is open (never in the address, never kept).
  const [ombre, setOmbre] = useState<EtatOmbre>('jour')
  const [septims, setSeptims] = useState(false)
  const [ombreJoue, setOmbreJoue] = useState(false)
  const livreJour = useMemo((): Livre => {
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
    const d = relie && divinite ? divin(divinite) : null
    const exLibris: Page[] = relie ? [{ type: 'exlibris', id: 'ex-libris', partie: 'sommaire', titre: 'Ex-libris', court: 'Ex-libris', icone: 'quill' } as PageExLibris] : []
    if (d) {
      exLibris.push(
        { type: 'divinite', id: 'divinite', partie: 'sommaire', titre: d.nom, court: d.nom, icone: 'quill', divinite: d.cle },
        { type: 'poemes', id: 'poemes', partie: 'sommaire', titre: d.nom, court: d.nom, icone: 'quill', divinite: d.cle },
      )
    }
    // One page per craft of the workshop, after the recipes' contents.
    const metiers: PageMetier[] = metiersDe((registre.donnees?.recettes ?? []).filter((x) => !x.ombre)).map((m) => ({
      type: 'metier', id: idMetier(m.cle), partie: 'atelier', metier: m.cle === 'sans-metier' ? '' : m.nom, titre: m.nom, titreEn: m.en, court: m.nom, icone: m.icone,
    }))
    // The catalogue as the sheet holds it now (rows just put up for sale, moved or taken out), over the
    // published copy the page was built with (a few minutes older): the sheet's rows win.
    const lignes = registre.donnees?.catalogue ?? []
    const complet = Boolean(registre.donnees?.catalogueComplet)
    const enArticle = (a: (typeof lignes)[number]): Article => ({ id: slug(a.fr), fr: a.fr, en: a.en, prod: a.prod, min: a.min, max: a.max, artisan: artisanDe(a.artisan), note: a.note, lot: a.lot ?? null })
    const retires = new Set((registre.donnees?.retires ?? []).map(cle))
    if (!vues.length && !exLibris.length && !metiers.length && !lignes.length && !retires.size) return livreServeur
    const chapitres = new Set(livreServeur.pages.flatMap((x) => (x.type === 'chapitre' ? [x.id] : [])))
    // A row in a hidden chapter stays out of the book; an unknown chapter lands in « Divers ».
    const caches = new Set((CHAPITRES as { id: string; masque?: boolean }[]).filter((c) => c.masque).map((c) => c.id))
    const chapitreDe = (k: string) => (caches.has(k) ? undefined : chapitres.has(k) ? k : chapitres.has('divers') ? 'divers' : [...chapitres].pop())
    const parNom = new Map(lignes.map((a) => [cle(a.fr), a]))
    const p =
      lignes.length || retires.size
        ? livreServeur.pages.map((x) => {
            if (x.type !== 'chapitre') return x
            // The page's articles still here (not taken out; in this chapter by the sheet), with the sheet's values.
            const restent = x.articles
              .filter((a) => !retires.has(cle(a.fr)) && !(complet && !parNom.has(cle(a.fr))))
              .filter((a) => {
                const f = parNom.get(cle(a.fr))
                return !f || !f.chapitre || chapitreDe(f.chapitre) === x.id
              })
              .map((a) => {
                const f = parNom.get(cle(a.fr))
                return f ? { ...a, ...enArticle(f), id: a.id, lot: a.lot } : a
              })
            const ici = lignes
              .filter((a) => !a.ombre && chapitreDe(a.chapitre) === x.id && !retires.has(cle(a.fr)) && !restent.some((b) => cle(b.fr) === cle(a.fr)))
              .map(enArticle)
            return { ...x, articles: [...restent, ...ici] }
          })
        : livreServeur.pages
    const apresRecettes = p.findIndex((x) => x.id === 'recettes') + 1
    const apresMissives = p.findIndex((x) => x.type === 'missives') + 1
    return {
      ...livreServeur,
      pages: [...exLibris, ...p.slice(0, apresRecettes), ...metiers, ...p.slice(apresRecettes, apresMissives), ...vues, ...p.slice(apresMissives)],
    }
  }, [livreServeur, registre.calcul, registre.donnees, relie, divinite])
  // The shadow book: its goods (the published copy's and the sheet's « Ombre » rows), its recipes, its teachings.
  const livre = useMemo((): Livre => {
    if (ombre === 'jour') return livreJour
    const parNom = new Map((livreServeur.ombre ?? []).map((a) => [cle(a.fr), a]))
    for (const a of registre.donnees?.catalogue ?? [])
      if (a.ombre) parNom.set(cle(a.fr), { id: slug(a.fr), fr: a.fr, en: a.en, prod: a.prod, min: a.min, max: a.max, artisan: artisanDe(a.artisan), note: a.note, lot: a.lot ?? null, ombre: true })
    const retires = new Set((registre.donnees?.retires ?? []).map(cle))
    return { ...livreJour, parties: [PARTIE_OMBRE], pages: pagesOmbre([...parNom.values()].filter((a) => !retires.has(cle(a.fr)))) }
  }, [ombre, livreJour, livreServeur.ombre, registre.donnees?.catalogue, registre.donnees?.retires])
  const { pages } = livre
  // Every article the book shows (the CSV's and those just put up for sale), and the chapters, for the slips.
  const articlesLivre = useMemo(() => pages.flatMap((p) => (p.type === 'chapitre' ? p.articles : [])), [pages])
  const chapitres = useMemo(() => pages.flatMap((p) => (p.type === 'chapitre' ? [{ id: p.id, titre: p.titre, ids: p.articles.map((a) => a.id) }] : [])), [pages])
  // Articles of hidden chapters (e.g. « Ingrédients »), with their chapter's title, for the sale slip.
  const caches = useMemo(() => (livreServeur.caches ?? []).map((a) => ({ ...a, titreChapitre: CHAPITRES.find((c) => c.id === a.chapitre)?.titre ?? a.chapitre })), [livreServeur])

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

  // An unsigned reader stays on the ex-libris: the page refuses to turn forward (it lifts a little and
  // falls back) and Azurah's word is written near the plate. Turning back toward it is always allowed.
  const verrouille = Boolean(registre.marchand?.relie && !registre.marchand.identite && pages[0]?.type === 'exlibris')
  const verrouilleRef = useRef(verrouille)
  verrouilleRef.current = verrouille
  const [refus, setRefus] = useState(0)
  const resister = useCallback(() => {
    setRefus((n) => n + 1)
    const el = feuillets.current?.querySelector<HTMLElement>('.page.droite, .page.unique')
    el?.animate(
      [
        { transform: 'perspective(2200px) rotateY(0deg)' },
        { offset: 0.32, transform: 'perspective(2200px) rotateY(-15deg)' },
        { offset: 0.6, transform: 'perspective(2200px) rotateY(-2deg)' },
        { offset: 0.78, transform: 'perspective(2200px) rotateY(-6deg)' },
        { transform: 'perspective(2200px) rotateY(0deg)' },
      ],
      { duration: 760, easing: 'ease-out' },
    )
  }, [])
  const ombreRef = useRef(ombre)
  ombreRef.current = ombre
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const devotion = (i: number) => ['divinite', 'poemes'].includes(pagesRef.current[i]?.type)
  const bloque = (vers: number) => verrouilleRef.current && vers !== 0 && vers > indexRef.current && !devotion(vers)

  const aller = useCallback(
    (vers: number, cibleArticle?: string, rapide = false) => {
      if (vers < 0 || vers >= pages.length) return
      if (bloque(vers)) return resister()
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
      setTourne({ de: indexRef.current, vers, manuel: false, rapide })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages.length, sansAnimation, resister],
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
        duree: tourne.rapide ? DUREE_RAPIDE : DUREE_TOURNE,
        delai: tourne.manuel ? 0 : k * (tourne.rapide ? DECALAGE_RAPIDE : DECALAGE_FEUILLETS),
        z: (n - k) * 0.7,
        souplesse: etroit ? SOUPLESSE_ETROIT : SOUPLESSE,
      }),
    )
    feuillets.current
      .querySelectorAll<HTMLElement>('[data-portee]')
      .forEach((el) => anims.push(animerPortee(el, { duree: tourne.rapide ? DUREE_RAPIDE + (n - 1) * DECALAGE_RAPIDE : DUREE_TOURNE + (n - 1) * DECALAGE_FEUILLETS, delai: 0 })))

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
        if (bloque(vers)) {
          geste.current = null
          clicIgnore.current = true
          setTimeout(() => (clicIgnore.current = false), 60)
          resister()
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

  // The open page stays open when pages appear before it (ex-libris, missives, crafts): the page
  // shown is looked up in the previous list of pages, then found again in the new one.
  const pagesAvant = useRef(pages)
  useLayoutEffect(() => {
    const avant = pagesAvant.current
    pagesAvant.current = pages
    if (avant === pages) return
    const id = avant[indexRef.current]?.id
    const i = id ? pages.findIndex((p) => p.id === id) : -1
    if (i >= 0 && i !== indexRef.current) setIndex(i)
    else if (indexRef.current >= pages.length) setIndex(pages.length - 1)
  }, [pages])
  // A page asked for by id (e.g. a missive just written) is opened once it exists.
  useEffect(() => {
    if (!versId) return
    const i = pages.findIndex((p) => p.id === versId)
    if (i < 0) return
    setVersId(null)
    aller(i)
  }, [versId, pages, aller])

  /* ── First opening: the ex-libris ───────────────────────── */

  const lienInitial = useRef<string | null>(null)

  // The pages wait for the reader's signature to be known (a quick call, no sheet), so a reader not yet
  // recognized opens the book on its ex-libris, and a known one on the title page.
  const [pretSignature, setPretSignature] = useState(false)
  useEffect(() => {
    if (registre.marchand) return setPretSignature(true)
    const t = setTimeout(() => setPretSignature(true), 3000)
    return () => clearTimeout(t)
  }, [registre.marchand])
  // Not signed: the book opens on the ex-libris whatever the address says; the page asked for opens
  // once signed. Forgetting one's name (« ce n'est pas mon nom ») turns back to the ex-libris.
  const premiereOuverture = useRef(true)
  const apresSignature = useRef<string | null>(null)
  const identite = registre.marchand?.identite ?? null
  const identiteAvant = useRef<string | null>(null)
  useEffect(() => {
    if (!registre.marchand) return
    const relieEtLibre = registre.marchand.relie && !identite
    if (premiereOuverture.current) {
      premiereOuverture.current = false
      if (relieEtLibre) {
        apresSignature.current = decodeURIComponent(window.location.hash.slice(1)) || null
        lienInitial.current = ''
        setIndex(0)
      }
    } else if (relieEtLibre && identiteAvant.current) {
      aller(0)
    }
    identiteAvant.current = identite
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registre.marchand, identite])
  /** Once the ex-libris is signed: the page the address asked for, else the title page. */
  const signe = useCallback(() => {
    const voulu = apresSignature.current ? pages.findIndex((p) => p.id === apresSignature.current) : -1
    apresSignature.current = null
    aller(voulu > 0 ? voulu : pages.findIndex((p) => p.type === 'sommaire'))
  }, [pages, aller])

  /* ── Deep links ─────────────────────────────────────────── */

  // The page named in the address opens once it exists (a missive's page appears only after the
  // registre is read); until then the address keeps it.
  useEffect(() => {
    if (lienInitial.current === null) lienInitial.current = decodeURIComponent(window.location.hash.slice(1))
    if (!lienInitial.current) return
    const i = pages.findIndex((p) => p.id === lienInitial.current)
    if (i < 0) return
    if (verrouilleRef.current) {
      apresSignature.current = lienInitial.current
      lienInitial.current = ''
      return
    }
    lienInitial.current = ''
    setIndex(i)
  }, [pages])
  // The address follows the page shown: one history entry per page reached (back / forward work), none
  // when the address already says it.
  useEffect(() => {
    if (lienInitial.current || ombre !== 'jour') return
    const voulu = index === 0 ? '' : `#${pages[index].id}`
    if (decodeURIComponent(window.location.hash) === voulu) return
    window.history.pushState(null, '', voulu || window.location.pathname)
  }, [index, pages, ombre])
  // An address typed or pasted while the book is open (only the #… changes: no reload), or back /
  // forward: the book turns to that page; an unsigned reader stays on the ex-libris and goes there once
  // signed.
  useEffect(() => {
    const suivre = () => {
      if (ombreRef.current !== 'jour') return
      const id = decodeURIComponent(window.location.hash.slice(1))
      const i = id ? pagesRef.current.findIndex((p) => p.id === id) : 0
      if (i < 0) return
      if (verrouilleRef.current && i !== 0) {
        apresSignature.current = id
        return
      }
      if (i !== (enAttente.current ?? indexRef.current)) aller(i)
    }
    window.addEventListener('hashchange', suivre)
    window.addEventListener('popstate', suivre)
    return () => {
      window.removeEventListener('hashchange', suivre)
      window.removeEventListener('popstate', suivre)
    }
  }, [aller])

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
      if (p.type === 'metier') {
        // Recipes, by their French or English name (or their craft).
        const k = metierDe(p.metier).cle
        // One entry per product, found by any of its recipes' names.
        const recettes = produitsDe(registre.donnees?.recettes ?? [])
          .filter((r) => (p.ombre ? r.ombre : !r.ombre && metierDe(r.artisan).cle === k) && r.toutes.some((v) => recetteCorrespond(v, requete)))
          .sort((a, b) => a.produit.localeCompare(b.produit, 'fr'))
        return recettes.length ? [{ i, page: p, total: recettes.length, articles: [], recettes }] : []
      }
      if (p.type === 'atelier' && p.vue === 'matieres') {
        // Raw materials, by their French or English name.
        const autres = (registre.donnees?.ressources ?? [])
          .filter((x) => nomsCorrespondent([x.nom, x.en], requete))
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
          .map((x) => ({ cle: x.nom, fr: x.nom, en: x.en, fiche: { genre: 'ressource' as const, nom: x.nom } }))
        return autres.length ? [{ i, page: p, total: autres.length, articles: [], autres }] : []
      }
      if (p.type === 'missive') {
        // A missive, by its title, its client or the goods it asks for.
        const m = registre.donnees?.missives.find((x) => x.numero === p.numero)
        if (!m || !nomsCorrespondent([m.titre, m.commanditaire, ...m.lignes.map((l) => l.produit)], requete)) return []
        return [{ i, page: p, total: 1, articles: [], autres: [{ cle: m.numero, fr: m.titre, en: m.commanditaire }] }]
      }
      return []
    })
  }, [pages, requete, registre.donnees?.recettes, registre.donnees?.ressources, registre.donnees?.missives])
  /** Where a result is: « Marchandises · Alcools » (the book's name as on its ribbon, then the page). */
  const chemin = (p: Page) => `${parties.find((x) => x.id === p.partie)?.court ?? ''} · ${p.titre}`

  // Searching turns the pages: stay if the current page holds matches, else open the first one that does.
  useEffect(() => {
    if (!requete || !resultats.length) return
    const ici = resultats.some((r) => r.i === (enAttente.current ?? indexRef.current))
    if (!ici) aller(resultats[0].i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requete])

  /* ── Easter eggs (lib/oeufs.ts) ─────────────────────────── */

  const [oeuf, setOeuf] = useState<Oeuf | null>(null)
  useEffect(() => {
    if (!oeuf) return
    const t = setTimeout(() => setOeuf(null), DUREES_OEUFS[oeuf.genre])
    return () => clearTimeout(t)
  }, [oeuf])

  // Typed in the search (the whole query, left alone for a second, once per query): the normal search
  // runs all the same.
  const [requeteOeuf, setRequeteOeuf] = useState('')
  useEffect(() => {
    const q = saisie.trim()
    const t = setTimeout(() => setRequeteOeuf(oeufDeRecherche(q) ? q : ''), ATTENTE_RECHERCHE_MS)
    return () => clearTimeout(t)
  }, [saisie])
  useEffect(() => {
    const o = oeufDeRecherche(requeteOeuf)
    if (!o) return
    setOeuf({ genre: o.oeuf, n: Date.now(), note: o.note })
    if (o.oeuf === 'skooma') ivresse(feuillets.current?.closest<HTMLElement>('.couverture') ?? null, Boolean(sansAnimation))
    if (o.oeuf === 'fus') {
      // The pages riffle back to the title page; the order scroll is blown off the table and comes back.
      aller(pages.findIndex((p) => p.type === 'sommaire'), undefined, true)
      const rouleau = document.querySelector<HTMLElement>('.commande-bande, .commande-barre')
      if (rouleau && !sansAnimation) {
        const loin = rouleau.classList.contains('commande-barre') ? 'translate(0, 160px) rotate(6deg)' : 'translate(340px, -150px) rotate(38deg)'
        const temps = { duration: 2300, easing: 'cubic-bezier(.3,.6,.3,1)' }
        // Added to the scroll's own transform; its opacity simply goes and comes back.
        rouleau.animate([{ transform: 'none' }, { offset: 0.22, transform: loin }, { offset: 0.7, transform: loin }, { transform: 'none' }], { ...temps, composite: 'add' })
        rouleau.animate([{ opacity: 1 }, { offset: 0.22, opacity: 0 }, { offset: 0.7, opacity: 0 }, { opacity: 1 }], temps)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requeteOeuf])

  // Seven clicks on the paper (the emblem pressed into it) within a few seconds: the moons light up.
  const clics = useRef<number[]>([])
  const clicPapier = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('button, a, input, textarea, select, label, summary, [role="button"], [tabindex], .fiche, .commande-feuille')) return
    const maintenant = e.timeStamp
    clics.current = [...clics.current.filter((x) => maintenant - x < EMBLEME.fenetreMs), maintenant]
    if (clics.current.length < EMBLEME.clics) return
    clics.current = []
    setOeuf({ genre: 'lunes', n: Date.now(), note: EMBLEME.note })
  }

  // A god signed the ex-libris: its pages appear and the book turns to them. Back on the ex-libris, they go.
  const invoquer = useCallback((k: string) => {
    setDivinite(k)
    setVersId('divinite')
  }, [])
  const indexAvant = useRef(index)
  useEffect(() => {
    const venait = indexAvant.current
    indexAvant.current = index
    if (index === 0 && venait !== 0 && divinite) setDivinite(null)
  }, [index, divinite])

  /* ── The Livre d'ombre (lib/ombre.ts, components/Ombre.tsx) ─────────────── */

  const scene = useRef<HTMLDivElement>(null)
  const jetonOmbre = useRef(0)
  const course = (): Course => {
    const j = ++jetonOmbre.current
    return { vivant: () => j === jetonOmbre.current }
  }
  /** Where the side tabs hide (back into the book): left on a spread, down on a phone. */
  const cacheOnglet = () => (etroitRef.current ? 'translateY(105%)' : 'translateX(-105%)')
  const ongletsVisibles = () => Array.from(document.querySelectorAll<HTMLElement>('.onglets .onglet'))
  const rentrerOnglets = (c: Course) =>
    fin(c, ongletsVisibles().map((o) => o.animate([{ transform: 'none', opacity: 1 }, { transform: cacheOnglet(), opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' })))
  const sortirOnglets = (c: Course, duree: number) =>
    fin(c, ongletsVisibles().map((o) => o.animate([{ transform: cacheOnglet(), opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: duree, easing: 'cubic-bezier(.25,.8,.35,1)', fill: 'backwards' })))
  /** Reduced motion: the book fades out, the state changes, it fades back in (~0.75 s). */
  const fondu = async (c: Course, changer: () => void) => {
    const zone = scene.current?.querySelector<HTMLElement>('.livre-zone')
    if (!zone) return changer()
    const sortie = zone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' })
    await fin(c, sortie)
    flushSync(changer)
    const entree = zone.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450 })
    sortie.cancel()
    await fin(c, entree)
  }
  /** Waits for the page turn in flight to land. */
  const atterrir = async (c: Course) => {
    await pause(c, 60)
    while (tourneRef.current || enAttente.current !== null) await pause(c, 60)
  }
  const pageDevise = () => livreJour.pages.findIndex((p) => p.id === PAGE_DEVISE)

  /** Five clicks on « Honnêteté »: the motto bleeds, the pages turn to its page, its ink goes, the shadow rises. */
  const ouvrirOmbre = useCallback(
    async (devise: HTMLElement) => {
      if (ombreRef.current !== 'jour' || ombreJoueRef.current) return
      const c = course()
      setOmbreJoue(true)
      setFiche(null)
      const ecran = scene.current
      try {
        if (sansAnimation) {
          await fondu(c, () => {
            setSeptims(true)
            setOmbre('ombre')
            setIndex(0)
          })
          return
        }
        ecran?.style.setProperty('--t-ombre', '0s')
        // I · The motto bleeds: « Fidélité » and « Honnêteté » turn red and re-form as « Septims ».
        await encrerDevise(c, devise, false)
        flushSync(() => setSeptims(true))
        await pause(c, 200)
        // II · The pages turn to « L'ombre de la caravane », then all its ink goes and the tabs retract.
        const cible = pageDevise()
        if (cible >= 0 && cible !== indexRef.current) {
          aller(cible)
          await atterrir(c)
        }
        await pause(c, 80)
        await Promise.all([dissoudre(c, blocsTexte(feuillets.current!)), rentrerOnglets(c)])
        await pause(c, 200)
        // III · Everything at once: the paper burns, the light dims, the emblem turns, the shadow writes in.
        ecran?.style.setProperty('--t-ombre', '1.8s')
        flushSync(() => {
          setOmbre('ombre')
          setIndex(0)
        })
        await Promise.all([ecrire(c, blocsTexte(feuillets.current!), 1700), sortirOnglets(c, 1600), pause(c, 1800)])
      } catch (e) {
        if (!(e instanceof Annule)) console.error(e)
      } finally {
        setOmbreJoue(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sansAnimation, aller, livreJour],
  )
  /** The inverted emblem: the shadow's ink goes, the light comes back, the day book writes itself in again. */
  const fermerOmbre = useCallback(async () => {
    if (ombreRef.current !== 'ombre' || ombreJoueRef.current) return
    const c = course()
    setOmbreJoue(true)
    setFiche(null)
    const ecran = scene.current
    const retour = Math.max(0, pageDevise())
    try {
      if (sansAnimation) {
        await fondu(c, () => {
          setOmbre('jour')
          setSeptims(false)
          setIndex(retour)
        })
        return
      }
      await Promise.all([dissoudre(c, blocsTexte(feuillets.current!), 1200), rentrerOnglets(c)])
      ecran?.style.setProperty('--t-ombre', '1.8s')
      flushSync(() => {
        setOmbre('jour')
        setSeptims(false)
        setIndex(retour)
      })
      await Promise.all([ecrire(c, blocsTexte(feuillets.current!), 1500), sortirOnglets(c, 1400), pause(c, 1800)])
    } catch (e) {
      if (!(e instanceof Annule)) console.error(e)
    } finally {
      setOmbreJoue(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sansAnimation, livreJour])
  const ombreJoueRef = useRef(ombreJoue)
  ombreJoueRef.current = ombreJoue
  const ctxOmbre = useMemo<CtxOmbre>(() => ({ etat: ombre, septims, joue: ombreJoue, ouvrir: ouvrirOmbre, fermer: fermerOmbre }), [ombre, septims, ombreJoue, ouvrirOmbre, fermerOmbre])

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
  // (A slip asked for on the way, e.g. a recipe chosen in the search index, opens on arrival.)
  const destinationFiche = tourne?.vers ?? index
  const ficheApres = useRef<Fiche | null>(null)
  useEffect(() => {
    setFiche(ficheApres.current)
    ficheApres.current = null
  }, [destinationFiche])

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
      signe,
      refus: interactif ? refus : 0,
      invoquer,
    }
  }

  // The order sheet is lifted aside for the turn and laid back as soon as the leaf has cleared the
  // left page: a forward leaf lands on it (back just before it settles flat), a backward leaf leaves
  // it (back once past the vertical). Hand-dragged turns: back when the leaf has snapped.
  const ecartee = useMemo(() => {
    if (!tourne) return null
    if (tourne.manuel) return { retour: null }
    const n = Math.min(Math.abs(tourne.vers - tourne.de), MAX_FEUILLETS)
    const [duree, decalage] = tourne.rapide ? [DUREE_RAPIDE, DECALAGE_RAPIDE] : [DUREE_TOURNE, DECALAGE_FEUILLETS]
    const dernier = (n - 1) * decalage
    return { retour: tourne.vers > tourne.de ? dernier + duree - 60 : dernier + duree * 0.56 }
  }, [tourne])

  const destination = tourne?.vers ?? index
  const partieActive: PartieId = pages[destination].partie
  const partieOnglets: PartieId = partieActive === 'sommaire' ? 'marchandises' : partieActive
  // Closed missives keep their page (reached from the list) but get no side tab. On the colophon, its own tab only.
  const onglets =
    pages[destination].type === 'colophon'
      ? [{ p: pages[destination], i: destination }]
      : pages.map((p, i) => ({ p, i })).filter(({ p }) => p.partie === partieOnglets && !(p.type === 'missive' && p.close))
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
          classeRecto={`page ${avant ? 'droite' : 'gauche'} page-${pages[m].type}`}
          classeVerso={`page ${avant ? 'gauche' : 'droite'} page-${pages[suivante].type}`}
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
    <IconesLivre.Provider value={icones}>
    <OmbreContexte.Provider value={ctxOmbre}>
    <FiltresOmbre />
    <div
      ref={scene}
      className={`scene ${tourne?.manuel ? 'en-tourne' : ''} ${verrouille ? 'verrouillee' : ''} ${GAUFRAGE.partout ? 'gaufrage-partout' : ''} ${ombre === 'ombre' ? 'ombre ombre-B' : ''}`}
      style={{ '--gaufrage': GAUFRAGE.intensite, '--gaufrage-registres': GAUFRAGE.registres, '--gaufrage-exlibris': GAUFRAGE.exLibris } as CSSProperties}
    >
      <header className="entete">
        <div className="blason">
          {/* In the shadow book the emblem turns over in blood red: touching it closes the book. */}
          <span className={ombre === 'ombre' ? 'blason-ombre' : undefined} onClick={ombre === 'ombre' ? fermerOmbre : undefined} title={ombre === 'ombre' ? OMBRE_TEXTES.sortir : undefined}>
            <Embleme taille={64} className="embleme-entete" />
          </span>
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
                      <span>{chemin(r.page)}</span>
                      <span className="index-total">
                        {r.total}{' '}
                        {r.page.type === 'note' ? 'mention' : r.page.type === 'metier' ? 'recette' : r.page.type === 'missive' ? 'missive' : r.page.type === 'atelier' ? 'matière' : 'article'}
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
                          <span className="index-chemin">{chemin(r.page)} · </span>
                          <Surligne texte={a.fr} requete={requete} />
                        </span>
                        <em>
                          <Surligne texte={a.en} requete={requete} />
                        </em>
                      </button>
                    ))}
                    {r.articles.length > 6 && <div className="index-plus">et {r.articles.length - 6} autres…</div>}
                    {(r.recettes ?? []).slice(0, 6).map((x) => (
                      <button
                        type="button"
                        key={x.produit}
                        className="index-article"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          ficheApres.current = { genre: 'recette', nom: x.produit }
                          if (r.i === destinationFiche) setFiche(ficheApres.current)
                          aller(r.i)
                          setIndexOuvert(false)
                        }}
                      >
                        <span>
                          <span className="index-chemin">{chemin(r.page)} · </span>
                          <Surligne texte={x.produit} requete={requete} />
                        </span>
                        <em>
                          <Surligne texte={x.en} requete={requete} />
                        </em>
                      </button>
                    ))}
                    {(r.recettes?.length ?? 0) > 6 && <div className="index-plus">et {r.recettes!.length - 6} autres…</div>}
                    {(r.autres ?? []).slice(0, 6).map((x) => (
                      <button
                        type="button"
                        key={x.cle}
                        className="index-article"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (x.fiche) {
                            ficheApres.current = x.fiche
                            if (r.i === destinationFiche) setFiche(x.fiche)
                          }
                          aller(r.i)
                          setIndexOuvert(false)
                        }}
                      >
                        <span>
                          <span className="index-chemin">{r.page.type === 'missive' ? `${parties.find((y) => y.id === r.page.partie)?.court} · ` : `${chemin(r.page)} · `}</span>
                          <Surligne texte={x.fr} requete={requete} />
                        </span>
                        <em>
                          <Surligne texte={x.en} requete={requete} />
                        </em>
                      </button>
                    ))}
                    {(r.autres?.length ?? 0) > 6 && <div className="index-plus">et {r.autres!.length - 6} autres…</div>}
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
              className={`onglet ${destination === i ? 'actif' : ''} ${resultats.some((r) => r.i === i) ? 'trouve' : ''} ${p.type === 'ventes' ? 'onglet-ventes' : ''} ${p.type === 'atelier' && p.vue === 'matieres' ? 'onglet-matieres' : ''}`}
              onClick={() => aller(i)}
              title={p.titre}
            >
              <Icone corps={icones[p.icone]} className="onglet-icone" />
              <span className="onglet-nom">{p.court}</span>
            </button>
          ))}
        </nav>

        <div className="couverture">
          <div className="cuir-ombre" aria-hidden />
          <Verrou onRefermer={refermer} />
          <CoinLaiton className="hg" />
          <CoinLaiton className="hd" />
          <CoinLaiton className="bg" />
          <CoinLaiton className="bd" />
          <div className="bloc-papier" aria-hidden />
          <div className="voile-livre" aria-hidden />
          <div className="feuillets" ref={feuillets} onPointerDown={debutGeste} onClick={clicPapier}>
            {etroit === null || !pretSignature ? null : etroit ? (
              <>
                <div className={`page unique page-${pages[uniqueBase].type}`}>
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
                      classeRecto={`page unique page-${pages[uniqueVolet].type}`}
                      classeVerso="page unique dos"
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={`page gauche page-${pages[gaucheBase].type}`}>
                  <PageGauche key={pages[gaucheBase].id} page={pages[gaucheBase]} ctx={ctx(gaucheBase, !tourne)} />
                  {portee}
                </div>
                <div className={`page droite page-${pages[droiteBase].type}`}>
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
            {/* The shadow book's burnt edges, creeping in from the page borders (darkness B). */}
            <div className="brulures" aria-hidden>
              <div className="brulure g" />
              <div className="brulure d" />
            </div>
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
            <EffetsOeufs oeuf={oeuf} sansAnimation={Boolean(sansAnimation)} />
            {etroit === false && commande.ouverte && (
              <FeuilleCommande c={commande} icones={icones} mobile={false} bande={bande} sansAnimation={Boolean(sansAnimation)} ecartee={ecartee} />
            )}
            {etroit === false && fiche && !tourne && (
              <FicheVolante key={JSON.stringify(fiche)} fiche={fiche} reg={ctxRegistre} articles={articlesLivre} chapitres={chapitres} caches={caches} icones={icones} mobile={false} sansAnimation={Boolean(sansAnimation)} fermer={() => setFiche(null)} />
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
          {fiche && !tourne && <FicheVolante key={JSON.stringify(fiche)} fiche={fiche} reg={ctxRegistre} articles={articlesLivre} chapitres={chapitres} caches={caches} icones={icones} mobile sansAnimation={Boolean(sansAnimation)} fermer={() => setFiche(null)} />}
          <BarreCommande c={commande} icones={icones} />
        </>
      )}
      {/* The light dims over everything but the side tabs (darkness B). */}
      <div className="voile-ombre" aria-hidden />
    </div>
    </OmbreContexte.Provider>
    </IconesLivre.Provider>
  )
}
