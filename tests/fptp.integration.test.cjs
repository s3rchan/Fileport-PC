// End-to-end WebCrypto FPTP/1 handshake + encrypted message + 350 KB file.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const appCode=fs.readFileSync(__dirname+'/../src/sha256-stream.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../src/app.js','utf8');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function element(){const events={},classes=new Set();return {
 textContent:'',value:'',files:[],disabled:false,style:{},
 classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,v)=>{if(v)classes.add(x);else classes.delete(x);}},
 addEventListener:(name,fn)=>{(events[name]??=[]).push(fn);},
 fire:(name)=>{for(const fn of events[name]||[])fn({target:null,preventDefault(){}});},
 replaceChildren(){},append(){},setAttribute(){},querySelector(){return null;}
};}
function createIdentity(){const trusted=new Map();let cache;
 async function sha(text){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));}
 const hex=a=>Array.from(a,v=>v.toString(16).padStart(2,'0')).join('');
 const id=async jwk=>hex(await sha('P256|'+jwk.x+'|'+jwk.y));
 return {hex,sha,keyId:id,identity:async()=>{if(!cache){const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);cache={privateKey:keys.privateKey,id:await id(jwk),jwk};}return cache;},
 sign:async(key,text)=>hex(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(text)))),
 verify:async(jwk,sig,text)=>{const pub=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,Uint8Array.from(sig.match(/../g).map(x=>parseInt(x,16))),new TextEncoder().encode(text));},
 trusted:id=>trusted.get(id),putTrusted:(id,jwk,name)=>trusted.set(id,{id,jwk,name}),readTrusted:()=>Array.from(trusted.values())};
}
const peers={};let wireGeneration=0;let interruptAt=0;let interrupted=false;let reconnections=0;
function createDevice(name,android){
 const elements=new Map(),events=new Map(),stored=new Map(),identity=createIdentity(),received=[];
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const document={getElementById:get,addEventListener(){},createElement:()=>element(),hidden:false,hasFocus:()=>true};
 const win={crypto,FileportIdentity:identity,FileportFlow:{deviceName:()=>name,peerName(){},connected(){win.connected=true;},disconnected(){win.connected=false;},transferBegin(){return 'card';},transferProgress(){},transferSaving(){},transferFinish(){},incomingText:text=>received.push(text)},FileportTransferActive:false,connected:false,
 addEventListener:(type,fn)=>{(events.get(type)||events.set(type,[]).get(type)).push(fn);},dispatchEvent:event=>{for(const fn of events.get(event.type)||[])fn(event);},
 FileportNative:null,__TAURI__:null};
 const native={
 beginDownload:(filename,mime,size,id)=>{if(!stored.has(id))stored.set(id,{size,content:Buffer.alloc(0),name:filename});return String(stored.get(id).content.length);},
 appendDownload:(id,offset,b64)=>{const item=stored.get(id);assert.equal(item.content.length,offset);item.content=Buffer.concat([item.content,Buffer.from(b64,'base64')]);
  if(interruptAt&&!interrupted&&item.content.length>=interruptAt){interrupted=true;setTimeout(()=>{wireGeneration++;peers.pc.win.FileportTransport.onClosed();peers.android.win.FileportTransport.onClosed();
    setTimeout(()=>{reconnections++;peers.pc.win.FileportTransport.onOpen();peers.android.win.FileportTransport.onOpen();},220);},2);}
  return item.content.length;},
 syncDownload:id=>stored.get(id).content.length,verifyDownload:(id,digest)=>{return require('node:crypto').createHash('sha256').update(stored.get(id).content).digest('hex')===digest;},finishDownload:id=>{assert.equal(stored.get(id).content.length,stored.get(id).size);},pauseDownload(){},abortDownload(id){stored.delete(id);},
 connectTransport(){},disconnectTransport(){},scanNearby(){},setTransferActive(){},
 transportSend:frame=>{const gen=wireGeneration;setTimeout(()=>{if(peers.pc&&wireGeneration===gen)peers.pc.win.FileportTransport.onFrame(frame);},0);}
 };
 if(android)win.FileportNative=native;
 else win.__TAURI__={core:{invoke:async (cmd,args)=>{
  if(cmd==='transport_send'){const gen=wireGeneration;setTimeout(()=>{if(wireGeneration===gen)peers.android.win.FileportTransport.onFrame(args.frame);},0);return;}
  if(cmd==='begin_download')return Number(native.beginDownload(args.filename,'',args.size,args.transferId));
  if(cmd==='append_download')return native.appendDownload(args.transferId,args.offset,args.base64);
  if(cmd==='sync_download')return native.syncDownload(args.transferId);
  if(cmd==='verify_download')return native.verifyDownload(args.transferId,args.digest);
  if(cmd==='finish_download')return native.finishDownload(args.transferId);
  return null;
 }},event:{listen:()=>{}}};
 const storage=new Map();
 const env={window:win,document,crypto,TextEncoder,TextDecoder,console,Event:class{constructor(type){this.type=type;}},setTimeout,clearTimeout,setInterval,clearInterval,btoa,atob,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},File:global.File,Blob:global.Blob,Uint8Array,ArrayBuffer,DataView,BigInt};
 vm.createContext(env);vm.runInContext(appCode,env,{filename:'app.js'});
 return {win,get,received,stored,native,storage};
}
async function main(){peers.pc=createDevice('Desktop',false);peers.android=createDevice('Phone',true);
 peers.pc.win.FileportTransport.onOpen();peers.android.win.FileportTransport.onOpen();
 for(let n=0;n<100&&(!peers.pc.get('securePairCode').textContent||peers.pc.get('securePairCode').textContent==='');n++)await wait(20);
 await wait(150);
 const a=peers.pc.get('securePairCode').textContent,b=peers.android.get('securePairCode').textContent;
 assert.match(a,/^\d{6}$/);assert.equal(a,b,'SAS must match');
 peers.pc.get('securePairApprove').fire('click');await wait(120);assert.equal(peers.pc.win.connected,false,'One approval must not authenticate both devices');assert.equal(peers.android.win.connected,false,'Other device must approve too');peers.android.get('securePairApprove').fire('click');
 for(let n=0;n<100&&(!peers.pc.win.connected||!peers.android.win.connected);n++)await wait(20);
 assert.ok(peers.pc.win.connected&&peers.android.win.connected,'Both ends must approve');
 peers.pc.win.FileportFlowTransport.sendText('secret hello');
 await wait(100);assert.deepEqual(peers.android.received,['secret hello']);
 const input=peers.pc.get('fileInput');
 const original=Buffer.alloc(350000,0x5a);
 input.files=[new File([original],'test.bin',{lastModified:123456789})];input.fire('change');peers.pc.get('sendFiles').fire('click');
 for(let n=0;n<400&&!(peers.android.stored.size&&Array.from(peers.android.stored.values())[0].content.length===original.length);n++)await wait(20);
 assert.ok(peers.android.stored.size,'Recipient should receive a transfer');
 const output=Array.from(peers.android.stored.values())[0].content;
 assert.deepEqual(output,original,'Content must match byte-for-byte');
 console.log('PASS FPTP/1: matching SAS, mutual approval, authenticated encrypted chat, 350 KB streamed file.');
 // A second larger transfer is physically disconnected after 288 KiB have been written.
 await wait(700);
 interruptAt=294912;
 const larger=Buffer.alloc(820000,0x69);
 input.files=[new File([larger],'interrupted.bin',{lastModified:987654321})];input.fire('change');peers.pc.get('sendFiles').fire('click');
 for(let n=0;n<800;n++){
  const result=[...peers.android.stored.values()].find(x=>x.name==='interrupted.bin');
  if(result&&result.content.length===larger.length&&peers.pc.win.connected&&peers.android.win.connected)break;await wait(25);
 }
 const resumed=[...peers.android.stored.values()].find(x=>x.name==='interrupted.bin');
 assert.ok(interrupted,'Must simulate an interruption');assert.ok(reconnections,'Must reconnect automatically');
 assert.ok(resumed,'Receiver must retain partial file');
 assert.deepEqual(resumed.content,larger,'Resumed content must match original');
 console.log('PASS FPTP/1: automatic trusted-device re-authentication + resume after network interruption.');
 // Replay/forged encrypted packet must close the verified session.
 peers.pc.win.FileportTransport.onFrame(JSON.stringify({v:1,t:'sealed',seq:1,body:'AA=='}));
 await wait(120);assert.equal(peers.pc.win.connected,false,'Replayed packet must invalidate channel');
 console.log('PASS FPTP/1: replayed/out-of-order ciphertext rejected.');
}
main().then(()=>process.exit(0)).catch(err=>{console.error(err);process.exit(1);});
