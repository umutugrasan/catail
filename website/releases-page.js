// The releases page: every published installer, newest first, with a direct download link.
import { loadReleases } from "./release.js";

// What changed, in a few words. A release not listed here shows its notes from GitHub.
const NOTES = {
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

const numberFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

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
  if (newest) head.append(element("span", "relcard__tag", "En yeni"));
  item.append(head);

  const facts = [];
  if (release.publishedAt) facts.push(dateFormat.format(new Date(release.publishedAt)));
  if (release.size) facts.push(`${numberFormat.format(release.size / 1024 / 1024)} MB`);
  facts.push("Windows 10 ve 11, 64 bit");
  item.append(element("p", "relcard__facts", facts.join(" · ")));

  const notes = NOTES[release.version] ?? notesFrom(release.notes);
  if (notes) {
    const list = element("ul", "relcard__notes");
    for (const note of notes) list.append(element("li", "", note));
    item.append(list);
  }

  const link = element("a", `btn ${newest ? "" : "btn--ghost "}relcard__get`);
  link.href = release.url;
  link.append(element("span", "", newest ? "İndir" : `${release.version} sürümünü indir`));
  item.append(link);
  return item;
}

async function main() {
  const status = document.querySelector("[data-status]");
  const list = document.querySelector("[data-list]");
  const { releases } = await loadReleases();
  if (releases.length === 0) {
    status.replaceChildren(
      "Sürüm listesi şu an alınamadı. Biraz sonra yeniden dene ya da sürümlere ",
      Object.assign(element("a", "", "GitHub'dan bak"), { href: "https://github.com/umutugrasan/catail/releases" }),
      ".",
    );
    return;
  }
  status.textContent = `${releases.length} sürüm`;
  list.replaceChildren(...releases.map((release, index) => card(release, index === 0)));
}

void main();
