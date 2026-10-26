import { buildBlock, decorateBlock, loadBlock } from '../../scripts/aem.js';
import { isAuthoring } from '../../scripts/scripts.js';

/**
 * Promo banner (source simpleBanner): coloured card, copy left (H2, p, circled-arrow link),
 * photo right.
 *
 * Rows (one banner per row): [h2, p, link] [picture | 4 pictures (mosaic)]
 * Variants: navy (default), green, blue, white — listed in row order, the last one repeats
 * (`Promo Banner (double, green, blue)` = green then blue); double (2-up grid); mosaic.
 * A link to players.brightcove.net becomes a "Watch the video" modal (nested Video block).
 *
 * Canvas: cells are classified in place; the video link paragraph is moved intact into the
 * nested block on the published page only (isAuthoring() keeps it a plain link).
 */
const COLOURS = ['navy', 'green', 'blue', 'white', 'violet', 'gold'];

function isMediaCell(cell) {
  return !!cell.querySelector('picture, img') && cell.textContent.trim() === '';
}

export default async function decorate(block) {
  const colours = COLOURS.filter((c) => block.classList.contains(c));
  const rows = [...block.children];
  const videos = [];
  rows.forEach((row, i) => {
    row.classList.add('promo-banner-item', `promo-banner-${colours[Math.min(i, colours.length - 1)] || 'navy'}`);
    [...row.children].forEach((cell) => {
      if (isMediaCell(cell)) {
        cell.classList.add('promo-banner-image');
        if (cell.querySelectorAll('picture, img:not(picture img)').length >= 4) cell.classList.add('promo-banner-mosaic');
      } else {
        cell.classList.add('promo-banner-content');
        const video = [...cell.querySelectorAll('a[href*="players.brightcove.net"]')]
          .map((a) => a.closest('p'))
          .find((p) => p && p.parentElement === cell);
        if (video) videos.push(video);
      }
    });
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
