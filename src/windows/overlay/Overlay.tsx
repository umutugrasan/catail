import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { catsAround, useWornTheme } from "../../lib/cat";
import { fatness } from "../../lib/catSeat";
import {
  CatEar,
  CatNose,
  LeapingCat,
  SeatCat,
  TRASH_JUMP_MS,
  TrashJump,
  CapybaraBar,
  CapybaraSeat,
  FrogBar,
  FrogSeat,
  MonkeyBar,
  MonkeySeat,
  TurtleBar,
  TurtleSeat,
  Whiskers,
} from "../../lib/cats";
import { t } from "../../lib/i18n";
import {
  captureDeliver,
  captureOcr,
  captureQr,
  openLink,
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
  type QrCode,
} from "../../lib/ipc";
import {
  DEFAULT_COLOR,
  drawShapes,
  extendShape,
  hitTest,
  isMeaningful,
  startShape,
  textAt,
  textSize,
  fontSizeOf,
  type TextShape,
  WIDTHS,
  type Shape,
  type Tool,
} from "./draw";
import { ContextMenu } from "./ContextMenu";
import { TextSelection } from "./TextSelection";
import {
  clampPoint,
  containsPoint,
  handleAt,
  handleCursor,
  moveRect,
  rectFromPoints,
  resizeRect,
  sidebarPosition,
  sizeLabelPosition,
  toImageRect,
  toolbarPosition,
  type Handle,
  type Point,
  type Rect,
  type Size,
} from "./geometry";
import { CameraIcon, CopyIcon, QueueAddIcon, SaveIcon, ScanTextIcon, TextModeIcon, TrashIcon } from "./icons";
import { OcrCard, type OcrState } from "./OcrCard";
import { QrLinks } from "./QrLinks";
import { Sidebar } from "./Sidebar";
import { CAUGHT_AT, catTailRoot, isOnView, makeTailScene, playTail, TAIL_MS } from "./tail";

/** Selections smaller than this (CSS px) count as a stray click. */
const MIN_SELECTION = 3;
const TOOLBAR_HEIGHT = 40;
const SIZE_LABEL_HEIGHT = 22;
/** Eraser reach around the pointer, CSS px. */
const ERASER_TOLERANCE = 6;
/** First-render guess; replaced by the measured size. */
const SIDEBAR_FALLBACK: Size = { width: 46, height: 560 };
/** First-render guess; the queue button's label makes the real width depend on the language. */
const TOOLBAR_FALLBACK_WIDTH = 300;

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
/** The cat watching a selection being drawn, and pouncing on it. */
const POUNCE_SIZE = 60;
/** The badge's cat, from where it sits to the selection's corner and back. */
const LEAP_MS = 1300;
const POUNCE_MS = 1400;
/** Smaller selections are left alone: they may be a slip. */
const POUNCE_MIN = 24;

type Drag =
  | { kind: "none" }
  | { kind: "select"; anchor: Point }
  | { kind: "move"; offset: Point }
  | { kind: "resize"; handle: Handle; start: Rect }
  | { kind: "draw" }
  | { kind: "erase" };

interface TextDraft {
  at: Point;
  value: string;
  /** Changing a text already placed: which shape, and its look. */
  index?: number;
  look?: Pick<TextShape, "style" | "size" | "spacing">;
}

const viewSize = () => ({ width: window.innerWidth, height: window.innerHeight });

