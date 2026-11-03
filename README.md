# Stack Screen

Sıralı ekran görüntüsü ve pano kuyruğu aracı (Windows 10/11, ardından macOS).

- **Normal mod:** bölge / tam ekran / pencere yakalama, çizim araçları, panoya kopyalama, PNG kaydetme.
- **Kuyruk:** seçim ekranındaki "Kuyruk oluştur" / "Kuyruğa ekle" butonlarıyla ekran görüntüleri, **Metin modu**nda ise her Ctrl+C sıraya eklenir. Kuyruk doluyken Ctrl+V hepsini alındıkları sırayla yapıştırır.

Tüm veriler yereldir, telemetri yoktur.

## Durum

| Faz | İçerik | Durum |
|---|---|---|
| 0 | Yapıştırma denemesi (`spikes/paste-test`, `docs/paste-matrix.md`) | Tamam |
| 1 | Tauri iskeleti, tray, bölge yakalama | Tamam |
| 2 | Görsel kuyruğu (seçim ekranından "Kuyruk oluştur"), rozet, toplu/sıralı yapıştırma | Tamam |
| 3 | Metin modu (PrintScreen ekranının üstünden): her Ctrl+C kuyruğa eklenir; kuyruk doluyken Ctrl+V kuyruğu yapıştırır (MVP) | Tamam |
| 4 | Rozete tıklayınca yukarı açılan kuyruk paneli (sıralı önizleme, sürükleyerek yer değiştirme, ✕ ile silme), çizim araçları | Tamam |
| 5 | Ayarlar penceresi, kurulum dosyası (NSIS), GitHub Releases ile otomatik güncelleme (v1) | Tamam |
| 6 | macOS | — |
| 7 | Kuyruğu ZIP / PDF olarak kaydetme (paylaşım linki ayrıca) | Tamam |
| 8 | Ekran görüntüsünden metin tanıma (OCR, internetsiz) ve uygulama içi çeviri | Tamam |

## Kurulum

