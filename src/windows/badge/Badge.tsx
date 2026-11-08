import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { catsAround, useWornTheme } from "../../lib/cat";
import { fatness } from "../../lib/catSeat";
import { BadgeCat, BoxCat, FETCH_DROP_MS, FETCH_MS, ShellTurtle } from "../../lib/cats";
import { t } from "../../lib/i18n";
import {
  BadgeEvents,
  badgeCursor,
  badgeMakeRoom,
  badgeState,
  onWindowEvent,
  panelToggle,
  queueClear,
  queueRestore,
  textModeSet,
  undoDismiss,
  type BadgeState,
  type LeapStart,
} from "../../lib/ipc";
import { BUTTON_OUT_FOR_MS, BUTTON_OUT_MS, SHRED_MS, shredPlan } from "../../lib/shred";
import { CloseIcon, UndoIcon } from "../overlay/icons";

/** With nothing happening for this long, the badge's cat nods off. */
const SLEEP_AFTER_MS = 20_000;
const LOOK_EVERY_MS = 90;
/** The cat hopping from its seat into the box: the box's own leap, plus a little. */
const HOP_IN_MS = 1000;
/** How long a jump or a hop needs the window taller than the badge. */
const JUMP_MS = 800;

export function Badge() {
  const [state, setState] = useState<BadgeState>({
    count: 0,
    textMode: false,
    pasting: false,
    undo: null,
    corner: "bottom-right",
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
  const turtle = useWornTheme() === "turtle";

  // "Geri al" brought this many items back; the cat carries them over from its box.
  const [fetching, setFetching] = useState<number | null>(null);
  const [dropped, setDropped] = useState(false);
  const [fetchDx, setFetchDx] = useState(0);
  const [asleep, setAsleep] = useState(false);
  const [poke, setPoke] = useState(0);
  // Something wants the window taller for a moment (a jump, a hop into the box).
  const [jumping, setJumping] = useState(false);

  const jumpFor = (ms: number) => {
    setJumping(true);
    window.clearTimeout(jumpTimer.current);
    jumpTimer.current = window.setTimeout(() => setJumping(false), ms);
  };
  const jumpTimer = useRef(0);

  /** Plays a move on the cat in its seat. */
  const move = (keyframes: Keyframe[], ms: number, fill: FillMode = "none") =>
    catsAround() ? seatRef.current?.animate(keyframes, { duration: ms, easing: "ease-out", fill }) : undefined;

  // An item lands: the cat catches it, or wakes up with a start.
  useEffect(() => {
    if (state.count > lastCount.current && fetching === null) {
      setBump((n) => n + 1);
      const up = down ? 1 : -1;
      if (asleep) {
        jumpFor(JUMP_MS);
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

  // Anything happening, or the pointer coming over, keeps the cat awake.
  const hasUndo = state.undo !== null;
  useEffect(() => {
    setAsleep(false);
    if (state.pasting || hasUndo || !catsAround()) return;
    const timer = setTimeout(() => setAsleep(true), SLEEP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state.count, state.textMode, state.pasting, hasUndo, poke]);

  // The panel needs the cat (to push a card off, or to jump out of the bin): up it goes, and
  // drops back into its seat afterwards.
  const awayTimer = useRef(0);
  const goAway = (ms: number) => {
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
    ];
    return () => subscriptions.forEach((s) => void s.then((u) => u()));
  }, []);

  // The content hugs the badge's corner of its window (the window grows away from it).
  useEffect(() => {
    document.getElementById("root")!.dataset.corner = state.corner;
  }, [state.corner]);

  // The box appears where the cat sat. A cat leaps into it: from the panel's bin when the bin
  // was used, otherwise the one from the seat, hopping in where it is.
  const leapPending = useRef<LeapStart | null>(null);
  const [leapFrom, setLeapFrom] = useState<{ x: number; y: number } | null>(null);
  const showingUndo = state.undo !== null && !state.pasting;
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
      setLeapFrom({ x: start.x - anchorX, y: start.y - anchorBottom });
    } else if (catsAround()) {
      setLeapFrom({ x: 0, y: r.height * 0.28 });
      jumpFor(HOP_IN_MS);
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

  // The pieces and the jumps need more than the badge's own height.
  const needsRoom = shredding || fetching !== null || jumping;
  useEffect(() => {
    if (!needsRoom) return;
    void badgeMakeRoom(true);
    return () => void badgeMakeRoom(false);
  }, [needsRoom]);

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

  // The badge is laid out: how far the cat has to go with the papers.
  useLayoutEffect(() => {
    if (fetching === null || showingUndo) return;
    const slot = slotRef.current?.getBoundingClientRect();
    const pill = pillRef.current?.getBoundingClientRect();
    if (!slot || !pill) return;
    setFetchDx(pill.left + Math.min(pill.width / 2, 34) - (slot.left + slot.width / 2));
  }, [fetching, showingUndo]);

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

  /** A press on the sleeping animal: up it jumps (the turtle out of its shell), wide awake. */
  const wake = () => {
    setPoke((n) => n + 1);
    jumpFor(JUMP_MS);
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
        onHover={() => asleep && !turtle && setPoke((n) => n + 1)}
      />
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
