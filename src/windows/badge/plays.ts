// What the badge's cat finds to do when it's left alone: things by its seat, and outings down
// to the taskbar. Dealt like a pack of cards, so over a while it gets round to all of them
// and never does the same thing twice running.
import type { CatIdle } from "../../lib/cats";
import type { Outing } from "../../lib/ipc";

export type Play = CatIdle | Outing;

/**
 * Each of the cat's plays, and how many times it's in the pack. The chases and the visitors
 * come round most: they're the fun ones.
 */
const PACK: [Play, number][] = [
  ["scratch", 1],
  ["bat", 1],
  ["stretch", 1],
  ["hide", 1],
  ["lick", 1],
  ["groom", 1],
  ["knead", 1],
  ["yawn", 1],
  ["butterfly", 2],
  ["walk", 1],
  ["zoomies", 2],
  ["laser", 3],
  ["mouse", 4],
  ["rival", 3],
  ["friend", 2],
];

const OUTINGS: readonly Play[] = ["walk", "zoomies", "laser", "mouse", "rival", "friend"];

export const isOuting = (play: Play): play is Outing => OUTINGS.includes(play);

/** A fresh pack, shuffled. `random` is 0..1, as Math.random. */
export function shuffledPack(random: () => number = Math.random): Play[] {
  const pack = PACK.flatMap(([play, times]) => Array.from({ length: times }, () => play));
  for (let i = pack.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pack[i], pack[j]] = [pack[j], pack[i]];
  }
  return pack;
}

/**
 * Takes the next play off `pack` (a new one is dealt when it runs out): the first that isn't
 * `last` again and, where the cat can't get down to the taskbar, isn't an outing.
 */
export function drawPlay(pack: Play[], last: Play | null, canGoOut: boolean, random: () => number = Math.random): Play {
  const fits = (play: Play) => play !== last && (canGoOut || !isOuting(play));
  let at = pack.findIndex(fits);
  if (at < 0) {
    pack.push(...shuffledPack(random));
    at = pack.findIndex(fits);
  }
  return pack.splice(at, 1)[0];
}
