import { NextResponse, type NextRequest } from 'next/server'
import { identite, type Identite } from '@/lib/identite'
import { peut, quiPourScript } from '@/lib/droits'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'
import { cle } from '@/lib/missives'
import { ETATS, LIMITES, PORTEES, URGENCES, vueOmbre, type ActionSecret, type DroitsOmbre, type Secret } from '@/lib/secrets'

// The Livre d'ombre v2: the secrets and the contraband list (lib/secrets.ts). GET: only what the signed reader may see
// (their own secrets; everything for who sorts or holds the archives; the list for who holds it). POST { action, ... }:
// one write, signed with the member's name (never a name sent by the page), after the permission hook (lib/droits.ts);
// the script checks the gesture again on the sheet's own boxes (grimoire.gs v3u `qui`). Until the sheet's script is v3u,
// the pages say so in character and every write is refused (409).

export const dynamic = 'force-dynamic'

type Lu = Awaited<ReturnType<typeof lireRegistre>>

const refus = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

const SIGNER = "Signe d'abord de ton nom : l'ombre ne reçoit que les membres de la caravane."
const INTERDIT = "Cette page de l'ombre est réservée à d'autres pattes que les tiennes."
const VIEUX_SCRIPT = 'Le scribe de l’ombre ne connaît pas encore ce registre : qu’on colle la v3u du script (grimoire.gs) dans la feuille, en nouvelle version du déploiement.'

const droitsDe = (qui: Identite | null, lu: Lu): DroitsOmbre => ({
  secret: peut('secret', qui, lu.droits),
  tri: peut('secretTri', qui, lu.droits),
  archives: peut('secretArchives', qui, lu.droits),
  contrebande: peut('contrebande', qui, lu.droits),
})

const vue = (lu: Lu, qui: Identite | null) => vueOmbre(lu.ombre, qui?.nom ?? null, droitsDe(qui, lu), lu.version)

export async function GET(req: NextRequest) {
  if (!registreRelie()) return NextResponse.json({ ok: true, donnees: null })
  try {
    const lu = await lireRegistre(Number(req.nextUrl.searchParams.get('v')) || 0)
    const qui = await identite(req.cookies, lu)
    return NextResponse.json({ ok: true, donnees: vue(lu, qui) })
  } catch (e) {
    console.error('[ombre] read failed', e)
    return refus("Le livre d'ombre reste fermé pour l'heure : le coursier n'a pas pu l'ouvrir.", 502)
  }
}

/* ───────────────────────── Reading what the page sends ───────────────────────── */

class Refus extends Error {}
const non = (message: string): never => {
  throw new Refus(message)
}
/** One line of free text (spaces folded). */
const mot = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
/** A text of several lines (line breaks kept, trailing spaces cut). */
const lignes = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max)

/** A choice of a short list, its own spelling kept ('' when empty; refused when unknown). */
function choix(v: unknown, liste: readonly string[], quoi: string): string {
  const t = mot(v, 40)
  if (!t) return ''
  return liste.find((x) => cle(x) === cle(t)) ?? non(`${quoi} : « ${t} » n’est pas un choix du registre.`)
}

/** The fields of a note a sender writes or a sorter classifies (free text, the two short lists); only those the page sent. */
function champs(b: Record<string, unknown>) {
  const tous = {
    urgence: () => choix(b.urgence, URGENCES, 'L’urgence'),
    prix: () => mot(b.prix, LIMITES.prix),
    provenance: () => mot(b.provenance, LIMITES.champ),
    destinataire: () => mot(b.destinataire, LIMITES.champ),
    faction: () => mot(b.faction, LIMITES.champ),
    portee: () => choix(b.portee, PORTEES, 'Interne ou externe'),
  }
  return Object.fromEntries(Object.entries(tous).filter(([k]) => k in b).map(([k, f]) => [k, f()])) as Partial<Record<keyof typeof tous, string>>
}

