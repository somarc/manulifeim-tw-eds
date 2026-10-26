#!/usr/bin/env python3
"""Discovery importer: viewpoint articles, press releases, listings, search, legal pages, sheets.

Reads browser captures under CAPTURES/pages (and CAPTURES/pages/data for the API pulls made in
the Studio browser: case-studies.json, viewpoints-filters.json, press-releases-all.json) and
writes DA documents into the da-cli content root. Nothing is uploaded here; see
docs/blocks/discovery.md for the reviewed `da content put` / `da preview` sequence.

Every article/press page carries the full Metadata contract used by build-index.py:
Title, Description, Image, Date (YYYY-MM-DD), Category, Tags, Authors (ids), Template, Type.

Usage:  python3 tools/importer/articles.py [--only <path-substring>] [--draft-index]
"""
import argparse
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

from common import (CAPTURES, ORIGIN, BeautifulSoup, block, clean, content_root, esc, image,
                    load, media, page, section, text, write)
from common import site_path as _site_path


def site_path(href):
    """common.site_path + EDS resource-name normalisation: the delivery tier collapses repeated
    hyphens ('credit--relative' is served as 'credit-relative'), so relative links must too."""
    out = _site_path(href)
    if out.startswith('/'):
        path, sep, rest = out.partition('?') if '?' in out else out.partition('#')
        out = re.sub(r'-{2,}', '-', path) + sep + rest
    return out

PAGES = CAPTURES / 'pages'
DATA = PAGES / 'data'
TW = ORIGIN + '/institutional/tw/en'

ARTICLES = {
    'viewpoint-understanding-asset-based-finance':
        '/viewpoints/private-credit/understanding-asset-based-finance',
    'viewpoint-real-estate-credit-relative-value':
        '/viewpoints/private-markets/real-estate-credit-relative-value-opportunities-can-reward-disc',
    'viewpoint-real-estate-credit-strategies':
        '/viewpoints/private-markets/real-estate-credit-strategies-targeted-solutions-for-a-shifting',
}
PRESS = {
    'press-release-comvest-record-fund-raise':
        '/about-us/press-releases/manulife-comvest-credit-partners-announces-record-fund-raise-of-5-4-billion',
    'press-release-schroders-indonesia':
        '/about-us/press-releases/manulife-wealth-and-asset-management-completes-acquisition-of-schroders-indonesia',
    'press-release-landg-strategic-partnership':
        '/about-us/press-releases/landg-and-manulife-wealth-and-asset-management-announce-strategic-global-partnership',
    'press-release-portland-general-electric':
        '/about-us/press-releases/portland-general-electric-announces-acquisition-of-washington-state-utility-operations-and-select-assets-from-pacificorp',
}
PRESS_TABS = {'press-releases': 'Press releases', 'archive': 'Archive', 'other': 'Other'}
FRAGMENT_TAGS = '/viewpoints/fragments/all-tags'
# authoring test pages listed by the source's press archive; not migrated content
TEST_RELEASE = re.compile(r'^Test release$|PRACTICE$')
BRIGHTCOVE = 'https://players.brightcove.net/{account}/{player}_default/index.html?videoId={video}'


def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', (value or '').lower()).strip('-')


def iso(date_text):
    """'October 23, 2026' -> '2026-10-23' ('' stays '')."""
    if not (date_text or '').strip():
        return ''
    return datetime.strptime(' '.join(date_text.split()), '%B %d, %Y').strftime('%Y-%m-%d')


def capture_json(slug_name):
    return json.loads((PAGES / f'{slug_name}.json').read_text())


SVG_LIMIT = 40 * 1024  # the EDS content bus rejects larger SVGs (preview answers 409)


def small_svgs(html_doc):
    """Point oversized SVG charts at their svgo-minified '-min.svg' twins (same drawing)."""
    media_dir = content_root() / 'media'

    def swap(match):
        name = match.group(1)
        original, minified = media_dir / f'{name}.svg', media_dir / f'{name}-min.svg'
        if original.exists() and original.stat().st_size > SVG_LIMIT:
            if not minified.exists():
                print(f'  ! {original.name} exceeds {SVG_LIMIT} bytes and has no -min.svg twin')
                return match.group(0)
            return f'/media/{name}-min.svg'
        return match.group(0)
    return re.sub(r'/media/([\w.-]+?)\.svg', swap, html_doc)


