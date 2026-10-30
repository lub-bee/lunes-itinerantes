/**
 * Grimoire de la Caravane — the caravan's Google Sheet, read and written by the grimoire's server.
 *
 * Paste this file in the sheet's Apps Script editor (Extensions → Apps Script), set the script
 * property JETON (Project Settings → Script properties) to the same value as COMMANDES_JETON on
 * Vercel, then deploy as a Web app (Execute as: Me, Who has access: Anyone). After any change:
 * Deploy → Manage deployments → edit → Version: New version (the /exec URL stays the same).
 * Setup: README.md.
 *
 * Every call is a POST of JSON carrying the shared token: { jeton, action, ... }.
 *
 *  - Sealed orders (unchanged since v2, no `action` needed): { jeton, commande } where commande is
 *      { numero, horodatage (ISO), vendeur, total, totalMini, totalIdeal, statut,
 *        prixGlobal?,
 *        lignes: [{ article, articleEn, quantite, prixUnitaire, prixMini, prixIdeal,
 *                   total, totalMini, totalIdeal, statut, sousPlancher, prixReel?, prixGlobal? }] }
 *    With a price agreed for the whole order (`prixGlobal`), each line's `total` / `prixReel` is its
 *    share of it, pro rata to its « total idéal ».
 *    One row per article in the "Commandes" tab.
 *
 *  - { action: 'lire' } → { ok, onglets: { membres, ressources, recettes, missives, mouvements, catalogue, commandes }, version, cache },
 *    each tab an array of objects keyed by the field names of ONGLETS below (missing tabs → []);
 *    served from the script's cache when it holds them (`cache: true`).
 *    With `missions: true` (v3m, the missions prototype) the answer — of 'lire' and of every write — also
 *    carries the missions' tabs (ONGLETS_MISSIONS: ponderation, reglagesMissions, demandes, missions,
 *    points). Without it, every answer is exactly what v3l answered: the grimoire in production never
 *    sees them.
 *    With `paie: true` (v3n, the pay) the answer also carries the pay's tabs (ONGLETS_PAIE: reglagesPaie,
 *    factures, evenements, ecrituresEvenement, clotures). Without it, exactly what v3m answered.
 *
 *  - Writes (one writer at a time, LockService):
 *      'missive'     { missive: { numero, horodatage, titre, commanditaire, echeance, membre,
 *                                 lignes: [{ produit, quantite }] } }        → one Missives row per line
 *      'releve' | 'depot' | 'fabrication' | 'livraison'
 *                    { mouvements: [{ horodatage, action, missive, membre, objet, quantite, note }] }
 *                                                                            → Mouvements rows (Type set from the action)
 *      'cloture'     { cloture: { numero, action, horodatage, membre, statut ('livrée' | 'inachevée'),
 *                                 recompense, partCommune, note, livraisons: [{ objet, quantite }],
 *                                 partage: [{ membre, montant, note }] } }
 *                                                                            → the missive's Missives rows closed,
 *                                                                              its 'livraison' rows (goods leaving the
 *                                                                              chest) and one 'partage' row per member
 *      'recette'     { recette: { produit, variante, usage, ancienProduit?, ancienneVariante?, en, rendement,
 *                                 artisan, note, ingredients: [{ ingredient, quantite }],
 *                                 nouvellesRessources?: [nom] } }             → that VARIANT's Recettes rows replaced,
 *                                                                              the product's other variants kept (v3g)
 *                                                                              (no ingredient = variant removed); the
 *                                                                              ingredients known nowhere added to
 *                                                                              Ressources, prices empty (v3f;
 *                                                                              answer: ressourcesAjoutees)
 *      'ressource'   { ressource: { nom, ancienNom?, en, origine, prix, bonneAffaire, note, lot } } (lot: v3j)
 *                                                                            → the Ressources row updated, or added
 *      'usage'       { usage: { produit, variante } }                    → « Usage » on that variant's rows only (v3g)
 *      'choix'       { choix: { numero, recettes } }                     → the missive's « Recettes » cell (v3g)
 *      'versement'   { versement: { numero, versee, montant, par, quand } } → the order's « Part versée » cells (v3i)
 *      'livre'       { livre: { fr, valeur } }                            → « Livre » on the article's Catalogues row and its
 *                                                                              Recettes rows (« Ombre » / empty) (v3l)
 *      'deplacer'    { deplacement: { fr, chapitre } }                     → the article's « Chapitre » cell (v3k)
 *      'retirer'     { retrait: { fr } }                                   → the article's Catalogues row deleted (v3k)
 *      'vente'       { article: { chapitre, fr, en, prod, min, max, artisan, note } }
 *                                                                            → one row added to the Catalogues tab
 *                                                                              (only its existing columns are filled;
 *                                                                              refused if the name is already there) (v3f)
 *    The missions (v3m; their tabs are created hidden when missing, nothing else is touched):
 *      'demande'     { demande: { numero, horodatage, membre, article, quantite, plancher, pointsRessources,
 *                                 pointsFabrication, note, missions: [{ numero, type, objet, quantite, poids,
 *                                 effort, points, note }] },
 *                      ponderation?: { lignes, reglages } }                  → one Demandes row, one Missions row per
 *                                                                              mission (« ouverte »); the pondération
 *                                                                              seeded when its tab is still empty
 *      'mission'     { mission: { numero, geste ('prendre' | 'rendre' | 'accomplir' | v3n: 'remettre' | 'confirmer' | 'refuser'),
 *                                 membre, quand, max?, raison?, note? } }
 *                                                                            v3n: 'remettre' (the holder) → « remise »;
 *                                                                              'confirmer' (another member) → « accomplie »,
 *                                                                              its Points row then; 'refuser' → « en cours »;
 *                                                                              'instancier' { demande, type, objet, quantite,
 *                                                                              poids, effort, points, max }: a take of a standing
 *                                                                              mission, a new row « en cours »; 'rendre' on
 *                                                                              such a take → « abandonnée »; with statut
 *                                                                              'remise': a free donation (« DON »), waiting for
 *                                                                              its confirmation (confirmed: a 'dépôt' row of
 *                                                                              Mouvements; refused: « refusée »)
 *                                                                            → the mission's row: taken (refused when
 *                                                                              not open, or when the member already
 *                                                                              holds `max`), given back (open again) or
 *                                                                              completed (one Points row, its points)
 *      'ponderation' { ponderation: { lignes: [{ genre, code, nom, poids, note }],
 *                                     reglages: [{ reglage, valeur, note }] } } → the Pondération and Réglages
 *                                                                              missions tabs rewritten
 *    The pay (v3n; its tabs are created hidden when missing, nothing else is touched):
 *      'paie'        { paie: { onglet ('reglagesPaie' | 'factures' | 'evenements' | 'ecrituresEvenement' | 'clotures'),
 *                              lignes: [{ id, ...fields }], supprimer?: [id], remplacer?: true,
 *                              mouvements?: [{ horodatage, action, missive, membre, objet, quantite, note }] } }
 *                                                                            → rows added or updated by their id (only
 *                                                                              the fields sent), removed, or the whole
 *                                                                              tab rewritten; `mouvements`: chest rows
 *                                                                              ('livraison', the lots of an event)
 *      'clotureSemaine' { cloture: { semaine, lignes: [{ id, ... }] } }        → the week's Clôtures rows (refused if the
 *                                                                              week is already sealed)
 *    Answer: { ok: true, ..., onglets, version } (every tab read again after the write, as for 'lire',
 *    so the grimoire needs no second call) or { ok: false, erreur }.
 *
 *  Every answer carries `ms`, the script's own execution time (Google's fixed overhead not included).
 */

/** Name of the tab receiving the orders (created when missing). */
var ONGLET = 'Commandes';

/**
 * ORDERS MAPPING — one entry per column, in sheet order: [header, value(commande, ligne)].
 * To match another sheet layout, reorder, rename or remove entries here; nothing else changes.
 */
var COLONNES = [
  ['Horodatage', function (c, l) { return new Date(c.horodatage); }],
  ['N° commande', function (c, l) { return c.numero; }],
  ['Vendeur', function (c, l) { return c.vendeur; }],
  ['Article', function (c, l) { return l.article; }],
  ['Quantité', function (c, l) { return l.quantite; }],
  ['Prix unitaire', function (c, l) { return l.prixUnitaire; }],
  ['Total ligne', function (c, l) { return l.total; }],
  ['Total mini', function (c, l) { return l.totalMini; }],
  ['Total idéal', function (c, l) { return l.totalIdeal; }],
  ['Prix réel vendu', function (c, l) { return l.prixReel !== undefined ? l.prixReel : l.total; }],
  ['Statut', function (c, l) { return l.statut; }],
  ['Total commande', function (c, l) { return c.total; }],
  // The price agreed for the whole order when there was one (lines then share it pro rata), else empty.
  ['Prix global', function (c, l) { return c.prixGlobal ? c.prixGlobal : ''; }],
  // Sold by the piece of a lot, or by the lot: « pièce (carquois de 80) », « carquois de 80 » (v3i).
  ['Unité', function (c, l) { return l.unite || ''; }],
  // A line typed by hand on the order sheet, outside the catalogue (v3i).
  ['Hors catalogue', function (c, l) { return l.horsCatalogue ? 'oui' : ''; }],
];

