# Yakın Web – Render güncellemesi

1. Bu projenin `server.js` ve `public/` dosyalarını mevcut GitHub `file-share` deponuzdaki dosyalarla değiştirin. ZIP dosyasını doğrudan Render paneline sürüklemek tek başına deploy yapmaz.
2. Değişiklikleri GitHub'a commit edin. Render otomatik deploy açıksa bekleyin; değilse Render > Manual Deploy > Deploy latest commit.
3. Yeni sürüm açıldığında https://file-share-4g5b.onrender.com/api/health adresini ziyaret edin. `{"ok":true,...}` benzeri JSON çıkmalı.
4. Ardından bilgisayardan yeni oda açın, Android'den kodla katılın.

## Düzeltilenler
- `/signal` ve `/screen-signal` için tek WebSocket upgrade yönlendirmesi; path karışıklığı önlenir.
- Google Fonts CSP izinleri; inline script yasağı güvenli biçimde korunur.
- Eksik favicon isteğine 204 yanıt.
- `/api/health` kontrol uç noktası.
- Ekran sinyalleşmesinde yanlış regex düzeltmesi.

Dikkat: Sunucu bağlantı hatasının gerçek üretim nedeni loglarla tam doğrulanmadı. Sunucu burada bağımlılıkları indirilemediği için canlı test edilemedi. Render deploy sonrasında doğrulama gerekir.

Ücretsiz Render üzerinde yerel klasörde tutulan bulut yüklemeleri disk kalıcı değilse deploy/yeniden başlatmada silinebilir; bu sürüm MediaFire benzeri kalıcı saklama garantisi vermez.
