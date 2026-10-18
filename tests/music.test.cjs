const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const file=fs.existsSync(path.join(root,'src/music.js'))
  ?path.join(root,'src/music.js')
  :path.join(root,'app/src/main/assets/music.js');
const source=fs.readFileSync(file,'utf8');
function element(id){
 const handlers={};
 return {
  id,disabled:false,hidden:false,files:[],textContent:'',value:'',
  classList:{values:new Set(['hidden']),add(key){this.values.add(key);},remove(key){this.values.delete(key);}},
  addEventListener(name,fn){handlers[name]=fn;},
  click(){return handlers.click?.();},
  fire(name){return handlers[name]?.();},
  load(){},pause(){},removeAttribute(){},
  play(){return Promise.resolve();},
  get handlers(){return handlers;}
 };
}
function makeHarness(android){
 const ids=android?
 ['musicPlay','musicStop','musicTrackName','musicStatus','musicOfferOverlay','musicOfferText','musicOfferAccept','musicOfferDecline']:
 ['musicPick','musicShare','musicFileInput','musicPlay','musicStop','musicTrackName','musicStatus','musicAudio'];
 const nodes=Object.fromEntries(ids.map(id=>[id,element(id)]));
 const outbound=[],transfers=[],nativeCalls=[];
 const native=android?{
  prepareMusic(id){nativeCalls.push(['prepare',id]);return true;},
  scheduleMusic(id,delay){nativeCalls.push(['schedule',id,delay]);return true;},
  stopMusic(){nativeCalls.push(['stop']);}
 }:null;
 let sound=0;
 const listeners={};
 const window={
  FileportNative:native,FileportI18n:{language:'en'},
  FileportMusicTransport:{
   connected:true,send(packet){outbound.push(packet);return Promise.resolve();},
   async sendMusic(file,id){transfers.push({file,id});}
  },
  addEventListener(name,fn){listeners[name]=fn;}
 };
 const document={getElementById(id){return nodes[id]||null;}};
 const URL={createObjectURL(){return 'blob:fake-'+(++sound);},revokeObjectURL(){}};
 vm.runInNewContext(source,{window,document,URL,crypto:webcrypto,Uint8Array,Array,
  Promise,console,setTimeout,clearTimeout});
 return {window,nodes,outbound,transfers,nativeCalls,listeners};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const pc=makeHarness(false);
 const audio={name:'example.mp3',type:'audio/mpeg',size:34500};
 pc.nodes.musicFileInput.files=[audio];
 pc.nodes.musicFileInput.fire('change');
 await flush();
 assert.equal(pc.outbound.length,1);
 assert.equal(pc.outbound[0].t,'music-offer');
 assert.equal(pc.transfers.length,0,'No file bytes may be sent before phone approval');
 const id=pc.outbound[0].id;
 assert.match(id,/^[a-f0-9]{32}$/);
 await pc.window.FileportMusic.handlePacket({t:'music-accept',id:'0'.repeat(32)});
 assert.equal(pc.transfers.length,0,'Unrelated music approvals are rejected');
 await pc.window.FileportMusic.handlePacket({t:'music-accept',id});
 await flush();
 assert.equal(pc.transfers.length,1);
 assert.equal(pc.transfers[0].id,id);
 pc.window.FileportMusic.fileSent(id);
 assert.equal(pc.nodes.musicPlay.disabled,true,'Both players must be ready');
 await pc.window.FileportMusic.handlePacket({t:'music-ready',id});
 assert.equal(pc.nodes.musicPlay.disabled,false,'Both devices reported ready');
 const phone=makeHarness(true);
 await phone.window.FileportMusic.handlePacket({t:'music-offer',id,name:'example.mp3',size:34500});
 assert.equal(phone.outbound.length,0,'Offer alone does not approve the transfer');
 assert.equal(phone.window.FileportMusic.allowIncoming({music:true,id,name:'example.mp3',size:34500}),false);
 await phone.nodes.musicOfferAccept.fire('click');
 assert.equal(phone.outbound[0].t,'music-accept');
 assert.equal(phone.window.FileportMusic.allowIncoming({music:true,id,name:'example.mp3',size:34500}),true);
 assert.equal(phone.window.FileportMusic.allowIncoming({music:true,id,name:'other.mp3',size:34500}),false);
 assert.equal(phone.window.FileportMusic.allowIncoming({music:true,id,name:'example.mp3',size:999}),false);
 await phone.window.FileportMusic.fileReceived(id);
 assert.equal(phone.outbound[1].t,'music-ready');
 assert.equal(phone.nodes.musicPlay.disabled,false);
 await phone.window.FileportMusic.handlePacket({t:'music-play',id});
 assert.deepEqual(phone.nativeCalls.at(-1),['schedule',id,1600]);
 await phone.window.FileportMusic.handlePacket({t:'music-stop',id});
 assert.equal(phone.nativeCalls.at(-1)[0],'stop');
 console.log('Music Share approval, matching transfer, readiness and playback tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
