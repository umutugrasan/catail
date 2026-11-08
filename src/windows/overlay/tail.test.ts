import { describe, expect, it } from "vitest";
import { makeTailScene, tailBase, tailFrame, tailSegments } from "./tail";

const view = { width: 1707, height: 1067 };
const rect = { x: 400, y: 300, width: 500, height: 300 };
const badge = { x: 1590, y: 1000 };

describe("tailBase", () => {
  it("starts past the screen edge nearest to the badge", () => {
    expect(tailBase({ x: 1680, y: 500 }, view).x).toBeGreaterThan(view.width);
    expect(tailBase({ x: 800, y: 1050 }, view).y).toBeGreaterThan(view.height);
    expect(tailBase({ x: 800, y: 20 }, view).y).toBeLessThan(0);
    expect(tailBase({ x: 20, y: 500 }, view).x).toBeLessThan(0);
  });

  it("uses a target on another monitor as it is", () => {
    expect(tailBase({ x: 2400, y: 500 }, view)).toEqual({ x: 2400, y: 500 });
  });
});

describe("makeTailScene", () => {
  it("grabs the corner facing the tail", () => {
    const scene = makeTailScene(rect, badge, view, 1);
    expect(scene.grab.x).toBeGreaterThan(0);
    expect(scene.grab.y).toBeGreaterThan(0);
  });

  it("holds a small selection by its middle", () => {
    const scene = makeTailScene({ x: 100, y: 100, width: 40, height: 30 }, badge, view, 1);
    expect(Math.abs(scene.grab.x)).toBe(0);
    expect(Math.abs(scene.grab.y)).toBe(0);
  });
});

describe("tailFrame", () => {
  const scene = makeTailScene(rect, badge, view, 1);

  it("is off screen at both ends", () => {
    expect(tailFrame(scene, 0).points).toEqual([]);
    expect(tailFrame(scene, 1).points).toEqual([]);
  });

  it("holds the snapshot still until the pull", () => {
    const frame = tailFrame(scene, 0.3);
    expect(frame.translate).toEqual({ x: 0, y: 0 });
    expect(frame.scale).toBe(1);
    expect(frame.opacity).toBe(1);
  });

  it("delivers the snapshot to the badge, small and faded", () => {
    const frame = tailFrame(scene, 0.9);
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    expect(center.x + frame.translate.x).toBeCloseTo(badge.x);
    expect(center.y + frame.translate.y).toBeCloseTo(badge.y);
    expect(Math.max(rect.width, rect.height) * frame.scale).toBeCloseTo(36);
    expect(frame.opacity).toBe(0);
  });

  it("does not grow a snapshot already smaller than the end size", () => {
    const tiny = makeTailScene({ x: 100, y: 100, width: 20, height: 10 }, badge, view, 1);
    for (let p = 0; p <= 1; p += 0.05) expect(tailFrame(tiny, p).scale).toBe(1);
  });

  it("always starts at the base, keeps the curl on screen and never produces NaN", () => {
    const scenes = [
      scene,
      makeTailScene(rect, badge, view, -1),
      makeTailScene({ x: 0, y: 0, width: view.width, height: view.height }, badge, view, 1),
      makeTailScene({ x: 1590, y: 1000, width: 4, height: 4 }, badge, view, 1),
      makeTailScene(rect, { x: 2400, y: 500 }, view, 1),
    ];
    for (const s of scenes) {
      for (let p = 0.02; p < 1; p += 0.02) {
        const { points } = tailFrame(s, p);
        expect(points[0]).toEqual(expect.objectContaining({ x: s.base.x, y: s.base.y }));
        // Skip the part coming in from off screen; the fully drawn curl is what must be visible.
        for (const point of points.slice(-40)) {
          if (p < 0.34 || p > 0.8) continue;
          expect(point.x).toBeGreaterThan(0);
          expect(point.y).toBeGreaterThan(0);
          expect(point.x).toBeLessThan(view.width);
          expect(point.y).toBeLessThan(view.height);
        }
        for (const segment of tailSegments(points)) expect(segment.d).not.toContain("NaN");
      }
    }
  });
});

describe("the turtle's flipper", () => {
  const root = { x: 1580, y: 1000 };
  const flipper = makeTailScene(rect, badge, view, 1, root, "flipper");

  it("reaches straight for the capture from under the turtle, without curling", () => {
    const points = tailFrame(flipper, 0.34).points;
    const tip = points[points.length - 1];
    const grab = { x: rect.x + rect.width / 2 + flipper.grab.x, y: rect.y + rect.height / 2 + flipper.grab.y };
    expect(points[0]).toEqual(root);
    expect(Math.hypot(tip.x - grab.x, tip.y - grab.y)).toBeLessThan(2);
    // Fully out, not yet squeezing: the grab point is exactly where it was. A curled tail ends in a spiral many points long; the arm is just the reach.
    expect(points.length).toBeLessThan(tailFrame(makeTailScene(rect, badge, view, 1, root), 0.34).points.length);
  });

  it("is a slimmer arm than a tail", () => {
    const points = tailFrame(flipper, 0.4).points;
    expect(tailSegments(points, 0.62)[0].width).toBeLessThan(tailSegments(points)[0].width);
  });
});

describe("tailSegments", () => {
  const line = Array.from({ length: 101 }, (_, i) => ({ x: i * 10, y: 0 }));

  it("has nothing to draw without a line", () => {
    expect(tailSegments([])).toEqual([]);
    expect(tailSegments([{ x: 1, y: 1 }])).toEqual([]);
  });

  it("starts at the tip, thickens toward the base, then slims where it leaves the cat", () => {
    const segments = tailSegments(line);
    expect(segments[0].d.startsWith("M1000.0 0.0")).toBe(true);
    const widest = segments.reduce((best, s, i) => (s.width > segments[best].width ? i : best), 0);
    expect(widest).toBeGreaterThan(0);
    expect(widest).toBeLessThan(segments.length - 1);
    for (let i = 1; i <= widest; i += 1) {
      expect(segments[i].width).toBeGreaterThanOrEqual(segments[i - 1].width);
    }
    for (let i = widest + 1; i < segments.length; i += 1) {
      expect(segments[i].width).toBeLessThanOrEqual(segments[i - 1].width);
    }
    expect(segments[segments.length - 1].width).toBeLessThan(segments[0].width);
  });

  it("keeps the stripes continuous across pieces", () => {
    const segments = tailSegments(line);
    expect(segments[0].dashOffset).toBe(-22);
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i].dashOffset).toBeGreaterThan(segments[i - 1].dashOffset);
    }
  });

  it("uses a fixed number of pieces at most, and joins them end to start", () => {
    const segments = tailSegments(line);
    expect(segments.length).toBeLessThanOrEqual(18);
    const lastPoint = (d: string) => d.split("L").pop();
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i].d.slice(1).startsWith(lastPoint(segments[i - 1].d) ?? "?")).toBe(true);
    }
  });
});
