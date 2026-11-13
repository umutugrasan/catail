// The Catail cats: a small SVG face, and two drawn cats cut into parts so they can move.
// Motion lives in cats.css.
import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { TrashIcon } from "../windows/overlay/icons";
import boxFront from "./cats/box-front.png";
import boxHead from "./cats/box-head.png";
import footLeft from "./cats/foot-left.png";
import footRight from "./cats/foot-right.png";
import standingBody from "./cats/standing-body.png";
import monkeyHappy from "./animals/monkey/happy.png";
import frogHappy from "./animals/frog/happy.png";
import frogCry from "./animals/frog/cry.png";
import frogRest from "./animals/frog/rest.png";
import frogSleep from "./animals/frog/sleep.png";
import frogWorried from "./animals/frog/worried.png";
import frogDive from "./animals/frog/dive.png";
import frogSplash from "./animals/frog/splash.png";
import capybaraHappy from "./animals/capybara/happy.png";
import capybaraCry from "./animals/capybara/cry.png";
import capybaraRest from "./animals/capybara/rest.png";
import capybaraSleep from "./animals/capybara/sleep.png";
import capybaraWorried from "./animals/capybara/worried.png";
import capybaraSplash from "./animals/capybara/splash.png";
import capybaraOnsen from "./animals/capybara/onsen.png";
import capybaraBoba from "./animals/capybara/boba.png";
import monkeyBanana from "./animals/monkey/banana.png";
import monkeySilly from "./animals/monkey/silly.png";
import monkeySurprised from "./animals/monkey/surprised.png";
import monkeyThink from "./animals/monkey/think.png";
import monkeyDive from "./animals/monkey/dive.png";
import monkeySplash from "./animals/monkey/splash.png";
import monkeyCry from "./animals/monkey/cry.png";
import monkeySleep from "./animals/monkey/sleep.png";
import monkeyWink from "./animals/monkey/wink.png";
import monkeyWorried from "./animals/monkey/worried.png";
import monkeyHang from "./animals/monkey/hang.png";
import turtleCry from "./animals/turtle/cry.png";
import turtleDive from "./animals/turtle/dive.png";
import turtleHappy from "./animals/turtle/happy.png";
import turtleInShell from "./animals/turtle/shell.png";
import turtleSilly from "./animals/turtle/silly.png";
import turtleSleep from "./animals/turtle/sleep.png";
import turtleSplash from "./animals/turtle/splash.png";
import turtleWorried from "./animals/turtle/worried.png";
import { SEAT_STRIPS } from "./catSeat";
import { BOX_H, BOX_W, BURST_MS, CHIP_MS, HOP_MS, SHARD_MS, type Flight, type ShredPlan } from "./shred";
import "./cats.css";

/** Tiny face with whiskers, in the chosen cat's colors; the turtle's own face for the turtle. */
export function CatFace({ size = 18 }: { size?: number }) {
  return (
    <svg className="cat-face" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <g className="cat-face__turtle">
        <ellipse cx="12" cy="13" rx="9.5" ry="7.8" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1.2 }} />
        <ellipse cx="8.6" cy="12.6" rx="1.5" ry="1.8" style={{ fill: "var(--face-eye)" }} />
        <ellipse cx="15.4" cy="12.6" rx="1.5" ry="1.8" style={{ fill: "var(--face-eye)" }} />
        <path d="M10.3 16.1q1.7 1.4 3.4 0" fill="none" strokeWidth="0.9" strokeLinecap="round" style={{ stroke: "var(--face-rim)" }} />
      </g>
      <g className="cat-face__capybara">
        <circle cx="5.4" cy="6.6" r="2.6" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1 }} />
        <circle cx="18.6" cy="6.6" r="2.6" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1 }} />
        <rect x="3" y="5.6" width="18" height="16" rx="7.6" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1 }} />
        <ellipse cx="12" cy="16.2" rx="4.4" ry="3.4" fill="#b8763d" />
        <circle cx="8" cy="11.6" r="1.3" style={{ fill: "var(--face-eye)" }} />
        <circle cx="16" cy="11.6" r="1.3" style={{ fill: "var(--face-eye)" }} />
        <path d="M10.8 15.4h.01M13.2 15.4h.01" strokeWidth="1.3" strokeLinecap="round" style={{ stroke: "var(--face-rim)" }} />
        <circle cx="12" cy="4.4" r="2.6" fill="#ff9a2e" stroke="#9a4a0a" strokeWidth="0.7" />
        <path d="M12 2c.8-1.2 2-1.4 2.8-1" fill="none" stroke="#3f8a2a" strokeWidth="1" strokeLinecap="round" />
      </g>
      <g className="cat-face__frog">
        <circle cx="7" cy="7.6" r="4" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1 }} />
        <circle cx="17" cy="7.6" r="4" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1 }} />
        <ellipse cx="12" cy="14.6" rx="10" ry="7.4" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1 }} />
        <path d="M5 10.4h14" style={{ stroke: "var(--face)", strokeWidth: 2.4 }} />
        <circle cx="7" cy="7.8" r="2" style={{ fill: "var(--face-eye)" }} />
        <circle cx="17" cy="7.8" r="2" style={{ fill: "var(--face-eye)" }} />
        <ellipse cx="5.6" cy="15.4" rx="1.8" ry="1.1" fill="#f59a9a" />
        <ellipse cx="18.4" cy="15.4" rx="1.8" ry="1.1" fill="#f59a9a" />
        <path d="M9.4 15.4q2.6 2.2 5.2 0" fill="none" strokeWidth="1" strokeLinecap="round" style={{ stroke: "var(--face-rim)" }} />
      </g>
      <g className="cat-face__monkey">
        <circle cx="3.6" cy="12.6" r="3" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1 }} />
        <circle cx="20.4" cy="12.6" r="3" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1 }} />
        <ellipse cx="12" cy="12.8" rx="8.6" ry="8.2" style={{ fill: "var(--face)", stroke: "var(--face-rim)", strokeWidth: 1 }} />
        <path
          d="M12 9.4C10.8 7.6 8.6 7.4 7.4 7.8 5.4 8.4 4.8 10.4 5.2 12.2 5.5 13.4 6.2 14.2 7 14.8 7.6 17.4 9.6 19 12 19s4.4-1.6 5-4.2c.8-.6 1.5-1.4 1.8-2.6.4-1.8-.2-3.8-2.2-4.4-1.2-.4-3.4-.2-4.6 1.6Z"
          style={{ fill: "var(--cat-lid)" }}
        />
        <ellipse cx="9" cy="11.6" rx="1.2" ry="1.5" style={{ fill: "var(--face-eye)" }} />
        <ellipse cx="15" cy="11.6" rx="1.2" ry="1.5" style={{ fill: "var(--face-eye)" }} />
        <path d="M10.3 16q1.7 1.2 3.4 0" fill="none" strokeWidth="0.9" strokeLinecap="round" style={{ stroke: "var(--face-rim)" }} />
      </g>
      <g className="cat-face__cat">
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

/**
 * The cat's pink nose, for the middle of a bar that has its ears and whiskers. A press is a boop:
 * the nose squishes and a heart floats up. `boops` counts them, so each one plays afresh.
 */
