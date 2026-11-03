// Vertical drawing palette next to a settled selection. Shapes, pens and the color/width
// choices each sit behind one button and open in a small flyout.
import { forwardRef, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import { ColorPicker } from "./ColorPicker";
import { PEN_TOOLS, SHAPE_TOOLS, WIDTHS, type Tool } from "./draw";
import { ChevronIcon, CloseIcon, ToolIcon, UndoIcon } from "./icons";

type Flyout = "shapes" | "pens" | "style";

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
  onCancel: () => void;
}

const inGroup = (group: readonly Tool[], tool: Tool) => group.includes(tool);

export const Sidebar = forwardRef<HTMLDivElement, Props>(function Sidebar(props, ref) {
  const { tool, color, width, canUndo, style, flyoutSide } = props;
  const [open, setOpen] = useState<Flyout | null>(null);
  // The last tool used in each group is the one its button shows.
  const [shape, setShape] = useState<Tool>("rect");
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
    if (inGroup(SHAPE_TOOLS, next)) setShape(next);
    if (inGroup(PEN_TOOLS, next)) setPen(next);
    setOpen(null);
  };
  const toggle = (flyout: Flyout) => setOpen(open === flyout ? null : flyout);

  const toolButton = (item: Tool) => (
    <button
      key={item}
      type="button"
      className={item === tool ? "active" : undefined}
      data-label={t(`overlay.tool_${item}`)}
      onClick={() => pick(item)}
    >
      <ToolIcon tool={item} />
    </button>
  );

  const groupList = (group: readonly Tool[]) => (
    <div className="flyout__row">
      {group.map((item) => (
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
  );

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={`overlay__sidebar overlay__sidebar--${flyoutSide}`}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {toolButton("select")}

      <FlyoutButton
        open={open === "shapes"}
        side={flyoutSide}
        active={inGroup(SHAPE_TOOLS, tool)}
        label={t("overlay.tool_shapes")}
        onToggle={() => toggle("shapes")}
        face={<ToolIcon tool={inGroup(SHAPE_TOOLS, tool) ? tool : shape} />}
      >
        {groupList(SHAPE_TOOLS)}
      </FlyoutButton>

      <FlyoutButton
        open={open === "pens"}
        side={flyoutSide}
        active={inGroup(PEN_TOOLS, tool)}
        label={t("overlay.tool_pens")}
        onToggle={() => toggle("pens")}
        face={<ToolIcon tool={inGroup(PEN_TOOLS, tool) ? tool : pen} />}
      >
        {groupList(PEN_TOOLS)}
      </FlyoutButton>

      {toolButton("text")}
      {toolButton("blur")}

      <span className="overlay__sidebar-sep" />

      <FlyoutButton
        open={open === "style"}
        side={flyoutSide}
        label={t("overlay.style")}
        onToggle={() => toggle("style")}
        face={<span className="style-face" style={{ background: color }} />}
      >
        <ColorPicker color={color} onChange={props.onColor} />
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
      <button type="button" data-label={t("overlay.undo")} disabled={!canUndo} onClick={props.onUndo}>
        <UndoIcon />
      </button>
      <button type="button" className="overlay__close" data-label={t("overlay.cancel_title")} onClick={props.onCancel}>
        <CloseIcon />
      </button>
    </div>
  );
});

function FlyoutButton(props: {
  open: boolean;
  side: "left" | "right";
  active?: boolean;
  label: string;
  face: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flyout-anchor">
      <button
        type="button"
        className={`flyout-button${props.active ? " active" : ""}${props.open ? " open" : ""}`}
        data-label={props.open ? undefined : props.label}
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
