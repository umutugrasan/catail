import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { hotkeyCheck, hotkeysResume, hotkeysSuspend } from "../../lib/ipc";
import { acceleratorFrom, prettyAccelerator } from "./accelerator";

interface Props {
  value: string;
  onChange: (accelerator: string) => void;
}

/** Click, press the new shortcut. Esc cancels. */
export function HotkeyField({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    // Our global shortcuts (e.g. PrintScreen) would otherwise swallow the keys.
    void hotkeysSuspend();

    const finish = async (accelerator: string | null) => {
      setRecording(false);
      if (!accelerator) return;
      try {
        await hotkeyCheck(accelerator);
        setError(null);
        onChange(accelerator);
      } catch (message) {
        setError(String(message));
      }
    };

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "keydown" && e.code === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        void finish(null);
        return;
      }
      // Windows only reports PrintScreen on key up.
      if (e.type === "keyup" && e.code !== "PrintScreen") return;
      const accelerator = acceleratorFrom(e);
      if (accelerator) void finish(accelerator);
    };
    const cancel = () => void finish(null);

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", cancel);
      void hotkeysResume();
    };
  }, [recording, onChange]);

  return (
    <div className="hotkey">
      <button
        type="button"
        className={`hotkey__button${recording ? " hotkey__button--recording" : ""}`}
        onClick={() => {
          setError(null);
          setRecording(true);
        }}
      >
        {recording ? t("settings.hotkey_recording") : <kbd>{prettyAccelerator(value)}</kbd>}
      </button>
      {error && <span className="hotkey__error">{error}</span>}
    </div>
  );
}
