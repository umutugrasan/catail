import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { t } from "../../lib/i18n";
import { queueEditImage, queueImageUrl, type QueueItemView } from "../../lib/ipc";
import {
  DEFAULT_COLOR,
  drawShapes,
  extendShape,
  hitTest,
  isMeaningful,
  startShape,
  textSize,
  WIDTHS,
  type Shape,
  type Tool,
} from "../overlay/draw";
import {
  clampPoint,
  containsPoint,
  handleAt,
  handleCursor,
  moveRect,
  rectFromPoints,
  resizeRect,
  type Handle,
  type Point,
  type Rect,
  type Size,
} from "../overlay/geometry";
import { CloseIcon, SaveIcon } from "../overlay/icons";
import { Sidebar } from "../overlay/Sidebar";
import { CloseGuard } from "./CloseGuard";
import { canvasOf, canvasToPng, cropCanvas, fitSize, flatten, roomIn } from "./editor";

/** Crops smaller than this (CSS px) count as a stray click. */
const MIN_CROP = 4;
const ERASER_TOLERANCE = 6;
const SIDEBAR_LEFT = 16;
const SIDEBAR_HALF_HEIGHT = 200;
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** The state an undo goes back to. A crop replaces the picture, so it's part of each step. */
type Snapshot = { base: HTMLCanvasElement; shapes: Shape[] };
type Drag =
  | { kind: "none" }
  | { kind: "draw" }
  | { kind: "erase"; erased: boolean }
  | { kind: "crop-new"; anchor: Point }
  | { kind: "crop-move"; offset: Point }
  | { kind: "crop-resize"; handle: Handle; start: Rect };

const viewSize = (): Size => ({ width: window.innerWidth, height: window.innerHeight });

