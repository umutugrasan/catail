// The tail of the badge's cat: it comes out from under the cat (or in from the screen edge, when
// the badge is on another screen), curls around a corner of the selection and drags it back. Every frame is worked out from the progress alone, so the tail and
// the snapshot it holds can't drift apart. CSS pixels throughout; colors live in overlay.css.
import { clamp, type Point, type Rect, type Size } from "./geometry";

export const TAIL_MS = 1000;

// Phases, as fractions of TAIL_MS. The retreat overlaps the end of the pull.
const CURL_END = 0.34;
const SQUEEZE_END = 0.44;
const PULL_END = 0.86;
/** The capture reaches the cat. */
export const CAUGHT_AT = PULL_END;
const RETREAT_START = 0.8;

/** The curl: an inward spiral around the grab point. */
const CURL_OUTER = 62;
const CURL_INNER = 15;
const CURL_TURNS = 1.5;
/** How much the curl tightens when it takes hold. */
const CURL_SQUEEZE = 0.86;
/** How far inside the selection's corner the curl sits. */
const GRAB_INSET = 44;

/** Thickest near the base, narrowing over this many px toward the tip. */
const TIP_WIDTH = 21;
const BASE_WIDTH = 33;
const TAPER_LENGTH = 520;
/** It has to fit under a small cat: slim where it leaves the body, over this many px. */
const ROOT_SHARE = 0.26;
const ROOT_LENGTH = 200;
const OUTLINE = 7;
/** Width can't vary along one SVG stroke, so the tail is drawn in this many short pieces. */
const SEGMENTS = 18;
/** The tip stays plain orange for this long, then the stripes start. Dashes: see overlay.css. */
const STRIPE_START = 22;

/** The base stays this far past the screen edge, so its round end never shows. */
const OFFSCREEN = 40;
const SNAPSHOT_END_SIZE = 36;
const ARC_HEIGHT = 90;

export interface TailScene {
  /**
   * A cat curls its tail round the capture; a turtle reaches out and holds it with a flipper, a
   * monkey with its hand.
   */
  kind: TailKind;
  rect: Rect;
  target: Point;
  view: Size;
  /** Where the tail enters from, just off screen. */
  base: Point;
  /** Grab point relative to the selection's center, before the snapshot shrinks. */
  grab: Point;
  /** Curl direction: 1 clockwise, -1 counterclockwise. */
  spin: 1 | -1;
}

export interface TailFrame {
  /** Centerline from the base to the tip. Empty when the tail is fully off screen. */
  points: Point[];
  translate: Point;
  scale: number;
  rotate: number;
  opacity: number;
}

export interface TailSegment {
  d: string;
  width: number;
  /** Stripe pattern position at the start of this piece, so stripes line up across pieces. */
  dashOffset: number;
}

export type TailKind = "tail" | "flipper" | "hand" | "tongue";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const phase = (p: number, start: number, end: number) => clamp((p - start) / (end - start), 0, 1);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** The point just past the screen edge nearest to the badge. A target off this screen is used as is. */
export function tailBase(target: Point, view: Size): Point {
  const { x, y } = target;
  if (x < 0 || y < 0 || x > view.width || y > view.height) return target;
  const nearest = Math.min(x, view.width - x, y, view.height - y);
  if (nearest === view.width - x) return { x: view.width + OFFSCREEN, y };
  if (nearest === view.height - y) return { x, y: view.height + OFFSCREEN };
  if (nearest === x) return { x: -OFFSCREEN, y };
  return { x, y: -OFFSCREEN };
}

export const isOnView = ({ x, y }: Point, view: Size) => x >= 0 && y >= 0 && x <= view.width && y <= view.height;

/** Where the tail leaves the cat sitting with its middle at `cat` (the seat's 40 px picture). */
export const catTailRoot = (cat: Point): Point => ({ x: cat.x + 9, y: cat.y + 10 });

