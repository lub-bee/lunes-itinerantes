'use client'

import type { ReactNode } from 'react'
import { estImage, RANGS, SANS_RANG, TIERS, type Rang } from '@/lib/rangs'
import type { CtxRegistre } from './Missives'

/*
 * The caravan's ranks as an engraved family tree: the Patriarchs on top, the three Ros below (Master of
 * the roads, the two Voices): the « Conseil restreint »; then the « Membres »: Full moon, Steward and Scribe
 * of moons side by side, the Rising moon, the New moon (the recruits). Each tier is a bracket in the left margin. Each rank is a coloured
 * seal (or its icon, when lib/rangs.ts gives one); touching it pins the list of its members on the
 * other page. Static drawing, no animation.
 */

const LARGEUR = 420
const RAYON = 25
const Y = { 1: 46, 2: 176, 3: 302, 4: 414, 5: 526 } as Record<number, number>
const HAUTEUR = 594
/** Drawn size of an image medallion: its ring matches a seal's ring (the points stand out). */
const MEDAILLON = (RAYON + 5) * 2 * 1.18

/** Seal positions: siblings spread across the width. */
function positions(): (Rang & { x: number; y: number })[] {
  const parNiveau = new Map<number, Rang[]>()
  RANGS.forEach((r) => parNiveau.set(r.niveau, [...(parNiveau.get(r.niveau) ?? []), r]))
  return RANGS.map((r) => {
    const freres = parNiveau.get(r.niveau)!
    const i = freres.indexOf(r)
    // Siblings share the width evenly, each in its own column (their labels never meet).
    const colonne = LARGEUR / freres.length
    return { ...r, x: colonne * (i + 0.5), y: Y[r.niveau] ?? 46 + (r.niveau - 1) * 120 }
  })
}

/** An inked line, doubled by a pale one below it as if cut in the page. */
function Trait({ d }: { d: string }) {
  return (
    <>
      <path d={d} className="trait-clair" transform="translate(0.8 0.9)" />
      <path d={d} className="trait-encre" />
    </>
  )
}