[Releases](https://github.com/umutugrasan/stack-screen/releases) sayfasından `Stack Screen_<sürüm>_x64-setup.exe` dosyasını indirip çalıştırın. Kurulum kullanıcı klasörüne yapılır, yönetici izni istemez. Uygulama sistem tepsisine yerleşir; ayarlar için tepsi simgesine sağ tıklayın → **Ayarlar** (ya da Başlat menüsünden Stack Screen'i tekrar açın).

Kurulum dosyası henüz kod imzalı değildir; Windows "bilinmeyen yayımcı" uyarısı gösterirse **Ek bilgi → Yine de çalıştır**. Ayrıntılar ve sürüm çıkarma adımları: [docs/release.md](docs/release.md).

## Ayarlar

`%APPDATA%\Stack Screen\settings.json` dosyasında saklanır ve ayarlar penceresinden düzenlenir: kısayollar (tıklayıp yeni tuşlara basarak), yapıştırma yöntemi, bekleme süreleri, metin ayracı, metinler arası Enter, yapıştırdıktan sonra kuyruğu boşaltma, uygulama kuralları, Windows ile başlatma ve güncellemeler.

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
| Ctrl+V (kuyruk doluyken) | Kuyruğu sırasıyla yapıştır, önceki pano içeriğini geri yükle, kuyruğu boşalt |
| Ctrl+Shift+Alt+V | Aynısı (yedek kısayol) |
| Ctrl+Shift+Alt+Z | Kuyruktaki son öğeyi geri al |
| Ctrl+Shift+Alt+X | Kuyruğu temizle |
| Ctrl+C | Seçimi panoya kopyala |
| Enter | Vurgulu butonu çalıştır (kuyruk yoksa Kopyala, varsa Kuyruğa ekle) |
| Ctrl+S | Seçimi PNG olarak kaydet |
| Ctrl+Z | Seçim ekranında son çizimi geri al |
| Esc / sağ tık | İptal (sıralı yapıştırmada: durdur) |

### Kuyruk

PrintScreen ile alan seçtikten sonra araç çubuğunda:

- Kuyruk yoksa: **Kopyala · Kaydet · Kuyruk oluştur · İptal**
- Kuyruk varsa: **Kopyala · Kaydet · Kuyruğa ekle · Kuyruğu temizle · İptal**

PrintScreen ekranının en üstünde **Ekran görüntüsü · Metin modu** seçenekleri var. **Metin modu**nu seçince ekran kapanır ve sağ altta "Metin modu · Kuyruk: N" görünür; bundan sonra Ctrl+C ile kopyaladığın her metin/görsel kuyruğa eklenir. Şifre yöneticilerinin kopyaladıkları alınmaz.

Kuyrukta bir şey varken **Ctrl+V** normal yapıştırma yerine kuyruğun tamamını sırayla yapıştırır; ardından kuyruk boşalır, metin modu kapanır ve Ctrl+C / Ctrl+V yeniden normal çalışır. "Kuyruğu temizle" de metin modunu kapatır.

Yapıştırdıktan ya da temizledikten sonra rozetin yerinde 10 saniye boyunca **Geri al** düğmesi durur; basınca kuyruk olduğu gibi geri gelir. Süre dolunca kuyruk gerçekten silinir.

Kuyrukta öğe olduğu sürece sağ altta "Kuyruk: N" rozeti görünür. Hedef uygulamaya geçip Ctrl+V'ye basınca kuyruk sırasıyla yapıştırılır ve boşaltılır.

### Kuyruk paneli

Sağ alttaki rozete tıklayınca yukarı doğru dar bir panel açılır: kuyruktaki görseller ve metinler iki sütunlu kare kartlar halinde sırayla dizilir. Kartları sürükleyerek sırayı değiştir (yapıştırma bu sırayla yapılır), büyüteçle görseli büyük gör, çöp kutusuyla tek öğeyi sil, **Yapıştır** ile kuyruğu az önce kullandığın uygulamaya yapıştır, **Temizle** ile hepsini sil. Panel odak almaz; yapıştırma hedef uygulamaya gider.

### Metin tanıma ve çeviri

Alan seçince araç çubuğundaki **Metni al**, seçili alandaki yazıyı Windows'un kendi OCR motoruyla (internetsiz, Türkçe dahil) okur. Çıkan metni düzenleyebilir, kopyalayabilir, kuyruğa ekleyebilir ya da **Çevir** ile uygulamanın içinde çevirebilirsin: Türkçe olmayan metin Türkçeye, Türkçe metin İngilizceye çevrilir. Çeviri için metin yalnızca **Çevir**'e basınca Google Çeviri'ye gönderilir (resmi olmayan ücretsiz uç nokta; Google değiştirirse çeviri hata verebilir).

### Kuyruğu kaydetme

Kuyruk panelindeki **Kaydet** menüsü kuyruğu **ZIP** (görseller PNG, metinler TXT, sırayla numaralı) ya da **PDF** (her öğe bir sayfa) olarak kaydeder.

### Çizim araçları

Alan seçince sağında araç çubuğu çıkar: seç/taşı, şekiller (dikdörtgen, elips, çizgi, ok), kalemler (kalem, fosforlu kalem, silgi), metin, bulanıklaştırma (pikselleştirme), renk seçici (istenen her renk, hex kodu ve hazır renkler) ve kalınlık, geri al (Ctrl+Z) ve kapat (✕). Gruplar tek düğmede durur, tıklayınca açılır. Alttaki işlem düğmeleri (kopyala, kaydet, metni al, kuyruğa ekle, temizle) yalnızca ikondur; adları üzerine gelince görünür. Kuyruğa eklenen görüntü animasyonla rozete uçar. Çizimler kopyalanan, kaydedilen ve kuyruğa eklenen görüntüye tam çözünürlükte işlenir.

### Yapıştırma yöntemleri

- **Toplu:** Kuyruktaki tüm görseller tek bir dosya listesi olarak panoya konur ve tek Ctrl+V gönderilir. Yalnız görsel içeren kuyruklarda varsayılandır.
- **Sıralı:** Her öğe tek tek panoya konup yapıştırılır (öğeler arası bekleme varsayılan 250 ms). Toplu yapıştırmada yalnızca ilk görseli alan uygulamalar için `%APPDATA%\Stack Screen\settings.json` içindeki `app_rules` ile seçilebilir:

```json
{ "app_rules": [{ "process": "whatsapp.exe", "mode": "sequential", "delay_ms": 400 }] }
```

Kuyruktaki görseller `%TEMP%\stack-screen\<oturum>` altında tutulur ve uygulama kapanınca silinir.

Windows 11'de PrintScreen varsayılan olarak Ekran Alıntısı Aracı'nı açar. Stack Screen'in yakalayabilmesi için Ayarlar → Erişilebilirlik → Klavye → "Ekran alıntısı aracını açmak için Print Screen tuşunu kullan" seçeneğini kapatıp Stack Screen'i yeniden başlatın. Lightshot gibi PrintScreen kullanan başka araçlar açıksa kısayollar çakışır.

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
