import { NextResponse, type NextRequest } from 'next/server'
import { lireSession } from '@/lib/sceau'
import { identite, testeurReel } from '@/lib/identite'
import { lireRegistreOuSecours, registreRelie } from '@/lib/registre'
import { BILLETS, estDestinataire } from '@/lib/billets'

// Ri'Oblan's notes (lib/billets.ts): GET answers the 19 notes to Dar'Riyo's Discord seal only (the member's name
// linked in Membres, compared with cle()), and to a real tester when the page asks with `?billet` (Ludo's preview);
// anyone else, a password session included, gets a bare 404. The page picks which note to show (components/Billet.tsx).

export const dynamic = 'force-dynamic'

const rien = () => NextResponse.json({ ok: false }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest) {
  const s = await lireSession(req.cookies)
  if (!s.valide || s.genre !== 'discord') return rien()
  let pour = testeurReel(s) && req.nextUrl.searchParams.has('billet')
  if (!pour && registreRelie()) {
    try {
      const qui = await identite(req.cookies, await lireRegistreOuSecours())
      pour = estDestinataire(qui?.nom)
    } catch (e) {
      console.error('[billet] registre unreachable', e)
    }
  }
  if (!pour) return rien()
  return NextResponse.json({ ok: true, billets: BILLETS }, { headers: { 'Cache-Control': 'no-store' } })
}
