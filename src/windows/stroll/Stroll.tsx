import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { LeapingCat, SeatCat } from "../../lib/cats";
import { onWindowEvent, strollDone, StrollEvents, type StrollStart } from "../../lib/ipc";
import {
  AT_REST,
  NO_GUEST,
  NO_SCRAP,
  play,
  Prop,
  Puppet,
  setTheStage,
  type Cast,
  type CatPose,
  type Emote,
  type GuestView,
  type ScrapView,
  type View,
} from "./scenes";
import { Stage, type Body } from "./stage";

/** The cats that can come visiting: any but the one that lives here. */
const BREEDS = ["orange", "gray", "white", "calico", "black"];
/** Poses drawn with the sitting cat; the rest are the cat on its feet. */
const SITTING: readonly CatPose[] = ["sit", "look", "groom", "lick", "roll", "proud", "wiggle", "arch", "sniff", "rub", "dizzy"];
/** How high up a cat's head is, for something looking at it. */
const HEAD_UP = 26;

function EmoteMark({ mark }: { mark: Emote }) {
  if (mark === "anger") {
    return (
      <svg className="stroll-emote stroll-emote--anger" viewBox="0 0 16 16" width={15} height={15} aria-hidden="true">
        <path d="M6.2 2.5c.3 2.3-1.2 3.8-3.6 3.6M9.8 2.5c-.3 2.3 1.2 3.8 3.6 3.6M6.2 13.5c.3-2.3-1.2-3.8-3.6-3.6M9.8 13.5c-.3-2.3 1.2-3.8 3.6-3.6" />
      </svg>
    );
  }
  return <span className={`stroll-emote stroll-emote--${mark === "heart" ? "heart" : "mark"}`}>{mark === "heart" ? "♥" : mark}</span>;
}

/** A cat on the taskbar: the badge's own, or (with `breed`) one that has come visiting. */
function CatPuppet({ view, fat, breed, puppetRef }: { view: View; fat: number; breed?: string; puppetRef: Ref<HTMLDivElement> }) {
  const sitting = SITTING.includes(view.pose);
  return (
    <div
      ref={puppetRef}
      className={`stroll-actor stroll-cat stroll-cat--${view.pose}${view.fleeing ? " stroll-actor--fleeing" : ""}`}
      style={{ visibility: view.hidden ? "hidden" : undefined }}
      data-cat={breed}
    >
      <span className={`stroll-actor__facing${view.right ? " stroll-actor__facing--right" : ""}`}>
        {sitting ? (
          <SeatCat fat={fat} act={view.pose === "lick" || view.pose === "groom" ? view.pose : null} />
        ) : (
          <LeapingCat />
        )}
      </span>
      {view.emote && <EmoteMark key={view.emoteKey} mark={view.emote} />}
    </div>
  );
}

/** A mouse, nose to the left like the cats' pictures. */
function Mouse() {
  return (
    <svg className="mouse" viewBox="0 0 28 17" width={28} height={17} aria-hidden="true">
      <path className="mouse__tail" d="M20 12.2c3.4.9 6.2-.6 5.6-3.2-.5-2.2 1-3.6 1.6-5.4" />
      <g className="mouse__feet">
        <ellipse cx="9.6" cy="15.4" rx="1.9" ry="1" />
        <ellipse cx="18" cy="15.4" rx="2.1" ry="1" />
      </g>
      <path className="mouse__body" d="M21.6 10.4c0 3-3.4 4.9-7.8 4.9-3.4 0-6.6-.6-9.6-1.6C2.6 13.2 1.4 12.6.9 11.8c2.2-3.6 6.4-6.2 10.9-6.2 5.4 0 9.8 2 9.8 4.8Z" />
      <circle className="mouse__ear" cx="11.4" cy="5" r="3.4" />
      <circle className="mouse__ear-in" cx="11.2" cy="5.2" r="1.8" />
      <circle className="mouse__eye" cx="6.4" cy="9.4" r="1" />
      <circle className="mouse__nose" cx="1.1" cy="11.6" r="1.1" />
      <path className="mouse__whiskers" d="M3 11.2.6 8.8M3.2 12.2.4 14.2" />
    </svg>
  );
}

/** Who has turned up: a mouse, a red dot, or another cat. */
function Guest({ view, fat, breed, puppetRef }: { view: GuestView; fat: number; breed: string; puppetRef: Ref<HTMLDivElement> }) {
  if (view.kind === "cat") return <CatPuppet view={view} fat={fat} breed={breed} puppetRef={puppetRef} />;
  return (
    <div
      ref={puppetRef}
      className={`stroll-actor stroll-guest stroll-guest--${view.pose}${view.fleeing ? " stroll-actor--fleeing" : ""}`}
      style={{ visibility: view.hidden || view.kind === null ? "hidden" : undefined }}
    >
      <span className={`stroll-actor__facing${view.right ? " stroll-actor__facing--right" : ""}`}>
        {view.kind === "mouse" && <Mouse />}
        {view.kind === "dot" && <i className="laser-dot" />}
      </span>
      {view.emote && <EmoteMark key={view.emoteKey} mark={view.emote} />}
    </div>
  );
}

