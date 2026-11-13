// What the badge's cat finds to do when it's left alone: things by its seat, and outings down
// to the taskbar. Dealt like a pack of cards, so over a while it gets round to all of them
// and never does the same thing twice running.
import type { CatIdle } from "../../lib/cats";
import type { Outing } from "../../lib/ipc";

export type Play = CatIdle | Outing;

/** Whose plays: the cat's, or the monkey's own. */
export type Player = "cat" | "monkey" | "frog" | "capybara";

/**
 * Each of the cat's plays, and how many times it's in the pack. The chases and the visitors
 * come round most: they're the fun ones.
 */
const CAT_PACK: [Play, number][] = [
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

/**
 * The monkey's, a monkey's own only: swinging from its tree most of all, bananas, hiding in the
 * leaves, a think about bananas, a dip and a dance; and down on the taskbar a leap up to the top
 * of the screen, a banana fight or a friend to groom.
 */
const MONKEY_PACK: [Play, number][] = [
  ["swing", 6],
  ["banana", 4],
  ["peek", 4],
  ["think", 3],
  ["dive", 2],
  ["silly", 2],
  ["climb", 4],
  ["rival", 3],
  ["friend", 2],
];

/**
 * The frog's, a frog's own only: a fly caught with its tongue most of all, a croak, a big jump, a
 * dive; and down on the taskbar hops along it, a fly hunt, a croaking match with another frog,
 * and leapfrog with a friend.
 */
const FROG_PACK: [Play, number][] = [
  ["fly", 5],
  ["croak", 4],
  ["jump", 3],
  ["dive", 3],
  ["hops", 3],
  ["flyhunt", 3],
  ["rival", 2],
  ["friend", 2],
];

/**
 * The capybara's, its own only: a soak in its hot tub most of all, a bubble tea, a mandarin on its
 * head, a bird come to sit on it, a splash; and down on the taskbar a bird that rides on its head,
 * a friend to lie about with, a slow walk.
 */
const CAPYBARA_PACK: [Play, number][] = [
  ["onsen", 5],
  ["boba", 4],
  ["chill", 3],
  ["bird", 4],
  ["bath", 3],
  ["birdie", 3],
  ["friend", 2],
  ["walk", 2],
];

const PACKS: Record<Player, [Play, number][]> = {
  cat: CAT_PACK,
  monkey: MONKEY_PACK,
  frog: FROG_PACK,
  capybara: CAPYBARA_PACK,
};

const OUTINGS: readonly Play[] = ["walk", "zoomies", "laser", "mouse", "rival", "friend", "climb", "hops", "flyhunt", "birdie"];

export const isOuting = (play: Play): play is Outing => OUTINGS.includes(play);

/** A fresh pack, shuffled. `random` is 0..1, as Math.random. */
export function shuffledPack(player: Player = "cat", random: () => number = Math.random): Play[] {
  const pack = PACKS[player].flatMap(([play, times]) => Array.from({ length: times }, () => play));
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
export function drawPlay(
  pack: Play[],
  last: Play | null,
  canGoOut: boolean,
  player: Player = "cat",
  random: () => number = Math.random,
): Play {
  const fits = (play: Play) => play !== last && (canGoOut || !isOuting(play));
  let at = pack.findIndex(fits);
  if (at < 0) {
    pack.push(...shuffledPack(player, random));
    at = pack.findIndex(fits);
  }
  return pack.splice(at, 1)[0];
}
