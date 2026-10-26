/**
 * Cards: one white, shadowed container of tiles split by 1px rules (source `infoContainer`,
 * `articleGroup` sustainability tiles, `latest-news`, partner logos, strategy link tables).
 *
 * Rows (≤ 4 cells; every cell stays semantic):
 * - info (default): [h3 title, p text, optional stat p (<strong>$577B</strong> caption), p link]
 *   An optional leading picture cell becomes the tile illustration.
 * - image:  [picture] [h3, p, p link]
 * - news:   [p date, h3 title, p link]
 * - logos:  [picture (optionally linked)] per row
 * - links:  one cell holding a ul of links (strategy table; flows column by column)
 * Layout variants: cols-2, cols-4 (default 3). Variants never change the authored shape.
 *
 * Canvas: rows become <li> but every authored cell is moved intact (no cloning, no picture
 * replacement), so data-prose-index / data-image-index markers survive; role classes are put on
 * the generated <li> and the cell wrappers, never on the authored p/h nodes.
 */
function isMediaCell(cell) {
  const media = cell.querySelectorAll('picture, img');
  if (!media.length) return false;
  // only pictures (optionally wrapped in p or a link), no text
  return cell.textContent.trim() === '';
}

export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.className = 'cards-card';
    [...row.children].forEach((cell) => {
      if (isMediaCell(cell)) {
        cell.className = 'cards-card-image';
      } else {
        cell.className = 'cards-card-body';
      }
      li.append(cell);
    });
    if (!li.querySelector('.cards-card-body')) li.classList.add('cards-card-media-only');
    ul.append(li);
    row.remove();
  });
  block.append(ul);
}
