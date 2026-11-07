import { describe, expect, it } from "vitest";
import { extensionLabel, formatSize, isPdf } from "./fileCard";

describe("isPdf", () => {
  it("goes by the file name", () => {
    expect(isPdf("rapor.pdf")).toBe(true);
    expect(isPdf("RAPOR.PDF")).toBe(true);
    expect(isPdf("tez.docx")).toBe(false);
    expect(isPdf("pdf")).toBe(false);
    expect(isPdf(null)).toBe(false);
  });
});

describe("formatSize", () => {
  it("keeps bytes whole and rounds the rest to one decimal", () => {
    expect(formatSize(0, "en")).toBe("0 B");
    expect(formatSize(812, "en")).toBe("812 B");
    expect(formatSize(1536, "en")).toBe("1.5 KB");
    expect(formatSize(5 * 1024 * 1024, "en")).toBe("5 MB");
    expect(formatSize(3.25 * 1024 ** 3, "en")).toBe("3.3 GB");
  });

  it("writes numbers the locale's way", () => {
    expect(formatSize(1536, "tr")).toBe("1,5 KB");
  });

  it("stops at the largest unit", () => {
    expect(formatSize(2048 * 1024 ** 4, "en")).toBe("2,048 TB");
  });
});

describe("extensionLabel", () => {
  it("is the extension in capitals", () => {
    expect(extensionLabel("rapor.pdf")).toBe("PDF");
    expect(extensionLabel("Tez.final.docx")).toBe("DOCX");
    expect(extensionLabel("şirin.İŞ")).toBe("İŞ");
  });

  it("is empty when there's nothing that fits", () => {
    expect(extensionLabel("README")).toBe("");
    expect(extensionLabel(".gitignore")).toBe("");
    expect(extensionLabel("kayit.torrentfile")).toBe("");
  });
});
