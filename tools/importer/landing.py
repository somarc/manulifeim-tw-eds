#!/usr/bin/env python3
"""Landing-page importer (archetypes A, B, J): capabilities, sustainability, stewardship report,
about us, contact us.

Reads the browser captures under CAPTURES/pages/<slug>.main.html (+ .json for title/description)
and writes DA documents into the da-cli content root (never into this checkout). One converter
per source component class; the page is walked in source order and split into sections at
`sectionBreak` anchors, colour bands, overlaps and dividers.

    python3 tools/importer/landing.py            # all pages
    python3 tools/importer/landing.py about-us   # one page (slug or path)

Then per page (see docs/CONTENT-MODEL.md): fix-sections, put (dry-run), put --commit, preview.
"""
import json
import re
import sys

from common import (CAPTURES, BeautifulSoup, Tag, block, clean, esc, heading, image, load,
                    original_url, page, section, site_path, text, write)

BRIGHTCOVE = 'https://players.brightcove.net/640445594001/1QVD66lj_default/index.html?videoId={}'

PAGES = {
    'capabilities-fixed-income': '/capabilities/fixed-income',
    'capabilities-equity': '/capabilities/equity',
    'capabilities-private-markets': '/capabilities/private-markets',
    'capabilities-multi-asset-solutions': '/capabilities/multi-asset-solutions',
    'sustainability': '/sustainability',
    'stewardship-report': '/stewardship-report',
    'about-us': '/about-us',
    'contact-us': '/contact-us',
    'capabilities': '/capabilities',
}

COLOURS = ('navy', 'green', 'purple', 'blue', 'white', 'violet', 'gold')


def classes(node):
    return node.get('class', []) if isinstance(node, Tag) else []


def mod(node, prefix):
    """BEM modifiers of `prefix` found on node or its descendants (e.g. wrap--navy → navy)."""
    found = []
    for el in [node, *node.find_all(True)]:
        for c in classes(el):
            if c.startswith(prefix + '--'):
                found.append(c[len(prefix) + 2:])
    return found


def img_src(img):
    return (img.get('src') or img.get('data-src') or '').strip() if img else ''


def pic(img):
    return image(img_src(img), img.get('alt', '') or '') if img and img_src(img) else ''


def para(inner):
    return f'<p>{inner}</p>' if inner else ''


def link_p(a, label=None, style=''):
    """Standalone link paragraph; style '' = circled-arrow CTA, 'strong' = primary button."""
    if a is None:
        return ''
    href = a.get('href', '')
    vid = a.get('data-videomodal') or (a.find_parent(attrs={'data-videomodal': True}) or {}).get('data-videomodal')
    if (not href or href == '#') and vid:
        href = BRIGHTCOVE.format(vid)
    elif href and href != '#':
        href = site_path(href)
    if not href or href == '#':
        return ''
    label = esc(label or text(a))
    inner = f'<a href="{esc(href)}">{label}</a>'
    if style:
        inner = f'<{style}>{inner}</{style}>'
    return f'<p>{inner}</p>'


def heading_html(level, node):
    """Heading from a source title node: <i>/<em> kept as <em>, wrapper <p>s flattened."""
    node = BeautifulSoup(str(node), 'html.parser').find(True)
    lines = [p for p in node.find_all('p') if text(p)]
    for p in node.find_all('p'):
        if not text(p):
            p.decompose()
        else:
            # each source <p> is its own line (e.g. a <sup> kicker over the promo title)
            if p is not lines[-1]:
                p.insert_after(BeautifulSoup('<br>', 'html.parser'))
            p.unwrap()
    for s in node.find_all('strong'):
        s.unwrap()
    inner = clean(node)
    inner = re.sub(r'(<br/?>\s*)+$', '', inner).strip()
    inner = re.sub(r'\s+', ' ', inner)
    return heading(level, inner) if text(node) else ''


