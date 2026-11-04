// Languages Google Translate can translate into (its own codes). Names come from the
// browser's Intl data in the interface language, so no list of names is kept here.
import { languageName, uiLanguage } from "./i18n";

export const TRANSLATE_LANGUAGES = [
  "af", "ak", "am", "ar", "as", "ay", "az", "be", "bg", "bho", "bm", "bn", "bs", "ca", "ceb",
  "ckb", "co", "cs", "cy", "da", "de", "doi", "dv", "ee", "el", "en", "eo", "es", "et", "eu",
  "fa", "fi", "fr", "fy", "ga", "gd", "gl", "gn", "gom", "gu", "ha", "haw", "he", "hi", "hmn",
  "hr", "ht", "hu", "hy", "id", "ig", "ilo", "is", "it", "ja", "jv", "ka", "kk", "km", "kn",
  "ko", "kri", "ku", "ky", "la", "lb", "lg", "ln", "lo", "lt", "lus", "lv", "mai", "mg", "mi",
  "mk", "ml", "mn", "mni-Mtei", "mr", "ms", "mt", "my", "ne", "nl", "no", "nso", "ny", "om",
  "or", "pa", "pl", "ps", "pt", "qu", "ro", "ru", "rw", "sa", "sd", "si", "sk", "sl", "sm",
  "sn", "so", "sq", "sr", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "ti", "tk", "tl",
  "tr", "ts", "tt", "ug", "uk", "ur", "uz", "vi", "xh", "yi", "yo", "zh-CN", "zh-TW", "zu",
] as const;

export interface TargetLanguage {
  code: string;
  /** In the interface language, e.g. "Almanca". */
  name: string;
  /** In itself, e.g. "Deutsch". */
  native: string;
  /** In English, e.g. "German". */
  english: string;
}

/** Every target language with its names, sorted by name in the interface language. */
export function translateTargets(): TargetLanguage[] {
  const lang = uiLanguage();
  return TRANSLATE_LANGUAGES.map((code) => ({
    code,
    name: languageName(code, lang),
    native: languageName(code, code),
    english: languageName(code, "en"),
  })).sort((a, b) => a.name.localeCompare(b.name, lang));
}

/** Lower case without accents, so "turkce" finds "Türkçe" and "ceviri" finds "çeviri". */
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .toLocaleLowerCase("en");

/** The languages whose code or any of whose names contain `query`; all for an empty one. */
export function searchLanguages(languages: TargetLanguage[], query: string): TargetLanguage[] {
  const q = fold(query.trim());
  if (!q) return languages;
  const hits = languages.filter((l) => [l.code, l.name, l.native, l.english].some((n) => fold(n).includes(q)));
  // Names that start with the query first.
  const starts = (l: TargetLanguage) => [l.name, l.native, l.english].some((n) => fold(n).startsWith(q));
  return [...hits.filter(starts), ...hits.filter((l) => !starts(l))];
}
