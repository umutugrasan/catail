// The site's two languages. Each page says which one it is in <html lang>; the words the
// scripts write into the page come from here, in that language.

export const lang = document.documentElement.lang === "en" ? "en" : "tr";
export const locale = lang === "en" ? "en-US" : "tr-TR";

/** Where the site's own files are (assets/ and the rest), whichever folder the page is in. */
export const siteRoot = new URL("./", import.meta.url);
export const asset = (path) => new URL(`assets/${path}`, siteRoot).href;

const STRINGS = {
  tr: {
    version: (version) => `Sürüm ${version}`,
    fromReleases: "GitHub sürümler sayfasından",
    queue: (count) => `Kuyruk: ${count}`,
    pasting: "Yapıştırılıyor…",
    texts: ["Toplantı 14.00'te", "Fatura no: 2481", "Şuna bakar mısın?", "Sürüm notları ekte"],
    newest: "En yeni",
    platform: "Windows 10 ve 11, 64 bit",
    download: "İndir",
    downloadVersion: (version) => `${version} sürümünü indir`,
    releaseCount: (count) => `${count} sürüm`,
    releasesFailed: ["Sürüm listesi şu an alınamadı. Biraz sonra yeniden dene ya da sürümlere ", "GitHub'dan bak", "."],
  },
  en: {
    version: (version) => `Version ${version}`,
    fromReleases: "From the GitHub releases page",
    queue: (count) => `Queue: ${count}`,
    pasting: "Pasting…",
    texts: ["Meeting at 2 pm", "Invoice no: 2481", "Can you take a look?", "Release notes attached"],
    newest: "Newest",
    platform: "Windows 10 and 11, 64-bit",
    download: "Download",
    downloadVersion: (version) => `Download ${version}`,
    releaseCount: (count) => `${count} ${count === 1 ? "release" : "releases"}`,
    releasesFailed: ["Couldn't load the list of releases just now. Try again in a bit, or ", "see them on GitHub", "."],
  },
};

export const t = STRINGS[lang];
