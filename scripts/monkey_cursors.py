"""Draws the monkey's cursors: a monkey's hand where the cats have a paw.

Each cursor is an SVG built here, rendered by headless Chrome at 8x and scaled down to the 1x
and 2x PNGs in src/lib/cursors/monkey/ (the rendering is turtle_cursors.py's). recolor_cats.py
reads HOTSPOTS for cat-art.css. Run it again after changing a drawing:
python scripts/monkey_cursors.py (needs Pillow and Chrome or Edge).
"""

import math
import tempfile
from pathlib import Path

from turtle_cursors import RENDER_SCALE, browser, render, shrink

OUT = Path(__file__).resolve().parent.parent / "src" / "lib" / "cursors" / "monkey"

LINE = "#3e220d"
SKIN = "#f4cfa6"
CREASE = "#c99a6b"
FUR = "#9b6233"
BANANA = "#ffd65c"
STOP = "#e5484d"

# A hand drawn upright, fingertip (the hotspot) at (0, 0), wrist down at +y. Each pose is a list
# of parts, drawn in order: ("finger", x0, y0, x1, y1, width) a rounded stroke, ("blob", cx, cy,
# rx, ry) an oval, ("cuff", cx, cy, rx, ry) the furry wrist.
POSES = {
    # The index finger out, the others curled under the palm, the thumb along the side.
    "point": [
        ("cuff", 6.2, 27.5, 7.4, 3.6),
        ("blob", 6.2, 20.5, 7.6, 6.8),
        ("finger", 0, 2.4, 0, 15, 5.4),
        ("finger", -3.4, 20, -3.8, 13.8, 4.2),
        ("knuckle", 4.2, 15.6, 2.6),
        ("knuckle", 8.6, 16.2, 2.5),
        ("knuckle", 12.4, 17.6, 2.3),
    ],
    # Open, the fingers spread, ready to grab.
    "open": [
        ("cuff", 0, 27.5, 7.4, 3.6),
        ("finger", -7.4, 13, -12.2, 6.8, 4.4),
        ("finger", -3.6, 9, -4.6, 1.6, 4.6),
        ("finger", 0.6, 8.4, 0.9, 0.6, 4.6),
        ("finger", 4.6, 9.2, 6.2, 2.4, 4.4),
        ("finger", 7.6, 11.6, 10.6, 6.4, 4),
        ("blob", 0, 17.5, 8.4, 8),
    ],
    # Holding on: a fist, the fingers wrapped round.
    "fist": [
        ("cuff", 0, 23.5, 7.4, 3.6),
        ("blob", 0, 14.5, 8.6, 8),
        ("knuckle", -5.6, 7.6, 2.8),
        ("knuckle", -1.8, 6.4, 2.8),
        ("knuckle", 2.1, 6.4, 2.8),
        ("knuckle", 5.8, 7.6, 2.7),
        ("finger", -8.4, 15.6, -4.4, 12.2, 4),
    ],
}


def _turn(x, y, angle, scale):
    a = math.radians(angle)
    x, y = x * scale, y * scale
    return x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)


def _outline(part):
    """Points round a part, for working out a drawing's bounds."""
    kind = part[0]
    if kind == "finger":
        _, x0, y0, x1, y1, w = part
        r = w / 2 + 1.3
        return [(x + r * math.cos(t), y + r * math.sin(t)) for x, y in ((x0, y0), (x1, y1))
                for t in (i * math.pi / 6 for i in range(12))]
    if kind == "knuckle":
        _, cx, cy, r = part
        rx = ry = r
    else:
        _, cx, cy, rx, ry = part
    return [(cx + (rx + 1.3) * math.cos(t), cy + (ry + 1.3) * math.sin(t)) for t in (i * math.pi / 8 for i in range(16))]


def bounds(pose, angle, scale=1.0):
    pts = [_turn(x, y, angle, scale) for part in POSES[pose] for x, y in _outline(part)]
    return min(x for x, _ in pts), min(y for _, y in pts), max(x for x, _ in pts), max(y for _, y in pts)


