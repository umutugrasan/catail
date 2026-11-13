// What the badge's cat gets up to down on the taskbar. Each outing is a little script: the cat
// leaves its seat, something happens, and it's back on its seat at the end. Told to hurry, a
// script is cut wherever it is and the cat runs straight home.
import type { Outing } from "../../lib/ipc";
import { aside, Cut, Gone, type Body, type Stage } from "./stage";

/** Ambling along, trotting home after some excitement, and flat out (px/s). */
export const WALK_SPEED = 38;
const TROT_SPEED = 76;
export const RUN_SPEED = 260;
const CHASE_SPEED = 300;
const ZOOM_SPEED = 430;
const MOUSE_SPEED = 340;
const FLEE_SPEED = 720;
/** Anything faster than this is drawn running, not walking. */
const RUNS_ABOVE = 90;
/** The hop between the badge's seat and the taskbar: how long, how far sideways, how high over. */
const HOP_MS = 440;
export const HOP_SIDEWAYS = 16;
const HOP_ARC = 12;
/** Sitting on the seat before hopping off and after hopping back, while the badge swaps cats. */
const SETTLE_MS = 160;
/** How far it wanders, and how close it ever gets to the screen's edges. */
const TRIP_MIN = 110;
const TRIP_MAX = 560;
export const EDGE = 40;
/** How far past the end of the taskbar counts as out of sight. */
const OFFSTAGE = 36;
/** A cat at full tilt can't turn on the spot: it slides on this long first. */
const SKID_MS = 230;
const SKID_SPEED = 240;
/** This close, a mouse that was waiting is off again; the cat never gets nearer than the catch. */
const DODGE_GAP = 38;
const CATCH_GAP = 20;
/** Two cats nose to nose, and squaring up. */
const NOSE_GAP = 31;
const STANDOFF_GAP = 50;

export type CatPose =
  | "sit"
  | "look"
  | "groom"
  | "lick"
  | "roll"
  | "proud"
  | "wiggle"
  | "arch"
  | "sniff"
  | "rub"
  | "dizzy"
  | "walk"
  | "run"
  | "skid"
  | "hop"
  | "hang"
  | "beat"
  | "throw"
  | "pick";
export type Emote = "!" | "?" | "heart" | "anger";
export type GuestKind = "mouse" | "dot" | "cat";

/** How one of the cast is drawn right now. */
export interface View {
  pose: CatPose;
  /** The pictures face left. */
  right: boolean;
  hidden: boolean;
  /** Making off: it fades as it goes. */
  fleeing: boolean;
  emote: Emote | null;
  /** Changes with every emote, so the same one can play again. */
  emoteKey: number;
}

export interface GuestView extends View {
  kind: GuestKind | null;
}

/** A banana in the air, thrown in a monkey fight. */
export interface BananaView {
  hidden: boolean;
}

export interface ScrapView {
  hidden: boolean;
  /** The dust settling. */
  over: boolean;
}

export const AT_REST: View = { pose: "sit", right: false, hidden: false, fleeing: false, emote: null, emoteKey: 0 };
export const NO_GUEST: GuestView = { ...AT_REST, hidden: true, kind: null };
export const NO_SCRAP: ScrapView = { hidden: true, over: false };
export const NO_BANANA: BananaView = { hidden: true };

/** Something on the stage: where it is, and a way to change how it's drawn. */
export class Prop<V extends object> implements Body {
  x = 0;
  y = 0;
  constructor(private change: (patch: Partial<V>) => void) {}

  show(patch: Partial<V>) {
    this.change(patch);
  }
}

/** One of the cast: it faces one way or the other, and lets on what it thinks. */
export class Puppet<V extends View> extends Prop<V> {
  /** Turned round (the pictures face left). */
  right = false;
  private emotes = 0;

  show(patch: Partial<V>) {
    if (patch.right !== undefined) this.right = patch.right;
    super.show(patch);
  }

