// The Catail cats: a small SVG face, and two drawn cats cut into parts so they can move.
// Motion lives in cats.css.
import { useEffect, useState, type CSSProperties, type Ref } from "react";
import { TrashIcon } from "../windows/overlay/icons";
import boxFront from "./cats/box-front.png";
import boxHead from "./cats/box-head.png";
import footLeft from "./cats/foot-left.png";
import footRight from "./cats/foot-right.png";
import standingBody from "./cats/standing-body.png";
import { SEAT_STRIPS } from "./catSeat";
import { BOX_H, BOX_W, BURST_MS, CHIP_MS, HOP_MS, SHARD_MS, type Flight, type ShredPlan } from "./shred";
import "./cats.css";

/** Tiny face with whiskers, in the chosen cat's colors. */
export function CatFace({ size = 18 }: { size?: number }) {
  return (
    <svg className="cat-face" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M5 9.5 6.2 3l4.3 3.6h3L17.8 3 19 9.5c1 1.2 1.5 2.7 1.5 4.3C20.5 18 16.7 21 12 21s-8.5-3-8.5-7.2c0-1.6.5-3.1 1.5-4.3Z"
        style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 0.9, strokeLinejoin: "round" }}
      />
      <path d="M5.6 9 6.6 3.9 9.9 6.7Z" style={{ fill: "var(--face-ear-left, var(--face))" }} />
      <path d="M14.1 6.7 17.4 3.9 18.4 9Z" style={{ fill: "var(--face-ear-right, var(--face))" }} />
      <g className="cat-face__eyes" style={{ fill: "var(--face-eye)" }}>
        <ellipse cx="9" cy="13" rx="1.3" ry="1.6" />
        <ellipse cx="15" cy="13" rx="1.3" ry="1.6" />
      </g>
      <path d="M11.2 15.6h1.6L12 16.6Z" style={{ fill: "var(--face-eye)" }} />
      <g strokeWidth="0.9" strokeLinecap="round" opacity="0.85" style={{ stroke: "var(--face-whisker)" }}>
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

/** A front leg coming over the box's edge, claws out, in the chosen cat's fur. */
function ClawPaw({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`claw-paw claw-paw--${side}`} viewBox="0 0 20 30" aria-hidden="true">
      <g className="claw-paw__claws">
        <path d="M4 19.5 5 26l2-6Z" />
        <path d="M8.7 20.5 10 28l1.3-7.5Z" />
        <path d="M13 20l2 6 1-6.5Z" />
      </g>
      <path
        className="claw-paw__fur"
        d="M3.5 8C3.5 3.5 6.5 1 10 1S16.5 3.5 16.5 8V12C18.5 13.5 19 16 18 18C17 20 15 20.5 13.5 20C12.5 21 7.5 21 6.5 20C5 20.5 3 20 2 18C1 16 1.5 13.5 3.5 12Z"
      />
      <path className="claw-paw__toes" d="M7.5 15.5v4M12.5 15.5v4" />
    </svg>
  );
}

/** The scratching and the burst, drawn over the box. Pieces are cut from the box's own picture. */
function BoxShred({ plan }: { plan: ShredPlan }) {
  return (
    <>
      <ClawPaw side="left" />
      <ClawPaw side="right" />
      <svg className="box-shred__marks" viewBox={`0 0 ${BOX_W} ${BOX_H}`} aria-hidden="true">
        {plan.marks.flatMap((mark, m) =>
          mark.lines.map((line, l) => (
            <line key={`${m}-${l}`} {...line} pathLength={1} style={{ animationDelay: `${mark.at + l * 15}ms` }} />
          )),
        )}
      </svg>
      {plan.shards.map((shard) => (
        <img
          key={shard.clip}
          className="box-shred__shard"
          src={boxFront}
          alt=""
          draggable={false}
          style={{
            ...flightStyle(shard, BURST_MS + shard.delay, SHARD_MS),
            clipPath: shard.clip,
            transformOrigin: `${shard.cx}% ${shard.cy}%`,
          }}
        />
      ))}
      {plan.chips.map((chip, i) => (
        <span
          key={i}
          className={`box-shred__chip box-shred__chip--${chip.tone}`}
          style={{
            ...flightStyle(chip, chip.delay, CHIP_MS),
            left: `${chip.x}%`,
            top: `${chip.y}%`,
            width: chip.size,
            height: chip.size * 0.8,
          }}
        />
      ))}
      <LeapingCat
        className="box-cat__victor"
        style={
          {
            "--hop-dir": plan.hopDir,
            "--hop-peak": `${plan.hopPeak}px`,
            "--hop-land": `${plan.hopLand}px`,
            animationDelay: `${BURST_MS}ms`,
            animationDuration: `${HOP_MS}ms`,
          } as CSSProperties
        }
      />
    </>
  );
}

