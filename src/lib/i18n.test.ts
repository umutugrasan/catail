import { describe, expect, it } from "vitest";
import { t } from "./i18n";

describe("t", () => {
  it("resolves nested keys", () => {
    expect(t("overlay.copy")).toBe("Kopyala");
  });

  it("falls back to the key when missing", () => {
    expect(t("overlay.nope")).toBe("overlay.nope");
    expect(t("overlay")).toBe("overlay");
  });

  it("fills placeholders and leaves unknown ones", () => {
    expect(t("settings.version", { version: "0.1.0" })).toBe("Sürüm 0.1.0");
    expect(t("settings.version")).toBe("Sürüm {version}");
  });
});
