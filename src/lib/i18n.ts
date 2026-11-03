import tr from "../locales/tr.json";

type Dict = { [key: string]: string | Dict };

/** Looks up a dotted key such as `overlay.copy`; falls back to the key itself. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const value = key
    .split(".")
    .reduce<string | Dict | undefined>(
      (node, part) => (typeof node === "object" ? node[part] : undefined),
      tr as Dict,
    );
  if (typeof value !== "string") return key;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
