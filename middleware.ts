import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_SCEAU, egaux, jetonAttendu } from '@/lib/sceau'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/sceau' || pathname.startsWith('/api/sceau')) return NextResponse.next()

  const jeton = req.cookies.get(COOKIE_SCEAU)?.value
  const attendu = await jetonAttendu()
  if (jeton && attendu && egaux(jeton, attendu)) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/sceau'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
}