  /** Turns to face the way `dir` points (its sign). */
  face(dir: number) {
    if (dir !== 0) this.show({ right: dir > 0 } as Partial<V>);
  }

  emote(mark: Emote) {
    this.show({ emote: mark, emoteKey: ++this.emotes } as Partial<V>);
  }
}

export interface Cast {
  stage: Stage;
  cat: Puppet<View>;
  guest: Puppet<GuestView>;
  /** The cloud of dust two cats fight in. */
  scrap: Prop<ScrapView>;
  /** What monkeys throw at each other. */
  banana: Prop<BananaView>;
  /** The badge's animal: a cat, or a monkey (whose visitors are monkeys too). */
  animal: "cat" | "monkey";
  /**
   * The seat's middle from the strip's left edge, its height above the taskbar, the strip's
   * width and height (the whole height of the screen for a "climb").
   */
  home: number;
  seat: number;
  width: number;
  height: number;
  /** The cat keeps its eyes on the guest. */
  watching: boolean;
}

const random = (from: number, to: number) => from + Math.random() * (to - from);
const pick = <T>(of: readonly T[]): T => of[Math.floor(Math.random() * of.length)];

/** Everyone where an outing starts: the cat on its seat, nobody else about. */
export function setTheStage(cast: Cast) {
  cast.watching = false;
  cast.cat.x = cast.home;
  cast.cat.y = cast.seat;
  cast.cat.show(AT_REST);
  cast.guest.show(NO_GUEST);
  cast.scrap.show(NO_SCRAP);
  cast.banana.show(NO_BANANA);
}

/**
 * Plays an outing through. True when the cat is back on its seat (the badge can have it back),
 * false when the outing was ended on the spot.
 */
export async function play(cast: Cast, kind: Outing): Promise<boolean> {
  const scene = new Scene(cast);
  try {
    try {
      await (SCENES[kind] ?? walk)(scene);
    } catch (why) {
      if (!(why instanceof Cut)) throw why;
      await scene.rushHome();
    }
    return true;
  } catch (why) {
    if (why instanceof Gone) return false;
    throw why;
  }
}

class Scene {
  readonly stage: Stage;
  readonly cat: Puppet<View>;
  readonly guest: Puppet<GuestView>;
  readonly scrap: Prop<ScrapView>;
  readonly banana: Prop<BananaView>;
  readonly monkey: boolean;
  readonly home: number;
  readonly seat: number;
  readonly width: number;
  /** Toward the nearer end of the taskbar (where guests come in and leave), and away from it. */
  readonly near: -1 | 1;
  readonly far: -1 | 1;
  /** The cat is on its seat. */
  private seated = true;
  /** Somebody else is about. */
  private visited = false;

  constructor(readonly cast: Cast) {
    this.stage = cast.stage;
    this.cat = cast.cat;
    this.guest = cast.guest;
    this.scrap = cast.scrap;
    this.banana = cast.banana;
    this.monkey = cast.animal === "monkey";
    this.home = cast.home;
    this.seat = cast.seat;
    this.width = cast.width;
    this.near = cast.home > cast.width / 2 ? 1 : -1;
    this.far = this.near > 0 ? -1 : 1;
  }

  /** How far the cat can go that way from under its seat. */
  room(dir: number) {
    return Math.max(0, dir < 0 ? this.home - HOP_SIDEWAYS - EDGE : this.width - EDGE - HOP_SIDEWAYS - this.home);
  }

  /** Just out of sight past that end of the taskbar. */
  edge(dir: number) {
    return dir < 0 ? -OFFSTAGE : this.width + OFFSTAGE;
  }

  within(x: number) {
    return Math.min(Math.max(x, EDGE), this.width - EDGE);
  }

  /** `who` goes along to `to`, facing the way it's going. */
  async go(who: Puppet<View> | Puppet<GuestView>, to: number, speed: number) {
    who.face(to - who.x);
    who.show({ pose: speed > RUNS_ABOVE ? "run" : "walk" });
    await this.stage.glide(who, to, speed);
  }

