// Thin wrappers around Tauri commands and window events.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Frame info for this overlay; sizes are physical pixels. */
export interface OverlayInfo {
  session: number;
  index: number;
  width: number;
  height: number;
  /** Items already queued; decides between "create queue" and "add to queue". */
  queueCount: number;
  /** Every Ctrl+C goes into the queue while on. */
  textMode: boolean;
  /** Where queued captures fly to (the badge), physical px relative to this monitor. */
  flyX: number | null;
  flyY: number | null;
}

export interface QueueItemView {
  id: string;
  kind: "image" | "text";
  /** Start of the text, for text items. */
  preview: string | null;
  /** Whole text, for exporting. */
  fullText: string | null;
  sourceApp: string | null;
  /** Goes up with every edit. */
  revision: number;
}

/** Mirrors `settings.rs` (snake_case on purpose: passed through unchanged). */
export interface HotkeyMap {
  region: string;
  fullscreen: string;
  paste: string;
  clear: string;
  undo: string;
}

export type PasteMode = "auto" | "batch" | "sequential";

export interface AppPasteRule {
  process: string;
  mode: PasteMode;
  delay_ms: number | null;
}

export interface Settings {
  hotkeys: HotkeyMap;
  paste_mode: PasteMode;
  sequential_delay_ms: number;
  batch_restore_delay_ms: number;
  text_separator: string;
  send_enter_between_texts: boolean;
  clear_queue_after_paste: boolean;
  autostart: boolean;
  app_rules: AppPasteRule[];
  /** Interface language; null follows Windows. */
  language: string | null;
  /** Language "Çevir" translates into. */
  translate_to: string;
  badge_corner: BadgeCorner;
}

export type BadgeCorner = "bottom-right" | "bottom-center" | "bottom-left" | "top-right" | "top-center" | "top-left";
export const BADGE_CORNERS: BadgeCorner[] = [
  "bottom-right",
  "bottom-center",
  "bottom-left",
  "top-right",
  "top-center",
  "top-left",
];

export interface Translation {
  text: string;
  /** Detected source language, e.g. "en". */
  source: string;
  target: string;
}

export interface UpdateInfo {
  version: string;
  notes: string | null;
}

export interface UndoView {
  kind: "paste" | "clear";
  count: number;
  /** For the countdown bar. */
  remainingMs: number;
  totalMs: number;
}

export interface BadgeState {
  count: number;
  textMode: boolean;
  pasting: boolean;
  /** "Geri al" after a paste or clear, while it lasts. */
  undo: UndoView | null;
  corner: BadgeCorner;
}

/** Where the panel's bin is, seen from the badge window (logical px): where the cat starts. */
export interface LeapStart {
  x: number;
  y: number;
}

/** Selection in physical pixels relative to the monitor's top-left corner. */
export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const overlaySession = () => invoke<OverlayInfo | null>("overlay_session");
export const overlayReady = () => invoke<void>("overlay_ready");
export const overlaySelectionStarted = () => invoke<void>("overlay_selection_started");
export const overlayCancel = () => invoke<void>("overlay_cancel");
/** What to do with a capture: copy it, add it to the queue (starting one if needed), or save it. */
export type Delivery = "copy" | "enqueue" | "save";

/** Selection without drawings; Rust crops the frozen frame pixel for pixel. */
export const captureDeliver = (rect: ImageRect, action: Delivery) =>
  invoke<void>("capture_deliver", { rect, action });
/** Selection with drawings, already composed into a PNG; sent as a raw body. */
export const captureDeliverAnnotated = (png: Uint8Array, action: Delivery) =>
  invoke<void>("capture_deliver_annotated", png, { headers: { "x-action": action } });
/** `leap`: cleared with the panel's bin, so the badge plays the cat's jump into its box. */
export const queueClear = (leap = false) => invoke<void>("queue_clear", { leap });
/** Turning it on also closes the overlay. */
export const textModeSet = (enabled: boolean) => invoke<void>("text_mode_set", { enabled });
export const badgeState = () => invoke<BadgeState>("badge_state");