def tidy(html_doc):
    """Drop empty inline wrappers the source CMS leaves behind (<strong></strong>, <sup> </sup>)."""
    html_doc = small_svgs(html_doc)
    for _ in range(2):
        html_doc = re.sub(r'<(strong|em|sup|sub|u)>(\s|&nbsp;|\xa0)*</\1>', r'\2' if False else ' ', html_doc)
    return re.sub(r' +(</p>)', r'\1', html_doc)


def fragment_link(path):
    return f'<p><a href="{path}">{path}</a></p>'


def p(html_inner):
    return f'<p>{html_inner}</p>'


def strip_title(title):
    return re.sub(r'\s*\|\s*Manulife Investment Management\s*$', '', title or '').strip()


def mapped_or_absolute(src):
    """Sheet cell value for an image: /media path when uploaded, else the absolute source URL."""
    if not src:
        return ''
    found = media(src)
    if found:
        return found
    absolute = ORIGIN + src if src.startswith('/') else src
    UNMAPPED.add(absolute)
    return absolute


UNMAPPED = set()
# --draft-pages: write test copies under /drafts/discovery whose listing blocks read the draft
# index through a `Source Index` config row (the canonical pages always use the site index)
DRAFT = {'on': False}
DRAFT_INDEX = '/drafts/discovery/content-index.json'


def index_rows():
    return [[p('Source Index'), p(DRAFT_INDEX)]] if DRAFT['on'] else []


def out(path):
    return f'/drafts/discovery{path}' if DRAFT['on'] else path


# ---------------------------------------------------------------------------- data (API pulls)

def filters():
    return json.loads((DATA / 'viewpoints-filters.json').read_text())


def author_id(api_author):
    return slug(api_author['id'].rstrip('/').split('/')[-1])


def asset_manager_logos():
    """Asset-manager name -> (logo src, listing link) from the filters API."""
    out = {}
    for am in filters()['assetManagers']:
        out.setdefault(am['title'].strip(), (am['imagePath'], am['link']))
    return out


def authors_sheet():
    """All viewpoint authors (220) so browse-by, cards and the sidebar resolve ids to people."""
    logos = asset_manager_logos()
    rows = []
    # the API lists some people twice (regional + global profile): keep the most recent post
    latest = {}
    for a in filters()['authors']:
        aid = author_id(a)
        if aid not in latest or (a.get('lastPosted') or 0) > (latest[aid].get('lastPosted') or 0):
            latest[aid] = a
    for a in latest.values():
        aid = author_id(a)
        company = (a.get('assetManager') or '').strip()
        name = (a.get('name') or a.get('title') or '').strip().rstrip(',')
        position = (a.get('position') or '').strip()
        # the API concatenates company into some positions; keep the source text otherwise
        bio = BeautifulSoup(a.get('biography') or '', 'html.parser').get_text(' ', strip=True)
        posted = a.get('lastPosted')
        rows.append({
            'id': aid,
            'name': name,
            'position': position,
            'company': company,
            'photo': mapped_or_absolute(a.get('imagePath')),
            'bio': ' '.join(bio.split()),
            'link': f'/viewpoints/{aid}',
            'logo': mapped_or_absolute(logos.get(company, ('', ''))[0]),
            'posted': datetime.fromtimestamp(posted / 1000, timezone.utc).strftime('%Y-%m-%d') if posted else '',
            'articles': str(a.get('viewpointsCount') or '0'),
            '_sort': (a.get('title') or name).lower(),
        })
    # the source's alphabetical order: raw API titles, case-insensitive (" Manulife Investment
    # Management" has a leading space and so leads the list); browse-by keeps this sheet order
    rows.sort(key=lambda r: r.pop('_sort'))
    return rows


