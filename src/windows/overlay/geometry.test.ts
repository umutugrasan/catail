import { describe, expect, it } from "vitest";
import {
  clampPoint,
  containsPoint,
  moveRect,
  rectFromPoints,
  sidebarPosition,
  sizeLabelPosition,
  toImageRect,
  toolbarPosition,
} from "./geometry";

const view = { width: 1707, height: 1067 };

describe("rectFromPoints", () => {
  it("normalizes any drag direction", () => {
    const expected = { x: 10, y: 20, width: 90, height: 80 };
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 100, y: 100 })).toEqual(expected);
    expect(rectFromPoints({ x: 100, y: 100 }, { x: 10, y: 20 })).toEqual(expected);
    expect(rectFromPoints({ x: 100, y: 20 }, { x: 10, y: 100 })).toEqual(expected);
  });
});

describe("clampPoint", () => {
  it("keeps pointer-captured drags inside the window", () => {
    expect(clampPoint({ x: -5, y: 2000 }, view)).toEqual({ x: 0, y: 1067 });
  });
});

describe("toImageRect", () => {
  it("scales by the DPI factor (150%)", () => {
    const r = toImageRect({ x: 100, y: 50, width: 200, height: 100 }, 1.5, {
      width: 2560,
      height: 1600,
    });
    expect(r).toEqual({ x: 150, y: 75, width: 300, height: 150 });
  });

  it("covers the whole frame for a full-view selection at 125%", () => {
    const image = { width: 1920, height: 1080 };
    const r = toImageRect({ x: 0, y: 0, width: 1536, height: 864 }, 1.25, image);
    expect(r).toEqual({ x: 0, y: 0, ...image });
  });

  it("rounds edges, not sizes, so fractional rects stay consistent", () => {
    const r = toImageRect({ x: 0.4, y: 0.4, width: 1.2, height: 1.2 }, 1.5, {
      width: 100,
      height: 100,
    });
    expect(r).toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });

  it("clamps to the image", () => {
    const r = toImageRect({ x: 90, y: 90, width: 50, height: 50 }, 1, { width: 100, height: 100 });
    expect(r).toEqual({ x: 90, y: 90, width: 10, height: 10 });
  });
});

describe("moveRect", () => {
  it("stays inside the view", () => {
    const r = { x: 0, y: 0, width: 200, height: 100 };
    expect(moveRect(r, { x: 1600, y: -40 }, view)).toEqual({ ...r, x: 1507, y: 0 });
  });
});

describe("containsPoint", () => {
  it("includes edges", () => {
    const r = { x: 10, y: 10, width: 10, height: 10 };
    expect(containsPoint(r, { x: 10, y: 20 })).toBe(true);
    expect(containsPoint(r, { x: 21, y: 15 })).toBe(false);
  });
});

describe("toolbarPosition", () => {
  const bar = { width: 240, height: 40 };

  it("goes below the selection, right-aligned", () => {
    const p = toolbarPosition({ x: 400, y: 100, width: 300, height: 200 }, bar, view);
    expect(p).toEqual({ x: 460, y: 308 });
  });

  it("flips above when the selection touches the bottom", () => {
    const p = toolbarPosition({ x: 400, y: 900, width: 300, height: 160 }, bar, view);
    expect(p.y).toBe(852);
  });

  it("goes inside for full-height selections", () => {
    const p = toolbarPosition({ x: 0, y: 0, width: 1707, height: 1067 }, bar, view);
    expect(p).toEqual({ x: 1459, y: 1019 });
  });

  it("never leaves the left edge", () => {
    const p = toolbarPosition({ x: 0, y: 100, width: 50, height: 50 }, bar, view);
    expect(p.x).toBe(8);
  });
});

describe("sizeLabelPosition", () => {
  it("sits above, or inside at the top edge", () => {
    expect(sizeLabelPosition({ x: 5, y: 100, width: 1, height: 1 }, 20)).toEqual({ x: 5, y: 76 });
    expect(sizeLabelPosition({ x: 5, y: 0, width: 1, height: 1 }, 20)).toEqual({ x: 5, y: 4 });
  });
});

describe("sidebarPosition", () => {
  const bar = { width: 48, height: 400 };

  it("sits right of the selection", () => {
    expect(sidebarPosition({ x: 100, y: 200, width: 300, height: 200 }, bar, view)).toEqual({ x: 408, y: 200 });
  });

  it("moves left when the right side is full", () => {
    const p = sidebarPosition({ x: 1300, y: 200, width: 400, height: 200 }, bar, view);
    expect(p.x).toBe(1300 - 8 - 48);
  });

  it("goes inside for full-width selections and stays on screen vertically", () => {
    const p = sidebarPosition({ x: 0, y: 900, width: 1707, height: 100 }, bar, view);
    expect(p).toEqual({ x: 1707 - 48 - 8, y: 1067 - 400 - 8 });
  });
});
