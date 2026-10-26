/*
 * Case Study List — sustainable-investing case studies from a sheet (/data/case-studies).
 * Rows: [Source | /data/case-studies.json] [Page Size | 9]. Sheet columns: title, tags
 * (comma list), image, alt, link, order. Tag pills filter the list (every selected tag must
 * match); the sort select orders by the source's "newest" order or by title.
 */
import { isAuthoring } from '../../scripts/scripts.js';
import {
  el, fetchSheet, guardLinks, labels, picture, readRows, splitList,
} from '../../scripts/discovery.js';

const KEYS = ['source', 'page size'];

export default async function decorate(block) {
  const authoring = isAuthoring();
  const { config } = readRows(block, KEYS);
  const [text, rows] = await Promise.all([
    labels(), fetchSheet(config.source || '/data/case-studies.json'),
  ]);
  const pageSize = parseInt(config['page size'], 10) || 9;
  const items = rows.filter((r) => r.title).map((r, i) => ({
    ...r, tagList: [...new Set(splitList(r.tags))], rank: Number(r.order) || i + 1,
  }));
  const state = { tags: [], sort: 'newest', shown: pageSize };

  const count = el('h2', { class: 'case-study-list-count', role: 'status' });
  const sort = el(
    'select',
    { class: 'case-study-list-sort', 'aria-label': text.sortBy },
    [['newest', text.newest], ['oldest', text.oldest], ['az', text.alphaAsc], ['za', text.alphaDesc]]
      .map(([value, label]) => el('option', { value }, label)),
  );
  const applied = el('div', { class: 'case-study-list-applied' });
  const list = el('ul', { class: 'case-study-list-cards' });
  const more = el('button', { type: 'button', class: 'case-study-list-more button secondary' }, text.viewMore);

  const pill = (tag, active) => el(
    'li',
    {},
    el('button', {
      type: 'button', class: 'case-study-list-pill', 'data-tag': tag, 'aria-pressed': String(active),
    }, tag),
  );

  const render = () => {
    const hits = items.filter((r) => state.tags.every((t) => r.tagList.includes(t)));
    const order = {
      newest: (a, b) => a.rank - b.rank,
      oldest: (a, b) => b.rank - a.rank,
      az: (a, b) => a.title.localeCompare(b.title),
      za: (a, b) => b.title.localeCompare(a.title),
    }[state.sort];
    hits.sort(order);
    count.textContent = `${hits.length} ${text.results}`;
    applied.replaceChildren(...(state.tags.length ? [
      el('ul', { class: 'case-study-list-pills' }, state.tags.map((t) => pill(t, true))),
      el('button', { type: 'button', class: 'case-study-list-clear' }, text.clearAll),
    ] : []));
    list.replaceChildren(...hits.slice(0, state.shown).map((r) => el(
      'li',
      { class: 'case-study-list-card' },
      el('div', { class: 'case-study-list-image' }, picture(r.image, r.alt || '', false, 750)),
      el(
        'div',
        { class: 'case-study-list-body' },
        el('h3', { class: 'case-study-list-title' }, el('a', { href: r.link }, r.title)),
        el('ul', { class: 'case-study-list-pills' }, r.tagList.map((t) => pill(t, state.tags.includes(t)))),
        el('p', { class: 'case-study-list-read' }, el('a', { href: r.link, class: 'case-study-list-read-link', 'aria-label': `${text.readMore}: ${r.title}` }, text.readMore)),
      ),
    )));
    more.hidden = hits.length <= state.shown;
  };

  block.addEventListener('click', (event) => {
    const target = event.target.closest('.case-study-list-pill, .case-study-list-clear');
    if (!target) return;
    const { tag } = target.dataset;
    if (!tag) state.tags = [];
    else if (state.tags.includes(tag)) state.tags = state.tags.filter((t) => t !== tag);
    else state.tags = [...state.tags, tag];
    state.shown = pageSize;
    render();
  });
  sort.addEventListener('change', () => {
    state.sort = sort.value;
    render();
  });
  more.addEventListener('click', () => {
    state.shown += pageSize;
    render();
  });

  block.append(
    el(
      'div',
      { class: 'case-study-list-bar' },
      count,
      el('label', { class: 'case-study-list-sort-label' }, el('span', {}, text.sortBy), sort),
    ),
    applied,
    list,
    more,
  );
  render();
  guardLinks(block, authoring);
}
