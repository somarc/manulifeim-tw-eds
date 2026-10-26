/*
 * Shared helpers for the discovery surfaces (article template, article-cards, viewpoint-list,
 * press-list, case-study-list, browse-by, search). Blocks may not import each other, so the
 * common index/author/teaser plumbing lives here.
 */
import { createOptimizedPicture, toClassName } from './aem.js';
import { fetchIndex, fetchPlaceholders } from './scripts.js';

/** English fallbacks for every /placeholders key the discovery blocks use. */
const LABELS = {
  readMore: 'Read more',
  readBio: 'Read bio',
  share: 'Share',
  shareLinkedin: 'LinkedIn',
  shareFacebook: 'Facebook',
  shareX: 'X',
  shareEmail: 'Email',
  copyLink: 'Copy link',
  linkCopied: 'Link copied',
  download: 'Download',
  category: 'Category',
  tags: 'Tags',
  gridView: 'Grid view',
  listView: 'List view',
  authors: 'Authors',
  assetManagers: 'Asset managers',
  categories: 'Categories',
  clearAll: 'Clear all',
  listings: 'listings',
  noResults: 'There are no viewpoints that match your filters',
  previous: 'Previous',
  next: 'Next',
  page: 'Page',
  results: 'results match your search',
  sortBy: 'Sort by:',
  newest: 'Newest',
  oldest: 'Oldest',
  alphaAsc: 'A-Z',
  alphaDesc: 'Z-A',
  relevance: 'Relevance',
  searchPlaceholder: 'Search',
  searchLabel: 'Search the site',
  searchButton: 'Search',
  searchResultsFor: 'for',
  searchSummary: 'Results {start}-{end} of {total}',
  perPage: 'Results per page',
  searchEmpty: 'No results match your search. Try different keywords or remove filters.',
  type: 'Page type',
  filter: 'Filter',
  allItems: 'All',
  browseBy: 'Browse by',
  browseAuthors: 'Browse articles by author',
  browseCategories: 'Browse articles by category',
  browseTags: 'Browse articles by tag',
  alphabetical: 'Alphabetical',
  recentlyPosted: 'Recently posted',
  mostArticles: 'Most articles',
  viewMore: 'View more',
  viewLess: 'View less',
  mediaRelations: 'Media relations',
  typeArticle: 'Viewpoints',
  typePress: 'Press releases',
  typePage: 'General',
};

/**
 * Labels from the /placeholders sheet (keys as in LABELS, case-insensitive), with fallbacks.
 * @returns {Promise<Object<string,string>>}
 */
export async function labels() {
  const sheet = await fetchPlaceholders();
  const lower = Object.fromEntries(Object.entries(sheet).map(([k, v]) => [k.toLowerCase(), v]));
  return Object.fromEntries(Object.entries(LABELS)
    .map(([key, text]) => [key, lower[key.toLowerCase()] || text]));
}

/** "a, b ,c" -> ['a', 'b', 'c'] */
export function splitList(value) {
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

export const toId = (value) => toClassName(String(value || '').trim());

/** ISO date (YYYY-MM-DD) or epoch -> "October 23, 2026"; empty for anything unparsable. */
export function formatDate(value) {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}/.test(value)
    ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
    : new Date(Number(value) * (Number(value) < 1e11 ? 1000 : 1));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric',
  });
}

/** Sortable key for an ISO date (empty dates sort last when descending). */
export const dateKey = (row) => String(row?.date || '').slice(0, 10);

/** Rows of any previewed sheet (cached). */
const sheetCache = new Map();
export function fetchSheet(url) {
  if (!sheetCache.has(url)) {
    const sep = url.includes('?') ? '&' : '?';
    sheetCache.set(url, fetch(`${url}${sep}limit=5000`)
      .then((resp) => (resp.ok ? resp.json() : { data: [] }))
      .then((json) => json.data || [])
      .catch(() => []));
  }
  return sheetCache.get(url);
}

/** Content index rows: the default site index, or an explicit sheet from a block config row. */
export function indexRows(source) {
  return source ? fetchSheet(source) : fetchIndex();
}

