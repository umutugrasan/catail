/** Returns a copy of `list` with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.min(Math.max(to, 0), next.length - 1);
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

export interface Grid {
  columns: number;
  /** Tile size plus gap, in px. */
  pitch: number;
}

/** Top-left of the tile at `index`. */
export function cellPosition(index: number, grid: Grid): { x: number; y: number } {
  return {
    x: (index % grid.columns) * grid.pitch,
    y: Math.floor(index / grid.columns) * grid.pitch,
  };
}

/** Index of the tile slot under a point (relative to the grid's scroll origin). */
export function cellAt(x: number, y: number, grid: Grid, count: number): number {
  const column = Math.min(Math.max(Math.floor(x / grid.pitch), 0), grid.columns - 1);
  const row = Math.max(Math.floor(y / grid.pitch), 0);
  return Math.min(row * grid.columns + column, Math.max(count - 1, 0));
}
