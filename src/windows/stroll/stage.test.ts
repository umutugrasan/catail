import { describe, expect, it } from "vitest";
import { Cut, Gone, Stage } from "./stage";

describe("Stage", () => {
  it("glides a body along at the speed given and stops where it was sent", async () => {
    const stage = new Stage();
    const body = { x: 0, y: 0 };
    let arrived = false;
    void stage.glide(body, 100, 100).then(() => (arrived = true));
    stage.advance(500);
    expect(body.x).toBe(50);
    stage.advance(600);
    await Promise.resolve();
    expect(body.x).toBe(100);
    expect(arrived).toBe(true);
  });

  it("hops over an arc and lands on the spot", () => {
    const stage = new Stage();
    const body = { x: 0, y: 10 };
    void stage.hop(body, 20, 0, 400, 12);
    stage.advance(200);
    expect(body.x).toBe(10);
    expect(body.y).toBe(5 + 12);
    stage.advance(200);
    expect(body).toEqual({ x: 20, y: 0 });
  });

  it("cuts the moves under way when told to hurry, and plays what comes after", async () => {
    const stage = new Stage();
    const body = { x: 0, y: 0 };
    const cut = stage.glide(body, 100, 100).catch((why) => why);
    stage.advance(100);
    stage.hurry();
    expect(await cut).toBeInstanceOf(Cut);
    expect(stage.hurried).toBe(true);
    let home = false;
    void stage.glide(body, 0, 1000).then(() => (home = true));
    stage.advance(100);
    await Promise.resolve();
    expect(home).toBe(true);
  });

  it("ends for good: nothing under way or asked for later plays", async () => {
    const stage = new Stage();
    const waiting = stage.wait(100).catch((why) => why);
    stage.end();
    expect(await waiting).toBeInstanceOf(Gone);
    expect(await stage.wait(10).catch((why) => why)).toBeInstanceOf(Gone);
  });
});
