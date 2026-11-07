import { compareVersions, loadLatest } from "./release.js";

const CATS = ["orange", "gray", "white", "calico", "black"];
const CAT_KEY = "catail.site.cat";
// Cat pickers ship after this version. Until a newer release is out, the page says so.
const LAST_VERSION_WITHOUT_PICKER = "0.8.0";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function hop(element) {
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

/* ---------- The little queue in the hero ---------- */

const THUMBS = ["chart", "error", "table", "code"];
const TEXTS = ["Toplantı 14.00'te", "Fatura no: 2481", "Şuna bakar mısın?", "Sürüm notları ekte"];
const MAX_QUEUE = 6;
const UNDO_MS = 10000;
const PASTE_STEP_MS = reducedMotion ? 60 : 380;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setupDemo() {
  const root = document.querySelector("[data-demo]");
  if (!root) return;
  const cards = root.querySelector("[data-cards]");
  const chat = root.querySelector("[data-chat]");
  const empty = root.querySelector("[data-chat-empty]");
  const count = root.querySelector("[data-count]");
  const status = root.querySelector("[data-status]");
  const undoBox = root.querySelector("[data-undo]");
  const undoBar = root.querySelector("[data-undo-bar]");
  const pasteButton = root.querySelector("[data-paste]");
  const heroCat = document.querySelector(".cat--hero");

  let queue = [];
  let pasted = [];
  let pasting = false;
  let undoTimer = 0;
  let nextThumb = 0;
  let nextText = 0;
  let autoplay = !reducedMotion;
  let visible = false;
  let loopRunning = false;

  const makeItem = (kind) =>
    kind === "image"
      ? { kind, thumb: THUMBS[nextThumb++ % THUMBS.length] }
      : { kind, text: TEXTS[nextText++ % TEXTS.length] };

  function fillCard(element, item, number) {
    element.className = `card card--${item.kind}`;
    element.replaceChildren();
    const tag = document.createElement("span");
    tag.className = "card__n";
    tag.textContent = number;
    element.append(tag);
    if (item.kind === "image") {
      const thumb = document.createElement("span");
      thumb.className = `thumb thumb--${item.thumb}`;
      element.append(thumb);
    } else {
      element.append(item.text);
    }
  }

  function renderQueue(newest = null) {
    cards.replaceChildren(
      ...queue.map((item, index) => {
        const li = document.createElement("li");
        fillCard(li, item, index + 1);
        if (item === newest && !reducedMotion) li.classList.add("is-new");
        return li;
      }),
    );
    count.textContent = queue.length;
    pasteButton.classList.toggle("is-ready", queue.length > 0);
  }

  function add(kind) {
    if (pasting) return;
    if (queue.length >= MAX_QUEUE) {
      status.textContent = "Bu deneme alanında kuyruk altı öğeyle sınırlı.";
      wobble();
      return;
    }
    clearUndo();
    const item = makeItem(kind);
    queue.push(item);
    renderQueue(item);
    status.textContent = `Kuyruğa eklendi. Kuyrukta ${queue.length} öğe var.`;
  }

  function wobble() {
    if (reducedMotion) return;
    count.classList.remove("is-wobbling");
    void count.offsetWidth;
    count.classList.add("is-wobbling");
  }

  function appendMessage(item, number) {
    empty.hidden = true;
    const message = document.createElement("div");
    message.className = `msg msg--${item.kind}`;
    const tag = document.createElement("span");
    tag.className = "msg__n";
    tag.textContent = number;
    message.append(tag);
    if (item.kind === "image") {
      const thumb = document.createElement("span");
      thumb.className = `thumb thumb--${item.thumb}`;
      message.append(thumb);
    } else {
      message.append(item.text);
    }
    chat.append(message);
    chat.scrollTop = chat.scrollHeight;
    return message;
  }

  function fly(from, to) {
    if (reducedMotion || !from.animate) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const ghost = from.cloneNode(true);
    ghost.classList.add("is-ghost");
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.append(ghost);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    ghost.animate(
      [
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.05) rotate(-4deg)`, opacity: 0.2 },
      ],
      { duration: 340, easing: "cubic-bezier(0.3, 0.8, 0.3, 1)" },
    );
    // A timer, not the animation's end: animations don't finish in a background tab.
    setTimeout(() => ghost.remove(), 340);
  }

  async function paste() {
    if (pasting) return;
    if (queue.length === 0) {
      status.textContent = "Kuyruk boş. Bu durumda Ctrl+V normal yapıştırma yapar.";
      wobble();
      return;
    }
    pasting = true;
    clearUndo();
    root.classList.add("is-pasting");
    hop(heroCat);
    const batch = [...queue];
    const messages = [];
    for (const [index, item] of batch.entries()) {
      const message = appendMessage(item, index + 1);
      messages.push(message);
      fly(cards.firstElementChild, message);
      queue.shift();
      renderQueue();
      await wait(PASTE_STEP_MS);
    }
    pasted = batch.map((item, index) => ({ item, message: messages[index] }));
    pasting = false;
    root.classList.remove("is-pasting");
    status.textContent = `${batch.length} öğe aldığın sırayla yapıştırıldı. 10 saniye içinde geri alabilirsin.`;
    offerUndo();
  }

  function offerUndo() {
    undoBox.hidden = false;
    undoBar.getAnimations?.().forEach((animation) => animation.cancel());
    undoBar.style.animation = "none";
    void undoBar.offsetWidth;
    undoBar.style.animation = "";
    undoTimer = setTimeout(clearUndo, UNDO_MS);
  }

  function clearUndo() {
    clearTimeout(undoTimer);
    undoBox.hidden = true;
    pasted = [];
  }

  function undo() {
    if (pasting || pasted.length === 0) return;
    const restored = pasted.map(({ item }) => item);
    for (const { message } of pasted) message.remove();
    empty.hidden = chat.querySelector(".msg") !== null;
    queue = [...restored, ...queue];
    clearUndo();
    renderQueue();
    status.textContent = `Kuyruk geri geldi. ${queue.length} öğe bekliyor.`;
  }

  function resetChat() {
    for (const message of chat.querySelectorAll(".msg")) message.remove();
    empty.hidden = false;
  }

  function stopAutoplay() {
    autoplay = false;
  }

  // Plays until the visitor touches it, and only while it is on screen.
  async function loop() {
    if (loopRunning) return;
    loopRunning = true;
    while (autoplay && visible) {
      queue = [];
      clearUndo();
      resetChat();
      renderQueue();
      for (const kind of ["image", "text", "image"]) {
        await wait(900);
        if (!autoplay || !visible) break;
        add(kind);
      }
      await wait(1300);
      if (!autoplay || !visible) break;
      await paste();
      await wait(4200);
    }
    loopRunning = false;
  }

  // The static cards in the HTML are the first three items of the pool.
  queue = [makeItem("image"), makeItem("text"), makeItem("image")];
  renderQueue();

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    stopAutoplay();
    if (button.dataset.add) add(button.dataset.add);
    else if ("paste" in button.dataset) void paste();
    else if ("undoBtn" in button.dataset) undo();
  });

  // The real keys work too. The page has nothing to paste into, and Ctrl+C with text selected
  // stays a normal copy.
  addEventListener("keydown", (event) => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === "v") {
      event.preventDefault();
      stopAutoplay();
      void paste();
    } else if (key === "c" && !getSelection()?.toString()) {
      stopAutoplay();
      add("text");
    }
  });

  if (!autoplay) return;
  let onScreen = false;
  const refreshVisible = () => {
    visible = onScreen && !document.hidden;
    if (visible) void loop();
  };
  new IntersectionObserver(
    ([entry]) => {
      onScreen = entry.isIntersecting;
      refreshVisible();
    },
    { threshold: 0.3 },
  ).observe(root);
  document.addEventListener("visibilitychange", refreshVisible);
}

/* ---------- Things pop in as they scroll into view ---------- */

function setupReveal() {
  const targets = document.querySelectorAll(".tile, .steps__list li, .shot, .pick, .smart, .term");
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
setupDemo();
setupReveal();
void setupDownload();
