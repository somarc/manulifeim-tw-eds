/*
 * Viewpoint List — filterable listing of viewpoints (/viewpoints/all).
 * Rows: optional [h1 title]; config [Source | /viewpoints/] [Type | article]
 * [Page Size | 9] [Source Index | …]. Filters (authors, asset managers, categories, tags) are
 * native selects built from the content index + /data/authors and mirrored in the URL
 * (?authors=&am=&category=&tags=) so tag/category/author links elsewhere land pre-filtered.
 */
import { isAuthoring } from '../../scripts/scripts.js';
import {
  el, fetchAuthors, filterRows, formatDate, guardLinks, indexRows, labels, picture, readRows,
  splitList, toId,
} from '../../scripts/discovery.js';

const KEYS = ['source', 'type', 'page size', 'source index'];
const PARAMS = ['authors', 'am', 'category', 'tags'];

function options(rows, authors) {
  const sets = {
    authors: new Map(), am: new Map(), category: new Map(), tags: new Map(),
  };
  rows.forEach((row) => {
    splitList(row.authors).forEach((id) => {
      const person = authors.get(toId(id));
      sets.authors.set(toId(id), person?.name || id);
      if (person?.company) sets.am.set(toId(person.company), person.company);
    });
    if (row.category) sets.category.set(toId(row.category), row.category);
    splitList(row.tags).forEach((tag) => sets.tags.set(toId(tag), tag));
  });
  return Object.fromEntries(Object.entries(sets).map(([key, map]) => [
    key, [...map.entries()].sort((a, b) => a[1].localeCompare(b[1])),
  ]));
}

function matches(row, filters, authors) {
  const ids = splitList(row.authors).map(toId);
  if (filters.authors && !ids.includes(filters.authors)) return false;
  if (filters.am && !ids.some((id) => toId(authors.get(id)?.company) === filters.am)) return false;
  if (filters.category && toId(row.category) !== filters.category) return false;
  if (filters.tags && !splitList(row.tags).map(toId).includes(filters.tags)) return false;
  return true;
}

function card(row, authors, text) {
  const people = splitList(row.authors).map((id) => authors.get(toId(id))).filter(Boolean);
  return el(
    'li',
    { class: 'viewpoint-list-card' },
    el('div', { class: 'viewpoint-list-image' }, picture(row.image, '', false, 750)),
    el(
      'div',
      { class: 'viewpoint-list-body' },
      row.date ? el('p', { class: 'viewpoint-list-date' }, el('time', { datetime: row.date }, formatDate(row.date))) : null,
      el('h2', { class: 'viewpoint-list-title' }, el('a', { href: row.path }, row.title)),
      people.length ? el('ul', { class: 'viewpoint-list-authors' }, people.map((a) => el(
        'li',
        {},
        el('span', { class: 'viewpoint-list-photo' }, picture(a.photo, '', false, 96)),
        el(
          'span',
          {},
          el('a', { href: `?authors=${encodeURIComponent(a.id)}`, class: 'viewpoint-list-author' }, a.name),
          a.company ? el('a', { href: `?am=${encodeURIComponent(toId(a.company))}`, class: 'viewpoint-list-am' }, a.company) : null,
        ),
      ))) : null,
      row.description ? el('p', { class: 'viewpoint-list-description' }, row.description) : null,
      el('p', { class: 'viewpoint-list-more' }, el('a', { href: row.path, class: 'link-cta', 'aria-label': `${text.readMore}: ${row.title}` }, text.readMore)),
    ),
  );
}

export default async function decorate(block) {
  const authoring = isAuthoring();
  const { config } = readRows(block, KEYS);
  [...block.children].find((row) => row.querySelector('h1'))?.classList.add('viewpoint-list-header');
  const [text, authors, all] = await Promise.all([
    labels(), fetchAuthors(), indexRows(config['source index']),
  ]);
  const rows = filterRows(all, { source: config.source || '/viewpoints/', type: config.type || 'article' });
  const pageSize = parseInt(config['page size'], 10) || 9;
  const choices = options(rows, authors);
  const params = new URLSearchParams(window.location.search);
  const filters = Object.fromEntries(PARAMS.map((p) => [p, toId(params.get(p) || '')]));
  let shown = pageSize;

  const names = {
    authors: text.authors, am: text.assetManagers, category: text.categories, tags: text.tags,
  };
  const selects = PARAMS.map((key) => {
    const select = el(
      'select',
      { class: 'viewpoint-list-select', name: key, 'aria-label': names[key] },
      el('option', { value: '' }, names[key]),
      choices[key].map(([value, label]) => el('option', { value }, label)),
    );
    // keep a pre-filter from the URL even when no indexed row carries it (honest empty state)
    if (filters[key] && !choices[key].some(([v]) => v === filters[key])) {
      select.append(el('option', { value: filters[key] }, params.get(key)));
    }
    select.value = filters[key];
    return select;
  });
  const clear = el('button', { type: 'button', class: 'viewpoint-list-clear' }, text.clearAll);
  const count = el('p', { class: 'viewpoint-list-count', role: 'status' });
  const list = el('ul', { class: 'viewpoint-list-cards' });
  const more = el('button', { type: 'button', class: 'viewpoint-list-load button secondary' }, text.viewMore);

  const render = () => {
    const hits = rows.filter((row) => matches(row, filters, authors));
    count.textContent = hits.length ? `${hits.length} ${text.listings}` : text.noResults;
    list.replaceChildren(...hits.slice(0, shown).map((row) => card(row, authors, text)));
    more.hidden = hits.length <= shown;
  };
  const sync = () => {
    const url = new URL(window.location.href);
    PARAMS.forEach((p) => {
      if (filters[p]) url.searchParams.set(p, filters[p]);
      else url.searchParams.delete(p);
    });
    if (!authoring) window.history.replaceState(null, '', url);
    shown = pageSize;
    render();
  };
  selects.forEach((select) => select.addEventListener('change', () => {
    filters[select.name] = select.value;
    sync();
  }));
  clear.addEventListener('click', () => {
    PARAMS.forEach((p) => { filters[p] = ''; });
    selects.forEach((s) => { s.value = ''; });
    sync();
  });
  more.addEventListener('click', () => {
    shown += pageSize;
    render();
  });

  // phones: the selects fold behind a "Filter" button, as on the source
  const selectsBox = el('div', { class: 'viewpoint-list-selects', id: 'viewpoint-list-selects' }, selects);
  const toggle = el('button', {
    type: 'button', class: 'viewpoint-list-toggle', 'aria-expanded': 'false', 'aria-controls': selectsBox.id,
  }, text.filter);
  toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
  });

  block.append(
    el('div', { class: 'viewpoint-list-filters' }, toggle, selectsBox, clear),
    el('div', { class: 'viewpoint-list-results' }, count, list, more),
  );
  render();
  guardLinks(block, authoring);
}
