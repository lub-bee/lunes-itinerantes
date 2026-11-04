import { NextResponse, type NextRequest } from 'next/server'
import { lireSession } from '@/lib/sceau'
import { estTesteur } from '@/lib/testeurs'
import { cleRole, GESTES, TOUT_MEMBRE, type Geste, type TablePermissions } from '@/lib/droits'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'

// The secret page's table (lib/droits.ts). GET: the Permissions tab as the grimoire reads it (the defaults
// where a row or a column is missing), the Rôles tab, and the tester's own Discord roles. POST { cases }: the
// whole tab rewritten by the script (v3o 'permissions'). Testers only (TESTEURS_DISCORD_IDS): the script sees
// the shared token alone, so this route is the only guard.

export const dynamic = 'force-dynamic'

const refus = (message: string, status: number) => NextResponse.json({ ok: false, message }, { status })

const SCELLE = 'Ce registre est scellé : seuls les testeurs de la caravane en brisent le cachet.'
const VIEUX_SCRIPT = 'Le scribe du registre ne connaît pas encore les permissions : qu’on colle la v3o du script dans la feuille, puis qu’on réessaie.'

/** The tester's Discord session, or null. */
async function testeur(req: NextRequest) {
  const s = await lireSession(req.cookies)
  return s.valide && s.genre === 'discord' && estTesteur(s.membre.id) ? s.membre : null
}

function vue(t: TablePermissions, moi: { id: string; nom: string; roles?: string[] }) {
  const parId = new Map(t.roles.filter((r) => r.id).map((r) => [r.id, r.nom]))
  return {
    colonnes: t.colonnes,
    cases: t.cases,
    ecrites: t.ecrites,
    inconnues: t.inconnues,
    lu: t.lu,
    onglet: t.onglet,
    roles: t.roles,
    moi: { nom: moi.nom, roles: (moi.roles ?? []).flatMap((id) => (parId.has(id) ? [parId.get(id)!] : [])), sceauAncien: !moi.roles },
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
  // Every column the grimoire knows (Tout membre, the roles, those the sheet names), in the tab's order;
  // every gesture's row (a box the page did not send keeps its current value); rows of unknown keys kept.
  const colonnes = t.colonnes
  const valeurs = (g: Geste) =>
    Object.fromEntries(colonnes.map((c) => [c.nom, typeof brut[g]?.[c.cle] === 'boolean' ? (brut[g][c.cle] as boolean) : t.cases[g][c.cle]]))
  const lignes = [
    ...GESTES.map((g) => ({ groupe: g.groupe, geste: g.libelle, cle: g.cle, valeurs: valeurs(g.cle) })),
    ...t.inconnues.map((l) => ({
      ...l,
      valeurs: Object.fromEntries(colonnes.map((c) => [c.nom, Object.entries(l.valeurs).some(([h, v]) => cleRole(h) === c.cle && v)])),
    })),
  ]
  try {
    const r = await ecrireRegistre('permissions', {
      droits: { roles: colonnes.map((c) => c.nom), rolesDiscord: colonnes.filter((c) => c.cle !== TOUT_MEMBRE).map((c) => c.nom), lignes },
    })
    const apres = r.lu ?? (await lireRegistre(r.version ?? 0))
    console.log(`[permissions] ${lignes.length} rows written by ${moi.nom} (${moi.id})${(r as { rolesCree?: boolean }).rolesCree ? ', Rôles tab created' : ''}`)
    return NextResponse.json({
      ok: true,
      message: (r as { rolesCree?: boolean }).rolesCree
        ? 'Les permissions sont gravées. L’onglet « Rôles » est né dans la feuille : qu’on y inscrive l’ID de chaque rôle Discord.'
        : 'Les permissions sont gravées au registre. Chacun verra ses gestes changer à sa prochaine page.',
      donnees: vue(apres.droits, moi),
      version: apres.version,
    })
  } catch (e) {
    console.error('[permissions] write refused', e)
    return refus(String(e).includes('unknown action') ? VIEUX_SCRIPT : "Le registre a refusé le feuillet. Rien n'a été gravé : réessaie plus tard.", 502)
  }
}
