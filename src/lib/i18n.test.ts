import { describe, expect, it } from "vitest";
import tr from "../locales/tr.json";
import { allLocales, LANGUAGES } from "./i18n";

type Dict = { [key: string]: string | Dict };

const flatten = (dict: Dict, prefix = ""): Record<string, string> =>
  Object.fromEntries(
    Object.entries(dict).flatMap(([key, value]) =>
      typeof value === "string" ? [[prefix + key, value]] : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("locales", () => {
  const source = flatten(tr as Dict);
  const locales = allLocales();

  it("has a file for every listed language", () => {
    expect(Object.keys(locales).sort()).toEqual(LANGUAGES.map(([code]) => code).sort());
  });

  for (const [code] of LANGUAGES) {
    it(`${code} has every string, with the same placeholders`, () => {
      const strings = flatten(locales[code]);
      for (const [key, text] of Object.entries(source)) {
        expect(strings[key], `${code}: ${key}`).toBeTypeOf("string");
        expect(placeholders(strings[key]), `${code}: ${key}`).toEqual(placeholders(text));
      }
      expect(Object.keys(strings).filter((key) => !(key in source)), code).toEqual([]);
    });
  }
});
