/**
 * import.gs — one-shot imports into the caravan's sheet, run BY HAND from the Apps Script editor.
 *
 * A third file of the sheet's Apps Script project, beside grimoire.gs (v3s, then v3u) and the Table's conseil.gs. It defines no
 * doGet / doPost / onEdit: no web request ever reaches it (grimoire.gs routes every request to the grimoire or to
 * conseil.gs). Adding it, or removing it, needs NO new deployment and changes no answer of the grimoire.
 * Apps Script files share ONE global scope: the only globals of this file are the namespaces `ImportNoms` and
 * `ImportSecrets` and the four editor functions below (none starts with « conseil » or « grimoire »); everything else is
 * local to a namespace.
 *
 *  The renaming of 2026-11-06 — the items' names brought to the official French names of the game, ONCE. The plan
 *  (RENOMMAGE below, from _atelier/caravane/noms/plan-renommage.json: renames, English fixes, rows deleted and added)
 *  is applied to every column that holds an item's name: Catalogues (Article, Article (EN)), Recettes (Produit,
 *  Produit EN, Ingrédient), Ressources (Ressource, Nom EN), Commandes (Article), Pondération (Nom, but not the levels'
 *  rows), Missives (Produit), Mouvements, Missions, Missions permanentes, Intendance and Écritures événements (Objet),
 *  Demandes (Article). Free text (notes, journal, titles, a missive's « Recettes ») is never rewritten: the old names
 *  it cites are listed in the log.
 *    - `importRenommerSimuler`: writes nothing; logs, tab by tab, every cell (row, old → new), the rows deleted and
 *      added, the duplicates (a renamed row meeting another of the same name: settled by the plan's `fusion`, else
 *      blocking), for each fusion BOTH rows in full (the one kept, the one deleted; in Pondération their levels side
 *      by side), the English names that are neither the old nor the new one, the cells holding a formula (left).
 *    - `importRenommer`: under the script lock (the grimoire's writes wait), refused when the script property
 *      RENOMMAGE_FAIT is set (a second run) or a duplicate is not settled; the analysis made again; each tab touched
 *      copied first to a hidden tab « Sauvegarde <tab> 2026-11-06 »; then the cells, the rows deleted (bottom up), the
 *      rows added; RENOMMAGE_FAIT = the date (JST); then the grimoire's own hand-edit handler (`Grimoire.onEdit`: its
 *      cache dropped, its VERSION moved on), so every reader sees the new names at once.
 *  The tabs' headers below are grimoire.gs v3s's mappings (same names, same older headers), copied: grimoire.gs keeps
 *  them private. The bench import-renommage.js checks they are still identical.
 *
 *  Elijah's informations of 2026-11-12 — his old « Information … » rows of Catalogues (Livre = Ombre), written as articles
 *  before the Livre d'ombre v2 had notes, turned ONCE into notes of the hidden tab « Secrets » (grimoire.gs v3u), then
 *  removed from Catalogues (plan validated by Ludo: _atelier/caravane/ombre/conversion-infos-elijah.md). INFOS_ELIJAH below
 *  is the plan's table: each entry finds its row by the Catalogues « Article » (and Livre = Ombre, never by row number);
 *  the note's text is that row's « Note » as it is in the sheet when the script runs, whole, with the item's reference on
 *  its own last line (« [A001] »); A021 and A021 bis make ONE note in the merged format (two contributions, each under
 *  « Elijah ----------- jj/mm/aaaa », grimoire.gs RE_ENTETE_FUSION). 24 notes, 26 rows removed. Each note: Informateur and
 *  Ouvert par « Elijah », Déposé le and Ouvert le the run's date, État « ouverte » (straight to the Archives, not to Le tri).
 *    - `importSecretsSimuler`: writes nothing in Secrets nor Catalogues; logs every planned note (in full) and every row
 *      to remove, and writes them to the hidden tab « Journal de l'ombre » (geste « import (simulation) »; the title and
 *      the fields, never a note's text).
 *    - `importSecrets`: under the script lock, refused when the script property SECRETS_ELIJAH_FAIT is set (a second run),
 *      when a row of the plan is missing (or found twice), or when one of the titles is already a note of Secrets: nothing
 *      is written then. Else Catalogues copied first to a hidden tab « Sauvegarde Catalogues <date> »; the notes appended
 *      to Secrets (created hidden when missing; columns by header name); the rows deleted (bottom up); one journal line
 *      per note (geste « import »); SECRETS_ELIJAH_FAIT = the date (JST); then `Grimoire.onEdit` (cache, VERSION).
 */

/** Run it first: what the renaming of 2026-11-06 would change, logged (nothing is written). */
function importRenommerSimuler() { ImportNoms.renommerSimuler(); }
/** The renaming of 2026-11-06, once (backups first; a second run is refused). */
function importRenommer() { ImportNoms.renommer(); }
/** Run it first: the notes Elijah's informations would become, and the Catalogues rows removed (nothing is written there). */
function importSecretsSimuler() { ImportSecrets.simuler(); }
/** Elijah's informations turned into notes of Secrets, once (Catalogues backed up first; a second run is refused). */
function importSecrets() { ImportSecrets.importer(); }

