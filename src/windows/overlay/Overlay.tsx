import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { t } from "../../lib/i18n";
import {
  captureDeliver,
  captureDeliverAnnotated,
  frameUrl,
  onWindowEvent,
  overlayCancel,
  overlayReady,
  overlaySelectionStarted,
  overlaySession,
  OverlayEvents,
  queueClear,
  textModeSet,
  type Delivery,
  type OverlayInfo,
} from "../../lib/ipc";
import {
  COLORS,
  drawShapes,
  extendShape,
  isMeaningful,
  startShape,
  textSize,
  WIDTHS,
  type Shape,
  type Tool,
} from "./draw";
import {
  clampPoint,
  containsPoint,
  moveRect,
  rectFromPoints,
  sidebarPosition,
  sizeLabelPosition,
  toImageRect,
  toolbarPosition,
  type Point,
  type Rect,
  type Size,
} from "./geometry";
import { CameraIcon, TextModeIcon } from "./icons";
import { Sidebar } from "./Sidebar";

/** Selections smaller than this (CSS px) count as a stray click. */
const MIN_SELECTION = 3;
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_BUTTON_WIDTH = 112;
const TOOLBAR_GAP = 4;
/** Padding plus border on both sides. */
const TOOLBAR_CHROME = 10;
const SIZE_LABEL_HEIGHT = 22;
/** First-render guess; replaced by the measured size. */
const SIDEBAR_FALLBACK: Size = { width: 46, height: 560 };

type Drag =
  | { kind: "none" }
  | { kind: "select"; anchor: Point }
  | { kind: "move"; offset: Point }
  | { kind: "draw" };

interface TextDraft {
  at: Point;
  value: string;
}

const viewSize = () => ({ width: window.innerWidth, height: window.innerHeight });

