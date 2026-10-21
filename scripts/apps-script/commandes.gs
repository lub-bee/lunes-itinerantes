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
 *        lignes: [{ article, articleEn, quantite, prixUnitaire, prixMini, prixIdeal,
 *                   total, totalMini, totalIdeal, statut, sousPlancher }] }
 *    One row per article in the "Commandes" tab.
 *
 *  - { action: 'lire' } → { ok, onglets: { membres, ressources, recettes, missives, mouvements } },
 *    each an array of objects keyed by the field names of ONGLETS below (missing tabs → []).
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
 *      'recette'     { recette: { produit, ancienProduit?, rendement, artisan, note,
 *                                 ingredients: [{ ingredient, quantite }] } } → the product's Recettes rows replaced
 *                                                                              (no ingredient = recipe removed)
 *      'ressource'   { ressource: { nom, ancienNom?, en, origine, prix, bonneAffaire, note } }
 *                                                                            → the Ressources row updated, or added
 *    Answer: { ok: true, ..., onglets } (every tab read again after the write, as for 'lire', so the
 *    grimoire needs no second call) or { ok: false, erreur }.
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
  ['Prix réel vendu', function (c, l) { return l.total; }],
  ['Statut', function (c, l) { return l.statut; }],
  ['Total commande', function (c, l) { return c.total; }],
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
    ],
  },
  recettes: {
    nom: 'Recettes',
    colonnes: [['Produit', 'produit'], ['Ingrédient', 'ingredient'], ['Quantité', 'quantite'], ['Rendement', 'rendement'], ['Artisan', 'artisan'], ['Note', 'note']],
  },
  missives: {
    nom: 'Missives',
    colonnes: [
      ['N° missive', 'numero'], ['Écrite le', 'horodatage'], ['Titre', 'titre'], ['Commanditaire', 'commanditaire'],
      ['Échéance', 'echeance'], ['Statut', 'statut'], ['Produit', 'produit'], ['Quantité', 'quantite'],
      ['Écrite par', 'ecritePar'], ['Récompense', 'recompense'], ['Part commune (%)', 'partCommune'],
      ['Close le', 'closeLe'], ['Close par', 'closePar'], ['Note de clôture', 'noteCloture'],
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

/** Movement type written for each movement action. */
var TYPES_MOUVEMENT = { releve: 'relevé', depot: 'dépôt', fabrication: 'fabrication', livraison: 'livraison' };

function doPost(e) {
  var corps;
  try {
    corps = JSON.parse(e.postData.contents);
  } catch (err) {
    return repondre({ ok: false, erreur: 'invalid JSON' });
  }

  var attendu = PropertiesService.getScriptProperties().getProperty('JETON');
  if (!attendu || corps.jeton !== attendu) return repondre({ ok: false, erreur: 'bad token' });

  var action = corps.action || (corps.commande ? 'commande' : '');
  if (action === 'lire') {
    try {
      return repondre({ ok: true, onglets: toutLire() });
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
    return { ok: true, numero: c.numero, lignes: lignes.length };
  }, false);
}

/**
 * The orders tab. If its first row is not our header row (empty tab, or anything else in row 1),
 * a header row is inserted above, so nothing already in the tab is overwritten.
 */
function onglet() {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var feuille = classeur.getSheetByName(ONGLET) || classeur.insertSheet(ONGLET);
  var entetes = COLONNES.map(function (col) { return col[0]; });
  var premiere = feuille.getLastRow() === 0 ? [] : feuille.getRange(1, 1, 1, entetes.length).getValues()[0];
  var dejaLa = entetes.every(function (e, i) { return String(premiere[i] || '').trim() === e; });
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
  var res;
  try {
    res = f();
  } catch (err) {
    return repondre({ ok: false, erreur: String(err) });
  } finally {
    verrou.releaseLock();
  }
  if (avecOnglets && res.ok) {
    try {
      res.onglets = toutLire();
    } catch (err) {
      // The write is done; the grimoire will read the tabs itself.
    }
  }
  return repondre(res);
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
  var premiere = feuille.getLastRow() === 0 ? [] : feuille.getRange(1, 1, 1, largeur).getValues()[0];
  var index = indexColonnes(premiere, def);
  var connues = def.colonnes.filter(function (col) { return index[col[1]] >= 0; }).length;
  var vide = !premiere.some(function (v) { return String(v).trim() !== ''; });
  if (vide || connues === 0) {
    if (!vide) feuille.insertRowBefore(1);
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
  return { feuille: feuille, cols: cols, largeur: large };
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
  p.feuille.getRange(p.feuille.getLastRow() + 1, 1, lignes.length, p.largeur).setValues(lignes);
  return lignes.length;
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

function mouvements(corps, action) {
  var ms = corps.mouvements || [];
  if (!ms.length) return { ok: false, erreur: 'no movement' };
  var type = TYPES_MOUVEMENT[action];
  var n = ajouter(ONGLETS.mouvements, ms.map(function (m) {
    return {
      horodatage: new Date(m.horodatage), action: m.action || '', missive: m.missive || '', membre: m.membre,
      type: type, objet: m.objet, quantite: m.quantite, note: m.note || '',
    };
  }));
  return { ok: true, lignes: n };
}

var ECRITURES = {
  missive: function (corps) {
    var m = corps.missive;
    if (!m || !m.numero || !m.lignes || !m.lignes.length) return { ok: false, erreur: 'empty missive' };
    var n = ajouter(ONGLETS.missives, m.lignes.map(function (l) {
      return {
        numero: m.numero, horodatage: new Date(m.horodatage), titre: m.titre, commanditaire: m.commanditaire || '',
        echeance: m.echeance || '', statut: 'en cours', produit: l.produit, quantite: l.quantite, ecritePar: m.membre,
      };
    }));
    return { ok: true, numero: m.numero, lignes: n };
  },

  releve: mouvements,
  depot: mouvements,
  fabrication: mouvements,
  livraison: mouvements,

  /** Closes a missive: livrée (its deliveries recorded) or inachevée; the reward's split as 'partage' rows. */
  cloture: function (corps) {
    var c = corps.cloture;
    if (!c || !c.numero) return { ok: false, erreur: 'no missive' };
    var p = preparer(ONGLETS.missives);
    var lignes = donnees(p);
    var quand = new Date(c.horodatage);
    var touchees = 0;
    lignes.forEach(function (l, i) {
      if (!correspond(p, l, 'numero', [c.numero])) return;
      lignes[i] = enLigne(p, {
        statut: c.statut || 'livrée', recompense: c.recompense, partCommune: c.partCommune,
        closeLe: quand, closePar: c.membre, noteCloture: c.note || '',
      }, l);
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
    ajouter(ONGLETS.mouvements, livraisons.concat(partage));
    return { ok: true, numero: c.numero };
  },

  /** Replaces a product's recipe rows (the tab rewritten in one call; no ingredient = recipe removed). */
  recette: function (corps) {
    var r = corps.recette;
    if (!r || !r.produit) return { ok: false, erreur: 'no product' };
    var p = preparer(ONGLETS.recettes);
    var lignes = donnees(p);
    var gardees = lignes.filter(function (l) { return !correspond(p, l, 'produit', [r.produit, r.ancienProduit]); });
    var nouvelles = (r.ingredients || []).map(function (ing) {
      return enLigne(p, { produit: r.produit, ingredient: ing.ingredient, quantite: ing.quantite, rendement: r.rendement || 1, artisan: r.artisan || '', note: r.note || '' });
    });
    var toutes = gardees.concat(nouvelles);
    if (lignes.length) p.feuille.getRange(2, 1, lignes.length, p.largeur).clearContent();
    if (toutes.length) p.feuille.getRange(2, 1, toutes.length, p.largeur).setValues(toutes);
    return { ok: true, produit: r.produit, lignes: nouvelles.length };
  },

  /** Updates a resource's row, or adds it (one call either way). */
  ressource: function (corps) {
    var r = corps.ressource;
    if (!r || !r.nom) return { ok: false, erreur: 'no resource' };
    var p = preparer(ONGLETS.ressources);
    var nombre = function (v) { return v === null || v === undefined ? '' : v; };
    var valeurs = { nom: r.nom, en: r.en || '', origine: r.origine || '', prix: nombre(r.prix), bonneAffaire: nombre(r.bonneAffaire), note: r.note || '' };
    var lignes = donnees(p);
    for (var i = 0; i < lignes.length; i++) {
      if (!correspond(p, lignes[i], 'nom', [r.ancienNom || r.nom])) continue;
      p.feuille.getRange(i + 2, 1, 1, p.largeur).setValues([enLigne(p, valeurs, lignes[i])]);
      return { ok: true, nom: r.nom, ajoutee: false };
    }
    ajouter(ONGLETS.ressources, [valeurs], p);
    return { ok: true, nom: r.nom, ajoutee: true };
  },
};

function repondre(objet) {
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
  var l = toutLire();
  Logger.log(Object.keys(l).map(function (k) { return k + ': ' + l[k].length; }).join(', '));
}
