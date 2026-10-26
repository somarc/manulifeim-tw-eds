import { isAuthoring, fetchPlaceholders } from '../../scripts/scripts.js';

/**
 * Video (source `data-videomodal`): a Brightcove player opened in a native <dialog>.
 *
 * Rows: [optional poster picture] [p link to the player URL]
 *   https://players.brightcove.net/640445594001/1QVD66lj_default/index.html?videoId=<id>
 * Without JavaScript (or in Canvas) the link simply opens the player page.
 * Variant `inline`: just the circled-play link (used when nested in promo banners/columns).
 *
 * Canvas: nothing is bound in isAuthoring(); the authored link and picture are untouched.
 */
const ACCOUNT = '640445594001';
const PLAYER = '1QVD66lj';

function playerUrl(href) {
  try {
    const url = new URL(href, window.location.href);
    const id = url.searchParams.get('videoId');
    if (!id) return null;
    return `https://players.brightcove.net/${ACCOUNT}/${PLAYER}_default/index.html?videoId=${encodeURIComponent(id)}&autoplay=true`;
  } catch (e) {
    return null;
  }
}

export default async function decorate(block) {
  const link = block.querySelector('a[href*="players.brightcove.net"], a[href*="videoId="]');
  if (!link) return;
  // styling is owned by block-level selectors (no classes on the authored link/picture)
  const poster = block.querySelector('picture');
  if (poster) block.classList.add('has-poster');
  if (isAuthoring()) return;

  const src = playerUrl(link.href);
  if (!src) return;
  const labels = await fetchPlaceholders();
  link.setAttribute('aria-haspopup', 'dialog');

  const dialog = document.createElement('dialog');
  dialog.className = 'video-dialog';
  dialog.setAttribute('aria-label', link.textContent.trim() || 'Video');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'video-close';
  close.setAttribute('aria-label', labels.closeVideo || 'Close video');
  const frame = document.createElement('div');
  frame.className = 'video-frame';
  dialog.append(close, frame);
  block.append(dialog);

  const open = (event) => {
    event.preventDefault();
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = link.textContent.trim() || 'Video';
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
    dialog.showModal();
  };
  link.addEventListener('click', open);
  poster?.addEventListener('click', open);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  // stop playback when the dialog closes (Esc, button or backdrop)
  dialog.addEventListener('close', () => frame.replaceChildren());
}