export function Overlay() {
  const [info, setInfo] = useState<OverlayInfo | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<Drag>({ kind: "none" });
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [width, setWidth] = useState<number>(WIDTHS[1]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [textDraft, setTextDraftState] = useState<TextDraft | null>(null);
  // Read by commitText: blur and the next click can both fire for the same draft.
  const textDraftRef = useRef<TextDraft | null>(null);
  const [sidebarSize, setSidebarSize] = useState<Size>(SIDEBAR_FALLBACK);
  const busy = useRef(false);
  const frameRef = useRef<HTMLImageElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const setTextDraft = useCallback((next: TextDraft | null) => {
    textDraftRef.current = next;
    setTextDraftState(next);
  }, []);

  const resetSelection = useCallback(() => {
    setSelection(null);
    setDrag({ kind: "none" });
    setShapes([]);
    setDraft(null);
    setTextDraft(null);
    setTool("select");
  }, [setTextDraft]);

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

  // Preview: redraw every shape (and the one being drawn) over the frozen frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame || !info) return;
    const dpr = window.devicePixelRatio;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawShapes(ctx, draft ? [...shapes, draft] : shapes, {
      k: dpr,
      origin: { x: 0, y: 0 },
      frame,
      frameScale: info.width / window.innerWidth,
    });
  }, [shapes, draft, info]);

  /** Selection with its drawings, at the frame's full resolution, as PNG bytes. */
  const compose = useCallback(async (): Promise<Uint8Array | null> => {
    const frame = frameRef.current;
    if (!info || !selection || !frame) return null;
    const scale = info.width / window.innerWidth;
    const r = toImageRect(selection, scale, info);
    const canvas = document.createElement("canvas");
    canvas.width = r.width;
    canvas.height = r.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(frame, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    drawShapes(ctx, shapes, {
      k: scale,
      origin: { x: r.x / scale, y: r.y / scale },
      frame,
      frameScale: scale,
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob && new Uint8Array(await blob.arrayBuffer());
  }, [info, selection, shapes]);

  const finish = useCallback(
    async (action: Delivery) => {
      if (!info || !selection || busy.current) return;
      busy.current = true;
      if (shapes.length > 0) {
        const png = await compose();
        if (png) await captureDeliverAnnotated(png, action);
      } else {
        // No drawings: Rust crops the frozen frame pixel for pixel.
        const rect = toImageRect(selection, info.width / window.innerWidth, info);
        await captureDeliver(rect, action);
      }
    },
    [info, selection, shapes, compose],
  );

  // Once a queue exists, adding to it becomes the main action (Enter).
  const hasQueue = (info?.queueCount ?? 0) > 0;
  const primary: Delivery = hasQueue ? "enqueue" : "copy";

  const clearQueue = useCallback(async () => {
    await queueClear();
    // Clearing also leaves text mode.
    setInfo((current) => current && { ...current, queueCount: 0, textMode: false });
  }, []);

  const setTextMode = useCallback(async (enabled: boolean) => {
    await textModeSet(enabled);
    setInfo((current) => current && { ...current, textMode: enabled });
  }, []);

  const undo = useCallback(() => setShapes((current) => current.slice(0, -1)), []);

  const commitText = useCallback(() => {
    const current = textDraftRef.current;
    setTextDraft(null);
    if (!current) return;
    const shape: Shape = { kind: "text", at: current.at, text: current.value, style: { color, width } };
    if (isMeaningful(shape)) setShapes((list) => [...list, shape]);
  }, [color, width, setTextDraft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textDraft) return; // the text box handles its own keys
      const key = e.key.toLowerCase();
      if (key === "escape") {
        e.preventDefault();
        void overlayCancel();
      } else if (e.ctrlKey && key === "z") {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && key === "c") {
        e.preventDefault();
        void finish("copy");
      } else if (key === "enter") {
        e.preventDefault();
        void finish(primary);
      } else if (e.ctrlKey && key === "s") {
        e.preventDefault();
        void finish("save");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, primary, undo, textDraft]);

  // Focus a new text box once it's in the DOM (autoFocus alone loses to the click).
  const textOpen = textDraft !== null;
  useEffect(() => {
    if (textOpen) setTimeout(() => textRef.current?.focus(), 0);
  }, [textOpen]);

  useLayoutEffect(() => {
    const el = sidebarRef.current;
    if (el && (el.offsetHeight !== sidebarSize.height || el.offsetWidth !== sidebarSize.width)) {
      setSidebarSize({ width: el.offsetWidth, height: el.offsetHeight });
    }
  });

  const pointFrom = (e: ReactPointerEvent) => clampPoint({ x: e.clientX, y: e.clientY }, viewSize());
  const drawing = tool !== "select" && selection !== null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) {
      void overlayCancel();
      return;
    }
    if (e.button !== 0) return;
    if (textDraft) commitText();
    const p = pointFrom(e);

    if (drawing) {
      if (tool === "text") {
        // Keep the click from moving focus away from the text box we're about to open.
        e.preventDefault();
        setTextDraft({ at: p, value: "" });
        return;
      }
      const shape = startShape(tool, p, { color, width });
      if (!shape) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ kind: "draw" });
      setDraft(shape);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
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
    } else if (drag.kind === "draw" && draft) {
      setDraft(extendShape(draft, p));
    }
  };

  const onPointerUp = () => {
    if (drag.kind === "select" && selection) {
      if (selection.width < MIN_SELECTION || selection.height < MIN_SELECTION) {
        setSelection(null);
      }
    } else if (drag.kind === "draw" && draft) {
      if (isMeaningful(draft)) setShapes((list) => [...list, draft]);
      setDraft(null);
    }
    setDrag({ kind: "none" });
  };

  const onTextKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      setTextDraft(null);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitText();
    }
  };

  if (!info) return <div className="overlay overlay--empty" />;

  const scale = info.width / window.innerWidth;
  const imageRect = selection && toImageRect(selection, scale, info);
  const settled = selection !== null && (drag.kind === "none" || drag.kind === "draw");
  const buttonCount = hasQueue ? 5 : 4;
  const toolbarSize = {
    width: buttonCount * TOOLBAR_BUTTON_WIDTH + (buttonCount - 1) * TOOLBAR_GAP + TOOLBAR_CHROME,
    height: TOOLBAR_HEIGHT,
  };
  const toolbar = settled && toolbarPosition(selection, toolbarSize, viewSize());
  const sidebar = settled && sidebarPosition(selection, sidebarSize, viewSize());
  const primaryClass = (action: Delivery) => (action === primary ? "primary" : undefined);
  const label = selection && sizeLabelPosition(selection, SIZE_LABEL_HEIGHT);
  const cursorClass = drag.kind === "move" ? " overlay--moving" : drawing ? " overlay--drawing" : "";

  return (
    <div
      className={`overlay${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* crossOrigin before src: the frame is drawn into a canvas when exporting drawings. */}
      <img
        ref={frameRef}
        className="overlay__frame"
        crossOrigin="anonymous"
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

      <canvas ref={canvasRef} className="overlay__canvas" />

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
          <TextModeIcon />
          {t("overlay.mode_text")}
        </button>
      </div>

      {textDraft && (
        <textarea
          ref={textRef}
          className="overlay__text-input"
          autoFocus
          rows={1}
          value={textDraft.value}
          placeholder={t("overlay.text_placeholder")}
          style={{
            left: textDraft.at.x,
            top: textDraft.at.y,
            color,
            fontSize: textSize(width),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          onKeyDown={onTextKey}
          onBlur={commitText}
        />
      )}

      {label && imageRect && (
        <div className="overlay__size" style={{ left: label.x, top: label.y }}>
          {imageRect.width} × {imageRect.height}
        </div>
      )}

      {sidebar && (
        <Sidebar
          ref={sidebarRef}
          style={{ left: sidebar.x, top: sidebar.y }}
          tool={tool}
          color={color}
          width={width}
          canUndo={shapes.length > 0}
          onTool={setTool}
          onColor={setColor}
          onWidth={setWidth}
          onUndo={undo}
        />
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
            onClick={() => void finish("copy")}
          >
            {t("overlay.copy")}
          </button>
          <button type="button" title={t("overlay.save_title")} onClick={() => void finish("save")}>
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
            onClick={() => void finish("enqueue")}
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