var ImportNoms = (function () {

/* ───────────────────────── The tabs (grimoire.gs v3s's mappings, copied) ───────────────────────── */

var TABS = {
  catalogue: {
    nom: 'Catalogues',
    colonnes: [
      ['Chapitre', 'chapitre', ['catégorie', 'categorie', 'rubrique', 'section']],
      ['Article', 'fr', ['fr', 'articles', 'détail', 'details', 'désignation', 'nom', 'objet', 'produit']],
      ['Article (EN)', 'en', ['en', 'anglais', 'english', 'nom anglais', 'nom en', 'article anglais', 'détail en', 'désignation en']],
      ['Prix de prod', 'prod', ['prod', 'prix prod', 'prix de production', 'coût', 'coût de prod', 'coût de production']],
      ['Prix mini', 'min', ['min', 'mini', 'minimum', 'prix minimum', 'prix min', 'plancher', 'prix plancher']],
      ['Prix idéal', 'max', ['max', 'maxi', 'idéal', 'prix max', 'prix maxi', 'plafond', 'prix plafond']],
      ['Artisan', 'artisan', ['métier', 'atelier']],
      ['Note', 'note', ['notes', 'remarque', 'commentaire']],
      ['Lot', 'lot', ['par', 'par lot', 'unités par lot', 'taille du lot', 'contenance']],
      ['Livre', 'livre', ['registre', 'book']],
    ],
  },
  recettes: {
    nom: 'Recettes',
    colonnes: [
      ['Produit', 'produit'], ['Produit EN', 'produitEn'], ['Ingrédient', 'ingredient'], ['Quantité', 'quantite'], ['Rendement', 'rendement'],
      ['Artisan', 'artisan'], ['Note', 'note'], ['Variante', 'variante'], ['Usage', 'usage'],
      ['Livre', 'livre', ['registre', 'book']],
    ],
  },
  ressources: {
    nom: 'Ressources',
    colonnes: [
      ['Ressource', 'nom'], ['Nom EN', 'en'], ['Origine', 'origine', ['Catégorie', 'Sorte']],
      ['Prix courant', 'prix', ['Valeur']], ['Bonne affaire', 'bonneAffaire'], ['Note', 'note'],
      ['Lot', 'lot', ['par', 'par lot', 'unités par lot', 'taille du lot', 'contenance']],
    ],
  },
  commandes: {
    nom: 'Commandes',
    colonnes: [
      ['Horodatage', 'horodatage'], ['N° commande', 'numero'], ['Vendeur', 'vendeur'], ['Article', 'article'], ['Quantité', 'quantite'],
      ['Prix unitaire', 'prixUnitaire'], ['Total ligne', 'total'], ['Prix réel vendu', 'prixReel'], ['Statut', 'statut'], ['Total commande', 'totalCommande'],
      ['Unité', 'unite'], ['Hors catalogue', 'horsCatalogue'],
      ['Part versée', 'versee'], ['Versée le', 'verseeLe'], ['Versée par', 'verseePar'], ['Montant versé', 'montantVerse'],
    ],
  },
  ponderation: {
    nom: 'Pondération',
    colonnes: [['Genre', 'genre'], ['Code', 'code'], ['Nom', 'nom'], ['Poids', 'poids'], ['Note', 'note'],
      ['Par mission', 'quantite'], ['Origine', 'origine']],
  },
  missives: {
    nom: 'Missives',
    colonnes: [
      ['N° missive', 'numero'], ['Écrite le', 'horodatage'], ['Titre', 'titre'], ['Commanditaire', 'commanditaire'],
      ['Échéance', 'echeance'], ['Statut', 'statut'], ['Produit', 'produit'], ['Quantité', 'quantite'],
      ['Écrite par', 'ecritePar'], ['Récompense', 'recompense'], ['Part commune (%)', 'partCommune'],
      ['Close le', 'closeLe'], ['Close par', 'closePar'], ['Note de clôture', 'noteCloture'],
      ['Recettes', 'recettes'],
    ],
  },
  mouvements: {
    nom: 'Mouvements',
    colonnes: [
      ['Horodatage', 'horodatage'], ['N° action', 'action'], ['N° missive', 'missive'], ['Membre', 'membre'],
      ['Type', 'type'], ['Objet', 'objet'], ['Quantité', 'quantite'], ['Note', 'note'],
    ],
  },
  demandes: {
    nom: 'Demandes',
    colonnes: [
      ['N° demande', 'numero'], ['Créée le', 'horodatage'], ['Créée par', 'membre'], ['Article', 'article'], ['Quantité', 'quantite'],
      ['Plancher', 'plancher'], ['Points ressources', 'pointsRessources'], ['Points fabrication', 'pointsFabrication'],
      ['Statut', 'statut'], ['Note', 'note'],
      ['Titre', 'titre'], ['N° missive', 'missive'],
    ],
  },
  missions: {
    nom: 'Missions',
    colonnes: [
      ['N° mission', 'numero'], ['N° demande', 'demande'], ['Type', 'type'], ['Objet', 'objet'], ['Quantité', 'quantite'],
      ['Poids', 'poids'], ['Effort', 'effort'], ['Points', 'points'], ['Statut', 'statut'], ['Pris par', 'prisPar'],
      ['Pris le', 'prisLe'], ['Accomplie le', 'accomplieLe'], ['Note', 'note'], ['Journal', 'journal'],
      ['Remise le', 'remiseLe'], ['Confirmée par', 'confirmePar'],
    ],
  },
  permanentes: {
    nom: 'Missions permanentes',
    colonnes: [
      ['N° permanente', 'id'], ['Type', 'type'], ['Objet', 'objet'], ['Quantité', 'quantite'], ['Points', 'points'], ['Poids', 'poids'],
      ['Plafond par semaine', 'plafond'], ['Statut', 'statut'], ['Créée par', 'par'], ['Créée le', 'date'], ['Note', 'note'],
    ],
  },
  intendance: {
    nom: 'Intendance',
    colonnes: [
      ['N°', 'id'], ['Date', 'date'], ['Genre', 'genre'], ['Statut', 'statut'], ['Membre', 'membre'], ['Objet', 'objet'],
      ['Quantité', 'quantite'], ['N° mission', 'mission'], ['N° demande', 'demande'], ['N° missive', 'missive'],
      ['N° commande', 'commande'], ['N° lié', 'lien'], ['Coffre', 'coffre'], ['Consignée par', 'par'], ['Consignée le', 'le'],
      ['Points', 'points'], ['Note', 'note'],
    ],
  },
  ecrituresEvenement: {
    nom: 'Écritures événements',
    colonnes: [
      ['N° écriture', 'id'], ['N° événement', 'evenement'], ['Date', 'date'], ['Genre', 'genre'], ['Libellé', 'libelle'], ['Montant', 'montant'],
      ['Membre', 'membre'], ['Objet', 'objet'], ['Quantité', 'quantite'], ['Statut', 'statut'], ['Payé par', 'payePar'], ['Payé le', 'payeLe'],
      ['Inscrite par', 'par'],
    ],
  },
  factures: {
    nom: 'Factures',
    colonnes: [
      ['N° facture', 'id'], ['Date', 'date'], ['Libellé', 'libelle'], ['Montant', 'montant'], ['Catégorie', 'categorie'],
      ['N° événement', 'evenement'], ['Note', 'note'], ['Inscrite par', 'par'],
    ],
  },
  evenements: {
    nom: 'Événements',
    colonnes: [['N° événement', 'id'], ['Nom', 'nom'], ['Date', 'date'], ['Note', 'note'], ['Compensation', 'compensation'], ['Statut', 'statut']],
  },
  points: {
    nom: 'Points',
    colonnes: [['Date', 'horodatage'], ['Membre', 'membre'], ['Points', 'points'], ['Raison', 'raison'], ['N° mission', 'mission'], ['Confirmée par', 'confirmePar']],
  },
};

/** Comparable header (grimoire.gs's): lower case, no accents, letters and digits only. */
function cleEntete(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '');
}

/** 0-based column of each field in a header row (-1 when absent); older header names count too (grimoire.gs's). */
function indexColonnes(entete, def) {
  var noms = entete.map(cleEntete);
  var index = {};
  def.colonnes.forEach(function (col) {
    var i = noms.indexOf(cleEntete(col[0]));
    (col[2] || []).forEach(function (ancien) { if (i < 0) i = noms.indexOf(cleEntete(ancien)); });
    index[col[1]] = i;
  });
  return index;
}

/* ───────────────────────── The renaming of 2026-11-06 ───────────────────────── */

/**
 * The plan (decisions of 2026-11-06, plan-renommage.json, entry for entry).
 *   renames: one item, one name: every cell of a name column holding `fr_old` (compared like headers: case, accents,
 *            punctuation ignored) becomes `fr_new`, in every tab. `fusion`: `fr_old` was a duplicate of `fr_new`: where
 *            both have their own row (Catalogues, Ressources, Pondération, a recipe), the row of `fr_new` wins.
 *   en:      the English name of the row whose French name (once renamed) is `fr`, in the tabs listed, when it is
 *            still `en_old` (exactly; '' = an empty cell); any other value is left and reported.
 *   deletes: the rows of `name` (its main name column) deleted from `tab`.
 *   adds:    rows appended to `tab` (fields of its TABS mapping), unless the name is already there.
 */
var RENOMMAGE = {
  date: "2026-11-06",
  renames: [
    {"fr_old":"Hydromel","fr_new":"Hydromel nordique"},
    {"fr_old":"Potion de santé mineure","fr_new":"Potion de soin léger"},
    {"fr_old":"Potion de soin profuse","fr_new":"Potion de soin profus"},
    {"fr_old":"Potion de berserker","fr_new":"Potion du berserker"},
    {"fr_old":"Potion de guerrier","fr_new":"Potion du guerrier"},
    {"fr_old":"Épée en fer","fr_new":"Épée de fer"},
    {"fr_old":"Dague en fer","fr_new":"Dague de fer"},
    {"fr_old":"Hache une main en fer","fr_new":"Hache de fer"},
    {"fr_old":"Masse une main en fer","fr_new":"Masse de fer"},
    {"fr_old":"Marteau de guerre en fer","fr_new":"Marteau de fer"},
    {"fr_old":"Épée deux mains en fer","fr_new":"Espadon de fer"},
    {"fr_old":"Épée en acier","fr_new":"Épée d'acier"},
    {"fr_old":"Dague en acier","fr_new":"Dague d'acier"},
    {"fr_old":"Flèches en fer (×80)","fr_new":"Flèches de fer (×80)"},
    {"fr_old":"Flèches en acier (×80)","fr_new":"Flèches d'acier (×80)"},
    {"fr_old":"Armure de fer cerclée","fr_new":"Armure à bandes"},
    {"fr_old":"Beaux vêtements","fr_new":"Vêtements raffinés"},
    {"fr_old":"Tunique ceinturée","fr_new":"Tunique avec ceinture"},
    {"fr_old":"Casque en cuir","fr_new":"Casque de cuir"},
    {"fr_old":"Capuche de mage","fr_new":"Capuchon de mage"},
    {"fr_old":"Bottes en cuir","fr_new":"Bottes de cuir"},
    {"fr_old":"Bottes en fer (apparence)","fr_new":"Bottes de fer (apparence)"},
    {"fr_old":"Gantelets en fer (apparence)","fr_new":"Gantelets de fer (apparence)"},
    {"fr_old":"Sels du néant","fr_new":"Sels du Néant"},
    {"fr_old":"Bande de cuir","fr_new":"Bandes de cuir"},
    {"fr_old":"Myrrhe givrée","fr_new":"Hivernelle","fusion":true},
    {"fr_old":"Raisins Jazbay","fr_new":"Raisin jazbay"},
    {"fr_old":"Remède contre le poison","fr_new":"Potion de résistance au poison"},
    {"fr_old":"Cosse d'herbe","fr_new":"Cosse"},
    {"fr_old":"Lys jaune","fr_new":"Lys des cimes jaune"},
    {"fr_old":"Philtre de magie supplémentaire","fr_new":"Breuvage de magie accrue","fusion":true},
    {"fr_old":"Dents de spectre de glace","fr_new":"Dent de spectre de glace"},
    {"fr_old":"Philtre de puissance durable","fr_new":"Breuvage de puissance durable","fusion":true},
    {"fr_old":"Poudre d'os","fr_new":"Farine d'os"},
    {"fr_old":"Philtre de force","fr_new":"Breuvage de force"},
    {"fr_old":"Branche de chardon","fr_new":"Tige de chardon"},
    {"fr_old":"Chapeau blanc","fr_new":"Chapeau-blanc"},
    {"fr_old":"Champignon luminescent","fr_new":"Champignon luisant"},
    {"fr_old":"Rayon de miel","fr_new":"Rayons de miel"},
    {"fr_old":"Potion de magie supplémentaire","fr_new":"Potion de magie accrue","fusion":true},
    {"fr_old":"Coton de toundra","fr_new":"Coton sauvage"},
    {"fr_old":"Grappe rampante","fr_new":"Plantes grimpantes"},
    {"fr_old":"Potion de magie mineure","fr_new":"Potion de magie légère","fusion":true},
    {"fr_old":"Tapinelle mora","fr_new":"Mora Tapinella"},
    {"fr_old":"Griveboise","fr_new":"Givreboises"},
    {"fr_old":"Philtre de vitalité","fr_new":"Breuvage de récupération","fusion":true},
    {"fr_old":"Venin de givre","fr_new":"Venin de givrépeire"},
    {"fr_old":"Baies de genièvre","fr_new":"Genièvres","fusion":true},
    {"fr_old":"Lys violet","fr_new":"Lys des cimes violet"},
    {"fr_old":"Peau de ragnard carbonisée","fr_new":"Peau de ragnard carbonisé"},
    {"fr_old":"Chitine de crabe de vase","fr_new":"Chitine de vasard"},
    {"fr_old":"Philtre de vigueur améliorée","fr_new":"Breuvage de vigueur améliorée","fusion":true},
    {"fr_old":"Mousse pendante","fr_new":"Mousse barbue"},
    {"fr_old":"Sel","fr_new":"Tas de sel"},
    {"fr_old":"Pied de lutin","fr_new":"Pied-de-lutin"},
    {"fr_old":"Lys Bleu","fr_new":"Lys des cimes bleu"},
    {"fr_old":"Morelle noire","fr_new":"Obscurcine","fusion":true},
    {"fr_old":"Powdered Mammoth tusk","fr_new":"Défense de mammouth en poudre"},
    {"fr_old":"Mycènes des marais","fr_new":"Mycène des marais"},
    {"fr_old":"Philtre de régénération","fr_new":"Breuvage de régénération"},
    {"fr_old":"Potion de guérison des maladies","fr_new":"Potion médicinale","fusion":true},
    {"fr_old":"Croc de smilodon","fr_new":"Dent de smilodon"},
    {"fr_old":"Lys rouge","fr_new":"Lys des cimes rouge"},
    {"fr_old":"Potion de vitalité","fr_new":"Potion de récupération","fusion":true},
    {"fr_old":"Pholiotes à écailles","fr_new":"Pholiote à écailles"},
    {"fr_old":"Plumes de harfreuse","fr_new":"Plumes d'harfreuse"},
    {"fr_old":"Campanule mortelle","fr_new":"Grelot-de-la-mort"},
    {"fr_old":"Grands bois","fr_new":"Grande ramure"},
    {"fr_old":"Lingot de corindon","fr_new":"Corindon raffiné"},
    {"fr_old":"Minerai de corindon","fr_new":"Corindon brut"},
    {"fr_old":"Morceau de Lin","fr_new":"Morceau de lin"},
    {"fr_old":"Peau de Smilodon des neiges","fr_new":"Peau de smilodon des neiges"},
    {"fr_old":"Peau de Smilodon","fr_new":"Peau de smilodon"},
    {"fr_old":"Oreille d'elfe","fr_new":"Oreille d'Elfe"},
    {"fr_old":"venaison","fr_new":"Venaison"},
    {"fr_old":"boeuf cru","fr_new":"Boeuf cru"},
    {"fr_old":"Oeuf de Fauvette","fr_new":"Oeuf de fauvette"},
    {"fr_old":"Minerai de pierre-de-lune","fr_new":"Pierre de lune brute"},
    {"fr_old":"Lingot de pierre-de-lune","fr_new":"Pierre de lune raffinée"},
    {"fr_old":"Lingot dwemer","fr_new":"Lingot de métal dwemer"},
    {"fr_old":"Épée commune","fr_new":"Épée de fer","fusion":true},
    {"fr_old":"Dague commune","fr_new":"Dague de fer","fusion":true},
    {"fr_old":"Hache de guerre commune (une main)","fr_new":"Hache de fer","fusion":true},
    {"fr_old":"Hache de bataille commune (deux mains)","fr_new":"Hache de bataille de fer"},
    {"fr_old":"Arc commun","fr_new":"Arc de chasse","fusion":true},
    {"fr_old":"Cape de cuir","fr_new":"Cape simple"},
    {"fr_old":"Oiled Mail and Jacket","fr_new":"Maille huilée et pourpoint"},
    {"fr_old":"Bottes en acier","fr_new":"Jambières d'acier"},
    {"fr_old":"Charbon","fr_new":"Charbon de bois"},
    {"fr_old":"Gants en cuir","fr_new":"Gantelets de cuir"},
    {"fr_old":"Peau de loup des neiges","fr_new":"Peau de loup des glaces"},
    {"fr_old":"horqueur cru","fr_new":"Viande de horqueur"},
    {"fr_old":"lapin cru","fr_new":"Patte de lapin crue"},
    {"fr_old":"Gemme commune","fr_new":"Gemme spirituelle ordinaire"},
  ],
  en: [
    {"fr":"Hydromel nordique","en_old":"Mead","en_new":"Nord Mead","tabs":["Catalogues"]},
    {"fr":"Potion médicinale","en_old":"Medicinal Potion","en_new":"Potion of Cure Disease","tabs":["Catalogues"]},
    {"fr":"Potion de magie légère","en_old":"Potion of Lesser Magicka","en_new":"Potion of Minor Magicka","tabs":["Catalogues"]},
    {"fr":"Potion de récupération","en_old":"Potion of Recovery","en_new":"Potion of Vigor","tabs":["Catalogues"]},
    {"fr":"Breuvage de magie accrue","en_old":"Draught of Vigorous Magicka","en_new":"Draught of Extra Magicka","tabs":["Catalogues"]},
    {"fr":"Breuvage de récupération","en_old":"Draught of Recovery","en_new":"Draught of Vigor","tabs":["Catalogues"]},
    {"fr":"Skooma","en_old":"","en_new":"Skooma","tabs":["Catalogues","Recettes"]},
    {"fr":"Bandes de cuir","en_old":"Leather strips","en_new":"Leather Strips","tabs":["Recettes"]},
    {"fr":"Potion de soin","en_old":"","en_new":"Potion of Healing","tabs":["Recettes"]},
    {"fr":"Pioche (TEST)","en_old":"","en_new":"Pickaxe (TEST)","tabs":["Recettes"]},
    {"fr":"Ragoût de venaison","en_old":"Venison stew","en_new":"Venison Stew","tabs":["Recettes"]},
    {"fr":"Ragoût de horqueur","en_old":"horker stew","en_new":"Horker Stew","tabs":["Recettes"]},
    {"fr":"Ragoût de boeuf","en_old":"beef stew","en_new":"Beef Stew","tabs":["Recettes"]},
    {"fr":"Sels du Néant","en_old":"Void salts","en_new":"Void Salts","tabs":["Recettes"]},
    {"fr":"Potion de respiration aquatique","en_old":"Potion of waterbreathing","en_new":"Potion of Waterbreathing","tabs":["Recettes"]},
    {"fr":"Lavande","en_old":"Lavanda","en_new":"Lavender","tabs":["Ressources"]},
    {"fr":"Lys des cimes bleu","en_old":"blue mountain flower","en_new":"Blue Mountain Flower","tabs":["Ressources"]},
    {"fr":"Tas de sel","en_old":"Salt pile","en_new":"Salt Pile","tabs":["Ressources"]},
    {"fr":"Sucrelune","en_old":"Moonsugar","en_new":"Moon Sugar","tabs":["Ressources"]},
    {"fr":"Corindon brut","en_old":"","en_new":"Corundum Ore","tabs":["Ressources"]},
    {"fr":"Pierre de lune brute","en_old":"","en_new":"Moonstone Ore","tabs":["Ressources"]},
    {"fr":"Pierre de lune raffinée","en_old":"","en_new":"Refined Moonstone","tabs":["Ressources"]},
    {"fr":"Lingot de métal dwemer","en_old":"","en_new":"Dwarven Metal Ingot","tabs":["Ressources"]},
    {"fr":"Genièvres","en_old":"","en_new":"Juniper Berries","tabs":["Ressources"]},
    {"fr":"Venaison","en_old":"","en_new":"Venison","tabs":["Ressources"]},
    {"fr":"Boeuf cru","en_old":"","en_new":"Raw Beef","tabs":["Ressources"]},
    {"fr":"Huile dwemer","en_old":"","en_new":"Dwarven Oil","tabs":["Ressources"]},
    {"fr":"Coeur de Daedra","en_old":"","en_new":"Daedra Heart","tabs":["Ressources"]},
    {"fr":"Minerai de fer","en_old":"","en_new":"Iron Ore","tabs":["Ressources"]},
    {"fr":"Minerai d'or","en_old":"","en_new":"Gold Ore","tabs":["Ressources"]},
    {"fr":"Minerai d'argent","en_old":"","en_new":"Silver Ore","tabs":["Ressources"]},
    {"fr":"Minerai de vif-argent","en_old":"","en_new":"Quicksilver Ore","tabs":["Ressources"]},
    {"fr":"Petit bois","en_old":"","en_new":"Firewood","tabs":["Ressources"]},
    {"fr":"Morceau de lin","en_old":"","en_new":"Linen Wrap","tabs":["Ressources"]},
    {"fr":"Œil de smilodon","en_old":"","en_new":"Eye of Sabre Cat","tabs":["Ressources"]},
    {"fr":"Minerai d'orichalque","en_old":"","en_new":"Orichalcum Ore","tabs":["Ressources"]},
    {"fr":"Ferraille dwemer","en_old":"","en_new":"Dwemer Scrap Metal","tabs":["Ressources"]},
    {"fr":"Peau de loup","en_old":"Wolf pelt","en_new":"Wolf Pelt","tabs":["Ressources"]},
    {"fr":"Hache de bataille de fer","en_old":"Common Battle Axe (two-handed)","en_new":"Iron Battleaxe","tabs":["Catalogues","Recettes"]},
    {"fr":"Cape simple","en_old":"Leather Cape","en_new":"Simple Cloak","tabs":["Catalogues","Recettes"]},
    {"fr":"Jambières d'acier","en_old":"Steel Boots","en_new":"Steel Shin Boots","tabs":["Catalogues","Recettes"]},
    {"fr":"Charbon de bois","en_old":"","en_new":"Charcoal","tabs":["Ressources"]},
    {"fr":"Gantelets de cuir","en_old":"Leather Gloves","en_new":"Leather Bracers","tabs":["Catalogues","Recettes"]},
    {"fr":"Peau de loup des glaces","en_old":"","en_new":"Ice Wolf Pelt","tabs":["Ressources"]},
    {"fr":"Potion de magie accrue","en_old":"Potion of Vigorous Magicka","en_new":"Potion of Extra Magicka","tabs":["Catalogues"]},
    {"fr":"Viande de horqueur","en_old":"","en_new":"Horker Meat","tabs":["Ressources"]},
    {"fr":"Patte de lapin crue","en_old":"","en_new":"Raw Rabbit Leg","tabs":["Ressources"]},
    {"fr":"Cape de Smilodon des neiges","en_old":"Fur Cloak (Snowy Saber)","en_new":"Fur Cloak (Snow Sabre Cat)","tabs":["Recettes"]},
    {"fr":"Cape d'ours des neiges","en_old":"Fur Cloak (snowy bear)","en_new":"Fur Cloak (Snow Bear)","tabs":["Recettes"]},
    {"fr":"Cape de Smilodon","en_old":"Fur Cloak (sabre)","en_new":"Fur Cloak (Sabre Cat)","tabs":["Recettes"]},
    {"fr":"Cape d'ours","en_old":"Fur Cloak","en_new":"Fur Cloak (Bear)","tabs":["Recettes"]},
    {"fr":"Potion de résistance au poison","en_old":"Cure Poison","en_new":"Potion of Resist Poison","tabs":["Recettes"]},
    {"fr":"Gemme spirituelle ordinaire","en_old":"","en_new":"Common Soul Gem","tabs":["Ressources"]},
  ],
  deletes: [
    {"tab":"Catalogues","name":"Potion magique"},
    {"tab":"Catalogues","name":"Tonique pied-de-plume"},
    {"tab":"Catalogues","name":"Matières premières"},
    {"tab":"Catalogues","name":"Épée commune"},
    {"tab":"Recettes","name":"Épée commune"},
    {"tab":"Catalogues","name":"Dague commune"},
    {"tab":"Recettes","name":"Dague commune"},
    {"tab":"Catalogues","name":"Hache de guerre commune (une main)"},
    {"tab":"Recettes","name":"Hache de guerre commune (une main)"},
    {"tab":"Catalogues","name":"Arc commun"},
    {"tab":"Recettes","name":"Arc commun"},
    {"tab":"Ressources","name":"Baies de genièvre"},
  ],
  adds: [
    {"tab":"Ressources","values":{"nom":"Peau d'ours","en":"Bear Pelt","origine":"chasse"}},
    {"tab":"Ressources","values":{"nom":"Peau d'ours des neiges","en":"Snow Bear Pelt","origine":"chasse"}},
    {"tab":"Ressources","values":{"nom":"Peau de smilodon","en":"Sabre Cat Pelt","origine":"chasse"}},
    {"tab":"Ressources","values":{"nom":"Peau de smilodon des neiges","en":"Sabre Cat Snow Pelt","origine":"chasse"}},
    {"tab":"Catalogues","values":{"chapitre":"potions","fr":"Potion de magie concentrée","en":"Potion of Vigorous Magicka","artisan":"alchimiste","note":"prix à fixer"}},
  ],
};

/** The script property set by the real run (its date): a second run is refused. */
var RENOMMAGE_FAIT = 'RENOMMAGE_FAIT';

/**
 * The columns holding an item's name, per tab. `fr`: French name fields (renamed); `en`: [French field, English field]
 * (English fixes); `principal`: the field that names the row (deletes, adds, duplicates); `unique`: duplicates
 * checked ('nom': one row per name; 'recette': one recipe per product and variant, one row per ingredient in it;
 * 'genre': one row per genre and name); `si`: a row is renamed only when it passes (Pondération: not the levels);
 * `libre`: free-text fields, never rewritten, only searched for old names (listed in the log).
 */
function ciblesRenommage() {
  return [
    { def: TABS.catalogue, fr: ['fr'], en: [['fr', 'en']], principal: 'fr', unique: 'nom', libre: ['note'] },
    { def: TABS.recettes, fr: ['produit', 'ingredient'], en: [['produit', 'produitEn']], principal: 'produit', unique: 'recette', libre: ['note'] },
    { def: TABS.ressources, fr: ['nom'], en: [['nom', 'en']], principal: 'nom', unique: 'nom', libre: ['note'] },
    { def: TABS.commandes, fr: ['article'], libre: [] },
    { def: TABS.ponderation, fr: ['nom'], principal: 'nom', unique: 'genre', libre: ['note'],
      si: function (ligne, idx) { return idx.genre >= 0 && cleEntete(ligne[idx.genre]).indexOf('class') !== 0; } },
    { def: TABS.missives, fr: ['produit'], libre: ['titre', 'recettes', 'noteCloture'] },
    { def: TABS.mouvements, fr: ['objet'], libre: ['note'] },
    { def: TABS.demandes, fr: ['article'], libre: ['titre', 'note'] },
    { def: TABS.missions, fr: ['objet'], libre: ['note', 'journal'] },
    { def: TABS.permanentes, fr: ['objet'], libre: ['note'] },
    { def: TABS.intendance, fr: ['objet'], libre: ['note'] },
    { def: TABS.ecrituresEvenement, fr: ['objet'], libre: ['libelle'] },
    { def: TABS.factures, fr: [], libre: ['libelle', 'note'] },
    { def: TABS.evenements, fr: [], libre: ['nom', 'note'] },
    { def: TABS.points, fr: [], libre: ['raison'] },
  ];
}

/** The plan as lookups: renames by old name, English fixes by new name, deletes and adds by tab. */
function indexRenommage() {
  var parAncien = {};
  RENOMMAGE.renames.forEach(function (r) { parAncien[cleEntete(r.fr_old)] = r; });
  var en = {};
  RENOMMAGE.en.forEach(function (e) { (en[cleEntete(e.fr)] = en[cleEntete(e.fr)] || []).push(e); });
  var suppr = {};
  RENOMMAGE.deletes.forEach(function (d) { (suppr[d.tab] = suppr[d.tab] || {})[cleEntete(d.name)] = d.name; });
  var ajouts = {};
  RENOMMAGE.adds.forEach(function (a) { (ajouts[a.tab] = ajouts[a.tab] || []).push(a.values); });
  // The old names searched in free text: whole words, accents and case ignored; too short a name (« Sel ») is skipped.
  var anciens = [];
  RENOMMAGE.renames.forEach(function (r) { if (cleEntete(r.fr_old) !== cleEntete(r.fr_new)) anciens.push(r.fr_old); });
  RENOMMAGE.deletes.forEach(function (d) { if (anciens.indexOf(d.name) < 0) anciens.push(d.name); });
  var motifs = anciens.filter(function (n) { return cleEntete(n).length > 3; }).map(function (n) {
    return { nom: n, re: new RegExp('(^|[^a-z0-9])' + texteSimple(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])') };
  });
  return { parAncien: parAncien, en: en, suppr: suppr, ajouts: ajouts, motifs: motifs };
}

/** Lower case, no accents, single spaces (the free text searched for old names). */
function texteSimple(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/\s+/g, ' ');
}

/** A French name as the plan renames it (itself when the plan does not name it). */
function nomRenomme(I, v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  var r = s ? I.parAncien[cleEntete(s)] : null;
  return r ? r.fr_new : s;
}

/**
 * Everything the renaming would do, tab by tab, from the sheet as it is now; writes nothing. Per tab: `cellules`
 * ({ ligne, champ, col, ancien, nouveau }; `ligne` 1-based in the sheet), `suppressions` ({ ligne, nom, raison }),
 * `fusions` ({ nom, gardees, supprimees }: the rows of a fusion, in full), `ajouts` (rows as arrays), `formules`
 * (cells left: they hold a formula), `ecarts` (English names that are neither the old nor the new one), `libres`
 * (free text citing an old name), `bloquants` (duplicates the plan does not settle).
 */
function analyserRenommage() {
  var I = indexRenommage();
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var res = { onglets: [], bloquants: 0 };
  ciblesRenommage().forEach(function (c) {
    var r = { nom: c.def.nom, def: c.def, present: false, cellules: [], suppressions: [], fusions: [], ajouts: [], formules: [], ecarts: [], libres: [], bloquants: [], absents: [] };
    res.onglets.push(r);
    var feuille = classeur.getSheetByName(c.def.nom);
    if (!feuille || feuille.getLastRow() < 1) return;
    r.present = true;
    var plage = feuille.getDataRange();
    var tout = plage.getValues();
    var formules = plage.getFormulas();
    var idx = indexColonnes(tout[0], c.def);
    r.largeur = tout[0].length;
    r.entetes = tout[0].map(function (h) { return String(h).trim(); });
    var colonnes = c.fr.concat(c.en ? c.en.map(function (p) { return p[1]; }) : []);
    colonnes.forEach(function (k) { if (idx[k] < 0) r.absents.push(entete(c.def, k)); });
    var supprTab = I.suppr[c.def.nom] || {};
    var vus = {};
    var gardees = [];
    for (var i = 1; i < tout.length; i++) {
      var ligne = tout[i];
      if (!ligne.some(function (v) { return String(v).trim() !== ''; })) continue;
      var principal = c.principal && idx[c.principal] >= 0 ? String(ligne[idx[c.principal]]).trim() : '';
      if (principal && supprTab[cleEntete(principal)]) {
        r.suppressions.push({ ligne: i + 1, nom: principal, raison: 'plan' });
        vus[cleEntete(principal)] = true;
        continue;
      }
      var neuf = {};
      var aRenommer = !c.si || c.si(ligne, idx);
      c.fr.forEach(function (k) {
        if (idx[k] < 0) return;
        var v = ligne[idx[k]];
        var s = String(v === null || v === undefined ? '' : v).trim();
        neuf[k] = aRenommer ? nomRenomme(I, s) : s;
        if (aRenommer && neuf[k] !== s && String(v) !== neuf[k]) {
          if (formules[i][idx[k]]) { r.formules.push({ ligne: i + 1, champ: k, valeur: s }); neuf[k] = s; return; }
          r.cellules.push({ ligne: i + 1, champ: k, col: idx[k] + 1, ancien: s, nouveau: neuf[k] });
        }
      });
      (c.en || []).forEach(function (p) {
        if (idx[p[0]] < 0 || idx[p[1]] < 0) return;
        var fixes = (I.en[cleEntete(neuf[p[0]])] || []).filter(function (e) { return e.tabs.indexOf(c.def.nom) >= 0; });
        if (!fixes.length) return;
        var cell = ligne[idx[p[1]]];
        var actuel = String(cell === null || cell === undefined ? '' : cell).trim();
        if (fixes.some(function (e) { return e.en_new === actuel; })) return;
        var e = fixes.filter(function (x) { return x.en_old === actuel; })[0];
        if (!e) { r.ecarts.push({ ligne: i + 1, fr: neuf[p[0]], actuel: actuel, attendu: fixes[0].en_old, nouveau: fixes[0].en_new }); return; }
        if (formules[i][idx[p[1]]]) { r.formules.push({ ligne: i + 1, champ: p[1], valeur: actuel }); return; }
        r.cellules.push({ ligne: i + 1, champ: p[1], col: idx[p[1]] + 1, ancien: actuel, nouveau: e.en_new });
      });
      (c.libre || []).forEach(function (k) {
        if (idx[k] < 0) return;
        var t = texteSimple(ligne[idx[k]]);
        if (!t.trim()) return;
        var cites = I.motifs.filter(function (m) { return m.re.test(t); }).map(function (m) { return m.nom; });
        if (cites.length) r.libres.push({ ligne: i + 1, champ: k, noms: cites });
      });
      gardees.push({ ligne: i + 1, source: ligne, neuf: neuf });
    }
    Object.keys(supprTab).forEach(function (k) { if (!vus[k]) r.absents.push('« ' + supprTab[k] + ' » (à supprimer : déjà absent)'); });
    if (c.unique) doublonsRenommage(I, c, idx, gardees, r);
    // The rows to add, unless the name is already there (after the renaming).
    var pris = {};
    gardees.forEach(function (g) { if (!g.supprimee && g.neuf[c.principal] !== undefined) pris[cleEntete(g.neuf[c.principal])] = true; });
    (I.ajouts[c.def.nom] || []).forEach(function (valeurs) {
      var nom = valeurs[c.principal];
      if (pris[cleEntete(nom)]) { r.absents.push('« ' + nom + ' » (à ajouter : déjà là)'); return; }
      pris[cleEntete(nom)] = true;
      var nouvelle = [];
      for (var j = 0; j < r.largeur; j++) nouvelle.push('');
      Object.keys(valeurs).forEach(function (k) { if (idx[k] >= 0) nouvelle[idx[k]] = valeurs[k]; });
      r.ajouts.push(nouvelle);
    });
    res.bloquants += r.bloquants.length;
  });
  return res;
}

/** A field's header as the tab's mapping names it. */
function entete(def, champ) {
  var col = def.colonnes.filter(function (x) { return x[1] === champ; })[0];
  return col ? col[0] : champ;
}

/**
 * Duplicates once renamed: rows that end up with the same name (or recipe) where the tab holds one. Settled by the
 * plan when one row already held the name and the others come from a `fusion` rename: they are deleted (the row that
 * already held the name is kept as it is: its level, prices, notes); anything else is a `bloquant` (the real run then
 * writes nothing). Each fusion keeps both sides in `r.fusions`, so the log can show them in full.
 */
function doublonsRenommage(I, c, idx, gardees, r) {
  var groupes = {};
  var ordre = [];
  gardees.forEach(function (g) {
    var cle;
    if (c.unique === 'recette') cle = cleEntete(g.neuf.produit) + '|' + (cleEntete(idx.variante >= 0 ? g.source[idx.variante] : '') || '1');
    else if (c.unique === 'genre') cle = cleEntete(g.source[idx.genre]) + '|' + cleEntete(g.neuf.nom);
    else cle = cleEntete(g.neuf[c.principal]);
    if (!cleEntete(g.neuf[c.principal])) return;
    if (!groupes[cle]) { groupes[cle] = []; ordre.push(cle); }
    groupes[cle].push(g);
  });
  ordre.forEach(function (cle) {
    var g = groupes[cle];
    var avant = function (x) { return String(x.source[idx[c.principal]]).trim(); };
    var origines = [];
    g.forEach(function (x) { if (origines.indexOf(cleEntete(avant(x))) < 0) origines.push(cleEntete(avant(x))); });
    if (c.unique === 'recette') {
      if (origines.length > 1) {
        var nomNeuf = g[0].neuf.produit;
        var tenant = origines.filter(function (o) { return o === cleEntete(nomNeuf); });
        var autres = origines.filter(function (o) { return o !== cleEntete(nomNeuf); });
        var reglee = tenant.length === 1 && autres.every(function (o) { return I.parAncien[o] && I.parAncien[o].fusion; });
        if (!reglee) {
          r.bloquants.push('recette « ' + nomNeuf + ' » (variante ' + cle.split('|')[1] + ') : deux recettes deviennent la même (' + g.map(function (x) { return 'ligne ' + x.ligne + ' « ' + avant(x) + ' »'; }).join(', ') + ')');
          return;
        }
        var fusion = { nom: nomNeuf, gardees: [], supprimees: [] };
        g.forEach(function (x) {
          if (cleEntete(avant(x)) === cleEntete(nomNeuf)) { fusion.gardees.push(x); return; }
          x.supprimee = true;
          fusion.supprimees.push(x);
          r.suppressions.push({ ligne: x.ligne, nom: avant(x), raison: 'doublon de « ' + nomNeuf + ' » (fusion)' });
        });
        r.fusions.push(fusion);
        g = g.filter(function (x) { return !x.supprimee; });
      }
      // One row per ingredient in a recipe: two rows that the renaming makes the same ingredient (one at least renamed).
      var ingr = {};
      g.forEach(function (x) {
        var k = cleEntete(x.neuf.ingredient);
        if (!k) return;
        var renomme = cleEntete(x.source[idx.ingredient]) !== k;
        if (ingr[k] && (renomme || ingr[k].renomme)) r.bloquants.push('recette « ' + x.neuf.produit + ' » : l\'ingrédient « ' + x.neuf.ingredient + ' » y figurerait deux fois (lignes ' + ingr[k].ligne + ' et ' + x.ligne + ')');
        else if (!ingr[k]) ingr[k] = { ligne: x.ligne, renomme: renomme };
      });
      return;
    }
    if (g.length < 2) return;
    var nom = g[0].neuf[c.principal];
    var tenants = g.filter(function (x) { return cleEntete(avant(x)) === cleEntete(nom); });
    var venus = g.filter(function (x) { return cleEntete(avant(x)) !== cleEntete(nom); });
    // Rows that held the same name before the renaming are the owner's business, not the plan's.
    if (!venus.length) return;
    var ok = tenants.length === 1 && venus.every(function (x) { var p = I.parAncien[cleEntete(avant(x))]; return p && p.fusion; });
    if (!ok) {
      r.bloquants.push('« ' + nom + ' » : ' + g.length + ' lignes portent ce nom une fois renommées (' + g.map(function (x) { return 'ligne ' + x.ligne + ' « ' + avant(x) + ' »'; }).join(', ') + ')');
      return;
    }
    venus.forEach(function (x) {
      x.supprimee = true;
      r.suppressions.push({ ligne: x.ligne, nom: avant(x), raison: 'doublon de « ' + nom + ' », la ligne ' + tenants[0].ligne + ' est gardée (fusion)' });
    });
    r.fusions.push({ nom: nom, gardees: tenants, supprimees: venus });
  });
  // A row deleted as a duplicate keeps no cell change.
  var parties = {};
  r.suppressions.forEach(function (s) { parties[s.ligne] = true; });
  r.cellules = r.cellules.filter(function (x) { return !parties[x.ligne]; });
}

/** A cell as the log shows it (a date as JST). */
function texteCellule(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  return String(v === null || v === undefined ? '' : v).trim();
}

/** A row in full, as the log shows it: « Header : value » for every non-empty cell. */
function decrireLigne(r, x) {
  var parts = [];
  x.source.forEach(function (v, j) {
    var t = texteCellule(v);
    if (t !== '') parts.push((r.entetes[j] || ('colonne ' + (j + 1))) + ' : ' + t);
  });
  return parts.join(' · ') || '(vide)';
}

/** The lines of one fusion: every row kept and deleted in full; in Pondération, the levels side by side. */
function journalFusion(r, f) {
  var lignes = ['   FUSION « ' + f.nom + ' » : la ligne qui porte déjà ce nom est gardée telle quelle, l\'autre supprimée.'];
  f.gardees.forEach(function (x) { lignes.push('      gardée    (ligne ' + x.ligne + ') : ' + decrireLigne(r, x)); });
  f.supprimees.forEach(function (x) { lignes.push('      supprimée (ligne ' + x.ligne + ') : ' + decrireLigne(r, x)); });
  if (r.def === TABS.ponderation) {
    var iCode = indexColonnes(r.entetes, r.def).code;
    var code = function (x) { return iCode >= 0 ? texteCellule(x.source[iCode]) || '(vide)' : '(pas de colonne Code)'; };
    var garde = f.gardees[0];
    var niveaux = f.supprimees.map(function (x) { return '« ' + texteCellule(x.source[indexColonnes(r.entetes, r.def).nom]) + ' » ' + code(x); });
    var differents = f.supprimees.some(function (x) { return code(x) !== code(garde); });
    lignes.push('      niveaux : « ' + f.nom + ' » ' + code(garde) + ' (gardé) / ' + niveaux.join(', ') + ' (supprimé)' +
      (differents ? ' — NIVEAUX DIFFÉRENTS : c\'est ' + code(garde) + ' qui restera. Pour garder l\'autre niveau, changer le Code de la ligne ' + garde.ligne + ' à la main AVANT le vrai passage.' : ' — même niveau.'));
  }
  return lignes;
}

/** The analysis as French lines for the editor's log (also the real run's report). */
function journalRenommage(a, titre) {
  var lignes = [titre];
  var total = { cellules: 0, suppressions: 0, ajouts: 0, fusions: 0 };
  a.onglets.forEach(function (r) {
    if (!r.present) { lignes.push('— ' + r.nom + ' : onglet absent, rien à faire.'); return; }
    total.cellules += r.cellules.length;
    total.suppressions += r.suppressions.length;
    total.ajouts += r.ajouts.length;
    total.fusions += r.fusions.length;
    lignes.push('— ' + r.nom + ' : ' + r.cellules.length + ' cellule(s) à changer, ' + r.suppressions.length + ' ligne(s) à supprimer, ' + r.ajouts.length + ' ligne(s) à ajouter' + (r.fusions.length ? ', ' + r.fusions.length + ' fusion(s)' : '') + (r.bloquants.length ? ', ' + r.bloquants.length + ' DOUBLON(S) NON RÉGLÉ(S)' : '') + '.');
    r.bloquants.forEach(function (b) { lignes.push('   !! DOUBLON : ' + b); });
    r.fusions.forEach(function (f) { lignes.push.apply(lignes, journalFusion(r, f)); });
    r.cellules.forEach(function (x) { lignes.push('   ligne ' + x.ligne + ', ' + entete(r.def, x.champ) + ' : « ' + x.ancien + ' » → « ' + x.nouveau + ' »'); });
    r.suppressions.forEach(function (x) { lignes.push('   ligne ' + x.ligne + ' supprimée : « ' + x.nom + ' »' + (x.raison === 'plan' ? '' : ' (' + x.raison + ')')); });
    r.ajouts.forEach(function (x) { lignes.push('   ligne ajoutée : ' + x.filter(function (v) { return v !== ''; }).join(' | ')); });
    r.formules.forEach(function (x) { lignes.push('   ligne ' + x.ligne + ', ' + entete(r.def, x.champ) + ' : une formule (« ' + x.valeur + ' »), laissée telle quelle'); });
    r.ecarts.forEach(function (x) { lignes.push('   ligne ' + x.ligne + ', nom anglais de « ' + x.fr + ' » : « ' + x.actuel + ' » (le plan attendait « ' + x.attendu + ' » → « ' + x.nouveau + ' »), laissé'); });
    r.absents.forEach(function (x) { lignes.push('   note : ' + x); });
    r.libres.forEach(function (x) { lignes.push('   texte libre, ligne ' + x.ligne + ', ' + entete(r.def, x.champ) + ' : cite « ' + x.noms.join(' », « ') + ' » (non modifié)'); });
  });
  lignes.push('Total : ' + total.cellules + ' cellule(s), ' + total.suppressions + ' ligne(s) supprimée(s), ' + total.ajouts + ' ligne(s) ajoutée(s), ' + total.fusions + ' fusion(s)' + (a.bloquants ? ' ; ' + a.bloquants + ' doublon(s) à régler avant le vrai passage.' : '.'));
  return lignes;
}

/** Logs the lines in pieces (one entry of the execution log holds a few thousand characters at most). */
function journaliser(lignes) {
  var bloc = [];
  var taille = 0;
  lignes.forEach(function (l) {
    if (taille + l.length > 6000 && bloc.length) { Logger.log(bloc.join('\n')); bloc = []; taille = 0; }
    bloc.push(l);
    taille += l.length + 1;
  });
  if (bloc.length) Logger.log(bloc.join('\n'));
}

/** grimoire.gs in the same project: its hand-edit handler drops its cache and moves its VERSION on. */
function grimoirePresent() {
  return typeof Grimoire !== 'undefined' && Grimoire && typeof Grimoire.onEdit === 'function';
}

/** Run from the editor (as `importRenommerSimuler`): what the renaming would do, logged; nothing is written. */
function renommerSimuler() {
  var fait = PropertiesService.getScriptProperties().getProperty(RENOMMAGE_FAIT);
  var a = analyserRenommage();
  var lignes = journalRenommage(a, 'SIMULATION du renommage du ' + RENOMMAGE.date + ' (rien n\'est écrit).' + (fait ? ' Déjà fait le ' + fait + ' : le vrai passage sera refusé.' : ''));
  if (!grimoirePresent()) lignes.push('ATTENTION : grimoire.gs est introuvable dans ce projet : le vrai passage sera refusé.');
  lignes.push(a.bloquants ? 'Le vrai passage (importRenommer) sera refusé tant que ces doublons ne sont pas réglés.' : 'Si tout est juste : sélectionner importRenommer puis Exécuter.');
  journaliser(lignes);
  return a;
}

/** The name of a tab's backup, free in the spreadsheet (« Sauvegarde Recettes 2026-11-06 », then « … (2) »). */
function nomSauvegarde(classeur, nom) {
  var base = 'Sauvegarde ' + nom + ' ' + RENOMMAGE.date;
  var n = base;
  for (var i = 2; classeur.getSheetByName(n); i++) n = base + ' (' + i + ')';
  return n;
}

/**
 * Run from the editor (as `importRenommer`), once: under the script lock, the analysis is made again on the sheet
 * as it is, refused when a duplicate is not settled; each tab it touches is copied first to a hidden backup tab;
 * then the cells, the deleted rows (bottom up), the added rows; RENOMMAGE_FAIT set; then grimoire.gs's hand-edit
 * handler (its cache dropped, its version moved on).
 */
function renommer() {
  if (!grimoirePresent()) {
    Logger.log('Refusé : grimoire.gs est introuvable dans ce projet (son cache ne pourrait pas être vidé). Rien n\'a été écrit.');
    return { ok: false, erreur: 'grimoire absent' };
  }
  var proprietes = PropertiesService.getScriptProperties();
  var verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(30000);
  } catch (err) {
    Logger.log('Le registre est occupé (une écriture en cours) : réessayer dans une minute. Rien n\'a été écrit.');
    return { ok: false, erreur: 'sheet busy' };
  }
  var touche = false;
  try {
    var fait = proprietes.getProperty(RENOMMAGE_FAIT);
    if (fait) {
      Logger.log('Refusé : le renommage a déjà été fait le ' + fait + '. Rien n\'a été écrit. (Pour le refaire malgré tout : supprimer la propriété ' + RENOMMAGE_FAIT + ' dans Paramètres du projet → Propriétés du script.)');
      return { ok: false, erreur: 'already done' };
    }
    var a = analyserRenommage();
    if (a.bloquants) {
      journaliser(journalRenommage(a, 'REFUSÉ : des doublons ne sont pas réglés par le plan. Rien n\'a été écrit.'));
      return { ok: false, erreur: 'duplicates', analyse: a };
    }
    var classeur = SpreadsheetApp.getActiveSpreadsheet();
    var sauvegardes = [];
    a.onglets.forEach(function (r) {
      if (!r.present || (!r.cellules.length && !r.suppressions.length && !r.ajouts.length)) return;
      var feuille = classeur.getSheetByName(r.nom);
      var nom = nomSauvegarde(classeur, r.nom);
      var copie = feuille.copyTo(classeur);
      copie.setName(nom);
      copie.hideSheet();
      sauvegardes.push(nom);
    });
    touche = true;
    a.onglets.forEach(function (r) {
      if (!r.present || (!r.cellules.length && !r.suppressions.length && !r.ajouts.length)) return;
      var feuille = classeur.getSheetByName(r.nom);
      // The cells one by one (a name column may hold a text that looks like a number: never re-typed).
      r.cellules.forEach(function (x) { feuille.getRange(x.ligne, x.col).setValue(x.nouveau); });
      r.suppressions.map(function (x) { return x.ligne; }).sort(function (p, q) { return q - p; })
        .forEach(function (n) { feuille.deleteRow(n); });
      if (r.ajouts.length) feuille.getRange(feuille.getLastRow() + 1, 1, r.ajouts.length, r.largeur).setValues(r.ajouts);
    });
    var quand = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ' (JST)';
    proprietes.setProperty(RENOMMAGE_FAIT, quand);
    var lignes = journalRenommage(a, 'RENOMMAGE FAIT le ' + quand + '.');
    lignes.push('Sauvegardes (onglets masqués, clic droit sur la barre des onglets → Afficher) : ' + (sauvegardes.length ? sauvegardes.join(', ') : 'aucune'));
    lignes.push('Le cache est vidé : le grimoire (Missions et production) lit les nouveaux noms à son prochain chargement.');
    journaliser(lignes);
    return { ok: true, analyse: a, sauvegardes: sauvegardes };
  } catch (err) {
    Logger.log('ERREUR pendant le renommage : ' + err + (touche ? ' — une partie a pu être écrite : les onglets « Sauvegarde … » gardent l\'état d\'avant.' : ' — rien n\'a été écrit.'));
    return { ok: false, erreur: String(err) };
  } finally {
    // As a hand edit does (a script's writes fire no onEdit): grimoire.gs's cache dropped, its version moved on
    // (also after a partial write).
    if (touche) {
      try {
        Grimoire.onEdit();
      } catch (err) {
        Logger.log('Le cache du grimoire n\'a pas pu être vidé (' + err + ') : lancer grimoireViderCache depuis l\'éditeur.');
      }
    }
    verrou.releaseLock();
  }
}

