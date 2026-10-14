(() => {
'use strict';
const $=id=>document.getElementById(id);
let ws=null,pc=null,iceServers=[],pendingCandidates=[];
const send=data=>{if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
const setStatus=text=>$('status').textContent=text;
function closePeer(){
 if(pc){pc.close();pc=null;}
 pendingCandidates=[];
 const video=$('video');video.pause();video.srcObject=null;
}
function createPeer(){
 if(pc)return pc;
 pc=new RTCPeerConnection({iceServers});
 pc.onicecandidate=event=>{if(event.candidate)send({type:'signal',data:{candidate:event.candidate.toJSON()}});};
 pc.ontrack=event=>{
   const video=$('video');video.srcObject=event.streams[0]||new MediaStream([event.track]);
   video.muted=true;video.play().catch(()=>{setStatus('Yayın hazır; oynatmak için videoya tıklayın.');});
   setStatus('Telefon ekranı canlı yayınlanıyor.');
 };
 pc.oniceconnectionstatechange=()=>{
  if(!pc)return;
  const state=pc.iceConnectionState;
  if(state==='failed')setStatus('Bağlantı kurulamadı. Farklı ağlarda TURN sunucusu gerekebilir.');
  else if(state==='disconnected')setStatus('Görüntü bağlantısı kesildi, yeniden bağlanıyor…');
  else if(state==='connected'||state==='completed')setStatus('Canlı görüntü bağlantısı kuruldu.');
 };
 return pc;
}
async function onSignal(data){
 const peer=createPeer();
 if(data.description){
  await peer.setRemoteDescription(data.description);
  if(data.description.type==='offer'){
   const answer=await peer.createAnswer();
   await peer.setLocalDescription(answer);
   send({type:'signal',data:{description:peer.localDescription}});
  }
  while(pendingCandidates.length){
   try{await peer.addIceCandidate(pendingCandidates.shift());}catch(e){console.warn('ICE error',e);}
  }
 }
 if(data.candidate){
  if(peer.remoteDescription)await peer.addIceCandidate(data.candidate);
  else pendingCandidates.push(data.candidate);
 }
}
$('create').addEventListener('click',()=>{
 if(ws){ws.onclose=null;ws.close();}closePeer();
 $('code').textContent='';setStatus('İzleme odası açılıyor…');
 ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/screen-signal');
 ws.onopen=()=>send({type:'create-viewer'});
 ws.onmessage=async event=>{
  try{
   const message=JSON.parse(event.data);
   if(message.type==='created'){
    $('code').textContent=message.code;
    iceServers=message.iceServers||[];
    setStatus('6 haneli kodu Yakın Android ekran yansıtma bölümüne girin.');
    $('stop').disabled=false;
   }else if(message.type==='sender-joined'){
    setStatus('Telefon bağlandı. Canlı görüntü bekleniyor…');
   }else if(message.type==='signal'){
    await onSignal(message.data||{});
   }else if(message.type==='error'){
    setStatus('Hata: '+(message.message||'Bilinmeyen hata'));
   }else if(message.type==='peer-left'){
    closePeer();setStatus('Telefon bağlantısı sonlandı.');
   }
  }catch(error){console.error(error);setStatus('Görüntü bağlantısı hatası: '+error.message);}
 };
 ws.onclose=()=>setStatus('Oda sunucusu bağlantısı kapandı.');
 ws.onerror=()=>setStatus('Render ekran sunucusuna bağlanılamadı.');
});
$('stop').onclick=()=>{
 send({type:'leave'});if(ws){ws.close();ws=null;}
 closePeer();$('code').textContent='';$('stop').disabled=true;setStatus('İzleme durduruldu.');
};
})();
