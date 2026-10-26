import { isAuthoring, fetchPlaceholders } from '../../scripts/scripts.js';

/**
 * Timeline (source timeline): horizontal milestones — image, year on a rule, caption,
 * alternating above/below — with previous/next buttons; a vertical list below 800px.
 *
 * Rows (one per milestone): [p year] [picture] [p caption]
 *
 * Canvas: rows and cells keep their authored children; rows are moved (not cloned) into a
 * generated scroll track; the buttons are not created in isAuthoring() (the track scrolls).
 */
const isMedia = (cell) => !!cell.querySelector('picture, img') && cell.textContent.trim() === '';

export default async function decorate(block) {
  const track = document.createElement('div');
  track.className = 'timeline-track';
  [...block.children].forEach((row) => {
    row.classList.add('timeline-item');
    // by position: the first text cell is the year, a picture-only cell the image, the rest caption
    [...row.children].forEach((cell) => {
      if (isMedia(cell)) cell.classList.add('timeline-image');
      else if (!row.querySelector('.timeline-date')) cell.classList.add('timeline-date');
      else cell.classList.add('timeline-caption');
    });
    track.append(row);
  });
  block.append(track);
  if (isAuthoring()) {
    block.classList.add('is-authoring');
    return;
  }

  const labels = await fetchPlaceholders();
  const buttons = document.createElement('div');
  buttons.className = 'timeline-buttons';
  const make = (dir, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `timeline-button timeline-${dir}`;
    b.setAttribute('aria-label', label);
    buttons.append(b);
    return b;
  };
  const prev = make('prev', labels.timelineBackward || 'Scroll timeline backward');
  const next = make('next', labels.timelineForward || 'Scroll timeline forward');
  block.append(buttons);
  track.setAttribute('tabindex', '0');
  track.setAttribute('role', 'region');
  track.setAttribute('aria-label', labels.timeline || 'Timeline');

  const step = () => track.querySelector('.timeline-item')?.offsetWidth || 360;
  const update = () => {
    prev.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  track.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(track);
  update();
}
