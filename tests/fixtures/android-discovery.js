/* Fileport LAN request protocol v1. Android is a passive receiver: Windows
 * selects the phone. Discovery never authorizes access or transfers files. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),identity=window.FileportIdentity;
 let request=null,seen=new Map(),connecting=false,pendingPeerId=null;
 const overlay=$('phoneRequestOverlay');
 const text=()=>window.FileportI18n?.language==='tr';
 function close(){overlay.classList.add('hidden');request=null;}
 async function advertise(){
  try{const mine=await identity.identity();
   window.FileportNative.setLanIdentity(mine.id,(window.FileportFlow?.deviceName?.()||window.FileportNative.getDeviceName()||'Android phone').slice(0,32));
  }catch(error){console.error('LAN identity unavailable',error);}
 }
 async function onRequest(packet,address){
  try{
   if(!packet||packet.v!==1||packet.kind!=='connect-request'||!/^([0-9a-f]{64})$/.test(packet.id)||
       !/^([0-9a-f]{32})$/.test(packet.nonce)||!Number.isSafeInteger(packet.ts)||
       Math.abs(Date.now()-packet.ts)>30000||typeof packet.name!=='string'||packet.name.length>32||
       !['setup','reconnect'].includes(packet.mode)||!/^\d{1,3}(\.\d{1,3}){3}$/.test(address))return;
   const mine=await identity.identity();if(packet.target!==mine.id)return;
   if(await identity.keyId(packet.jwk)!==packet.id)return;
   const transcript=`FILEPORT/REQUEST/1|${packet.id}|${packet.target}|${packet.nonce}|${packet.ts}|${packet.mode}|${packet.name}`;
   if(!await identity.verify(packet.jwk,packet.sig,transcript))return;
   const trusted=identity.trusted(packet.id);
   if(packet.mode==='reconnect'&&!trusted)return;
   if(packet.mode==='setup'&&trusted)return; // first pairing only
   const key=packet.id+'|'+packet.mode;
   for(const [k,until] of seen)if(until<Date.now())seen.delete(k);
   if(seen.has(key)||connecting||window.FileportConnection?.connected||request)return;
   seen.set(key,Date.now()+65000);
   request={...packet,address};
   if(trusted&&identity.autoAllowed(packet.id)){
    beginConnect();return;
   }
   if(!trusted){ // Initial setup only asks for the six-digit SAS after TCP opens.
    beginConnect();return;
   }
   $('phoneRequestText').textContent=text()
    ? `Telefonunuz ${packet.name} cihazına bağlansın mı?`
    : `Connect your phone to ${packet.name}?`;
   $('phoneAutoConnect').checked=false;
   overlay.classList.remove('hidden');
  }catch(error){console.warn('Rejected LAN request',error);}
 }
 function beginConnect(){
  if(!request)return;
  connecting=true;const target=request;pendingPeerId=target.id;
  close();
  window.FileportConnection?.connectDevice({address:target.address,port:38477});
  setTimeout(()=>{connecting=false;},6500);
 }
 $('phoneRequestCancel').addEventListener('click',close);
 $('phoneRequestApprove').addEventListener('click',()=>{
  if(!request)return;
  const {id}=request;
  identity.setAutoAllowed(id,$('phoneAutoConnect').checked);
  beginConnect();
 });
 window.addEventListener('fileport-peer-connected',()=>{connecting=false;pendingPeerId=null;});
 window.addEventListener('fileport-peer-disconnected',()=>{connecting=false;pendingPeerId=null;});
 window.addEventListener('fileport-connection-error',()=>{connecting=false;pendingPeerId=null;});
 // Android native receives a UDP request; JavaScript verifies the identity signature
 // against the pinned pairing key before initiating encrypted FPTP over TCP.
 window.FileportLan={onRequest,advertise,expectedPeerId:()=>request?.id||pendingPeerId};
 advertise();
})();
