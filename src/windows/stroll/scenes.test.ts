import { describe, expect, it } from "vitest";
import type { Outing } from "../../lib/ipc";
import { AT_REST, NO_GUEST, NO_SCRAP, play, Prop, Puppet, setTheStage, type Cast, type GuestView, type ScrapView, type View } from "./scenes";
import { Stage } from "./stage";

const OUTINGS: Outing[] = ["walk", "zoomies", "laser", "mouse", "rival", "friend"];

function cast(home: number, width: number) {
  const views = { cat: { ...AT_REST }, guest: { ...NO_GUEST }, scrap: { ...NO_SCRAP } };
  const now: Cast = {
    stage: new Stage(),
    cat: new Puppet<View>((patch) => Object.assign(views.cat, patch)),
    guest: new Puppet<GuestView>((patch) => Object.assign(views.guest, patch)),
    scrap: new Prop<ScrapView>((patch) => Object.assign(views.scrap, patch)),
    home,
    seat: 14,
    width,
    watching: false,
  };
  setTheStage(now);
  return { now, views };
}

/** Plays `kind` through at 20 frames a second; `hurryAt` (ms) tells it to hurry on the way. */
async function run(kind: Outing, home: number, width: number, hurryAt = Infinity) {
  const { now, views } = cast(home, width);
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

  it("ended on the spot, an outing says so and plays nothing more", async () => {
    const { now } = cast(1770, 1920);
    const over = play(now, "mouse");
    now.stage.advance(50);
    now.stage.end();
    expect(await over).toBe(false);
  });
});
