# Home blocks (owner: home)

Homepage `/index` and the blocks it introduces. Source: https://www.manulifeim.com/institutional/tw/en.
Importer: `tools/importer/home.py` (reads `home/hero.json` + `home/sections.json` captures).

## /index document outline

| # | Section (Style) | Content |
|---|---|---|
| 1 | — | `Carousel (hero)` — 4 slides |
| 2 | `intro` | h2 "Investment capabilities—combining local insight and *global* resources", p |
| 3 | — | `Cards (info)` (5 capability tiles, landing owner), `Disclosure (small)` |
| 4 | `title-row, display` | h2 "…positive *impact*", p link "Learn more about sustainability", ESG p, `Cards (image)` (landing owner) |
| 5 | `title-row` | h2 "Latest viewpoints", p link "All viewpoints" (/viewpoints/all), `Article Cards (list, toggle)` Source /viewpoints/, Limit 3 (discovery owner) |
| 6 | `title-row, display` | h2 "Latest news", p link "All news" (/about-us/press-releases), `Article Cards (news)` Source /about-us/press-releases/, Limit 4 (discovery owner) |
| 7 | `display` | h2 "Stay *connected*", `Social`; page `Metadata` (Title, Description, Image) |

## Carousel (hero)

The source's rotating banner: 600px slides, cover image under a left→right black scrim, white copy
in a 45% column (full width ≤1100px), green primary button, black pill controls centred 26px above
the bottom edge.

| Carousel (hero) | |
|---|---|
| picture | h1 (first slide) or h2, p, **bold link** (primary button) |
| … one row per slide | |

- Cells are classified, not rebuilt: the cell with a picture and no heading is the image, the other
  is the copy (authors may swap the order). Extra cells are hidden on the published page.
- Use `h1` on the first slide only; later slides use `h2` (same visual size). `<em>` in a heading
  renders in the serif italic.
- Autoplay 5s; the current dot fills as a progress bar (Web Animations, so pausing keeps the
  elapsed time). Pauses on mouse hover, on focus inside the carousel and on touch; while paused the
  current dot shows a play icon and is the play/pause toggle. Prev/next/dots are `<button>`s.
- `prefers-reduced-motion: reduce`: no autoplay (starts paused, the play control still works) and
  no fade. Otherwise slides fade in from 0.4 opacity over 1.5s, as on the source.
- LCP: the first slide image is `loading=eager` + `fetchpriority=high`, the others lazy.
- Accessibility: block is `role=region` + `aria-roledescription=carousel`; slides are
  `role=group` + `aria-roledescription=slide` with "Slide n of N" labels; hidden slides are
  `inert` + `aria-hidden`; `aria-live` is `off` while rotating and `polite` when paused.
- Labels come from `/placeholders` (Key/Text), with English fallbacks when a key is missing:
  `carouselLabel` (Highlights), `carouselPrevious` (Previous slide), `carouselNext` (Next slide),
  `carouselPause` (Pause slideshow), `carouselPlay` (Play slideshow), `slideOf` (Slide {0} of {1}).
  Controls render immediately with the fallbacks; the sheet only relabels them (no LCP wait).
- Fewer than two slides: no controls, no timer.
- The source's headings start with a stray `<br>`, which leaves an empty 80px heading line above
  the copy. The importer drops the `<br>`; a shrinkable spacer in CSS keeps the shipped spacing
  (and gives way first on a long slide instead of clipping its button, as source slide 3 does).
- **Canvas** (`isAuthoring()`): class `static` — every slide is stacked and visible, no controls,
  no timers, no `inert`/`aria-hidden`; authored rows, cells, headings, paragraphs and pictures are
  never moved or recreated.

## Disclosure

| Disclosure | |
|---|---|
| p label | rich body (paragraphs, lists, links) |
| … one row per disclosure | |

- Default: static (homepage "Important disclosures"): 16px scale icon + 14/700 label, body always
  visible. A single-cell row is body only.
- `small`: fine print. The source wraps it in `<small><sup>`; `<small>` does not survive DA →
  aem.page, so the variant sets the first 83% step (13.28px) and the authored `<sup>` the second
  (11.02px).
- `collapsible`: each row becomes `<details><summary>label</summary>body</details>` with an arrow
  that flips when open (landing/article "Important information", "Transcript"). In Canvas the rows
  stay static so label and body remain editable (no summary toggling under the cursor).
- The icon is a CSS mask on the label cell (`icons/scale.svg`), not markup inside the paragraph.

## Social

| Social | |
|---|---|
| `:linkedin:` (icon) or a network label | p link (the tile label, e.g. "Manulife Investment Management") |
| … one row per network | |

- White 72px tiles, 12/700 label then the 24px icon, 4 per row (2 ≤1100px, 1 ≤600px), hover/focus
  background #F7F7F7.
- Published: the whole tile is the link (stretched `::after`); the link gets an accessible name
  with the network ("Manulife Investment Management (LinkedIn)"). In Canvas the stretch is off so
  both cells stay selectable.
- The link is excluded from the global circled-arrow CTA style.
