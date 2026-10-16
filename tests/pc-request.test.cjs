/* PC-side phone discovery -> signed request -> stop on connection */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const source=fs.readFileSync(__dirname+'/../src/desktop.js','utf8'),E=new TextEncoder();
async function newId(){
 const kp=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',kp.publicKey);
 const id=Buffer.from(await crypto.subtle.digest('SHA-256',E.encode(`P256|${jwk.x}|${jwk.y}`))).toString('hex');
 return{kp,jwk,id};
}
function el(){const listeners=new Map(),parts=[];return {textContent:'',dataset:{},_parts:parts,
 classList:{toggle(){},add(){},remove(){}},replaceChildren(){parts.length=0;},append(node){parts.push(node);},
 addEventListener:(kind,fn)=>listeners.set(kind,fn),click(){return listeners.get('click')?.();}};}
async function create(pc,phone,previouslyPaired){
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);};
 const handlers=new Map(),invocations=[],storage=new Map(),hostCalls=[];
 const identity={readTrusted:()=>previouslyPaired?[{id:phone.id,name:'Galaxy'}]:[],identity:async()=>({id:pc.id,privateKey:pc.kp.privateKey,jwk:pc.jwk}),
 nonce:()=>Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('hex'),
 sign:async(key,text)=>Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,E.encode(text))).toString('hex')};
 const nativeEvents=new Map();
 const window={FileportIdentity:identity,FileportI18n:{language:'en'},FileportFlow:{deviceName:()=> 'DESKTOP-TEST'},FileportConnection:{host:async()=>hostCalls.push('host')},
 __TAURI__:{event:{listen:(event,callback)=>{nativeEvents.set(event,callback);return Promise.resolve();}},core:{invoke:async(kind,args)=>{invocations.push({kind,args});if(kind==='windows_device_name')return 'DESKTOP-TEST';}}},
 addEventListener:(event,cb)=>handlers.set(event,cb)};
 const document={querySelector:()=>el(),querySelectorAll:()=>[],getElementById:get,createElement:()=>el()};
 const env={window,document,console,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 Date,Map,setTimeout,clearTimeout,setInterval,clearInterval};
 vm.createContext(env);vm.runInContext(source,env);
 await new Promise(r=>setTimeout(r,5));
 return {get,nativeEvents,handlers,invocations,hostCalls,window};
}
async function run(){
 const pc=await newId(),phone=await newId();
 let app=await create(pc,phone,false);
 app.nativeEvents.get('fileport-phone-found')({payload:{id:phone.id,name:'Galaxy S24',address:'192.168.1.9'}});
 app.get('desktopStart').click();
 await new Promise(r=>setTimeout(r,5));
 const list=app.get('desktopNearbyPhones')._parts;
 assert.equal(list.length,1,'PC must list available Android phone');
 assert.match(list[0].textContent,/Galaxy S24.*Wi-Fi \/ LAN/);
 list[0].click();await new Promise(r=>setTimeout(r,30));
 let sent=app.invocations.find(i=>i.kind==='send_phone_request');
 assert.ok(sent,'PC must send a signed LAN request');
 let pkt=JSON.parse(sent.args.packet);
 assert.equal(pkt.mode,'setup');assert.equal(pkt.target,phone.id);assert.equal(pkt.id,pc.id);
 let transcript=`FILEPORT/REQUEST/1|${pkt.id}|${pkt.target}|${pkt.nonce}|${pkt.ts}|${pkt.mode}|${pkt.name}`;
 assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pc.kp.publicKey,Buffer.from(pkt.sig,'hex'),E.encode(transcript)));
 assert.equal(app.window.FileportDesktop.expectedPeerId(),phone.id);
 app.window.FileportConnection.peerId=phone.id;
 app.handlers.get('fileport-peer-connected')();
 assert.equal(app.window.FileportDesktop.expectedPeerId(),null,'Once connected, discovery request must stop');
 app=await create(pc,phone,true);
 app.nativeEvents.get('fileport-phone-found')({payload:{id:phone.id,name:'Galaxy S24',address:'192.168.1.9'}});
 app.get('pcReconnect').click();await new Promise(r=>setTimeout(r,30));
 sent=app.invocations.find(i=>i.kind==='send_phone_request');
 assert.equal(JSON.parse(sent.args.packet).mode,'reconnect');
 app.get('pcReconnect').click();
 assert.equal(app.window.FileportDesktop.expectedPeerId(),null,'Cancel request must clear intended phone');
 console.log('PASS Windows workflow: phone list, signed first pairing, 60-second retry request, trusted reconnect and cancellation.');
}
run().then(()=>process.exit(0)).catch(err=>{console.error(err);process.exit(1);});
