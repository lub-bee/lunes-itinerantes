// Easter eggs of the grimoire: every trigger and every text in one place. Matching ignores case,
// accents, spaces and punctuation (`cle`). All of them are discreet and never stand in the way: the
// normal search still runs, nothing is signed or written to the registre.

import { cle } from './missives'
import { POEMES } from './poemes'

/* ── Typed in the global search ── */

export type OeufRecherche = 'skooma' | 'sucre' | 'genou' | 'fus'

export const RECHERCHES: { oeuf: OeufRecherche; mots: string[]; note?: string }[] = [
  // The page trembles, the ink blurs for a moment, a note in the margin.
  { oeuf: 'skooma', mots: ['skooma'], note: 'Khajiit ne sait pas de quoi tu parles… mais si tu demandes à voix basse…' },
  // Golden flakes fall over the book for a few seconds.
  { oeuf: 'sucre', mots: ['sucre de lune', 'sucre lunaire', 'moon sugar', 'moonsugar'] },
  // An inked reply in the margin.
  {
    oeuf: 'genou',
    mots: ['flèche au genou', 'flèche dans le genou', 'une flèche dans le genou', 'arrow to the knee', 'arrow in the knee', 'an arrow in the knee'],
    note: 'Khajiit était aventurier, lui aussi. Puis…',
  },
  // The pages riffle back to the Sommaire, the order scroll is blown off the table and comes back.
  { oeuf: 'fus', mots: ['fus ro dah', 'fus ro dah!', 'fusrodah'] },
]

export function oeufDeRecherche(requete: string): (typeof RECHERCHES)[number] | null {
  const k = cle(requete)
  if (!k) return null
  return RECHERCHES.find((o) => o.mots.some((m) => cle(m) === k)) ?? null
}

/* ── The emblem pressed into the pages ── */

/** Clicked this many times on the paper within the window: the two moons light up, Jone then Jode. */
export const EMBLEME = {
  clics: 7,
  fenetreMs: 4000,
  note: 'Les lunes veillent sur celui qui sait regarder.',
}

/* ── The midnight hour (the reader's own clock) ── */

export const MINUIT = {
  heure: 0,
  /** Replaces the title page's usual saying. */
  citation: '« Sous les lunes, Khajiit fait ses meilleures affaires. »',
}

/* ── Names tried on the ex-libris (before the registre is asked; nothing is signed) ── */

export const NOMS_SPECIAUX: { noms: string[]; refus: string }[] = [
  { noms: ["M'aiq", "M'aiq le Menteur", "M'aiq the Liar", 'Maiq'], refus: 'M’aiq le Menteur signe beaucoup de choses. Rarement les siennes.' },
  {
    noms: ['Dovahkiin', 'Enfant de dragon', 'Enfant de dragons', "L'Enfant de dragon", 'Dragonborn'],
    refus: 'Khajiit a déjà vendu trois épées à des Enfants de dragon cette semaine. Toi aussi, tu cries sur les gens ?',
  },
  { noms: ['Lydia'], refus: 'Lydia est sous contrat ailleurs. Elle porte vos fardeaux, pas nos registres.' },
  { noms: ['Nazeem'], refus: 'Nazeem ? Khajiit doute que tu sois souvent allé au Quartier des Nuages… et jamais à la caravane.' },
  { noms: ['Belethor'], refus: 'Belethor vendrait sa propre sœur. Khajiit, lui, ne vend que des marchandises : garde ta plume.' },
  { noms: ['Ulfric', 'Ulfric Sombrage', 'Ulfric Stormcloak'], refus: 'Ulfric Sombrage signe des déclarations de guerre, pas des ex-libris. La caravane reste neutre.' },
  { noms: ['Sheogorath', 'Shéogorath'], refus: 'Fromage ! … Non. Le Seigneur Fou a déjà son propre grimoire, et il le mange.' },
]

/** The Imperial Divines: a god the caravan does not know. */
export const DIVINS_IMPERIAUX = {
  noms: ['Akatosh', 'Mara', 'Dibella', 'Kynareth', 'Zenithar', 'Arkay', 'Julianos', 'Stendarr', 'Talos', 'Tiber Septim'],
  refus: 'Khajiit ne connaît pas ce dieu-là. Il a dû passer par une autre caravane.',
}

/**
 * The Khajiit gods. A reader who signs with one of these names is not signed in: the book turns to a
 * blank page that bows (`PRESENCE`), then to the poems the caravan sings to that god (lib/poemes.ts).
 */
export const DIVINITES: { cle: string; nom: string; noms: string[]; dedicace: string }[] = [
  { cle: 'azurah', nom: 'Azurah', noms: ['Azurah'], dedicace: 'À Azurah, mère des Khajiits, dame du crépuscule et de l’aube' },
  { cle: 'jone', nom: 'Jone', noms: ['Jone', 'Masser'], dedicace: 'À Jone, la grande lune' },
  { cle: 'jode', nom: 'Jode', noms: ['Jode', 'Secunda'], dedicace: 'À Jode, la petite lune' },
  { cle: 'alkosh', nom: 'Alkosh', noms: ['Alkosh'], dedicace: 'À Alkosh, roi-dragon des chats' },
  { cle: 'khenarthi', nom: 'Khenarthi', noms: ['Khenarthi'], dedicace: 'À Khenarthi, dame des vents' },
  { cle: 'riddle-thar', nom: 'Riddle’Thar', noms: ["Riddle'Thar", 'Riddle Thar', 'Riddlethar'], dedicace: 'À Riddle’Thar, la danse des deux lunes' },
  { cle: 'srendarr', nom: 'S’rendarr', noms: ["S'rendarr", 'Srendarr'], dedicace: 'À S’rendarr, l’avorton miséricordieux' },
  { cle: 'rajhin', nom: 'Rajhin', noms: ['Rajhin'], dedicace: 'À Rajhin, le Chapardeur au pas feutré' },
  { cle: 'mafala', nom: 'Mafala', noms: ['Mafala'], dedicace: 'À Mafala, la mère du clan' },
  { cle: 'magrus', nom: 'Magrus', noms: ['Magrus'], dedicace: 'À Magrus, l’œil du chat' },
  { cle: 'lorkhaj', nom: 'Lorkhaj', noms: ['Lorkhaj'], dedicace: 'À Lorkhaj, que l’on prie de rester au loin' },
]

/** What the blank page says when a god signs the ex-libris. */
export const PRESENCE = 'Ces Khajiits sont humbles de votre présence.'

export const divinite = (k: string) => DIVINITES.find((d) => d.cle === k) ?? null
export const poemesDe = (k: string) => POEMES[k] ?? []

const egal = (a: string, b: string) => cle(a) === cle(b)

/** A name with an egg: a refusal in character, or a god (the book turns to its pages). */
export function oeufDeNom(nom: string): { refus: string } | { divinite: string } | null {
  if (!cle(nom)) return null
  const d = DIVINITES.find((x) => x.noms.some((n) => egal(n, nom)))
  if (d) return { divinite: d.cle }
  const s = NOMS_SPECIAUX.find((x) => x.noms.some((n) => egal(n, nom)))
  if (s) return { refus: s.refus }
  if (DIVINS_IMPERIAUX.noms.some((n) => egal(n, nom))) return { refus: DIVINS_IMPERIAUX.refus }
  return null
}