  /** Down off the seat, to the `dir` side of it. */
  async hopOff(dir: number) {
    await this.stage.wait(SETTLE_MS);
    this.seated = false;
    this.cat.face(dir);
    this.cat.show({ pose: "hop" });
    await this.stage.hop(this.cat, this.home + dir * HOP_SIDEWAYS, 0, HOP_MS, HOP_ARC);
  }

  /** Off its seat, for a leap that doesn't start with a hop down. */
  leave() {
    this.seated = false;
  }

  /** A leap from wherever it is onto the ground at `to`. */
  async pounce(to: number, ms = 460, arc = 18) {
    this.seated = false;
    this.cat.face(to - this.cat.x);
    this.cat.show({ pose: "hop" });
    await this.stage.hop(this.cat, to, 0, ms, arc);
  }

  /** Back to under the seat and up onto it. */
  async goHome(speed: number) {
    const { cat, home } = this;
    const side = cat.x >= home ? 1 : -1;
    await this.go(cat, home + side * HOP_SIDEWAYS, speed);
    cat.face(-side);
    cat.show({ pose: "hop" });
    await this.stage.hop(cat, home, this.seat, HOP_MS, HOP_ARC);
    await this.settle();
  }

  private async settle() {
    this.seated = true;
    this.cat.x = this.home;
    this.cat.y = this.seat;
    // On the seat it faces the way the badge's cat does.
    this.cat.show({ pose: "sit", right: false });
    await this.stage.wait(SETTLE_MS);
  }

  /** Somebody turns up at `x`, on the ground. */
  bring(kind: GuestKind, x: number) {
    this.visited = true;
    this.guest.x = x;
    this.guest.y = 0;
    this.guest.show({ ...NO_GUEST, kind, hidden: false });
  }

  /** The guest is out of sight: nothing of it is left. */
  dismiss() {
    this.visited = false;
    this.guest.show({ hidden: true, emote: null });
  }

  /** Cut short: whoever came makes off, and the cat runs home from wherever it is. */
  async rushHome() {
    const { cat, guest, scrap, stage, home } = this;
    this.cast.watching = false;
    scrap.show({ hidden: true });
    this.banana.show({ hidden: true });
    cat.show({ hidden: false, emote: null });
    if (this.visited) {
      guest.y = Math.min(guest.y, 6);
      guest.face(this.near);
      guest.show({ hidden: false, fleeing: true, emote: null, pose: "run" });
      aside(stage.glide(guest, this.edge(this.near), FLEE_SPEED));
    }
    if (this.seated) {
      await this.settle();
      return;
    }
    if (cat.y > 0) {
      // Caught in the air. Only just off its seat, it's straight back up; otherwise down first.
      if (Math.abs(cat.x - home) <= HOP_SIDEWAYS + 2) {
        cat.face(home - cat.x);
        cat.show({ pose: "hop" });
        await stage.hop(cat, home, this.seat, 220, 4);
        await this.settle();
        return;
      }
      await stage.hop(cat, cat.x, 0, 140, 0);
    }
    await this.goHome(RUN_SPEED);
  }

  /**
   * The cat after `prey` until `over()`. It can't turn on the spot, so prey that doubles back
   * gets past it; and it never quite catches up.
   */
  chase(prey: Body, over: () => boolean) {
    const { cat } = this;
    let dir = Math.sign(prey.x - cat.x) || this.far;
    let skid = 0;
    cat.face(dir);
    cat.show({ pose: "run" });
    return this.stage.run((dt) => {
      if (over()) return true;
      const want = Math.sign(prey.x - cat.x) || dir;
      if (want !== dir || skid > 0) {
        if (skid === 0) cat.show({ pose: "skid" });
        skid += dt;
        cat.x = this.within(cat.x + ((dir * SKID_SPEED * dt) / 1000) * Math.max(0, 1 - skid / SKID_MS));
        if (skid >= SKID_MS) {
          skid = 0;
          dir = want;
          cat.face(dir);
          cat.show({ pose: "run" });
        }
        return false;
      }
      if (Math.abs(prey.x - cat.x) > CATCH_GAP) cat.x = this.within(cat.x + (dir * CHASE_SPEED * dt) / 1000);
      return false;
    });
  }
}

