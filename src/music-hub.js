/* Up to eight separate MusicPort/1 music receivers; FPTP file peer remains isolated. */
(()=>{'use strict';
const $=id=>document.getElementById(id),invoke=window.__TAURI__?.core?.invoke,peers=new Map();
let file=null,trackId=null,trackName='',lastStarted=null,lastPosition=0;
const CHUNK=32*1024,CREDIT=256*1024;
const b64=a=>{let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s);};
function wait(p,kind,id,ms=45000){if(p.waiter)throw Error('Another request is pending');
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{p.waiter=null;reject(Error('Receiver timed out'));},ms);
  p.waiter={kind,id,resolve:v=>{clearTimeout(timer);p.waiter=null;resolve(v);},reject:e=>{clearTimeout(timer);p.waiter=null;reject(e);}};});
}
function clearWait(p){if(p.waiter){p.waiter.reject(Error('Connection reset'));p.waiter=null;}}
function status(s){if($('musicPortStatus'))$('musicPortStatus').textContent=s;}
function render(){const list=$('musicPortList');if(!list)return;list.replaceChildren();
 for(const [id,p] of peers){
  const row=document.createElement('div');row.className='trusted-device-item';
  const label=document.createElement('span');label.textContent=(p.session?.peer?.name||`MusicPort #${id}`)+' — '+(p.session?.verified?(p.ready?'Ready':'Connected'):'Pairing');
  const button=document.createElement('button');button.type='button';button.className='button button-outline';button.textContent='Disconnect';
  button.onclick=()=>void invoke('musicport_close',{id});row.append(label,button);list.append(row);
 }
 if(!peers.size)list.textContent='No MusicPort receivers connected.';
 const saved=$('musicPortSaved');if(saved){saved.replaceChildren();for(const p of MusicPortProtocol.trusts())if(p.role==='receiver'){
  const row=document.createElement('div');row.className='trusted-device-item',label=document.createElement('span');label.textContent=p.name;
  const button=document.createElement('button');button.type='button';button.className='button button-outline';button.textContent='Forget';
  button.onclick=()=>{MusicPortProtocol.removeTrust(p.id);render();};row.append(label,button);saved.append(row);
 }}
 window.FileportMusic?.groupChanged?.();
}
function finishPeer(id){const p=peers.get(id);if(!p)return;clearWait(p);p.session.close();peers.delete(id);render();}
async function onPacket(p,m){
 if(!p.session?.verified)return;
 if(m.t==='clock-pong'&&Number.isFinite(m.sent)&&Number.isFinite(m.received)&&Number.isFinite(m.responded)){
  const now=Date.now(),rtt=(now-m.sent)-(m.responded-m.received),offset=((m.received-m.sent)+(m.responded-now))/2;
  if(rtt>=0&&rtt<2500&&(!Number.isFinite(p.rtt)||rtt<p.rtt)){p.rtt=rtt;p.offset=offset;}return;
 }
 if(p.waiter&&p.waiter.kind===m.t&&p.waiter.id===m.id){p.waiter.resolve(m);return;}
 if(m.t==='music-error'){p.ready=false;clearWait(p);p.error=String(m.message||'Audio unsupported').slice(0,100);status(`${p.session.peer.name}: ${p.error}`);render();return;}
 if(m.t==='music-decline'){p.ready=false;clearWait(p);p.error='Declined';status(`${p.session.peer.name} declined the song`);render();return;}
 if(m.t==='music-ready'&&m.id===trackId){p.ready=true;render();}
}
async function sendAudio(p,f,id,n){
 p.ready=false;p.error='';
 try{
  await p.session.send({t:'music-offer',id,name:n,size:f.size,mime:f.type||'audio/mpeg'});
  await wait(p,'music-accept',id,90000);
  await p.session.send({t:'music-start',id,name:n,size:f.size});
  await wait(p,'music-ready-transfer',id);
  const hash=new window.FileportSha256();let off=0;
  while(off<f.size){
   const boundary=Math.min(f.size,(Math.floor(off/CREDIT)+1)*CREDIT);
   const acknowledge=wait(p,'music-ack',id,45000);
   while(off<boundary){
    const data=new Uint8Array(await f.slice(off,Math.min(off+CHUNK,boundary)).arrayBuffer());hash.update(data);
    await p.session.send({t:'music-chunk',id,offset:off,data:b64(data)});off+=data.length;
   }
   const result=await acknowledge;if(result.offset!==boundary)throw Error('Music acknowledgement mismatch');
  }
  const receipt=wait(p,'music-ready',id,70000);
  await p.session.send({t:'music-end',id,sha256:hash.digest()});await receipt;
  if(trackId===id){p.ready=true;render();status(`${p.session.peer.name} ready.`);if(lastStarted!==null){const at=Date.now()+4000,position=Math.max(0,lastPosition+at-lastStarted);await p.session.send({t:'music-play',id,at,offset:p.offset||0,position}).catch(e=>status(String(e)));}}
 }catch(e){p.ready=false;p.error=String(e.message||e);status(`${p.session?.peer?.name||'Receiver'}: ${p.error}`);render();}
}
setInterval(()=>{for(const p of peers.values())if(p.session.verified)void p.session.send({t:'clock-ping',sent:Date.now()}).catch(()=>{});},4500);
window.MusicPortHub={
 get connected(){return [...peers.values()].some(p=>p.session.verified);},
 get ready(){return [...peers.values()].some(p=>p.session.verified&&p.ready);},
 get pending(){return [...peers.values()].some(p=>p.session.verified&&!p.ready&&!p.error);},
 get count(){return [...peers.values()].filter(p=>p.session.verified).length;},
 offer(f,id,n){file=f;trackId=id;trackName=n;const targets=[...peers.values()].filter(p=>p.session.verified);
  for(const p of targets)p.ready=false;render();for(const p of targets)void sendAudio(p,f,id,n);return targets.length;},
 async play(at,position=0){lastStarted=at;lastPosition=position;await Promise.allSettled([...peers.values()].filter(p=>p.ready).map(p=>p.session.send({t:'music-play',id:trackId,at,offset:p.offset||0,position})));},
 async pause(position){lastStarted=null;lastPosition=position;await Promise.allSettled([...peers.values()].filter(p=>p.session.verified).map(p=>p.session.send({t:'music-pause',id:trackId,position})));},
 async stop(){lastStarted=null;lastPosition=0;await Promise.allSettled([...peers.values()].filter(p=>p.session.verified).map(p=>p.session.send({t:'music-stop',id:trackId})));}
};
$('musicPortAdd')?.addEventListener('click',()=>{$('musicPortHelp').hidden=!$('musicPortHelp').hidden;});
void invoke?.('musicport_local_ip').then(ip=>{if($('musicPortIp'))$('musicPortIp').textContent=ip;}).catch(()=>{});
window.__TAURI__?.event?.listen('musicport-event',ev=>{
 const {kind,id,data}=ev.payload||{};if(kind==='error'){status(String(data));return;}
 if(kind==='open'){
  if(peers.has(id))finishPeer(id);
  const p={id,ready:false,rtt:Infinity,offset:0,waiter:null,error:''};peers.set(id,p);
  p.session=new MusicPortProtocol.Session({role:'pc',name:'Fileport PC',sendFrame:frame=>invoke('musicport_send',{id,frame}),
   onCode:(code,remote)=>{status(`Verify ${remote.name}: ${code}`);pairUi(p,code,remote);},
   onConnected:remote=>{status(`${remote.name} connected securely.`);render();if(file&&trackId)void sendAudio(p,file,trackId,trackName);},
   onPacket:m=>onPacket(p,m),onError:reason=>{status(`MusicPort security error: ${reason}`);void invoke('musicport_close',{id});},onClose:()=>{}
  });render();return;
 }
 const p=peers.get(id);if(!p)return;
 if(kind==='frame'){p.session.receive(data);return;}
 if(kind==='closed')finishPeer(id);
});
function pairUi(p,code,remote){const el=$('musicPortPair');if(!el)return;
 el.hidden=false;$('musicPortCode').textContent=code;$('musicPortPairName').textContent=remote.name;
 $('musicPortApprove').onclick=()=>{el.hidden=true;void p.session.approve().catch(e=>status(String(e)));};
 $('musicPortReject').onclick=()=>{el.hidden=true;void p.session.reject();void invoke('musicport_close',{id:p.id});};
}
render();
})();
