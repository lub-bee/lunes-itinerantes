# Grimoire de la Caravane des Lunes Itinérantes

Private price book of the *Caravane des Lunes Itinérantes* (Skyrim role-play Khajiit caravan).
A leather-bound grimoire whose pages turn: price chapters, memo pages, the caravan's
missives with their recipes and chest, and (soon) the member roster. Everything visible to members is written in-character (French).

Stack: Next.js 15 (App Router) · React 19 · plain CSS · no database. Hosted on Vercel.

## Access

The whole site sits behind "the seal", checked by `middleware.ts` (`lib/sceau.ts`). Two ways in:

- **Discord** (when the `DISCORD_*` variables are set): each member presents their own seal. The key on
  the lock page reads « Présenter son sceau »; turning it goes through Discord, and only a member of the
  caravan's server holding one of the allowed roles gets in. See *Members' seals (Discord)*.
- **Shared password** (when Discord is not configured): the key's shaft is the password field. With
  Discord configured, `SCEAU_MOT_DE_PASSE_COMMUN=1` keeps it as a second way in during the transition
  (« ou murmurer la clef des lunes » under the book).

| Env var | Purpose |
|---|---|
| `CARAVANE_MOT_DE_PASSE` | The caravan's shared password. Changing it logs out every password session. |
| `CARAVANE_SECRET` | Random secret signing the session cookies (`openssl rand -hex 32`). Changing it logs everyone out. |
| `DISCORD_CLIENT_ID` | Discord application's client ID. |
| `DISCORD_CLIENT_SECRET` | Discord application's client secret. |
| `DISCORD_GUILD_ID` | ID of the caravan's Discord server. |
| `DISCORD_ROLE_IDS` | Comma-separated role IDs that open the grimoire (any one is enough). |
| `DISCORD_ROLE_PATRIARCHE` | Optional — role ID marking a Patriarch (carried in the session, unused for now). |
| `SCEAU_MOT_DE_PASSE_COMMUN` | Optional — `1` keeps the shared password alongside Discord. |
| `CATALOGUE_CSV_URL` | Optional — published CSV of the price sheet (see below). |
| `COMMANDES_SCRIPT_URL` | Optional — URL of the Apps Script web app: sealed orders, missives, recipes, members (see *Order mode* and *Missives*). |
| `COMMANDES_JETON` | Optional — shared secret checked by that Apps Script (script property `JETON`). |

A password session lasts 30 days. Local dev: copy `.env.example` to `.env.local`, fill it, `npm run dev`.

## Members' seals (Discord)

How it works: OAuth2 authorization code, scopes `identify guilds.members.read`, no bot. Back from
Discord (`/api/discord/retour`), the server reads the visitor's membership of `DISCORD_GUILD_ID`
(`GET /users/@me/guilds/{guild}/member`) and lets them in only if they hold one of `DISCORD_ROLE_IDS`.
The session cookie (signed with `CARAVANE_SECRET`) holds the Discord id, the display name (server
nickname, else Discord display name, else username), the Patriarch flag and a 24 h expiry. When it
expires, a returning visitor is sent back through Discord with `prompt=none`, which comes straight back
if they still hold the role (seamless) and refuses them in character if the role was taken away.
Closing the grimoire (iron latch, or the key on mobile) forgets the session.

On the order sheet the seller is the session's name (fixed; `/api/commande` reads it from the cookie,
never from the page). Password sessions are « Un marchand de la caravane » and type the seller's name; once that name is
recognized on the Membres tab (see *Missives — Who holds the pen*), it signs the order instead.

Refusals shown on the lock page: not a member of the server, member without the role, Discord
refused or failed, tampered request.

### Setting it up

1. Open <https://discord.com/developers/applications> → **New Application** (e.g. *Grimoire de la
   Caravane*). Its icon and name are what members see on Discord's consent screen.
2. **OAuth2** page: copy the **Client ID**; **Reset Secret** → copy the **Client Secret**.
3. Same page, **Redirects** → add both:
   - `https://caravane-lunes-itinerantes.vercel.app/api/discord/retour`
   - `http://localhost:3917/api/discord/retour`

   (and the URL of any other deployment, e.g. a test Vercel project:
   `https://<its-domain>/api/discord/retour`). The redirect URI is derived from the domain the site is
   opened on, so it must be listed exactly.
