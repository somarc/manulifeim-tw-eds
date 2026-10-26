#!/usr/bin/env python3
"""Build the /placeholders DA sheet (Key, Text) from the UI strings the code actually reads.

Sources: English defaults declared in code (`const L = {…}`, `const LABELS = {…}`, the carousel
defaults) and inline `labels.key || 'Text'` fallbacks. Keys the code needs without a fallback
are listed in EXTRA. Output goes to the DA workspace content root; upload/preview with da-cli.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import REPO, content_root  # noqa: E402

EXTRA = {'copyCommands': 'Copy commands', 'copied': 'Copied'}
LITERAL = re.compile(r"^\s+([a-zA-Z]+): '((?:[^'\\]|\\.)*)',?$", re.M)
INLINE = re.compile(r"(?:labels|placeholders|text)\.([a-zA-Z]+) \|\| '((?:[^'\\]|\\.)*)'")
OBJECT = re.compile(r'const (?:L|LABELS|DEFAULTS|DEFAULT_LABELS|FALLBACK_LABELS) = \{(.*?)\n\};', re.S)


def main():
    found = {}
    for path in sorted([*REPO.glob('blocks/*/*.js'), *REPO.glob('scripts/*.js'), *REPO.glob('templates/*/*.js')]):
        if path.name == 'aem.js':
            continue
        src = path.read_text()
        for obj in OBJECT.findall(src):
            for key, value in LITERAL.findall('\n' + obj + '\n'):
                found.setdefault(key, (value.replace("\\'", "'"), path.relative_to(REPO).as_posix()))
        for key, value in INLINE.findall(src):
            found.setdefault(key, (value.replace("\\'", "'"), path.relative_to(REPO).as_posix()))
    for key, value in EXTRA.items():
        found.setdefault(key, (value, 'blocks/blueprint/blueprint.js'))
    rows = [{'Key': k, 'Text': v} for k, (v, _) in sorted(found.items(), key=lambda kv: kv[0].lower())]
    sheet = {':type': 'sheet', 'total': len(rows), 'offset': 0, 'limit': len(rows), 'data': rows}
    target = content_root() / 'placeholders.json'
    target.write_text(json.dumps(sheet, indent=2, ensure_ascii=False) + '\n')
    print(f'wrote {target} ({len(rows)} keys)')
    for k, (v, src) in sorted(found.items()):
        print(f'  {k:22} {v[:50]:52} {src}')


if __name__ == '__main__':
    main()
