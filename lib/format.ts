const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

export function prix(v: number | null): string {
  return v === null ? '—' : nombre.format(v)
}

const exact = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/**
 * Septims are whole coins: an amount shown is rounded to a whole septim — up for a cost (never sell at a
 * loss), to the nearest otherwise. `exactement`: the title to show when a rounding happened.
 */
export function septims(v: number, haut = false): { texte: string; exactement: string | null } {
  const r = haut ? Math.ceil(v - 1e-9) : Math.round(v)
  return { texte: nombre.format(r), exactement: Math.abs(r - v) > 0.004 ? `${exact.format(v)} septim${Math.abs(v) >= 2 ? 's' : ''} exactement` : null }
}

/** A raw material's price for its lot: « 1 septim les 3 », or « 4 septims » for a lot of one. */
export function prixParLot(v: number | null, lot = 1): string {
  if (v === null) return '—'
  const p = `${exact.format(v)} septim${v >= 2 ? 's' : ''}`
  return lot > 1 ? `${p} les ${lot}` : p
}

export function romain(n: number): string {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let r = ''
  for (const [v, s] of t) while (n >= v) { r += s; n -= v }
  return r
}

// Tamrielic months, as the calendar of Skyrim names them.
const MOIS = ['Primétoile', 'Clairciel', 'Semailles', 'Ondepluie', 'Plantaisons', "Mi-l'An", 'Hautzénith', 'Vifazur', 'Âtrefeu', 'Soufflegivre', 'Sombreciel', 'Soirétoile']

export function dateTamrielique(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', day: 'numeric', month: 'numeric' }).formatToParts(new Date(iso))
  const jour = Number(parts.find((p) => p.type === 'day')?.value)
  const mois = MOIS[Number(parts.find((p) => p.type === 'month')?.value) - 1]
  return `${jour === 1 ? '1er' : jour} ${/^[AÂEIOU]/.test(mois) ? "d'" : 'de '}${mois}`
}
