// The Catail cats: a small SVG face, and two drawn cats cut into parts so they can move.
// Motion lives in cats.css.
import type { CSSProperties } from "react";
import { TrashIcon } from "../windows/overlay/icons";
import boxFront from "./cats/box-front.png";
import boxHead from "./cats/box-head.png";
import footLeft from "./cats/foot-left.png";
import footRight from "./cats/foot-right.png";
import standingBody from "./cats/standing-body.png";
import "./cats.css";

const PLUM = "#5b2141";
const PINK = "#f7b3cf";

/** Tiny face with whiskers; sits in the badge where a status dot would be. */
export function CatFace({ size = 18 }: { size?: number }) {
  return (
    <svg className="cat-face" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M5 9.5 6.2 3l4.3 3.6h3L17.8 3 19 9.5c1 1.2 1.5 2.7 1.5 4.3C20.5 18 16.7 21 12 21s-8.5-3-8.5-7.2c0-1.6.5-3.1 1.5-4.3Z" fill={PLUM} />
      <g className="cat-face__eyes" fill={PINK}>
        <ellipse cx="9" cy="13" rx="1.3" ry="1.6" />
        <ellipse cx="15" cy="13" rx="1.3" ry="1.6" />
      </g>
      <path d="M11.2 15.6h1.6L12 16.6Z" fill={PINK} />
      <g stroke={PLUM} strokeWidth="0.9" strokeLinecap="round" opacity="0.85">
        <path d="M8 16.2 1.5 15.4M8 17.2 2 18.2M16 16.2l6.5-.8M16 17.2l6 1" />
      </g>
    </svg>
  );
}

/** Three thin whiskers fanning out from one side of whatever they're placed in. */
export function Whiskers({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`whiskers whiskers--${side}`} viewBox="0 0 32 26" width={32} height={26} aria-hidden="true">
      <g transform={side === "right" ? "matrix(-1 0 0 1 32 0)" : undefined}>
        <path d="M32 9C22 5 11 3 2 4" />
        <path d="M32 13C21 12 10 13 0 14" />
        <path d="M32 17C22 19 12 22 3 25" />
      </g>
    </svg>
  );
}

/** A small ear to sit on top edge of a bar. Open at the bottom, so it merges into the bar. */
export function CatEar({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`cat-ear cat-ear--${side}`} viewBox="0 0 24 14" width={24} height={14} aria-hidden="true">
      <path className="cat-ear__shell" d="M1 14 5 3.5C5.8 1.2 8 .8 9.8 2.2L23 14" />
      <path className="cat-ear__inner" d="M7 13 8.2 6.6c.2-1 1.2-1.2 2-.5L17 13Z" />
    </svg>
  );
}

/** Size of the leaping cat in the panel's bin and in the badge; they must match for the handoff. */
export const LEAP_CAT_SIZE = 41;

/** The standing cat with its feet as separate parts, so they can kick while it flies. */
export function LeapingCat({ size = LEAP_CAT_SIZE, className = "", style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span className={`leaping-cat ${className}`} style={{ width: size, height: Math.round((size * 335) / 332), ...style }} aria-hidden="true">
      <img className="leaping-cat__foot leaping-cat__foot--left" src={footLeft} alt="" draggable={false} />
      <img className="leaping-cat__foot leaping-cat__foot--right" src={footRight} alt="" draggable={false} />
      <img className="leaping-cat__body" src={standingBody} alt="" draggable={false} />
    </span>
  );
}

/**
 * Waits in a box beside "Geri al", bored: heavy eyelids, a slow blink, the box shuffles.
 * The head rises out of the box when it arrives. With `leapFrom` (offset in px from the
 * box's landing spot to where the cat starts), a cat first leaps in from there.
 */
export function BoxCat({ leapFrom }: { leapFrom?: { x: number; y: number } | null }) {
  const leaping = leapFrom != null;
  return (
    <span className={`box-cat${leaping ? " box-cat--leap" : ""}`} aria-hidden="true">
      <span className="box-cat__head">
        <img src={boxHead} alt="" draggable={false} />
        <span className="box-cat__lid box-cat__lid--left" />
        <span className="box-cat__lid box-cat__lid--right" />
      </span>
      {leaping && (
        <LeapingCat
          className="box-cat__leaper"
          style={{ "--dx": `${leapFrom.x}px`, "--dy": `${leapFrom.y}px` } as CSSProperties}
        />
      )}
      <img className="box-cat__front" src={boxFront} alt="" draggable={false} />
    </span>
  );
}

/** How long the overlay's bin-and-cat moment plays before the queue is actually cleared. */
export const TRASH_JUMP_MS = 760;
/** The panel's version: the cat climbs onto the bin, then the badge takes over the leap. */
export const TRASH_HANDOFF_MS = 430;

/**
 * The bin's lid flips and a cat climbs out of it, facing left. `handoff`: it stops crouched on
 * the bin, ready to jump (the badge window plays the jump); otherwise it leaps off to the left.
 */
export function TrashJump({ size = 17, handoff = false }: { size?: number; handoff?: boolean }) {
  return (
    <span className={`trash-jump${handoff ? " trash-jump--handoff" : ""}`}>
      <LeapingCat size={handoff ? LEAP_CAT_SIZE : Math.round(size * 2.4)} />
      <TrashIcon size={size} />
    </span>
  );
}
