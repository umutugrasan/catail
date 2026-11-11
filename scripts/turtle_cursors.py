"""Draws the sea turtle's cursors: a flipper where the cats have a paw.

Each cursor is an SVG built here, rendered by headless Chrome at 8x and scaled down to the 1x
and 2x PNGs in src/lib/cursors/turtle/. recolor_cats.py reads HOTSPOTS for cat-art.css.
Run it again after changing a drawing: python scripts/turtle_cursors.py (needs Pillow and
Chrome or Edge).
"""

import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "src" / "lib" / "cursors" / "turtle"
RENDER_SCALE = 8
WINDOW = 800

LINE = "#1d3229"
SKIN = "#9ad3b5"
PLATE = "#78b996"
SHINE = "#c9eedb"
SHADE = "#6fae8d"
CREAM = "#f5e6b8"
CORAL = "#fb8f96"
WATER = "#5fb7cc"
STOP = "#e5484d"

# A sea turtle's front flipper, drawn lying down like a wing: the arm's blunt end at x = 0,
# the tip at the right. The leading edge (top) is long and gently convex; the trailing edge
# swells into a broad heel near the arm and sweeps in, concave, to a long pointed tip.
PADDLE = [
    (0, -10),
    (26, -20), (70, -24), (112, -6),
    (86, -4), (62, 2), (48, 14),
    (40, 22), (26, 30), (12, 24),
    (4, 21), (1, 17), (0, 12),
    (-7, 12), (-7, -10), (0, -10),
]
PADDLE_TIP = (112, -6)
# Horny plates (centre x, y, radius), biggest near the arm.
PADDLE_PLATES = [(14, 2, 7.5), (32, 8, 7.5), (28, -9, 6.5), (47, -5, 7), (64, -9, 5.4), (80, -9, 4.2),
                 (94, -7, 2.8)]
PADDLE_SHINE = [(6, -12), (26, -18), (56, -21), (86, -14)]
PADDLE_SHADE = [(6, 19), (22, 25), (40, 19), (60, 3)]
LENGTH = 31.0
# Where the flipper bends when it presses, and how far its outer part curls.
BEND_FROM = 50
BEND_DEGREES = 40


def _bend(point, degrees):
    x, y = point
    if not degrees or x <= BEND_FROM:
        return point
    a = math.radians(degrees * (x - BEND_FROM) / (PADDLE_TIP[0] - BEND_FROM))
    dx, dy = x - BEND_FROM, y
    return (BEND_FROM + dx * math.cos(a) - dy * math.sin(a), dx * math.sin(a) + dy * math.cos(a))


def _place(points, bend=0):
    """Paddle points into flipper space: tip at (0, 0), the arm straight below it."""
    tx, ty = PADDLE_TIP
    k = LENGTH / math.hypot(tx, ty)
    # Turns the tip-to-arm direction (-tx, -ty) to point down (+y).
    turn = math.pi / 2 - math.atan2(-ty, -tx)
    c, s = math.cos(turn), math.sin(turn)
    placed = []
    for point in points:
        x, y = _bend(point, bend)
        x, y = x - tx, y - ty
        placed.append((k * (x * c - y * s), k * (x * s + y * c)))
    return placed


def _f(points):
    return " ".join(f"{x:.2f} {y:.2f}" for x, y in points)


def _curve(points):
    return f"M{_f(points[:1])}" + "".join(f"C{_f(points[i:i + 3])}" for i in range(1, len(points) - 2, 3))


class Shape:
    """A flipper ready to draw, in flipper space."""

    def __init__(self, bend=0):
        self.points = _place(PADDLE, bend)
        self.outline = _curve(self.points) + "Z"
        self.plates = []
        for cx, cy, r in PADDLE_PLATES:
            hexagon = [
                (cx + r * math.cos(math.radians(30 + 60 * i)), cy + r * math.sin(math.radians(30 + 60 * i)))
                for i in range(6)
            ]
            self.plates.append(f"M{_f(_place(hexagon, bend))}Z")
        self.shine = _curve(_place(PADDLE_SHINE, bend))
        self.shade = _curve(_place(PADDLE_SHADE, bend))
        self.tip = _place([PADDLE_TIP], bend)[0]


STRAIGHT = Shape()
BENT = Shape(BEND_DEGREES)

_ids = iter(range(10_000))


def turned(point, angle, scale=1.0):
    a = math.radians(angle)
    x, y = point[0] * scale, point[1] * scale
    return (x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a))


