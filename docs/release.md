# Sürüm çıkarma

Catail, GitHub Releases üzerinden dağıtılır ve kendini oradan günceller. Uygulama yalnızca `https://github.com/umutugrasan/catail/releases/latest/download/latest.json` adresini kontrol eder; başka hiçbir yere bağlanmaz ve hiçbir veri göndermez.

## Bir kerelik hazırlık

Güncellemeler bir imza anahtarıyla imzalanır; uygulama yalnızca bu anahtarla imzalanmış güncellemeleri kurar. (Bu, Windows kod imzalama sertifikasından ayrı ve ücretsizdir.)

- **Açık anahtar** `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` içinde; paylaşılabilir.
- **Gizli anahtar** `%USERPROFILE%\.tauri\catail.key` dosyasında. **Repoya koyma, kimseyle paylaşma, yedekle.** Kaybolursa mevcut kurulumlar yeni sürümleri kabul etmez.

GitHub'da repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Ad | Değer |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `catail.key` dosyasının içeriği (Not Defteri'nde açıp tamamını kopyala) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Boş bırak (anahtar parolasız oluşturuldu) |

## Her sürümde

1. Sürüm numarasını üç yerde aynı yap: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (ör. `0.2.0`).
2. Commit'le, ardından etiketi push'la:
   ```powershell
   git tag v0.2.0
   git push origin main --tags
   ```
3. GitHub Actions'taki **Release** iş akışı kurulum dosyasını derler ve **taslak** bir sürüm oluşturur.
4. GitHub → Releases → taslağı aç, notları yaz, **Publish release**. Yayımlanınca kurulu uygulamalar bir sonraki açılışta güncellemeyi görür.

## Yerelde kurulum dosyası derlemek

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\catail.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run tauri build
```

Çıktı: `src-tauri/target/release/bundle/nsis/Catail_<sürüm>_x64-setup.exe`. Kurulum kullanıcı klasörüne yapılır, yönetici izni istemez.

## Kod imzalama (isteğe bağlı)

İmzasız kurulum çalışır ama Windows SmartScreen "bilinmeyen yayımcı" uyarısı gösterir (Ek bilgi → Yine de çalıştır). Seçenekler, fiyatları ve şartları değişebildiği için almadan önce kontrol et:

- **SignPath Foundation** — açık kaynak projelere ücretsiz imzalama (başvuru ve onay gerekir).
- **Certum Open Source Code Signing** — açık kaynak geliştiricilere düşük ücretli sertifika.
- **Azure Trusted Signing** (Microsoft) — aylık düşük ücret; bireysel başvuru belirli ülkelerle sınırlı olabilir.
- **Klasik OV sertifika** (Sectigo, DigiCert, SSL.com…) — yıllık birkaç yüz dolar; anahtar USB token veya bulut HSM üzerinde verilir.

Sertifika alındığında `src-tauri/tauri.conf.json` → `bundle.windows`:

- Bilgisayarda kurulu sertifika için `certificateThumbprint` alanına parmak izini yaz (`timestampUrl` hazır).
- Bulut/token imzalama için `certificateThumbprint` yerine `signCommand` kullanılır, ör. `"signCommand": "trusted-signing-cli -e <endpoint> -a <hesap> -c <profil> %1"`.

İmzalama açıldıktan sonra GitHub Actions'ta da aynı sertifikaya erişim gerekir (SignPath ve Trusted Signing bunun için GitHub entegrasyonu sunar).
