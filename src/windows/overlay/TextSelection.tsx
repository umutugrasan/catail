// A text already placed, picked again: a frame around it to move it by and a little bar to
// recolor, resize, space out or delete it. Double-click to change the words. Shared by the
// capture overlay and the image editor; both keep shapes in their own stage's CSS pixels.
import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { t } from "../../lib/i18n";
import { ColorPicker } from "./ColorPicker";
import { fontSizeOf, PRESET_COLORS, textBox, type TextShape } from "./draw";
import { ChevronIcon, TrashIcon } from "./icons";
import "./textSelection.css";

export const TEXT_SIZE_STEP = 2;
export const TEXT_SIZE_MIN = 10;
export const TEXT_SIZE_MAX = 120;
export const TEXT_SPACING_STEP = 1;
export const TEXT_SPACING_MIN = -2;
export const TEXT_SPACING_MAX = 24;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
/** Two presses this close, without moving, open the text for writing. */
const DOUBLE_PRESS_MS = 450;

/** "start" before the first change of a drag (time to remember the old state), then "move"s. */
export type DragPhase = "start" | "move";

export function TextSelection(props: {
  shape: TextShape;
  /** A drag of the frame or the size handle. */
  onDrag: (next: TextShape, phase: DragPhase) => void;
  /** A one-step change from the bar. */
  onChange: (next: TextShape) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { shape, onDrag, onChange, onDelete, onEdit } = props;
  const [picking, setPicking] = useState(false);
  const box = textBox(shape);
  const size = fontSizeOf(shape);
  const spacing = shape.spacing ?? 0;
  // Pressing starts a move, which swallows the browser's own double-click: count presses here.
  const lastPress = useRef(0);

  /** Follows the pointer from `e` until it lets go, reporting how far it has gone. */
  const follow = (e: ReactPointerEvent, step: (dx: number, dy: number) => TextShape) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const [x0, y0] = [e.clientX, e.clientY];
    let started = false;
    const move = (ev: PointerEvent) => {
      const [dx, dy] = [ev.clientX - x0, ev.clientY - y0];
      if (!started && Math.hypot(dx, dy) < 2) return;
      onDrag(step(dx, dy), started ? "move" : "start");
      started = true;
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const startMove = (e: ReactPointerEvent) => {
    if (e.button === 0 && e.timeStamp - lastPress.current < DOUBLE_PRESS_MS) {
      e.preventDefault();
      e.stopPropagation();
      lastPress.current = 0;
      // Once the button is up: a text box opened under a pressed button gets its caret moved by
      // the release.
      (e.currentTarget as HTMLElement).addEventListener("pointerup", onEdit, { once: true });
      return;
    }
    lastPress.current = e.timeStamp;
    follow(e, (dx, dy) => ({ ...shape, at: { x: shape.at.x + dx, y: shape.at.y + dy } }));
  };

  // The round handle on the right: pulling it out makes the letters bigger, in step with the box.
  const startResize = (e: ReactPointerEvent) =>
    follow(e, (dx) => ({
      ...shape,
      size: Math.round(clamp((size * (box.width + dx)) / Math.max(box.width, 1), TEXT_SIZE_MIN, TEXT_SIZE_MAX)),
    }));

  const patch = (next: Partial<TextShape>) => onChange({ ...shape, ...next });
  const keep = (e: ReactPointerEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      <div
        className="text-select"
        style={{ left: box.x - 6, top: box.y - 4, width: box.width + 12, height: box.height + 8 }}
        title={t("overlay.text_edit_hint")}
        onPointerDown={startMove}
      >
        <span className="text-select__grip" onPointerDown={startMove}>
          <svg viewBox="0 0 8 14" width={8} height={14} aria-hidden="true">
            {[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2" cy={y} r="1.3" />, <circle key={`b${y}`} cx="6" cy={y} r="1.3" />])}
          </svg>
        </span>
        <span className="text-select__size" title={t("overlay.text_resize")} onPointerDown={startResize} />
      </div>

      <div className="text-select__bar" style={{ left: box.x - 6, top: box.y - 50 }} onPointerDown={keep}>
        <button
          type="button"
          className={`text-select__color${picking ? " open" : ""}`}
          title={t("overlay.text_color")}
          onClick={() => setPicking((open) => !open)}
        >
          <span className="text-select__glyph">A</span>
          <span className="text-select__swatch" style={{ background: shape.style.color }} />
          <ChevronIcon />
        </button>
        <span className="text-select__divider" />
        <button
          type="button"
          title={t("overlay.text_bigger")}
          disabled={size >= TEXT_SIZE_MAX}
          onClick={() => patch({ size: clamp(size + TEXT_SIZE_STEP, TEXT_SIZE_MIN, TEXT_SIZE_MAX) })}
        >
          <span className="text-select__glyph">
            A<sup>ˆ</sup>
          </span>
        </button>
        <button
          type="button"
          title={t("overlay.text_smaller")}
          disabled={size <= TEXT_SIZE_MIN}
          onClick={() => patch({ size: clamp(size - TEXT_SIZE_STEP, TEXT_SIZE_MIN, TEXT_SIZE_MAX) })}
        >
          <span className="text-select__glyph">
            A<sup>ˇ</sup>
          </span>
        </button>
        <span className="text-select__divider" />
        <button
          type="button"
          title={t("overlay.text_wider")}
          disabled={spacing >= TEXT_SPACING_MAX}
          onClick={() => patch({ spacing: clamp(spacing + TEXT_SPACING_STEP, TEXT_SPACING_MIN, TEXT_SPACING_MAX) })}
        >
          <SpacingIcon wider />
        </button>
        <button
          type="button"
          title={t("overlay.text_tighter")}
          disabled={spacing <= TEXT_SPACING_MIN}
          onClick={() => patch({ spacing: clamp(spacing - TEXT_SPACING_STEP, TEXT_SPACING_MIN, TEXT_SPACING_MAX) })}
        >
          <SpacingIcon />
        </button>
        <span className="text-select__divider" />
        <button type="button" className="text-select__delete" title={t("overlay.text_delete")} onClick={onDelete}>
          <TrashIcon size={16} />
        </button>
        {picking && (
          <div className="text-select__picker">
            <ColorPicker
              color={shape.style.color}
              presets={PRESET_COLORS}
              onChange={(color) => patch({ style: { ...shape.style, color } })}
            />
          </div>
        )}
      </div>
    </>
  );
}

/** "AV" over a double arrow: pointing out to space the letters out, in to bring them closer. */
function SpacingIcon({ wider = false }: { wider?: boolean }) {
  return (
    <svg viewBox="0 0 22 20" width={22} height={20} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10 6 2l3 8M4.2 7h3.6M13 2l3 8 3-8" />
      {wider ? (
        <path d="M3 15h16M3 15l2.2-2M3 15l2.2 2M19 15l-2.2-2M19 15l-2.2 2" />
      ) : (
        <path d="M2 15h6M8 15l-2.2-2M8 15l-2.2 2M20 15h-6M14 15l2.2-2M14 15l2.2 2" />
      )}
    </svg>
  );
}
