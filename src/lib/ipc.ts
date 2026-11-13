// Thin wrappers around Tauri commands and window events.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { CustomCat } from "./customCat";
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
  kind: "image" | "text" | "file";
  /** Start of the text, for text items. */
  preview: string | null;
  /** Whole text, for exporting. */
  fullText: string | null;
  /** For file items. */
  fileName: string | null;
  filePath: string | null;
  fileSize: number | null;
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
  /** The badge's size, in percent of its usual size (BADGE_SIZES). */
  badge_size: number;
  panel_layout: PanelLayout;
  /** Which cat the app looks like; the theme follows it. */
  cat: Cat;
  /** The plain theme's color, "#rrggbb". */
  plain_accent: string;
  /** "Kendi kedin": its colors. */
  custom_cat: CustomCat;
}

export type Cat = "orange" | "gray" | "white" | "calico" | "black" | "custom" | "turtle" | "monkey" | "frog" | "capybara" | "plain";
export const CATS: Cat[] = [
  "orange",
  "gray",
  "white",
  "calico",
  "black",
  "custom",
  "turtle",
  "monkey",
  "frog",
  "capybara",
  "plain",
];

/** Which animal a theme shows; the plain theme has none. The cat comes first, by default. */
export type Animal = "cat" | "turtle" | "monkey" | "frog" | "capybara";
export const ANIMALS: Animal[] = ["cat", "turtle", "monkey", "frog", "capybara"];
export const ANIMAL_THEMES: Record<Animal, Cat[]> = {
  cat: ["orange", "gray", "white", "calico", "black", "custom"],
  turtle: ["turtle"],
  monkey: ["monkey"],
  frog: ["frog"],
  capybara: ["capybara"],
};
export const animalOf = (cat: Cat): Animal | null =>
  cat === "plain" ? null : (ANIMALS.find((animal) => ANIMAL_THEMES[animal].includes(cat)) ?? "cat");
/** Takes effect right away, in every window. */
export const catSet = (cat: Cat) => invoke<void>("cat_set", { cat });
/** The plain theme's color; also takes effect right away, in every window. */
export const plainAccentSet = (color: string) => invoke<void>("plain_accent_set", { color });
/** "Kendi kedin": its colors; also takes effect right away, in every window. */
export const customCatSet = (custom: CustomCat) => invoke<void>("custom_cat_set", { custom });

/** The panel's two columns of tiles, or one column with the buttons in bubbles beside it. */
export type PanelLayout = "grid" | "list";
export const PANEL_LAYOUTS: PanelLayout[] = ["grid", "list"];

/** How much smaller or bigger the badge can be made, in percent (settings.rs). */
export const BADGE_SIZES = { min: 70, max: 160, step: 5 } as const;

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
  /** The badge's size: its page is zoomed by this. */
  zoom: number;
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
/** Where the pointer is, in px from the badge window's corner. */
export const badgeCursor = () => invoke<[number, number] | null>("badge_cursor");
/** The badge's cat stops its walk on the spot: it's wanted somewhere else. */
export const badgeStrollStop = () => invoke<void>("badge_stroll_stop");
/** How the panel looks (its corner and size), for a panel that has only just loaded. */
export interface PanelOpened {
  corner: string;
  zoom: number;
}
export const panelOpened = () => invoke<PanelOpened>("panel_opened");
/** Where the badge is in its window (px): only there does the window take the mouse. */
export const badgeHitArea = (x: number, y: number, width: number, height: number) =>
  invoke<void>("badge_hit_area", { x, y, width, height });
/** A cat is needed in the panel: the one on the badge goes there for this long. */
export const badgeCatAway = (ms: number) => invoke<void>("badge_cat_away", { ms });
/** The cat goes for a walk along the taskbar from its seat (`x`, `bottom`: px in the badge). */
export const badgeStroll = (kind: Outing, x: number, bottom: number, fat: number) =>
  invoke<boolean>("badge_stroll", { kind, x, bottom, fat });
/** Something came up: the walking cat runs home. */
export const badgeStrollHurry = () => invoke<void>("badge_stroll_hurry");
/** The walking cat is back on its seat. */
export const strollDone = () => invoke<void>("stroll_done");

export const panelToggle = () => invoke<void>("panel_toggle");
export const panelClose = () => invoke<void>("panel_close");
/** Pastes the queue into the app that was in front (the panel never takes focus). */
export const panelPaste = () => invoke<void>("panel_paste");
/** Pastes only these items, in queue order; the rest stays queued. */
export const panelPasteItems = (ids: string[]) => invoke<void>("panel_paste_items", { ids });
export const queueItems = () => invoke<QueueItemView[]>("queue_items");
export const queueRemove = (id: string) => invoke<void>("queue_remove", { id });
export const queueReorder = (ids: string[]) => invoke<void>("queue_reorder", { ids });
/** Brings back what the last paste or clear removed. */
export const queueRestore = () => invoke<void>("queue_restore");
/** The ✕ on "Geri al": gives up on bringing anything back. */
export const undoDismiss = () => invoke<void>("undo_dismiss");
/** The revision makes an edited image a new address, so it isn't shown from the old one. */
export const queueImageUrl = (id: string, revision: number) => `${convertFileSrc(`${id}.png`, "queue")}?v=${revision}`;
/** A queued PDF file, for the preview window. */
export const queuePdfUrl = (id: string) => convertFileSrc(`${id}.pdf`, "queue");
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
  /** "Geri al" brought this many items back; a cat carries them from the box to the badge. */
  fetch: "badge:fetch",
  /** The badge's cat is wanted in the panel for this many ms. */
  catAway: "badge:cat-away",
  /** Files are being dragged over the badge (true) or have left it (false). */
  dropHover: "badge:drop-hover",
  /** The queue is being saved (true) or the save is over (false). */
  packing: "badge:packing",
  /** The cat is back from its walk along the taskbar. */
  strollBack: "badge:stroll-back",
} as const;

export const StrollEvents = {
  /** Off for a walk: a `StrollStart`. */
  start: "stroll:start",
  /** Run home. */
  hurry: "stroll:hurry",
  /** Over on the spot: the strip is already out of view. */
  stop: "stroll:stop",
} as const;

/**
 * What the badge's cat goes down to the taskbar for: a "walk", a mad dash ("zoomies"), a red
 * dot to hunt ("laser"), a "mouse" come in from off the screen, and another cat come to visit,
 * to fight with ("rival") or to say hello to ("friend"). The monkey's own: a leap from the
 * taskbar up to the top of the screen, to hang there and swing ("climb"). The frog's: big hops
 * along the taskbar ("hops"), and a fly to catch with its tongue ("flyhunt"). The capybara's: a
 * bird that comes and rides on its head ("birdie").
 */
export type Outing =
  | "walk"
  | "zoomies"
  | "laser"
  | "mouse"
  | "rival"
  | "friend"
  | "climb"
  | "hops"
  | "flyhunt"
  | "birdie";

/** Where a walk starts, in the strip's px (stroll.rs). */
export interface StrollStart {
  kind: Outing;
  home: number;
  seat: number;
  width: number;
  /** The strip's height: the whole screen's for a "climb". */
  height: number;
  fat: number;
  /** The badge's size: the cat out walking is as big as the one on it. */
  zoom: number;
}

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
  /** Files are being dragged over the panel (true) or have left it (false). */
  dropHover: "panel:drop-hover",
} as const;
