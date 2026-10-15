// Fileport offline manual update (Windows only).
window.addEventListener('DOMContentLoaded', () => {
 const button=document.getElementById('installLocalUpdate');
 const status=document.getElementById('localUpdateStatus');
 if(!button)return;
 button.addEventListener('click',async()=>{
  button.disabled=true; status.textContent='Choose your update installer…';
  try {const result=await window.__TAURI__.core.invoke('install_local_update');
   status.textContent=result==='cancelled'?'Selection cancelled.':'Installer opened. Complete setup to update Fileport.';
  }catch(error){status.textContent=String(error);}
  finally{button.disabled=false;}
 });
});
