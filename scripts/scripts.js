import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  getMetadata,
  toClassName,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  loadScript,
} from './aem.js';

if (window.trustedTypes && window.trustedTypes.createPolicy) {
  const innerTT = window.trustedTypes.createPolicy('tt-inner', {
    createHTML: (s) => s, // avoid stack overflow
  });

  window.trustedTypes.createPolicy('default', {
    createHTML: (input, type, sink) => {
      let processedInput = input;
      if (/srcdoc\s*=/i.test(processedInput)) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('iframe[srcdoc]').forEach((el) => el.removeAttribute('srcdoc'));
        processedInput = doc.body.innerHTML;
      }
      if (sink.includes('createContextualFragment') || sink.includes('Document write')) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('script').forEach((el) => el.remove());
        processedInput = doc.body.innerHTML;
      }
      return processedInput;
    },
    createScriptURL: (input) => input,
    createScript: (input) => input,
  });
}

/** True inside DA Canvas / quick-edit: decoration must keep authored nodes editable. */
export function isAuthoring() {
  return document.documentElement.hasAttribute('quick-edit');
}

/** Site placeholders (DA sheet /placeholders.json), fetched once. */
let placeholdersPromise;
export function fetchPlaceholders() {
  placeholdersPromise ||= fetch('/placeholders.json')
    .then((resp) => (resp.ok ? resp.json() : { data: [] }))
    .then(({ data = [] }) => Object.fromEntries(
      data.filter((row) => row.Key).map((row) => [row.Key, row.Text]),
    ))
    .catch(() => ({}));
  return placeholdersPromise;
}

/**
 * Content index rows, fetched once per sheet. The native query index only reflects published
 * (aem.live) content and this site is preview-only, so the source is the DA-authored sheet
 * /data/content-index (same columns as the configured native index; see docs/DECISIONS.md).
 */
export const CONTENT_INDEX = '/data/content-index.json';
const indexCache = new Map();
export function fetchIndex(sheet = '') {
  const url = `${CONTENT_INDEX}?limit=2000${sheet ? `&sheet=${sheet}` : ''}`;
  if (!indexCache.has(url)) {
    indexCache.set(url, fetch(url)
      .then((resp) => (resp.ok ? resp.json() : { data: [] }))
      .then(({ data = [] }) => data)
      .catch(() => []));
  }
  return indexCache.get(url);
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * Fragment links are resolved by the fragment block; nothing else is auto-blocked site-wide.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')]
      .filter((f) => !f.closest('.fragment') && f.closest('p')?.textContent.trim() === f.textContent.trim());
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Link conventions in default content and blocks:
 * - **bold link** alone in a paragraph: primary (green) button
 * - _italic link_ alone in a paragraph: secondary (outline) button
 * - plain link alone in a paragraph: the source's circled-arrow CTA link
 * Classes go on the link and its paragraph; the authored nodes are never replaced.
 * @param {HTMLElement} main The main container element
 */
export function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    const p = a.closest('p');
    const text = a.textContent.trim();
    if (!text || a.querySelector('img, picture') || p.textContent.trim() !== text) return;
    if (p.querySelectorAll('a').length > 1) return;
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (strong && p.contains(strong)) {
      p.classList.add('button-wrapper');
      a.classList.add('button', 'primary');
    } else if (em && p.contains(em)) {
      p.classList.add('button-wrapper');
      a.classList.add('button', 'secondary');
    } else {
      p.classList.add('link-cta-wrapper');
      a.classList.add('link-cta');
    }
  });
}

/**
 * Decorates the main element. Idempotent: Canvas may run it again on a fresh body.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  if (main.dataset.decorated) return;
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateButtons(main);
  main.dataset.decorated = 'true';
}

/** Optional page template: /templates/<name>/<name>.{css,js}. */
async function loadTemplate(doc, main) {
  const template = toClassName(getMetadata('template'));
  if (!template) return;
  try {
    const [, mod] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/templates/${template}/${template}.css`),
      import(`../templates/${template}/${template}.js`).catch(() => null),
    ]);
    if (mod?.default) await mod.default(main, doc);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`template ${template} failed`, error);
  }
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  doc.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    main.id ||= 'main';
    if (!doc.querySelector('body > .skip-link')) {
      const skip = doc.createElement('a');
      skip.className = 'skip-link';
      skip.href = `#${main.id}`;
      skip.textContent = 'Skip to main content';
      doc.body.prepend(skip);
    }
    await loadTemplate(doc, main);
    decorateMain(main);
    doc.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  // shared documents (/nav, /footer, /fragments/*) are edited standalone, without recursive chrome
  const isSharedDocument = /^\/(nav|footer|fragments\/)/.test(window.location.pathname);
  const header = doc.querySelector('body > header');
  const footer = doc.querySelector('body > footer');
  const chrome = isSharedDocument ? [] : [header && loadHeader(header)];

  await Promise.all([loadSections(main), ...chrome]);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  if (!isSharedDocument && footer) await loadFooter(footer);

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  if (!isAuthoring()) {
    // the source's regional attestation; skipped in Canvas so authors can edit
    import('./disclaimer.js').then(({ default: gate }) => gate()).catch(() => {});
  }
  import('./consent-check.js');
}

/** Canvas calls this same, fully awaited path after each full body replacement. */
export async function loadPage(doc = document) {
  await loadEager(doc);
  await loadLazy(doc);
  doc.body.dataset.pageReady = 'true';
  loadDelayed();
}

export { loadScript };

const params = new URLSearchParams(window.location.search);
if (['on', 'true'].includes(params.get('quick-edit'))) {
  document.documentElement.setAttribute('quick-edit', 'true');
  // Canvas supplies its parent-controlled MessageChannel; no credentials here. Outside the
  // Canvas parent the plugin can fail to import; the page must still decorate.
  try {
    // eslint-disable-next-line import/no-unresolved
    const { default: loadQuickEdit } = await import('https://da.live/nx/public/plugins/quick-edit/quick-edit.js');
    await loadQuickEdit(undefined, loadPage);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('quick-edit unavailable outside Canvas', error);
  }
}

loadPage();
