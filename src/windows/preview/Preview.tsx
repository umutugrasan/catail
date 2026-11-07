import { useCallback, useEffect, useState } from "react";
import { onWindowEvent, PreviewEvents, previewClose, previewCurrent, queueItems, type QueueItemView } from "../../lib/ipc";
import { ImageEditor } from "./ImageEditor";
import { TextEditor } from "./TextEditor";

/** Keep in sync with the exit animation in preview.css. */
const EXIT_MS = 150;

export function Preview() {
  const [item, setItem] = useState<QueueItemView | null>(null);
  // Bumped per open: each one starts a fresh editor, and replays the entrance animation.
  const [openCount, setOpenCount] = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const show = (id: string) => {
      void queueItems().then((items) => {
        const next = items.find((candidate) => candidate.id === id);
        if (!next) {
          void previewClose();
          return;
        }
        setItem(next);
        setClosing(false);
        setOpenCount((n) => n + 1);
      });
    };
    const unlisten = onWindowEvent<string>(PreviewEvents.show, show);
    // Opened for the first time: the window was created for this item and its show event
    // went out before this page loaded, so ask which item it is.
    void previewCurrent()
      .then((current) => current && show(current))
      .catch(() => undefined);
    return () => void unlisten.then((u) => u());
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      void previewClose();
      setItem(null);
    }, EXIT_MS);
  }, []);

  if (!item) return null;

  return item.kind === "image" ? (
    <ImageEditor key={openCount} item={item} closing={closing} onClose={close} />
  ) : (
    <TextEditor key={openCount} item={item} closing={closing} onClose={close} />
  );
}
