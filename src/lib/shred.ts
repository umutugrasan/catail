// The cat tearing its box apart in the last moments of "Geri al": where every piece goes and
// when. All the timing lives here; the motion itself is in cats.css.

/** How long before "Geri al" runs out the cat starts. Everything is gone by then. */
export const SHRED_MS = 2100;
/** When the box bursts, after the scratching. */
export const BURST_MS = 1250;
export const SHARD_MS = 720;
export const CHIP_MS = 560;
export const HOP_MS = 800;
/** The button holds out until the box is gone, and can be pressed until then. */
export const BUTTON_OUT_MS = 1560;
export const BUTTON_OUT_FOR_MS = 260;

/** The claws land: on the box's left, then its right, in turns (the paws' timing in cats.css). */
const SWIPES = [
  { at: 395, x: 70 },
  { at: 570, x: 205 },
  { at: 745, x: 110 },
  { at: 920, x: 245 },
  { at: 1095, x: 150 },
];

/** Size of the box picture: claw marks are drawn in its coordinates. */
export const BOX_W = 342;
export const BOX_H = 256;

/** Where the box tears, in percent of the picture. Pieces share these corners, so they fit. */
const TEARS = [
  [[0, 24], [30, 24], [52, 24], [76, 24], [100, 24]],
  [[0, 52], [27, 58], [50, 50], [74, 60], [100, 54]],
  [[0, 76], [22, 80], [48, 74], [72, 82], [100, 78]],
  [[0, 100], [28, 100], [55, 100], [78, 100], [100, 100]],
];

export interface Flight {
  dx: number;
  /** Top of the arc and where it ends, relative to the start. */
  peak: number;
  land: number;
  spin: number;
  delay: number;
}

export interface Shard extends Flight {
  clip: string;
  cx: number;
  cy: number;
}

export interface Chip extends Flight {
  x: number;
  y: number;
  size: number;
  tone: number;
}

export interface ClawMark {
  at: number;
  lines: { x1: number; y1: number; x2: number; y2: number }[];
}

export interface ShredPlan {
  shards: Shard[];
  chips: Chip[];
  marks: ClawMark[];
  /** The cat's way out: -1 left, 1 right. */
  hopDir: number;
  /** Top of its hop, and where it ends. */
  hopPeak: number;
  hopLand: number;
}

/** The same scatter on every run: 0..1 from a number. */
function scatter(n: number): number {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * The window grows away from the badge's corner, and the box touches the window's edge in a
 * left corner: pieces must fly into the room there is.
 */
export function shredPlan(corner: string): ShredPlan {
  const down = corner.startsWith("top");
  const rightOnly = corner.endsWith("left");
  const aim = (dx: number) => (rightOnly ? Math.abs(dx) + 10 : dx);
  const arc = (height: number, seed: number) =>
    down
      ? { peak: -2 - scatter(seed) * 6, land: 50 + height * 40 + scatter(seed + 1) * 30 }
      : { peak: -(22 + height * 70 + scatter(seed) * 25), land: -2 - scatter(seed + 1) * 16 };

  const shards: Shard[] = [];
  TEARS.slice(0, -1).forEach((row, r) => {
    row.slice(0, -1).forEach(([x, y], c) => {
      const [[x2, y2], [x3, y3], [x4, y4]] = [row[c + 1], TEARS[r + 1][c + 1], TEARS[r + 1][c]];
      const seed = r * 4 + c + 1;
      const cx = (x + x2 + x3 + x4) / 4;
      const cy = (y + y2 + y3 + y4) / 4;
      shards.push({
        clip: `polygon(${x}% ${y}%, ${x2}% ${y2}%, ${x3}% ${y3}%, ${x4}% ${y4}%)`,
        cx,
        cy,
        dx: aim((cx - 50) * 1.3 + (scatter(seed) - 0.5) * 30),
        ...arc((100 - cy) / 76, seed + 20),
        spin: (scatter(seed + 40) - 0.5) * 520,
        delay: scatter(seed + 60) * 70,
      });
    });
  });

  const chip = (seed: number, x: number, y: number, at: number, reach: number, height: number): Chip => ({
    x,
    y,
    size: 2 + scatter(seed) * 3,
    tone: Math.floor(scatter(seed + 1) * 3),
    dx: aim((scatter(seed + 2) - 0.5) * reach),
    ...arc(height, seed + 3),
    spin: (scatter(seed + 5) - 0.5) * 720,
    delay: at + scatter(seed + 6) * 40,
  });

  const chips: Chip[] = [];
  SWIPES.forEach((swipe, s) => {
    for (let i = 0; i < 3; i++) {
      const seed = 100 + s * 10 + i;
      chips.push(chip(seed, ((swipe.x + i * 26) / BOX_W) * 100, 50 + scatter(seed + 7) * 30, swipe.at, 56, 0.1));
    }
  });
  for (let i = 0; i < 14; i++) {
    const seed = 300 + i * 10;
    chips.push(chip(seed, 15 + scatter(seed + 7) * 70, 40 + scatter(seed + 8) * 50, BURST_MS, 170, 0.8));
  }

  const marks = SWIPES.map(({ at, x }) => ({
    at,
    lines: [0, 1, 2].map((i) => ({ x1: x + i * 26, y1: 118 + i * 4, x2: x + i * 26 - 18, y2: 214 + i * 4 })),
  }));

  return {
    shards,
    chips,
    marks,
    hopDir: rightOnly ? 1 : -1,
    hopPeak: down ? 16 : -46,
    hopLand: down ? 70 : -16,
  };
}
