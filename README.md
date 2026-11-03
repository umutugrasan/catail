# ClipQueue

Sıralı ekran görüntüsü ve pano kuyruğu aracı (Windows 10/11, ardından macOS).

- **Normal mod:** bölge / tam ekran / pencere yakalama, çizim araçları, panoya kopyalama, PNG kaydetme.
- **Kuyruk modu:** mod açıkken alınan her ekran görüntüsü ve kopyalanan her metin sıraya eklenir; tek kısayolla hepsi alındıkları sırayla hedef uygulamaya yapıştırılır.

Tüm veriler yereldir, telemetri yoktur.

## Durum

| Faz | İçerik | Durum |
|---|---|---|
| 0 | Yapıştırma denemesi (`spikes/paste-test`, `docs/paste-matrix.md`) | Tamam |
| 1 | Tauri iskeleti, tray, bölge yakalama | Tamam |
| 2 | Görsel kuyruğu, rozet, toplu/sıralı yapıştırma | — |
| 3 | Metin kuyruğu (MVP) | — |
| 4 | Önizleme paneli, çizim araçları | — |
| 5 | Ayarlar, kurulum, güncelleme (v1) | — |
| 6 | macOS | — |

## Geliştirme

Gereksinimler: Node.js 20+, Rust (stable, MSVC), Windows 10/11 (WebView2).

```powershell
npm install
npm run tauri dev      # uygulamayı geliştirme modunda başlatır
npm test               # arayüz testleri (Vitest)
cd src-tauri; cargo test; cargo clippy --all-targets -- -D warnings
```

### Kullanım

| Kısayol | İşlev |
|---|---|
| PrintScreen | Bölge seçerek yakala (tepsi ikonuna sol tık da aynı) |
| Shift+PrintScreen | İmlecin olduğu ekranı panoya kopyala |
| Ctrl+C / Enter | Seçimi panoya kopyala |
| Ctrl+S | Seçimi PNG olarak kaydet |
| Esc / sağ tık | İptal |

Windows 11'de PrintScreen varsayılan olarak Ekran Alıntısı Aracı'nı açar. ClipQueue'nun yakalayabilmesi için Ayarlar → Erişilebilirlik → Klavye → "Ekran alıntısı aracını açmak için Print Screen tuşunu kullan" seçeneğini kapatıp ClipQueue'yu yeniden başlatın. Lightshot gibi PrintScreen kullanan başka araçlar açıksa kısayollar çakışır.

## Faz 0 — paste-test

Gereksinimler: Rust (stable, MSVC), Windows 10/11.

```powershell
cd spikes/paste-test
cargo build --release
.\target\release\paste-test.exe --generate-samples samples --count 5
.\target\release\paste-test.exe --mode batch --files samples\001.png samples\002.png samples\003.png
.\target\release\paste-test.exe --mode sequential --files samples\001.png samples\002.png --delay-ms 400
```

Program 3 saniye geri sayar; bu sürede hedef pencereye tıklayın. Yapıştırma bitince önceki pano içeriği geri yüklenir. Sıralı modda Esc yapıştırmayı durdurur.

Test listesi: [docs/paste-matrix.md](docs/paste-matrix.md)
