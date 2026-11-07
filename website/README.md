# Catail web sitesi

Sunucu ve derleme gerektirmeyen statik site: ana sayfa `index.html` (`style.css`, `app.js`, `scenes.css`, `scenes.js`), sürümler sayfası `surumler.html` (`releases.css`, `releases-page.js`), ortak `release.js` ve `assets/`.
Yollar görelidir; alt klasörde (`kullanici.github.io/catail/`) de kendi alan adında da çalışır.

Yerelde açmak için (modüller `file://` üzerinden çalışmaz):

```powershell
python -m http.server 5180 --directory website
```

## İndirme düğmesi

`release.js`, GitHub API'den yayımlanmış son sürümleri okur ve içinde kurulum dosyası (`Catail_<sürüm>_x64-setup.exe`) olan en yenisine bağlanır. Taslaklar, ön sürümler ve kurulum dosyası henüz yüklenmemiş sürümler atlanır. Sonuç beş dakika tarayıcıda saklanır ve sürümler sayfasıyla paylaşılır. API'ye ulaşılamazsa düğme Releases sayfasına gider. Yeni sürümde sitede bir şey değiştirmek gerekmez.

## Sürümler sayfası

`surumler.html`, kurulum dosyası olan bütün yayımlanmış sürümleri en yeniden eskiye listeler. İndirme bağlantıları doğrudan exe dosyasına gider. Her sürümün kısa notları `releases-page.js` içindeki `NOTES` nesnesinde durur. Orada olmayan bir sürüm için GitHub'daki sürüm notu gösterilir. Yeni bir sürüm çıkınca birkaç maddelik notunu `NOTES`'a eklemen yeterli.

## Özellik sahneleri

"Küçük ama işi bilen bir kedi" bölümündeki her özellik, kendi kendine oynayan küçük bir penceredir. Çoğu yalnızca CSS ile çalışır (`scenes.css`). Kuyruk, rozetteki kedi ve diller sahnelerini `scenes.js` oynatır. Sahneler yalnız ekrandayken oynar. "Daha az hareket" isteyen ziyaretçide her sahne `--freeze` ile seçilmiş bir karede durur. Bir sahnedeki bütün döngüler aynı `--loop` süresiyle ve gecikmesiz çalışmalıdır.

## Sürüme bağlı metin

`app.js` içindeki `LAST_VERSION_WITHOUT_PICKER`: yayımlanan sürüm bundan yeni olana kadar "Kedi seçimi sıradaki sürümle geliyor" yazısı görünür. Kedi seçimi hangi sürümle çıkarsa ona göre ayarla.

## Ekran görüntüleri

`assets/shots/` içindeki dosyaların üzerine yaz. Yeni görsel eklersen `index.html`'deki `#ekranlar` bölümüne bir `<figure class="shot">` ekle, `width` ve `height` değerlerini görselin gerçek boyutuna göre yaz.
