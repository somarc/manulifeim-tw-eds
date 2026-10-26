#!/usr/bin/env python3
"""Shared, local-only helpers for converting captured manulifeim.com DOM into DA documents.

Inputs are browser captures under CAPTURES (Akamai blocks non-browser clients, so nothing
here fetches the source). Output goes ONLY to the da-cli operational content root returned
by `da workspace show`, never into this Git checkout. Upload/preview are separate, reviewed
da-cli operations (`da --commit --qmd content put ...`, `da --commit --qmd preview ...`).

Link policy: every manulifeim.com/institutional/tw/en/<path> link becomes site-relative
`/<path>` (unmigrated destinations fall through to the 404 page, which offers the original
URL). Other manulifeim.com links stay absolute. Media maps through media-manifest.json to
`/media/<file>`; upload with `content put --rewrite-media-urls`.
"""
import copy
import html
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

ORIGIN = 'https://www.manulifeim.com'
SITE_PREFIX = '/institutional/tw/en'
CONTENT_PREFIX = '/content/mim-institutional/tw/en'
CAPTURES = Path('/Users/mhess/aem/eds-labs/.captures/manulifeim-tw')
REPO = Path(__file__).resolve().parents[2]
MEDIA_MANIFEST = CAPTURES / 'media' / 'media-manifest.json'

# <small> is not kept by DA/aem.page (use a block variant such as Disclosure (small) instead)
SEMANTIC = {'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'strong', 'em',
            'sup', 'sub', 'br', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'td',
            'th', 'picture', 'img', 'pre', 'code', 'hr', 'u', 's'}
RENAME = {'b': 'strong', 'i': 'em'}
KEEP_ATTRS = {'href', 'src', 'alt', 'colspan', 'rowspan', 'title'}


def esc(value):
    return html.escape(str(value or ''), quote=True)


def text(node):
    return ' '.join(node.get_text(' ', strip=True).split()) if node else ''