/** A walk: along to somewhere, a sit there, and back. */
async function walk(s: Scene) {
  const { stage, cat, home } = s;
  const roomy = (dir: number) => s.room(dir) >= TRIP_MIN;
  const dir = roomy(-1) && roomy(1) ? pick([-1, 1]) : s.room(-1) > s.room(1) ? -1 : 1;
  const trip = Math.min(s.room(dir), random(TRIP_MIN, TRIP_MAX));
  const end = home + dir * (HOP_SIDEWAYS + trip);
  await s.hopOff(dir);
  // On a longer walk it stops for a look round on the way.
  if (trip > 220 && Math.random() < 0.6) {
    await s.go(cat, cat.x + (end - cat.x) * random(0.35, 0.65), WALK_SPEED);
    cat.show({ pose: "look" });
    await stage.wait(random(800, 1600));
  }
  await s.go(cat, end, WALK_SPEED);
  // There: a look round, a wash, a paw to lick, or a roll on its back.
  cat.show({ pose: pick(["look", "groom", "lick", "roll"] as const) });
  await stage.wait(random(2600, 4800));
  await s.goHome(WALK_SPEED);
}

/** The mad half-minute: a wiggle, then flat out up and down the taskbar for no reason at all. */
async function zoomies(s: Scene) {
  const { stage, cat, home } = s;
  cat.show({ pose: "wiggle" });
  await stage.wait(750);
  let side = s.room(-1) > s.room(1) ? -1 : 1;
  await s.hopOff(side);
  const laps = Math.random() < 0.5 ? 4 : 3;
  for (let lap = 0; lap < laps; lap++) {
    const reach = Math.min(s.room(side), random(150, 420));
    if (reach >= 40) {
      await s.go(cat, home + side * (HOP_SIDEWAYS + reach), ZOOM_SPEED);
      cat.show({ pose: "skid" });
      await stage.glide(cat, s.within(cat.x + side * 16), 130);
    }
    side = -side;
  }
  await s.goHome(ZOOM_SPEED);
  cat.show({ pose: "look" });
  await stage.wait(700);
  cat.show({ pose: "sit" });
}

/** A red dot on the taskbar: there's no catching it, but that never stopped a cat. */
async function laser(s: Scene) {
  const { stage, cat, guest: dot, home, far } = s;
  /** Where the dot darts to next: away from the cat if there's room, never far from home. */
  const next = () => {
    const away = Math.sign(dot.x - cat.x) || far;
    const span = random(110, 230);
    for (const dir of [away, -away]) {
      const x = dot.x + dir * span;
      if (x === s.within(x) && Math.abs(x - home) <= 420 && Math.abs(x - cat.x) > 70) return x;
    }
    return s.within(home + far * random(60, 200));
  };
  /** The pounce, and the dot gone from under it. */
  const pounce = async (ms: number, arc: number) => {
    const escape = async () => {
      await stage.wait(ms * 0.7);
      await stage.glide(dot, next(), 1300);
    };
    await Promise.all([s.pounce(dot.x, ms, arc), escape()]);
    cat.show({ pose: "look" });
    await stage.wait(280);
  };

  s.bring("dot", s.within(home + far * random(50, 90)));
  dot.y = 4;
  s.cast.watching = true;
  await stage.wait(700);
  cat.emote("!");
  await stage.wait(450);
  cat.show({ pose: "wiggle" });
  await stage.wait(800);
  await pounce(480, 20);
  for (let i = 0; i < 3; i++) {
    await s.go(cat, dot.x - Math.sign(dot.x - cat.x) * 28, CHASE_SPEED);
    cat.show({ pose: "wiggle" });
    await stage.wait(340);
    await pounce(270, 12);
  }
  // Up the wall it goes, and out. One last jump after it.
  await s.go(cat, dot.x - Math.sign(dot.x - cat.x) * 22, CHASE_SPEED);
  const jump = async () => {
    await stage.wait(140);
    cat.show({ pose: "hop" });
    await stage.hop(cat, cat.x, 0, 480, 30);
  };
  dot.show({ fleeing: true });
  await Promise.all([stage.tween(560, (p) => (dot.y = 4 + p * 120)), jump()]);
  s.dismiss();
  s.cast.watching = false;
  cat.emote("?");
  cat.show({ pose: "look" });
  await stage.wait(1600);
  await s.goHome(TROT_SPEED);
}

