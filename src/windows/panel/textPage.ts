// Renders a text queue item as a page image for PDF export. The webview has the system fonts
// (Turkish glyphs included), which the Rust side doesn't.

/** A4 at 150 DPI. */
export const PAGE = { width: 1240, height: 1754, margin: 120 } as const;
const FONT_SIZE = 30;
const LINE_HEIGHT = 1.45;

/** Wraps `text` into lines no wider than `maxWidth`, keeping explicit line breaks. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      const next = line + word;
      if (measure(next) <= maxWidth || line === "") {
        // A single word wider than the page is broken by characters.
        if (measure(next) > maxWidth && line === "") {
          let chunk = "";
          for (const ch of word) {
            if (measure(chunk + ch) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = "";
            }
            chunk += ch;
          }
          line = chunk;
        } else {
          line = next;
        }
      } else {
        lines.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** One page tall, growing downward if the text needs more room. Returns base64 PNG. */
export async function renderTextPage(text: string): Promise<string> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${FONT_SIZE}px "Segoe UI", sans-serif`;
  ctx.font = font;
  const lines = wrapText(text, PAGE.width - PAGE.margin * 2, (s) => ctx.measureText(s).width);
  const lineHeight = FONT_SIZE * LINE_HEIGHT;

  canvas.width = PAGE.width;
  canvas.height = Math.max(PAGE.height, Math.ceil(PAGE.margin * 2 + lines.length * lineHeight));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1f1f1f";
  ctx.font = font;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, PAGE.margin, PAGE.margin + i * lineHeight));

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("cannot render text page");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