/**
 * MAPPING OF THE OTHER TABS — per tab: its name and its columns as [header, field, older headers?].
 * Headers are found by name (case, accents and punctuation ignored), so the columns may sit in any order;
 * a missing column is added at the end of row 1 on the first write. `lecture: true` marks a tab
 * the grimoire only reads (never written, no header created).
 */
var ONGLETS = {
  membres: {
    nom: 'Membres',
    lecture: true,
    colonnes: [['Nom', 'nom'], ['Rôle', 'role']],
  },
  ressources: {
    nom: 'Ressources',
    // Older headers still read: Catégorie / Sorte → Origine, Valeur → Prix courant.
    colonnes: [
      ['Ressource', 'nom'], ['Nom EN', 'en'], ['Origine', 'origine', ['Catégorie', 'Sorte']],
      ['Prix courant', 'prix', ['Valeur']], ['Bonne affaire', 'bonneAffaire'], ['Note', 'note'],
      // How many units the two prices buy (« 1 septim les 3 »); empty = 1 (v3j).
      ['Lot', 'lot', ['par', 'par lot', 'unités par lot', 'taille du lot', 'contenance']],
    ],
  },
  recettes: {
    nom: 'Recettes',
    // A product may have several recipes: « Variante » 1, 2, 3… (empty = 1); « Usage » (oui) marks the
    // usual one on its rows (none marked: variant 1).
    colonnes: [
      ['Produit', 'produit'], ['Produit EN', 'produitEn'], ['Ingrédient', 'ingredient'], ['Quantité', 'quantite'], ['Rendement', 'rendement'],
      ['Artisan', 'artisan'], ['Note', 'note'], ['Variante', 'variante'], ['Usage', 'usage'],
      // « Régulier » or empty / « Ombre »: a recipe of the Livre d'ombre (v3l; added at the end of row 1 on the first write).
      ['Livre', 'livre', ['registre', 'book']],
    ],
  },
  missives: {
    nom: 'Missives',
    colonnes: [
      ['N° missive', 'numero'], ['Écrite le', 'horodatage'], ['Titre', 'titre'], ['Commanditaire', 'commanditaire'],
      ['Échéance', 'echeance'], ['Statut', 'statut'], ['Produit', 'produit'], ['Quantité', 'quantite'],
      ['Écrite par', 'ecritePar'], ['Récompense', 'recompense'], ['Part commune (%)', 'partCommune'],
      ['Close le', 'closeLe'], ['Close par', 'closePar'], ['Note de clôture', 'noteCloture'],
      // The recipes chosen for this missive (same on every row of it): « Potion de vigueur=2; Rubis=acheter ».
      ['Recettes', 'recettes'],
    ],
  },
  /**
   * The price list the book shows (published as CSV, read by the grimoire every 5 minutes). Read here
   * too, so an article put up for sale shows at once; written only by 'vente', which fills the columns
   * the tab already has (its headers are never touched). Headers as in README « Accepted column names ».
   */
  catalogue: {
    nom: 'Catalogues',
    lecture: true,
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
      // Which book shows the row: « Régulier » or empty / « Ombre » (the Livre d'ombre) (v3l).
      ['Livre', 'livre', ['registre', 'book']],
    ],
  },
  /**
   * The sealed orders (written by `sceller`, one row per article), read so a member can see their own
   * sales (v3h). Never written here: the orders mapping is COLONNES above.
   */
  commandes: {
    nom: ONGLET,
    lecture: true,
    colonnes: [
      ['Horodatage', 'horodatage'], ['N° commande', 'numero'], ['Vendeur', 'vendeur'], ['Article', 'article'], ['Quantité', 'quantite'],
      ['Prix unitaire', 'prixUnitaire'], ['Total ligne', 'total'], ['Prix réel vendu', 'prixReel'], ['Statut', 'statut'], ['Total commande', 'totalCommande'],
      ['Unité', 'unite'], ['Hors catalogue', 'horsCatalogue'],
      // The caravan's share of the sale handed over to its coffer (v3i; written by 'versement' only).
      ['Part versée', 'versee'], ['Versée le', 'verseeLe'], ['Versée par', 'verseePar'], ['Montant versé', 'montantVerse'],
    ],
  },
  mouvements: {
    nom: 'Mouvements',
    colonnes: [
      ['Horodatage', 'horodatage'], ['N° action', 'action'], ['N° missive', 'missive'], ['Membre', 'membre'],
      ['Type', 'type'], ['Objet', 'objet'], ['Quantité', 'quantite'], ['Note', 'note'],
    ],
  },
};

/**
 * THE MISSIONS' TABS (v3m) — read and sent only to a caller that asks for them (`missions: true`). Created
 * on their first write, hidden (the sheet's owner can show them: right-click a tab → Show hidden sheets),
 * and editable by hand like the others (the Pondération and its settings are meant to be).
 */
var ONGLETS_MISSIONS = {
  ponderation: {
    nom: 'Pondération',
    // « classe » rows (a rarity level: Code R1…, Nom, « Par mission »; v3m's C1… with a « Poids » per unit are
    // read by the grimoire as the levels), « ressource » rows (Code = its level, « Origine », « Poids » an own
    // weight) and « lot » rows (an item's units per mission).
    colonnes: [['Genre', 'genre'], ['Code', 'code'], ['Nom', 'nom'], ['Poids', 'poids'], ['Note', 'note'],
      // v3n: rarity levels by quantity per mission (« classe » and « lot » rows), a resource's origin (a tag).
      ['Par mission', 'quantite'], ['Origine', 'origine']],
  },
  reglagesMissions: {
    nom: 'Réglages missions',
    colonnes: [['Réglage', 'reglage'], ['Valeur', 'valeur'], ['Note', 'note']],
  },
  demandes: {
    nom: 'Demandes',
    colonnes: [
      ['N° demande', 'numero'], ['Créée le', 'horodatage'], ['Créée par', 'membre'], ['Article', 'article'], ['Quantité', 'quantite'],
      ['Plancher', 'plancher'], ['Points ressources', 'pointsRessources'], ['Points fabrication', 'pointsFabrication'],
      ['Statut', 'statut'], ['Note', 'note'],
    ],
  },
  missions: {
    nom: 'Missions',
    colonnes: [
      ['N° mission', 'numero'], ['N° demande', 'demande'], ['Type', 'type'], ['Objet', 'objet'], ['Quantité', 'quantite'],
      ['Poids', 'poids'], ['Effort', 'effort'], ['Points', 'points'], ['Statut', 'statut'], ['Pris par', 'prisPar'],
      ['Pris le', 'prisLe'], ['Accomplie le', 'accomplieLe'], ['Note', 'note'], ['Journal', 'journal'],
      // v3n: the loot handed over, waiting for another member to confirm it (added at the end of row 1).
      ['Remise le', 'remiseLe'], ['Confirmée par', 'confirmePar'],
    ],
  },
  points: {
    nom: 'Points',
    colonnes: [['Date', 'horodatage'], ['Membre', 'membre'], ['Points', 'points'], ['Raison', 'raison'], ['N° mission', 'mission'], ['Confirmée par', 'confirmePar']],
  },
  /**
   * v3n: standing missions (« missions permanentes »): always open, each take an ordinary Missions row
   * (« N° demande » = the standing mission's id, « P-… »). Written by 'paie' (onglet 'permanentes').
   */
  permanentes: {
    nom: 'Missions permanentes',
    colonnes: [
      ['N° permanente', 'id'], ['Type', 'type'], ['Objet', 'objet'], ['Quantité', 'quantite'], ['Points', 'points'], ['Poids', 'poids'],
      ['Plafond par semaine', 'plafond'], ['Statut', 'statut'], ['Créée par', 'par'], ['Créée le', 'date'], ['Note', 'note'],
    ],
  },
};

/**
 * THE PAY'S TABS (v3n) — read and sent only to a caller that asks for them (`paie: true`). Created hidden on
 * their first write, editable by hand. `id` is each row's key (« F-261030-AB12 »…); the week is « S-2026-10-26 ».
 */
