import { describe, expect, it } from "vitest";
import { fold, searchLanguages, type TargetLanguage } from "./languages";

const langs: TargetLanguage[] = [
  { code: "de", name: "Almanca", native: "Deutsch", english: "German" },
  { code: "tr", name: "Türkçe", native: "Türkçe", english: "Turkish" },
  { code: "ja", name: "Japonca", native: "日本語", english: "Japanese" },
];

describe("language search", () => {
  it("ignores case and accents", () => {
    expect(fold("Türkçe")).toBe("turkce");
    expect(fold("IŞIK")).toBe("isik");
  });
  it("finds a language by any of its names or its code", () => {
    for (const query of ["alm", "deutsch", "GERMAN", "de"]) {
      expect(searchLanguages(langs, query).map((l) => l.code), query).toContain("de");
    }
    expect(searchLanguages(langs, "turkce").map((l) => l.code)).toEqual(["tr"]);
    expect(searchLanguages(langs, "日本").map((l) => l.code)).toEqual(["ja"]);
  });
  it("puts names that start with the query first", () => {
    expect(searchLanguages(langs, "ja").map((l) => l.code)[0]).toBe("ja");
  });
  it("lists everything for an empty query", () => {
    expect(searchLanguages(langs, "  ")).toHaveLength(3);
  });
});
