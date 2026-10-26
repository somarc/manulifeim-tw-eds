#!/usr/bin/env python3
"""Build /data/content-index (a DA sheet) the way the native query index would.

Why: the Configuration Service index only reflects *published* (aem.live) content and this
site is preview-only, so search and listings read a previewed DA sheet instead
(docs/DECISIONS.md, ADR-001). To avoid a second schema, this script reads the configured
`default` index definition (`da index show`), discovers source pages with `da content tree`,
fetches each page's delivered aem.page HTML and applies the same include/exclude globs and
selectFirst/select + attribute(el, "content") rules. When the site is published, blocks can
switch to /query-index.json with no column changes.

Output: <DA workspace content root>/data/content-index.json (DA sheet JSON). Upload and preview
are separate, reviewed da-cli operations:
  da --qmd content put /data/content-index.json <file> --json-profile sheet-v1   (dry-run)
  da --commit --qmd content put ... ; da --commit --qmd preview page /data/content-index.json --yes
"""
import fnmatch
import json
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from common import REPO, content_root  # noqa: E402

PREVIEW = 'https://main--manulifeim-tw-eds--somarc.aem.page'


def da_json(*args):
    out = subprocess.run(['da', '--qmd', '--format', 'json', *args], cwd=REPO,
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out[out.find('{'):])


# The committed Configuration Service definition (da index add default + set-property date/tags).
# `da index show` exposes only the field list and include glob, not excludes or selectors, so the
# full rules are mirrored here and the field list is checked against the service on every run.
EXCLUDE = ['/drafts/**', '/fragments/**', '/**/fragments/**', '/library/**', '/data/**', '/nav', '/footer']
SELECTORS = {
    'title': {'selectFirst': 'meta[property="og:title"]'},
    'description': {'selectFirst': 'meta[property="og:description"]'},
    'image': {'selectFirst': 'meta[property="og:image"]'},
    'date': {'selectFirst': 'meta[name="date"]'},
    'tags': {'select': 'meta[property="article:tag"]'},
}


def index_definition():
    data = da_json('index', 'show')
    for idx in data.get('indices', []):
        if idx.get('index', idx.get('name')) == 'default' and idx.get('target') == '/query-index.json':
            fields = [f.strip() for f in str(idx.get('fields', '')).split(',') if f.strip()]
            props = {f: {**SELECTORS.get(f, {'selectFirst': f'meta[name="{f}"]'}),
                         'value': 'attribute(el, "content")'} for f in fields}
            include = idx.get('include') or '/**'
            return {'include': [include] if isinstance(include, str) else include,
                    'exclude': EXCLUDE, 'properties': props}
    raise SystemExit('no default index configured (da index add default)')


def source_paths():
    data = da_json('content', 'tree', '/')
    data = data.get('data', data)
    items = data.get('items') or data.get('documents') or data.get('paths') or []
    paths = []
    for item in items:
        path = item if isinstance(item, str) else item.get('path', '')
        if path.endswith('.html'):
            path = path[:-5]
            paths.append('/' if path == '/index' else path)
    return sorted(set(paths))


def included(path, idx):
    def match(globs):
        return any(fnmatch.fnmatchcase(path, g) or fnmatch.fnmatchcase(path, g.replace('/**', '')) for g in globs)
    return match(idx.get('include') or ['/**']) and not match(idx.get('exclude') or [])


def extract(soup, rule):
    attr = re.search(r'attribute\(el,\s*"([^"]+)"\)', rule.get('value') or rule.get('values') or '')
    attr = attr.group(1) if attr else 'content'
    if rule.get('selectFirst'):
        el = soup.select_one(rule['selectFirst'])
        return (el.get(attr) or '').strip() if el else ''
    if rule.get('select'):
        return ', '.join(el.get(attr, '').strip() for el in soup.select(rule['select']) if el.get(attr))
    return ''


def row_for(path, props):
    req = urllib.request.Request(PREVIEW + path, headers={'User-Agent': 'manulifeim-tw-eds build-index'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            html_doc = resp.read().decode('utf-8', 'replace')
            modified = resp.headers.get('last-modified')
    except Exception as error:  # pylint: disable=broad-except
        print(f'  ! {path}: {error}', file=sys.stderr)
        return None
    soup = BeautifulSoup(html_doc, 'html.parser')
    row = {'path': path}
    for name, rule in props.items():
        value = extract(soup, rule)
        if name == 'image' and value:
            parts = urlsplit(value)
            value = parts.path + (f'?{parts.query}' if parts.query else '')
        row[name] = value
    row['lastModified'] = int(parsedate_to_datetime(modified).timestamp()) if modified else ''
    return row


def main():
    idx = index_definition()
    props = idx.get('properties') or {}
    paths = [p for p in source_paths() if included(p, idx)]
    print(f'{len(paths)} candidate pages; properties: {", ".join(props)}')
    with ThreadPoolExecutor(max_workers=6) as pool:
        rows = [r for r in pool.map(lambda p: row_for(p, props), paths) if r]
    rows = [r for r in rows if 'noindex' not in (r.get('robots') or '')]
    rows.sort(key=lambda r: (r.get('date') or '', r['path']), reverse=True)
    columns = ['path', *props.keys(), 'lastModified']
    rows = [{c: r.get(c, '') for c in columns} for r in rows]
    sheet = {':type': 'sheet', 'total': len(rows), 'offset': 0, 'limit': len(rows), 'data': rows}
    target = content_root() / 'data' / 'content-index.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(sheet, indent=2) + '\n')
    print(f'wrote {target} ({len(rows)} rows)')


if __name__ == '__main__':
    main()
