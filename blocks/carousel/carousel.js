import { fetchPlaceholders, isAuthoring } from '../../scripts/scripts.js';

const AUTOPLAY_MS = 5000;

/* English fallbacks; /placeholders (Key/Text) overrides any of them. */
const DEFAULT_LABELS = {
  carouselLabel: 'Highlights',
  carouselPrevious: 'Previous slide',
  carouselNext: 'Next slide',
  carouselPause: 'Pause slideshow',
  carouselPlay: 'Play slideshow',
  slideOf: 'Slide {0} of {1}',
};

const format = (template, ...args) => template.replace(/\{(\d)\}/g, (_, i) => args[i] ?? '');

/**
 * Marks one authored row as a slide. Cells are classified, never rebuilt: the media cell is the
 * one with a picture and no heading, the copy cell is the other one (authors may swap them).
 * @returns {boolean} whether the row has any content
 */
function decorateSlide(row) {
  const cells = [...row.children];
  const media = cells.find((cell) => cell.querySelector('picture, img')
    && !cell.querySelector('h1, h2, h3, h4, h5, h6'));
  const copy = cells.find((cell) => cell !== media && cell.textContent.trim());
  row.classList.add('carousel-slide');
  media?.classList.add('carousel-slide-image');
  copy?.classList.add('carousel-slide-content');
  cells.filter((cell) => cell !== media && cell !== copy)
    .forEach((cell) => cell.classList.add('carousel-slide-extra'));
  return Boolean(media || copy);
}

function prioritiseImages(slides) {
  slides.forEach((slide, i) => {
    const img = slide.querySelector('.carousel-slide-image img');
    if (!img) return;
    img.loading = i === 0 ? 'eager' : 'lazy';
    if (i === 0) img.fetchPriority = 'high';
  });
}

function controlButton(className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  return button;
}

export default function decorate(block) {
  const slides = [...block.children].filter(decorateSlide);
  prioritiseImages(slides);
  slides[0]?.classList.add('active');

  // Canvas (quick-edit) and single slides: every slide stays visible and editable, no timers.
  if (isAuthoring() || slides.length < 2) {
    block.classList.add('static');
    return;
  }

  const labels = { ...DEFAULT_LABELS };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    index: 0,
    userPaused: reduceMotion, // no autoplay under reduced motion; the play control starts it
    hoverPaused: false,
    focusPaused: false,
    animation: null, // the progress fill (visual only)
    timer: 0, // advances the slide; timers keep running where animation events do not
    remaining: AUTOPLAY_MS,
    startedAt: 0,
  };

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'carousel');

  const controls = document.createElement('div');
  controls.className = 'carousel-controls';
  controls.setAttribute('role', 'group');
  const prev = controlButton('carousel-prev');
  const next = controlButton('carousel-next');
  const dotList = document.createElement('div');
  dotList.className = 'carousel-dots';
  const dots = slides.map((slide, i) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    const dot = controlButton('carousel-dot');
    dot.dataset.index = i;
    const bar = document.createElement('span');
    bar.className = 'carousel-dot-bar';
    const fill = document.createElement('span');
    fill.className = 'carousel-dot-fill';
    bar.append(fill);
    dot.append(bar);
    dotList.append(dot);
    return dot;
  });
  controls.append(prev, dotList, next);
  block.append(controls);

  const isPlaying = () => !state.userPaused && !state.hoverPaused && !state.focusPaused;

  function renderLabels() {
    const total = slides.length;
    block.setAttribute('aria-label', labels.carouselLabel);
    controls.setAttribute('aria-label', labels.carouselLabel);
    prev.setAttribute('aria-label', labels.carouselPrevious);
    next.setAttribute('aria-label', labels.carouselNext);
    slides.forEach((slide, i) => slide.setAttribute('aria-label', format(labels.slideOf, i + 1, total)));
    dots.forEach((dot, i) => {
      const slideLabel = format(labels.slideOf, i + 1, total);
      if (i !== state.index) {
        dot.setAttribute('aria-label', slideLabel);
        return;
      }
      const action = isPlaying() ? labels.carouselPause : labels.carouselPlay;
      dot.setAttribute('aria-label', `${action} (${slideLabel})`);
    });
  }

  let show; // sync() and show() call each other

  function sync() {
    const playing = isPlaying();
    block.classList.toggle('paused', !playing);
    // announce slide changes only when the user drives them (APG carousel pattern)
    block.setAttribute('aria-live', playing ? 'off' : 'polite');
    if (playing && !state.timer) {
      state.startedAt = performance.now();
      state.timer = setTimeout(() => {
        state.timer = 0;
        if (block.isConnected) show(state.index + 1);
      }, state.remaining);
      state.animation?.play();
    } else if (!playing && state.timer) {
      clearTimeout(state.timer);
      state.timer = 0;
      state.remaining = Math.max(0, state.remaining - (performance.now() - state.startedAt));
      state.animation?.pause();
    } else if (!playing) {
      state.animation?.pause();
    }
    renderLabels();
  }

  show = (target) => {
    const count = slides.length;
    state.index = ((target % count) + count) % count;
    slides.forEach((slide, i) => {
      const active = i === state.index;
      slide.classList.toggle('active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
    });
    dots.forEach((dot, i) => {
      if (i === state.index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    // restart the clock and the progress fill for the new slide
    clearTimeout(state.timer);
    state.timer = 0;
    state.remaining = AUTOPLAY_MS;
    state.animation?.cancel();
    const fill = dots[state.index].querySelector('.carousel-dot-fill');
    state.animation = fill.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: AUTOPLAY_MS, easing: 'linear', fill: 'forwards' },
    );
    sync();
  };

  prev.addEventListener('click', () => show(state.index - 1));
  next.addEventListener('click', () => show(state.index + 1));
  dotList.addEventListener('click', (e) => {
    const dot = e.target.closest('.carousel-dot');
    if (!dot) return;
    const i = Number(dot.dataset.index);
    if (i !== state.index) {
      show(i);
      return;
    }
    // the current dot is the play/pause toggle (it shows a play icon whenever paused)
    if (isPlaying()) {
      state.userPaused = true;
    } else {
      state.userPaused = false;
      state.hoverPaused = false;
      state.focusPaused = false;
    }
    sync();
  });

  block.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.hoverPaused = true;
    sync();
  });
  block.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.hoverPaused = false;
    sync();
  });
  block.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    state.userPaused = true;
    sync();
  });
  block.addEventListener('focusin', () => {
    state.focusPaused = true;
    sync();
  });
  block.addEventListener('focusout', (e) => {
    if (block.contains(e.relatedTarget)) return;
    state.focusPaused = false;
    sync();
  });

  show(0);

  fetchPlaceholders().then((placeholders) => {
    Object.keys(DEFAULT_LABELS).forEach((key) => {
      if (placeholders[key]) labels[key] = placeholders[key];
    });
    renderLabels();
  });
}
