import { describe, expect, it } from "vitest";
import { FIT_WIDTH, pageAt, pageScale, zoomIn, zoomOut, ZOOM_STEPS } from "./pdfView";

describe("zoom", () => {
  it("steps through the list and stops at its ends", () => {
    expect(zoomIn(FIT_WIDTH)).toBe(1.25);
    expect(zoomOut(FIT_WIDTH)).toBe(0.75);
    expect(zoomIn(ZOOM_STEPS[ZOOM_STEPS.length - 1])).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    expect(zoomOut(ZOOM_STEPS[0])).toBe(ZOOM_STEPS[0]);
  });
});

describe("pageScale", () => {
  it("fills the viewer's width at zoom 1", () => {
    expect(pageScale(600, 900, 1)).toBe(1.5);
    expect(pageScale(600, 900, 2)).toBe(3);
  });

  it("doesn't blow up a tiny page", () => {
    expect(pageScale(100, 900, 1)).toBe(2);
  });

  it("copes with a viewer that has no size yet", () => {
    expect(pageScale(600, 0, 1.5)).toBe(1.5);
    expect(pageScale(0, 900, 1)).toBe(1);
  });
});

describe("pageAt", () => {
  const tops = [0, 800, 1600];

  it("is the page under the middle of the view", () => {
    expect(pageAt(tops, 0, 600)).toBe(1);
    expect(pageAt(tops, 600, 600)).toBe(2);
    expect(pageAt(tops, 1400, 600)).toBe(3);
  });

  it("is the first page when there's nothing to go on", () => {
    expect(pageAt([], 0, 600)).toBe(1);
  });
});
