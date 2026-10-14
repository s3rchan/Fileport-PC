(() => {
const $=id=>document.getElementById(id);let ws,pc,ice=[];
const send=m=>{if(ws?.readyState===1)ws.send(JSON.stringify(m));};
$('create').onclick=()=>{
 if(ws)ws.close();$('code').textContent='';$('status').textContent='Bağlanıyor…';
 ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/screen-signal');
 ws.onopen=()=>send({type:'create-viewer'});
 ws.onmessage=async ev=>{
  const m=JSON.parse(ev.data);
  if(m.type==='created'){$('code').textContent=m.code;ice=m.iceServers;$('status').textContent='Bu kodu Android uygulamasına girin.';$('stop').disabled=false;}
  if(m.type==='screen-frame'){
   const image=$('framePreview');
   if(image){$('video').style.display='none';image.style.display='block';image.src='data:image/jpeg;base64,'+m.data;$('status').textContent='Telefon ekranı paylaşılıyor.';}
  }
  if(m.type==='sender-joined'){$('status').textContent='Telefon bağlandı; ekran izni bekleniyor.';}
  if(m.type==='signal'){
   try{
    if(!pc){pc=new RTCPeerConnection({iceServers:ice});pc.ontrack=e=>{$('video').srcObject=e.streams[0];$('status').textContent='Canlı yayın başladı.';};pc.onicecandidate=e=>{if(e.candidate)send({type:'signal',data:{candidate:e.candidate}})};}
    if(m.data.description){await pc.setRemoteDescription(m.data.description);if(m.data.description.type==='offer'){const answer=await pc.createAnswer();await pc.setLocalDescription(answer);send({type:'signal',data:{description:pc.localDescription}});}}
    if(m.data.candidate)await pc.addIceCandidate(m.data.candidate);
   }catch(e){$('status').textContent='Bağlantı hatası: '+e.message;}
  }
  if(m.type==='peer-left'){$('status').textContent='Telefon bağlantısı kesildi.';if(pc)pc.close();pc=null;$('video').srcObject=null;}
 };
 ws.onclose=()=>{$('status').textContent='Oda bağlantısı kapandı.';};
};
$('stop').onclick=()=>{send({type:'leave'});ws?.close();pc?.close();pc=null;$('video').srcObject=null;$('code').textContent='';$('stop').disabled=true;};
})();