import { NextResponse } from 'next/server'
import { COOKIE_CONNU, COOKIE_MEMBRE, COOKIE_SCEAU, COOKIE_SILENCE, DUREE_SCEAU, egaux, jetonAttendu, jetonPour, motDePasseAccepte, sceauConfigure } from '@/lib/sceau'

export async function POST(req: Request) {
  if (!sceauConfigure()) {
    return NextResponse.json({ message: "Cette serrure n'a jamais été forgée : le grimoire attend ses instructions." }, { status: 503 })
  }
  if (!motDePasseAccepte()) {
    return NextResponse.json({ message: 'Cette serrure ne connaît plus les mots : présente ton sceau, ami.' }, { status: 403 })
  }
  const { motDePasse } = (await req.json().catch(() => ({}))) as { motDePasse?: string }
  const jeton = await jetonPour(String(motDePasse ?? '').trim())
  const attendu = await jetonAttendu()

  if (!jeton || !attendu || !egaux(jeton, attendu)) {
    await new Promise((r) => setTimeout(r, 900))
    return NextResponse.json({ message: "La serrure résiste. Ce n'est pas la clef des lunes, ami." }, { status: 401 })
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
  // Closing the grimoire forgets every seal, and the "known visitor" mark (no silent way back in).
  for (const nom of [COOKIE_SCEAU, COOKIE_MEMBRE, COOKIE_CONNU, COOKIE_SILENCE]) rep.cookies.set(nom, '', { path: '/', maxAge: 0 })
  return rep
}
