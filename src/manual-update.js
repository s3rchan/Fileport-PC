/* Fileport Windows update manager. Only the pinned GitHub Releases source is used. */
window.addEventListener('DOMContentLoaded',()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const localButton=$('installLocalUpdate'),localStatus=$('localUpdateStatus');
 const checkButton=$('checkGithubUpdate'),installButton=$('installGithubUpdate');
 const status=$('githubUpdateStatus'),details=$('githubUpdateDetails'),progress=$('githubUpdateProgress');
 if(!checkButton||!installButton||!window.__TAURI__?.core?.invoke)return;
 const invoke=window.__TAURI__.core.invoke;
 let candidate=null,busy=false;
 const tr=()=>window.FileportI18n?.language==='tr';
 const t=(en,translated)=>tr()?translated:en;
 function setStatus(message){status.textContent=message;}
 function setBusy(value){busy=value;checkButton.disabled=value;installButton.disabled=value||!candidate;}
 function humanSize(size){return (size/(1024*1024)).toFixed(1)+' MB';}
 async function check(){
  candidate=null;installButton.hidden=true;details.hidden=true;progress.hidden=true;
  setBusy(true);setStatus(t('Checking GitHub Releases…','GitHub Releases kontrol ediliyor…'));
  try{
   const result=await invoke('check_github_update');
   if(result.status==='unpublished')setStatus(t('No published GitHub Release yet. Publish a pc-v* release first.','Henüz yayımlanmış GitHub Release yok. Önce pc-v* sürümü yayımlayın.'));
   else if(result.status==='current')setStatus(t('Fileport is up to date (v'+result.currentVersion+').','Fileport güncel (v'+result.currentVersion+').'));
   else if(result.status==='available'){
    candidate=result.version;
    details.hidden=false;details.replaceChildren();
    const title=document.createElement('strong');title.textContent=t('New version: ','Yeni sürüm: ')+result.version+' · '+humanSize(result.size);
    const notes=document.createElement('p');notes.textContent=result.notes||t('New Windows update available.','Yeni Windows güncellemesi hazır.');
    details.append(title,notes);
    setStatus(t('A newer Fileport release was found.','Yeni Fileport sürümü bulundu.'));
    installButton.hidden=false;
   }else setStatus(t('Unexpected GitHub response.','Beklenmeyen GitHub yanıtı.'));
  }catch(error){setStatus(t('Update check failed: ','Güncelleme denetimi başarısız: ')+String(error));}
  finally{setBusy(false);}
 }
 async function install(){
  if(busy||!candidate)return;
  if(window.FileportTransferActive){setStatus(t('Finish or pause the current transfer before updating.','Güncellemeden önce mevcut aktarımı bitirin veya duraklatın.'));return;}
  const message=t(
   'Install Fileport v'+candidate+' from GitHub Releases? The installer is checked against GitHub SHA-256. Development builds may be unsigned and Windows may show a publisher warning. Continue?',
   'GitHub Releases üzerinden Fileport v'+candidate+' yüklensin mi? Kurulum dosyasının GitHub SHA-256 özeti kontrol edilecek. Geliştirme sürümleri imzasız olabilir ve Windows yayıncı uyarısı gösterebilir. Devam edilsin mi?'
  );
  if(!window.confirm(message))return;
  setBusy(true);progress.hidden=false;progress.value=0;
  setStatus(t('Downloading installer…','Kurulum dosyası indiriliyor…'));
  try {
   const result=await invoke('install_github_update',{version:candidate});
   setStatus(result==='started'?t('Installer opened. Follow Windows setup to complete the update.','Kurulum açıldı. Güncellemeyi tamamlamak için Windows kurulumunu izleyin.'):result);
  }catch(error){setStatus(t('Update failed: ','Güncelleme başarısız: ')+String(error));}
  finally{setBusy(false);}
 }
 checkButton.addEventListener('click',()=>void check());
 installButton.addEventListener('click',()=>void install());
 window.__TAURI__?.event?.listen('fileport-update-progress',event=>{
  const value=Number(event.payload);
  if(Number.isFinite(value)&&value>=0&&value<=100){progress.value=value;setStatus(t('Downloading: ','İndiriliyor: ')+Math.round(value)+'%');}
 }).catch(()=>{});
 if(localButton){localButton.addEventListener('click',async()=>{
  localButton.disabled=true;localStatus.textContent=t('Choose a signed Windows installer…','İmzalı Windows kurulum dosyasını seçin…');
  try{const result=await invoke('install_local_update');
   localStatus.textContent=result==='cancelled'?t('Selection cancelled.','Seçim iptal edildi.'):t('Installer opened. Complete Windows setup.','Kurulum açıldı. Windows kurulumunu tamamlayın.');
  }catch(error){localStatus.textContent=String(error);}finally{localButton.disabled=false;}
 });}
});
