import fs from 'node:fs'
import path from 'node:path'

// Engraved-style icons from game-icons.net (CC BY 3.0), via the Iconify JSON set.
// Only the icons the grimoire actually uses are sent to the browser.
let jeu: Record<string, { body: string }> | null = null

export function icones(noms: string[]): Record<string, string> {
  if (!jeu) {
    const fichier = path.join(process.cwd(), 'node_modules/@iconify-json/game-icons/icons.json')
    jeu = (JSON.parse(fs.readFileSync(fichier, 'utf8')) as { icons: Record<string, { body: string }> }).icons
  }
  const res: Record<string, string> = {}
  for (const nom of new Set(noms)) {
    if (jeu[nom]) res[nom] = jeu[nom].body
    else console.warn(`[icones] unknown game-icons name "${nom}" (browse https://game-icons.net)`)
  }
  return res
}
