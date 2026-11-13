import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { catsAround, useWornTheme } from "../../lib/cat";
import { fatness } from "../../lib/catSeat";
import {
  BadgeCat,
  BoxCat,
  CAT_IDLE_MS,
  CHASE_MS,
  type CatIdle,
  FETCH_DROP_MS,
  FETCH_MS,
  NOSE_BUBBLE_MS,
  NOSE_POP_MS,
  type NoseBubble,
  PACKING_MS,
  PackingCat,
  ShellTurtle,
  UNPACKED_MS,
  TURTLE_HATCH_MS,
  TURTLE_SAD_MS,
  type TurtleHatch,
} from "../../lib/cats";
import { t } from "../../lib/i18n";
import {
  BadgeEvents,
  badgeCursor,
  badgeHitArea,
  badgeStroll,
  badgeStrollHurry,
  badgeStrollStop,
  badgeState,
  onWindowEvent,
  panelToggle,
  queueClear,
  queueRestore,
  textModeSet,
  undoDismiss,
  type BadgeState,
  type LeapStart,
  type Outing,
} from "../../lib/ipc";
import { drawPlay, isOuting, type Play, type Player } from "./plays";
import { BUTTON_OUT_FOR_MS, BUTTON_OUT_MS, SHRED_MS, shredPlan } from "../../lib/shred";
import { CloseIcon, UndoIcon } from "../overlay/icons";

/** With nothing happening for this long, the badge's cat nods off... */
const SLEEP_AFTER_MS = 40_000;
/** ...for a nap this long (ms, at random between), then it wakes up by itself. */
const NAP_MS: [number, number] = [45_000, 90_000];
/** Awake and left alone, it finds something to do this often (ms, at random between). */
const IDLE_EVERY_MS: [number, number] = [3_500, 7_000];
/** Before a nap it chases its own tail only now and then; otherwise it has a yawn and curls up. */
const TAIL_CHASE_CHANCE = 0.2;
/** This far into a nap (ms, at random between), a bubble starts swelling out of its nose. */
const BUBBLE_AFTER_MS: [number, number] = [8_000, 26_000];
/** If word that it's back from a walk never comes, it's back after this anyway. */
const STROLL_AT_MOST_MS = 75_000;
/** Stroked: the pointer has gone this far to and fro over it (px) without a pause this long. */
const PET_AFTER_PX = 70;
const PET_PAUSE_MS = 600;
/** It goes on purring this long after the hand is gone. */
const PURR_ON_MS = 900;

const between = ([from, to]: [number, number]) => from + Math.random() * (to - from);
const LOOK_EVERY_MS = 90;
/** Packing for a save: all of it plays, the box closed and taped, however quick the save. */
const PACK_AT_LEAST_MS = PACKING_MS;

