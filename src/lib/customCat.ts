// "Kendi kedin": the orange cat's pictures and paw cursors painted in the user's colors, and a
// theme worked out from them that stays readable. The same sorting as scripts/recolor_cats.py
// (fur, pale belly, pink pads, dark eyes and lines), done here in the window.
import boxHead from "./cats/box-head.png";
import footLeft from "./cats/foot-left.png";
import footRight from "./cats/foot-right.png";
import standingBody from "./cats/standing-body.png";
import { contrast } from "./plainAccent";

export interface CustomCat {
  fur: string;
  belly: string;
  eyes: string;
}

export const CUSTOM_CAT_DEFAULT: CustomCat = { fur: "#8f7cf2", belly: "#f6f2ff", eyes: "#1c1c1c" };

/** Quick picks for each part. */
export const CUSTOM_PRESETS: Record<keyof CustomCat, string[]> = {
  fur: ["#8f7cf2", "#f99b3e", "#8e96a3", "#3a3a3a", "#c98a5a", "#e8b04a", "#5fb3d9", "#e57fb0"],
  belly: ["#f6f2ff", "#ffffff", "#fff4e6", "#f1f3f6", "#ffe8f1", "#e8f6ff"],
  eyes: ["#1c1c1c", "#f2c94c", "#4fa3ff", "#5bbf6a", "#b06cff", "#e85d5d"],
};

