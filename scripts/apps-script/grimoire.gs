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
 *    With `discord: true` (v3n) the Membres rows also carry `discord` and `pseudo` (« Discord ID », « Pseudo Discord »).
 *      'membre'      { membre: { nom, discord, pseudo, creer } } (v3n) → the Discord seal `discord` linked to the
 *                                                                              member `nom` (its « Discord ID » written,
 *                                                                              « Pseudo Discord » too), or a row appended
 *                                                                              (Nom, Rôle « Membre », ID, pseudo) when
 *                                                                              `creer`; refused: 'other seal', 'friend',
 *                                                                              'unknown member', 'seal taken'. With an
 *                                                                              empty `nom`: the pseudo of the row holding
 *                                                                              `discord` updated.
 *    With `paie: true` (v3n, the pay) the answer also carries the pay's tabs (ONGLETS_PAIE: reglagesPaie,
 *    factures, evenements, ecrituresEvenement, clotures). Without it, exactly what v3m answered.
 *    With `rangs: true` (v3p, ranks and permissions from the sheet) the answer also carries `roles` (the « Rôles »
 *    tab: { role, id }, a rank's label and its Discord role ID, edited by hand), `permissions` (the Grimoire's rows
 *    of the shared « Permissions » tab: { outil, geste, cle, cases: { <rank column header>: <cell> } }, rows of any
 *    other « Outil » never sent) and `permissionsEntete` (the tab's row 1). Without it, exactly what v3n answered.
 *    Only with `rangs: true`:
 *      'membre'      also takes `membre.rangs` ([label]): the member's ranks (from their Discord roles) written in
 *                    « Rôle », joined by « , » (empty when none), on the linked, the newly linked or the created row,
 *                    and with an empty `nom` (the row holding `discord`); « Ami des Lunes » among them → 'friend' (the
 *                    « Rôle » cell itself is not looked at); a Membres tab without « Rôle » no longer refuses a creation
 *                    (the cell is just not written). Without `rangs: true`, exactly v3n's 'membre'.
 *      'permissions' { droits: { rangs: [label], lignes: [{ cle, geste, valeurs: { <label>: true | false } }],
 *                                semer?: true } }
 *                                                                            → the Grimoire's rows of « Permissions »:
 *                                                                              each row found by its « Clé » gets the
 *                                                                              cells sent, a missing one is appended
 *                                                                              (Outil « Grimoire »); every rank of
 *                                                                              `rangs` without a column gets one at the
 *                                                                              end of row 1; the tab is created (header
 *                                                                              Outil | Geste | Clé | ranks) when missing.
 *                                                                              Rows of another « Outil » and cells of
 *                                                                              other columns are never written; no
 *                                                                              column is renamed or moved. `semer`: only
 *                                                                              when the tab holds no Grimoire row yet
 *                                                                              (else nothing is written, seme: false)
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
 *
 *  v3q (2026-11-05) — one Apps Script project, two files: this one and the Table's conseil.gs (shared contract,
 *  § 2). Apps Script files share ONE global scope, so every name of the grimoire lives in the `Grimoire`
 *  namespace below; the only globals left are `Grimoire`, the three entry points `doGet` / `doPost` / `onEdit`
 *  (they exist once, here, and only route) and the functions run by hand from the editor (`grimoireEssai`,
 *  `grimoireViderCache`, `grimoirePreparerMissions`, `grimoirePreparerPaie`; v3t: `grimoireRenommerSimuler`, `grimoireRenommer`). Routing: a request carrying
 *  `outil=conseil` (URL parameter, or `"outil": "conseil"` at the top of the JSON body) goes to
 *  `conseilDoGet(e)` / `conseilDoPost(e)` (`{ ok: false, erreur: 'conseil absent' }` when not defined), any
 *  other to the grimoire, unchanged; `onEdit(e)` runs the grimoire's handler, then `conseilOnEdit(e)` if defined
 *  (an error in one never stops the other). Every grimoire answer is exactly v3p's.
 *
 *  v3r (2026-11-05) — the Livre de l'Intendance (Missions v2, lot 2). Everything new is behind the caller flag
 *  `intendance: true`; without it, every answer and every sheet write is exactly v3q's.
 *    - A new tab « Intendance » (hidden, created on its first write): one row per thing that enters or leaves the
 *      chest — a hand-over for a mission, a gift (named, or anonymous), a deposit declared in the « coffre des
 *      petites lunes » waiting for its confirmation, materials taken out to craft (« façonnage », open until the
 *      goods come back), what comes back, a sale's goods taken from the chest (waiting for their confirmation), a
 *      loss. Sent with `intendance: true` only (`onglets.intendance`).
 *    - « Demandes » gains « Titre » and « N° missive » (a mission sheet and the missive it was written for), read and
 *      written for `intendance: true` callers only (columns appended at the end of row 1 on such a write).
 *    - 'intendance' { coffre: { lignes: [{ id, date, genre, statut, membre, objet, quantite, mission, demande,
 *                                  missive, commande, lien, coffre, par, le, points, note }],
 *                               maj: [{ id, si: [statut], champs: { statut, par, le, points, note } }],
 *                               mouvements: [{ horodatage, action, missive, membre, type ('dépôt' | 'livraison'),
 *                                              objet, quantite, note }],
 *                               points: [{ horodatage, membre, points, raison, mission, confirmePar }],
 *                               reserver: [{ nom, role }] } }
 *                                                                            → under the lock, every `maj` row checked
 *                                                                              first (its id found, its « Statut » one
 *                                                                              of `si`: else nothing is written, 'already
 *                                                                              answered'); then the Intendance rows
 *                                                                              appended / updated, the Mouvements rows,
 *                                                                              the Points rows, and a Membres row (Nom,
 *                                                                              Rôle) for each `reserver` name no row holds
 *                                                                              (names compared like headers).
 *    - 'demande' also takes `demande.titre`, `demande.missive` and a top-level `missive` (written first, exactly as
 *      the 'missive' action: a mission sheet written as a missive).
 *    Cache key registre-v3r.
 *
 *  v3s (2026-11-05) — the missions in progress, from the Livre de l'Intendance (Missions v2, lot 2b). Everything new is
 *  behind the caller flag `feuillets: true`; without it, every answer and every sheet write is exactly v3r's.
 *    - Every answer to such a caller carries `feuillets: true` (the grimoire knows the script can do what follows).
 *    - 'feuillet' { feuillet: { numero, si?: [statut], champs?: { titre, note, statut },
 *                               missions?: [{ numero, si?: [statut], quantite?, champs: { quantite, points, effort,
 *                                             statut, note }, journal? }],
 *                               ajouts?: [{ numero, type, objet, quantite, poids, effort, points, note, journal }] } }
 *                                                                            → under the lock, everything checked first:
 *                                                                              the sheet's Demandes row found (its
 *                                                                              « Statut » one of `si`), each mission found
 *                                                                              on that sheet (its « Statut » one of `si`,
 *                                                                              its « Quantité » still `quantite` when sent:
 *                                                                              else 'sheet changed', nothing written), each
 *                                                                              added number free; then the Demandes row,
 *                                                                              the Missions rows updated in place
 *                                                                              (`journal` appended to « Journal »), the
 *                                                                              added rows appended (« ouverte »). A sheet or
 *                                                                              a mission is closed / reopened by its
 *                                                                              « Statut » (« close » / « ouverte »), a line
 *                                                                              removed by « retirée »; no row is deleted.
 *    Cache key registre-v3s.
 *
 *  v3t (2026-11-06) — the items' names brought to the official French names of the game, ONCE, from the editor (no web
 *  call reaches it; every answer and every sheet write of a web call is exactly v3s's). The plan (RENOMMAGE below,
 *  from plan-renommage.json: renames, English fixes, rows deleted and added) is applied to every column that holds an
 *  item's name: Catalogues (Article, Article (EN)), Recettes (Produit, Produit EN, Ingrédient), Ressources (Ressource,
 *  Nom EN), Commandes (Article), Pondération (Nom, but not the levels' rows), Missives (Produit), Mouvements, Missions,
 *  Missions permanentes, Intendance and Écritures événements (Objet), Demandes (Article). Free text (notes, journal,
 *  titles, a missive's « Recettes ») is never rewritten: the old names it cites are listed in the log.
 *    - `grimoireRenommerSimuler`: writes nothing; logs, tab by tab, every cell (row, old → new), the rows deleted and
 *      added, the duplicates (a renamed row meeting another of the same name: settled by the plan's `fusion`, else
 *      blocking), the English names that are neither the old nor the new one, the cells holding a formula (left).
 *    - `grimoireRenommer`: under the script lock, refused when RENOMMAGE_FAIT is set (a second run) or a duplicate is
 *      not settled; the analysis made again; each tab touched copied first to a hidden tab « Sauvegarde <tab>
 *      2026-11-06 »; then the cells, the rows deleted, the rows added; RENOMMAGE_FAIT = the date; the cache dropped
 *      and the version moved on, as a hand edit does.
 *    Cache key unchanged (registre-v3s): the tabs read the same way.
 */

/* ───────────────────────── Entry points (shared with conseil.gs) ───────────────────────── */

function doGet(e) {
  if (Grimoire.versConseil(e, false)) {
    return typeof conseilDoGet === 'function' ? conseilDoGet(e) : Grimoire.sansConseil();
  }
  return Grimoire.doGet(e);
}

function doPost(e) {
  if (Grimoire.versConseil(e, true)) {
    return typeof conseilDoPost === 'function' ? conseilDoPost(e) : Grimoire.sansConseil();
  }
  return Grimoire.doPost(e);
}

/** Simple trigger: the grimoire's handler, then the Table's; an error in one never stops the other. */
function onEdit(e) {
  var erreur = null;
  try {
    Grimoire.onEdit(e);
  } catch (err) {
    console.error('grimoire onEdit: ' + err);
    erreur = err;
  }
  if (typeof conseilOnEdit === 'function') {
    try {
      conseilOnEdit(e);
    } catch (err) {
      console.error('conseil onEdit: ' + err);
      erreur = erreur || err;
    }
  }
  // Still reported as a failed run (Executions), once both have run.
  if (erreur) throw erreur;
}

/* ───────────────────────── Run by hand from the editor ───────────────────────── */

/** Check the tabs and headers (no web call needed). */
function grimoireEssai() { Grimoire.essai(); }
/** Drop the cached tabs (after importing a CSV, which may not count as an edit). */
function grimoireViderCache() { Grimoire.viderCache(); }
/** Create the missions' tabs (hidden) without waiting for a first demand. */
function grimoirePreparerMissions() { Grimoire.preparerMissions(); }
/** Create the pay's tabs (hidden) without waiting for a first write (v3n). */
function grimoirePreparerPaie() { Grimoire.preparerPaie(); }
/** v3t: what the renaming of 2026-11-06 would change, logged (nothing is written). Run it first. */
function grimoireRenommerSimuler() { Grimoire.renommerSimuler(); }
/** v3t: the renaming of 2026-11-06, once (backups first; a second run is refused). */
function grimoireRenommer() { Grimoire.renommer(); }

/* ───────────────────────── The grimoire (namespace) ───────────────────────── */

// Everything below is local to this function (not re-indented, to keep the history readable): no name of it can
// collide with conseil.gs. Only what the entry points and the editor functions above need is returned.
var Grimoire = (function () {

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
    colonnes: [['Nom', 'nom'], ['Rôle', 'role'],
      // v3n: the member's Discord user ID and the display name seen at the last seal, written only by the
      // 'membre' action (headers appended at the end of row 1 when missing); sent only with `discord: true`.
      ['Discord ID', 'discord', ['Discord', 'ID Discord']], ['Pseudo Discord', 'pseudo', ['Pseudo']]],
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

/**
 * THE LIVRE DE L'INTENDANCE (v3r) — read and sent only to a caller that asks for it (`intendance: true`). Created
 * hidden on its first write, editable by hand. `id` is each row's key (« I-261105-AB12 »).
 */
var ONGLETS_INTENDANCE = {
  intendance: {
    nom: 'Intendance',
    colonnes: [
      ['N°', 'id'], ['Date', 'date'], ['Genre', 'genre'], ['Statut', 'statut'], ['Membre', 'membre'], ['Objet', 'objet'],
      ['Quantité', 'quantite'], ['N° mission', 'mission'], ['N° demande', 'demande'], ['N° missive', 'missive'],
      ['N° commande', 'commande'], ['N° lié', 'lien'], ['Coffre', 'coffre'], ['Consignée par', 'par'], ['Consignée le', 'le'],
      ['Points', 'points'], ['Note', 'note'],
    ],
  },
};
/** v3r: the Demandes tab with its two new columns (read for the cache; written so only for `intendance: true`). */
var CHAMPS_DEMANDES_V3R = ['titre', 'missive'];
var DEMANDES_V3R = {
  nom: ONGLETS_MISSIONS.demandes.nom,
  colonnes: ONGLETS_MISSIONS.demandes.colonnes.concat([['Titre', 'titre'], ['N° missive', 'missive']]),
};
/** The Demandes tab as this caller writes it: v3q's columns, or v3r's two more. */
function defDemandes() {
  return AVEC_INTENDANCE ? DEMANDES_V3R : ONGLETS_MISSIONS.demandes;
}

/** Whether the current call asked for the missions' tabs (`missions: true`, v3m) and the pay's (`paie: true`, v3n). */
var AVEC_MISSIONS = false;
var AVEC_PAIE = false;
var AVEC_DISCORD = false;
/** v3p: the Rôles tab and the Grimoire's rows of Permissions (`rangs: true`), and the new 'membre' / 'permissions'. */
var AVEC_RANGS = false;
/** v3r: the Intendance tab, the Demandes' new columns and the 'intendance' action (`intendance: true`). */
var AVEC_INTENDANCE = false;
/** v3s: the 'feuillet' action and the `feuillets` mark on every answer (`feuillets: true`). */
var AVEC_FEUILLETS = false;

/**
 * RANKS AND PERMISSIONS (v3p) — read and sent only to a caller that asks for them (`rangs: true`).
 * « Rôles »: one row per rank, its label and the ID of the Discord role that carries it; written by hand only
 * (type the ID as text: a leading apostrophe). « Permissions »: shared with the Table (Conseil.gs): one row per
 * gesture, « Outil » (Grimoire / Conseil) | « Geste » | « Clé » | one checkbox column per rank (header = the rank's
 * label in Rôles). The Grimoire reads and writes only its own rows (Outil « Grimoire »).
 */
var ONGLET_ROLES = {
  nom: 'Rôles',
  lecture: true,
  colonnes: [['Rôle', 'role', ['Rang']], ['ID du rôle Discord', 'id', ['ID Discord', 'ID du rôle', 'Discord ID', 'ID']]],
};
var ONGLET_PERMISSIONS = 'Permissions';
var COLONNES_PERMISSIONS = [['Outil', 'outil'], ['Geste', 'geste'], ['Clé', 'cle', ['Cle', 'Code']]];
var OUTIL = 'Grimoire';
/** The tab's keys that only a `rangs: true` caller receives. */
var ONGLETS_RANGS = { roles: true, permissions: true, permissionsEntete: true };

/** The tabs as the caller asked for them: without the missions' and the pay's ones, exactly v3l's answer. */
function pourAppelant(onglets) {
  if ((AVEC_MISSIONS && AVEC_PAIE && AVEC_DISCORD && AVEC_RANGS && AVEC_INTENDANCE) || !onglets) return onglets;
  var res = {};
  Object.keys(onglets).forEach(function (k) {
    // v3r: the Intendance tab only to who asks `intendance: true`.
    if (ONGLETS_INTENDANCE[k] && !AVEC_INTENDANCE) return;
    // v3r: the Demandes rows without their two new fields (v3q's rows, key for key).
    if (k === 'demandes' && AVEC_MISSIONS && !AVEC_INTENDANCE && onglets[k]) {
      res[k] = onglets[k].map(function (d) {
        var x = {};
        Object.keys(d).forEach(function (c) { if (CHAMPS_DEMANDES_V3R.indexOf(c) < 0) x[c] = d[c]; });
        return x;
      });
      return;
    }
    if (ONGLETS_MISSIONS[k] && !AVEC_MISSIONS) return;
    if (ONGLETS_PAIE[k] && !AVEC_PAIE) return;
    // The ranks and permissions (v3p) only to who asks `rangs: true`.
    if (ONGLETS_RANGS[k] && !AVEC_RANGS) return;
    // The members' Discord ID and pseudo (v3n) only to who asks `discord: true`: the rows otherwise exactly as before.
    if (k === 'membres' && !AVEC_DISCORD && onglets[k]) {
      res[k] = onglets[k].map(function (m) { return { nom: m.nom, role: m.role }; });
      return;
    }
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
  AVEC_DISCORD = Boolean(corps.discord);
  AVEC_RANGS = corps.rangs === true;
  AVEC_INTENDANCE = corps.intendance === true;
  AVEC_FEUILLETS = corps.feuillets === true;
  if (action === 'lire') {
    try {
      // Served from the script's cache when it holds the tabs (kept up to date by every write).
      var enCache = lireCache();
      etape('cache_lu');
      if (enCache) return repondre(marquer({ ok: true, onglets: pourAppelant(enCache.onglets), version: enCache.version, cache: true }));
      var onglets = toutLire();
      etape('feuille_lue');
      var version = versionCourante();
      mettreEnCache(onglets, version);
      etape('cache_ecrit');
      return repondre(marquer({ ok: true, onglets: pourAppelant(onglets), version: version, cache: false }));
    } catch (err) {
      return repondre({ ok: false, erreur: String(err) });
    }
  }
  if (action === 'commande') return sceller(corps.commande);

  var ecrire = ECRITURES[action];
  // 'permissions' (v3p) exists only for a caller that asks `rangs: true`: any other gets v3n's answer.
  if (!ecrire || (action === 'permissions' && !AVEC_RANGS)) return repondre({ ok: false, erreur: 'unknown action ' + action });
  // 'intendance' (v3r) exists only for a caller that asks `intendance: true`: any other gets v3q's answer.
  if (action === 'intendance' && !AVEC_INTENDANCE) return repondre({ ok: false, erreur: 'unknown action ' + action });
  // 'feuillet' (v3s) exists only for a caller that asks `feuillets: true`: any other gets v3r's answer.
  if (action === 'feuillet' && !AVEC_FEUILLETS) return repondre({ ok: false, erreur: 'unknown action ' + action });
  return avecVerrou(function () { return ecrire(corps, action); }, true);
}

/** v3s: a `feuillets: true` caller's answer says the script knows the 'feuillet' action (any other: untouched). */
function marquer(res) {
  if (AVEC_FEUILLETS) res.feuillets = true;
  return res;
}

function doGet() {
  return repondre({ ok: true, message: 'Grimoire de la Caravane: POST only.' });
}

/** Whether a request is for the Table (conseil.gs): `outil=conseil` in the URL, or at the top of a JSON body. */
function versConseil(e, avecCorps) {
  if (!e) return false;
  if (e.parameter && e.parameter.outil === 'conseil') return true;
  if (!avecCorps || !e.postData || typeof e.postData.contents !== 'string') return false;
  var texte = e.postData.contents;
  // Most grimoire bodies never mention it: no second parse for them.
  if (texte.indexOf('conseil') === -1) return false;
  try {
    var corps = JSON.parse(texte);
    return Boolean(corps) && typeof corps === 'object' && corps.outil === 'conseil';
  } catch (err) {
    // Not JSON: the grimoire answers it (its own 'invalid JSON').
    return false;
  }
}

/** The answer to a request for the Table when conseil.gs defines no entry point for it. */
function sansConseil() {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, erreur: 'conseil absent' })).setMimeType(ContentService.MimeType.JSON);
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
  // v3r: the Demandes with their two new fields (stripped for the callers that do not ask `intendance: true`).
  Object.keys(ONGLETS_MISSIONS).forEach(function (cle) { res[cle] = lireOnglet(cle === 'demandes' ? DEMANDES_V3R : ONGLETS_MISSIONS[cle]); });
  // The pay's tabs (v3n), the same way (sent only with `paie: true`).
  Object.keys(ONGLETS_PAIE).forEach(function (cle) { res[cle] = lireOnglet(ONGLETS_PAIE[cle]); });
  // The ranks and the Grimoire's permissions (v3p), last (sent only with `rangs: true`).
  res.roles = lireOnglet(ONGLET_ROLES);
  var perms = lirePermissions();
  res.permissions = perms.lignes;
  res.permissionsEntete = perms.entete;
  // The Livre de l'Intendance (v3r), last (sent only with `intendance: true`).
  Object.keys(ONGLETS_INTENDANCE).forEach(function (cle) { res[cle] = lireOnglet(ONGLETS_INTENDANCE[cle]); });
  return res;
}

/**
 * The Permissions tab (v3p): row 1 as written (`entete`, trailing blanks cut) and the Grimoire's rows only
 * (`lignes`: { outil, geste, cle, cases: { header: cell } }, every column but Outil / Geste / Clé). Rows of any
 * other « Outil » (the Table's) and blank rows are skipped. A missing tab reads as { entete: [], lignes: [] }.
 */
function lirePermissions() {
  var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ONGLET_PERMISSIONS);
  if (!feuille || feuille.getLastRow() < 1) return { entete: [], lignes: [] };
  var valeurs = feuille.getDataRange().getValues();
  var entete = valeurs[0].map(function (v) { return String(v).trim(); });
  while (entete.length && !entete[entete.length - 1]) entete.pop();
  var fixes = indexColonnes(entete, { colonnes: COLONNES_PERMISSIONS });
  var pris = [fixes.outil, fixes.geste, fixes.cle];
  var lignes = [];
  for (var r = 1; r < valeurs.length; r++) {
    var ligne = valeurs[r];
    var champ = function (k) { return fixes[k] >= 0 ? String(ligne[fixes[k]]).trim() : ''; };
    if (cleEntete(champ('outil')) !== cleEntete(OUTIL)) continue;
    if (!champ('geste') && !champ('cle')) continue;
    var objet = { outil: champ('outil'), geste: champ('geste'), cle: champ('cle'), cases: {} };
    entete.forEach(function (h, i) {
      if (!h || pris.indexOf(i) >= 0) return;
      objet.cases[h] = ligne[i] === undefined ? '' : ligne[i];
    });
    lignes.push(objet);
  }
  return { entete: entete, lignes: lignes };
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
      marquer(res);
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
 * run `grimoireViderCache` from the editor, or wait 10 minutes.
 */
// The cache key carries the script's version: a new version never serves an older version's tabs.
var CACHE = 'registre-v3s';
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

/** The grimoire's part of the onEdit trigger: a hand edit of the sheet drops the cached tabs and moves the version on. */
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
    // v3r (`intendance: true`): the sheet's title and the missive it was written for; the missive itself first.
    var ecriteMissive = null;
    if (AVEC_INTENDANCE) {
      rangD.titre = String(d.titre || '').slice(0, 120);
      rangD.missive = String(d.missive || '').slice(0, 40);
      if (corps.missive) {
        ecriteMissive = ECRITURES.missive(corps);
        if (!ecriteMissive.ok) return ecriteMissive;
      }
    }
    var rangs = d.missions.map(function (m) {
      return {
        numero: m.numero, demande: d.numero, type: m.type, objet: m.objet, quantite: m.quantite, poids: nombreOuVide(m.poids),
        effort: m.effort, points: m.points, statut: 'ouverte', prisPar: '', prisLe: '', accomplieLe: '', note: m.note || '', journal: '',
      };
    });
    ajouter(defDemandes(), [rangD], preparerMasque(defDemandes()));
    ajouter(M.missions, rangs, preparerMasque(M.missions));
    var graine = corps.ponderation && ongletVide(M.ponderation) ? ecrirePonderation(corps.ponderation) : null;
    var reponse = {
      ok: true, numero: d.numero, missions: rangs.length, ponderationSemee: Boolean(graine),
      maj: function (o) {
        if (ecriteMissive) ecriteMissive.maj(o);
        (o.demandes = o.demandes || []).push(complet(defDemandes(), rangD));
        o.missions = o.missions || [];
        rangs.forEach(function (x) { o.missions.push(complet(M.missions, x)); });
        if (graine) {
          o.ponderation = graine.lignes.map(function (x) { return complet(M.ponderation, x); });
          o.reglagesMissions = graine.reglages.map(function (x) { return complet(M.reglagesMissions, x); });
        }
      },
    };
    if (ecriteMissive) reponse.missive = ecriteMissive.numero;
    return reponse;
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

/**
 * A Discord seal linked to its member (v3n), under the lock: the Membres row named `nom` (compared like
 * headers) gets the ID and the pseudo when its « Discord ID » is empty; `creer` appends a row (Nom, Rôle
 * « Membre », ID, pseudo) when no row has that name. Nom and Rôle are never written on an existing row.
 * The « Discord ID » / « Pseudo Discord » headers are added at the end of row 1 when missing.
 */
ECRITURES.membre = function (corps) {
  // v3p: a `rangs: true` caller writes the member's ranks in « Rôle »; any other caller gets v3n's action, unchanged.
  return AVEC_RANGS ? membreAvecRangs(corps) : membreV3n(corps);
};

/** v3n's 'membre', exactly (callers without `rangs: true`: production, Essai). */
function membreV3n(corps) {
  var m = corps.membre;
  var id = String((m && m.discord) || '').replace(/\D/g, '');
  if (!m || !id) return { ok: false, erreur: 'no seal' };
  var def = ONGLETS.membres;
  var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom);
  if (!feuille || feuille.getLastRow() < 1) return { ok: false, erreur: 'no members tab' };
  var tout = feuille.getDataRange().getValues();
  var idx = indexColonnes(tout[0], def);
  if (idx.nom < 0) return { ok: false, erreur: 'no members tab' };
  var ajouterEntete = function (titre) {
    var premiere = feuille.getRange(1, 1, 1, Math.max(feuille.getLastColumn(), 1)).getValues()[0];
    var fin = premiere.length;
    while (fin > 0 && String(premiere[fin - 1]).trim() === '') fin--;
    feuille.getRange(1, fin + 1).setValue(titre).setFontWeight('bold');
    return fin;
  };
  var cellule = function (l, champ) { return idx[champ] >= 0 ? l[idx[champ]] : ''; };
  var pseudo = String(m.pseudo || '').slice(0, 80);
  var parId = -1;
  var parNom = -1;
  for (var r = 1; r < tout.length; r++) {
    if (String(cellule(tout[r], 'discord')).replace(/\D/g, '') === id) parId = r;
    if (m.nom && parNom < 0 && cleEntete(cellule(tout[r], 'nom')) === cleEntete(m.nom)) parNom = r;
  }
  var ecrire = function (r, champ, valeur) {
    if (idx[champ] < 0) idx[champ] = ajouterEntete(champ === 'discord' ? 'Discord ID' : 'Pseudo Discord');
    feuille.getRange(r + 1, idx[champ] + 1).setValue(valeur);
  };
  var maj = null;
  var nom;
  var cree = false;
  if (!m.nom) {
    // Only the pseudo of the row already holding this seal.
    if (parId < 0) return { ok: false, erreur: 'unknown member' };
    nom = String(cellule(tout[parId], 'nom'));
    ecrire(parId, 'pseudo', pseudo);
  } else if (parId >= 0 && parId !== parNom) {
    return { ok: false, erreur: 'seal taken' };
  } else if (parNom >= 0) {
    var role = String(cellule(tout[parNom], 'role'));
    if (/ami(e|s)?deslunes/.test(cleEntete(role))) return { ok: false, erreur: 'friend' };
    var actuel = String(cellule(tout[parNom], 'discord')).replace(/\D/g, '');
    if (actuel && actuel !== id) return { ok: false, erreur: 'other seal' };
    nom = String(cellule(tout[parNom], 'nom'));
    if (!actuel) ecrire(parNom, 'discord', "'" + id);
    ecrire(parNom, 'pseudo', pseudo);
  } else {
    if (!m.creer) return { ok: false, erreur: 'unknown member' };
    nom = String(m.nom).slice(0, 80);
    if (idx.role < 0) return { ok: false, erreur: 'no role column' };
    if (idx.discord < 0) idx.discord = ajouterEntete('Discord ID');
    if (idx.pseudo < 0) idx.pseudo = ajouterEntete('Pseudo Discord');
    var largeur = Math.max(idx.nom, idx.role, idx.discord, idx.pseudo) + 1;
    var ligne = [];
    for (var c = 0; c < largeur; c++) ligne.push('');
    ligne[idx.nom] = nom;
    ligne[idx.role] = 'Membre';
    ligne[idx.discord] = "'" + id;
    ligne[idx.pseudo] = pseudo;
    feuille.getRange(feuille.getLastRow() + 1, 1, 1, largeur).setValues([ligne]);
    cree = true;
  }
  // No `maj`: the tabs are read again (a first seal is rare).
  return { ok: true, nom: nom, cree: cree };
}

/** The ranks' cell: the labels sent, trimmed, without duplicates, joined by « , ». */
function texteRangs(rangs) {
  var vus = {};
  return (rangs || []).map(function (x) { return String(x).trim().slice(0, 60); }).filter(function (x) {
    var k = cleEntete(x);
    if (!k || vus[k]) return false;
    vus[k] = true;
    return true;
  }).join(', ');
}

/**
 * v3p's 'membre' (`rangs: true`): v3n's linking rules, plus the member's ranks (`membre.rangs`, labels of the Rôles
 * tab matched to their Discord roles by the grimoire) written in « Rôle » — on the row holding the seal (empty
 * `nom`), on the row linked, on the row created. A rank « Ami des Lunes » → 'friend' (the cell is not looked at:
 * it only mirrors the last seal). No « Rôle » column: nothing written there, a creation is not refused. Without
 * `membre.rangs` (an array) the « Rôle » cell is left as it is.
 */
function membreAvecRangs(corps) {
  var m = corps.membre;
  var id = String((m && m.discord) || '').replace(/\D/g, '');
  if (!m || !id) return { ok: false, erreur: 'no seal' };
  var avecRangs = Object.prototype.toString.call(m.rangs) === '[object Array]';
  var rangs = avecRangs ? texteRangs(m.rangs) : '';
  if (avecRangs && m.rangs.some(function (x) { return /^ami(e|s)?deslunes$/.test(cleEntete(x)); })) return { ok: false, erreur: 'friend' };
  var def = ONGLETS.membres;
  var feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.nom);
  if (!feuille || feuille.getLastRow() < 1) return { ok: false, erreur: 'no members tab' };
  var tout = feuille.getDataRange().getValues();
  var idx = indexColonnes(tout[0], def);
  if (idx.nom < 0) return { ok: false, erreur: 'no members tab' };
  var ajouterEntete = function (titre) {
    var premiere = feuille.getRange(1, 1, 1, Math.max(feuille.getLastColumn(), 1)).getValues()[0];
    var fin = premiere.length;
    while (fin > 0 && String(premiere[fin - 1]).trim() === '') fin--;
    feuille.getRange(1, fin + 1).setValue(titre).setFontWeight('bold');
    return fin;
  };
  var cellule = function (l, champ) { return idx[champ] >= 0 ? l[idx[champ]] : ''; };
  var pseudo = String(m.pseudo || '').slice(0, 80);
  var parId = -1;
  var parNom = -1;
  for (var r = 1; r < tout.length; r++) {
    if (String(cellule(tout[r], 'discord')).replace(/\D/g, '') === id) parId = r;
    if (m.nom && parNom < 0 && cleEntete(cellule(tout[r], 'nom')) === cleEntete(m.nom)) parNom = r;
  }
  var ecrire = function (r, champ, valeur) {
    if (idx[champ] < 0) idx[champ] = ajouterEntete(champ === 'discord' ? 'Discord ID' : 'Pseudo Discord');
    feuille.getRange(r + 1, idx[champ] + 1).setValue(valeur);
  };
  // « Rôle » is never added: a sheet without it simply does not get the ranks.
  var ecrireRangs = function (r) {
    if (avecRangs && idx.role >= 0 && String(cellule(tout[r], 'role')) !== rangs) feuille.getRange(r + 1, idx.role + 1).setValue(rangs);
  };
  var nom;
  var cree = false;
  if (!m.nom) {
    // The pseudo and the ranks of the row already holding this seal.
    if (parId < 0) return { ok: false, erreur: 'unknown member' };
    nom = String(cellule(tout[parId], 'nom'));
    if (String(cellule(tout[parId], 'pseudo')) !== pseudo) ecrire(parId, 'pseudo', pseudo);
    ecrireRangs(parId);
  } else if (parId >= 0 && parId !== parNom) {
    return { ok: false, erreur: 'seal taken' };
  } else if (parNom >= 0) {
    var actuel = String(cellule(tout[parNom], 'discord')).replace(/\D/g, '');
    if (actuel && actuel !== id) return { ok: false, erreur: 'other seal' };
    nom = String(cellule(tout[parNom], 'nom'));
    if (!actuel) ecrire(parNom, 'discord', "'" + id);
    ecrire(parNom, 'pseudo', pseudo);
    ecrireRangs(parNom);
  } else {
    if (!m.creer) return { ok: false, erreur: 'unknown member' };
    nom = String(m.nom).slice(0, 80);
    if (idx.discord < 0) idx.discord = ajouterEntete('Discord ID');
    if (idx.pseudo < 0) idx.pseudo = ajouterEntete('Pseudo Discord');
    var largeur = Math.max(idx.nom, idx.role, idx.discord, idx.pseudo) + 1;
    var ligne = [];
    for (var c = 0; c < largeur; c++) ligne.push('');
    ligne[idx.nom] = nom;
    if (idx.role >= 0) ligne[idx.role] = rangs;
    ligne[idx.discord] = "'" + id;
    ligne[idx.pseudo] = pseudo;
    feuille.getRange(feuille.getLastRow() + 1, 1, 1, largeur).setValues([ligne]);
    cree = true;
  }
  // No `maj`: the tabs are read again (a seal is rare).
  return { ok: true, nom: nom, cree: cree, rangs: rangs };
}

/**
 * v3p (`rangs: true` only): the Grimoire's rows of the shared Permissions tab, from the secret page (the grimoire's
 * server allows only its testers; the script sees the shared token only) or the first seed. Only Grimoire rows
 * and row 1 are written: a row of another « Outil » is never touched, nor a column renamed or moved.
 *  - the tab missing or empty: created with the header Outil | Geste | Clé | one column per rank of `rangs`;
 *  - a rank of `rangs` without a column: its header appended at the end of row 1;
 *  - each line: its Grimoire row (found by « Clé ») gets the cells of `valeurs` (by header), others kept;
 *    a line without a row is appended (Outil « Grimoire », Geste, Clé, its cells);
 *  - `semer`: only when the tab holds no Grimoire row at all (else nothing is written: seme false).
 */
ECRITURES.permissions = function (corps) {
  var d = corps.droits;
  if (!d || !d.lignes || !d.lignes.length) return { ok: false, erreur: 'empty permissions' };
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var feuille = classeur.getSheetByName(ONGLET_PERMISSIONS);
  var cree = false;
  if (!feuille) {
    feuille = classeur.insertSheet(ONGLET_PERMISSIONS);
    cree = true;
  }
  var rangs = [];
  (d.rangs || []).forEach(function (x) {
    var t = String(x).trim().slice(0, 60);
    if (t && !rangs.some(function (y) { return cleEntete(y) === cleEntete(t); })) rangs.push(t);
  });
  var tout = feuille.getLastRow() > 0 ? feuille.getDataRange().getValues() : [];
  var entete = tout.length ? tout[0].map(function (v) { return String(v).trim(); }) : [];
  while (entete.length && !entete[entete.length - 1]) entete.pop();
  // Header: written whole on an empty tab; else only missing columns appended at its end.
  var ajout = [];
  if (!entete.length) {
    ajout = ['Outil', 'Geste', 'Clé'].concat(rangs);
  } else {
    var fixes0 = indexColonnes(entete, { colonnes: COLONNES_PERMISSIONS });
    COLONNES_PERMISSIONS.forEach(function (col) { if (fixes0[col[1]] < 0) ajout.push(col[0]); });
    var noms = entete.map(cleEntete);
    rangs.forEach(function (x) { if (noms.indexOf(cleEntete(x)) < 0) ajout.push(x); });
  }
  var fixes = indexColonnes(entete.concat(ajout), { colonnes: COLONNES_PERMISSIONS });
  // The Grimoire's rows (0-based row index in `tout`) by key.
  var parCle = {};
  var nGrimoire = 0;
  for (var r = 1; r < tout.length; r++) {
    if (cleEntete(tout[r][fixes.outil]) !== cleEntete(OUTIL)) continue;
    nGrimoire++;
    var k0 = cleEntete(tout[r][fixes.cle]);
    if (k0 && parCle[k0] === undefined) parCle[k0] = r;
  }
  if (d.semer && nGrimoire > 0) return { ok: true, seme: false, lignes: 0, ajoutees: 0, colonnes: [], cree: false };
  if (ajout.length) {
    feuille.getRange(1, entete.length + 1, 1, ajout.length).setValues([ajout]).setFontWeight('bold');
    if (!entete.length) feuille.setFrozenRows(1);
  }
  entete = entete.concat(ajout);
  var largeur = entete.length;
  var nomsEntete = entete.map(cleEntete);
  var pris = [fixes.outil, fixes.geste, fixes.cle];
  var colonneDe = function (h) {
    var i = nomsEntete.indexOf(cleEntete(h));
    return i >= 0 && pris.indexOf(i) < 0 ? i : -1;
  };
  var modifiees = {};
  var nouvelles = [];
  d.lignes.forEach(function (l) {
    var k = cleEntete(l.cle);
    if (!k) return;
    var v = l.valeurs || {};
    var r = parCle[k];
    var ligne;
    if (r === undefined) {
      ligne = [];
      for (var c = 0; c < largeur; c++) ligne.push('');
      ligne[fixes.outil] = OUTIL;
      ligne[fixes.geste] = String(l.geste || '').slice(0, 120);
      ligne[fixes.cle] = String(l.cle).slice(0, 60);
      Object.keys(v).forEach(function (h) { var i = colonneDe(h); if (i >= 0) ligne[i] = v[h] === true; });
      // The row's other rank cells: unchecked boxes, not blanks.
      for (var j = 0; j < largeur; j++) if (pris.indexOf(j) < 0 && ligne[j] === '') ligne[j] = false;
      nouvelles.push(ligne);
      parCle[k] = -1;
      return;
    }
    if (r < 0) return;
    ligne = tout[r].slice(0, largeur);
    while (ligne.length < largeur) ligne.push('');
    Object.keys(v).forEach(function (h) { var i = colonneDe(h); if (i >= 0) ligne[i] = v[h] === true; });
    for (var j2 = 0; j2 < largeur; j2++) if (pris.indexOf(j2) < 0 && ligne[j2] === '') ligne[j2] = false;
    tout[r] = ligne;
    modifiees[r] = true;
  });
  // Rank cells: the columns other than Outil / Geste / Clé, in contiguous runs (for the checkboxes).
  var plages = [];
  for (var c2 = 0; c2 < largeur; c2++) {
    if (pris.indexOf(c2) >= 0) continue;
    if (plages.length && plages[plages.length - 1][1] === c2) plages[plages.length - 1][1] = c2 + 1;
    else plages.push([c2, c2 + 1]);
  }
  var cocher = function (ligne1, n) {
    plages.forEach(function (pl) {
      try {
        feuille.getRange(ligne1, pl[0] + 1, n, pl[1] - pl[0]).insertCheckboxes();
      } catch (err) {
        // Plain TRUE / FALSE cells: the grimoire reads them the same way.
      }
    });
  };
  // Existing Grimoire rows: rewritten by runs of consecutive rows (each run holds Grimoire rows only).
  var rangees = Object.keys(modifiees).map(Number).sort(function (a, b) { return a - b; });
  for (var i0 = 0; i0 < rangees.length; ) {
    var i1 = i0;
    while (i1 + 1 < rangees.length && rangees[i1 + 1] === rangees[i1] + 1) i1++;
    var bloc = rangees.slice(i0, i1 + 1).map(function (x) { return tout[x]; });
    feuille.getRange(rangees[i0] + 1, 1, bloc.length, largeur).setValues(bloc);
    cocher(rangees[i0] + 1, bloc.length);
    i0 = i1 + 1;
  }
  // New rows: appended one by one (appendRow: the Table may append its own rows at the same time).
  nouvelles.forEach(function (ligne) {
    feuille.appendRow(ligne);
    cocher(feuille.getLastRow(), 1);
  });
  // No `maj`: the tabs are read again (a rare write).
  return { ok: true, seme: Boolean(d.semer), lignes: rangees.length, ajoutees: nouvelles.length, colonnes: ajout, cree: cree };
};

/** v3r: the Intendance rows' dates (an ISO text becomes a date cell). */
function daterIntendance(o) {
  var r = {};
  Object.keys(o || {}).forEach(function (k) {
    var v = o[k];
    r[k] = (k === 'date' || k === 'le') && typeof v === 'string' && v ? new Date(v) : v === null || v === undefined ? '' : v;
  });
  return r;
}

/**
 * v3r (`intendance: true` only): one gesture of the Livre de l'Intendance, under the lock. Every row to update is
 * checked first (found by its « N° », its « Statut » one of `si`), so a deposit cannot be confirmed twice; nothing
 * is written when one check fails. Then: the Intendance rows (new ones appended, the others updated in place), the
 * chest's Mouvements rows ('dépôt' in, 'livraison' out), the Points rows, and a Membres row (Nom, Rôle) for each
 * name to reserve that no row holds yet (compared like headers; a Rôle column missing: the name alone).
 */
ECRITURES.intendance = function (corps) {
  // The payload is `coffre` (the flag `intendance: true` holds the key `intendance`).
  var c = corps.coffre;
  if (!c) return { ok: false, erreur: 'empty intendance' };
  var def = ONGLETS_INTENDANCE.intendance;
  var nouvelles = (c.lignes || []).map(daterIntendance);
  var majs = c.maj || [];
  var TYPES = { depot: 'dépôt', livraison: 'livraison' };
  var mvts = (c.mouvements || []).map(function (m) {
    return {
      horodatage: new Date(m.horodatage), action: m.action || '', missive: m.missive || '', membre: m.membre || '',
      type: TYPES[cleEntete(m.type)] || '', objet: m.objet, quantite: m.quantite, note: m.note || '',
    };
  });
  if (mvts.some(function (m) { return !m.type || !m.objet; })) return { ok: false, erreur: 'bad movement' };
  var points = (c.points || []).map(function (x) {
    return { horodatage: new Date(x.horodatage), membre: x.membre, points: Number(x.points) || 0, raison: x.raison || '', mission: x.mission || '', confirmePar: x.confirmePar || '' };
  });
  if (!nouvelles.length && !majs.length && !mvts.length) return { ok: false, erreur: 'empty intendance' };
  var o = ouvrirMasque(def);
  var p = o.p;
  var cellule = function (l, champ) { return p.cols[champ] ? l[p.cols[champ] - 1] : ''; };
  var rangDe = function (id) {
    for (var k = 0; k < o.lignes.length; k++) if (cleEntete(cellule(o.lignes[k], 'id')) === cleEntete(id)) return k;
    return -1;
  };
  // 1. Every check, before anything is written.
  var cibles = [];
  for (var i = 0; i < majs.length; i++) {
    var m = majs[i];
    var r = m && m.id ? rangDe(m.id) : -1;
    if (r < 0) return { ok: false, erreur: 'unknown row ' + (m && m.id) };
    var st = cleEntete(cellule(o.lignes[r], 'statut'));
    if (m.si && m.si.length && !m.si.some(function (s) { return cleEntete(s) === st; })) return { ok: false, erreur: 'already answered ' + m.id };
    cibles.push({ r: r, id: m.id, champs: daterIntendance(m.champs) });
  }
  for (var j = 0; j < nouvelles.length; j++) {
    if (!nouvelles[j].id || rangDe(nouvelles[j].id) >= 0) return { ok: false, erreur: 'row exists ' + nouvelles[j].id };
  }
  var membres = null;
  var reserves = [];
  if ((c.reserver || []).length) {
    var fm = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ONGLETS.membres.nom);
    if (!fm || fm.getLastRow() < 1) return { ok: false, erreur: 'no members tab' };
    var toutM = fm.getDataRange().getValues();
    var idxM = indexColonnes(toutM[0], ONGLETS.membres);
    if (idxM.nom < 0) return { ok: false, erreur: 'no members tab' };
    var connus = {};
    for (var rm = 1; rm < toutM.length; rm++) connus[cleEntete(toutM[rm][idxM.nom])] = true;
    c.reserver.forEach(function (x) {
      var nom = String((x && x.nom) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      var k = cleEntete(nom);
      if (!k || connus[k]) return;
      connus[k] = true;
      reserves.push({ nom: nom, role: idxM.role >= 0 ? String(x.role || '').slice(0, 60) : '' });
    });
    membres = { feuille: fm, idx: idxM };
  }
  // 2. The writes.
  cibles.forEach(function (x) {
    o.lignes[x.r] = enLigne(p, x.champs, o.lignes[x.r]).slice(0, p.largeur);
    p.feuille.getRange(x.r + 2, 1, 1, p.largeur).setValues([o.lignes[x.r]]);
  });
  if (nouvelles.length) ajouter(def, nouvelles, p);
  if (mvts.length) ajouter(ONGLETS.mouvements, mvts);
  if (points.length) ajouter(ONGLETS_MISSIONS.points, points, preparerMasque(ONGLETS_MISSIONS.points));
  if (reserves.length) {
    var largeurM = Math.max(membres.idx.nom, membres.idx.role) + 1;
    var lignesM = reserves.map(function (x) {
      var l = [];
      for (var q = 0; q < largeurM; q++) l.push('');
      l[membres.idx.nom] = x.nom;
      if (membres.idx.role >= 0) l[membres.idx.role] = x.role;
      return l;
    });
    membres.feuille.getRange(membres.feuille.getLastRow() + 1, 1, lignesM.length, largeurM).setValues(lignesM);
  }
  return {
    ok: true, lignes: nouvelles.length, misesAJour: majs.length, reserves: reserves.map(function (x) { return x.nom; }),
    maj: function (oc) {
      oc.intendance = oc.intendance || [];
      cibles.forEach(function (x) {
        oc.intendance.forEach(function (y) {
          if (cleEntete(y.id) !== cleEntete(x.id)) return;
          Object.keys(x.champs).forEach(function (k) { if (p.cols[k]) y[k] = x.champs[k]; });
        });
      });
      nouvelles.forEach(function (x) { oc.intendance.push(complet(def, x)); });
      if (mvts.length) mvts.forEach(function (x) { (oc.mouvements = oc.mouvements || []).push(complet(ONGLETS.mouvements, x)); });
      if (points.length) points.forEach(function (x) { (oc.points = oc.points || []).push(complet(ONGLETS_MISSIONS.points, x)); });
      if (reserves.length) reserves.forEach(function (x) { (oc.membres = oc.membres || []).push(complet(ONGLETS.membres, x)); });
    },
  };
};

/**
 * v3s (`feuillets: true` only): a sheet of missions edited, closed or reopened, under the lock. Everything is checked
 * before anything is written: the sheet's Demandes row (its « Statut » one of `si`), each mission (on that sheet, its
 * « Statut » one of `si`, its « Quantité » still the one the page saw), each added number free. Then the Demandes row,
 * the Missions rows in place (only the fields below; `journal` appended to « Journal »), the added rows. No row is ever
 * deleted: a line removed is « retirée », a closed one « close ».
 */
var CHAMPS_FEUILLET = ['titre', 'note', 'statut'];
var CHAMPS_MISSION = ['quantite', 'points', 'effort', 'statut', 'note'];
ECRITURES.feuillet = function (corps) {
  var f = corps.feuillet;
  if (!f || !f.numero) return { ok: false, erreur: 'empty sheet' };
  var M = ONGLETS_MISSIONS;
  var garder = function (o, cles) {
    var r = {};
    Object.keys(o || {}).forEach(function (k) { if (cles.indexOf(k) >= 0 && o[k] !== undefined && o[k] !== null) r[k] = o[k]; });
    return r;
  };
  var parmi = function (si, v) { return !si || !si.length || si.some(function (s) { return cleEntete(s) === cleEntete(v); }); };
  // 1. Every check, before anything is written (no tab is created for a sheet that cannot exist).
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  if (!classeur.getSheetByName(DEMANDES_V3R.nom) || !classeur.getSheetByName(M.missions.nom)) return { ok: false, erreur: 'unknown sheet ' + f.numero };
  var od = ouvrirMasque(DEMANDES_V3R);
  var pd = od.p;
  var celD = function (l, c) { return pd.cols[c] ? l[pd.cols[c] - 1] : ''; };
  var iD = -1;
  for (var r = 0; r < od.lignes.length; r++) if (cleEntete(celD(od.lignes[r], 'numero')) === cleEntete(f.numero)) { iD = r; break; }
  if (iD < 0) return { ok: false, erreur: 'unknown sheet ' + f.numero };
  if (!parmi(f.si, celD(od.lignes[iD], 'statut'))) return { ok: false, erreur: 'sheet changed ' + f.numero };
  var champsD = garder(f.champs, CHAMPS_FEUILLET);
  if (champsD.titre !== undefined) champsD.titre = String(champsD.titre).slice(0, 120);
  if (champsD.note !== undefined) champsD.note = String(champsD.note).slice(0, 200);
  var om = ouvrirMasque(M.missions);
  var pm = om.p;
  var celM = function (l, c) { return pm.cols[c] ? l[pm.cols[c] - 1] : ''; };
  var rangM = function (n) {
    for (var k = 0; k < om.lignes.length; k++) if (cleEntete(celM(om.lignes[k], 'numero')) === cleEntete(n)) return k;
    return -1;
  };
  var cibles = [];
  var majs = f.missions || [];
  for (var i = 0; i < majs.length; i++) {
    var m = majs[i];
    var k = m && m.numero ? rangM(m.numero) : -1;
    if (k < 0 || cleEntete(celM(om.lignes[k], 'demande')) !== cleEntete(f.numero)) return { ok: false, erreur: 'unknown mission ' + (m && m.numero) };
    if (!parmi(m.si, celM(om.lignes[k], 'statut'))) return { ok: false, erreur: 'sheet changed ' + m.numero };
    if (m.quantite !== undefined && m.quantite !== null && Number(celM(om.lignes[k], 'quantite')) !== Number(m.quantite)) return { ok: false, erreur: 'sheet changed ' + m.numero };
    var champs = garder(m.champs, CHAMPS_MISSION);
    if (m.journal) {
      var avant = String(celM(om.lignes[k], 'journal') || '');
      champs.journal = (avant ? avant + ' · ' : '') + String(m.journal).slice(0, 200);
    }
    cibles.push({ k: k, numero: m.numero, champs: champs });
  }
  var ajouts = (f.ajouts || []).map(function (a) {
    return {
      numero: a.numero, demande: f.numero, type: a.type, objet: a.objet, quantite: a.quantite, poids: nombreOuVide(a.poids), effort: nombreOuVide(a.effort),
      points: a.points || 0, statut: 'ouverte', prisPar: '', prisLe: '', accomplieLe: '', note: a.note || '', journal: String(a.journal || '').slice(0, 200),
    };
  });
  for (var j = 0; j < ajouts.length; j++) {
    if (!ajouts[j].numero || !ajouts[j].objet || rangM(ajouts[j].numero) >= 0) return { ok: false, erreur: 'row exists ' + ajouts[j].numero };
  }
  if (!Object.keys(champsD).length && !cibles.length && !ajouts.length) return { ok: false, erreur: 'empty sheet' };
  // 2. The writes.
  if (Object.keys(champsD).length) {
    od.lignes[iD] = enLigne(pd, champsD, od.lignes[iD]).slice(0, pd.largeur);
    pd.feuille.getRange(iD + 2, 1, 1, pd.largeur).setValues([od.lignes[iD]]);
  }
  cibles.forEach(function (x) {
    om.lignes[x.k] = enLigne(pm, x.champs, om.lignes[x.k]).slice(0, pm.largeur);
    pm.feuille.getRange(x.k + 2, 1, 1, pm.largeur).setValues([om.lignes[x.k]]);
  });
  if (ajouts.length) ajouter(M.missions, ajouts, pm);
  return {
    ok: true, numero: f.numero, missions: cibles.length, ajoutees: ajouts.length,
    maj: function (o) {
      if (Object.keys(champsD).length) {
        (o.demandes || []).forEach(function (x) {
          if (cleEntete(x.numero) !== cleEntete(f.numero)) return;
          Object.keys(champsD).forEach(function (c) { x[c] = champsD[c]; });
        });
      }
      cibles.forEach(function (y) {
        (o.missions || []).forEach(function (x) {
          if (cleEntete(x.numero) !== cleEntete(y.numero)) return;
          Object.keys(y.champs).forEach(function (c) { x[c] = y.champs[c]; });
        });
      });
      ajouts.forEach(function (x) { (o.missions = o.missions || []).push(complet(M.missions, x)); });
    },
  };
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

/** Run once from the editor (as `grimoirePreparerPaie`) to create the pay's tabs (hidden) without waiting for a first write (v3n). */
function preparerPaie() {
  Object.keys(ONGLETS_PAIE).forEach(function (k) {
    var p = preparerMasque(ONGLETS_PAIE[k]);
    Logger.log('Tab "' + ONGLETS_PAIE[k].nom + '" ready (hidden: ' + p.feuille.isSheetHidden() + '), ' + p.feuille.getLastRow() + ' row(s).');
  });
  viderCache();
  nouvelleVersion();
}

/** Run once from the editor (as `grimoirePreparerMissions`) to create the missions' tabs (hidden) without waiting for a first demand. */
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

/** Run once from the editor (as `grimoireEssai`) to check the tabs and headers (no web call needed). */
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

/* ───────────────────────── The renaming of 2026-11-06 (v3t, run by hand once) ───────────────────────── */

/**
 * v3t: the items' names brought to the official French names of the game (decisions of 2026-11-06,
 * plan-renommage.json). Run from the editor only: `grimoireRenommerSimuler` (changes nothing, logs everything)
 * then `grimoireRenommer` (once; a second run is refused). Nothing here is reachable by a web call.
 *   renames: one item, one name: every cell of a name column holding `fr_old` (compared like headers: case, accents,
 *            punctuation ignored) becomes `fr_new`, in every tab. `fusion`: `fr_old` was a duplicate of `fr_new`: where
 *            both have their own row (Catalogues, Ressources, Pondération, a recipe), the row of `fr_new` wins.
 *   en:      the English name of the row whose French name (once renamed) is `fr`, in the tabs listed, when it is
 *            still `en_old` (exactly; '' = an empty cell); any other value is left and reported.
 *   deletes: the rows of `name` (its main name column) deleted from `tab`.
 *   adds:    rows appended to `tab` (fields of its ONGLETS mapping), unless the name is already there.
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
  var M = ONGLETS_MISSIONS;
  var P = ONGLETS_PAIE;
  return [
    { def: ONGLETS.catalogue, fr: ['fr'], en: [['fr', 'en']], principal: 'fr', unique: 'nom', libre: ['note'] },
    { def: ONGLETS.recettes, fr: ['produit', 'ingredient'], en: [['produit', 'produitEn']], principal: 'produit', unique: 'recette', libre: ['note'] },
    { def: ONGLETS.ressources, fr: ['nom'], en: [['nom', 'en']], principal: 'nom', unique: 'nom', libre: ['note'] },
    { def: ONGLETS.commandes, fr: ['article'], libre: [] },
    { def: M.ponderation, fr: ['nom'], principal: 'nom', unique: 'genre', libre: ['note'],
      si: function (ligne, idx) { return idx.genre >= 0 && cleEntete(ligne[idx.genre]).indexOf('class') !== 0; } },
    { def: ONGLETS.missives, fr: ['produit'], libre: ['titre', 'recettes', 'noteCloture'] },
    { def: ONGLETS.mouvements, fr: ['objet'], libre: ['note'] },
    { def: DEMANDES_V3R, fr: ['article'], libre: ['titre', 'note'] },
    { def: M.missions, fr: ['objet'], libre: ['note', 'journal'] },
    { def: M.permanentes, fr: ['objet'], libre: ['note'] },
    { def: ONGLETS_INTENDANCE.intendance, fr: ['objet'], libre: ['note'] },
    { def: P.ecrituresEvenement, fr: ['objet'], libre: ['libelle'] },
    { def: P.factures, fr: [], libre: ['libelle', 'note'] },
    { def: P.evenements, fr: [], libre: ['nom', 'note'] },
    { def: M.points, fr: [], libre: ['raison'] },
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
 * `ajouts` (rows as arrays), `formules` (cells left: they hold a formula), `ecarts` (English names that are neither
 * the old nor the new one), `libres` (free text citing an old name), `bloquants` (duplicates the plan does not settle).
 */
function analyserRenommage() {
  var I = indexRenommage();
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var res = { onglets: [], bloquants: 0 };
  ciblesRenommage().forEach(function (c) {
    var r = { nom: c.def.nom, present: false, cellules: [], suppressions: [], ajouts: [], formules: [], ecarts: [], libres: [], bloquants: [], absents: [] };
    res.onglets.push(r);
    var feuille = classeur.getSheetByName(c.def.nom);
    if (!feuille || feuille.getLastRow() < 1) return;
    r.present = true;
    var plage = feuille.getDataRange();
    var tout = plage.getValues();
    var formules = plage.getFormulas();
    var idx = indexColonnes(tout[0], c.def);
    r.largeur = tout[0].length;
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
 * plan when one row already held the name and the others come from a `fusion` rename: they are deleted (the first
 * row's prices kept); anything else is a `bloquant` (the real run then writes nothing).
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
        g.forEach(function (x) {
          if (cleEntete(avant(x)) === cleEntete(nomNeuf)) return;
          x.supprimee = true;
          r.suppressions.push({ ligne: x.ligne, nom: avant(x), raison: 'doublon de « ' + nomNeuf + ' » (fusion)' });
        });
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
  });
  // A row deleted as a duplicate keeps no cell change.
  var parties = {};
  r.suppressions.forEach(function (s) { parties[s.ligne] = true; });
  r.cellules = r.cellules.filter(function (x) { return !parties[x.ligne]; });
}

/** The analysis as French lines for the editor's log (also the real run's report). */
function journalRenommage(a, titre) {
  var lignes = [titre];
  var total = { cellules: 0, suppressions: 0, ajouts: 0 };
  a.onglets.forEach(function (r) {
    if (!r.present) { lignes.push('— ' + r.nom + ' : onglet absent, rien à faire.'); return; }
    total.cellules += r.cellules.length;
    total.suppressions += r.suppressions.length;
    total.ajouts += r.ajouts.length;
    lignes.push('— ' + r.nom + ' : ' + r.cellules.length + ' cellule(s) à changer, ' + r.suppressions.length + ' ligne(s) à supprimer, ' + r.ajouts.length + ' ligne(s) à ajouter' + (r.bloquants.length ? ', ' + r.bloquants.length + ' DOUBLON(S) NON RÉGLÉ(S)' : '') + '.');
    r.bloquants.forEach(function (b) { lignes.push('   !! DOUBLON : ' + b); });
    r.cellules.forEach(function (x) { lignes.push('   ligne ' + x.ligne + ', ' + entete(ONGLETS_PAR_NOM()[r.nom], x.champ) + ' : « ' + x.ancien + ' » → « ' + x.nouveau + ' »'); });
    r.suppressions.forEach(function (x) { lignes.push('   ligne ' + x.ligne + ' supprimée : « ' + x.nom + ' »' + (x.raison === 'plan' ? '' : ' (' + x.raison + ')')); });
    r.ajouts.forEach(function (x) { lignes.push('   ligne ajoutée : ' + x.filter(function (v) { return v !== ''; }).join(' | ')); });
    r.formules.forEach(function (x) { lignes.push('   ligne ' + x.ligne + ', ' + entete(ONGLETS_PAR_NOM()[r.nom], x.champ) + ' : une formule (« ' + x.valeur + ' »), laissée telle quelle'); });
    r.ecarts.forEach(function (x) { lignes.push('   ligne ' + x.ligne + ', nom anglais de « ' + x.fr + ' » : « ' + x.actuel + ' » (le plan attendait « ' + x.attendu + ' » → « ' + x.nouveau + ' »), laissé'); });
    r.absents.forEach(function (x) { lignes.push('   note : ' + x); });
    r.libres.forEach(function (x) { lignes.push('   texte libre, ligne ' + x.ligne + ', ' + entete(ONGLETS_PAR_NOM()[r.nom], x.champ) + ' : cite « ' + x.noms.join(' », « ') + ' » (non modifié)'); });
  });
  lignes.push('Total : ' + total.cellules + ' cellule(s), ' + total.suppressions + ' ligne(s) supprimée(s), ' + total.ajouts + ' ligne(s) ajoutée(s)' + (a.bloquants ? ' ; ' + a.bloquants + ' doublon(s) à régler avant le vrai passage.' : '.'));
  return lignes;
}

/** Every tab mapping of the renaming by its sheet name. */
function ONGLETS_PAR_NOM() {
  var res = {};
  ciblesRenommage().forEach(function (c) { res[c.def.nom] = c.def; });
  return res;
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

/** Run from the editor (as `grimoireRenommerSimuler`): what the renaming would do, logged; nothing is written. */
function renommerSimuler() {
  var fait = PropertiesService.getScriptProperties().getProperty(RENOMMAGE_FAIT);
  var a = analyserRenommage();
  var lignes = journalRenommage(a, 'SIMULATION du renommage du ' + RENOMMAGE.date + ' (rien n\'est écrit).' + (fait ? ' Déjà fait le ' + fait + ' : le vrai passage sera refusé.' : ''));
  lignes.push(a.bloquants ? 'Le vrai passage (grimoireRenommer) sera refusé tant que ces doublons ne sont pas réglés.' : 'Si tout est juste : sélectionner grimoireRenommer puis Exécuter.');
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
 * Run from the editor (as `grimoireRenommer`), once: under the script lock, the analysis is made again on the sheet
 * as it is, refused when a duplicate is not settled; each tab it touches is copied first to a hidden backup tab;
 * then the cells, the deleted rows (bottom up), the added rows; RENOMMAGE_FAIT set; the cache dropped and the
 * version moved on, as a hand edit does.
 */
function renommer() {
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
    // As a hand edit does: the cached tabs dropped, the version moved on (also after a partial write).
    if (touche) {
      viderCache();
      nouvelleVersion();
    }
    verrou.releaseLock();
  }
}

return {
  doGet: doGet,
  doPost: doPost,
  onEdit: onEdit,
  versConseil: versConseil,
  sansConseil: sansConseil,
  essai: essai,
  viderCache: viderCache,
  preparerMissions: preparerMissions,
  preparerPaie: preparerPaie,
  renommer: renommer,
  renommerSimuler: renommerSimuler,
};
})();
