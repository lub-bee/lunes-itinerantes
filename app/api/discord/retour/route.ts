import { NextResponse, type NextRequest } from 'next/server'
import {
  COOKIE_CONNU,
  COOKIE_ETAT,
  COOKIE_MEMBRE,
  COOKIE_SILENCE,
  DUREE_CONNU,
  DUREE_MEMBRE,
  DUREE_SCEAU,
  discordConfigure,
  signer,
  verifier,
  type Membre,
} from '@/lib/sceau'
import { echangerCode, lireMembre, nomAffiche, rolesAdmis } from '@/lib/discord'

// Discord sends the visitor back here. Access only for a member of DISCORD_GUILD_ID holding one of
// DISCORD_ROLE_IDS. Refusals land on the lock page with ?refus=membre|rang|discord|ruse.

export const dynamic = 'force-dynamic'

const options = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge })

export async function GET(req: NextRequest) {
  const origine = req.nextUrl.origin
  const vers = (chemin: string) => NextResponse.redirect(new URL(chemin, origine))
  const refuser = (motif: string, oublier = false) => {
    const rep = vers(`/sceau?refus=${motif}`)
    rep.cookies.set(COOKIE_ETAT, '', options(0))
    if (oublier) {
      // A visitor who lost the right: no more silent renewal, no stale session.
      rep.cookies.set(COOKIE_MEMBRE, '', options(0))
      rep.cookies.set(COOKIE_CONNU, '', options(0))
    }
    return rep
  }
  if (!discordConfigure()) return vers('/sceau')

  const p = req.nextUrl.searchParams
  const attendu = await verifier<{ etat: string; silencieux: boolean; retour: string }>('etat', req.cookies.get(COOKIE_ETAT)?.value)
  if (!attendu || !p.get('state') || p.get('state') !== attendu.etat) return refuser('ruse')

  if (p.get('error') || !p.get('code')) {
    if (attendu.silencieux) {
      // Discord wants the visitor to agree again: show the lock, don't retry silently for a while.
      const rep = vers('/sceau')
      rep.cookies.set(COOKIE_ETAT, '', options(0))
      rep.cookies.set(COOKIE_SILENCE, '1', options(600))
      return rep
    }
    return refuser('discord')
  }

  try {
    const jeton = await echangerCode(p.get('code')!, origine)
    if (!jeton) return refuser('discord')
    const m = await lireMembre(jeton)
    if (m === 'absent') return refuser('membre', true)
    if (!m || !m.user?.id) return refuser('discord')
    const admis = rolesAdmis()
    if (!m.roles?.some((r) => admis.includes(r))) return refuser('rang', true)

    const patriarcheId = process.env.DISCORD_ROLE_PATRIARCHE?.trim()
    const membre: Membre = {
      id: m.user.id,
      nom: nomAffiche(m).slice(0, 80),
      patriarche: Boolean(patriarcheId && m.roles.includes(patriarcheId)),
      exp: Date.now() + DUREE_MEMBRE * 1000,
    }
    // A silent renewal goes straight back to the page asked for; a fresh entry plays the lock's opening.
    const rep = vers(attendu.silencieux ? attendu.retour : '/sceau?ouvert=1')
    rep.cookies.set(COOKIE_MEMBRE, await signer('membre', membre), options(DUREE_SCEAU))
    rep.cookies.set(COOKIE_CONNU, '1', options(DUREE_CONNU))
    rep.cookies.set(COOKIE_ETAT, '', options(0))
    rep.cookies.set(COOKIE_SILENCE, '', options(0))
    return rep
  } catch (e) {
    console.error('[discord] callback failed', e)
    return refuser('discord')
  }
}
