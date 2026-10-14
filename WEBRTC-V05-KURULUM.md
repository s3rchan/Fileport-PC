# Yakın Flow ekran yansıtma v0.5

Web sitesinde `/screen.html` WebRTC video oynatır. `/screen-signal` WebSocket kanalı SDP ve ICE iletir, artık JPEG `screen-frame` mesajları desteklenmez.

**Önce Render sürümünü güncelleyin, sonra Android v0.5 APK yükleyin.** Eski APK ekran yansıtması yeni sürümle uyumlu değildir. Oda kodu oluşturma ve normal dosya aktarımı değiştirilmedi.

WebRTC, NAT/firewall nedeniyle bazı bağlantılarda TURN gerektirebilir. TLS (wss), kullanıcı tarafından açıkça verilen Android ekran izni ve sunucudaki oda kodu kullanılır.
