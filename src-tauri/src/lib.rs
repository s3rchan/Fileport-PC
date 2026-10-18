//! FPTP/1 desktop implementation. All application payloads are encrypted by
//! the shared WebCrypto FPTP codec; this native socket transports opaque frames.

mod github_update;
use std::{collections::HashMap,fs::{self,File,OpenOptions},io::{Read,Write},net::{TcpListener,TcpStream,Shutdown,UdpSocket},path::PathBuf,sync::{Arc,Mutex,atomic::{AtomicU64,Ordering}},thread,time::Duration};
use base64::Engine;
use tauri::{AppHandle,Emitter,State};
use tauri_plugin_notification::NotificationExt;

const MAX_FILE:u64=1024*1024*1024;
const MAX_CHUNK:usize=65536;
const MAX_FRAME:usize=196608;
const PORT:u16=38477;

fn safe_name(name:&str)->String{
 name.chars().map(|c|if c.is_control()||matches!(c,'<'|'>'|':'|'"'|'/'|'\\'|'|'|'?'|'*'){'_'}else{c})
 .collect::<String>().trim_matches(&[' ','.'][..]).chars().take(150).collect()
}
fn valid_id(s:&str)->bool{s.len()==32&&s.bytes().all(|b|b.is_ascii_hexdigit())}
fn partial_dir()->Result<PathBuf,String>{
 let dir=dirs::data_local_dir().ok_or("Local application data directory unavailable")?.join("Fileport").join("partial-transfers");
 fs::create_dir_all(&dir).map_err(|e|e.to_string())?;Ok(dir)
}
struct FileTransfer {file:File,part:PathBuf,meta:PathBuf,expected:u64,written:u64,name:String}
#[derive(Default)]struct Transfers{files:Mutex<HashMap<String,FileTransfer>>}
#[tauri::command]
fn begin_download(filename:String,size:u64,transfer_id:String,state:State<'_,Transfers>)->Result<u64,String>{
 if !valid_id(&transfer_id)||size>MAX_FILE{return Err("Invalid transfer size or ID".into());}
 let name=safe_name(&filename);if name.is_empty(){return Err("Invalid file name".into());}
 let dir=partial_dir()?;let part=dir.join(format!("{transfer_id}.part"));let meta=dir.join(format!("{transfer_id}.meta"));
 let mut files=state.files.lock().map_err(|e|e.to_string())?;
 if let Some(current)=files.get(&transfer_id){return if current.expected==size&&current.name==name{Ok(current.written)}else{Err("Conflicting transfer ID".into())};}
 if files.len()>=2{return Err("Too many open transfers".into());}
 let descriptor=format!("{size}\n{name}");
 let good=fs::read_to_string(&meta).ok().as_deref()==Some(&descriptor);
 if !good {let _=fs::remove_file(&part);fs::write(&meta,&descriptor).map_err(|e|e.to_string())?;}
 let existing=fs::metadata(&part).map(|m|m.len()).unwrap_or(0);
 if existing>size{return Err("Partial transfer larger than announced size".into());}
 let file=OpenOptions::new().create(true).append(true).read(true).open(&part).map_err(|e|e.to_string())?;
 files.insert(transfer_id,FileTransfer{file,part,meta,expected:size,written:existing,name});Ok(existing)
}
#[tauri::command]
fn append_download(transfer_id:String,offset:u64,base64:String,state:State<'_,Transfers>)->Result<u64,String>{
 if base64.len()>((MAX_CHUNK+2)/3)*4+8{return Err("Chunk exceeds limit".into());}
 let bytes=base64::engine::general_purpose::STANDARD.decode(base64).map_err(|e|e.to_string())?;
 if bytes.len()>MAX_CHUNK{return Err("Chunk exceeds limit".into());}
 let mut map=state.files.lock().map_err(|e|e.to_string())?;
 let item=map.get_mut(&transfer_id).ok_or("Unknown transfer")?;
 if offset!=item.written||item.written.saturating_add(bytes.len() as u64)>item.expected{return Err("Invalid transfer offset".into());}
 item.file.write_all(&bytes).map_err(|e|e.to_string())?;item.written+=bytes.len() as u64;Ok(item.written)
}
#[tauri::command]
fn sync_download(transfer_id:String,state:State<'_,Transfers>)->Result<u64,String>{
 let mut map=state.files.lock().map_err(|e|e.to_string())?;
 let item=map.get_mut(&transfer_id).ok_or("Unknown transfer")?;
 item.file.sync_data().map_err(|e|e.to_string())?;Ok(item.written)
}
#[tauri::command]
fn finish_download(transfer_id:String,state:State<'_,Transfers>)->Result<String,String>{
 let mut map=state.files.lock().map_err(|e|e.to_string())?;
 let item=map.get(&transfer_id).ok_or("Unknown transfer")?;
 if item.expected!=item.written{return Err("Transfer incomplete".into());}
 item.file.sync_all().map_err(|e|e.to_string())?;
 let item=map.remove(&transfer_id).ok_or("Unknown transfer")?;
 drop(item.file);
 let folder=dirs::download_dir().ok_or("Downloads directory unavailable")?;
 let (stem,extension)=match item.name.rsplit_once('.') {Some((a,b)) if !a.is_empty()=> (a.to_string(),format!(".{b}")),_=>(item.name.clone(),String::new())};
 let mut destination=folder.join(&item.name);
 for n in 1..=10000 {if !destination.exists(){break;}destination=folder.join(format!("{stem} ({n}){extension}"));}
 // The partial path is on the same local machine but possibly a different volume.
 match fs::rename(&item.part,&destination){Ok(())=>{},Err(_)=>{
   // Use create_new so an existing unrelated file is never overwritten.
   let mut source=File::open(&item.part).map_err(|e|e.to_string())?;
   let mut target=OpenOptions::new().create_new(true).write(true).open(&destination).map_err(|e|e.to_string())?;
   if let Err(error)=std::io::copy(&mut source,&mut target).and_then(|_|target.sync_all()){
    drop(target);let _=fs::remove_file(&destination);return Err(error.to_string());
   }
   fs::remove_file(&item.part).map_err(|e|e.to_string())?;
 }}
 let _=fs::remove_file(item.meta);
 Ok(destination.display().to_string())
}
#[tauri::command]
fn verify_download(transfer_id:String,digest:String,state:State<'_,Transfers>)->Result<bool,String>{
 use sha2::{Sha256,Digest};
 if !valid_id(&transfer_id)||digest.len()!=64||!digest.bytes().all(|b|b.is_ascii_hexdigit()){return Err("Invalid hash".into());}
 let mut map=state.files.lock().map_err(|e|e.to_string())?;
 let item=map.get_mut(&transfer_id).ok_or("Unknown transfer")?;
 if item.written!=item.expected{return Ok(false);}
 item.file.sync_data().map_err(|e|e.to_string())?;
 let mut input=File::open(&item.part).map_err(|e|e.to_string())?;
 let mut hasher=Sha256::new();let mut buf=[0u8;65536];
 loop {let n=input.read(&mut buf).map_err(|e|e.to_string())?;if n==0{break;}hasher.update(&buf[..n]);}
 let actual=format!("{:x}",hasher.finalize());Ok(actual.eq_ignore_ascii_case(&digest))
}
#[tauri::command]
fn pause_download(transfer_id:String,state:State<'_,Transfers>)->Result<(),String>{
 let mut files=state.files.lock().map_err(|e|e.to_string())?;
 if let Some(item)=files.remove(&transfer_id){item.file.sync_data().map_err(|e|e.to_string())?;}Ok(())
}
#[tauri::command]
fn abort_download(transfer_id:String,state:State<'_,Transfers>)->Result<(),String>{
 let mut files=state.files.lock().map_err(|e|e.to_string())?;
 if let Some(item)=files.remove(&transfer_id){drop(item.file);let _=fs::remove_file(item.part);let _=fs::remove_file(item.meta);}
 else if valid_id(&transfer_id){let dir=partial_dir()?;let _=fs::remove_file(dir.join(format!("{transfer_id}.part")));let _=fs::remove_file(dir.join(format!("{transfer_id}.meta")));}
 Ok(())
}
#[tauri::command]
fn notify_received(app:AppHandle,filename:String)->Result<(),String>{
 app.notification().builder().title("Fileport").body(format!("File received: {}",safe_name(&filename))).show().map_err(|e|e.to_string())
}
fn lan_phone_listener(app:AppHandle){
 thread::spawn(move||{
  let socket=match UdpSocket::bind("0.0.0.0:38478"){Ok(s)=>s,Err(e)=>{event(&app,"error",&format!("Phone discovery unavailable: {e}"));return;}};
  let _=socket.set_read_timeout(Some(Duration::from_millis(1200)));
  let mut buf=[0u8;1024];
  loop {
   let (size,from)=match socket.recv_from(&mut buf){Ok(pair)=>pair,Err(_)=>continue};
   if !from.ip().is_ipv4()||!is_local_ip(from.ip()){continue;}
   let data=match std::str::from_utf8(&buf[..size]){Ok(s)=>s,Err(_)=>continue};
   let mut fields=data.split('|');
   if fields.next()!=Some("FILEPORT_PHONE_V1"){continue;}
   let (Some(id),Some(name),None)=(fields.next(),fields.next(),fields.next()) else {continue};
   if id.len()!=64||!id.bytes().all(|b|b.is_ascii_hexdigit())||name.len()>64||name.chars().any(|c|c.is_control()){continue;}
   let _=app.emit("fileport-phone-found",serde_json::json!({"id":id,"name":name,"address":from.ip().to_string()}));
  }
 });
}
fn is_local_ip(ip:std::net::IpAddr)->bool{
 match ip {std::net::IpAddr::V4(x)=>x.is_private()||x.is_link_local(),_=>false}
}
#[tauri::command]
fn send_phone_request(address:String,packet:String)->Result<(),String>{
 use std::net::IpAddr;
 let ip:IpAddr=address.parse().map_err(|_|"Invalid device IP")?;
 if !is_local_ip(ip)||!ip.is_ipv4(){return Err("A private IPv4 address is required".into());}
 if packet.len()>2048{return Err("Request too large".into());}
 let v:serde_json::Value=serde_json::from_str(&packet).map_err(|_|"Bad request JSON")?;
 if v.get("v").and_then(|v|v.as_u64())!=Some(1)||v.get("kind").and_then(|v|v.as_str())!=Some("connect-request"){
  return Err("Unexpected request type".into());
 }
 let socket=UdpSocket::bind("0.0.0.0:0").map_err(|e|e.to_string())?;
 socket.send_to(packet.as_bytes(),(ip,38479)).map_err(|e|e.to_string())?;Ok(())
}
#[tauri::command]
fn windows_device_name()->String{
 std::env::var("COMPUTERNAME").or_else(|_|std::env::var("HOSTNAME")).unwrap_or_else(|_|"Windows PC".into())
 .chars().filter(|c|!c.is_control()).take(32).collect()
}
#[derive(Default)]struct Transport {current:Arc<Mutex<Option<Peer>>>,counter:Arc<AtomicU64>}
struct Peer{generation:u64,writer:TcpStream}
fn event(app:&AppHandle,kind:&str,data:&str){let _=app.emit("fptp-event",serde_json::json!({"kind":kind,"data":data}));}
fn send_frame(stream:&mut TcpStream,frame:&str)->Result<(),String>{
 let bytes=frame.as_bytes();if bytes.len()>MAX_FRAME||bytes.is_empty(){return Err("Frame size invalid".into());}
 stream.write_all(&(bytes.len() as u32).to_be_bytes()).and_then(|_|stream.write_all(bytes)).map_err(|e|e.to_string())
}
#[tauri::command]
fn transport_send(frame:String,state:State<'_,Transport>)->Result<(),String>{
 let value:serde_json::Value=serde_json::from_str(&frame).map_err(|e|e.to_string())?;
 if !matches!(value.get("t").and_then(|v|v.as_str()),Some("hello"|"sealed"|"keepalive")){return Err("Unexpected FPTP frame".into());}
 let mut guard=state.current.lock().map_err(|e|e.to_string())?;
 let peer=guard.as_mut().ok_or("No local connection")?;send_frame(&mut peer.writer,&frame)
}
#[tauri::command]
fn transport_close(state:State<'_,Transport>)->Result<(),String>{
 if let Some(peer)=state.current.lock().map_err(|e|e.to_string())?.take(){let _=peer.writer.shutdown(Shutdown::Both);}Ok(())
}
fn tcp_server(app:AppHandle,transport:Arc<Mutex<Option<Peer>>>,counter:Arc<AtomicU64>){
 thread::spawn(move||{
 let listener=match TcpListener::bind(("0.0.0.0",PORT)){Ok(l)=>l,Err(err)=>{event(&app,"error",&format!("TCP listener: {err}"));return;}};
 for result in listener.incoming(){let mut stream=match result{Ok(s)=>s,Err(_)=>continue};
  let _=stream.set_nodelay(true);let _=stream.set_read_timeout(Some(Duration::from_secs(16)));let _=stream.set_write_timeout(Some(Duration::from_secs(6)));
  let id=counter.fetch_add(1,Ordering::SeqCst)+1;
  let clone=match stream.try_clone(){Ok(c)=>c,Err(_)=>continue};
  {let mut guard=transport.lock().unwrap();if let Some(old)=guard.replace(Peer{generation:id,writer:clone}){let _=old.writer.shutdown(Shutdown::Both);}}
  event(&app,"open","");
  // Socket-level keepalive continues even while a WebView is suspended.
  let keepalive=transport.clone();
  thread::spawn(move||loop{
   thread::sleep(Duration::from_secs(4));
   let mut guard=match keepalive.lock(){Ok(g)=>g,Err(_)=>break};
   let peer=match guard.as_mut(){Some(p) if p.generation==id=>p,_=>break};
   if send_frame(&mut peer.writer,"{\"v\":1,\"t\":\"keepalive\"}").is_err(){let _=peer.writer.shutdown(Shutdown::Both);break;}
  });
  let app=app.clone();let transport=transport.clone();
  thread::spawn(move||{
   loop {let mut len=[0u8;4];if stream.read_exact(&mut len).is_err(){break;}
    let length=u32::from_be_bytes(len) as usize;if length==0||length>MAX_FRAME{break;}
    let mut bytes=vec![0u8;length];if stream.read_exact(&mut bytes).is_err(){break;}
    if let Ok(frame)=String::from_utf8(bytes){
     if transport.lock().map(|g|g.as_ref().is_some_and(|p|p.generation==id)).unwrap_or(false){event(&app,"frame",&frame);}else{break;}
    }else{break;}
   }
   let mut guard=transport.lock().unwrap();if guard.as_ref().is_some_and(|p|p.generation==id){*guard=None;event(&app,"closed","");}
  });
 }
 });
}
#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){
 let transport=Transport::default();let active=transport.current.clone();let counter=transport.counter.clone();
 tauri::Builder::default().manage(transport).manage(Transfers::default())
 .plugin(tauri_plugin_notification::init())
 .setup(move|app|{tcp_server(app.handle().clone(),active.clone(),counter.clone());lan_phone_listener(app.handle().clone());Ok(())})
 .invoke_handler(tauri::generate_handler![begin_download,append_download,sync_download,verify_download,finish_download,pause_download,abort_download,notify_received,transport_send,transport_close,github_update::check_github_update,github_update::install_github_update,send_phone_request,windows_device_name])
 .run(tauri::generate_context!()).expect("Fileport startup failed");
}