/** Authors sheet keyed by id. */
let authorsPromise;
export function fetchAuthors() {
  authorsPromise ||= fetchSheet('/data/authors.json')
    .then((rows) => new Map(rows.filter((r) => r.id).map((r) => [toId(r.id), r])));
  return authorsPromise;
}

/** Normalised path for matching links to index rows. */
export function pathOf(href) {
  try {
    const url = new URL(href, window.location.href);
    return url.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  } catch (e) {
    return href;
  }
}

/** Generated picture: optimized for same-site media, plain <img> for absolute sources. */
export function picture(src, alt = '', eager = false, width = 750) {
  if (!src) return null;
  if (/^https?:/.test(src) && !src.startsWith(window.location.origin)) {
    const pic = document.createElement('picture');
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.loading = eager ? 'eager' : 'lazy';
    pic.append(img);
    return pic;
  }
  return createOptimizedPicture(src, alt, eager, [{ width: String(width) }]);
}

/** Element helper: el('a', { href, class: 'x' }, child, 'text') */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  children.flat().forEach((child) => {
    if (child !== null && child !== undefined && child !== '') node.append(child);
  });
  return node;
}

/**
 * Split a block into config rows (2 cells, first cell a known key) and item rows.
 * Config rows stay in the DOM (they are the authored, editable surface) and get
 * `data-config` so CSS hides them on the published page and shows them in Canvas.
 * @param {Element} block
 * @param {string[]} keys lower-case config keys
 */
export function readRows(block, keys) {
  const config = {};
  const items = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = cells[0]?.textContent.trim().toLowerCase();
    if (cells.length >= 2 && keys.includes(key)) {
      const cell = cells[1];
      const link = cell.querySelector('a[href]');
      config[key] = (link && !cell.querySelector('li') ? link.getAttribute('href') : cell.textContent).trim();
      config[`${key}:cell`] = cell;
      row.dataset.config = key;
    } else {
      items.push(row);
    }
  });
  return { config, items };
}

/** Index rows narrowed by the common Source/Type/Category/Tags/Authors config keys. */
export function filterRows(rows, config = {}) {
  const source = config.source ? pathOf(config.source) : '';
  const type = splitList(config.type).map(toId);
  const category = splitList(config.category).map(toId);
  const tags = splitList(config.tags).map(toId);
  const authors = splitList(config.authors).map(toId);
  const exclude = pathOf(window.location.pathname);
  const any = (value, wanted) => !wanted.length
    || splitList(value).map(toId).some((v) => wanted.includes(v));
  return rows.filter((row) => {
    if (!row.path || pathOf(row.path) === exclude) return false;
    if (source && source !== '/' && !`${pathOf(row.path)}/`.startsWith(`${source}/`)) return false;
    return any(row.type, type) && any(row.category, category)
      && any(row.tags, tags) && any(row.authors, authors);
  }).sort((a, b) => dateKey(b).localeCompare(dateKey(a)));
}

/**
 * Author line(s) for a teaser: name (bold), position, company; optional 40px photo and links.
 * @param {string[]} ids
 * @param {Map} authors
 */
export function authorList(ids, authors, { photos = false, links = false } = {}) {
  const people = ids.map((id) => authors.get(id)).filter(Boolean);
  if (!people.length) return null;
  return el('ul', { class: 'teaser-authors' }, people.map((a) => {
    const href = `/viewpoints/all?authors=${encodeURIComponent(a.id)}`;
    const name = links
      ? el('a', { href, class: 'teaser-author-name' }, a.name)
      : el('strong', { class: 'teaser-author-name' }, a.position ? `${a.name},` : a.name);
    return el(
      'li',
      { class: 'teaser-author' },
      photos && a.photo ? el('span', { class: 'teaser-author-photo' }, picture(a.photo, '', false, 96)) : null,
      el(
        'span',
        { class: 'teaser-author-text' },
        name,
        a.position && !links ? el('span', { class: 'teaser-author-position' }, ` ${a.position}`) : null,
        a.company ? el('span', { class: 'teaser-author-company' }, a.company) : null,
      ),
    );
  }));
}

/** In Canvas generated links must not navigate (authors click to select, not to leave). */
export function guardLinks(root, authoring) {
  if (!authoring) return;
  root.addEventListener('click', (event) => {
    if (event.target.closest('a[href]')) event.preventDefault();
  });
}
