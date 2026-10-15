(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const key = 'yakin-flow-history-v1';
  const deviceKey = 'yakin-flow-device-v1';
  const nameField = byId('flowDeviceName'), panel = byId('flowMessages'), textField = byId('flowText');
  const btnText=byId('flowSendText'), btnFiles=byId('flowSendFiles'), recent=byId('flowRecent');
  if (!panel) return;
  let history=[]; let connected=false; let peer='Other device';
  try { const parsed=JSON.parse(localStorage.getItem(key)||'[]'); if(Array.isArray(parsed))history=parsed.slice(-80); }catch{}
  nameField.value=localStorage.getItem(deviceKey)|| (window.FileportNative ? 'Android phone' : 'Computer');
  function when(){return new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});}
  function displayDate(timestamp){return new Date(timestamp).toLocaleString('en-US',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
  function save(){try{localStorage.setItem(key,JSON.stringify(history.slice(-80)));}catch{} renderRecent();}
  function addHistory(type,title){history.push({type,title,time:Date.now()});save();}
  function renderRecent(){recent.replaceChildren();const recentItems=history.slice(-8).reverse();if(!recentItems.length){recent.textContent='No transfer or connection history yet.';return;}for(const item of recentItems){const line=document.createElement('div');line.className='flow-history-item';const text=document.createElement('span');text.textContent=item.title;const time=document.createElement('small');time.textContent=displayDate(item.time);line.append(text,time);recent.append(line);}}
  function message(text,mine,type='text',url=null,downloadName=null){const empty=panel.querySelector('.flow-empty');if(empty)empty.remove();const bubble=document.createElement('div');bubble.className='flow-bubble'+(mine?' mine':'')+(type==='file'?' file':'');const body=document.createElement('div');body.className='flow-body';body.textContent=text;bubble.append(body);if(url){const a=document.createElement('a');a.href=url;a.textContent='Download file ↓';a.download=downloadName||'file';a.rel='noopener';bubble.append(a);}const meta=document.createElement('div');meta.className='flow-meta';meta.textContent=(mine?'You · ':peer+' · ')+when();bubble.append(meta);panel.append(bubble);panel.scrollTop=panel.scrollHeight;}
  const localized = english => window.FileportI18n?.t(english) || english;
  // Active transfer bubbles are independent of message history and update without duplicates.
  const activeTransfers=new Map();let transferSequence=0;
  function transferBegin(direction,name,size){
    const empty=panel.querySelector('.flow-empty');if(empty)empty.remove();
    const id=++transferSequence;
    const bubble=document.createElement('div');bubble.className='flow-bubble file'+(direction==='send'?' mine':'');
    const body=document.createElement('div');body.className='flow-body';body.textContent=name+' · '+size;
    const caption=document.createElement('div');caption.className='flow-transfer-caption';caption.textContent=localized(direction==='send'?'Sending':'Receiving')+' · 0%';
    const rail=document.createElement('div');rail.className='flow-transfer-rail';rail.setAttribute('role','progressbar');rail.setAttribute('aria-valuemin','0');rail.setAttribute('aria-valuemax','100');rail.setAttribute('aria-valuenow','0');
    const fill=document.createElement('div');fill.className='flow-transfer-fill';rail.append(fill);
    const meta=document.createElement('div');meta.className='flow-meta';meta.textContent=(direction==='send'?'You · ':peer+' · ')+when();
    bubble.append(body,caption,rail,meta);panel.append(bubble);panel.scrollTop=panel.scrollHeight;
    activeTransfers.set(id,{bubble,caption,rail,fill,direction,name});return id;
  }
  function transferProgress(id,value){
    const t=activeTransfers.get(id);if(!t)return;
    const pct=Math.max(0,Math.min(99,Math.floor(Number(value)||0)));
    t.fill.style.width=pct+'%';t.rail.setAttribute('aria-valuenow',String(pct));
    t.caption.textContent=(window.FileportI18n?.t(t.direction==='send'?'Sending':'Receiving') || (t.direction==='send'?'Sending':'Receiving'))+' · %'+pct;
  }
  function transferSaving(id){const t=activeTransfers.get(id);if(t)t.caption.textContent=window.FileportI18n?.t(t.direction==='send'?'Waiting for receiver to save…':'Saving file…') || (t.direction==='send'?'Waiting for receiver to save…':'Saving file…');}
  function transferPause(id){const item=activeTransfers.get(id);if(!item)return;
    item.caption.textContent=localized('Paused · resume after reconnect');activeTransfers.delete(id);
  }
  function transferFinish(id,ok,detail=''){
    const t=activeTransfers.get(id);if(!t)return;
    if(ok){t.fill.style.width='100%';t.rail.setAttribute('aria-valuenow','100');t.caption.textContent=localized('Complete')+' · 100%';addHistory(t.direction,t.direction==='send'?'Sent: '+t.name:'Received: '+t.name,null);}
    else {t.bubble.classList.add('flow-transfer-error');t.caption.textContent='Transfer failed'+(detail?' · '+String(detail).slice(0,90):'');}
    activeTransfers.delete(id);
  }
  function system(text){const node=document.createElement('div');node.className='flow-event';node.textContent=text;panel.append(node);panel.scrollTop=panel.scrollHeight;}
  function online(value){connected=!!value;btnText.disabled=!connected||!textField.value.trim();btnFiles.disabled=!connected||!byId('fileInput').files.length;const s=byId('flowLive');s.classList.toggle('is-online',connected);s.textContent=connected?'● Connected':'● Offline';byId('flowDeviceStatus').textContent=connected?peer+' · secure connection':'Connection lost · Reconnect.';}
  function send(){const value=textField.value.trim();if(!connected||!value)return;if(value.length>2000)return;try{window.FileportFlowTransport.sendText(value);message(value,true);addHistory('message','Sent message',null);textField.value='';btnText.disabled=true;}catch(err){system('Message not sent: '+err.message);}}
  btnText.addEventListener('click',send);textField.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});textField.addEventListener('input',()=>btnText.disabled=!connected||!textField.value.trim());
  byId('flowPlus').addEventListener('click',()=>{if(connected)byId('fileInput').click();else system('Connect to a device first.');});
  byId('flowSelectFile').addEventListener('click',()=>{if(connected)byId('fileInput').click();else system('Connect to a device first.');});
  byId('fileInput').addEventListener('change',()=>{btnFiles.disabled=!connected||!byId('fileInput').files.length;if(connected&&byId('fileInput').files.length)queueMicrotask(()=>byId('sendFiles').click());});
  btnFiles.addEventListener('click',()=>{if(!byId('sendFiles').disabled)byId('sendFiles').click();else system('Select a file and check the connection.');});
  byId('flowSaveDevice').addEventListener('click',()=>{const name=nameField.value.trim().slice(0,32)||'My device';localStorage.setItem(deviceKey,name);nameField.value=name;system('Device name saved: '+name);});
  byId('flowClearHistory').addEventListener('click',()=>{if(!confirm('Clear local Fileport history?'))return;history=[];save();system('Local history cleared.');});
  renderRecent();online(false);
  window.FileportFlow={
    deviceName(){return (nameField.value.trim()||'My device').slice(0,32);},
    peerName(name){peer=name.replace(/[\u0000-\u001f]/g,'').slice(0,32)||'Other device';byId('flowDeviceStatus').textContent=peer+' · secure connection established.';addHistory('pair','Bağlanılan cihaz: '+peer,null);system(peer+' connected.');},

    connected(){online(true);system('Devices connected.');},
    disconnected(){online(false);system('Connection lost.');},
    incomingText(text){if(typeof text!=='string'||text.length>2000)return;message(text,false);addHistory('message','Received message',null);},
    transferBegin,transferProgress,transferSaving,transferFinish,transferPause,
    sendingFile(name,size){message('Dosya: '+name+' · '+size,true,'file');addHistory('send','Sent: '+name,null);},
    receivingFile(name,size,url,originalLink){message('Dosya alındı: '+name+' · '+size,false,'file'); if(originalLink && window.FileportNative){const a=panel.querySelector('.flow-bubble:last-child a');if(a){a.removeAttribute('href');a.setAttribute('role','button');a.tabIndex=0;a.onclick=e=>{e.preventDefault();originalLink.click();};a.onkeydown=e=>{if(e.key==='Enter')originalLink.click();};}}addHistory('receive','Received: '+name,null);},
    error(text){system(text);}
  };
})();
