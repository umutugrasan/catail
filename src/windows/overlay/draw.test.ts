import { describe, expect, it } from "vitest";
import { arrowHead, extendShape, isMeaningful, startShape, type Shape } from "./draw";

const style = { color: "#ef4444", width: 4 };

describe("arrowHead", () => {
  it("points back from the tip, symmetric around the shaft", () => {
    const [l, r] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(l.x).toBeLessThan(100);
    expect(r.x).toBeCloseTo(l.x);
    expect(l.y).toBeCloseTo(-r.y);
    expect(Math.hypot(100 - l.x, l.y)).toBeCloseTo(10);
  });
});

describe("isMeaningful", () => {
  it("drops clicks and empty text", () => {
    const click: Shape = { kind: "rect", from: { x: 5, y: 5 }, to: { x: 6, y: 6 }, style };
    const drag: Shape = { kind: "rect", from: { x: 5, y: 5 }, to: { x: 50, y: 6 }, style };
    expect(isMeaningful(click)).toBe(false);
    expect(isMeaningful(drag)).toBe(true);
    expect(isMeaningful({ kind: "pen", points: [{ x: 1, y: 1 }], style })).toBe(false);
    expect(isMeaningful({ kind: "text", at: { x: 0, y: 0 }, text: "  ", style })).toBe(false);
    expect(isMeaningful({ kind: "text", at: { x: 0, y: 0 }, text: "Not", style })).toBe(true);
  });
});

describe("startShape / extendShape", () => {
  it("builds strokes point by point and boxes corner to corner", () => {
    const pen = startShape("pen", { x: 1, y: 1 }, style)!;
    expect(extendShape(pen, { x: 2, y: 3 })).toMatchObject({ points: [{ x: 1, y: 1 }, { x: 2, y: 3 }] });
    const rect = startShape("rect", { x: 1, y: 1 }, style)!;
    expect(extendShape(rect, { x: 9, y: 9 })).toMatchObject({ from: { x: 1, y: 1 }, to: { x: 9, y: 9 } });
  });

  it("returns null for tools that don't drag", () => {
    expect(startShape("select", { x: 0, y: 0 }, style)).toBeNull();
    expect(startShape("text", { x: 0, y: 0 }, style)).toBeNull();
  });
});
