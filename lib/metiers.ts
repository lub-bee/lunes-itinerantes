// Crafts of the workshop: the « Artisan » column of the Recettes tab groups the recipes, one side tab
// per craft. Known crafts have an engraved icon (game-icons.net) and a line of introduction; any other
// value written in the sheet still gets its own tab, with a generic icon (and no English name).

import { cle } from './missives'

/** `en`: the English name, shown in italics under the craft's title. */
type Metier = { nom: string; en: string; icone: string; intro: string }

export const METIERS: Record<string, Metier> = {
  alchimiste: { nom: 'Alchimiste', en: 'Alchemist', icone: 'drink-me', intro: 'Fioles, philtres et breuvages : ce qui guérit, ce qui grise, et ce qui se vend le plus cher au plus pressé.' },
  brasseur: { nom: 'Brasseur', en: 'Brewer', icone: 'beer-stein', intro: 'Bières, hydromels et vins : la soif des Nordiques est le plus sûr des marchés.' },
  cuisinier: { nom: 'Cuisinier', en: 'Cook', icone: 'cooking-pot', intro: 'Ragoûts, pains et pâtés : une caravane qui mange bien marche loin.' },
  forgeron: { nom: 'Forgeron', en: 'Blacksmith', icone: 'anvil', intro: 'Lames, armures et clous : le fer se paie au poids, le savoir-faire au double.' },
  couturier: { nom: 'Couturier', en: 'Tailor', icone: 'sewing-needle', intro: 'Robes, capes et sacs : ce que le client porte, il le montre ; ce qu’il montre, il le recommande.' },
  tanneur: { nom: 'Tanneur', en: 'Tanner', icone: 'animal-hide', intro: 'Peaux et cuirs : rien d’une bête ne se perd, tout se revend.' },
  menuisier: { nom: 'Menuisier', en: 'Carpenter', icone: 'hand-saw', intro: 'Arcs, flèches et coffres : le bois parle à qui sait l’écouter.' },
  bucheron: { nom: 'Bûcheron', en: 'Woodcutter', icone: 'wood-axe', intro: 'Bois de chauffe et de charpente : la hache avant la scie.' },
  chasseur: { nom: 'Chasseur', en: 'Hunter', icone: 'bow-arrow', intro: 'Viandes, peaux et trophées : ce que la forêt donne à qui sait attendre.' },
  pecheur: { nom: 'Pêcheur', en: 'Fisher', icone: 'fishing', intro: 'Poissons et coquillages : la rivière paie qui se lève tôt.' },
  mineur: { nom: 'Mineur', en: 'Miner', icone: 'mining', intro: 'Minerais et pierres : ce que la montagne cède à force de pioche.' },
  herboriste: { nom: 'Herboriste', en: 'Herbalist', icone: 'herbs-bundle', intro: 'Racines, fleurs et champignons : la cueillette de l’alchimiste.' },
  joaillier: { nom: 'Joaillier', en: 'Jeweller', icone: 'gem-pendant', intro: 'Anneaux, amulettes et pierres taillées : peu de poids, beaucoup de septims.' },
  enchanteur: { nom: 'Enchanteur', en: 'Enchanter', icone: 'crystal-ball', intro: 'Ce que l’âme d’une pierre ajoute à un objet, le prix le dit.' },
  divers: { nom: 'Divers', en: 'Miscellaneous', icone: 'two-coins', intro: '' },
}

export const ICONE_METIER_INCONNU = 'toolbox'
export const SANS_METIER = { cle: 'sans-metier', nom: 'Sans métier', en: 'No Craft', icone: 'scroll-unfurled', intro: 'Les recettes dont l’artisan n’est pas inscrit. Qu’on leur trouve un atelier.' }

/** Every craft icon, loaded with the book's other icons. */
export const ICONES_METIERS = [...Object.values(METIERS).map((m) => m.icone), ICONE_METIER_INCONNU, SANS_METIER.icone]

/** The craft of an « Artisan » value: a known one (« maître forgeron » counts as forgeron), else itself. */
export function metierDe(artisan: string): { cle: string; nom: string; en: string; icone: string; intro: string } {
  const k = cle(artisan)
  if (!k) return SANS_METIER
  const connu = METIERS[k] ?? Object.entries(METIERS).find(([c]) => k.includes(c))?.[1]
  if (connu) return { cle: cle(connu.nom), ...connu }
  const nom = artisan.trim()
  return { cle: k, nom: nom.charAt(0).toUpperCase() + nom.slice(1), en: '', icone: ICONE_METIER_INCONNU, intro: '' }
}

export const idMetier = (cleMetier: string) => `metier-${cleMetier}`
