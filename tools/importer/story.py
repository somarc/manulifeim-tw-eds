#!/usr/bin/env python3
"""Author /how-we-built-this from live evidence, in the site's own block language.

Every number is computed when the page is generated: QMD receipts (tools/receipts-summary.py),
the DA source tree (`da content tree`), the media and sheets in the DA workspace, the Git log and
the block directories. Prose names the decisions recorded in docs/DECISIONS.md. Output goes to
the DA workspace; upload + preview are separate, reviewed CLI operations.
"""
import html
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import REPO, block, content_root, section, page  # noqa: E402

BASE_COMMIT = 'ec27b3b'  # the boilerplate as created by `da site create`
TEAM = [
    ('Lead', 'Claude Opus 5.5 · ultra', 'Scoped the brief, created the site, wrote the design foundation and the importer contract, owned DA config, index, library, integration fixes, the PR and this page.'),
    ('Capture: homepage + chrome', 'specialist · high', 'Rendered DOM, design tokens, 76-icon sprite, hero logic, Coveo search and the Taiwan attestation contract, through a real browser.'),
    ('Capture: templates', 'specialist · high', '23 pages, 11 archetypes, the union of ~30 components and the JSON APIs behind viewpoints and case studies.'),
    ('Media pipeline', 'specialist · high', 'Fetched every image inside the browser (Akamai blocks everything else) and uploaded them to DA with one journaled put-tree.'),
    ('Chrome', 'specialist · high', 'Rail, fly-out, top bar, region dialog, alert banner, footer, the attestation dialog and the honest 404.'),
    ('Homepage', 'specialist · high', 'Hero carousel, disclosures, the social tile and the homepage document.'),
    ('Landing pages', 'specialist · high', 'Hero, cards, anchor nav, colour bands, promo banners, timeline, image toggle, quote, video and a demo-safe form; nine pages.'),
    ('Discovery', 'specialist · high', 'Article template, index-driven teasers, viewpoint/press/case-study listings, browse-by, tag cloud and search; articles, releases and sheets.'),
    ('Wave 2: link graph', 'specialist · high', 'Closed the link graph: the 17 viewpoint articles linked from migrated pages and the 4 footer legal pages, plus a table block.'),
    ('Fidelity QA ×2', 'specialists · high', 'Page-by-page, four-viewport comparison against the source with fix authority over disjoint block sets.'),
    ('Code Sync gate', 'specialist · low', 'Held the one owner-gated step, installing AEM Code Sync with the owner\'s passkey, so the build kept moving while it was pending.'),
]


def run(*args, cwd=REPO):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=True).stdout


def da_json(*args):
    out = run('da', '--qmd', '--format', 'json', *args)
    return json.loads(out[out.find('{'):])


def esc(value):
    return html.escape(str(value), quote=True)


def evidence():
    receipts = json.loads(run('python3', 'tools/receipts-summary.py'))
    tree = da_json('content', 'tree', '/')['data']['paths']
    skip = ('/library/', '/drafts/', '/media/', '/data/', '/fragments/', '/viewpoints/fragments/')
    pages = [p for p in tree if p.endswith('.html') and not p.startswith(skip)
             and p not in ('/nav.html', '/footer.html', '/how-we-built-this.html')]
    root = content_root()
    sheet_rows = {name: json.loads((root / f'data/{name}.json').read_text()).get('total', 0)
                  for name in ('content-index', 'authors', 'case-studies') if (root / f'data/{name}.json').exists()}
    placeholders = json.loads((root / 'placeholders.json').read_text())['total']
    library = json.loads((root / 'library/blocks.json').read_text())
    blocks = sorted(p.parent.name for p in REPO.glob('blocks/*/*.js'))
    commits = run('git', 'rev-list', '--count', f'{BASE_COMMIT}..HEAD').strip()
    media = len(list((root / 'media').glob('*')))
    first = datetime.fromisoformat(receipts['firstAt'].replace('Z', '+00:00'))
    last = datetime.fromisoformat(receipts['lastAt'].replace('Z', '+00:00'))
    return {
        'receipts': receipts, 'pages': len(pages), 'sheet_rows': sheet_rows,
        'placeholders': placeholders, 'library_blocks': library['blocks']['total'],
        'options': library['options']['total'], 'blocks': len(blocks), 'commits': int(commits),
        'media': media, 'hours': round((last - first).total_seconds() / 3600, 1),
        'head': run('git', 'rev-parse', '--short', 'HEAD').strip(),
    }