def flipper(x, y, angle=0.0, scale=1.0, shape=STRAIGHT, details=True):
    """One flipper with its tip at (x, y), turned by `angle` (0: pointing up)."""
    clip = f"clip{next(_ids)}"
    parts = [
        f'<g transform="translate({x:.2f} {y:.2f}) rotate({angle}) scale({scale})">',
        f'<clipPath id="{clip}"><path d="{shape.outline}"/></clipPath>',
        f'<path d="{shape.outline}" fill="{SKIN}" stroke="{LINE}" stroke-width="{3.0 / scale:.2f}" '
        'stroke-linejoin="round" paint-order="stroke"/>',
    ]
    if details:
        parts.append(f'<g clip-path="url(#{clip})">')
        for plate in shape.plates:
            parts.append(
                f'<path d="{plate}" fill="{PLATE}" stroke="{PLATE}" stroke-width="{0.9 / scale:.2f}" '
                'stroke-linejoin="round"/>'
            )
        for path, color in ((shape.shine, SHINE), (shape.shade, SHADE)):
            parts.append(
                f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{1.3 / scale:.2f}" '
                'stroke-linecap="round"/>'
            )
        parts.append("</g>")
    parts.append("</g>")
    return "".join(parts)


def bounds(shape, angle, scale=1.0):
    """Box around a flipper drawn with its tip at (0, 0), outline included."""
    pts = [turned(p, angle, scale) for p in shape.points]
    pad = 1.8
    return (min(x for x, _ in pts) - pad, min(y for _, y in pts) - pad,
            max(x for x, _ in pts) + pad, max(y for _, y in pts) + pad)


def centered_flipper(cx, cy, angle=0.0, scale=1.0):
    x0, y0, x1, y1 = bounds(STRAIGHT, angle, scale)
    return flipper(cx - (x0 + x1) / 2, cy - (y0 + y1) / 2, angle, scale)


def arrow(x, y, angle):
    """A coral arrow whose tip is at (x, y), pointing along `angle` degrees (0 = right)."""
    return (
        f'<path transform="translate({x} {y}) rotate({angle})" '
        'd="M0 0L-5.2-4.6V-2H-9.4V2H-5.2V4.6Z" '
        f'fill="{CORAL}" stroke="{LINE}" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"/>'
    )


def strokes(d, color, width=1.4):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'


def ripples(x, y):
    """Rings spreading from where the flipper touches the water."""
    arcs = []
    for r in (4.4, 7):
        a0, a1 = math.radians(-165), math.radians(-30)
        x0, y0 = x + r * math.cos(a0), y + r * math.sin(a0)
        x1, y1 = x + r * math.cos(a1), y + r * math.sin(a1)
        arcs.append(strokes(f"M{x0:.2f} {y0:.2f}A{r} {r} 0 0 1 {x1:.2f} {y1:.2f}", WATER, 1.5))
    return "".join(arcs)


def i_beam():
    """The text cursor: a stem with a little flipper spread to each side at both ends."""
    fins = []
    for y in (4.5, 27.5):
        for side in (-1, 1):
            # Tip outward, arm at the stem.
            fins.append(flipper(8 + side * 6.6, y, 90 * side, 0.22, details=False))
    stem = (
        f'<rect x="6.6" y="4" width="2.8" height="24" rx="1.4" fill="{SKIN}" stroke="{LINE}" '
        'stroke-width="1.6" paint-order="stroke"/>'
    )
    return "".join(fins) + stem


def crosshair(cx, cy):
    ticks = "".join(
        f'<path transform="translate({cx} {cy}) rotate({a})" d="M0-3.4V-9.6" stroke="{LINE}" '
        'stroke-width="3.6" stroke-linecap="round"/>'
        f'<path transform="translate({cx} {cy}) rotate({a})" d="M0-3.4V-9.6" stroke="{CREAM}" '
        'stroke-width="1.5" stroke-linecap="round"/>'
        for a in (0, 90, 180, 270)
    )
    dot = f'<circle cx="{cx}" cy="{cy}" r="1.5" fill="{CORAL}" stroke="{LINE}" stroke-width="1.1"/>'
    return ticks + dot


def no_entry(cx, cy, r=5.4):
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#fff" stroke="{LINE}" stroke-width="1.5"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r - 1.6}" fill="none" stroke="{STOP}" stroke-width="1.8"/>'
        f'<path d="M{cx - 2.6} {cy + 2.6}L{cx + 2.6} {cy - 2.6}" stroke="{STOP}" stroke-width="1.8"/>'
    )


