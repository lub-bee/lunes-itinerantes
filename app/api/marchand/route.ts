import { NextResponse, type NextRequest } from 'next/server'
import { lireSession, nomDe } from '@/lib/sceau'
import { identite, testeurDe, type Identite } from '@/lib/identite'
import { droitsDe, type Droits } from '@/lib/droits'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'

// Who holds the pen: the order sheet and the missives show this name.
// - `identite`: the member's name validated against the Membres tab (signed cookie, or the Discord
//   nickname found on the list); it signs orders and missives. `droits`: what that member may do (lib/droits.ts:
//   the sheet's Permissions tab and the member's roles); `testeur`: a seal of TESTEURS_DISCORD_IDS (the secret page).
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
  // The member is looked up in the list (the shared copy, usually cached): their roles and the Permissions
  // tab give what they may do (lot 1; before it, a password session's signed name needed no call).
  const relie = registreRelie()
  let qui: Identite | null = null
  let droits: Droits | null = null
  if (relie) {
    try {
      const lu = await lireRegistre()
      qui = await identite(req.cookies, lu)
      if (qui) droits = droitsDe(qui, lu.droits)
      // A linked seal whose Discord display name changed: its « Pseudo Discord » follows (v3n, best effort).
      const ligne = s.genre === 'discord' && lu.sceauxLus ? lu.membres.find((x) => x.discord === s.membre.id) : undefined
      if (s.genre === 'discord' && ligne && ligne.pseudo !== s.membre.nom) await ecrireRegistre('membre', { membre: { nom: '', discord: s.membre.id, pseudo: s.membre.nom } }).catch((e) => console.error('[marchand] pseudo not updated', e))
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
    droits,
    testeur: testeurDe(s),
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
