import { buildBlock, decorateBlock, loadBlock } from '../../scripts/aem.js';
import { isAuthoring } from '../../scripts/scripts.js';

/**
 * Columns: side-by-side cells.
 *
 * Rows: [cell] [cell] … (≤ 4). A picture-only cell is a media cell.
 * Variants:
 * - feature-card (source featureKicker): white 50/50 card [h2, p, link] [picture]; pulled over
 *   a preceding `Hero (overlay)`.
 * - map (source featureBanner): [h2, p] [picture]; text over a short world-map strip.
 * - figure (source landingImage2): [desktop picture] [mobile picture], optional caption row.
 * A link to players.brightcove.net becomes a "Watch the video" modal (nested Video block).
 *
 * Canvas: cells are classified in place; the video link paragraph is moved intact into the
 * nested block on the published page only.
 */
function isMediaCell(cell) {
  return !!cell.querySelector('picture, img') && cell.textContent.trim() === '';
}

export default async function decorate(block) {
  const rows = [...block.children];
  block.classList.add(`columns-${rows[0]?.children.length || 1}-cols`);
  const videos = [];
  rows.forEach((row) => {
    row.classList.add('columns-row');
    let media = 0;
    [...row.children].forEach((cell) => {
      if (isMediaCell(cell)) {
        media += 1;
        cell.classList.add('columns-media', media === 1 ? 'columns-media-primary' : 'columns-media-mobile');
      } else {
        cell.classList.add('columns-content');
        const p = [...cell.querySelectorAll('a[href*="players.brightcove.net"]')]
          .map((a) => a.closest('p'))
          .find((el) => el && el.parentElement === cell);
        if (p) videos.push(p);
      }
    });
    if (media > 1) row.classList.add('has-mobile-media');
  });
  if (isAuthoring()) return;
  await Promise.all(videos.map((p) => {
    const nested = buildBlock('video', [[{ elems: [] }]]);
    nested.classList.add('inline');
    const wrapper = document.createElement('div');
    p.replaceWith(wrapper);
    wrapper.append(nested);
    nested.querySelector(':scope > div > div').append(p);
    decorateBlock(nested);
    return loadBlock(nested);
  }));
}
