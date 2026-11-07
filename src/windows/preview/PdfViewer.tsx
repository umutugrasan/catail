import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { CatEar, CatFace } from "../../lib/cats";
import { t } from "../../lib/i18n";
import { queuePdfUrl, type QueueItemView } from "../../lib/ipc";
import { CloseIcon, MinusIcon, PlusIcon } from "../overlay/icons";
import { FIT_WIDTH, pageAt, pageScale, zoomIn, zoomOut } from "./pdfView";

/** How far outside the view pages are kept drawn, so scrolling doesn't show blanks. */
const DRAW_MARGIN = "800px";
/** Room the scrolling area keeps around a page; keep in sync with `.preview__pdf-pages`. */
const AREA_PADDING = 40;

type Load =
  | { kind: "loading" }
  | { kind: "ready"; doc: PDFDocumentProxy; firstPageWidth: number; firstPageHeight: number }
  | { kind: "error"; message: string };

/** One page: a sized placeholder, drawn only while near the view. */
function PdfPage(props: { doc: PDFDocumentProxy; number: number; scale: number; estimate: { width: number; height: number } }) {
  const { doc, number, scale, estimate } = props;
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  // The real size once the page is known; pages of one PDF can differ.
  const [size, setSize] = useState(estimate);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    // The scrolling area as root: only then does the margin reach past its edges.
    const watcher = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: holder.closest(".preview__pdf-pages"),
      rootMargin: DRAW_MARGIN,
    });
    watcher.observe(holder);
    return () => watcher.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!near || !canvas) return;
    let task: RenderTask | null = null;
    let stopped = false;
    void doc.getPage(number).then((page) => {
      if (stopped) return;
      const base = page.getViewport({ scale: 1 });
      setSize({ width: base.width, height: base.height });
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * ratio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      // A newer zoom or scrolling away cancels this drawing; that's not a failure.
      task.promise.catch(() => undefined);
    });
    return () => {
      stopped = true;
      task?.cancel();
      // Pages far away give their memory back.
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [doc, near, number, scale]);

  return (
    <div
      ref={holderRef}
      className="preview__pdf-page"
      data-page={number}
      style={{ width: size.width * scale, height: size.height * scale }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

export function PdfViewer(props: { item: QueueItemView; closing: boolean; onClose: () => void }) {
  const { item, closing, onClose } = props;
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [zoom, setZoom] = useState(FIT_WIDTH);
  const [page, setPage] = useState(1);
  const [areaWidth, setAreaWidth] = useState(0);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    let destroy: (() => void) | null = null;
    void (async () => {
      try {
        // Loaded only when a PDF is opened: most previews are images and texts.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        // The whole file comes at once: the app's protocol has no partial requests.
        const task = pdfjs.getDocument({ url: queuePdfUrl(item.id), disableRange: true, disableStream: true });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        const first = (await doc.getPage(1)).getViewport({ scale: 1 });
        if (!stopped) {
          setLoad({ kind: "ready", doc, firstPageWidth: first.width, firstPageHeight: first.height });
        }
      } catch (error) {
        if (stopped) return;
        const locked = error instanceof Error && error.name === "PasswordException";
        setLoad({ kind: "error", message: t(locked ? "preview.pdf_password" : "preview.pdf_failed") });
      }
    })();
    return () => {
      stopped = true;
      destroy?.();
    };
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        setZoom(zoomIn);
      } else if (e.key === "-") {
        setZoom(zoomOut);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pages fit the width the scrolling area really has.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const watcher = new ResizeObserver(() => setAreaWidth(area.clientWidth - AREA_PADDING));
    watcher.observe(area);
    return () => watcher.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const pages = area.querySelectorAll<HTMLElement>("[data-page]");
    const tops = Array.from(pages, (element) => element.offsetTop);
    setPage(pageAt(tops, area.scrollTop, area.clientHeight));
  }, []);

  const ready = load.kind === "ready" ? load : null;
  const scale = ready ? pageScale(ready.firstPageWidth, areaWidth, zoom) : 1;

  return (
    <div
      className={`preview${closing ? " preview--closing" : ""}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="preview__pdf">
        <CatEar side="left" />
        <CatEar side="right" />
        <header className="preview__pdf-header">
          <CatFace size={20} />
          <span className="preview__pdf-name" title={item.filePath ?? undefined}>
            {item.fileName}
          </span>
          {ready && (
            <>
              <span className="preview__pdf-count">
                {page} / {ready.doc.numPages}
              </span>
              <span className="preview__pdf-zoom">
                <button
                  type="button"
                  className="preview__pdf-button"
                  title={t("preview.pdf_zoom_out")}
                  onClick={() => setZoom(zoomOut)}
                >
                  <MinusIcon />
                </button>
                <span className="preview__pdf-percent">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  className="preview__pdf-button"
                  title={t("preview.pdf_zoom_in")}
                  onClick={() => setZoom(zoomIn)}
                >
                  <PlusIcon />
                </button>
              </span>
            </>
          )}
        </header>

        <div ref={areaRef} className="preview__pdf-pages" onScroll={onScroll}>
          {load.kind === "loading" && <p className="preview__pdf-message">{t("preview.pdf_loading")}</p>}
          {load.kind === "error" && <p className="preview__error preview__error--large">{load.message}</p>}
          {ready &&
            areaWidth > 0 &&
            Array.from({ length: ready.doc.numPages }, (_, index) => (
              <PdfPage
                key={index}
                doc={ready.doc}
                number={index + 1}
                scale={scale}
                estimate={{ width: ready.firstPageWidth, height: ready.firstPageHeight }}
              />
            ))}
        </div>
      </div>

      <button type="button" className="preview__close" title={t("preview.close")} onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  );
}
