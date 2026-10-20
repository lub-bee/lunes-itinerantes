const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

export function prix(v: number | null): string {
  return v === null ? '—' : nombre.format(v)
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