export function Badge() {
  const [state, setState] = useState<BadgeState>({
    count: 0,
    textMode: false,
    pasting: false,
    undo: null,
    corner: "bottom-right",
    zoom: 1,
  });
  // Bumped whenever an item arrives, restarting the pill's "caught it" bounce.
  const [bump, setBump] = useState(0);
  const lastCount = useRef(0);
  // Files from another app are being dragged over the badge.
  const [dropHover, setDropHover] = useState(false);

  const seatRef = useRef<HTMLSpanElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const down = state.corner.startsWith("top");
  const worn = useWornTheme();
  const turtle = worn === "turtle";
  const monkey = worn === "monkey";
  const player: Player = monkey ? "monkey" : "cat";

  // "Geri al" brought this many items back; the cat carries them over from its box.
  const [fetching, setFetching] = useState<number | null>(null);
  const [dropped, setDropped] = useState(false);
  const [fetchDx, setFetchDx] = useState(0);
  const [asleep, setAsleep] = useState(false);
  const [poke, setPoke] = useState(0);
  // Winding down before a nap: a chase after its own tail, or a yawn.
  const [windDown, setWindDown] = useState<"chase" | "yawn" | null>(null);
  const chasing = windDown === "chase";
  // Time for a nap: it finishes what it's doing (or comes back from its walk) and settles down.
  const [sleepy, setSleepy] = useState(false);
  // The turtle, before it nods off: worried, then in tears.
  const [sad, setSad] = useState(false);
  // The turtle arriving on the badge: out of an egg, or out of the sand.
  const [hatch, setHatch] = useState<TurtleHatch | null>(null);
  // Up to something by its scratching post, or out for a walk along the taskbar.
  const [idle, setIdle] = useState<CatIdle | null>(null);
  const [strolling, setStrolling] = useState(false);
  // Asleep, a bubble swelling out of its nose; then it pops and the cat jumps awake.
  const [noseBubble, setNoseBubble] = useState<NoseBubble | null>(null);
  const strollingRef = useRef(false);
  strollingRef.current = strolling;
  // What it went down to the taskbar for.
  const outing = useRef<Outing | null>(null);
  // Its plays, dealt like a pack of cards (plays.ts).
  const pack = useRef<Play[]>([]);
  const lastPlay = useRef<Play | null>(null);
  // Being stroked.
  const [purring, setPurring] = useState(false);
  const wantedHomeRef = useRef(false);
  // The queue is being saved: the cat is in a taped box ("in"), then pops out ("out").
  const [packing, setPacking] = useState<"in" | "out" | null>(null);
  const packedAt = useRef(0);


  /** Plays a move on the cat in its seat. */
  const move = (keyframes: Keyframe[], ms: number, fill: FillMode = "none") =>
    catsAround() ? seatRef.current?.animate(keyframes, { duration: ms, easing: "ease-out", fill }) : undefined;

  // An item lands: the cat catches it, or wakes up with a start.
  useEffect(() => {
    if (state.count > lastCount.current && fetching === null) {
      setBump((n) => n + 1);
      const up = down ? 1 : -1;
      if (asleep) {
        move(
          [
            { transform: "none" },
            { transform: "scale(1.15, 0.78)", offset: 0.15 },
            { transform: `translateY(${up * 16}px) scale(0.88, 1.2) rotate(-8deg)`, offset: 0.42 },
            { transform: "scale(1.12, 0.86)", offset: 0.7 },
            { transform: "none" },
          ],
          700,
        );
      } else {
        move(
          [
            { transform: "none" },
            { transform: "scale(1.14, 0.84)", offset: 0.25 },
            { transform: "scale(0.94, 1.08)", offset: 0.55 },
            { transform: "none" },
          ],
          480,
        );
      }
    }
    lastCount.current = state.count;
  }, [state.count]);

  // Anything happening, or the pointer coming over, keeps the cat awake. Its own goings-on
  // (a walk, a scratch) don't: left alone that long, it gets sleepy.
  const hasUndo = state.undo !== null;
  // How it winds down before sleep: the cat chases its tail, the turtle mopes.
  const windDownMs = turtle ? TURTLE_SAD_MS : CHASE_MS;
  useEffect(() => {
    setAsleep(false);
    setWindDown(null);
    setSad(false);
    setSleepy(false);
    if (state.pasting || hasUndo || packing !== null || !catsAround()) return;
    const timer = setTimeout(() => setSleepy(true), SLEEP_AFTER_MS - windDownMs);
    return () => clearTimeout(timer);
  }, [state.count, state.textMode, state.pasting, hasUndo, poke, packing, turtle]);

  // Sleepy: home from its walk first, done with what it's at, then it chases its own tail a few
  // times and curls up. The turtle has no tail to chase: nobody's come, and it's sad about it,
  // worried at first and then in tears, until it cries itself to sleep.
  useEffect(() => {
    if (!sleepy || asleep) return;
    if (strolling) {
      // A walk can wait; a mouse or a visitor it sees through to the end first.
      if (outing.current === "walk") void badgeStrollHurry();
      return;
    }
    if (idle !== null) return;
    // Mostly a big yawn before it curls up; now and then a chase after its own tail first. A
    // monkey just yawns.
    const chase = !monkey && Math.random() < TAIL_CHASE_CHANCE;
    if (turtle) {
      setSad(true);
    } else {
      setWindDown(chase ? "chase" : "yawn");
    }
    const timer = setTimeout(
      () => {
        setWindDown(null);
        setSad(false);
        setAsleep(true);
      },
      turtle || chase ? windDownMs : CAT_IDLE_MS.yawn,
    );
    return () => clearTimeout(timer);
  }, [sleepy, asleep, strolling, idle, turtle]);

  // A nap doesn't last for ever: it wakes up by itself and has a good stretch.
  useEffect(() => {
    if (!asleep) return;
    const timer = setTimeout(() => {
      setPoke((n) => n + 1);
      // The cat stretches; the turtle's up for a dance.
      setIdle(turtle ? "silly" : "stretch");
    }, between(NAP_MS));
    return () => clearTimeout(timer);
  }, [asleep, turtle]);

  // Fast asleep, a bubble swells out of its nose with each breath until it pops. That gives it
  // such a fright it's wide awake.
  useEffect(() => {
    if (!asleep || turtle) return;
    let pop = 0;
    const swell = setTimeout(() => {
      setNoseBubble("grow");
      pop = window.setTimeout(() => {
        setNoseBubble("pop");
        startle();
      }, NOSE_BUBBLE_MS);
    }, between(BUBBLE_AFTER_MS));
    return () => {
      clearTimeout(swell);
      clearTimeout(pop);
      // Woken some other way, the bubble goes with the nap; a pop plays out.
      setNoseBubble((bubble) => (bubble === "grow" ? null : bubble));
    };
  }, [asleep, turtle]);

  useEffect(() => {
    if (noseBubble !== "pop") return;
    const timer = setTimeout(() => setNoseBubble(null), NOSE_POP_MS);
    return () => clearTimeout(timer);
  }, [noseBubble]);

  // Awake with nothing going on, it doesn't just sit there: it scratches its post, bats the
  // pompom, washes, kneads, yawns, hides behind the pill, or goes down to the taskbar, for a
  // walk or because something has turned up there (plays.ts).
  const calm =
    !asleep &&
    !sleepy &&
    windDown === null &&
    !strolling &&
    idle === null &&
    !state.pasting &&
    !hasUndo &&
    packing === null &&
    fetching === null &&
    !dropHover &&
    hatch === null &&
    catsAround();
  const purringNow = purring && calm && !turtle;
  const free = calm && !purringNow;
  useEffect(() => {
    if (!free) return;
    const timer = setTimeout(() => {
      // The turtle's own games: in for a dive, a dance, a roll in its shell.
      if (turtle) {
        const roll = Math.random() * 10;
        if (roll < 4) setIdle("dive");
        else if (roll < 7) setIdle("silly");
        else setIdle("shell");
        return;
      }
      // The taskbar is only there to go down to from a badge along the bottom.
      const play = drawPlay(pack.current, lastPlay.current, state.corner.startsWith("bottom"), player);
      lastPlay.current = play;
      if (isOuting(play)) void goOut(play);
      else setIdle(play);
    }, between(IDLE_EVERY_MS));
    return () => clearTimeout(timer);
  }, [free, state.corner, turtle, player]);

  // Another animal has its own pack of plays.
  useEffect(() => {
    pack.current = [];
    lastPlay.current = null;
  }, [player]);


  useEffect(() => {
    if (idle === null) return;
    const timer = setTimeout(() => setIdle(null), CAT_IDLE_MS[idle]);
    return () => clearTimeout(timer);
  }, [idle]);

  // Off down to the taskbar: what happens there is drawn by another window (stroll.rs), the
  // seat stays empty until it's back.
  const goOut = async (kind: Outing) => {
    const seat = seatRef.current?.getBoundingClientRect();
    if (!seat) return;
    const off = await badgeStroll(kind, seat.left + seat.width / 2, seat.bottom, fatness(state.count)).catch(
      () => false,
    );
    if (!off) return;
    outing.current = kind;
    setStrolling(true);
  };

  // Stroked: the pointer going to and fro over it. Its eyes shut and it purrs, for as long as
  // the hand stays and a little after.
  const strokes = useRef({ x: 0, y: 0, far: 0, at: 0 });
  const purrTimer = useRef(0);
  const onPet = (e: React.MouseEvent) => {
    const stroke = strokes.current;
    const now = performance.now();
    stroke.far = now - stroke.at > PET_PAUSE_MS ? 0 : stroke.far + Math.hypot(e.clientX - stroke.x, e.clientY - stroke.y);
    stroke.x = e.clientX;
    stroke.y = e.clientY;
    stroke.at = now;
    if (stroke.far < PET_AFTER_PX || !calm || turtle) return;
    window.clearTimeout(purrTimer.current);
    if (!purring) {
      setPurring(true);
      // Nobody falls asleep being stroked. Well, not straight away.
      setPoke((n) => n + 1);
    }
  };
  const onPetLeave = () => {
    strokes.current.far = 0;
    window.clearTimeout(purrTimer.current);
    purrTimer.current = window.setTimeout(() => setPurring(false), PURR_ON_MS);
  };

  useEffect(() => {
    if (!strolling) return;
    const timer = setTimeout(() => setStrolling(false), STROLL_AT_MOST_MS);
    return () => clearTimeout(timer);
  }, [strolling]);

  // Something's happening: home it runs.
  useEffect(() => {
    if (strollingRef.current) void badgeStrollHurry();
  }, [state.count, state.textMode, state.pasting, hasUndo, packing]);

  // Saving: into the box with it, tape on; when the save is over, out pops its head.
  const unpackTimer = useRef(0);
  const onPacking = (on: boolean) => {
    window.clearTimeout(unpackTimer.current);
    if (on) {
      if (!catsAround()) return;
      packedAt.current = Date.now();
      setPacking("in");
      return;
    }
    const wait = Math.max(0, PACK_AT_LEAST_MS - (Date.now() - packedAt.current));
    unpackTimer.current = window.setTimeout(() => {
      setPacking((current) => (current === null ? null : "out"));
      unpackTimer.current = window.setTimeout(() => setPacking(null), UNPACKED_MS);
    }, wait);
  };

  // The panel needs the cat (to push a card off, or to jump out of the bin): up it goes, and
  // drops back into its seat afterwards.
  const awayTimer = useRef(0);
  const goAway = (ms: number) => {
    // Only ever one cat: if it was out walking, the walk ends here.
    if (strollingRef.current) void badgeStrollStop();
    const sign = (document.getElementById("root")!.dataset.corner ?? "").startsWith("top") ? 1 : -1;
    const leaving = move(
      [
        { transform: "none", opacity: 1 },
        { transform: "scale(1.1, 0.8)", opacity: 1, offset: 0.3 },
        { transform: `translateY(${sign * 46}px) scale(0.9, 1.1)`, opacity: 0 },
      ],
      280,
      "forwards",
    );
    if (!leaving) return;
    window.clearTimeout(awayTimer.current);
    awayTimer.current = window.setTimeout(() => {
      leaving.cancel();
      move(
        [
          { transform: `translateY(${sign * 34}px)`, opacity: 0 },
          { transform: "scale(1.12, 0.84)", opacity: 1, offset: 0.65 },
          { transform: "none", opacity: 1 },
        ],
        360,
      );
    }, ms);
  };

  useEffect(() => {
    void badgeState().then(setState);
    const subscriptions = [
      onWindowEvent<BadgeState>(BadgeEvents.update, setState),
      onWindowEvent<LeapStart>(BadgeEvents.leap, (start) => {
        leapPending.current = start;
      }),
      onWindowEvent<boolean>(BadgeEvents.dropHover, setDropHover),
      onWindowEvent<number>(BadgeEvents.fetch, (count) => {
        if (!boxRef.current || !catsAround()) return;
        setDropped(false);
        setFetching(count);
      }),
      onWindowEvent<number>(BadgeEvents.catAway, goAway),
      onWindowEvent<boolean>(BadgeEvents.packing, (on) => onPacking(on)),
      onWindowEvent(BadgeEvents.strollBack, () => {
        setStrolling(false);
        // After a fight, as if nothing had happened: it sits down and licks a paw.
        if (outing.current === "rival" && !wantedHomeRef.current) setIdle("lick");
        outing.current = null;
        move(
          [
            { transform: "scale(1.12, 0.86)" },
            { transform: "scale(0.97, 1.04)", offset: 0.5 },
            { transform: "none" },
          ],
          260,
        );
      }),
    ];
    return () => subscriptions.forEach((s) => void s.then((u) => u()));
  }, []);

  // The content hugs the badge's corner of its window (the window grows away from it).
  useEffect(() => {
    document.getElementById("root")!.dataset.corner = state.corner;
  }, [state.corner]);

  // Only the badge itself takes the mouse; clicks anywhere else in its window go through.
  // Measured after every change, and again once size transitions (a fatter cat) have settled.
  const hitArea = useRef("");
  useLayoutEffect(() => {
    const report = () => {
      const content = document.getElementById("root")?.firstElementChild;
      if (!content) return;
      // The scratching post stands outside the row, and its pompom can be played with.
      const parts = [content, document.querySelector(".cat-tree")].filter((el): el is Element => el !== null);
      const rects = parts.map((el) => el.getBoundingClientRect());
      const left = Math.min(...rects.map((b) => b.left));
      const top = Math.min(...rects.map((b) => b.top));
      const r = {
        left,
        top,
        width: Math.max(...rects.map((b) => b.right)) - left,
        height: Math.max(...rects.map((b) => b.bottom)) - top,
      };
      const pad = 4;
      const area = [r.left - pad, r.top - pad, r.width + 2 * pad, r.height + 2 * pad].map(Math.round);
      const key = area.join();
      if (key === hitArea.current) return;
      hitArea.current = key;
      void badgeHitArea(area[0], area[1], area[2], area[3]);
    };
    report();
    const settled = setTimeout(report, 700);
    return () => clearTimeout(settled);
  });

  // "Rozet boyutu": everything on the badge is drawn that much smaller or bigger. Positions
  // measured on the page or sent by the app are window px; moves set in CSS are zoomed, so
  // they're divided by this.
  const zoom = state.zoom || 1;
  useEffect(() => {
    document.documentElement.style.zoom = String(zoom);
  }, [zoom]);

  // The box appears where the cat sat. A cat leaps into it: from the panel's bin when the bin
  // was used, otherwise the one from the seat, hopping in where it is.
  const leapPending = useRef<LeapStart | null>(null);
  const [leapFrom, setLeapFrom] = useState<{ x: number; y: number } | null>(null);
  const showingUndo = state.undo !== null && !state.pasting;

  // There's only one cat. Wanted in its box (a paste or a clear to undo, a save) or carrying
  // things back, it can't still be out on the taskbar: the walk ends on the spot.
  const wantedHome = showingUndo || packing !== null || fetching !== null;
  wantedHomeRef.current = wantedHome;
  useEffect(() => {
    if (wantedHome && strollingRef.current) void badgeStrollStop();
  }, [wantedHome]);

  // A new offer (e.g. a clear while a paste's undo is still up) can bring a new leap.
  const offer = showingUndo && state.undo ? `${state.undo.kind}-${state.undo.count}` : "";
  useLayoutEffect(() => {
    if (!showingUndo) {
      setLeapFrom(null);
      return;
    }
    // The box's slot, not the box: the box itself may be mid-animation.
    const box = boxRef.current;
    if (!box) return;
    const start = leapPending.current;
    leapPending.current = null;
    const r = box.getBoundingClientRect();
    // The leaper's anchor: bottom-centre, 28 % up the box (cats.css).
    const anchorX = r.left + r.width / 2;
    const anchorBottom = r.bottom - r.height * 0.28;
    if (start) {
      setLeapFrom({ x: (start.x - anchorX) / zoom, y: (start.y - anchorBottom) / zoom });
    } else if (catsAround()) {
      setLeapFrom({ x: 0, y: (r.height * 0.28) / zoom });
    }
  }, [showingUndo, offer]);

  // Near the end of "Geri al" the cat tears its box apart. Pressing the button still works
  // until the offer is gone; a new queue takes the offer away and this ends with it.
  const [shredding, setShredding] = useState(false);
  const undoLeft = showingUndo && state.undo ? state.undo.remainingMs : null;
  useEffect(() => {
    if (undoLeft === null || !catsAround()) {
      setShredding(false);
      return;
    }
    const wait = undoLeft - SHRED_MS;
    if (wait <= 0) {
      setShredding(true);
      return;
    }
    setShredding(false);
    const timer = setTimeout(() => setShredding(true), wait);
    return () => clearTimeout(timer);
  }, [undoLeft]);


  const shredAt = useMemo(() => shredPlan(state.corner), [state.corner]);

  // While it's awake, the cat (in its seat or in the box) looks at the pointer, wherever it is.
  const onShow = showingUndo || state.count > 0 || state.textMode;
  useEffect(() => {
    if (!onShow || asleep || !catsAround()) return;
    const root = document.documentElement;
    const look = async () => {
      const at = await badgeCursor().catch(() => null);
      const cat = boxRef.current ?? seatRef.current;
      if (!at || !cat) return;
      const r = cat.getBoundingClientRect();
      const dx = at[0] - (r.left + r.width / 2);
      const dy = at[1] - (r.top + r.height * 0.3);
      const reach = Math.hypot(dx, dy) + 70;
      root.style.setProperty("--look-x", (dx / reach).toFixed(3));
      root.style.setProperty("--look-y", (dy / reach).toFixed(3));
    };
    void look();
    const timer = setInterval(() => void look(), LOOK_EVERY_MS);
    return () => {
      clearInterval(timer);
      root.style.setProperty("--look-x", "0");
      root.style.setProperty("--look-y", "0");
    };
  }, [onShow, asleep]);

  // The badge comes up: the turtle arrives, out of an egg or digging itself out of the sand.
  const shownBefore = useRef(false);
  useEffect(() => {
    const arriving = onShow && !shownBefore.current;
    shownBefore.current = onShow;
    if (!arriving || !turtle || !catsAround()) return;
    setIdle(null);
    setHatch(Math.random() < 0.5 ? "egg" : "sand");
  }, [onShow, turtle]);

  useEffect(() => {
    if (hatch === null) return;
    const timer = setTimeout(() => setHatch(null), TURTLE_HATCH_MS);
    return () => clearTimeout(timer);
  }, [hatch]);

  // The badge is laid out: how far the cat has to go with the papers.
  // Going behind the pill takes it the same way.
  const toPill = fetching !== null || idle === "hide";
  useLayoutEffect(() => {
    if (!toPill || showingUndo) return;
    const slot = slotRef.current?.getBoundingClientRect();
    const pill = pillRef.current?.getBoundingClientRect();
    if (!slot || !pill) return;
    setFetchDx((pill.left + Math.min(pill.width / 2, 34 * zoom) - (slot.left + slot.width / 2)) / zoom);
  }, [toPill, showingUndo]);

  useEffect(() => {
    if (fetching === null) return;
    const drop = setTimeout(() => {
      setDropped(true);
      setBump((n) => n + 1);
    }, FETCH_DROP_MS);
    const back = setTimeout(() => setFetching(null), FETCH_MS);
    return () => {
      clearTimeout(drop);
      clearTimeout(back);
    };
  }, [fetching]);

  /** Its nose bubble popped: it leaps up with a start, fur on end, and looks round. */
  const startle = () => {
    setPoke((n) => n + 1);
    const up = down ? 1 : -1;
    move(
      [
        { transform: "none" },
        { transform: "scale(1.2, 0.74)", offset: 0.1 },
        { transform: `translateY(${up * 20}px) scale(0.84, 1.24) rotate(6deg)`, offset: 0.38 },
        { transform: `translateY(${up * 6}px) scale(0.92, 1.1) rotate(-4deg)`, offset: 0.6 },
        { transform: "scale(1.14, 0.84)", offset: 0.76 },
        { transform: "rotate(-3deg)", offset: 0.86 },
        { transform: "rotate(2deg)", offset: 0.93 },
        { transform: "none" },
      ],
      900,
    );
  };

  /** A press on the sleeping animal: up it jumps (the turtle out of its shell), wide awake. */
  const wake = () => {
    setPoke((n) => n + 1);
    move(
      [
        { transform: "none" },
        { transform: "scale(1.15, 0.8)", offset: 0.15 },
        { transform: `translateY(${down ? 14 : -14}px) scale(0.9, 1.15)`, offset: 0.45 },
        { transform: "scale(1.1, 0.88)", offset: 0.72 },
        { transform: "none" },
      ],
      620,
    );
  };

  // Act on press: the window never takes focus, so there may be no click event.
  const onPress = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    action();
  };

  if (state.undo && !state.pasting) {
    const { undo } = state;
    return (
      <div
        className={`undo${shredding ? " undo--shred" : ""}`}
        style={
          shredding
            ? ({ "--out-at": `${BUTTON_OUT_MS}ms`, "--out-for": `${BUTTON_OUT_FOR_MS}ms` } as React.CSSProperties)
            : undefined
        }
      >
        <span ref={boxRef} className="undo__cat">
          {turtle ? (
            <ShellTurtle leapFrom={leapFrom} flee={shredding} runDir={shredAt.hopDir} />
          ) : (
            <BoxCat leapFrom={leapFrom} shred={shredding ? shredAt : null} />
          )}
        </span>
        <div className="undo__wrap">
          <button
            type="button"
            className="undo__button"
            title={t(undo.kind === "paste" ? "badge.undo_paste_title" : "badge.undo_clear_title", { count: undo.count })}
            onMouseDown={onPress(() => void queueRestore())}
          >
            <UndoIcon />
            {t("badge.undo")}
            <span className="undo__count">{undo.count}</span>
            {/* Drains over the time left; keyed so it restarts for a new offer. */}
            <span
              key={`${undo.kind}-${undo.count}-${undo.totalMs}-${Math.round(undo.remainingMs / 1000)}`}
              className="undo__timer"
              style={
                {
                  "--from": undo.remainingMs / undo.totalMs,
                  animationDuration: `${undo.remainingMs}ms`,
                } as React.CSSProperties
              }
            />
          </button>
          <button
            type="button"
            className="badge__close"
            title={t("badge.close_undo")}
            onMouseDown={onPress(() => void undoDismiss())}
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    );
  }

  // Until the cat has dropped them in, the items it carries aren't counted yet.
  const shownCount = fetching !== null && !dropped ? 0 : state.count;
  // With items, closing is a clear (which also ends text mode), and "Geri al" can undo it.
  const closeTitle = t(state.count > 0 ? "badge.close_queue" : "badge.close_text_mode");
  const close = () => void (state.count > 0 ? queueClear() : textModeSet(false));

  return (
    <div className="badge-row">
      {packing !== null ? (
        <span className="packing-slot">
          <PackingCat done={packing === "out"} turtle={turtle} />
        </span>
      ) : (
        <BadgeCat
          fat={fatness(shownCount)}
          asleep={asleep}
          fetching={fetching}
          dx={fetchDx}
          hop={down ? 6 : -22}
          title={t("badge.open_panel")}
          seatRef={seatRef}
          slotRef={slotRef}
          pasting={state.pasting}
          onPress={onPress(() => (asleep ? wake() : void panelToggle()))}
          chasing={chasing}
          idle={windDown === "yawn" ? "yawn" : idle}
          away={strolling}
          tree={!turtle && catsAround()}
          monkey={monkey}
          bubble={noseBubble}
          purring={purringNow}
          onPet={onPet}
          onLeave={onPetLeave}
          onToyPlay={() => {
            // Woken by it, or up for a game: it bats the pompom too, now and then. The monkey's
            // bananas were pressed: it has one.
            if (asleep) setPoke((n) => n + 1);
            else if (monkey && free) setIdle("banana");
            else if (!monkey && free && Math.random() < 0.6) setIdle("bat");
          }}
          turtle={turtle}
          sad={sad}
          hatch={hatch}
          onHover={() => asleep && setPoke((n) => n + 1)}
        />
      )}
      <div ref={pillRef} className="badge-wrap">
        {dropHover ? (
          <span className="badge badge--drop">{t("panel.drop_hint")}</span>
        ) : (
          <button
            type="button"
            key={bump}
            className={`badge${state.pasting ? " badge--pasting" : ""}${bump > 0 ? " badge--bump" : ""}`}
            title={t("badge.open_panel")}
            onMouseDown={onPress(() => void panelToggle())}
            onMouseEnter={() => asleep && setPoke((n) => n + 1)}
          >
            {state.pasting
              ? t("badge.pasting")
              : t(state.textMode ? "badge.text_mode" : "badge.count", { count: shownCount })}
          </button>
        )}
        {!state.pasting && !dropHover && fetching === null && (
          <button type="button" className="badge__close" title={closeTitle} onMouseDown={onPress(close)}>
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}
