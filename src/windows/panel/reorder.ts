/** Returns a copy of `list` with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.min(Math.max(to, 0), next.length - 1);
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** Row index under a pointer at `offsetY` (relative to the list's scroll origin). */
export function rowAt(offsetY: number, rowHeight: number, count: number): number {
  return Math.min(Math.max(Math.floor(offsetY / rowHeight), 0), Math.max(count - 1, 0));
}
