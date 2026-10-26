import { getMetadata } from '../../scripts/aem.js';
// eslint-disable-next-line import/no-cycle
import { fetchPlaceholders, SITE_ALERT_KEY } from '../../scripts/scripts.js';
import { loadFragment } from '../fragment/fragment.js';

/*
 * Site chrome: fixed left rail (+ Capabilities fly-out), top bar (logo, search, region,
 * log in, register), dismissible site alert, region dialog, mobile menu (≤800px).
 * Content comes from the DA document /nav (see docs/blocks/chrome.md for the shape).
 * The /nav sections are, in order: brand, rail, tools, regions, alert.
 */

const MOBILE = window.matchMedia('(width <= 800px)');
const BANNER_KEY = SITE_ALERT_KEY;
const SECTIONS = ['brand', 'rail', 'tools', 'regions', 'alert'];
const REGION_DIALOG_ID = 'nav-regions';

// UI strings that are not authored content; /placeholders keys override the defaults
const L = {
  mainNavigation: 'Main Navigation',
  home: 'Home',
  search: 'Search',
  selectLocation: 'Select a location',
  close: 'Close',
  cancel: 'Cancel',
  continue: 'Continue',
  continueTo: 'Continue to',
  siteAlert: 'Site alert',
  closeAlert: 'Close alert message',
  openNavigation: 'Open Site Navigation',
  closeNavigation: 'Close Site Navigation',
  userOptions: 'User and Region Options',
};

// one set of document/window listeners per live header; Canvas re-runs loadPage on a fresh body
let listeners;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
}

/** A code-owned UI icon, painted with currentColor through a mask. */
function icon(name, cls = '') {
  const span = el('span', { class: `icon icon-${name} nav-icon ${cls}`.trim(), 'aria-hidden': 'true' });
  span.style.setProperty('--icon-url', `url("${window.hlx.codeBasePath}/icons/${name}.svg")`);
  return span;
}

/** Rail icons are masks so one white SVG can render white (rail) or navy (mobile menu). */
function maskIcon(span) {
  const img = span.querySelector('img');
  const name = [...span.classList].find((c) => c.startsWith('icon-'))?.substring(5);
  const src = img?.getAttribute('src') || `${window.hlx.codeBasePath}/icons/${name}.svg`;
  span.style.setProperty('--icon-url', `url("${src}")`);
  span.setAttribute('aria-hidden', 'true');
  span.classList.add('nav-icon', 'nav-rail-icon');
  img?.remove();
  return span;
}

/** Text of an authored node without its icon, collapsed. */
function labelText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('.icon, ul, ol').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function isCurrent(href) {
  if (!href) return false;
  const { pathname, origin } = new URL(href, window.location.href);
  if (origin !== window.location.origin) return false;
  const here = window.location.pathname.replace(/\/$/, '') || '/';
  const there = pathname.replace(/\/$/, '') || '/';
  return there !== '/' && (here === there || here.startsWith(`${there}/`));
}

/** Map the fragment's sections to roles: Section Metadata `Style` wins, else document order. */
function mapSections(fragment) {
  const sections = [...fragment.querySelectorAll(':scope > .section')];
  const roles = {};
  sections.forEach((section, i) => {
    const named = SECTIONS.find((role) => section.classList.contains(role));
    const role = named || SECTIONS[i];
    if (role && !roles[role]) roles[role] = section;
  });
  return roles;
}

/* ---------------------------------------------------------------- rail ---------------- */

