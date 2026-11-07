// The cat sitting on the badge gets rounder as the queue grows. The picture is cut into thin
// strips across its body, each widened by its own amount, so the belly bulges and the neck
// stays put without drawing the cat again.

/** At this many items it is as fat as it gets. */
const FULLEST_AT = 12;

/** 0..1. Quick at first, so the first few items show. */
export function fatness(count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, (count / FULLEST_AT) ** 0.55);
}

/** The head's lower edge and the body's right edge (the tail is apart), in percent of the picture. */
const NECK = 36.5;
const BODY_RIGHT = 74;
const STRIP_COUNT = 11;
/** Hides the seam when two neighbors are widened by slightly different amounts. */
const OVERLAP = 1;
const WIDEST_AT = 0.62;
const FEET_WIDTH = 0.75;

export interface SeatStrip {
  clip: string;
  /** Share of the full fatness this strip takes. */
  share: number;
}

function shareAt(t: number): number {
  if (t < WIDEST_AT) return Math.sin((Math.PI / 2) * (t / WIDEST_AT));
  return 1 - (1 - FEET_WIDTH) * ((t - WIDEST_AT) / (1 - WIDEST_AT));
}

export const SEAT_STRIPS: SeatStrip[] = Array.from({ length: STRIP_COUNT }, (_, i) => {
  const height = (100 - NECK) / STRIP_COUNT;
  const top = NECK + i * height;
  const bottom = Math.max(100 - top - height - OVERLAP, 0);
  return {
    clip: `inset(${top.toFixed(2)}% ${100 - BODY_RIGHT}% ${bottom.toFixed(2)}% 0)`,
    share: Number(shareAt((i + 0.5) / STRIP_COUNT).toFixed(3)),
  };
});
