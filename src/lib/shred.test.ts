import { describe, expect, it } from "vitest";
import { BURST_MS, BUTTON_OUT_FOR_MS, BUTTON_OUT_MS, CHIP_MS, HOP_MS, SHARD_MS, SHRED_MS, shredPlan } from "./shred";

const CORNERS = ["bottom-right", "bottom-center", "bottom-left", "top-right", "top-center", "top-left"];

describe("shredPlan", () => {
  it("breaks the whole box into pieces", () => {
    const { shards } = shredPlan("bottom-right");
    expect(shards).toHaveLength(12);
    // Corners of the outer pieces reach the picture's edges.
    expect(shards[0].clip).toContain("0% 24%");
    expect(shards[11].clip).toContain("100% 100%");
  });

  it("is over before Geri al runs out, on every corner", () => {
    for (const corner of CORNERS) {
      const { shards, chips } = shredPlan(corner);
      for (const shard of shards) expect(BURST_MS + shard.delay + SHARD_MS).toBeLessThan(SHRED_MS);
      for (const chip of chips) expect(chip.delay + CHIP_MS).toBeLessThan(SHRED_MS);
    }
    expect(BURST_MS + HOP_MS).toBeLessThan(SHRED_MS);
    expect(BUTTON_OUT_MS + BUTTON_OUT_FOR_MS).toBeLessThan(SHRED_MS);
  });

  it("flies up from a bottom corner, where the window grows up", () => {
    const { shards, chips, hopPeak } = shredPlan("bottom-right");
    for (const flight of [...shards, ...chips]) expect(flight.peak).toBeLessThan(-20);
    expect(hopPeak).toBeLessThan(0);
  });

  it("falls down from a top corner, where there is no room above", () => {
    const { shards, chips, hopPeak } = shredPlan("top-right");
    for (const flight of [...shards, ...chips]) {
      expect(flight.peak).toBeGreaterThan(-10);
      expect(flight.land).toBeGreaterThan(40);
    }
    expect(hopPeak).toBeGreaterThan(0);
  });

  it("stays off the screen's edge in a left corner", () => {
    for (const corner of ["bottom-left", "top-left"]) {
      const { shards, chips, hopDir } = shredPlan(corner);
      for (const flight of [...shards, ...chips]) expect(flight.dx).toBeGreaterThan(0);
      expect(hopDir).toBe(1);
    }
    expect(shredPlan("bottom-right").hopDir).toBe(-1);
  });
});