def content_root():
    out = subprocess.run(['da', '--no-qmd', 'workspace', 'show', '--format', 'json'],
                         cwd=REPO, capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    data = data.get('data', data)
    root = Path(data['paths']['contentRoot']).resolve()
    if REPO in root.parents or root == REPO:
        raise SystemExit(f'refusing to write content inside the Git checkout: {root}')
    return root


def site_path(href):
    """Map a source href to the EDS href (relative for TW/EN, absolute otherwise)."""
    if not href:
        return ''
    href = href.strip()
    if href.startswith(('mailto:', 'tel:', '#', 'javascript:')):
        return '' if href.startswith('javascript:') else href
    absolute = urljoin(ORIGIN + SITE_PREFIX + '/', href)
    parts = urlsplit(absolute)
    if parts.netloc not in ('www.manulifeim.com', 'manulifeim.com'):
        return absolute
    path = unquote(parts.path)
    for prefix in (SITE_PREFIX, CONTENT_PREFIX):
        if path == prefix or path.startswith(prefix + '/') or path == prefix + '.html':
            rest = path[len(prefix):]
            rest = re.sub(r'\.html$', '', rest).rstrip('/')
            # EDS normalises repeated hyphens in delivered paths ("credit--relative" → "credit-relative")
            # and a path segment cannot end in "-" ("why-invest-in-farmland-")
            rest = re.sub(r'-{2,}', '-', rest)
            rest = re.sub(r'-+(?=/|$)', '', rest)
            # virtual source routes (not pages): tag listings become filtered viewpoint listings
            tag = re.fullmatch(r'/viewpoints/tag/([^/]+)', rest)
            if tag:
                return f'/viewpoints/all?tags={tag.group(1).lower()}'
            if rest in ('', '/index'):
                rest = '/'
            frag = f'#{parts.fragment}' if parts.fragment else ''
            query = f'?{parts.query}' if parts.query else ''
            return f'{rest}{query}{frag}'
    return absolute


def original_url(path):
    """The source URL for an EDS path (used in docs/receipts, never as the authored link)."""
    return ORIGIN + SITE_PREFIX + ('' if path == '/' else path)


_manifest = None


def media(src):
    """Map a source image URL to the uploaded DA media path (/media/...), or None."""
    global _manifest  # pylint: disable=global-statement
    if _manifest is None:
        _manifest = json.loads(MEDIA_MANIFEST.read_text()) if MEDIA_MANIFEST.exists() else {}
    if not src:
        return None
    key = urljoin(ORIGIN + '/', src.strip())
    path_only = urlsplit(key)._replace(query='', fragment='').geturl()
    return _manifest.get(key) or _manifest.get(path_only) or _manifest.get(urlsplit(key).path)


def image(src, alt=''):
    mapped = media(src)
    if not mapped:
        mapped = urljoin(ORIGIN + '/', src or '')
        print(f'  ! unmapped media (left absolute): {mapped}')
    return f'<picture><img src="{esc(mapped)}" alt="{esc(alt)}"></picture>'


def link(label, href):
    return f'<a href="{esc(site_path(href))}">{label}</a>'


def clean(node, keep_root=False):
    """Return semantic HTML for a source subtree: no classes, scripts, styles or wrappers."""
    if node is None:
        return ''
    node = copy.copy(node)
    for el in node.find_all(string=lambda s: isinstance(s, Comment)):
        el.extract()
    for el in node.select('script, style, noscript, button, input, select, form, svg, iframe'):
        el.decompose()
    for el in list(node.find_all(True)):
        if el.name in RENAME:
            el.name = RENAME[el.name]
        if el.name == 'img':
            src = el.get('src') or el.get('data-src') or ''
            new = BeautifulSoup(image(src, el.get('alt', '')), 'html.parser')
            el.replace_with(new)
            continue
        if el.name not in SEMANTIC:
            el.unwrap()
            continue
        el.attrs = {k: v for k, v in el.attrs.items() if k in KEEP_ATTRS}
        if el.name == 'a':
            el['href'] = site_path(el.get('href', ''))
            if not el['href']:
                el.unwrap()
    out = node.decode() if keep_root else node.decode_contents()
    out = re.sub(r'(<br/?>\s*)+(</(?:h\d|p)>)', r'\2', out)
    out = re.sub(r'(<(?:h\d|p)>)\s*(<br/?>\s*)+', r'\1', out)
    out = re.sub(r'<p>\s*(&nbsp;|\xa0)?\s*</p>', '', out)
    return re.sub(r'\s+\n', '\n', out).strip()


def heading(level, node_or_html):
    """Heading with the source's italic-serif emphasis preserved as <em>."""
    inner = node_or_html if isinstance(node_or_html, str) else clean(node_or_html)
    inner = re.sub(r'^(\s*<br/?>\s*)+', '', inner)
    return f'<h{level}>{inner}</h{level}>'


def block(name, rows):
    """DA block table: rows = list of lists of cell HTML (max 4 cells per row)."""
    out = [f'<div class="{esc(name)}">']
    for row in rows:
        if len(row) > 4:
            raise ValueError(f'{name}: {len(row)} cells exceeds the 4-cell authoring limit')
        out.append('<div>' + ''.join(f'<div>{cell}</div>' for cell in row) + '</div>')
    out.append('</div>')
    return ''.join(out)


def section(*parts, style=None, extra=None):
    """One section; `style` becomes Section Metadata Style, `extra` adds other rows."""
    body = ''.join(p for p in parts if p)
    rows = []
    if style:
        rows.append(['Style', esc(style)])
    for key, value in (extra or {}).items():
        rows.append([esc(key), esc(value)])
    if rows:
        body += block('section-metadata', [[f'<p>{k}</p>', f'<p>{v}</p>'] for k, v in rows])
    return f'<div>{body}</div>'


def metadata(meta):
    rows = [[f'<p>{esc(k)}</p>', v if v.startswith('<') else f'<p>{esc(v)}</p>']
            for k, v in meta.items() if v]
    return block('metadata', rows)


def page(sections, meta=None):
    """Full DA document: one body Metadata block (nested in the last section), no head meta."""
    sections = [s for s in sections if s]
    if meta:
        last = sections.pop() if sections else '<div></div>'
        sections.append(last[:last.rfind('</div>')] + metadata(meta) + '</div>')
    main = '\n'.join(sections)
    return f'<body>\n<header></header>\n<main>\n{main}\n</main>\n<footer></footer>\n</body>\n'


def write(path, document):
    root = content_root()
    target = (root / path.lstrip('/')).with_suffix('.html') if not path.endswith('.html') else root / path.lstrip('/')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(document)
    print(f'wrote {target}')
    return target


def load(capture):
    """Parse a captured file under CAPTURES (e.g. 'pages/about-us.main.html')."""
    return BeautifulSoup((CAPTURES / capture).read_text(), 'html.parser')


__all__ = ['ORIGIN', 'CAPTURES', 'esc', 'text', 'site_path', 'original_url', 'media', 'image',
           'link', 'clean', 'heading', 'block', 'section', 'metadata', 'page', 'write', 'load',
           'NavigableString', 'Tag', 'BeautifulSoup']