def case_studies_sheet():
    """62 case studies in the API's default ("Newest") order; links go to the original detail page."""
    rows = []
    for i, item in enumerate(json.loads((DATA / 'case-studies.json').read_text())):
        path = re.sub(r'\.html$', '', item['pagePath'].replace('/content/mim-institutional/tw/en', ''))
        tags = []
        for tag in item['tags']:
            title = tag['title'].strip()
            if title not in tags:
                tags.append(title)
        rows.append({
            'title': item['title'].strip(),
            'tags': ', '.join(tags),
            'image': mapped_or_absolute(item.get('imagePath')),
            'alt': (item.get('alt') or '').strip(),
            'link': TW + path,
            'order': str(i + 1),
        })
    return rows


def sheet(rows):
    return {':type': 'sheet', 'total': len(rows), 'offset': 0, 'limit': len(rows), 'data': rows}


def write_sheet(path, rows):
    target = content_root() / (path.lstrip('/') + '.json')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(sheet(rows), indent=2, ensure_ascii=False) + '\n')
    print(f'wrote {target} ({len(rows)} rows)')
    return target


# ---------------------------------------------------------------------------- articles

def promo_banner(banner, variant='navy'):
    """simpleBanner -> Promo Banner (<colour>): [H2, p…, link] [image]."""
    item = banner.select_one('.simpleBanner__item')
    colour = next((c.split('--')[1] for c in item.get('class', []) if '--' in c), variant)
    title = banner.select_one('.simpleBanner__title')
    title_html = clean(title)
    title_html = re.sub(r'</p>\s*<p>', '<br>', title_html)
    title_html = re.sub(r'^<p>|</p>$', '', title_html)
    parts = [f'<h2>{title_html}</h2>']
    sub = banner.select_one('.simpleBanner__subtitle')
    if sub:
        parts.append(clean(sub))
    a = banner.select_one('.simpleBanner__link')
    if a:
        href = a.get('href')
        if item.get('data-videomodal'):
            href = BRIGHTCOVE.format(account=item.get('data-brightcoveid'), player=item.get('data-playerid'),
                                     video=item.get('data-videomodal'))
        parts.append(p(f'<a href="{esc(site_path(href))}">{esc(text(a))}</a>'))
    img = banner.select_one('.simpleBanner__image img')
    cells = [''.join(parts)]
    if img:
        cells.append(image(img.get('src'), img.get('alt', '')))
    return block(f'promo-banner {colour}', [cells])


def landing_image(node):
    """landingImage2 (chart card) -> default content: title paragraph, picture, source caption."""
    out = []
    content = node.select_one('.landingImage2__content')
    if content and text(content):
        out.append(clean(content))
    img = node.select_one('img')
    if img:
        out.append(image(img.get('src'), img.get('alt', '')))
    cap = node.select_one('figcaption')
    if cap and text(cap):
        out.append(p(f'<em>{clean(cap)}</em>'))
    return ''.join(out)


def disclosure(node):
    label = text(node.select_one('.disc__label'))
    body = clean(node.select_one('.disc__content'))
    return block('disclosure collapsible', [[p(esc(label)), body]])


def fine_print(node):
    """True when the node's text is all <small> (the source's fine print). <small> does not
    survive DA -> aem.page, so fine print becomes its own section with Style `fine-print`."""
    smalls = node.select('small')
    return bool(smalls) and len(' '.join(text(s) for s in smalls)) >= len(text(node)) - 2


def article_body(content):
    """viewpoint-content children -> list of (kind, html). kind: 'default' | 'block' | 'fine'."""
    out = []
    for child in content.find_all(recursive=False):
        classes = child.get('class') or []
        if fine_print(child):
            html_part = clean(child).strip()
            out.append(('fine', html_part if html_part.startswith('<p') else p(html_part)))
        elif 'disclosures' in classes:
            for disc in child.select('details.disc'):
                out.append(('block', disclosure(disc)))
        elif child.select_one('.simpleBanner'):
            out.append(('block', promo_banner(child.select_one('.simpleBanner'))))
        elif 'landingImage2' in classes:
            out.append(('default', landing_image(child)))
        elif 'image' in classes:
            img = child.select_one('img')
            if img:
                out.append(('default', image(img.get('src'), img.get('alt', ''))))
        else:
            html_part = clean(child)
            if html_part:
                out.append(('default', html_part))
    return out


