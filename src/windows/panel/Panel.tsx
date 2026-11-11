import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { catsAround } from "../../lib/cat";
import { CatFace, SNIFF_MS, SniffCat, TABLE_PUSH_MS, TableCat, TRASH_HANDOFF_MS, TrashJump } from "../../lib/cats";
import { t } from "../../lib/i18n";
import {
  badgeCatAway,
  onWindowEvent,
  PanelEvents,
  panelClose,
  panelOpened,
  panelPaste,
  panelPasteItems,
  previewOpen,
  queueClear,
  queueExport,
  queueImageUrl,
  queueItems,
  queueRemove,
  queueReorder,
  type ExportFormat,
  type PanelOpened,
  type QueueItemView,
} from "../../lib/ipc";
import { CheckIcon, CloseIcon, FileIcon, PasteIcon, SaveIcon, TrashIcon, ZoomIcon } from "../overlay/icons";
import { extensionLabel, formatSize, isPdf } from "./fileCard";
import { LIST } from "./layout";
import { cellAt, cellPosition, moveItem, type Grid } from "./reorder";
import { renderTextPage } from "./textPage";

/** Keep in sync with `.panel__tile` in panel.css and the sizes in panel.rs. */
const GRID: Grid = LIST ? { columns: 1, pitch: 74 } : { columns: 2, pitch: 78 };
/** Crossing from a tile to its bubble, the bubble waits this long for the pointer. */
const BUBBLE_LINGER_MS = 220;
const BUBBLE_OUT_MS = 140;
/** Keep in sync with the exit animations in panel.css. */
const EXIT_MS = 160;
const REMOVE_MS = 200;

/** `grab` is where in the tile the pointer took hold; `x`/`y` is the tile's spot while dragged. */
type Drag = { id: string; moved: boolean; grabX: number; grabY: number; x: number; y: number };
type Export = { kind: "idle" } | { kind: "menu" } | { kind: "busy" } | { kind: "error"; message: string };
/** The list layout's bubble: which tile it is for, and the middle of that tile in the window. */
type Bubble = { id: string; index: number; y: number; leaving: boolean };

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

