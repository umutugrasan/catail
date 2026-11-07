// The sums behind the PDF viewer: how large a page is shown and which zoom comes next.

/** Multiples of "as wide as the viewer". */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
export const FIT_WIDTH = 1;

export function zoomIn(zoom: number): number {
  return ZOOM_STEPS.find((step) => step > zoom) ?? zoom;
}

export function zoomOut(zoom: number): number {
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom) ?? zoom;
}

/** Pages fill the viewer's width at most this large, so a small page doesn't turn to mush. */
const MAX_FIT_SCALE = 2;

/** PDF points to CSS pixels: the page fills `areaWidth` at zoom 1. */
export function pageScale(pageWidth: number, areaWidth: number, zoom: number): number {
  if (pageWidth <= 0 || areaWidth <= 0) return zoom;
  return Math.min(areaWidth / pageWidth, MAX_FIT_SCALE) * zoom;
}

/**
 * Which page the middle of the view is on (1-based), from each page's top edge inside the
 * scrolled content, in order.
 */
export function pageAt(tops: number[], scrollTop: number, viewHeight: number): number {
  const middle = scrollTop + viewHeight / 2;
  let page = 1;
  tops.forEach((top, index) => {
    if (top <= middle) page = index + 1;
  });
  return page;
}