4. In Discord: *User Settings → Advanced → Developer Mode* ON. Then right-click the caravan's server
   icon → **Copy Server ID** (= `DISCORD_GUILD_ID`); *Server Settings → Roles* → right-click each role
   that may enter → **Copy Role ID** (= `DISCORD_ROLE_IDS`, comma-separated), and the Patriarchs' role
   if wanted (= `DISCORD_ROLE_PATRIARCHE`).
5. On Vercel (choose the environments when asked):
   ```
   vercel env add DISCORD_CLIENT_ID
   vercel env add DISCORD_CLIENT_SECRET
   vercel env add DISCORD_GUILD_ID
   vercel env add DISCORD_ROLE_IDS          # e.g. 112233445566778899,998877665544332211
   vercel env add DISCORD_ROLE_PATRIARCHE   # optional
   vercel env add SCEAU_MOT_DE_PASSE_COMMUN # optional: 1 = keep the shared password during the transition
   ```
   then redeploy. `CARAVANE_SECRET` must be set (it already is for the password).
6. To go back to the password only, remove `DISCORD_CLIENT_ID` (any missing `DISCORD_*` variable turns
   Discord off).

Local testing without Discord: `DISCORD_API_URL` and `DISCORD_AUTHORIZE_URL` point the OAuth calls at a
mock server (development only; leave them unset in production).

## Editing the content

All content lives in `content/` — no code change needed.

### Prices — `content/marchandises.csv`

One line per article:

```
chapitre,fr,en,prod,min,max,artisan,note
armes,Épée en fer,Iron Sword,8.2,25,30,forgeron,
```

- `chapitre` — id of the chapter (see `chapitres.json`). **Moving an article = changing this cell.**
  An unknown id never loses the article: it lands in an automatic "Non classés" chapter.
- `fr` / `en` — both names are always shown (players run the game in either language).
- `prod` / `min` / `max` — cost, floor price, ceiling price in septims. Decimal point or quoted
  decimal comma (`"21,875"`) both work. Leave `min` and `max` empty → shown as *à négocier*.
- `artisan` — `alchimiste`, `forgeron`, `couturier` or `divers` (emoji/labels like `🔨 Forgeron` also work).
- `note` — optional short mention under the names.

### Chapters — `content/chapitres.json`

Order of the array = order of the pages and side tabs. Each chapter: `id`, `titre` (FR), `titreEn`,
`court` (tab label), `icone` (see Icons) and `intro` (in-character paragraph). Add, rename, reorder or split chapters here,
then update the `chapitre` column of the affected articles.

### Icons

Chapter, tab, ribbon and artisan icons come from [game-icons.net](https://game-icons.net) (CC BY 3.0,
credited on the title page), through `@iconify-json/game-icons`. A chapter or memo page picks its icon
with an `icone` field holding the game-icons name (e.g. `beer-stein`, `crossed-swords`): browse the
site, take the last part of the icon's URL. Only the icons in use are sent to the browser.

### Table texture

