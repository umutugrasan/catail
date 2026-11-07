import { describe, expect, it } from "vitest";
import { contrast, PLAIN_ACCENT_DEFAULT, PLAIN_PRESETS, plainPalette, plainVariables } from "./plainAccent";

const SAMPLES = [
  ...PLAIN_PRESETS,
  "#000000",
  "#ffffff",
  "#777777",
  "#ffff00",
  "#00ff00",
  "#ff8800",
  "#7f7f00",
  "#ff00ff",
  "#00ffff",
  "#123456",
  "#fafafa",
];

describe("plainPalette", () => {
  it.each(SAMPLES)("keeps everything readable for %s", (picked) => {
    const p = plainPalette(picked);
    expect(contrast(p.text, p.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.text, p.hover)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.mark, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("leaves a color that already reads as it is", () => {
    expect(plainPalette("#0067c0").accent).toBe("#0067c0");
    expect(plainPalette("#ffff00")).toMatchObject({ accent: "#ffff00", text: "#1b1b1b" });
  });

  it("falls back to the default for anything that isn't a color", () => {
    expect(plainPalette("mavi")).toEqual(plainPalette(PLAIN_ACCENT_DEFAULT));
  });

  it("names the variables theme.css reads", () => {
    expect(Object.keys(plainVariables("#498205"))).toEqual(["--plain-300", "--plain-400", "--plain-500", "--plain-text"]);
  });
});
