import { describe, expect, it } from "vitest";
import {
  arrowHead,
  extendShape,
  fontSizeOf,
  hitTest,
  isMeaningful,
  startShape,
  textAt,
  textBox,
  textSize,
  type Shape,
  type TextShape,
} from "./draw";

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
    expect(startShape("eraser", { x: 0, y: 0 }, style)).toBeNull();
  });
});

describe("hitTest", () => {
  const rect: Shape = { kind: "rect", from: { x: 0, y: 0 }, to: { x: 100, y: 50 }, style };
  const ellipse: Shape = { kind: "ellipse", from: { x: 0, y: 0 }, to: { x: 100, y: 50 }, style };
  const line: Shape = { kind: "line", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, style };
  const pen: Shape = { kind: "pen", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], style };

  it("touches outlines, not empty interiors", () => {
    expect(hitTest(rect, { x: 50, y: 1 }, 4)).toBe(true);
    expect(hitTest(rect, { x: 50, y: 25 }, 4)).toBe(false);
    expect(hitTest(ellipse, { x: 50, y: 1 }, 4)).toBe(true);
    expect(hitTest(ellipse, { x: 50, y: 25 }, 4)).toBe(false);
  });

  it("follows lines and strokes", () => {
    expect(hitTest(line, { x: 60, y: 5 }, 4)).toBe(true);
    expect(hitTest(line, { x: 60, y: 12 }, 4)).toBe(false);
    expect(hitTest(pen, { x: 15, y: 5 }, 4)).toBe(true);
    expect(hitTest(pen, { x: 10, y: 30 }, 4)).toBe(false);
  });
});

describe("placed text", () => {
  const style = { color: "#e0457b", width: 4 };
  const hello: TextShape = { kind: "text", at: { x: 100, y: 50 }, text: "merhaba", style };

  it("sits in a box as tall as its lines and wider with spacing", () => {
    const box = textBox(hello);
    expect(box.x).toBe(100);
    expect(box.height).toBeCloseTo(textSize(4) * 1.25);
    expect(textBox({ ...hello, text: "merhaba\ndünya" }).height).toBeCloseTo(textSize(4) * 2.5);
    expect(textBox({ ...hello, spacing: 6 }).width).toBeGreaterThan(box.width);
    expect(textBox({ ...hello, size: 60 }).width).toBeGreaterThan(box.width);
  });

  it("takes its own size once one is set", () => {
    expect(fontSizeOf(hello)).toBe(textSize(4));
    expect(fontSizeOf({ ...hello, size: 40 })).toBe(40);
  });

  it("is found under the pointer, the topmost one first", () => {
    const line: Shape = { kind: "line", from: { x: 0, y: 0 }, to: { x: 300, y: 300 }, style };
    const shapes: Shape[] = [hello, line, { ...hello, text: "üstteki" }];
    expect(textAt(shapes, { x: 110, y: 60 })).toBe(2);
    expect(textAt(shapes, { x: 10, y: 400 })).toBe(-1);
    expect(textAt([line], { x: 50, y: 50 })).toBe(-1);
  });
});