def rich(node, demote=True):
    """Cleaned rich text; h1/h2 inside tiles become h3 (titles), h6 notes become paragraphs.
    Consecutive headings of one level (the source splits one title over two h2s for line
    breaks) are merged into one heading with a <br>."""
    html = clean(node)
    soup = BeautifulSoup(html, 'html.parser')
    for h in soup.find_all(['h1', 'h2', 'h3', 'h4']):
        nxt = h.find_next_sibling()
        while nxt is not None and nxt.name == h.name and h.parent is not None:
            h.append(soup.new_tag('br'))
            for c in list(nxt.contents):
                h.append(c)
            nxt.decompose()
            nxt = h.find_next_sibling()
    if demote:
        # tile titles: source h2 (32px) → h3, source h3 (24px) → h4
        for h in soup.find_all('h3'):
            h.name = 'h4'
        for h in soup.find_all(['h1', 'h2']):
            h.name = 'h3'
    for h in soup.find_all(['h5', 'h6']):
        h.name = 'p'
    for p in soup.find_all('p'):
        if not text(p) and not p.find(['picture', 'img']):
            p.decompose()
    return str(soup).strip()


# --- section accumulator ---------------------------------------------------------------------

class Doc:
    def __init__(self):
        self.sections = []
        self.new()

    def new(self, style=None, extra=None):
        cur = getattr(self, 'cur', None)
        if cur is not None and not cur['parts'] and not cur['extra'] and not cur['style']:
            cur['style'] = list(style or [])
            cur['extra'] = dict(extra or {})
            return cur
        self.cur = {'parts': [], 'style': list(style or []), 'extra': dict(extra or {})}
        self.sections.append(self.cur)
        return self.cur

    def add(self, html, style=None):
        if html:
            self.cur['parts'].append(html)
            for s in style or []:
                if s not in self.cur['style']:
                    self.cur['style'].append(s)

    def render(self):
        out = []
        for s in self.sections:
            if not s['parts']:
                continue
            out.append(section(*s['parts'], style=', '.join(s['style']) or None, extra=s['extra']))
        return out


# --- converters (one per source component class) --------------------------------------------

def hero_banner(node):
    """extendedHeroBanner2 → Hero (short | large | overlay)."""
    variants = ['short']
    if 'title--large' in ' '.join(c for el in node.find_all(True) for c in classes(el)):
        variants.append('large')
    if node.select_one('.extendedHeroBanner2__wrap--overlay'):
        variants.append('overlay')
    desk = node.select_one('.extendedHeroBanner2__image__src')
    mob = node.select_one('.extendedHeroBanner2__mobileImage')
    media = [pic(desk)]
    if mob and img_src(mob) and img_src(mob) != img_src(desk):
        media.append(pic(mob))
    content = [heading_html(1, node.select_one('.extendedHeroBanner2__title'))]
    sub = node.select_one('.extendedHeroBanner2__subtitle')
    if sub and text(sub):
        content.append(para(clean(sub)))
    for a in node.select('.extendedHeroBanner2__buttons a'):
        content.append(link_p(a, style='strong'))
    rows = [[m for m in media if m], [''.join(content)]]
    return block(f'hero ({", ".join(variants)})', [r for r in rows if r]), desk


def page_header(node):
    """heroHeader2 → Hero (page-header[, dark])."""
    banner = node.select_one('.heroHeader2__banner')
    dark = 'heroHeader2__banner--dark' in classes(banner)
    variants = ['page-header'] + (['dark'] if dark else [])
    content = []
    icon = node.select_one('.heroHeader2__icon')
    if icon:
        content.append(para(pic(icon)))
    content.append(heading_html(1, node.select_one('.heroHeader2__title')))
    sub = node.select_one('.heroHeader2__subtitle')
    if sub and text(sub):
        content.append(para(clean(sub)))
    rows = []
    bg = re.search(r'url\(["\']?([^"\')]+)', (banner.get('style') or '')) if banner else None
    # inline style urls are CSS-escaped (\2f → /)
    bg_src = re.sub(r'\\([0-9a-fA-F]{1,6})\s?', lambda m: chr(int(m.group(1), 16)), bg.group(1)) if bg else None
    if not bg_src and dark:
        bg_src = DARK_HEADER_BG.get(node.get('data-slug', ''))
    if bg_src:
        rows.append([image(bg_src, '')])
    rows.append([''.join(content)])
    return block(f'hero ({", ".join(variants)})', rows), None


