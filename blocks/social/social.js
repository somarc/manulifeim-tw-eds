import { isAuthoring } from '../../scripts/scripts.js';

const NETWORK_NAMES = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'X',
  youtube: 'YouTube',
  instagram: 'Instagram',
};

/**
 * Social: one tile per row, [icon or network label][link]. The link text is the tile label
 * ("Manulife Investment Management"); `:linkedin:` in the first cell renders the icon.
 * Published tiles are fully clickable (stretched link); in Canvas the cells stay selectable.
 */
export default function decorate(block) {
  [...block.children].forEach((row) => {
    row.classList.add('social-item');
    const cells = [...row.children];
    const linkCell = cells.find((cell) => cell.querySelector('a[href]'));
    const iconCell = cells.find((cell) => cell !== linkCell);
    linkCell?.classList.add('social-link');
    iconCell?.classList.add('social-icon');

    const link = linkCell?.querySelector('a[href]');
    const iconName = iconCell?.querySelector('[class*="icon-"]')?.className.match(/icon-([\w-]+)/)?.[1]
      || iconCell?.textContent.trim().toLowerCase();
    const network = Object.keys(NETWORK_NAMES).find((key) => iconName?.startsWith(key)
      || link?.hostname.includes(key));
    if (link && network && !link.hasAttribute('aria-label')) {
      link.setAttribute('aria-label', `${link.textContent.trim()} (${NETWORK_NAMES[network]})`);
    }
  });

  if (!isAuthoring()) block.classList.add('stretch');
}
