// Vertical drawing palette next to a settled selection. Pens and the color/width choices
// live in small flyouts so only one button each is visible until it's clicked.
import { forwardRef, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import { COLORS, WIDTHS, type Tool } from "./draw";
import { ChevronIcon, ToolIcon, UndoIcon } from "./icons";

type Flyout = "pens" | "style";

interface Props {
  tool: Tool;
  color: string;
  width: number;
  canUndo: boolean;
  style: { left: number; top: number };
  /** Which side flyouts open on: away from the selection. */
  flyoutSide: "left" | "right";
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onWidth: (width: number) => void;
  onUndo: () => void;
}

const PENS: Tool[] = ["pen", "highlighter"];

export const Sidebar = forwardRef<HTMLDivElement, Props>(function Sidebar(props, ref) {
  const { tool, color, width, canUndo, style, flyoutSide } = props;
  const [open, setOpen] = useState<Flyout | null>(null);
  // The last pen used is the one the group button shows and picks.
  const [pen, setPen] = useState<Tool>("pen");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close a flyout on any click outside the sidebar.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const pick = (next: Tool) => {
    props.onTool(next);
    if (PENS.includes(next)) setPen(next);
    setOpen(null);
  };

  const toolButton = (item: Tool) => (
    <button
      key={item}
      type="button"
      className={item === tool ? "active" : undefined}
      title={t(`overlay.tool_${item}`)}
      onClick={() => pick(item)}
    >
      <ToolIcon tool={item} />
    </button>
  );

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className="overlay__sidebar"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {toolButton("select")}
      {toolButton("arrow")}
      {toolButton("rect")}

      <FlyoutButton
        open={open === "pens"}
        side={flyoutSide}
        active={PENS.includes(tool)}
        title={t("overlay.tool_pens")}
        onToggle={() => setOpen(open === "pens" ? null : "pens")}
        face={<ToolIcon tool={PENS.includes(tool) ? tool : pen} />}
      >
        <div className="flyout__row">
          {PENS.map((item) => (
            <button
              key={item}
              type="button"
              className={`flyout__tool${item === tool ? " active" : ""}`}
              onClick={() => pick(item)}
            >
              <ToolIcon tool={item} />
              <span>{t(`overlay.tool_${item}`)}</span>
            </button>
          ))}
        </div>
      </FlyoutButton>

      {toolButton("text")}
      {toolButton("blur")}

      <span className="overlay__sidebar-sep" />

      <FlyoutButton
        open={open === "style"}
        side={flyoutSide}
        title={t("overlay.style")}
        onToggle={() => setOpen(open === "style" ? null : "style")}
        face={<span className="style-face" style={{ background: color, boxShadow: `0 0 0 ${width / 2}px rgba(255,255,255,.9) inset` }} />}
      >
        <div className="flyout__label">{t("overlay.color")}</div>
        <div className="flyout__swatches">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              className={`flyout__swatch${item === color ? " active" : ""}`}
              style={{ background: item }}
              title={t("overlay.color")}
              onClick={() => props.onColor(item)}
            />
          ))}
        </div>
        <div className="flyout__label">{t("overlay.width")}</div>
        <div className="flyout__widths">
          {WIDTHS.map((item) => (
            <button
              key={item}
              type="button"
              className={`flyout__width${item === width ? " active" : ""}`}
              onClick={() => props.onWidth(item)}
            >
              <span style={{ width: item * 2 + 4, height: item * 2 + 4, background: color }} />
            </button>
          ))}
        </div>
      </FlyoutButton>

      <span className="overlay__sidebar-sep" />
      <button type="button" title={t("overlay.undo")} disabled={!canUndo} onClick={props.onUndo}>
        <UndoIcon />
      </button>
    </div>
  );
});

function FlyoutButton(props: {
  open: boolean;
  side: "left" | "right";
  active?: boolean;
  title: string;
  face: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flyout-anchor">
      <button
        type="button"
        className={`flyout-button${props.active ? " active" : ""}${props.open ? " open" : ""}`}
        title={props.title}
        onClick={props.onToggle}
      >
        {props.face}
        <span className="flyout-button__chevron">
          <ChevronIcon />
        </span>
      </button>
      {props.open && <div className={`flyout flyout--${props.side}`}>{props.children}</div>}
    </div>
  );
}