def related_block(soup):
    """Curated 'Related viewpoints' -> Article Cards (related) with one link row per article."""
    rel = soup.select('.related-viewpoints .article-kicker__title-link')
    if not rel:
        return ''
    rows = [[p(f'<a href="{esc(site_path(a.get("href")))}">{esc(text(a))}</a>')] for a in rel]
    return f'<h2>Related viewpoints</h2>{block("article-cards related", rows)}'


def import_article(slug_name, path):
    soup = load(f'pages/{slug_name}.main.html')
    cap = capture_json(slug_name)
    header = soup.select_one('.viewpoint-detail__header')
    date = header.select_one('time').get('datetime')
    h1 = text(header.select_one('h1'))
    summary = text(header.select_one('.viewpoint-detail__summary'))
    side = soup.select_one('.viewpoint-detail__sidebar')
    authors = [slug(urlsplit(a.get('href')).path.rstrip('/').split('/')[-1])
               for a in side.select('.author-container__link')]
    lists = {text(s.select_one('.viewpoint-links__title')): [text(a) for a in s.select('a')]
             for s in side.select('.viewpoint-links')}
    body = article_body(soup.select_one('.viewpoint-content'))

    # sections: header | body (blocks inline, default content between; fine print in its own
    # `fine-print` section) | related + tags footer
    groups = []
    for kind, html_part in body:
        fine = kind == 'fine'
        if groups and groups[-1][0] == fine:
            groups[-1][1].append(html_part)
        else:
            groups.append((fine, [html_part]))
    sections = [
        section(f'<h1>{esc(h1)}</h1>', p(esc(summary))),
        *[section(''.join(parts), style='fine-print' if fine else None) for fine, parts in groups],
        section(related_block(soup)) if soup.select('.related-viewpoints .article-kicker') else '',
        section(fragment_link(FRAGMENT_TAGS)),
    ]
    og = cap['meta'].get('og:image') or cap.get('ogImage')
    meta = {
        'Title': h1,
        'Description': summary,
        'Image': image(urlsplit(og).path, '') if og else '',
        'Date': date,
        'Category': ', '.join(lists.get('Category', [])),
        'Tags': ', '.join(lists.get('Tags', [])),
        'Authors': ', '.join(authors),
        'Template': 'article',
        'Type': 'article',
    }
    return write(path, tidy(page(sections, meta)))


# ---------------------------------------------------------------------------- press releases

def press_category_of(path):
    data = json.loads((DATA / 'press-releases-all.json').read_text())
    for key, items in data.items():
        for item in items:
            if site_path(item['h']) == path:
                return PRESS_TABS[key]
    return PRESS_TABS['press-releases']


def import_press(slug_name, path):
    soup = load(f'pages/{slug_name}.main.html')
    cap = capture_json(slug_name)
    root = soup.select_one('.component-root')
    date = iso(text(root.select_one('time')))
    h1 = text(root.select_one('.title h1'))
    # each source column container is its own padded band: wide (fw-12) body text, then one
    # `narrow` section per fw-8 column ("About …", fine print, media contact)
    wide, narrow = [], []
    for container in root.select(':scope > .column-container'):
        col = container.select_one('.column-container__column')
        if not col or not text(col):
            continue
        html_part = clean(col)
        # "About …" headings are bold spans in the source: keep them as plain H3 text
        html_part = re.sub(r'<h3><strong>(.*?)</strong></h3>', r'<h3>\1</h3>', html_part)
        if 'column-container__column--fw-12' in col.get('class', []):
            wide.append(html_part)
        else:
            narrow.append(section(html_part, style='narrow, fine-print' if fine_print(col) else 'narrow'))
    description = cap.get('description') or ''
    if not description.strip():
        first = root.select_one('.text p:not(:has(em))') or root.select_one('.text p')
        description = text(first)
    description = ' '.join(description.split())[:300]
    sections = [
        section(f'<h1>{esc(h1)}</h1>'),
        section(''.join(wide)) if wide else '',
        *narrow,
    ]
    meta = {
        'Title': h1,
        'Description': description,
        'Date': date,
        'Category': press_category_of(path),
        'Template': 'article',
        'Type': 'press',
    }
    return write(path, tidy(page(sections, meta)))