# The arrow cursor's tilt: tip up and to the left, arm down to the right.
POINTING = -35


def pointing(shape=STRAIGHT, extra=(0, 0, 0, 0)):
    """A tilted flipper cursor: (width, height, hotspot x, hotspot y, drawing). Laid out around the
    straight flipper too, so pressing (the bent one) doesn't shift the arm; the hotspot is the
    drawn flipper's tip. `extra` makes room (left, top, right, bottom) for things drawn around it."""
    x0, y0, x1, y1 = bounds(STRAIGHT, POINTING)
    bx0, by0, bx1, by1 = bounds(shape, POINTING)
    x0, y0, x1, y1 = min(x0, bx0), min(y0, by0), max(x1, bx1), max(y1, by1)
    left, top, right, bottom = extra
    hx, hy = left - x0, top - y0
    width, height = math.ceil(hx + x1 + right), math.ceil(hy + y1 + bottom)
    tx, ty = turned(shape.tip, POINTING)
    return width, height, round(hx + tx), round(hy + ty), flipper(hx, hy, POINTING, shape=shape)


def with_drawing(cursor, before="", after=""):
    width, height, x, y, drawing = cursor
    return width, height, x, y, before + drawing + after


_paw = pointing()
_pointer = pointing(extra=(4.5, 5.5, 0, 0))
_press = pointing(BENT, extra=(0, 0, 5, 0))
_blocked = pointing(extra=(0, 0, 3, 0))

# File name: (width, height, hotspot x, hotspot y, drawing), in 1x pixels.
CURSORS = {
    "paw": _paw,
    "pointer": with_drawing(_pointer, before=ripples(*_pointer[2:4])),
    "grab": (24, 40, 12, 9, strokes("M6 5L4 3.2M12 3V1M18 5L20 3.2", WATER) + flipper(12, 6, 6)),
    "grabbing": with_drawing(
        _press, after=strokes(f"M{_press[0] - 3.4} {_press[1] * 0.42}c1.4 2 1.8 4 1.4 6.2", WATER)
    ),
    "text": (16, 32, 8, 16, i_beam()),
    "cross": (32, 32, 12, 12, crosshair(12, 12) + flipper(18, 18, -45, 0.46)),
    "ew": (46, 34, 23, 17, arrow(2.5, 17, 180) + arrow(43.5, 17, 0) + centered_flipper(23, 17, 0, 0.8)),
    "ns": (34, 46, 17, 23, arrow(17, 2.5, -90) + arrow(17, 43.5, 90) + centered_flipper(17, 23, 90, 0.8)),
    "move": (50, 50, 25, 25, arrow(2.5, 25, 180) + arrow(47.5, 25, 0) + arrow(25, 2.5, -90)
             + arrow(25, 47.5, 90) + centered_flipper(25, 25, -35, 0.72)),
    "corner": (42, 42, 21, 21, arrow(3, 3, -135) + arrow(39, 3, -45) + arrow(3, 39, 135) + arrow(39, 39, 45)
               + centered_flipper(21, 21, -45, 0.72)),
    "blocked": with_drawing(_blocked, after=no_entry(_blocked[0] - 6.2, 6.6)),
}
HOTSPOTS = {name: (x, y) for name, (_w, _h, x, y, _d) in CURSORS.items()}


def browser():
    found = shutil.which("chrome") or shutil.which("msedge")
    candidates = [
        found,
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    raise SystemExit("Chrome or Edge is needed to render the cursors")


def render(exe, svg, width, height, work):
    source = work / "cursor.svg"
    shot = work / "cursor.png"
    source.write_text(svg, encoding="utf-8")
    subprocess.run(
        [
            exe,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--default-background-color=00000000",
            "--force-device-scale-factor=1",
            # Headless windows have a minimum size: render in a big one and cut the drawing out.
            f"--window-size={WINDOW},{WINDOW}",
            f"--screenshot={shot}",
            source.as_uri(),
        ],
        check=True,
        capture_output=True,
    )
    return Image.open(shot).convert("RGBA").crop((0, 0, width * RENDER_SCALE, height * RENDER_SCALE))


def shrink(big, width, height):
    # Premultiplied, so the transparent edge doesn't bleed dark into the outline.
    return big.convert("RGBa").resize((width, height), Image.LANCZOS).convert("RGBA")


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
            print(name, width, height)


if __name__ == "__main__":
    main()