function buildRail(section, home) {
  const nav = el('nav', { class: 'nav-rail', id: 'nav-rail', 'aria-label': L.mainNavigation });
  const tile = el(
    'a',
    { class: 'nav-tile', href: home },
    el('img', {
      src: `${window.hlx.codeBasePath}/icons/mim-tile.svg`, alt: '', width: 80, height: 80,
    }),
    el('span', { class: 'nav-sr' }, L.home),
  );
  nav.append(tile);

  const list = section?.querySelector('ul');
  if (!list) return nav;
  list.className = 'nav-list';
  nav.append(list);

  [...list.children].forEach((li, index) => {
    li.className = 'nav-item';
    const sub = li.querySelector(':scope > ul, :scope > ol');
    const link = li.querySelector(':scope > a, :scope > p > a');
    li.querySelectorAll(':scope .icon').forEach((span) => {
      if (!sub || !sub.contains(span)) maskIcon(span);
    });

    if (sub) {
      // group with a fly-out: the label becomes a disclosure button, the nested list the panel
      const id = `nav-flyout-${index}`;
      const iconSpan = li.querySelector(':scope .nav-icon');
      const label = labelText(li);
      const button = el(
        'button',
        {
          type: 'button', class: 'nav-link', 'aria-expanded': 'false', 'aria-controls': id,
        },
        iconSpan,
        el('span', { class: 'nav-label' }, label),
        icon('arrow-right', 'nav-chevron'),
      );
      sub.id = id;
      sub.className = 'nav-flyout';
      [...sub.querySelectorAll('li')].forEach((item) => { item.className = 'nav-flyout-item'; });
      sub.querySelectorAll('a').forEach((a) => {
        a.className = 'nav-flyout-link';
        if (isCurrent(a.href)) {
          a.setAttribute('aria-current', 'page');
          li.classList.add('is-current');
        }
      });
      li.classList.add('nav-group');
      li.replaceChildren(button, sub);
      return;
    }

    if (link) {
      const label = labelText(link);
      link.className = 'nav-link';
      const iconSpan = link.querySelector('.nav-icon');
      link.replaceChildren(...[iconSpan, el('span', { class: 'nav-label' }, label)].filter(Boolean));
      if (isCurrent(link.href)) link.setAttribute('aria-current', 'page');
      li.replaceChildren(link);
    }
  });
  return nav;
}

/* ---------------------------------------------------------------- tools --------------- */

function buildSearch(section) {
  const link = [...(section?.querySelectorAll('a') || [])].find((a) => /\/search\b/.test(a.getAttribute('href')));
  const action = link ? new URL(link.href, window.location.href).pathname : '/search';
  const label = link ? link.textContent.trim() : L.search;
  const form = el('form', {
    class: 'nav-search', id: 'nav-search', role: 'search', action, method: 'get',
  });
  const input = el('input', {
    type: 'search', name: 'q', id: 'nav-search-input', placeholder: label, autocomplete: 'off', 'aria-label': label,
  });
  const current = new URLSearchParams(window.location.search).get('q');
  if (current && window.location.pathname === action) input.value = current;
  form.append(
    input,
    el('button', { type: 'submit', class: 'nav-search-submit', 'aria-label': label }, icon('search')),
  );
  form.addEventListener('submit', (e) => {
    if (!input.value.trim()) {
      e.preventDefault();
      input.focus();
    }
  });
  return form;
}

/**
 * Log in / Register: a link when the author gives one; otherwise (today: the source's auth
 * dialogs are unavailable) a button that surfaces the site alert explaining why.
 */
function buildAuth(paragraph, cls, fallback) {
  if (!paragraph) return null;
  const link = paragraph.querySelector('a[href]');
  const hasIcon = !!paragraph.querySelector('.icon-user');
  const label = labelText(paragraph) || fallback;
  const children = [
    hasIcon ? icon('user', 'nav-auth-icon') : null,
    el('span', { class: 'nav-auth-label' }, label),
  ];
  if (link) {
    return el('a', { class: `nav-auth ${cls}`, href: link.href }, ...children);
  }
  return el('button', { type: 'button', class: `nav-auth ${cls}` }, ...children);
}

/* ---------------------------------------------------------------- regions ------------- */

/**
 * Region dialog in the source's two-pane layout: the location list (white) and a decision pane
 * (navy). The source shows the chosen region's own disclaimer there; those texts belong to other
 * sites, so the pane shows the authored note and a Continue link to that region's site instead.
 */