export function ArbreRangs({ reg, icones, interactif }: { reg?: CtxRegistre; icones: Record<string, string>; interactif: boolean }) {
  const ps = positions()
  const h = reg?.r.hierarchie
  const signe = Boolean(reg?.r.marchand?.identite)
  const centre = LARGEUR / 2
  const niveaux = [...new Set(ps.map((p) => p.niveau))].sort((a, b) => a - b)
  const traits: ReactNode[] = []
  // Between two levels: down from the parents (or their labels), a bar, then down to each child.
  /** Below a seal's name and count. */
  const sousEtiquette = (p: (typeof ps)[number]) => p.y + RAYON + 18 + ((p.lignes?.length ?? 1) - 1 + (signe ? 1 : 0)) * 15 + 8
  niveaux.slice(1).forEach((n, k) => {
    const haut = ps.filter((p) => p.niveau === niveaux[k])
    const bas = ps.filter((p) => p.niveau === n)
    const sousHaut = Math.max(...haut.map(sousEtiquette)) + 6
    const barre = (sousHaut + (bas[0].y - RAYON)) / 2
    const xs = [...haut, ...bas].map((p) => p.x)
    const g = Math.min(...xs)
    const d = Math.max(...xs)
    haut.forEach((p) => traits.push(<Trait key={`h${n}${p.cle}`} d={`M${p.x} ${sousHaut - 6} V${barre}`} />))
    if (g !== d) traits.push(<Trait key={`b${n}`} d={`M${g - 6} ${barre + 3} q3 -3 6 -3 H${d} q3 0 6 3`} />)
    bas.forEach((p) => traits.push(<Trait key={`d${n}${p.cle}`} d={`M${p.x} ${barre} V${p.y - RAYON - 4}`} />))
  })
  // The tiers (lib/rangs.ts TIERS): a bracket in the left margin from the tier's first seal to its last label, its name upright.
  const tiers = TIERS.flatMap((t) => {
    const qs = ps.filter((p) => t.niveaux.includes(p.niveau))
    if (!qs.length) return []
    const haut = Math.min(...qs.map((p) => p.y)) - MEDAILLON / 2
    const bas = Math.max(...qs.map(sousEtiquette)) - 4
    return [{ nom: t.nom, haut, bas }]
  })
  const ouvrir = (cle: string) => reg?.ouvrir({ genre: 'rang', cle })
  return (
    <div className="arbre-rangs">
      <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} role="group" aria-label="Les rangs de la caravane">
        <defs>
          {ps.map((p) => (
            <radialGradient key={p.cle} id={`sceau-${p.cle}`} cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor="#fff3d0" stopOpacity="0.55" />
              <stop offset="28%" stopColor={p.couleur} />
              <stop offset="100%" stopColor={p.couleur} stopOpacity="1" />
            </radialGradient>
          ))}
        </defs>
        <g className="arbre-traits">{traits}</g>
        {tiers.map((t) => (
          <g key={t.nom} className="arbre-tier" aria-hidden="true">
            <path d={`M21 ${t.haut} H15 V${t.bas} H21`} className="tier-trait" />
            <text x={8} y={(t.haut + t.bas) / 2} transform={`rotate(-90 8 ${(t.haut + t.bas) / 2})`} textAnchor="middle" className="tier-nom">
              {t.nom}
            </text>
          </g>
        ))}
        {ps.map((p) => {
          const n = h?.[p.cle]?.length
          const lignes = p.lignes ?? [p.nom]
          return (
            <g
              key={p.cle}
              className="rang"
              role="button"
              tabIndex={interactif ? 0 : -1}
              aria-label={`${p.nom}${p.nomKhajiit ? ` (${p.nomKhajiit})` : ''}${n !== undefined ? ` : ${n} membre${n > 1 ? 's' : ''}` : ''}`}
              onClick={() => ouvrir(p.cle)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                ouvrir(p.cle)
              }}
            >
              {estImage(p.icone) ? (
                // The rank's own medallion, at the size of a seal and its ring, with the same shadow.
                <image href={p.icone} x={p.x - MEDAILLON / 2} y={p.y - MEDAILLON / 2} width={MEDAILLON} height={MEDAILLON} className="rang-medaillon" />
              ) : (
                <>
                  <circle cx={p.x} cy={p.y} r={RAYON + 5} className="rang-anneau" />
                  <circle cx={p.x} cy={p.y} r={RAYON} fill={`url(#sceau-${p.cle})`} className="rang-sceau" />
                  <circle cx={p.x} cy={p.y} r={RAYON - 5} className="rang-filet" />
                </>
              )}
              {p.icone && !estImage(p.icone) && icones[p.icone] && (
                <svg x={p.x - RAYON * 0.6} y={p.y - RAYON * 0.6} width={RAYON * 1.2} height={RAYON * 1.2} viewBox="0 0 512 512" className="rang-icone" dangerouslySetInnerHTML={{ __html: icones[p.icone] }} />
              )}
              {lignes.map((l, i) => (
                <text key={i} x={p.x} y={p.y + RAYON + 18 + i * 15} className="rang-nom" textAnchor="middle">
                  {l}
                </text>
              ))}
              {signe && n !== undefined && (
                <text x={p.x} y={p.y + RAYON + 18 + lignes.length * 15} className="rang-compte" textAnchor="middle">
                  {n} membre{n > 1 ? 's' : ''}
                </text>
              )}
              {signe && n === undefined && h && (
                <text x={p.x} y={p.y + RAYON + 18 + lignes.length * 15} className="rang-compte" textAnchor="middle">
                  personne encore
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {signe && h?.[SANS_RANG.cle]?.length ? (
        <button type="button" className="lien-encre arbre-sans-rang" tabIndex={interactif ? 0 : -1} onClick={() => ouvrir(SANS_RANG.cle)}>
          {SANS_RANG.nom} : {h[SANS_RANG.cle].length} membre{h[SANS_RANG.cle].length > 1 ? 's' : ''}
        </button>
      ) : null}
    </div>
  )
}
