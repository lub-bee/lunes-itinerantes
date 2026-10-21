// Discord OAuth2 (authorization code, no bot): identify the visitor and read their membership of
// the caravan's guild. DISCORD_API_URL / DISCORD_AUTHORIZE_URL exist only to point at a local mock.

export const PORTEES = 'identify guilds.members.read'

const api = () => (process.env.DISCORD_API_URL || 'https://discord.com/api').replace(/\/$/, '')
export const urlAutorisation = () => process.env.DISCORD_AUTHORIZE_URL || 'https://discord.com/oauth2/authorize'

/** Callback URL, derived from the request origin (works on every Vercel domain and locally). */
export const urlRetour = (origine: string) => `${origine}/api/discord/retour`

export const rolesAdmis = () =>
  (process.env.DISCORD_ROLE_IDS ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)

export type MembreGuilde = {
  nick?: string | null
  roles: string[]
  user?: { id: string; username: string; global_name?: string | null }
}

export async function echangerCode(code: string, origine: string): Promise<string | null> {
  const rep = await fetch(`${api()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: urlRetour(origine),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!rep.ok) {
    console.error(`[discord] token exchange → HTTP ${rep.status}`, (await rep.text()).slice(0, 200))
    return null
  }
  const j = (await rep.json()) as { access_token?: string }
  return j.access_token ?? null
}

/** The visitor's membership of the guild: 'absent' when not in it, null on any other failure. */
export async function lireMembre(jeton: string): Promise<MembreGuilde | 'absent' | null> {
  const rep = await fetch(`${api()}/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${jeton}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (rep.status === 404) return 'absent'
  if (!rep.ok) {
    console.error(`[discord] guild member → HTTP ${rep.status}`, (await rep.text()).slice(0, 200))
    return null
  }
  return (await rep.json()) as MembreGuilde
}

export const nomAffiche = (m: MembreGuilde) => m.nick || m.user?.global_name || m.user?.username || 'Un marchand de la caravane'
