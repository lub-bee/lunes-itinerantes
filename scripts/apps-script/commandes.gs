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
 *  - { action: 'lire' } → { ok, onglets: { membres, ressources, recettes, missives, mouvements }, version, cache },
 *    each tab an array of objects keyed by the field names of ONGLETS below (missing tabs → []);
 *    served from the script's cache when it holds them (`cache: true`).
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
 *      'recette'     { recette: { produit, ancienProduit?, en, rendement, artisan, note,
 *                                 ingredients: [{ ingredient, quantite }] } } → the product's Recettes rows replaced
 *                                                                              (no ingredient = recipe removed)
 *      'ressource'   { ressource: { nom, ancienNom?, en, origine, prix, bonneAffaire, note } }
 *                                                                            → the Ressources row updated, or added
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
    colonnes: [['Produit', 'produit'], ['Produit EN', 'produitEn'], ['Ingrédient', 'ingredient'], ['Quantité', 'quantite'], ['Rendement', 'rendement'], ['Artisan', 'artisan'], ['Note', 'note']],
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

/** Start of the current call (each answer carries its own execution time, `ms`). */
var DEBUT = 0;

function doPost(e) {
  DEBUT = Date.now();
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
      // Served from the script's cache when it holds the tabs (kept up to date by every write).
      var enCache = lireCache();
      if (enCache) return repondre({ ok: true, onglets: enCache.onglets, version: enCache.version, cache: true });
      var onglets = toutLire();
      var version = versionCourante();
      mettreEnCache(onglets, version);
      return repondre({ ok: true, onglets: onglets, version: version, cache: false });
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
    // Inside the lock: a new version, the tabs read afresh and cached, so the answer and the cache
    // always hold the latest state (two writes cannot cache each other's older tabs).
    if (avecOnglets && res.ok) {
      res.version = nouvelleVersion();
      var enCache = res.maj ? lireCache() : null;
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
      mettreEnCache(res.onglets, res.version);
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
var CACHE = 'registre';
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

function lireCache() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(CACHE + '_n') || 0);
  if (!n) return null;
  var cles = [];
  for (var i = 0; i < n; i++) cles.push(CACHE + '_' + i);
  var parts = cache.getAll(cles);
  var json = '';
  for (var k = 0; k < n; k++) {
    if (parts[cles[k]] === undefined || parts[cles[k]] === null) return null;
    json += parts[cles[k]];
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
    var p = preparer(ONGLETS.missives);
    var lignes = donnees(p);
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

  /** Replaces a product's recipe rows (the tab rewritten in one call; no ingredient = recipe removed). */
  recette: function (corps) {
    var r = corps.recette;
    if (!r || !r.produit) return { ok: false, erreur: 'no product' };
    var p = preparer(ONGLETS.recettes);
    var lignes = donnees(p);
    var gardees = lignes.filter(function (l) { return !correspond(p, l, 'produit', [r.produit, r.ancienProduit]); });
    var objets = (r.ingredients || []).map(function (ing) {
      return { produit: r.produit, produitEn: r.en || '', ingredient: ing.ingredient, quantite: ing.quantite, rendement: r.rendement || 1, artisan: r.artisan || '', note: r.note || '' };
    });
    var nouvelles = objets.map(function (x) { return enLigne(p, x); });
    var toutes = gardees.concat(nouvelles);
    if (lignes.length) p.feuille.getRange(2, 1, lignes.length, p.largeur).clearContent();
    if (toutes.length) p.feuille.getRange(2, 1, toutes.length, p.largeur).setValues(toutes);
    var anciens = [r.produit, r.ancienProduit].filter(function (x) { return x; }).map(cleEntete);
    return {
      ok: true, produit: r.produit, lignes: nouvelles.length,
      maj: function (o) {
        o.recettes = o.recettes.filter(function (x) { return anciens.indexOf(cleEntete(x.produit)) < 0; });
        objets.forEach(function (x) { o.recettes.push(complet(ONGLETS.recettes, x)); });
      },
    };
  },

  /** Updates a resource's row, or adds it (one call either way). */
  ressource: function (corps) {
    var r = corps.ressource;
    if (!r || !r.nom) return { ok: false, erreur: 'no resource' };
    var p = preparer(ONGLETS.ressources);
    var nombre = function (v) { return v === null || v === undefined ? '' : v; };
    var valeurs = { nom: r.nom, en: r.en || '', origine: r.origine || '', prix: nombre(r.prix), bonneAffaire: nombre(r.bonneAffaire), note: r.note || '' };
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
    var lignes = donnees(p);
    for (var i = 0; i < lignes.length; i++) {
      if (!correspond(p, lignes[i], 'nom', [r.ancienNom || r.nom])) continue;
      p.feuille.getRange(i + 2, 1, 1, p.largeur).setValues([enLigne(p, valeurs, lignes[i])]);
      return { ok: true, nom: r.nom, ajoutee: false, maj: maj };
    }
    ajouter(ONGLETS.ressources, [valeurs], p);
    return { ok: true, nom: r.nom, ajoutee: true, maj: maj };
  },
};

function repondre(objet) {
  if (DEBUT) objet.ms = Date.now() - DEBUT;
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
