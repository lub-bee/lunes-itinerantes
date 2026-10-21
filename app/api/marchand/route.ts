import { NextResponse, type NextRequest } from 'next/server'
import { lireSession, nomDe } from '@/lib/sceau'
import { identite } from '@/lib/identite'
import { droitsDe } from '@/lib/droits'
import { lireRegistre, registreRelie } from '@/lib/registre'

// Who holds the pen: the order sheet and the missives show this name.
// - `identite`: the member's name validated against the Membres tab (signed cookie, or the Discord
//   nickname found on the list); it signs orders and missives. `droits`: what that member may do.
// - `discord: true` → the order's seller is fixed by the Discord session (/api/commande ignores any other).
// - `vendeur`: the seller's name typed by hand (password sessions not yet recognized), kept in a
//   cookie so it survives cleared browser storage; POST { vendeur } sets it, an empty name forgets it.

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
  const relie = registreRelie()
  let qui = null
  if (relie) {
    try {
      qui = await identite(req.cookies, (await lireRegistre()).membres)
    } catch (e) {
      console.error('[marchand] registre unreachable', e)
    }
  }
  return NextResponse.json({
    ok: true,
    nom: nomDe(s),
    discord: s.genre === 'discord',
    patriarche: s.genre === 'discord' && s.membre.patriarche,
    vendeur,
    relie,
    identite: qui?.nom ?? null,
    droits: qui ? droitsDe(qui.roles) : null,
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
