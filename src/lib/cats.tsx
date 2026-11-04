// The Catail cats: a small SVG face, and two drawn cats as images. Motion lives in cats.css.
import { TrashIcon } from "../windows/overlay/icons";
import boxCat from "./cats/box.png";
import standingCat from "./cats/standing.png";
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

/** Waits in a box beside "Geri al", bored: heavy eyelids, a slow blink, the box shuffles. */
export function BoxCat() {
  return (
    <span className="box-cat" aria-hidden="true">
      <img src={boxCat} alt="" draggable={false} />
      <span className="box-cat__lid box-cat__lid--left" />
      <span className="box-cat__lid box-cat__lid--right" />
    </span>
  );
}

/** Springs out of the bin. */
export function LeapingCat({ size = 44 }: { size?: number }) {
  return <img className="leaping-cat" src={standingCat} alt="" width={size} height={size} draggable={false} />;
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