def hand(x, y, angle=0.0, scale=1.0, pose="point"):
    """A hand with its fingertip (for "point") at (x, y), turned by `angle` (0: pointing up).
    Each part is drawn twice: all the outlines first, then all the skin, so the parts merge."""
    under, over = [], []
    for part in POSES[pose]:
        kind = part[0]
        if kind == "finger":
            _, x0, y0, x1, y1, w = part
            d = f"M{x0} {y0}L{x1} {y1}"
            under.append(f'<path d="{d}" stroke="{LINE}" stroke-width="{w + 2.4}" stroke-linecap="round"/>')
            over.append(f'<path d="{d}" stroke="{SKIN}" stroke-width="{w}" stroke-linecap="round"/>')
        elif kind == "knuckle":
            _, cx, cy, r = part
            under.append(f'<circle cx="{cx}" cy="{cy}" r="{r + 1.2}" fill="{LINE}"/>')
            over.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{SKIN}"/>')
        elif kind == "blob":
            _, cx, cy, rx, ry = part
            under.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx + 1.2}" ry="{ry + 1.2}" fill="{LINE}"/>')
            over.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{SKIN}"/>')
            over.append(
                f'<path d="M{cx - rx * 0.45} {cy + ry * 0.15}q{rx * 0.45} {ry * 0.3} {rx * 0.9} 0" fill="none" '
                f'stroke="{CREASE}" stroke-width="1" stroke-linecap="round"/>'
            )
        elif kind == "cuff":
            _, cx, cy, rx, ry = part
            under.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx + 1.2}" ry="{ry + 1.2}" fill="{LINE}"/>')
            fuzz = "".join(
                f'<circle cx="{cx + rx * math.cos(t):.2f}" cy="{cy + ry * math.sin(t):.2f}" r="1.4" fill="{FUR}"/>'
                for t in (i * math.pi / 5 for i in range(10))
            )
            over.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{FUR}"/>' + fuzz)
    return (
        f'<g transform="translate({x:.2f} {y:.2f}) rotate({angle}) scale({scale})">'
        + "".join(under)
        + "".join(over)
        + "</g>"
    )


def centered_hand(cx, cy, angle=0.0, scale=1.0, pose="point"):
    x0, y0, x1, y1 = bounds(pose, angle, scale)
    return hand(cx - (x0 + x1) / 2, cy - (y0 + y1) / 2, angle, scale, pose)


def arrow(x, y, angle):
    """A banana-yellow arrow whose tip is at (x, y), pointing along `angle` degrees (0 = right)."""
    return (
        f'<path transform="translate({x} {y}) rotate({angle})" '
        'd="M0 0L-5.2-4.6V-2H-9.4V2H-5.2V4.6Z" '
        f'fill="{BANANA}" stroke="{LINE}" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"/>'
    )


def strokes(d, color=LINE, width=1.4):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'


def i_beam():
    """The text cursor: a stem held by a little fist at each end."""
    stem = (
        f'<rect x="6.6" y="4" width="2.8" height="24" rx="1.4" fill="{BANANA}" stroke="{LINE}" '
        'stroke-width="1.6" paint-order="stroke"/>'
    )
    fists = centered_hand(8, 4.6, 90, 0.3, "fist") + centered_hand(8, 27.4, -90, 0.3, "fist")
    return stem + fists


def crosshair(cx, cy):
    ticks = "".join(
        f'<path transform="translate({cx} {cy}) rotate({a})" d="M0-3.4V-9.6" stroke="{LINE}" '
        'stroke-width="3.6" stroke-linecap="round"/>'
        f'<path transform="translate({cx} {cy}) rotate({a})" d="M0-3.4V-9.6" stroke="{BANANA}" '
        'stroke-width="1.5" stroke-linecap="round"/>'
        for a in (0, 90, 180, 270)
    )
    dot = f'<circle cx="{cx}" cy="{cy}" r="1.5" fill="{STOP}" stroke="{LINE}" stroke-width="1.1"/>'
    return ticks + dot