`public/textures/table.jpg` is Poly Haven's [wood_table](https://polyhaven.com/a/wood_table) (CC0), 2K,
recompressed. Swap the file to change the table; its tint is set in `app/globals.css` (`body`).
`public/textures/cuir.jpg` (the locked book on the login page) is Poly Haven's
[brown_leather](https://polyhaven.com/a/brown_leather) (CC0), 2K, recompressed.
`public/textures/fer.jpg` (the forged-iron key and lock) is Poly Haven's
[rusty_metal_04](https://polyhaven.com/a/rusty_metal_04) (CC0), desaturated and lit by an SVG filter
(`FiltreFer` in `components/Sceau.tsx`).

### Memo pages ("pense-bêtes") — `content/pense-betes/*.md`

They appear in the **Caravane** book (ribbon « Caravane »), one page and one side tab each.

Drop a Markdown file to add a page. Files are ordered by name (prefix with `03-`, `04-`…).

```markdown
---
titre: Les routes sûres
court: Routes
icone: treasure-map
resume: Short in-character summary shown on the left page.
auteur: Who wrote it
---

Markdown body (## headings, lists, **bold**, > quotes).
```

Memo pages are covered by the global search.

## Feeding the prices from a Google Sheet

1. Make a sheet (or a copy of the caravan's price sheet). Its first row holds the column names;
   unknown columns are ignored.
2. *File → Share → Publish to web →* the tab, format **CSV** → copy the URL.
3. `vercel env add CATALOGUE_CSV_URL` (paste the URL), then redeploy. The grimoire re-reads the sheet
   every 5 minutes; if the sheet is unreachable it falls back to `content/marchandises.csv`.

Without `CATALOGUE_CSV_URL`, `content/marchandises.csv` is used.

### Accepted column names

Names are compared without case, accents or punctuation; a name may also *start with* an alias
(`Prix idéal (septims)` → `max`). The list lives in `ALIAS_COLONNES` (`lib/livre.ts`).
The test sheet's headers `Chapitre,Article,Article (EN),Prix de prod,Prix mini,Prix idéal,Artisan,Note`
map one to one.

| Field | Accepted headers | If the column is missing |
|---|---|---|
| `fr` | fr, article, détail, désignation, nom, objet, produit | (required) |
| `prod` | prod, prix de prod, prix de production, coût, coût de prod | shown as — |
| `min` | min, mini, minimum, prix mini, prix min, plancher, prix plancher | *à négocier* if `max` is empty too |
| `max` | max, maxi, idéal, prix idéal, prix max, plafond, prix plafond | *à négocier* if `min` is empty too |
| `chapitre` | chapitre, catégorie, rubrique, section | every article lands in **Non classés** |
| `en` | en, anglais, english, nom anglais, article (EN) | no English name |
| `artisan` | artisan, métier, atelier | *divers* |
| `note` | note, notes, remarque, commentaire | none |

So the owner's sheet as it is (`Détail`, `Prix de prod`, `Prix mini`, `Prix idéal`) works: all
articles go to *Non classés* until a `chapitre` column is added (ids from `chapitres.json`).
Price cells may contain units or a decimal comma (`25 septims`, `21,875`).

## Copy of the register (PDF export)

The gilded quill next to the search field ("Faire une copie du registre") opens `/copie` in a new tab:
the whole book laid out as an A4 document (front cover, title page, contents, one page per price chapter, the
memo pages, back cover; the unwritten books are only named in the contents). It reads the same data as the
grimoire (`chargerLivre()`, so the CSV or the published sheet, `chapitres.json` and the memos), so
the copy is always current. Once fonts are loaded the page opens the browser's print dialog:
choose **Save as PDF** (enable "Background graphics" if the browser does not keep the parchment).
The default file name is the page title, *Registre de la Caravane des Lunes Itinérantes*.

- Page: `app/copie/page.tsx` → `components/Copie.tsx`; print styles at the end of `app/globals.css`
  (`@page` A4, every chapter on a new page, rows never split, ledger header repeated).
- The quill glyph is `ICONE_COPIE` in `lib/copie.ts` (a game-icons name, loaded with the others).
- `/copie` is behind the seal like every page.
- The covers reuse the login page's closed book (`components/Couverture.tsx`, shared with
  `components/Sceau.tsx`), scaled to the whole sheet.
- Print-only textures keep the PDF small (about 5 MB): `public/textures/cuir-impression.jpg` (the
  leather photo at 1280 px) and `public/textures/parchemin-impression.jpg` (the `--taches` parchment
  stains baked into a JPEG tile). Regenerate them if `cuir.jpg` or `--taches` change.

## Order mode (bon de commande)

- **Desktop**: a rolled scroll lies on the table under the search field (« Bon de commande »
  written on its unrolled end; red ribbon and wax seal on the roll; once lines exist the roll carries
  their count and total). Clicking it carries the scroll to the left page of the open book and unrolls
  it there into the order sheet. While the sheet is out, clicking a row of a price ledger writes the
  article on it (×1, or +1 if already there). Ribbons, tabs and search keep working. When a page turns
  (click, keys, or a corner dragged by hand), the sheet is lifted aside onto the table and laid back
  once the leaf has landed. « Rouler » rolls the sheet back up onto the table, the order kept.
- **Mobile**: the scroll lies rolled at the bottom of the screen. Tap it to start an order: ledger
  rows become tappable, the roll shows the article count and the total; tap it to unroll the sheet
  over the page, « Ranger » leaves order mode (the lines are kept).
- The sheet is rag paper (`public/textures/chiffon.jpg`, a generated 512 px tile: cloudy formation,
  laid and chain lines, fibres, foxing), greyer than the book's parchment, with deckled edges (SVG
  displacement filter on the paper layer only), a visible thickness and a cast shadow.
- One compact ledger row per article, under the column heads « Article · Qté · Prix · Somme »: name
  (floor–ceiling in small superscript; the English name in the tooltip), quantity (± or typed), unit
  price (defaults to the ceiling; empty for *à négocier* articles, which must be priced before
  sealing), line sum, a quill to strike the line out (struck lines are not sent). A price under the
  floor turns red with a one-line warning under the row (not blocking). Long orders scroll inside the
  sheet; the column heads and the footer stay in view.
- Footer: Total mini (Σ qty × floor), Total idéal (Σ qty × ceiling), **Total** (Σ lines) and a status
  stamp: *À perte* (< mini), *Marché honnête*, *Excellente affaire* (≥ idéal). An *à négocier* line
  counts its own price as mini and idéal, so it never tips the status.
- The order lives in the browser (`localStorage`) until it is sealed or thrown away (« Jeter la
  commande », confirmed by a second click). The seller's typed name (password sessions) is kept until
  it is edited: in `localStorage` and in the `caravane_vendeur` cookie (400 days, set by
  `POST /api/marchand`), so it survives a reload, closing/reopening the grimoire and wiped browser
  storage.
- « Sceller la commande » posts to `/api/commande` (behind the seal like every route). The server
  re-reads floor and ceiling from the catalogue, recomputes every total, gives the order a number
  (`C-YYMMDD-XXXXX`, JST day) and forwards it to the Apps Script with `COMMANDES_JETON`. The script
  URL and token never reach the browser. Without them, sealing answers an in-character error.
- Code: `components/Commande.tsx` (scroll, sheet, mobile roll, state), `lib/commande.ts` (maths shared
  with the route), `app/api/commande/route.ts`, `scripts/apps-script/commandes.gs`; styles in the
  *Order mode* section of `app/globals.css`.

### Rows written in the sheet

One row per article, in the tab **Commandes** (created when missing; if its first row is not this
header row, the header row is inserted above it, so nothing already there is overwritten):

| Horodatage | N° commande | Vendeur | Article | Quantité | Prix unitaire | Total ligne | Total mini | Total idéal | Prix réel vendu | Statut | Total commande |
|---|---|---|---|---|---|---|---|---|---|---|---|
| date | C-261021-3R5U2 | Ri'Saad | Épée en fer | 2 | 30 | 60 | 50 | 60 | 60 | excellente affaire | 135 |

*Total mini / Total idéal / Prix réel vendu / Statut* are per line (qty × floor, qty × ceiling, line
total, line status: `à perte`, `honnête`, `excellente affaire`, `négocié`); *Total commande* repeats
the order total on each of its rows. To match another layout, edit only the `COLONNES` array at the
top of `commandes.gs` (header + value per column); the payload also carries `articleEn`, `prixMini`,
`prixIdeal`, `sousPlancher` and the order-level `totalMini`, `totalIdeal`, `statut`.

### Setting up the orders sheet

1. Make a copy of the sheet that should receive the orders (or a new sheet).
2. In it: *Extensions → Apps Script*. Replace the editor's content with
   `scripts/apps-script/commandes.gs`, save.
3. *Project Settings (gear) → Script properties → Add property*: `JETON` = a long random value
   (`openssl rand -hex 24`). Keep it for step 7.
4. Optional: run the `essai` function once from the editor (it asks for the sheet permission and
   creates the **Commandes** tab with its headers).
5. *Deploy → New deployment →* type **Web app**; *Execute as*: **Me**; *Who has access*: **Anyone**.
   Authorize when asked.
6. Copy the **Web app URL** (ends with `/exec`).
7. On Vercel:
   ```
   vercel env add COMMANDES_SCRIPT_URL   # the /exec URL
   vercel env add COMMANDES_JETON        # the same value as the JETON property
   ```
   then redeploy.
8. After any change to the script: *Deploy → Manage deployments → edit → Version: New version*
   (the URL stays the same).

## The book's parts (v3)

Ribbons, in order: a bare **Sommaire** ribbon (its shape only, no word), **Marchandises** (price
chapters), **Atelier** (« Recettes », « Matières premières »), **Missives** (the list, one page per
missive, « Le coffre »; only missives in progress get a side tab, closed ones are opened from the list)
and **Caravane** (the roster still to be written, then the memo pages). When the sheet is linked (see
below), an **ex-libris** is the page before the title page: the book opens on it for a reader not yet
signed, and turning back from the title spread always reaches it; folios still start at the title page.

## Missives, the chest and the workshop (v3)

Everything lives in the same Google Sheet as the orders, read and written through the same Apps Script
(`scripts/apps-script/commandes.gs`, same `COMMANDES_SCRIPT_URL` / `COMMANDES_JETON`). Without them the
pages say the registre is not linked yet, there is no ex-libris, and the price ledger behaves exactly as
in v2. When the sheet cannot be read, the pages say so in character, with « renvoyer le coursier ».

- **Missives** (list page): missives in progress (overall progress in ink) and closed ones (livrée /
  inachevée), « Écrire une missive ».
- **One page per missive**. Left: title, client, deadline, author, the requested goods, the signature,
  the actions. Right: « Ce qu'il faut réunir » — finished goods, intermediates, raw resources; needed /
  in the Missive chest / missing, each row with its progress in ink and, for an item with a recipe,
  « à façonner : N » (units to make for what is missing, whole crafts; the tooltip gives the crafts).
  Touching a missing row opens the deposit slip filled with that item and the missing quantity; the
  small anvil on a row with a recipe opens the craft slip for it. Then the contributors (« a apporté
  X septims de valeur », « Y % du mérite », what each received once closed) and the ledger. A closed
  missive stays readable as it stood when it was closed.
- **Le coffre**: the stock according to the ledger, « Relever le coffre », and every count: *Compté*
  (found in the chest), *Attendu* (what the ledger expected), *Écart* (compté − attendu), with who and when.
- **Atelier → Sommaire des recettes**: the crafts present in the « Artisan » column (Alchimiste,
  Brasseur, Forgeron…, each with its count), then **one side tab per craft** (engraved icon, a line of
  introduction for the known ones, « Consigner une recette » with the craft filled in), recipes
  without a craft under « Sans métier ». A recipe opens on a slip (foldable tree down to raw materials,
  « Pour N », material cost). Crafts: `lib/metiers.ts` (name, icon, introduction; any other value gets
  its own tab with a generic icon).
- **Atelier → Matières premières**: a small buying ledger (the caravan harvests, loots, crafts or buys
  them, never sells): *Prix courant* (the usual buying price, also the value used for merit), *Bonne
  affaire* (buy without hesitation at or below it), the origin as a small note. « Inscrire une matière ».
- **Price ledger**: outside order mode, clicking a row opens the article's recipe; a small cauldron
  after the name marks articles with a recipe and opens it in order mode too (the row still writes the
  article on the order).

Slips unroll from their top edge and roll back up on « Ranger », like the order sheet.

Actions: « Relever le coffre », « Déposer au coffre », « Façonner », « Livrer la missive » (success: the
requested goods still owed leave the chest, the reward is entered and split, the missive is closed
*livrée*), « Abandonner la missive » (closed *inachevée*, reason and reward optional — a reward, if any,
is split the same way), and the recipe and material forms. Each opens a pinned slip; it goes when the
page turns or with « Ranger » / Esc.

**Speed.** A deposit, a craft, a count, a recipe or a material is written on the page at once (the slip
goes, the new ledger row shows in pale fresh ink) and confirmed when the registre answers; if it
refuses, the change is taken back and a slip of paper says why at the top of the table. Writing a
missive and closing one wait for the registre (a number and the split come back): a scribe's quill runs
along a line of ink (« Le scribe consigne… »), then a wax seal is stamped (« Consigné. »).

Each call to the Apps Script costs seconds of Google's own overhead, so calls are rare:
- every write is **one** call; its answer carries every tab, nothing is read again afterwards;
- reads are kept in Next's Data Cache, **shared by every server instance** (45 s, then refreshed in the
  background while the old copy is served), and are never wiped by a write;