# ---------------------------------------------------------------------------- listings & hubs

def tag_fragment():
    soup = load('pages/viewpoint-understanding-asset-based-finance.main.html')
    links = []
    for a in soup.select('.viewpoint-tags__link'):
        tag_id = urlsplit(a.get('href')).path.rstrip('/').split('/')[-1]
        links.append(f'<li><a href="/viewpoints/all?tags={esc(tag_id)}">{esc(text(a))}</a></li>')
    rows = [[f'<h2>{esc(text(soup.select_one(".viewpoint-tags__title")))}</h2>'],
            [f'<ul>{"".join(links)}</ul>']]
    return write(FRAGMENT_TAGS, page([section(block('tag-cloud', rows))]))


def import_viewpoints_hub():
    soup = load('pages/viewpoints.main.html')
    cap = capture_json('viewpoints')
    icon = soup.select_one('.heroHeader2__icon')
    hero = block('hero page-header', [[p(image(icon.get('src'), '')) + '<h1>Viewpoints</h1>']])

    more = soup.select_one('.more-insights')
    more_links = ''.join(f'<li><a href="{esc(site_path(a.get("href")))}">{esc(text(a))}</a></li>'
                         for a in more.select('a'))
    more_block = block('tag-cloud inline', [[f'<h2>{esc(text(more.select_one("h2")))}</h2>'],
                                            [f'<ul>{more_links}</ul>']])

    fk = soup.select_one('.featureKicker')
    fk_link = fk.select_one('.featureKicker__link')
    fk_img = fk.select_one('.featureKicker__image img')
    fk_authors = []
    by_name = {a['name'].strip().rstrip(','): author_id(a) for a in filters()['authors']}
    for person in fk.select('.author-container'):
        name = text(person.select_one('.author-container__text--name')).rstrip(',')
        fk_authors.append(by_name.get(name, slug(name)))
    feature = block('article-cards feature', [
        [image(fk_img.get('src'), fk_img.get('alt', '')),
         f'<h2><a href="{esc(site_path(fk_link.get("href")))}">{esc(text(fk.select_one(".featureKicker__title")))}</a></h2>'
         + p(esc(text(fk.select_one('.featureKicker__subtitle'))))],
        [p('Authors'), p(esc(', '.join(fk_authors)))],
    ])

    bb = soup.select_one('.browseBar')
    cats = ''.join(f'<li><a href="/viewpoints/all?category={slug(text(a))}">{esc(text(a))}</a></li>'
                   for a in bb.select('.browseBar__tabContent--categories a.browseBar__link'))
    tags = ''.join(
        f'<li><a href="/viewpoints/all?tags={urlsplit(a.get("href")).path.rstrip("/").split("/")[-1]}">{esc(text(a))}</a></li>'
        for a in bb.select('.browseBar__tabContent--tags a.browseBar__link'))
    browse = block('browse-by', [
        [p('Authors'), p('<a href="/data/authors.json">/data/authors.json</a>')],
        [p('Categories'), f'<ul>{cats}</ul>'],
        [p('Tags'), f'<ul>{tags}</ul>'],
    ])

    latest_title = '<h2>Latest <em>viewpoints</em></h2>' + p('<a href="/viewpoints/all">All viewpoints</a>')
    latest = block('article-cards list toggle', [[p('Source'), p('/viewpoints/')], [p('Limit'), p('5')],
                                                 *index_rows()])
    promo = promo_banner(soup.select_one('.simpleBanner'))
    sections = [
        section(hero),
        section(more_block),
        section(feature),
        section(browse),
        section(latest_title, latest, style='title-row, display'),
        section(promo),
        section(fragment_link(FRAGMENT_TAGS)),
    ]
    meta = {'Title': strip_title(cap['title']), 'Description': cap.get('description', '')}
    return write(out('/viewpoints'), page(sections, meta))


