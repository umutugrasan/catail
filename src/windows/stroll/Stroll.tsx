import { useEffect, useRef, useState } from "react";
import { LeapingCat, SeatCat } from "../../lib/cats";
import { onWindowEvent, strollDone, StrollEvents, type StrollStart } from "../../lib/ipc";

/** Ambling along, and running home when something comes up (px/s). */
const WALK_SPEED = 38;
const RUN_SPEED = 260;
/** The hop between the badge's seat and the taskbar: how long, how far sideways, how high over. */
const HOP_MS = 440;
const HOP_SIDEWAYS = 16;
const HOP_ARC = 12;
/** Sitting on the seat before hopping off and after hopping back, while the badge swaps cats. */
const SETTLE_MS = 160;
/** How far it wanders, and how close it ever gets to the screen's edges. */
const TRIP_MIN = 110;
const TRIP_MAX = 560;
const EDGE = 40;
/** On the way out it now and then stops for a look round. */
const PAUSE_CHANCE_PER_S = 0.12;

type Phase = "settle-off" | "hop-off" | "out" | "pause" | "linger" | "home" | "hop-on" | "settle-on" | "idle";
/** What it does at the far end of the walk: a look round, or a wash. */
type Linger = "look" | "groom";

interface Walk {
  phase: Phase;
  /** ms into the phase */
  t: number;
  x: number;
  y: number;
  home: number;
  seat: number;
  /** Away from home: -1 left, 1 right. */
  dir: -1 | 1;
  target: number;
  speed: number;
  /** How long the current stop lasts. */
  stopMs: number;
  linger: Linger;
  /** Told to hurry while still hopping off. */
  hurry: boolean;
}

const random = (from: number, to: number) => from + Math.random() * (to - from);

function plan(start: StrollStart): Walk {
  const left = start.home - HOP_SIDEWAYS - EDGE;
  const right = start.width - EDGE - HOP_SIDEWAYS - start.home;
  const roomy = (room: number) => room >= TRIP_MIN;
  const dir: -1 | 1 = roomy(left) && roomy(right) ? (Math.random() < 0.5 ? -1 : 1) : left > right ? -1 : 1;
  const room = Math.max(0, dir < 0 ? left : right);
  const trip = Math.min(room, random(TRIP_MIN, TRIP_MAX));
  const linger: Linger = Math.random() < 0.5 ? "look" : "groom";
  return {
    phase: "settle-off",
    t: 0,
    x: start.home,
    y: start.seat,
    home: start.home,
    seat: start.seat,
    dir,
    target: start.home + dir * (HOP_SIDEWAYS + trip),
    speed: WALK_SPEED,
    stopMs: random(2500, 5000),
    linger,
    hurry: false,
  };
}

type Pose = "sit" | "hop" | "walk" | "run" | Linger;

/**
 * The badge's cat out for a walk along the top of the taskbar: down off its seat, along to
 * somewhere, a sit there (a look round or a wash), back, and up into its seat again.
 */
