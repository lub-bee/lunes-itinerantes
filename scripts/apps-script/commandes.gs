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
 *      'cloture'     { cloture: { numero, action, horodatage, membre, recompense, partCommune,
 *                                 partage: [{ membre, montant, note }] } }
 *                                                                            → the missive's Missives rows closed,
 *                                                                              one Mouvements row 'partage' per member
 *      'recette'     { recette: { produit, ancienProduit?, rendement, artisan, note,
 *                                 ingredients: [{ ingredient, quantite }] } } → the product's Recettes rows replaced
 *                                                                              (no ingredient = recipe removed)
 *      'ressource'   { ressource: { nom, ancienNom?, en, categorie, valeur, note } }
 *                                                                            → the Ressources row updated, or added
 *    Answer: { ok: true, ... } or { ok: false, erreur }.
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
 * MAPPING OF THE OTHER TABS — per tab: its name and its columns as [header, field]. Headers are
 * found by name (case, accents and punctuation ignored), so the columns may sit in any order;
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
    colonnes: [['Ressource', 'nom'], ['Nom EN', 'en'], ['Catégorie', 'categorie'], ['Valeur', 'valeur'], ['Note', 'note']],
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
      ['Close le', 'closeLe'], ['Close par', 'closePar'],
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
  return avecVerrou(function () { return ecrire(corps, action); });
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
  });
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
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** 0-based column of each field in a header row (-1 when absent). */
function indexColonnes(entete, def) {
  var noms = entete.map(cleEntete);
  var index = {};
  def.colonnes.forEach(function (col) { index[col[1]] = noms.indexOf(cleEntete(col[0])); });
  return index;
}

/* ───────────────────────── Writing ───────────────────────── */

function avecVerrou(f) {
  // One writer at a time: two members writing together must not overwrite each other's rows.
  var verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(20000);
  } catch (err) {
    return repondre({ ok: false, erreur: 'sheet busy' });
  }
  try {
    var res = f();
    SpreadsheetApp.flush();
    return repondre(res);
  } catch (err) {
    return repondre({ ok: false, erreur: String(err) });
  } finally {
    verrou.releaseLock();
  }
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
    def.colonnes.forEach(function (col) {
      if (index[col[1]] >= 0) return;
      feuille.getRange(1, fin + 1).setValue(col[0]).setFontWeight('bold');
      premiere[fin] = col[0];
      fin++;
    });
  }
  var cols = {};
  var idx = indexColonnes(premiere, def);
  Object.keys(idx).forEach(function (k) { cols[k] = idx[k] + 1; });
  return { feuille: feuille, cols: cols };
}

/** Appends objects as rows (each field in its own column, other cells left blank). */
function ajouter(def, objets) {
  if (!objets.length) return 0;
  var p = preparer(def);
  var largeur = 0;
  Object.keys(p.cols).forEach(function (k) { largeur = Math.max(largeur, p.cols[k]); });
  var lignes = objets.map(function (o) {
    var ligne = [];
    for (var i = 0; i < largeur; i++) ligne.push('');
    Object.keys(o).forEach(function (k) { if (p.cols[k]) ligne[p.cols[k] - 1] = o[k]; });
    return ligne;
  });
  p.feuille.getRange(p.feuille.getLastRow() + 1, 1, lignes.length, largeur).setValues(lignes);
  return lignes.length;
}

/** 1-based sheet rows whose `champ` matches one of `valeurs` (compared like headers). */
function lignesOu(p, champ, valeurs) {
  var res = [];
  var dernier = p.feuille.getLastRow();
  if (dernier < 2 || !p.cols[champ]) return res;
  var cles = valeurs.filter(function (v) { return v; }).map(cleEntete);
  var col = p.feuille.getRange(2, p.cols[champ], dernier - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (cles.indexOf(cleEntete(col[i][0])) >= 0) res.push(i + 2);
  return res;
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

  cloture: function (corps) {
    var c = corps.cloture;
    if (!c || !c.numero) return { ok: false, erreur: 'no missive' };
    var p = preparer(ONGLETS.missives);
    var lignes = lignesOu(p, 'numero', [c.numero]);
    if (!lignes.length) return { ok: false, erreur: 'unknown missive ' + c.numero };
    var quand = new Date(c.horodatage);
    lignes.forEach(function (r) {
      p.feuille.getRange(r, p.cols.statut).setValue('close');
      p.feuille.getRange(r, p.cols.recompense).setValue(c.recompense);
      p.feuille.getRange(r, p.cols.partCommune).setValue(c.partCommune);
      p.feuille.getRange(r, p.cols.closeLe).setValue(quand);
      p.feuille.getRange(r, p.cols.closePar).setValue(c.membre);
    });
    ajouter(ONGLETS.mouvements, (c.partage || []).map(function (x) {
      return { horodatage: quand, action: c.action || '', missive: c.numero, membre: x.membre, type: 'partage', objet: 'Septims', quantite: x.montant, note: x.note || '' };
    }));
    return { ok: true, numero: c.numero };
  },

  recette: function (corps) {
    var r = corps.recette;
    if (!r || !r.produit) return { ok: false, erreur: 'no product' };
    var p = preparer(ONGLETS.recettes);
    var anciennes = lignesOu(p, 'produit', [r.produit, r.ancienProduit]);
    for (var i = anciennes.length - 1; i >= 0; i--) p.feuille.deleteRow(anciennes[i]);
    var n = ajouter(ONGLETS.recettes, (r.ingredients || []).map(function (ing) {
      return { produit: r.produit, ingredient: ing.ingredient, quantite: ing.quantite, rendement: r.rendement || 1, artisan: r.artisan || '', note: r.note || '' };
    }));
    return { ok: true, produit: r.produit, lignes: n };
  },

  ressource: function (corps) {
    var r = corps.ressource;
    if (!r || !r.nom) return { ok: false, erreur: 'no resource' };
    var p = preparer(ONGLETS.ressources);
    var lignes = lignesOu(p, 'nom', [r.ancienNom || r.nom]);
    var valeurs = { nom: r.nom, en: r.en || '', categorie: r.categorie || '', valeur: r.valeur === null || r.valeur === undefined ? '' : r.valeur, note: r.note || '' };
    if (!lignes.length) {
      ajouter(ONGLETS.ressources, [valeurs]);
      return { ok: true, nom: r.nom, ajoutee: true };
    }
    Object.keys(valeurs).forEach(function (k) { p.feuille.getRange(lignes[0], p.cols[k]).setValue(valeurs[k]); });
    return { ok: true, nom: r.nom, ajoutee: false };
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
