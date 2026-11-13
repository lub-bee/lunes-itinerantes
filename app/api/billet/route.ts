import { NextResponse, type NextRequest } from 'next/server'
import { lireSession } from '@/lib/sceau'
import { testeurReel } from '@/lib/identite'
import { BILLETS, DISCORD_DESTINATAIRE } from '@/lib/billets'

// Ri'Oblan's notes (lib/billets.ts): GET answers the 19 notes to Dar'Riyo's Discord seal only, recognised by its user ID
// (the signed session's, never a name: another member named « Dar'Riyo » gets nothing), and to a real tester when the
// page asks with `?billet` (Ludo's preview); anyone else, a password session included, gets a bare 404. The page
// picks which note to show (components/Billet.tsx).

export const dynamic = 'force-dynamic'

const rien = () => NextResponse.json({ ok: false }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest) {
  const s = await lireSession(req.cookies)
  if (!s.valide || s.genre !== 'discord') return rien()
  const pour = s.membre.id === DISCORD_DESTINATAIRE || (testeurReel(s) && req.nextUrl.searchParams.has('billet'))
  if (!pour) return rien()
  return NextResponse.json({ ok: true, billets: BILLETS }, { headers: { 'Cache-Control': 'no-store' } })
}
