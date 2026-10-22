import { NextResponse, type NextRequest } from 'next/server'
import { identite } from '@/lib/identite'
import { lireRegistre, registreRelie } from '@/lib/registre'
import { rangDe, SANS_RANG, type Hierarchie } from '@/lib/rangs'

// The caravan's members grouped by rank (Membres tab, « Rôle » column), for signed readers only.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!registreRelie()) return NextResponse.json({ ok: false, message: "Le registre des membres n'est pas encore relié au grimoire." }, { status: 503 })
  let lu
  try {
    lu = await lireRegistre()
  } catch {
    return NextResponse.json({ ok: false, message: "Le registre des membres reste fermé pour l'heure." }, { status: 502 })
  }
  if (!(await identite(req.cookies, lu.membres))) {
    return NextResponse.json({ ok: false, message: "Signe d'abord l'ex-libris : seuls les membres lisent ce registre." }, { status: 401 })
  }
  const rangs: Hierarchie = {}
  for (const m of lu.membres) {
    const k = rangDe(m.role)?.cle ?? SANS_RANG.cle
    ;(rangs[k] ??= []).push(m.nom)
  }
  for (const k of Object.keys(rangs)) rangs[k].sort((a, b) => a.localeCompare(b, 'fr'))
  return NextResponse.json({ ok: true, rangs })
}
