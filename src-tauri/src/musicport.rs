//! MusicPort music-only receiver listener, separate from the single FPTP file peer.
use std::{collections::HashMap,io::{Read,Write},net::{TcpListener,TcpStream,Shutdown,UdpSocket,IpAddr},sync::{Arc,Mutex,atomic::{AtomicU64,Ordering}},thread,time::Duration};
use tauri::{AppHandle,Emitter,State};
const PORT:u16=38480;
const MAX_FRAME:usize=70000;
#[derive(Default)]pub struct Hub {pub peers:Arc<Mutex<HashMap<u64,TcpStream>>>,pub next:Arc<AtomicU64>}
fn emit(app:&AppHandle,kind:&str,id:u64,data:&str){let _=app.emit("musicport-event",serde_json::json!({"kind":kind,"id":id,"data":data}));}
fn local(ip:IpAddr)->bool{match ip{IpAddr::V4(v)=>v.is_private()||v.is_link_local(),_=>false}}
fn write_frame(stream:&mut TcpStream,data:&str)->Result<(),String>{
 let b=data.as_bytes();if b.is_empty()||b.len()>MAX_FRAME{return Err("MusicPort frame too large".into());}
 stream.write_all(&(b.len() as u32).to_be_bytes()).and_then(|_|stream.write_all(b)).map_err(|e|e.to_string())
}
#[tauri::command]pub fn musicport_send(id:u64,frame:String,hub:State<'_,Hub>)->Result<(),String>{
 let json:serde_json::Value=serde_json::from_str(&frame).map_err(|_|"Invalid JSON")?;
 if json.get("v").and_then(|v|v.as_u64())!=Some(1)||!matches!(json.get("t").and_then(|x|x.as_str()),Some("hello"|"sealed")){return Err("Unexpected frame type".into());}
 let mut map=hub.peers.lock().map_err(|e|e.to_string())?;
 let peer=map.get_mut(&id).ok_or("Receiver offline")?;write_frame(peer,&frame)
}
#[tauri::command]pub fn musicport_close(id:u64,hub:State<'_,Hub>)->Result<(),String>{
 if let Some(peer)=hub.peers.lock().map_err(|e|e.to_string())?.remove(&id){let _=peer.shutdown(Shutdown::Both);}Ok(())
}
#[tauri::command]pub fn musicport_local_ip()->String{
 if let Ok(sock)=UdpSocket::bind("0.0.0.0:0"){if sock.connect("192.168.1.1:9").is_ok(){if let Ok(addr)=sock.local_addr(){if local(addr.ip()){return addr.ip().to_string();}}}}
 "Check your computer's Wi-Fi IPv4 address".into()
}
pub fn start(app:AppHandle,peers:Arc<Mutex<HashMap<u64,TcpStream>>>,next:Arc<AtomicU64>){
 let discover_app=app.clone();thread::spawn(move||{
  let sock=match UdpSocket::bind("0.0.0.0:38481"){Ok(s)=>s,Err(e)=>{emit(&discover_app,"error",0,&e.to_string());return;}};
  let mut buf=[0;128];loop{if let Ok((len,from))=sock.recv_from(&mut buf){if local(from.ip())&&&buf[..len]==b"MUSICPORT_DISCOVER_V1"{
   let _=sock.send_to(b"MUSICPORT_PC_V1",from);
  }}}
 });
 thread::spawn(move||{
  let server=match TcpListener::bind(("0.0.0.0",PORT)){Ok(s)=>s,Err(e)=>{emit(&app,"error",0,&e.to_string());return;}};
  for entry in server.incoming(){let mut stream=match entry{Ok(s)=>s,Err(_)=>continue};
   if !stream.peer_addr().map(|x|local(x.ip())).unwrap_or(false){let _=stream.shutdown(Shutdown::Both);continue;}
   let count=peers.lock().map(|g|g.len()).unwrap_or(8);if count>=8{let _=stream.shutdown(Shutdown::Both);continue;}
   let id=next.fetch_add(1,Ordering::SeqCst)+1;let _=stream.set_nodelay(true);
   let _=stream.set_read_timeout(Some(Duration::from_secs(35)));
   let _=stream.set_write_timeout(Some(Duration::from_secs(8)));
   let writer=match stream.try_clone(){Ok(v)=>v,Err(_)=>continue};
   peers.lock().unwrap().insert(id,writer);
   emit(&app,"open",id,"");let app=app.clone();let peers=peers.clone();
   thread::spawn(move||{
    loop {let mut len=[0;4];if stream.read_exact(&mut len).is_err(){break;}
     let size=u32::from_be_bytes(len) as usize;if size==0||size>MAX_FRAME{break;}
     let mut buf=vec![0;size];if stream.read_exact(&mut buf).is_err(){break;}
     let frame=match String::from_utf8(buf){Ok(s)=>s,Err(_)=>break};
     if !peers.lock().map(|m|m.contains_key(&id)).unwrap_or(false){break;}
     emit(&app,"frame",id,&frame);
    }
    if let Some(p)=peers.lock().unwrap().remove(&id){let _=p.shutdown(Shutdown::Both);}emit(&app,"closed",id,"");
   });
  }
 });
}
