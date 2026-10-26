import { isAuthoring, fetchPlaceholders } from '../../scripts/scripts.js';
import { toClassName } from '../../scripts/aem.js';

/**
 * Form (source Marketo forms 1326 / 2516) — a DEMO rendering that never submits.
 * No Marketo script, no network call, no action URL: the submit button is disabled and a
 * notice links to the original page on manulifeim.com.
 *
 * Rows:
 * - field: [p label (a trailing or leading * = required)] [p type] [optional ul of options]
 *          type ∈ text | email | tel | select | textarea | checkbox | submit
 * - copy:  a one-cell row of rich text (intro, contact details, consent text). Copy rows
 *          before the first field form the intro; with variant `split` they sit in a left
 *          column (private markets "Partner with us"), otherwise above the fields.
 *
 * Canvas: rows are moved intact into generated column wrappers; authored cells are never
 * rewritten. Generated controls live beside the label cell and point at a generated <form>
 * through the `form` attribute. The demo submit guard is inert in isAuthoring().
 */
const TYPES = ['text', 'email', 'tel', 'select', 'textarea', 'checkbox', 'submit'];
const ORIGIN = 'https://www.manulifeim.com/institutional/tw/en';

let instance = 0;

function fieldType(row) {
  const cells = [...row.children];
  if (cells.length < 2) return null;
  const type = toClassName(cells[1].textContent);
  return TYPES.includes(type) ? type : null;
}

function control(type, id, formId, labelId, options, required) {
  let el;
  if (type === 'select') {
    el = document.createElement('select');
    const first = document.createElement('option');
    first.value = '';
    first.textContent = options[0] || 'Select';
    el.append(first);
    options.slice(1).forEach((text) => {
      const o = document.createElement('option');
      o.textContent = text;
      el.append(o);
    });
  } else if (type === 'textarea') {
    el = document.createElement('textarea');
    el.rows = 4;
  } else {
    el = document.createElement('input');
    el.type = type;
    if (type === 'email') el.autocomplete = 'email';
  }
  el.id = id;
  el.name = id;
  el.className = 'form-control';
  el.setAttribute('form', formId);
  el.setAttribute('aria-labelledby', labelId);
  if (required) {
    el.required = true;
    el.setAttribute('aria-required', 'true');
  }
  return el;
}

export default async function decorate(block) {
  instance += 1;
  const formId = `form-${instance}`;
  const labels = await fetchPlaceholders();
  const intro = document.createElement('div');
  intro.className = 'form-intro';
  const fields = document.createElement('div');
  fields.className = 'form-fields';

  let seenField = false;
  let submitRow = null;
  [...block.children].forEach((row, i) => {
    const type = fieldType(row);
    if (!type) {
      row.classList.add('form-copy');
      (seenField ? fields : intro).append(row);
      return;
    }
    seenField = true;
    const [labelCell, typeCell, optionsCell] = row.children;
    row.classList.add('form-field', `form-field-${type}`);
    typeCell.classList.add('form-type');
    optionsCell?.classList.add('form-options');
    labelCell.classList.add('form-label');
    const id = `${formId}-${i}`;
    labelCell.id = `${id}-label`;
    if (type === 'submit') {
      submitRow = row;
      fields.append(row);
      return;
    }
    const required = /^\s*\*|\*\s*$/.test(labelCell.textContent);
    const options = [...(optionsCell?.querySelectorAll('li') || [])].map((li) => li.textContent.trim());
    const el = control(type, id, formId, labelCell.id, options, required);
    row.append(el);
    if (!isAuthoring()) labelCell.addEventListener('click', () => el.focus());
    fields.append(row);
  });

  // the notice is site policy, not page content: demo forms never submit
  const original = `${ORIGIN}${window.location.pathname.replace(/\/$/, '')}`;
  const notice = document.createElement('p');
  notice.className = 'form-notice';
  notice.id = `${formId}-notice`;
  notice.append(
    `${labels.formDemoNotice || 'Demonstration form: submissions are switched off on this site and nothing you enter is sent.'} `,
  );
  const link = document.createElement('a');
  link.href = original;
  link.textContent = labels.formDemoLink || 'Use the form on manulifeim.com';
  notice.append(link);

  const form = document.createElement('form');
  form.id = formId;
  form.className = 'form-element';
  form.noValidate = true;
  form.setAttribute('aria-describedby', notice.id);
  if (!isAuthoring()) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      notice.classList.add('is-emphasised');
      link.focus();
    });
  }

  if (isAuthoring()) block.classList.add('is-authoring');
  if (submitRow && !isAuthoring()) {
    const label = submitRow.querySelector('.form-label');
    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'button primary form-submit';
    button.setAttribute('form', formId);
    button.setAttribute('aria-labelledby', label.id);
    button.setAttribute('aria-describedby', notice.id);
    button.disabled = true;
    submitRow.append(button);
  }

  fields.prepend(notice);
  fields.append(form);
  if (intro.children.length) block.append(intro);
  block.append(fields);
}