DARK_HEADER_BG = {}


def anchor_nav(node):
    items = []
    for a in node.select('.landingNav__nav--onpage a.landingNav__trigger, nav a.landingNav__trigger'):
        items.append(f'<li><a href="{esc(a.get("href", ""))}">{esc(text(a))}</a></li>')
    if not items:
        return ''
    return block('anchor-nav', [[f'<ul>{"".join(items)}</ul>']])


def feature_band(node):
    wrap = node.select_one('.marketingSection__wrap')
    mods = mod(node, 'marketingSection__wrap')
    variants = [m for m in mods if m in COLOURS] or ['navy']
    variants += [m for m in mods if m in ('overlay', 'short')]
    content = []
    icon = node.select_one('.marketingSection__icon')
    if icon:
        content.append(para(pic(icon)))
    title = node.select_one('.marketingSection__title')
    if title:
        content.append(heading_html(2, title))
    for d in node.select('.marketingSection__description'):
        if text(d):
            content.append(para(clean(d)) if d.name == 'p' else rich(d, demote=False))
    for a in node.select('a.marketingSection__link'):
        content.append(link_p(a))
    row = [''.join(content)]
    img = node.select_one('.marketingSection__image__src')
    if img:
        row.append(pic(img))
    return block(f'feature-band ({", ".join(variants)})', [row]), 'overlay' in mods, wrap


def promo_items(node):
    """simpleBanner → list of (colour, row) for Promo Banner."""
    items = []
    for item in node.select('.simpleBanner__item'):
        colour = next((m for m in mod(item, 'simpleBanner__item') if m in COLOURS), 'navy')
        content = []
        title = item.select_one('.simpleBanner__title')
        if title:
            content.append(heading_html(2, title))
        sub = item.select_one('.simpleBanner__subtitle')
        if sub:
            content.append(rich(sub, demote=False))
        for a in item.select('a.simpleBanner__link'):
            if not a.get('data-videomodal') and item.get('data-videomodal'):
                a['data-videomodal'] = item['data-videomodal']
            content.append(link_p(a))
        imgs = [pic(i) for i in item.select('.simpleBanner__image img')]
        row = [''.join(content)]
        if imgs:
            row.append(''.join(imgs))
        items.append((colour, row))
    return items


def promo_block(groups):
    """groups: list of (double, [(colour, row)]) merged into one Promo Banner."""
    double = groups[0][0]
    items = [it for _, its in groups for it in its]
    colours = []
    for c, _ in items:
        if not colours or colours[-1] != c:
            colours.append(c)
    # variant classes cannot repeat; fall back to the first colour when the order repeats
    if len(set(colours)) != len(colours):
        colours = [colours[0]]
    variants = (['double'] if double else []) + colours
    rows = [r for _, r in items]
    if any(len(re.findall(r'<picture>', r[-1])) >= 4 for r in rows if len(r) > 1):
        variants.append('mosaic')
    return block(f'promo-banner ({", ".join(variants)})', rows)


def timeline(node):
    rows = []
    for li in node.select('.timeline__item'):
        rows.append([para(esc(text(li.select_one('.timeline__date')))),
                     pic(li.select_one('.timeline__image')),
                     para(clean(li.select_one('.timeline__description')))])
    return block('timeline', rows)


def image_toggle(node):
    rows = []
    buttons = node.select('.imageToggle__tabButton')
    panels = node.select('.imageToggle__imageWrapper')
    for i, b in enumerate(buttons):
        label = text(b)
        icon = b.select_one('img')
        tab = (para(pic(icon)) if icon else '') + para(esc(label))
        panel = pic(panels[i].select_one('img')) if i < len(panels) else ''
        rows.append([tab, panel] if panel else [tab])
    return block('image-toggle', rows)