export function makeTailScene(
  rect: Rect,
  target: Point,
  view: Size,
  spin: 1 | -1,
  base: Point = tailBase(target, view),
  kind: TailKind = "tail",
): TailScene {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  // The corner facing the tail. Small selections get held by the middle.
  const insetX = Math.max(rect.width / 2 - GRAB_INSET, 0);
  const insetY = Math.max(rect.height / 2 - GRAB_INSET, 0);
  const grab = {
    x: base.x >= center.x ? insetX : -insetX,
    y: base.y >= center.y ? insetY : -insetY,
  };
  return { kind, rect, target, view, base, grab, spin };
}

/** Outer rim to center. The rim's direction of travel lines up with the way the tail arrives. */
function curl(scene: TailScene, grab: Point, tighten: number): Point[] {
  const heading = Math.atan2(grab.y - scene.base.y, grab.x - scene.base.x);
  const start = heading - (scene.spin * Math.PI) / 2;
  const count = 70;
  const points: Point[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const radius = lerp(CURL_OUTER, CURL_INNER, t) * tighten;
    const angle = start + scene.spin * 2 * Math.PI * CURL_TURNS * t;
    points.push({ x: grab.x + radius * Math.cos(angle), y: grab.y + radius * Math.sin(angle) });
  }
  return points;
}

/** Base to the curl's rim: a curve meeting it in the rim's direction, with a wave while it's loose. */
function approach(base: Point, end: Point, next: Point, wave: number, time: number): Point[] {
  const along = Math.max(distance(end, next), 0.001);
  const tangent = { x: (next.x - end.x) / along, y: (next.y - end.y) / along };
  const reach = Math.min(distance(base, end) * 0.5, 180);
  const c1 = { x: lerp(base.x, end.x, 0.35), y: lerp(base.y, end.y, 0.35) };
  const c2 = { x: end.x - tangent.x * reach, y: end.y - tangent.y * reach };
  const count = 48;
  const line: Point[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const m = 1 - t;
    line.push({
      x: m ** 3 * base.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t ** 3 * end.x,
      y: m ** 3 * base.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t ** 3 * end.y,
    });
  }
  return line.map((point, i) => {
    const before = line[Math.max(i - 1, 0)];
    const after = line[Math.min(i + 1, count)];
    const length = Math.max(distance(before, after), 0.001);
    const t = i / count;
    const offset = wave * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * (2.2 * t - 1.8 * time));
    return {
      x: point.x - ((after.y - before.y) / length) * offset,
      y: point.y + ((after.x - before.x) / length) * offset,
    };
  });
}

const polylineLength = (points: Point[]) =>
  points.reduce((sum, point, i) => (i === 0 ? 0 : sum + distance(points[i - 1], point)), 0);

/** The first `length` px of a polyline. */
function cutAt(points: Point[], length: number): Point[] {
  if (length <= 0) return [];
  const out = [points[0]];
  let left = length;
  for (let i = 1; i < points.length; i += 1) {
    const d = distance(points[i - 1], points[i]);
    if (d >= left) {
      const t = d === 0 ? 0 : left / d;
      out.push({ x: lerp(points[i - 1].x, points[i].x, t), y: lerp(points[i - 1].y, points[i].y, t) });
      return out;
    }
    left -= d;
    out.push(points[i]);
  }
  return out;
}

