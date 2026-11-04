import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BoxCat, CatFace } from "../../lib/cats";
import { t } from "../../lib/i18n";
import {
  BadgeEvents,
  badgeState,
  onWindowEvent,
  panelToggle,
  queueRestore,
  type BadgeState,
} from "../../lib/ipc";
import { UndoIcon } from "../overlay/icons";

/**
 * Where the panel's bin sits, seen from this window (logical px; see panel.rs and panel.css):
 * the panel is 168 wide, right-aligned with the badge, and ends 8 px above it; the bin button
 * is the first in its footer (8 px padding, 38 × 34). The cat stands on the 17 px bin icon.
 */
const BIN_FROM_RIGHT = 168 - 8 - 38 / 2;
const BIN_TOP_ABOVE_BADGE = 8 + 8 + 34 / 2 + 17 / 2;
/** The badge strip at the bottom of the window. */
const STRIP = 40;

export function Badge() {
  const [state, setState] = useState<BadgeState>({ count: 0, textMode: false, pasting: false, undo: null });
  // Bumped whenever an item arrives, restarting the "caught it" bounce.
  const [bump, setBump] = useState(0);
  const lastCount = useRef(0);

  useEffect(() => {
    if (state.count > lastCount.current) setBump((n) => n + 1);
    lastCount.current = state.count;
  }, [state.count]);

  useEffect(() => {
    void badgeState().then(setState);
    const subscriptions = [
      onWindowEvent<BadgeState>(BadgeEvents.update, setState),
      onWindowEvent(BadgeEvents.leap, () => {
        leapPending.current = true;
      }),
    ];
    return () => subscriptions.forEach((s) => void s.then((u) => u()));
  }, []);

  // A cat is on its way from the panel's bin: once the box is laid out, aim the leap.
  const leapPending = useRef(false);
  const boxRef = useRef<HTMLSpanElement>(null);
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
    if (!leapPending.current || !box) return;
    leapPending.current = false;
    const r = box.getBoundingClientRect();
    // The leaper's anchor: bottom-centre, 28 % up the box (cats.css).
    const anchorX = r.left + r.width / 2;
    const anchorBottom = r.bottom - r.height * 0.28;
    const startX = window.innerWidth - BIN_FROM_RIGHT;
    const startBottom = window.innerHeight - STRIP - BIN_TOP_ABOVE_BADGE;
    setLeapFrom({ x: startX - anchorX, y: startBottom - anchorBottom });
  }, [showingUndo, offer]);

  // Act on press: the window never takes focus, so there may be no click event.
  const onPress = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    action();
  };

  if (state.undo && !state.pasting) {
    const { undo } = state;
    return (
      <div className="undo">
        <span ref={boxRef} className="undo__cat">
          <BoxCat leapFrom={leapFrom} />
        </span>
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
      </div>
    );
  }

  return (
    <button
      type="button"
      key={bump}
      className={`badge${state.pasting ? " badge--pasting" : ""}${bump > 0 ? " badge--bump" : ""}`}
      title={t("badge.open_panel")}
      onMouseDown={onPress(() => void panelToggle())}
    >
      <CatFace />
      {state.pasting
        ? t("badge.pasting")
        : t(state.textMode ? "badge.text_mode" : "badge.count", { count: state.count })}
    </button>
  );
}
