import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { t } from "../../lib/i18n";
import {
  captureCommit,
  captureSave,
  frameUrl,
  onWindowEvent,
  overlayCancel,
  overlayReady,
  overlaySelectionStarted,
  overlaySession,
  OverlayEvents,
  type OverlayInfo,
} from "../../lib/ipc";
import {
  clampPoint,
  containsPoint,
  moveRect,
  rectFromPoints,
  sizeLabelPosition,
  toImageRect,
  toolbarPosition,
  type Point,
  type Rect,
} from "./geometry";

/** Selections smaller than this (CSS px) count as a stray click. */
const MIN_SELECTION = 3;
const TOOLBAR_SIZE = { width: 252, height: 40 };
const SIZE_LABEL_HEIGHT = 22;

type Drag =
  | { kind: "none" }
  | { kind: "select"; anchor: Point }
  | { kind: "move"; offset: Point };

const viewSize = () => ({ width: window.innerWidth, height: window.innerHeight });

export function Overlay() {
  const [info, setInfo] = useState<OverlayInfo | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<Drag>({ kind: "none" });
  const busy = useRef(false);

  const resetSelection = useCallback(() => {
    setSelection(null);
    setDrag({ kind: "none" });
  }, []);

  // Pull the current session: on startup (window may be created mid-capture) and on refresh.
  const loadSession = useCallback(async () => {
    resetSelection();
    busy.current = false;
    setInfo(await overlaySession());
  }, [resetSelection]);

  useEffect(() => {
    void loadSession();
    const subscriptions = [
      onWindowEvent(OverlayEvents.refresh, () => void loadSession()),
      onWindowEvent(OverlayEvents.clearSelection, resetSelection),
      onWindowEvent(OverlayEvents.reset, () => {
        resetSelection();
        setInfo(null);
      }),
    ];
    return () => subscriptions.forEach((s) => void s.then((unlisten) => unlisten()));
  }, [loadSession, resetSelection]);

  const finish = useCallback(
    (action: "copy" | "save") => {
      if (!info || !selection || busy.current) return;
      busy.current = true;
      const scale = info.width / window.innerWidth;
      const rect = toImageRect(selection, scale, info);
      void (action === "copy" ? captureCommit(rect) : captureSave(rect));
    },
    [info, selection],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "escape") {
        e.preventDefault();
        void overlayCancel();
      } else if ((e.ctrlKey && key === "c") || key === "enter") {
        e.preventDefault();
        finish("copy");
      } else if (e.ctrlKey && key === "s") {
        e.preventDefault();
        finish("save");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const pointFrom = (e: ReactPointerEvent) => clampPoint({ x: e.clientX, y: e.clientY }, viewSize());

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) {
      void overlayCancel();
      return;
    }
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointFrom(e);
    if (selection && containsPoint(selection, p)) {
      setDrag({ kind: "move", offset: { x: p.x - selection.x, y: p.y - selection.y } });
      return;
    }
    setDrag({ kind: "select", anchor: p });
    setSelection({ x: p.x, y: p.y, width: 0, height: 0 });
    void overlaySelectionStarted();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointFrom(e);
    if (drag.kind === "select") {
      setSelection(rectFromPoints(drag.anchor, p));
    } else if (drag.kind === "move" && selection) {
      setSelection(moveRect(selection, { x: p.x - drag.offset.x, y: p.y - drag.offset.y }, viewSize()));
    }
  };

  const onPointerUp = () => {
    if (drag.kind === "select" && selection) {
      if (selection.width < MIN_SELECTION || selection.height < MIN_SELECTION) {
        setSelection(null);
      }
    }
    setDrag({ kind: "none" });
  };

  if (!info) return <div className="overlay overlay--empty" />;

  const scale = info.width / window.innerWidth;
  const imageRect = selection && toImageRect(selection, scale, info);
  const settled = selection !== null && drag.kind === "none";
  const toolbar = settled && toolbarPosition(selection, TOOLBAR_SIZE, viewSize());
  const label = selection && sizeLabelPosition(selection, SIZE_LABEL_HEIGHT);

  return (
    <div
      className={`overlay${drag.kind === "move" ? " overlay--moving" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img
        className="overlay__frame"
        src={frameUrl(info)}
        alt=""
        draggable={false}
        onLoad={() => void overlayReady()}
      />

      {selection ? (
        <div
          className="overlay__selection"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        />
      ) : (
        <>
          <div className="overlay__dim" />
          <div className="overlay__hint">{t("overlay.hint")}</div>
        </>
      )}

      {label && imageRect && (
        <div className="overlay__size" style={{ left: label.x, top: label.y }}>
          {imageRect.width} × {imageRect.height}
        </div>
      )}

      {toolbar && (
        <div
          className="overlay__toolbar"
          style={{ left: toolbar.x, top: toolbar.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="primary"
            title={t(info.queueMode ? "overlay.add_to_queue_title" : "overlay.copy_title")}
            onClick={() => finish("copy")}
          >
            {t(info.queueMode ? "overlay.add_to_queue" : "overlay.copy")}
          </button>
          <button type="button" title={t("overlay.save_title")} onClick={() => finish("save")}>
            {t("overlay.save")}
          </button>
          <button type="button" title={t("overlay.cancel_title")} onClick={() => void overlayCancel()}>
            {t("overlay.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
