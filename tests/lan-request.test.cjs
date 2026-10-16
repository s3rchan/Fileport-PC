/* Signed LAN-request gate tests; no external network. */
const assert=require('node:assert/strict');
const {webcrypto:crypto}=require('node:crypto');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(__dirname+'/fixtures/android-discovery.js','utf8');
const E=new TextEncoder();
const sha=async text=>Buffer.from(await crypto.subtle.digest('SHA-256',E.encode(text))).toString('hex');
async function device(){
 const kp=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',kp.publicKey);
 return {kp,jwk,id:await sha('P256|'+jwk.x+'|'+jwk.y)};
}
async function packet(from,to,mode='reconnect'){
 const v={v:1,kind:'connect-request',id:from.id,jwk:from.jwk,target:to.id,
 nonce:crypto.randomUUID().replaceAll('-',''),ts:Date.now(),mode,name:'DESKTOP-TEST'};
 const signText=`FILEPORT/REQUEST/1|${v.id}|${v.target}|${v.nonce}|${v.ts}|${v.mode}|${v.name}`;
 v.sig=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},from.kp.privateKey,E.encode(signText))).toString('hex');
 return v;
}
function el(){const events=new Map();const classNames=new Set(['hidden']);return {textContent:'',checked:false,
 classList:{add:x=>classNames.add(x),remove:x=>classNames.delete(x),contains:x=>classNames.has(x)},
 addEventListener:(e,f)=>events.set(e,f),click:()=>events.get('click')?.(),_events:events};}
async function createReceiver(to,approvedDevice=null,auto=false){
 const nodes={};const get=id=>nodes[id]??=el();const connections=[],identified=[];
 const handlers=new Map();
 const identity={
  identity:async()=>to,
  keyId:async jwk=>sha('P256|'+jwk.x+'|'+jwk.y),
  trusted:id=>approvedDevice?.id===id?{id,jwk:approvedDevice.jwk}:null,
  autoAllowed:id=>id===approvedDevice?.id&&auto,
  setAutoAllowed:(id,v)=>{auto=!!v;},
  verify:async (jwk,sig,challenge)=>{
   const pub=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
   return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,Buffer.from(sig,'hex'),E.encode(challenge));
  }
 };
 const window={FileportIdentity:identity,FileportI18n:{language:'en'},FileportFlow:{deviceName:()=> 'Samsung Phone'},
  FileportNative:{setLanIdentity:(...x)=>identified.push(x),getDeviceName:()=> 'Samsung Phone'},
  FileportConnection:{connectDevice:x=>connections.push(x),connected:false},
  addEventListener:(event,handler)=>handlers.set(event,handler)};
 const env={window,document:{getElementById:get},console,setTimeout,clearTimeout,Date,Map};
 vm.createContext(env);vm.runInContext(code,env);
 await new Promise(resolve=>setTimeout(resolve,5));
 return {window,nodes,get,connections,identified,handlers};
}
async function run(){
 const pc=await device(),phone=await device(),rogue=await device();
 const address='192.168.1.15';
 let rx=await createReceiver(phone,pc,false);
 assert.equal(rx.identified[0][0],phone.id,'Android advertises exact persistent identity');
 const valid=await packet(pc,phone);
 const tampered={...valid,name:'FAKE-PC'};
 await rx.window.FileportLan.onRequest(tampered,address);
 assert.equal(rx.connections.length,0,'Forged device name must fail ECDSA signature');
 const expiry={...valid,ts:Date.now()-45000};
 await rx.window.FileportLan.onRequest(expiry,address);
 assert.equal(rx.connections.length,0,'Expired request must be rejected');
 await rx.window.FileportLan.onRequest(await packet(rogue,phone),address);
 assert.equal(rx.connections.length,0,'Unpaired PC must not trigger trusted reconnect');
 await rx.window.FileportLan.onRequest({...valid,target:rogue.id},address);
 assert.equal(rx.connections.length,0,'Request for different phone must be rejected');
 await rx.window.FileportLan.onRequest(valid,address);
 assert.equal(rx.connections.length,0,'Paired, non-auto PC must wait for UI approval');
 assert.equal(rx.get('phoneRequestOverlay').classList.contains('hidden'),false,'Request dialog must be visible');
 rx.get('phoneAutoConnect').checked=true;
 rx.get('phoneRequestApprove').click();
 assert.equal(rx.connections.length,1,'UI approval enables one connection');
 assert.equal(rx.window.FileportLan.expectedPeerId(),pc.id,'TCP handshake pinned to requesting PC');
 rx=await createReceiver(phone,pc,true);
 await rx.window.FileportLan.onRequest(await packet(pc,phone),address);
 assert.equal(rx.connections.length,1,'Auto approval only applies to pinned PC');
 assert.equal(rx.get('phoneRequestOverlay').classList.contains('hidden'),true,'Auto approval should not prompt');
 rx=await createReceiver(phone,null,false);
 await rx.window.FileportLan.onRequest(await packet(pc,phone,'setup'),address);
 assert.equal(rx.connections.length,1,'Initial setup starts only from signed request');
 assert.equal(rx.window.FileportLan.expectedPeerId(),pc.id,'First pairing also pins requested identity before six-digit SAS');
 console.log('PASS LAN requests: ECDSA signature, expiration, target identity, trusted-only reconnect, user consent, per-device auto consent, first pairing.');
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
