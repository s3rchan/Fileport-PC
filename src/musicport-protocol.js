/* MusicPort/1: separately authenticated, encrypted music-only sessions.
 * Experimental protocol: compare the six digits before first pairing. */
(()=>{'use strict';
const E=new TextEncoder(),D=new TextDecoder(),C=crypto,ID=window.FileportIdentity;
const hex=x=>ID.hex(x);
const b64=x=>{let s='';for(let i=0;i<x.length;i+=8192)s+=String.fromCharCode(...x.subarray(i,i+8192));return btoa(s);};
const un64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
const iv=n=>{const b=new Uint8Array(12);new DataView(b.buffer).setBigUint64(4,BigInt(n));return b;};
const storage='musicport-trusted-v1';
function trusts(){try{const a=JSON.parse(localStorage.getItem(storage)||'[]');return Array.isArray(a)?a:[];}catch{return[];}}
function removeTrust(id){localStorage.setItem(storage,JSON.stringify(trusts().filter(x=>x.id!==id)));}
function storeTrust(p){const a=trusts().filter(x=>x.id!==p.id);a.push({id:p.id,jwk:p.jwk,name:p.name,role:p.role});localStorage.setItem(storage,JSON.stringify(a));}
class Session{
 constructor({role,name,sendFrame,onCode,onConnected,onPacket,onError,onClose}){
  this.role=role;this.name=String(name||role).slice(0,32);this.sendFrame=sendFrame;this.onCode=onCode;this.onConnected=onConnected;this.onPacket=onPacket;this.onError=onError;this.onClose=onClose;
  this.tx=0;this.rx=0;this.closed=false;this.txQueue=Promise.resolve();this.rxQueue=Promise.resolve();
  this.started=this.start().catch(e=>this.fail(e));this.timeout=setTimeout(()=>{if(!this.verified)this.fail(Error('Pairing timed out'));},120000);
 }
 async start(){
  const permanent=await ID.identity(),eph=await C.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const pub=await C.subtle.exportKey('jwk',eph.publicKey);
  const hello={v:1,t:'hello',role:this.role,id:permanent.id,jwk:permanent.jwk,nonce:ID.nonce(),eph:{x:pub.x,y:pub.y},name:this.name};
  hello.sig=await ID.sign(permanent.privateKey,`MUSICPORT/1|HELLO|${hello.role}|${hello.id}|${hello.nonce}|${hello.eph.x}|${hello.eph.y}|${hello.name}`);
  this.hello=hello;this.eph=eph;if(!this.closed)await this.sendFrame(JSON.stringify(hello));
 }
 receive(raw){this.rxQueue=this.rxQueue.then(async()=>{
  await this.started;if(this.closed)return;
  const f=JSON.parse(raw);if(f?.v!==1)throw Error('Invalid MusicPort frame');
  if(f.t==='hello')return this.receiveHello(f);
  if(f.t==='sealed')return this.receiveSealed(f);
  throw Error('Unexpected frame');
 }).catch(e=>this.fail(e));}
 async receiveHello(p){
  if(this.peer||!this.hello)throw Error('Duplicate hello');
  if(!['pc','receiver'].includes(p.role)||p.role===this.role||typeof p.name!=='string'||p.name.length>32||!/^[a-f0-9]{48}$/.test(p.nonce||'')||!p.eph?.x||!p.eph?.y||await ID.keyId(p.jwk)!==p.id)throw Error('Invalid identity');
  const signed=`MUSICPORT/1|HELLO|${p.role}|${p.id}|${p.nonce}|${p.eph.x}|${p.eph.y}|${p.name}`;
  if(!await ID.verify(p.jwk,p.sig,signed))throw Error('Unverified signature');
  this.peer=p;const ordered=[this.hello,p].sort((a,b)=>a.id.localeCompare(b.id));
  if(ordered[0].id===ordered[1].id)throw Error('Self connection');
  this.transcript='MUSICPORT/1|SESSION|'+ordered.map(x=>`${x.role}|${x.id}|${x.nonce}|${x.eph.x}|${x.eph.y}`).join('|');
  const pub=await C.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:p.eph.x,y:p.eph.y,ext:true},{name:'ECDH',namedCurve:'P-256'},false,[]);
  const secret=await C.subtle.deriveBits({name:'ECDH',public:pub},this.eph.privateKey,256);
  const hkdf=await C.subtle.importKey('raw',secret,'HKDF',false,['deriveBits']);
  const salt=await ID.sha(this.transcript);
  const mat=new Uint8Array(await C.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info:E.encode('MUSICPORT/1|AES-GCM|directional')},hkdf,512));
  const low=this.hello.id<p.id;
  this.txKey=await C.subtle.importKey('raw',mat.slice(low?0:32,low?32:64),'AES-GCM',false,['encrypt']);
  this.rxKey=await C.subtle.importKey('raw',mat.slice(low?32:0,low?64:32),'AES-GCM',false,['decrypt']);
  const check=await ID.sha('MUSICPORT/1|VERIFY|'+this.transcript+'|'+hex(new Uint8Array(secret)));
  const code=String(((check[0]<<16)|(check[1]<<8)|check[2])%1000000).padStart(6,'0');
  const prior=trusts().find(x=>x.id===p.id&&x.role===p.role);
  if(prior&&prior.jwk.x===p.jwk.x&&prior.jwk.y===p.jwk.y){this.approved=true;await this.send({t:'approve'});this.finishPair();}
  else this.onCode?.(code,{id:p.id,name:p.name,role:p.role});
 }
 async approve(){if(!this.peer||this.approved)throw Error('No pending pairing');this.approved=true;await this.send({t:'approve'});this.finishPair();}
 async reject(){await this.send({t:'reject'}).catch(()=>{});this.close();}
 finishPair(){if(!this.closed&&this.approved&&this.otherApproved&&!this.verified){this.verified=true;clearTimeout(this.timeout);storeTrust(this.peer);this.onConnected?.(this.peer);}}
 async send(p){if(this.closed||!this.txKey)throw Error('No secure channel');
  const task=async()=>{if(this.closed)throw Error('Connection closed');const raw=E.encode(JSON.stringify(p));if(raw.length>44000)throw Error('Packet exceeds music-only limit');
   const seq=++this.tx;const body=new Uint8Array(await C.subtle.encrypt({name:'AES-GCM',iv:iv(seq),additionalData:E.encode(this.transcript)},this.txKey,raw));
   await this.sendFrame(JSON.stringify({v:1,t:'sealed',seq,body:b64(body)}));};
  const output=this.txQueue.then(task);this.txQueue=output.catch(()=>{});return output;
 }
 async receiveSealed(f){
  if(!this.rxKey||!Number.isSafeInteger(f.seq)||f.seq!==this.rx+1||typeof f.body!=='string'||f.body.length>65000)throw Error('Invalid encrypted sequence');
  const data=await C.subtle.decrypt({name:'AES-GCM',iv:iv(f.seq),additionalData:E.encode(this.transcript)},this.rxKey,un64(f.body));this.rx=f.seq;
  const p=JSON.parse(D.decode(data));
  if(p.t==='approve'){this.otherApproved=true;this.finishPair();return;}
  if(p.t==='reject'){this.close();return;}
  if(!this.verified)throw Error('Data before approval');await this.onPacket?.(p,this);
 }
 fail(err){if(this.closed)return;this.onError?.(String(err?.message||err));this.close();}
 close(){if(this.closed)return;this.closed=true;clearTimeout(this.timeout);this.onClose?.();}
}
window.MusicPortProtocol={Session,trusts,removeTrust};
})();
