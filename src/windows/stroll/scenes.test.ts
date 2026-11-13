import { describe, expect, it } from "vitest";
import type { Outing } from "../../lib/ipc";
import {
  AT_REST,
  NO_BANANA,
  NO_GUEST,
  NO_SCRAP,
  play,
  Prop,
  Puppet,
  setTheStage,
  type BananaView,
  type Cast,
  type GuestView,
  type ScrapView,
  type View,
} from "./scenes";
import { Stage } from "./stage";

const OUTINGS: Outing[] = ["walk", "zoomies", "laser", "mouse", "rival", "friend"];

function cast(home: number, width: number, animal: Cast["animal"] = "cat", height = 96) {
  const views = { cat: { ...AT_REST }, guest: { ...NO_GUEST }, scrap: { ...NO_SCRAP }, banana: { ...NO_BANANA } };
  const now: Cast = {
    stage: new Stage(),
    cat: new Puppet<View>((patch) => Object.assign(views.cat, patch)),
    guest: new Puppet<GuestView>((patch) => Object.assign(views.guest, patch)),
    scrap: new Prop<ScrapView>((patch) => Object.assign(views.scrap, patch)),
    banana: new Prop<BananaView>((patch) => Object.assign(views.banana, patch)),
    animal,
    home,
    seat: 14,
    width,
    height,
    watching: false,
  };
  setTheStage(now);
  return { now, views };
}

/** Plays `kind` through at 20 frames a second; `hurryAt` (ms) tells it to hurry on the way. */
async function run(kind: Outing, home: number, width: number, hurryAt = Infinity, animal: Cast["animal"] = "cat", height = 96) {
  const { now, views } = cast(home, width, animal, height);
  let result: boolean | null = null;
  void play(now, kind).then((back) => (result = back));
  let ms = 0;
  while (result === null && ms < 180_000) {
    if (ms >= hurryAt) now.stage.hurry();
    now.stage.advance(50);
    ms += 50;
    for (let i = 0; i < 8; i++) await Promise.resolve();
    // Nobody ever leaves the taskbar the wrong way, or goes under it.
    expect(now.cat.x).toBeGreaterThanOrEqual(0);
    expect(now.cat.x).toBeLessThanOrEqual(width);
    expect(now.cat.y).toBeGreaterThanOrEqual(0);
    expect(now.cat.y).toBeLessThanOrEqual(height);
  }
  return { now, views, result, ms };
}