function buildRegions(section) {
  const title = section?.querySelector('h2') || el('h2', {}, L.selectLocation);
  const paragraphs = [...(section?.querySelectorAll(':scope > div > p') || [])];
  const currentP = paragraphs.find((p) => p.querySelector('.icon-globe'))
    || paragraphs[0];
  const current = currentP ? labelText(currentP) : 'Taiwan';
  const notes = paragraphs.filter((p) => p !== currentP);
  title.id = `${REGION_DIALOG_ID}-title`;
  title.className = 'nav-regions-title';

  const dialog = el('dialog', {
    class: 'nav-regions', id: REGION_DIALOG_ID, 'aria-labelledby': title.id,
  });
  const close = el(
    'button',
    { type: 'button', class: 'nav-regions-close', 'aria-label': L.close },
    icon('close'),
  );
  const list = el('div', { class: 'nav-regions-scroll' });
  section?.querySelectorAll('h3').forEach((h3) => {
    const group = h3.nextElementSibling?.matches('ul, ol') ? h3.nextElementSibling : null;
    h3.className = 'nav-regions-group';
    if (group) {
      group.className = 'nav-regions-list';
      group.querySelectorAll('a').forEach((a) => { a.className = 'nav-regions-link'; });
    }
    list.append(el('div', { class: 'nav-regions-section' }, h3, group));
  });

  // decision pane
  const choice = el('h2', { class: 'nav-regions-choice', id: `${REGION_DIALOG_ID}-choice` });
  const note = el('div', { class: 'nav-regions-note' }, ...notes);
  const cancel = el('button', { type: 'button', class: 'nav-regions-cancel' }, L.cancel);
  const proceed = el('a', { class: 'nav-regions-continue' }, L.continue);
  const decision = el(
    'div',
    { class: 'nav-regions-decision', role: 'region', 'aria-labelledby': choice.id },
    choice,
    el('div', { class: 'nav-regions-decision-body' }, note, el('div', { class: 'nav-regions-buttons' }, cancel, proceed)),
  );

  const select = (link) => {
    list.querySelectorAll('[aria-current]').forEach((a) => a.removeAttribute('aria-current'));
    link.setAttribute('aria-current', 'true');
    choice.textContent = link.textContent.trim();
    proceed.href = link.href;
    proceed.setAttribute('aria-label', `${L.continueTo} ${link.textContent.trim()}`);
  };
  const links = [...list.querySelectorAll('a.nav-regions-link')];
  if (links[0]) select(links[0]);
  list.addEventListener('click', (e) => {
    const link = e.target.closest('a.nav-regions-link');
    // one pane on small screens: a region link simply navigates
    if (!link || MOBILE.matches || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    select(link);
    proceed.focus();
  });

  dialog.append(
    el('div', { class: 'nav-regions-pane' }, el('div', { class: 'nav-regions-head' }, title), list),
    decision,
    close,
  );
  [close, cancel].forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  return { dialog, current };
}

function regionTrigger(current, dialog, cls) {
  const button = el(
    'button',
    {
      type: 'button',
      class: cls,
      'aria-haspopup': 'dialog',
      'aria-controls': dialog.id,
      'aria-label': `${L.selectLocation} - ${current}`,
    },
  );
  button.addEventListener('click', () => {
    dialog.returnFocus = button;
    dialog.showModal();
    const selected = dialog.querySelector('.nav-regions-link[aria-current]');
    if (selected && !MOBILE.matches) {
      selected.focus();
      selected.scrollIntoView({ block: 'nearest' });
    }
  });
  return button;
}

/* ---------------------------------------------------------------- alert --------------- */

function buildAlert(section) {
  const p = section?.querySelector('p');
  if (!p || !p.textContent.trim()) return null;
  const message = p.textContent.trim();
  p.className = 'nav-alert-text';
  p.id = 'nav-alert-text';
  const alert = el('div', {
    class: 'nav-alert', role: 'region', 'aria-label': L.siteAlert, tabindex: '-1',
  }, p);
  const close = el(
    'button',
    { type: 'button', class: 'nav-alert-close', 'aria-label': L.closeAlert },
    icon('close'),
  );
  alert.append(close);
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(BANNER_KEY) === message;
  } catch (e) {
    // storage unavailable: show the alert
  }
  alert.hidden = dismissed;
  close.addEventListener('click', () => {
    alert.hidden = true;
    try {
      sessionStorage.setItem(BANNER_KEY, message);
    } catch (e) {
      // ignore
    }
    document.getElementById('main')?.focus?.();
  });
  return alert;
}

/* ---------------------------------------------------------------- behaviour ----------- */

