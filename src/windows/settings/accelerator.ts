// Shortcut strings in the global-shortcut plugin's format, e.g. "control+shift+alt+KeyV".

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/** Shortcut for a key event, or null while only modifiers are held. */
export function acceleratorFrom(e: KeyLike): string | null {
  if (!e.code || MODIFIER_CODES.has(e.code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("control");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  if (e.metaKey) parts.push("super");
  parts.push(e.code);
  return parts.join("+");
}

const NAMES: Record<string, string> = {
  control: "Ctrl",
  ctrl: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  super: "Win",
};

/** "control+shift+alt+KeyV" → "Ctrl + Shift + Alt + V". */
export function prettyAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => NAMES[part.toLowerCase()] ?? part.replace(/^(Key|Digit)/, ""))
    .join(" + ");
}
