"""Draws the capybara's cursors: its stubby brown paws.

The paws are the monkey's hands (monkey_cursors.py) in the capybara's colors, rendered the same way
into src/lib/cursors/capybara/. recolor_cats.py reads HOTSPOTS for cat-art.css. Run it again after
changing a drawing: python scripts/capybara_cursors.py (needs Pillow and Chrome or Edge).
"""

import tempfile
from pathlib import Path

import monkey_cursors as hands
from turtle_cursors import RENDER_SCALE, browser, render, shrink

OUT = Path(__file__).resolve().parent.parent / "src" / "lib" / "cursors" / "capybara"

hands.LINE = "#5a3518"
hands.SKIN = "#d99a5e"
hands.CREASE = "#b0743f"
hands.FUR = "#b8783f"
hands.BANANA = "#ffa94d"

# The drawings are made when monkey_cursors is loaded: made again, now in the frog's colors.
CURSORS = {
    "paw": hands.pointing(),
    "pointer": hands.with_drawing(hands.pointing(extra=(4.5, 4.5, 0, 0)), before=hands._taps(*hands.pointing(extra=(4.5, 4.5, 0, 0))[2:4])),
    "grab": None,
    "grabbing": None,
    "text": (16, 32, 8, 16, hands.i_beam()),
    "cross": (32, 32, 12, 12, hands.crosshair(12, 12) + hands.hand(17.5, 17.5, -45, 0.4)),
    "ew": (46, 34, 23, 17, hands.arrow(2.5, 17, 180) + hands.arrow(43.5, 17, 0) + hands.centered_hand(23, 17, 90, 0.72, "open")),
    "ns": (34, 46, 17, 23, hands.arrow(17, 2.5, -90) + hands.arrow(17, 43.5, 90) + hands.centered_hand(17, 23, 0, 0.72, "open")),
    "move": (50, 50, 25, 25, hands.arrow(2.5, 25, 180) + hands.arrow(47.5, 25, 0) + hands.arrow(25, 2.5, -90)
             + hands.arrow(25, 47.5, 90) + hands.centered_hand(25, 25, 0, 0.7, "fist")),
    "corner": (42, 42, 21, 21, hands.arrow(3, 3, -135) + hands.arrow(39, 3, -45) + hands.arrow(3, 39, 135)
               + hands.arrow(39, 39, 45) + hands.centered_hand(21, 21, -45, 0.66, "open")),
    "blocked": hands.with_drawing(hands.pointing(extra=(0, 0, 3, 0)), after=hands.no_entry(hands.pointing(extra=(0, 0, 3, 0))[0] - 6.2, 6.6)),
}
_grab = hands.pointing("open", 0)
_grabbing = hands.pointing("fist", 0)
CURSORS["grab"] = (_grab[0], _grab[1], _grab[0] // 2, _grab[1] // 3, _grab[4])
CURSORS["grabbing"] = (_grabbing[0], _grabbing[1], _grabbing[0] // 2, _grabbing[1] // 3, _grabbing[4])
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
