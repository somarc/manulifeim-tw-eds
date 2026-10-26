/*
 * Search — client-side search over the content index (/data/content-index via fetchIndex()).
 * Rows: optional [Source Index | …]. Query from ?q= (the header search box submits there;
 * legacy #q= links are honoured). Searches title, description, tags, category and author
 * names; facets: page type, category, tags, author; sort: relevance, newest, A–Z, Z–A;
 * 10/25/50 per page with a numbered pager. All state lives in the URL.
 */
import { isAuthoring } from '../../scripts/scripts.js';
import {
  dateKey, el, fetchAuthors, formatDate, guardLinks, indexRows, labels, readRows, splitList, toId,
} from '../../scripts/discovery.js';

const KEYS = ['source index'];
const FACETS = ['type', 'category', 'tags', 'author'];
const PER_PAGE = [10, 25, 50];

function terms(query) {
  return query.toLowerCase().split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}&-]/gu, '')).filter(Boolean);
}

/** Text with each query term wrapped in <strong>, built from text nodes (no HTML parsing). */
function highlight(text, words) {
  if (!words.length) return [text];
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return parts.map((part, i) => (i % 2 ? el('strong', {}, part) : part)).filter(Boolean);
}

function score(doc, words) {
  if (!words.length) return 1;
  let total = 0;
  const fields = [
    [doc.title, 6], [doc.tagText, 3], [doc.category, 3], [doc.authorText, 2], [doc.description, 1],
  ];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const hit = fields.reduce((sum, [value, weight]) => {
      const text = String(value || '').toLowerCase();
      if (!text.includes(word)) return sum;
      return sum + weight * (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text) ? 2 : 1);
    }, 0);
    if (!hit) return 0; // every term must match somewhere
    total += hit;
  }
  if (String(doc.title).toLowerCase().includes(words.join(' '))) total += 10;
  return total;
}

