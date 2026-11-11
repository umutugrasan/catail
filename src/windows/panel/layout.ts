/**
 * Which layout panel.rs built this window for: two columns of square tiles, or one column with
 * each tile's buttons in a bubble beside it. Its initialization script says so on `window`
 * before the page loads (the document doesn't exist yet at that point).
 */
export const LIST =
  (window as Window & { __CATAIL_PANEL_LAYOUT__?: string }).__CATAIL_PANEL_LAYOUT__ === "list" ||
  document.documentElement.dataset.layout === "list";
