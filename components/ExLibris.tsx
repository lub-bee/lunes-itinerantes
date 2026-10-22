'use client'

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { Ctx } from './Pages'
import { EMBLEME_TRACE, EMBLEME_VIEWBOX } from '@/lib/embleme'
import { GAUFRAGE } from '@/lib/gaufrage'
import { Icone } from './Ornements'

/*
 * The ex-libris: a bookplate pasted inside the cover, the first page of the grimoire once the
 * registre is linked. A reader whose name is not yet recognized signs it: the name is checked
 * against the caravan's list (the same signature then signs orders and missives), is written in ink
 * letter by letter, and the book turns to its title page. An unknown name blots and fades. Animations
 * are transforms and opacity only.
 */

const PAS_LETTRE = 70
const APRES_SIGNATURE = 700
/** The flourish under the name, drawn after the last letter (then its drop of ink). */
const DUREE_PARAPHE = 380

/**
 * The hand that signs is not a printer's: each letter leans a little (±1.5°) and sits a little off the
 * line (±1.3 px). Drawn from the name itself, so a name is always written the same way.
 */
function mainQuiTremble(nom: string, n: number): { r: number; y: number }[] {
  let h = 2166136261
  for (const c of nom) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  let graine = (h >>> 0) % 2147483646 || 7
  const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647
  return Array.from({ length: n }, () => ({ r: +(hasard() * 3 - 1.5).toFixed(2), y: +(hasard() * 2.6 - 1.3).toFixed(2) }))
}

/**
 * The caravan's emblem blind-pressed into the paper of the ex-libris spread: no ink, no gold, only the
 * light and shadow of the press. Larger than the page, so the page edges cut it; on a spread its
 * centre sits on the spine and each page shows its half. Static (painted once).
 */
export function Gaufrage({ cote }: { cote: 'gauche' | 'droite' | 'unique' }) {
  // Pressed into every page instead (a baked background, see lib/gaufrage.ts).
  if (GAUFRAGE.partout) return null
  return (
    <div className={`gaufrage gaufrage-${cote}`} aria-hidden>
      <svg viewBox={EMBLEME_VIEWBOX} preserveAspectRatio="xMidYMid meet">
        <path d={EMBLEME_TRACE} fillRule="evenodd" />
      </svg>
    </div>
  )
}

/**
 * Iron-gall ink laid with a quill, the same for every signature: downstrokes a little thicker (a broad
 * nib), ragged edges, a colour that drifts from brown-black to warm brown, uneven density and a darker
 * rim where the ink pools. Drawn once with the ex-libris; used by `filter: url(#encre-plume)`.
 */
function FiltreEncre() {
  return (
    <svg width="0" height="0" className="filtre-encre" aria-hidden>
      <filter id="encre-plume" x="-6%" y="-70%" width="112%" height="240%" colorInterpolationFilters="sRGB">
        <feOffset in="SourceAlpha" dx="0.85" dy="0" result="d1" />
        <feOffset in="SourceAlpha" dx="-0.35" dy="0.15" result="d2" />
        <feMerge result="plume">
          <feMergeNode in="SourceAlpha" />
          <feMergeNode in="d1" />
          <feMergeNode in="d2" />
        </feMerge>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} result="bruit" />
        <feDisplacementMap in="plume" in2="bruit" scale={1.3} xChannelSelector="R" yChannelSelector="G" result="bord" />
        <feTurbulence type="fractalNoise" baseFrequency="0.03 0.07" numOctaves={2} seed={8} result="nuage" />
        <feColorMatrix in="nuage" type="matrix" values="0.42 0 0 0 -0.02  0.27 0 0 0 -0.03  0.12 0 0 0 -0.01  0 0 0 0 1" result="teinte" />
        <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves={2} seed={21} result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.45 0 0 0 0.62" result="densite" />
        <feComposite in="teinte" in2="bord" operator="in" result="encre1" />
        <feComposite in="encre1" in2="densite" operator="in" result="encre2" />
        <feMorphology in="bord" operator="erode" radius={0.65} result="coeur" />
        <feComposite in="bord" in2="coeur" operator="out" result="lisere" />
        <feFlood floodColor="#120904" floodOpacity={0.55} />
        <feComposite in2="lisere" operator="in" result="bord-sombre" />
        <feMerge>
          <feMergeNode in="encre2" />
          <feMergeNode in="bord-sombre" />
        </feMerge>
      </filter>
    </svg>
  )
}

/**
 * A name written letter by letter in fresh ink. A long name shrinks to fit the signing line (measured
 * once the font is there, and again when the line changes width).
 */
