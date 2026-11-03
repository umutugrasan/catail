import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { t } from "../../lib/i18n";
import {
  onWindowEvent,
  PanelEvents,
  panelClose,
  panelPaste,
  queueClear,
  queueImageUrl,
  queueItems,
  queueRemove,
  queueReorder,
  type QueueItemView,
} from "../../lib/ipc";
import { moveItem, rowAt } from "./reorder";

/** Row height plus gap; keep in sync with `.panel__row` in panel.css. */
const ROW_HEIGHT = 68;

type Drag = { id: string; from: number; moved: boolean };

export function Panel() {
  const [items, setItems] = useState<QueueItemView[]>([]);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Mirrors `drag` for the event listener, which must not replace the list mid-drag.
  const dragRef = useRef<Drag | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };

  useEffect(() => {
    void queueItems().then(setItems);
    const unlisten = onWindowEvent<QueueItemView[]>(PanelEvents.update, (next) => {
      if (!dragRef.current) setItems(next);
    });
    return () => void unlisten.then((u) => u());
  }, []);

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
    <main className="panel">
      <header className="panel__header">
        <h1>{t("panel.title", { count: items.length })}</h1>
        <button
          type="button"
          className="panel__icon-button"
          title={t("panel.close")}
          onClick={() => void panelClose()}
        >
          <CloseIcon />
        </button>
      </header>

      <p className="panel__hint">{t("panel.hint")}</p>

      <ol className="panel__list" ref={listRef}>
        {items.map((item, index) => (
          <li
            key={item.id}
            className={`panel__row${drag?.id === item.id ? " panel__row--dragging" : ""}`}
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
              onClick={() => void queueRemove(item.id)}
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ol>

      <footer className="panel__footer">
        <button type="button" className="panel__button" onClick={() => void queueClear()}>
          {t("panel.clear")}
        </button>
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
