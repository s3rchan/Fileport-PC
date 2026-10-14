# Yakın — cihazdan cihaza dosya paylaşımı

Numaralı oda koduyla iki tarayıcı arasında dosya paylaşmak için bağımsız başlangıç projesi. Oda ve WebSocket sinyalleşmesi Node.js sunucusundan geçer; dosya içeriği WebRTC DataChannel üzerinden doğrudan diğer cihaza aktarılır. Oyunlar bu projede yer almaz.

## Başlatma

1. Node.js 18 veya daha yenisini kurun.
2. Bu klasörde `npm install` çalıştırın.
3. `npm start` çalıştırın.
4. Aynı ağdaki cihazlardan `http://SUNUCU_IP_ADRESI:3000` adresini açın. Bir cihaz **Yeni oda oluştur** düğmesine basar; diğer cihaz altı haneli kodu girer.

İlk denemeyi aynı Wi-Fi ağı veya aynı bilgisayardaki iki tarayıcı penceresiyle yapın. Uzak ağlarda bazı güvenlik duvarları ve NAT ayarları doğrudan bağlantıyı engelleyebilir. Bu durumda TURN hizmeti yapılandırın.

## Ayarlar

- `PORT`: HTTP ve WebSocket portu (varsayılan `3000`).
- `MAX_FILE_MB`: dosya başına alıcı sınırı (varsayılan `1024` MB).
- `TURN_URL`: TURN sunucu URL’si veya virgülle ayrılmış URL’ler.
- `TURN_USERNAME`: TURN kullanıcı adı.
- `TURN_CREDENTIAL`: TURN parolası/kimlik bilgisi.

İnternet üzerinden kullanımda HTTPS/WSS ve kimlik bilgileri güvenli biçimde yönetilen bir TURN hizmeti kullanın. Varsayılan STUN hizmeti her ağ kısıtlamasını aşamaz.

## Aktarım davranışı

- Oda en fazla iki cihaz alır; kod altı rakamlıdır ve oda boşalınca kapanır.
- Birden fazla dosya seçilebilir. Dosyalar sırasıyla 64 KiB parçalar halinde gönderilir, ilerleme iki tarafta gösterilir ve gönderim hızı için arabellek akışı sınırlandırılır.
- Dosya adları tarayıcıda temizlenir; gelen dosya adı ve bildirilen boyut alıcıda yeniden doğrulanır. Varsayılan üst sınır dosya başına 1 GiB’dir.
- Alınan dosyalar otomatik indirilmez; tamamlanınca **İndir** bağlantısı görünür.
- Bağlantı koptuğunda tamamlanmamış dosya atılır. Odaya yeniden katılıp aktarımı baştan başlatın.
- WebRTC şifrelemesi tarayıcılar arasında sağlanır. Sinyalleşme sunucusu oda kodlarını ve bağlantı kurmak için gereken SDP/ICE verilerini görür; dosya içeriğini almaz.

## Dağıtım

Sunucuyu internete açarken TLS sonlandırması ekleyin, güvenlik duvarında HTTP(S) ile sinyalleşme erişimini ayarlayın ve TURN hizmetini yapılandırın. Oda kodu geçici eşleştirme içindir; kullanıcı kimlik doğrulaması sağlamaz.
