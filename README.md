# Grimoire de la Caravane des Lunes Itinérantes

Private price book of the *Caravane des Lunes Itinérantes* (Skyrim role-play Khajiit caravan).
A leather-bound grimoire whose pages turn: price chapters, memo pages, and (soon) the caravan's
missives and member roster. Everything visible to members is written in-character (French).

Stack: Next.js 15 (App Router) · React 19 · plain CSS · no database. Hosted on Vercel.

## Access

The whole site sits behind a shared password ("the seal"), checked by `middleware.ts`.

| Env var | Purpose |
|---|---|
| `CARAVANE_MOT_DE_PASSE` | The caravan's shared password. Changing it logs everyone out. |
| `CARAVANE_SECRET` | Random secret signing the session cookie (`openssl rand -hex 32`). |
| `CATALOGUE_CSV_URL` | Optional — published CSV of the price sheet (see below). |
| `COMMANDES_SCRIPT_URL` | Optional — URL of the Apps Script web app receiving sealed orders (see *Order mode*). |
| `COMMANDES_JETON` | Optional — shared secret checked by that Apps Script (script property `JETON`). |

Session lasts 30 days. Local dev: copy `.env.example` to `.env.local`, fill it, `npm run dev`.

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

| Field | Accepted headers | If the column is missing |
|---|---|---|
| `fr` | fr, article, détail, désignation, nom, objet, produit | (required) |
| `prod` | prod, prix de prod, prix de production, coût, coût de prod | shown as — |
| `min` | min, mini, minimum, prix mini, prix min, plancher, prix plancher | *à négocier* if `max` is empty too |
| `max` | max, maxi, idéal, prix idéal, prix max, plafond, prix plafond | *à négocier* if `min` is empty too |
| `chapitre` | chapitre, catégorie, rubrique, section | every article lands in **Non classés** |
| `en` | en, anglais, english, nom anglais | no English name |
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

- **Desktop**: a strip of paper lies on the table under the search field (« Préparer une commande »).
  Clicking it carries the order sheet onto the left page of the open book. While the sheet is out,
  clicking a row of a price ledger writes the article on it (×1, or +1 if already there). Page turns,
  ribbons, tabs and search keep working; « Replier » folds the sheet back into the strip, the order kept.
- **Mobile**: the strip is folded at the bottom of the screen. Tap it to start an order: ledger rows
  become tappable, the strip shows the article count and the total; tap it to unroll the sheet over
  the page, « Ranger » leaves order mode (the lines are kept).
- Each line: quantity (± or typed), unit price (defaults to the ceiling; empty for *à négocier*
  articles, which must be priced before sealing), line total, a quill to strike the line out
  (struck lines are not sent). A price under the floor gets a red warning (not blocking).
- Footer: Total mini (Σ qty × floor), Total idéal (Σ qty × ceiling), **Total** (Σ lines) and a status
  stamp: *À perte* (< mini), *Marché honnête*, *Excellente affaire* (≥ idéal). An *à négocier* line
  counts its own price as mini and idéal, so it never tips the status.
- The order and the seller's name live in the browser (`localStorage`) until the order is sealed or
  thrown away (« Jeter la commande », confirmed by a second click).
- « Sceller la commande » posts to `/api/commande` (behind the seal like every route). The server
  re-reads floor and ceiling from the catalogue, recomputes every total, gives the order a number
  (`C-YYMMDD-XXXXX`, JST day) and forwards it to the Apps Script with `COMMANDES_JETON`. The script
  URL and token never reach the browser. Without them, sealing answers an in-character error.
- Code: `components/Commande.tsx` (strip, sheet, mobile strip, state), `lib/commande.ts` (maths shared
  with the route), `app/api/commande/route.ts`, `scripts/apps-script/commandes.gs`; styles in the
  *Order mode* section of `app/globals.css`.

### Rows written in the sheet

One row per article, in the tab **Commandes** (created with its header row when missing):

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
