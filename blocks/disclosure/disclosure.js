import { isAuthoring } from '../../scripts/scripts.js';

/**
 * Disclosure: one row per disclosure, [label][rich body].
 * Default: static (label line with the scale icon, body always visible), as on the homepage.
 * `collapsible`: each row becomes <details><summary>label</summary>body</details> on the
 * published page; in Canvas the rows stay static so label and body remain editable.
 */
export default function decorate(block) {
  const rows = [...block.children];
  rows.forEach((row) => {
    row.classList.add('disclosure-item');
    const cells = [...row.children];
    // a single cell is body-only (no label line)
    const [label, body] = cells.length > 1 ? cells : [null, cells[0]];
    label?.classList.add('disclosure-label');
    body?.classList.add('disclosure-body');
  });

  if (!block.classList.contains('collapsible') || isAuthoring()) return;

  rows.forEach((row) => {
    const label = row.querySelector(':scope > .disclosure-label');
    const body = row.querySelector(':scope > .disclosure-body');
    if (!label || !body) return;
    const details = document.createElement('details');
    details.className = 'disclosure-details';
    const summary = document.createElement('summary');
    summary.className = 'disclosure-label';
    // the authored label paragraph moves intact into the summary
    summary.append(...label.childNodes);
    details.append(summary, body);
    label.replaceWith(details);
  });
}
