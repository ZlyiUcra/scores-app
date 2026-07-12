/** Emoji icons for the admin action buttons, escaped so the source stays
 * ascii: pencil, check mark, cross mark, wastebasket, floppy disk, page
 * facing up, inbox tray. */
export const actionIcons = {
  edit: '\u270F\uFE0F',
  save: '\u2705',
  cancel: '\u274C',
  delete: '\u{1F5D1}\uFE0F',
  exportJson: '\u{1F4BE}',
  exportPdf: '\u{1F4C4}',
  import: '\u{1F4E5}',
};

/** Media-control glyphs for pager navigation, escaped to keep the source
 * ascii: skip-to-first, reverse (prev), play (next), skip-to-last. The
 * trailing U+FE0E forces TEXT (monochrome) presentation so the glyphs inherit
 * the button's `color` (themeable) instead of rendering as a colour emoji. */
export const pagerIcons = {
  first: '\u23EE\uFE0E',
  prev: '\u25C0\uFE0E',
  next: '\u25B6\uFE0E',
  last: '\u23ED\uFE0E',
};

/** Right-pointing triangle used as the accordion toggle, rotated 90deg via
 * CSS when the section is open. Escaped to keep the source ascii. */
export const accordionIcons = {
  toggle: '\u25B6\uFE0E',
};

/** Below this item count a paginated list already fits without controls, so
 * Pager hides itself rather than showing a useless single-page control. */
export const pagerVisibility = {
  minTotal: 10,
};
