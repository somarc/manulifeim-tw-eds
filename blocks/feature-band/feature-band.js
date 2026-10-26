/**
 * Feature band (source marketingSection): full-bleed colour band, two-thirds copy
 * (white line icon, H2 with a serif-italic <em>, paragraph, circled-arrow link) and a photo
 * filling the right third.
 *
 * Row: [icon picture, h2, p, link] [picture]
 * Variants: navy (default), green, purple, blue, white; overlay (leaves room for the next
 * section to be pulled up over the band — pair with Section Metadata `Style: overlap`); short.
 *
 * Canvas: cells keep their authored children; only role classes are added to the cells.
 */
function isMediaCell(cell) {
  return !!cell.querySelector('picture, img') && cell.textContent.trim() === '';
}

export default function decorate(block) {
  [...block.children].forEach((row) => {
    row.classList.add('feature-band-row');
    [...row.children].forEach((cell) => {
      cell.classList.add(isMediaCell(cell) ? 'feature-band-image' : 'feature-band-content');
    });
  });
  // a leading picture-only paragraph in the copy is the band icon
  const content = block.querySelector('.feature-band-content');
  const first = content?.firstElementChild;
  if (first && first.querySelector('picture, img') && first.textContent.trim() === '') {
    content.classList.add('has-icon');
  }
}
