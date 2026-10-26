/**
 * Image toggle (source imageToggle): stat buttons on the left (icon + label) swap the map
 * image on the right.
 *
 * Rows (one per stat): [icon picture, p label] [picture]
 *
 * Accessibility: each label cell is a toggle button (role="button", aria-pressed,
 * aria-controls) — a native <button> cannot contain the authored paragraph, and moving the
 * paragraph into one would detach it from Canvas. Enter/Space/arrow keys are handled.
 * Canvas: no node is moved; keyboard handling and button roles are skipped in isAuthoring()
 * (typing a space must reach the editor); a click still reveals that row's image for editing.
 */
import { isAuthoring } from '../../scripts/scripts.js';

let instance = 0;

function isMediaCell(cell) {
  return !!cell.querySelector('picture, img') && cell.textContent.trim() === '';
}

export default function decorate(block) {
  instance += 1;
  const authoring = isAuthoring();
  const items = [];
  [...block.children].forEach((row, i) => {
    row.classList.add('image-toggle-row');
    const cells = [...row.children];
    const panel = cells.find(isMediaCell);
    const tab = cells.find((c) => c !== panel);
    if (!tab) return;
    tab.classList.add('image-toggle-tab');
    tab.style.gridRow = String(i + 2);
    if (panel) {
      panel.classList.add('image-toggle-panel');
      panel.id = `image-toggle-${instance}-${i + 1}`;
    }
    items.push({ tab, panel });
  });
  block.style.setProperty('--image-toggle-count', items.length);

  const select = (index, focus = false) => {
    items.forEach(({ tab, panel }, i) => {
      const on = i === index;
      tab.classList.toggle('is-active', on);
      panel?.classList.toggle('is-active', on);
      if (!authoring) tab.setAttribute('aria-pressed', String(on));
      if (on && focus) tab.focus();
    });
  };

  items.forEach(({ tab, panel }, i) => {
    tab.addEventListener('click', () => select(i));
    if (authoring) return;
    tab.setAttribute('role', 'button');
    tab.tabIndex = 0;
    if (panel) tab.setAttribute('aria-controls', panel.id);
    tab.addEventListener('keydown', (event) => {
      const { key } = event;
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        select(i);
      } else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(key)) {
        event.preventDefault();
        const delta = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
        select((i + delta + items.length) % items.length, true);
      }
    });
  });
  select(0);
}