- the script numbers the registre's states (`version`, +1 per write or hand edit); the page sends the
  newest version it has seen, and only a reader who has seen newer than the shared copy gets a fresh
  read — one's own writes never vanish, other readers may see them up to about 45 s later;
- inside the script, `lire` is served from CacheService (all tabs as JSON, 10 minutes), and a write
  updates that copy in memory instead of reading the sheet again.

The server logs each write's timings and sends them as `Server-Timing` (`lire`, `ecrire`, `script` =
the script's own execution time, `relire` = always 0, `onglets` = whether the answer carried the tabs);
`/api/identite` sends `lire`.

### Who holds the pen: the ex-libris (members' whitelist)

The first page of the book is an ex-libris: « Cet ouvrage du grimoire appartient à … ». A reader whose
name is not yet recognized opens the book on it and signs: the server matches the name against the
**Membres** tab (case, accents, apostrophes, spaces and œ/æ ignored: `jzahir` = `J'Zahir`), keeps the
sheet's spelling in a signed cookie (`caravane_nom`, 400 days), the name is written in ink and the book
turns to its title page. An unknown name blots and fades with an in-character refusal; nothing is
recorded. The list never reaches the browser (the page only learns how many members there are). The
same signature signs orders (*Vendeur*) and every missive action; « ce n'est pas mon nom » (ex-libris,
missive pages, order sheet) forgets it. Every write re-checks the name against the list. A Discord seal
whose server nickname is on the list arrives pre-signed. An unrecognized typed seller still works for
orders as in v2.