def no_entry(cx, cy, r=5.4):
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#fff" stroke="{LINE}" stroke-width="1.5"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r - 1.6}" fill="none" stroke="{STOP}" stroke-width="1.8"/>'
        f'<path d="M{cx - 2.6} {cy + 2.6}L{cx + 2.6} {cy - 2.6}" stroke="{STOP}" stroke-width="1.8"/>'
    )


# The arrow cursor's tilt: fingertip up and to the left, wrist down to the right.
POINTING = -28


def pointing(pose="point", angle=POINTING, extra=(0, 0, 0, 0)):
    """A tilted hand cursor: (width, height, hotspot x, hotspot y, drawing), the hotspot on the
    fingertip. `extra` makes room (left, top, right, bottom) for things drawn around it."""
    x0, y0, x1, y1 = bounds(pose, angle)
    left, top, right, bottom = extra
    hx, hy = left - x0, top - y0
    width, height = math.ceil(hx + x1 + right), math.ceil(hy + y1 + bottom)
    return width, height, round(hx), round(hy), hand(hx, hy, angle, pose=pose)


def with_drawing(cursor, before="", after=""):
    width, height, x, y, drawing = cursor
    return width, height, x, y, before + drawing + after


_paw = pointing()
_pointer = pointing(extra=(4.5, 4.5, 0, 0))
_blocked = pointing(extra=(0, 0, 3, 0))
_grab = pointing("open", 0)
_grabbing = pointing("fist", 0)


def _taps(x, y):
    """Little lines round the fingertip: it's tapping."""
    return strokes(f"M{x - 4.2} {y - 1.4}l-2.4-1M{x - 2.6} {y - 4}l-1.4-2.2M{x + 0.6} {y - 4.6}v-2.6")


# File name: (width, height, hotspot x, hotspot y, drawing), in 1x pixels.
CURSORS = {
    "paw": _paw,
    "pointer": with_drawing(_pointer, before=_taps(*_pointer[2:4])),
    "grab": (_grab[0], _grab[1], _grab[0] // 2, _grab[1] // 3, _grab[4]),
    "grabbing": (_grabbing[0], _grabbing[1], _grabbing[0] // 2, _grabbing[1] // 3, _grabbing[4]),
    "text": (16, 32, 8, 16, i_beam()),
    "cross": (32, 32, 12, 12, crosshair(12, 12) + hand(17.5, 17.5, -45, 0.4)),
    "ew": (46, 34, 23, 17, arrow(2.5, 17, 180) + arrow(43.5, 17, 0) + centered_hand(23, 17, 90, 0.72, "open")),
    "ns": (34, 46, 17, 23, arrow(17, 2.5, -90) + arrow(17, 43.5, 90) + centered_hand(17, 23, 0, 0.72, "open")),
    "move": (50, 50, 25, 25, arrow(2.5, 25, 180) + arrow(47.5, 25, 0) + arrow(25, 2.5, -90)
             + arrow(25, 47.5, 90) + centered_hand(25, 25, 0, 0.7, "fist")),
    "corner": (42, 42, 21, 21, arrow(3, 3, -135) + arrow(39, 3, -45) + arrow(3, 39, 135) + arrow(39, 39, 45)
               + centered_hand(21, 21, -45, 0.66, "open")),
    "blocked": with_drawing(_blocked, after=no_entry(_blocked[0] - 6.2, 6.6)),
}
HOTSPOTS = {name: (x, y) for name, (_w, _h, x, y, _d) in CURSORS.items()}


def main():
    exe = browser()
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for name, (width, height, _x, _y, drawing) in CURSORS.items():
            svg = (
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
                f'width="{width * RENDER_SCALE}" height="{height * RENDER_SCALE}">{drawing}</svg>'
            )
            big = render(exe, svg, width, height, work)
            shrink(big, width, height).save(OUT / f"{name}.png", optimize=True)
            shrink(big, width * 2, height * 2).save(OUT / f"{name}@2x.png", optimize=True)
            print(name, width, height, HOTSPOTS[name])


if __name__ == "__main__":
    main()
