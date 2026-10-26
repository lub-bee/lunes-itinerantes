// The book's last leaf: the colophon and its credits, in-character but exact. The same facts are in
// README.md (« Credits & licenses »), LICENSE (code, MIT) and NOTICE.md (content, CC BY‑NC 4.0).

import paquet from '../package.json'

/** The edition, from package.json (« 3.3.0 » → « 3.3 »): a release only bumps package.json. */
export const EDITION = paquet.version.split('.').slice(0, 2).join('.')

export const COLOPHON = {
  surtitre: 'Dernier feuillet',
  titre: 'Achevé de copier',
  titreEn: 'Colophon & Credits',
  /** Left page. */
  intro:
    'Ce grimoire fut relié, réglé et copié par Ri’Oblan, copiste autoproclamé de la caravane, afin que nul marchand des Lunes Itinérantes ne cède jamais une pièce en dessous de sa valeur.',
  enluminures: 'L’emblème de la caravane et les médaillons des rangs sont de sa main : Ri’Oblan les a illustrés avec Gépéthé Image 2.',
  signature: 'Ri’Oblan, copiste autoproclamé de la caravane',
  citation: 'Ce qui est copié avec soin ne se perd jamais tout à fait.',
  /** Right page: one short paragraph per heading. */
  rubriques: [
    {
      titre: 'Gravures',
      texte: 'Les petites gravures des onglets, des rubans et des marges viennent de game-icons.net (Lorc, Delapouite et leurs compagnons), sous licence CC BY 3.0.',
    },
    {
      titre: 'Bois, cuir et fer',
      texte:
        'La table, le cuir du livre scellé et le fer de sa clef et de sa serrure sont des photographies de Poly Haven (wood_table, brown_leather, rusty_metal_04), versées au domaine public (CC0). Le papier de chiffe, le parchemin d’impression et l’emblème gaufré ont été faits pour ce grimoire.',
    },
    {
      titre: 'Caractères',
      texte: 'UnifrakturMaguntia, IM Fell English et IM Fell English SC, Mrs Saint Delafield : sous SIL Open Font License, servis par Google Fonts.',
    },
    {
      titre: 'Licences',
      texte: 'Le code du grimoire est sous licence MIT. Les textes, les poèmes, l’emblème et les médaillons sont de Ri’Oblan, sous licence CC BY‑NC 4.0.',
    },
    {
      titre: 'Avertissement',
      texte:
        'The Elder Scrolls, Skyrim, les Khajiits et leur histoire appartiennent à Bethesda Softworks et ZeniMax Media. Ce grimoire est une œuvre de fans, sans lien avec elles, et il ne se vend pas, pas même à un Khajiit.',
    },
  ],
}
