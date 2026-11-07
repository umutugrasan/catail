// The animated feature scenes. Most are CSS loops; this file runs them only while they are on
// screen, and plays the three that need a script: the queue, the cat on the badge and the
// languages. None of them take input, they just play.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Calls onChange(true/false) as the element comes on and goes off screen, or the tab hides.
function watch(element, onChange) {
  if (!("IntersectionObserver" in window)) {
    onChange(true);
    return;
  }
  let onScreen = false;
  let last = null;
  const refresh = () => {
    const now = onScreen && !document.hidden;
    if (now !== last) {
      last = now;
      onChange(now);
    }
  };
  new IntersectionObserver(
    ([entry]) => {
      onScreen = entry.isIntersecting;
      refresh();
    },
    { threshold: 0.25 },
  ).observe(element);
  document.addEventListener("visibilitychange", refresh);
}

/* ---------- CSS scenes: play only while seen ---------- */

function setupLoops() {
  for (const scene of document.querySelectorAll(".scene")) {
    watch(scene, (on) => scene.classList.toggle("is-on", on));
  }
}

/* ---------- The queue, pasting itself ---------- */

const THUMBS = ["chart", "error", "table", "code"];
const TEXTS = ["Toplantı 14.00'te", "Fatura no: 2481", "Şuna bakar mısın?", "Sürüm notları ekte"];
const PASTE_STEP_MS = 380;

function setupDemo() {
  const root = document.querySelector("[data-demo]");
  if (!root) return;
  const cards = root.querySelector("[data-cards]");
  const chat = root.querySelector("[data-chat]");
  const empty = root.querySelector("[data-chat-empty]");
  const count = root.querySelector("[data-count]");
  const undoBox = root.querySelector("[data-undo]");
  const undoBar = root.querySelector("[data-undo-bar]");
  const keys = Object.fromEntries([...root.querySelectorAll("[data-key]")].map((key) => [key.dataset.key, key]));

  let queue = [];
  let nextThumb = 0;
  let nextText = 0;
  let playing = false;
  let running = false;

  const makeItem = (kind) =>
    kind === "image"
      ? { kind, thumb: THUMBS[nextThumb++ % THUMBS.length] }
      : { kind, text: TEXTS[nextText++ % TEXTS.length] };

  function fill(element, item, number, numberClass) {
    const tag = document.createElement("span");
    tag.className = numberClass;
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
        li.className = `card card--${item.kind}${item === newest ? " is-new" : ""}`;
        fill(li, item, index + 1, "card__n");
        return li;
      }),
    );
    count.textContent = queue.length;
    keys.paste.classList.toggle("is-ready", queue.length > 0);
  }

  function press(key) {
    key.classList.remove("is-pressed");
    void key.offsetWidth;
    key.classList.add("is-pressed");
  }

  function add(kind) {
    press(keys[kind]);
    const item = makeItem(kind);
    queue.push(item);
    renderQueue(item);
  }

  function fly(from, to) {
    if (!from?.animate) return;
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
    press(keys.paste);
    root.classList.add("is-pasting");
    const batch = [...queue];
    for (const [index, item] of batch.entries()) {
      empty.hidden = true;
      const message = document.createElement("div");
      message.className = `msg msg--${item.kind}`;
      fill(message, item, index + 1, "msg__n");
      chat.append(message);
      chat.scrollTop = chat.scrollHeight;
      fly(cards.firstElementChild, message);
      queue.shift();
      renderQueue();
      await wait(PASTE_STEP_MS);
    }
    root.classList.remove("is-pasting");
    undoBox.hidden = false;
    undoBar.style.animation = "none";
    void undoBar.offsetWidth;
    undoBar.style.animation = "";
  }

  function reset() {
    queue = [];
    undoBox.hidden = true;
    for (const message of chat.querySelectorAll(".msg")) message.remove();
    empty.hidden = false;
    renderQueue();
  }

  async function loop() {
    if (running) return;
    running = true;
    while (playing) {
      reset();
      for (const kind of ["image", "text", "image", "text"]) {
        await wait(850);
        if (!playing) break;
        add(kind);
      }
      if (!playing) break;
      await wait(1100);
      await paste();
      await wait(3600);
    }
    running = false;
  }

  // The cards in the HTML are the first three items of the pool.
  queue = [makeItem("image"), makeItem("text"), makeItem("image")];
  renderQueue();
  if (reducedMotion) return;
  watch(root, (on) => {
    playing = on;
    if (on) void loop();
  });
}

