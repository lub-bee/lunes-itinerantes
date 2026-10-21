import { NextResponse, type NextRequest } from 'next/server'
import { lireSession, nomDe } from '@/lib/sceau'

// Who holds the pen: the order sheet shows this name. `discord: true` → the name is fixed by the
// session (and /api/commande ignores any other); false → shared-password session, name typed by hand.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const s = await lireSession(req.cookies)
  if (!s.valide) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({
    ok: true,
    nom: nomDe(s),
    discord: s.genre === 'discord',
    patriarche: s.genre === 'discord' && s.membre.patriarche,
  })
}