var ONGLETS_PAIE = {
  reglagesPaie: {
    nom: 'Réglages paie',
    colonnes: [['Réglage', 'reglage'], ['Valeur', 'valeur'], ['Note', 'note']],
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
  ecrituresEvenement: {
    nom: 'Écritures événements',
    colonnes: [
      ['N° écriture', 'id'], ['N° événement', 'evenement'], ['Date', 'date'], ['Genre', 'genre'], ['Libellé', 'libelle'], ['Montant', 'montant'],
      ['Membre', 'membre'], ['Objet', 'objet'], ['Quantité', 'quantite'], ['Statut', 'statut'], ['Payé par', 'payePar'], ['Payé le', 'payeLe'],
      ['Inscrite par', 'par'],
    ],
  },
  clotures: {
    nom: 'Clôtures',
    colonnes: [
      ['N° ligne', 'id'], ['Semaine', 'semaine'], ['Genre', 'genre'], ['Libellé', 'libelle'], ['Membre', 'membre'], ['Points', 'points'],
      ['Montant', 'montant'], ['Statut', 'statut'], ['Payé par', 'payePar'], ['Payé le', 'payeLe'], ['Scellée le', 'scelleeLe'],
      ['Scellée par', 'scelleePar'],
    ],
  },
};

/** Whether the current call asked for the missions' tabs (`missions: true`, v3m) and the pay's (`paie: true`, v3n). */
var AVEC_MISSIONS = false;
var AVEC_PAIE = false;

/** The tabs as the caller asked for them: without the missions' and the pay's ones, exactly v3l's answer. */
function pourAppelant(onglets) {
  if ((AVEC_MISSIONS && AVEC_PAIE) || !onglets) return onglets;
  var res = {};
  Object.keys(onglets).forEach(function (k) {
    if (ONGLETS_MISSIONS[k] && !AVEC_MISSIONS) return;
    if (ONGLETS_PAIE[k] && !AVEC_PAIE) return;
    res[k] = onglets[k];
  });
  return res;
}

/** Movement type written for each movement action. */
var TYPES_MOUVEMENT = { releve: 'relevé', depot: 'dépôt', fabrication: 'fabrication', livraison: 'livraison' };

/** Start of the current call (each answer carries its own execution time, `ms`). */
var DEBUT = 0;
/** Time of each step of the current call (ms), returned as `etapes` to see where the time goes. */
var ETAPES = {};
var DERNIERE = 0;
function etape(nom) {
  var t = Date.now();
  ETAPES[nom] = (ETAPES[nom] || 0) + (t - DERNIERE);
  DERNIERE = t;
}

function doPost(e) {
  DEBUT = Date.now();
  DERNIERE = DEBUT;
  ETAPES = {};
  var corps;
  try {
    corps = JSON.parse(e.postData.contents);
  } catch (err) {
    return repondre({ ok: false, erreur: 'invalid JSON' });
  }

  var attendu = PropertiesService.getScriptProperties().getProperty('JETON');
  if (!attendu || corps.jeton !== attendu) return repondre({ ok: false, erreur: 'bad token' });
  etape('jeton');

  var action = corps.action || (corps.commande ? 'commande' : '');
  AVEC_MISSIONS = Boolean(corps.missions);
  AVEC_PAIE = Boolean(corps.paie);
  if (action === 'lire') {
    try {
      // Served from the script's cache when it holds the tabs (kept up to date by every write).
      var enCache = lireCache();
      etape('cache_lu');
      if (enCache) return repondre({ ok: true, onglets: pourAppelant(enCache.onglets), version: enCache.version, cache: true });
      var onglets = toutLire();
      etape('feuille_lue');
      var version = versionCourante();
      mettreEnCache(onglets, version);
      etape('cache_ecrit');
      return repondre({ ok: true, onglets: pourAppelant(onglets), version: version, cache: false });
    } catch (err) {
      return repondre({ ok: false, erreur: String(err) });
    }
  }
  if (action === 'commande') return sceller(corps.commande);

  var ecrire = ECRITURES[action];
  if (!ecrire) return repondre({ ok: false, erreur: 'unknown action ' + action });
  return avecVerrou(function () { return ecrire(corps, action); }, true);
}

function doGet() {
  return repondre({ ok: true, message: 'Grimoire de la Caravane: POST only.' });
}

/* ───────────────────────── Orders (v2 behaviour, unchanged) ───────────────────────── */

function sceller(c) {
  if (!c || !c.lignes || !c.lignes.length) return repondre({ ok: false, erreur: 'empty order' });
  return avecVerrou(function () {
    var feuille = onglet();
    var lignes = c.lignes.map(function (l) {
      return COLONNES.map(function (col) { return col[1](c, l); });
    });
    feuille.getRange(feuille.getLastRow() + 1, 1, lignes.length, COLONNES.length).setValues(lignes);
    // The cached tabs hold the orders too (v3h): the next read takes them from the sheet.
    viderCache();
    nouvelleVersion();
    return { ok: true, numero: c.numero, lignes: lignes.length };
  }, false);
}

/**
 * The orders tab. If its first row is not our header row (empty tab, or anything else in row 1),
 * a header row is inserted above, so nothing already in the tab is overwritten. A header row that
 * only lacks the newest columns at its end (e.g. « Prix global ») gets them written in.
 */
function onglet() {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var feuille = classeur.getSheetByName(ONGLET) || classeur.insertSheet(ONGLET);
  var entetes = COLONNES.map(function (col) { return col[0]; });
  var premiere = feuille.getLastRow() === 0 ? [] : feuille.getRange(1, 1, 1, entetes.length).getValues()[0];
  var dejaLa = entetes.every(function (e, i) { return String(premiere[i] || '').trim() === e; });
  var debut = 0;
  while (debut < entetes.length && String(premiere[debut] || '').trim() === entetes[debut]) debut++;
  var resteVide = debut > 0 && entetes.slice(debut).every(function (e, i) { return String(premiere[debut + i] || '').trim() === ''; });
  if (!dejaLa && resteVide) {
    feuille.getRange(1, debut + 1, 1, entetes.length - debut).setValues([entetes.slice(debut)]).setFontWeight('bold');
    return feuille;
  }
  if (!dejaLa) {
    if (feuille.getLastRow() > 0) feuille.insertRowBefore(1);
    feuille.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
    feuille.setFrozenRows(1);
  }
  return feuille;
}

/* ───────────────────────── Reading ───────────────────────── */

function toutLire() {
  var res = {};
  Object.keys(ONGLETS).forEach(function (cle) { res[cle] = lireOnglet(ONGLETS[cle]); });
  // The missions' tabs (v3m): kept in the cache with the others, sent only to who asks (pourAppelant).
  Object.keys(ONGLETS_MISSIONS).forEach(function (cle) { res[cle] = lireOnglet(ONGLETS_MISSIONS[cle]); });
  // The pay's tabs (v3n), the same way (sent only with `paie: true`).
  Object.keys(ONGLETS_PAIE).forEach(function (cle) { res[cle] = lireOnglet(ONGLETS_PAIE[cle]); });
  return res;
}

/** Rows of a tab as objects { field: value }; blank rows skipped; a missing tab reads as []. */
function lireOnglet(def) {
  var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom);
  if (!feuille || feuille.getLastRow() < 2) return [];
  var valeurs = feuille.getDataRange().getValues();
  var index = indexColonnes(valeurs[0], def);
  var res = [];
  for (var r = 1; r < valeurs.length; r++) {
    var ligne = valeurs[r];
    if (!ligne.some(function (v) { return String(v).trim() !== ''; })) continue;
    var objet = {};
    def.colonnes.forEach(function (col) {
      var i = index[col[1]];
      objet[col[1]] = i >= 0 ? ligne[i] : '';
    });
    res.push(objet);
  }
  return res;
}

/** The Catalogues tab's « Livre » column: added at the end of row 1 (the owner's other headers untouched); its 0-based index. */
function colonneLivre(feuille) {
  var premiere = feuille.getRange(1, 1, 1, Math.max(feuille.getLastColumn(), 1)).getValues()[0];
  var fin = premiere.length;
  while (fin > 0 && String(premiere[fin - 1]).trim() === '') fin--;
  feuille.getRange(1, fin + 1).setValue('Livre').setFontWeight('bold');
  return fin;
}

/** Comparable header: lower case, no accents, letters and digits only. */
function cleEntete(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\u0153/g, 'oe').replace(/\u00e6/g, 'ae').replace(/[^a-z0-9]+/g, '');
}

/** 0-based column of each field in a header row (-1 when absent); older header names count too. */
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

/* ───────────────────────── Writing ───────────────────────── */

/**
 * Runs one write under the script lock (two members writing together must not overwrite each other's
 * rows), then answers with every tab read afresh, so the grimoire needs no second call to see it.
 * Sealed orders keep their v2 answer (no tabs).
 */
function avecVerrou(f, avecOnglets) {
  var verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(20000);
  } catch (err) {
    return repondre({ ok: false, erreur: 'sheet busy' });
  }
  etape('verrou');
  var res;
  try {
    res = f();
    etape('ecriture');
    // Inside the lock: a new version, the tabs read afresh and cached, so the answer and the cache
    // always hold the latest state (two writes cannot cache each other's older tabs).
    if (avecOnglets && res.ok) {
      res.version = nouvelleVersion();
      etape('version');
      var enCache = res.maj ? lireCache() : null;
      etape('cache_lu');
      if (enCache) {
        // The cache went through JSON: dates are strings there; so do the new rows.
        res.maj(enCache.onglets);
        res.onglets = JSON.parse(JSON.stringify(enCache.onglets));
        res.cache = true;
      } else {
        res.onglets = toutLire();
        res.cache = false;
      }
      delete res.maj;
      etape('onglets');
      mettreEnCache(res.onglets, res.version);
      etape('cache_ecrit');
      res.onglets = pourAppelant(res.onglets);
    }
  } catch (err) {
    viderCache();
    return repondre({ ok: false, erreur: String(err) });
  } finally {
    verrou.releaseLock();
  }
  return repondre(res);
}

