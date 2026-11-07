import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATS } from "./ipc";

const themeCss = readFileSync(new URL("./theme.css", import.meta.url), "utf-8");

/** The variables a cat's block in theme.css sets. */
function palette(cat: string): Record<string, string> {
  const start = themeCss.indexOf(`[data-cat="${cat}"] {`);
  expect(start, `no block for ${cat}`).toBeGreaterThanOrEqual(0);
  const block = themeCss.slice(start, themeCss.indexOf("}", start));
  // A picked color (`var(--plain-300, #0067c0)`) is checked by its default; plainAccent.test.ts covers the rest.
  const values = block.matchAll(/--([\w-]+):\s*(?:var\(--[\w-]+,\s*)?(#[0-9a-f]{6})\)?;/g);
  return Object.fromEntries([...values].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text pairs every window uses, at the WCAG AA level for normal text.
const TEXT_PAIRS: [fg: string, bg: string][] = [
  ["ink-900", "tint-50"],
  ["ink-900", "tint-100"],
  ["ink-900", "surface-raised"],
  ["ink-700", "tint-100"],
  ["ink-500", "tint-50"],
  ["ink-500", "surface-raised"],
  ["accent-text", "tint-300"],
  ["accent-text", "tint-400"],
  ["danger", "tint-50"],
  ["danger", "danger-soft"],
  ["tint-50", "ink-900"], // tooltips
];

describe.each(CATS)("the %s cat's theme", (cat) => {
  const colors = palette(cat);

  it.each(TEXT_PAIRS)("%s reads on %s", (fg, bg) => {
    expect(colors[fg], fg).toBeDefined();
    expect(colors[bg], bg).toBeDefined();
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it("marks the chosen card and controls visibly", () => {
    expect(contrast(colors["tint-500"], colors["tint-50"])).toBeGreaterThanOrEqual(3);
  });

  it("shows its small face on the window", () => {
    // Either the fill or its rim has to stand out from the window behind it.
    const best = Math.max(contrast(colors.face, colors["tint-50"]), contrast(colors["face-rim"], colors["tint-50"]));
    expect(best).toBeGreaterThanOrEqual(3);
  });

  it("has eyes that show on the face", () => {
    expect(contrast(colors["face-eye"], colors.face)).toBeGreaterThanOrEqual(3);
  });

  it("has a tail with an outline that stands out", () => {
    expect(contrast(colors["tail-outline"], colors["tail-body"])).toBeGreaterThanOrEqual(1.8);
  });
});