function Ecrit({ nom, frais }: { nom: string; frais: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const ligne = el?.parentElement
    if (!el || !ligne) return
    let largeurVue = -1
    const ajuster = () => {
      const libre = ligne.clientWidth - 8
      if (libre === largeurVue) return
      largeurVue = libre
      el.style.fontSize = ''
      // Width is not quite proportional to the size (padding, the ink's spread): a few passes settle it.
      for (let i = 0; i < 4; i++) {
        const large = el.getBoundingClientRect().width
        if (large <= libre) break
        el.style.fontSize = `${(parseFloat(getComputedStyle(el).fontSize) * libre) / large - 0.5}px`
      }
    }
    ajuster()
    document.fonts?.ready.then(() => {
      largeurVue = -1
      ajuster()
    })
    const suivi = new ResizeObserver(ajuster)
    suivi.observe(ligne)
    return () => suivi.disconnect()
  }, [nom])
  const lettres = [...nom.replace(/'/g, '’')]
  const main = mainQuiTremble(nom, lettres.length)
  const fin = lettres.length * PAS_LETTRE
  return (
    <span ref={ref} className={`ex-libris-nom ${frais ? 'frais' : ''}`} aria-label={nom}>
      {/* A typed straight apostrophe is written as the quill would: ’ (the hand's ' is a faint tick). */}
      {lettres.map((c, i) =>
        c === ' ' ? (
          ' '
        ) : (
          <span
            key={i}
            aria-hidden
            style={{ transform: `translateY(${main[i].y}px) rotate(${main[i].r}deg)`, animationDelay: frais ? `${i * PAS_LETTRE}ms` : undefined }}
          >
            {c}
          </span>
        ),
      )}
      {/* The flourish under the name, then its drop of ink: drawn once the last letter is written. */}
      <svg className="ex-libris-paraphe" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden style={frais ? { animationDelay: `${fin}ms` } : undefined}>
        <path d="M2 9.6 C30 12.4 70 11.6 110 8.6 C140 6.6 170 5.6 192 6.3 C170 6.5 140 7.6 110 9.6 C70 12.4 30 13.4 2 9.9 Z" />
        <path d="M150 7.2 C165 3 178 2 186 3.2" className="delie" />
      </svg>
      <svg className="ex-libris-goutte" viewBox="0 0 12 16" aria-hidden style={frais ? { animationDelay: `${fin + DUREE_PARAPHE}ms` } : undefined}>
        <ellipse cx="5" cy="6.5" rx="3.2" ry="2.7" />
        <circle cx="9.5" cy="10.5" r="0.9" />
      </svg>
    </span>
  )
}

export function ExLibris({ ctx }: { ctx: Ctx }) {
  const r = ctx.registre?.r
  const m = r?.marchand
  const [nom, setNom] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [refus, setRefus] = useState<{ texte: string; tache: string; n: number } | null>(null)
  const [frais, setFrais] = useState(false)
  const champ = useRef<HTMLInputElement>(null)
  const tab = ctx.interactif ? 0 : -1

  // After a refusal the blotted name fades away and the line is free again.
  useEffect(() => {
    if (!refus) return
    const t = setTimeout(() => setNom(''), 900)
    return () => clearTimeout(t)
  }, [refus])

  const signer = async (e: FormEvent) => {
    e.preventDefault()
    const tape = nom.trim()
    if (!r || !tape || envoi) return
    setEnvoi(true)
    setRefus(null)
    const rep = await r.signer(tape)
    setEnvoi(false)
    if (!rep.ok) {
      setRefus({ texte: rep.message, tache: tape, n: Date.now() })
      return
    }
    setFrais(true)
    // The ink dries, then the book opens on its title page.
    const sommaire = ctx.livre.pages.findIndex((p) => p.type === 'sommaire')
    setTimeout(() => (ctx.signe ? ctx.signe() : ctx.aller?.(sommaire)), rep.message.length * PAS_LETTRE + DUREE_PARAPHE + APRES_SIGNATURE)
  }

  return (
    <div className="ex-libris-zone">
      <FiltreEncre />
      <div className="ex-libris">
        <div className="ex-libris-papier" aria-hidden />
        <span className="ex-libris-coin hg" aria-hidden>❦</span>
        <span className="ex-libris-coin hd" aria-hidden>❦</span>
        <span className="ex-libris-coin bg" aria-hidden>❦</span>
        <span className="ex-libris-coin bd" aria-hidden>❦</span>
        <div className="ex-libris-titre">Ex-libris</div>
        <div className="ex-libris-lunes" aria-hidden>
          <span className="lune">☾</span>
          <span className="ex-libris-etoile">✦</span>
          <span className="lune">☽</span>
        </div>
        <p className="ex-libris-texte">Cet ouvrage du grimoire appartient à</p>
        {m?.identite ? (
          <div className="ex-libris-ligne signee">
            <Ecrit nom={m.identite} frais={frais} />
          </div>
        ) : (
          <form className="ex-libris-ligne" onSubmit={signer}>
            <span className="ex-libris-saisie">
              <input
                ref={champ}
                type="text"
                value={nom}
                maxLength={80}
                tabIndex={tab}
                readOnly={!ctx.interactif || !r}
                onChange={(e) => {
                  setNom(e.target.value)
                  setRefus(null)
                }}
                placeholder="votre nom"
                autoComplete="off"
                name="nom-membre"
                aria-label="Votre nom de marchand"
                className={refus ? 'bave' : ''}
              />
              {refus && <span key={refus.n} className="ex-libris-tache" aria-hidden />}
            </span>
            <button type="submit" className="ex-libris-signer" tabIndex={tab} disabled={envoi || !nom.trim()} title="Signer de ce nom">
              <span className="commande-cire" aria-hidden>
                <Icone corps={ctx.livre.icones['quill']} />
              </span>
              <span className="visuellement-cache">Signer</span>
            </button>
          </form>
        )}
        {refus && (
          <p className="ex-libris-refus" role="alert">
            {refus.texte}
          </p>
        )}
        {envoi && <p className="ex-libris-attente">Le scribe cherche ce nom au registre…</p>}
        <p className="ex-libris-voeu">
          Signez-le, au cas où il viendrait à se perdre : Azurah veillera à ce qu&apos;il retourne à la caravane, et la caravane à son porteur.
        </p>
        <div className="ex-libris-pied">Caravane des Lunes Itinérantes</div>
      </div>
      {!m?.identite && Boolean(ctx.refus) && (
        <p key={ctx.refus} className="ex-libris-retenue" role="status">
          Une force divine retient la page. Azurah attend ta signature.
        </p>
      )}
      {m?.identite && !m.discord && (
        <button type="button" className="lien-encre ex-libris-autre" tabIndex={tab} onClick={r?.oublier}>
          ce n&apos;est pas mon nom
        </button>
      )}
    </div>
  )
}
