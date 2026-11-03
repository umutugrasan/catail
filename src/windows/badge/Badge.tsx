import { useEffect, useRef, useState } from "react";
import { BoredCat, CatFace } from "../../lib/cats";
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
    const unlisten = onWindowEvent<BadgeState>(BadgeEvents.update, setState);
    return () => void unlisten.then((u) => u());
  }, []);

  // Act on press: the window never takes focus, so there may be no click event.
  const onPress = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    action();
  };

  if (state.undo && !state.pasting) {
    const { undo } = state;
    return (
      <div className="undo">
        <BoredCat />
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
