// Right-click menu of the capture overlay.
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import type { Delivery } from "../../lib/ipc";
import type { Point } from "./geometry";
import { CloseIcon, CopyIcon, QueueAddIcon, SaveIcon, SelectAllIcon } from "./icons";

const EDGE = 6;

interface Props {
  at: Point;
  hasSelection: boolean;
  hasQueue: boolean;
  primary: Delivery;
  onClose: () => void;
  onDeliver: (action: Delivery) => void;
  onSelectAll: () => void;
  onCancel: () => void;
}

export function ContextMenu({ at, hasSelection, hasQueue, primary, onClose, onDeliver, onSelectAll, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Opens down-right of the pointer, flipped where it would run off the screen.
  const [place, setPlace] = useState<{ x: number; y: number; origin: string } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const left = at.x + w + EDGE > window.innerWidth;
    const up = at.y + h + EDGE > window.innerHeight;
    setPlace({
      x: Math.max(EDGE, left ? at.x - w : at.x),
      y: Math.max(EDGE, up ? at.y - h : at.y),
      origin: `${up ? "bottom" : "top"} ${left ? "right" : "left"}`,
    });
  }, [at]);

  const item = (icon: ReactNode, label: string, run: () => void, opts: { hint?: string; disabled?: boolean; danger?: boolean } = {}) => (
    <button
      type="button"
      role="menuitem"
      className={opts.danger ? "menu__item menu__item--danger" : "menu__item"}
      disabled={opts.disabled}
      onClick={() => {
        onClose();
        run();
      }}
    >
      {icon}
      <span className="menu__label">{label}</span>
      {opts.hint && <kbd className="menu__hint">{opts.hint}</kbd>}
    </button>
  );

  const none = !hasSelection;
  return (
    <div
      ref={ref}
      className={`menu${place ? " menu--open" : ""}`}
      role="menu"
      aria-label={t("overlay.menu")}
      style={place ? { left: place.x, top: place.y, transformOrigin: place.origin } : { left: at.x, top: at.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {item(<CopyIcon />, t("overlay.copy"), () => onDeliver("copy"), {
        hint: primary === "copy" ? "Ctrl+C · Enter" : "Ctrl+C",
        disabled: none,
      })}
      {item(<SaveIcon />, t("overlay.save"), () => onDeliver("save"), { hint: "Ctrl+S", disabled: none })}
      {item(<QueueAddIcon />, t(hasQueue ? "overlay.add_to_queue" : "overlay.create_queue"), () => onDeliver("enqueue"), {
        hint: primary === "enqueue" ? "Enter" : undefined,
        disabled: none,
      })}
      {item(<SelectAllIcon />, t("overlay.select_all"), onSelectAll)}
      <div className="menu__separator" role="separator" />
      {item(<CloseIcon />, t("overlay.cancel"), onCancel, { hint: "Esc", danger: true })}
    </div>
  );
}
