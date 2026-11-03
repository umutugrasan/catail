// Annotation shapes and their rendering. Shapes are stored in CSS pixels of the overlay
// window; a Transform maps them onto the preview canvas or the full-resolution export.
import type { Point } from "./geometry";

export type Tool = "select" | "pen" | "highlighter" | "arrow" | "rect" | "text" | "blur";

export const DRAWING_TOOLS: Exclude<Tool, "select">[] = [
  "arrow",
  "rect",
  "pen",
  "highlighter",
  "text",
  "blur",
];

export const COLORS = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#ffffff", "#111827"] as const;
/** Stroke widths in CSS px; text size is derived from them. */
export const WIDTHS = [2, 4, 8] as const;

export interface Style {
  color: string;
  width: number;
}

export type Shape =
  | { kind: "pen" | "highlighter"; points: Point[]; style: Style }
  | { kind: "arrow" | "rect" | "blur"; from: Point; to: Point; style: Style }
  | { kind: "text"; at: Point; text: string; style: Style };

/** Maps a CSS point to target pixels: `(p - origin) * k`. */
export interface Transform {
  k: number;
  origin: Point;
  /** Frozen frame and its pixels per CSS pixel, for blur. */
  frame: CanvasImageSource;
  frameScale: number;
}

export const textSize = (width: number) => 14 + width * 3;
const HIGHLIGHTER_ALPHA = 0.35;
const BLUR_BLOCK_CSS = 8;

/** The two barb points of an arrow head at `to`. */
export function arrowHead(from: Point, to: Point, size: number): [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  return [
    { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) },
    { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) },
  ];
}

/** The shape a drag with `tool` starts at `p`; `null` for tools that don't drag. */
export function startShape(tool: Tool, p: Point, style: Style): Shape | null {
  switch (tool) {
    case "pen":
    case "highlighter":
      return { kind: tool, points: [p], style };
    case "arrow":
    case "rect":
    case "blur":
      return { kind: tool, from: p, to: p, style };
    case "select":
    case "text":
      return null;
  }
}

/** Extends a shape being dragged to `p`. */
export function extendShape(shape: Shape, p: Point): Shape {
  switch (shape.kind) {
    case "pen":
    case "highlighter":
      return { ...shape, points: [...shape.points, p] };
    case "text":
      return shape;
    default:
      return { ...shape, to: p };
  }
}

/** Shapes smaller than this (CSS px) are treated as stray clicks and dropped. */
export function isMeaningful(shape: Shape): boolean {
  switch (shape.kind) {
    case "pen":
    case "highlighter":
      return shape.points.length > 1;
    case "text":
      return shape.text.trim().length > 0;
    default:
      return Math.hypot(shape.to.x - shape.from.x, shape.to.y - shape.from.y) >= 3;
  }
}

export function drawShapes(ctx: CanvasRenderingContext2D, shapes: readonly Shape[], t: Transform) {
  const map = (p: Point) => ({ x: (p.x - t.origin.x) * t.k, y: (p.y - t.origin.y) * t.k });
  for (const shape of shapes) {
    ctx.save();
    ctx.strokeStyle = shape.style.color;
    ctx.fillStyle = shape.style.color;
    ctx.lineWidth = shape.style.width * t.k;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (shape.kind) {
      case "pen":
      case "highlighter": {
        if (shape.kind === "highlighter") {
          ctx.globalAlpha = HIGHLIGHTER_ALPHA;
          ctx.lineWidth = shape.style.width * 4 * t.k;
          ctx.lineCap = "square";
        }
        ctx.beginPath();
        shape.points.map(map).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        break;
      }
      case "rect": {
        const a = map(shape.from);
        const b = map(shape.to);
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        break;
      }
      case "arrow": {
        const a = map(shape.from);
        const b = map(shape.to);
        const [l, r] = arrowHead(a, b, (10 + shape.style.width * 3) * t.k);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(l.x, l.y);
        ctx.lineTo(r.x, r.y);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "text": {
        const p = map(shape.at);
        ctx.font = `600 ${textSize(shape.style.width) * t.k}px "Segoe UI", sans-serif`;
        ctx.textBaseline = "top";
        shape.text.split("\n").forEach((line, i) => {
          ctx.fillText(line, p.x, p.y + i * textSize(shape.style.width) * 1.25 * t.k);
        });
        break;
      }
      case "blur":
        pixelate(ctx, shape.from, shape.to, t);
        break;
    }
    ctx.restore();
  }
}

/** Redraws the frame under the rectangle in coarse blocks, hiding what's beneath. */
function pixelate(ctx: CanvasRenderingContext2D, from: Point, to: Point, t: Transform) {
  const css = {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    w: Math.abs(to.x - from.x),
    h: Math.abs(to.y - from.y),
  };
  if (css.w < 1 || css.h < 1) return;
  const cols = Math.max(1, Math.round(css.w / BLUR_BLOCK_CSS));
  const rows = Math.max(1, Math.round(css.h / BLUR_BLOCK_CSS));

  const small = document.createElement("canvas");
  small.width = cols;
  small.height = rows;
  const sctx = small.getContext("2d");
  if (!sctx) return;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(
    t.frame,
    css.x * t.frameScale,
    css.y * t.frameScale,
    css.w * t.frameScale,
    css.h * t.frameScale,
    0,
    0,
    cols,
    rows,
  );

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    small,
    0,
    0,
    cols,
    rows,
    (css.x - t.origin.x) * t.k,
    (css.y - t.origin.y) * t.k,
    css.w * t.k,
    css.h * t.k,
  );
}
