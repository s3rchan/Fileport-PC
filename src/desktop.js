(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const frame=document.querySelector('.desktop-frame');
 const tabs=[...document.querySelectorAll('[data-view]')];
 const setup=$('desktopPairPanel'),welcome=$('pairWelcome'),waiting=$('pairWaiting');
 const popup=$('flowReconnect');
 let online=false,waitingForPeer=false;
 const trusted=()=>window.FileportIdentity?.readTrusted()||[];
 function choose(view){frame.dataset.view=view;tabs.forEach(b=>b.classList.toggle('active',b.dataset.view===view));}
 tabs.forEach(button=>button.addEventListener('click',()=>choose(button.dataset.view)));
 function render(){const needsSetup=!trusted().length;
  setup.classList.toggle('hidden',!needsSetup);
  popup.classList.toggle('hidden',needsSetup||online);
  if(needsSetup){welcome.classList.toggle('hidden',waitingForPeer);waiting.classList.toggle('hidden',!waitingForPeer);}
 }
 async function begin(){
  waitingForPeer=true;render();
  $('desktopPairCode').textContent='Waiting for Fileport on your phone...';
  $('pcReconnectInfo').textContent='Available on the local Wi-Fi network.';
  await window.FileportConnection?.host();
 }
 window.addEventListener('fileport-peer-connected',()=>{online=true;waitingForPeer=false;render();choose('chat');});
 window.addEventListener('fileport-peer-disconnected',()=>{online=false;render();});
 window.addEventListener('fileport-connection-error',()=>{online=false;render();});
 window.addEventListener('fileport-trusted-updated',()=>{render();});
 $('desktopStart').addEventListener('click',begin);
 $('desktopRetryWaiting').addEventListener('click',begin);
 $('desktopCancel').addEventListener('click',()=>{waitingForPeer=false;render();});
 $('pcReconnect').addEventListener('click',begin);
 choose('chat');render();
 // For paired devices, discoverability starts automatically at launch.
 if(trusted().length)void begin();
})();
