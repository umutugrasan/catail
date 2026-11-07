// Full-range color picker: saturation/value square, hue slider, hex field, quick picks.
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { t } from "../../lib/i18n";
import { hexToHsv, hsvToHex, parseHex, svFromPoint, type Hsv } from "./color";
import { PRESET_COLORS } from "./draw";
import "./picker.css";

interface Props {
  color: string;
  onChange: (color: string) => void;
  /** Quick picks under the picker; the drawing colors unless given. */
  presets?: readonly string[];
}

export function ColorPicker({ color, onChange, presets = PRESET_COLORS }: Props) {
  // Kept separately from the hex so hue survives dragging through black/white.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color));
  const [hexInput, setHexInput] = useState(color);

  useEffect(() => {
    if (hsvToHex(hsv) !== color) setHsv(hexToHsv(color));
    setHexInput(color);
  }, [color]); // only outside changes (presets, hex field); hsv is ours

  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  const apply = (next: Hsv) => {
    hsvRef.current = next;
    setHsv(next);
    onChange(hsvToHex(next));
  };

  /** Pointer drag inside the element, reported in its own coordinates. */
  const dragOn =
    (update: (x: number, y: number, w: number, h: number) => void) => (e: ReactPointerEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const move = (ev: { clientX: number; clientY: number }) => {
        const r = target.getBoundingClientRect();
        update(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height);
      };
      move(e);
      const onMove = (ev: PointerEvent) => move(ev);
      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
    };

  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="picker">
      <div
        className="picker__square"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
        onPointerDown={dragOn((x, y, w, h) => apply({ ...hsvRef.current, ...svFromPoint(x, y, w, h) }))}
      >
        <span
          className="picker__thumb"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }}
        />
      </div>
      <div
        className="picker__hue"
        onPointerDown={dragOn((x, _y, w) => apply({ ...hsvRef.current, h: Math.min(Math.max(x / w, 0), 0.9999) * 360 }))}
      >
        <span className="picker__hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }} />
      </div>
      <div className="picker__row">
        <span className="picker__preview" style={{ background: color }} />
        <input
          className="picker__hex"
          value={hexInput}
          spellCheck={false}
          maxLength={7}
          aria-label={t("overlay.color_hex")}
          onChange={(e) => {
            setHexInput(e.target.value);
            const parsed = parseHex(e.target.value);
            if (parsed) onChange(parsed);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="picker__presets">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`picker__preset${preset === color ? " active" : ""}`}
            style={{ background: preset }}
            title={preset}
            onClick={() => onChange(preset)}
          />
        ))}
      </div>
    </div>
  );
}
