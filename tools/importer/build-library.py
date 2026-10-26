#!/usr/bin/env python3
"""Generate the Experience Workspace authoring library from the migrated DA documents.

Writes into the DA workspace content root (never Git):
  library/blocks/<block>.html   one real instance per variant + a library-metadata description
  library/blocks.json           multi-sheet: blocks (name, path), options (key, blocks, values,
                                type, label), editor (block, property)
  library/templates/<t>.html    page skeletons cut from representative migrated pages
  library/templates.json        key, value
  library/icons.json            key, value, icon
  CAPTURES/config-library.json  rows for the DA site config `library` sheet (not uploaded)

Shapes follow docs.da.live "Set up library" and da-live's library loader (blocks sheet rows
{name, path}; extra `options` / `editor` sheets in the same JSON; `library-metadata` with a
description row). Upload + preview are separate, reviewed da-cli operations.
"""
import copy
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))
from common import CAPTURES, REPO, content_root  # noqa: E402

DA = 'https://content.da.live/somarc/manulifeim-tw-eds'
CODE = 'https://migration--manulifeim-tw-eds--somarc.aem.page'  # canonical preview branch (PoC, not merged)
SKIP_BLOCKS = {'metadata', 'section-metadata', 'library-metadata'}
SKIP_DOCS = ('library/', 'drafts/', 'media/', 'data/')
MAX_VARIANTS = 6

DESCRIPTIONS = {
    'carousel': 'Rotating hero: one row per slide [image][heading with an italic serif word, text, CTA]. Autoplays every 5s outside the editor.',
    'cards': 'Tiles in one shadowed container. info: [title, text, link]; image: [image][title, text, link]; news: [date, title, link]; stats/logos/download variants.',
    'disclosure': 'Important disclosures: [label][rich text]. Add (collapsible) for a details/summary disclosure.',
    'social': 'Stay connected tiles: one row per network [icon or label][link].',
    'hero': 'Page hero: [image] then [h1, text, CTA]. Variants set overlay/short/page-header treatments.',
    'anchor-nav': 'Sticky in-page links built from the page sections.',
    'feature-band': 'Full-width colour band (navy/green/purple): [icon, heading, text, link][image].',
    'promo-banner': 'Promotional banner (navy/green/blue): [heading, text, link][image or video link]. double and mosaic variants.',
    'timeline': 'Horizontal milestones: one row per milestone [year][image][caption].',
    'image-toggle': 'Stat buttons that swap a map image: one row per state [icon, label][image].',
    'quote': 'Pull quote: [quote] then [attribution].',
    'video': 'Brightcove video in a modal from an authored link.',
    'form': 'Demo-safe form rendered from captured fields; it never submits.',
    'columns': 'Two or more columns of default content.',
    'article-cards': 'Article teasers from the content index: config rows (Source, Limit, Tags, Category) or curated article links. list/grid/news/related/trending/feature variants.',
    'viewpoint-list': 'Filterable viewpoint listing (authors, asset managers, categories, tags) from the content index.',
    'press-list': 'Press releases listing with category tabs and pager from the content index.',
    'case-study-list': 'Case-study cards with tag filters from the /data/case-studies sheet.',
    'browse-by': 'Browse viewpoints by author, category or tag.',
    'tag-cloud': 'All tags with article counts from the content index.',
    'search': 'Site search over the content index with facets, sort and pager.',
    'table': 'A data table: the first row is the header row; one row per table row (source article tables).',
    'blueprint': 'Build steps: one row per step [heading + explanation][commands in a code block + notes].',
}

SECTION_STYLES = ('intro | display | title-row | narrow | narrow-center | navy | green | purple | '
                  'white | overlap | spacious')


def docs(root):
    for path in sorted(root.rglob('*.html')):
        rel = path.relative_to(root).as_posix()
        if rel.startswith(SKIP_DOCS) or rel in ('nav.html', 'footer.html'):
            continue
        yield rel, BeautifulSoup(path.read_text(), 'html.parser')


def collect(root):
    found = {}
    for rel, soup in docs(root):
        for block in soup.select('main > div > div[class]'):
            # importers wrote both `cards info` and `cards (info)`; EDS normalises both, the
            # library uses the canonical `name variant…` form
            tokens = re.sub(r'[(),]', ' ', ' '.join(block.get('class', []))).split()
            name = tokens[0].lower()
            if name in SKIP_BLOCKS:
                continue
            key = ', '.join(sorted(t.lower() for t in tokens[1:]))
            variants = found.setdefault(name, {})
            if key not in variants and len(variants) < MAX_VARIANTS:
                instance = copy.copy(block)
                instance['class'] = [name, *sorted(t.lower() for t in tokens[1:])]
                variants[key] = (rel, instance)
    return found


def library_metadata(description):
    return (f'<div class="library-metadata"><div><div><p>description</p></div>'
            f'<div><p>{description}</p></div></div></div>')


def write_doc(root, rel, main_html):
    target = root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f'<body>\n<header></header>\n<main>\n{main_html}\n</main>\n<footer></footer>\n</body>\n')
    return target


