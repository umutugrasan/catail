# ClipQueue

Sıralı ekran görüntüsü ve pano kuyruğu aracı (Windows 10/11, ardından macOS).

- **Normal mod:** bölge / tam ekran / pencere yakalama, çizim araçları, panoya kopyalama, PNG kaydetme.
- **Kuyruk:** seçim ekranındaki "Kuyruk oluştur" / "Kuyruğa ekle" butonlarıyla ekran görüntüleri sıraya eklenir; tek kısayolla hepsi alındıkları sırayla hedef uygulamaya yapıştırılır.

Tüm veriler yereldir, telemetri yoktur.

## Durum

| Faz | İçerik | Durum |
|---|---|---|
| 0 | Yapıştırma denemesi (`spikes/paste-test`, `docs/paste-matrix.md`) | Tamam |
| 1 | Tauri iskeleti, tray, bölge yakalama | Tamam |
| 2 | Görsel kuyruğu (seçim ekranından "Kuyruk oluştur"), rozet, toplu/sıralı yapıştırma | Tamam |
| 3 | Metin kuyruğu: kuyruk varken Ctrl+C ile kopyalanan metin kuyruğa eklenir (MVP) | — |
| 4 | Rozete tıklayınca yukarı açılan kuyruk paneli (sıralı önizleme, sürükleyerek yer değiştirme, ✕ ile silme), çizim araçları | — |
| 5 | Ayarlar, kurulum, güncelleme (v1) | — |
| 6 | macOS | — |
| 7 | Dışa aktarma ve paylaşım (v2) | — |
| 8 | Ekran görüntüsünden metin tanıma (OCR), metin seçme, çeviri | Planlandı |

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
| Ctrl+Shift+Alt+V | Kuyruğu sırasıyla yapıştır, ardından önceki pano içeriğini geri yükle |
| Ctrl+Shift+Alt+Z | Kuyruktaki son öğeyi geri al |
| Ctrl+Shift+Alt+X | Kuyruğu temizle |
| Ctrl+C | Seçimi panoya kopyala |
| Enter | Vurgulu butonu çalıştır (kuyruk yoksa Kopyala, varsa Kuyruğa ekle) |
| Ctrl+S | Seçimi PNG olarak kaydet |
| Esc / sağ tık | İptal (sıralı yapıştırmada: durdur) |

### Kuyruk

PrintScreen ile alan seçtikten sonra araç çubuğunda:

- Kuyruk yoksa: **Kopyala · Kaydet · Kuyruk oluştur · İptal**
- Kuyruk varsa: **Kopyala · Kaydet · Kuyruğa ekle · Kuyruğu temizle · İptal**

Kuyrukta öğe olduğu sürece sağ altta "Kuyruk: N" rozeti görünür. Hedef uygulamaya geçip Ctrl+Shift+Alt+V'ye basınca kuyruk sırasıyla yapıştırılır ve boşaltılır.

### Yapıştırma yöntemleri

- **Toplu:** Kuyruktaki tüm görseller tek bir dosya listesi olarak panoya konur ve tek Ctrl+V gönderilir. Yalnız görsel içeren kuyruklarda varsayılandır.
- **Sıralı:** Her öğe tek tek panoya konup yapıştırılır (öğeler arası bekleme varsayılan 250 ms). Toplu yapıştırmada yalnızca ilk görseli alan uygulamalar için `%APPDATA%\ClipQueue\settings.json` içindeki `app_rules` ile seçilebilir:

```json
{ "app_rules": [{ "process": "whatsapp.exe", "mode": "sequential", "delay_ms": 400 }] }
```

Kuyruktaki görseller `%TEMP%\clipqueue\<oturum>` altında tutulur ve uygulama kapanınca silinir.

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
