(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const key = 'yakin-flow-history-v1';
  const deviceKey = 'yakin-flow-device-v1';
  const nameField = byId('flowDeviceName'), panel = byId('flowMessages'), textField = byId('flowText');
  const btnText=byId('flowSendText'), btnFiles=byId('flowSendFiles'), recent=byId('flowRecent');
  if (!panel) return;
  let history=[]; let activeRoom=''; let connected=false; let peer='Karşı cihaz';
  try { const parsed=JSON.parse(localStorage.getItem(key)||'[]'); if(Array.isArray(parsed))history=parsed.slice(-80); }catch{}
  nameField.value=localStorage.getItem(deviceKey)|| (window.YakinNative ? 'Android telefon' : 'Bilgisayar');
  function when(){return new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});}
  function displayDate(timestamp){return new Date(timestamp).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
  function save(){try{localStorage.setItem(key,JSON.stringify(history.slice(-80)));}catch{} renderRecent();}
  function addHistory(type,title,room){history.push({type,title,room:room||activeRoom,time:Date.now()});save();}
  function renderRecent(){recent.replaceChildren();const recentItems=history.slice(-8).reverse();if(!recentItems.length){recent.textContent='Henüz bağlantı veya aktarım geçmişi yok.';return;}for(const item of recentItems){const line=document.createElement('div');line.className='flow-history-item';const text=document.createElement('span');text.textContent=item.title;const time=document.createElement('small');time.textContent=displayDate(item.time);line.append(text,time);recent.append(line);}}
  function message(text,mine,type='text',url=null,downloadName=null){const empty=panel.querySelector('.flow-empty');if(empty)empty.remove();const bubble=document.createElement('div');bubble.className='flow-bubble'+(mine?' mine':'')+(type==='file'?' file':'');const body=document.createElement('div');body.className='flow-body';body.textContent=text;bubble.append(body);if(url){const a=document.createElement('a');a.href=url;a.textContent='Dosyayı indir ↓';a.download=downloadName||'dosya';a.rel='noopener';bubble.append(a);}const meta=document.createElement('div');meta.className='flow-meta';meta.textContent=(mine?'Sen · ':peer+' · ')+when();bubble.append(meta);panel.append(bubble);panel.scrollTop=panel.scrollHeight;}
  function system(text){const node=document.createElement('div');node.className='flow-event';node.textContent=text;panel.append(node);panel.scrollTop=panel.scrollHeight;}
  function online(value){connected=!!value;btnText.disabled=!connected||!textField.value.trim();btnFiles.disabled=!connected;const s=byId('flowLive');s.classList.toggle('is-online',connected);s.textContent=connected?'● Bağlandı':'● Çevrimdışı';byId('flowDeviceStatus').textContent=connected?'Oda '+activeRoom+' · Uçtan uca şifreli WebRTC bağlantısı':'Bağlanmak için oda oluştur veya katıl.';}
  function send(){const value=textField.value.trim();if(!connected||!value)return;if(value.length>2000)return;try{window.YakinFlowTransport.sendText(value);message(value,true);addHistory('message','Gönderilen mesaj',activeRoom);textField.value='';btnText.disabled=true;}catch(err){system('Mesaj gönderilemedi: '+err.message);}}
  btnText.addEventListener('click',send);textField.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});textField.addEventListener('input',()=>btnText.disabled=!connected||!textField.value.trim());
  byId('flowSelectFile').addEventListener('click',()=>byId('fileInput').click());
  btnFiles.addEventListener('click',()=>byId('sendFiles').click());
  byId('flowSaveDevice').addEventListener('click',()=>{const name=nameField.value.trim().slice(0,32)||'Cihazım';localStorage.setItem(deviceKey,name);nameField.value=name;system('Cihaz adı kaydedildi: '+name);});
  byId('flowClearHistory').addEventListener('click',()=>{if(!confirm('Bu cihazdaki Yakın Flow geçmişi silinsin mi?'))return;history=[];save();system('Yerel geçmiş temizlendi.');});
  renderRecent();online(false);
  window.YakinFlow={
    deviceName(){return (nameField.value.trim()||'Cihazım').slice(0,32);},
    peerName(name){peer=name.replace(/[\u0000-\u001f]/g,'').slice(0,32)||'Karşı cihaz';byId('flowDeviceStatus').textContent=peer+' ile bağlantı kuruldu · Oda '+activeRoom;addHistory('pair','Bağlanılan cihaz: '+peer,activeRoom);system(peer+' bağlandı.');},
    room(code){activeRoom=code;addHistory('room','Oda açıldı / katılındı · '+code,code);system('Oda '+code+' hazır. Karşı cihaz bekleniyor.');},
    connected(){online(true);system('Cihazlar bağlandı.');},
    disconnected(){online(false);system('Bağlantı kesildi.');},
    incomingText(text){if(typeof text!=='string'||text.length>2000)return;message(text,false);addHistory('message','Alınan mesaj',activeRoom);},
    sendingFile(name,size){message('📎 '+name+' · '+size,true,'file');addHistory('send','Gönderildi: '+name,activeRoom);},
    receivingFile(name,size,url,originalLink){message('📎 '+name+' · '+size,false,'file',url,name); if(originalLink && window.YakinNative){const a=panel.querySelector('.flow-bubble:last-child a');if(a){a.removeAttribute('href');a.setAttribute('role','button');a.tabIndex=0;a.onclick=e=>{e.preventDefault();originalLink.click();};a.onkeydown=e=>{if(e.key==='Enter')originalLink.click();};}}addHistory('receive','Alındı: '+name,activeRoom);},
    error(text){system(text);}
  };
})();
