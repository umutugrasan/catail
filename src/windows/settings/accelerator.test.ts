import { describe, expect, it } from "vitest";
import { acceleratorFrom, prettyAccelerator } from "./accelerator";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {}) => ({
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe("acceleratorFrom", () => {
  it("orders modifiers like the plugin", () => {
    expect(acceleratorFrom(key("KeyV", { altKey: true, ctrlKey: true, shiftKey: true }))).toBe(
      "control+shift+alt+KeyV",
    );
    expect(acceleratorFrom(key("PrintScreen", { shiftKey: true }))).toBe("shift+PrintScreen");
    expect(acceleratorFrom(key("F9"))).toBe("F9");
  });

  it("waits while only modifiers are held", () => {
    expect(acceleratorFrom(key("ControlLeft", { ctrlKey: true }))).toBeNull();
    expect(acceleratorFrom(key("AltRight", { altKey: true, ctrlKey: true }))).toBeNull();
    expect(acceleratorFrom(key(""))).toBeNull();
  });
});

describe("prettyAccelerator", () => {
  it("reads like the keyboard", () => {
    expect(prettyAccelerator("control+shift+alt+KeyV")).toBe("Ctrl + Shift + Alt + V");
    expect(prettyAccelerator("shift+PrintScreen")).toBe("Shift + PrintScreen");
    expect(prettyAccelerator("alt+Digit1")).toBe("Alt + 1");
  });
});
