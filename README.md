# Grimoire de la Caravane des Lunes Itinérantes

Private price book of the *Caravane des Lunes Itinérantes* (Skyrim role-play Khajiit caravan).
A leather-bound grimoire whose pages turn: price chapters, memo pages, and (soon) the caravan's
missives and member roster. Everything visible to members is written in-character (French).

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
| `COMMANDES_SCRIPT_URL` | Optional — URL of the Apps Script web app receiving sealed orders (see *Order mode*). |
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
never from the page). Password sessions are « Un marchand de la caravane » and type the seller's name.

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

- **Desktop**: a rolled scroll lies on the table under the search field (« Préparer une commande »
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

## Deploy

Pushing to `main` deploys to production through Vercel's Git integration.