/** Two cats fighting: a cloud of dust with paws and tails coming out of it, and stars. */
function Scrap({ view, breed, scrapRef }: { view: ScrapView; breed: string; scrapRef: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={scrapRef}
      className={`stroll-actor scrap${view.over ? " scrap--over" : ""}`}
      style={{ visibility: view.hidden ? "hidden" : undefined }}
    >
      {!view.hidden && (
        <span className="scrap__in">
          <i className="scrap__limb scrap__limb--1" />
          <i className="scrap__limb scrap__limb--3" />
          <span data-cat={breed}>
            <i className="scrap__limb scrap__limb--2" />
            <i className="scrap__limb scrap__limb--4" />
          </span>
          <svg className="scrap__dust" viewBox="0 0 84 56" width={84} height={56} aria-hidden="true">
            <circle cx="22" cy="36" r="15" />
            <circle cx="60" cy="38" r="14" />
            <circle cx="42" cy="22" r="16" />
            <circle cx="26" cy="22" r="11" />
            <circle cx="60" cy="22" r="11" />
            <circle cx="42" cy="38" r="15" />
            <path className="scrap__swirl" d="M30 30c4-6 12-6 15-1s-2 10-7 9M52 24c3 2 4 6 1 9" />
          </svg>
          {[1, 2, 3, 4].map((i) => (
            <b key={i} className={`scrap__star scrap__star--${i}`}>
              ★
            </b>
          ))}
        </span>
      )}
    </div>
  );
}

const place = (el: HTMLElement | null, at: Body) => {
  if (el) el.style.transform = `translate(${at.x.toFixed(1)}px, ${(-at.y).toFixed(1)}px)`;
};

/** `el`'s cat turns its head toward `to` (the seat's cat reads --look-x and --look-y). */
const look = (el: HTMLElement | null, from: Body & { right: boolean }, to: Body | null) => {
  if (!el) return;
  let x = 0;
  let y = 0;
  if (to) {
    const dx = to.x - from.x;
    const dy = from.y + HEAD_UP - to.y;
    const reach = Math.hypot(dx, dy) + 70;
    // A cat turned round has its picture mirrored, and its head's lean with it.
    x = ((from.right ? -1 : 1) * dx) / reach;
    y = dy / reach;
  }
  el.style.setProperty("--look-x", x.toFixed(3));
  el.style.setProperty("--look-y", y.toFixed(3));
};

/**
 * The badge's cat down on the taskbar: off its seat, up to something (scenes.ts), and back up
 * into its seat again.
 */
export function Stroll() {
  const catRef = useRef<HTMLDivElement>(null);
  const guestRef = useRef<HTMLDivElement>(null);
  const scrapRef = useRef<HTMLDivElement>(null);
  const [cat, setCat] = useState<View>(AT_REST);
  const [guest, setGuest] = useState<GuestView>(NO_GUEST);
  const [scrap, setScrap] = useState<ScrapView>(NO_SCRAP);
  const [fat, setFat] = useState(0);
  // Whoever comes visiting: another kind of cat, of its own girth.
  const [visitor, setVisitor] = useState({ breed: "gray", fat: 0 });
  // Out of sight until the first outing; after one the strip itself is out of view.
  const [seen, setSeen] = useState(false);
  const cast = useRef<Cast | null>(null);
  const puppets = useMemo(
    () => ({
      cat: new Puppet<View>((patch) => setCat((view) => ({ ...view, ...patch }))),
      guest: new Puppet<GuestView>((patch) => setGuest((view) => ({ ...view, ...patch }))),
      scrap: new Prop<ScrapView>((patch) => setScrap((view) => ({ ...view, ...patch }))),
    }),
    [],
  );

  useEffect(() => {
    const paint = () => {
      const now = cast.current;
      if (!now) return;
      place(catRef.current, now.cat);
      place(guestRef.current, now.guest);
      place(scrapRef.current, now.scrap);
      look(catRef.current, now.cat, now.watching ? now.guest : null);
      look(guestRef.current, now.guest, now.watching ? now.cat : null);
    };
    const subscriptions = [
      onWindowEvent<StrollStart>(StrollEvents.start, (sent) => {
        cast.current?.stage.end();
        // As big as on the badge: the page is zoomed, so its own px are that much bigger.
        const zoom = sent.zoom || 1;
        document.documentElement.style.zoom = String(zoom);
        const stage = new Stage(paint);
        const now: Cast = {
          stage,
          ...puppets,
          home: sent.home / zoom,
          seat: sent.seat / zoom,
          width: sent.width / zoom,
          watching: false,
        };
        cast.current = now;
        const worn = document.documentElement.dataset.cat;
        const others = BREEDS.filter((breed) => breed !== worn);
        setFat(sent.fat);
        setVisitor({ breed: others[Math.floor(Math.random() * others.length)], fat: Math.random() * 0.5 });
        // In place before the strip comes into view, not where the last outing ended.
        setTheStage(now);
        paint();
        setSeen(true);
        stage.begin();
        void play(now, sent.kind)
          .catch((why) => {
            // Whatever went wrong down there, the badge gets its cat back.
            console.error(why);
            return true;
          })
          .then((home) => {
            stage.end();
            if (home && cast.current === now) void strollDone();
          });
      }),
      onWindowEvent(StrollEvents.hurry, () => cast.current?.stage.hurry()),
      onWindowEvent(StrollEvents.stop, () => cast.current?.stage.end()),
    ];
    return () => {
      cast.current?.stage.end();
      subscriptions.forEach((s) => void s.then((u) => u()));
    };
  }, [puppets]);

  return (
    <div className="stroll" style={{ visibility: seen ? "visible" : "hidden" }}>
      <Guest view={guest} fat={visitor.fat} breed={visitor.breed} puppetRef={guestRef} />
      <CatPuppet view={cat} fat={fat} puppetRef={catRef} />
      <Scrap view={scrap} breed={visitor.breed} scrapRef={scrapRef} />
    </div>
  );
}
