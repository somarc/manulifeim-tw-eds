# Discovery blocks and the article template

Owner: discovery. Shared helpers live in `scripts/discovery.js` (blocks may not import each other):
index/sheet fetching, `/data/authors` lookup, date formatting, config-row parsing, teaser author
lines and the placeholder labels (with English fallbacks).

## Data

| Source | Read by | Columns |
|---|---|---|
| `fetchIndex()` → `/data/content-index.json` (lead) | article-cards, viewpoint-list, press-list, search | `path, title, description, image, date, category, tags, authors, template, type, lastModified` |
| `/data/authors.json` | template sidebar, article-cards, viewpoint-list, browse-by, search | `id, name, position, company, photo, bio, link, logo, posted, articles` |
| `/data/case-studies.json` | case-study-list | `title, tags, image, alt, link, order` |
| `/placeholders.json` (lead) | all | `Key, Text` — keys listed below |

Any listing can be pointed at another sheet with a config row `Source Index | /path.json`
(a testing hook; canonical pages use the site index, `/data/content-index`).

Values written into page Metadata (and so into the index): **Category** and **Tags** are the
source's display titles (`Private Credit`, `Opportunistic credit`); filters and URLs use their
`toClassName()` ids (`private-credit`, `opportunistic-credit`), which equal the source's tag ids.
**Authors** are `/data/authors` ids. **Type** is `article` (viewpoints) or `press`.

## Template: article (`Template: article`)

Authored document: section 1 = `H1` + summary paragraph; body sections = default content and
blocks (`Promo Banner`, `Disclosure (collapsible)`, figures as picture + caption paragraph);
footer sections = `Article Cards (related)` and/or the `/viewpoints/fragments/all-tags` fragment
link. The template (runs before section decoration) classifies those sections, puts the
metadata date above the H1, and for `Type: article` adds a generated `<aside>`: author cards
(photo, name, position, company, Read bio), asset-manager logo card, share links (LinkedIn,
Facebook, X, email, copy link, print/download), category and tag links into
`/viewpoints/all?category=…|tags=…`. `Type: press` keeps the full-width press layout (32px title, date band, side column as its own
section). `Type: legal` gives the legal layout: a title followed by text in one section is 32/40 bold
(`<u>` where the source underlines it, Important information); section style `narrow-center` =
the source's 600px column, `narrow` = its centred 8-of-12 column (75%, full width ≤800px), none =
full width; a title alone in its section (Accessibility) is the display-size title band. Section style `fine-print` renders the source's 13.28px small print (DA drops
`<small>`).
≥1100px: content column + 416px sidebar; below: the sidebar follows the body.

Canvas: no authored node is moved or rewritten; the date and aside are generated, the aside is
`inert` in Canvas.

## Blocks

Responsive notes from QA wave 2: `Viewpoint List` folds its selects behind a green **Filter**
button below 1100px; `Press List` swaps its tabs for a labelled native `<select>` on phones;
`Search` relies on the header search box (its own input shows only in Canvas).

| Block | Table | Notes |
|---|---|---|
| `Article Cards` (`list`, `grid`, `trending`, `related`, `news`, `feature`, `toggle`, `no-photos`) | config rows `Source`, `Limit`, `Tags`, `Category`, `Type`, `Authors`, `Source Index`; or curated rows `[<a href=/viewpoints/…>]`; or teaser rows `[picture][h2/h3 title link, p text]` | Curated links resolve through the index (title-only fallback for unmigrated pages: author a teaser row instead). Teaser rows are decorated in place; an `Authors` row adds people to them. Config/link rows are hidden on the page and shown as a dashed panel in Canvas. `toggle` adds the grid/list switch (default list). |
| `Viewpoint List` | `[h1]`, `Source`, `Type`, `Page Size`, `Source Index` | Native selects (authors, asset managers, categories, tags) built from the index; URL `?authors=&am=&category=&tags=`; "N listings", 3-up cards, View more. |
| `Press List` | `Contact` (rich cell → sidebar), `Tabs` (labels = category values), `Page Size`, `Source Index`, then `[YYYY-MM-DD][title link][category]` rows | Index rows (`Type: press`) merged with authored rows (releases not migrated, linking to the source); tabs + pager in the URL (`?tab=archive&page=2`). |
| `Case Study List` | `Source`, `Page Size` | Sort (Newest/Oldest/A–Z/Z–A, native select), tag pills toggle filters, View more. |
| `Browse By` | `[Authors][link to /data/authors.json]`, `[Categories][ul]`, `[Tags][ul]` | Tabs from the row labels; author directory generated from the sheet with a sort select; 9 items + View more. |
| `Tag Cloud` (`inline`) | `[h2]`, `[ul of links]` | `<details open>` "All Tags" in 4/3/2 columns; `inline` = "More insight" link bar. Plain container in Canvas. |
| `Table` (`header`, `row-header`) | one block row per table row, ≤4 cells | Source `table2` cards in viewpoints (DA turns a raw `<table>` into a block named after its first cell, so tables are authored as this block). Rows stay authored divs with ARIA `table/row/cell` roles and a CSS grid (Canvas edits in place); white shadowed card, 48px inset, grey row rules; scrolls sideways inside the card on phones. |
| `Search` | `[h1]` (visually hidden), optional `Source Index` | `?q=` (and legacy `#q=`); scores title > tags/category > authors > description; facets type/category/tags/author (checkboxes with counts); sort; 10/25/50 per page; pager. |

