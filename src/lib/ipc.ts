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
export const captureCopy = (rect: ImageRect) => invoke<void>("capture_copy", { rect });
/** Starts the queue with the selection, or appends to it. */
export const captureEnqueue = (rect: ImageRect) => invoke<void>("capture_enqueue", { rect });
export const queueClear = () => invoke<void>("queue_clear");
/** Turning it on also closes the overlay. */
export const textModeSet = (enabled: boolean) => invoke<void>("text_mode_set", { enabled });
export const captureSave = (rect: ImageRect) => invoke<void>("capture_save", { rect });
export const badgeState = () => invoke<BadgeState>("badge_state");

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