describe("outings", () => {
  // The badge in a bottom corner on either side, on a wide screen and a cramped one.
  const screens: [string, number, number][] = [
    ["bottom right", 1770, 1920],
    ["bottom left", 60, 1920],
    ["a narrow screen", 660, 800],
  ];
  for (const [where, home, width] of screens) {
    for (const kind of OUTINGS) {
      it(`${kind}, ${where}: the cat ends up back on its seat, alone`, async () => {
        for (let again = 0; again < 6; again++) {
          const { now, views, result, ms } = await run(kind, home, width);
          expect(result).toBe(true);
          expect(ms).toBeLessThan(70_000);
          expect(now.cat).toMatchObject({ x: home, y: 14 });
          expect(views.cat).toMatchObject({ pose: "sit", right: false, hidden: false });
          expect(views.guest.hidden).toBe(true);
          expect(views.scrap.hidden).toBe(true);
          expect(now.watching).toBe(false);
        }
      });

      it(`${kind}, ${where}: told to hurry at any point, it's home in a few seconds`, async () => {
        for (const hurryAt of [0, 400, 1500, 3000, 4500, 6000, 7500, 9000, 11_000]) {
          const { now, views, result, ms } = await run(kind, home, width, hurryAt);
          expect(result).toBe(true);
          expect(ms).toBeLessThan(hurryAt + 6000);
          expect(now.cat).toMatchObject({ x: home, y: 14 });
          expect(views.cat).toMatchObject({ pose: "sit", right: false, hidden: false });
          expect(views.scrap.hidden).toBe(true);
        }
      });
    }
  }

  // The monkey's outings, on a screen as high as the strip is for a climb.
  const MONKEY: Outing[] = ["walk", "zoomies", "rival", "friend", "climb"];
  for (const [where, home, width] of screens) {
    for (const kind of MONKEY) {
      it(`the monkey's ${kind}, ${where}: back on its seat, alone, the bananas put away`, async () => {
        for (let again = 0; again < 4; again++) {
          const { now, views, result, ms } = await run(kind, home, width, Infinity, "monkey", 1040);
          expect(result).toBe(true);
          expect(ms).toBeLessThan(70_000);
          expect(now.cat).toMatchObject({ x: home, y: 14 });
          expect(views.cat).toMatchObject({ pose: "sit", right: false, hidden: false });
          expect(views.guest.hidden).toBe(true);
          expect(views.banana.hidden).toBe(true);
        }
      });

      it(`the monkey's ${kind}, ${where}: told to hurry, it's home in a few seconds`, async () => {
        for (const hurryAt of [0, 500, 1600, 2600, 4000, 6000, 8000, 10_000]) {
          const { now, views, result, ms } = await run(kind, home, width, hurryAt, "monkey", 1040);
          expect(result).toBe(true);
          expect(ms).toBeLessThan(hurryAt + 6000);
          expect(now.cat).toMatchObject({ x: home, y: 14 });
          expect(views.banana.hidden).toBe(true);
        }
      });
    }
  }

  // The frog's outings: it hops everywhere.
  const FROG: Outing[] = ["hops", "flyhunt", "rival", "friend"];
  for (const [where, home, width] of screens) {
    for (const kind of FROG) {
      it(`the frog's ${kind}, ${where}: back on its seat, alone`, async () => {
        for (let again = 0; again < 4; again++) {
          const { now, views, result, ms } = await run(kind, home, width, Infinity, "frog");
          expect(result).toBe(true);
          expect(ms).toBeLessThan(70_000);
          expect(now.cat).toMatchObject({ x: home, y: 14 });
          expect(views.cat).toMatchObject({ pose: "sit", right: false, hidden: false });
          expect(views.guest.hidden).toBe(true);
        }
      });

      it(`the frog's ${kind}, ${where}: told to hurry, it's home in a few seconds`, async () => {
        for (const hurryAt of [0, 500, 1600, 2600, 4000, 6000, 8000, 10_000]) {
          const { now, result, ms } = await run(kind, home, width, hurryAt, "frog");
          expect(result).toBe(true);
          expect(ms).toBeLessThan(hurryAt + 7000);
          expect(now.cat).toMatchObject({ x: home, y: 14 });
        }
      });
    }
  }

  // The capybara's outings: slow, and never alone for long.
  const CAPYBARA: Outing[] = ["birdie", "friend", "walk"];
  for (const [where, home, width] of screens) {
    for (const kind of CAPYBARA) {
      it(`the capybara's ${kind}, ${where}: back on its seat, alone`, async () => {
        for (let again = 0; again < 3; again++) {
          const { now, views, result, ms } = await run(kind, home, width, Infinity, "capybara");
          expect(result).toBe(true);
          expect(ms).toBeLessThan(70_000);
          expect(now.cat).toMatchObject({ x: home, y: 14 });
          expect(views.cat).toMatchObject({ pose: "sit", right: false, hidden: false });
          expect(views.guest.hidden).toBe(true);
        }
      });

      it(`the capybara's ${kind}, ${where}: told to hurry, it's home in a few seconds`, async () => {
        for (const hurryAt of [0, 500, 2000, 4000, 7000, 10_000]) {
          const { now, result, ms } = await run(kind, home, width, hurryAt, "capybara");
          expect(result).toBe(true);
          expect(ms).toBeLessThan(hurryAt + 6000);
          expect(now.cat).toMatchObject({ x: home, y: 14 });
        }
      });
    }
  }

  it("carries the bird on its head as it walks", async () => {
    const { now, views } = cast(1770, 1920, "capybara");
    void play(now, "birdie");
    let rode = 0;
    for (let ms = 0; ms < 30_000; ms += 50) {
      now.stage.advance(50);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      if (!views.guest.hidden && views.cat.pose === "walk") {
        expect(now.guest.y).toBe(33);
        expect(Math.abs(now.guest.x - now.cat.x)).toBeLessThan(3);
        rode++;
      }
    }
    expect(rode).toBeGreaterThan(10);
    now.stage.end();
  });

  it("catches the fly with its tongue: the fly is right at its tip when it shoots out", async () => {
    const { now, views } = cast(1770, 1920, "frog");
    void play(now, "flyhunt");
    let checked = false;
    for (let ms = 0; ms < 30_000 && !checked; ms += 50) {
      now.stage.advance(50);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      if (views.cat.pose === "tongue") {
        const dir = views.cat.right ? 1 : -1;
        expect(Math.abs(now.guest.x - (now.cat.x + dir * 30))).toBeLessThan(2);
        expect(Math.abs(now.guest.y - 30)).toBeLessThan(2);
        checked = true;
      }
    }
    expect(checked).toBe(true);
    now.stage.end();
  });

  it("climbs right up to hang in the top corner on its side of the screen", async () => {
    const { now } = cast(1770, 1920, "monkey", 1040);
    void play(now, "climb");
    let highest = 0;
    for (let ms = 0; ms < 6000; ms += 50) {
      now.stage.advance(50);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      highest = Math.max(highest, now.cat.y);
      if (now.cat.y === highest && highest > 900) expect(now.cat.x).toBeGreaterThan(1850);
    }
    expect(highest).toBeGreaterThan(960);
    now.stage.end();
  });

  it("ended on the spot, an outing says so and plays nothing more", async () => {
    const { now } = cast(1770, 1920);
    const over = play(now, "mouse");
    now.stage.advance(50);
    now.stage.end();
    expect(await over).toBe(false);
  });
});
