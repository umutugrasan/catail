// Dresses this window for the cat picked in Settings. CSS does the rest, from `data-cat`.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const STORAGE_KEY = "catail.cat";

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
}
