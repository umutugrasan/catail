import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
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
import { moveItem, rowAt } from "./reorder";
import { renderTextPage } from "./textPage";

/** Row height plus gap; keep in sync with `.panel__row` in panel.css. */
const ROW_HEIGHT = 54;
/** Keep in sync with the exit animations in panel.css. */
const EXIT_MS = 160;
const REMOVE_MS = 200;

/** `grab` is where in the row the pointer took hold; `y` is the row's top while dragged. */
type Drag = { id: string; from: number; moved: boolean; grab: number; y: number };
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

  const remove = (id: string) => {
    // Let the row collapse before it disappears from the list.
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

  /** Pointer Y inside the list's scrolled content. */
  const listY = (clientY: number) => {
    const list = listRef.current;
    return list ? clientY - list.getBoundingClientRect().top + list.scrollTop : 0;
  };

  const onRowPointerDown = (e: ReactPointerEvent<HTMLLIElement>, id: string, index: number) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const y = index * ROW_HEIGHT;
    setDrag({ id, from: index, moved: false, grab: listY(e.clientY) - y, y });
  };

  // The dragged row follows the pointer; the others slide aside as its slot changes.
  const onRowPointerMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (!drag) return;
    const maxY = (items.length - 1) * ROW_HEIGHT;
    const y = Math.min(Math.max(listY(e.clientY) - drag.grab, 0), maxY);
    const target = rowAt(y + ROW_HEIGHT / 2, ROW_HEIGHT, items.length);
    const current = items.findIndex((item) => item.id === drag.id);
    if (target !== current && current >= 0) {
      setItems(moveItem(items, current, target));
      setDrag({ ...drag, moved: true, y });
    } else {
      setDrag({ ...drag, y, moved: drag.moved || Math.abs(y - drag.from * ROW_HEIGHT) > 3 });
    }
  };

  const onRowPointerUp = () => {
    if (drag?.moved) void queueReorder(items.map((item) => item.id));
    setDrag(null);
  };

  return (
    <main key={openCount} className={`panel${closing ? " panel--closing" : ""}`}>
      <header className="panel__header">
        <h1>{t("panel.title", { count: items.length })}</h1>
        <button type="button" className="panel__icon-button" title={t("panel.close")} onClick={close}>
          <CloseIcon />
        </button>
      </header>

      <p className="panel__hint">{t("panel.hint")}</p>

      <div className="panel__list" ref={listRef}>
        <ol className="panel__track" style={{ height: items.length * ROW_HEIGHT }}>
        {items.map((item, index) => (
          <li
            key={item.id}
            className={[
              "panel__slot",
              drag?.id === item.id && "panel__slot--dragging",
              removing.has(item.id) && "panel__slot--removing",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ transform: `translateY(${drag?.id === item.id ? drag.y : index * ROW_HEIGHT}px)` }}
            onPointerDown={(e) => onRowPointerDown(e, item.id, index)}
            onPointerMove={onRowPointerMove}
            onPointerUp={onRowPointerUp}
            onPointerCancel={onRowPointerUp}
            title={item.sourceApp ?? undefined}
          >
            {/* Stagger the entrance a little; capped so long queues don't wait. */}
            <div className="panel__row" style={{ animationDelay: `${Math.min(index, 8) * 32}ms` }}>
            <span className="panel__grip" aria-hidden="true">
              ⋮⋮
            </span>
            <span className="panel__index">{index + 1}</span>
            {item.kind === "image" ? (
              <img className="panel__thumb" src={queueImageUrl(item.id)} alt="" draggable={false} />
            ) : (
              <span className="panel__text">{item.preview}</span>
            )}
            <span className="panel__actions">
              {item.kind === "image" && (
                <button
                  type="button"
                  className="panel__icon-button panel__zoom"
                  title={t("panel.zoom")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => void previewOpen(item.id)}
                >
                  <ZoomIcon />
                </button>
              )}
              <button
                type="button"
                className="panel__icon-button panel__remove"
                title={t("panel.remove")}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => remove(item.id)}
              >
                <TrashIcon size={15} />
              </button>
            </span>
            </div>
          </li>
        ))}
        </ol>
      </div>

      {exporting.kind === "error" && <p className="panel__error">{exporting.message}</p>}

      <footer className="panel__footer">
        <button
          type="button"
          className="panel__button panel__button--danger"
          data-label={t("panel.clear")}
          onClick={() => void queueClear()}
        >
          <TrashIcon size={18} />
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
                <span>{t("panel.export_zip")}</span>
              </button>
              <button type="button" onClick={() => void exportAs("pdf")}>
                <strong>PDF</strong>
                <span>{t("panel.export_pdf")}</span>
              </button>
            </div>
          )}
        </div>

        <span className="panel__spacer" />

        <button
          type="button"
          className="panel__button panel__button--primary"
          data-label={t("panel.paste_title")}
          onClick={() => void panelPaste()}
        >
          <PasteIcon />
        </button>
      </footer>
    </main>
  );
}
