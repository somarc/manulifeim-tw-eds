/**
 * Hero (source extendedHeroBanner2 / heroHeader2).
 *
 * Rows: [desktop picture] [optional mobile picture]
 *       [h1, p, link]                (a bold link renders as the green primary button)
 * Page header: [icon picture, h1, p] in one cell (variant `page-header`, optional `dark`;
 * a picture-only row behind a dark header becomes its background).
 * Variants: short (600px, default), large (64/80 title), overlay (next section overlaps
 * the bottom 160px), page-header, dark.
 *
 * Canvas: cells are classified in place (role classes on the cell owners); no authored node
 * is moved, cloned or replaced.
 */
function isMediaCell(cell) {
  return !!cell.querySelector('picture, img') && cell.textContent.trim() === '';
}

export default function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  let mediaCount = 0;
  cells.forEach((cell) => {
    if (isMediaCell(cell)) {
      mediaCount += 1;
      cell.classList.add('hero-media', mediaCount === 1 ? 'hero-media-primary' : 'hero-media-mobile');
    } else if (cell.textContent.trim() || cell.querySelector('picture, img')) {
      cell.classList.add('hero-content');
    } else {
      cell.classList.add('hero-empty');
    }
  });
  [...block.children].forEach((row) => row.classList.add(row.querySelector('.hero-content') ? 'hero-content-row' : 'hero-media-row'));
  if (block.querySelector('.hero-media-mobile')) block.classList.add('has-mobile-media');
  // the first hero image is the LCP candidate
  const lcp = block.querySelector('.hero-media-primary img');
  if (lcp) {
    lcp.loading = 'eager';
    lcp.fetchPriority = 'high';
  }
}