export function ImageEditor(props: { item: QueueItemView; closing: boolean; onClose: () => void }) {
  const { item, closing, onClose } = props;
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [shapes, setShapesState] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(WIDTHS[1]);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);
  const [text, setText] = useState<{ at: Point; value: string } | null>(null);
  const [drag, setDrag] = useState<Drag>({ kind: "none" });
  const [view, setView] = useState<Size>(viewSize);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<"load" | "save" | null>(null);

  const history = useRef<Snapshot[]>([]);
  const shapesRef = useRef<Shape[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const display = base && fitSize(base, roomIn(view));
  const dirty = history.current.length > 0;

  const setShapes = useCallback((next: Shape[]) => {
    shapesRef.current = next;
    setShapesState(next);
  }, []);

  useEffect(() => {
    const image = new Image();
    // Before src: the canvas has to stay readable for saving.
    image.crossOrigin = "anonymous";
    image.onload = () => setBase(canvasOf(image, image.naturalWidth, image.naturalHeight));
    image.onerror = () => setFailure("load");
    image.src = queueImageUrl(item.id, item.revision);
  }, [item.id, item.revision]);

  useEffect(() => {
    const onResize = () => setView(viewSize());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The picture and its shapes, sharp on this screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !base || !display) return;
    const dpr = window.devicePixelRatio;
    canvas.width = Math.round(display.width * dpr);
    canvas.height = Math.round(display.height * dpr);
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    drawShapes(ctx, draft ? [...shapes, draft] : shapes, {
      k: dpr,
      origin: { x: 0, y: 0 },
      frame: base,
      frameScale: base.width / display.width,
    });
  }, [base, display?.width, display?.height, shapes, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const remember = useCallback(() => {
    if (base) history.current.push({ base, shapes: shapesRef.current });
  }, [base]);

  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    setBase(previous.base);
    setShapes(previous.shapes);
    setCrop(null);
  }, [setShapes]);

  const commitText = useCallback(() => {
    if (!text) return;
    setText(null);
    const shape: Shape = { kind: "text", at: text.at, text: text.value, style: { color, width } };
    if (isMeaningful(shape)) {
      remember();
      setShapes([...shapesRef.current, shape]);
    }
  }, [text, color, width, remember, setShapes]);

  const applyCrop = useCallback(() => {
    if (!base || !display || !crop) return;
    const cut = cropCanvas(flatten(base, shapesRef.current, display), crop, display);
    if (!cut) return;
    remember();
    setBase(cut);
    setShapes([]);
    setCrop(null);
    setTool("select");
  }, [base, display, crop, remember, setShapes]);

  const save = useCallback(async () => {
    if (!base || !display) return;
    setBusy(true);
    setFailure(null);
    try {
      await queueEditImage(item.id, await canvasToPng(flatten(base, shapesRef.current, display)));
      onClose();
    } catch {
      setFailure("save");
      setAsking(false);
    } finally {
      setBusy(false);
    }
  }, [base, display, item.id, onClose]);

  /** A crop still being chosen goes first; unsaved changes ask before anything is lost. */
  const requestClose = useCallback(() => {
    if (crop) {
      setCrop(null);
    } else if (history.current.length > 0) {
      setAsking(true);
    } else {
      onClose();
    }
  }, [crop, onClose]);

  const pickTool = (next: Tool) => {
    if (text) commitText();
    setCrop(null);
    // Picking the active tool again puts it down, back to just looking.
    setTool(next === tool ? "select" : next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (text) return; // the text box handles its own keys
      const key = e.key.toLowerCase();
      if (key === "escape") {
        e.preventDefault();
        if (asking) setAsking(false);
        else requestClose();
      } else if (asking) {
        return;
      } else if (key === "enter" && crop) {
        e.preventDefault();
        applyCrop();
      } else if (e.ctrlKey && key === "z") {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && key === "s") {
        e.preventDefault();
        if (history.current.length > 0 && !crop) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [text, asking, crop, requestClose, applyCrop, undo, save]);

  // Focus a new text box once it's in the DOM (autoFocus alone loses to the click).
  const textOpen = text !== null;
  useEffect(() => {
    if (textOpen) setTimeout(() => textRef.current?.focus(), 0);
  }, [textOpen]);

  const pointFrom = (e: ReactPointerEvent): Point => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !display) return { x: 0, y: 0 };
    return clampPoint({ x: e.clientX - r.left, y: e.clientY - r.top }, display);
  };

  /** Removes the shapes under the eraser; one undo step per drag. */
  const eraseAt = (p: Point, erased: boolean): boolean => {
    const current = shapesRef.current;
    const kept = current.filter((shape) => !hitTest(shape, p, ERASER_TOLERANCE));
    if (kept.length === current.length) return erased;
    if (!erased) remember();
    setShapes(kept);
    return true;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || tool === "select") return;
    const p = pointFrom(e);
    if (tool === "text") {
      // Keep the click from moving focus away from the text box we're about to open.
      e.preventDefault();
      if (text) commitText();
      setText({ at: p, value: "" });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "crop") {
      const handle = crop && handleAt(crop, p);
      if (crop && handle) setDrag({ kind: "crop-resize", handle, start: crop });
      else if (crop && containsPoint(crop, p)) setDrag({ kind: "crop-move", offset: { x: p.x - crop.x, y: p.y - crop.y } });
      else {
        setCrop({ x: p.x, y: p.y, width: 0, height: 0 });
        setDrag({ kind: "crop-new", anchor: p });
      }
    } else if (tool === "eraser") {
      setDrag({ kind: "erase", erased: eraseAt(p, false) });
    } else {
      const shape = startShape(tool, p, { color, width });
      if (!shape) return;
      setDraft(shape);
      setDrag({ kind: "draw" });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!display) return;
    const p = pointFrom(e);
    switch (drag.kind) {
      case "none": {
        const next = tool === "crop" && crop ? handleAt(crop, p) : null;
        if (next !== hover) setHover(next);
        break;
      }
      case "draw":
        if (draft) setDraft(extendShape(draft, p));
        break;
      case "erase":
        setDrag({ kind: "erase", erased: eraseAt(p, drag.erased) });
        break;
      case "crop-new":
        setCrop(rectFromPoints(drag.anchor, p));
        break;
      case "crop-move":
        if (crop) setCrop(moveRect(crop, { x: p.x - drag.offset.x, y: p.y - drag.offset.y }, display));
        break;
      case "crop-resize":
        setCrop(resizeRect(drag.start, drag.handle, p));
        break;
    }
  };

  const onPointerUp = () => {
    if (drag.kind === "draw" && draft) {
      if (isMeaningful(draft)) {
        remember();
        setShapes([...shapesRef.current, draft]);
      }
      setDraft(null);
    } else if (crop && (crop.width < MIN_CROP || crop.height < MIN_CROP)) {
      setCrop(drag.kind === "crop-resize" ? drag.start : null);
    }
    setDrag({ kind: "none" });
  };

  const onTextKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      setText(null);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitText();
    }
  };

  const resizing = drag.kind === "crop-resize" ? drag.handle : drag.kind === "none" ? hover : null;
  const stageClass = [
    "preview__stage",
    tool !== "select" && "preview__stage--drawing",
    tool === "text" && "preview__stage--text",
    resizing && `overlay--resize-${handleCursor(resizing)}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`preview${closing ? " preview--closing" : ""}`}
      onClick={(e) => e.target === e.currentTarget && requestClose()}
    >
      {failure === "load" && <p className="preview__error preview__error--large">{t("preview.load_failed")}</p>}

      {display && (
        <div
          ref={stageRef}
          className={stageClass}
          style={{ width: display.width, height: display.height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <canvas ref={canvasRef} className="preview__image" />

          {crop && (
            <>
              <div className="preview__crop-clip">
                <div
                  className="preview__crop-shade"
                  style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
                />
              </div>
              <div
                className="preview__crop"
                style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
              >
                {drag.kind === "none" &&
                  HANDLES.map((h) => <span key={h} className={`overlay__handle overlay__handle--${h}`} />)}
              </div>
            </>
          )}

          {text && (
            <textarea
              ref={textRef}
              className="overlay__text-input"
              autoFocus
              rows={1}
              value={text.value}
              placeholder={t("overlay.text_placeholder")}
              style={{ left: text.at.x, top: text.at.y, color, fontSize: textSize(width) }}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setText({ ...text, value: e.target.value })}
              onKeyDown={onTextKey}
              onBlur={commitText}
            />
          )}
        </div>
      )}

      {display && (
        <Sidebar
          editor
          style={{ left: SIDEBAR_LEFT, top: Math.max(view.height / 2 - SIDEBAR_HALF_HEIGHT, SIDEBAR_LEFT) }}
          tool={tool}
          color={color}
          width={width}
          canUndo={dirty}
          flyoutSide="right"
          onTool={pickTool}
          onColor={setColor}
          onWidth={setWidth}
          onUndo={undo}
        />
      )}

      <div className="preview__actions">
        {failure === "save" && <span className="preview__error">{t("preview.save_failed")}</span>}
        {crop && drag.kind === "none" ? (
          <>
            <button type="button" className="preview__button" onClick={() => setCrop(null)}>
              {t("overlay.cancel")}
            </button>
            <button type="button" className="preview__button preview__button--primary" onClick={applyCrop}>
              {t("overlay.tool_crop")}
            </button>
          </>
        ) : (
          dirty && (
            <button
              type="button"
              className="preview__button preview__button--primary"
              disabled={busy}
              onClick={() => void save()}
            >
              <SaveIcon />
              {t("preview.save")}
            </button>
          )
        )}
      </div>

      <button type="button" className="preview__close" title={t("preview.close")} onClick={requestClose}>
        <CloseIcon />
      </button>

      {asking && (
        <CloseGuard
          busy={busy}
          onSave={() => void save()}
          onDiscard={onClose}
          onKeepEditing={() => setAsking(false)}
        />
      )}
    </div>
  );
}
