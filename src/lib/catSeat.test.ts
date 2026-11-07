import { describe, expect, it } from "vitest";
import { fatness, SEAT_STRIPS } from "./catSeat";

describe("fatness", () => {
  it("is back to thin with an empty queue", () => {
    expect(fatness(0)).toBe(0);
  });

  it("shows from the first items, grows with the queue and stops at the fattest", () => {
    expect(fatness(1)).toBeGreaterThan(0.2);
    expect(fatness(5)).toBeGreaterThan(fatness(2));
    expect(fatness(12)).toBe(1);
    expect(fatness(500)).toBe(1);
  });
});

describe("SEAT_STRIPS", () => {
  it("runs from the neck to the feet with no gaps", () => {
    const edges = SEAT_STRIPS.map((strip) => strip.clip.match(/inset\(([\d.]+)% [\d.]+% ([\d.]+)%/)!.slice(1).map(Number));
    expect(edges[0][0]).toBeCloseTo(36.5);
    expect(edges[edges.length - 1][1]).toBe(0);
    edges.slice(1).forEach(([top], i) => {
      const bottomAbove = 100 - edges[i][1];
      expect(bottomAbove).toBeGreaterThan(top);
    });
  });

  it("leaves the neck thin, bulges at the belly and narrows a little at the feet", () => {
    const shares = SEAT_STRIPS.map((strip) => strip.share);
    expect(shares[0]).toBeLessThan(0.2);
    expect(Math.max(...shares)).toBeGreaterThan(0.95);
    expect(shares[shares.length - 1]).toBeLessThan(Math.max(...shares));
    expect(shares[shares.length - 1]).toBeGreaterThan(0.7);
  });
});
