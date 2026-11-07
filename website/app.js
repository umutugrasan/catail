import { compareVersions, loadLatest } from "./release.js";

const CATS = ["orange", "gray", "white", "calico", "black"];
const CAT_KEY = "catail.site.cat";
// Cat pickers ship after this version. Until a newer release is out, the page says so.
const LAST_VERSION_WITHOUT_PICKER = "0.8.0";
export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- The cat: palette, paw cursors ---------- */

const CURSORS = {
  "--cur-default": ["paw", 2, 9, "default"],
  "--cur-pointer": ["pointer", 7, 7, "pointer"],
  "--cur-press": ["grabbing", 9, 4, "grabbing"],
};
const imageSetCursors = CSS.supports("cursor", 'image-set(url("a.png") 1x) 0 0, auto');

function wearCursors(cat) {
  for (const [name, [file, x, y, fallback]] of Object.entries(CURSORS)) {
    const base = `assets/cursors/${cat}/${file}`;
    const image = imageSetCursors
      ? `image-set(url("${base}.png") 1x, url("${base}@2x.png") 2x)`
      : `url("${base}.png")`;
    document.documentElement.style.setProperty(name, `${image} ${x} ${y}, ${fallback}`);
  }
}

function wearCat(cat, { remember = false } = {}) {
  document.documentElement.dataset.cat = cat;
  wearCursors(cat);
  for (const button of document.querySelectorAll("[data-pick]")) {
    button.setAttribute("aria-pressed", String(button.dataset.pick === cat));
  }
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = cat === "black" ? "#1b1a1e" : getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  if (remember) {
    try {
      localStorage.setItem(CAT_KEY, cat);
    } catch {
      // The choice just lasts until the page closes.
    }
  }
}

export function hop(element) {
  if (reducedMotion || !element) return;
  element.classList.remove("is-hopping");
  void element.offsetWidth;
  element.classList.add("is-hopping");
}

function setupCats() {
  const current = document.documentElement.dataset.cat;
  wearCat(CATS.includes(current) ? current : "orange");

  for (const button of document.querySelectorAll("[data-pick]")) {
    button.addEventListener("click", () => {
      wearCat(button.dataset.pick, { remember: true });
      hop(button.querySelector(".cat"));
      hop(document.querySelector(".cat--hero"));
    });
    // Fetch that cat's cursors first, so the paw doesn't blink away on the click.
    button.addEventListener(
      "pointerenter",
      () => {
        for (const [file] of Object.values(CURSORS)) new Image().src = `assets/cursors/${button.dataset.pick}/${file}.png`;
        new Image().src = `assets/cats/${button.dataset.pick}/head.png`;
      },
      { once: true },
    );
  }

  const heroCat = document.querySelector("[data-hop]");
  heroCat?.addEventListener("click", () => hop(heroCat));

  // Held button: the paw squeezes into a fist, as it does in the app.
  addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") document.documentElement.classList.add("is-pressing");
  });
  for (const type of ["pointerup", "pointercancel", "blur"]) {
    addEventListener(type, () => document.documentElement.classList.remove("is-pressing"));
  }
}

/* ---------- Download buttons ---------- */

const numberFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

function describe(release) {
  const parts = [`Sürüm ${release.version}`];
  if (release.size) parts.push(`${numberFormat.format(release.size / 1024 / 1024)} MB`);
  if (release.publishedAt) parts.push(dateFormat.format(new Date(release.publishedAt)));
  return parts.join(" · ");
}

async function setupDownload() {
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    for (const note of document.querySelectorAll("[data-mobile-note]")) note.hidden = false;
  }

  const { release } = await loadLatest();
  const metas = document.querySelectorAll("[data-download-meta]");
  if (!release) {
    // The links already lead to the Releases page; the text just has to admit it.
    for (const meta of metas) meta.textContent = "GitHub sürümler sayfasından";
    return;
  }
  for (const link of document.querySelectorAll("[data-download]")) link.href = release.url;
  for (const meta of metas) meta.textContent = describe(release);

  const soon = document.querySelector("[data-themes-soon]");
  if (soon) soon.hidden = compareVersions(release.version, LAST_VERSION_WITHOUT_PICKER) > 0;
}

/* ---------- Things pop in as they scroll into view ---------- */

function setupReveal() {
  const targets = document.querySelectorAll(".scene, .steps__list li, .shot, .pick, .smart, .term");
  if (reducedMotion || !("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove("is-waiting");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  for (const target of targets) {
    target.classList.add("is-waiting");
    observer.observe(target);
  }
}

setupCats();
setupReveal();
void setupDownload();
