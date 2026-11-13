# Catail web sitesi

Sunucu ve derleme gerektirmeyen statik site: ana sayfa `index.html` (`style.css`, `app.js`, `scenes.css`, `scenes.js`), sürümler sayfası `surumler.html` (`releases.css`, `releases-page.js`), ortak `release.js` ve `assets/`.
Yollar görelidir; alt klasörde (`kullanici.github.io/catail/`) de kendi alan adında da çalışır.

## İki dil

Türkçe sayfalar kökte (`index.html`, `surumler.html`), İngilizceleri `en/` altında (`en/index.html`, `en/releases.html`). İki dil aynı CSS, JS ve `assets/` dosyalarını kullanır. Sayfalardaki metin her dilin kendi HTML'inde; betiklerin sayfaya yazdığı metinler (indirme düğmesi, sürüm kartları, sahnelerdeki yazılar) `i18n.js` içinde, iki dilde. Sürüm notları `releases-page.js` içinde `NOTES_TR` ve `NOTES_EN`.

Bir sayfada bir şeyi değiştirdiğinde öbür dildekini de değiştir. Üstteki TR/EN düğmesi aynı sayfanın öbür diline gider. `hreflang` bağlantıları tam adres ister: alan adı değişirse dört sayfadaki `https://umutugrasan.github.io/catail/` adresini güncelle.

Yerelde açmak için (modüller `file://` üzerinden çalışmaz):

```powershell
python -m http.server 5180 --directory website
```

## İndirme düğmesi

`release.js`, GitHub API'den yayımlanmış son sürümleri okur ve içinde kurulum dosyası (`Catail_<sürüm>_x64-setup.exe`) olan en yenisine bağlanır. Taslaklar, ön sürümler ve kurulum dosyası henüz yüklenmemiş sürümler atlanır. Sonuç beş dakika tarayıcıda saklanır ve sürümler sayfasıyla paylaşılır. API'ye ulaşılamazsa düğme Releases sayfasına gider. Yeni sürümde sitede bir şey değiştirmek gerekmez.

## Sürümler sayfası

`surumler.html`, kurulum dosyası olan bütün yayımlanmış sürümleri en yeniden eskiye listeler. İndirme bağlantıları doğrudan exe dosyasına gider. Her sürümün kısa notları `releases-page.js` içindeki `NOTES_TR` ve `NOTES_EN` nesnelerinde durur. Orada olmayan bir sürüm için GitHub'daki sürüm notu gösterilir. Yeni bir sürüm çıkınca birkaç maddelik notunu iki dilde de eklemen yeterli.

## Özellik sahneleri

"Küçük ama işi bilen bir kedi" bölümündeki her özellik, kendi kendine oynayan küçük bir penceredir. Çoğu yalnızca CSS ile çalışır (`scenes.css`). Kuyruk, rozetteki kedi ve diller sahnelerini `scenes.js` oynatır. Sahneler yalnız ekrandayken oynar. "Daha az hareket" isteyen ziyaretçide her sahne `--freeze` ile seçilmiş bir karede durur. Bir sahnedeki bütün döngüler aynı `--loop` süresiyle ve gecikmesiz çalışmalıdır.

## Sürüme bağlı metin

`app.js` içindeki `LAST_VERSION_WITHOUT_PICKER`: yayımlanan sürüm bundan yeni olana kadar "Kedi seçimi sıradaki sürümle geliyor" yazısı görünür. Kedi seçimi hangi sürümle çıkarsa ona göre ayarla.

## Ekran görüntüleri

`assets/shots/` içindeki dosyaların üzerine yaz. Yeni görsel eklersen `index.html`'deki `#ekranlar` bölümüne bir `<figure class="shot">` ekle, `width` ve `height` değerlerini görselin gerçek boyutuna göre yaz.