## Placeholder keys (`/placeholders`, Key → default Text)

`readMore` Read more · `readBio` Read bio · `share` Share · `shareLinkedin` LinkedIn ·
`shareFacebook` Facebook · `shareX` X · `shareEmail` Email · `copyLink` Copy link ·
`linkCopied` Link copied · `download` Download · `category` Category · `tags` Tags ·
`gridView` Grid view · `listView` List view · `authors` Authors · `assetManagers` Asset managers ·
`categories` Categories · `clearAll` Clear all · `listings` listings ·
`noResults` There are no viewpoints that match your filters · `previous` Previous · `next` Next ·
`page` Page · `results` results match your search · `sortBy` Sort by: · `newest` Newest ·
`oldest` Oldest · `alphaAsc` A-Z · `alphaDesc` Z-A · `relevance` Relevance ·
`searchPlaceholder` Search · `searchLabel` Search the site · `searchButton` Search ·
`searchResultsFor` for · `searchSummary` Results {start}-{end} of {total} ·
`perPage` Results per page ·
`searchEmpty` No results match your search. Try different keywords or remove filters. ·
`type` Page type · `filter` Filter · `allItems` All · `browseBy` Browse by ·
`browseAuthors` Browse articles by author · `browseCategories` Browse articles by category ·
`browseTags` Browse articles by tag · `alphabetical` Alphabetical ·
`recentlyPosted` Recently posted · `mostArticles` Most articles · `viewMore` View more ·
`viewLess` View less · `mediaRelations` Media relations · `typeArticle` Viewpoints ·
`typePress` Press releases · `typePage` General

## Importer

`python3 tools/importer/articles.py` writes all discovery documents and sheets into the DA
workspace (`--only <path>` for one; the `--draft-*` options are testing hooks, and the
`/drafts/discovery` copies were removed after the real index went live). API pulls made in the
browser live in `.captures/manulifeim-tw/pages/data/` (`case-studies.json`,
`viewpoints-filters.json`, `press-releases-all.json`). Paths collapse repeated hyphens (EDS
serves `credit--relative` as `credit-relative`); SVGs over 40 KB use their svgo `-min.svg` twins
(the content bus rejects larger SVGs).

Wave 2 (`ARTICLES_WAVE2`, `LEGAL_WAVE2`) reads `pages/wave2/` captures (server HTML fetched
in-page). Extra source components: `landingImage` (as `landingImage2`), `innerNavigationBar` →
`Anchor Nav` in its own section, `sectionBreak` → Section Metadata `Anchor` (ids slugged, e.g.
`oil-` → `oil`), `divider` → `divider` style, `infoContainer` → `Cards (info, cols-2)` (landing's
converter), `table2` → `Table`, `landingCta` → `Columns [picture][copy, link]`,
`viewpointDisclaimer` → `Disclosure (collapsible)`; single-column `column-container`s are walked;
Marketo forms (client-rendered, no fields in the HTML) and empty `strategyTag`s are dropped.
Charts whose outlined-text SVG stays over 40 KB after svgo are uploaded as 2× PNG rasters and
mapped directly in the media manifest (`media/wave2-media.json` lists them). Links ending in
`-` lose it (source `why-invest-in-farmland-` → `/viewpoints/private-markets/why-invest-in-farmland`).

```sh
da --qmd --format json content fix-sections <file>
da --qmd --format json content put /<path>.html <file> --rewrite-media-urls        # dry-run
da --commit --qmd --format json content put /<path>.html <file> --rewrite-media-urls
da --commit --qmd --format json preview page /<path> --yes
# sheets: content put /<path>.json <file> --json-profile sheet-v1, then preview /<path>.json
```