return {
  renommerSimuler: renommerSimuler,
  renommer: renommer,
};
})();

var ImportSecrets = (function () {

/* ───────────────────────── The tabs (grimoire.gs v3u's mappings, copied) ───────────────────────── */

var CATALOGUE = {
  nom: 'Catalogues',
  colonnes: [
    ['Article', 'fr', ['fr', 'articles', 'détail', 'details', 'désignation', 'nom', 'objet', 'produit']],
    ['Article (EN)', 'en', ['en', 'anglais', 'english', 'nom anglais', 'nom en', 'article anglais', 'détail en', 'désignation en']],
    ['Note', 'note', ['notes', 'remarque', 'commentaire']],
    ['Livre', 'livre', ['registre', 'book']],
  ],
};
var SECRETS = {
  nom: 'Secrets',
  colonnes: [
    ['N°', 'id'], ['Déposé le', 'depose'], ['Informateur', 'informateur'], ['Titre', 'titre'], ['Contenu', 'contenu'],
    ['Urgence', 'urgence'], ['Prix', 'prix'], ['Provenance', 'provenance'], ['Destinataire', 'destinataire'], ['Faction', 'faction'],
    ['Interne / externe', 'portee', ['Interne/externe', 'Portée']], ['État', 'etat'], ['Ouvert par', 'ouvertPar'], ['Ouvert le', 'ouvertLe'],
    ['Fusionnée dans', 'fusionneeDans'], ['État avant', 'etatAvant'], ['Corrigée par', 'corrigeePar'], ['Corrigée le', 'corrigeeLe'],
    ['Retirée par', 'retireePar'], ['Retirée le', 'retireeLe'],
  ],
};
var JOURNAL = {
  nom: "Journal de l'ombre",
  colonnes: [['Horodatage', 'horodatage'], ['Geste', 'geste'], ['Par', 'par'], ['N°', 'id'], ['Détail', 'detail']],
};

/* ───────────────────────── The plan (conversion-infos-elijah.md, validated by Ludo) ───────────────────────── */

/**
 * One entry per note, in the order of the sheet. `sources`: the Catalogues rows it comes from, each by its « Article »
 * (compared like headers: case, accents, spaces ignored) and the reference written at the end of its text; two sources
 * make one merged note (the second's « Article (EN) » heads its text). `titre` and the other fields: the plan's table
 * (Urgence « Ordinaire » and Interne / externe « Externe » unless stated). Values from lib/secrets.ts (URGENCES, PORTEES).
 */
var INFORMATEUR = 'Elijah';
var INFOS_ELIJAH = [
  { sources: [{ article: 'Information', ref: 'Information' }], titre: "Culte d'Azurah", faction: "Culte d'Azurah" },
  { sources: [{ article: 'InformationA001', ref: 'A001' }], titre: "Dar'Adar", provenance: 'Skirr' },
  { sources: [{ article: 'Information A002', ref: 'A002' }], titre: 'Vit alli Skooma', prix: '50–200 (prod. 999)' },
  { sources: [{ article: 'Information A003', ref: 'A003' }], titre: "Dahl'Dran" },
  { sources: [{ article: 'Information A004', ref: 'A004' }], titre: "Scierie de Faillaise, Jo'Kar" },
  { sources: [{ article: 'Information A005', ref: 'A005' }], titre: 'Brelayn', faction: "Sentinelles d'Azurah", urgence: 'Pressante' },
  { sources: [{ article: 'Information A006', ref: 'A006' }], titre: "Taverne d'Eau rouge / sucrelune 10s/u" },
  { sources: [{ article: 'Information A007', ref: 'A007' }], titre: "Ja'Abi et Therendal", portee: 'Interne' },
  { sources: [{ article: 'Information A008', ref: 'A008' }], titre: "Alchimiste d'Aubétoile" },
  { sources: [{ article: 'Information A009', ref: 'A009' }], titre: 'Armure dwemer complète' },
  { sources: [{ article: 'Information A010', ref: 'A010' }], titre: "O'reil", faction: 'Compagnie minière de Riveboie' },
  { sources: [{ article: 'Information A011', ref: 'A011' }], titre: 'Culte de Molag Bal et vampires', faction: 'Culte de Molag Bal', urgence: 'Pressante' },
  { sources: [{ article: 'Information A012', ref: 'A012' }], titre: "S'Mhirth", faction: 'Tong' },
  { sources: [{ article: 'Information A013', ref: 'A013' }], titre: 'Culte de Shor / Shézar / Lorkan', provenance: 'Jarhan Afrani', faction: 'Culte de Shor' },
  { sources: [{ article: 'Information A014', ref: 'A014' }], titre: 'Pierre de Shor : Compagnie de Roche-Ébène', faction: 'Compagnie de Roche-Ébène' },
  { sources: [{ article: 'Information A014 Bis', ref: 'A014 bis' }], titre: 'Mavar Senptry, enchanteur de Faillaise' },
  { sources: [{ article: 'Information A015', ref: 'A015' }], titre: 'Enchanteur de Faillaise : Grosse bourse (Ornim)' },
  { sources: [{ article: 'Information A016', ref: 'A016' }], titre: 'Temple de Julianos, Boie-de-Chêne', faction: 'Temple de Julianos' },
  { sources: [{ article: 'Information 017', ref: '017' }], titre: 'Mariage Terari / Veleroth Vendeaume' },
  { sources: [{ article: 'Information A018', ref: 'A018' }], titre: 'Tong de Boie-de-Chêne (Wulan Tong)', faction: 'Tong' },
  { sources: [{ article: 'Information A019', ref: 'A019' }], titre: "Raz'Zir, Boie-de-Chêne" },
  { sources: [{ article: 'Information A020', ref: 'A020' }], titre: 'Les Bleuets, compagnie nordique à Folpertus', faction: 'Les Bleuets' },
  { sources: [{ article: 'Information A021', ref: 'A021' }, { article: 'Information A021 bis', ref: 'A021 bis' }],
    titre: "Ahnassaï, noble d'Aubétoile", faction: "Noblesse d'Aubétoile" },
  { sources: [{ article: 'Information A022', ref: 'A022' }], titre: 'Caravane des sables : journal de Magnus', portee: 'Interne' },
];
var CHAMPS_PLAN = ['urgence', 'prix', 'provenance', 'destinataire', 'faction', 'portee'];
var DEFAUTS = { urgence: 'Ordinaire', portee: 'Externe' };

/** The script property set by the real run (its date): a second run is refused. */
var SECRETS_ELIJAH_FAIT = 'SECRETS_ELIJAH_FAIT';

/* ───────────────────────── Helpers ───────────────────────── */

/** Comparable header (grimoire.gs's): lower case, no accents, letters and digits only. */
function cleEntete(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '');
}

/** 0-based column of each field in a header row (-1 when absent); older header names count too (grimoire.gs's). */
function indexColonnes(entete, def) {
  var noms = entete.map(cleEntete);
  var index = {};
  def.colonnes.forEach(function (col) {
    var i = noms.indexOf(cleEntete(col[0]));
    (col[2] || []).forEach(function (ancien) { if (i < 0) i = noms.indexOf(cleEntete(ancien)); });
    index[col[1]] = i;
  });
  return index;
}

/** A shadow book's row (grimoire.gs `estOmbre`). */
function estOmbre(v) { return /ombre|shadow/i.test(String(v === undefined || v === null ? '' : v)); }

/** A cell as text (a date as JST), ends trimmed, line breaks as \n. */
function texteCellule(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  return String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').trim();
}

/** A contribution's heading in a merged note (grimoire.gs `enteteFusion`): « Elijah ----------- 12/11/2026 ». */
var RE_ENTETE_FUSION = /^(.+?)\s+-{3,}\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*$/;
function enteteFusion(auteur, quand) {
  return auteur + ' ----------- ' + Utilities.formatDate(quand, 'Asia/Tokyo', 'dd/MM/yyyy');
}

/** A note's number as the site makes it (app/api/ombre numero('S')): « S-261112-AB12 », free in `pris`. */
function nouvelId(quand, pris) {
  var jour = Utilities.formatDate(quand, 'Asia/Tokyo', 'yyyy-MM-dd').replace(/-/g, '').slice(2);
  var alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (;;) {
    var hasard = '';
    for (var i = 0; i < 4; i++) hasard += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    var id = 'S-' + jour + '-' + hasard;
    if (!pris[cleEntete(id)]) { pris[cleEntete(id)] = true; return id; }
  }
}

/* ───────────────────────── The analysis (reads only) ───────────────────────── */

/**
 * The plan against the sheet as it is now; writes nothing. `notes`: the rows to append ({ id, titre, contenu, … ,
 * lignes: the Catalogues rows it comes from }); `suppressions` ({ ligne, article }, 1-based); `bloquants`: why the real
 * run would refuse (a row missing or found twice, an empty text, a title already in Secrets); `remarques`: the rest.
 */
function analyser(quand) {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var res = { notes: [], suppressions: [], bloquants: [], remarques: [] };
  var feuille = classeur.getSheetByName(CATALOGUE.nom);
  if (!feuille || feuille.getLastRow() < 2) { res.bloquants.push('l\'onglet « ' + CATALOGUE.nom + ' » est introuvable ou vide'); return res; }
  var tout = feuille.getDataRange().getValues();
  var idx = indexColonnes(tout[0], CATALOGUE);
  ['fr', 'note', 'livre'].forEach(function (k) {
    if (idx[k] < 0) res.bloquants.push('la colonne « ' + CATALOGUE.colonnes.filter(function (c) { return c[1] === k; })[0][0] + ' » manque dans Catalogues');
  });
  if (res.bloquants.length) return res;
  // The shadow rows, by their Article.
  var ombre = {};
  var jour = {};
  for (var i = 1; i < tout.length; i++) {
    var k = cleEntete(tout[i][idx.fr]);
    if (!k) continue;
    var cible = estOmbre(tout[i][idx.livre]) ? ombre : jour;
    (cible[k] = cible[k] || []).push(i);
  }
  // The notes already in Secrets: their numbers and titles.
  var pris = {};
  var titres = {};
  var secrets = classeur.getSheetByName(SECRETS.nom);
  if (secrets && secrets.getLastRow() >= 2) {
    var s = secrets.getDataRange().getValues();
    var is = indexColonnes(s[0], SECRETS);
    for (var j = 1; j < s.length; j++) {
      if (is.id >= 0 && texteCellule(s[j][is.id])) pris[cleEntete(s[j][is.id])] = true;
      if (is.titre >= 0 && texteCellule(s[j][is.titre])) titres[cleEntete(s[j][is.titre])] = texteCellule(s[j][is.id]) || ('ligne ' + (j + 1));
    }
  }
  var attendus = {};
  INFOS_ELIJAH.forEach(function (info) {
    var parts = [];
    var lignes = [];
    var manque = false;
    info.sources.forEach(function (src, n) {
      var k = cleEntete(src.article);
      attendus[k] = true;
      var trouves = ombre[k] || [];
      if (trouves.length !== 1) {
        manque = true;
        if (trouves.length > 1) res.bloquants.push('« ' + src.article + ' » : ' + trouves.length + ' lignes du Livre d\'ombre portent ce nom (lignes ' + trouves.map(function (r) { return r + 1; }).join(', ') + ')');
        else if (jour[k]) res.bloquants.push('« ' + src.article + ' » : trouvée ligne ' + (jour[k][0] + 1) + ' mais pas dans le Livre d\'ombre (colonne Livre ≠ Ombre)');
        else res.bloquants.push('« ' + src.article + ' » : introuvable dans Catalogues (Livre = Ombre)');
        return;
      }
      var r = trouves[0];
      var note = texteCellule(tout[r][idx.note]);
      if (!note) { manque = true; res.bloquants.push('« ' + src.article + ' » (ligne ' + (r + 1) + ') : la Note est vide'); return; }
      var tete = n > 0 && idx.en >= 0 ? texteCellule(tout[r][idx.en]) : '';
      parts.push({ texte: (tete ? tete + ': ' : '') + note + '\n[' + src.ref + ']' });
      lignes.push({ ligne: r + 1, article: texteCellule(tout[r][idx.fr]) });
    });
    if (manque) return;
    var contenu = parts.length === 1 ? parts[0].texte : parts.map(function (p) { return enteteFusion(INFORMATEUR, quand) + '\n' + p.texte; }).join('\n\n');
    if (titres[cleEntete(info.titre)]) res.bloquants.push('« ' + info.titre + ' » : une note de ce titre est déjà dans Secrets (' + titres[cleEntete(info.titre)] + ')');
    var o = { id: nouvelId(quand, pris), depose: quand, informateur: INFORMATEUR, titre: info.titre, contenu: contenu, etat: 'ouverte', ouvertPar: INFORMATEUR, ouvertLe: quand, lignes: lignes };
    CHAMPS_PLAN.forEach(function (c) { o[c] = info[c] !== undefined ? info[c] : (DEFAUTS[c] || ''); });
    res.notes.push(o);
    lignes.forEach(function (l) { res.suppressions.push(l); });
  });
  // Other « Information » rows of the shadow book are left (and said).
  Object.keys(ombre).forEach(function (k) {
    if (k.indexOf('information') === 0 && !attendus[k]) ombre[k].forEach(function (r) { res.remarques.push('ligne ' + (r + 1) + ' « ' + texteCellule(tout[r][idx.fr]) + ' » : hors du plan, laissée'); });
  });
  return res;
}

/** The analysis as French lines for the editor's log (each note in full). */
function journalAnalyse(a, titre) {
  var lignes = [titre];
  a.bloquants.forEach(function (b) { lignes.push('   !! ' + b); });
  a.notes.forEach(function (o, n) {
    lignes.push('— Note ' + (n + 1) + ' : ' + o.id + ' « ' + o.titre + ' » (Catalogues ' + o.lignes.map(function (l) { return 'ligne ' + l.ligne + ' « ' + l.article + ' »'; }).join(' + ') + ')');
    lignes.push('   Urgence : ' + o.urgence + ' · Interne / externe : ' + o.portee + (o.prix ? ' · Prix : ' + o.prix : '') + (o.provenance ? ' · Provenance : ' + o.provenance : '') + (o.faction ? ' · Faction : ' + o.faction : '') + ' · État : ' + o.etat);
    o.contenu.split('\n').forEach(function (l) { lignes.push('   | ' + l); });
  });
  var tri = a.suppressions.slice().sort(function (p, q) { return q.ligne - p.ligne; });
  tri.forEach(function (s) { lignes.push('   Catalogues ligne ' + s.ligne + ' supprimée : « ' + s.article + ' »'); });
  a.remarques.forEach(function (r) { lignes.push('   note : ' + r); });
  lignes.push('Total : ' + a.notes.length + ' note(s) à ajouter à Secrets, ' + a.suppressions.length + ' ligne(s) de Catalogues à supprimer' + (a.bloquants.length ? ' ; ' + a.bloquants.length + ' blocage(s).' : '.'));
  return lignes;
}

/** Logs the lines in pieces (one entry of the execution log holds a few thousand characters at most). */
function journaliser(lignes) {
  var bloc = [];
  var taille = 0;
  lignes.forEach(function (l) {
    if (taille + l.length > 6000 && bloc.length) { Logger.log(bloc.join('\n')); bloc = []; taille = 0; }
    bloc.push(l);
    taille += l.length + 1;
  });
  if (bloc.length) Logger.log(bloc.join('\n'));
}

/* ───────────────────────── Writing ───────────────────────── */

/**
 * A hidden tab of the shadow book ready to append to (grimoire.gs `preparer`, simplified): created hidden with its
 * header row when missing (or when row 1 is empty); missing headers added at the end of row 1. A row 1 holding none
 * of its headers: null (nothing written). Returns { feuille, cols (1-based), largeur }.
 */
function preparer(def) {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var feuille = classeur.getSheetByName(def.nom);
  var entetes = def.colonnes.map(function (col) { return col[0]; });
  if (!feuille) {
    feuille = classeur.insertSheet(def.nom);
    feuille.hideSheet();
  }
  var largeur = Math.max(feuille.getLastColumn(), 1);
  var premiere = feuille.getLastRow() === 0 ? [] : feuille.getRange(1, 1, 1, largeur).getValues()[0];
  var vide = !premiere.some(function (v) { return String(v).trim() !== ''; });
  if (vide) {
    feuille.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
    feuille.setFrozenRows(1);
    premiere = entetes.slice();
  } else {
    var index = indexColonnes(premiere, def);
    var absentes = def.colonnes.filter(function (col) { return index[col[1]] < 0; });
    if (absentes.length === def.colonnes.length) return null;
    if (absentes.length) {
      var fin = premiere.length;
      while (fin > 0 && String(premiere[fin - 1]).trim() === '') fin--;
      var ajout = absentes.map(function (col) { return col[0]; });
      feuille.getRange(1, fin + 1, 1, ajout.length).setValues([ajout]).setFontWeight('bold');
      premiere = premiere.slice(0, fin).concat(ajout);
    }
  }
  var idx = indexColonnes(premiere, def);
  var cols = {};
  var large = 0;
  Object.keys(idx).forEach(function (k) { cols[k] = idx[k] + 1; large = Math.max(large, cols[k]); });
  return { feuille: feuille, cols: cols, largeur: large };
}

/** Appends objects as rows, each field under its header, in one call. */
function ajouter(p, objets) {
  if (!objets.length) return;
  var lignes = objets.map(function (o) {
    var l = [];
    for (var i = 0; i < p.largeur; i++) l.push('');
    Object.keys(o).forEach(function (k) { if (p.cols[k]) l[p.cols[k] - 1] = o[k]; });
    return l;
  });
  p.feuille.getRange(p.feuille.getLastRow() + 1, 1, lignes.length, p.largeur).setValues(lignes);
}

/** The journal's lines for the notes and the rows removed (the title and the fields, never a note's text). */
function lignesJournal(a, geste, quand) {
  var res = a.notes.map(function (o) {
    var d = '« ' + o.titre + ' » depuis Catalogues ' + o.lignes.map(function (l) { return 'ligne ' + l.ligne + ' « ' + l.article + ' »'; }).join(' + ') +
      ' · ' + o.urgence + ' · ' + o.portee + (o.faction ? ' · ' + o.faction : '') + (o.provenance ? ' · de ' + o.provenance : '') + (o.prix ? ' · ' + o.prix : '') +
      ' · ' + o.contenu.length + ' caractères';
    return { horodatage: quand, geste: geste, par: INFORMATEUR, id: o.id, detail: d.slice(0, 300) };
  });
  if (geste !== 'import') {
    a.suppressions.slice().sort(function (p, q) { return q.ligne - p.ligne; }).forEach(function (s) {
      res.push({ horodatage: quand, geste: geste, par: INFORMATEUR, id: '', detail: 'Catalogues ligne ' + s.ligne + ' « ' + s.article + ' » à supprimer' });
    });
  }
  return res;
}

/** The journal written (a failure there is logged, nothing else stops). */
function ecrireJournal(lignes) {
  try {
    var p = preparer(JOURNAL);
    if (!p) { Logger.log('« ' + JOURNAL.nom + ' » : la ligne 1 ne porte aucun des en-têtes attendus, journal non écrit.'); return; }
    ajouter(p, lignes);
  } catch (err) {
    Logger.log('« ' + JOURNAL.nom + ' » n\'a pas pu être écrit (' + err + ').');
  }
}

/** grimoire.gs in the same project: its hand-edit handler drops its cache and moves its VERSION on. */
function grimoirePresent() {
  return typeof Grimoire !== 'undefined' && Grimoire && typeof Grimoire.onEdit === 'function';
}

/** The name of the backup tab, free in the spreadsheet (« Sauvegarde Catalogues 2026-11-12 », then « … (2) »). */
function nomSauvegarde(classeur, quand) {
  var base = 'Sauvegarde ' + CATALOGUE.nom + ' ' + Utilities.formatDate(quand, 'Asia/Tokyo', 'yyyy-MM-dd');
  var n = base;
  for (var i = 2; classeur.getSheetByName(n); i++) n = base + ' (' + i + ')';
  return n;
}

/* ───────────────────────── The two entry points ───────────────────────── */

/** Run from the editor (as `importSecretsSimuler`): the plan logged and journaled; Secrets and Catalogues untouched. */
function simuler() {
  var fait = PropertiesService.getScriptProperties().getProperty(SECRETS_ELIJAH_FAIT);
  var quand = new Date();
  var a = analyser(quand);
  var lignes = journalAnalyse(a, 'SIMULATION de la conversion des informations d\'Elijah (rien n\'est écrit dans Secrets ni Catalogues ; les numéros changeront au vrai passage).' + (fait ? ' Déjà faite le ' + fait + ' : le vrai passage sera refusé.' : ''));
  if (!grimoirePresent()) lignes.push('ATTENTION : grimoire.gs est introuvable dans ce projet : le vrai passage sera refusé.');
  lignes.push(a.bloquants.length ? 'Le vrai passage (importSecrets) sera refusé tant que ces blocages demeurent.' : 'Si tout est juste : sélectionner importSecrets puis Exécuter.');
  journaliser(lignes);
  var j = lignesJournal(a, 'import (simulation)', quand);
  a.bloquants.forEach(function (b) { j.push({ horodatage: quand, geste: 'import (simulation)', par: INFORMATEUR, id: '', detail: ('BLOCAGE : ' + b).slice(0, 300) }); });
  ecrireJournal(j);
  return a;
}

/**
 * Run from the editor (as `importSecrets`), once: under the script lock, the analysis made again; refused (nothing
 * written) when already done or blocked; Catalogues copied to a hidden backup tab; the notes appended to Secrets; the rows
 * deleted bottom up; the journal; SECRETS_ELIJAH_FAIT set; then grimoire.gs's hand-edit handler.
 */
function importer() {
  if (!grimoirePresent()) {
    Logger.log('Refusé : grimoire.gs est introuvable dans ce projet (son cache ne pourrait pas être vidé). Rien n\'a été écrit.');
    return { ok: false, erreur: 'grimoire absent' };
  }
  var proprietes = PropertiesService.getScriptProperties();
  var verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(30000);
  } catch (err) {
    Logger.log('Le registre est occupé (une écriture en cours) : réessayer dans une minute. Rien n\'a été écrit.');
    return { ok: false, erreur: 'sheet busy' };
  }
  var touche = false;
  try {
    var fait = proprietes.getProperty(SECRETS_ELIJAH_FAIT);
    if (fait) {
      Logger.log('Refusé : les informations d\'Elijah ont déjà été converties le ' + fait + '. Rien n\'a été écrit. (Pour le refaire malgré tout : supprimer la propriété ' + SECRETS_ELIJAH_FAIT + ' dans Paramètres du projet → Propriétés du script.)');
      return { ok: false, erreur: 'already done' };
    }
    var quand = new Date();
    var a = analyser(quand);
    if (a.bloquants.length) {
      journaliser(journalAnalyse(a, 'REFUSÉ : le plan ne correspond pas au registre. Rien n\'a été écrit.'));
      return { ok: false, erreur: 'blocked', analyse: a };
    }
    var classeur = SpreadsheetApp.getActiveSpreadsheet();
    var p = preparer(SECRETS);
    if (!p) {
      Logger.log('Refusé : la ligne 1 de « ' + SECRETS.nom + ' » ne porte aucun des en-têtes attendus. Rien n\'a été écrit dans Catalogues ni Secrets.');
      return { ok: false, erreur: 'secrets header' };
    }
    var catalogue = classeur.getSheetByName(CATALOGUE.nom);
    var sauvegarde = nomSauvegarde(classeur, quand);
    var copie = catalogue.copyTo(classeur);
    copie.setName(sauvegarde);
    copie.hideSheet();
    touche = true;
    ajouter(p, a.notes.map(function (o) {
      var r = {};
      ['id', 'depose', 'informateur', 'titre', 'contenu', 'etat', 'ouvertPar', 'ouvertLe'].concat(CHAMPS_PLAN).forEach(function (c) { r[c] = o[c]; });
      return r;
    }));
    a.suppressions.map(function (s) { return s.ligne; }).sort(function (x, y) { return y - x; })
      .forEach(function (n) { catalogue.deleteRow(n); });
    ecrireJournal(lignesJournal(a, 'import', quand));
    var date = Utilities.formatDate(quand, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ' (JST)';
    proprietes.setProperty(SECRETS_ELIJAH_FAIT, date);
    var lignes = journalAnalyse(a, 'CONVERSION FAITE le ' + date + '.');
    lignes.push('Sauvegarde (onglet masqué, clic droit sur la barre des onglets → Afficher) : ' + sauvegarde);
    lignes.push('Le cache est vidé : les notes sont dans les Archives du Livre d\'ombre au prochain chargement.');
    journaliser(lignes);
    return { ok: true, analyse: a, sauvegarde: sauvegarde };
  } catch (err) {
    Logger.log('ERREUR pendant la conversion : ' + err + (touche ? ' — une partie a pu être écrite : l\'onglet « Sauvegarde Catalogues … » garde l\'état d\'avant.' : ' — rien n\'a été écrit.'));
    return { ok: false, erreur: String(err) };
  } finally {
    // As a hand edit does (a script's writes fire no onEdit): grimoire.gs's cache dropped, its version moved on.
    if (touche) {
      try {
        Grimoire.onEdit();
      } catch (err) {
        Logger.log('Le cache du grimoire n\'a pas pu être vidé (' + err + ') : lancer grimoireViderCache depuis l\'éditeur.');
      }
    }
    verrou.releaseLock();
  }
}

return {
  simuler: simuler,
  importer: importer,
};
})();