def info_cards(node):
    tiles_el = node.select_one('.infoContainer__tiles')
    mods = mod(node, 'infoContainer__tiles')
    variants = []
    if 'fourColumns' in mods:
        variants.append('cols-4')
    elif 'threeColumns' not in mods and 'oneColumn' not in mods:
        variants.append('cols-2')
    rows = []
    short_tiles = True
    for tile in tiles_el.select(':scope > .infoContainer__tile'):
        cells = []
        img = tile.select_one('img.infoContainer__image')
        if img:
            cells.append(pic(img))
        body = []
        for part in tile.select(':scope > .text, :scope > div.text'):
            body.append(stat_rich(part))
        for a in tile.select('a.infoContainer__link'):
            body.append(link_p(a))
        html = ''.join(body)
        if tile.select('a') or len(text(tile)) > 60 or not tile.select_one('p'):
            short_tiles = False
        cells.append(html)
        rows.append(cells)
    if short_tiles and rows and not any(len(r) > 1 for r in rows):
        variants.insert(0, 'stats')
    else:
        variants.insert(0, 'info')
    return block(f'cards ({", ".join(variants)})', rows)


def stat_rich(part):
    """Tile rich text; an h4 stat (<strong>100%</strong><br><sup><sub>caption) → stat paragraph."""
    soup = BeautifulSoup(str(part), 'html.parser')
    for h4 in soup.find_all('h4'):
        strong = h4.find('strong')
        figure = text(strong.contents[0] if strong and strong.contents else strong) if strong else ''
        caption = text(h4.find(['sub', 'sup'])) or ''
        if not caption:
            # caption may follow the h4 as a sibling sup/sub
            nxt = h4.find_next_sibling(['sup', 'sub'])
            if nxt:
                caption = text(nxt)
                nxt.decompose()
        new = soup.new_tag('p')
        new.append(BeautifulSoup(f'<strong>{esc(figure)}</strong><br/>{esc(caption)}', 'html.parser'))
        h4.replace_with(new)
    for orphan in soup.find_all(['sup', 'sub']):
        if orphan.parent and orphan.parent.name in ('div', '[document]') and text(orphan):
            orphan.replace_with(BeautifulSoup(f'<p>{esc(text(orphan))}</p>', 'html.parser'))
    return rich(soup)


def strategy_links(node):
    table = node.select_one('table')
    cols = {}
    for tr in table.select('tr'):
        for i, td in enumerate(tr.select('td')):
            a = td.select_one('a')
            if a and text(a):
                cols.setdefault(i, []).append(f'<li><a href="{esc(site_path(a.get("href", "")))}">{esc(text(a))}</a></li>')
    items = [li for i in sorted(cols) for li in cols[i]]
    return block('cards (links)', [[f'<ul>{"".join(items)}</ul>']])


def related_articles(node, variant='related'):
    rows = []
    for art in node.select('article.article-kicker'):
        a = art.select_one('.article__link a, a.icon-link')
        title = text(art.select_one('.article__title'))
        if a and a.get('href'):
            rows.append([f'<p><a href="{esc(site_path(a["href"]))}">{esc(title or text(a))}</a></p>'])
    return block(f'article-cards ({variant})', rows) if rows else ''


def latest_news(node):
    rows = []
    for el in node.select('article'):
        date = text(el.select_one('.article__date, time'))
        title = text(el.select_one('.article__title'))
        a = el.select_one('a.icon-link, .article__link a')
        rows.append([para(esc(date)) + f'<h3>{esc(title)}</h3>' + link_p(a, 'Read more')])
    return block('cards (news)', rows)


def disclosure(node):
    label = text(node.select_one('.disc__label')) or 'Important information'
    body = node.select_one('.disc__content')
    html = clean(body)
    soup = BeautifulSoup(html, 'html.parser')
    # loose <small> runs become paragraphs
    if soup.find(True) is None or soup.find(['p', 'ul', 'ol']) is None:
        html = f'<p>{html}</p>'
    return block('disclosure (collapsible)', [[para(esc(label)), html]])


