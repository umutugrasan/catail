// Shows the fist paw (--paw-press in theme.css) for as long as the left button is held.

const root = document.documentElement;
const release = () => root.classList.remove("pressing");

window.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button === 0) root.classList.add("pressing");
  },
  true,
);
window.addEventListener("pointerup", release, true);
window.addEventListener("pointercancel", release, true);
window.addEventListener("blur", release);
// A release outside the window never reaches us; the next move tells.
window.addEventListener(
  "pointermove",
  (e) => {
    if (!(e.buttons & 1)) release();
  },
  true,
);
