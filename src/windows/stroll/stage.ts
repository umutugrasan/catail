// The clock behind a scene on the taskbar: moves that take time (a walk somewhere, a hop, a
// wait) are promises the scene awaits, all stepped from one animation frame.

/** The scene is cut short: something came up, and the cat must run home. */
export class Cut extends Error {}
/** The scene is over on the spot: nothing more of it plays. */
export class Gone extends Error {}

/** Something on the taskbar: px from the strip's left edge, and above its bottom. */
export interface Body {
  x: number;
  y: number;
}

interface Task {
  /** Moves on by `dt` ms; true when it's done. */
  step: (dt: number) => boolean;
  resolve: () => void;
  reject: (why: Error) => void;
}

/** A frame is never taken to be longer than this, so a stalled page doesn't jump. */
const FRAME_AT_MOST_MS = 50;

export class Stage {
  private tasks = new Set<Task>();
  private frame = 0;
  private last = 0;
  private gone = false;
  /** Told to hurry: what's still to play is the way home, at a run. */
  hurried = false;

  /** `paint` puts everything where it now is, once a frame. */
  constructor(private paint: () => void = () => undefined) {}

  begin() {
    this.last = performance.now();
    const tick = (now: number) => {
      this.advance(Math.min(now - this.last, FRAME_AT_MOST_MS));
      this.last = now;
      if (!this.gone) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** One frame of `dt` ms. */
  advance(dt: number) {
    for (const task of [...this.tasks]) {
      if (!this.tasks.has(task) || !task.step(dt)) continue;
      this.tasks.delete(task);
      task.resolve();
    }
    this.paint();
  }

  /** Every move under way ends with `Cut`; the scene carries on from there with its ending. */
  hurry() {
    if (this.hurried || this.gone) return;
    this.hurried = true;
    this.drop(new Cut());
  }

  /** Every move under way, and any asked for from now on, ends with `Gone`. */
  end() {
    if (this.gone) return;
    this.gone = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.drop(new Gone());
  }

  private drop(why: Error) {
    const tasks = [...this.tasks];
    this.tasks.clear();
    for (const task of tasks) task.reject(why);
  }

  /** Runs `step` every frame until it says it's done. */
  run(step: (dt: number) => boolean): Promise<void> {
    if (this.gone) return Promise.reject(new Gone());
    return new Promise((resolve, reject) => {
      this.tasks.add({ step, resolve, reject });
    });
  }

  wait(ms: number) {
    let t = 0;
    return this.run((dt) => (t += dt) >= ms);
  }

  /** Waits for `ready` to hold (or for `atMost` ms, whichever is first). */
  until(ready: () => boolean, atMost = Infinity) {
    let t = 0;
    return this.run((dt) => (t += dt) >= atMost || ready());
  }

  /** `at` is called with 0..1 over `ms`. */
  tween(ms: number, at: (p: number) => void) {
    let t = 0;
    return this.run((dt) => {
      t += dt;
      const p = Math.min(t / ms, 1);
      at(p);
      return p >= 1;
    });
  }

  /** Along the ground to `to`, at `speed` px/s. */
  glide(body: Body, to: number, speed: number) {
    return this.run((dt) => {
      const left = to - body.x;
      const move = (speed * dt) / 1000;
      if (Math.abs(left) <= move) {
        body.x = to;
        return true;
      }
      body.x += Math.sign(left) * move;
      return false;
    });
  }

  /** Through the air to `toX`, `toY` in `ms`, `arc` px over the straight line at its highest. */
  hop(body: Body, toX: number, toY: number, ms: number, arc: number) {
    const fromX = body.x;
    const fromY = body.y;
    return this.tween(ms, (p) => {
      body.x = fromX + (toX - fromX) * p;
      body.y = fromY + (toY - fromY) * p + arc * 4 * p * (1 - p);
    });
  }
}

/** For a move nobody waits for: when the scene is cut or over it just stops. */
export function aside(move: Promise<unknown>) {
  move.catch(() => undefined);
}
