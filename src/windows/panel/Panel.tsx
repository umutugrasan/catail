import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { TRASH_JUMP_MS, TrashJump } from "../../lib/cats";
import { t } from "../../lib/i18n";
import {
  onWindowEvent,
  PanelEvents,
  panelClose,
  panelPaste,
  previewOpen,
  queueClear,
  queueExport,
  queueImageUrl,
  queueItems,
  queueRemove,
  queueReorder,
  type ExportFormat,
  type QueueItemView,
} from "../../lib/ipc";
import { CloseIcon, PasteIcon, SaveIcon, TrashIcon, ZoomIcon } from "../overlay/icons";
import { cellAt, cellPosition, moveItem, type Grid } from "./reorder";
import { renderTextPage } from "./textPage";

/** Two columns of square tiles; keep in sync with `.panel__tile` in panel.css and panel.rs. */
const GRID: Grid = { columns: 2, pitch: 78 };
/** Keep in sync with the exit animations in panel.css. */
const EXIT_MS = 160;
const REMOVE_MS = 200;

/** `grab` is where in the tile the pointer took hold; `x`/`y` is the tile's spot while dragged. */
type Drag = { id: string; moved: boolean; grabX: number; grabY: number; x: number; y: number };
type Export = { kind: "idle" } | { kind: "menu" } | { kind: "busy" } | { kind: "error"; message: string };

