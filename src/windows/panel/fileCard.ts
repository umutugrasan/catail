// What a file's card in the panel shows.

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** "812 B", "1.5 MB": whole bytes, then at most one decimal, written the locale's way. */
export function formatSize(bytes: number, locale?: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
  return `${number} ${UNITS[unit]}`;
}

/** The longest extension that still fits on the icon. */
const MAX_LABEL = 4;

/** "PDF" for "rapor.pdf". Empty when there's no extension to show. */
export function extensionLabel(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return "";
  const extension = fileName.slice(dot + 1).toLocaleUpperCase("en");
  return extension.length > MAX_LABEL ? "" : extension;
}

/** Whether the preview window can show this file. */
export function isPdf(fileName: string | null): boolean {
  return fileName?.toLowerCase().endsWith(".pdf") ?? false;
}