export const panelToggle = () => invoke<void>("panel_toggle");
export const panelClose = () => invoke<void>("panel_close");
/** Pastes the queue into the app that was in front (the panel never takes focus). */
export const panelPaste = () => invoke<void>("panel_paste");
export const queueItems = () => invoke<QueueItemView[]>("queue_items");
export const queueRemove = (id: string) => invoke<void>("queue_remove", { id });
export const queueReorder = (ids: string[]) => invoke<void>("queue_reorder", { ids });
/** Brings back what the last paste or clear removed. */
export const queueRestore = () => invoke<void>("queue_restore");
/** The revision makes an edited image a new address, so it isn't shown from the old one. */
export const queueImageUrl = (id: string, revision: number) => `${convertFileSrc(`${id}.png`, "queue")}?v=${revision}`;
/** Saves an edited image over its queue item; the PNG goes as a raw body. */
export const queueEditImage = (id: string, png: Uint8Array) =>
  invoke<void>("queue_edit_image", png, { headers: { "x-id": id } });
export const queueEditText = (id: string, text: string) => invoke<void>("queue_edit_text", { id, text });
/** Shows a queued item large, over the whole screen, ready to edit. */
export const previewOpen = (id: string) => invoke<void>("preview_open", { id });
export const previewClose = () => invoke<void>("preview_close");
/** The image to show, for a preview window that has only just loaded. */
export const previewCurrent = () => invoke<string | null>("preview_current");

export const settingsGet = () =>
  invoke<{ settings: Settings; version: string; system_language: string }>("settings_get");
/** Rejects with a readable message (e.g. a shortcut another app holds); nothing changes then. */
export const settingsSave = (settings: Settings) => invoke<void>("settings_save", { settings });
/** Resolves to the readable shortcut, or rejects with why it can't be used. */
export const hotkeyCheck = (accelerator: string) => invoke<string>("hotkey_check", { accelerator });
export const hotkeysSuspend = () => invoke<void>("hotkeys_suspend");
export const hotkeysResume = () => invoke<void>("hotkeys_resume");
export const updateCheck = () => invoke<UpdateInfo | null>("update_check");
/** Downloads, installs and restarts the app. */
export const updateInstall = () => invoke<void>("update_install");

/** Recognizes text in the selection (offline, Windows OCR). */
export const captureOcr = (rect: ImageRect) => invoke<string>("capture_ocr", { rect });
/** Translates into `target` (a Google language code); the source language is detected. */
export const translateText = (text: string, target: string) =>
  invoke<Translation>("translate_text", { text, target });
/** A QR code found on the frozen frame; the box is in frame pixels. */
export interface QrCode {
  text: string;
  /** Set when the code holds a web address that may be opened (http or https only). */
  url: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every QR code on this overlay's frame. */
export const captureQr = () => invoke<QrCode[]>("capture_qr");
/** Opens a QR code's link in the browser and closes the overlays. */
export const openLink = (url: string) => invoke<void>("open_link", { url });
export const clipboardWriteText = (text: string) => invoke<void>("clipboard_write_text", { text });
export const queueAddText = (text: string) => invoke<void>("queue_add_text", { text });

export type ExportFormat = "zip" | "pdf";
/** Resolves to the saved path, or null if the dialog was cancelled. */
export const queueExport = (format: ExportFormat, textPages: Record<string, string>) =>
  invoke<string | null>("queue_export", { format, textPages });

/** URL of the frozen frame served by the Rust `capture` protocol. */
export const frameUrl = (info: OverlayInfo) =>
  convertFileSrc(`${info.session}-${info.index}.png`, "capture");

/** Listens for an event targeted at this window only. */
export const onWindowEvent = <T = unknown>(
  name: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> => getCurrentWebviewWindow().listen<T>(name, (e) => handler(e.payload));

export const OverlayEvents = {
  refresh: "overlay:refresh",
  clearSelection: "overlay:clear-selection",
  reset: "overlay:reset",
} as const;

export const BadgeEvents = {
  update: "badge:update",
  /** The panel's bin was clicked; a cat leaps from there into the box. */
  leap: "badge:leap",
} as const;

export const PreviewEvents = {
  show: "preview:show",
} as const;

export const SettingsEvents = {
  /** A Windows-key shortcut caught by the keyboard hook while recording. */
  hotkeyRecorded: "settings:hotkey-recorded",
} as const;

export const PanelEvents = {
  update: "panel:update",
  opened: "panel:opened",
  close: "panel:close",
} as const;
