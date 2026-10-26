/*
 * Tag Cloud — a titled list of links in columns ("All Tags"), or an inline link bar
 * ("More insight") with the `inline` variant.
 * Rows: [h2 title] then [ul of links]. Authored nodes are kept; the block only adds a
 * disclosure wrapper (<details open>) on the published page. In Canvas it stays a plain
 * container so clicking the title selects it instead of toggling.
 */
import { isAuthoring } from '../../scripts/scripts.js';

export default function decorate(block) {
  const rows = [...block.children];
  const titleCell = rows.find((r) => r.querySelector('h1, h2, h3, h4'))?.firstElementChild;
  const listCell = rows.find((r) => r.querySelector('ul, ol'))?.firstElementChild;
  titleCell?.classList.add('tag-cloud-title');
  listCell?.classList.add('tag-cloud-list');
  if (block.classList.contains('inline') || isAuthoring() || !titleCell || !listCell) return;

  const details = document.createElement('details');
  details.open = true;
  const summary = document.createElement('summary');
  summary.className = 'tag-cloud-summary';
  titleCell.parentElement.before(details);
  details.append(summary);
  summary.append(titleCell.parentElement);
  details.append(listCell.parentElement);
}
