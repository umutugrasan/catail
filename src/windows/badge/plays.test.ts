import { describe, expect, it } from "vitest";
import { drawPlay, isOuting, shuffledPack, type Play } from "./plays";

describe("the cat's plays", () => {
  it("deals every play, the commoner ones more than once", () => {
    const pack = shuffledPack();
    const times = (play: Play) => pack.filter((one) => one === play).length;
    expect(pack).toHaveLength(25);
    expect(times("mouse")).toBe(4);
    expect(times("rival")).toBe(3);
    expect(times("lick")).toBe(1);
  });

  it("never does the same thing twice running, and deals again when the pack runs out", () => {
    const pack: Play[] = [];
    let last: Play | null = null;
    const seen = new Set<Play>();
    for (let i = 0; i < 200; i++) {
      const play = drawPlay(pack, last, true);
      expect(play).not.toBe(last);
      seen.add(play);
      last = play;
    }
    expect(seen.size).toBe(15);
  });

  it("swings from its tree more than anything else, if it's a monkey", () => {
    const pack = shuffledPack("monkey");
    const times = (play: Play) => pack.filter((one) => one === play).length;
    for (const other of ["banana", "peek", "think", "dive", "silly", "climb", "rival", "friend"] as Play[]) {
      expect(times("swing")).toBeGreaterThan(times(other));
    }
  });

  it("deals the monkey its own plays, and none of the cat's", () => {
    const pack: Play[] = [];
    let last: Play | null = null;
    const seen = new Set<Play>();
    for (let i = 0; i < 300; i++) {
      last = drawPlay(pack, last, true, "monkey");
      seen.add(last);
    }
    for (const play of ["banana", "swing", "peek", "think", "dive", "silly", "climb", "rival", "friend"] as Play[]) {
      expect(seen).toContain(play);
    }
    // Nothing a cat does.
    for (const play of ["scratch", "bat", "lick", "groom", "knead", "stretch", "hide", "mouse", "laser", "walk"] as Play[]) {
      expect(seen).not.toContain(play);
    }
  });

  it("goes after a mouse, a dot or a visitor more often than anything else", () => {
    const pack = shuffledPack();
    const chases = pack.filter((play) => ["mouse", "laser", "rival", "friend", "zoomies"].includes(play));
    expect(chases.length).toBeGreaterThan(pack.length / 2);
  });

  it("stays by its seat where there's no taskbar to go down to", () => {
    const pack: Play[] = [];
    let last: Play | null = null;
    for (let i = 0; i < 100; i++) {
      last = drawPlay(pack, last, false);
      expect(isOuting(last)).toBe(false);
    }
  });
});
