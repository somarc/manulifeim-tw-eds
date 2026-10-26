#!/usr/bin/env python3
"""Summarise this site's da-cli QMD receipts (the evidence behind /how-we-built-this).

Reads the typed receipt.json files that `da --qmd` journals under the local QMD vault
(`qmdVaultRoot` from `da config show`, default ~/vaults/da-ecosystem). Read-only; prints JSON.
Receipts are evidence, not authority: they record outcomes, never credentials or content.
"""
import collections
import json
import subprocess
import sys
from pathlib import Path

ORG, REPO = 'somarc', 'manulifeim-tw-eds'


def vault_root():
    try:
        out = subprocess.run(['da', '--no-qmd', 'config', 'show', '--format', 'json'],
                             capture_output=True, text=True, check=True).stdout
        return Path(json.loads(out)['config']['qmdVaultRoot'])
    except Exception:  # pylint: disable=broad-except
        return Path.home() / 'vaults' / 'da-ecosystem'


def main():
    root = vault_root() / 'sites' / ORG / REPO / 'receipts'
    receipts = [json.loads(p.read_text()) for p in sorted(root.rglob('receipt.json'))]
    ops = collections.Counter(r['command']['operation'] for r in receipts)
    modes = collections.Counter(r['command']['mode'] for r in receipts)
    states = collections.Counter(r['outcome']['state'] for r in receipts)
    failed = [
        {'operation': r['command']['operation'], 'mode': r['command']['mode'],
         'errors': r['outcome']['errorCodes'], 'at': r['timing']['startedAt']}
        for r in receipts if r['outcome']['state'] != 'completed'
    ]
    commits = [r for r in receipts if r['command']['mode'] == 'commit']
    paths = sum((r['outcome']['counts'].get('total') or 0) for r in commits)
    started = min((r['timing']['startedAt'] for r in receipts), default=None)
    finished = max((r['timing']['finishedAt'] for r in receipts), default=None)
    summary = {
        'site': f'{ORG}/{REPO}',
        'vault': str(root),
        'receipts': len(receipts),
        'firstAt': started,
        'lastAt': finished,
        'byMode': dict(modes),
        'byState': dict(states),
        'committedWrites': len(commits),
        'committedPathEffects': paths,
        'operations': dict(ops.most_common()),
        'notCompleted': failed,
        'totalDurationSeconds': round(sum(r['timing']['durationMs'] for r in receipts) / 1000, 1),
    }
    json.dump(summary, sys.stdout, indent=2)
    print()


if __name__ == '__main__':
    main()
