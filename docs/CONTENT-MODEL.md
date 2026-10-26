# Content model and team contract

Source: https://www.manulifeim.com/institutional/tw/en (captured 2026-10-26 through a real browser;
Akamai blocks non-browser clients). Target: DA `somarc/manulifeim-tw-eds`, delivered on
`*--manulifeim-tw-eds--somarc.aem.page` only. **Nothing is ever published to aem.live.**

Evidence lives outside Git at `/Users/mhess/aem/eds-labs/.captures/manulifeim-tw/`
(`home/notes.md`, `home/design-tokens.json`, `pages/ARCHETYPES.md`, per-page `*.main.html` / `*.json`).

## Ownership (one owner per file; ask the owner instead of editing)

| Owner | Files | DA documents |
|---|---|---|
| lead | `styles/styles.css`, `styles/fonts.css`, `scripts/scripts.js`, `head.html`, `blocks/blueprint`, `tools/importer/{common,build-index,build-library,build-placeholders,story}.py`, `tools/receipts-summary.py`, `docs/CONTENT-MODEL.md`, `docs/DECISIONS.md` | `/data/content-index`, `/placeholders`, `/library/**`, `/how-we-built-this`, DA config sheets |
| chrome | `blocks/header`, `blocks/footer`, `scripts/disclaimer.js`, `404.html`, `tools/importer/chrome.py` | `/nav`, `/footer`, `/fragments/disclaimer` |
| home | `blocks/carousel`, `blocks/disclosure`, `blocks/social`, `tools/importer/home.py` | `/index` |
| landing | `blocks/hero`, `blocks/cards`, `blocks/anchor-nav`, `blocks/feature-band`, `blocks/promo-banner`, `blocks/timeline`, `blocks/image-toggle`, `blocks/quote`, `blocks/video`, `blocks/form`, `blocks/columns`, `tools/importer/landing.py` | `/capabilities/*`, `/sustainability`, `/stewardship-report`, `/about-us`, `/contact-us`, `/capabilities` |
| discovery | `templates/article`, `scripts/discovery.js`, `blocks/article-cards`, `blocks/viewpoint-list`, `blocks/press-list`, `blocks/case-study-list`, `blocks/browse-by`, `blocks/tag-cloud`, `blocks/search`, `tools/importer/articles.py` | `/viewpoints/**`, `/about-us/press-releases/**`, `/search`, `/sustainable-investing-case-studies`, `/important-information`, `/accessibility`, `/data/authors`, `/data/case-studies` |

Need a global style, script hook or shared block change? Report it to the lead in your final message.

## Global conventions (implemented in styles.css / scripts.js)

- Headings: light (300) Manulife JH Sans; an `<em>` inside a heading renders in Manulife JH Serif
  italic ("realize the *possibilities*"). Importers keep the source's italic word as `<em>`.
- A link alone in its paragraph: plain → circled-arrow CTA (`a.link-cta`, 14/700);
  **bold** → primary green button; _italic_ → secondary outline button.
- Section Metadata `Anchor` gives the section an id (anchor-nav targets).
- Section Metadata `Style` values available globally: `divider` (rule ~96px below), `intro` (centred 75% measure),
  `display` (48/60 section headings), `title-row` (first heading left, the next element
  (a CTA link) right, the rest below), `narrow`, `narrow-center`, `navy`, `green`, `purple`,
  `white`, `overlap` (pull the section up 96px over the previous band), `spacious`.
- Tokens: see `:root` in `styles/styles.css` (`--color-*`, `--card-shadow`, `--font-size-*`,
  `--section-padding-*`, breakpoints 1100 / 800 / 600 px max-width, rail 80px).
- Labels that are not authored content (e.g. "Grid view", "Read more", search UI strings) come
  from the `/placeholders` sheet via `fetchPlaceholders()` in `scripts/scripts.js`.
- `isAuthoring()` (scripts.js) is true in DA Canvas (quick-edit). Interaction-only behaviour
  (autoplay, modals, navigation) must stand down there; authored nodes must stay editable.
- Page templates: Metadata `Template: article` loads `templates/article/article.{css,js}` before
  decoration (`export default async function decorate(main, doc)`).

## Data sources (no publish → no native query index)

The native Configuration Service index only reflects **published** content (da-cli
`index list` caveat), and this site is preview-only. Listings and search therefore read the DA
sheet `/data/content-index.json` (previewed to aem.page), via `fetchIndex()` which the lead will
point at that sheet. Columns (same names the native index will use when the site goes live):

`path, title, description, image, date (YYYY-MM-DD), category, tags (comma list), authors
(comma list of author ids), template, type, lastModified`

`tools/importer/build-index.py` regenerates the sheet from the page Metadata in the DA workspace.
So **every importer must write complete page Metadata**: Title, Description, Image (og), and for
articles/press: Date, Category, Tags, Authors, Template, Type.

Other sheets: `/data/authors` (id, name, position, company, photo, bio, link),
`/data/case-studies` (title, tags, image, link), `/placeholders` (Key, Text).

## Shared block shapes (cells per row ≤ 4; headings/paragraphs stay semantic)

| Block | Rows |
|---|---|
| `Cards (info)` | one row per tile: `[h3 title, p text, p link]` (no image cell); stat tiles use `[h4 with <strong>figure</strong> caption]`. Variants: `info`, `image` (`[picture][h3, p, link]`), `news` (`[p date, h3 title, p link]`), `stats`, `logos` (`[picture]`), `links` (one `ul`), `cols-2`, `cols-4`; `.pdf` links get a download icon |
| `Article Cards (list, toggle)` | config rows `[Source][/viewpoints/]`, `[Limit][3]`, optional `[Tags][…]`, `[Category][…]`, or curated rows `[<a href=/viewpoints/…>]`. Variants: `list`, `grid`, `trending`, `related`, `news`, `feature`, `toggle` |
| `Disclosure` | `[p label][rich body]`; variants `collapsible` (`<details>`) and `small` (fine print; DA drops `<small>`) |
| `Carousel (hero)` | one row per slide: `[picture][h1 or h2, p, p link]` |
| `Hero (overlay)` | `[picture]` then `[h1, p, link]` (landing child defines variants) |

Each owner documents its blocks in `docs/blocks/<owner>.md` (purpose, table shape, variants,
Canvas notes).

## Media

Akamai blocks the EDS media ingester too, so images are uploaded into DA under `/media/`.
`common.image(src, alt)` maps source URLs through
`/Users/mhess/aem/eds-labs/.captures/manulifeim-tw/media/media-manifest.json` to `/media/<file>`.
Upload documents with `content put --rewrite-media-urls` so DA stores
`https://content.da.live/somarc/manulifeim-tw-eds/media/<file>`.

## DA workflow (always journaled)

```sh
cd /Users/mhess/aem/eds-labs/manulifeim-tw-eds
python3 tools/importer/<owner>.py                       # writes into the DA workspace content root
da --qmd --format json content fix-sections <file>       # authoring-shape preflight
da --qmd --format json content put /<path>.html <file> --rewrite-media-urls      # dry-run, review
da --commit --qmd --format json content put /<path>.html <file> --rewrite-media-urls
da --commit --qmd --format json preview page /<path> --yes
# view with local code: http://localhost:3001/<path>  (dev proxy → aem runtime :3000)
```

Never run `publish`, `deploy`, `index build` or any `--commit` on site/config commands.
Compare with the source page in the Studio browser at 1440, 1024, 768 and 390 px.