export function Panel() {
  const [items, setItems] = useState<QueueItemView[]>([]);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Mirrors `drag` for the event listener, which must not replace the list mid-drag.
  const dragRef = useRef<Drag | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Bumped on every open so the entrance animation replays.
  const [openCount, setOpenCount] = useState(0);
  const [closing, setClosing] = useState(false);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<Export>({ kind: "idle" });
  const [clearing, setClearing] = useState(false);

  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      void panelClose();
      setClosing(false);
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    void queueItems().then(setItems);
    const subscriptions = [
      onWindowEvent<QueueItemView[]>(PanelEvents.update, (next) => {
        if (!dragRef.current) setItems(next);
      }),
      onWindowEvent(PanelEvents.opened, () => {
        setClosing(false);
        setRemoving(new Set());
        setExporting({ kind: "idle" });
        setOpenCount((n) => n + 1);
      }),
      onWindowEvent(PanelEvents.close, close),
    ];
    return () => subscriptions.forEach((s) => void s.then((u) => u()));
  }, [close]);

  /** A cat jumps out of the bin first; then the queue is cleared (and the panel closes). */
  const clearAll = () => {
    if (clearing) return;
    setClearing(true);
    setTimeout(() => {
      void queueClear();
      setClearing(false);
    }, TRASH_JUMP_MS);
  };

  const remove = (id: string) => {
    // Let the tile shrink away before it leaves the grid; the rest then slide up.
    setRemoving((current) => new Set(current).add(id));
    setTimeout(() => void queueRemove(id), REMOVE_MS);
  };

  const exportAs = async (format: ExportFormat) => {
    setExporting({ kind: "busy" });
    try {
      const textPages: Record<string, string> = {};
      if (format === "pdf") {
        for (const item of items) {
          if (item.kind === "text") textPages[item.id] = await renderTextPage(item.fullText ?? item.preview ?? "");
        }
      }
      await queueExport(format, textPages);
      setExporting({ kind: "idle" });
    } catch (message) {
      setExporting({ kind: "error", message: String(message) });
    }
  };

  /** Pointer position inside the grid's scrolled content. */
  const gridPoint = (clientX: number, clientY: number) => {
    const list = listRef.current;
    if (!list) return { x: 0, y: 0 };
    const r = list.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top + list.scrollTop };
  };

  const onTilePointerDown = (e: ReactPointerEvent<HTMLLIElement>, id: string, index: number) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = gridPoint(e.clientX, e.clientY);
    const cell = cellPosition(index, GRID);
    setDrag({ id, moved: false, grabX: p.x - cell.x, grabY: p.y - cell.y, x: cell.x, y: cell.y });
  };

  // The dragged tile follows the pointer; the others slide aside as its slot changes.
  const onTilePointerMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (!drag) return;
    const p = gridPoint(e.clientX, e.clientY);
    const rows = Math.ceil(items.length / GRID.columns);
    const x = Math.min(Math.max(p.x - drag.grabX, 0), (GRID.columns - 1) * GRID.pitch);
    const y = Math.min(Math.max(p.y - drag.grabY, 0), (rows - 1) * GRID.pitch);
    const target = cellAt(x + GRID.pitch / 2, y + GRID.pitch / 2, GRID, items.length);
    const current = items.findIndex((item) => item.id === drag.id);
    const start = cellPosition(current, GRID);
    const moved = drag.moved || Math.hypot(x - start.x, y - start.y) > 3;
    if (target !== current && current >= 0) setItems(moveItem(items, current, target));
    setDrag({ ...drag, x, y, moved });
  };

  const onTilePointerUp = () => {
    if (drag?.moved) void queueReorder(items.map((item) => item.id));
    setDrag(null);
  };

  const rows = Math.ceil(items.length / GRID.columns);

  return (
    <main key={openCount} className={`panel${closing ? " panel--closing" : ""}`}>
      <header className="panel__header">
        <h1>
          {t("panel.title_short")}
          <span className="panel__count">{items.length}</span>
        </h1>
        <button type="button" className="panel__icon-button" title={t("panel.close")} onClick={close}>
          <CloseIcon />
        </button>
      </header>

      <div className="panel__list" ref={listRef} title={t("panel.hint")}>
        <ol className="panel__grid" style={{ height: rows * GRID.pitch }}>
          {items.map((item, index) => {
            const dragged = drag?.id === item.id;
            const at = dragged ? { x: drag.x, y: drag.y } : cellPosition(index, GRID);
            return (
              <li
                key={item.id}
                className={[
                  "panel__slot",
                  dragged && "panel__slot--dragging",
                  removing.has(item.id) && "panel__slot--removing",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
                onPointerDown={(e) => onTilePointerDown(e, item.id, index)}
                onPointerMove={onTilePointerMove}
                onPointerUp={onTilePointerUp}
                onPointerCancel={onTilePointerUp}
              >
                {/* Stagger the entrance a little; capped so long queues don't wait. */}
                <div
                  className={`panel__tile panel__tile--${item.kind}`}
                  style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
                  title={item.sourceApp ?? undefined}
                >
                  {item.kind === "image" ? (
                    <img src={queueImageUrl(item.id)} alt="" draggable={false} />
                  ) : (
                    <span className="panel__text">{item.preview}</span>
                  )}
                  <span className="panel__index">{index + 1}</span>
                  <span className="panel__actions">
                    {item.kind === "image" && (
                      <button
                        type="button"
                        className="panel__tile-button"
                        title={t("panel.zoom")}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => void previewOpen(item.id)}
                      >
                        <ZoomIcon />
                      </button>
                    )}
                    <button
                      type="button"
                      className="panel__tile-button panel__tile-button--danger"
                      title={t("panel.remove")}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => remove(item.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {exporting.kind === "error" && <p className="panel__error">{exporting.message}</p>}

      <footer className="panel__footer">
        <button
          type="button"
          className={`panel__button panel__button--danger${clearing ? " panel__button--jumping" : ""}`}
          data-label={clearing ? undefined : t("panel.clear")}
          onClick={clearAll}
        >
          {clearing ? <TrashJump size={17} /> : <TrashIcon size={17} />}
        </button>

        <div className="panel__export">
          <button
            type="button"
            className="panel__button"
            data-label={exporting.kind === "menu" ? undefined : t("panel.export")}
            disabled={exporting.kind === "busy"}
            onClick={() => setExporting(exporting.kind === "menu" ? { kind: "idle" } : { kind: "menu" })}
          >
            {exporting.kind === "busy" ? <span className="spinner" /> : <SaveIcon />}
          </button>
          {exporting.kind === "menu" && (
            <div className="panel__menu">
              <button type="button" onClick={() => void exportAs("zip")}>
                <strong>ZIP</strong>
              </button>
              <button type="button" onClick={() => void exportAs("pdf")}>
                <strong>PDF</strong>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="panel__button panel__button--primary"
          data-label={t("panel.paste")}
          onClick={() => void panelPaste()}
        >
          <PasteIcon />
        </button>
      </footer>
    </main>
  );
}
