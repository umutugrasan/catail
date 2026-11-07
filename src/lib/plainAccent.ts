// The plain theme's color is the user's pick. Everything that sits on it or marks with it is
// worked out from that one color, so it stays readable whatever was picked.

export const PLAIN_ACCENT_DEFAULT = "#0067c0";

/** A few to start from; the picker can make any other. */
export const PLAIN_PRESETS = ["#0067c0", "#8764b8", "#c239b3", "#e74856", "#ca5010", "#498205", "#038387", "#5d5a58"];

const WHITE = "#ffffff";
const INK = "#1b1b1b";
const BLACK = "#000000";

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** `amount` of the way from `a` to `b`. */
function mix(a: string, b: string, amount: number): string {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex(x.map((c, i) => c + (y[i] - c) * amount) as Rgb);
}

function luminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = toRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves `color` toward `toward` in small steps until `ok` holds (or it gets there). */
function shiftUntil(color: string, toward: string, ok: (c: string) => boolean): string {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(color, toward, step / 20);
    if (ok(candidate)) return candidate;
  }
  return toward;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/.test(value);
}

export interface PlainPalette {
  /** Buttons, the badge, the count. */
  accent: string;
  /** The same on hover, and the badge's edge. */
  hover: string;
  /** Lines and rings on the white window: the chosen card, focus. */
  mark: string;
  /** Text on `accent` and `hover`. */
  text: string;
}

/** Everything the plain theme paints from the picked color. */
export function plainPalette(picked: string): PlainPalette {
  const color = isHexColor(picked) ? picked : PLAIN_ACCENT_DEFAULT;
  // White text on darker picks, dark text on light ones. A mid tone that neither reads on is
  // darkened until white does.
  const dark = contrast(WHITE, color) >= contrast(INK, color);
  const text = dark || contrast(INK, color) < 4.5 ? WHITE : INK;
  const accent = text === WHITE ? shiftUntil(color, BLACK, (c) => contrast(WHITE, c) >= 4.5) : color;
  // Hover moves away from the text, so it only reads better.
  const hover = mix(accent, text === WHITE ? BLACK : WHITE, 0.14);
  const mark = shiftUntil(accent, BLACK, (c) => contrast(c, WHITE) >= 3);
  return { accent, hover, mark, text };
}

/** The variables theme.css's plain block reads. */
export function plainVariables(picked: string): Record<string, string> {
  const p = plainPalette(picked);
  return { "--plain-300": p.accent, "--plain-400": p.hover, "--plain-500": p.mark, "--plain-text": p.text };
}
