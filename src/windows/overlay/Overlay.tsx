import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { t } from "../../lib/i18n";
import {
  captureCopy,
  captureEnqueue,
  captureSave,
  frameUrl,
  onWindowEvent,
  overlayCancel,
  overlayReady,
  overlaySelectionStarted,
  overlaySession,
  OverlayEvents,
  queueClear,
  textModeSet,
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
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_BUTTON_WIDTH = 112;
const TOOLBAR_GAP = 4;
/** Padding plus border on both sides. */
const TOOLBAR_CHROME = 10;
const SIZE_LABEL_HEIGHT = 22;

type Action = "copy" | "save" | "enqueue";

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
    (action: Action) => {
      if (!info || !selection || busy.current) return;
      busy.current = true;
      const scale = info.width / window.innerWidth;
      const rect = toImageRect(selection, scale, info);
      const commands = { copy: captureCopy, save: captureSave, enqueue: captureEnqueue };
      void commands[action](rect);
    },
    [info, selection],
  );

  // Once a queue exists, adding to it becomes the main action (Enter).
  const hasQueue = (info?.queueCount ?? 0) > 0;
  const primary: Action = hasQueue ? "enqueue" : "copy";

  const clearQueue = useCallback(async () => {
    await queueClear();
    // Clearing also leaves text mode.
    setInfo((current) => current && { ...current, queueCount: 0, textMode: false });
  }, []);

  const setTextMode = useCallback(async (enabled: boolean) => {
    await textModeSet(enabled);
    setInfo((current) => current && { ...current, textMode: enabled });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "escape") {
        e.preventDefault();
        void overlayCancel();
      } else if (e.ctrlKey && key === "c") {
        e.preventDefault();
        finish("copy");
      } else if (key === "enter") {
        e.preventDefault();
        finish(primary);
      } else if (e.ctrlKey && key === "s") {
        e.preventDefault();
        finish("save");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, primary]);

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
  const buttonCount = hasQueue ? 5 : 4;
  const toolbarSize = {
    width: buttonCount * TOOLBAR_BUTTON_WIDTH + (buttonCount - 1) * TOOLBAR_GAP + TOOLBAR_CHROME,
    height: TOOLBAR_HEIGHT,
  };
  const toolbar = settled && toolbarPosition(selection, toolbarSize, viewSize());
  const primaryClass = (action: Action) => (action === primary ? "primary" : undefined);
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

      <div className="overlay__modes" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={info.textMode ? undefined : "active"}
          title={t("overlay.mode_screenshot_title")}
          onClick={() => info.textMode && void setTextMode(false)}
        >
          <CameraIcon />
          {t("overlay.mode_screenshot")}
        </button>
        <button
          type="button"
          className={info.textMode ? "active" : undefined}
          title={t(info.textMode ? "overlay.mode_text_on_title" : "overlay.mode_text_title")}
          onClick={() => void setTextMode(!info.textMode)}
        >
          <TextIcon />
          {t("overlay.mode_text")}
        </button>
      </div>

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
          style={{ left: toolbar.x, top: toolbar.y, width: toolbarSize.width }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={primaryClass("copy")}
            title={t(hasQueue ? "overlay.copy_title_queue" : "overlay.copy_title")}
            onClick={() => finish("copy")}
          >
            {t("overlay.copy")}
          </button>
          <button type="button" title={t("overlay.save_title")} onClick={() => finish("save")}>
            {t("overlay.save")}
          </button>
          <button
            type="button"
            className={primaryClass("enqueue")}
            title={
              hasQueue
                ? t("overlay.add_to_queue_title", { count: info.queueCount })
                : t("overlay.create_queue_title")
            }
            onClick={() => finish("enqueue")}
          >
            {t(hasQueue ? "overlay.add_to_queue" : "overlay.create_queue")}
          </button>
          {hasQueue && (
            <button
              type="button"
              className="danger"
              title={t("overlay.clear_queue_title", { count: info.queueCount })}
              onClick={() => void clearQueue()}
            >
              {t("overlay.clear_queue")}
            </button>
          )}
          <button type="button" title={t("overlay.cancel_title")} onClick={() => void overlayCancel()}>
            {t("overlay.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M5 6h14M12 6v13M9 19h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