/** A mouse comes in from off the screen, right under the cat's nose. The chase is on. */
async function mouse(s: Scene) {
  const { stage, cat, guest, home, near, far } = s;
  const toScreenEdge = near > 0 ? s.width - home : home;
  s.bring("mouse", s.edge(near));
  s.cast.watching = true;
  // In it comes, with a stop to sniff the air: that's when the cat sees it.
  await s.go(guest, home + near * Math.min(70, toScreenEdge * 0.5), 120);
  guest.show({ pose: "sniff" });
  await stage.wait(700);
  cat.emote("!");
  await stage.wait(400);
  cat.show({ pose: "wiggle" });
  // On it creeps, right under the seat.
  await s.go(guest, home + far * 44, 64);
  guest.show({ pose: "sniff" });
  await stage.wait(300);

  let escaped = false;
  const flee = async () => {
    // The cat is in the air: time to go.
    await stage.wait(300);
    guest.emote("!");
    const out = home + far * (HOP_SIDEWAYS + Math.min(s.room(far), random(230, 430)));
    const stops = [out];
    // Now and then it leads the cat a longer dance.
    if (Math.random() < 0.5) {
      stops.push(home + far * random(24, 60), home + far * (HOP_SIDEWAYS + Math.min(s.room(far), random(130, 220))));
    }
    // At each stop it waits, cheeky, until the cat is nearly on it, then doubles back past it.
    for (const stop of stops) {
      await s.go(guest, stop, MOUSE_SPEED);
      guest.face(cat.x - guest.x);
      guest.show({ pose: "sit" });
      await stage.until(() => Math.abs(cat.x - guest.x) < DODGE_GAP, 2500);
    }
    // And off the way it came.
    await s.go(guest, s.edge(near), MOUSE_SPEED + 60);
    escaped = true;
  };
  const hunt = async () => {
    await s.pounce(guest.x);
    await stage.wait(120);
    await s.chase(guest, () => escaped);
    // Gone. It stares after it a while.
    cat.show({ pose: "look" });
    cat.emote("?");
    await stage.wait(1400);
  };
  await Promise.all([flee(), hunt()]);
  s.dismiss();
  s.cast.watching = false;
  await s.goHome(TROT_SPEED);
}

/** Another cat strolls in and stops below the seat, looking up. */
async function visit(s: Scene, spot: number) {
  const { stage, cat, guest, home, near } = s;
  s.bring("cat", s.edge(near));
  s.cast.watching = true;
  await s.go(guest, home + near * 26, WALK_SPEED * 1.6);
  cat.emote("!");
  await s.go(guest, spot, WALK_SPEED * 1.6);
  guest.face(near);
  guest.show({ pose: "look" });
  await stage.wait(600);
}

