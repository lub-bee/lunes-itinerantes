import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_QUALITE, DUREE_QUALITE, lireSession, signer, type Qualite } from '@/lib/sceau'
import { rangsDesCles, testeurReel } from '@/lib/identite'
import { peut, type TablePermissions } from '@/lib/droits'
import { lireRegistreFrais, lireRegistreOuSecours, registreRelie } from '@/lib/registre'

// « Voir le registre en la qualité de… » (Missions v2, lot 1c): a tester views the whole book as a chosen set of ranks
// of the Rôles tab (« Membre » included), or as no rank at all. Stored only in a signed browser-session cookie tied
// to the tester's Discord user ID (lib/sceau.ts COOKIE_QUALITE), void as soon as that ID is no longer a tester. While
// it holds, the tester flag is suspended and every right is the chosen ranks' (lib/identite.ts); the identity, the
// name that signs, the ranks written in « Rôle » stay the tester's own. Nothing is written to Discord nor the sheet.
// GET: { testeur, qualite } for the banner (no sheet read); `?choix=1` adds the Rôles ranks (one read).
// POST { rangs: [keys] }: takes those ranks; whether they may « Entrer dans le grimoire » is decided now, as a real
// seal's entry is decided at the seal (same reads as /api/discord/retour). DELETE: « Reprendre mon sceau ».

export const dynamic = 'force-dynamic'

const refus = (message: string, status: number) => NextResponse.json({ ok: false, message }, { status })
const SCELLE = 'Seuls les testeurs de la caravane changent de rang à leur guise.'

const options = (maxAge?: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', ...(maxAge === undefined ? {} : { maxAge }) })

const etat = (q: Qualite | undefined) => (q ? { rangs: q.rangs, noms: q.noms, refus: q.refus } : null)

const choix = (t: TablePermissions) => (t.lu ? rangsDesCles(t.roles.map((r) => r.cle), t).map((r) => ({ cle: r.cle, nom: r.nom })) : [])

export async function GET(req: NextRequest) {
  const s = await lireSession(req.cookies)
  if (!s.valide || s.genre !== 'discord' || !testeurReel(s)) return NextResponse.json({ ok: true, testeur: false, qualite: null })
  const rep: { ok: true; testeur: true; qualite: ReturnType<typeof etat>; rangs?: { cle: string; nom: string }[]; lu?: boolean } = {
    ok: true,
    testeur: true,
    qualite: etat(s.qualite),
  }
  if (req.nextUrl.searchParams.get('choix') && registreRelie()) {
    try {
      const lu = await lireRegistreOuSecours()
      rep.rangs = choix(lu.droits)
      rep.lu = lu.droits.lu
    } catch (e) {
      console.error('[qualite] registre unreachable', e)
      rep.rangs = []
      rep.lu = false
    }
  }
  return NextResponse.json(rep)
}

export async function POST(req: NextRequest) {
  const s = await lireSession(req.cookies)
  if (!s.valide || s.genre !== 'discord' || !testeurReel(s)) return refus(SCELLE, 403)
  const b = ((await req.json().catch(() => null)) ?? {}) as { rangs?: unknown }
  if (!Array.isArray(b.rangs)) return refus('Le choix des rangs est illisible : rien n’a changé.', 400)
  const voulus = b.rangs.map(String).slice(0, 40)
  // The ranks as the Rôles tab names them; the same reads as the Discord seal (a fresh one before refusing).
  type Lu = Awaited<ReturnType<typeof lireRegistreOuSecours>>
  let lu: Lu | null = null
  const entre = (l: Lu | null) => Boolean(l?.droits.lu && peut('entrer', { roles: rangsDesCles(voulus, l.droits).map((r) => r.cle), testeur: false }, l.droits))
  if (registreRelie()) {
    try {
      lu = await lireRegistreOuSecours()
      if (!entre(lu)) lu = await lireRegistreFrais().catch(() => lu)
    } catch (e) {
      console.error('[qualite] registre unreachable', e)
    }
  }
  const rangs = lu?.droits.lu ? rangsDesCles(voulus, lu.droits) : []
  const qualite: Qualite = {
    id: s.membre.id,
    rangs: rangs.map((r) => r.cle),
    noms: rangs.map((r) => r.nom),
    refus: !lu?.droits.lu ? 'registre' : entre(lu) ? null : 'rang',
    exp: Date.now() + DUREE_QUALITE * 1000,
  }
  console.log(`[qualite] tester ${s.membre.id} views the book as: ${qualite.noms.join(', ') || 'no rank'}${qualite.refus ? ` (refused: ${qualite.refus})` : ''}`)
  const rep = NextResponse.json({ ok: true, qualite: etat(qualite) })
  // No maxAge: gone when the browser closes (and after 24 h whatever happens, `exp`).
  rep.cookies.set(COOKIE_QUALITE, await signer('qualite', qualite), options())
  return rep
}

export async function DELETE() {
  const rep = NextResponse.json({ ok: true })
  rep.cookies.set(COOKIE_QUALITE, '', options(0))
  return rep
}
