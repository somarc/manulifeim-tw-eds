/*
 * Regional attestation ("Disclaimer (Taiwan)") shown on the first visit, as on the source.
 * Content: the DA document /fragments/disclaimer
 *   section 1: h2 title, then the legal text (scrolls inside the dialog)
 *   section 2: Cancel link, **I agree**, Change region link (in that order)
 * Acceptance is stored in localStorage as a hash of the text, so a text change re-prompts.
 * Skipped in DA Canvas (scripts.js does not call it there) and when page Metadata has
 * `Disclaimer: off`. No close button and Escape does not dismiss it (matches the source).
 */
import { getMetadata, loadCSS, toClassName } from './aem.js';
// eslint-disable-next-line import/no-cycle
import { loadFragment } from '../blocks/fragment/fragment.js';

const STORAGE_KEY = 'mim-inst-attestation-accepted-TW';
const FRAGMENT = '/fragments/disclaimer';

async function digest(value) {
  try {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  } catch (e) {
    // no SubtleCrypto (insecure context): a stable non-cryptographic fallback
    let h = 5381;
    for (let i = 0; i < value.length; i += 1) {
      h = Math.imul(h, 33) ^ value.charCodeAt(i); // eslint-disable-line no-bitwise
    }
    return `djb2-${(h >>> 0).toString(36)}`; // eslint-disable-line no-bitwise
  }
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

function strip(link) {
  link.classList.remove('button', 'primary', 'secondary', 'link-cta');
  link.closest('p')?.classList.remove('button-wrapper', 'link-cta-wrapper');
  return link;
}

/** The location list from the header's region dialog, reused for "Change region". */
function regionView(dialog, back) {
  const source = document.querySelector('.header .nav-regions-scroll');
  if (!source) return null;
  const view = document.createElement('div');
  view.className = 'disclaimer-regions';
  view.hidden = true;
  const heading = document.querySelector('.header .nav-regions-title')?.textContent || 'Select a location';
  const title = document.createElement('h2');
  title.className = 'disclaimer-title';
  title.id = 'disclaimer-regions-title';
  title.textContent = heading;
  const list = source.cloneNode(true);
  list.className = 'disclaimer-regions-list';
  list.querySelectorAll('[aria-current]').forEach((a) => a.removeAttribute('aria-current'));
  const footer = document.createElement('div');
  footer.className = 'disclaimer-footer';
  footer.append(back);
  view.append(title, list, footer);
  dialog.append(view);
  return view;
}

export default async function gate() {
  if (document.documentElement.hasAttribute('quick-edit')) return;
  if (toClassName(getMetadata('disclaimer')) === 'off') return;
  if (/^\/(nav|footer|fragments\/|library\/)/.test(window.location.pathname)) return;
  if (document.querySelector('dialog.disclaimer')) return;

  const fragment = await loadFragment(FRAGMENT);
  if (!fragment) return;
  const [textSection, actionSection] = fragment.querySelectorAll(':scope > .section');
  if (!textSection) return;

  const content = textSection.querySelector('.default-content-wrapper') || textSection;
  const hash = await digest(content.textContent.replace(/\s+/g, ' ').trim());
  if (readStored() === hash) return;

  await loadCSS(`${window.hlx.codeBasePath}/scripts/disclaimer.css`);

  const title = content.querySelector('h1, h2') || document.createElement('h2');
  title.id = 'disclaimer-title';
  title.className = 'disclaimer-title';

  const text = document.createElement('div');
  text.className = 'disclaimer-text';
  text.tabIndex = 0;
  text.setAttribute('role', 'region');
  text.setAttribute('aria-label', title.textContent.trim());
  text.append(...[...content.children].filter((child) => child !== title));

  const [cancelP, agreeP, changeP] = actionSection
    ? [...actionSection.querySelectorAll('p')] : [];
  const cancelLink = cancelP?.querySelector('a');
  const cancel = cancelLink ? strip(cancelLink) : document.createElement('a');
  cancel.className = 'disclaimer-cancel';
  if (!cancelLink) {
    cancel.href = 'https://www.manulifeim.com/';
    cancel.textContent = 'Cancel';
  }
  const agree = document.createElement('button');
  agree.type = 'button';
  agree.className = 'disclaimer-accept';
  agree.textContent = agreeP?.textContent.trim() || 'I agree';

  const buttons = document.createElement('div');
  buttons.className = 'disclaimer-buttons';
  buttons.append(cancel, agree);

  const body = document.createElement('div');
  body.className = 'disclaimer-body';
  body.append(text, buttons);

  const prompt = document.createElement('div');
  prompt.className = 'disclaimer-prompt';
  prompt.append(title, body);

  const dialog = document.createElement('dialog');
  dialog.className = 'disclaimer';
  dialog.setAttribute('aria-labelledby', title.id);
  dialog.append(prompt);

  const changeLink = changeP?.querySelector('a');
  if (changeLink) {
    strip(changeLink);
    changeLink.className = 'disclaimer-change';
    const footer = document.createElement('div');
    footer.className = 'disclaimer-footer';
    footer.append(changeLink);
    prompt.append(footer);

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'disclaimer-change disclaimer-back';
    back.textContent = title.textContent.trim();
    const view = regionView(dialog, back);
    if (view) {
      changeLink.addEventListener('click', (e) => {
        e.preventDefault();
        prompt.hidden = true;
        view.hidden = false;
        dialog.setAttribute('aria-labelledby', 'disclaimer-regions-title');
        view.querySelector('a')?.focus();
      });
      back.addEventListener('click', () => {
        view.hidden = true;
        prompt.hidden = false;
        dialog.setAttribute('aria-labelledby', title.id);
        changeLink.focus();
      });
    }
  }

  let accepted = false;
  agree.addEventListener('click', () => {
    accepted = true;
    try {
      localStorage.setItem(STORAGE_KEY, hash);
    } catch (e) {
      // storage unavailable: accept for this page view only
    }
    dialog.close();
  });
  // no dismissal without a choice: Escape is ignored and a forced close re-opens
  dialog.addEventListener('cancel', (e) => e.preventDefault());
  dialog.addEventListener('close', () => {
    if (!accepted && dialog.isConnected) dialog.showModal();
    else {
      document.documentElement.classList.remove('disclaimer-open');
      dialog.remove();
    }
  });

  document.body.append(dialog);
  document.documentElement.classList.add('disclaimer-open');
  dialog.showModal();
  text.focus({ preventScroll: true });
  text.scrollTop = 0;
}
