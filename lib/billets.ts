// Ri'Oblan's revenge (Ludo's character): one handwritten note each time Dar'Riyo opens the grimoire, closed before
// anything else (components/Billet.tsx). The 19 texts validated by Ludo on 2026-11-13 (_atelier/caravane/billets/billets.md),
// verbatim. SERVER ONLY: imported by app/api/billet/route.ts alone, so the texts never reach the page's bundle; the route
// answers only Dar'Riyo's session (and a tester previewing with `?billet`).

import { cle } from './missives'

export type Billet = { id: number; texte: string }

/** The member the notes are for, compared with cle() (case, accents, apostrophes and spaces ignored). */
export const DESTINATAIRE = "Dar'Riyo"
export const estDestinataire = (nom: string | null | undefined) => Boolean(nom) && cle(nom!) === cle(DESTINATAIRE)

export const BILLETS: readonly Billet[] = [
  { id: 1, texte: "Bien dormi ? J'ai fait pipi sur ton lit. — Un Admirateur SECRET (tu sais, comme celui dont on tait le nom)" },
  { id: 2, texte: "Hier soir, j'ai fait exprès de te servir UNIQUEMENT du bouillon au camp. Il restait des œufs, mais pas pour les Chats qui Bavent." },
  { id: 3, texte: "J'ai remplacé tout ton sucrelune par de la poudre d'os. C'est bon pour les moustaches, il paraît." },
  { id: 4, texte: "Oups, quelqu'un a pris ta botte droite. J'en ai une identique, mais désolé, je n'ai que la gauche. Bonne journée." },
  { id: 5, texte: "J'ai rêvé que le Patriarche avait bavé à Sziska que c'était Oblan qui la courtisait en secret. Mais heureusement, Dar'Riyo n'aurait jamais fait ça." },
  { id: 6, texte: "Ta bourse sonnait un peu creux ce matin. Je l'ai remplie de cailloux pour qu'elle se sente moins seule. — Un Admirateur SECRET" },
  { id: 7, texte: "Les Chats qui Bavent n'ont pas droit au dessert. C'est écrit dans le règlement de la caravane, page 1, en tout petit. Je viens de l'ajouter." },
  { id: 8, texte: "Quelqu'un a cousu tes deux manches ensemble. Ce n'est pas moi. Je n'ai pas de fil. Enfin si, mais pas de ta couleur." },
  { id: 9, texte: "Un petit oiseau m'a dit que tu aimais les secrets. Alors je ne te dirai pas qui a mis de la Cloquerille dans ton oreiller." },
  { id: 10, texte: "Ce matin, ta queue était tressée avec de la lavande. Tu sens délicieusement bon. Les abeilles sont d'accord." },
  { id: 11, texte: "J'ai murmuré un secret à ton oreille pendant ton sommeil. Tu l'as répété à trois personnes en te réveillant. Comme d'habitude." },
  { id: 12, texte: "Ta tasse de thé a un goût de pied ? C'est normal. On manquait d'eau." },
  { id: 13, texte: "Tous les marchands d'Aubétoile savent maintenant que tu ronfles en rimes. Je me demande bien qui a pu leur dire." },
  { id: 14, texte: "J'ai échangé ton vin contre du jus de raisin de Jazbay. Déjà que sobre tu balances tout, alors je n'imagine pas ivre." },
  { id: 15, texte: "Il manque une moustache sur ton côté gauche. Ne t'inquiète pas, je la garde précieusement. Elle est sous verre." },
  { id: 16, texte: "J'ai dit aux gardes de Blancherive que tu étais un célèbre poète. Ils t'attendent pour une lecture publique. Prépare-toi bien." },
  { id: 17, texte: "Ton bouillon d'hier soir avait un ingrédient secret. Je ne le dirai pas. Moi, je sais garder un secret." },
  { id: 18, texte: "Tes bottes sont pleines de sable d'Elsweyr. Je t'ai ramené un peu de chez toi. Avec amour (et un scorpion)." },
  { id: 19, texte: "Quelqu'un t'avait attaché une sardine dans le dos. Tu l'as gardée tout au long de la caravane. Qui a osé ?!" },
]
