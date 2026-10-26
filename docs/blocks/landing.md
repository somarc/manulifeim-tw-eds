# Landing blocks (owner: landing)

Archetypes A (capability / marketing landing), B (capabilities hub) and J (contact form) of
`https://www.manulifeim.com/institutional/tw/en`. Importer: `tools/importer/landing.py`
(one converter per source component class; run `python3 tools/importer/landing.py [slug|path]`).

Pages: `/capabilities/fixed-income`, `/capabilities/equity`, `/capabilities/private-markets`,
`/capabilities/multi-asset-solutions`, `/capabilities`, `/sustainability`, `/stewardship-report`,
`/about-us`, `/contact-us` (all previewed on aem.page only; never published).

Every block keeps the authored cells, headings, paragraphs and pictures in place: decoration only
adds role classes to cell owners or generated wrappers. In Canvas (`isAuthoring()`) interaction
(modals, scroll-spy, sticky bar, carousel buttons, keyboard toggles, form guard) stands down.
Verified: with Canvas markers seeded on all nine pages, every `data-prose-index`,
`data-image-index` and `data-block-index` survives decoration exactly once.

## Page recipe (archetype A)

| Source component | Authoring |
|---|---|
| extendedHeroBanner2 | `Hero (short[, large][, overlay])` in its own section |
| innerNavigationBar | `Anchor Nav` in its own section |
| sectionBreak `id` | Section Metadata `Anchor: <id>` on the section that follows |
| marketingSection | `Feature Band (navy\|green\|purple[, overlay][, short])` in its own section |
| `.overlapping-component` after an `--overlay` band | next section gets Section Metadata `Style: overlap` |
| infoContainer | `Cards (info\|stats[, cols-2\|cols-4])` |
| simpleBanner | `Promo Banner (colours…[, double])` (consecutive banners merge) |
| timeline / imageToggle | `Timeline` / `Image Toggle` |
| landingImage2 | `Columns (figure)` + caption paragraph |
| featureKicker / featureBanner | `Columns (feature-card)` / `Columns (map)` |
| strategyDetailTable | `Cards (links)` |
| disclosures | `Disclosure (collapsible)` (home owner's block) |
| articleGroup / trending-topics2 | `Article Cards (related)` / `Article Cards (trending)` (discovery's block), curated rows |
| latest-news | `Cards (news)` |
| about-us partner logos (image components) | `Cards (logos)`, row-major as seen |
| marketoForm | `Form` (demo) |
| richTitle | default H2 + link, section `Style: title-row, display` |
| divider | new section with `Style: divider` (style requested from the lead) |

## Hero

| Row | Cells |
|---|---|
| 1 | `[desktop picture]` `[optional mobile picture]` |
| 2 | `[h1 (serif <em> allowed), p, **link** (primary button)]` |

Page header (`Hero (page-header[, dark])`): one cell `[icon picture, h1, p]`; a picture-only row
above it becomes the dark header's background. Variants: `short` (600px), `large` (64/80 title),
`overlay` (the next section's first block sits 128px over the photo), `page-header`, `dark`.
≤800px: 188px photo strip above the copy on white (source behaviour).

## Cards

One white container with `--card-shadow`; tiles split by 1px `#EDEDED` rules (outset shadows clipped
by the container, so the last row/column never shows a rule). 3 columns (`cols-2`, `cols-4`),
2 at ≤1100px, 1 at ≤800px.

| Variant | Row |
|---|---|
| `info` (default) | `[h3 title, p…, p link]`; optional leading `[picture]` cell = tile illustration (max 125px); source 24px subtitles are `h4` |
| `stats` | `[h4 figure, p caption]`, centred |
| `image` | `[picture] [h3, p, p link]` — 24px inset 1200:621 image, 24/30 title, 14/21 text, `#E0E0E0` rules, link pinned to the bottom (homepage sustainability tiles) |
| `news` | `[p date, h3 title, p link]`, 2-up, 24px padding |
| `logos` | `[picture]` per row, 4-up without card chrome |
| `links` | one cell `[ul of links]`, two columns flowing top-to-bottom (source table order); one column ≤600px |

Stat figure: `<p><strong>100%</strong><br>caption</p>` renders as a 24px figure over a 12px bold
caption (the `<br>` is the marker, so a bold name `<p><strong>Bryan Chen</strong></p>` stays plain).
Links to `.pdf` get the download icon.

## Anchor Nav

Row `[ul of links to #anchors]`. Targets are sections with Section Metadata `Anchor`; the section
gets that id (a pipeline heading id with the same slug yields). Empty cell → list built from the
anchored sections. Sticky 80px bar with shadow when stuck, scroll-spy (`aria-current`), ≤800px a
dropdown button. Static (not sticky) in Canvas.

## Feature Band

Row `[icon picture, h2, p, link] [picture]`. Edge-to-edge (bleeds over the section padding).
Copy 2/3 with 128px/64px margins, photo right 1/3 (both shrink like the source: 807/410px at 1440).
Variants: `navy` (default), `green`, `purple`, `blue`, `white`, `overlay` (extra 64px bottom room
for the overlapping section), `short` (460px). ≤1100px: 256px photo strip above the copy.

## Promo Banner

One banner per row: `[h2, p, link] [picture | 4 pictures]`. Colour variants apply in row order and
the last repeats (`Promo Banner (double, green, blue)`). `double` = 2-up (1-up ≤1100px), `mosaic`
= 2×2 pictures. A `players.brightcove.net` link becomes a video modal (nested Video block, published
page only).

## Timeline

Rows `[p year] [picture] [p caption]`. Horizontal 360px milestones alternating above/below a rule,
48px green prev/next buttons (disabled at the ends); vertical list ≤800px. No buttons in Canvas
(the track scrolls).

## Image Toggle

Rows `[icon picture, p label] [picture]`. Label cells are toggle buttons (`role=button`,
`aria-pressed`, `aria-controls`, Enter/Space/arrow keys) — a native `<button>` cannot hold the
authored paragraph. In Canvas only a click switches the visible image (no roles or key handling,
so typing a space reaches the editor).

## Quote

Rows `[optional icon picture, quote as h2/p/blockquote]` `[p attribution]`. Default `centered`
(75% measure); variant `rule` = left-ruled light quote.

## Video

Rows `[optional poster picture] [p link]` with the player URL
`https://players.brightcove.net/640445594001/1QVD66lj_default/index.html?videoId=<id>`. Opens a
native `<dialog>` (Esc/backdrop/close button; playback stops on close). Without JS or in Canvas it
is a plain link. Variant `inline` is used when nested by Promo Banner / Columns.

## Form (demo, never submits)

Field rows `[p label (* = required)] [p type] [optional ul options]`, type ∈ text, email, tel,
select, textarea, checkbox, submit. One-cell rows are copy (before the first field = intro; with
`split` it is a left column). No Marketo script, no action URL: the generated `<form>` blocks
submission, the submit button is disabled, and a notice links to the original page on
manulifeim.com (strings from placeholders `formDemoNotice`, `formDemoLink`). Canvas shows the type
and option cells for editing.

## Columns

Cells side by side (stacked ≤800px). Variants: `feature-card` (white 50/50 card over an
`overlay` hero), `map` (bold title + 32px light copy beside a 250px map strip; the next block
overlaps 120px), `figure` (`[desktop picture] [mobile picture]`, switch at 800px).

## Capabilities hub (`/capabilities`)

The source page is only an icon + H1. The migrated page adds an **authored** `Cards (info)` with the
five homepage capability tiles (Fixed income, Alpha-focused equity, Private markets, Multi-asset
solutions, Alternative credit) so the hub is useful; this is a deliberate addition, not source
content.

## Known deviations

- Strategy list ≤600px is one column (the source keeps a sideways-scrolling table).
- Image-toggle labels use the brand font (the source buttons fall back to Arial).
- Source dividers (`hr`) need the lead's `divider` section style; until then the gap is 32px.
