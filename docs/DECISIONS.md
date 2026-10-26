# Decisions

Short ADRs for the Manulife IM (TW institutional, EN) → EDS + Experience Workspace migration.
Each records the evidence that forced it. Status: accepted unless noted.

## ADR-001: Listings and search read a previewed DA sheet, not /query-index.json

- **Context:** the mandate is preview-only (`*.aem.page`); nothing is published to aem.live.
  da-cli's `index list` caveat (and the platform) state the Configuration Service query index
  reflects **published** content only; previewing never updates it.
- **Decision:** configure the native `default` index anyway (`da index add default`, properties
  title, description, image, date, category, tags, authors, template, type, robots) so it takes
  over on any future publish. Until then `tools/importer/build-index.py` applies that same
  definition (globs and selectors, read live from `da index show`) to the delivered aem.page
  HTML and writes the DA sheet `/data/content-index`, which is previewed like any page.
  `fetchIndex()` reads `CONTENT_INDEX` in `scripts/scripts.js`.
- **Consequence:** the sheet must be rebuilt after page metadata changes (one command). Switching
  to the native index is a one-line change (`CONTENT_INDEX = '/query-index.json'`) with identical
  columns.

## ADR-002: Experience Workspace is configured for preview-only authoring

- **Decision:** the DA site config `flags` sheet sets `ew.enabled=true` (Canvas is the default
  editor) and `editor.hidePublish=/` (the Publish card is removed for the whole site, so the
  editor itself enforces "aem.page only"). Verified in da-nx `nx2/blocks/ew-actions/ew-actions.js`
  (`shouldHidePublish`, origin/main 96b5326d): the key is read from the config's **first sheet**
  and prefix-matched against `/{org}/{site}/{path}.html`, so it must stay in the first sheet
  (`flags`). `da site config doctor` reports it as `flags-key-ignored` because `getEWFlags`
  ignores non-`ew.*` keys; that is true for the flags API but not for this reader (da-cli
  follow-up). `ew.canvasDefaultView=layout` opens Canvas in Layout. The `library` sheet exposes Blocks, Templates,
  Icons and Placeholders; the blocks JSON carries an `options` sheet so Section Metadata styles
  and Page metadata fields are dropdowns instead of free text.

## ADR-003: Media is uploaded into DA

- **Context:** Akamai answers 403 to curl and to the EDS media ingester; only a real browser
  session can read manulifeim.com assets.
- **Decision:** assets were fetched inside the Studio browser, stored under DA `/media/` and
  referenced through `content put --rewrite-media-urls`. Mapping:
  `.captures/manulifeim-tw/media/media-manifest.json` (outside Git).

## ADR-004: TW/EN links become site-relative; unmigrated routes fall back honestly

- **Decision:** every `manulifeim.com/institutional/tw/en/<path>` link is authored as `/<path>`.
  Unmigrated destinations hit `404.html`, which names the gap and links to the original page.
  Other manulifeim.com links (global site) stay absolute.

## ADR-005: Third-party integrations are demo-safe

- **Decision:** Marketo forms are rendered from captured fields without the Marketo script and
  cannot submit; Login/Register stay honest (the source itself reports them unavailable); no
  Coveo, analytics or OneTrust code is carried over. Search runs client-side over ADR-001's sheet.
- **Trade-off:** Coveo also searched PDFs/fund data and powered "People also ask"; the EDS search
  covers migrated pages only.

## ADR-006 (temporary): dev head-injection proxy until AEM Code Sync is installed

- **Context:** the GitHub App install is a human step; until it lands, aem.page has no code bus,
  so `aem up` proxies pages without `head.html`.
- **Decision:** a throwaway proxy outside the repo (`.captures/manulifeim-tw/dev-proxy.mjs`,
  `:3001 → :3000`) injects the checkout's `head.html`. Delete it once Code Sync is installed.