export function CatNose({ boops, title, onBoop }: { boops: number; title: string; onBoop: () => void }) {
  return (
    <button type="button" className={`cat-nose${boops > 0 ? " cat-nose--boop" : ""}`} title={title} onClick={onBoop}>
      <svg key={boops} viewBox="0 0 22 18" width={22} height={18} aria-hidden="true">
        <path className="cat-nose__nose" d="M6.4 4.4C6.4 2.9 8.4 2 11 2s4.6.9 4.6 2.4c0 1.7-2.5 4-4.6 4S6.4 6.1 6.4 4.4Z" />
        <ellipse className="cat-nose__shine" cx="9.3" cy="3.7" rx="1.3" ry="0.7" />
        <path className="cat-nose__mouth" d="M11 8.4v2.4M11 10.8c-.8 1.7-3.1 1.9-4.3.4M11 10.8c.8 1.7 3.1 1.9 4.3.4" />
      </svg>
      {boops > 0 && (
        <svg key={`heart-${boops}`} className="cat-nose__heart" viewBox="0 0 24 22" width={12} height={11} aria-hidden="true">
          <path d="M12 21C5 15.6 1.5 12 1.5 7.4 1.5 4 4 1.5 7.2 1.5c2 0 3.7 1 4.8 2.7 1.1-1.7 2.8-2.7 4.8-2.7 3.2 0 5.7 2.5 5.7 5.9 0 4.6-3.5 8.2-10.5 13.6Z" />
        </svg>
      )}
    </button>
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
/**
 * Asleep, a bubble swells out of the cat's nose with each breath (NOSE_BUBBLE_MS) until it
 * pops, startling it awake (NOSE_POP_MS).
 */
export const NOSE_BUBBLE_MS = 5200;
export const NOSE_POP_MS = 900;
export type NoseBubble = "grow" | "pop";

/**
 * What a sitting cat does with itself: "lick" a paw and wash its face with it, "groom" its
 * chest, "knead" (treading with its feet, eyes shut), "yawn", and "purr" when it's stroked.
 */
export type SeatAct = "lick" | "groom" | "knead" | "yawn" | "purr";

export function SeatCat({
  fat = 0,
  asleep = false,
  bubble = null,
  act = null,
  className = "",
  style,
  seatRef,
}: {
  fat?: number;
  asleep?: boolean;
  bubble?: NoseBubble | null;
  act?: SeatAct | null;
  className?: string;
  style?: CSSProperties;
  seatRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <span
      ref={seatRef}
      className={`cat-seat${asleep ? " cat-seat--asleep" : ""}${act ? ` cat-seat--${act}` : ""} ${className}`}
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
        {(act === "lick" || act === "groom") && <span className="cat-seat__tongue" />}
        {act === "yawn" && (
          <span className="cat-seat__yawn">
            <i />
          </span>
        )}
        {bubble === "grow" && (
          <span className="nose-bubble" aria-hidden="true">
            <i className="nose-bubble__shine" />
          </span>
        )}
        {/* Where it was: a splash, and the cat's eyes wide open. */}
        {bubble === "pop" && (
          <span className="nose-pop" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} style={{ "--a": `${i * 60 + 15}deg` } as CSSProperties} />
            ))}
          </span>
        )}
      </span>
      {act === "lick" && <span className="cat-seat__paw" />}
      {(act === "knead" || act === "purr") && (
        <span className="cat-seat__hearts">
          <i>♥</i>
          <i>♥</i>
          <i>♥</i>
        </span>
      )}
      {bubble === "pop" && <span className="cat-seat__startle">!</span>}
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
  chasing = false,
  idle = null,
  away = false,
  tree = false,
  bubble = null,
  purring = false,
  monkey = false,
  frog = false,
  capybara = false,
  onToyPlay,
  onPet,
  onLeave,
  turtle = false,
  sad = false,
  hatch = null,
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
  /** Chasing its own tail: a puff, the cat spins round after it seen from above, then sits back dizzy. */
  chasing?: boolean;
  /** Up to something by its scratching post. */
  idle?: CatIdle | null;
  /** Out for a walk along the taskbar (another window draws it meanwhile). */
  away?: boolean;
  /** Its scratching post stands beside it. */
  tree?: boolean;
  /** Asleep: a bubble swelling out of its nose, or just popped. */
  bubble?: NoseBubble | null;
  /** Someone pushed the pompom about. */
  onToyPlay?: () => void;
  /** Stroked: eyes shut, purring, hearts. */
  purring?: boolean;
  /** The monkey: a tree beside it instead of the scratching post, and games of its own. */
  monkey?: boolean;
  /** The frog: a pond beside it, and games of its own. */
  frog?: boolean;
  /** The capybara: its patch of grass and mandarins beside it, and games of its own. */
  capybara?: boolean;
  /** The pointer moving over it, and leaving it. */
  onPet?: (e: React.MouseEvent) => void;
  onLeave?: () => void;
  /** The turtle sits here instead, with its own pictures and games. */
  turtle?: boolean;
  /** The turtle, left alone too long: worried, then in tears, before it nods off. */
  sad?: boolean;
  /** The turtle arrives: it hatches from an egg or digs itself out of the sand. */
  hatch?: TurtleHatch | null;
  onPress: (e: React.MouseEvent) => void;
  onHover: () => void;
}) {
  const carrying = fetching !== null;
  const act: SeatAct | null = purring ? "purr" : SEAT_ACTS.find((one) => one === idle) ?? null;
  return (
    <span
      ref={slotRef}
      className={`cat-slot${carrying ? " cat-slot--fetch" : ""}${pasting ? " cat-slot--pasting" : ""}${chasing ? " cat-slot--chase" : ""}${idle ? ` cat-slot--${idle}` : ""}${away ? " cat-slot--away" : ""}${sad ? " cat-slot--sad" : ""}${hatch ? ` cat-slot--hatch-${hatch}` : ""}`}
      style={
        {
          "--dx": `${dx}px`,
          "--hop": `${hop}px`,
          "--fetch-ms": `${FETCH_MS}ms`,
          // The belly pushes its front out: further to go to reach the post.
          "--belly": `${(fat * 8).toFixed(1)}px`,
        } as CSSProperties
      }
      title={title}
      onMouseDown={onPress}
      onMouseEnter={onHover}
      onMouseMove={onPet}
      onMouseLeave={onLeave}
    >
      {carrying && <img className="cat-fetch__box" src={boxFront} alt="" draggable={false} />}
      {/* Pasting: it walks up and down a little keyboard, a key going down under each step. */}
      {pasting && (
        <span className="cat-keys" aria-hidden="true">
          {Array.from({ length: KEYS }, (_, i) => (
            <i key={i} style={{ "--i": i } as CSSProperties} />
          ))}
          <b />
          <b />
        </span>
      )}
      {tree &&
        (monkey ? (
          <MonkeyTree onPlay={onToyPlay} />
        ) : frog ? (
          <FrogPond />
        ) : capybara ? (
          <CapybaraNook onPlay={onToyPlay} />
        ) : (
          <CatTree onPlay={onToyPlay} />
        ))}
      {chasing && <ChaseCat />}
      <span className="cat-slot__trot">
        <span className="cat-slot__facing">
          {turtle ? (
            <TurtleSeat fat={fat} asleep={asleep} hatch={hatch} seatRef={seatRef} />
          ) : monkey ? (
            <MonkeySeat fat={fat} asleep={asleep} seatRef={seatRef} />
          ) : frog ? (
            <FrogSeat fat={fat} asleep={asleep} seatRef={seatRef} />
          ) : capybara ? (
            <CapybaraSeat fat={fat} asleep={asleep} seatRef={seatRef} />
          ) : (
            <SeatCat fat={fat} asleep={asleep} bubble={bubble} act={act} seatRef={seatRef} />
          )}
          {carrying && (
            <span className="cat-fetch__sheets">
              {Array.from({ length: Math.min(Math.max(fetching, 1), 3) }, (_, i) => (
                <i key={i} style={{ "--i": i } as CSSProperties} />
              ))}
            </span>
          )}
        </span>
      </span>
      {idle === "scratch" && (
        <span className="scratch-paws" aria-hidden="true">
          <i />
          <i />
        </span>
      )}
      {idle === "butterfly" && <Butterfly />}
      {idle === "banana" && <Banana />}
      {idle === "fly" && <FrogFly />}
      {idle === "croak" && <FrogSac />}
      {idle === "chill" && <FallingMandarin />}
      {idle === "bird" && <Birdie />}
      {idle === "onsen" && (
        <span className="onsen-steam" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}

/** Keys on the keyboard the cat walks on while pasting. */
const KEYS = 5;

/**
 * What the cat gets up to beside the badge when nothing's going on, and how long each takes.
 * "hide": it scurries behind the badge's pill, ducks, peeks out over the top, and comes back.
 * The turtle has games of its own: "dive" into a pool and back out with a splash, a "silly"
 * dance with its tongue out, and a roll about in its "shell".
 */
export type CatIdle =
  | "scratch"
  | "bat"
  | "stretch"
  | "hide"
  | "lick"
  | "groom"
  | "knead"
  | "yawn"
  | "butterfly"
  | "banana"
  | "swing"
  | "peek"
  | "think"
  | "fly"
  | "croak"
  | "jump"
  | "onsen"
  | "boba"
  | "chill"
  | "bird"
  | "bath"
  | "dive"
  | "silly"
  | "shell";
export const CAT_IDLE_MS: Record<CatIdle, number> = {
  scratch: 3200,
  bat: 2400,
  stretch: 1900,
  hide: 6400,
  lick: 4400,
  groom: 3600,
  knead: 4200,
  yawn: 2000,
  butterfly: 6400,
  banana: 5600,
  swing: 4400,
  peek: 5600,
  think: 3600,
  fly: 4200,
  croak: 3000,
  jump: 1600,
  onsen: 5200,
  boba: 3800,
  chill: 4600,
  bird: 5400,
  bath: 4200,
  dive: 4200,
  silly: 2400,
  shell: 3000,
};

/** The idles that are the sitting cat's own doing (SeatCat's `act`). */
const SEAT_ACTS: readonly SeatAct[] = ["lick", "groom", "knead", "yawn"];

/**
 * A butterfly that comes by (CAT_IDLE_MS.butterfly): the cat can't keep its eyes off it, jumps
 * at it twice and misses, and then it lands on the cat's nose, until the cat sneezes.
 */
function Butterfly() {
  return (
    <span className="butterfly" aria-hidden="true">
      <svg viewBox="0 0 14 12" width={14} height={12}>
        <g className="butterfly__wing butterfly__wing--left">
          <path d="M7 6C5.4 2.2 2.6.6 1.2 1.8c-1.5 1.3.2 4 5.8 4.2ZM7 6c-3 .2-4.8 1.6-4.2 3.4.6 1.7 3.2 1 4.2-3.4Z" />
          <circle cx="3" cy="3.4" r="0.8" />
        </g>
        <g className="butterfly__wing butterfly__wing--right">
          <path d="M7 6c1.6-3.8 4.4-5.4 5.8-4.2 1.5 1.3-.2 4-5.8 4.2ZM7 6c3 .2 4.8 1.6 4.2 3.4-.6 1.7-3.2 1-4.2-3.4Z" />
          <circle cx="11" cy="3.4" r="0.8" />
        </g>
        <path className="butterfly__body" d="M7 3.4v5.4M7 3.4 5.8 1.6M7 3.4l1.2-1.8" />
      </svg>
    </span>
  );
}

/** The turtle's moods and games, a picture each. */
const TURTLE_POSES = {
  happy: turtleHappy,
  splash: turtleSplash,
  dive: turtleDive,
  worried: turtleWorried,
  silly: turtleSilly,
  sleep: turtleSleep,
  shell: turtleInShell,
  cry: turtleCry,
} as const;

/** Left alone too long, the turtle is worried, then cries, for this long before it nods off. */
export const TURTLE_SAD_MS = 5200;
/** How the turtle arrives on the badge, and how long that takes. */
export type TurtleHatch = "egg" | "sand";
export const TURTLE_HATCH_MS = 2800;

/** Sand thrown up as it digs out or the egg breaks: [x, y] where each grain flies (px). */
const GRAINS: [number, number][] = [
  [-17, -14],
  [-12, -22],
  [-6, -27],
  [2, -25],
  [9, -21],
  [15, -15],
  [-20, -6],
  [19, -7],
  [-9, -17],
  [6, -16],
];

/**
 * The turtle in the badge's seat. Every picture is there at once, stacked, so a change of
 * pose never waits for one to load; cats.css shows the one for its state or game.
 */
export function TurtleSeat({
  fat,
  asleep,
  hatch,
  seatRef,
  poses = TURTLE_POSES,
  className = "",
}: {
  fat: number;
  asleep: boolean;
  hatch: TurtleHatch | null;
  seatRef?: Ref<HTMLSpanElement>;
  /** The pictures, by pose: the turtle's, or another pictured animal's. */
  poses?: Record<string, string>;
  className?: string;
}) {
  return (
    <span
      ref={seatRef}
      className={`cat-seat turtle-seat${asleep ? " turtle-seat--asleep" : ""} ${className}`}
      style={{ "--fat": fat } as CSSProperties}
      aria-hidden="true"
    >
      {/* Its pool, under it while it dives. */}
      <span className="turtle-seat__pool">
        <i />
        <i />
        <i />
      </span>
      {/* Anything below the seat's bottom edge is under water, or under the sand. */}
      <span className="turtle-seat__ground">
        <span className="turtle-seat__act">
          <span className="turtle-seat__body">
            {Object.entries(poses).map(([pose, src]) => (
              <img key={pose} className={`turtle-seat__pose turtle-seat__pose--${pose}`} src={src} alt="" draggable={false} />
            ))}
            <span className="turtle-seat__tears">
              <i />
              <i />
            </span>
          </span>
        </span>
      </span>
      <span className="turtle-seat__drops">
        {GRAINS.slice(0, 6).map(([x, y], i) => (
          <i key={i} style={{ "--x": `${x}px`, "--y": `${y}px` } as CSSProperties} />
        ))}
      </span>
      {hatch && (
        <span className={`turtle-nest turtle-nest--${hatch}`}>
          <span className="turtle-nest__mound" />
          {hatch === "egg" && (
            <svg className="turtle-nest__egg" viewBox="0 0 24 28" width={24} height={28}>
              {/* Two halves that fit along a zigzag; only the crack draws the seam. Until it
                  breaks, a whole egg behind them hides the join. */}
              <path
                className="turtle-nest__shell turtle-nest__whole"
                d="M 2.3 15 C 2.6 7 6.7 1 12 1 C 17.3 1 21.4 7 21.7 15 C 21.9 22.5 17.6 27 12 27 C 6.4 27 2.1 22.5 2.3 15 Z"
              />
              <g className="turtle-nest__egg-bottom">
                <path
                  className="turtle-nest__shell"
                  d="M 2.3 15 L 5.5 12.4 L 8.6 15.4 L 12 12 L 15.2 15.4 L 18.4 12.3 L 21.7 15 C 21.9 22.5 17.6 27 12 27 C 6.4 27 2.1 22.5 2.3 15 Z"
                />
                <path className="turtle-nest__rim" d="M 2.3 15 C 2.1 22.5 6.4 27 12 27 C 17.6 27 21.9 22.5 21.7 15" />
                <circle className="turtle-nest__spot" cx="16" cy="21" r="1.1" />
              </g>
              <g className="turtle-nest__egg-top">
                <path
                  className="turtle-nest__shell"
                  d="M 2.3 15 L 5.5 12.4 L 8.6 15.4 L 12 12 L 15.2 15.4 L 18.4 12.3 L 21.7 15 C 21.4 7 17.3 1 12 1 C 6.7 1 2.6 7 2.3 15 Z"
                />
                <path className="turtle-nest__rim" d="M 2.3 15 C 2.6 7 6.7 1 12 1 C 17.3 1 21.4 7 21.7 15" />
                <circle className="turtle-nest__spot" cx="8" cy="8" r="1.2" />
                <circle className="turtle-nest__spot" cx="15.5" cy="6" r="0.9" />
                <path
                  className="turtle-nest__crack"
                  d="M 2.3 15 L 5.5 12.4 L 8.6 15.4 L 12 12 L 15.2 15.4 L 18.4 12.3 L 21.7 15"
                />
              </g>
              <path
                className="turtle-nest__crack"
                d="M 2.3 15 L 5.5 12.4 L 8.6 15.4 L 12 12 L 15.2 15.4 L 18.4 12.3 L 21.7 15"
              />
            </svg>
          )}
          <span className="turtle-nest__grains">
            {GRAINS.map(([x, y], i) => (
              <i key={i} style={{ "--x": `${x}px`, "--y": `${y}px`, "--i": i } as CSSProperties} />
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * The monkey's tree, beside its seat where the cat has its scratching post: a bushy crown with a
 * bunch of bananas under it and a branch reaching out over the monkey. Eyes peer out of the
 * leaves while the monkey hides in them. A press on the bananas sends the monkey for one.
 */
export function MonkeyTree({ onPlay }: { onPlay?: () => void }) {
  return (
    <svg className="cat-tree monkey-tree" viewBox="0 0 30 58" width={30} height={58} aria-hidden="true">
      <ellipse className="monkey-tree__grass" cx={15} cy={56.6} rx={11} ry={2.2} />
      <path className="monkey-tree__wood-line" d="M15 57C17 44 11 30 14 13" strokeWidth={6.4} />
      <path className="monkey-tree__wood" d="M15 57C17 44 11 30 14 13" strokeWidth={4} />
      <path className="monkey-tree__wood-line" d="M17 9C28 6.6 40 6.2 52 7.4" strokeWidth={4.4} />
      <path className="monkey-tree__wood monkey-tree__branch" d="M17 9C28 6.6 40 6.2 52 7.4" strokeWidth={2.4} />
      <g className="monkey-tree__crown">
        <g className="monkey-tree__leaf-line">
          <circle cx={6} cy={10} r={7} />
          <circle cx={14} cy={5.6} r={7.6} />
          <circle cx={23} cy={9} r={7} />
          <circle cx={10} cy={15} r={6} />
          <circle cx={19.5} cy={15} r={6} />
        </g>
        <g className="monkey-tree__leaf">
          <circle cx={6} cy={10} r={7} />
          <circle cx={14} cy={5.6} r={7.6} />
          <circle cx={23} cy={9} r={7} />
          <circle cx={10} cy={15} r={6} />
          <circle cx={19.5} cy={15} r={6} />
        </g>
        <g className="monkey-tree__shine">
          <circle cx={11} cy={3.4} r={2.2} />
          <circle cx={4} cy={8} r={1.6} />
          <circle cx={21} cy={6} r={1.8} />
        </g>
        {/* Someone in there. */}
        <g className="monkey-tree__eyes">
          <ellipse cx={-1.8} cy={0} rx={1.5} ry={1.8} />
          <ellipse cx={1.8} cy={0} rx={1.5} ry={1.8} />
          <circle className="monkey-tree__pupil" cx={-1.5} cy={0.3} r={0.8} />
          <circle className="monkey-tree__pupil" cx={2.1} cy={0.3} r={0.8} />
        </g>
      </g>
      <g
        className="monkey-tree__bananas"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPlay?.();
        }}
      >
        <circle className="cat-tree__toy-hit" cx={21.5} cy={21} r={5.5} />
        <path className="monkey-tree__stalk" d="M21 17.6v2.4" />
        <path className="monkey-tree__banana" d="M20.6 19.6c-2.6 1-3.6 3.6-2.8 6 .5-2 1.6-3.4 3.2-4.2Z" />
        <path className="monkey-tree__banana monkey-tree__banana--picked" d="M21 19.6c-.4 2.6.4 5 2.6 6.2-.6-2-.6-3.8.2-5.6Z" />
        <path className="monkey-tree__banana" d="M21.4 19.4c2.4.4 4 2.4 4 4.8-1-1.6-2.4-2.6-4-3Z" />
      </g>
      <g className="monkey-tree__fall">
        <ellipse cx={8} cy={18} rx={2} ry={1} />
        <ellipse cx={18} cy={19} rx={2} ry={1} />
        <ellipse cx={13} cy={17} rx={1.8} ry={0.9} />
      </g>
    </svg>
  );
}

/**
 * A banana from the tree (CAT_IDLE_MS.banana): held up in both hands, peeled one strip at a
 * time, eaten in three bites, and the peel thrown over its shoulder.
 */
function Banana() {
  return (
    <span className="banana" aria-hidden="true">
      <svg viewBox="0 0 12 16" width={12} height={16}>
        <path className="banana__fruit" d="M4.2 3.4c0-1.4.8-2.2 1.8-2.2s1.8.8 1.8 2.2v6.6H4.2Z" />
        <path className="banana__peel banana__peel--back" d="M4 9.6C3.6 6 4.2 3 6 1.6c1.8 1.4 2.4 4.4 2 8Z" />
        <path className="banana__peel banana__peel--left" d="M6 9.6C3.8 8 3.4 4.6 4.6 2.2 5.4 4 5.8 6.6 6 9.6Z" />
        <path className="banana__peel banana__peel--right" d="M6 9.6c2.2-1.6 2.6-5 1.4-7.4C6.6 4 6.2 6.6 6 9.6Z" />
        <path className="banana__peel banana__peel--base" d="M3.8 9.4h4.4c.2 2.4-.6 4.4-2.2 5.6-1.6-1.2-2.4-3.2-2.2-5.6Z" />
        <path className="banana__tip" d="M5.6 15h.8v.8h-.8Z" />
      </svg>
    </span>
  );
}

/**
 * The monkey's pictures, by pose. It sits in the same seat as the turtle (the same moods: worried,
 * in tears, asleep; the same dive and dance), with games of its own: a banana, a think about
 * one, swinging from its tree, hiding in it.
 */
const MONKEY_POSES = {
  happy: monkeyHappy,
  banana: monkeyBanana,
  silly: monkeySilly,
  surprised: monkeySurprised,
  think: monkeyThink,
  dive: monkeyDive,
  splash: monkeySplash,
  cry: monkeyCry,
  sleep: monkeySleep,
  wink: monkeyWink,
  worried: monkeyWorried,
  hang: monkeyHang,
} as const;

/** One of the monkey's pictures, for a pose drawn elsewhere (the taskbar). */
export const monkeyPicture = (pose: keyof typeof MONKEY_POSES) => MONKEY_POSES[pose];

export function MonkeySeat({ fat, asleep, seatRef }: { fat: number; asleep: boolean; seatRef?: Ref<HTMLSpanElement> }) {
  return <TurtleSeat fat={fat} asleep={asleep} hatch={null} seatRef={seatRef} poses={MONKEY_POSES} className="monkey-seat" />;
}

/**
 * The frog's pictures, by pose. It sits in the turtle's seat too (worried, in tears, asleep; a
 * dive into the water), with games of its own: a fly caught with its tongue, a croak, a big jump.
 */
const FROG_POSES = {
  happy: frogHappy,
  cry: frogCry,
  rest: frogRest,
  sleep: frogSleep,
  worried: frogWorried,
  dive: frogDive,
  splash: frogSplash,
} as const;

/** One of the frog's pictures, for a pose drawn elsewhere (the taskbar). */
export const frogPicture = (pose: keyof typeof FROG_POSES) => FROG_POSES[pose];

export function FrogSeat({ fat, asleep, seatRef }: { fat: number; asleep: boolean; seatRef?: Ref<HTMLSpanElement> }) {
  return <TurtleSeat fat={fat} asleep={asleep} hatch={null} seatRef={seatRef} poses={FROG_POSES} className="frog-seat" />;
}

/**
 * The capybara's pictures, by pose. The turtle's seat once more (worried, in tears, asleep), with
 * its own games: a soak in a hot tub, a bubble tea, a mandarin on its head, a bird come to sit on
 * it, a splash about in the water.
 */
const CAPYBARA_POSES = {
  happy: capybaraHappy,
  cry: capybaraCry,
  rest: capybaraRest,
  sleep: capybaraSleep,
  worried: capybaraWorried,
  splash: capybaraSplash,
  onsen: capybaraOnsen,
  boba: capybaraBoba,
} as const;

/** One of the capybara's pictures, for a pose drawn elsewhere (the taskbar). */
export const capybaraPicture = (pose: keyof typeof CAPYBARA_POSES) => CAPYBARA_POSES[pose];

export function CapybaraSeat({ fat, asleep, seatRef }: { fat: number; asleep: boolean; seatRef?: Ref<HTMLSpanElement> }) {
  return (
    <TurtleSeat fat={fat} asleep={asleep} hatch={null} seatRef={seatRef} poses={CAPYBARA_POSES} className="capybara-seat" />
  );
}

/** A mandarin, with its leaf. */
function Mandarin({ className = "" }: { className?: string }) {
  return (
    <svg className={`mandarin ${className}`} viewBox="0 0 12 12" width={8} height={8} aria-hidden="true">
      <circle cx="6" cy="7" r="4.6" />
      <path className="mandarin__leaf" d="M6.2 2.6C7 .8 9 .4 10.4 1 9.6 2.6 8 3.2 6.2 2.6Z" />
      <circle className="mandarin__shine" cx="4.4" cy="5.4" r="1" />
    </svg>
  );
}

/**
 * Beside the capybara's seat, where the cat has its post: a tuft of grass and a few mandarins.
 * A press on the mandarins and one ends up on its head.
 */
export function CapybaraNook({ onPlay }: { onPlay?: () => void }) {
  return (
    <svg className="cat-tree capybara-nook" viewBox="0 0 30 40" width={30} height={40} aria-hidden="true">
      <g className="capybara-nook__grass">
        <path d="M6 39C5 33 3 29 1 27 5 28 7 32 8 36 8 30 7 25 8 21 10 26 11 32 10.6 39Z" />
        <path d="M11 39C11 33 12.6 28 15 25 14 30 13.6 34 13.8 39Z" />
      </g>
      <g
        className="capybara-nook__mandarins"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPlay?.();
        }}
      >
        <circle className="cat-tree__toy-hit" cx={21} cy={34} r={7} />
        <g transform="translate(14 30)">
          <circle className="capybara-nook__fruit" cx="5" cy="5" r="4.4" />
          <path className="capybara-nook__leaf" d="M5.2 1C6 -.6 7.8-1 9 -.4 8.2 1 6.8 1.6 5.2 1Z" />
        </g>
        <g transform="translate(21 31.4)">
          <circle className="capybara-nook__fruit" cx="4.4" cy="4.4" r="3.8" />
          <path className="capybara-nook__leaf" d="M4.6.8C5.2-.6 6.8-.9 7.8-.4 7.2.8 6 1.4 4.6.8Z" />
        </g>
      </g>
    </svg>
  );
}

/** A mandarin drops out of nowhere onto its head (CAT_IDLE_MS.chill): it lies down with it there. */
function FallingMandarin() {
  return (
    <span className="falling-mandarin" aria-hidden="true">
      <Mandarin />
    </span>
  );
}

/**
 * A little bird comes and sits on its head (CAT_IDLE_MS.bird), as birds do on capybaras, and the
 * capybara couldn't care less; a song, and off it flies.
 */
function Birdie() {
  return (
    <span className="birdie" aria-hidden="true">
      <span className="birdie__body">
        <svg viewBox="0 0 16 13" width={11} height={9}>
          <path className="birdie__tail" d="M3 7.6 0 6.4 1.2 9.4Z" />
          <ellipse className="birdie__belly" cx="7.6" cy="8" rx="5.4" ry="4.2" />
          <circle className="birdie__head" cx="11.4" cy="4.6" r="3.2" />
          <path className="birdie__beak" d="M14.4 4.4 16 5.2 14.4 5.8Z" />
          <circle className="birdie__eye" cx="12.2" cy="4" r="0.7" />
          <path className="birdie__wing" d="M4.8 6.8C6.4 4.6 9.4 5 10 7.8 8 9.6 5.6 9 4.8 6.8Z" />
          <path className="birdie__legs" d="M7 12v1M9 12v1" />
        </svg>
      </span>
      <i>♪</i>
    </span>
  );
}

/** The frog's pond beside its seat, where the cat has its scratching post: a lily pad and reeds. */
export function FrogPond() {
  return (
    <svg className="cat-tree frog-pond" viewBox="0 0 30 40" width={30} height={40} aria-hidden="true">
      <g className="frog-pond__reeds">
        <path className="frog-pond__stem" d="M23.6 37C23.4 28 24.4 18 25.6 9" />
        <path className="frog-pond__stem" d="M27 37C27 30 27.6 23 28.8 15" />
        <rect className="frog-pond__cattail" x={24} y={8} width={3.2} height={8} rx={1.6} transform="rotate(7 25.6 12)" />
        <rect className="frog-pond__cattail" x={27.4} y={14} width={2.8} height={7} rx={1.4} transform="rotate(8 28.8 17.5)" />
        <path className="frog-pond__leaf" d="M22 37C19.6 30 19.4 25 21 19.4 21.8 26 22.4 31 23.6 37Z" />
      </g>
      <ellipse className="frog-pond__water" cx={15} cy={36.6} rx={14} ry={3.2} />
      <path className="frog-pond__ripple" d="M5 36.4q3-1.2 6 0M18 37.6q2.4-1 4.8 0" />
      <path className="frog-pond__pad" d="M11.6 35.6C8 35.4 5.6 35.9 5.8 36.9 6 38 9.4 38.4 12.6 38.1 15.6 37.8 17.4 37 17 36.2 16.6 35.6 14.6 35.4 13 35.5L12.4 36.8Z" />
      <g className="frog-pond__flower">
        <path d="M14.2 35.8l-1.4-2.2 2.2 1 .6-2.4.6 2.4 2.2-1-1.4 2.2Z" />
      </g>
    </svg>
  );
}

/**
 * A fly comes buzzing round (CAT_IDLE_MS.fly): the frog follows it with its eyes and, when it
 * hovers just there, out shoots its tongue; and back, with the fly on it. Gulp.
 */
function FrogFly() {
  return (
    <span className="frog-fly-scene" aria-hidden="true">
      <i className="frog-tongue" />
      <span className="frog-fly">
        <svg viewBox="0 0 12 10" width={9} height={7.5}>
          <ellipse className="frog-fly__wing" cx={4.4} cy={2.8} rx={2.6} ry={2} />
          <ellipse className="frog-fly__wing frog-fly__wing--back" cx={7.2} cy={2.6} rx={2.6} ry={2} />
          <ellipse className="frog-fly__body" cx={6} cy={6.4} rx={3.4} ry={2.4} />
          <circle className="frog-fly__eye" cx={3.2} cy={5.8} r={1.1} />
        </svg>
      </span>
    </span>
  );
}

/** A croak (CAT_IDLE_MS.croak): the sac under its chin blown up big, three times, notes rising. */
function FrogSac() {
  return (
    <span className="frog-sac" aria-hidden="true">
      <span className="frog-sac__bag" />
      <i>♪</i>
      <i>♫</i>
      <i>♪</i>
    </span>
  );
}

/** The capybara's version of the cat's ears on a bar: small round ears, and a mandarin on top. */
export function CapybaraBar() {
  return (
    <span className="capybara-bar" aria-hidden="true">
      <svg className="capybara-bar__ear capybara-bar__ear--left" viewBox="0 0 14 14" width={12} height={12}>
        <circle cx="7" cy="7" r="5.6" />
      </svg>
      <svg className="capybara-bar__ear capybara-bar__ear--right" viewBox="0 0 14 14" width={12} height={12}>
        <circle cx="7" cy="7" r="5.6" />
      </svg>
      <span className="capybara-bar__mandarin">
        <Mandarin />
      </span>
    </span>
  );
}

/** The frog's version of the cat's ears on a bar: its two big eyes looking over the top. */
export function FrogBar() {
  return (
    <span className="frog-bar" aria-hidden="true">
      {["left", "right"].map((side) => (
        <svg key={side} className={`frog-bar__eye frog-bar__eye--${side}`} viewBox="0 0 20 18" width={20} height={18}>
          <circle className="frog-bar__bulge" cx="10" cy="10" r="8" />
          <circle className="frog-bar__white" cx="10" cy="9.4" r="5" />
          <circle className="frog-bar__pupil" cx="10.6" cy="9.8" r="3" />
          <circle className="frog-bar__glint" cx="9.2" cy="8.4" r="1" />
        </svg>
      ))}
    </span>
  );
}

/** Rope turns round the post. */
const ROPE = Array.from({ length: 11 }, (_, i) => 11.2 + i * 2.25);

/**
 * The cat's scratching post, beside its seat: a rope-wound post on a carpet base, a perch on top
 * and a pompom hanging off it on a string. It shakes and sheds fluff while the cat scratches
 * it, and the pompom swings when it's batted.
 */
export function CatTree({ onPlay }: { onPlay?: () => void }) {
  const toy = useRef<SVGGElement>(null);
  const swing = useRef({ until: 0, amp: 0 });
  /** A push sends the pompom swinging away from the pointer, higher if it's swinging already. */
  const push = (e: React.MouseEvent<SVGGElement>, hard: boolean) => {
    const el = toy.current;
    if (!el) return;
    const now = performance.now();
    const swinging = now < swing.current.until;
    if (!hard && swinging) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dir = e.clientX < r.left + r.width / 2 ? 1 : -1;
    const amp = hard ? Math.min(46, (swinging ? swing.current.amp * 0.6 : 0) + 26) : 12;
    const ms = hard ? 2200 : 1100;
    swing.current = { until: now + ms, amp };
    const turns = [1, -0.75, 0.55, -0.38, 0.24, -0.12, 0.05, 0];
    el.animate(
      turns.map((k) => ({ transform: `rotate(${(dir * amp * k).toFixed(1)}deg)` })),
      { duration: ms, easing: "ease-out" },
    );
    if (hard) onPlay?.();
  };
  return (
    <svg className="cat-tree" viewBox="0 0 30 40" width={30} height={40} aria-hidden="true">
      <rect className="cat-tree__carpet" x={1} y={35.4} width={28} height={4.2} rx={2} />
      <g className="cat-tree__post">
        <rect className="cat-tree__rope-bg" x={11} y={9.6} width={8} height={26.2} />
        {ROPE.map((y) => (
          <line key={y} className="cat-tree__rope" x1={11.4} y1={y} x2={18.6} y2={y + 0.5} />
        ))}
        <g className="cat-tree__marks">
          <path d="M 13 15 L 14 22 M 15 14.5 L 16 21.5 M 17 15 L 17.8 21.8" />
        </g>
      </g>
      {/* Push it about: a press swings it hard, the pointer coming by just nudges it. */}
      <g
        ref={toy}
        className="cat-tree__toy"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          push(e, true);
        }}
        onMouseEnter={(e) => push(e, false)}
      >
        <circle className="cat-tree__toy-hit" cx={25} cy={20} r={5.5} />
        <line className="cat-tree__string" x1={25} y1={9.8} x2={25} y2={20.6} />
        <circle className="cat-tree__pompom" cx={25} cy={23} r={2.7} />
        <circle className="cat-tree__pompom-shine" cx={24.1} cy={22.1} r={0.8} />
      </g>
      <rect className="cat-tree__carpet" x={2} y={5.4} width={26} height={4.6} rx={2} />
      <rect className="cat-tree__cushion" x={3.6} y={6.1} width={22.8} height={1.2} rx={0.6} />
      <g className="cat-tree__fluff">
        <circle cx={19} cy={17} r={0.9} />
        <circle cx={19} cy={21} r={0.7} />
        <circle cx={19} cy={25} r={1} />
        <circle cx={19} cy={19} r={0.6} />
      </g>
    </svg>
  );
}

/** The whole tail chase, from the hop to the dizzy wobble after. Its keyframes are in cats.css. */
export const CHASE_MS = 2600;

/** Where the curled-up body runs, seen from above: a ring of this radius round the middle. */
const CHASE_RING = 9.5;
/** The paws stick out of the ring at these angles (degrees, clockwise from the right). */
const CHASE_PAWS = [-130, -155, 15, 30];

/**
 * Chasing its own tail, seen from above: curled into a ring, head at one end and tail at the
 * other, spinning round after the tip that's always just out of reach. It comes and goes in a
 * puff of dust, the seated cat hidden meanwhile.
 */
export function ChaseCat() {
  return (
    <span className="chase-cat" aria-hidden="true">
      <span className="chase-cat__shadow" />
      <svg className="chase-cat__spin" viewBox="-20 -20 40 40" width={40} height={40}>
        {/* Speed lines on the trailing side. */}
        <g className="chase-cat__swoosh">
          <path d="M -15.6 6.4 A 16.9 16.9 0 0 1 -12.2 -11.7" />
          <path d="M -8.4 15.2 A 17.4 17.4 0 0 1 -16.6 3.2" />
        </g>
        {CHASE_PAWS.map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const [x, y] = [Math.cos(rad) * CHASE_RING, Math.sin(rad) * CHASE_RING];
          return (
            <g key={angle} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle})`}>
              <g className={`chase-cat__leg chase-cat__leg--${i % 2 ? "b" : "a"}`}>
                <line className="chase-cat__line" x1={2} y1={0} x2={5.6} y2={0} strokeWidth={3.6} />
                <line className="chase-cat__fur" x1={2} y1={0} x2={5.6} y2={0} strokeWidth={2.2} />
              </g>
            </g>
          );
        })}
        {/* The tail, from the hips round toward the nose. */}
        <g transform="translate(9.36 -1.65)">
          <g className="chase-cat__tail">
            <path className="chase-cat__line" d="M 0 0 C 1.64 -3.35 2.14 -7.35 -1.56 -10.95" strokeWidth={3.8} />
            <path className="chase-cat__fur" d="M 0 0 C 1.64 -3.35 2.14 -7.35 -1.56 -10.95" strokeWidth={2.4} />
            <path
              className="chase-cat__stripes"
              d="M 0.5 -1.5 C 1.64 -3.35 2.14 -7.35 -1.2 -10.6"
              strokeWidth={2.4}
              strokeDasharray="1 1.6"
            />
          </g>
        </g>
        {/* The body: most of a ring, neck at the top, hips on the right. */}
        <path className="chase-cat__line" d="M -2.46 -9.18 A 9.5 9.5 0 1 0 9.36 -1.65" strokeWidth={9.6} />
        <path className="chase-cat__fur" d="M -2.46 -9.18 A 9.5 9.5 0 1 0 9.36 -1.65" strokeWidth={8} />
        <path
          className="chase-cat__stripes"
          d="M -4.6 -8.3 A 9.5 9.5 0 1 0 8.9 -3.3"
          strokeWidth={4.4}
          strokeDasharray="1.3 2.9"
        />
        {/* The head, nose to the tail's tip. */}
        <g transform="translate(-0.2 -10.4) rotate(-10)">
          <g className="chase-cat__head">
            <path className="chase-cat__ear" d="M -2.6 -2.4 L 1.2 -3.4 L -1.9 -6.6 Z" />
            <path className="chase-cat__ear" d="M -2.6 2.4 L 1.2 3.4 L -1.9 6.6 Z" />
            <path className="chase-cat__ear-in" d="M -1.7 -3.1 L 0.2 -3.5 L -1.5 -5.2 Z" />
            <path className="chase-cat__ear-in" d="M -1.7 3.1 L 0.2 3.5 L -1.5 5.2 Z" />
            <ellipse className="chase-cat__skull" cx={-0.3} cy={0} rx={4.4} ry={4.1} />
            <path className="chase-cat__brow" d="M -3.4 -1.3 L -0.4 -0.7 M -3.7 0 L 0 0 M -3.4 1.3 L -0.4 0.7" />
            <ellipse className="chase-cat__muzzle" cx={3} cy={0} rx={2.1} ry={2.3} />
            <ellipse className="chase-cat__eye" cx={1.9} cy={-2} rx={0.6} ry={0.85} />
            <ellipse className="chase-cat__eye" cx={1.9} cy={2} rx={0.6} ry={0.85} />
            <ellipse className="chase-cat__nose" cx={4.8} cy={0} rx={0.75} ry={0.95} />
            <path className="chase-cat__whiskers" d="M 3.6 -1.2 L 6.4 -3.6 M 3.8 -0.6 L 7 -1.6 M 3.6 1.2 L 6.4 3.6 M 3.8 0.6 L 7 1.6" />
          </g>
        </g>
      </svg>
      <span className="chase-cat__puff">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <i key={i} style={{ "--a": `${i * 60 + 15}deg` } as CSSProperties} />
        ))}
      </span>
      <span className="chase-cat__dizzy">
        <i>✦</i>
        <i>✦</i>
      </span>
    </span>
  );
}

/** How long a new card's sniff takes, before the cat goes back to the badge. */
export const SNIFF_MS = 1700;

/**
 * Comes over to a card that has just joined the queue and sniffs it. `mood`: it likes it (tail
 * up, a heart) or it sneezes (files are dusty).
 */
export function SniffCat({ mood, size = 46 }: { mood: "like" | "sneeze"; size?: number }) {
  return (
    <span className={`table-cat sniff-cat sniff-cat--${mood}`} aria-hidden="true">
      <span className="table-cat__facing">
        <span className="sniff-cat__body">
          <LeapingCat size={size} />
          <span className="sniff-cat__whiff">
            <i />
            <i />
            <i />
          </span>
          {mood === "like" ? (
            <svg className="sniff-cat__heart" viewBox="0 0 24 22" width={12} height={11}>
              <path d="M12 21C5 15.6 1.5 12 1.5 7.4 1.5 4 4 1.5 7.2 1.5c2 0 3.7 1 4.8 2.7 1.1-1.7 2.8-2.7 4.8-2.7 3.2 0 5.7 2.5 5.7 5.9 0 4.6-3.5 8.2-10.5 13.6Z" />
            </svg>
          ) : (
            <span className="sniff-cat__sneeze">
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/** Saving: the box comes, the papers go in, the flaps close and the cat tapes it shut. */
export const PACKING_MS = 2600;
/** The save is over: the box bounces and goes, the cat hops for joy. */
export const UNPACKED_MS = 1000;

/** The flaps, from hinge to tip: folded out to the sides (as the box is drawn), then shut. */
const FLAP_LEFT_OPEN = "M 6 18 L 10 12 L -2 8 L -6 14 Z";
const FLAP_RIGHT_OPEN = "M 54 18 L 50 12 L 62 8 L 66 14 Z";

/**
 * Saving the queue. The cat brings a box over: the papers drop in, one flap and then the other
 * folds shut, and the cat runs the tape over the seam and down the front, and bites it off.
 * When the save is over (`done`) the box gives a hop and goes, and the cat hops for joy. The
 * turtle curls up in its shell instead. Timings: PACKING_MS, UNPACKED_MS.
 */
export function PackingCat({ done, turtle }: { done: boolean; turtle: boolean }) {
  if (turtle) {
    return (
      <span className={`packing${done ? " packing--done" : ""}`} aria-hidden="true">
        <ShellTurtle leapFrom={{ x: 0, y: 11 }} />
      </span>
    );
  }
  return (
    <span className={`packing packing--cat${done ? " packing--done" : ""}`} aria-hidden="true">
      <span className="packing__stage">
        <svg className="packing__box" viewBox="-8 -16 76 62" width={63} height={51}>
          <path className="packing__inside" d="M 10 12 L 50 12 L 54 18 L 6 18 Z" />
          {/* The papers drop in behind the front. */}
          {[22, 30, 26].map((x, i) => (
            <g key={i} className="packing__sheet" style={{ "--i": i } as CSSProperties}>
              <rect x={x - 6} y={-14} width={12} height={9} rx={1} />
              <path d={`M ${x - 4} -11 h 8 M ${x - 4} -8.5 h 6`} />
            </g>
          ))}
          <path className="packing__front" d="M 6 18 L 54 18 L 52 44 L 8 44 Z" />
          <path className="packing__shade" d="M 7.4 36 L 52.6 36 L 52 44 L 8 44 Z" />
          <path className="packing__flap packing__flap--left" d={FLAP_LEFT_OPEN} />
          <path className="packing__flap packing__flap--right" d={FLAP_RIGHT_OPEN} />
          <path className="packing__tape" d="M 30 12 L 30 18 L 30 31" pathLength={1} />
          <g className="packing__roll">
            <circle r={4.6} />
            <circle className="packing__roll-hole" r={1.9} />
          </g>
        </svg>
      </span>
      <span className="packing__cat">
        <span className="packing__cat-hop">
          <LeapingCat size={38} />
        </span>
      </span>
      {done && (
        <span className="packing__pop">
          <i />
          <i />
          <i />
        </span>
      )}
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
 * The bin's lid flips and a cat (or the turtle, on its flippers) climbs out of it, facing left.
 * `handoff`: it stops crouched on the bin, ready to jump (the badge window plays the jump);
 * otherwise it leaps off to the left.
 */
export function TrashJump({ size = 17, handoff = false }: { size?: number; handoff?: boolean }) {
  return (
    <span className={`trash-jump${handoff ? " trash-jump--handoff" : ""}`}>
      <LeapingCat size={handoff ? LEAP_CAT_SIZE : Math.round(size * 2.4)} />
      <TrashIcon size={size} />
    </span>
  );
}

/**
 * The turtle's "Geri al": no box for a turtle, it hides in its own shell. `leapFrom` (as for
 * BoxCat): it jumps over from there as it is, pulls itself into its shell on the way down and
 * lands with a bounce. Now and then the shell rocks. With `flee`, time is up: out come its head
 * and flippers and it runs off (`runDir` -1 left).
 */
export function ShellTurtle({
  leapFrom,
  flee = false,
  runDir = -1,
}: {
  leapFrom?: { x: number; y: number } | null;
  flee?: boolean;
  runDir?: number;
}) {
  return (
    <span
      className={`shell-turtle${leapFrom ? " shell-turtle--arrive" : ""}${flee ? " shell-turtle--flee" : ""}`}
      style={{ "--dx": `${leapFrom?.x ?? 0}px`, "--dy": `${leapFrom?.y ?? 0}px`, "--run": runDir } as CSSProperties}
      aria-hidden="true"
    >
      {leapFrom && (
        <span className="shell-turtle__flyer">
          <img src={turtleHappy} alt="" draggable={false} />
        </span>
      )}
      <span className="shell-turtle__ball">
        <img className="shell-turtle__shell" src={turtleInShell} alt="" draggable={false} />
      </span>
      {leapFrom && <span className="shell-turtle__poof" />}
      {flee && (
        <span className="shell-turtle__runner">
          <span className="shell-turtle__facing">
            <LeapingCat size={40} />
          </span>
        </span>
      )}
      {flee && (
        <span className="shell-turtle__dust">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}

/** The monkey's version of the cat's ears and whiskers on a bar: its face peeking over, an ear each side. */
export function MonkeyBar() {
  return (
    <span className="monkey-bar" aria-hidden="true">
      <svg className="monkey-bar__head" viewBox="0 0 40 24" width={34} height={20}>
        <ellipse className="monkey-bar__fur" cx="20" cy="17" rx="15" ry="12" />
        <path className="monkey-bar__fur" d="M17 6c0-3 2-5 4-4.4-1 1.4 0 2.4 2 3.4" />
        <path className="monkey-bar__face" d="M20 10c-1.6-2.6-5-3-7-1.6-2 1.4-2.4 4.4-1 6.6 1.4 2.4 5 3 8 3s6.6-.6 8-3c1.4-2.2 1-5.2-1-6.6-2-1.4-5.4-1-7 1.6Z" />
        <ellipse className="monkey-bar__eye" cx="15.6" cy="12" rx="1.6" ry="1.9" />
        <ellipse className="monkey-bar__eye" cx="24.4" cy="12" rx="1.6" ry="1.9" />
      </svg>
      <svg className="monkey-bar__ear monkey-bar__ear--left" viewBox="0 0 20 20" width={18} height={18}>
        <circle className="monkey-bar__fur" cx="10" cy="10" r="8" />
        <circle className="monkey-bar__face" cx="11" cy="10" r="4.4" />
      </svg>
      <svg className="monkey-bar__ear monkey-bar__ear--right" viewBox="0 0 20 20" width={18} height={18}>
        <circle className="monkey-bar__fur" cx="10" cy="10" r="8" />
        <circle className="monkey-bar__face" cx="9" cy="10" r="4.4" />
      </svg>
    </span>
  );
}

/** The turtle's version of the whiskers and ears on a bar: a head peeking over, a flipper each side. */
export function TurtleBar() {
  return (
    <span className="turtle-bar" aria-hidden="true">
      <svg className="turtle-bar__head" viewBox="0 0 40 26" width={34} height={22}>
        <ellipse cx="20" cy="17" rx="16" ry="12" />
        <ellipse className="turtle-bar__eye" cx="13.5" cy="14" rx="2.2" ry="2.6" />
        <ellipse className="turtle-bar__eye" cx="26.5" cy="14" rx="2.2" ry="2.6" />
      </svg>
      <svg className="turtle-bar__flipper turtle-bar__flipper--left" viewBox="0 0 44 22" width={34} height={17}>
        <path d="M44 11C34 1 14-1 2 6C12 16 32 20 44 11Z" />
      </svg>
      <svg className="turtle-bar__flipper turtle-bar__flipper--right" viewBox="0 0 44 22" width={34} height={17}>
        <path d="M0 11C10 1 30-1 42 6C32 16 12 20 0 11Z" />
      </svg>
    </span>
  );
}