export function Stroll() {
  const catRef = useRef<HTMLDivElement>(null);
  const walk = useRef<Walk | null>(null);
  const [pose, setPose] = useState<Pose>("sit");
  // The pictures face left.
  const [facingRight, setFacingRight] = useState(false);
  const [fat, setFat] = useState(0);
  const [on, setOn] = useState(false);
  // Out of sight until the first walk; after a walk the window itself is hidden.
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const subscriptions = [
      onWindowEvent<StrollStart>(StrollEvents.start, (sent) => {
        // As big as on the badge: the page is zoomed, so its own px are that much bigger.
        const zoom = sent.zoom || 1;
        document.documentElement.style.zoom = String(zoom);
        const start = { ...sent, home: sent.home / zoom, seat: sent.seat / zoom, width: sent.width / zoom };
        walk.current = plan(start);
        // In place before the window shows, not where the last walk ended.
        if (catRef.current) catRef.current.style.transform = `translate(${start.home}px, ${-start.seat}px)`;
        setFat(start.fat);
        setPose("sit");
        setFacingRight(false);
        setSeen(true);
        setOn(true);
      }),
      onWindowEvent(StrollEvents.hurry, () => {
        const w = walk.current;
        if (!w) return;
        w.speed = RUN_SPEED;
        if (w.phase === "hop-off" || w.phase === "settle-off") w.hurry = true;
        else if (w.phase === "out" || w.phase === "pause" || w.phase === "linger") goHome(w);
        else if (w.phase === "home") setPose("run");
      }),
    ];
    return () => subscriptions.forEach((s) => void s.then((u) => u()));
  }, []);

  const goHome = (w: Walk) => {
    w.phase = "home";
    w.t = 0;
    w.target = w.home + w.dir * HOP_SIDEWAYS;
    setFacingRight(w.dir < 0);
    setPose(w.speed > WALK_SPEED ? "run" : "walk");
  };

  useEffect(() => {
    if (!on) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const w = walk.current;
      const el = catRef.current;
      const dt = Math.min(now - last, 50);
      last = now;
      if (!w || !el) return;
      w.t += dt;
      const toward = (to: number) => {
        const left = to - w.x;
        const move = (w.speed * dt) / 1000;
        if (Math.abs(left) <= move) {
          w.x = to;
          return true;
        }
        w.x += Math.sign(left) * move;
        return false;
      };
      const hop = (fromX: number, fromY: number, toX: number, toY: number) => {
        const p = Math.min(w.t / HOP_MS, 1);
        w.x = fromX + (toX - fromX) * p;
        w.y = fromY + (toY - fromY) * p + HOP_ARC * 4 * p * (1 - p);
        return p >= 1;
      };
      const next = (phase: Phase) => {
        w.phase = phase;
        w.t = 0;
      };

      switch (w.phase) {
        case "settle-off":
          if (w.t >= SETTLE_MS) {
            next("hop-off");
            setFacingRight(w.dir > 0);
            setPose("hop");
          }
          break;
        case "hop-off":
          if (hop(w.home, w.seat, w.home + w.dir * HOP_SIDEWAYS, 0)) {
            if (w.hurry) {
              goHome(w);
            } else {
              next("out");
              setPose("walk");
            }
          }
          break;
        case "out":
          if (toward(w.target)) {
            next("linger");
            setPose(w.linger);
          } else if (Math.random() < (PAUSE_CHANCE_PER_S * dt) / 1000) {
            next("pause");
            w.stopMs = random(800, 1600);
            setPose("look");
          }
          break;
        case "pause":
          if (w.t >= w.stopMs) {
            next("out");
            setPose("walk");
          }
          break;
        case "linger":
          if (w.t >= w.stopMs) goHome(w);
          break;
        case "home":
          if (toward(w.target)) {
            next("hop-on");
            setPose("hop");
          }
          break;
        case "hop-on":
          if (hop(w.home + w.dir * HOP_SIDEWAYS, 0, w.home, w.seat)) {
            next("settle-on");
            // Back on the seat it turns to face the way the badge's cat does.
            setFacingRight(false);
            setPose("sit");
          }
          break;
        case "settle-on":
          if (w.t >= SETTLE_MS) {
            next("idle");
            void strollDone();
            setOn(false);
          }
          break;
        case "idle":
          break;
      }
      el.style.transform = `translate(${w.x.toFixed(1)}px, ${(-w.y).toFixed(1)}px)`;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [on]);

  const sitting = pose === "sit" || pose === "look" || pose === "groom";
  return (
    <div ref={catRef} className={`stroll-cat stroll-cat--${pose}`} style={{ visibility: seen ? "visible" : "hidden" }}>
      <span className={`stroll-cat__facing${facingRight ? " stroll-cat__facing--right" : ""}`}>
        {sitting ? <SeatCat fat={fat} /> : <LeapingCat />}
      </span>
    </div>
  );
}
