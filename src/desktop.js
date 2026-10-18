/* Fileport v1.7: PC-led discovery and authenticated LAN connection requests. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const frame=document.querySelector('.desktop-frame');
 const tabs=[...document.querySelectorAll('[data-view]')];
 const setup=$('desktopPairPanel'),welcome=$('pairWelcome'),deviceStep=$('pairWaiting'),reconnect=$('flowReconnect');
 const local=window.FileportIdentity;
 let online=false,started=false,addingDevice=false,attempt=null,stopping=false,lastPeer='';
 const nearby=new Map();
 window.FileportDesktop={expectedPeerId:()=>attempt?.id||null};
 const trusted=()=>local.readTrusted();
 const language=()=>window.FileportI18n?.language==='tr';
 const txt=(tr,en)=>language()?tr:en;
 function choose(view){frame.dataset.view=view;tabs.forEach(b=>b.classList.toggle('active',b.dataset.view===view));const about=$('desktopAbout');if(about)about.hidden=view!=='about';}
 tabs.forEach(button=>button.addEventListener('click',()=>choose(button.dataset.view)));
 function recentPhones(){
  const now=Date.now();return [...nearby.values()].filter(d=>now-d.lastSeen<12000);
 }
 function showDevices(){
  // Bound the discovery cache even after long-running LAN sessions.
  const now=Date.now();for(const [id,phone] of nearby)if(now-phone.lastSeen>300000)nearby.delete(id);
  const list=$('desktopNearbyPhones');list.replaceChildren();
  for(const phone of recentPhones()){
   if(trusted().some(p=>p.id===phone.id))continue;
   const button=document.createElement('button');button.type='button';button.className='nearby-device';
   button.textContent=phone.name+' · Wi-Fi / LAN';
   button.addEventListener('click',()=>void startRequest('setup',phone.id));
   list.append(button);
  }
  if(!list.childElementCount){list.textContent=txt('Fileport açık telefonlar aranıyor…','Looking for phones running Fileport…');}
  const known=$('pcReconnectDevices');known.replaceChildren();
  for(const item of trusted()){
   const match=nearby.get(item.id),live=match&&Date.now()-match.lastSeen<12000;
   const button=document.createElement('button');button.type='button';button.className='nearby-device';
   button.textContent=item.name+(live?' · Wi-Fi / LAN':' · '+txt('Telefonun Fileport uygulamasını açın','Open Fileport on the phone'));
   button.addEventListener('click',()=>void startRequest('reconnect',item.id));
   known.append(button);
  }
 }
 function render(){
  const first=!trusted().length||addingDevice;
  setup.classList.toggle('hidden',!first);
  reconnect.classList.toggle('hidden',first||online);
  welcome.classList.toggle('hidden',started);
  deviceStep.classList.toggle('hidden',!started);
  $('pcReconnect').textContent=attempt?txt('İptal et','Cancel request'):txt('Bağlan','Connect');
  showDevices();
 }
 function cancelRequest(message){
  if(!attempt)return;
  clearInterval(attempt.timer);clearTimeout(attempt.deadline);attempt=null;
  $('pcReconnectInfo').textContent=message||'';
  $('desktopPairCode').textContent=message||txt('Telefonunuzu seçin.','Select your phone.');
  render();
 }
 async function signedRequest(a,phone){
  const mine=await local.identity();
  const name=(window.FileportFlow?.deviceName?.()||'Windows PC').slice(0,32);
  const ts=Date.now();const nonce=local.nonce().slice(0,32);
  const data={v:1,kind:'connect-request',id:mine.id,jwk:mine.jwk,target:a.id,nonce,ts,mode:a.mode,name};
  const transcript=`FILEPORT/REQUEST/1|${data.id}|${data.target}|${data.nonce}|${data.ts}|${data.mode}|${data.name}`;
  data.sig=await local.sign(mine.privateKey,transcript);
  return JSON.stringify(data);
 }
 async function pulse(a){
  if(attempt!==a||online||a.running)return;
  const phone=nearby.get(a.id);
  // A recently paired IP can be retried while fresh discovery catches up.
  // The signed target ID still prevents pairing with an unrelated phone.
  if(!phone||Date.now()-phone.lastSeen>300000){
   $('pcReconnectInfo').textContent=txt('Telefon bulunamadı. Telefonunuzda Fileport’u açın.','Phone not detected. Open Fileport on the phone.');
   return;
  }
  a.running=true;
  try{
   if(!a.packet||Date.now()-a.signedAt>19000){a.packet=await signedRequest(a,phone);a.signedAt=Date.now();}
   if(attempt===a)await window.__TAURI__.core.invoke('send_phone_request',{address:phone.address,packet:a.packet});
  }catch(error){console.warn('Phone connection request failed',error);}
  finally{a.running=false;}
 }
 async function startRequest(mode,id){
  if(online)return;
  cancelRequest();
  const a={mode,id,timer:null,deadline:null,running:false,packet:'',signedAt:0};attempt=a;
  await window.FileportConnection.host();
  if(attempt!==a)return;
  const status=txt('60 saniye boyunca bağlantı isteği gönderiliyor…','Sending connection request for 60 seconds…');
  $('pcReconnectInfo').textContent=status;$('desktopPairCode').textContent=status;
  a.timer=setInterval(()=>void pulse(a),3000);void pulse(a);
  a.deadline=setTimeout(()=>cancelRequest(txt('Süre doldu. Tekrar Bağlan’a basın.','Request timed out. Press Connect to try again.')),60000);
  render();
 }
 async function begin(){started=true;render();await window.FileportConnection.host();}
 window.__TAURI__?.event?.listen('fileport-phone-found',event=>{
  const p=event.payload;
  if(!p||!/^[a-f0-9]{64}$/.test(p.id)||typeof p.address!=='string')return;
  const safe=String(p.name||'Android phone').replace(/[\x00-\x1f]/g,'').slice(0,32)||'Android phone';
  nearby.set(p.id,{...p,name:safe,lastSeen:Date.now()});showDevices();
  if(attempt&&attempt.id===p.id&&!attempt.running)void pulse(attempt);
 });
 window.addEventListener('fileport-peer-connected',()=>{
  online=true;lastPeer=window.FileportConnection.peerId||lastPeer;
  if(lastPeer)localStorage.setItem('fileport-last-peer',lastPeer);
  cancelRequest();started=false;addingDevice=false;render();choose('chat');
 });
 window.addEventListener('fileport-peer-disconnected',()=>{online=false;render();});
 window.addEventListener('fileport-connection-error',()=>{if(!online)render();});
 window.addEventListener('fileport-trusted-updated',render);
 $('desktopStart').addEventListener('click',()=>void begin());
 $('desktopRetryWaiting').addEventListener('click',()=>{showDevices();void window.FileportConnection.host();});
 $('desktopCancel').addEventListener('click',()=>{cancelRequest();started=false;addingDevice=false;render();});
 $('desktopAddDevice').addEventListener('click',()=>{addingDevice=true;void begin();});
 $('pcReconnect').addEventListener('click',()=>{
  if(attempt){cancelRequest(txt('Bağlantı isteği iptal edildi.','Connection request canceled.'));return;}
  const records=trusted();const remembered=localStorage.getItem('fileport-last-peer');
  const selected=records.find(r=>r.id===remembered)||records[0];
  if(selected)void startRequest('reconnect',selected.id);
 });
 // Native name is used for signed HELLO and the visible Windows confirmation prompt.
 const deviceKey='yakin-flow-device-v1';
 if(!localStorage.getItem(deviceKey)){
  window.__TAURI__?.core?.invoke('windows_device_name').then(name=>{
   if(!localStorage.getItem(deviceKey)&&typeof name==='string')$('flowDeviceName').value=name.slice(0,32);
  }).catch(()=>{});
 }
 choose('chat');render();
 setInterval(()=>{if(!stopping)showDevices();},3500);
 void window.FileportConnection.host();
})();
