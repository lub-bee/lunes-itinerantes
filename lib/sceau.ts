// Session "seal": the cookie holds HMAC(secret, password). Changing the password breaks every seal.
export const COOKIE_SCEAU = 'caravane_sceau'
export const DUREE_SCEAU = 60 * 60 * 24 * 30

const encodeur = new TextEncoder()

async function hmac(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey('raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cle, encodeur.encode(message))
  return Array.from(new Uint8Array(signature), (o) => o.toString(16).padStart(2, '0')).join('')
}

export function sceauConfigure(): boolean {
  return Boolean(process.env.CARAVANE_MOT_DE_PASSE && process.env.CARAVANE_SECRET)
}

export async function jetonPour(motDePasse: string): Promise<string | null> {
  const secret = process.env.CARAVANE_SECRET
  if (!secret) return null
  return hmac(secret, `sceau:${motDePasse}`)
}

export async function jetonAttendu(): Promise<string | null> {
  const motDePasse = process.env.CARAVANE_MOT_DE_PASSE
  return motDePasse ? jetonPour(motDePasse) : null
}

export function egaux(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
