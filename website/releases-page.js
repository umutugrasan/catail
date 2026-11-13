// The releases page: every published installer, newest first, with a direct download link.
import { lang, locale, t } from "./i18n.js";
import { loadReleases } from "./release.js";

// What changed, in a few words, in each language. A release not listed here shows its notes
// from GitHub.
const NOTES_TR = {
  "0.9.6": [
    "Yeni hayvan: maymun. Ağacından muz koparıp yiyor, dalında sallanıyor, yaprakların arasına saklanıyor.",
    "Ara sıra ekranın üst köşesine zıplayıp asılıyor; başka bir maymunla muz savaşına girişiyor.",
    "Ekran görüntüsünü uzun koluyla tutup kuyruğa çekiyor; imleçler maymun eli.",
  ],
  "0.9.5": [
    "Kedi patisini yalıyor, yıkanıyor, hamur yoğuruyor, esniyor; sevince mırlıyor.",
    "Görev çubuğunda fare ve lazer kovalıyor, başka kedilerle kavga ediyor ya da dost oluyor.",
  ],
  "0.9.4": [
    "Panel için liste düzeni ve ayarlardan rozet boyutu.",
    "Kedi uyurken burnundan baloncuk çıkıyor, kaydederken kutuyu bantlıyor.",
    "Kaplumbağa yenilendi: suya dalıyor, bekleyince üzülüyor, yumurtadan çıkıyor.",
  ],
  "0.9.3": [
    "Yeni hayvan: deniz kaplumbağası.",
    "Kendi kedini oluştur: tüy, karın ve göz rengini sen seç.",
    "Eklediğin metni taşıyabilir, rengini ve boyutunu değiştirebilirsin.",
  ],
  "0.9.2": ["Normal temada kendi rengini seçebilirsin.", "Geri al düğmesinin de artık kapatma (✕) düğmesi var."],
  "0.9.1": [
    "Rozetin yanında bir kedi oturuyor: kuyruk büyüdükçe tombullaşır, bir süre sonra uyur, imleci başıyla izler.",
    "Kuyruğa ekle düğmesinin kuyruğu kediden çıkıyor.",
    "Geri al'da kedi kutuya atlar, süre bitince kutuyu parçalar. Silinen kartı kedi iter.",
  ],
  "0.9.0": [
    "Kuyruğa dosya eklenebiliyor: PDF, Word ve diğerleri.",
    "Gezgin'de sağ tık → Kuyruğa ekle, ya da dosyayı rozete sürükleyip bırak.",
    "Kuyruktaki PDF'ler uygulamanın içinde önizlenebiliyor.",
    "Beş kedi teması ve kedisiz Normal tema, yenilenmiş ayar sayfaları.",
  ],
  "0.8.0": [
    "Kuyruktaki görselleri ve metinleri büyütüp düzenleyebilirsin.",
    "Win+Shift+S artık arada bir basışı kaçırmıyor.",
    "Kuyruğa eklerken kedi kuyruğu animasyonu, üst menüde bıyık ve kulaklar.",
  ],
  "0.7.1": ["16 dil.", "Çeviride hedef dili seçebilirsin.", "Kuyruk rozetinin yerini seçebilirsin.", "QR okumada düzeltmeler."],
  "0.6.0": ["Ekrandaki QR kodları okunuyor, alan adı kalın gösteriliyor."],
};

const NOTES_EN = {
  "0.9.6": [
    "A new animal: the monkey. It picks bananas off its tree, swings from a branch and hides in the leaves.",
    "Now and then it leaps up to the top corner of the screen and hangs there, or has a banana fight with another monkey.",
    "It grabs your screenshot with its long arm; the cursors are monkey hands.",
  ],
  "0.9.5": [
    "The cat licks its paw, washes, kneads and yawns, and purrs when you stroke it.",
    "Down on the taskbar it chases a mouse and a laser dot, and fights or makes friends with other cats.",
  ],
  "0.9.4": [
    "A list layout for the panel, and a badge size setting.",
    "A bubble grows from the sleeping cat's nose; it tapes the box shut when you save.",
    "The turtle is redrawn: it dives, gets sad when left alone, and hatches from an egg.",
  ],
  "0.9.3": [
    "A new animal: the sea turtle.",
    "Make your own cat: pick its fur, belly and eye colors.",
    "Text you add to a capture can be moved, recolored and resized.",
  ],
  "0.9.2": ["Pick your own color for the Plain theme.", "The Undo button has a close (✕) button now too."],
  "0.9.1": [
    "A cat sits beside the badge: it gets chubbier as the queue grows, dozes off after a while and follows the pointer with its head.",
    "The Add to queue button's tail comes out of the cat.",
    "On Undo the cat jumps into a box, and tears the box apart when time runs out. A cat pushes deleted cards away.",
  ],
  "0.9.0": [
    "Files can join the queue: PDF, Word and the rest.",
    "Right-click in Explorer → Add to queue, or drag the file onto the badge.",
    "PDFs in the queue can be previewed inside the app.",
    "Five cat themes and a cat-free Plain theme, redesigned settings pages.",
  ],
  "0.8.0": [
    "Images and text in the queue can be enlarged and edited.",
    "Win+Shift+S no longer misses a press now and then.",
    "A cat-tail animation when adding to the queue, whiskers and ears on the top bar.",
  ],
  "0.7.1": ["16 languages.", "Pick the target language for translation.", "Pick where the queue badge sits.", "QR reading fixes."],
  "0.6.0": ["QR codes on screen are read, with the domain shown in bold."],
};
const NOTES = lang === "en" ? NOTES_EN : NOTES_TR;

const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });

// Release notes written on GitHub are Markdown. Only lines and "- " lists are kept, as plain text,
// so nothing from the notes can turn into markup on this page.
function notesFrom(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^#+\s*|^[-*]\s+/, "").replace(/[`*_]/g, ""));
  return lines.length > 0 ? lines : null;
}

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function card(release, newest) {
  const item = element("li", `relcard${newest ? " relcard--new" : ""}`);

  const head = element("div", "relcard__head");
  const title = element("h2", "relcard__title", `Catail ${release.version}`);
  head.append(title);
  if (newest) head.append(element("span", "relcard__tag", t.newest));
  item.append(head);

  const facts = [];
  if (release.publishedAt) facts.push(dateFormat.format(new Date(release.publishedAt)));
  if (release.size) facts.push(`${numberFormat.format(release.size / 1024 / 1024)} MB`);
  facts.push(t.platform);
  item.append(element("p", "relcard__facts", facts.join(" · ")));

  const notes = NOTES[release.version] ?? notesFrom(release.notes);
  if (notes) {
    const list = element("ul", "relcard__notes");
    for (const note of notes) list.append(element("li", "", note));
    item.append(list);
  }

  const link = element("a", `btn ${newest ? "" : "btn--ghost "}relcard__get`);
  link.href = release.url;
  link.append(element("span", "", newest ? t.download : t.downloadVersion(release.version)));
  item.append(link);
  return item;
}

async function main() {
  const status = document.querySelector("[data-status]");
  const list = document.querySelector("[data-list]");
  const { releases } = await loadReleases();
  if (releases.length === 0) {
    const [before, linkText, after] = t.releasesFailed;
    status.replaceChildren(
      before,
      Object.assign(element("a", "", linkText), { href: "https://github.com/umutugrasan/catail/releases" }),
      after,
    );
    return;
  }
  status.textContent = t.releaseCount(releases.length);
  list.replaceChildren(...releases.map((release, index) => card(release, index === 0)));
}

void main();
