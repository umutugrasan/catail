import { describe, expect, it } from "vitest";
import { END_ROOM, fitSize, roomIn, SIDE_ROOM } from "./editor";

describe("fitSize", () => {
  it("keeps a small image at its own size", () => {
    expect(fitSize({ width: 300, height: 200 }, { width: 1000, height: 800 })).toEqual({ width: 300, height: 200 });
  });

  it("shrinks a wide image to the width and a tall one to the height, keeping the shape", () => {
    expect(fitSize({ width: 2000, height: 1000 }, { width: 1000, height: 800 })).toEqual({ width: 1000, height: 500 });
    expect(fitSize({ width: 1000, height: 2000 }, { width: 1000, height: 800 })).toEqual({ width: 400, height: 800 });
  });

  it("never reaches zero", () => {
    expect(fitSize({ width: 4000, height: 2 }, { width: 100, height: 100 })).toEqual({ width: 100, height: 1 });
  });
});

describe("roomIn", () => {
  it("leaves space for the tools and the buttons", () => {
    expect(roomIn({ width: 1000, height: 800 })).toEqual({
      width: 1000 - 2 * SIDE_ROOM,
      height: 800 - 2 * END_ROOM,
    });
  });

  it("stays usable before the window has a size", () => {
    expect(roomIn({ width: 0, height: 0 })).toEqual({ width: 1, height: 1 });
  });
});
