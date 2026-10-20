import { NextResponse } from 'next/server'
import { COOKIE_SCEAU, DUREE_SCEAU, egaux, jetonAttendu, jetonPour, sceauConfigure } from '@/lib/sceau'

export async function POST(req: Request) {
  if (!sceauConfigure()) {
    return NextResponse.json({ message: "Cette serrure n'a jamais été forgée : le grimoire attend ses instructions." }, { status: 503 })
  }
  const { motDePasse } = (await req.json().catch(() => ({}))) as { motDePasse?: string }
  const jeton = await jetonPour(String(motDePasse ?? '').trim())
  const attendu = await jetonAttendu()

  if (!jeton || !attendu || !egaux(jeton, attendu)) {
    await new Promise((r) => setTimeout(r, 900))
    return NextResponse.json({ message: "La serrure résiste. Ce n'est pas le mot de la caravane, ami." }, { status: 401 })
  }

  const rep = NextResponse.json({ ok: true })
  rep.cookies.set(COOKIE_SCEAU, attendu, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DUREE_SCEAU,
  })
  return rep
}

export async function DELETE() {
  const rep = NextResponse.json({ ok: true })
  rep.cookies.set(COOKIE_SCEAU, '', { path: '/', maxAge: 0 })
  return rep
}
