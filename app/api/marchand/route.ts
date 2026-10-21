import { NextResponse, type NextRequest } from 'next/server'
import { lireSession, nomDe } from '@/lib/sceau'

// Who holds the pen: the order sheet shows this name. `discord: true` → the name is fixed by the
// session (and /api/commande ignores any other); false → shared-password session, name typed by hand.
// The typed name is also kept in a cookie (`vendeur`), so it survives cleared browser storage and
// closing/reopening the grimoire; POST { vendeur } sets it, an empty name forgets it.

export const dynamic = 'force-dynamic'

const COOKIE_VENDEUR = 'caravane_vendeur'
const DUREE_VENDEUR = 60 * 60 * 24 * 400

export async function GET(req: NextRequest) {
  const s = await lireSession(req.cookies)
  if (!s.valide) return NextResponse.json({ ok: false }, { status: 401 })
  let vendeur = ''
  try {
    vendeur = decodeURIComponent(req.cookies.get(COOKIE_VENDEUR)?.value ?? '').slice(0, 80)
  } catch {
    // Malformed cookie: no remembered name.
  }
  return NextResponse.json({
    ok: true,
    nom: nomDe(s),
    discord: s.genre === 'discord',
    patriarche: s.genre === 'discord' && s.membre.patriarche,
    vendeur,
  })
}

export async function POST(req: NextRequest) {
  const s = await lireSession(req.cookies)
  if (!s.valide) return NextResponse.json({ ok: false }, { status: 401 })
  const { vendeur } = (await req.json().catch(() => ({}))) as { vendeur?: unknown }
  const nom = String(vendeur ?? '').trim().slice(0, 80)
  const rep = NextResponse.json({ ok: true })
  rep.cookies.set(COOKIE_VENDEUR, nom ? encodeURIComponent(nom) : '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: nom ? DUREE_VENDEUR : 0,
  })
  return rep
}
