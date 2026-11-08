// Dresses this window for the cat picked in Settings. CSS does the rest, from `data-cat`.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { customArt, customTheme, tidyCustomCat, type CustomCat } from "./customCat";
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

let customColors: CustomCat | null = null;
let customPainted = "";
/** The settings window shows the custom cat's card even while another cat is worn. */
let alwaysPaintCustom = false;

/** "Kendi kedin": its theme now, and its pictures and cursors once they are painted. */
export function wearCustomCat(custom: CustomCat) {
  customColors = tidyCustomCat(custom);
  for (const [name, value] of Object.entries(customTheme(customColors))) {
    document.documentElement.style.setProperty(name, value);
  }
  void paintCustomCat();
}

async function paintCustomCat() {
  const colors = customColors;
  if (!colors || (!alwaysPaintCustom && document.documentElement.dataset.cat !== "custom")) return;
  const key = JSON.stringify(colors);
  if (key === customPainted) return;
  customPainted = key;
  const vars = await customArt(colors);
  // A newer pick may have arrived while these were painted.
  if (customPainted !== key) return;
  for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
}

function wear(cat: string) {
  document.documentElement.dataset.cat = cat;
  void paintCustomCat();
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

export async function initCat({ paintCustom = false } = {}): Promise<void> {
  alwaysPaintCustom = paintCustom;
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
  try {
    wearCustomCat(await invoke<CustomCat>("ui_custom_cat"));
  } catch {
    // Outside the app: the default colors.
  }
  void listen<CustomCat>("app:custom-cat", (event) => wearCustomCat(event.payload)).catch(() => undefined);
}

/** The plain theme has no cat, and some people asked their system for less motion. */
export const catsAround = () =>
  document.documentElement.dataset.cat !== "plain" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The theme this window wears (`data-cat`), kept up to date for components that draw each animal differently. */
export function useWornTheme(): string {
  const read = () => document.documentElement.dataset.cat ?? "orange";
  const [worn, setWorn] = useState(read);
  useEffect(() => {
    const watch = new MutationObserver(() => setWorn(read()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-cat"] });
    return () => watch.disconnect();
  }, []);
  return worn;
}