/* ---------- The cat on the badge ---------- */

// Same curve as the app (src/lib/catSeat.ts): quick at first, full at twelve items.
const fatness = (count) => (count <= 0 ? 0 : Math.min(1, (count / 12) ** 0.55));

function setupSeat() {
  const root = document.querySelector("[data-seat]");
  if (!root) return;
  const cat = root.querySelector("[data-seat-cat]");
  const pill = root.querySelector("[data-seat-pill]");
  const fly = root.querySelector("[data-seat-fly]");
  const pointer = root.querySelector("[data-seat-ptr]");
  const head = root.querySelector("[data-seat-head]");

  let playing = false;
  let running = false;

  function show(count) {
    pill.textContent = `Kuyruk: ${count}`;
    cat.style.setProperty("--fat", fatness(count).toFixed(3));
    pill.classList.remove("is-bumping");
    void pill.offsetWidth;
    pill.classList.add("is-bumping");
  }

  // The head turns toward the pointer, as far as a neck allows.
  function look() {
    const a = pointer.getBoundingClientRect();
    const b = head.getBoundingClientRect();
    const dx = a.left - (b.left + b.width / 2);
    const dy = a.top - (b.top + b.height / 2);
    const angle = Math.max(-16, Math.min(16, dx / 9));
    const tilt = Math.max(-4, Math.min(4, dy / 30));
    head.style.transform = `rotate(${angle}deg) translateY(${tilt}px)`;
  }

  async function follow(ms) {
    const end = performance.now() + ms;
    while (playing && performance.now() < end) {
      look();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  async function loop() {
    if (running) return;
    running = true;
    while (playing) {
      root.classList.remove("is-asleep", "is-pointing");
      head.style.transform = "";
      show(0);
      await wait(700);
      for (let count = 1; count <= 6 && playing; count += 1) {
        fly.classList.remove("is-flying");
        void fly.offsetWidth;
        fly.classList.add("is-flying");
        await wait(520);
        show(count);
        await wait(420);
      }
      if (!playing) break;
      await wait(900);
      root.classList.add("is-asleep");
      await wait(3200);
      if (!playing) break;
      root.classList.remove("is-asleep");
      root.classList.add("is-pointing");
      await follow(3600);
      root.classList.remove("is-pointing");
      head.style.transform = "";
      await wait(600);
      pill.textContent = "Yapıştırılıyor…";
      await wait(1100);
    }
    running = false;
  }

  show(3);
  if (reducedMotion) return;
  watch(root, (on) => {
    playing = on;
    if (on) void loop();
  });
}

/* ---------- Sixteen ways to say "Kuyruğa ekle" ---------- */

const WORDS = [
  ["Türkçe", "Kuyruğa ekle"],
  ["English", "Add to queue"],
  ["Deutsch", "Zur Warteschlange"],
  ["Français", "Ajouter à la file"],
  ["Español", "Añadir a la cola"],
  ["Italiano", "Aggiungi alla coda"],
  ["Português", "Adicionar à fila"],
  ["Nederlands", "Aan wachtrij toevoegen"],
  ["Polski", "Dodaj do kolejki"],
  ["Русский", "В очередь"],
  ["Українська", "До черги"],
  ["العربية", "إضافة إلى القائمة"],
  ["日本語", "キューに追加"],
  ["简体中文", "加入队列"],
  ["한국어", "대기열에 추가"],
  ["Bahasa Indonesia", "Tambah ke antrean"],
];

function setupLanguages() {
  const word = document.querySelector("[data-lang-word]");
  const name = document.querySelector("[data-lang-name]");
  if (!word || !name || reducedMotion) return;
  const scene = word.closest(".scene");
  let index = 0;
  let timer = 0;
  const step = () => {
    index = (index + 1) % WORDS.length;
    const [language, text] = WORDS[index];
    word.classList.remove("is-flipping");
    void word.offsetWidth;
    word.classList.add("is-flipping");
    // Swap halfway through the flip, while the button is edge on.
    setTimeout(() => {
      word.textContent = text;
      word.dir = language === "العربية" ? "rtl" : "ltr";
      name.textContent = language;
    }, 180);
  };
  watch(scene, (on) => {
    clearInterval(timer);
    if (on) timer = setInterval(step, 1400);
  });
}

setupLoops();
setupDemo();
setupSeat();
setupLanguages();
