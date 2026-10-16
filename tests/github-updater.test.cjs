const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/manual-update.js'),'utf8');
function makeElement(){
  return {hidden:false,disabled:false,textContent:'',value:0,handlers:{},children:[],
    addEventListener(type,cb){this.handlers[type]=cb;},
    replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);}};
}
function harness(updates){
 const ids=['installLocalUpdate','localUpdateStatus','checkGithubUpdate','installGithubUpdate','githubUpdateStatus','githubUpdateDetails','githubUpdateProgress'];
 const elements=Object.fromEntries(ids.map(x=>[x,makeElement()]));
 elements.installGithubUpdate.hidden=true;
 const calls=[];let accepted=false;
 const ctx={
  window:{FileportTransferActive:false,FileportI18n:{language:'tr'},confirm:()=>accepted,
    addEventListener:(type,cb)=>{if(type==='DOMContentLoaded')cb();},
    __TAURI__:{core:{invoke:async(name,args)=>{calls.push({name,args});return updates[name]();}},event:{listen:()=>Promise.resolve()}}},
  document:{getElementById:id=>elements[id],createElement:()=>makeElement()},
  console,
 };
 vm.runInNewContext(source,ctx,{filename:'manual-update.js'});
 return {elements,calls,ctx,approve(){accepted=true;},async check(){elements.checkGithubUpdate.handlers.click();await new Promise(resolve=>setImmediate(resolve));},async install(){elements.installGithubUpdate.handlers.click();await new Promise(resolve=>setImmediate(resolve));}};
}
(async()=>{
 const yes=harness({check_github_update:async()=>({status:'available',version:'1.9.0',currentVersion:'1.8.0',name:'Fileport_1.9.0_x64-setup.exe',size:2097152,notes:'Bugfixes'}),install_github_update:async()=> 'started',install_local_update:async()=> 'cancelled'});
 await yes.check();
 assert.equal(yes.elements.installGithubUpdate.hidden,false);
 assert.equal(yes.elements.installGithubUpdate.disabled,false);
 assert.match(yes.elements.githubUpdateStatus.textContent,/Yeni Fileport/);
 await yes.install(); // no user confirmation
 assert.equal(yes.calls.filter(x=>x.name==='install_github_update').length,0);
 yes.approve();
 yes.ctx.window.FileportTransferActive=true;
 await yes.install(); // transfer in progress
 assert.equal(yes.calls.filter(x=>x.name==='install_github_update').length,0);
 yes.ctx.window.FileportTransferActive=false;
 await yes.install();
 assert.equal(yes.calls.filter(x=>x.name==='install_github_update').length,1);
 assert.equal(yes.calls.find(x=>x.name==='install_github_update').args.version,'1.9.0');
 assert.match(yes.elements.githubUpdateStatus.textContent,/Kurulum açıldı/);
 const empty=harness({check_github_update:async()=>({status:'unpublished',currentVersion:'1.8.0'})});
 await empty.check();
 assert.equal(empty.elements.installGithubUpdate.hidden,true);
 assert.match(empty.elements.githubUpdateStatus.textContent,/henüz|Henüz/);
 const current=harness({check_github_update:async()=>({status:'current',currentVersion:'1.8.0'})});
 await current.check();
 assert.match(current.elements.githubUpdateStatus.textContent,/güncel/);
 console.log('PASS GitHub update UI: available, consent required, transfer guard, install, no release, up-to-date.');
})().catch(error=>{console.error(error);process.exitCode=1;});
