(() => {
  'use strict';
  const CHUNK_SIZE = 64 * 1024;
  const MAX_BUFFERED = 1024 * 1024;
  const $ = id => document.getElementById(id);
  const ui = {
    create: $('createRoom'), join: $('joinRoom'), inputCode: $('roomCode'), roomActions: $('roomActions'), roomActive: $('roomActive'), activeCode: $('activeCode'), copy: $('copyCode'), leave: $('leaveRoom'), roomStatus: $('roomStatus'), badge: $('connectionBadge'), connectionText: $('connectionText'), fileInput: $('fileInput'), dropzone: $('dropzone'), fileList: $('fileList'), send: $('sendFiles'), sendProgress: $('sendProgressWrap'), sendLabel: $('sendProgressLabel'), sendValue: $('sendProgressValue'), sendFill: $('sendProgressFill'), receiveEmpty: $('receiveEmpty'), incoming: $('incoming'), incomingName: $('incomingName'), receiveLabel: $('receiveProgressLabel'), receiveValue: $('receiveProgressValue'), receiveFill: $('receiveProgressFill'), received: $('receivedList'), toast: $('toast'), limit: $('limitNote')
  };
  let socket, pc, channel, roomCode = '', files = [], maxFileBytes = 1024 * 1024 * 1024, iceConfig = [{ urls: 'stun:stun.l.google.com:19302' }], signalQueue = Promise.resolve();
  let incomingFile = null, toastTimer; let pendingCandidates=[];

  function toast(message) { ui.toast.textContent = message; ui.toast.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 3200); }
  function status(message, kind = '') { ui.roomStatus.textContent = message; ui.roomStatus.classList.toggle('error', kind === 'error'); ui.badge.classList.toggle('error', kind === 'error'); }
  function connection(message, online = false) { ui.connectionText.textContent = message; ui.badge.classList.toggle('online', online); if (message !== 'Bağlı') ui.badge.classList.remove('online'); }
  function setRoom(code) { window.YakinFlow?.room(code); roomCode = code; ui.activeCode.textContent = code; ui.roomActions.classList.add('hidden'); ui.roomActive.classList.remove('hidden'); }
  function wsSend(value) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); else throw new Error('Sinyalleşme sunucusuyla bağlantı kesildi.'); }
  function connect() {
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (socket?.readyState === WebSocket.CONNECTING) return new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${scheme}//${location.host}/signal`);
    return new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('Sunucuya bağlanılamadı. Sayfa sunucusunun açık olduğundan emin olun.')), { once: true });
      socket.addEventListener('message', event => { signalQueue = signalQueue.then(() => onSignal(event)).catch(error => status(`Sinyalleşme hatası: ${error.message}`, 'error')); });
      socket.addEventListener('close', () => { if (roomCode) onDisconnect('Oda sunucusuyla bağlantı kesildi.'); });
    });
  }
  function onDisconnect(message) { window.YakinFlow?.disconnected();
    connection('Bağlantı kesildi'); status(message, 'error');
    if (channel && channel.readyState !== 'closed') channel.close();
  }
  async function onSignal(event) {
    let msg; try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'error') { status(msg.message || 'Bir hata oluştu.', 'error'); toast(msg.message || 'Bir hata oluştu.'); return; }
    if (msg.type === 'created' || msg.type === 'joined') {
      setRoom(msg.code); maxFileBytes = Number(msg.maxFileBytes) || maxFileBytes;
      iceConfig = Array.isArray(msg.iceServers) && msg.iceServers.length ? msg.iceServers : iceConfig;
      ui.limit.textContent = `Dosya başına en fazla ${formatSize(maxFileBytes)}.`;
      status(msg.type === 'created' ? 'Oda hazır. Diğer cihazın katılması bekleniyor.' : 'Odaya katıldın. Bağlantı kuruluyor…');
      connection('Diğer cihaz bekleniyor');
    } else if (msg.type === 'peer-joined') {
      status('Diğer cihaz katıldı. Güvenli bağlantı kuruluyor…');
      if (Array.isArray(msg.iceServers) && msg.iceServers.length) iceConfig = msg.iceServers;
      await setupPeer(iceConfig, true);
    } else if (msg.type === 'signal') {
      await receiveSignal(msg.data);
    } else if (msg.type === 'peer-left') {
      if (channel && channel.readyState !== 'closed') channel.close();
      window.YakinFlow?.disconnected();
      if (pc) { pc.close(); pc = null; }
      channel = null; connection('Diğer cihaz ayrıldı'); status('Diğer cihaz odadan ayrıldı. Aynı kodla tekrar katılabilir.');
    }
  }
  async function setupPeer(ice, initiator) {
    if (pc) { pc.close(); }
    pendingCandidates=[]; pc = new RTCPeerConnection({ iceServers: ice });
    pc.onicecandidate = event => { if (event.candidate) { try { wsSend({ type: 'signal', data: { candidate: event.candidate } }); } catch {} } };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') { connection('Bağlı', true); status('Bağlantı hazır. Dosya gönderebilirsin.'); }
      else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') { connection('Bağlantı sorunu'); status('Cihazlar arasında bağlantı kurulamadı veya koptu. Yeniden deneyin.', 'error'); }
    };
    pc.ondatachannel = event => bindChannel(event.channel);
    if (initiator) {
      bindChannel(pc.createDataChannel('files', { ordered: true }));
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer); wsSend({ type: 'signal', data: { description: pc.localDescription } });
    }
  }
  async function receiveSignal(data) {
    if (!data) return;
    if (!pc) await setupPeer(iceConfig, false);
    try {
      if (data.description) {
        await pc.setRemoteDescription(data.description);
        for (const c of pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(()=>{});
        if (data.description.type === 'offer') { const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); wsSend({ type: 'signal', data: { description: pc.localDescription } }); }
      } else if (data.candidate) { if (!pc.remoteDescription) pendingCandidates.push(data.candidate); else await pc.addIceCandidate(data.candidate); }
    } catch (error) { status(`Bağlantı kurulamadı: ${error.message}`, 'error'); }
  }
  function bindChannel(dc) {
    channel = dc; dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = MAX_BUFFERED / 2;
    dc.onopen = () => { window.YakinFlow?.connected(); try { dc.send(JSON.stringify({type:'flow-hello',name:window.YakinFlow?.deviceName()||'Cihaz'})); } catch {} connection('Bağlı', true); status('Bağlantı hazır. Dosya gönderebilirsin.'); refreshSendButton(); };
    dc.onclose = () => { window.YakinFlow?.disconnected(); connection('Bağlantı kapandı'); ui.send.disabled = true; status('Cihaz bağlantısı kapandı. Odaya yeniden katılarak devam edebilirsin.', 'error'); };
    dc.onerror = () => status('Dosya bağlantısında hata oluştu.', 'error');
    dc.onmessage = event => receiveData(event.data);
  }
  function refreshSendButton() { ui.send.disabled = !(channel?.readyState === 'open' && files.length); }
  function formatSize(bytes) { if (bytes < 1024) return `${bytes} B`; const units = ['KB','MB','GB','TB']; let n = bytes / 1024, i = 0; while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; } return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`; }
  function safeName(name) { return String(name || 'dosya').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 180) || 'dosya'; }
  function setFiles(list) {
    files = Array.from(list || []);
    if (files.some(f => f.size > maxFileBytes)) { const oversize = files.filter(f => f.size > maxFileBytes); toast(`${safeName(oversize[0].name)} sınırı aşıyor (${formatSize(maxFileBytes)}).`); files = files.filter(f => f.size <= maxFileBytes); }
    ui.fileList.replaceChildren(); ui.fileList.classList.toggle('hidden', !files.length);
    for (const file of files) { const row = document.createElement('div'); row.className = 'file-row'; const name = document.createElement('span'); name.textContent = safeName(file.name); const size = document.createElement('span'); size.textContent = formatSize(file.size); row.append(name, size); ui.fileList.append(row); }
    refreshSendButton();
  }
  function waitForDrain(dc) {
    if (dc.readyState !== 'open') return Promise.reject(new Error('Cihaz bağlantısı aktarımlar sırasında kapandı.'));
    if (dc.bufferedAmount <= MAX_BUFFERED) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Bağlantı yanıt vermiyor.')); }, 30000);
      const cleanup = () => { clearTimeout(timeout); dc.removeEventListener('bufferedamountlow', onLow); dc.removeEventListener('close', onClose); };
      const onLow = () => { cleanup(); resolve(); }, onClose = () => { cleanup(); reject(new Error('Cihaz bağlantısı kapandı.')); };
      dc.addEventListener('bufferedamountlow', onLow, { once: true }); dc.addEventListener('close', onClose, { once: true });
    });
  }
  async function sendFiles() {
    if (!channel || channel.readyState !== 'open' || !files.length) return;
    const batch = files.slice(); ui.send.disabled = true; ui.fileInput.disabled = true; ui.sendProgress.classList.remove('hidden');
    const total = batch.reduce((sum, f) => sum + f.size, 0); let sent = 0;
    try {
      for (const file of batch) {
        channel.send(JSON.stringify({ type: 'file-start', name: safeName(file.name), size: file.size, mime: file.type || 'application/octet-stream' }));
        for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
          await waitForDrain(channel);
          const buffer = await file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size)).arrayBuffer();
          channel.send(buffer); sent += buffer.byteLength;
          const percent = total ? Math.floor(sent / total * 100) : 100; ui.sendFill.style.width = `${percent}%`; ui.sendValue.textContent = `${percent}%`; ui.sendLabel.textContent = `Gönderiliyor: ${safeName(file.name)}`;
        }
        channel.send(JSON.stringify({ type: 'file-end' })); window.YakinFlow?.sendingFile(safeName(file.name),formatSize(file.size));
      }
      ui.sendLabel.textContent = 'Aktarım tamamlandı'; ui.sendValue.textContent = '100%'; toast('Dosya aktarımı tamamlandı.');
      setTimeout(() => ui.sendProgress.classList.add('hidden'), 3500);
      setFiles([]); ui.fileInput.value = '';
    } catch (error) { status(error.message, 'error'); toast(error.message); }
    finally { ui.fileInput.disabled = false; refreshSendButton(); }
  }
  function receiveData(data) {
    if (typeof data === 'string') {
      let msg; try { msg = JSON.parse(data); } catch { return; }
      if (msg.type === 'flow-hello' && typeof msg.name === 'string') { window.YakinFlow?.peerName(msg.name.slice(0,32)); return; }
      if (msg.type === 'flow-text' && typeof msg.text === 'string' && msg.text.length <= 2000) { window.YakinFlow?.incomingText(msg.text); return; }
      if (msg.type === 'file-start') {
        if (!Number.isSafeInteger(msg.size) || msg.size < 0 || msg.size > maxFileBytes) { status('Gönderilen dosya boyutu sınırı aşıyor.', 'error'); channel.close(); return; }
        incomingFile = { name: safeName(msg.name), size: msg.size, mime: typeof msg.mime === 'string' && msg.mime.length < 120 ? msg.mime : 'application/octet-stream', chunks: [], received: 0 };
        ui.receiveEmpty.classList.add('hidden'); ui.incoming.classList.remove('hidden'); ui.incomingName.textContent = incomingFile.name; ui.receiveLabel.textContent = 'Alınıyor…'; ui.receiveValue.textContent = '0%'; ui.receiveFill.style.width = '0%';
      } else if (msg.type === 'file-end' && incomingFile) finishFile();
      return;
    }
    if (!incomingFile) return;
    const chunk = data instanceof Blob ? data : new Blob([data]);
    if (incomingFile.received + chunk.size > incomingFile.size) { status('Dosya aktarımında boyut uyuşmazlığı oluştu.', 'error'); incomingFile = null; channel.close(); return; }
    incomingFile.chunks.push(chunk); incomingFile.received += chunk.size;
    const percent = incomingFile.size ? Math.floor(incomingFile.received / incomingFile.size * 100) : 100;
    ui.receiveValue.textContent = `${percent}%`; ui.receiveFill.style.width = `${percent}%`;
  }
  function finishFile() {
    const item = incomingFile; incomingFile = null;
    if (item.received !== item.size) { status('Dosya eksik alındı; gönderici bağlantısı kesilmiş olabilir.', 'error'); ui.incoming.classList.add('hidden'); return; }
    const blob = new Blob(item.chunks, { type: item.mime }); const url = URL.createObjectURL(blob);
    const row = document.createElement('div'); row.className = 'received-item'; const label = document.createElement('span'); label.textContent = `${item.name} · ${formatSize(item.size)}`; const link = document.createElement('a'); link.href = url; link.download = item.name; link.textContent = 'İndir ↓'; row.append(label, link); ui.received.prepend(row); window.YakinFlow?.receivingFile(item.name,formatSize(item.size),url,link);
    ui.incoming.classList.add('hidden'); ui.receiveEmpty.classList.add('hidden'); status(`${item.name} alındı. İndirmek için dosya bağlantısını kullan.`); toast(`${item.name} başarıyla alındı.`);
  }
  async function createRoom() {
    ui.create.disabled = ui.join.disabled = true;
    try { await connect(); wsSend({ type: 'create' }); }
    catch (error) { status(error.message, 'error'); }
    finally { ui.create.disabled = ui.join.disabled = false; }
  }
  async function joinRoom() {
    const code = ui.inputCode.value.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) { status('Lütfen 6 haneli oda kodunu gir.', 'error'); ui.inputCode.focus(); return; }
    ui.create.disabled = ui.join.disabled = true;
    try { await connect(); wsSend({ type: 'join', code }); }
    catch (error) { status(error.message, 'error'); }
    finally { ui.create.disabled = ui.join.disabled = false; }
  }
  function leaveRoom() { window.YakinFlow?.disconnected();
    try { wsSend({ type: 'leave' }); } catch {}
    if (channel && channel.readyState !== 'closed') channel.close(); if (pc) pc.close();
    channel = pc = null; roomCode = ''; incomingFile = null; files = [];
    ui.roomActive.classList.add('hidden'); ui.roomActions.classList.remove('hidden'); ui.fileList.classList.add('hidden'); ui.sendProgress.classList.add('hidden'); ui.incoming.classList.add('hidden'); ui.receiveEmpty.classList.remove('hidden'); ui.fileInput.value = ''; ui.inputCode.value = '';
    connection('Hazır'); status('Başlamak için oda oluştur veya bir kod gir.'); refreshSendButton();
  }
  window.YakinFlowTransport = { sendText(text) { if (channel?.readyState !== 'open') throw new Error('Cihaz bağlantısı yok.'); channel.send(JSON.stringify({type:'flow-text',text:String(text).slice(0,2000)})); } };
  ui.create.addEventListener('click', createRoom); ui.join.addEventListener('click', joinRoom); ui.leave.addEventListener('click', leaveRoom);
  ui.copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(roomCode); toast('Oda kodu kopyalandı.'); } catch { toast(`Oda kodu: ${roomCode}`); } });
  ui.inputCode.addEventListener('input', () => { ui.inputCode.value = ui.inputCode.value.replace(/\D/g, '').slice(0, 6); });
  ui.inputCode.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  ui.fileInput.addEventListener('change', () => setFiles(ui.fileInput.files)); ui.send.addEventListener('click', sendFiles);
  for (const eventName of ['dragenter', 'dragover']) ui.dropzone.addEventListener(eventName, e => { e.preventDefault(); ui.dropzone.classList.add('dragover'); });
  for (const eventName of ['dragleave', 'drop']) ui.dropzone.addEventListener(eventName, e => { e.preventDefault(); ui.dropzone.classList.remove('dragover'); });
  ui.dropzone.addEventListener('drop', e => setFiles(e.dataTransfer.files));
})();
