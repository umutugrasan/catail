// UI strings: one JSON file per language in src/locales. Turkish is the source; a language
// that lacks a string falls back to English, then Turkish. The Rust side (i18n.rs) reads the
// same files and decides which language is in use.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Dict = { [key: string]: string | Dict };

const files = import.meta.glob<Dict>("../locales/*.json", { eager: true, import: "default" });
const locales: Record<string, Dict> = Object.fromEntries(
  Object.entries(files).map(([path, dict]) => [path.replace(/^.*\/(.+)\.json$/, "$1"), dict]),
);

/** Interface languages, each named in itself. Keep in step with `LOCALES` in i18n.rs. */
export const LANGUAGES: [code: string, name: string][] = [
  ["tr", "Türkçe"],
  ["en", "English"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["es", "Español"],
  ["it", "Italiano"],
  ["pt", "Português"],
  ["nl", "Nederlands"],
  ["pl", "Polski"],
  ["ru", "Русский"],
  ["uk", "Українська"],
  ["ar", "العربية"],
  ["ja", "日本語"],
  ["zh-CN", "简体中文"],
  ["ko", "한국어"],
  ["id", "Bahasa Indonesia"],
];

const FALLBACKS = ["en", "tr"];
let current = "tr";

/** The interface language in use, e.g. "en". */
export const uiLanguage = () => current;

/**
 * Asks the app which language to use; call before the first render. When the language is
 * changed in the settings, the window reloads itself in the new one.
 */
export async function initI18n(): Promise<void> {
  try {
    const code = await invoke<string>("ui_language");
    if (code in locales) current = code;
  } catch {
    // Outside the app (tests, plain browser): stay with Turkish.
  }
  document.documentElement.lang = current;
  void listen("app:language", () => window.location.reload()).catch(() => undefined);
}

const find = (dict: Dict | undefined, key: string) =>
  key
    .split(".")
    .reduce<string | Dict | undefined>((node, part) => (typeof node === "object" ? node[part] : undefined), dict);

/** Looks up a dotted key such as `overlay.copy`; falls back to the key itself. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  let value: string | Dict | undefined;
  for (const code of [current, ...FALLBACKS]) {
    value = find(locales[code], key);
    if (typeof value === "string") break;
  }
  if (typeof value !== "string") return key;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** A language's name in the interface language, e.g. "de" → "Almanca" in Turkish. */
export function languageName(code: string, locale = current): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language", fallback: "code" }).of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    // Unknown code: show it as it is.
  }
  return code;
}

/** Every locale file, for the consistency test. */
export const allLocales = () => locales;