def figure(node):
    desk = node.select_one('.landingImage2__image')
    mob = node.select_one('.landingImage2__mobileImage')
    row = [pic(desk)]
    if mob and img_src(mob) != img_src(desk):
        row.append(pic(mob))
    out = block('columns (figure)', [row])
    cap = node.select_one('.landingImage2__content')
    if cap and text(cap):
        # --hideCard renders the card copy as a plain caption above the image
        if node.select_one('.landingImage2__inner--hideCard'):
            return rich(cap, demote=False) + out
        out += rich(cap, demote=False)
    return out


def feature_card(node):
    content = [heading_html(2, node.select_one('.featureKicker__title'))]
    sub = node.select_one('.featureKicker__subtitle')
    if sub:
        content.append(para(clean(sub)))
    a = node.select_one('a.featureKicker__link')
    if a:
        content.append(link_p(a))
    img = node.select_one('.featureKicker__image_path, .featureKicker__image img')
    row = [''.join(content)] + ([pic(img)] if img else [])
    return block('columns (feature-card)', [row])


def feature_banner(node):
    title = node.select_one('.featureBanner__title')
    parts = title.find_all('p') if title else []
    content = ''
    if parts:
        content = heading(2, esc(text(parts[0]))) + ''.join(para(clean(p)) for p in parts[1:] if text(p))
    desk = node.select_one('.featureBanner__image__src')
    mob = node.select_one('.featureBanner__mobileImage')
    row = [content, pic(desk)]
    if mob and img_src(mob) != img_src(desk):
        row.append(pic(mob))
    return block('columns (map)', [row])


def logos(nodes):
    rows = [[pic(n.select_one('img'))] for n in nodes if n.select_one('img')]
    return block('cards (logos)', rows)


def marketo_form(node, intro=''):
    rows = []
    if intro:
        rows.append([intro])
    for wrap in node.select('.mktoFieldWrap'):
        label_el = wrap.select_one('label.mktoLabel')
        label = text(label_el).replace('*', '').strip() if label_el else ''
        required = 'mktoRequiredField' in classes(wrap) or bool(wrap.select_one('.mktoRequired'))
        star = '* ' if required else ''
        if wrap.select_one('select'):
            opts = [text(o) for o in wrap.select('select option')]
            rows.append([para(esc(star + label)), para('select'),
                         '<ul>' + ''.join(f'<li>{esc(o)}</li>' for o in opts) + '</ul>'])
        elif wrap.select_one('textarea'):
            rows.append([para(esc(star + label)), para('textarea')])
        elif wrap.select_one('input[type=checkbox], .mktoCheckboxList'):
            rows.append([para(esc(star + label)), para('checkbox')])
        else:
            inp = wrap.select_one('input')
            kind = 'email' if inp and 'mktoEmailField' in classes(inp) else 'text'
            rows.append([para(esc(star + label)), para(kind)])
    btn = node.select_one('button.mktoButton')
    rows.append([para(esc(text(btn) or 'Submit')), para('submit')])
    variants = ' (split)' if intro else ''
    return block(f'form{variants}', rows)


# --- page walker -------------------------------------------------------------------------------

def components(root):
    """Top-level source components in order (column containers are walked in convert())."""
    yield from root.find_all(True, recursive=False)


