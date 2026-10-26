/*
 * Template: article (Metadata `Template: article`; `Type: article | press`).
 * Runs before section decoration. Authored sections stay intact; the template only
 *  - classifies them (header with the H1, body, footer with related cards / tag cloud),
 *  - adds the date from metadata above the H1 (generated, not editable),
 *  - builds a generated sidebar <aside> (authors, asset manager, share, category, tags)
 *    from page metadata and /data/authors. The aside is not a section, so no block
 *    decoration touches it, and in Canvas it is inert (nothing to edit, nothing navigates).
 */
import { getMetadata } from '../../scripts/aem.js';
import { isAuthoring } from '../../scripts/scripts.js';
import {
  el, fetchAuthors, formatDate, labels, picture, splitList, toId,
} from '../../scripts/discovery.js';

const FOOTER_BLOCKS = 'div.article-cards, div.tag-cloud, a[href*="/fragments/"]';

function metaAll(property) {
  return [...document.head.querySelectorAll(`meta[property="${property}"], meta[name="${property}"]`)]
    .flatMap((m) => splitList(m.content));
}

function shareLinks(text) {
  const url = window.location.href.split(/[?#]/)[0];
  const title = getMetadata('og:title') || document.title;
  const enc = encodeURIComponent;
  const external = { target: '_blank', rel: 'noopener noreferrer' };
  const item = (name, label, attrs) => el(
    'li',
    { class: `share-${name}` },
    el(attrs.href ? 'a' : 'button', {
      ...attrs, class: 'share-link', title: label, 'aria-label': attrs.target ? `${label} (opens in a new tab)` : label, type: attrs.href ? undefined : 'button',
    }, el('span', { class: 'share-caption' }, label)),
  );
  const list = el(
    'ul',
    { class: 'share-list' },
    item('linkedin', text.shareLinkedin, { href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`, ...external }),
    item('facebook', text.shareFacebook, { href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, ...external }),
    item('x', text.shareX, { href: `https://x.com/intent/post?url=${enc(url)}&text=${enc(title)}`, ...external }),
    item('email', text.shareEmail, { href: `mailto:?subject=${enc(title)}&body=${enc(url)}` }),
    item('copy', text.copyLink, { 'data-url': url }),
    item('print', text.download, {}),
  );
  list.querySelector('.share-print button').addEventListener('click', () => window.print());
  const status = el('p', { class: 'share-status', role: 'status' });
  list.querySelector('.share-copy button').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = text.linkCopied;
    } catch (e) {
      status.textContent = url;
    }
  });
  return el('section', { class: 'article-share', 'aria-label': text.share }, el('h2', {}, text.share), list, status);
}

function linkList(title, values, param) {
  if (!values.length) return null;
  return el(
    'section',
    { class: `article-links article-${param}`, 'aria-label': title },
    el('h2', {}, title),
    el('ul', {}, values.map((value) => el(
      'li',
      {},
      el('a', { href: `/viewpoints/all?${param}=${encodeURIComponent(toId(value))}` }, value),
    ))),
  );
}

async function fillAuthors(slot, ids, text) {
  const authors = await fetchAuthors();
  const people = ids.map((id) => authors.get(id)).filter(Boolean);
  if (!people.length) {
    slot.remove();
    return;
  }
  slot.append(...people.map((a) => el(
    'div',
    { class: 'article-author' },
    el('span', { class: 'article-author-photo' }, picture(a.photo, a.name, false, 128)),
    el(
      'div',
      { class: 'article-author-text' },
      el('p', { class: 'article-author-name' }, `${a.name},`),
      a.position ? el('p', { class: 'article-author-position' }, a.position) : null,
      a.company ? el('p', { class: 'article-author-company' }, a.company) : null,
      a.link ? el('p', {}, el('a', { href: a.link, class: 'link-cta' }, text.readBio)) : null,
    ),
  )));
  // one card per asset manager (company) that has a logo, as on the source
  const managers = [...new Map(people.filter((a) => a.logo && a.company)
    .map((a) => [a.company, a])).values()];
  managers.forEach((a) => slot.after(el(
    'a',
    { class: 'article-manager', href: `/viewpoints/all?am=${encodeURIComponent(toId(a.company))}` },
    picture(a.logo, a.company, false, 400),
  )));
}

async function fillSidebar(aside) {
  const text = await labels();
  const ids = splitList(getMetadata('authors')).map(toId);
  const authorSlot = el('div', { class: 'article-authors' });
  aside.append(
    ids.length ? authorSlot : '',
    shareLinks(text),
    linkList(text.category, splitList(getMetadata('category')), 'category') || '',
    linkList(text.tags, [...new Set(metaAll('article:tag').concat(metaAll('tags')))], 'tags') || '',
  );
  if (ids.length) await fillAuthors(authorSlot, ids, text);
}

/**
 * @param {Element} main
 */
export default async function decorate(main) {
  const type = toId(getMetadata('type')) || 'article';
  const sections = [...main.querySelectorAll(':scope > div')];
  if (!sections.length) return;
  main.classList.add('article-main', `article-type-${type}`);

  const header = sections.find((s) => s.querySelector('h1')) || sections[0];
  header.classList.add('article-header');
  const footers = sections.filter((s) => s !== header && s.querySelector(FOOTER_BLOCKS));
  footers.forEach((s) => s.classList.add('article-footer'));
  const body = sections.filter((s) => s !== header && !footers.includes(s));
  body.forEach((s) => s.classList.add('article-body'));

  const iso = getMetadata('date');
  const date = formatDate(iso);
  if (date) {
    const time = el('time', { datetime: iso.slice(0, 10) }, date);
    const h1 = header.querySelector('h1');
    (h1 || header.firstElementChild).before(el('p', { class: 'article-date' }, time));
  }

  if (type !== 'article') return;
  // generated sidebar: placed now (layout), filled without blocking LCP
  const sidebar = el('aside', { class: 'article-sidebar' });
  sidebar.style.setProperty('--article-body-rows', String(Math.max(body.length, 1)));
  if (isAuthoring()) sidebar.inert = true;
  (body[body.length - 1] || header).after(sidebar);
  fillSidebar(sidebar);
}
