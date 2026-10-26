/*
 * Press List — press releases with category tabs, a media-contact sidebar and a pager.
 * Rows:
 *   [Contact | h3, p, h4 Email, p mailto, h4 Phone, p tel]   -> sidebar (authored, kept in place)
 *   [Tabs | Press releases, Archive, Other]                    -> tab labels (category values)
 *   [Page Size | 10] [Source Index | …]                         -> config
 *   [YYYY-MM-DD | <a href=…>Title</a> | Category]               -> releases not in the index
 * Migrated releases come from the content index (Type: press); authored rows cover releases
 * that only exist on the source. The tab and page live in the URL (?tab=archive&page=2).
 */
import { isAuthoring } from '../../scripts/scripts.js';
import {
  dateKey, el, formatDate, guardLinks, indexRows, labels, pathOf, readRows, splitList, toId,
} from '../../scripts/discovery.js';

const KEYS = ['contact', 'tabs', 'page size', 'source index'];

function authoredItems(rows) {
  let lastDate = '';
  return rows.map((row) => {
    const cells = [...row.children];
    const link = row.querySelector('a[href]');
    if (!link || cells.length < 2) return null;
    const date = cells[0].textContent.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) lastDate = date;
    row.dataset.config = 'item';
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
      sortDate: lastDate,
      title: link.textContent.trim(),
      path: link.getAttribute('href'),
      category: cells[2]?.textContent.trim() || '',
    };
  }).filter(Boolean);
}

function pager(total, current, go, text) {
  if (total <= 1) return null;
  const button = (label, page, { dir, ...attrs } = {}) => el('li', {}, el('button', {
    type: 'button', class: `press-list-page${dir ? ' press-list-dir' : ''}`, 'data-page': page, ...attrs,
  }, label));
  const nav = el(
    'nav',
    { class: 'press-list-pager', 'aria-label': text.page },
    el(
      'ul',
      {},
      button(text.previous, current - 1, { dir: true, disabled: current <= 1 }),
      Array.from({ length: total }, (_, i) => button(String(i + 1), i + 1, {
        'aria-current': i + 1 === current ? 'page' : null, 'aria-label': `${text.page} ${i + 1}`,
      })),
      button(text.next, current + 1, { dir: true, disabled: current >= total }),
    ),
  );
  nav.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-page]');
    if (target && !target.disabled) go(Number(target.dataset.page));
  });
  return nav;
}

export default async function decorate(block) {
  const authoring = isAuthoring();
  const { config, items } = readRows(block, KEYS);
  const contactRow = config['contact:cell']?.parentElement;
  if (contactRow) {
    delete contactRow.dataset.config;
    contactRow.classList.add('press-list-contact');
  }
  const [text, rows] = await Promise.all([labels(), indexRows(config['source index'])]);
  const tabs = splitList(config.tabs || text.typePress);
  const pageSize = parseInt(config['page size'], 10) || 10;

  const indexed = rows.filter((r) => toId(r.type) === 'press')
    .map((r) => ({ ...r, sortDate: dateKey(r) }));
  const known = new Set(indexed.map((r) => pathOf(r.path)));
  const all = [...indexed, ...authoredItems(items).filter((r) => !known.has(pathOf(r.path)))]
    .map((r, i) => ({ ...r, order: i }))
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.order - b.order);

  const params = new URLSearchParams(window.location.search);
  const state = {
    tab: Math.max(0, tabs.findIndex((t) => toId(t) === params.get('tab'))),
    page: Math.max(1, parseInt(params.get('page'), 10) || 1),
  };

  const tablist = el('div', { class: 'press-list-tabs', role: 'tablist' });
  const list = el('ol', { class: 'press-list-items' });
  const results = el('div', { class: 'press-list-results', role: 'tabpanel' }, list);
  const tabButtons = tabs.map((label, i) => {
    const tab = el('button', { type: 'button', role: 'tab', class: 'press-list-tab' }, label);
    tab.addEventListener('click', () => {
      state.tab = i;
      state.page = 1;
      // eslint-disable-next-line no-use-before-define
      render(true);
    });
    tablist.append(tab);
    return tab;
  });

  function render(push) {
    const category = toId(tabs[state.tab]);
    const hits = all.filter((r) => !tabs.length || toId(r.category) === category);
    const pages = Math.max(1, Math.ceil(hits.length / pageSize));
    state.page = Math.min(state.page, pages);
    tabButtons.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === state.tab));
      tab.tabIndex = i === state.tab ? 0 : -1;
    });
    list.replaceChildren(...hits.slice((state.page - 1) * pageSize, state.page * pageSize)
      .map((r) => el(
        'li',
        { class: 'press-list-item' },
        r.date ? el('p', { class: 'press-list-date' }, el('time', { datetime: r.date }, formatDate(r.date))) : null,
        el('h2', { class: 'press-list-title' }, el('a', { href: r.path }, r.title)),
        el('p', { class: 'press-list-more' }, el('a', { href: r.path, class: 'link-cta', 'aria-label': `${text.readMore}: ${r.title}` }, text.readMore)),
      )));
    results.querySelector('.press-list-pager')?.remove();
    const nav = pager(pages, state.page, (page) => {
      state.page = page;
      render(true);
      block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, text);
    if (nav) results.append(nav);
    if (push && !authoring) {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', category);
      if (state.page > 1) url.searchParams.set('page', state.page);
      else url.searchParams.delete('page');
      window.history.replaceState(null, '', url);
    }
  }

  const body = el('div', { class: 'press-list-body' });
  if (contactRow) body.append(contactRow);
  body.append(results);
  block.prepend(tablist);
  block.append(body);
  render(false);
  guardLinks(block, authoring);
}
