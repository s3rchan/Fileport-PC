(() => {
const file=document.getElementById('cloudFile'), btn=document.getElementById('cloudUpload'), status=document.getElementById('cloudStatus'), result=document.getElementById('cloudResult'), link=document.getElementById('cloudLink');
btn.addEventListener('click', async () => {
 if(!file.files.length){status.textContent='Önce bir dosya seç.';return;}
 btn.disabled=true;result.classList.add('hidden');status.textContent='Dosya sunucuya yükleniyor…';
 try {
  const f=file.files[0], response=await fetch('/api/files',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(f.name)},body:f});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Yükleme başarısız.');
  link.value=new URL(data.url,location.origin).href;result.classList.remove('hidden');status.textContent='Yüklendi. Bağlantıya sahip olan herkes dosyayı indirebilir.';
 }catch(e){status.textContent=e.message;}finally{btn.disabled=false;}
});
document.getElementById('cloudCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link.value);status.textContent='Bağlantı kopyalandı.';}catch{link.select();status.textContent='Bağlantıyı seçip kopyalayabilirsiniz.';}});
})();