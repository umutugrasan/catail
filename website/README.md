# Catail web sitesi

Sunucu ve derleme gerektirmeyen statik site: `index.html`, `style.css`, `app.js`, `release.js`, `assets/`.
Yollar görelidir; alt klasörde (`kullanici.github.io/catail/`) de kendi alan adında da çalışır.

Yerelde açmak için (modüller `file://` üzerinden çalışmaz):

```powershell
python -m http.server 5180 --directory website
```

## İndirme düğmesi

`release.js`, GitHub API'den yayımlanmış son sürümleri okur ve içinde kurulum dosyası (`Catail_<sürüm>_x64-setup.exe`) olan en yenisine bağlanır. Taslaklar, ön sürümler ve kurulum dosyası henüz yüklenmemiş sürümler atlanır. Sonuç bir saat tarayıcıda saklanır. API'ye ulaşılamazsa düğme Releases sayfasına gider. Yeni sürümde sitede bir şey değiştirmek gerekmez.

## Sürüme bağlı metin

`app.js` içindeki `LAST_VERSION_WITHOUT_PICKER`: yayımlanan sürüm bundan yeni olana kadar "Kedi seçimi sıradaki sürümle geliyor" yazısı görünür. Kedi seçimi hangi sürümle çıkarsa ona göre ayarla.

## Ekran görüntüleri

`assets/shots/` içindeki dosyaların üzerine yaz. Yeni görsel eklersen `index.html`'deki `#ekranlar` bölümüne bir `<figure class="shot">` ekle, `width` ve `height` değerlerini görselin gerçek boyutuna göre yaz.
