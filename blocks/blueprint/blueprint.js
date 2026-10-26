import { fetchPlaceholders, isAuthoring } from '../../scripts/scripts.js';

/**
 * Blueprint: one row per build step, [context: h3 + prose] [commands: pre + optional notes].
 * Authored nodes stay in place; role classes go on the row/cell owners only. The copy control
 * is generated outside the authored fields and labelled from /placeholders (copyCommands,
 * copied); without those labels it is omitted rather than invented.
 * @param {Element} block
 */
export default async function decorate(block) {
  const labels = await fetchPlaceholders();
  [...block.children].forEach((row) => {
    row.classList.add('blueprint-step');
    const [context, commands] = row.children;
    context?.classList.add('blueprint-context');
    commands?.classList.add('blueprint-commands');
    const pre = commands?.querySelector('pre');
    if (!pre || !labels.copyCommands || isAuthoring()) return;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'blueprint-copy';
    copy.textContent = labels.copyCommands;
    copy.addEventListener('click', async () => {
      try {
        // read the current PRE so edits made after decoration are what gets copied
        await navigator.clipboard.writeText(commands.querySelector('pre')?.textContent || '');
        copy.textContent = labels.copied || labels.copyCommands;
      } catch {
        copy.textContent = labels.copyCommands;
      }
    });
    commands.append(copy);
  });
}