def convert(slug):
    soup = load(f'pages/{slug}.main.html')
    meta = json.loads((CAPTURES / 'pages' / f'{slug}.json').read_text())
    root = soup.select_one('.component-root') or soup
    doc = Doc()
    og_image = None
    overlap_next = False
    pending_promos = []
    pending_logos = []

    def flush():
        if pending_promos:
            doc.add(promo_block(list(pending_promos)))
            pending_promos.clear()
        if pending_logos:
            doc.add(logos(list(pending_logos)))
            pending_logos.clear()

    def start_overlap():
        nonlocal overlap_next
        if overlap_next:
            doc.new(style=['overlap'])
            overlap_next = False

    nodes = list(components(root))
    i = 0
    while i < len(nodes):
        node = nodes[i]
        cls = classes(node)
        name = cls[0] if cls else ''
        i += 1
        if name != 'simpleBanner':
            if pending_promos:
                flush()
        if name != 'image' and pending_logos:
            flush()

        if name == 'extendedHeroBanner2':
            html, img = hero_banner(node)
            og_image = og_image or img
            doc.new()
            doc.add(html)
            if 'overlay' in html.split('</div>')[0]:
                overlap_next = 'hero'
            doc.new()
        elif name == 'heroHeader2':
            node['data-slug'] = slug
            html, _ = page_header(node)
            doc.new()
            doc.add(html)
            doc.new()
        elif name == 'innerNavigationBar':
            doc.new()
            doc.add(anchor_nav(node))
            doc.new()
        elif name == 'sectionBreak':
            target = node.select_one('[id]')
            if target:
                extra = {'Anchor': target['id']}
                doc.new(style=['overlap'] if overlap_next else None, extra=extra)
                overlap_next = False
        elif name == 'marketingSection':
            html, overlay, _ = feature_band(node)
            if doc.cur['parts']:
                doc.new()
            doc.add(html)
            # only the --overlay band is overlapped (its -96px margin); a bare
            # .overlapping-component after a plain band just sits below it
            overlap_next = overlay
            doc.new()
        elif name == 'divider':
            # a ruled break (source hr.divider__border, 96px above/below). The global
            # `divider` style draws the rule *after* its section's content, so it goes on
            # the section before the break; the content after the break starts a new one.
            before = next((sec for sec in reversed(doc.sections) if sec['parts']), None)
            if before is not None and 'divider' not in before['style']:
                before['style'].append('divider')
            doc.new()
        elif name == 'featureKicker__component-wrapper':
            if overlap_next == 'hero':
                overlap_next = False
            doc.add(feature_card(node))
        elif name == 'simpleBanner':
            start_overlap()
            double = bool(node.select_one('.simpleBanner__main--double'))
            if pending_promos and pending_promos[0][0] != double:
                flush()
            pending_promos.append((double, promo_items(node)))
        elif name == 'timeline':
            start_overlap()
            doc.add(timeline(node))
        elif name == 'imageToggle':
            start_overlap()
            doc.add(image_toggle(node))
        elif name == 'infoContainer':
            start_overlap()
            doc.add(info_cards(node))
        elif name == 'disclosures':
            start_overlap()
            doc.add(disclosure(node))
        elif name == 'landingImage2':
            start_overlap()
            doc.add(figure(node))
        elif name == 'featureBanner':
            start_overlap()
            doc.add(feature_banner(node))
        elif name == 'strategyDetailTable':
            doc.add(strategy_links(node))
        elif name in ('articleGroup', 'trending-topics2'):
            doc.add(related_articles(node, 'trending' if name == 'trending-topics2' else 'related'))
            doc.new()
        elif name == 'latest-news':
            doc.add(latest_news(node))
            doc.new()
        elif name == 'title':
            start_overlap()
            h = node.find(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
            if doc.cur['parts']:
                doc.new()
            doc.add(heading_html(2, h))
        elif name == 'richTitle':
            start_overlap()
            if doc.cur['parts']:
                doc.new()
            h = node.select_one('.richtitle__text, .richTitle__text')
            a = node.select_one('.richtitle__link a, .richTitle__link a')
            doc.add(heading_html(2, h) + link_p(a), style=['title-row', 'display'])
        elif name == 'moreInsights':
            if doc.cur['parts']:
                doc.new()
            h = node.select_one('.more-insights__title h2')
            a = node.select_one('a')
            doc.add(heading_html(2, h) + link_p(a), style=['title-row'])
        elif name == 'image':
            pending_logos.append(node)
        elif name == 'text':
            start_overlap()
            doc.add(rich(node, demote=False))
        elif name == 'marketoForm':
            doc.add(marketo_form(node))
        elif name == 'column-container':
            if not text(node) and not node.select_one('img'):
                # an empty overlapping spacer absorbs the band overlap (sustainability)
                overlap_next = False
                continue
            start_overlap()
            columns = node.select('.column-container__column')
            quarter = node.select_one('.column-container__container--quarter-width')
            if len(columns) == 2 and node.select_one('.marketoForm'):
                # private markets: intro copy left, form right
                left, right = columns
                intro = ''.join(heading_html(2, h) for h in left.select('.title h1, .title h2, .title h3')) \
                    + ''.join(rich(t, demote=False) for t in left.select('.text'))
                if doc.cur['parts']:
                    doc.new(extra=doc.cur['extra'])
                doc.add(marketo_form(right.select_one('.marketoForm'), intro))
                continue
            per_col = [[c for c in col.find_all(True, recursive=False) if 'image' in classes(c)] for col in columns]
            if len(columns) > 1 and all(per_col) and all(
                    len(pc) == len(col.find_all(True, recursive=False)) for pc, col in zip(per_col, columns)):
                # a logo wall laid out column by column: author it row by row as seen
                depth = max(len(pc) for pc in per_col)
                pending_logos.extend(pc[r] for r in range(depth) for pc in per_col if r < len(pc))
                continue
            comps = [c for col in columns for c in col.find_all(True, recursive=False)]
            if comps and all(classes(c)[:1] == ['text'] for c in comps) \
                    and not node.find(['h1', 'h2', 'h3', 'h4', 'h5']) \
                    and doc.cur['parts'] and doc.cur['parts'][-1].startswith('<div class="'):
                # a fine-print-only container after a block (fixed-income "For illustrative
                # purposes only."): its own 32px-padded component on the source (64px from the
                # block above), so its own section
                doc.new()
            if quarter and node.select_one('.marketoForm'):
                # contact form: title + form in the source's centred 8-column measure
                if doc.cur['parts']:
                    doc.new(extra=doc.cur['extra'])
                doc.cur['style'].append('narrow-center')
            for col in columns:
                for comp in col.find_all(True, recursive=False):
                    cname = classes(comp)[0] if classes(comp) else ''
                    if cname == 'text':
                        html = rich(comp, demote=False)
                        if quarter and not comp.find_parent(class_='marketoForm'):
                            doc.add(html, style=['intro'] if not col.select_one('.marketoForm') else [])
                        else:
                            doc.add(html)
                    elif cname == 'title':
                        h = comp.find(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
                        doc.add(heading_html(2, h))
                    elif cname == 'disclosures':
                        doc.add(disclosure(comp))
                    elif cname == 'marketoForm':
                        doc.add(marketo_form(comp))
                    elif cname == 'simpleBanner':
                        doc.add(promo_block([(False, promo_items(comp))]))
                    elif cname == 'image':
                        pending_logos.append(comp)
                    if cname != 'image' and pending_logos:
                        flush()
        else:
            if text(node):
                print(f'  ? {slug}: unhandled component {name!r}')
    flush()
    return doc, meta, og_image


def stewardship_quote(doc):
    """The stewardship CEO quote is a centred icon + H2 + attribution: author it as Quote."""
    for s in doc.sections:
        for k, part in enumerate(s['parts']):
            if 'stewardship is' in part and '<h2>' in part and 'Lorentz' in part:
                soup = BeautifulSoup(part, 'html.parser')
                icon = soup.find('p') if soup.find('p') and soup.find('p').find('picture') else None
                h2 = soup.find('h2')
                attribution = [p for p in soup.find_all('p') if 'Lorentz' in text(p)]
                first = (str(icon) if icon else '') + str(h2)
                s['parts'][k] = block('quote', [[first], [str(attribution[0]) if attribution else '']])
                s['style'] = [x for x in s['style'] if x != 'intro']


def capabilities_hub(doc):
    """B archetype: the source hub is only an icon + H1; add the five capability tiles (the
    homepage's own tiles) so the page is useful. Authored addition — see docs/blocks/landing.md."""
    tiles = [
        ('Fixed income', 'Capabilities spanning the credit spectrum in both regionally focused and global portfolios', '/capabilities/fixed-income'),
        ('Alpha-focused equity', 'Differentiated strategies pursuing specialized and durable sources of alpha', '/capabilities/equity'),
        ('Private markets', 'Decades of experience investing in private markets, including natural capital, real assets, and private equity and credit', '/capabilities/private-markets'),
        ('Multi-asset solutions', 'Over 30 years of experience in delivering active and strategic asset allocation solutions', '/capabilities/multi-asset-solutions'),
        ('Alternative credit', 'Managed by Manulife | CQS Investment Management, which has more than 20 years of experience in managing research-driven alternative credit strategies across the liquid and semi-liquid spectrum', 'https://www.manulifeim.com/institutional/global/en/capabilities/cqs'),
    ]
    rows = [[f'<h3>{esc(t)}</h3><p>{esc(d)}</p><p><a href="{esc(h)}">Learn more</a></p>'] for t, d, h in tiles]
    doc.new(style=['spacious'])
    doc.add(block('cards (info)', rows))


def build(slug):
    path = PAGES[slug]
    print(f'{slug} → {path}')
    doc, meta, og_img = convert(slug)
    if slug == 'stewardship-report':
        stewardship_quote(doc)
    if slug == 'capabilities':
        capabilities_hub(doc)
    title = re.sub(r'\s*\|\s*Manulife Investment Management\s*$', '', meta.get('title') or '').strip()
    title = re.sub(r'\s*\|\s*Institutional\s*$', '', title)
    description = meta.get('description') or ''
    if not description:
        description = DEFAULT_DESCRIPTIONS.get(slug, '')
    if og_img is None:
        soup = load(f'pages/{slug}.main.html')
        og_img = soup.select_one('.marketingSection__image__src, .simpleBanner__image__src, img')
    md = {'Title': title, 'Description': description}
    if og_img is not None and img_src(og_img):
        md['Image'] = image(img_src(og_img), og_img.get('alt', '') or '')
    else:
        md['Image'] = image('/content/dam/mim-institutional/global/assets/landing-pages/homepage-revamp/IINV-7270-535856-1200x628-05-sust-reporting.jpg', '')
    md['Source'] = original_url(path)
    document = tidy(page(doc.render(), md), path)
    return write(path, document)


def tidy(document, path):
    """Same-page anchors, Helix-normalised internal paths, spaces outside <em>."""
    document = document.replace(f'href="{path}#', 'href="#')
    # a line break at the end of an inline run belongs after it (<strong>Name<br></strong>)
    document = re.sub(r'(<br/?>)\s*(</(?:strong|em|a)>)', r'\2\1', document)

    def norm(m):
        href = m.group(1)
        if not href.startswith('/') or href.startswith('/media/'):
            return m.group(0)
        p, sep, rest = href.partition('#')
        p, qsep, q = p.partition('?')
        p = re.sub(r'-{2,}', '-', p.lower())
        return f'href="{p}{qsep}{q}{sep}{rest}"'
    document = re.sub(r'href="([^"]+)"', norm, document)
    document = re.sub(r'<em>(\s+)', r'\1<em>', document)
    document = re.sub(r'(\s+)</em>', r'</em>\1', document)
    # a no-break space beside the serif <em> (source `A<em>&nbsp;global</em>&nbsp;footprint`)
    # comes back from DA as `&nbsp; `, a visibly double gap: use a plain space there
    document = re.sub(r'\xa0(?=<em>)|(?<=</em>)\xa0', ' ', document)
    return document


DEFAULT_DESCRIPTIONS = {
    'stewardship-report': 'Download our stewardship report to learn how we put our sustainability beliefs into practice through engagement, proxy voting and collaboration.',
    'capabilities': 'Explore Manulife Investment Management capabilities across fixed income, equity, private markets, multi-asset solutions and alternative credit.',
}

DARK_HEADER_BG['capabilities-private-markets'] = (
    '/content/dam/mim-institutional/global/viewpoints/pm-965250-private-markets-webpage-refresh/'
    'PM-965250-Private-Markets-Webpage-Refresh_Hero-banner_2000x360.png')


if __name__ == '__main__':
    wanted = sys.argv[1:] or list(PAGES)
    for w in wanted:
        key = w if w in PAGES else next((k for k, v in PAGES.items() if v == w), None)
        if not key:
            raise SystemExit(f'unknown page {w}')
        build(key)