/* ───────────────────────── Version and cache ───────────────────────── */

/**
 * The registre's version (script property VERSION): +1 on every write and every hand edit of the
 * sheet. The grimoire compares it with what a reader has already seen to know when its own cache is
 * too old.
 */
function versionCourante() {
  return Number(PropertiesService.getScriptProperties().getProperty('VERSION') || 0);
}
function nouvelleVersion() {
  var v = versionCourante() + 1;
  PropertiesService.getScriptProperties().setProperty('VERSION', String(v));
  return v;
}

/**
 * Every tab, as JSON, kept in the script's cache (CacheService) so a read does not open the sheet.
 * Values are limited to 100 KB, so the JSON is cut in pieces. Kept 10 minutes at most; any write
 * replaces it, a hand edit (onEdit) drops it. After importing a CSV (which may not count as an edit),
 * run `viderCache` from the editor, or wait 10 minutes.
 */
// The cache key carries the script's version: a new version never serves an older version's tabs.
var CACHE = 'registre-v3n';
var CACHE_DUREE = 600;
var CACHE_PART = 90000;

function mettreEnCache(onglets, version) {
  try {
    var json = JSON.stringify({ onglets: onglets, version: version });
    var parts = {};
    var n = Math.ceil(json.length / CACHE_PART);
    for (var i = 0; i < n; i++) parts[CACHE + '_' + i] = json.slice(i * CACHE_PART, (i + 1) * CACHE_PART);
    parts[CACHE + '_n'] = String(n);
    CacheService.getScriptCache().putAll(parts, CACHE_DUREE);
  } catch (err) {
    viderCache();
  }
}

/** Up to this many pieces are fetched in one call (more, in a second one). */
var CACHE_PIECES = 8;

