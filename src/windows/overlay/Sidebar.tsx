// Vertical drawing palette shown next to a settled selection.
import { forwardRef } from "react";
import { t } from "../../lib/i18n";
import { COLORS, DRAWING_TOOLS, WIDTHS, type Tool } from "./draw";
import { ToolIcon, UndoIcon } from "./icons";

interface Props {
  tool: Tool;
  color: string;
  width: number;
  canUndo: boolean;
  style: { left: number; top: number };
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onWidth: (width: number) => void;
  onUndo: () => void;
}

const TOOLS: Tool[] = ["select", ...DRAWING_TOOLS];

export const Sidebar = forwardRef<HTMLDivElement, Props>(function Sidebar(props, ref) {
  const { tool, color, width, canUndo, style } = props;
  return (
    <div
      ref={ref}
      className="overlay__sidebar"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {TOOLS.map((item) => (
        <button
          key={item}
          type="button"
          className={item === tool ? "active" : undefined}
          title={t(`overlay.tool_${item}`)}
          onClick={() => props.onTool(item)}
        >
          <ToolIcon tool={item} />
        </button>
      ))}

      <span className="overlay__sidebar-sep" />
      {COLORS.map((item) => (
        <button
          key={item}
          type="button"
          className={`overlay__swatch${item === color ? " active" : ""}`}
          title={t("overlay.color")}
          onClick={() => props.onColor(item)}
        >
          <span style={{ background: item }} />
        </button>
      ))}

      <span className="overlay__sidebar-sep" />
      {WIDTHS.map((item) => (
        <button
          key={item}
          type="button"
          className={item === width ? "active" : undefined}
          title={t("overlay.width")}
          onClick={() => props.onWidth(item)}
        >
          <span className="overlay__width-dot" style={{ width: item * 2 + 2, height: item * 2 + 2 }} />
        </button>
      ))}

      <span className="overlay__sidebar-sep" />
      <button type="button" title={t("overlay.undo")} disabled={!canUndo} onClick={props.onUndo}>
        <UndoIcon />
      </button>
    </div>
  );
});
