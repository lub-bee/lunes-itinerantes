import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_CONNU, COOKIE_SILENCE, discordConfigure, lireSession } from '@/lib/sceau'
import { estTesteur } from '@/lib/testeurs'

const PALI = 'Le sceau de la caravane a pâli : rouvre le grimoire, ami.'

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (pathname === '/sceau' || pathname.startsWith('/api/sceau') || pathname.startsWith('/api/discord/')) return NextResponse.next()

  const session = await lireSession(req.cookies)
  if (session.valide) {
    // The secret page of the permissions (lib/droits.ts): testers only (TESTEURS_DISCORD_IDS); anyone else
    // reads a sealed page, answered 403.
    if (pathname === '/permissions' && !(session.genre === 'discord' && estTesteur(session.membre.id))) {
      const url = req.nextUrl.clone()
      url.pathname = '/permissions/scellee'
      url.search = ''
      return NextResponse.rewrite(url, { status: 403 })
    }
    // A tester viewing « en la qualité de » ranks that may not enter (lot 1c, lib/sceau.ts): everything answers as to
    // a refused seal (the lock page and its refusal; the routes, 401), save the secret page and the way back.
    const q = session.genre === 'discord' ? session.qualite : undefined
    if (q?.refus && !(pathname === '/permissions' || pathname.startsWith('/permissions/') || pathname === '/api/permissions' || pathname === '/api/qualite')) {
      if (pathname.startsWith('/api/')) return NextResponse.json({ ok: false, message: PALI }, { status: 401 })
      const url = req.nextUrl.clone()
      url.pathname = '/sceau'
      url.search = `?refus=${q.refus}`
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // Routes called by the page answer in JSON rather than with a redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, message: PALI }, { status: 401 })
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
