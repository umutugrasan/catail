# Faz 0 — Yapıştırma test matrisi

Amaç: Her hedef uygulamada **Mod A (toplu, CF_HDROP)** ve **Mod B (sıralı)** yöntemlerinin 5 görseli doğru sırayla yapıştırıp yapıştırmadığını görmek. Sonuçlar `app_rules` varsayılanlarını belirler.

## Hazırlık

```powershell
cd spikes/paste-test
cargo build --release
.\target\release\paste-test.exe --generate-samples samples --count 5
```

Komutlar (her testte birini çalıştır, 3 saniye içinde hedef uygulamanın metin kutusuna tıkla):

```powershell
.\target\release\paste-test.exe --mode batch --files samples\001.png samples\002.png samples\003.png samples\004.png samples\005.png
.\target\release\paste-test.exe --mode sequential --files samples\001.png samples\002.png samples\003.png samples\004.png samples\005.png
```

Sıralı modda yavaş uygulamalar için `--delay-ms 500` gibi daha uzun bekleme dene. Toplu modda eski pano erken geri gelirse `--restore-delay-ms 1500` dene.

Her testten önce panoya bir metin kopyala (ör. `ESKI-PANO`). Test bittikten sonra Not Defteri'ne Ctrl+V yap: `ESKI-PANO` gelmeli (pano geri yükleme kontrolü).

## Sonuç işaretleri

- ✅ 5 görsel, 1→5 sırasıyla geldi
- ⚠️ Kısmen (ör. yalnız ilk görsel, sıra bozuk, bazıları eksik) — not düş
- ❌ Hiç yapışmadı / dosya adı metni yapıştı
- Gecikme: Mod B'de sorunsuz çalışan en düşük `--delay-ms` değeri

## Matris

| Uygulama | Ortam | Mod A (toplu) | Mod B (sıralı) | Mod B min. gecikme (ms) | Pano geri geldi mi | Not |
|---|---|---|---|---|---|---|
| ChatGPT | Chrome | ✅ | ✅ | 250 (varsayılan) | kontrol edilmedi | |
| ChatGPT | Edge | | | | | |
| Claude | Chrome | | | | | |
| Claude | Edge | | | | | |
| Gemini | Chrome | | | | | |
| Gemini | Edge | | | | | |
| WhatsApp Desktop | Uygulama | | | | | |
| Telegram Desktop | Uygulama | | | | | |
| Discord | Uygulama | | | | | |
| Slack | Uygulama | | | | | |
| Word | Uygulama | | | | | |
| Gmail | Chrome | | | | | |
| Paint | Uygulama | | | | | |

## Ek kontroller

- [ ] Mod B sırasında **Esc**'e basınca yapıştırma duruyor ve "Cancelled" mesajı çıkıyor.
- [ ] Türkçe karakterli klasör yolunda (ör. `C:\Users\...\Masaüstü\görüntüler`) Mod A çalışıyor.
- [ ] Panoda görsel varken (ör. Paint'ten kopyalanmış) test sonrası görsel geri geliyor.

## Karar (go/no-go)

Faz 0 kabul kriteri: program her iki modda 5 görseli sırasıyla yapıştırabiliyor ve bu şablon dolduruldu.
Mod A'nın yalnız ilk görseli aldığı uygulamalar → `app_rules` içinde otomatik Mod B.
