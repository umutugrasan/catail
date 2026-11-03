import { describe, expect, it } from "vitest";
import { wrapText } from "./textPage";

// Monospace stand-in: every character is 10 px wide.
const measure = (s: string) => s.length * 10;

describe("wrapText", () => {
  it("wraps on spaces and keeps blank lines", () => {
    expect(wrapText("bir iki üç dört", 70, measure)).toEqual(["bir iki", "üç dört"]);
    expect(wrapText("a\n\nb", 100, measure)).toEqual(["a", "", "b"]);
  });

  it("breaks words longer than the line", () => {
    expect(wrapText("abcdefghij", 40, measure)).toEqual(["abcd", "efgh", "ij"]);
  });
});