def import_viewpoints_all():
    cap = capture_json('viewpoints-all')
    listing = block('viewpoint-list', [['<h1>Viewpoints</h1>'], [p('Source'), p('/viewpoints/')],
                                       *index_rows()])
    sections = [section(listing)]
    meta = {'Title': 'Viewpoints and market insight',
            'Description': 'Browse all viewpoints by author, asset manager, category or tag.'}
    meta['Title'] = strip_title(cap['title']) or meta['Title']
    return write(out('/viewpoints/all'), page(sections, meta))


def import_press_listing():
    soup = load('pages/press-releases.main.html')
    cap = capture_json('press-releases')
    hdr = soup.select_one('.heroHeader__content')
    hero = block('hero page-header', [[f'<h1>{esc(text(hdr.select_one("h1")))}</h1>'
                                       + p(esc(text(hdr.select_one(".heroHeader__subtitle"))))]])
    side = soup.select_one('.pressSidebar')
    contact = (f'<h3>{esc(text(side.select_one(".pressSidebar__title")))}</h3>'
               + p(esc(text(side.select_one('.pressSidebar__subtitle')))))
    for info in side.select('.pressSidebar__info')[1:]:
        a = info.select_one('a')
        contact += (f'<h4>{esc(text(info.select_one("h4")))}</h4>'
                    + p(f'<a href="{esc(a.get("href"))}">{esc(text(a))}</a>'))
    rows = [[p('Contact'), contact],
            [p('Tabs'), p(', '.join(PRESS_TABS.values()))], *index_rows()]
    # releases that are not migrated yet stay listed (dated, absolute link to the source)
    migrated = set(PRESS.values())
    data = json.loads((DATA / 'press-releases-all.json').read_text())
    for key, items in data.items():
        for item in items:
            if site_path(item['h']) in migrated or TEST_RELEASE.search(item['t']):
                continue
            rows.append([p(iso(item['d'])), p(f'<a href="{esc(item["h"])}">{esc(item["t"])}</a>'),
                         p(PRESS_TABS[key])])
    listing = block('press-list', rows)
    meta = {'Title': strip_title(cap['title']).replace(' | Institutional', ''),
            'Description': cap.get('description', '')}
    return write(out('/about-us/press-releases'), page([section(hero), section(listing)], meta))


def import_case_studies():
    soup = load('pages/sustainable-investing-case-studies.main.html')
    cap = capture_json('sustainable-investing-case-studies')
    hdr = soup.select_one('.heroHeader2__content')
    cta = hdr.select_one('.heroHeader2__cta')
    hero = block('hero page-header', [[
        f'<h1>{esc(text(hdr.select_one("h1")))}</h1>'
        + p(esc(text(hdr.select_one('.heroHeader2__subtitle'))))
        + p(f'<a href="{esc(site_path(cta.get("href")))}">{esc(text(cta))}</a>')]])
    listing = block('case-study-list', [[p('Source'), p('/data/case-studies.json')]])
    meta = {'Title': strip_title(cap['title']), 'Description': cap.get('description', '')}
    # the source listing sits on white, continuing the header band
    return write('/sustainable-investing-case-studies',
                 page([section(hero), section(listing, style='white')], meta))


def import_search():
    listing = block('search', [['<h1>Search</h1>'], *index_rows()])
    meta = {'Title': 'Search', 'Description': 'Search viewpoints, press releases and pages.'}
    return write(out('/search'), page([section(listing)], meta))


