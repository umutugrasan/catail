import { useCallback, useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { onWindowEvent, PreviewEvents, previewClose, previewCurrent, queueImageUrl } from "../../lib/ipc";
import { CloseIcon } from "../overlay/icons";

/** Keep in sync with the exit animation in preview.css. */
const EXIT_MS = 150;

export function Preview() {
  const [id, setId] = useState<string | null>(null);
  // Bumped per open so the entrance animation replays on the reused window.
  const [openCount, setOpenCount] = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const show = (next: string) => {
      setId(next);
      setClosing(false);
      setOpenCount((n) => n + 1);
    };
    const unlisten = onWindowEvent<string>(PreviewEvents.show, show);
    // Opened for the first time: the window was created for this image and its show event
    // went out before this page loaded, so ask which image it is.
    void previewCurrent()
      .then((current) => current && show(current))
      .catch(() => undefined);
    return () => void unlisten.then((u) => u());
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      void previewClose();
      setId(null);
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!id) return null;

  return (
    <div key={openCount} className={`preview${closing ? " preview--closing" : ""}`} onClick={close}>
      <img className="preview__image" src={queueImageUrl(id)} alt="" draggable={false} />
      <button type="button" className="preview__close" title={t("preview.close")} onClick={close}>
        <CloseIcon />
      </button>
    </div>
  );
}