export default async function decorate(block) {
  const authoring = isAuthoring();
  const { config } = readRows(block, KEYS);
  // the authored page heading (a row with an H1) stays in place, visually hidden when published
  [...block.children].find((row) => row.querySelector('h1'))?.classList.add('search-heading');
  const [text, authors, rows] = await Promise.all([
    labels(), fetchAuthors(), indexRows(config['source index']),
  ]);
  const typeLabel = (type) => ({ article: text.typeArticle, press: text.typePress })[toId(type)]
    || text.typePage;

  const docs = rows.filter((r) => r.path && r.title).map((r) => {
    const authorIds = splitList(r.authors).map(toId);
    const authorNames = authorIds.map((id) => authors.get(id)?.name || id);
    return {
      ...r,
      typeName: typeLabel(r.type),
      tagList: splitList(r.tags),
      tagText: splitList(r.tags).join(' '),
      authorNames,
      authorText: authorNames.join(' '),
    };
  });

  const url = new URL(window.location.href);
  const hashQuery = new URLSearchParams(url.hash.slice(1)).get('q');
  const state = {
    q: url.searchParams.get('q') || hashQuery || '',
    sort: url.searchParams.get('sort') || 'relevance',
    page: parseInt(url.searchParams.get('page'), 10) || 1,
    size: PER_PAGE.includes(Number(url.searchParams.get('size'))) ? Number(url.searchParams.get('size')) : 10,
    facets: Object.fromEntries(FACETS.map((f) => [f, url.searchParams.getAll(f)])),
  };

  const input = el('input', {
    type: 'search', name: 'q', class: 'search-input', placeholder: text.searchPlaceholder, 'aria-label': text.searchLabel, value: state.q,
  });
  const form = el(
    'form',
    { class: 'search-form', role: 'search', action: window.location.pathname },
    input,
    el('button', { type: 'submit', class: 'search-submit', 'aria-label': text.searchButton }),
  );
  const facetsEl = el('aside', { class: 'search-facets', 'aria-label': text.filter });
  const summary = el('p', { class: 'search-summary', role: 'status', 'aria-live': 'polite' });
  const sort = el(
    'select',
    { class: 'search-sort', 'aria-label': text.sortBy },
    [['relevance', text.relevance], ['newest', text.newest], ['az', text.alphaAsc], ['za', text.alphaDesc]]
      .map(([value, label]) => el('option', { value }, label)),
  );
  sort.value = state.sort;
  const chips = el('div', { class: 'search-chips' });
  const results = el('ol', { class: 'search-results' });
  const footer = el('div', { class: 'search-footer' });

  const valuesOf = (doc, facet) => ({
    type: [doc.typeName],
    category: doc.category ? [doc.category] : [],
    tags: doc.tagList,
    author: doc.authorNames,
  })[facet];

  const sync = () => {
    if (authoring) return;
    const next = new URL(window.location.href);
    next.hash = '';
    ['q', 'sort', 'page', 'size', ...FACETS].forEach((k) => next.searchParams.delete(k));
    if (state.q) next.searchParams.set('q', state.q);
    if (state.sort !== 'relevance') next.searchParams.set('sort', state.sort);
    if (state.page > 1) next.searchParams.set('page', state.page);
    if (state.size !== 10) next.searchParams.set('size', state.size);
    FACETS.forEach((f) => state.facets[f].forEach((v) => next.searchParams.append(f, v)));
    window.history.replaceState(null, '', next);
  };

  function render() {
    const words = terms(state.q);
    const matched = docs.map((d) => ({ doc: d, score: score(d, words) }))
      .filter((m) => m.score > 0);
    const inFacets = (doc, skip) => FACETS.every((f) => f === skip || !state.facets[f].length
      || valuesOf(doc, f).some((v) => state.facets[f].includes(v)));
    const hits = matched.filter((m) => inFacets(m.doc));
    const order = {
      relevance: (a, b) => b.score - a.score || dateKey(b.doc).localeCompare(dateKey(a.doc)),
      newest: (a, b) => dateKey(b.doc).localeCompare(dateKey(a.doc)),
      az: (a, b) => a.doc.title.localeCompare(b.doc.title),
      za: (a, b) => b.doc.title.localeCompare(a.doc.title),
    }[state.sort] || ((a, b) => b.score - a.score);
    hits.sort(order);
    const pages = Math.max(1, Math.ceil(hits.length / state.size));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * state.size;
    const pageHits = hits.slice(start, start + state.size);

    // facets: counts reflect the query and the other facets
    facetsEl.replaceChildren(...FACETS.map((facet) => {
      const counts = new Map();
      matched.filter((m) => inFacets(m.doc, facet)).forEach((m) => valuesOf(m.doc, facet)
        .forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
      if (!counts.size) return '';
      const title = {
        type: text.type, category: text.category, tags: text.tags, author: text.authors,
      }[facet];
      return el(
        'fieldset',
        { class: 'search-facet' },
        el('legend', {}, title),
        [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value, n]) => el(
            'label',
            { class: 'search-facet-option' },
            el('input', {
              type: 'checkbox', name: facet, value, checked: state.facets[facet].includes(value),
            }),
            el('span', {}, value),
            el('span', { class: 'search-facet-count' }, `(${n})`),
          )),
      );
    }));

    summary.replaceChildren(...(hits.length
      ? [text.searchSummary.replace('{start}', start + 1).replace('{end}', start + pageHits.length)
        .replace('{total}', hits.length), state.q ? ` ${text.searchResultsFor} ` : '',
      state.q ? el('strong', {}, state.q) : '']
      : [text.searchEmpty]));
    const active = FACETS.flatMap((f) => state.facets[f].map((v) => [f, v]));
    chips.replaceChildren(...(active.length ? [
      ...active.map(([f, v]) => el('button', {
        type: 'button', class: 'search-chip', 'data-facet': f, 'data-value': v, 'aria-label': `${text.clearAll}: ${v}`,
      }, v)),
      el('button', { type: 'button', class: 'search-chip-clear' }, text.clearAll),
    ] : []));

    results.replaceChildren(...pageHits.map(({ doc }) => el(
      'li',
      { class: 'search-result' },
      el('p', { class: 'search-badges' }, el('span', { class: 'search-badge' }, doc.typeName), doc.category && doc.category !== doc.typeName ? el('span', { class: 'search-badge' }, doc.category) : null),
      el(
        'div',
        { class: 'search-result-main' },
        el('span', { class: 'search-result-icon', 'aria-hidden': 'true' }),
        el(
          'div',
          {},
          el('h2', { class: 'search-result-title' }, el('a', { href: doc.path }, ...highlight(doc.title, words))),
          doc.date ? el('p', { class: 'search-result-date' }, formatDate(doc.date)) : null,
          doc.description ? el('p', { class: 'search-result-excerpt' }, ...highlight(doc.description, words)) : null,
        ),
      ),
    )));

    const pageButton = (label, page, attrs = {}) => el('button', {
      type: 'button', class: 'search-page', 'data-page': page, ...attrs,
    }, label);
    footer.replaceChildren(
      el(
        'div',
        { class: 'search-per-page' },
        el('span', {}, text.perPage),
        PER_PAGE.map((n) => el('button', {
          type: 'button', class: 'search-size', 'data-size': n, 'aria-pressed': String(n === state.size),
        }, String(n))),
      ),
      pages > 1 ? el(
        'nav',
        { class: 'search-pager', 'aria-label': text.page },
        pageButton('‹', state.page - 1, { disabled: state.page <= 1, 'aria-label': text.previous }),
        Array.from({ length: pages }, (_, i) => pageButton(String(i + 1), i + 1, { 'aria-current': i + 1 === state.page ? 'page' : null })),
        pageButton('›', state.page + 1, { disabled: state.page >= pages, 'aria-label': text.next }),
      ) : '',
    );
    footer.hidden = !hits.length;
    sync();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = input.value.trim();
    state.page = 1;
    render();
  });
  sort.addEventListener('change', () => {
    state.sort = sort.value;
    state.page = 1;
    render();
  });
  facetsEl.addEventListener('change', (event) => {
    const box = event.target.closest('input[type=checkbox]');
    if (!box) return;
    const list = state.facets[box.name];
    state.facets[box.name] = box.checked
      ? [...list, box.value]
      : list.filter((v) => v !== box.value);
    state.page = 1;
    render();
  });
  block.addEventListener('click', (event) => {
    const chip = event.target.closest('.search-chip');
    const clear = event.target.closest('.search-chip-clear');
    const page = event.target.closest('.search-page');
    const size = event.target.closest('.search-size');
    if (chip) {
      const { facet, value } = chip.dataset;
      state.facets[facet] = state.facets[facet].filter((v) => v !== value);
    } else if (clear) {
      FACETS.forEach((f) => { state.facets[f] = []; });
    } else if (page && !page.disabled) {
      state.page = Number(page.dataset.page);
      block.scrollIntoView({ block: 'start' });
    } else if (size) {
      state.size = Number(size.dataset.size);
    } else return;
    if (!page) state.page = 1;
    render();
  });

  block.append(
    facetsEl,
    el(
      'div',
      { class: 'search-main' },
      form,
      el('div', { class: 'search-bar' }, summary, el('label', { class: 'search-sort-label' }, el('span', {}, text.sortBy), sort)),
      chips,
      results,
      footer,
    ),
  );
  render();
  guardLinks(block, authoring);
}