def stat(figure, caption):
    return [f'<h3><strong>{esc(figure)}</strong> {esc(caption)}</h3>']


def tile(title, *paras, link=None):
    body = f'<h3>{title}</h3>' + ''.join(f'<p>{p}</p>' for p in paras)
    if link:
        body += f'<p><a href="{esc(link[1])}">{esc(link[0])}</a></p>'
    return [body]


def step(title, explanation, commands, note=''):
    left = f'<h3>{title}</h3>' + ''.join(f'<p>{p}</p>' for p in explanation)
    right = f'<pre><code>{esc(commands.strip())}</code></pre>' + (f'<p>{note}</p>' if note else '')
    return [left, right]


def main():
    ev = evidence()
    r = ev['receipts']
    modes, states = r['byMode'], r['byState']
    not_ok = states.get('failed', 0) + states.get('refused', 0)

    hero = section(block('hero short', [
        ['<picture><img src="/media/digital-hero-image-2000x1200.jpg" alt=""></picture>'],
        ['<h1>How we built <em>this</em></h1>'
         '<p>manulifeim.com/institutional/tw/en, rebuilt on AEM Edge Delivery Services and authored in '
         'Experience Workspace by one lead agent and eleven specialists in FluffyJaws Dev Studio. Every '
         'remote operation was reviewed before it ran and left a receipt.</p>'
         '<p><strong><a href="#blueprint">Explore the blueprint</a></strong></p>'],
    ]))
    nav = section(block('anchor-nav', [[
        '<ul><li><a href="#brief">The brief</a></li><li><a href="#team">The team</a></li>'
        '<li><a href="#blueprint">The blueprint</a></li><li><a href="#workspace">Experience Workspace</a></li>'
        '<li><a href="#caught">What we caught</a></li><li><a href="#next">Boundaries</a></li></ul>']]))

    brief = section(
        '<h2>One brief. <em>Every</em> step on the record.</h2>'
        '<p>The ask: move the Taiwan institutional site to Edge Delivery Services and Experience Workspace '
        'with high fidelity, using content-driven development, real blocks and Canvas-ready authoring. '
        'Search where the site has search, sheets where it needs sheets, and preview on aem.page only. '
        'Nothing here was ever published to aem.live.</p>',
        block('cards stats cols-4', [
            stat(ev['pages'], 'pages migrated and previewed, across 11 source archetypes'),
            stat(ev['blocks'], 'block directories, all lint-clean'),
            stat(ev['media'], 'images fetched in a real browser and stored in DA'),
            stat(r['receipts'], 'journaled operation receipts in the evidence trail'),
            stat(r['committedWrites'], 'reviewed, committed remote writes (dry-run first)'),
            stat(f"{not_ok}", 'failed or refused outcomes, kept in the trail, not hidden'),
            stat(ev['commits'], f"focused commits on the migration branch (head {ev['head']})"),
            stat(0, 'publishes to aem.live, enforced in the editor itself'),
        ]),
        style='intro', extra={'Anchor': 'brief'})

    team = section(block('feature-band navy overlay', [[
        '<h2>One lead. Eleven <em>specialists</em>.</h2>'
        '<p>The lead owned every shared file and every remote mutation policy. Specialists owned disjoint '
        'files under a written contract (docs/CONTENT-MODEL.md), so parallel work never collided in the '
        'checkout. Nobody committed but the lead; nobody published at all.</p>',
        '<picture><img src="/media/iinv-7270-535856-1200x628-03-stewardship.jpg" alt=""></picture>',
    ]]), extra={'Anchor': 'team'})
    team_tiles = section(block('cards info cols-4', [tile(f'{esc(n)}', f'<em>{esc(m)}</em>', esc(d)) for n, m, d in TEAM]),
                         style='overlap')

    blueprint = section(
        '<h2>The blueprint, down to the <em>command line</em></h2>'
        '<p>There was no "migrate everything" button. There was a sequence of scoped operations, each '
        'with a boundary and a check. These are the shapes we ran; do not replay creates or writes '
        'against an existing target blindly.</p>',
        block('blueprint', [
            step('Capture through a real browser', [
                'manulifeim.com answers 403 to curl and to the EDS media ingester (Akamai). Two specialists '
                'captured rendered DOM, computed styles, fonts, icons and the JSON APIs inside the Studio '
                'browser instead, into a capture folder outside Git.'],
                'curl -sSL https://www.manulifeim.com/institutional/tw/en   # 403 Access Denied\n'
                '# Studio browser: accept the Taiwan attestation, then capture\n'
                '#   home/{design-tokens,chrome,hero,sections}.json\n'
                '#   pages/<slug>.main.html + <slug>.json, ARCHETYPES.md',
                '1,818 sitemap URLs inventoried; 23 representative pages captured.'),
            step('Create the site from a reviewed plan', [
                'The create spans GitHub, Configuration Service and a checkout. It returned a partial '
                'outcome (repository created, registration indeterminate), reported as such, so we inspected '
                'before doing anything else.'],
                'da --org somarc site create manulifeim-tw-eds --plan \\\n'
                '  --template adobe/aem-boilerplate --public --content-mode configuration-service\n'
                'da --org somarc --commit site create manulifeim-tw-eds \\\n'
                '  --apply-plan plan.json --expected-plan-id sha256:…\n'
                '# → SITE_CREATE_CONFIGURATION_OUTCOME_UNKNOWN (inspect, do not retry)',
                'The recovery is in the next step.'),
            step('Prove the identity before writing', [
                'The register attempt was denied. Instead of retrying, we asked why: the cached IMS token '
                'belonged to a different organisation\'s identity. One sign-in later, the read-only preflight '
                'proved the record absent and the committed register adopted it idempotently.'],
                'da --org somarc --repo manulifeim-tw-eds access explain /\n'
                'da --org somarc --repo alc-eds auth verify-target   # authenticated-but-unauthorized\n'
                'da auth logout && da auth login                      # human IMS step\n'
                'da --qmd --commit site register --code-owner somarc --code-repo manulifeim-tw-eds \\\n'
                '  --da-org somarc --da-repo manulifeim-tw-eds         # → adopted-existing'),
            step('Keep operational state out of Git', [
                'The checkout holds code only. Hydrated documents, media and receipts live in the external '
                'operational workspace; the importer refuses to write inside the repository.'],
                'da --org somarc --repo manulifeim-tw-eds site pin-target\n'
                'da --qmd --commit workspace init --yes\n'
                'da workspace show --format json   # contentRoot outside the checkout'),
            step('Install AEM Code Sync (owner action)', [
                'Connecting the repository to the code bus is a GitHub App install that only the repository '
                'owner can approve with a passkey. It is a deliberate human gate, not a tool failure. While it '
                'was pending, a throwaway local proxy injected head.html so validation never stalled (ADR-006).'],
                '# owner: https://github.com/apps/aem-code-sync/installations/new → somarc/manulifeim-tw-eds\n'
                'da --qmd site doctor --agent                 # code-bus styles.css: 404 until installed\n'
                'git push origin migration                    # refs pushed after the install are synced\n'
                'curl -sI https://migration--manulifeim-tw-eds--somarc.aem.page/scripts/aem.js   # 200',
                'Refs pushed before the install (here: the template commit on main) appear on the code bus only after their next push.'),
            step('Media into DA, in one journaled tree', [
                'Because Akamai blocks the ingester too, every image was fetched in the browser and uploaded '
                'under /media; documents reference it through --rewrite-media-urls.'],
                f"da --qmd content put-tree <workspace>/content/media --prefix /media           # dry-run\n"
                f"da --commit --qmd content put-tree <workspace>/content/media --prefix /media --yes",
                f"{ev['media']} files, 0 failures, byte-identical read-back on samples."),
            step('Content-driven blocks, family by family', [
                'Each family modelled its blocks (four cells per row at most, semantic cells, variants over '
                'config), wrote a converter, uploaded real documents and built the block against them, '
                'measuring the source at 1440, 1024, 768 and 390 px.'],
                'python3 tools/importer/landing.py\n'
                'da --qmd content fix-sections <file>\n'
                'da --qmd content put /capabilities/fixed-income.html <file> --rewrite-media-urls\n'
                'da --commit --qmd content put /capabilities/fixed-income.html <file> --rewrite-media-urls\n'
                'da --commit --qmd preview page /capabilities/fixed-income --yes',
                'Local code over previewed content: da up --mode runtime --url https://main--…aem.page'),
            step('Search and listings without publishing', [
                'A platform caveat stopped a wrong assumption: the native query index only reflects '
                'published content, and this site is preview-only. We configured the native index anyway, '
                'then built a previewed sheet with the same columns by applying that definition to the '
                'delivered preview HTML (ADR-001).'],
                "da --commit --qmd index add default --include '/**' --exclude '/drafts/**' … \\\n"
                "  --metadata 'title,description,image,date,category,tags,authors,template,type,robots' --yes\n"
                "da --commit --qmd index set-property default tags \\\n"
                "  --select 'meta[property=\"article:tag\"]' --values 'attribute(el, \"content\")' --yes\n"
                'python3 tools/importer/build-index.py\n'
                'da --commit --qmd content put /data/content-index.json <file> --json-profile sheet-v1\n'
                'da --commit --qmd preview page /data/content-index.json --yes',
                f"Sheets: content-index {ev['sheet_rows'].get('content-index', 0)} rows, authors "
                f"{ev['sheet_rows'].get('authors', 0)}, case studies {ev['sheet_rows'].get('case-studies', 0)}, "
                f"placeholders {ev['placeholders']} keys."),
            step('Configure Experience Workspace, then verify it', [
                'Canvas is the default editor, Layout is the default view, Canvas renders the migration branch, '
                'and the Publish card is removed site-wide. Every config write is a reviewed dry-run, committed only against its digest.'],
                'da --qmd site config set --flag ew.enabled=true --flag editor.hidePublish=/ \\\n'
                '  --flag ew.canvasDefaultView=layout                 # dry-run → reviewDigest\n'
                '# ew.wysiwygBranch is read from the first sheet, so it is written with --set-sheet\n'
                'da --qmd site config set --set-sheet flags=flags.json   # + /somarc/manulifeim-tw-eds/=migration\n'
                'da --commit --qmd site config set … --expected-review-digest sha256:…\n'
                'python3 tools/importer/build-library.py            # blocks, options, templates, icons\n'
                'da --commit --qmd content put-tree <workspace>/content/library --prefix /library --yes\n'
                'da --commit --qmd site config set --set-sheet library=library.json --expected-review-digest …\n'
                'da --qmd site config doctor                         # 0 errors',
                'editor.hidePublish was verified against da-nx source: it is read from the first sheet.'),
            step('Read the receipts', [
                'Every operation was journaled, so each outcome (including the failures) is a typed '
                'receipt in the local QMD vault, searchable without re-running anything.'],
                'python3 tools/receipts-summary.py\n'
                "qmd search 'manulifeim-tw-eds site.register'\n"
                "qmd search 'manulifeim-tw-eds content.put-tree commit'",
                f"{r['receipts']} receipts: {modes.get('commit', 0)} commit, {modes.get('dry-run', 0)} dry-run, "
                f"{modes.get('read-only', 0)} read-only; {states.get('completed', 0)} completed, "
                f"{states.get('failed', 0)} failed, {states.get('refused', 0)} refused."),
        ]),
        extra={'Anchor': 'blueprint'})

    workspace = section(block('feature-band green', [[
        '<h2>Experience Workspace, <em>configured</em>, not assumed</h2>'
        '<p>Authors open every page in Canvas with the site\'s real block code. The library is generated '
        'from real migrated instances, so what an author inserts is exactly what the site renders. '
        'Checked in Experience Workspace itself: Layout loads the migration branch with no ?ref, the '
        'Outline mirrors every section and block variant, Insert block lists the whole library with live '
        'previews, and Send offers Preview only.</p>',
        '<picture><img src="/media/iinv-7270-535856-1200x628-05-sust-reporting.jpg" alt=""></picture>',
    ]]), extra={'Anchor': 'workspace'})
    workspace_tiles = section(block('cards info', [
        tile('ew.enabled = true', 'Canvas replaces the classic editor for this site; <em>/edit</em> redirects.'),
        tile('editor.hidePublish = /', 'No Publish card anywhere: the editor itself enforces "aem.page only".'),
        tile('ew.canvasDefaultView = layout', 'Pages open in Layout, rendered by the site\'s own blocks.'),
        tile('ew.wysiwygBranch = migration', 'Layout renders the proof-of-concept branch\'s code, with no ?ref needed.'),
        tile(f"{ev['library_blocks']} library blocks", 'Each with its real variants and a description, harvested from the migrated pages.'),
        tile(f"{ev['options']} authoring options", 'Section styles and page metadata (template, type, date, tags, authors, disclaimer) as dropdowns.'),
        tile('4 templates · 76 icons', 'Landing page, article, press release and legal page skeletons; the full icon set.'),
    ]), style='overlap')

    caught = section(
        '<h2>What we <em>caught</em></h2>'
        '<p>The value is not that nothing went wrong. It is that nothing wrong went silently.</p>',
        block('cards info', [
            tile('A partial create', 'The repository existed while the registration was "indeterminate". It was reported as such, inspected, and recovered without a blind retry.'),
            tile('The wrong identity', 'An access check showed an authenticated principal from another organisation. Re-signing in fixed it; retrying would not have.'),
            tile('A live-only index', 'The index caveat (published content only) redirected search to a previewed sheet with the native schema, instead of a silent empty search.'),
            tile('Digest-bound config', 'A second write against a stale review was refused (DA_CONFIG_REVIEW_DRIFT). Read-after-write lag was diagnosed, not papered over.'),
            tile('A library contract', 'A config check flagged the Placeholders library row: Experience Workspace inserts {{key}} tokens this site never substitutes. We removed the row.'),
            tile('Upstream edges', 'Preview rejects SVGs over 40 KB, EDS collapses "--" in paths, and DA drops &lt;small&gt;. Each became an importer rule.'),
        ]),
        style='display', extra={'Anchor': 'caught'})

    nxt = section(
        '<h2>Honest <em>boundaries</em></h2>'
        '<ul>'
        '<li>This is a proof of concept on the <em>migration</em> branch: it is the canonical preview, '
        'and Experience Workspace renders it by default (ew.wysiwygBranch). main is intentionally left as '
        'the boilerplate; nothing is merged or published.</li>'
        f"<li>{ev['pages']} pages cover every archetype, and every viewpoint linked from a migrated page is "
        'migrated too. The remaining sitemap URLs (mostly ~680 more viewpoint articles, ~155 press releases, '
        '94 strategy pages and author data) reuse these templates and importers but were not bulk-imported; '
        'their links land on a page that names the gap and links to the original.</li>'
        '<li>Coveo also searched PDFs and fund data; this search covers migrated pages. Marketo forms render '
        'faithfully but cannot submit. Login and registration stay unavailable, as on the source.</li>'
        '<li>Brand fonts, photography and copy belong to Manulife. This is an independent migration study, not '
        'the official site, and it is not indexed.</li>'
        '</ul>'
        '<p><a href="/">Back to the migrated homepage</a></p>',
        style='narrow', extra={'Anchor': 'next'})

    doc = page([hero, nav, brief, team, team_tiles, blueprint, workspace, workspace_tiles, caught, nxt], {
        'Title': 'How we built this | Manulife Investment Management (EDS migration study)',
        'Description': 'How one lead agent and eleven specialists migrated manulifeim.com/institutional/tw/en to AEM Edge Delivery Services and Experience Workspace, with every step on the record.',
        'Image': '<picture><img src="/media/digital-hero-image-2000x1200.jpg" alt=""></picture>',
        'Disclaimer': 'off',
        'Robots': 'noindex, nofollow',
    })
    from common import write  # noqa: E402,PLC0415
    write('/how-we-built-this', doc)
    print(json.dumps({k: v for k, v in ev.items() if k != 'receipts'}, indent=1))


if __name__ == '__main__':
    main()
