// Testers (Missions v2, lot 1): Discord user IDs listed in TESTEURS_DISCORD_IDS (comma-separated digits; the same
// variable as table-patriarches). A tester holds every permission of lib/droits.ts and opens the secret page
// /permissions. They come only from this variable, never from the sheet; a password session is never one.
// No import: read by the middleware (edge) as well as by the routes.

export const testeurs = () =>
  (process.env.TESTEURS_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))

export const estTesteur = (discordId: string | null | undefined) => Boolean(discordId && testeurs().includes(discordId))