Permissions: `lib/droits.ts` has one rule per action (`ROLES_REQUIS`), all open for now. To restrict an
action, list the roles allowed (e.g. `recette: ['maitreartisan', 'patriarche']`); roles come from an
optional **Rôle** column of the Membres tab and from the Discord Patriarch role (the server always
checks; for the page to hide a restricted action, `/api/marchand` must then look the roles up too).

### The rules

- **Needs**: what is still owed, against the Missive chest. Each item takes what the chest holds; the
  rest is made in whole crafts (rounded up to the recipe's yield) and exploded down to raw resources —
  an intermediate's stock is used before exploding it. Missives running at the same time share the
  chest, the oldest served first. A recipe loop is shown in character and refused when a recipe is written.
- **Stock**: the ledger replayed in time order; a *relevé* sets the counted quantity, other movements
  add their signed quantity. Each relevé records the expected quantity and the gap in its note.
- **Value of an item** (weighs contributions): catalogue *prix de prod*, else its recipe's ingredients ÷
  yield, else the material's *Prix courant*, else 0. Computed at read time.
- **Contribution**: a deposit earns quantity × value; a craft earns outputs − inputs (never below 0);
  counts and deliveries earn nothing. Share of the merit = member's value ÷ the missive's total.
- **Closing**: the reward is split in whole septims: the *part commune* (default 20 %, set at closing
  and recorded) goes equally to **every** member of the Membres list; the rest goes to contributors pro
  rata (largest remainders, the sum is exact). If nobody contributed, everything goes in equal parts.

### Sheet tabs and columns

Headers are found by name (case, accents and punctuation ignored), in any order; older names are still
read (below); a missing column is added at the end of row 1 on the first write. The mapping of every tab
is `ONGLETS` at the top of `commandes.gs`.

| Tab | One row = | Columns |
|---|---|---|
| **Membres** (read only, imported by hand) | one member | `Nom`, optional `Rôle` |
| **Ressources** | one raw material | `Ressource`, `Nom EN`, `Origine` (récolte, loot, achat, craft… — older header `Catégorie`), `Prix courant` (septims per unit — older header `Valeur`), `Bonne affaire`, `Note` |
| **Recettes** | one ingredient of one product | `Produit`, `Produit EN` (optional, for products not in the catalogue; added on the first write), `Ingrédient`, `Quantité` (per craft), `Rendement` (units per craft, default 1), `Artisan` (the craft, free text), `Note` |
| **Missives** (created by the script) | one requested line | `N° missive`, `Écrite le`, `Titre`, `Commanditaire`, `Échéance`, `Statut` (`en cours` / `livrée` / `inachevée`), `Produit`, `Quantité`, `Écrite par`, `Récompense`, `Part commune (%)`, `Close le`, `Close par`, `Note de clôture` |
| **Mouvements** (created by the script, append-only) | one movement | `Horodatage`, `N° action`, `N° missive`, `Membre`, `Type`, `Objet`, `Quantité`, `Note` |

Movement types: `relevé` (Quantité = the counted quantity; Note = `attendu X, écart ±Y`), `dépôt` (+),
`fabrication` (− each input, + each output, one `N° action` per craft), `livraison` (−, written when a
missive is delivered), `partage` (Objet `Septims`, Quantité = the member's amount, Note =
`part commune X + mérite Y`). Numbers: missives `M-YYMMDD-XXXX`, actions `A-YYMMDD-XXXX` (JST day).

### The script's JSON contract

Every call is `POST { jeton, action, ... }` → `{ ok: true, ..., ms }` or `{ ok: false, erreur, ms }` (`ms`:
the script's own execution time). Every write answers with `onglets` and `version` too (as `lire`);
sealed orders keep their v2 answer. `lire` answers `{ onglets, version, cache }` (`cache: true` when
served from the script's cache). The version is the script property `VERSION`; a hand edit of the
sheet (`onEdit`) moves it on and drops the cache; after importing a CSV (which may not count as an
edit) run `viderCache` from the editor, or wait 10 minutes. Closing an already closed missive is
refused by the script itself (`already closed`), under the lock.

| `action` | Body | Effect |
|---|---|---|
| *(none)* or `commande` | `{ commande }` | Sealed order, unchanged since v2 (Commandes tab) |
| `lire` | — | `{ ok, onglets: { membres, ressources, recettes, missives, mouvements } }`, each an array of objects keyed by the field names of `ONGLETS` |
| `missive` | `{ missive: { numero, horodatage, titre, commanditaire, echeance, membre, lignes: [{ produit, quantite }] } }` | One Missives row per line, Statut `en cours` |
| `releve`, `depot`, `fabrication` (`livraison` kept) | `{ mouvements: [{ horodatage, action, missive, membre, objet, quantite, note }] }` | Mouvements rows, Type set from the action |
| `cloture` | `{ cloture: { numero, action, horodatage, membre, statut, recompense, partCommune, note, livraisons: [{ objet, quantite, note }], partage: [{ membre, montant, note }] } }` | The missive's rows closed (Statut `livrée`/`inachevée`, Récompense, Part commune, Close le/par, Note de clôture); its `livraison` rows; one `partage` row per member |
| `recette` | `{ recette: { produit, ancienProduit?, rendement, artisan, note, ingredients: [{ ingredient, quantite }] } }` | The product's rows replaced (no ingredient = recipe removed) |
| `ressource` | `{ ressource: { nom, ancienNom?, en, origine, prix, bonneAffaire, note } }` | The row updated, or added |

Writes take `LockService`'s script lock and touch each tab in one `getValues`/`setValues`. The
grimoire's server (`/api/registre`) validates everything, signs with the member's name, recomputes the
split, then calls the script; reads are cached 45 s (`lib/registre.ts`), and a write's answer refreshes
that server's copy.

### Setting it up (on top of *Setting up the orders sheet*)

1. In the sheet, create the **Membres**, **Ressources** and **Recettes** tabs and import their CSVs
   (*File → Import → Upload → Insert new sheet(s)* or paste into the tab), header row first:
   `Nom` · `Ressource,Nom EN,Origine,Prix courant,Bonne affaire,Note` (a tab already imported with
   `Catégorie`/`Valeur` keeps working) · `Produit,Ingrédient,Quantité,Rendement,Artisan,Note`.
   The **Missives** and **Mouvements** tabs may stay empty (or absent): the script writes their headers.
2. *Extensions → Apps Script*: replace the whole editor content with the new `scripts/apps-script/commandes.gs`, save.
3. *Deploy → Manage deployments →* the existing web app → ✏️ edit → *Version: **New version*** → Deploy.
   The `/exec` URL stays the same, so nothing changes on Vercel. (A *New deployment* would make a new URL.)
4. Optional: run `essai` once from the editor (creates the missing tabs' headers and logs the row counts).
5. The first time, Apps Script asks again for permissions (the script now uses its cache, CacheService):
   accept them.

### Testing locally

A mock of the web app that runs the real `commandes.gs` against an in-memory sheet (fake
`SpreadsheetApp`, `LockService`, `ContentService`, `PropertiesService`) lives outside the repo
(`/Volumes/PERSO/dev/_atelier/caravane/v3/mock-script.js`, `MOCK_DELAI` = ms per call). Run it, then start
the grimoire with `COMMANDES_SCRIPT_URL=http://localhost:3931/exec COMMANDES_JETON=jeton-essai`.

Code: `lib/missives.ts` (types, needs, stock, contributions, split, material cost), `lib/registre.ts`
(script client and cache), `lib/identite.ts` (whitelist and cookie), `lib/droits.ts` (permission hook),
`app/api/registre`, `app/api/identite`, `components/Registre.tsx` (page state, writes shown at once),
`components/ExLibris.tsx`, `components/Missives.tsx` (pages), `components/Fiche.tsx` (slip, recipe tree,
forms, the scribe); styles in the *Missives* sections of `app/globals.css`.

## Deploy

Pushing to `main` deploys to production through Vercel's Git integration.
