"""Cuts each pictured animal (turtle, monkey, frog, capybara) into parts that can move: its head,
arms, feet and tail come out of the picture, and where they were on the body is filled in from
the colors round it, so a part can move a little without leaving a hole behind it.

Every part is saved at the picture's own size (176 x 176), in place, into
src/lib/animals/<animal>/rig/, so the parts stack back into the whole picture. RIGS also gives
each part's pivot (where it turns), which cats.tsx turns into transform-origins.
Run it again after changing a picture or a cut: python scripts/rig_animals.py (needs Pillow,
NumPy and OpenCV).
"""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

ANIMALS = Path(__file__).resolve().parent.parent / "src" / "lib" / "animals"
SIZE = 176

# For each animal, its parts: the outline to cut (in the picture's 176-px space) and the pivot.
# Order matters: an earlier part keeps the pixels it shares with a later one.
RIGS = {
    "turtle": {
        "picture": "happy.png",
        "parts": {
            "arm-l": ([(6, 48), (44, 50), (48, 72), (42, 94), (20, 97), (6, 82)], (40, 88)),
            "arm-r": ([(90, 74), (112, 62), (142, 62), (144, 80), (120, 102), (92, 106)], (98, 98)),
            "foot-l": ([(34, 136), (68, 138), (68, 176), (32, 176)], (56, 140)),
            "foot-r": ([(92, 138), (130, 136), (132, 176), (90, 176)], (102, 142)),
            "head": ([(28, 6), (128, 6), (128, 64), (112, 70), (90, 80), (50, 82), (30, 74)], (78, 80)),
        },
        "eyes": [(53, 40, 7.5, 9), (95, 48, 7.5, 9)],
    },
    "monkey": {
        "picture": "happy.png",
        "parts": {
            "arm-r": ([(118, 106), (136, 84), (164, 84), (164, 114), (142, 122), (124, 126)], (122, 122)),
            "tail": ([(8, 106), (48, 102), (54, 124), (50, 154), (8, 154)], (56, 140)),
            "foot-l": ([(54, 156), (90, 156), (92, 176), (52, 176)], (76, 158)),
            "foot-r": ([(94, 156), (128, 156), (130, 176), (92, 176)], (108, 158)),
            "head": ([(12, 8), (162, 8), (162, 82), (138, 84), (130, 104), (100, 112), (60, 112), (28, 106), (12, 96)], (90, 112)),
        },
        "eyes": [],
    },
    "frog": {
        "picture": "happy.png",
        "parts": {
            "arm-l": ([(28, 84), (60, 92), (70, 112), (50, 122), (28, 110)], (64, 110)),
            "arm-r": ([(118, 108), (142, 98), (154, 86), (168, 88), (164, 114), (128, 122)], (122, 112)),
            "foot-l": ([(32, 140), (76, 140), (78, 176), (30, 176)], (64, 146)),
            "foot-r": ([(100, 140), (146, 140), (148, 176), (98, 176)], (112, 146)),
            "head": ([(36, 26), (164, 26), (164, 84), (142, 100), (110, 106), (76, 106), (54, 100), (36, 90)], (92, 106)),
        },
        "eyes": [(74, 61.5, 14.5, 14), (131, 69.5, 14.5, 14)],
    },
    "capybara": {
        "picture": "happy.png",
        "parts": {
            "arm-l": ([(26, 78), (58, 82), (68, 106), (54, 118), (32, 110)], (60, 108)),
            "arm-r": ([(130, 104), (148, 90), (172, 94), (170, 126), (142, 128)], (136, 116)),
            "foot-l": ([(36, 152), (76, 152), (78, 176), (34, 176)], (60, 156)),
            "foot-r": ([(110, 152), (152, 152), (154, 176), (108, 176)], (124, 156)),
            "head": ([(28, 22), (166, 22), (166, 86), (150, 96), (120, 104), (70, 106), (44, 98), (28, 88)], (96, 104)),
        },
        "eyes": [(71, 60.5, 9.5, 10), (124, 73, 9.5, 10)],
    },
}


def polygon_mask(points):
    canvas = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(canvas).polygon(points, fill=255)
    return np.asarray(canvas) > 0


def cut(animal, rig):
    folder = ANIMALS / animal
    out = folder / "rig"
    out.mkdir(exist_ok=True)
    rgba = np.asarray(Image.open(folder / rig["picture"]).convert("RGBA")).copy()
    alpha = rgba[..., 3] > 0
    taken = np.zeros(alpha.shape, bool)
    for name, (points, _pivot) in rig["parts"].items():
        mask = polygon_mask(points) & alpha & ~taken
        taken |= mask
        part = rgba.copy()
        part[..., 3] = np.where(mask, part[..., 3], 0)
        Image.fromarray(part).save(out / f"{name}.png", optimize=True)
    # The body: everything else. Where a part sat on top of the body, fill in from round it.
    rest = alpha & ~taken
    # The body's own outline, notches where parts came out closed up: filled in there.
    hull = cv2.morphologyEx(rest.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8)).astype(bool)
    # And a band under every edge where a part meets the body, so turning it opens no gap.
    band = cv2.dilate(rest.astype(np.uint8), np.ones((11, 11), np.uint8)).astype(bool)
    fill = taken & alpha & (hull | band)
    body = rgba.copy()
    body[..., 3] = np.where(rest | fill, 255, 0)
    body[..., 3] = np.where(rest, rgba[..., 3], body[..., 3])
    rgb = cv2.inpaint(np.ascontiguousarray(rgba[..., :3]), fill.astype(np.uint8) * 255, 6, cv2.INPAINT_TELEA)
    body[..., :3] = np.where(fill[..., None], rgb, rgba[..., :3])
    Image.fromarray(body).save(out / "body.png", optimize=True)
    # The skin round its open eyes, for its eyelids.
    lids = []
    for x, y, rx, ry in rig["eyes"]:
        ring = np.zeros(alpha.shape, np.uint8)
        cv2.ellipse(ring, (int(x), int(y)), (int(rx + 4), int(ry + 4)), 0, 0, 360, 1, 3)
        light = rgba[..., :3].astype(int).sum(axis=2) > 360
        colors = rgba[..., :3][(ring > 0) & alpha & light]
        skin = np.median(colors, axis=0).astype(int).tolist() if len(colors) else [200, 200, 200]
        lids.append({"x": x, "y": y, "rx": rx, "ry": ry, "color": "#%02x%02x%02x" % tuple(skin)})
    return {
        "parts": {name: [round(p[0] / SIZE * 100, 1), round(p[1] / SIZE * 100, 1)] for name, (_pts, p) in rig["parts"].items()},
        "lids": lids,
    }


def main():
    pivots = {animal: cut(animal, rig) for animal, rig in RIGS.items()}
    print(json.dumps(pivots, indent=1))


if __name__ == "__main__":
    main()