const WHITE = "#ffffff";
const BLACK = "#000000";

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(Math.min(Math.max(c, 0), 255)).toString(16).padStart(2, "0")).join("")}`;

export function mix(a: string, b: string, amount: number): string {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex(x.map((c, i) => c + (y[i] - c) * amount) as Rgb);
}

function shiftUntil(color: string, toward: string, ok: (c: string) => boolean): string {
  for (let step = 0; step <= 40; step += 1) {
    const candidate = mix(color, toward, step / 40);
    if (ok(candidate)) return candidate;
  }
  return toward;
}

const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);

/** Anything missing or broken comes from the default. */
export function tidyCustomCat(value: Partial<CustomCat> | null | undefined): CustomCat {
  return {
    fur: isHex(value?.fur) ? value.fur : CUSTOM_CAT_DEFAULT.fur,
    belly: isHex(value?.belly) ? value.belly : CUSTOM_CAT_DEFAULT.belly,
    eyes: isHex(value?.eyes) ? value.eyes : CUSTOM_CAT_DEFAULT.eyes,
  };
}

/** Very dark fur gets light outlines, like the black cat. */
const isDark = (color: string) => contrast(color, BLACK) < 2.2;

/** The fur's outline, and the darker one around the cursors. */
function outlines(fur: string): [line: string, cursorLine: string] {
  return isDark(fur) ? [mix(fur, WHITE, 0.45), mix(fur, WHITE, 0.62)] : [mix(fur, BLACK, 0.55), mix(fur, BLACK, 0.72)];
}

/** The theme's colors, as the variables theme.css's custom block reads. */
export function customTheme(custom: CustomCat): Record<string, string> {
  const { fur, eyes } = tidyCustomCat(custom);
  const [rim] = outlines(fur);
  const t50 = mix(fur, WHITE, 0.94);
  const ink900 = shiftUntil(mix(fur, BLACK, 0.82), BLACK, (c) => contrast(c, t50) >= 7);
  const readsInk = (c: string) => contrast(ink900, c) >= 4.5;
  const t100 = shiftUntil(mix(fur, WHITE, 0.87), WHITE, readsInk);
  const t300 = shiftUntil(mix(fur, WHITE, 0.45), WHITE, readsInk);
  const t400 = shiftUntil(mix(fur, WHITE, 0.3), WHITE, readsInk);
  const surfaceOk = (c: string) => contrast(c, t50) >= 4.5 && contrast(c, WHITE) >= 4.5 && contrast(c, t100) >= 4.5;
  const ink700 = shiftUntil(mix(fur, BLACK, 0.7), BLACK, surfaceOk);
  const ink500 = shiftUntil(mix(fur, BLACK, 0.45), BLACK, (c) => contrast(c, t50) >= 4.5 && contrast(c, WHITE) >= 4.5);
  const t500 = shiftUntil(fur, BLACK, (c) => contrast(c, t50) >= 3);
  const faceEye = contrast(eyes, fur) >= 3 ? eyes : contrast(WHITE, fur) >= contrast(BLACK, fur) ? WHITE : "#1c1c1c";
  const face = contrast(fur, t50) >= 3 || contrast(rim, t50) >= 3 ? fur : fur;
  const shadow = toRgb(ink900).join(", ");
  return {
    "--custom-tint-50": t50,
    "--custom-tint-100": t100,
    "--custom-tint-200": mix(fur, WHITE, 0.72),
    "--custom-tint-300": t300,
    "--custom-tint-400": t400,
    "--custom-tint-500": t500,
    "--custom-ink-900": ink900,
    "--custom-ink-700": ink700,
    "--custom-ink-500": ink500,
    "--custom-ink-300": mix(fur, WHITE, 0.4),
    "--custom-accent-text": ink900,
    "--custom-shadow-rgb": shadow,
    "--custom-ring-rgb": shadow,
    "--custom-face": face,
    "--custom-face-rim": contrast(rim, t50) >= 3 ? rim : ink900,
    "--custom-face-eye": faceEye,
    "--custom-face-whisker": rim,
    "--custom-whisker": t50,
    "--custom-cat-lid": fur,
    "--custom-cat-lid-edge": rim,
    "--custom-tail-body": fur,
    "--custom-tail-outline": rim,
    "--custom-tail-stripe": mix(fur, WHITE, 0.3),
  };
}

// ---- Painting the pictures

/** Brightness of the orange art's tones (recolor_cats.py): cursor outline, outline, fur, stripes, light stripes. */
const FUR_STOPS = [52, 117, 170, 198, 213];
const PALE_STOPS = [190, 240];

function ramp(gray: number, stops: number[], colors: Rgb[]): Rgb {
  if (gray <= stops[0]) return colors[0];
  for (let i = 1; i < stops.length; i += 1) {
    if (gray <= stops[i]) {
      const t = (gray - stops[i - 1]) / (stops[i] - stops[i - 1]);
      return colors[i - 1].map((c, k) => c + (colors[i][k] - c) * t) as Rgb;
    }
  }
  return colors[colors.length - 1];
}

/** What each pixel is: 0 transparent/other, 1 dark, 2 pink, 3 pale, 4 fur. */
function sortPixel(r: number, g: number, b: number): number {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const top = Math.max(R, G, B);
  const low = Math.min(R, G, B);
  const chroma = top - low;
  const sat = top > 0 ? chroma / top : 0;
  let hue = 0;
  if (chroma > 1e-6) {
    if (top === R) hue = (((G - B) / chroma) * 60 + 360) % 360;
    else if (top === G) hue = ((B - R) / chroma) * 60 + 120;
    else hue = ((R - G) / chroma) * 60 + 240;
  }
  if (top < 0.25) return 1;
  if (sat > 0.15 && top > 0.6 && (hue <= 13 || hue >= 320)) return 2;
  if (sat < 0.2) return 3;
  return 4;
}

/** Sizes of the connected dark regions, so big ones (eyes) can be told from lines. */
function regionSizes(mask: Uint8Array, w: number, h: number): Int32Array {
  const sizes = new Int32Array(w * h);
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const cells: number[] = [];
  for (let start = 0; start < w * h; start += 1) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    cells.length = 0;
    while (stack.length) {
      const at = stack.pop()!;
      cells.push(at);
      const x = at % w;
      for (const next of [at - w, at + w, x > 0 ? at - 1 : -1, x < w - 1 ? at + 1 : -1]) {
        if (next >= 0 && next < w * h && mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    for (const cell of cells) sizes[cell] = cells.length;
  }
  return sizes;
}

/** Paints one picture's pixels in place. */
export function paintPixels(data: Uint8ClampedArray, w: number, h: number, custom: CustomCat) {
  const { fur, belly, eyes } = tidyCustomCat(custom);
  const [line, cursorLine] = outlines(fur);
  const furRamp = [cursorLine, line, fur, mix(fur, WHITE, 0.18), mix(fur, WHITE, 0.3)].map(toRgb);
  const paleRamp = [mix(belly, fur, 0.22), belly].map(toRgb);
  const recolorEyes = contrast(eyes, "#1c1c1c") > 1.4;
  const darkFur = isDark(fur);
  const solid = new Uint8Array(w * h);
  const kinds = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    kinds[i] = data[o + 3] === 0 ? 0 : sortPixel(data[o], data[o + 1], data[o + 2]);
    if (kinds[i] === 1 && data[o + 3] > 100) solid[i] = 1;
  }
  const sizes = recolorEyes || darkFur ? regionSizes(solid, w, h) : null;
  const bigEye = Math.max(30, w * h * 0.002);
  const [eyeRgb, lineRgb] = [toRgb(eyes), toRgb(line)];
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    const gray = 0.3 * data[o] + 0.59 * data[o + 1] + 0.11 * data[o + 2];
    let out: Rgb | null = null;
    if (kinds[i] === 4) out = ramp(gray, FUR_STOPS, furRamp);
    else if (kinds[i] === 3) out = ramp(gray, PALE_STOPS, paleRamp);
    else if (kinds[i] === 1 && sizes) {
      const isEye = solid[i] && sizes[i] >= bigEye;
      if (isEye && recolorEyes) out = eyeRgb;
      else if (!isEye && darkFur) out = lineRgb;
    }
    if (out) [data[o], data[o + 1], data[o + 2]] = out;
  }
}

async function paintPicture(url: string, custom: CustomCat): Promise<string> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return url;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  paintPixels(pixels.data, canvas.width, canvas.height, custom);
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

const CURSOR_FILES = import.meta.glob("./cursors/*.png", { eager: true, query: "?url", import: "default" }) as Record<
  string,
  string
>;

/** Variable, file, hotspot and the keyword the browser falls back on (as cat-art.css). */
const CURSORS: [string, string, number, number, string][] = [
  ["paw-default", "paw", 2, 9, "default"],
  ["paw", "pointer", 7, 7, "pointer"],
  ["paw-grab", "grab", 9, 7, "grab"],
  ["paw-grabbing", "grabbing", 9, 4, "grabbing"],
  ["paw-text", "text", 7, 16, "text"],
  ["paw-cross", "cross", 16, 18, "crosshair"],
  ["paw-ew", "ew", 22, 15, "ew-resize"],
  ["paw-move", "move", 26, 25, "move"],
  ["paw-ns", "ns", 14, 22, "ns-resize"],
  ["paw-nwse", "corner", 18, 18, "nwse-resize"],
  ["paw-nesw", "corner", 18, 18, "nesw-resize"],
  ["paw-blocked", "blocked", 8, 5, "not-allowed"],
];

/** Every picture and cursor of the cat in these colors, as the variables cat-art.css reads. */
export async function customArt(custom: CustomCat): Promise<Record<string, string>> {
  const pictures: [string, string][] = [
    ["--custom-cat-head", boxHead],
    ["--custom-cat-body", standingBody],
    ["--custom-cat-foot-left", footLeft],
    ["--custom-cat-foot-right", footRight],
  ];
  const vars: Record<string, string> = {};
  for (const [name, url] of pictures) vars[name] = `url("${await paintPicture(url, custom)}")`;
  const painted = new Map<string, string>();
  const paint = async (file: string) => {
    const url = CURSOR_FILES[`./cursors/${file}.png`];
    if (!url) return null;
    if (!painted.has(file)) painted.set(file, await paintPicture(url, custom));
    return painted.get(file)!;
  };
  for (const [name, file, x, y, keyword] of CURSORS) {
    const [one, two] = [await paint(file), await paint(`${file}@2x`)];
    if (one && two) vars[`--custom-${name}`] = `image-set(url("${one}") 1x, url("${two}") 2x) ${x} ${y}, ${keyword}`;
  }
  return vars;
}
