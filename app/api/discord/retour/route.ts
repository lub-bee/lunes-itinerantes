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
import { echangerCode, lireMembre, nomAffiche } from '@/lib/discord'
import { AMI, peut, rangsDuSceau, rangsEcrits } from '@/lib/droits'
import { estTesteur } from '@/lib/testeurs'
import { ecrireRegistre, lireRegistreFrais, lireRegistreOuSecours, registreRelie, semerSiBesoin } from '@/lib/registre'

// Discord sends the visitor back here. Access (lot 1b) only for a member of DISCORD_GUILD_ID whose ranks — their
// Discord roles mapped by the sheet's « Rôles » tab — may « Entrer dans le grimoire » (lib/droits.ts: « Membre »
// first, then a checked box on the `entrer` row), or for a tester (TESTEURS_DISCORD_IDS, even when the sheet cannot
// be read). The tabs unreadable (script down, older script): nobody else enters. At each seal, the member's linked
// Membres row gets their ranks in « Rôle » and their display name in « Pseudo Discord » (when they changed).
// Refusals land on the lock page with ?refus=membre|rang|registre|discord|ruse.

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
    const id = m.user.id
    const nom = nomAffiche(m).slice(0, 80)
    // Every role ID of the member (the sheet's « Rôles » tab says which ones are ranks, lib/droits.ts).
    const roles = (m.roles ?? []).filter((r) => /^\d+$/.test(r)).slice(0, 60)
    const testeur = estTesteur(id)

    // The ranks and the `entrer` row, from the sheet: the shared copy first; before refusing (or seeding), a fresh
    // read, as the copy may be 45 s behind a hand edit. A short outage: the last good read of this instance.
    type Lu = Awaited<ReturnType<typeof lireRegistreOuSecours>>
    const admis = (l: Lu | null) => Boolean(l?.droits.lu && peut('entrer', { roles: rangsDuSceau(roles, l.droits).map((r) => r.cle), testeur: false }, l.droits))
    let lu: Lu | null = null
    if (registreRelie()) {
      try {
        lu = await lireRegistreOuSecours()
        if (!admis(lu) || !lu.droits.semees) lu = await lireRegistreFrais().catch(() => lu)
      } catch (e) {
        console.error('[discord] registre unreachable at the seal', e)
      }
    }
    if (lu) lu = await semerSiBesoin(lu).catch((e) => (console.error('[discord] seeding the permissions failed', e), lu))
    const rangs = lu?.droits.lu ? rangsDuSceau(roles, lu.droits) : []
    if (!testeur) {
      if (!lu?.droits.lu) return refuser('registre')
      if (!admis(lu)) return refuser('rang', true)
    }

    // « Rôle » follows the seal's ranks, « Pseudo Discord » the display name (a linked row only; best effort).
    const ligne = lu?.droits.lu && lu.sceauxLus ? lu.membres.find((x) => x.discord === id) : undefined
    const ecrits = rangsEcrits(rangs)
    if (ligne && !rangs.some((r) => r.cle === AMI) && (ligne.role !== ecrits.join(', ') || ligne.pseudo !== nom)) {
      await ecrireRegistre('membre', { membre: { nom: '', discord: id, pseudo: nom, rangs: ecrits } }).catch((e) => console.error('[discord] ranks not written', e))
    }

    const membre: Membre = { id, nom, roles, exp: Date.now() + DUREE_MEMBRE * 1000 }
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