/** Everything on screen at `progress` (0 to 1) of the animation. */
export function tailFrame(scene: TailScene, progress: number): TailFrame {
  const p = clamp(progress, 0, 1);
  const { rect, target, view, base } = scene;
  const squeeze = easeOut(phase(p, CURL_END, SQUEEZE_END));
  const pull = easeInOut(phase(p, SQUEEZE_END, PULL_END));

  const from = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const arc = (target.y >= from.y ? -1 : 1) * ARC_HEIGHT * Math.sin(Math.PI * pull);
  const translate = { x: (target.x - from.x) * pull, y: (target.y - from.y) * pull + arc };

  const endScale = Math.min(1, SNAPSHOT_END_SIZE / Math.max(rect.width, rect.height));
  // A small flinch when the tail tightens, before the pull shrinks it for real.
  const flinch = Math.max(1 - 0.03 * Math.sin((Math.PI * phase(p, CURL_END, SQUEEZE_END)) / 2), endScale);
  const scale = lerp(flinch, endScale, pull);
  const rotate = -6 * pull;
  const opacity = 1 - phase(p, lerp(SQUEEZE_END, PULL_END, 0.8), PULL_END);

  // The grab point rides on the shrinking snapshot; the curl stays on screen around it.
  const margin = CURL_OUTER + BASE_WIDTH;
  const grab = {
    x: clamp(from.x + translate.x + scene.grab.x * scale, margin, Math.max(view.width - margin, margin)),
    y: clamp(from.y + translate.y + scene.grab.y * scale, margin, Math.max(view.height - margin, margin)),
  };

  const wave = lerp(lerp(24, 8, squeeze), 3, pull);
  let whole: Point[];
  if (scene.kind !== "tail") {
    // An arm: straight in to the grab point, the arm's own line leading on past it.
    const along = Math.max(distance(base, grab), 0.001);
    const ahead = { x: grab.x + ((grab.x - base.x) / along) * 10, y: grab.y + ((grab.y - base.y) / along) * 10 };
    whole = approach(base, grab, ahead, wave * 0.6, p);
  } else {
    const spiral = curl(scene, grab, lerp(1, CURL_SQUEEZE, squeeze));
    whole = [...approach(base, spiral[0], spiral[1], wave, p), ...spiral.slice(1)];
  }

  const out = easeOut(phase(p, 0, CURL_END));
  const back = 1 - easeIn(phase(p, RETREAT_START, 1));
  const points = cutAt(whole, polylineLength(whole) * out * back);

  return { points, translate, scale, rotate, opacity };
}

const widthAt = (fromTip: number) => lerp(TIP_WIDTH, BASE_WIDTH, clamp(fromTip / TAPER_LENGTH, 0, 1));

const rootShare = (fromBase: number) => lerp(ROOT_SHARE, 1, clamp(fromBase / ROOT_LENGTH, 0, 1));

const pathData = (points: Point[]) =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");

/** Splits the tail, tip first, into pieces that each carry their own width (times `widthScale`). */
export function tailSegments(points: Point[], widthScale = 1): TailSegment[] {
  if (points.length < 2) return [];
  const fromTip = [...points].reverse();
  const total = polylineLength(fromTip);
  const each = total / SEGMENTS;
  const segments: TailSegment[] = [];
  let walked = 0;
  let piece = [fromTip[0]];
  let pieceLength = 0;
  const flush = () => {
    segments.push({
      d: pathData(piece),
      width: widthAt(walked + pieceLength / 2) * rootShare(total - walked - pieceLength / 2) * widthScale,
      dashOffset: walked - STRIPE_START,
    });
    walked += pieceLength;
    pieceLength = 0;
    piece = [piece[piece.length - 1]];
  };
  for (let i = 1; i < fromTip.length; i += 1) {
    piece.push(fromTip[i]);
    pieceLength += distance(fromTip[i - 1], fromTip[i]);
    if (pieceLength >= each && segments.length < SEGMENTS - 1) flush();
  }
  if (piece.length > 1) flush();
  return segments;
}

const LAYERS = ["outline", "body", "stripes"] as const;

/** The flipper at the end of the turtle's arm, pointing along +x from the arm's tip. */
const FLIPPER_PATH = "M-12 0C6-27 48-33 80-10C54 11 16 24-12 0Z";
/** The monkey's hand at the end of its arm, fingers along +x, the thumb on one side. */
const HAND_PATH =
  "M-12-16C-6-22 2-22 6-22L18-38C22-44 30-40 26-34L20-22C26-24 30-24 34-23L58-26C66-27 67-15 59-14L36-12 64-12C72-12 72 0 64 0L36 0 61 4C69 6 67 17 59 15L34 10 52 18C59 22 54 31 47 27L26 18C14 24-4 22-12 14-18 6-18-8-12-16Z";