def main():
    root = content_root()
    found = collect(root)
    rows = []
    for name, variants in sorted(found.items()):
        sections = []
        for key, (rel, block) in variants.items():
            # visual variants are named by the block header (`cards (info)`); no extra heading
            sections.append(f'<div>{block}{library_metadata(DESCRIPTIONS.get(name, f"From /{rel[:-5]}"))}</div>')
        write_doc(root, f'library/blocks/{name}.html', '\n'.join(sections))
        rows.append({'name': name.replace('-', ' ').title(), 'path': f'{DA}/library/blocks/{name}'})
        print(f'  {name}: {", ".join(k or "(default)" for k in variants)}')

    options = [
        {'key': 'style', 'blocks': 'section-metadata', 'values': SECTION_STYLES, 'type': 'multi', 'label': 'Section style'},
        {'key': 'title', 'blocks': 'metadata', 'values': '', 'type': '', 'label': 'Title'},
        {'key': 'description', 'blocks': 'metadata', 'values': '', 'type': '', 'label': 'Description'},
        {'key': 'template', 'blocks': 'metadata', 'values': 'Landing= | Article=article', 'type': 'single', 'label': 'Template'},
        {'key': 'type', 'blocks': 'metadata', 'values': 'Article=article | Press release=press | Page=page', 'type': 'single', 'label': 'Content type'},
        {'key': 'date', 'blocks': 'metadata', 'values': '', 'type': '', 'label': 'Date (YYYY-MM-DD)'},
        {'key': 'category', 'blocks': 'metadata', 'values': '', 'type': '', 'label': 'Category'},
        {'key': 'tags', 'blocks': 'metadata', 'values': '', 'type': '', 'label': 'Tags (comma separated)'},
        {'key': 'authors', 'blocks': 'metadata', 'values': '', 'type': '', 'label': 'Author ids (comma separated)'},
        {'key': 'disclaimer', 'blocks': 'metadata', 'values': 'Show= | Off=off', 'type': 'single', 'label': 'Taiwan disclaimer'},
    ]
    editor = [{'block': n, 'property': 'multi'} for n in ('cards', 'carousel', 'timeline', 'social', 'blueprint') if n in found]
    blocks_json = {
        ':names': ['blocks', 'options', 'editor'], ':version': 3, ':type': 'multi-sheet',
        'blocks': {'total': len(rows), 'offset': 0, 'limit': len(rows), 'data': rows},
        'options': {'total': len(options), 'offset': 0, 'limit': len(options), 'data': options},
        'editor': {'total': len(editor), 'offset': 0, 'limit': len(editor), 'data': editor},
    }
    (root / 'library').mkdir(parents=True, exist_ok=True)
    (root / 'library/blocks.json').write_text(json.dumps(blocks_json, indent=2) + '\n')

    icons = sorted(p.stem for p in (REPO / 'icons').glob('*.svg'))
    icon_rows = [{'key': f':{i}:', 'value': i, 'icon': f'{CODE}/icons/{i}.svg'} for i in icons]
    (root / 'library/icons.json').write_text(json.dumps(
        {':type': 'sheet', 'total': len(icon_rows), 'offset': 0, 'limit': len(icon_rows), 'data': icon_rows}, indent=2) + '\n')

    templates = {'Landing page': 'capabilities/fixed-income.html', 'Article': None, 'Press release': None, 'Legal page': 'important-information.html'}
    # articles / press releases: first doc whose metadata Template/Type matches
    for rel, soup in docs(root):
        meta = {r.select_one('div').get_text(strip=True).lower(): r.select('div')[-1].get_text(strip=True)
                for r in soup.select('.metadata > div') if r.select('div')}
        if templates['Article'] is None and meta.get('template') == 'article':
            templates['Article'] = rel
        if templates['Press release'] is None and meta.get('type') in ('press', 'press-release'):
            templates['Press release'] = rel
    template_rows = []
    for title, rel in templates.items():
        if not rel or not (root / rel).exists():
            continue
        slug = title.lower().replace(' ', '-')
        src = BeautifulSoup((root / rel).read_text(), 'html.parser').select_one('main')
        write_doc(root, f'library/templates/{slug}.html', src.decode_contents())
        template_rows.append({'key': title, 'value': f'{DA}/library/templates/{slug}'})
    (root / 'library/templates.json').write_text(json.dumps(
        {':type': 'sheet', 'total': len(template_rows), 'offset': 0, 'limit': len(template_rows), 'data': template_rows}, indent=2) + '\n')

    # No Placeholders row: /placeholders holds UI labels read by code (Key/Text), not `{{key}}`
    # content tokens; da-live would insert tokens this site never substitutes.
    library_rows = [
        {'title': 'Blocks', 'path': f'{DA}/library/blocks.json', 'format': '', 'icon': '', 'experience': '', 'ref': ''},
        {'title': 'Templates', 'path': f'{DA}/library/templates.json', 'format': '', 'icon': '', 'experience': '', 'ref': ''},
        {'title': 'Icons', 'path': f'{DA}/library/icons.json', 'format': ':<content>:', 'icon': '', 'experience': '', 'ref': ''},
    ]
    # input for `da site config set --set-sheet library=…`; kept out of the uploaded content tree
    (CAPTURES / 'config-library.json').write_text(json.dumps(library_rows, indent=2) + '\n')
    print(f'{len(rows)} blocks, {len(options)} options, {len(icon_rows)} icons, {len(template_rows)} templates')


if __name__ == '__main__':
    main()
