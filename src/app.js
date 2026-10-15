/* FPTP/1: authenticated ephemeral ECDH + AES-256-GCM over a bounded local TCP
 * frame transport. No WebRTC, public servers, rooms, or external URLs.
 * First pairing MUST compare the same six digits on both physical devices.
 */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const E=new TextEncoder(),D=new TextDecoder();
 const C=window.crypto,identity=window.FileportIdentity;
 const ANDROID=!!window.FileportNative, invoke=window.__TAURI__?.core?.invoke;
 const MAX_FILE=1024*1024*1024,CHUNK=32*1024,CREDIT=256*1024;
 const ui={status:$('connectionStatus'),badge:$('connectionBadge'),state:$('connectionText'),input:$('fileInput'),drop:$('dropzone'),files:$('fileList'),send:$('sendFiles'),progress:$('sendProgressWrap'),progressLabel:$('sendProgressLabel'),progressValue:$('sendProgressValue'),progressFill:$('sendProgressFill'),incoming:$('incoming'),incomingName:$('incomingName'),receiveEmpty:$('receiveEmpty'),receiveLabel:$('receiveProgressLabel'),receiveValue:$('receiveProgressValue'),receiveFill:$('receiveProgressFill'),toast:$('toast'),pair:$('securePairOverlay'),pairCode:$('securePairCode'),pairInfo:$('securePairInfo'),approve:$('securePairApprove'),reject:$('securePairReject')};
 const nativeFile=ANDROID?{
  begin:async(name,size,mime,id)=>Number(window.FileportNative.beginDownload(name,mime,size,id)),
  append:async(id,offset,b64)=>Number(window.FileportNative.appendDownload(id,offset,b64)),
  sync:async id=>Number(window.FileportNative.syncDownload(id)),
  finish:async id=>window.FileportNative.finishDownload(id),
  verify:async(id,digest)=>window.FileportNative.verifyDownload(id,digest),
  pause:async id=>window.FileportNative.pauseDownload(id),
  abort:async id=>window.FileportNative.abortDownload(id)
 }:{
  begin:(name,size,mime,id)=>invoke('begin_download',{filename:name,size,transferId:id}),
  append:(id,offset,base64)=>invoke('append_download',{transferId:id,offset,base64}),
  sync:id=>invoke('sync_download',{transferId:id}),
  finish:id=>invoke('finish_download',{transferId:id}),
  verify:(id,digest)=>invoke('verify_download',{transferId:id,digest}),
  pause:id=>invoke('pause_download',{transferId:id}),
  abort:id=>invoke('abort_download',{transferId:id})
 };
 let session=null,selected=[],sending=false,incoming=null,currentOutgoing=null;
 let sendWait=null,ackWait=null,receiptWait=null,retryTimer=null,heartbeat=null,closing=false;
 let filesPending=[];
 const recentIdsKey='fileport-fptp-resume-v1';
 function setTransferActive(value){window.FileportTransferActive=!!value;if(ANDROID)window.FileportNative.setTransferActive(!!value);}
 const hex=identity.hex;
 const randomHex=n=>{const a=new Uint8Array(n);C.getRandomValues(a);return hex(a);};
 const toB64=a=>{let str='';for(let offset=0;offset<a.length;offset+=4096)str+=String.fromCharCode(...a.subarray(offset,offset+4096));return btoa(str);};
 const fromB64=s=>Uint8Array.from(atob(s),ch=>ch.charCodeAt(0));
 const bounded=async(promise,ms,message)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));};
 function deferred(ms=40000){let resolve,reject,timer;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>{});timer=setTimeout(()=>reject(Error('Peer response timed out')),ms);return{promise,resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};}
 function status(text,isError=false){if(ui.status){ui.status.textContent=text;ui.status.classList.toggle('error',isError);}if(ui.badge)ui.badge.classList.toggle('error',isError);}
 function connection(text,online=false){if(ui.state)ui.state.textContent=text;if(ui.badge)ui.badge.classList.toggle('online',online);}
 function toast(text){if(!ui.toast)return;ui.toast.textContent=text;ui.toast.classList.remove('hidden');setTimeout(()=>ui.toast.classList.add('hidden'),3500);}
 function safeName(v){return String(v||'file').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,150)||'file';}
 function readable(n){if(n<1024)return n+' B';const a=['KB','MB','GB'];let i=0;for(n/=1024;n>=1024&&i<2;n/=1024)i++;return n.toFixed(n<10?1:0)+' '+a[i];}
 function alertDisconnect(message){status(message,true);connection('Disconnected');window.FileportFlow?.disconnected();window.dispatchEvent(new Event('fileport-peer-disconnected'));}
 function resumeIndex(){try{let saved=JSON.parse(localStorage.getItem(recentIdsKey)||'{}');return saved&&typeof saved==='object'?saved:{};}catch{return {};}}
 function fileKey(f){return [f.name,f.size,f.lastModified||0].join('|');}
 function transferId(f){const key=fileKey(f),idx=resumeIndex();let id=idx[key];if(!/^[a-f0-9]{32}$/.test(id||'')){id=randomHex(16);idx[key]=id;localStorage.setItem(recentIdsKey,JSON.stringify(idx));}return id;}
 function removeTransferId(f){const idx=resumeIndex();delete idx[fileKey(f)];localStorage.setItem(recentIdsKey,JSON.stringify(idx));}
 async function transportSend(frame){if(ANDROID){window.FileportNative.transportSend(frame);return;}await invoke('transport_send',{frame});}
 function frameSend(frame){if(!session||session.closed)throw Error('Transport offline');return transportSend(JSON.stringify(frame));}
 function resetWaits(reason){for(const name of ['sendWait','ackWait','receiptWait']){const d=name==='sendWait'?sendWait:name==='ackWait'?ackWait:receiptWait;if(d)d.reject(Error(reason));}sendWait=ackWait=receiptWait=null;}
 function dropConnection(reason){
  const old=session;if(!old||old.closed)return;old.closed=true;clearInterval(heartbeat);clearTimeout(old.timeout);heartbeat=null;window.FileportConnection.currentPeerId=null;
  resetWaits(reason);if(incoming){const item=incoming;incoming=null;void nativeFile.pause(item.id).catch(()=>{});window.FileportFlow?.transferPause?.(item.cardId);}
  if(currentOutgoing)window.FileportFlow?.transferPause?.(currentOutgoing.cardId);
  setTransferActive(!!sending);session=null;refreshSend();alertDisconnect(reason);
 }
 async function openSession(){
  if(session)dropConnection('New connection');
  const s={closed:false,hello:null,remote:null,prepared:null,receiveQueue:Promise.resolve(),txQueue:Promise.resolve(),tx:0,rx:0,secretReady:false,approved:false,otherApproved:false,verified:false,peerName:'Device',timeout:null,txKey:null,rxKey:null};session=s;
  status('FPTP/1: verifying device identity');connection('Authenticating');
  s.timeout=setTimeout(()=>{if(session===s&&!s.verified){void closeTransport();dropConnection('Pairing timed out');}},120000);
  heartbeat=setInterval(()=>{if(session===s&&!s.closed){if(s.verified)void sendPacket({t:'ping'}).catch(()=>{});else void frameSend({v:1,t:'keepalive'}).catch(()=>{});}},4000);
  s.prepared=(async()=>{
   const permanent=await identity.identity();
   const eph=await C.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
   const ephPublic=await C.subtle.exportKey('jwk',eph.publicKey);
   const hello={v:1,t:'hello',id:permanent.id,jwk:permanent.jwk,nonce:randomHex(24),name:(window.FileportFlow?.deviceName?.()||'Device').slice(0,32),eph:{x:ephPublic.x,y:ephPublic.y}};
   const challenge=`FPTP/1|HELLO|${hello.id}|${hello.nonce}|${hello.eph.x}|${hello.eph.y}|${hello.name}`;
   hello.sig=await identity.sign(permanent.privateKey,challenge);
   s.permanent=permanent;s.eph=eph;s.hello=hello;
   if(session!==s||s.closed)return;
   await frameSend(hello);
  })();
  s.prepared.catch(error=>{status('Cryptographic setup failed: '+error.message,true);void closeTransport();});
 }
 async function receiveFrame(raw){
  const s=session;if(!s||s.closed)return;
  s.receiveQueue=s.receiveQueue.then(async()=>{
   await s.prepared;if(s.closed||session!==s)return;
   let msg;try{msg=JSON.parse(raw);}catch{throw Error('Invalid frame JSON');}
   if(msg?.v!==1||typeof msg.t!=='string')throw Error('Unsupported FPTP frame');
   if(msg.t==='keepalive')return;
   if(msg.t==='hello'){await receiveHello(s,msg);return;}
   if(msg.t==='sealed'){await receiveSealed(s,msg);return;}
   throw Error('Unexpected FPTP frame');
  }).catch(err=>{if(session===s&&!s.closed){status('FPTP rejected frame: '+err.message,true);void closeTransport();dropConnection('Protocol error');}});
 }
 async function receiveHello(s,msg){
  if(s.remote)throw Error('Duplicate identity frame');
  if(!msg.jwk||typeof msg.id!=='string'||!(/^[a-f0-9]{48}$/).test(msg.nonce)||!msg.eph||!msg.eph.x||!msg.eph.y||typeof msg.name!=='string'||msg.name.length>32)throw Error('Invalid identity format');
  if(await identity.keyId(msg.jwk)!==msg.id||msg.id===s.hello.id)throw Error('Identity fingerprint mismatch');
  const challenge=`FPTP/1|HELLO|${msg.id}|${msg.nonce}|${msg.eph.x}|${msg.eph.y}|${msg.name}`;
  if(!(await identity.verify(msg.jwk,msg.sig,challenge)))throw Error('Signature verification failed');
  s.remote=msg;s.peerName=String(msg.name||'Device').slice(0,32);
  const peers=[s.hello,msg].sort((a,b)=>a.id.localeCompare(b.id));
  const transcript='FPTP/1|SESSION|'+peers.map(p=>`${p.id}|${p.nonce}|${p.eph.x}|${p.eph.y}`).join('|');
  s.transcript=transcript;
  const remoteKey=await C.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:msg.eph.x,y:msg.eph.y,ext:true},{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=await C.subtle.deriveBits({name:'ECDH',public:remoteKey},s.eph.privateKey,256);
  const hkdf=await C.subtle.importKey('raw',shared,'HKDF',false,['deriveBits']);
  const salt=await identity.sha(transcript);
  const material=new Uint8Array(await C.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info:E.encode('FPTP/1|AES-GCM|directional')},hkdf,512));
  const low=s.hello.id<msg.id,sendBytes=material.slice(low?0:32,low?32:64),recvBytes=material.slice(low?32:0,low?64:32);
  s.txKey=await C.subtle.importKey('raw',sendBytes,{name:'AES-GCM'},false,['encrypt']);
  s.rxKey=await C.subtle.importKey('raw',recvBytes,{name:'AES-GCM'},false,['decrypt']);
  s.secretReady=true;
  const sas=await identity.sha('FPTP/1|VERIFY|'+transcript);
  const number=(sas[0]*65536+sas[1]*256+sas[2])%1000000;
  ui.pairCode.textContent=String(number).padStart(6,'0');ui.pair.classList.remove('hidden');
  const saved=identity.trusted(msg.id);
  if(saved&&await identity.keyId(saved.jwk)===msg.id){
   s.approved=true;ui.pairInfo.textContent='Previously paired device verified.';ui.approve.disabled=true;
   await sendPacket({t:'approve'});finishPair(s);
  }else{
   ui.pairInfo.textContent='First pairing: compare this code on both devices.';
   ui.approve.disabled=false;
  }
 }
 function frameIv(sequence){const bytes=new Uint8Array(12);new DataView(bytes.buffer).setBigUint64(4,BigInt(sequence));return bytes;}
 function sendPacket(packet){
  const s=session;if(!s||s.closed)return Promise.reject(Error('Transport offline'));
  const action=async()=>{
   if(!s.secretReady||s.closed||session!==s)throw Error('Encrypted channel unavailable');
   const seq=++s.tx;const bytes=E.encode(JSON.stringify(packet));
   if(bytes.length>131072)throw Error('Packet exceeds limit');
   const encrypted=new Uint8Array(await C.subtle.encrypt({name:'AES-GCM',iv:frameIv(seq),additionalData:E.encode('FPTP/1|'+s.transcript)},s.txKey,bytes));
   await frameSend({v:1,t:'sealed',seq,body:toB64(encrypted)});
  };
  const promise=s.txQueue.then(action);s.txQueue=promise.catch(()=>{});return promise;
 }
 async function receiveSealed(s,msg){
  if(!s.secretReady||!Number.isSafeInteger(msg.seq)||msg.seq!==s.rx+1||typeof msg.body!=='string'||msg.body.length>180000)throw Error('Invalid encrypted frame');
  const encrypted=fromB64(msg.body);
  const plain=await C.subtle.decrypt({name:'AES-GCM',iv:frameIv(msg.seq),additionalData:E.encode('FPTP/1|'+s.transcript)},s.rxKey,encrypted);
  s.rx=msg.seq;
  const packet=JSON.parse(D.decode(plain));
  if(packet.t==='approve'){s.otherApproved=true;finishPair(s);return;}
  if(packet.t==='reject'){void closeTransport();dropConnection('Pairing rejected');return;}
  if(!s.verified)throw Error('Data received before mutual approval');
  await receivePacket(packet);
 }
 function finishPair(s){
  if(s.closed||session!==s||!s.approved||!s.otherApproved||s.verified)return;
  s.verified=true;clearTimeout(s.timeout);ui.pair.classList.add('hidden');window.FileportConnection.currentPeerId=s.remote.id;
  identity.putTrusted(s.remote.id,s.remote.jwk,s.peerName);
  window.FileportFlow?.peerName(s.peerName);window.FileportFlow?.connected();
  window.dispatchEvent(new Event('fileport-peer-connected'));connection('Connected',true);status('Secure local connection ready');refreshSend();
  if(ANDROID && filesPending.length&&!sending){setTimeout(()=>{if(session===s&&s.verified)void sendFiles(filesPending);},400);}
  else if(!ANDROID && filesPending.length&&!sending){setTimeout(()=>{if(session===s&&s.verified)void sendFiles(filesPending);},400);}
 }
 ui.approve.addEventListener('click',async()=>{
  const s=session;if(!s||!s.secretReady||s.approved)return;
  s.approved=true;ui.approve.disabled=true;ui.pairInfo.textContent='Waiting for approval on the other device...';
  try{await sendPacket({t:'approve'});finishPair(s);}catch(err){status(err.message,true);}
 });
 ui.reject.addEventListener('click',()=>{void sendPacket({t:'reject'}).catch(()=>{}).finally(()=>{void closeTransport();dropConnection('Pairing rejected');});});
 async function closeTransport(){if(ANDROID)window.FileportNative.disconnectTransport();else await invoke('transport_close');}
 function transportClosed(reason){dropConnection(reason);}
 window.FileportTransport={
  onOpen(){void openSession();},
  onFrame(raw){void receiveFrame(raw);},
  onClosed(){transportClosed('Local connection lost');},
  onError(message){status(String(message),true);window.dispatchEvent(new Event('fileport-connection-error'));}
 };
 if(!ANDROID){
  window.__TAURI__?.event?.listen('fptp-event',event=>{
   const data=event.payload;
   if(data.kind==='open')window.FileportTransport.onOpen();
   if(data.kind==='frame')window.FileportTransport.onFrame(data.data);
   if(data.kind==='closed')window.FileportTransport.onClosed();
   if(data.kind==='error')window.FileportTransport.onError(data.data);
  });
 }
 async function host(){
  if(ANDROID)return;
  try{const myself=await identity.identity();await invoke('set_discovery_identity',{deviceId:myself.id});status('Waiting for a paired device on local Wi-Fi');connection('Waiting');}
  catch(error){status('Cannot announce this device: '+error.message,true);}
 }
 function connectDevice(device){
  if(!ANDROID)throw Error('Only Android initiates connections');
  if(!device?.address||device.port!==38477)throw Error('Local IP required');
  window.FileportConnection.lastAddress=device.address;
  window.FileportNative.connectTransport(device.address,38477);
  connection('Connecting');status('Connecting to '+device.address);
 }
 function statusTransfer(id,percent,inbound=false){
  percent=Math.floor(Math.max(0,Math.min(99,percent)));
  if(inbound){ui.receiveValue.textContent=percent+'%';ui.receiveFill.style.width=percent+'%';}
  else {ui.progressValue.textContent=percent+'%';ui.progressFill.style.width=percent+'%';}
  window.FileportFlow?.transferProgress(id,percent);
 }
 async function receivePacket(p){
  if(p.t==='ping'){await sendPacket({t:'pong'});return;}
  if(p.t==='pong')return;
  if(p.t==='text'){if(typeof p.text==='string'&&p.text.length<=2000)window.FileportFlow?.incomingText(p.text);return;}
  if(p.t==='file-start'){
   if(incoming){await sendPacket({t:'file-error',id:p.id,message:'Another file is being received'});return;}
   if(!/^[a-f0-9]{32}$/.test(p.id)||!Number.isSafeInteger(p.size)||p.size<0||p.size>MAX_FILE){await sendPacket({t:'file-error',id:p.id,message:'Invalid transfer request'});return;}
   const item={id:p.id,name:safeName(p.name),mime:String(p.mime||'application/octet-stream'),size:p.size,received:0,cardId:null};
   incoming=item;setTransferActive(true);
   item.cardId=window.FileportFlow?.transferBegin('receive',item.name,readable(item.size));
   ui.incoming?.classList.remove('hidden');ui.receiveEmpty?.classList.add('hidden');ui.incomingName.textContent=item.name;
   try{const offset=await nativeFile.begin(item.name,item.size,item.mime,item.id);
    if(incoming!==item)return;if(!Number.isSafeInteger(offset)||offset<0||offset>item.size)throw Error('Invalid native resume offset');
    item.received=offset;statusTransfer(item.cardId,item.size?offset/item.size*100:0,true);
    await sendPacket({t:'file-ready',id:item.id,offset});
   }catch(error){await reportReceiveError(item,error.message);}
   return;
  }
  if(p.t==='file-ready'){if(sendWait&&currentOutgoing?.id===p.id){sendWait.resolve(p.offset);sendWait=null;}return;}
  if(p.t==='file-chunk'){
   const item=incoming;if(!item||p.id!==item.id||p.offset!==item.received||typeof p.data!=='string')throw Error('Unexpected file chunk/offset');
   const bytes=fromB64(p.data);if(bytes.byteLength>CHUNK||item.received+bytes.byteLength>item.size)throw Error('Invalid file chunk size');
   const newOffset=await nativeFile.append(item.id,item.received,p.data);if(newOffset!==item.received+bytes.byteLength)throw Error('Disk write mismatch');
   item.received=newOffset;statusTransfer(item.cardId,item.size?item.received/item.size*100:99,true);
   if(item.received%CREDIT===0||item.received===item.size){await nativeFile.sync(item.id);await sendPacket({t:'file-ack',id:item.id,offset:item.received});}
   return;
  }
  if(p.t==='file-ack'){if(ackWait&&currentOutgoing?.id===p.id){ackWait.resolve(p.offset);ackWait=null;}return;}
  if(p.t==='file-end'){
   const item=incoming;if(!item||p.id!==item.id)return;
   if(item.received!==item.size){await reportReceiveError(item,'Transfer incomplete');return;}
   try{if(typeof p.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(p.sha256))throw Error('Missing SHA-256 checksum');
    window.FileportFlow?.transferSaving(item.cardId);await nativeFile.sync(item.id);
    const valid=await nativeFile.verify(item.id,p.sha256);if(valid!==true)throw Error('SHA-256 mismatch');
    await nativeFile.finish(item.id);
    incoming=null;setTransferActive(sending);
    window.FileportFlow?.transferFinish(item.cardId,true);ui.incoming?.classList.add('hidden');
    await sendPacket({t:'file-complete',id:item.id});
    if(!ANDROID&&document.hidden)await invoke('notify_received',{filename:item.name}).catch(()=>{});
   }catch(error){await reportReceiveError(item,error.message);}
   return;
  }
  if(p.t==='file-complete'){if(receiptWait&&currentOutgoing?.id===p.id){receiptWait.resolve();receiptWait=null;}return;}
  if(p.t==='file-error'){
   const error=Error(String(p.message||'Peer rejected file'));
   if(currentOutgoing?.id===p.id){sendWait?.reject(error);ackWait?.reject(error);receiptWait?.reject(error);sendWait=ackWait=receiptWait=null;}
   return;
  }
 }
 async function reportReceiveError(item,message){
  if(incoming===item){incoming=null;window.FileportFlow?.transferFinish(item.cardId,false,message);await (message==='SHA-256 mismatch'?nativeFile.abort(item.id):nativeFile.pause(item.id)).catch(()=>{});setTransferActive(sending);}
  await sendPacket({t:'file-error',id:item.id,message:String(message).slice(0,120)}).catch(()=>{});
 }
 function setFiles(list){selected=Array.from(list||[]).filter(f=>f.size<=MAX_FILE);ui.files.replaceChildren();
  ui.files.classList.toggle('hidden',!selected.length);
  for(const f of selected){const div=document.createElement('div');div.className='file-row';const n=document.createElement('span'),z=document.createElement('span');n.textContent=safeName(f.name);z.textContent=readable(f.size);div.append(n,z);ui.files.append(div);}
  if(selected.length< (list?.length||0))toast('Maximum file size is 1 GB');refreshSend();
 }
 function refreshSend(){ui.send.disabled=!session?.verified||sending||!selected.length;}
 async function sendFiles(batch=selected){
  if(sending||!session?.verified||!batch.length)return;
  sending=true;filesPending=batch.slice();setTransferActive(true);refreshSend();ui.progress.classList.remove('hidden');
  try{
   for(const file of filesPending){
    if(file.size>MAX_FILE)throw Error('File exceeds 1 GB');
    const id=transferId(file),cardId=window.FileportFlow?.transferBegin('send',safeName(file.name),readable(file.size));
    currentOutgoing={file,id,cardId};sendWait=deferred();
    await sendPacket({t:'file-start',id,name:safeName(file.name),size:file.size,mime:file.type||'application/octet-stream'});
    let offset=await sendWait.promise;sendWait=null;
    if(!Number.isSafeInteger(offset)||offset<0||offset>file.size)throw Error('Invalid resume offset');
    statusTransfer(cardId,file.size?offset/file.size*100:0);
    const fileHash=new window.FileportSha256();
    // On resume, hash the existing prefix without buffering the full file.
    for(let cursor=0;cursor<offset;cursor+=CHUNK){fileHash.update(new Uint8Array(await file.slice(cursor,Math.min(cursor+CHUNK,offset)).arrayBuffer()));}
    while(offset<file.size){
     const boundary=Math.min(file.size,(Math.floor(offset/CREDIT)+1)*CREDIT);ackWait=deferred(45000);
     let pos=offset;
     while(pos<boundary){const blob=await file.slice(pos,Math.min(pos+CHUNK,boundary)).arrayBuffer();
      fileHash.update(new Uint8Array(blob));
      await sendPacket({t:'file-chunk',id,offset:pos,data:toB64(new Uint8Array(blob))});pos+=blob.byteLength;
     }
     const ack=await ackWait.promise;ackWait=null;
     if(ack!==boundary)throw Error('Receiver durable offset mismatch');
     offset=ack;statusTransfer(cardId,file.size?offset/file.size*100:99);
     ui.progressLabel.textContent='Sending: '+safeName(file.name);
    }
    receiptWait=deferred(70000);window.FileportFlow?.transferSaving(cardId);
    await sendPacket({t:'file-end',id,sha256:fileHash.digest()});await receiptWait.promise;receiptWait=null;
    window.FileportFlow?.transferFinish(cardId,true);removeTransferId(file);currentOutgoing=null;filesPending.shift();
   }
   selected=[];filesPending=[];ui.input.value='';setFiles([]);toast('All files saved on receiving device');
   ui.progressValue.textContent='100%';ui.progressFill.style.width='100%';
   setTimeout(()=>ui.progress.classList.add('hidden'),3000);
  }catch(error){
   status('Transfer paused: '+error.message,true);
   if(currentOutgoing)window.FileportFlow?.transferPause?.(currentOutgoing.cardId);
   // Keep File objects and stable transfer IDs to continue after reconnect.
  }finally{sending=false;setTransferActive(!!incoming);refreshSend();
   if(session?.verified&&filesPending.length)setTimeout(()=>{if(session?.verified&&!sending)void sendFiles(filesPending);},2500);
  }
 }
 ui.input.addEventListener('change',()=>{setFiles(ui.input.files);window.dispatchEvent(new Event('fileport-files-selected'));});
 ui.send.addEventListener('click',()=>{void sendFiles();});
 for(const eventName of ['dragenter','dragover'])ui.drop?.addEventListener(eventName,event=>{event.preventDefault();ui.drop.classList.add('dragover');});
 for(const eventName of ['dragleave','drop'])ui.drop?.addEventListener(eventName,event=>{event.preventDefault();ui.drop.classList.remove('dragover');});
 ui.drop?.addEventListener('drop',event=>{setFiles(event.dataTransfer.files);window.dispatchEvent(new Event('fileport-files-selected'));});
 // The chat pane accepts dropped files without navigating away from Fileport.
 // Dropping a file queues it through the same validated transfer path as the picker.
 const chatDrop=document.getElementById('flowMessages');
 if(chatDrop){
  let dragDepth=0;
  chatDrop.addEventListener('dragenter',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();dragDepth++;chatDrop.classList.add('fileport-drag-target');});
  chatDrop.addEventListener('dragover',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();event.dataTransfer.dropEffect='copy';chatDrop.classList.add('fileport-drag-target');});
  chatDrop.addEventListener('dragleave',event=>{event.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)chatDrop.classList.remove('fileport-drag-target');});
  chatDrop.addEventListener('drop',event=>{
   event.preventDefault();event.stopPropagation();dragDepth=0;chatDrop.classList.remove('fileport-drag-target');
   const files=event.dataTransfer?.files;
   if(!files?.length)return;
   if(!session?.verified){status('Connect to a trusted device before dropping files',true);return;}
   setFiles(files);window.dispatchEvent(new Event('fileport-files-selected'));
   if(selected.length)void sendFiles();
  });
 }
 // Prevent dropping a file outside the drop targets from replacing the app page.
 window.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();});
 window.addEventListener('drop',event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();});
 window.FileportConnection={host,connectDevice,disconnect:()=>{void closeTransport();dropConnection('Disconnected');},pickFiles:()=>ui.input.click()};
 window.FileportFlowTransport={sendText(text){if(!session?.verified)throw Error('Device is not authenticated');void sendPacket({t:'text',text:String(text).slice(0,2000)}).catch(e=>status(e.message,true));}};
 window.FileportInternal={sendFiles:()=>ui.send.click(),pickFiles:()=>ui.input.click()};
 window.FileportDisconnectIfIdle=()=>{if(!window.FileportTransferActive)window.FileportConnection.disconnect();};
 // When backgrounded, disconnect only after 3 minutes of inactivity.
 let backgroundTimer;
 function checkBackgroundIdle(){
  if(!document.hidden)return;
  if(window.FileportTransferActive){backgroundTimer=setTimeout(checkBackgroundIdle,30000);return;}
  window.FileportDisconnectIfIdle();
 }
 document.addEventListener('visibilitychange',()=>{
  clearTimeout(backgroundTimer);if(document.hidden)backgroundTimer=setTimeout(checkBackgroundIdle,180000);
 });
})();
