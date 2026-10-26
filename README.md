# Manulife Investment Management (Taiwan, institutional): EDS migration study

An independent, high-fidelity migration of https://www.manulifeim.com/institutional/tw/en to
AEM Edge Delivery Services, authored in Document Authoring / Experience Workspace. It was built with
FluffyJaws Dev Studio and da-cli, with every remote operation journaled as a QMD receipt.
This is not the official Manulife site, and it is **preview-only**: nothing is published to aem.live.
It is a proof of concept that lives on the `migration` branch (intentionally not merged to `main`).

- Preview: https://migration--manulifeim-tw-eds--somarc.aem.page/
- How we built this: https://migration--manulifeim-tw-eds--somarc.aem.page/how-we-built-this
- Experience Workspace (Canvas): https://da.live/canvas#/somarc/manulifeim-tw-eds/index
- DA content: https://da.live/#/somarc/manulifeim-tw-eds
- Content model and team contract: [docs/CONTENT-MODEL.md](docs/CONTENT-MODEL.md)
- Decisions (index without publish, EW flags, media, links, integrations): [docs/DECISIONS.md](docs/DECISIONS.md)
- Block documentation: [docs/blocks/](docs/blocks/)

## What is migrated

- **Shared chrome:** the 80px rail with the Capabilities fly-out, the top bar (search, region, login,
  register), the session-dismissible alert, the footer, and the Taiwan attestation dialog
  (accepted with a text hash, like the source).
- **Every archetype:** the homepage; four capability landings plus the hub; sustainability,
  stewardship, about and contact; three viewpoint articles on the article template; the viewpoints
  hub and the filterable listing; four press releases plus the listing; case studies; search; legal
  pages.
- **Data:** `/data/content-index` (search and listings; see ADR-001), `/data/authors` (217),
  `/data/case-studies` (62), and `/placeholders` (81 UI labels).
- **Experience Workspace:** `ew.enabled`, `editor.hidePublish=/` (no Publish card),
  `ew.canvasDefaultView=layout`, `ew.wysiwygBranch` → `migration`, plus a generated library: blocks with real variants, options
  dropdowns, templates and icons.

Not migrated: the remaining sitemap URLs (mostly ~700 viewpoint articles and ~160 press releases, which
reuse these templates and importers), Coveo's PDF and fund search, live Marketo submissions, and
login/registration. Unmigrated links land on a 404 page that names the gap and links to the original.

## Development

```sh
npm ci && npm run lint
da --org somarc --repo manulifeim-tw-eds --branch migration site pin-target
da up --mode runtime --port 3000 --url https://migration--manulifeim-tw-eds--somarc.aem.page
```

Importers read browser captures (Akamai blocks non-browser clients) and write only into the external
da-cli workspace (`da workspace show`). Upload and preview are separate, reviewed operations:

```sh
python3 tools/importer/landing.py
da --qmd content put /capabilities/fixed-income.html <file> --rewrite-media-urls          # dry-run
da --commit --qmd content put /capabilities/fixed-income.html <file> --rewrite-media-urls
da --commit --qmd preview page /capabilities/fixed-income --yes
python3 tools/importer/build-index.py          # rebuild /data/content-index after metadata changes
python3 tools/importer/build-library.py        # regenerate the Experience Workspace library
python3 tools/receipts-summary.py              # the evidence trail
```

## Rights

Brand fonts, photography, logos and copy belong to Manulife and its affiliates. The Apache licence
covers the boilerplate and implementation code only.
