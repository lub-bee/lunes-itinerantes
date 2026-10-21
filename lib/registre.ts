// The caravan's sheet, seen from the server: reads go through the Apps Script (action 'lire'),
// cached briefly and shared by every request; every write clears the cache. COMMANDES_SCRIPT_URL
// and COMMANDES_JETON never leave the server, nor does the members' list.

import { revalidateTag, unstable_cache } from 'next/cache'
import { lireOnglets, type Onglets } from './missives'

export const ETIQUETTE_REGISTRE = 'registre'
/** Seconds a read of the sheet is reused. */
const FRAICHEUR = 45

export const registreRelie = () => Boolean(process.env.COMMANDES_SCRIPT_URL && process.env.COMMANDES_JETON)

export class ErreurScript extends Error {}

/** One call to the Apps Script web app (it answers a POST with a redirect to the result; fetch follows it). */
export async function appelerScript<T = Record<string, unknown>>(corps: Record<string, unknown>): Promise<T & { ok: true }> {
  const url = process.env.COMMANDES_SCRIPT_URL
  const jeton = process.env.COMMANDES_JETON
  if (!url || !jeton) throw new ErreurScript('script not configured')
  const rep = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jeton, ...corps }),
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
  const texte = await rep.text()
  let r: { ok?: boolean; erreur?: string } | null = null
  try {
    r = JSON.parse(texte)
  } catch {
    r = null
  }
  if (!rep.ok || !r?.ok) throw new ErreurScript(`HTTP ${rep.status}: ${r?.erreur ?? texte.slice(0, 200)}`)
  return r as T & { ok: true }
}

const lireBrut = unstable_cache(
  async () => (await appelerScript<{ onglets: Onglets }>({ action: 'lire' })).onglets,
  ['registre-onglets-v1'],
  { revalidate: FRAICHEUR, tags: [ETIQUETTE_REGISTRE] },
)

/**
 * Tabs as the last write on this server instance returned them (a write answers with every tab read
 * afresh): used until they are as old as the cache, so a write needs no second call to the script.
 */
let frais: { onglets: Onglets; le: number } | null = null

/** Every tab of the registre, typed (members included: server use only). */
export async function lireRegistre() {
  if (frais && Date.now() - frais.le < FRAICHEUR * 1000) return lireOnglets(frais.onglets)
  return lireOnglets(await lireBrut())
}

/** A write action of the script; its answer carries the tabs as they now are. */
export async function ecrireRegistre(action: string, charge: Record<string, unknown>) {
  try {
    const r = await appelerScript<{ onglets?: Onglets }>({ action, ...charge })
    frais = r.onglets ? { onglets: r.onglets, le: Date.now() } : null
    return r
  } catch (e) {
    frais = null
    throw e
  } finally {
    // Other server instances read the sheet again.
    revalidateTag(ETIQUETTE_REGISTRE)
  }
}
