import { NextResponse, type NextRequest } from 'next/server'
import { lireSession } from '@/lib/sceau'
import { estTesteur } from '@/lib/testeurs'
import { defautDe, GESTES, MEMBRE, rangsDuSceau, type Geste, type TablePermissions } from '@/lib/droits'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'

// The secret page's table (lib/droits.ts): the Grimoire's rows of the shared Permissions tab (never the Table's),
// one column per rank of the Rôles tab. GET: the rows as the grimoire reads them; a box the sheet does not hold yet
// (a missing row, a rank without a column) is shown as proposed: the defaults while the tab holds no Grimoire row,
// else unchecked. POST { cases }: the Grimoire's rows written by the script (v3p 'permissions': each row's cells,
// missing rows appended, missing rank columns appended at the end of row 1; nothing else touched).
// Testers only (TESTEURS_DISCORD_IDS): the script sees the shared token alone, so this route is the only guard.

export const dynamic = 'force-dynamic'

const refus = (message: string, status: number) => NextResponse.json({ ok: false, message }, { status })

const SCELLE = 'Ce registre est scellé : seuls les testeurs de la caravane en brisent le cachet.'
const VIEUX_SCRIPT = 'Le scribe du registre ne connaît pas encore les rangs : qu’on colle la v3p du script (Grimoire.gs) dans la feuille, puis qu’on réessaie.'
const SANS_RANG = 'L’onglet « Rôles » ne nomme aucun rang : qu’on y inscrive d’abord chaque rang et l’ID de son rôle Discord (« Membre » le premier).'

/** The tester's Discord session, or null. */
async function testeur(req: NextRequest) {
  const s = await lireSession(req.cookies)
  return s.valide && s.genre === 'discord' && estTesteur(s.membre.id) ? s.membre : null
}

/** A box as the page starts with it: the sheet's when it holds it, else the proposal. */
function depart(t: TablePermissions) {
  return Object.fromEntries(
    GESTES.map((g) => [
      g.cle,
      Object.fromEntries(t.colonnes.map((c) => [c.cle, t.ecrites[g.cle] && c.dansFeuille ? t.cases[g.cle][c.cle] : !t.semees && defautDe(g, c.cle)])),
    ]),
  ) as Record<Geste, Record<string, boolean>>
}

function vue(t: TablePermissions, moi: { id: string; nom: string; roles?: string[] }) {
  const rangs = rangsDuSceau(moi.roles, t)
  return {
    lu: t.lu,
    semees: t.semees,
    colonnes: t.colonnes,
    cases: depart(t),
    ecrites: t.ecrites,
    inconnues: t.inconnues,
    orphelines: t.orphelines,
    roles: t.roles,
    moi: { nom: moi.nom, rangs: rangs.map((r) => r.nom), membre: rangs.some((r) => r.cle === MEMBRE), sceauAncien: !moi.roles },
  }
}

export type VuePermissions = ReturnType<typeof vue>

export async function GET(req: NextRequest) {
  const moi = await testeur(req)
  if (!moi) return refus(SCELLE, 403)
  if (!registreRelie()) return refus("Le registre n'est pas encore relié au grimoire.", 503)
  try {
    const lu = await lireRegistre(Number(req.nextUrl.searchParams.get('v')) || 0)
    return NextResponse.json({ ok: true, donnees: vue(lu.droits, moi), version: lu.version })
  } catch (e) {
    console.error('[permissions] read failed', e)
    return refus("Le registre reste fermé pour l'heure : le coursier n'a pas pu l'ouvrir.", 502)
  }
}

export async function POST(req: NextRequest) {
  const moi = await testeur(req)
  if (!moi) return refus(SCELLE, 403)
  if (!registreRelie()) return refus("Le registre n'est pas encore relié au grimoire.", 503)
  const b = ((await req.json().catch(() => null)) ?? {}) as { cases?: unknown }
  const brut = (b.cases && typeof b.cases === 'object' ? b.cases : null) as Record<string, Record<string, unknown>> | null
  if (!brut) return refus('Le tableau des permissions est illisible : rien n’a été gravé.', 400)
  let lu: Awaited<ReturnType<typeof lireRegistre>>
  try {
    lu = await lireRegistre()
  } catch (e) {
    console.error('[permissions] read failed', e)
    return refus("Le registre reste fermé pour l'heure : rien n'a été gravé.", 502)
  }
  const t = lu.droits
  if (!t.lu) return refus(VIEUX_SCRIPT, 409)
  if (!t.colonnes.length) return refus(SANS_RANG, 409)
  // Every gesture's row, every rank's cell (a box the page did not send keeps what the page started with).
  const avant = depart(t)
  const lignes = GESTES.map((g) => ({
    cle: g.cle,
    geste: g.libelle,
    valeurs: Object.fromEntries(t.colonnes.map((c) => [c.nom, typeof brut[g.cle]?.[c.cle] === 'boolean' ? (brut[g.cle][c.cle] as boolean) : avant[g.cle][c.cle]])),
  }))
  try {
    const r = (await ecrireRegistre('permissions', { droits: { rangs: t.colonnes.map((c) => c.nom), lignes } })) as Awaited<ReturnType<typeof ecrireRegistre>> & {
      ajoutees?: number
      colonnes?: string[]
    }
    const apres = r.lu ?? (await lireRegistre(r.version ?? 0))
    const colonnes = r.colonnes ?? []
    console.log(`[permissions] Grimoire rows written by ${moi.nom} (${moi.id}): ${r.ajoutees ?? 0} appended, columns added: ${colonnes.join(', ') || 'none'}`)
    return NextResponse.json({
      ok: true,
      message:
        'Les permissions sont gravées au registre. Chacun verra ses gestes changer à sa prochaine page (l’entrée, à son prochain sceau).' +
        (colonnes.length ? ` Colonne${colonnes.length > 1 ? 's' : ''} ajoutée${colonnes.length > 1 ? 's' : ''} au bout de l’onglet : ${colonnes.join(', ')}.` : ''),
      donnees: vue(apres.droits, moi),
      version: apres.version,
    })
  } catch (e) {
    console.error('[permissions] write refused', e)
    return refus(String(e).includes('unknown action') ? VIEUX_SCRIPT : "Le registre a refusé le feuillet. Rien n'a été gravé : réessaie plus tard.", 502)
  }
}
