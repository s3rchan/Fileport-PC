# Fileport — Windows PC

**Fileport**, Windows bilgisayarınız ile Android telefonunuz arasında aynı Wi-Fi / yerel ağ (LAN) üzerinden doğrudan dosya aktarımı ve mesajlaşma sağlayan bir masaüstü uygulamasıdır.

**Güncel Windows sürümü:** v1.8.0 · **Android:** Ayrı [Fileport Android deposu](https://github.com/s3rchan/Fileport-Android)

[**⬇ Windows kurulum dosyasını indir — GitHub Releases**](https://github.com/s3rchan/Fileport-PC/releases/latest)

> **Not:** Bu depo artık eski "Yakın" oda kodlu WebRTC hizmeti değildir. Fileport, yerel ağda çalışan bağımsız bir Windows uygulamasıdır; numaralı oda, web sinyalleşme sunucusu veya TURN gerektirmez.

## Özellikler

- **Bilgisayardan başlatılan eşleştirme:** Windows, aynı yerel ağdaki Fileport Android cihazlarını keşfeder ve bağlantı isteği gönderir.
- **Telefon onayı:** Android, gelen bağlantı isteğini kabul veya reddeder. İstenirse güvenilir cihazlar için otomatik bağlanma izni verilebilir.
- **İlk eşleştirmede güvenlik kodu:** Ekranlarda görünen altı haneli kod karşılaştırılarak iki cihazda da onaylanır.
- **Doğrudan dosya aktarımı ve sohbet:** Yerel ağ üzerinden FPTP/1 bağlantısıyla çalışır.
- **Cihaz ve aktarım geçmişi:** Geçmiş yerel olarak tutulur; aktarılan dosyalar sohbet geçmişine eklenmez.
- **Yeniden bağlanma:** Kayıtlı cihazlara bilgisayardan yeniden bağlantı isteği gönderilebilir.
- **Güncelleme seçenekleri:** Ayarlarda GitHub Releases üzerinden güncelleme kontrolü ve çevrimdışı kurulum dosyası seçme işlevleri bulunur.
- **Türkçe ve İngilizce arayüz.**

## Gereksinimler

- Windows 10/11 (x64).
- Android telefonda Fileport Android uygulaması.
- İki cihazın birbirine erişebildiği aynı Wi-Fi / yerel ağ.
- Windows güvenlik duvarında uygulamanın yerel ağ iletişimine izin verilmesi.

Yerel dosya aktarımı için internet bağlantısı gerekmez. **GitHub üzerinden yeni sürüm sorgulama ve indirme** ise internete ihtiyaç duyar.

## Kurulum

1. [GitHub Releases](https://github.com/s3rchan/Fileport-PC/releases) sayfasına gidin.
2. En yeni Windows sürümündeki `Fileport_*_x64-setup.exe` kurulum dosyasını indirin.
3. Kurulumu tamamlayın ve Fileport'u başlatın.
4. Android telefonunuzda Fileport'u açın.
5. PC'de **Start / Connect** akışıyla telefonu seçin.
6. Telefona gelen bağlantı isteğini onaylayın. İlk eşleştirmede iki cihazdaki altı haneli kodu karşılaştırıp onaylayın.
7. Bağlantı kurulduğunda sohbet ve dosya paylaşımını kullanın.

> **Windows SmartScreen:** Mevcut kurulum dosyaları otomatik olarak Microsoft tarafından güvenilir yayıncı kabul edilmez. GitHub Releases üzerinden yayımlama, kod imzalama sertifikasının yerine geçmez. Dosyayı yalnızca bu deponun resmî Releases sayfasından edinin.

## GitHub Releases ve güncellemeler

Windows sürümleri `pc-vX.Y.Z` biçiminde etiketlenir. Örneğin **v1.8.0** sürümünün etiketi `pc-v1.8.0`'dır.

- [Windows Releases](https://github.com/s3rchan/Fileport-PC/releases)
- [Windows GitHub Actions](https://github.com/s3rchan/Fileport-PC/actions)
- [Android Releases](https://github.com/s3rchan/Fileport-Android/releases)

Fileport PC'de **Settings → GitHub updates (Windows)** bölümünden güncelleme aranabilir. Daha yeni bir sürüm bulunduğunda Windows kurulum dosyası indirilebilir. **Offline update** seçeneği de mevcuttur.

**Depo adı değişikliği hakkında:** v1.8.0 kaynak kodundaki GitHub güncelleme adresleri önceki depo adı olan `s3rchan/Fileport-PC-v1.6` yoluna işaret eder. GitHub'ın yönlendirmeleri bu yolu çözdüğü sürece çalışabilir; sonraki PC sürümünde güncelleme URL'leri kalıcı `s3rchan/Fileport-PC` yoluna uyarlanmalı ve gerçek Windows cihazında yeniden test edilmelidir. Mevcut sürümün güncelleme davranışı burada garanti edilmez.

### Windows için otomatik derleme

**Actions → Build Fileport Windows EXE → Run workflow** adımlarıyla derleme başlatılabilir.

- Sıradan `main` güncellemesi: CI testleri çalışır, NSIS EXE hazırlanır ve **Artifacts → Fileport-Windows-Installer** bölümüne yüklenir.
- **Publish installer to GitHub Releases** işaretlenmiş manuel çalıştırma: başarılı derlemenin kurulum dosyasını uygulama sürümüne karşılık gelen `pc-vX.Y.Z` Release'ine yayımlar.
- `pc-v*` etiketiyle tetiklenen derleme: sürüm kontrolünün ardından Release dosyasını yayımlar.

**GitHub Actions başarısı**, her cihaz ve ağ üzerinde sorunsuz çalışmayı garanti etmez; Windows–Android eşleştirmesi ve aktarımlar gerçek cihazlarda ayrıca doğrulanmalıdır.

## Geliştirme

Kaynak kod, **Tauri 2 / Rust** masaüstü katmanı ve **HTML, CSS, JavaScript** arayüzünden oluşur.

Yerel geliştirme için Node.js, Rust ve gerekli Windows derleme araçları gerekir.

```bash
npm install
npm test
npm run build -- --bundles nsis
```

Protokol, yerel ağ bağlantısı ve güncelleme testleri `tests/` dizinindedir. Ayrıntılı protokol açıklaması için [FPTP_PROTOCOL_v1.md](FPTP_PROTOCOL_v1.md) dosyasına bakın.

## Güvenlik ve gizlilik

Fileport yerel ağ üzerinden doğrudan cihazlar arası iletişimi hedefler. FPTP/1, uygulamanın deneysel şifreli aktarım protokolüdür; **bağımsız üçüncü taraf güvenlik denetiminden geçmemiştir**. İlk eşleştirmede kodu mutlaka karşılaştırın ve yalnızca tanıdığınız cihazlardan gelen istekleri kabul edin.

## Fileport marka kimliği

Planlanan / onaylanan resmî görsel kimlik:

| Öğe | Standart |
| --- | --- |
| Ana marka mavisi | `#0637E7` |
| Açık mavi | `#368CFF` |
| Lacivert | `#01224F` |
| Açık yüzey | `#CFE1F4` |
| Beyaz | `#FFFFFF` |
| Yazı tipi | **Open Sauce** |
| Logo | **Mavi zeminli beyaz çapa simgesi ve Fileport yazısı** |

> Yeni marka kimliği, gelecek uygulama sürümlerine aşamalı uygulanacaktır. README'de tanımlanması mevcut v1.8.0 EXE'nin logosunun, renklerinin veya yazı tipinin değiştirildiği anlamına gelmez.

---

**Fileport — Windows ve Android arasında doğrudan bağlantı, dosya paylaşımı ve sohbet.**
