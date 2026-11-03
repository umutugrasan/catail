// The Stack Screen cats. Plain SVG; all motion lives in cats.css.
import { TrashIcon } from "../windows/overlay/icons";
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

/** Sits beside "Geri al", bored: swishes its tail, blinks, yawns now and then. */
export function BoredCat() {
  return (
    <svg className="bored-cat" viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
      <path className="bored-cat__tail" d="M32 40c6 0 10-3 10-9 0-4-2-6-4-6" fill="none" stroke={PLUM} strokeWidth="3.4" strokeLinecap="round" />
      <ellipse cx="23" cy="38" rx="12" ry="8.5" fill={PLUM} />
      <g className="bored-cat__head">
        <path d="M12 21.5 13.5 11l5.5 5h5l5.5-5L31 21.5c.7 1.3 1 2.6 1 4C32 31 28 34 22 34s-10-3-10-8.5c0-1.4.3-2.7 1-4Z" fill={PLUM} />
        <path d="M14.6 14.2 15 18l2.6-1.8ZM29.4 14.2 29 18l-2.6-1.8Z" fill={PINK} opacity="0.8" />
        {/* Half-closed, unimpressed eyes. */}
        <g className="bored-cat__eyes" fill={PINK}>
          <rect x="15.5" y="24" width="4.4" height="1.8" rx="0.9" />
          <rect x="24.1" y="24" width="4.4" height="1.8" rx="0.9" />
        </g>
        <path d="M21 28h2l-1 1.1Z" fill={PINK} />
        <ellipse className="bored-cat__yawn" cx="22" cy="30.6" rx="1.6" ry="1.4" fill={PINK} />
        <g stroke={PINK} strokeWidth="0.8" strokeLinecap="round" opacity="0.7">
          <path d="M17 28.5 9 27.6M17 29.6l-7.6 1.4M27 28.5l8-.9M27 29.6l7.6 1.4" />
        </g>
      </g>
      <path d="M17 45.5h4M25 45.5h4" stroke={PINK} strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

/** Mid-leap, for jumping out of the bin. */
export function LeapingCat({ size = 44 }: { size?: number }) {
  return (
    <svg className="leaping-cat" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M8 30c-4-1-6-4-5-8" fill="none" stroke={PLUM} strokeWidth="3" strokeLinecap="round" />
      <path d="M8 30c4-6 12-9 20-8 4 .5 7 2.5 8 5-2 3-7 5-13 5-5 0-10-.5-15-2Z" fill={PLUM} />
      <path d="M12 31 6 40M17 32l-2 10M26 31l4 9M30 29l8 7" stroke={PLUM} strokeWidth="3" strokeLinecap="round" />
      <path d="M31 19.5 32 12l4.4 4h3.4l4.2-4L45 19.5c.5 1 .8 2 .8 3 0 4-3 6.5-7.3 6.5s-7.3-2.5-7.3-6.5c0-1 .3-2 .8-3Z" fill={PLUM} />
      <g fill={PINK}>
        <ellipse cx="35.8" cy="22" rx="1.2" ry="1.6" />
        <ellipse cx="41.4" cy="22" rx="1.2" ry="1.6" />
      </g>
      <g stroke={PINK} strokeWidth="0.8" strokeLinecap="round" opacity="0.8">
        <path d="M36 25 30.5 24.4M42 25l5.5-.6" />
      </g>
    </svg>
  );
}

/** How long the bin-and-cat moment plays before the queue is actually cleared. */
export const TRASH_JUMP_MS = 760;

/** The bin's lid flips and a cat springs out of it. */
export function TrashJump({ size = 17 }: { size?: number }) {
  return (
    <span className="trash-jump">
      <TrashIcon size={size} />
      <LeapingCat size={Math.round(size * 2.4)} />
    </span>
  );
}
