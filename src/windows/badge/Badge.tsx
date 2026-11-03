import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { BadgeEvents, badgeState, onWindowEvent, panelToggle, type BadgeState } from "../../lib/ipc";

export function Badge() {
  const [state, setState] = useState<BadgeState>({ count: 0, textMode: false, pasting: false });
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

  return (
    <button
      type="button"
      key={bump}
      className={`badge${state.pasting ? " badge--pasting" : ""}${bump > 0 ? " badge--bump" : ""}`}
      title={t("badge.open_panel")}
      // Act on press: the window never takes focus, so there may be no click event.
      onMouseDown={(e) => {
        e.preventDefault();
        void panelToggle();
      }}
    >
      <span className="badge__dot" />
      {state.pasting
        ? t("badge.pasting")
        : t(state.textMode ? "badge.text_mode" : "badge.count", { count: state.count })}
    </button>
  );
}
