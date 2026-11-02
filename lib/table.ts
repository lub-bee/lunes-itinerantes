/**
 * La Table des Patriarches: the council's own site, where an affair awaits the Patriarchs' ruling.
 * Its address comes from `TABLE_PATRIARCHES_URL` (server side); unset, empty or not an http(s) URL,
 * the Caravane page shows no link at all.
 */
export function urlTablePatriarches(): string | undefined {
  const brut = process.env.TABLE_PATRIARCHES_URL?.trim()
  if (!brut) return undefined
  try {
    const url = new URL(brut)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}
