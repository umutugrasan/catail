// Annotation shapes and their rendering. Shapes are stored in CSS pixels of the overlay
// window; a Transform maps them onto the preview canvas or the full-resolution export.
import type { Point } from "./geometry";

export type Tool =
  | "select"
  | "pen"
  | "highlighter"
  | "eraser"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "blur"
  | "crop";

/** Grouped in the sidebar behind one button each. */
export const SHAPE_TOOLS = ["rect", "ellipse", "line", "arrow"] as const satisfies readonly Tool[];
export const PEN_TOOLS = ["pen", "highlighter", "eraser"] as const satisfies readonly Tool[];

/** Starting color and quick picks under the color picker. */
export const DEFAULT_COLOR = "#e0457b";
export const PRESET_COLORS = ["#e0457b", "#ef4444", "#facc15", "#22c55e", "#3b82f6", "#111827", "#ffffff"] as const;
/** Stroke widths in CSS px; text size is derived from them. */
export const WIDTHS = [2, 4, 8] as const;

export interface Style {
  color: string;
  width: number;
}

export type Shape =
  | { kind: "pen" | "highlighter"; points: Point[]; style: Style }
  | { kind: "arrow" | "line" | "rect" | "ellipse" | "blur"; from: Point; to: Point; style: Style }
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
    case "line":
    case "rect":
    case "ellipse":
    case "blur":
      return { kind: tool, from: p, to: p, style };
    case "select":
    case "eraser":
    case "text":
    case "crop":
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

const distanceToSegment = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Whether the eraser at `p` touches `shape` (outlines count, not empty interiors). */
export function hitTest(shape: Shape, p: Point, tolerance: number): boolean {
  const reach = tolerance + shape.style.width / 2;
  switch (shape.kind) {
    case "pen":
    case "highlighter": {
      const width = shape.kind === "highlighter" ? shape.style.width * 4 : shape.style.width;
      const pts = shape.points;
      if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= tolerance + width / 2;
      return pts.some((a, i) => i > 0 && distanceToSegment(p, pts[i - 1], a) <= tolerance + width / 2);
    }
    case "line":
    case "arrow":
      return distanceToSegment(p, shape.from, shape.to) <= reach;
    case "rect": {
      const [a, b] = [shape.from, shape.to];
      const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      return corners.some((c, i) => distanceToSegment(p, c, corners[(i + 1) % 4]) <= reach);
    }
    case "ellipse": {
      const cx = (shape.from.x + shape.to.x) / 2;
      const cy = (shape.from.y + shape.to.y) / 2;
      const rx = Math.abs(shape.to.x - shape.from.x) / 2;
      const ry = Math.abs(shape.to.y - shape.from.y) / 2;
      if (rx < 1 || ry < 1) return Math.hypot(p.x - cx, p.y - cy) <= reach;
      // Distance from the outline, approximated by scaling the radial error.
      const r = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
      return Math.abs(r - 1) * Math.min(rx, ry) <= reach;
    }
    case "blur": {
      const [x1, x2] = [Math.min(shape.from.x, shape.to.x), Math.max(shape.from.x, shape.to.x)];
      const [y1, y2] = [Math.min(shape.from.y, shape.to.y), Math.max(shape.from.y, shape.to.y)];
      return p.x >= x1 - tolerance && p.x <= x2 + tolerance && p.y >= y1 - tolerance && p.y <= y2 + tolerance;
    }
    case "text": {
      const size = textSize(shape.style.width);
      const lines = shape.text.split("\n");
      const width = Math.max(...lines.map((l) => l.length)) * size * 0.6;
      const height = lines.length * size * 1.25;
      return (
        p.x >= shape.at.x - tolerance &&
        p.x <= shape.at.x + width + tolerance &&
        p.y >= shape.at.y - tolerance &&
        p.y <= shape.at.y + height + tolerance
      );
    }
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
      case "ellipse": {
        const a = map(shape.from);
        const b = map(shape.to);
        ctx.beginPath();
        ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "line": {
        const a = map(shape.from);
        const b = map(shape.to);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
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