function lireCache() {
  var cache = CacheService.getScriptCache();
  var cles = [CACHE + '_n'];
  for (var i = 0; i < CACHE_PIECES; i++) cles.push(CACHE + '_' + i);
  var parts = cache.getAll(cles);
  var n = Number(parts[CACHE + '_n'] || 0);
  if (!n) return null;
  if (n > CACHE_PIECES) {
    var reste = [];
    for (var r = CACHE_PIECES; r < n; r++) reste.push(CACHE + '_' + r);
    var plus = cache.getAll(reste);
    Object.keys(plus).forEach(function (k) { parts[k] = plus[k]; });
  }
  var json = '';
  for (var k = 0; k < n; k++) {
    var morceau = parts[CACHE + '_' + k];
    if (morceau === undefined || morceau === null) return null;
    json += morceau;
  }
  try {
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

function viderCache() {
  CacheService.getScriptCache().remove(CACHE + '_n');
}

/** Simple trigger: a hand edit of the sheet drops the cached tabs and moves the version on. */
function onEdit() {
  viderCache();
  nouvelleVersion();
}

/**
 * A writable tab and the 1-based column of each field. Created with its header row when missing;
 * an empty row 1 gets the header row; missing headers are added at the end of row 1; a row 1 that
 * holds none of our headers gets a header row inserted above it (nothing is overwritten).
 */
function preparer(def) {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var feuille = classeur.getSheetByName(def.nom) || classeur.insertSheet(def.nom);
  var entetes = def.colonnes.map(function (col) { return col[0]; });
  var largeur = Math.max(feuille.getLastColumn(), 1);
  var dernier = feuille.getLastRow();
  var premiere = dernier === 0 ? [] : feuille.getRange(1, 1, 1, largeur).getValues()[0];
  var index = indexColonnes(premiere, def);
  var connues = def.colonnes.filter(function (col) { return index[col[1]] >= 0; }).length;
  var vide = !premiere.some(function (v) { return String(v).trim() !== ''; });
  if (vide || connues === 0) {
    if (!vide) {
      feuille.insertRowBefore(1);
      dernier++;
    }
    if (dernier === 0) dernier = 1;
    feuille.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
    feuille.setFrozenRows(1);
    premiere = entetes.slice();
  } else if (connues < def.colonnes.length) {
    var fin = premiere.length;
    while (fin > 0 && String(premiere[fin - 1]).trim() === '') fin--;
    var ajout = def.colonnes.filter(function (col) { return index[col[1]] < 0; }).map(function (col) { return col[0]; });
    feuille.getRange(1, fin + 1, 1, ajout.length).setValues([ajout]).setFontWeight('bold');
    premiere = premiere.slice(0, fin).concat(ajout);
  }
  var cols = {};
  var idx = indexColonnes(premiere, def);
  var large = 0;
  Object.keys(idx).forEach(function (k) {
    cols[k] = idx[k] + 1;
    large = Math.max(large, cols[k]);
  });
  return { feuille: feuille, cols: cols, largeur: large, derniere: dernier };
}

/** An object as a row of `largeur` cells (each field in its own column, other cells left blank). */
function enLigne(p, o, base) {
  var ligne = base ? base.slice() : [];
  for (var i = ligne.length; i < p.largeur; i++) ligne.push('');
  Object.keys(o).forEach(function (k) { if (p.cols[k]) ligne[p.cols[k] - 1] = o[k]; });
  return ligne.slice(0, Math.max(p.largeur, ligne.length));
}

/** Appends objects as rows, in one call. */
function ajouter(def, objets, p) {
  if (!objets.length) return 0;
  p = p || preparer(def);
  var lignes = objets.map(function (o) { return enLigne(p, o).slice(0, p.largeur); });
  var derniere = p.derniere || p.feuille.getLastRow();
  p.feuille.getRange(derniere + 1, 1, lignes.length, p.largeur).setValues(lignes);
  return lignes.length;
}

/**
 * A writable tab read in ONE call (header and rows together), for the writes that rewrite rows in
 * place. Falls back to `preparer` + `donnees` when the header is missing columns (first write).
 */
function ouvrir(def) {
  var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom);
  if (feuille && feuille.getLastRow() > 0) {
    var tout = feuille.getDataRange().getValues();
    var idx = indexColonnes(tout[0], def);
    var complet = def.colonnes.every(function (col) { return idx[col[1]] >= 0; });
    if (complet) {
      var cols = {};
      var large = 0;
      Object.keys(idx).forEach(function (k) {
        cols[k] = idx[k] + 1;
        large = Math.max(large, cols[k]);
      });
      var p = { feuille: feuille, cols: cols, largeur: large, derniere: tout.length };
      var lignes = tout.slice(1).map(function (l) { return l.slice(0, large); });
      return { p: p, lignes: lignes };
    }
  }
  var p2 = preparer(def);
  return { p: p2, lignes: donnees(p2) };
}

/** The data rows of a tab (row 2 onwards), `largeur` cells each, in one call. */
function donnees(p) {
  var dernier = p.feuille.getLastRow();
  if (dernier < 2) return [];
  return p.feuille.getRange(2, 1, dernier - 1, p.largeur).getValues();
}

/** Whether a row's `champ` matches one of `valeurs` (compared like headers). */
function correspond(p, ligne, champ, valeurs) {
  if (!p.cols[champ]) return false;
  var v = cleEntete(ligne[p.cols[champ] - 1]);
  return valeurs.some(function (x) { return x && cleEntete(x) === v; });
}

/** An object holding every field of a tab ('' for the missing ones), as `lireOnglet` returns rows. */
function complet(def, o) {
  var res = {};
  def.colonnes.forEach(function (col) { res[col[1]] = o[col[1]] === undefined || o[col[1]] === null ? '' : o[col[1]]; });
  return res;
}

/*
 * Each write returns `maj(onglets)`: the same change applied to the cached tabs, so the answer is
 * built without reading the sheet again (when the cache is empty, the tabs are read instead).
 */

function mouvements(corps, action) {
  var ms = corps.mouvements || [];
  if (!ms.length) return { ok: false, erreur: 'no movement' };
  var type = TYPES_MOUVEMENT[action];
  var rangs = ms.map(function (m) {
    return {
      horodatage: new Date(m.horodatage), action: m.action || '', missive: m.missive || '', membre: m.membre,
      type: type, objet: m.objet, quantite: m.quantite, note: m.note || '',
    };
  });
  var n = ajouter(ONGLETS.mouvements, rangs);
  return {
    ok: true, lignes: n,
    maj: function (o) { rangs.forEach(function (x) { o.mouvements.push(complet(ONGLETS.mouvements, x)); }); },
  };
}

var ECRITURES = {
  missive: function (corps) {
    var m = corps.missive;
    if (!m || !m.numero || !m.lignes || !m.lignes.length) return { ok: false, erreur: 'empty missive' };
    var rangs = m.lignes.map(function (l) {
      return {
        numero: m.numero, horodatage: new Date(m.horodatage), titre: m.titre, commanditaire: m.commanditaire || '',
        echeance: m.echeance || '', statut: 'en cours', produit: l.produit, quantite: l.quantite, ecritePar: m.membre,
      };
    });
    var n = ajouter(ONGLETS.missives, rangs);
    return {
      ok: true, numero: m.numero, lignes: n,
      maj: function (o) { rangs.forEach(function (x) { o.missives.push(complet(ONGLETS.missives, x)); }); },
    };
  },

  releve: mouvements,
  depot: mouvements,
  fabrication: mouvements,
  livraison: mouvements,

  /** Closes a missive: livrée (its deliveries recorded) or inachevée; the reward's split as 'partage' rows. */
  cloture: function (corps) {
    var c = corps.cloture;
    if (!c || !c.numero) return { ok: false, erreur: 'no missive' };
    var o = ouvrir(ONGLETS.missives);
    var p = o.p;
    var lignes = o.lignes;
    var quand = new Date(c.horodatage);
    var touchees = 0;
    var deja = lignes.some(function (l) {
      return correspond(p, l, 'numero', [c.numero]) && cleEntete(l[p.cols.statut - 1]) !== cleEntete('en cours') && String(l[p.cols.statut - 1]).trim() !== '';
    });
    if (deja) return { ok: false, erreur: 'already closed ' + c.numero };
    var fermeture = {
      statut: c.statut || 'livrée', recompense: c.recompense, partCommune: c.partCommune,
      closeLe: quand, closePar: c.membre, noteCloture: c.note || '',
    };
    lignes.forEach(function (l, i) {
      if (!correspond(p, l, 'numero', [c.numero])) return;
      lignes[i] = enLigne(p, fermeture, l);
      touchees++;
    });
    if (!touchees) return { ok: false, erreur: 'unknown missive ' + c.numero };
    p.feuille.getRange(2, 1, lignes.length, p.largeur).setValues(lignes);
    var livraisons = (c.livraisons || []).map(function (m) {
      return { horodatage: quand, action: c.action || '', missive: c.numero, membre: c.membre, type: 'livraison', objet: m.objet, quantite: m.quantite, note: m.note || '' };
    });
    var partage = (c.partage || []).map(function (x) {
      return { horodatage: quand, action: c.action || '', missive: c.numero, membre: x.membre, type: 'partage', objet: 'Septims', quantite: x.montant, note: x.note || '' };
    });
    var rangs = livraisons.concat(partage);
    ajouter(ONGLETS.mouvements, rangs);
    return {
      ok: true, numero: c.numero,
      maj: function (o) {
        o.missives.forEach(function (x) {
          if (cleEntete(x.numero) !== cleEntete(c.numero)) return;
          Object.keys(fermeture).forEach(function (k) { x[k] = fermeture[k]; });
        });
        rangs.forEach(function (x) { o.mouvements.push(complet(ONGLETS.mouvements, x)); });
      },
    };
  },

  /**
   * Writes ONE recipe of a product (its variant): that variant's rows are replaced, the product's other
   * variants are left alone (no ingredient = that variant removed; numbers are never shifted). Moved
   * from another name (`ancienProduit`, `ancienneVariante`), the old variant's rows go.
   */
  recette: function (corps) {
    var r = corps.recette;
    if (!r || !r.produit) return { ok: false, erreur: 'no product' };
    var variante = Number(r.variante) || 1;
    var ancienne = { produit: cleEntete(r.ancienProduit || r.produit), variante: Number(r.ancienneVariante) || variante };
    var o = ouvrir(ONGLETS.recettes);
    var p = o.p;
    var lignes = o.lignes;
    var varianteDe = function (v) { return Number(v) || 1; };
    var estVisee = function (produit, v) {
      var k = cleEntete(produit);
      v = varianteDe(v);
      return (k === ancienne.produit && v === ancienne.variante) || (k === cleEntete(r.produit) && v === variante);
    };
    var cellule = function (l, champ) { return p.cols[champ] ? l[p.cols[champ] - 1] : ''; };
    var gardees = lignes.filter(function (l) { return !estVisee(cellule(l, 'produit'), cellule(l, 'variante')); });
    // The usual recipe is one per product: marking this one clears the others' mark.
    if (r.usage && p.cols.usage) {
      gardees.forEach(function (l) { if (cleEntete(cellule(l, 'produit')) === cleEntete(r.produit)) l[p.cols.usage - 1] = ''; });
    }
    var objets = (r.ingredients || []).map(function (ing) {
      return {
        produit: r.produit, produitEn: r.en || '', ingredient: ing.ingredient, quantite: ing.quantite, rendement: r.rendement || 1,
        artisan: r.artisan || '', note: r.note || '', variante: variante, usage: r.usage ? 'oui' : '', livre: r.livre || '',
      };
    });
    var nouvelles = objets.map(function (x) { return enLigne(p, x); });
    var toutes = gardees.concat(nouvelles);
    if (lignes.length) p.feuille.getRange(2, 1, lignes.length, p.largeur).clearContent();
    if (toutes.length) p.feuille.getRange(2, 1, toutes.length, p.largeur).setValues(toutes);
    // Ingredients known nowhere (the grimoire names them) join the raw materials, prices empty.
    var ajoutees = [];
    var demandees = r.nouvellesRessources || [];
    if (demandees.length) {
      var res = ouvrir(ONGLETS.ressources);
      var deja = {};
      res.lignes.forEach(function (l) {
        ['nom', 'en'].forEach(function (k) { if (res.p.cols[k]) deja[cleEntete(l[res.p.cols[k] - 1])] = true; });
      });
      demandees.forEach(function (nom) {
        var k = cleEntete(nom);
        if (!k || deja[k]) return;
        deja[k] = true;
        ajoutees.push({ nom: nom, en: '', origine: '', prix: '', bonneAffaire: '', note: '' });
      });
      ajouter(ONGLETS.ressources, ajoutees, res.p);
    }
    return {
      ok: true, produit: r.produit, variante: variante, lignes: nouvelles.length,
      ressourcesAjoutees: ajoutees.map(function (x) { return x.nom; }),
      maj: function (o) {
        o.recettes = o.recettes.filter(function (x) { return !estVisee(x.produit, x.variante); });
        if (r.usage) o.recettes.forEach(function (x) { if (cleEntete(x.produit) === cleEntete(r.produit)) x.usage = ''; });
        objets.forEach(function (x) { o.recettes.push(complet(ONGLETS.recettes, x)); });
        ajoutees.forEach(function (x) { o.ressources.push(complet(ONGLETS.ressources, x)); });
      },
    };
  },

  /** A product's usual recipe: « Usage » set on that variant's rows, cleared on the others (one call). */
  usage: function (corps) {
    var u = corps.usage;
    if (!u || !u.produit) return { ok: false, erreur: 'no product' };
    var variante = Number(u.variante) || 1;
    var o = ouvrir(ONGLETS.recettes);
    var p = o.p;
    var lignes = o.lignes;
    var k = cleEntete(u.produit);
    var trouvee = false;
    lignes.forEach(function (l) {
      if (cleEntete(l[p.cols.produit - 1]) !== k) return;
      var v = Number(l[p.cols.variante - 1]) || 1;
      l[p.cols.usage - 1] = v === variante ? 'oui' : '';
      if (v === variante) trouvee = true;
    });
    if (!trouvee) return { ok: false, erreur: 'unknown recipe ' + u.produit + ' ' + variante };
    p.feuille.getRange(2, 1, lignes.length, p.largeur).setValues(lignes);
    return {
      ok: true, produit: u.produit, variante: variante,
      maj: function (o) {
        o.recettes.forEach(function (x) {
          if (cleEntete(x.produit) === k) x.usage = (Number(x.variante) || 1) === variante ? 'oui' : '';
        });
      },
    };
  },

  /** A missive's recipe choices (« Recettes » on every row of it), in one call. */
  choix: function (corps) {
    var c = corps.choix;
    if (!c || !c.numero) return { ok: false, erreur: 'no missive' };
    var o = ouvrir(ONGLETS.missives);
    var p = o.p;
    var lignes = o.lignes;
    var touchees = 0;
    lignes.forEach(function (l, i) {
      if (!correspond(p, l, 'numero', [c.numero])) return;
      lignes[i] = enLigne(p, { recettes: c.recettes || '' }, l);
      touchees++;
    });
    if (!touchees) return { ok: false, erreur: 'unknown missive ' + c.numero };
    p.feuille.getRange(2, 1, lignes.length, p.largeur).setValues(lignes);
    return {
      ok: true, numero: c.numero,
      maj: function (o) {
        o.missives.forEach(function (x) { if (cleEntete(x.numero) === cleEntete(c.numero)) x.recettes = c.recettes || ''; });
      },
    };
  },

  /** Updates a resource's row, or adds it (one call either way). */
  ressource: function (corps) {
    var r = corps.ressource;
    if (!r || !r.nom) return { ok: false, erreur: 'no resource' };
    var o = ouvrir(ONGLETS.ressources);
    var p = o.p;
    var nombre = function (v) { return v === null || v === undefined ? '' : v; };
    var lot = Number(r.lot) || 1;
    var valeurs = { nom: r.nom, en: r.en || '', origine: r.origine || '', prix: nombre(r.prix), bonneAffaire: nombre(r.bonneAffaire), note: r.note || '', lot: lot > 1 ? lot : '' };
    var cible = cleEntete(r.ancienNom || r.nom);
    var maj = function (o) {
      var trouvee = false;
      o.ressources.forEach(function (x, i) {
        if (trouvee || cleEntete(x.nom) !== cible) return;
        var y = complet(ONGLETS.ressources, x);
        Object.keys(valeurs).forEach(function (k) { y[k] = valeurs[k]; });
        o.ressources[i] = y;
        trouvee = true;
      });
      if (!trouvee) o.ressources.push(complet(ONGLETS.ressources, valeurs));
    };
    var lignes = o.lignes;
    for (var i = 0; i < lignes.length; i++) {
      if (!correspond(p, lignes[i], 'nom', [r.ancienNom || r.nom])) continue;
      p.feuille.getRange(i + 2, 1, 1, p.largeur).setValues([enLigne(p, valeurs, lignes[i])]);
      return { ok: true, nom: r.nom, ajoutee: false, maj: maj };
    }
    ajouter(ONGLETS.ressources, [valeurs], p);
    return { ok: true, nom: r.nom, ajoutee: true, maj: maj };
  },

  /**
   * The caravan's share of a sealed order handed over (or taken back): « Part versée », « Versée le »,
   * « Versée par », « Montant versé » on every row of the order. The orders' own columns are made sure
   * first (so these come after them), then these are added at the end of row 1 if missing.
   */
  versement: function (corps) {
    var v = corps.versement;
    if (!v || !v.numero) return { ok: false, erreur: 'no order' };
    onglet();
    var o = ouvrir(ONGLETS.commandes);
    var p = o.p;
    var lignes = o.lignes;
    var valeurs = v.versee
      ? { versee: 'oui', verseeLe: new Date(v.quand || Date.now()), verseePar: v.par || '', montantVerse: v.montant === null || v.montant === undefined ? '' : v.montant }
      : { versee: '', verseeLe: '', verseePar: '', montantVerse: '' };
    var touchees = 0;
    lignes.forEach(function (l, i) {
      if (!correspond(p, l, 'numero', [v.numero])) return;
      lignes[i] = enLigne(p, valeurs, l);
      touchees++;
    });
    if (!touchees) return { ok: false, erreur: 'unknown order ' + v.numero };
    p.feuille.getRange(2, 1, lignes.length, p.largeur).setValues(lignes);
    return {
      ok: true, numero: v.numero,
      maj: function (o) {
        (o.commandes || []).forEach(function (x) {
          if (cleEntete(x.numero) !== cleEntete(v.numero)) return;
          Object.keys(valeurs).forEach(function (k) { x[k] = valeurs[k]; });
        });
      },
    };
  },

  /** An article of the catalogue moved to another chapter (its « Chapitre » cell), found by its name (v3k). */
  deplacer: function (corps) {
    var d = corps.deplacement;
    if (!d || !d.fr || !d.chapitre) return { ok: false, erreur: 'no article' };
    var def = ONGLETS.catalogue;
    var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom);
    if (!feuille || feuille.getLastRow() < 2) return { ok: false, erreur: 'no catalogue tab' };
    var tout = feuille.getDataRange().getValues();
    var idx = indexColonnes(tout[0], def);
    if (idx.fr < 0 || idx.chapitre < 0) return { ok: false, erreur: 'no catalogue chapter column' };
    var k = cleEntete(d.fr);
    for (var r = 1; r < tout.length; r++) {
      if (cleEntete(tout[r][idx.fr]) !== k) continue;
      feuille.getRange(r + 1, idx.chapitre + 1).setValue(d.chapitre);
      return {
        ok: true, article: d.fr,
        maj: function (o) {
          var vu = false;
          (o.catalogue = o.catalogue || []).forEach(function (x) { if (cleEntete(x.fr) === k) { x.chapitre = d.chapitre; vu = true; } });
          if (!vu) {
            var ligne = {};
            def.colonnes.forEach(function (col) { ligne[col[1]] = idx[col[1]] >= 0 ? tout[r][idx[col[1]]] : ''; });
            ligne.chapitre = d.chapitre;
            o.catalogue.push(ligne);
          }
        },
      };
    }
    return { ok: false, erreur: 'unknown article ' + d.fr };
  },

  /**
   * Which book shows an article and its recipe(s): « Livre » set to `valeur` (« Ombre » or empty) on the
   * article's Catalogues row (the column added at the end of row 1 if missing) and on every Recettes row of
   * the product (v3l). Either may be absent (an article without recipe, a recipe not for sale).
   */
  livre: function (corps) {
    var l = corps.livre;
    if (!l || !l.fr) return { ok: false, erreur: 'no article' };
    var valeur = l.valeur || '';
    var k = cleEntete(l.fr);
    var trouve = 0;
    var def = ONGLETS.catalogue;
    var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom);
    if (feuille && feuille.getLastRow() >= 2) {
      var tout = feuille.getDataRange().getValues();
      var idx = indexColonnes(tout[0], def);
      if (idx.fr >= 0) {
        for (var r = 1; r < tout.length; r++) {
          if (cleEntete(tout[r][idx.fr]) !== k) continue;
          if (idx.livre < 0) idx.livre = colonneLivre(feuille);
          feuille.getRange(r + 1, idx.livre + 1).setValue(valeur);
          trouve++;
        }
      }
    }
    var o = ouvrir(ONGLETS.recettes);
    var p = o.p;
    var lignes = o.lignes;
    var touchees = 0;
    lignes.forEach(function (ligne) {
      if (cleEntete(ligne[p.cols.produit - 1]) !== k) return;
      ligne[p.cols.livre - 1] = valeur;
      touchees++;
    });
    if (touchees) p.feuille.getRange(2, 1, lignes.length, p.largeur).setValues(lignes);
    if (!trouve && !touchees) return { ok: false, erreur: 'unknown article ' + l.fr };
    return {
      ok: true, article: l.fr, catalogue: trouve, recettes: touchees,
      maj: function (o) {
        (o.catalogue || []).forEach(function (x) { if (cleEntete(x.fr) === k) x.livre = valeur; });
        (o.recettes || []).forEach(function (x) { if (cleEntete(x.produit) === k) x.livre = valeur; });
      },
    };
  },

  /** An article taken out of the catalogue: its Catalogues row deleted, found by its name (v3k). */
  retirer: function (corps) {
    var d = corps.retrait;
    if (!d || !d.fr) return { ok: false, erreur: 'no article' };
    var def = ONGLETS.catalogue;
    var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom);
    if (!feuille || feuille.getLastRow() < 2) return { ok: false, erreur: 'no catalogue tab' };
    var tout = feuille.getDataRange().getValues();
    var idx = indexColonnes(tout[0], def);
    if (idx.fr < 0) return { ok: false, erreur: 'no catalogue article column' };
    var k = cleEntete(d.fr);
    for (var r = tout.length - 1; r >= 1; r--) {
      if (cleEntete(tout[r][idx.fr]) !== k) continue;
      feuille.deleteRow(r + 1);
      return {
        ok: true, article: d.fr,
        maj: function (o) { o.catalogue = (o.catalogue || []).filter(function (x) { return cleEntete(x.fr) !== k; }); },
      };
    }
    return { ok: false, erreur: 'unknown article ' + d.fr };
  },

  /** A product put up for sale: one Catalogues row, in the columns the tab already has. */
  vente: function (corps) {
    var a = corps.article;
    if (!a || !a.fr) return { ok: false, erreur: 'no article' };
    var def = ONGLETS.catalogue;
    var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom);
    if (!feuille || feuille.getLastRow() < 1) return { ok: false, erreur: 'no catalogue tab' };
    var tout = feuille.getDataRange().getValues();
    var idx = indexColonnes(tout[0], def);
    if (idx.fr < 0) return { ok: false, erreur: 'no catalogue article column' };
    var noms = [a.fr, a.en].filter(function (x) { return x; }).map(cleEntete);
    for (var r = 1; r < tout.length; r++) {
      var vus = [idx.fr, idx.en].filter(function (i) { return i >= 0; }).map(function (i) { return cleEntete(tout[r][i]); });
      if (vus.some(function (v) { return v && noms.indexOf(v) >= 0; })) return { ok: false, erreur: 'already in catalogue' };
    }
    var nombre = function (v) { return v === null || v === undefined ? '' : v; };
    var valeurs = { chapitre: a.chapitre || '', fr: a.fr, en: a.en || '', prod: nombre(a.prod), min: nombre(a.min), max: nombre(a.max), artisan: a.artisan || '', note: a.note || '', livre: a.livre || '' };
    if (a.livre && idx.livre < 0) idx.livre = colonneLivre(feuille);
    var largeur = Math.max(feuille.getLastColumn(), 1);
    var ligne = [];
    for (var c = 0; c < largeur; c++) ligne.push('');
    Object.keys(valeurs).forEach(function (k) { if (idx[k] >= 0) ligne[idx[k]] = valeurs[k]; });
    feuille.getRange(tout.length + 1, 1, 1, largeur).setValues([ligne]);
    return {
      ok: true, article: a.fr,
      maj: function (o) {
        o.catalogue = o.catalogue || [];
        o.catalogue.push(complet(def, valeurs));
      },
    };
  },

  /* ── The missions (v3m) ── */

  /** A demand for merchandise and its missions (all « ouverte »); the pondération seeded if its tab is empty. */
  demande: function (corps) {
    var d = corps.demande;
    if (!d || !d.numero || !d.missions || !d.missions.length) return { ok: false, erreur: 'empty demand' };
    var M = ONGLETS_MISSIONS;
    var rangD = {
      numero: d.numero, horodatage: new Date(d.horodatage), membre: d.membre || '', article: d.article, quantite: d.quantite,
      plancher: nombreOuVide(d.plancher), pointsRessources: d.pointsRessources || 0, pointsFabrication: d.pointsFabrication || 0,
      statut: 'ouverte', note: d.note || '',
    };
    var rangs = d.missions.map(function (m) {
      return {
        numero: m.numero, demande: d.numero, type: m.type, objet: m.objet, quantite: m.quantite, poids: nombreOuVide(m.poids),
        effort: m.effort, points: m.points, statut: 'ouverte', prisPar: '', prisLe: '', accomplieLe: '', note: m.note || '', journal: '',
      };
    });
    ajouter(M.demandes, [rangD], preparerMasque(M.demandes));
    ajouter(M.missions, rangs, preparerMasque(M.missions));
    var graine = corps.ponderation && ongletVide(M.ponderation) ? ecrirePonderation(corps.ponderation) : null;
    return {
      ok: true, numero: d.numero, missions: rangs.length, ponderationSemee: Boolean(graine),
      maj: function (o) {
        (o.demandes = o.demandes || []).push(complet(M.demandes, rangD));
        o.missions = o.missions || [];
        rangs.forEach(function (x) { o.missions.push(complet(M.missions, x)); });
        if (graine) {
          o.ponderation = graine.lignes.map(function (x) { return complet(M.ponderation, x); });
          o.reglagesMissions = graine.reglages.map(function (x) { return complet(M.reglagesMissions, x); });
        }
      },
    };
  },

  /**
   * One gesture on a mission, checked here under the lock (two members cannot take the same one):
   * 'prendre' (it must be open; the member may hold at most `max` « en cours »), 'rendre' and 'accomplir'
   * (it must be « en cours » in that member's paws). Completed, its points go to a Points row.
   */
  mission: function (corps) {
    var g = corps.mission;
    if (!g || !g.numero || !g.geste) return { ok: false, erreur: 'no mission' };
    var M = ONGLETS_MISSIONS;
    var o = ouvrirMasque(M.missions);
    var p = o.p;
    var lignes = o.lignes;
    var cellule = function (l, champ) { return p.cols[champ] ? l[p.cols[champ] - 1] : ''; };
    if (g.geste === 'instancier') {
      // v3n: a take of a standing mission: a new row « en cours », for that member (within his limit).
      var membreI = cleEntete(g.membre);
      var tenuesI = lignes.filter(function (l) {
        return cleEntete(cellule(l, 'statut')) === 'encours' && cleEntete(cellule(l, 'prisPar')) === membreI;
      }).length;
      // A free donation (statut « remise ») is declared already handed over: no limit.
      var don = g.statut === 'remise';
      if (!don && g.max && tenuesI >= Number(g.max)) return { ok: false, erreur: 'too many missions' };
      var quandI = new Date(g.quand || Date.now());
      var rang = {
        numero: g.numero, demande: g.demande, type: g.type, objet: g.objet, quantite: g.quantite, poids: nombreOuVide(g.poids), effort: g.effort || '',
        points: g.points, statut: don ? 'remise' : 'en cours', prisPar: g.membre, prisLe: quandI, accomplieLe: '', note: g.note || '',
        remiseLe: don ? quandI : '',
        journal: (don ? 'don déclaré par ' : 'prise par ') + g.membre + ' le ' + Utilities.formatDate(quandI, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
      };
      ajouter(M.missions, [rang], p);
      return {
        ok: true, numero: g.numero, geste: g.geste,
        maj: function (o2) { (o2.missions = o2.missions || []).push(complet(M.missions, rang)); },
      };
    }
    var i = -1;
    for (var r = 0; r < lignes.length; r++) {
      if (cleEntete(cellule(lignes[r], 'numero')) === cleEntete(g.numero)) { i = r; break; }
    }
    if (i < 0) return { ok: false, erreur: 'unknown mission ' + g.numero };
    var ligne = lignes[i];
    var statut = cleEntete(cellule(ligne, 'statut'));
    var membre = cleEntete(g.membre);
    var tient = statut === 'encours' && cleEntete(cellule(ligne, 'prisPar')) === membre;
    var quand = new Date(g.quand || Date.now());
    var jour = Utilities.formatDate(quand, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    var journal = String(cellule(ligne, 'journal') || '');
    var noter = function (mot) { return (journal ? journal + ' · ' : '') + mot + ' par ' + g.membre + ' le ' + jour; };
    var valeurs;
    var point = null;
    var depot = null;
    if (g.geste === 'prendre') {
      if (statut !== 'ouverte' && statut !== '') return { ok: false, erreur: 'mission taken ' + g.numero };
      var tenues = lignes.filter(function (l) {
        return cleEntete(cellule(l, 'statut')) === 'encours' && cleEntete(cellule(l, 'prisPar')) === membre;
      }).length;
      if (g.max && tenues >= Number(g.max)) return { ok: false, erreur: 'too many missions' };
      valeurs = { statut: 'en cours', prisPar: g.membre, prisLe: quand, journal: noter('prise') };
    } else if (g.geste === 'rendre') {
      if (!tient) return { ok: false, erreur: 'mission not held ' + g.numero };
      // v3n: a take of a standing mission given up is dropped (the standing mission stays open).
      var prise = /^p-/i.test(String(cellule(ligne, 'demande')));
      valeurs = prise ? { statut: 'abandonnée', journal: noter('abandonnée') } : { statut: 'ouverte', prisPar: '', prisLe: '', journal: noter('rendue') };
    } else if (g.geste === 'remettre') {
      // v3n: the holder hands the loot over; the mission waits for another member's confirmation.
      if (!tient) return { ok: false, erreur: 'mission not held ' + g.numero };
      valeurs = { statut: 'remise', remiseLe: quand, journal: noter('remise') };
    } else if (g.geste === 'confirmer' || g.geste === 'refuser') {
      // v3n: another member than the holder confirms the loot (points credited now) or refuses it (back to « en cours »).
      if (statut !== 'remise') return { ok: false, erreur: 'mission not handed over ' + g.numero };
      if (cleEntete(cellule(ligne, 'prisPar')) === membre) return { ok: false, erreur: 'own mission ' + g.numero };
      var estDon = /^don/i.test(String(cellule(ligne, 'demande')));
      if (g.geste === 'refuser') {
        // A donation refused is gone (« refusée »); a mission's loot goes back « en cours ».
        valeurs = estDon
          ? { statut: 'refusée', journal: noter('refusée' + (g.note ? ' (' + g.note + ')' : '')) }
          : { statut: 'en cours', remiseLe: '', journal: noter('refusée' + (g.note ? ' (' + g.note + ')' : '')) };
      } else {
        // A donation confirmed enters the chest (a 'dépôt' row of the ledger, no missive).
        if (estDon) {
          depot = { horodatage: quand, action: '', missive: '', membre: cellule(ligne, 'prisPar'), type: 'dépôt', objet: cellule(ligne, 'objet'), quantite: Number(cellule(ligne, 'quantite')) || 0, note: 'don confirmé par ' + g.membre };
          ajouter(ONGLETS.mouvements, [depot]);
        }
        valeurs = { statut: 'accomplie', accomplieLe: quand, confirmePar: g.membre, journal: noter('confirmée') };
        point = { horodatage: quand, membre: cellule(ligne, 'prisPar'), points: Number(cellule(ligne, 'points')) || 0, raison: g.raison || '', mission: cellule(ligne, 'numero'), confirmePar: g.membre };
      }
    } else if (g.geste === 'accomplir') {
      if (!tient) return { ok: false, erreur: 'mission not held ' + g.numero };
      valeurs = { statut: 'accomplie', accomplieLe: quand, journal: noter('accomplie') };
      point = { horodatage: quand, membre: cellule(ligne, 'prisPar'), points: Number(cellule(ligne, 'points')) || 0, raison: g.raison || '', mission: cellule(ligne, 'numero') };
    } else {
      return { ok: false, erreur: 'unknown gesture ' + g.geste };
    }
    lignes[i] = enLigne(p, valeurs, ligne);
    p.feuille.getRange(i + 2, 1, 1, p.largeur).setValues([lignes[i]]);
    if (point) ajouter(M.points, [point], preparerMasque(M.points));
    return {
      ok: true, numero: g.numero, geste: g.geste, points: point ? point.points : 0,
      maj: function (o) {
        (o.missions || []).forEach(function (x) {
          if (cleEntete(x.numero) !== cleEntete(g.numero)) return;
          Object.keys(valeurs).forEach(function (k) { x[k] = valeurs[k]; });
        });
        if (point) (o.points = o.points || []).push(complet(M.points, point));
        if (depot) (o.mouvements = o.mouvements || []).push(complet(ONGLETS.mouvements, depot));
      },
    };
  },

  /** The effort classes, the resources' classes and weights, and the settings: both tabs rewritten. */
  ponderation: function (corps) {
    if (!corps.ponderation || !corps.ponderation.lignes) return { ok: false, erreur: 'no ponderation' };
    var M = ONGLETS_MISSIONS;
    var ecrit = ecrirePonderation(corps.ponderation);
    return {
      ok: true, lignes: ecrit.lignes.length,
      maj: function (o) {
        o.ponderation = ecrit.lignes.map(function (x) { return complet(M.ponderation, x); });
        o.reglagesMissions = ecrit.reglages.map(function (x) { return complet(M.reglagesMissions, x); });
      },
    };
  },
};

/* ───────────────────────── The pay (v3n) ───────────────────────── */

/** Fields holding a date: an ISO text becomes a date cell. */
var DATES_PAIE = ['date', 'payeLe', 'scelleeLe'];
function daterPaie(o) {
  var r = {};
  Object.keys(o).forEach(function (k) {
    var v = o[k];
    r[k] = DATES_PAIE.indexOf(k) >= 0 && typeof v === 'string' && v ? new Date(v) : v === null || v === undefined ? '' : v;
  });
  return r;
}

ECRITURES.paie = function (corps) {
  var c = corps.paie;
  // The pay's tabs, and the standing missions' (v3n).
  var def = c && (ONGLETS_PAIE[c.onglet] || (c.onglet === 'permanentes' ? ONGLETS_MISSIONS.permanentes : null));
  if (!def) return { ok: false, erreur: 'unknown tab' };
  var lignes = (c.lignes || []).map(daterPaie);
  if (c.remplacer) {
    remplacer(def, lignes);
  } else {
    var supprimer = (c.supprimer || []).map(cleEntete);
    var o = ouvrirMasque(def);
    var p = o.p;
    var vues = {};
    var gardees = [];
    o.lignes.forEach(function (l) {
      var k = cleEntete(l[p.cols.id - 1]);
      if (k && supprimer.indexOf(k) >= 0) return;
      var maj = lignes.filter(function (x) { return cleEntete(x.id) === k; })[0];
      if (k && maj) {
        vues[k] = true;
        l = enLigne(p, maj, l);
      }
      gardees.push(enLigne(p, {}, l).slice(0, p.largeur));
    });
    var nouvelles = lignes.filter(function (x) { return !vues[cleEntete(x.id)]; }).map(function (x) { return enLigne(p, x).slice(0, p.largeur); });
    var toutes = gardees.concat(nouvelles);
    if (o.lignes.length) p.feuille.getRange(2, 1, o.lignes.length, p.largeur).clearContent();
    if (toutes.length) p.feuille.getRange(2, 1, toutes.length, p.largeur).setValues(toutes);
  }
  // The lots of an event leave the chest: 'livraison' rows of the ledger.
  var ms = (c.mouvements || []).map(function (m) {
    return { horodatage: new Date(m.horodatage), action: m.action || '', missive: m.missive || '', membre: m.membre, type: 'livraison', objet: m.objet, quantite: m.quantite, note: m.note || '' };
  });
  if (ms.length) ajouter(ONGLETS.mouvements, ms);
  // No `maj`: the tabs are read again (these writes are rare).
  return { ok: true, onglet: c.onglet, lignes: lignes.length };
};

ECRITURES.clotureSemaine = function (corps) {
  var c = corps.cloture;
  if (!c || !c.semaine || !c.lignes || !c.lignes.length) return { ok: false, erreur: 'empty closing' };
  var def = ONGLETS_PAIE.clotures;
  var deja = lireOnglet(def).some(function (r) { return String(r.semaine).trim() === c.semaine; });
  if (deja) return { ok: false, erreur: 'week already sealed ' + c.semaine };
  ajouter(def, c.lignes.map(daterPaie), preparerMasque(def));
  return { ok: true, semaine: c.semaine, lignes: c.lignes.length };
};

/* ───────────────────────── The missions' helpers (v3m) ───────────────────────── */

/** A number, or an empty cell. */
function nombreOuVide(v) {
  return v === null || v === undefined || v === '' ? '' : v;
}

/** A missions' tab made ready like `preparer`, and hidden when this call created it. */
function preparerMasque(def) {
  var existait = Boolean(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom));
  var p = preparer(def);
  if (!existait) p.feuille.hideSheet();
  return p;
}

