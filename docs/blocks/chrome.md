# Site chrome: header, footer, disclaimer, 404

Owner: chrome. Files: `blocks/header/*`, `blocks/footer/*`, `scripts/disclaimer.{js,css}`,
`404.html`, `tools/importer/chrome.py`. DA documents: `/nav`, `/footer`, `/fragments/disclaimer`.

Source evidence: `.captures/manulifeim-tw/home/{chrome.md,chrome.json,raw/*}` plus live measurements
of https://www.manulifeim.com/institutional/tw/en (1440/1024/768/390).

Regenerate the documents with `python3 tools/importer/chrome.py`, then follow the DA workflow in
`docs/CONTENT-MODEL.md` (fix-sections → dry-run put → `--commit` put → preview).

## /nav (header)

Five sections, in this order. A section may instead carry Section Metadata `Style` = `brand`,
`rail`, `tools`, `regions` or `alert` to name its role explicitly.

| # | Section | Authoring shape | Rendered as |
|---|---|---|---|
| 1 | brand | `picture` (desktop logo), `picture` (mobile stacked logo), `[Home](/)` | top-bar logo link (≤800px: green M tile + stacked logo); the link's href is the home URL for the logo, the rail M tile and the mobile tile |
| 2 | rail | one list. Item = link `[:rail-dashboard: Dashboard](/dashboard)`, or for a fly-out group `:rail-capabilities: Capabilities` with a nested list of links | fixed 80px rail; a group becomes a disclosure button + 300px fly-out (≤800px: accordion) |
| 3 | tools | `[Search](/search)` (link text = placeholder/label, href = results page), `:user: Log in`, `Register for access` | search form (GET `?q=`), Log in, Register outline button |
| 4 | regions | `:globe: Taiwan` (current region), `## Select a location`, optional note paragraph(s), then `### Group` + list of region links (repeat) | region button (desktop bar, mobile menu row) opening a two-pane dialog |
| 5 | alert | one paragraph | dismissible site alert under the bar |

Rail icons are any `/icons/*.svg` name; they are painted as CSS masks so the same white SVG renders
white in the rail and navy in the mobile menu (no `-dark` variants needed).

**Log in / Register for access.** On the source they open auth dialogs, and the site alert says
login and registration are unavailable. Authored as plain text, they render as buttons that reveal
and focus that alert (`aria-describedby` points at it). If an author adds a link to either
paragraph, it renders as a normal link. No fake authentication.

**Region dialog.** The source shows the chosen region's own disclaimer beside the list. Those texts
belong to the other regional sites, so the decision pane shows the authored note and a
*Continue* link to that region's site. ≤800px the list is one pane and a region link navigates.

UI strings that are not authored (`Main Navigation`, `Close`, `Cancel`, `Continue`,
`Open/Close Site Navigation`, …) default in `header.js` and can be overridden in `/placeholders`
with the keys `mainNavigation, home, search, selectLocation, close, cancel, continue, continueTo,
siteAlert, closeAlert, openNavigation, closeNavigation, userOptions`.

Behaviour: fly-out opens on click/Enter (focus moves to its first link), closes on Escape (focus
returns to the button), outside click, or focus leaving the group. Hovering the rail dims the other
items to .6; an open fly-out dims the rest. The alert's dismissal is session-only
(`sessionStorage['mim-site-banner-dismissed']` = the dismissed text, so a new message shows again).
≤800px: 50px #424559 bar; the hamburger opens the rail as a full-screen white menu, focus moves
into it, `main`/`footer`/alert become `inert`, Escape closes and returns focus to the hamburger.
Document listeners use one module-level `AbortController`, aborted on every re-decoration, so
Canvas re-running `loadPage` on a fresh body never stacks handlers.

## /footer

| Section | Shape |
|---|---|
| 1 | `picture` (logo), list of links |
| 2 | copyright paragraphs (inline links allowed), list of **bold** legal links |

Authored nodes are moved into place (only classes are added; default-content button classes are
stripped). Links to other hosts (Individual Investor Site) open in a new tab with an accessible
"(opens in a new tab)" label.

## /fragments/disclaimer (scripts/disclaimer.js)

| Section | Shape |
|---|---|
| 1 | `## Disclaimer (Taiwan)`, then the legal text (`### IMPORTANT INFORMATION`, paragraphs) |
| 2 | `[Cancel](https://www.manulifeim.com/)`, `**I agree**`, `[Change region](https://www.manulifeim.com/)` |

Shown from `loadDelayed` on first visit as a modal `<dialog>` labelled by the title; the text box
scrolls and takes initial focus. No × and Escape is ignored (as on the source). *I agree* stores
`localStorage['mim-inst-attestation-accepted-TW']` = SHA-256 (base64) of the section 1 text, so
editing the text re-prompts everyone. *Cancel* follows the authored link. *Change region* swaps the
dialog to the header's location list (its href is the no-JS fallback). Skipped in Canvas
(`isAuthoring()`), on `/nav`, `/footer`, `/fragments/*`, and when page Metadata `Disclaimer: off`.

## 404.html

Static page with the normal scripts, so the header/footer chrome loads from `/nav` and `/footer`.
Because every TW/EN link is rewritten site-relative, unmigrated destinations land here: it says the
page has not been migrated in this demo and links to
`https://www.manulifeim.com/institutional/tw/en<path>`, the homepage and `/how-we-built-this`.

## Canvas notes

- Header and footer content comes from separate documents (`.plain.html`, no prose markers), so
  nothing in them is editable inside a page's Canvas session; their decoration cannot strand
  `data-prose-index`. When `/nav`, `/footer` or `/fragments/*` themselves are opened in Canvas,
  `scripts.js` skips header/footer loading and they render as default content.
- Repeat renders: the header block is replaced by `loadHeader`, its dialog lives inside the block,
  and global listeners are aborted per run. The disclaimer never runs in Canvas.
