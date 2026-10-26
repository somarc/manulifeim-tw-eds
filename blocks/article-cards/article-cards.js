/*
 * Article Cards — viewpoint / press teasers.
 * Variants: list, grid, trending, related, news, feature, toggle (list <-> grid), no-photos.
 *
 * Rows (cells ≤ 2):
 *   config  [Source | /viewpoints/] [Limit | 3] [Tags | …] [Category | …] [Type | article]
 *           [Authors | id, id] [Source Index | /drafts/…/content-index.json]
 *   curated [<a href="/viewpoints/…">…</a>]             -> resolved from the content index
 *   teaser  [picture] [h2/h3 title link, p text, …]      -> authored card, decorated in place
 * Config and curated-link rows are the editable surface: hidden on the published page,
 * shown as a compact panel in Canvas. Index-driven cards are generated (not editable).
 */
import { isAuthoring } from '../../scripts/scripts.js';
import {
  authorList, el, fetchAuthors, filterRows, formatDate, guardLinks, indexRows, labels,
  pathOf, picture, readRows, splitList, toId,
} from '../../scripts/discovery.js';

const KEYS = ['source', 'limit', 'tags', 'category', 'type', 'authors', 'source index'];
const DEFAULT_LIMIT = {
  news: 4, related: 2, trending: 3, feature: 1,
};

function variantOf(block) {
  return ['news', 'feature', 'trending', 'related', 'grid', 'list']
    .find((v) => block.classList.contains(v)) || 'grid';
}

function readMore(href, text, title) {
  return el('p', { class: 'article-card-more' }, el('a', { href, class: 'link-cta', 'aria-label': `${text}: ${title}` }, text));
}

/** Generated card from an index row. */
function indexCard(row, ctx) {
  const { variant, authors, text } = ctx;
  const titleTag = variant === 'feature' ? 'h2' : 'h3';
  const ids = splitList(row.authors).map(toId);
  // news tiles are text-only (source); EDS's default placeholder is not an article image
  const showImage = variant !== 'news' && row.image && !row.image.includes('default-meta-image');
  return el(
    'div',
    { class: 'article-card' },
    showImage
      ? el('div', { class: 'article-card-image' }, picture(row.image, '', variant === 'feature', variant === 'feature' ? 1200 : 750))
      : null,
    el(
      'div',
      { class: 'article-card-body' },
      row.date ? el('p', { class: 'article-card-date' }, el('time', { datetime: row.date }, formatDate(row.date))) : null,
      el(titleTag, { class: 'article-card-title' }, el('a', { href: row.path }, row.title)),
      variant === 'news' ? null : authorList(ids, authors, { photos: ctx.photos }),
      row.description && variant !== 'news' ? el('p', { class: 'article-card-description' }, row.description) : null,
      ['news', 'related', 'feature'].includes(variant) ? readMore(row.path, text.readMore, row.title) : null,
    ),
  );
}

/** Authored teaser row: cells become the image/body slots in place; nothing is cloned. */
function teaserCard(row, ctx, rowByPath) {
  row.classList.add('article-card');
  const cells = [...row.children];
  const imageCell = cells.find((c) => c.querySelector('picture, img') && !c.querySelector('h1, h2, h3, h4'));
  const body = cells.find((c) => c !== imageCell) || cells[0];
  imageCell?.classList.add('article-card-image');
  body.classList.add('article-card-body');
  // authored fields are styled through their cell (classes on them would not survive Canvas)
  const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
  const link = heading?.querySelector('a[href]') || body.querySelector('a[href]');
  const data = link ? rowByPath.get(pathOf(link.getAttribute('href'))) : null;
  const date = data?.date;
  if (date && heading) heading.before(el('p', { class: 'article-card-date' }, el('time', { datetime: date }, formatDate(date))));
  const ids = ctx.teaserAuthors.length ? ctx.teaserAuthors : splitList(data?.authors).map(toId);
  const people = authorList(ids, ctx.authors, { photos: ctx.photos });
  if (people) (heading || body.firstElementChild)?.after(people);
  if (link && heading && !body.querySelector('.link-cta') && ['feature', 'related', 'news'].includes(ctx.variant)) {
    body.append(readMore(link.getAttribute('href'), ctx.text.readMore, heading.textContent.trim()));
  }
  return row;
}

function toggleBar(block, list, text) {
  const button = (mode, label) => el(
    'button',
    {
      type: 'button', class: `article-cards-view article-cards-view-${mode}`, 'aria-label': label, title: label, 'aria-pressed': String(mode === 'list'),
    },
  );
  const grid = button('grid', text.gridView);
  const listBtn = button('list', text.listView);
  const set = (mode) => {
    list.classList.toggle('is-grid', mode === 'grid');
    list.classList.toggle('is-list', mode === 'list');
    grid.setAttribute('aria-pressed', String(mode === 'grid'));
    listBtn.setAttribute('aria-pressed', String(mode === 'list'));
  };
  grid.addEventListener('click', () => set('grid'));
  listBtn.addEventListener('click', () => set('list'));
  return el('div', { class: 'article-cards-controls' }, grid, listBtn);
}

export default async function decorate(block) {
  const authoring = isAuthoring();
  const variant = variantOf(block);
  const { config, items } = readRows(block, KEYS);
  const [text, authors, rows] = await Promise.all([
    labels(), fetchAuthors(), indexRows(config['source index']),
  ]);
  const ctx = {
    variant,
    authors,
    text,
    photos: !block.classList.contains('no-photos') && variant !== 'news',
    teaserAuthors: splitList(config.authors).map(toId),
  };
  const rowByPath = new Map(rows.map((r) => [pathOf(r.path), r]));
  const list = el('div', { class: `article-cards-list${variant === 'list' ? ' is-list' : ''}` });

  if (items.length) {
    items.forEach((row) => {
      const authored = row.querySelector('h1, h2, h3, h4, h5, h6, picture');
      if (authored) {
        list.append(teaserCard(row, ctx, rowByPath));
        return;
      }
      const link = row.querySelector('a[href]');
      const data = link && rowByPath.get(pathOf(link.getAttribute('href')));
      row.dataset.config = 'item';
      if (data) list.append(indexCard(data, ctx));
      else if (link) {
        list.append(indexCard({ path: link.getAttribute('href'), title: link.textContent.trim() }, ctx));
      }
    });
  } else {
    const limit = parseInt(config.limit, 10) || DEFAULT_LIMIT[variant] || 3;
    filterRows(rows, config).slice(0, limit).forEach((row) => list.append(indexCard(row, ctx)));
  }

  block.append(list);
  if (block.classList.contains('toggle')) block.prepend(toggleBar(block, list, text));
  guardLinks(block, authoring);
}