/** `ouvrir` for a missions' tab (created hidden when missing). */
function ouvrirMasque(def) {
  if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom)) preparerMasque(def);
  return ouvrir(def);
}

/** Whether a tab holds no data row (missing, or a header row only). */
function ongletVide(def) {
  var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom);
  return !feuille || lireOnglet(def).length === 0;
}

/** Replaces every data row of a missions' tab by `objets` (the header row and other columns kept). */
function remplacer(def, objets) {
  var p = preparerMasque(def);
  var dernier = p.feuille.getLastRow();
  if (dernier >= 2) p.feuille.getRange(2, 1, dernier - 1, p.largeur).clearContent();
  if (objets.length) p.feuille.getRange(2, 1, objets.length, p.largeur).setValues(objets.map(function (o) { return enLigne(p, o).slice(0, p.largeur); }));
}

/** Writes the Pondération and Réglages missions tabs; answers the rows written. */
function ecrirePonderation(pd) {
  var lignes = (pd.lignes || []).map(function (l) {
    return { genre: l.genre || '', code: l.code || '', nom: l.nom || '', poids: nombreOuVide(l.poids), note: l.note || '', quantite: nombreOuVide(l.quantite), origine: l.origine || '' };
  });
  var reglages = (pd.reglages || []).map(function (l) {
    return { reglage: l.reglage || '', valeur: nombreOuVide(l.valeur), note: l.note || '' };
  });
  remplacer(ONGLETS_MISSIONS.ponderation, lignes);
  remplacer(ONGLETS_MISSIONS.reglagesMissions, reglages);
  return { lignes: lignes, reglages: reglages };
}

