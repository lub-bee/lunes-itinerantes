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
`court` (tab label) and `intro` (in-character paragraph). Add, rename, reorder or split chapters here,
then update the `chapitre` column of the affected articles.

### Memo pages ("pense-bêtes") — `content/pense-betes/*.md`

Drop a Markdown file to add a page. Files are ordered by name (prefix with `03-`, `04-`…).

```markdown
---
titre: Les routes sûres
court: Routes
resume: Short in-character summary shown on the left page.
auteur: Who wrote it
---

Markdown body (## headings, lists, **bold**, > quotes).
```

Memo pages are covered by the global search.

## Feeding the prices from a Google Sheet

1. Make a sheet with the same header row as `marchandises.csv` (extra columns are ignored).
2. *File → Share → Publish to web →* the tab, format **CSV** → copy the URL.
3. Set `CATALOGUE_CSV_URL` in Vercel and redeploy. The grimoire re-reads the sheet every 5 minutes;
   if the sheet is unreachable it falls back to `content/marchandises.csv`.

## Deploy

Pushing to `main` deploys to production through Vercel's Git integration.
