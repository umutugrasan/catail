// QR codes on the frozen frame, shown like a phone camera does: a frame around each code and,
// beside it, its link to open (or its text to copy).
import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { clipboardWriteText, openLink, type QrCode } from "../../lib/ipc";
import { chipPosition, type Point, type Rect } from "./geometry";
import { CopyIcon } from "./icons";

/** Host in bold, the rest muted, so a look-alike address is easy to spot. */
function splitUrl(url: string): { host: string; rest: string } {
  try {
    const u = new URL(url);
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`;
    return { host: u.host, rest };
  } catch {
    return { host: url, rest: "" };
  }
}

export function QrLinks({ codes, scale }: { codes: QrCode[]; scale: number }) {
  return (
    <>
      {codes.map((code, i) => (
        <QrLink
          key={`${code.x}-${code.y}-${i}`}
          code={code}
          box={{ x: code.x / scale, y: code.y / scale, width: code.width / scale, height: code.height / scale }}
          order={i}
        />
      ))}
    </>
  );
}

function QrLink({ code, box, order }: { code: QrCode; box: Rect; order: number }) {
  const chipRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<Point | null>(null);
  const [copied, setCopied] = useState(false);
  useLayoutEffect(() => {
    const el = chipRef.current;
    if (!el) return;
    const view = { width: window.innerWidth, height: window.innerHeight };
    setAt(chipPosition(box, { width: el.offsetWidth, height: el.offsetHeight }, view));
  }, [box.x, box.y, box.width, box.height]);

  const copy = async () => {
    await clipboardWriteText(code.url ?? code.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const delay = { animationDelay: `${order * 70}ms` };
  const side = at && at.x < box.x ? "left" : "right";

  return (
    <>
      <div
        className="qr__frame"
        style={{ left: box.x - 4, top: box.y - 4, width: box.width + 8, height: box.height + 8, ...delay }}
      >
        <span className="qr__corner qr__corner--tl" />
        <span className="qr__corner qr__corner--tr" />
        <span className="qr__corner qr__corner--br" />
        <span className="qr__corner qr__corner--bl" />
      </div>
      <div
        ref={chipRef}
        className={`qr__chip qr__chip--${side}${at ? " qr__chip--placed" : ""}`}
        style={{ left: at?.x ?? 0, top: at?.y ?? 0, ...delay }}
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        {code.url ? (
          <button
            type="button"
            className="qr__open"
            title={t("overlay.qr_open", { url: code.url })}
            onClick={() => void openLink(code.url!)}
          >
            <LinkIcon />
            <span className="qr__url">
              <strong>{splitUrl(code.url).host}</strong>
              <span>{splitUrl(code.url).rest}</span>
            </span>
            <ArrowIcon />
          </button>
        ) : (
          <span className="qr__text" title={code.text}>
            <QrIcon />
            <span>{code.text}</span>
          </span>
        )}
        <button
          type="button"
          className={`qr__copy${copied ? " qr__copy--done" : ""}`}
          data-label={copied ? t("overlay.qr_copied") : t(code.url ? "overlay.qr_copy_link" : "overlay.qr_copy_text")}
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </>
  );
}

function Svg({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const LinkIcon = () => (
  <Svg>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </Svg>
);

const ArrowIcon = () => (
  <Svg size={14}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Svg>
);

const CheckIcon = () => (
  <Svg>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

const QrIcon = () => (
  <Svg>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2" />
  </Svg>
);
