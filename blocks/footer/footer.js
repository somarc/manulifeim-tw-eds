import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/*
 * Footer from the DA document /footer:
 *   section 1: logo picture + link list
 *   section 2: copyright paragraphs + bold legal link list
 * Authored nodes are moved, not rebuilt; only classes are added.
 */

function isExternal(a) {
  try {
    const { hostname, origin } = new URL(a.href, window.location.href);
    return origin !== window.location.origin && !/(^|\.)manulifeim\.com$/.test(hostname);
  } catch (e) {
    return false;
  }
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);
  if (!fragment) return;

  const [upper, lower] = fragment.querySelectorAll(':scope > .section');
  const parts = [];

  if (upper) {
    const row = document.createElement('div');
    row.className = 'footer-upper';
    const logo = upper.querySelector('picture')?.closest('p') || upper.querySelector('picture');
    if (logo) {
      logo.classList.add('footer-logo');
      row.append(logo);
    }
    const menu = upper.querySelector('ul');
    if (menu) {
      const nav = document.createElement('nav');
      nav.className = 'footer-menu';
      nav.setAttribute('aria-label', 'Footer navigation');
      nav.append(menu);
      row.append(nav);
    }
    parts.push(row);
  }

  if (lower) {
    const divider = document.createElement('hr');
    divider.className = 'footer-divider';
    const legal = document.createElement('div');
    legal.className = 'footer-legal';
    legal.append(...lower.querySelectorAll(':scope > div > *'));
    legal.querySelectorAll(':scope > ul').forEach((ul) => ul.classList.add('footer-legal-links'));
    parts.push(divider, legal);
  }

  // the footer is chrome: strip default-content button classes from standalone links
  parts.forEach((part) => {
    part.querySelectorAll('.button, .link-cta').forEach((a) => a.classList.remove('button', 'primary', 'secondary', 'link-cta'));
    part.querySelectorAll('.button-wrapper, .link-cta-wrapper').forEach((p) => p.classList.remove('button-wrapper', 'link-cta-wrapper'));
    part.querySelectorAll('a[href]').forEach((a) => {
      if (!isExternal(a)) return;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('aria-label', `${a.textContent.trim()} (opens in a new tab)`);
    });
  });

  block.replaceChildren(...parts);
}
