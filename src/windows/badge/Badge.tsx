import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { BadgeEvents, badgeState, onWindowEvent, panelToggle, type BadgeState } from "../../lib/ipc";

export function Badge() {
  const [state, setState] = useState<BadgeState>({ count: 0, textMode: false, pasting: false });

  useEffect(() => {
    void badgeState().then(setState);
    const unlisten = onWindowEvent<BadgeState>(BadgeEvents.update, setState);
    return () => void unlisten.then((u) => u());
  }, []);

  return (
    <button
      type="button"
      className={`badge${state.pasting ? " badge--pasting" : ""}`}
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