def import_legal():
    soup = load('pages/important-information.main.html')
    cap = capture_json('important-information')
    body = clean(soup.select_one('.text'))
    # the source's page title is an empty-anchor H2; it is the page's only heading -> H1
    body = re.sub(r'^<h2>(.*?)</h2>',
                  lambda m: '<h1><strong>' + re.sub(r'</?(a|strong)>', '', m.group(1)).strip() + '</strong></h1>',
                  body, count=1, flags=re.S)
    body = re.sub(r'<strong>\s*</strong>', ' ', body)
    # legal pages use the article template's `legal` type (reading measure, title band, plain links)
    legal = {'Template': 'article', 'Type': 'legal'}
    write('/important-information', tidy(page([section(body, style='narrow-center')],
                                         {'Title': strip_title(cap['title']),
                                          'Description': cap.get('description', ''), **legal})))
    soup = load('pages/accessibility.main.html')
    cap = capture_json('accessibility')
    title = text(soup.select_one('.richtitle__text'))
    body = clean(soup.select_one('.text'))
    return write('/accessibility', page([section(f'<h1>{esc(title)}</h1>'), section(body)],
                                        {'Title': strip_title(cap['title']).replace(' | Institutional', ''),
                                         'Description': cap.get('description', ''), **legal}))


# ---------------------------------------------------------------------------- draft index

def preview_og_image(path):
    """og:image path of the previewed page, as build-index.py records it."""
    import urllib.request  # pylint: disable=import-outside-toplevel
    url = f'https://main--manulifeim-tw-eds--somarc.aem.page{path}'
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            doc = BeautifulSoup(resp.read().decode('utf-8', 'replace'), 'html.parser')
    except Exception:  # pylint: disable=broad-except
        return ''
    og = doc.select_one('meta[property="og:image"]')
    if not og:
        return ''
    parts = urlsplit(og.get('content', ''))
    return parts.path + (f'?{parts.query}' if parts.query else '')


def draft_index():
    """Temporary /drafts/discovery/content-index (same columns as /data/content-index) for testing."""
    rows = []
    for slug_name, path in {**ARTICLES, **PRESS}.items():
        doc = BeautifulSoup((content_root() / (path.lstrip('/') + '.html')).read_text(), 'html.parser')
        meta = {}
        for row in doc.select('div.metadata > div'):
            cells = row.find_all('div', recursive=False)
            key = text(cells[0]).lower()
            img = cells[1].select_one('img')
            meta[key] = img.get('src') if img else text(cells[1])
        rows.append({'path': path, 'title': meta.get('title', ''), 'description': meta.get('description', ''),
                     'image': preview_og_image(path), 'date': meta.get('date', ''),
                     'category': meta.get('category', ''), 'tags': meta.get('tags', ''),
                     'authors': meta.get('authors', ''), 'template': meta.get('template', ''),
                     'type': meta.get('type', ''), 'lastModified': ''})
    rows.sort(key=lambda r: r['date'], reverse=True)
    return write_sheet('/drafts/discovery/content-index', rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', default='')
    parser.add_argument('--draft-index', action='store_true')
    parser.add_argument('--draft-pages', action='store_true',
                        help='write /drafts/discovery copies of the listing pages wired to the draft index')
    args = parser.parse_args()
    if args.draft_pages:
        DRAFT['on'] = True
        for job in (import_viewpoints_hub, import_viewpoints_all, import_press_listing, import_search):
            job()
        return
    jobs = [(path, lambda s=s, pth=path: import_article(s, pth)) for s, path in ARTICLES.items()]
    jobs += [(path, lambda s=s, pth=path: import_press(s, pth)) for s, path in PRESS.items()]
    jobs += [(FRAGMENT_TAGS, tag_fragment), ('/viewpoints', import_viewpoints_hub),
             ('/viewpoints/all', import_viewpoints_all), ('/about-us/press-releases', import_press_listing),
             ('/sustainable-investing-case-studies', import_case_studies), ('/search', import_search),
             ('/important-information', import_legal),
             ('/data/authors', lambda: write_sheet('/data/authors', authors_sheet())),
             ('/data/case-studies', lambda: write_sheet('/data/case-studies', case_studies_sheet()))]
    for path, job in jobs:
        if args.only and args.only not in path:
            continue
        job()
    if args.draft_index:
        draft_index()
    if UNMAPPED:
        print(f'\n{len(UNMAPPED)} sheet image(s) left absolute (not in media manifest):')
        for url in sorted(UNMAPPED):
            print('  ', url)


if __name__ == '__main__':
    main()
