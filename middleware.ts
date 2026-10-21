import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_CONNU, COOKIE_SILENCE, discordConfigure, lireSession } from '@/lib/sceau'

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (pathname === '/sceau' || pathname.startsWith('/api/sceau') || pathname.startsWith('/api/discord/')) return NextResponse.next()

  const session = await lireSession(req.cookies)
  if (session.valide) return NextResponse.next()

  // Routes called by the page answer in JSON rather than with a redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, message: 'Le sceau de la caravane a pâli : rouvre le grimoire, ami.' }, { status: 401 })
  }

  // Roles are re-checked once the 24 h Discord session expires: a known visitor goes back through
  // Discord with prompt=none, which returns at once if they still belong to the caravan.
  const connu = session.expiree || req.cookies.get(COOKIE_CONNU)?.value === '1'
  if (discordConfigure() && connu && !req.cookies.get(COOKIE_SILENCE)) {
    const url = req.nextUrl.clone()
    url.pathname = '/api/discord/depart'
    url.search = `?silencieux=1&retour=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  const url = req.nextUrl.clone()
  url.pathname = '/sceau'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|textures/).*)'],
}
