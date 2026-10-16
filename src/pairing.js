/* Persistent ECDSA P-256 identity. FPTP/1 signs ephemeral ECDH keys per session. */
(() => {
 'use strict';
 const enc = new TextEncoder();
 const dbName='yakin-flow-identity-v1'; const store='identity';
 const trustKey='yakin-flow-trusted-v1';
 const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const sha = async text => new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)));
 const openDB = () => new Promise((resolve,reject)=>{
   const req=indexedDB.open(dbName,1);
   req.onupgradeneeded=()=>req.result.createObjectStore(store);
   req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
 });
 const readKey = async db => new Promise((resolve,reject)=>{
   const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get('keypair');
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 const writeKey = async(db,val)=>new Promise((resolve,reject)=>{
   const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(val,'keypair');
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
 let identityPromise;
 async function identity(){
  if(!identityPromise) identityPromise=(async()=>{
   const db=await openDB();let keys=await readKey(db);
   if(!keys){keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);await writeKey(db,keys);}
   db.close();const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
   return {privateKey:keys.privateKey, publicKey:keys.publicKey, jwk, id:await keyId(jwk)};
  })().catch(error=>{identityPromise=null;throw error;});
  return identityPromise;
 }
 function canonical(jwk){if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||typeof jwk.x!=='string'||typeof jwk.y!=='string')throw Error('Geçersiz cihaz anahtarı');return `P256|${jwk.x}|${jwk.y}`;}
 async function keyId(jwk){return hex(await sha(canonical(jwk)));}
 function readTrusted(){try{let values=JSON.parse(localStorage.getItem(trustKey)||'[]');return Array.isArray(values)?values.filter(x=>x&&typeof x.id==='string'&&x.jwk):[];}catch{return [];}}
 function trusted(id){return readTrusted().find(x=>x.id===id)||null;}
 function putTrusted(id,jwk,name){if(id!==undefined){const records=readTrusted().filter(x=>x.id!==id);records.push({id,jwk,name:String(name||'Device').slice(0,32),pairedAt:Date.now()});localStorage.setItem(trustKey,JSON.stringify(records));window.dispatchEvent(new Event('fileport-trusted-updated'));}}
 function removeTrusted(id){localStorage.setItem(trustKey,JSON.stringify(readTrusted().filter(x=>x.id!==id)));if(window.FileportConnection?.currentPeerId===id)window.FileportConnection.disconnect();window.dispatchEvent(new Event('fileport-trusted-updated'));}
 function nonce(){const a=new Uint8Array(24);crypto.getRandomValues(a);return hex(a);}
 async function sign(privateKey,transcript){const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,enc.encode(transcript));return hex(new Uint8Array(sig));}
 async function verify(jwk,signature,transcript){if(typeof signature!=='string'||signature.length!==128||!/^[0-9a-f]+$/i.test(signature))return false;const pub=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,Uint8Array.from(signature.match(/../g).map(b=>parseInt(b,16))),enc.encode(transcript));}
 const ui=()=>{
  const list=document.getElementById('trustedDeviceList');if(!list)return;
  list.replaceChildren();const records=readTrusted();
  if(!records.length){const p=document.createElement('p');p.textContent='No trusted devices saved yet.';list.append(p);return;}
  for(const rec of records){const item=document.createElement('div');item.className='trusted-device-item';const label=document.createElement('span');label.textContent=`${rec.name} · ${rec.id.slice(0,12)}…`;const btn=document.createElement('button');btn.className='button button-outline';btn.type='button';btn.textContent='Remove';btn.addEventListener('click',()=>{if(confirm(`Remove trust for ${rec.name}?`))removeTrusted(rec.id);});item.append(label,btn);list.append(item);}
 };
 document.addEventListener('DOMContentLoaded',ui);window.addEventListener('fileport-trusted-updated',ui);
 window.FileportIdentity={identity,keyId,nonce,sha,hex,sign,verify,trusted,putTrusted,readTrusted,removeTrusted};
})();
