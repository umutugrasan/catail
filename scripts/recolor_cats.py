"""Paints the orange cat and paw cursors in the other cat colors, and writes src/lib/cat-art.css.

Other animals bring their own pictures (src/lib/animals/<name>/*.svg) and cursors
(scripts/<name>_cursors.py); only their CSS is written here. "Kendi kedin" is painted in the
app itself (customCat.ts).

The art is drawn in flat tones, so each pixel is sorted by what it is (fur, pale belly, pink
pad, black eye) and moved along that cat's tones, keeping the original's shading. Run it again
after changing the art: python scripts/recolor_cats.py (needs Pillow and NumPy).
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from monkey_cursors import HOTSPOTS as MONKEY_HOTSPOTS
from turtle_cursors import HOTSPOTS as TURTLE_HOTSPOTS

LIB = Path(__file__).resolve().parent.parent / "src" / "lib"

# Brightness (0.3 R + 0.59 G + 0.11 B) of the orange art's tones, darkest to lightest:
# cursor outline, cat outline, fur, stripes, light stripes.
FUR_STOPS = [52, 117, 170, 198, 213]
# Belly shade and belly.
PALE_STOPS = [190, 240]


def rgb(hex_color):
    return np.array([int(hex_color[i : i + 2], 16) for i in (1, 3, 5)], dtype=float)


def tones(*colors):
    return np.array([rgb(c) for c in colors])


GRAY = {
    "fur": tones("#2b2f36", "#4a5059", "#8e96a3", "#5f6672", "#6d7480"),
    "pale": tones("#c9ced6", "#f1f3f6"),
    "eye": None,
    "line": None,
}
WHITE = {
    "fur": tones("#6d6670", "#8b8580", "#fbf8f4", "#ece5dc", "#f4efe8"),
    "pale": tones("#e8e0d8", "#ffffff"),
    "eye": None,
    "line": None,
}
BLACK = {
    "fur": tones("#c9c4cf", "#8b8694", "#26242a", "#3a3740", "#3f3c45"),
    "pale": tones("#34313a", "#45414c"),
    "eye": rgb("#f2c94c"),
    "line": rgb("#cfcad6"),
}
# Calico: a cream cat with orange and black patches.
CALICO_CREAM = tones("#3a2a1e", "#4a3526", "#fff4e6", "#f8e6cf", "#fbeedd")
CALICO_ORANGE = tones("#3a2a1e", "#4a3526", "#f39a3d", "#f8c060", "#f8d090")
CALICO_BLACK = tones("#3a2a1e", "#4a3526", "#2b2622", "#3a342e", "#433c35")
CALICO_PALE = tones("#e8dccb", "#fffaf2")

# Calico patches, per picture: (x, y, radius) as fractions of its size, painted in this order.
CALICO_PATCHES = {
    "standing-body": {
        "orange": [(0.34, 0.06, 0.15), (0.78, 0.44, 0.15), (0.97, 0.62, 0.14)],
        "black": [(0.66, 0.15, 0.11), (0.72, 0.78, 0.13), (0.84, 0.6, 0.07)],
    },
    "box-head": {
        "orange": [(0.17, 0.2, 0.15)],
        "black": [(0.8, 0.2, 0.15)],
    },
    "foot-left": {"orange": [], "black": []},
    "foot-right": {"orange": [], "black": []},
}


def stops_map(gray, stops, colors):
    return np.stack([np.interp(gray, stops, colors[:, i]) for i in range(3)], axis=-1)


def components(mask):
    """Sizes of connected regions of a boolean mask, as a same-shaped array of region sizes."""
    h, w = mask.shape
    sizes = np.zeros(mask.shape, dtype=int)
    seen = np.zeros(mask.shape, dtype=bool)
    for start_y, start_x in zip(*np.nonzero(mask)):
        if seen[start_y, start_x]:
            continue
        stack = [(start_y, start_x)]
        seen[start_y, start_x] = True
        cells = []
        while stack:
            y, x = stack.pop()
            cells.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        for cell in cells:
            sizes[cell] = len(cells)
    return sizes


def sort_pixels(pixels):
    """Masks for: dark (eyes, lines), pink (pads, cheeks), pale (belly) and fur."""
    r, g, b = pixels[..., 0] / 255, pixels[..., 1] / 255, pixels[..., 2] / 255
    top = np.max([r, g, b], axis=0)
    low = np.min([r, g, b], axis=0)
    chroma = top - low
    sat = np.where(top > 0, chroma / np.maximum(top, 1e-6), 0)
    hue = np.zeros(top.shape)
    safe = np.maximum(chroma, 1e-6)
    is_r = top == r
    is_g = (top == g) & ~is_r
    is_b = ~is_r & ~is_g
    hue[is_r] = (60 * ((g - b) / safe) % 360)[is_r]
    hue[is_g] = (60 * ((b - r) / safe) + 120)[is_g]
    hue[is_b] = (60 * ((r - g) / safe) + 240)[is_b]

    dark = top < 0.25
    pink = ~dark & (sat > 0.15) & (top > 0.6) & ((hue <= 13) | (hue >= 320))
    pale = ~dark & ~pink & (sat < 0.2)
    fur = ~dark & ~pink & ~pale
    return dark, pink, pale, fur


def recolor(image, cat, name):
    data = np.array(image.convert("RGBA"), dtype=float)
    pixels = data[..., :3]
    alpha = data[..., 3]
    gray = 0.3 * pixels[..., 0] + 0.59 * pixels[..., 1] + 0.11 * pixels[..., 2]
    dark, _pink, pale, fur = sort_pixels(pixels)
    out = pixels.copy()

    if cat == "calico":
        out[fur] = stops_map(gray, FUR_STOPS, CALICO_CREAM)[fur]
        out[pale] = stops_map(gray, PALE_STOPS, CALICO_PALE)[pale]
        h, w = gray.shape
        ys, xs = np.mgrid[0:h, 0:w]
        fx, fy = xs / w, ys / h
        # A wavy edge, so patches don't read as circles.
        wobble = 0.012 * np.sin(fx * 31) + 0.012 * np.cos(fy * 27)
        patches = CALICO_PATCHES.get(name)
        if patches is None:
            # Paws and cursors: the fur splits into an orange and a black side.
            orange = fx < 0.5
            black = ~orange
        else:
            inside = lambda spots: np.any(
                [np.zeros(gray.shape, dtype=bool)] + [np.hypot(fx - x, fy - y) + wobble < r for x, y, r in spots],
                axis=0,
            )
            orange = inside(patches["orange"])
            black = inside(patches["black"])
        for mask, ramp in ((orange, CALICO_ORANGE), (black, CALICO_BLACK)):
            spot = fur & mask
            out[spot] = stops_map(gray, FUR_STOPS, ramp)[spot]
    else:
        palette = {"gray": GRAY, "white": WHITE, "black": BLACK}[cat]
        out[fur] = stops_map(gray, FUR_STOPS, palette["fur"])[fur]
        out[pale] = stops_map(gray, PALE_STOPS, palette["pale"])[pale]
        if palette["eye"] is not None:
            solid = dark & (alpha > 100)
            sizes = components(solid)
            big = sizes >= max(30, gray.size * 0.002)
            out[solid & big] = palette["eye"]
            out[solid & ~big] = palette["line"]
            # Faint edge pixels of those lines.
            out[dark & ~solid] = palette["line"]

    data[..., :3] = np.clip(out, 0, 255)
    return Image.fromarray(data.astype(np.uint8), "RGBA")


CATS = ["gray", "white", "calico", "black"]
# Animals with pictures and cursors of their own, drawn by scripts/<animal>_cursors.py.
ANIMALS = ["turtle", "monkey"]
ANIMAL_HOTSPOTS = {"turtle": TURTLE_HOTSPOTS, "monkey": MONKEY_HOTSPOTS}
ART = ["box-head", "standing-body", "foot-left", "foot-right"]
# Variable, file, hotspot x, hotspot y, keyword the browser falls back on.
CURSORS = [
    ("paw-default", "paw", 2, 9, "default"),
    ("paw", "pointer", 7, 7, "pointer"),
    ("paw-grab", "grab", 9, 7, "grab"),
    ("paw-grabbing", "grabbing", 9, 4, "grabbing"),
    ("paw-text", "text", 7, 16, "text"),
    ("paw-cross", "cross", 16, 18, "crosshair"),
    ("paw-ew", "ew", 22, 15, "ew-resize"),
    ("paw-move", "move", 26, 25, "move"),
    ("paw-ns", "ns", 14, 22, "ns-resize"),
    ("paw-nwse", "corner", 18, 18, "nwse-resize"),
    ("paw-nesw", "corner", 18, 18, "nesw-resize"),
    ("paw-blocked", "blocked", 8, 5, "not-allowed"),
]


ART_VARS = (
    ("box-head", "cat-head"),
    ("standing-body", "cat-body"),
    ("foot-left", "cat-foot-left"),
    ("foot-right", "cat-foot-right"),
)


# An animal's pictures that aren't drawn as SVG: its whole standing figure is a picture.
ANIMAL_PICTURES = {
    "turtle": {"standing-body": "happy.png"},
    "monkey": {"standing-body": "wink.png", "box-head": "box-head.png"},
}


def css_block(selector, folder, art=None, custom=False):
    """`art`: another animal's own pictures and cursors. `custom`: the app sets --custom-*
    (customCat.ts); until then it looks like the orange cat."""
    prefix = f"{folder}/" if folder else ""
    lines = [f"{selector} {{"]
    for name, var in ART_VARS:
        own = ANIMAL_PICTURES.get(art, {}).get(name, f"{name}.svg")
        picture = f'url("./animals/{art}/{own}")' if art else f'url("./cats/{prefix}{name}.png")'
        lines.append(f"  --{var}: var(--custom-{var}, {picture});" if custom else f"  --{var}: {picture};")
    for var, file, x, y, keyword in CURSORS:
        if art:
            x, y = ANIMAL_HOTSPOTS[art][file]
        cursor = (
            f'image-set(url("./cursors/{prefix}{file}.png") 1x, '
            f'url("./cursors/{prefix}{file}@2x.png") 2x) {x} {y}, {keyword}'
        )
        lines.append(f"  --{var}: var(--custom-{var}, {cursor});" if custom else f"  --{var}: {cursor};")
    lines.append("}")
    return "\n".join(lines)


def main():
    if "--css-only" not in sys.argv:
        recolor_all()
    write_css()


def recolor_all():
    for cat in CATS:
        (LIB / "cats" / cat).mkdir(exist_ok=True)
        (LIB / "cursors" / cat).mkdir(exist_ok=True)
        for name in ART:
            source = Image.open(LIB / "cats" / f"{name}.png")
            recolor(source, cat, name).save(LIB / "cats" / cat / f"{name}.png", optimize=True)
        for path in (LIB / "cursors").glob("*.png"):
            recolor(Image.open(path), cat, path.stem).save(LIB / "cursors" / cat / path.name, optimize=True)


def write_css():
    header = "/* Generated by scripts/recolor_cats.py: each cat's pictures and paw cursors. */"
    blocks = [css_block(':root,\n[data-cat="orange"]', "")]
    blocks += [css_block(f'[data-cat="{cat}"]', cat) for cat in CATS]
    blocks += [css_block(f'[data-cat="{animal}"]', animal, art=animal) for animal in ANIMALS]
    blocks.append(css_block('[data-cat="custom"]', "", custom=True))
    # The plain theme uses the system's own pointers, and has no cat pictures to set.
    plain = [f"  --{var}: {keyword};" for var, _file, _x, _y, keyword in CURSORS]
    blocks.append('[data-cat="plain"] {\n' + "\n".join(plain) + "\n}")
    (LIB / "cat-art.css").write_text(header + "\n" + "\n\n".join(blocks) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
