// Minimal RFC 4180 parser (quotes, escaped quotes, CRLF). Blank lines are dropped.
export function parserCsv(texte: string): string[][] {
  const lignes: string[][] = []
  let ligne: string[] = []
  let champ = ''
  let guillemets = false
  const src = texte.replace(/^﻿/, '')

  const finirLigne = () => {
    ligne.push(champ)
    if (ligne.some((c) => c.trim() !== '')) lignes.push(ligne)
    ligne = []
    champ = ''
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (guillemets) {
      if (c !== '"') champ += c
      else if (src[i + 1] === '"') { champ += '"'; i++ }
      else guillemets = false
    } else if (c === '"') guillemets = true
    else if (c === ',') { ligne.push(champ); champ = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      finirLigne()
    } else champ += c
  }
  if (champ !== '' || ligne.length) finirLigne()
  return lignes
}