function flightStyle(flight: Flight, delay: number, duration: number) {
  return {
    "--dx": `${flight.dx}px`,
    "--peak": `${flight.peak}px`,
    "--land": `${flight.land}px`,
    "--spin": `${flight.spin}deg`,
    animationDelay: `${delay}ms`,
    animationDuration: `${duration}ms`,
  } as CSSProperties;
}

/**
 * Waits in a box beside "Geri al", bored: heavy eyelids, a slow blink, the box shuffles.
 * The head rises out of the box when it arrives; its eyes and head follow `--look-x`/`--look-y`
 * set on the element around it. With `leapFrom` (offset in px from the box's landing spot to
 * where the cat starts), a cat first leaps in from there. With `shred`, it has had enough: it
 * claws the box to pieces and leaves.
 */
export function BoxCat({ leapFrom, shred }: { leapFrom?: { x: number; y: number } | null; shred?: ShredPlan | null }) {
  const leaping = leapFrom != null;
  // The moment the box bursts the cat is out of it: nothing of it may stay behind.
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    setBurst(false);
    if (!shred) return;
    const timer = setTimeout(() => setBurst(true), BURST_MS);
    return () => clearTimeout(timer);
  }, [shred]);
  return (
    <span
      className={`box-cat${leaping ? " box-cat--leap" : ""}${shred ? " box-cat--shred" : ""}`}
      style={shred ? ({ "--burst": `${BURST_MS}ms` } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      {!burst && (
        <span className="box-cat__head">
          {/* One picture cut in three, so the ears can move on their own. */}
          <img className="box-cat__skull" src={boxHead} alt="" draggable={false} />
          <img className="box-cat__ear box-cat__ear--left" src={boxHead} alt="" draggable={false} />
          <img className="box-cat__ear box-cat__ear--right" src={boxHead} alt="" draggable={false} />
          <span className="box-cat__glint box-cat__glint--left" />
          <span className="box-cat__glint box-cat__glint--right" />
          <span className="box-cat__lid box-cat__lid--left" />
          <span className="box-cat__lid box-cat__lid--right" />
        </span>
      )}
      {leaping && (
        <LeapingCat
          className="box-cat__leaper"
          style={{ "--dx": `${leapFrom.x}px`, "--dy": `${leapFrom.y}px` } as CSSProperties}
        />
      )}
      <img className="box-cat__front" src={boxFront} alt="" draggable={false} />
      {shred && <BoxShred plan={shred} />}
    </span>
  );
}

/**
 * The cat sitting beside the badge, wherever the queue is on show. `fat` (0..1) fills out its
 * belly and `asleep` shuts its eyes. The head, ears, tail and body are one picture cut apart.
 */
export function SeatCat({
  fat = 0,
  asleep = false,
  className = "",
  style,
  seatRef,
}: {
  fat?: number;
  asleep?: boolean;
  className?: string;
  style?: CSSProperties;
  seatRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <span
      ref={seatRef}
      className={`cat-seat${asleep ? " cat-seat--asleep" : ""} ${className}`}
      style={{ "--fat": fat, ...style } as CSSProperties}
      aria-hidden="true"
    >
      <img className="cat-seat__tail" src={standingBody} alt="" draggable={false} />
      <span className="cat-seat__body">
        <img className="leaping-cat__foot leaping-cat__foot--left" src={footLeft} alt="" draggable={false} />
        <img className="leaping-cat__foot leaping-cat__foot--right" src={footRight} alt="" draggable={false} />
        {/* Under the strips, so no seam between two of them can show what's behind the cat. */}
        <img className="cat-seat__strip cat-seat__strip--whole" src={standingBody} alt="" draggable={false} />
        {SEAT_STRIPS.map((strip) => (
          <img
            key={strip.clip}
            className="cat-seat__strip"
            src={standingBody}
            alt=""
            draggable={false}
            style={{ clipPath: strip.clip, "--share": strip.share } as CSSProperties}
          />
        ))}
      </span>
      <span className="cat-seat__head">
        <img className="cat-seat__skull" src={standingBody} alt="" draggable={false} />
        <img className="cat-seat__ear cat-seat__ear--left" src={standingBody} alt="" draggable={false} />
        <img className="cat-seat__ear cat-seat__ear--right" src={standingBody} alt="" draggable={false} />
        <span className="cat-seat__lid cat-seat__lid--left" />
        <span className="cat-seat__lid cat-seat__lid--right" />
      </span>
      {asleep && (
        <span className="cat-seat__zzz">
          <i>z</i>
          <i>z</i>
          <i>z</i>
        </span>
      )}
    </span>
  );
}

/** "Geri al" was pressed: the queue lands in the badge at DROP, the cat is back in its seat at the end. */
export const FETCH_DROP_MS = 520;
export const FETCH_MS = 1300;

/**
 * The badge's cat in its seat. With `fetching` (how many items "Geri al" brought back), it comes
 * out of its box with papers in its mouth, hops over to the badge `dx` px away, drops them in and
 * hops back.
 */
export function BadgeCat({
  fat,
  asleep,
  fetching,
  dx,
  hop,
  title,
  seatRef,
  slotRef,
  pasting,
  onPress,
  onHover,
}: {
  fat: number;
  asleep: boolean;
  fetching: number | null;
  dx: number;
  hop: number;
  title: string;
  seatRef: Ref<HTMLSpanElement>;
  slotRef: Ref<HTMLSpanElement>;
  pasting: boolean;
  onPress: (e: React.MouseEvent) => void;
  onHover: () => void;
}) {
  const carrying = fetching !== null;
  return (
    <span
      ref={slotRef}
      className={`cat-slot${carrying ? " cat-slot--fetch" : ""}${pasting ? " cat-slot--pasting" : ""}`}
      style={{ "--dx": `${dx}px`, "--hop": `${hop}px`, "--fetch-ms": `${FETCH_MS}ms` } as CSSProperties}
      title={title}
      onMouseDown={onPress}
      onMouseEnter={onHover}
    >
      {carrying && <img className="cat-fetch__box" src={boxFront} alt="" draggable={false} />}
      <span className="cat-slot__trot">
        <span className="cat-slot__facing">
          <SeatCat fat={fat} asleep={asleep} seatRef={seatRef} />
          {carrying && (
            <span className="cat-fetch__sheets">
              {Array.from({ length: Math.min(Math.max(fetching, 1), 3) }, (_, i) => (
                <i key={i} style={{ "--i": i } as CSSProperties} />
              ))}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/** How long a card takes to be pushed off the panel, before it leaves the queue. */
export const TABLE_PUSH_MS = 1500;

/** Stands beside a card and pushes it off the table, with a look at you first. */
export function TableCat({ size = 46 }: { size?: number }) {
  return (
    <span className="table-cat" aria-hidden="true">
      <span className="table-cat__facing">
        <span className="table-cat__body">
          <ClawPaw side="left" />
          <LeapingCat size={size} />
        </span>
      </span>
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