function setFlyout(group, open, { focus = false } = {}) {
  if (!group) return;
  const button = group.querySelector(':scope > .nav-link');
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  group.closest('.nav-rail')?.classList.toggle('has-flyout', open && !MOBILE.matches);
  if (open && focus && !MOBILE.matches) {
    // the source moves focus into the panel once it opens
    group.querySelector('.nav-flyout a')?.focus({ preventScroll: true });
  }
}

function openGroup(block) {
  return block.querySelector('.nav-group > .nav-link[aria-expanded="true"]')?.parentElement;
}

/** While the full-screen menu is open, the page behind it is inert (no stray Tab stops). */
function setBehindInert(block, inert) {
  const behind = [
    document.querySelector('body > main'),
    document.querySelector('body > footer'),
    block.querySelector('.nav-alert'),
  ];
  behind.forEach((node) => node?.toggleAttribute('inert', inert));
}

function setMenu(block, open) {
  const toggle = block.querySelector('.nav-menu-toggle');
  if (!toggle) return;
  const wasOpen = block.classList.contains('is-menu-open');
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute('aria-label', open ? L.closeNavigation : L.openNavigation);
  block.classList.toggle('is-menu-open', open);
  if (open !== wasOpen) setBehindInert(block, open);
  if (open) {
    setSearch(block, false); // eslint-disable-line no-use-before-define
    block.querySelector('.nav-list .nav-link')?.focus();
  }
}

function setSearch(block, open) {
  const toggle = block.querySelector('.nav-search-toggle');
  if (!toggle) return;
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  block.classList.toggle('is-search-open', open);
  if (open) {
    setMenu(block, false);
    block.querySelector('.nav-search input')?.focus();
  }
}

function wireGlobal(block) {
  listeners?.abort();
  listeners = new AbortController();
  const { signal } = listeners;

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !block.isConnected) return;
    if (block.querySelector('dialog[open]')) return; // native dialog handles its own Escape
    const group = openGroup(block);
    if (group && !MOBILE.matches) {
      setFlyout(group, false);
      group.querySelector(':scope > .nav-link').focus();
    } else if (block.classList.contains('is-menu-open')) {
      setMenu(block, false);
      block.querySelector('.nav-menu-toggle').focus();
    } else if (block.classList.contains('is-search-open')) {
      setSearch(block, false);
      block.querySelector('.nav-search-toggle').focus();
    }
  }, { signal });

  document.addEventListener('click', (e) => {
    if (!block.isConnected) return;
    const group = openGroup(block);
    if (group && !MOBILE.matches && !group.contains(e.target)) setFlyout(group, false);
  }, { signal });

  MOBILE.addEventListener('change', () => {
    setMenu(block, false);
    setSearch(block, false);
    setFlyout(openGroup(block), false);
  }, { signal });
}

