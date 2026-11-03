import { describe, expect, it } from "vitest";
import { moveItem, rowAt } from "./reorder";

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

describe("rowAt", () => {
  it("maps offsets to rows within bounds", () => {
    expect(rowAt(0, 64, 3)).toBe(0);
    expect(rowAt(130, 64, 3)).toBe(2);
    expect(rowAt(-10, 64, 3)).toBe(0);
    expect(rowAt(999, 64, 3)).toBe(2);
    expect(rowAt(10, 64, 0)).toBe(0);
  });
});
