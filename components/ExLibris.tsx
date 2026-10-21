'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Ctx } from './Pages'
import { EMBLEME_TRACE, EMBLEME_VIEWBOX } from '@/lib/embleme'
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

/**
 * The caravan's emblem blind-pressed into the paper of the ex-libris spread: no ink, no gold, only the
 * light and shadow of the press. Larger than the page, so the page edges cut it; on a spread its
 * centre sits on the spine and each page shows its half. Static (painted once).
 */
export function Gaufrage({ cote }: { cote: 'gauche' | 'droite' | 'unique' }) {
  return (
    <div className={`gaufrage gaufrage-${cote}`} aria-hidden>
      <svg viewBox={EMBLEME_VIEWBOX} preserveAspectRatio="xMidYMid meet">
        <path d={EMBLEME_TRACE} fillRule="evenodd" />
      </svg>
    </div>
  )
}

/** A name written letter by letter in fresh ink. */
function Ecrit({ nom, frais }: { nom: string; frais: boolean }) {
  return (
    <span className={`ex-libris-nom ${frais ? 'frais' : ''}`} aria-label={nom}>
      {[...nom].map((c, i) => (
        <span key={i} aria-hidden style={frais ? { animationDelay: `${i * PAS_LETTRE}ms` } : undefined}>
          {c === ' ' ? ' ' : c}
        </span>
      ))}
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
    setTimeout(() => (ctx.signe ? ctx.signe() : ctx.aller?.(sommaire)), rep.message.length * PAS_LETTRE + APRES_SIGNATURE)
  }

  return (
    <div className="ex-libris-zone">
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