function numero(prefixe: string): string {
  const j = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '')
  const hasard = Array.from(crypto.getRandomValues(new Uint8Array(3)), (o) => o.toString(36).padStart(2, '0')).join('').toUpperCase()
  return `${prefixe}-${j}-${hasard.slice(0, 4)}`
}

type Ecriture = { action: string; charge: Record<string, unknown>; message: string; numero?: string }

function preparer(action: ActionSecret, b: Record<string, unknown>, lu: Lu, qui: Identite): Ecriture {
  const quand = new Date().toISOString()
  const note = (): Secret => {
    const id = mot(b.id, 40)
    const s = lu.ombre.secrets.find((x) => x.id === id)
    if (!s) non('Cette note est introuvable dans le registre de l’ombre.')
    return s!
  }
  const tri = (geste: string, s: Secret, x: Record<string, unknown> = {}) => ({ tri: { id: s.id, geste, par: qui.nom, quand, ...x } })
  const nommer = (s: Secret) => `« ${s.titre || s.id} »`
  switch (action) {
    case 'secret': {
      const titre = mot(b.titre, LIMITES.titre) || non('Un secret sans titre ne se transmet pas : donne-lui au moins quelques mots.')
      const contenu = lignes(b.contenu, LIMITES.contenu) || non('La lettre est vide : écris ce que tu sais.')
      const id = numero('S')
      return {
        action: 'secret',
        charge: { secret: { id, depose: quand, informateur: qui.nom, titre, contenu, ...champs(b) } },
        message: `Ta lettre est scellée et glissée dans l’ombre (n° ${id}). Seuls la Voix de la sécurité et les Patriarches en briseront le sceau.`,
        numero: id,
      }
    }
    case 'ouvrir': {
      const s = note()
      if (s.etat !== ETATS.scellee) non('Ce pli est déjà ouvert.')
      return { action: 'secretTri', charge: tri('ouvrir', s, { si: [ETATS.scellee] }), message: `Le sceau de ${nommer(s)} est brisé.` }
    }
    case 'classer': {
      const s = note()
      return {
        action: 'secretTri',
        charge: tri('classer', s, { si: [ETATS.scellee, ETATS.ouverte, ETATS.classee], champs: champs(b) }),
        message: `${nommer(s)} est classée.`,
      }
    }
    case 'corriger': {
      const s = note()
      const titre = mot(b.titre, LIMITES.titre) || non('Une note sans titre ne se garde pas.')
      const contenu = lignes(b.contenu, LIMITES.texte) || non('La note est vide : une note retirée se retire par « retirer ».')
      return {
        action: 'secretTri',
        charge: tri('corriger', s, { si: [ETATS.scellee, ETATS.ouverte, ETATS.classee], champs: { titre, contenu, ...champs(b) } }),
        message: `${nommer({ ...s, titre })} est corrigée.`,
      }
    }
    case 'fusionner': {
      const s = note()
      const cible = lu.ombre.secrets.find((x) => x.id === mot(b.cible, 40))
      if (!cible || cible.id === s.id) non('Choisis la note où joindre celle-ci.')
      if (cible!.etat === ETATS.fusionnee || cible!.etat === ETATS.retiree) non('Cette note n’est plus au registre de l’ombre : choisis-en une autre.')
      if (s.etat === ETATS.fusionnee || s.etat === ETATS.retiree) non('Cette note n’est plus au registre de l’ombre.')
      if (s.contenu.length + cible!.contenu.length > LIMITES.texte) non('Les deux notes réunies dépasseraient ce qu’une page peut tenir : allège-les d’abord.')
      return {
        action: 'secretTri',
        charge: tri('fusionner', s, { si: [ETATS.scellee, ETATS.ouverte, ETATS.classee], cible: cible!.id }),
        message: `${nommer(s)} rejoint ${nommer(cible!)} : une seule note, chaque apport sous le nom de son auteur.`,
      }
    }
    case 'retirerSecret': {
      const s = note()
      if (s.etat === ETATS.retiree) non('Cette note est déjà retirée.')
      return { action: 'secretTri', charge: tri('retirer', s, { si: [ETATS.scellee, ETATS.ouverte, ETATS.classee, ETATS.fusionnee] }), message: `${nommer(s)} est retirée de toutes les pages. Les archives la gardent, pour la rendre si besoin.` }
    }
    case 'rendre': {
      const s = note()
      if (s.etat !== ETATS.retiree) non('Cette note n’est pas retirée.')
      return { action: 'secretTri', charge: tri('rendre', s, { si: [ETATS.retiree] }), message: `${nommer(s)} revient au registre de l’ombre.` }
    }
    case 'contrebande': {
      const texte = lignes(b.texte, LIMITES.contrebande)
      const liste = texte
        .split('\n')
        .map((l) => l.replace(/^[\s\-–—•*·]+/, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 300)
      return {
        action: 'contrebande',
        charge: { contrebande: { lignes: liste, par: qui.nom, quand } },
        message: liste.length ? `La liste de la contrebande est consignée : ${liste.length} ligne${liste.length > 1 ? 's' : ''}.` : 'La liste de la contrebande est vide désormais.',
      }
    }
  }
}

const ACTIONS: ActionSecret[] = ['secret', 'ouvrir', 'classer', 'corriger', 'fusionner', 'retirerSecret', 'rendre', 'contrebande']

/** The script's refusals, in character. */
function refusScript(s: string): string {
  if (s.includes('unknown action')) return VIEUX_SCRIPT
  if (s.includes('forbidden')) return 'Le registre de l’ombre a vérifié tes rangs sur la feuille : ce geste ne t’y est pas ouvert. Rien n’a été écrit.'
  if (s.includes('note changed') || s.includes('already opened')) return 'Quelqu’un d’autre a touché cette note entre-temps. Rien n’a été écrit : relis la page et recommence.'
  if (s.includes('unknown note')) return 'Cette note est introuvable dans le registre de l’ombre.'
  return "Le registre de l'ombre a refusé le feuillet. Rien n'a été écrit : réessaie plus tard."
}

export async function POST(req: NextRequest) {
  if (!registreRelie()) return refus("Le registre n'est pas encore relié au grimoire.", 503)
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const action = b.action as ActionSecret
  if (!ACTIONS.includes(action)) return refus('Khajiit ne comprend pas ce que tu demandes à l’ombre.')
  let lu: Lu
  try {
    lu = await lireRegistre(Number(b.vu) || 0)
  } catch (e) {
    console.error('[ombre] read failed', e)
    return refus("Le registre de l'ombre reste fermé pour l'heure : rien n'a été écrit.", 502)
  }
  const qui = await identite(req.cookies, lu)
  if (!qui) return refus(SIGNER, 401)
  if (!peut(action, qui, lu.droits)) return refus(INTERDIT, 403)
  if (!lu.ombre.actif) return refus(VIEUX_SCRIPT, 409)
  let e: Ecriture
  try {
    e = preparer(action, b, lu, qui)
  } catch (err) {
    if (err instanceof Refus) return refus(err.message)
    throw err
  }
  let ecrit: Awaited<ReturnType<typeof ecrireRegistre>>
  try {
    ecrit = await ecrireRegistre(e.action, { ...e.charge, qui: quiPourScript(qui, lu.droits) })
  } catch (err) {
    console.error(`[ombre] ${action} refused by the script`, err)
    return refus(refusScript(String(err)), 502)
  }
  const apres = ecrit.lu ?? (await lireRegistre(ecrit.version ?? 0))
  console.log(`[ombre] ${action} by ${qui.nom}: ok (script ${ecrit.ms ?? '?'} ms)`)
  return NextResponse.json({ ok: true, message: e.message, numero: e.numero, donnees: vue(apres, qui) })
}
