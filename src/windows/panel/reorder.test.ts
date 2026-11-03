import { describe, expect, it } from "vitest";
import { cellAt, cellPosition, moveItem } from "./reorder";

const grid = { columns: 2, pitch: 78 };

describe("moveItem", () => {
  it("moves down and up", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("clamps the target and ignores bad sources", () => {
    expect(moveItem(["a", "b"], 0, 9)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const list = ["a", "b"];
    moveItem(list, 0, 1);
    expect(list).toEqual(["a", "b"]);
  });
});

describe("grid", () => {
  it("lays tiles out row by row", () => {
    expect(cellPosition(0, grid)).toEqual({ x: 0, y: 0 });
    expect(cellPosition(1, grid)).toEqual({ x: 78, y: 0 });
    expect(cellPosition(2, grid)).toEqual({ x: 0, y: 78 });
    expect(cellPosition(5, grid)).toEqual({ x: 78, y: 156 });
  });

  it("finds the slot under a point, clamped to existing tiles", () => {
    expect(cellAt(10, 10, grid, 5)).toBe(0);
    expect(cellAt(100, 10, grid, 5)).toBe(1);
    expect(cellAt(100, 100, grid, 5)).toBe(3);
    expect(cellAt(500, 999, grid, 5)).toBe(4);
    expect(cellAt(-20, -20, grid, 5)).toBe(0);
    expect(cellAt(10, 10, grid, 0)).toBe(0);
  });
});