/** A banana from `from` to `to`'s head, end over end; a hit, or a miss that lands behind. */
async function throwBanana(s: Scene, from: Puppet<View>, to: Puppet<View>, hit: boolean) {
  const { stage, banana } = s;
  from.face(to.x - from.x);
  from.show({ pose: "throw" });
  await stage.wait(260);
  banana.x = from.x;
  banana.y = 26;
  banana.show({ hidden: false });
  const past = Math.sign(to.x - from.x) * (hit ? 0 : 26);
  await stage.hop(banana, to.x + past, hit ? 24 : 0, 520, 34);
  banana.show({ hidden: true });
  from.show({ pose: "beat" });
  if (hit) {
    to.emote("!");
    to.show({ pose: "dizzy" });
    await stage.wait(520);
    to.show({ pose: "beat" });
  } else {
    to.emote("?");
    await stage.wait(300);
  }
}

/** Another monkey: chests beaten, bananas thrown, then a scrap in a cloud of dust. */
async function bananaFight(s: Scene) {
  const { stage, cat, guest, home, far } = s;
  await visit(s, home + far * (HOP_SIDEWAYS + STANDOFF_GAP + 30));
  cat.show({ pose: "beat" });
  cat.emote("anger");
  await stage.wait(800);
  guest.show({ pose: "beat" });
  guest.emote("anger");
  await stage.wait(700);
  await s.hopOff(far);
  cat.show({ pose: "beat" });
  await stage.wait(400);
  // Bananas, back and forth: the visitor's first one misses.
  await throwBanana(s, guest, cat, false);
  await throwBanana(s, cat, guest, true);
  await throwBanana(s, guest, cat, true);
  await throwBanana(s, cat, guest, true);
  await stage.wait(300);
  await scrapAndChaseOff(s);
}

/** A strange cat on its taskbar: backs up, a lot of noise, a scrap in a cloud of dust. */
async function rival(s: Scene) {
  if (s.monkey) return bananaFight(s);
  const { stage, cat, guest, home, near, far } = s;
  await visit(s, home + far * (HOP_SIDEWAYS + STANDOFF_GAP));
  // It isn't having that: its back goes up, on the seat first, then face to face.
  cat.show({ pose: "arch" });
  cat.emote("anger");
  await stage.wait(900);
  guest.show({ pose: "arch" });
  guest.emote("anger");
  await stage.wait(700);
  await s.hopOff(far);
  cat.show({ pose: "arch" });
  for (let i = 0; i < 2; i++) {
    await stage.wait(320);
    (i === 0 ? cat : guest).emote("anger");
    await Promise.all([stage.glide(cat, cat.x + far * 5, 50), stage.glide(guest, guest.x + near * 5, 50)]);
  }
  await stage.wait(260);
  await scrapAndChaseOff(s);
}

/** Into each other, a cloud of dust; it settles with the visitor beaten, and off it runs. */
async function scrapAndChaseOff(s: Scene) {
  const { stage, cat, guest, scrap, near, far } = s;
  const middle = (cat.x + guest.x) / 2;
  cat.show({ pose: "hop" });
  guest.show({ pose: "hop" });
  await Promise.all([stage.hop(cat, middle, 0, 240, 12), stage.hop(guest, middle, 0, 240, 12)]);
  cat.show({ hidden: true, emote: null });
  guest.show({ hidden: true, emote: null });
  scrap.x = middle;
  scrap.y = 0;
  scrap.show({ hidden: false, over: false });
  for (const sway of [far * 24, near * 34, far * 18, near * 6]) {
    await stage.glide(scrap, middle + sway, 62);
    await stage.wait(160);
  }
  // The dust settles with the two the other way round: the visitor has had enough.
  cat.x = scrap.x + far * 22;
  guest.x = scrap.x + near * 22;
  cat.y = guest.y = 0;
  scrap.show({ over: true });
  cat.face(near);
  cat.show({ hidden: false, pose: s.monkey ? "beat" : "arch" });
  guest.face(far);
  guest.show({ hidden: false, pose: "dizzy" });
  await stage.wait(700);
  scrap.show({ hidden: true });
  // Off it runs, the way it came, seen off with a last hiss.
  const seeOff = async () => {
    cat.emote("anger");
    await s.go(cat, cat.x + near * 14, 180);
    cat.show({ pose: "proud" });
  };
  await Promise.all([s.go(guest, s.edge(near), 440), seeOff()]);
  s.dismiss();
  s.cast.watching = false;
  await stage.wait(1100);
  await s.goHome(WALK_SPEED * 1.3);
}

