/**
 * Quote: a pull quote with attribution.
 *
 * Rows: [optional icon picture, quote as h2/p/blockquote (serif-italic <em> allowed)]
 *       [p attribution]
 * Variants: centered (default; stewardship report, 75% measure with a centred icon),
 * rule (light 32px text with a left rule, as in viewpoint articles).
 *
 * Canvas: only the cell owners get role classes; authored nodes stay in place.
 */
export default function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  cells.forEach((cell, i) => {
    cell.classList.add(i === 0 ? 'quote-text' : 'quote-attribution');
  });
  if (!block.classList.contains('rule')) block.classList.add('centered');
}