/** The list layout's buttons for one tile, in a speech bubble beside it. */
function TileBubble(props: {
  bubble: Bubble;
  item: QueueItemView;
  picked: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPick: () => void;
  onRemove: () => void;
}) {
  const { bubble, item, picked } = props;
  // Other files are the user's own; Catail has nothing to show in them.
  const zoomable = item.kind !== "file" || isPdf(item.fileName);
  const order = (i: number) => ({ "--i": i }) as React.CSSProperties;
  return (
    <div
      className={`panel__bubble${bubble.leaving ? " panel__bubble--leaving" : ""}`}
      style={{ top: bubble.y }}
      onPointerEnter={props.onEnter}
      onPointerLeave={props.onLeave}
    >
      {/* Replayed for each tile, as the bubble slides over to it. */}
      <span key={item.id} className="panel__bubble-buttons">
        <button
          type="button"
          className={`panel__bubble-button${picked ? " panel__bubble-button--on" : ""}`}
          style={order(0)}
          title={t(picked ? "panel.unpick" : "panel.pick")}
          aria-pressed={picked}
          onClick={props.onPick}
        >
          <CheckIcon size={14} />
        </button>
        {zoomable && (
          <button
            type="button"
            className="panel__bubble-button"
            style={order(1)}
            title={t(item.kind === "file" ? "panel.pdf_preview" : "panel.zoom")}
            onClick={() => void previewOpen(item.id)}
          >
            <ZoomIcon />
          </button>
        )}
        <button
          type="button"
          className="panel__bubble-button panel__tile-button--danger"
          style={order(zoomable ? 2 : 1)}
          title={t("panel.remove")}
          onClick={props.onRemove}
        >
          <TrashIcon size={14} />
        </button>
      </span>
    </div>
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
  // Tiles picked with a click, for "Seçilenleri yapıştır".
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // A card that just joined while the panel is open, and the cat's verdict on it.
  const [sniffing, setSniffing] = useState<{ id: string; mood: "like" | "sneeze" } | null>(null);
  // What the panel has already shown, so only newcomers get sniffed.
  const knownIds = useRef<Set<string>>(new Set());
  const sniffTimer = useRef(0);
  // The list layout: the tile the pointer is on gets its buttons in a bubble beside it.
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const bubbleTimer = useRef(0);

  // "Rozet boyutu": the page is zoomed. Positions measured on it are window px; positions set
  // in CSS are zoomed px.
  const zoomRef = useRef(1);

  /** Grows out of the badge, wherever it sits, and is as big as the badge. */
  const dress = useCallback(({ corner, zoom }: PanelOpened) => {
    document.getElementById("root")!.dataset.corner = corner;
    zoomRef.current = zoom || 1;
    document.documentElement.style.zoom = String(zoomRef.current);
  }, []);

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

  /** The badge's cat comes over to sniff a card that has just arrived, if the panel is on show. */
  const sniffNewcomer = (next: QueueItemView[]) => {
    const fresh = next.filter((item) => !knownIds.current.has(item.id));
    knownIds.current = new Set(next.map((item) => item.id));
    const newcomer = fresh[fresh.length - 1];
    if (!newcomer || dragRef.current || document.visibilityState !== "visible" || !catsAround()) return;
    setSniffing({ id: newcomer.id, mood: newcomer.kind === "file" ? "sneeze" : "like" });
    void badgeCatAway(SNIFF_MS);
    window.clearTimeout(sniffTimer.current);
    sniffTimer.current = window.setTimeout(() => setSniffing(null), SNIFF_MS);
  };

  useEffect(() => {
    // The first open's event was sent before this page was listening.
    void panelOpened().then(dress);
    void queueItems().then((first) => {
      knownIds.current = new Set(first.map((item) => item.id));
      setItems(first);
    });
    const subscriptions = [
      onWindowEvent<QueueItemView[]>(PanelEvents.update, (next) => {
        sniffNewcomer(next);
        if (!dragRef.current) setItems(next);
        // Whatever left the queue can't stay picked.
        setSelected((current) => {
          const still = new Set(next.filter((item) => current.has(item.id)).map((item) => item.id));
          return still.size === current.size ? current : still;
        });
      }),
      onWindowEvent<PanelOpened>(PanelEvents.opened, (opened) => {
        dress(opened);
        setClosing(false);
        setRemoving(new Map());
        setExporting({ kind: "idle" });
        setSelected(new Set());
        setSniffing(null);
        setBubble(null);
        setOpenCount((n) => n + 1);
      }),
      onWindowEvent(PanelEvents.close, close),
      onWindowEvent<boolean>(PanelEvents.dropHover, setDropHover),
    ];
    return () => subscriptions.forEach((s) => void s.then((u) => u()));
  }, [close, dress]);

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
    const z = zoomRef.current;
    return { x: (clientX - r.left) / z, y: (clientY - r.top) / z + list.scrollTop };
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
    if (drag?.moved) {
      void queueReorder(items.map((item) => item.id));
      // It was for wherever the tile used to be.
      setBubble(null);
    }
    // A click rather than a drag picks the tile, or lets it go.
    if (drag && !drag.moved) toggle(drag.id);
    setDrag(null);
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const pasteSome = (ids: string[]) => {
    setSelected(new Set());
    void panelPasteItems(ids);
  };

  /** The pointer is on a tile: its bubble pops out beside it (or slides over from the last one). */
  const showBubble = (e: ReactPointerEvent<HTMLLIElement>, id: string, index: number) => {
    if (!LIST || dragRef.current || removing.has(id)) return;
    window.clearTimeout(bubbleTimer.current);
    const r = e.currentTarget.getBoundingClientRect();
    setBubble({ id, index, y: Math.round((r.top + r.height / 2) / zoomRef.current), leaving: false });
  };

  const keepBubble = () => window.clearTimeout(bubbleTimer.current);

  /** Gone a moment after the pointer leaves, so it can cross over to the bubble. */
  const dropBubble = (after = BUBBLE_LINGER_MS) => {
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => {
      setBubble((current) => current && { ...current, leaving: true });
      bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_OUT_MS);
    }, after);
  };

  // Its tile has gone, or is on its way out.
  const bubbleItem = bubble ? items.find((item) => item.id === bubble.id) : undefined;
  const bubbleShown = bubble && bubbleItem && !drag?.moved && !closing && !removing.has(bubble.id) ? bubble : null;

  const rows = Math.ceil(items.length / GRID.columns);

  return (
    <>
      <main
        key={openCount}
        className={`panel${LIST ? " panel--list" : ""}${closing ? " panel--closing" : ""}${dropHover ? " panel--drop" : ""}`}
      >
        <header className="panel__header">
          <h1>
            <CatFace size={16} />
            {!LIST && t("panel.title_short")}
            <span className="panel__count">{items.length}</span>
          </h1>
          <button type="button" className="panel__icon-button" title={t("panel.close")} onClick={close}>
            <CloseIcon />
          </button>
        </header>

        <div className="panel__list" ref={listRef} title={t("panel.hint")} onScroll={() => bubble && dropBubble(0)}>
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
                    selected.has(item.id) && "panel__slot--selected",
                    sniffing?.id === item.id && "panel__slot--sniffed",
                    sniffing?.id === item.id && index % GRID.columns === 1 && "panel__slot--sniffed-right",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ transform: `translate(${at.x}px, ${at.y}px)`, "--dir": pushed } as React.CSSProperties}
                  onPointerEnter={(e) => showBubble(e, item.id, index)}
                  onPointerLeave={() => LIST && dropBubble()}
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
                    <span className="panel__index">
                      {selected.has(item.id) ? <CheckIcon /> : index + 1}
                    </span>
                    {!LIST && (
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
                    )}
                  </div>
                  {pushed !== 0 && <TableCat />}
                  {pushed === 0 && sniffing?.id === item.id && <SniffCat mood={sniffing.mood} />}
                </li>
              );
            })}
          </ol>
        </div>

        {dropHover && <p className="panel__drop-hint">{t("panel.drop_hint")}</p>}

        {exporting.kind === "error" && <p className="panel__error">{exporting.message}</p>}

        {!LIST && selected.size > 0 && (
          <div className="panel__picked">
            <button
              type="button"
              className="panel__icon-button"
              title={t("panel.clear_selection")}
              onClick={() => setSelected(new Set())}
            >
              <CloseIcon />
            </button>
            <span className="panel__picked-count">{t("panel.selected", { count: selected.size })}</span>
            <button
              type="button"
              className="panel__picked-paste"
              title={t("panel.paste_selected")}
              onClick={() => pasteSome(items.filter((item) => selected.has(item.id)).map((item) => item.id))}
            >
              <PasteIcon />
              {t("panel.paste_selected_short")}
            </button>
          </div>
        )}

        {LIST && selected.size > 0 ? (
          // Too narrow for both rows: while tiles are picked, the footer is about them.
          <footer key="picked" className="panel__footer panel__footer--picked">
            <button
              type="button"
              className="panel__button"
              data-label={t("panel.clear_selection")}
              onClick={() => setSelected(new Set())}
            >
              <CloseIcon />
            </button>
            <button
              type="button"
              className="panel__button panel__button--primary"
              data-label={t("panel.paste_selected")}
              onClick={() => pasteSome(items.filter((item) => selected.has(item.id)).map((item) => item.id))}
            >
              <PasteIcon />
              <span className="panel__picked-number">{selected.size}</span>
            </button>
          </footer>
        ) : (
          <footer key="all" className="panel__footer">
            <button
              type="button"
              className={`panel__button panel__button--danger${clearing ? " panel__button--jumping" : ""}`}
              data-label={clearing ? undefined : t("panel.clear")}
              onClick={clearAll}
            >
              {clearing ? <TrashJump size={LIST ? 15 : 17} handoff /> : <TrashIcon size={LIST ? 15 : 17} />}
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
        )}
      </main>

      {bubbleShown && bubbleItem && (
        <TileBubble
          bubble={bubbleShown}
          item={bubbleItem}
          picked={selected.has(bubbleItem.id)}
          onEnter={keepBubble}
          onLeave={() => dropBubble()}
          onPick={() => toggle(bubbleItem.id)}
          onRemove={() => {
            setBubble(null);
            remove(bubbleItem.id, bubbleShown.index);
          }}
        />
      )}
    </>
  );
}
