import { NextResponse, type NextRequest } from 'next/server'
import { lireSession } from '@/lib/sceau'
import { poserNom, trouverMembre } from '@/lib/identite'
import { lireRegistre, registreRelie } from '@/lib/registre'

// Signing with one's name: POST { nom } is matched against the Membres tab (never sent to the page);
// a known name is kept, in the sheet's spelling, in a signed cookie; an unknown one is refused and
// nothing is kept. DELETE forgets the name (« Ce n'est pas mon nom »).

export const dynamic = 'force-dynamic'

const refus = (message: string, status: number) => NextResponse.json({ ok: false, message }, { status })

export async function POST(req: NextRequest) {
  const s = await lireSession(req.cookies)
  if (!s.valide) return refus('Le sceau de la caravane a pâli : rouvre le grimoire, ami.', 401)
  if (!registreRelie()) return refus("Le registre des membres n'est pas encore relié au grimoire.", 503)
  const { nom } = (await req.json().catch(() => ({}))) as { nom?: unknown }
  const tape = String(nom ?? '').trim().slice(0, 80)
  if (!tape) return refus('Inscris ton nom, ami : la plume attend.', 400)
  let membres
  try {
    membres = (await lireRegistre()).membres
  } catch (e) {
    console.error('[identite] registre unreachable', e)
    return refus("Le registre des membres reste fermé pour l'heure. Réessaie plus tard.", 502)
  }
  const m = trouverMembre(tape, membres)
  if (!m) {
    await new Promise((r) => setTimeout(r, 600))
    return refus(`Nul membre du nom de « ${tape} » n'est inscrit au registre de la caravane. Rien n'a été consigné.`, 403)
  }
  const rep = NextResponse.json({ ok: true, nom: m.nom })
  await poserNom(rep, m.nom)
  return rep
}

export async function DELETE() {
  const rep = NextResponse.json({ ok: true })
  await poserNom(rep, null)
  return rep
}
