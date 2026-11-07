import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { catsAround } from "../../lib/cat";
import { CatFace, TABLE_PUSH_MS, TableCat, TRASH_HANDOFF_MS, TrashJump } from "../../lib/cats";
import { t } from "../../lib/i18n";
import {
  badgeCatAway,
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
import { CloseIcon, FileIcon, PasteIcon, SaveIcon, TrashIcon, ZoomIcon } from "../overlay/icons";
import { extensionLabel, formatSize, isPdf } from "./fileCard";
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

function FileCard({ item }: { item: QueueItemView }) {
  const name = item.fileName ?? "";
  return (
    <span className="panel__file">
      <span className="panel__file-icon">
        <FileIcon />
        <span className="panel__file-type">{extensionLabel(name)}</span>
      </span>
      <span className="panel__file-name">{name}</span>
      {item.fileSize !== null && <span className="panel__file-size">{formatSize(item.fileSize)}</span>}
    </span>
  );
}

export function Panel() {
  const [items, setItems] = useState<QueueItemView[]>([]);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Mirrors `drag` for the event listener, which must not replace the list mid-drag.
  const dragRef = useRef<Drag | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Bumped on every open so the entrance animation replays.
  const [openCount, setOpenCount] = useState(0);
  const [closing, setClosing] = useState(false);
  // Tiles on their way out, and which way a cat pushes each: -1 left, 1 right, 0 no cat.
  const [removing, setRemoving] = useState<Map<string, number>>(new Map());
  const [exporting, setExporting] = useState<Export>({ kind: "idle" });
  const [clearing, setClearing] = useState(false);
  // Files from another app are being dragged over the panel.
  const [dropHover, setDropHover] = useState(false);

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
      onWindowEvent<string>(PanelEvents.opened, (corner) => {
        // Grows out of the badge, wherever it sits.
        document.getElementById("root")!.dataset.corner = corner;
        setClosing(false);
        setRemoving(new Map());
        setExporting({ kind: "idle" });
        setOpenCount((n) => n + 1);
      }),
      onWindowEvent(PanelEvents.close, close),
      onWindowEvent<boolean>(PanelEvents.dropHover, setDropHover),
    ];
    return () => subscriptions.forEach((s) => void s.then((u) => u()));
  }, [close]);

  /**
   * A cat climbs onto the bin first; then the queue is cleared, the panel closes and the
   * badge shows the cat leaping from the bin into its box.
   */
  const clearAll = () => {
    if (clearing) return;
    setClearing(true);
    void badgeCatAway(TRASH_HANDOFF_MS + 400);
    setTimeout(() => {
      void queueClear(true).finally(() => setClearing(false));
    }, TRASH_HANDOFF_MS);
  };

  const remove = (id: string, index: number) => {
    // A cat pushes the tile off the panel's nearer edge (or it just shrinks away, with no cat)
    // before it leaves the grid; the rest then slide up.
    const dir = catsAround() ? (index % GRID.columns === 0 ? -1 : 1) : 0;
    setRemoving((current) => new Map(current).set(id, dir));
    if (dir !== 0) void badgeCatAway(TABLE_PUSH_MS);
    setTimeout(() => void queueRemove(id), dir === 0 ? REMOVE_MS : TABLE_PUSH_MS);
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
    // A click rather than a drag: a PDF opens. Other tiles have their zoom button for that.
    const clicked = drag && !drag.moved ? items.find((item) => item.id === drag.id) : null;
    if (clicked && isPdf(clicked.fileName)) void previewOpen(clicked.id);
    setDrag(null);
  };

  const rows = Math.ceil(items.length / GRID.columns);

  return (
    <main key={openCount} className={`panel${closing ? " panel--closing" : ""}${dropHover ? " panel--drop" : ""}`}>
      <header className="panel__header">
        <h1>
          <CatFace size={16} />
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
            const pushed = removing.get(item.id) ?? 0;
            return (
              <li
                key={item.id}
                className={[
                  "panel__slot",
                  dragged && "panel__slot--dragging",
                  removing.has(item.id) && "panel__slot--removing",
                  pushed !== 0 && "panel__slot--pushed",
                  pushed === 1 && "panel__slot--pushed-right",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ transform: `translate(${at.x}px, ${at.y}px)`, "--dir": pushed } as React.CSSProperties}
                onPointerDown={(e) => onTilePointerDown(e, item.id, index)}
                onPointerMove={onTilePointerMove}
                onPointerUp={onTilePointerUp}
                onPointerCancel={onTilePointerUp}
              >
                {/* Stagger the entrance a little; capped so long queues don't wait. */}
                <div
                  className={`panel__tile panel__tile--${item.kind}${isPdf(item.fileName) ? " panel__tile--pdf" : ""}`}
                  style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
                  title={item.filePath ?? item.sourceApp ?? undefined}
                >
                  {item.kind === "image" && (
                    <img src={queueImageUrl(item.id, item.revision)} alt="" draggable={false} />
                  )}
                  {item.kind === "text" && <span className="panel__text">{item.preview}</span>}
                  {item.kind === "file" && <FileCard item={item} />}
                  <span className="panel__index">{index + 1}</span>
                  <span className="panel__actions">
                    {/* Other files are the user's own; Catail has nothing to show in them. */}
                    {(item.kind !== "file" || isPdf(item.fileName)) && (
                      <button
                        type="button"
                        className="panel__tile-button"
                        title={t(item.kind === "file" ? "panel.pdf_preview" : "panel.zoom")}
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
                      onClick={() => remove(item.id, index)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </span>
                </div>
                {pushed !== 0 && <TableCat />}
              </li>
            );
          })}
        </ol>
      </div>

      {dropHover && <p className="panel__drop-hint">{t("panel.drop_hint")}</p>}

      {exporting.kind === "error" && <p className="panel__error">{exporting.message}</p>}

      <footer className="panel__footer">
        <button
          type="button"
          className={`panel__button panel__button--danger${clearing ? " panel__button--jumping" : ""}`}
          data-label={clearing ? undefined : t("panel.clear")}
          onClick={clearAll}
        >
          {clearing ? <TrashJump size={17} handoff /> : <TrashIcon size={17} />}
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
