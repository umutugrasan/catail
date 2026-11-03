# ClipQueue

Sıralı ekran görüntüsü ve pano kuyruğu aracı (Windows 10/11, ardından macOS).

- **Normal mod:** bölge / tam ekran / pencere yakalama, çizim araçları, panoya kopyalama, PNG kaydetme.
- **Kuyruk modu:** mod açıkken alınan her ekran görüntüsü ve kopyalanan her metin sıraya eklenir; tek kısayolla hepsi alındıkları sırayla hedef uygulamaya yapıştırılır.

Tüm veriler yereldir, telemetri yoktur.

## Durum

| Faz | İçerik | Durum |
|---|---|---|
| 0 | Yapıştırma denemesi (`spikes/paste-test`, `docs/paste-matrix.md`) | Elle test bekleniyor |
| 1 | Tauri iskeleti, tray, bölge yakalama | — |
| 2 | Görsel kuyruğu, rozet, toplu/sıralı yapıştırma | — |
| 3 | Metin kuyruğu (MVP) | — |
| 4 | Önizleme paneli, çizim araçları | — |
| 5 | Ayarlar, kurulum, güncelleme (v1) | — |
| 6 | macOS | — |

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
