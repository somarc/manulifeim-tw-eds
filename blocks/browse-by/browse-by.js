/*
 * Browse By — tabbed index of authors, categories and tags (viewpoints hub).
 * Rows: [tab label][content]. Content is either a list of links (authored, kept as is) or a
 * link to a sheet (/data/authors.json): the author directory is then generated from it.
 * Each authored row becomes a tab panel in place; tab buttons are generated from the labels.
 * In Canvas every panel stays visible and nothing is generated over the authored cells.
 */
import { isAuthoring } from '../../scripts/scripts.js';
import {
  el, fetchSheet, guardLinks, labels, picture,
} from '../../scripts/discovery.js';

const VISIBLE = 9;

function authorItems(rows, sort) {
  const sorted = [...rows].filter((a) => a.id && a.name);
  if (sort === 'recent') sorted.sort((a, b) => String(b.posted).localeCompare(String(a.posted)));
  else if (sort === 'count') sorted.sort((a, b) => Number(b.articles || 0) - Number(a.articles || 0));
  else sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map((a) => el(
    'li',
    { class: 'browse-by-author' },
    el('span', { class: 'browse-by-photo' }, picture(a.photo, '', false, 96)),
    el(
      'span',
      { class: 'browse-by-author-text' },
      el('a', { href: `/viewpoints/all?authors=${encodeURIComponent(a.id)}` }, [a.name, a.position].filter(Boolean).join(', ')),
      a.company ? el('span', { class: 'browse-by-company' }, a.company) : null,
    ),
  ));
}

function moreToggle(list, text) {
  const button = el('button', { type: 'button', class: 'browse-by-more', 'aria-expanded': 'false' }, text.viewMore);
  const update = () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    [...list.children].forEach((li, i) => { li.hidden = !open && i >= VISIBLE; });
    button.textContent = open ? text.viewLess : text.viewMore;
    button.hidden = list.children.length <= VISIBLE;
  };
  button.addEventListener('click', () => {
    button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true'));
    update();
  });
  return { button, update };
}

export default async function decorate(block) {
  const authoring = isAuthoring();
  const text = await labels();
  const rows = [...block.children].filter((r) => r.children.length >= 2);
  const tablist = el('div', { class: 'browse-by-tabs', role: 'tablist' });
  const header = el('div', { class: 'browse-by-header' }, el('h2', { class: 'browse-by-title' }, text.browseBy), tablist);
  const subtitleFor = (label) => {
    const key = label.toLowerCase();
    if (key.startsWith('author')) return text.browseAuthors;
    if (key.startsWith('categor')) return text.browseCategories;
    if (key.startsWith('tag')) return text.browseTags;
    return label;
  };

  const tabs = await Promise.all(rows.map(async (row) => {
    const [labelCell, contentCell] = row.children;
    const label = labelCell.textContent.trim();
    const id = `browse-by-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    row.classList.add('browse-by-panel');
    row.id = `${id}-panel`;
    labelCell.classList.add('browse-by-label');
    contentCell.classList.add('browse-by-content');
    const tab = el('button', {
      type: 'button', role: 'tab', id: `${id}-tab`, class: 'browse-by-tab', 'aria-controls': row.id,
    }, label);
    tablist.append(tab);
    row.setAttribute('role', 'tabpanel');
    row.setAttribute('aria-labelledby', tab.id);

    const subtitle = el('p', { class: 'browse-by-subtitle' }, subtitleFor(label));
    const bar = el('div', { class: 'browse-by-bar' }, subtitle);
    let list = contentCell.querySelector('ul');
    const sheetLink = !list && contentCell.querySelector('a[href$=".json"]');
    if (sheetLink) {
      contentCell.dataset.config = 'source';
      const data = await fetchSheet(sheetLink.getAttribute('href'));
      list = el('ul', { class: 'browse-by-list browse-by-authors' }, authorItems(data, 'alpha'));
      const select = el(
        'select',
        { class: 'browse-by-sort', 'aria-label': text.sortBy },
        el('option', { value: 'alpha' }, text.alphabetical),
        el('option', { value: 'recent' }, text.recentlyPosted),
        el('option', { value: 'count' }, text.mostArticles),
      );
      const more = moreToggle(list, text);
      select.addEventListener('change', () => {
        list.replaceChildren(...authorItems(data, select.value));
        more.update();
      });
      bar.append(el('label', { class: 'browse-by-sort-label' }, el('span', {}, text.sortBy.replace(/:$/, '')), select));
      row.append(bar, list, more.button);
      more.update();
    } else if (list) {
      list.classList.add('browse-by-list');
      row.prepend(bar);
      if (!authoring) {
        const more = moreToggle(list, text);
        row.append(more.button);
        more.update();
      }
    }
    if (authoring) bar.remove();
    return tab;
  }));

  const select = (index) => tabs.forEach((tab, i) => {
    const active = i === index;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (!authoring) rows[i].hidden = !active;
  });
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      const next = (i + step + tabs.length) % tabs.length;
      select(next);
      tabs[next].focus();
    });
  });
  select(0);
  block.prepend(header);
  guardLinks(block, authoring);
}
