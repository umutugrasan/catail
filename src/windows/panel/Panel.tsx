import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { t } from "../../lib/i18n";
import {
  onWindowEvent,
  PanelEvents,
  panelClose,
  panelPaste,
  queueClear,
  queueExport,
  queueImageUrl,
  queueItems,
  queueRemove,
  queueReorder,
  type ExportFormat,
  type QueueItemView,
} from "../../lib/ipc";
import { CloseIcon, TrashIcon } from "../overlay/icons";
import { moveItem, rowAt } from "./reorder";
import { renderTextPage } from "./textPage";

/** Row height plus gap; keep in sync with `.panel__row` in panel.css. */
const ROW_HEIGHT = 68;
/** Keep in sync with the exit animations in panel.css. */
const EXIT_MS = 160;
const REMOVE_MS = 200;

type Drag = { id: string; from: number; moved: boolean };
type Export = { kind: "idle" } | { kind: "menu" } | { kind: "busy" } | { kind: "error"; message: string };

export function Panel() {
  const [items, setItems] = useState<QueueItemView[]>([]);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Mirrors `drag` for the event listener, which must not replace the list mid-drag.
  const dragRef = useRef<Drag | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
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

  const onRowPointerDown = (e: ReactPointerEvent<HTMLLIElement>, id: string, index: number) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, from: index, moved: false });
  };

  const onRowPointerMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    const list = listRef.current;
    if (!drag || !list) return;
    const offset = e.clientY - list.getBoundingClientRect().top + list.scrollTop;
    const target = rowAt(offset, ROW_HEIGHT, items.length);
    const current = items.findIndex((item) => item.id === drag.id);
    if (target !== current && current >= 0) {
      setItems(moveItem(items, current, target));
      setDrag({ ...drag, moved: true });
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

      <ol className="panel__list" ref={listRef}>
        {items.map((item, index) => (
          <li
            key={item.id}
            className={[
              "panel__row",
              drag?.id === item.id && "panel__row--dragging",
              removing.has(item.id) && "panel__row--removing",
            ]
              .filter(Boolean)
              .join(" ")}
            // Stagger the entrance a little; capped so long queues don't wait.
            style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
            onPointerDown={(e) => onRowPointerDown(e, item.id, index)}
            onPointerMove={onRowPointerMove}
            onPointerUp={onRowPointerUp}
            onPointerCancel={onRowPointerUp}
          >
            <span className="panel__grip" aria-hidden="true">
              ⋮⋮
            </span>
            <span className="panel__index">{index + 1}</span>
            {item.kind === "image" ? (
              <img className="panel__thumb" src={queueImageUrl(item.id)} alt="" draggable={false} />
            ) : (
              <span className="panel__text">{item.preview}</span>
            )}
            <span className="panel__meta">
              {t(item.kind === "image" ? "panel.kind_image" : "panel.kind_text")}
              {item.sourceApp && ` · ${item.sourceApp}`}
            </span>
            <button
              type="button"
              className="panel__icon-button panel__remove"
              title={t("panel.remove")}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => remove(item.id)}
            >
              <TrashIcon size={15} />
            </button>
          </li>
        ))}
      </ol>

      {exporting.kind === "error" && <p className="panel__error">{exporting.message}</p>}

      <footer className="panel__footer">
        <button type="button" className="panel__button panel__button--danger" onClick={() => void queueClear()}>
          <TrashIcon />
          {t("panel.clear")}
        </button>

        <div className="panel__export">
          <button
            type="button"
            className="panel__button"
            disabled={exporting.kind === "busy"}
            onClick={() => setExporting(exporting.kind === "menu" ? { kind: "idle" } : { kind: "menu" })}
          >
            {exporting.kind === "busy" ? <span className="spinner" /> : t("panel.export")}
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

        <button
          type="button"
          className="panel__button panel__button--primary"
          title={t("panel.paste_title")}
          onClick={() => void panelPaste()}
        >
          {t("panel.paste")}
        </button>
      </footer>
    </main>
  );
}
