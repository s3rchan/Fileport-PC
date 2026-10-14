# Android ekran yansıtma entegrasyonu

Bu sürümde `/screen.html` PC izleme ekranı ve `/screen-signal` WebRTC sinyalleşme sunucusu çalışır.

**Android ekran yakalama henüz uygulanmadı.** HTML/WebView tek başına Android ekranını güvenilir biçimde yakalayamaz. Tam APK için Kotlin `MediaProjectionManager` kullanıcı onayı, uygun foreground service (`mediaProjection` türü), ekran görüntüsünü WebRTC video track'ine aktaran native modül ve `join-sender` sinyalleşme istemcisi gerekir. Bu olmadan Android ekranı PC'ye yayınlanmaz.

Güvenlik: Her oturumda sistem izin penceresi gösterilmeli; kullanıcıya sürekli paylaşım bildirimi ve durdurma kontrolü sunulmalı. Oda kodunu yalnızca güvenilen kişilerle paylaşın. Üretim için TURN sunucusu ve bağlantı sınırları gereklidir.
