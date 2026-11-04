import { describe, expect, it } from "vitest";
import {
  chipPosition,
  clampPoint,
  containsPoint,
  handleAt,
  handleCursor,
  moveRect,
  rectFromPoints,
  resizeRect,
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

describe("handleAt", () => {
  const r = { x: 100, y: 100, width: 200, height: 100 };
  it("finds edges and corners just inside or outside the border", () => {
    expect(handleAt(r, { x: 200, y: 96 })).toBe("n");
    expect(handleAt(r, { x: 200, y: 204 })).toBe("s");
    expect(handleAt(r, { x: 95, y: 150 })).toBe("w");
    expect(handleAt(r, { x: 303, y: 150 })).toBe("e");
    expect(handleAt(r, { x: 102, y: 102 })).toBe("nw");
    expect(handleAt(r, { x: 298, y: 203 })).toBe("se");
    expect(handleAt(r, { x: 305, y: 95 })).toBe("ne");
    expect(handleAt(r, { x: 96, y: 199 })).toBe("sw");
  });
  it("ignores the middle and far away points", () => {
    expect(handleAt(r, { x: 200, y: 150 })).toBeNull();
    expect(handleAt(r, { x: 50, y: 150 })).toBeNull();
    expect(handleAt(r, { x: 200, y: 250 })).toBeNull();
  });
  it("picks the nearer edge on a tiny selection", () => {
    const tiny = { x: 100, y: 100, width: 6, height: 6 };
    expect(handleAt(tiny, { x: 105, y: 105 })).toBe("se");
    expect(handleAt(tiny, { x: 101, y: 101 })).toBe("nw");
  });
});

describe("resizeRect", () => {
  const r = { x: 100, y: 100, width: 200, height: 100 };
  it("moves only the dragged edges", () => {
    expect(resizeRect(r, "e", { x: 350, y: 0 })).toEqual({ x: 100, y: 100, width: 250, height: 100 });
    expect(resizeRect(r, "n", { x: 0, y: 50 })).toEqual({ x: 100, y: 50, width: 200, height: 150 });
    expect(resizeRect(r, "sw", { x: 80, y: 260 })).toEqual({ x: 80, y: 100, width: 220, height: 160 });
  });
  it("flips past the opposite edge", () => {
    expect(resizeRect(r, "w", { x: 340, y: 0 })).toEqual({ x: 300, y: 100, width: 40, height: 100 });
  });
  it("maps handles to cursors", () => {
    expect(handleCursor("n")).toBe("ns");
    expect(handleCursor("w")).toBe("ew");
    expect(handleCursor("se")).toBe("corner");
  });
});

describe("chipPosition", () => {
  const chip = { width: 200, height: 40 };
  it("goes to the right of the code, centred", () => {
    expect(chipPosition({ x: 100, y: 100, width: 120, height: 120 }, chip, view)).toEqual({ x: 230, y: 140 });
  });
  it("goes left near the right edge, below when neither side fits", () => {
    expect(chipPosition({ x: 1500, y: 100, width: 120, height: 120 }, chip, view)).toEqual({ x: 1290, y: 140 });
    const wide = { x: 50, y: 100, width: 1600, height: 300 };
    expect(chipPosition(wide, chip, view)).toEqual({ x: 750, y: 410 });
  });
  it("stays on screen", () => {
    const p = chipPosition({ x: 100, y: 1040, width: 30, height: 30 }, chip, view);
    expect(p.y + chip.height).toBeLessThanOrEqual(view.height);
  });
});
