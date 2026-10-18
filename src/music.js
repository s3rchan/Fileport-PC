/* Fileport Music Share: consent-gated transfer and coordinated playback.
 * Signaling always travels over an approved, encrypted FPTP/1 session.
 * One track at a time. Synchronization is approximate across local Wi-Fi.
 */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const ANDROID=!!window.FileportNative;
 const wire=()=>window.FileportMusicTransport;
 const pick=$('musicPick'),share=$('musicShare'),fileInput=$('musicFileInput');
 const play=$('musicPlay'),stop=$('musicStop'),name=$('musicTrackName');
 const status=$('musicStatus'),offer=$('musicOfferOverlay'),offerText=$('musicOfferText');
 const accept=$('musicOfferAccept'),decline=$('musicOfferDecline');
 const localAudio=$('musicAudio');
 const MAX_MUSIC=150*1024*1024;
 const AUDIO_RE=/\.(mp3|m4a|wav|ogg|oga|flac)$/i;
 const freshId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
 let outgoing=null,approval=null,trackId=null,ready=false,remoteReady=false,saved=false;
 let soundURL=null,playTimer=null,playing=false;
 const tr=()=>window.FileportI18n?.language==='tr';
 const text=(en,localized)=>tr()?localized:en;
 function note(message){if(status)status.textContent=message;}
 function closeOffer(){if(offer)offer.classList.add('hidden');}
 function update(){
  if(share)share.disabled=!wire()?.connected||!!outgoing;
  if(pick)pick.disabled=!wire()?.connected||!!outgoing;
  if(play)play.disabled=!ready||!wire()?.connected;
  if(stop)stop.disabled=!trackId;
 }
 function resetSound(){
  clearTimeout(playTimer);playTimer=null;playing=false;
  if(ANDROID){try{window.FileportNative.stopMusic();}catch(error){console.warn(error);}}
  else if(localAudio){localAudio.pause();localAudio.currentTime=0;}
 }
 function clearTrack(){
  resetSound();ready=false;remoteReady=false;saved=false;trackId=null;
  if(soundURL){URL.revokeObjectURL(soundURL);soundURL=null;}
  if(localAudio)localAudio.removeAttribute('src');
  update();
 }
 function fail(message){note(message);update();}
 function allowedFile(file){
  return !!file && AUDIO_RE.test(file.name) && file.size>0 && file.size<=MAX_MUSIC;
 }
 function displayTrack(track){if(name)name.textContent=track;}
 if(pick&&fileInput)pick.addEventListener('click',()=>{if(wire()?.connected)fileInput.click();else fail(text('Connect your phone first.','Önce telefona bağlanın.'));});
 if(fileInput)fileInput.addEventListener('change',()=>{
  if(share){share.disabled=!fileInput.files?.length||!wire()?.connected;if(!share.disabled)share.click();}
 });
 if(share)share.addEventListener('click',async()=>{
  const file=fileInput?.files?.[0];
  if(!wire()?.connected){fail(text('Connect your phone first.','Önce telefona bağlanın.'));return;}
  if(outgoing){fail(text('Wait for the previous music offer.','Önceki müzik isteğini bekleyin.'));return;}
  if(!allowedFile(file)){fail(text('Choose an MP3, M4A, WAV, OGG or FLAC file up to 150 MB.','En fazla 150 MB MP3, M4A, WAV, OGG veya FLAC seçin.'));return;}
  clearTrack();trackId=freshId();
  const safeName=file.name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,150);
  outgoing={id:trackId,file,name:safeName,size:file.size};
  displayTrack(safeName);
  soundURL=URL.createObjectURL(file);
  if(localAudio){localAudio.src=soundURL;localAudio.load();}
  note(text('Waiting for your phone to approve this song…','Şarkının telefonda onaylanması bekleniyor…'));
  update();
  try{
   await wire().send({t:'music-offer',id:trackId,name:safeName,size:file.size,mime:file.type||'audio/mpeg'});
  }catch(error){outgoing=null;fail(String(error.message||error));}
 });
 async function handlePacket(packet){
  if(!wire()?.connected || !packet || typeof packet!=='object')return;
  if(packet.t==='music-offer' && ANDROID){
   if(!/^[a-f0-9]{32}$/.test(packet.id)||typeof packet.name!=='string'||packet.name.length>150||
       !AUDIO_RE.test(packet.name)||!Number.isSafeInteger(packet.size)||
       packet.size<1||packet.size>MAX_MUSIC||approval){return;}
   clearTrack();trackId=packet.id;approval={id:packet.id,name:packet.name,size:packet.size,accepted:false};
   displayTrack(packet.name);
   if(offerText)offerText.textContent=text(
    'Your computer wants to send “'+packet.name+'”. Accept this music file ('+(packet.size/1024/1024).toFixed(1)+' MB)?',
    'Bilgisayar “'+packet.name+'” müziğini göndermek istiyor. Dosyayı ('+(packet.size/1024/1024).toFixed(1)+' MB) kabul ediyor musun?');
   offer?.classList.remove('hidden');
   note(text('Music approval required.','Müzik aktarım onayı gerekiyor.'));
   update();return;
  }
  if(packet.t==='music-accept' && !ANDROID && outgoing?.id===packet.id){
   note(text('Approved. Sending music to your phone…','Onaylandı. Müzik telefona gönderiliyor…'));
   void wire().sendMusic(outgoing.file,outgoing.id)
    .catch(error=>{outgoing=null;fail(text('Music transfer failed: ','Müzik aktarımı başarısız: ')+String(error.message||error));});
   return;
  }
  if(packet.t==='music-decline' && !ANDROID && outgoing?.id===packet.id){
   outgoing=null;clearTrack();fail(text('Phone declined the music transfer.','Telefon müzik aktarımını reddetti.'));return;
  }
  if(packet.t==='music-ready' && !ANDROID && trackId===packet.id){
   remoteReady=true;updateReady();return;
  }
  if(packet.t==='music-error' && outgoing?.id===packet.id){
   outgoing=null;clearTrack();fail(text('Phone cannot play this audio format.','Telefon bu ses formatını çalamıyor.'));return;
  }
  if(packet.t==='music-play' && ready && packet.id===trackId){
   schedulePlay(1600);return;
  }
  if(packet.t==='music-stop' && ready && packet.id===trackId){
   resetSound();note(text('Playback stopped.','Oynatma durduruldu.'));update();
  }
 }
 function updateReady(){
  ready=!!trackId && (ANDROID?saved:(saved&&remoteReady));
  if(ready)note(text('Music is ready on both devices. Press Play.','Müzik iki cihazda hazır. Play tuşuna basın.'));
  update();
 }
 async function fileReceived(id){
  if(!ANDROID||!approval?.accepted||approval.id!==id)return;
  let ok=false;try{ok=window.FileportNative.prepareMusic(id);}catch(error){console.warn('Audio format/decoder rejected:',error);}
  if(!ok){approval=null;fail(text('This audio could not be prepared for playback.','Bu ses dosyası çalınamadı.'));await wire().send({t:'music-error',id}).catch(()=>{});return;}
  saved=true;approval=null;updateReady();
  await wire().send({t:'music-ready',id}).catch(error=>fail(String(error)));
 }
 function fileSent(id){
  if(!ANDROID&&outgoing?.id===id){saved=true;outgoing=null;updateReady();}
 }
 function allowIncoming(p){
  return ANDROID&&!!approval?.accepted&&p?.music===true&&approval.id===p.id&&approval.name===p.name&&approval.size===p.size;
 }
 async function schedulePlay(delay){
  if(!ready)return;
  resetSound();
  note(text('Starting together…','Birlikte başlatılıyor…'));
  if(ANDROID){
   const result=window.FileportNative.scheduleMusic(trackId,delay);
   if(!result)fail(text('Android music player is not ready.','Android müzik oynatıcı hazır değil.'));
  }else if(localAudio){
   playTimer=setTimeout(()=>{
    localAudio.currentTime=0;
    const result=localAudio.play();
    if(result?.catch)result.catch(error=>fail(text('Playback blocked: ','Oynatma engellendi: ')+error.message));
   },delay);
  }
  playing=true;update();
 }
 async function cue(kind){
  if(!ready||!wire()?.connected)return;
  try{await wire().send({t:kind,id:trackId});if(kind==='music-stop'){resetSound();note(text('Playback stopped.','Oynatma durduruldu.'));}else await schedulePlay(1600);}
  catch(error){fail(String(error.message||error));}
 }
 if(play)play.addEventListener('click',()=>void cue('music-play'));
 if(stop)stop.addEventListener('click',()=>void cue('music-stop'));
 if(accept)accept.addEventListener('click',async()=>{
  if(!approval||approval.accepted)return;
  approval.accepted=true;closeOffer();note(text('Approved. Waiting for the file…','Onaylandı. Dosya bekleniyor…'));
  try{await wire().send({t:'music-accept',id:approval.id});}catch(error){approval=null;fail(String(error));}
 });
 if(decline)decline.addEventListener('click',async()=>{
  const id=approval?.id;approval=null;closeOffer();clearTrack();
  note(text('Music transfer declined.','Müzik aktarımı reddedildi.'));
  if(id)await wire()?.send({t:'music-decline',id}).catch(()=>{});
 });
 function disconnected(){
  closeOffer();approval=null;outgoing=null;clearTrack();
  note(text('Connect your devices to share music.','Müzik paylaşmak için cihazları bağlayın.'));
 }
 window.FileportMusic={handlePacket,allowIncoming,fileReceived,fileSent,disconnected};
 window.addEventListener('fileport-peer-connected',update);
 window.addEventListener('fileport-peer-disconnected',disconnected);
 note(text('Connect your devices to share music.','Müzik paylaşmak için cihazları bağlayın.'));
 update();
})();