export function Overlay() {
  const [info, setInfo] = useState<OverlayInfo | null>(null);
  /** QR codes on the frame, found in the background once it shows. */
  const [qrCodes, setQrCodes] = useState<QrCode[]>([]);
  const sessionRef = useRef<number | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<Drag>({ kind: "none" });
  /** Selection edge under the pointer, for the resize cursor. */
  const [hover, setHover] = useState<Handle | null>(null);
  /** Over a QR code with a link (no selection being made): a click opens it. */
  const [overQr, setOverQr] = useState(false);
  /** Where the right-click menu is open, if it is. */
  const [menu, setMenu] = useState<Point | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(WIDTHS[1]);
  const [shapes, setShapesState] = useState<Shape[]>([]);
  // Every earlier version of `shapes`, so undo also brings back erased shapes.
  const history = useRef<Shape[][]>([]);
  const shapesRef = useRef<Shape[]>([]);
  const setShapes = useCallback((update: (current: Shape[]) => Shape[]) => {
    const next = update(shapesRef.current);
    if (next === shapesRef.current) return;
    history.current.push(shapesRef.current);
    shapesRef.current = next;
    setShapesState(next);
  }, []);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [textDraft, setTextDraftState] = useState<TextDraft | null>(null);
  /** A placed text picked again: TextSelection shows its frame and bar. */
  const [pickedText, setPickedText] = useState<number | null>(null);
  // Read by commitText: blur and the next click can both fire for the same draft.
  const textDraftRef = useRef<TextDraft | null>(null);
  const [sidebarSize, setSidebarSize] = useState<Size>(SIDEBAR_FALLBACK);
  const [toolbarWidth, setToolbarWidth] = useState(TOOLBAR_FALLBACK_WIDTH);
  const [ocr, setOcr] = useState<OcrState | null>(null);
  /** Snapshot flying into the badge after "Kuyruğa ekle"; hides the rest of the UI. */
  // The cat that watched the selection being drawn, now pouncing on its corner.
  const turtle = useWornTheme() === "turtle";
  const [pounce, setPounce] = useState<{ x: number; tx: number; ty: number; key: number } | null>(null);
  const pounceRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const cat = pounceRef.current;
    if (!pounce || !cat) return;
    const { tx, ty } = pounce;
    const tilt = tx < 0 ? 1 : -1;
    const keyframes: Keyframe[] = turtle
      ? [{ transform: "translateY(66%)" }, { transform: "translateY(100%)" }]
      : [
          { transform: "translate(0, 58%)", easing: "ease-out" },
          { transform: "none", offset: 0.14 },
          { transform: "scale(1.1, 0.86) rotate(-5deg)", offset: 0.2 },
          { transform: "scale(1.1, 0.86) rotate(5deg)", offset: 0.26 },
          { transform: "scale(1.1, 0.86) rotate(-5deg)", offset: 0.32 },
          { transform: "scale(1.12, 0.84) rotate(4deg)", offset: 0.38 },
          { transform: "scale(0.9, 1.14)", offset: 0.44, easing: "ease-out" },
          {
            transform: `translate(${tx * 0.6}px, ${ty - 90}px) rotate(${tilt * 14}deg)`,
            offset: 0.68,
            easing: "ease-in",
          },
          { transform: `translate(${tx}px, ${ty}px) scale(1.16, 0.84)`, offset: 0.84 },
          { transform: `translate(${tx}px, ${ty}px)`, offset: 0.9, opacity: 1 },
          { transform: `translate(${tx}px, ${ty}px) scale(0.9)`, opacity: 0 },
        ];
    const run = cat.animate(keyframes, { duration: turtle ? 320 : POUNCE_MS, fill: "forwards" });
    run.onfinish = () => setPounce(null);
    return () => run.cancel();
  }, [pounce]);

  // The badge's own cat leaping from where it sits onto the selection's corner, and back.
  const [leap, setLeap] = useState<{ tx: number; ty: number; key: number } | null>(null);
  const homeRef = useRef<HTMLSpanElement>(null);
  const faceRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const cat = homeRef.current;
    if (!leap || !cat) return;
    const { tx, ty } = leap;
    const dir = tx > 0 ? 1 : -1;
    const up = Math.min(0, ty) - 70;
    const run = cat.animate(
      [
        { transform: "none" },
        { transform: "scale(1.12, 0.86)", offset: 0.12, easing: "ease-out" },
        { transform: `translate(${tx * 0.5}px, ${up}px) rotate(${-dir * 12}deg)`, offset: 0.36, easing: "ease-in" },
        { transform: `translate(${tx}px, ${ty}px) scale(1.16, 0.84)`, offset: 0.52 },
        { transform: `translate(${tx}px, ${ty}px)`, offset: 0.6, easing: "ease-out" },
        { transform: `translate(${tx * 0.5}px, ${up + 20}px) rotate(${dir * 10}deg)`, offset: 0.8, easing: "ease-in" },
        { transform: "scale(1.12, 0.88)", offset: 0.94 },
        { transform: "none" },
      ],
      { duration: LEAP_MS },
    );
    // The picture faces left: turned round for the way there if that's to the right, and the
    // other way for the way back.
    const out = dir > 0 ? -1 : 1;
    faceRef.current?.animate(
      [
        { transform: `scaleX(${out})` },
        { transform: `scaleX(${out})`, offset: 0.58 },
        { transform: `scaleX(${-out})`, offset: 0.6 },
        { transform: `scaleX(${-out})` },
      ],
      { duration: LEAP_MS },
    );
    run.onfinish = () => setLeap(null);
    return () => run.cancel();
  }, [leap]);

  // Boops of the top bar's nose: each one restarts its little animation.
  const [boops, setBoops] = useState(0);
  const [booping, setBooping] = useState(false);
  const boopTimer = useRef<number | undefined>(undefined);
  const boop = () => {
    setBoops((n) => n + 1);
    setBooping(true);
    window.clearTimeout(boopTimer.current);
    boopTimer.current = window.setTimeout(() => setBooping(false), 600);
  };
  const [flying, setFlying] = useState<{
    rect: Rect;
    drawings: string | null;
    /** The badge's cat, on this screen; its tail does the work. */
    cat: Point | null;
    fat: number;
  } | null>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const frameRef = useRef<HTMLImageElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<SVGSVGElement>(null);

  const setTextDraft = useCallback((next: TextDraft | null) => {
    textDraftRef.current = next;
    setTextDraftState(next);
  }, []);

  const resetSelection = useCallback(() => {
    setSelection(null);
    setDrag({ kind: "none" });
    setHover(null);
    setMenu(null);
    history.current = [];
    shapesRef.current = [];
    setShapesState([]);
    setDraft(null);
    setTextDraft(null);
    setPickedText(null);
    setTool("select");
    setOcr(null);
    setFlying(null);
  }, [setTextDraft]);

  // Pull the current session: on startup (window may be created mid-capture) and on refresh.
  const loadSession = useCallback(async () => {
    resetSelection();
    busy.current = false;
    setQrCodes([]);
    const next = await overlaySession();
    sessionRef.current = next?.session ?? null;
    setInfo(next);
  }, [resetSelection]);

  useEffect(() => {
    void loadSession();
    const subscriptions = [
      onWindowEvent(OverlayEvents.refresh, () => void loadSession()),
      onWindowEvent(OverlayEvents.clearSelection, resetSelection),
      onWindowEvent(OverlayEvents.reset, () => {
        resetSelection();
        sessionRef.current = null;
        setQrCodes([]);
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
    // A text being changed shows only in its text box.
    const shown = textDraft?.index !== undefined ? shapes.filter((_, i) => i !== textDraft.index) : shapes;
    drawShapes(ctx, draft ? [...shown, draft] : shown, {
      k: dpr,
      origin: { x: 0, y: 0 },
      frame,
      frameScale: info.width / window.innerWidth,
    });
  }, [shapes, draft, info, textDraft]);

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

  /** The cat's tail wraps the selection and drags it into the badge. */
  const flyToBadge = useCallback(async () => {
    if (!info || !selection || info.flyX == null || info.flyY == null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The plain theme has no cat, so no tail: the capture just goes to the queue.
    if (document.documentElement.dataset.cat === "plain") return;
    const scale = info.width / window.innerWidth;
    const target = { x: info.flyX / scale, y: info.flyY / scale };
    const cat = isOnView(target, viewSize()) ? target : null;
    // Back in its seat at once if it was still mid-leap: the tail starts from there.
    setLeap(null);
    setFlying({
      rect: selection,
      drawings: shapes.length > 0 ? (canvasRef.current?.toDataURL() ?? null) : null,
      cat,
      fat: fatness(info.queueCount),
    });
    // It swallows the capture and shows for it.
    setTimeout(() => {
      setFlying((current) => current && { ...current, fat: fatness(info.queueCount + 1) });
    }, TAIL_MS * CAUGHT_AT);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const el = flyRef.current;
    const tail = tailRef.current;
    if (!el || !tail) return;
    const spin = Math.random() < 0.5 ? 1 : -1;
    // The turtle reaches out with a flipper, the monkey with a long arm, the frog shoots out its
    // tongue; a cat curls its tail.
    const worn = document.documentElement.dataset.cat;
    const kind =
      worn === "turtle" ? "flipper" : worn === "monkey" || worn === "capybara" ? "hand" : worn === "frog" ? "tongue" : "tail";
    const scene = makeTailScene(selection, target, viewSize(), spin, cat ? catTailRoot(cat) : undefined, kind);
    await playTail(el, tail, scene);
  }, [info, selection, shapes.length]);

  const finish = useCallback(
    async (action: Delivery) => {
      if (!info || !selection || busy.current) return;
      busy.current = true;
      if (action === "enqueue") await flyToBadge();
      if (shapes.length > 0) {
        const png = await compose();
        if (png) await captureDeliverAnnotated(png, action);
      } else {
        // No drawings: Rust crops the frozen frame pixel for pixel.
        const rect = toImageRect(selection, info.width / window.innerWidth, info);
        await captureDeliver(rect, action);
      }
    },
    [info, selection, shapes, compose, flyToBadge],
  );

  // Once a queue exists, adding to it becomes the main action (Enter).
  const hasQueue = (info?.queueCount ?? 0) > 0;
  const primary: Delivery = hasQueue ? "enqueue" : "copy";

  const [clearing, setClearing] = useState(false);
  const clearQueue = useCallback(async () => {
    // Let the cat jump out of the bin before the queue goes.
    setClearing(true);
    await new Promise((resolve) => setTimeout(resolve, TRASH_JUMP_MS));
    setClearing(false);
    await queueClear();
    // Clearing also leaves text mode.
    setInfo((current) => current && { ...current, queueCount: 0, textMode: false });
  }, []);

  const setTextMode = useCallback(async (enabled: boolean) => {
    await textModeSet(enabled);
    setInfo((current) => current && { ...current, textMode: enabled });
  }, []);

  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    shapesRef.current = previous;
    setShapesState(previous);
  }, []);

  /** Removes the shapes under the eraser; one undo step per drag. */
  const eraseAt = useCallback((p: Point, newStroke: boolean) => {
    const current = shapesRef.current;
    const kept = current.filter((shape) => !hitTest(shape, p, ERASER_TOLERANCE));
    if (kept.length === current.length) return;
    if (newStroke || history.current.length === 0) history.current.push(current);
    shapesRef.current = kept;
    setShapesState(kept);
  }, []);
  const erasedThisDrag = useRef(false);

  /** "Metni al": OCR on the frozen frame under the selection (drawings are ignored). */
  const readText = useCallback(async () => {
    if (!info || !selection) return;
    setOcr({ status: "loading" });
    try {
      const text = await captureOcr(toImageRect(selection, info.width / window.innerWidth, info));
      setOcr({ status: "done", text });
    } catch (message) {
      setOcr({ status: "error", message: String(message) });
    }
  }, [info, selection]);

  const commitText = useCallback(() => {
    const current = textDraftRef.current;
    setTextDraft(null);
    if (!current) return;
    const shape: Shape = { kind: "text", at: current.at, text: current.value, style: { color, width }, ...current.look };
    const index = current.index;
    if (index !== undefined) {
      // A changed text: emptied, it goes.
      setShapes((list) =>
        isMeaningful(shape) ? list.map((s, i) => (i === index ? shape : s)) : list.filter((_, i) => i !== index),
      );
      setPickedText(isMeaningful(shape) ? index : null);
    } else if (isMeaningful(shape)) {
      setShapes((list) => [...list, shape]);
    }
  }, [color, width, setTextDraft, setShapes]);

  // A picked text: moved live (one undo step per drag), changed from its bar, changed or deleted.
  const picked = pickedText !== null && shapes[pickedText]?.kind === "text" ? (shapes[pickedText] as TextShape) : null;
  const dragText = (next: TextShape, phase: "start" | "move") => {
    if (pickedText === null) return;
    if (phase === "start") history.current.push(shapesRef.current);
    const list = shapesRef.current.map((s, i) => (i === pickedText ? next : s));
    shapesRef.current = list;
    setShapesState(list);
  };
  const changeText = (next: TextShape) => {
    if (pickedText !== null) setShapes((list) => list.map((s, i) => (i === pickedText ? next : s)));
  };
  const deleteText = useCallback(() => {
    if (pickedText === null) return;
    setShapes((list) => list.filter((_, i) => i !== pickedText));
    setPickedText(null);
  }, [pickedText, setShapes]);
  const editText = () => {
    if (!picked || pickedText === null) return;
    setPickedText(null);
    setTextDraft({
      at: picked.at,
      value: picked.text,
      index: pickedText,
      look: { style: picked.style, size: picked.size, spacing: picked.spacing },
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textDraft) return; // the text box handles its own keys
      const key = e.key.toLowerCase();
      if (menu && key === "escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
      if (pickedText !== null && (key === "escape" || key === "delete" || key === "backspace")) {
        e.preventDefault();
        if (key === "escape") setPickedText(null);
        else deleteText();
        return;
      }
      if (ocr) {
        // The OCR card is open: its text box keeps Ctrl+C/Enter; Esc closes just the card.
        if (key === "escape") {
          e.preventDefault();
          setOcr(null);
        }
        return;
      }
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
  }, [finish, primary, undo, textDraft, ocr, menu, pickedText, deleteText]);

  // Focus a new text box once it's in the DOM (autoFocus alone loses to the click).
  const textOpen = textDraft !== null;
  useEffect(() => {
    // A text being changed opens with the caret after its last letter.
    if (textOpen)
      setTimeout(() => {
        const box = textRef.current;
        box?.focus();
        box?.setSelectionRange(box.value.length, box.value.length);
      }, 0);
  }, [textOpen]);

  useLayoutEffect(() => {
    const el = sidebarRef.current;
    if (el && (el.offsetHeight !== sidebarSize.height || el.offsetWidth !== sidebarSize.width)) {
      setSidebarSize({ width: el.offsetWidth, height: el.offsetHeight });
    }
    const bar = toolbarRef.current;
    if (bar && bar.offsetWidth !== toolbarWidth) setToolbarWidth(bar.offsetWidth);
  });

  const pointFrom = (e: ReactPointerEvent) => clampPoint({ x: e.clientX, y: e.clientY }, viewSize());
  const drawing = tool !== "select" && selection !== null;

  /** Selects this whole monitor. */
  const selectAll = useCallback(() => {
    if (!selection) void overlaySelectionStarted();
    setSelection({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
  }, [selection]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (menu) {
      // A click outside the menu only closes it; a right click opens it again there.
      setMenu(null);
      if (e.button !== 2) return;
    }
    if (e.button === 2) {
      if (textDraft) commitText();
      if (drag.kind === "none" && !flying) setMenu(pointFrom(e));
      return;
    }
    if (e.button !== 0) return;
    if (textDraft) commitText();
    const p = pointFrom(e);

    // A click on a text already placed picks it (looking around, or with the text tool).
    if (selection && (tool === "select" || tool === "text")) {
      const hit = textAt(shapesRef.current, p);
      if (hit >= 0) {
        e.preventDefault();
        setPickedText(hit);
        return;
      }
    }
    setPickedText(null);

    if (drawing) {
      if (tool === "text") {
        // Keep the click from moving focus away from the text box we're about to open.
        e.preventDefault();
        setTextDraft({ at: p, value: "" });
        return;
      }
      if (tool === "eraser") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ kind: "erase" });
        erasedThisDrag.current = false;
        const before = shapesRef.current;
        eraseAt(p, true);
        erasedThisDrag.current = shapesRef.current !== before;
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
    const handle = selection && handleAt(selection, p);
    if (selection && handle) {
      setDrag({ kind: "resize", handle, start: selection });
      return;
    }
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
    } else if (drag.kind === "resize") {
      setSelection(resizeRect(drag.start, drag.handle, p));
    } else if (drag.kind === "none") {
      // Only over the bare screen or the selection; the bars keep their own cursors.
      const target = e.target as HTMLElement;
      const onSurface = target === e.currentTarget || target.classList.contains("overlay__selection");
      const next = onSurface && selection && !drawing && !flying && !menu ? handleAt(selection, p) : null;
      if (next !== hover) setHover(next);
      const scale = info ? info.width / window.innerWidth : 1;
      const qr =
        onSurface &&
        !next &&
        !drawing &&
        !(selection && containsPoint(selection, p)) &&
        qrCodes.some(
          (code) =>
            code.url &&
            containsPoint({ x: code.x / scale, y: code.y / scale, width: code.width / scale, height: code.height / scale }, p),
        );
      if (qr !== overQr) setOverQr(qr);
    } else if (drag.kind === "draw" && draft) {
      setDraft(extendShape(draft, p));
    } else if (drag.kind === "erase") {
      const before = shapesRef.current;
      eraseAt(p, !erasedThisDrag.current);
      if (shapesRef.current !== before) erasedThisDrag.current = true;
    }
  };

  // The badge's own cat, on this screen. The badge hides for the screenshot, so the cat stays
  // where it sat: it watches the selection being drawn, pounces on it and comes back, and pulls
  // it into the queue with its tail. One cat throughout. With the badge on another screen, a
  // cat peeks up from this one's bottom edge instead.
  const home = (() => {
    if (!info || info.flyX == null || info.flyY == null || !catsAround()) return null;
    if (document.documentElement.dataset.cat === "plain") return null;
    const s = info.width / window.innerWidth;
    const p = { x: info.flyX / s, y: info.flyY / s };
    return isOnView(p, viewSize()) ? p : null;
  })();

  /** Where the watching cat stands, while a selection big enough to watch is being drawn. */
  const pounceWatchX = () => {
    if (home || drag.kind !== "select" || !selection || pounce || !catsAround()) return null;
    if (selection.width < POUNCE_MIN || selection.height < POUNCE_MIN) return null;
    const half = POUNCE_SIZE / 2 + 8;
    return Math.min(Math.max(selection.x + selection.width / 2, half), window.innerWidth - half);
  };

  const onPointerUp = () => {
    if (drag.kind === "select" && selection) {
      // Let go: the badge's cat leaps onto the selection's nearer corner, and comes back.
      if (home && !leap && selection.width >= POUNCE_MIN && selection.height >= POUNCE_MIN) {
        const cornerX = home.x < selection.x + selection.width / 2 ? selection.x : selection.x + selection.width;
        const cornerY = home.y < selection.y + selection.height / 2 ? selection.y : selection.y + selection.height;
        setLeap({ tx: cornerX - home.x, ty: cornerY - home.y, key: Date.now() });
      }
      const watchX = pounceWatchX();
      if (watchX !== null) {
        // Let go: the watching cat pounces on the selection's nearer bottom corner.
        const cornerX = watchX < selection.x + selection.width / 2 ? selection.x : selection.x + selection.width;
        const cornerY = selection.y + selection.height;
        setPounce({ x: watchX, tx: cornerX - watchX, ty: cornerY - window.innerHeight, key: Date.now() });
      }
      if (selection.width < MIN_SELECTION || selection.height < MIN_SELECTION) {
        setSelection(null);
        // A plain click on a QR code opens its link, like tapping it on a phone.
        const scale = info ? info.width / window.innerWidth : 1;
        const tapped = qrCodes.find(
          (code) =>
            code.url &&
            containsPoint(
              { x: code.x / scale, y: code.y / scale, width: code.width / scale, height: code.height / scale },
              drag.anchor,
            ),
        );
        if (tapped?.url) void openLink(tapped.url).catch(() => undefined);
      }
    } else if (drag.kind === "resize" && selection) {
      // Squashed flat: keep the selection it was before.
      if (selection.width < MIN_SELECTION || selection.height < MIN_SELECTION) setSelection(drag.start);
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
  const watchX = pounceWatchX();
  // The one cat: where it sits, how fat it is, and where it's looking.
  const seatAt = flying ? flying.cat : home;
  const seatFat = flying ? flying.fat : fatness(info.queueCount);
  const look = (() => {
    if (!seatAt || !selection || flying) return {};
    const dx = selection.x + selection.width / 2 - seatAt.x;
    const dy = selection.y + selection.height / 2 - seatAt.y;
    const reach = Math.hypot(dx, dy) + 70;
    return { "--look-x": (dx / reach).toFixed(3), "--look-y": (dy / reach).toFixed(3) };
  })();
  const imageRect = selection && toImageRect(selection, scale, info);
  const settled =
    selection !== null && flying === null && (drag.kind === "none" || drag.kind === "draw" || drag.kind === "erase");
  const toolbarSize = { width: toolbarWidth, height: TOOLBAR_HEIGHT };
  const toolbar = settled && toolbarPosition(selection, toolbarSize, viewSize());
  const sidebar = settled && sidebarPosition(selection, sidebarSize, viewSize());
  const flyoutSide = sidebar && sidebar.x < selection.x ? "left" : "right";
  const primaryClass = (action: Delivery) => (action === primary ? "primary" : undefined);
  const label = selection && sizeLabelPosition(selection, SIZE_LABEL_HEIGHT);
  const resizing = drag.kind === "resize" ? drag.handle : drag.kind === "none" && !drawing ? hover : null;
  const cursorClass = resizing
    ? ` overlay--resize-${handleCursor(resizing)}`
    : overQr && drag.kind === "none"
      ? " overlay--link"
    : drag.kind === "move"
      ? " overlay--moving"
      : tool === "eraser" && drawing
        ? " overlay--erasing"
        : drawing
          ? " overlay--drawing"
          : "";

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
        onLoad={() => {
          void overlayReady();
          // Like a phone camera: any QR code on screen gets its link shown beside it.
          const session = info.session;
          captureQr()
            .then((codes) => sessionRef.current === session && setQrCodes(codes))
            .catch(() => undefined);
        }}
      />

      {flying && (
        <div
          ref={flyRef}
          className="overlay__fly"
          style={{ left: flying.rect.x, top: flying.rect.y, width: flying.rect.width, height: flying.rect.height }}
        >
          <img
            src={frameUrl(info)}
            alt=""
            style={{ left: -flying.rect.x, top: -flying.rect.y, width: window.innerWidth, height: window.innerHeight }}
          />
          {flying.drawings && (
            <img
              src={flying.drawings}
              alt=""
              style={{ left: -flying.rect.x, top: -flying.rect.y, width: window.innerWidth, height: window.innerHeight }}
            />
          )}
        </div>
      )}

      {flying && <svg ref={tailRef} className="overlay__tail" aria-hidden="true" />}
      {seatAt && (
        <span
          ref={homeRef}
          className={`overlay__cat${flying ? " overlay__cat--catch" : ""}`}
          style={{ left: seatAt.x, top: seatAt.y, ...look } as React.CSSProperties}
        >
          {leap ? (
            <span ref={faceRef} className="overlay__face">
              <LeapingCat size={40} />
            </span>
          ) : turtle ? (
            <TurtleSeat fat={seatFat} asleep={false} hatch={null} />
          ) : document.documentElement.dataset.cat === "monkey" ? (
            <MonkeySeat fat={seatFat} asleep={false} />
          ) : document.documentElement.dataset.cat === "frog" ? (
            <FrogSeat fat={seatFat} asleep={false} />
          ) : document.documentElement.dataset.cat === "capybara" ? (
            <CapybaraSeat fat={seatFat} asleep={false} />
          ) : (
            <SeatCat fat={seatFat} />
          )}
        </span>
      )}

      {(watchX !== null || pounce) && (
        <span
          ref={pounceRef}
          key={pounce ? `pounce-${pounce.key}` : "watch"}
          className={`pounce-cat${pounce ? "" : " pounce-cat--watch"}`}
          style={{ left: (pounce ? pounce.x : (watchX ?? 0)) - POUNCE_SIZE / 2 }}
        >
          {/* It faces left; turned round to jump right. */}
          <span className="pounce-cat__look" style={pounce && pounce.tx > 0 ? { scale: "-1 1" } : undefined}>
            <LeapingCat size={POUNCE_SIZE} />
          </span>
        </span>
      )}

      {flying ? (
        <div className="overlay__dim overlay__dim--fly" />
      ) : selection ? (
        <div
          className="overlay__selection"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        >
          {settled && !drawing && HANDLES.map((h) => <span key={h} className={`overlay__handle overlay__handle--${h}`} />)}
        </div>
      ) : (
        <>
          <div className="overlay__dim" />
          <div className="overlay__hint">{t("overlay.hint")}</div>
        </>
      )}

      <canvas ref={canvasRef} className={`overlay__canvas${flying ? " overlay__canvas--hidden" : ""}`} />

      {qrCodes.length > 0 && (
        <div className={`qr-layer${flying || drag.kind !== "none" ? " qr-layer--hidden" : ""}`}>
          <QrLinks codes={qrCodes} scale={scale} />
        </div>
      )}

      <div
        className={`overlay__modes${flying ? " overlay__modes--hidden" : ""}${booping ? " boop" : ""}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <CatEar side="left" />
        <CatEar side="right" />
        <Whiskers side="left" />
        <Whiskers side="right" />
        <TurtleBar />
        <MonkeyBar />
        <FrogBar />
        <CapybaraBar />
        <button
          type="button"
          className={info.textMode ? undefined : "active"}
          title={t("overlay.mode_screenshot_title")}
          onClick={() => info.textMode && void setTextMode(false)}
        >
          <CameraIcon />
          {t("overlay.mode_screenshot")}
        </button>
        <CatNose boops={boops} title={t("overlay.nose")} onBoop={boop} />
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

      {picked && !flying && (
        <TextSelection shape={picked} onDrag={dragText} onChange={changeText} onDelete={deleteText} onEdit={editText} />
      )}

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
            color: textDraft.look?.style.color ?? color,
            fontSize: textDraft.look
              ? fontSizeOf({ kind: "text", at: textDraft.at, text: "", style: textDraft.look.style, size: textDraft.look.size })
              : textSize(width),
            letterSpacing: textDraft.look?.spacing ?? 0,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onKeyDown={onTextKey}
          onBlur={commitText}
        />
      )}

      {ocr && (
        <OcrCard
          state={ocr}
          onClose={() => setOcr(null)}
          onQueued={() => setInfo((current) => current && { ...current, queueCount: current.queueCount + 1 })}
        />
      )}

      {label && imageRect && !flying && (
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
          canUndo={history.current.length > 0}
          flyoutSide={flyoutSide}
          onTool={setTool}
          onColor={setColor}
          onWidth={setWidth}
          onUndo={undo}
          onCancel={() => void overlayCancel()}
        />
      )}

      {toolbar && (
        <div
          ref={toolbarRef}
          className="overlay__toolbar"
          style={{ left: toolbar.x, top: toolbar.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={primaryClass("copy")}
            data-label={t(hasQueue ? "overlay.copy_title_queue" : "overlay.copy_title")}
            onClick={() => void finish("copy")}
          >
            <CopyIcon />
          </button>
          <button type="button" data-label={t("overlay.save_title")} onClick={() => void finish("save")}>
            <SaveIcon />
          </button>
          <button type="button" data-label={t("overlay.read_text_title")} onClick={() => void readText()}>
            <ScanTextIcon />
          </button>
          <button
            type="button"
            className={`overlay__enqueue ${primaryClass("enqueue") ?? ""}`}
            data-label={
              hasQueue
                ? t("overlay.add_to_queue_title", { count: info.queueCount })
                : t("overlay.create_queue_title")
            }
            onClick={() => void finish("enqueue")}
          >
            <QueueAddIcon />
            {t(hasQueue ? "overlay.add_to_queue" : "overlay.create_queue")}
          </button>
          {hasQueue && (
            <button
              type="button"
              className="danger"
              data-label={t("overlay.clear_queue_title", { count: info.queueCount })}
              onClick={() => void clearQueue()}
            >
              {clearing ? <TrashJump size={18} /> : <TrashIcon size={18} />}
            </button>
          )}
        </div>
      )}

      {menu && (
        <ContextMenu
          at={menu}
          hasSelection={selection !== null}
          hasQueue={hasQueue}
          primary={primary}
          onClose={() => setMenu(null)}
          onDeliver={(action) => void finish(action)}
          onSelectAll={selectAll}
          onCancel={() => void overlayCancel()}
        />
      )}
    </div>
  );
}
