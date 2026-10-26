import { isAuthoring, fetchPlaceholders } from '../../scripts/scripts.js';
import { toClassName } from '../../scripts/aem.js';

/**
 * Anchor nav (source innerNavigationBar / landingNav): sticky 80px bar of in-page links with
 * scroll-spy; a dropdown below 800px.
 *
 * Row: [ul of links to #anchors]. Each target section declares its anchor with Section
 * Metadata `Anchor | <slug>` (or any element with that id). With an empty cell the list is
 * built from the anchored sections (label = Section Metadata `Anchor Label`, else the slug).
 *
 * Canvas: the authored list is never rebuilt; ids are set on section wrappers (not authored
 * fields) and the sticky/scroll-spy/dropdown behaviour is skipped in isAuthoring().
 */
function sectionAnchor(section) {
  if (section.dataset.anchor) return section.dataset.anchor;
  const meta = section.querySelector('.section-metadata');
  if (!meta) return '';
  const row = [...meta.children].find((r) => toClassName(r.children[0]?.textContent) === 'anchor');
  return row ? toClassName(row.children[1]?.textContent) : '';
}

function sectionLabel(section, slug) {
  return section.dataset.anchorLabel
    || slug.replace(/-+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export default async function decorate(block) {
  const main = block.closest('main') || document;
  const sections = [...main.querySelectorAll(':scope > .section')];
  sections.forEach((section) => {
    const slug = sectionAnchor(section);
    if (!slug) return;
    // the section owns the anchor; a pipeline heading id with the same slug yields to it
    const clash = document.getElementById(slug);
    if (clash && clash !== section && /^H\d$/.test(clash.tagName)) clash.removeAttribute('id');
    if (!document.getElementById(slug)) section.id = slug;
  });

  const cell = block.querySelector(':scope > div > div') || block;
  cell.classList.add('anchor-nav-list');
  let list = cell.querySelector('ul, ol');
  if (!list) {
    // no authored list: build one from the anchored sections (generated, not authored)
    list = document.createElement('ul');
    sections.filter((s) => s.id).forEach((s) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${s.id}`;
      a.textContent = sectionLabel(s, s.id);
      li.append(a);
      list.append(li);
    });
    cell.append(list);
  }

  const labels = await fetchPlaceholders();
  block.setAttribute('role', 'navigation');
  block.setAttribute('aria-label', labels.onPageNavigation || 'On this page');
  if (isAuthoring()) return;

  const links = [...list.querySelectorAll('a[href*="#"]')];
  const targets = links
    .map((a) => ({ a, el: document.getElementById(decodeURIComponent(a.hash.slice(1))) }))
    .filter((t) => t.el);

  // mobile: a disclosure button that shows the current section and opens the list
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'anchor-nav-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = links[0]?.textContent.trim() || '';
  block.prepend(toggle);
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    block.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  block.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && block.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  links.forEach((a) => a.addEventListener('click', () => setOpen(false)));

  const activate = (target) => {
    links.forEach((a) => {
      const on = a === target;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
    if (target) toggle.textContent = target.textContent.trim();
  };

  // scroll-spy: the last target whose top has passed below the bar
  const section = block.closest('.section');
  const spy = () => {
    const offset = (section?.offsetHeight || 80) + 8;
    let current = null;
    targets.forEach((t) => {
      const box = t.el.getBoundingClientRect();
      // sections are display:none until loaded; an unrendered target is never "passed"
      if (box.height && box.top - offset <= 0) current = t.a;
    });
    activate(current);
    section?.classList.toggle('is-stuck', section.getBoundingClientRect().top <= 0 && window.scrollY > 0);
  };
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      spy();
      ticking = false;
    });
  }, { passive: true });
  spy();
}
