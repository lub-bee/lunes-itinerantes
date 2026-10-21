import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_ETAT, discordConfigure, signer } from '@/lib/sceau'
import { PORTEES, urlAutorisation, urlRetour } from '@/lib/discord'

// Sends the visitor to Discord. `?silencieux=1` (set by the middleware when a known visitor's
// session has expired) asks with prompt=none, so a member who already agreed comes straight back.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origine = req.nextUrl.origin
  if (!discordConfigure()) return NextResponse.redirect(new URL('/sceau', origine))

  const silencieux = req.nextUrl.searchParams.get('silencieux') === '1'
  const demande = req.nextUrl.searchParams.get('retour') ?? '/'
  const retour = demande.startsWith('/') && !demande.startsWith('//') ? demande : '/'
  const etat = Array.from(crypto.getRandomValues(new Uint8Array(16)), (o) => o.toString(16).padStart(2, '0')).join('')

  const url = new URL(urlAutorisation())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID!)
  url.searchParams.set('scope', PORTEES)
  url.searchParams.set('redirect_uri', urlRetour(origine))
  url.searchParams.set('state', etat)
  if (silencieux) url.searchParams.set('prompt', 'none')

  const rep = NextResponse.redirect(url)
  rep.cookies.set(COOKIE_ETAT, await signer('etat', { etat, silencieux, retour }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return rep
}