/** The frog's tongue ends in a sticky blob. */
const TONGUE_TIP_PATH = "M-6 0C-6-11 4-15 12-14 22-12 26-5 26 0 26 5 22 12 12 14 4 15-6 11-6 0Z";
/** The arm is slimmer than a tail. */
const ARM_WIDTH = 0.62;

/** Paints a frame's centerline into the tail's svg, outlines under everything so they never cut across it. */
export function drawTail(svg: SVGSVGElement, points: Point[], kind: TailKind = "tail") {
  if (svg.childElementCount === 0) {
    for (const layer of LAYERS) {
      for (let i = 0; i < SEGMENTS; i += 1) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", `overlay__tail-${layer}`);
        svg.appendChild(path);
      }
    }
  }
  const segments = tailSegments(points, kind === "tail" ? 1 : kind === "tongue" ? ARM_WIDTH * 0.7 : ARM_WIDTH);
  const tip = { flipper: FLIPPER_PATH, hand: HAND_PATH, tongue: TONGUE_TIP_PATH }[kind as Exclude<TailKind, "tail">];
  if (kind !== "tail") drawFlipper(svg, points, tip, kind);
  LAYERS.forEach((layer, l) => {
    for (let i = 0; i < SEGMENTS; i += 1) {
      const path = svg.children[l * SEGMENTS + i];
      const segment = segments[i];
      path.setAttribute("d", segment ? segment.d : "");
      if (!segment) continue;
      path.setAttribute("stroke-width", String(layer === "outline" ? segment.width + OUTLINE : segment.width));
      if (layer === "stripes") path.setAttribute("stroke-dashoffset", String(segment.dashOffset));
    }
  });
}

/** Puts the flipper (or hand) on the arm's tip, turned the way the arm points; hidden while there is no arm. */
function drawFlipper(svg: SVGSVGElement, points: Point[], shape: string, kind: TailKind) {
  let flipper = svg.querySelector<SVGPathElement>(".overlay__flipper");
  if (!flipper) {
    flipper = document.createElementNS("http://www.w3.org/2000/svg", "path");
    flipper.setAttribute("class", `overlay__flipper overlay__flipper--${kind}`);
    flipper.setAttribute("d", shape);
    svg.appendChild(flipper);
  }
  if (points.length < 2) {
    flipper.setAttribute("visibility", "hidden");
    return;
  }
  const tip = points[points.length - 1];
  const before = points[Math.max(points.length - 4, 0)];
  const angle = (Math.atan2(tip.y - before.y, tip.x - before.x) * 180) / Math.PI;
  flipper.setAttribute("visibility", "visible");
  flipper.setAttribute("transform", `translate(${tip.x.toFixed(1)} ${tip.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
}

/** Runs the animation. Resolves at the end, or by the clock if the window stops painting. */
export function playTail(snapshot: HTMLElement, tail: SVGSVGElement, scene: TailScene): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const stop = () => {
      done = true;
      resolve();
    };
    const fallback = setTimeout(stop, TAIL_MS + 300);
    const started = performance.now();
    const tick = (now: number) => {
      if (done) return;
      const progress = (now - started) / TAIL_MS;
      const frame = tailFrame(scene, progress);
      snapshot.style.transform = `translate(${frame.translate.x}px, ${frame.translate.y}px) scale(${frame.scale}) rotate(${frame.rotate}deg)`;
      snapshot.style.opacity = String(frame.opacity);
      drawTail(tail, frame.points, scene.kind);
      if (progress >= 1) {
        clearTimeout(fallback);
        stop();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}