/** Run once from the editor to create the pay's tabs (hidden) without waiting for a first write (v3n). */
function preparerPaie() {
  Object.keys(ONGLETS_PAIE).forEach(function (k) {
    var p = preparerMasque(ONGLETS_PAIE[k]);
    Logger.log('Tab "' + ONGLETS_PAIE[k].nom + '" ready (hidden: ' + p.feuille.isSheetHidden() + '), ' + p.feuille.getLastRow() + ' row(s).');
  });
  viderCache();
  nouvelleVersion();
}

/** Run once from the editor to create the missions' tabs (hidden) without waiting for a first demand. */
function preparerMissions() {
  Object.keys(ONGLETS_MISSIONS).forEach(function (k) {
    var p = preparerMasque(ONGLETS_MISSIONS[k]);
    Logger.log('Tab "' + ONGLETS_MISSIONS[k].nom + '" ready (hidden: ' + p.feuille.isSheetHidden() + '), ' + p.feuille.getLastRow() + ' row(s).');
  });
  viderCache();
  nouvelleVersion();
}

function repondre(objet) {
  if (DEBUT) {
    objet.ms = Date.now() - DEBUT;
    objet.etapes = ETAPES;
  }
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to check the tabs and headers (no web call needed). */
function essai() {
  var feuille = onglet();
  Logger.log('Tab "' + feuille.getName() + '" ready, ' + feuille.getLastRow() + ' row(s).');
  ['ressources', 'recettes', 'missives', 'mouvements'].forEach(function (k) {
    var p = preparer(ONGLETS[k]);
    Logger.log('Tab "' + ONGLETS[k].nom + '" ready, ' + p.feuille.getLastRow() + ' row(s).');
  });
  // The catalogue is only checked (its headers are the owner's; never changed here).
  var cat = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ONGLETS.catalogue.nom);
  if (!cat) {
    Logger.log('No "' + ONGLETS.catalogue.nom + '" tab: putting a recipe up for sale will be refused.');
  } else {
    var ic = indexColonnes(cat.getRange(1, 1, 1, Math.max(cat.getLastColumn(), 1)).getValues()[0], ONGLETS.catalogue);
    Logger.log('Tab "' + ONGLETS.catalogue.nom + '": ' + Object.keys(ic).map(function (k) { return k + (ic[k] >= 0 ? ' col ' + (ic[k] + 1) : ' missing'); }).join(', '));
  }
  var l = toutLire();
  Logger.log(Object.keys(l).map(function (k) { return k + ': ' + l[k].length; }).join(', '));
}
