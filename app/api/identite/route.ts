import { NextResponse, type NextRequest } from 'next/server'
import { lireSession } from '@/lib/sceau'
import { libreDe, poserNom, qualitesDe, rangsDe, rangsReels, REFUS_AMI, REFUS_SCEAU, trouverMembre, trouverParDiscord } from '@/lib/identite'
import { AMI, droitsDe, rangsEcrits } from '@/lib/droits'
import { ecrireRegistre, lireRegistre, registreRelie } from '@/lib/registre'

// Signing with one's name: POST { nom } is matched against the Membres tab (never sent to the page);
// a known name is kept, in the sheet's spelling, in a signed cookie; an unknown one is refused and
// nothing is kept. DELETE forgets the name (« Ce n'est pas mon nom »).
// A Discord seal with a v3n script: the name is linked to the seal's ID (an empty « Discord ID »), or,
// with `creer: true` after the page's confirmation, a row is appended. Lot 1b (v3p): the seal's ranks (its Discord
// roles mapped by the Rôles tab) are written in « Rôle » of that row; a seal holding « Ami des Lunes » never links.
// Lot 1c: a tester viewing « en la qualité de » some ranks is refused or let through as those ranks would be (Ami des
// Lunes), but a link or creation writes their REAL ranks in « Rôle », under their real seal (ID, pseudo).

export const dynamic = 'force-dynamic'

const refus = (message: string, status: number) => NextResponse.json({ ok: false, message }, { status })

export async function POST(req: NextRequest) {
  const s = await lireSession(req.cookies)
  if (!s.valide) return refus('Le sceau de la caravane a pâli : rouvre le grimoire, ami.', 401)
  if (!registreRelie()) return refus("Le registre des membres n'est pas encore relié au grimoire.", 503)
  const { nom, creer } = (await req.json().catch(() => ({}))) as { nom?: unknown; creer?: unknown }
  const tape = String(nom ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!tape) return refus('Inscris ton nom, ami : la plume attend.', 400)
  let lu: Awaited<ReturnType<typeof lireRegistre>>
  const t0 = performance.now()
  try {
    lu = await lireRegistre()
  } catch (e) {
    console.error('[identite] registre unreachable', e)
    return refus("Le registre des membres reste fermé pour l'heure. Réessaie plus tard.", 502)
  }
  const membres = lu.membres
  const signer = async (m: { nom: string }) => {
    const q = qualitesDe(s, lu.droits)
    const rep = NextResponse.json({ ok: true, nom: m.nom, droits: droitsDe(q, lu.droits), testeur: q.testeur })
    await poserNom(rep, m.nom)
    rep.headers.set('Server-Timing', `lire;dur=${(performance.now() - t0).toFixed(0)}`)
    return rep
  }

  // A Discord seal with a script that links seals (v3n): the typed name is linked to the seal's ID — the
  // ID comes from the signed session only, never from the page —, or a row is created after a confirmation.
  if (s.genre === 'discord' && lu.sceauxLus) {
    // « Ami des Lunes » comes from Discord now (the Rôles tab), not from the Membres « Rôle » cell. A tester viewing
    // as one (lot 1c) holds no name (lib/identite.ts), so is answered as an unlinked Ami first.
    const ami = rangsDe(s, lu.droits).some((r) => r.cle === AMI)
    if (ami && s.qualite) return refus(REFUS_AMI, 403)
    // A session already linked by its ID is not offered a typed name.
    const parId = trouverParDiscord(s.membre.id, membres)
    if (parId) return refus(`Ton sceau te nomme déjà : ${parId.nom}.`, 409)
    if (ami) return refus(REFUS_AMI, 403)
    // What « Rôle » is written with: the seal's own ranks, never the ranks a tester views the book as.
    const rangs = rangsReels(s, lu.droits)
    const m = trouverMembre(tape, membres)
    if (m && !libreDe(m, s.membre.id)) return refus(REFUS_SCEAU, 403)
    if (!m && creer !== true)
      return NextResponse.json({ ok: false, aCreer: true, nom: tape, message: `Inscrire « ${tape} » au registre de la caravane ?` }, { status: 200 })
    try {
      const r = await ecrireRegistre('membre', { membre: { nom: m?.nom ?? tape, discord: s.membre.id, pseudo: s.membre.nom, creer: !m, rangs: rangsEcrits(rangs) } })
      const nomEcrit = String((r as { nom?: unknown }).nom ?? m?.nom ?? tape)
      return await signer({ nom: nomEcrit })
    } catch (e) {
      const t = String(e)
      console.error('[identite] link refused', t)
      return refus(
        t.includes('other seal') || t.includes('seal taken')
          ? REFUS_SCEAU
          : t.includes('friend')
            ? REFUS_AMI
            : t.includes('unknown member')
              ? `Nul membre du nom de « ${tape} » n'est inscrit au registre de la caravane. Rien n'a été consigné.`
              : "Le scribe n'a pu lier ton sceau au registre. Rien n'a été consigné : réessaie plus tard.",
        t.includes('other seal') || t.includes('seal taken') || t.includes('friend') ? 403 : 502,
      )
    }
  }

  // A password session (never links nor creates), or a Discord seal with an older script: the name as today.
  const m = trouverMembre(tape, membres)
  if (m && s.genre === 'discord' && !libreDe(m, s.membre.id)) return refus(REFUS_SCEAU, 403)
  if (!m) {
    await new Promise((r) => setTimeout(r, 600))
    return refus(`Nul membre du nom de « ${tape} » n'est inscrit au registre de la caravane. Rien n'a été consigné.`, 403)
  }
  return signer(m)
}

export async function DELETE() {
  const rep = NextResponse.json({ ok: true })
  await poserNom(rep, null)
  return rep
}
