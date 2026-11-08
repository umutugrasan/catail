import { describe, expect, it } from "vitest";
import { CUSTOM_CAT_DEFAULT, CUSTOM_PRESETS, customTheme, paintPixels, tidyCustomCat } from "./customCat";
import { contrast } from "./plainAccent";

const FURS = [...CUSTOM_PRESETS.fur, "#000000", "#ffffff", "#777777", "#ffff00", "#00ff00", "#0000ff", "#7f0000"];

const colors = (fur: string) => {
  const vars = customTheme({ ...CUSTOM_CAT_DEFAULT, fur });
  return (name: string) => vars[`--custom-${name}`];
};

describe("customTheme", () => {
  it.each(FURS)("keeps the windows readable with %s fur", (fur) => {
    const c = colors(fur);
    const pairs: [string, string][] = [
      ["ink-900", "tint-50"],
      ["ink-900", "tint-100"],
      ["ink-700", "tint-100"],
      ["ink-500", "tint-50"],
      ["accent-text", "tint-300"],
      ["accent-text", "tint-400"],
    ];
    for (const [fg, bg] of pairs) expect(contrast(c(fg), c(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c("ink-500"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c("tint-500"), c("tint-50"))).toBeGreaterThanOrEqual(3);
    expect(contrast(c("face-eye"), c("face"))).toBeGreaterThanOrEqual(3);
  });
});

describe("tidyCustomCat", () => {
  it("fills in what is missing or broken", () => {
    expect(tidyCustomCat({ fur: "mor", belly: "#ffffff" })).toEqual({ ...CUSTOM_CAT_DEFAULT, belly: "#ffffff" });
    expect(tidyCustomCat(null)).toEqual(CUSTOM_CAT_DEFAULT);
  });
});

describe("paintPixels", () => {
  const pixel = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);

  it("paints orange fur in the picked fur color", () => {
    const fur = pixel(249, 155, 62); // the orange cat's fur
    paintPixels(fur, 1, 1, { fur: "#5fb3d9", belly: "#ffffff", eyes: "#1c1c1c" });
    expect(fur[2]).toBeGreaterThan(fur[0]); // blue now
  });

  it("paints the belly in the belly color and leaves see-through pixels alone", () => {
    const belly = pixel(244, 240, 246);
    paintPixels(belly, 1, 1, { fur: "#8f7cf2", belly: "#ffe8f1", eyes: "#1c1c1c" });
    expect([...belly.slice(0, 3)]).toEqual([255, 232, 241]);
    const clear = new Uint8ClampedArray([249, 155, 62, 0]);
    paintPixels(clear, 1, 1, CUSTOM_CAT_DEFAULT);
    expect([...clear]).toEqual([249, 155, 62, 0]);
  });
});
