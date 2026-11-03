import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { BadgeEvents, badgeState, onWindowEvent, type BadgeState } from "../../lib/ipc";

export function Badge() {
  const [state, setState] = useState<BadgeState>({ count: 0, textMode: false, pasting: false });

  useEffect(() => {
    void badgeState().then(setState);
    const unlisten = onWindowEvent<BadgeState>(BadgeEvents.update, setState);
    return () => void unlisten.then((u) => u());
  }, []);

  return (
    <div className={`badge${state.pasting ? " badge--pasting" : ""}`}>
      <span className="badge__dot" />
      {state.pasting
        ? t("badge.pasting")
        : t(state.textMode ? "badge.text_mode" : "badge.count", { count: state.count })}
    </div>
  );
}
