// Sizing and pixel work for the image editor. Shapes are kept in CSS pixels of the image as it
// is displayed, like in the overlay; the display size maps them onto the image's own pixels.
import { drawShapes, type Shape } from "../overlay/draw";
import { toImageRect, type Rect, type Size } from "../overlay/geometry";

/** Room the image leaves for the tools on the left, the buttons below and the screen's edges. */
export const SIDE_ROOM = 84;
export const END_ROOM = 76;

/** The image's size on screen: as large as fits in `room`, but never enlarged. */
export function fitSize(image: Size, room: Size): Size {
  const scale = Math.min(room.width / image.width, room.height / image.height, 1);
  return {
    width: Math.max(Math.round(image.width * scale), 1),
    height: Math.max(Math.round(image.height * scale), 1),
  };
}

export function roomIn(view: Size): Size {
  return {
    width: Math.max(view.width - 2 * SIDE_ROOM, 1),
    height: Math.max(view.height - 2 * END_ROOM, 1),
  };
}

export function canvasOf(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** The image with its shapes painted in, at the image's own resolution. */
export function flatten(base: HTMLCanvasElement, shapes: readonly Shape[], display: Size): HTMLCanvasElement {
  const out = canvasOf(base, base.width, base.height);
  const ctx = out.getContext("2d");
  const k = base.width / display.width;
  if (ctx) drawShapes(ctx, shapes, { k, origin: { x: 0, y: 0 }, frame: base, frameScale: k });
  return out;
}

/** Cuts a selection, in display pixels, out of a canvas. `null` if nothing would be left. */
export function cropCanvas(source: HTMLCanvasElement, selection: Rect, display: Size): HTMLCanvasElement | null {
  const r = toImageRect(selection, source.width / display.width, source);
  if (r.width < 1 || r.height < 1) return null;
  const out = document.createElement("canvas");
  out.width = r.width;
  out.height = r.height;
  out.getContext("2d")?.drawImage(source, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return out;
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("cannot encode the image");
  return new Uint8Array(await blob.arrayBuffer());
}
