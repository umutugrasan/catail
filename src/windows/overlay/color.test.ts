import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, parseHex, svFromPoint } from "./color";

describe("color conversions", () => {
  it("round-trips through HSV", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#e0457b", "#ffffff", "#000000", "#808080"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("knows the primaries", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 240, s: 1, v: 0.5 })).toBe("#000080");
  });

  it("parses short and long hex, rejects junk", () => {
    expect(parseHex("#ABC")).toBe("#aabbcc");
    expect(parseHex("e0457b")).toBe("#e0457b");
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("pembe")).toBeNull();
  });

  it("maps the square: right is saturated, top is bright", () => {
    expect(svFromPoint(0, 0, 100, 100)).toEqual({ s: 0, v: 1 });
    expect(svFromPoint(100, 100, 100, 100)).toEqual({ s: 1, v: 0 });
    expect(svFromPoint(150, -10, 100, 100)).toEqual({ s: 1, v: 1 });
  });
});
