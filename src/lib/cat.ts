// Dresses this window for the cat picked in Settings. CSS does the rest, from `data-cat`.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { plainVariables } from "./plainAccent";

const STORAGE_KEY = "catail.cat";
const ACCENT_KEY = "catail.plain-accent";

/** The plain theme's color, everywhere in this window. Only the plain theme reads it. */
export function wearPlainAccent(color: string) {
  for (const [name, value] of Object.entries(plainVariables(color))) {
    document.documentElement.style.setProperty(name, value);
  }
  try {
    localStorage.setItem(ACCENT_KEY, color);
  } catch {
    // Only a head start for the next window.
  }
}

function wear(cat: string) {
  document.documentElement.dataset.cat = cat;
  try {
    localStorage.setItem(STORAGE_KEY, cat);
  } catch {
    // Only a head start for the next window; the app has the real setting.
  }
}

// Before anything paints: the last cat, so a new window doesn't flash the default colors.
try {
  const last = localStorage.getItem(STORAGE_KEY);
  if (last) document.documentElement.dataset.cat = last;
  const accent = localStorage.getItem(ACCENT_KEY);
  if (accent) wearPlainAccent(accent);
} catch {
  // Storage is off; the app answers in a moment.
}

export async function initCat(): Promise<void> {
  try {
    wear(await invoke<string>("ui_cat"));
  } catch {
    // Outside the app (tests, plain browser): stay with the default cat.
  }
  void listen<string>("app:cat", (event) => wear(event.payload)).catch(() => undefined);
  try {
    wearPlainAccent(await invoke<string>("ui_plain_accent"));
  } catch {
    // Outside the app: the default color.
  }
  void listen<string>("app:plain-accent", (event) => wearPlainAccent(event.payload)).catch(() => undefined);
}

/** The plain theme has no cat, and some people asked their system for less motion. */
export const catsAround = () =>
  document.documentElement.dataset.cat !== "plain" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
