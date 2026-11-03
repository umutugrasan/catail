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
}

export interface QueueItemView {
  id: string;
  kind: "image" | "text";
  /** Start of the text, for text items. */
  preview: string | null;
  sourceApp: string | null;
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
}

export interface UpdateInfo {
  version: string;
  notes: string | null;
}

export interface BadgeState {
  count: number;
  textMode: boolean;
  pasting: boolean;
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
export const queueClear = () => invoke<void>("queue_clear");
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
export const queueImageUrl = (id: string) => convertFileSrc(`${id}.png`, "queue");

export const settingsGet = () => invoke<{ settings: Settings; version: string }>("settings_get");
/** Rejects with a readable message (e.g. a shortcut another app holds); nothing changes then. */
export const settingsSave = (settings: Settings) => invoke<void>("settings_save", { settings });
/** Resolves to the readable shortcut, or rejects with why it can't be used. */
export const hotkeyCheck = (accelerator: string) => invoke<string>("hotkey_check", { accelerator });
export const hotkeysSuspend = () => invoke<void>("hotkeys_suspend");
export const hotkeysResume = () => invoke<void>("hotkeys_resume");
export const updateCheck = () => invoke<UpdateInfo | null>("update_check");
/** Downloads, installs and restarts the app. */
export const updateInstall = () => invoke<void>("update_install");

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
} as const;

export const PanelEvents = {
  update: "panel:update",
} as const;
