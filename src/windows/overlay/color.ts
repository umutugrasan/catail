// Color conversions for the picker. Hue in degrees [0, 360), saturation/value in [0, 1].

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${hex2(f(5) * 255)}${hex2(f(3) * 255)}${hex2(f(1) * 255)}`;
}

/** Parses `#rgb` or `#rrggbb` (the `#` is optional); null if it isn't a color. */
export function parseHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${[...raw].map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

export function hexToHsv(hex: string): Hsv {
  const value = parseHex(hex) ?? "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

/** Saturation/value from a pointer position inside the picker square. */
export function svFromPoint(x: number, y: number, width: number, height: number) {
  return { s: clamp01(x / width), v: clamp01(1 - y / height) };
}