/**
 * loads and decorates the header
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const [fragment, placeholders] = await Promise.all([loadFragment(navPath), fetchPlaceholders()]);
  if (!fragment) return;
  Object.keys(L).forEach((key) => { if (placeholders[key]) L[key] = placeholders[key]; });
  const roles = mapSections(fragment);

  // brand
  const brandPictures = [...(roles.brand?.querySelectorAll('picture') || [])];
  const homeLink = roles.brand?.querySelector('a[href]');
  const home = homeLink ? homeLink.getAttribute('href') : '/';
  const logo = el('a', { class: 'nav-logo', href: home });
  const [desktopLogo, mobileLogo] = brandPictures;
  if (desktopLogo) {
    desktopLogo.classList.add('nav-logo-desktop');
    logo.append(desktopLogo);
  }
  if (mobileLogo) {
    mobileLogo.classList.add('nav-logo-mobile');
    logo.append(mobileLogo);
  } else {
    logo.append(el('img', {
      class: 'nav-logo-mobile', src: `${window.hlx.codeBasePath}/icons/logo-stacked.svg`, alt: '', width: 156, height: 32,
    }));
  }
  const logoAlt = (desktopLogo || mobileLogo)?.querySelector('img')?.alt || 'Manulife Investment Management';
  logo.querySelectorAll('img').forEach((img) => {
    img.alt = '';
    img.loading = 'eager';
  });
  logo.setAttribute('aria-label', `${logoAlt} - Home`);
  const mobileTile = el(
    'a',
    { class: 'nav-mobile-tile', href: home, 'aria-label': L.home },
    el('img', {
      src: `${window.hlx.codeBasePath}/icons/mim-tile.svg`, alt: '', width: 50, height: 50,
    }),
  );

  // rail, regions, alert
  const rail = buildRail(roles.rail, home);
  const { dialog, current } = buildRegions(roles.regions);
  const alert = buildAlert(roles.alert);

  // tools
  const toolParagraphs = [...(roles.tools?.querySelectorAll('p') || [])];
  const isSearch = (p) => [...p.querySelectorAll('a')].some((a) => /\/search\b/.test(a.getAttribute('href')));
  const loginP = toolParagraphs.find((p) => p.querySelector('.icon-user'));
  const registerP = toolParagraphs.find((p) => p !== loginP && !isSearch(p));
  const search = buildSearch(roles.tools);
  const login = buildAuth(loginP, 'nav-login', 'Log in');
  const register = buildAuth(registerP, 'nav-register', 'Register for access');

  const regionButton = regionTrigger(current, dialog, 'nav-region');
  regionButton.append(el('span', {}, current), icon('arrow-down', 'nav-region-chevron'));

  const searchToggle = el(
    'button',
    {
      type: 'button', class: 'nav-search-toggle', 'aria-expanded': 'false', 'aria-controls': 'nav-search', 'aria-label': L.search,
    },
    icon('search'),
  );
  const menuToggle = el(
    'button',
    {
      type: 'button', class: 'nav-menu-toggle', 'aria-expanded': 'false', 'aria-controls': 'nav-rail', 'aria-label': L.openNavigation,
    },
    icon('mobile-menu'),
  );

  const tools = el(
    'div',
    { class: 'nav-tools', role: 'group', 'aria-label': L.userOptions },
    regionButton,
    searchToggle,
    login,
    register,
    menuToggle,
  );

  // mobile-only menu extras (region row, register button, log in) live in the rail panel
  const mobileRegion = regionTrigger(current, dialog, 'nav-link nav-mobile-region');
  mobileRegion.append(maskIcon(icon('globe')), el('span', { class: 'nav-label' }, current));
  const mobileAuth = el(
    'div',
    { class: 'nav-mobile-auth' },
    register ? register.cloneNode(true) : null,
    login ? login.cloneNode(true) : null,
  );
  mobileAuth.querySelectorAll('.icon').forEach((n) => n.remove());
  rail.querySelector('.nav-list')?.append(el('li', { class: 'nav-item nav-mobile-only' }, mobileRegion));
  rail.append(mobileAuth);

  const bar = el('div', { class: 'nav-bar' }, el('div', { class: 'nav-brand' }, mobileTile, logo), search, tools);

  block.replaceChildren(rail, bar, ...(alert ? [alert] : []), dialog);

  // auth buttons without a link surface the alert that explains why they are unavailable
  block.querySelectorAll('button.nav-auth').forEach((button) => {
    if (alert) button.setAttribute('aria-describedby', 'nav-alert-text');
    else button.setAttribute('aria-disabled', 'true');
    button.addEventListener('click', () => {
      if (!alert) return;
      setMenu(block, false);
      alert.hidden = false;
      alert.classList.add('is-highlighted');
      alert.focus();
    });
  });
  alert?.addEventListener('blur', () => alert.classList.remove('is-highlighted'));

  // fly-out / accordion
  block.querySelectorAll('.nav-group').forEach((group) => {
    const button = group.querySelector(':scope > .nav-link');
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      setFlyout(group, open, { focus: open });
    });
    group.addEventListener('focusout', (e) => {
      if (MOBILE.matches || !e.relatedTarget || group.contains(e.relatedTarget)) return;
      setFlyout(group, false);
    });
  });

  menuToggle.addEventListener('click', () => setMenu(block, !block.classList.contains('is-menu-open')));
  searchToggle.addEventListener('click', () => setSearch(block, !block.classList.contains('is-search-open')));
  dialog.addEventListener('close', () => dialog.returnFocus?.focus());

  wireGlobal(block);
}