/** A cat it knows: noses touch, heads rub, a game of leapfrog, and the visitor is on its way. */
async function friend(s: Scene) {
  const { stage, cat, guest, home, near, far } = s;
  await visit(s, home + far * (HOP_SIDEWAYS + STANDOFF_GAP));
  guest.emote("heart");
  await stage.wait(500);
  await s.hopOff(far);
  // Up to each other, slowly, until their noses meet.
  const gap = Math.abs(guest.x - cat.x) - NOSE_GAP;
  await Promise.all([s.go(cat, cat.x + far * gap * 0.35, 34), s.go(guest, guest.x + near * gap * 0.65, 34)]);
  cat.show({ pose: "sniff" });
  guest.show({ pose: "sniff" });
  await stage.wait(1300);
  cat.emote("heart");
  cat.show({ pose: "rub" });
  guest.show({ pose: "rub" });
  await stage.wait(900);
  guest.emote("heart");
  await stage.wait(900);
  if (s.monkey) {
    // Monkeys groom each other: each in turn picks through the other's fur, the other blissful.
    guest.show({ pose: "pick" });
    cat.show({ pose: "proud" });
    await stage.wait(1500);
    cat.emote("heart");
    await stage.wait(700);
    cat.show({ pose: "pick" });
    guest.show({ pose: "proud" });
    await stage.wait(1500);
    guest.emote("heart");
    await stage.wait(600);
  }
  // The visitor wants a game: a wiggle, and it's over the cat's head.
  guest.show({ pose: "wiggle" });
  cat.show({ pose: "look" });
  await stage.wait(600);
  guest.show({ pose: "hop" });
  await stage.hop(guest, cat.x + near * 36, 0, 540, 34);
  cat.face(near);
  guest.face(far);
  guest.show({ pose: "look" });
  await stage.wait(500);
  guest.emote("heart");
  await stage.wait(700);
  await s.go(guest, s.edge(near), WALK_SPEED * 1.8);
  s.dismiss();
  s.cast.watching = false;
  await stage.wait(400);
  await s.goHome(WALK_SPEED * 1.3);
}

/**
 * A monkey's leap: from its seat all the way up to the top corner of the screen, where it hangs
 * by one arm and swings, has a look round, and drops back down.
 */
async function climb(s: Scene) {
  const { stage, cat, near } = s;
  // Hanging by its hand from the top edge: the picture's height and its arm below that.
  const hangAt = s.cast.height - HANG_BELOW_TOP;
  if (hangAt < 120) return walk(s);
  const x = near > 0 ? s.width - CORNER_IN : CORNER_IN;
  cat.show({ pose: "wiggle" });
  await stage.wait(600);
  cat.emote("!");
  await stage.wait(300);
  s.leave();
  cat.face(x - cat.x || near);
  cat.show({ pose: "hop" });
  await stage.hop(cat, x, hangAt, CLIMB_MS, 30);
  cat.face(-near);
  cat.show({ pose: "hang" });
  await stage.wait(1800);
  cat.emote("heart");
  await stage.wait(1900);
  cat.emote("!");
  await stage.wait(500);
  // Lets go, and down it drops.
  cat.show({ pose: "hop" });
  await stage.hop(cat, s.within(x - near * 70), 0, DROP_MS, 16);
  cat.show({ pose: "sit" });
  await stage.wait(260);
  await s.goHome(TROT_SPEED);
}

/** Up to the top of the screen and down again (ms); how far in from the corner it hangs (px). */
const CLIMB_MS = 760;
const DROP_MS = 820;
const CORNER_IN = 30;
const HANG_BELOW_TOP = 36;

const SCENES: Record<Outing, (scene: Scene) => Promise<void>> = { walk, zoomies, laser, mouse, rival, friend, climb };
