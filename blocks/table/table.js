/**
 * Table: a data table authored as block rows (source `table2` in viewpoints).
 *
 * Rows: one block row per table row, one cell per column (≤ 4).
 * Variants: `header` (first row = column headers), `row-header` (first cell of each row =
 * row header). The authored rows are never moved or rebuilt (Canvas edits them in place); the
 * table semantics come from ARIA roles and the layout from CSS grid.
 */
export default function decorate(block) {
  const rows = [...block.children];
  const cols = Math.max(1, ...rows.map((row) => row.children.length));
  const header = block.classList.contains('header');
  const rowHeader = block.classList.contains('row-header');
  block.style.setProperty('--table-cols', cols);
  block.setAttribute('role', 'table');
  rows.forEach((row, r) => {
    row.setAttribute('role', 'row');
    row.classList.add('table-row');
    if (header && r === 0) row.classList.add('table-head');
    [...row.children].forEach((cell, c) => {
      let role = 'cell';
      if (header && r === 0) role = 'columnheader';
      else if (rowHeader && c === 0) role = 'rowheader';
      cell.setAttribute('role', role);
      cell.classList.add(`table-${role}`);
    });
  });
}
