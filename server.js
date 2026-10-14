const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const MAX_FILE_BYTES = Math.max(1, Number(process.env.MAX_FILE_MB || 1024)) * 1024 * 1024;
const rooms = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function iceServers() {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    servers.push({ urls: process.env.TURN_URL.split(',').map(x => x.trim()), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return servers;
}

const STORE = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
const CLOUD_LIMIT = Math.max(1, Number(process.env.CLOUD_MAX_MB || 100)) * 1024 * 1024;
fs.mkdirSync(STORE, { recursive: true });
const cleanFilename = name => String(name || 'dosya').replace(/[\x00-\x1f\x7f\\/<>:"|?*]/g, '_').slice(0, 160) || 'dosya';
function cloudRequest(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/files') {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > CLOUD_LIMIT) { res.writeHead(413, {'Content-Type':'application/json'}).end(JSON.stringify({error:'Dosya boyutu sınırı aşıyor.'})); req.resume(); return true; }
    let name;
    try { name = cleanFilename(decodeURIComponent(req.headers['x-file-name'] || 'dosya')); } catch { name='dosya'; }
    const id=crypto.randomBytes(20).toString('hex');
    const target=path.join(STORE,id+'.bin'), meta=path.join(STORE,id+'.json');
    const output=fs.createWriteStream(target,{flags:'wx',mode:0o600});
    let size=0, failed=false;
    const fail=(code,message)=>{if(failed)return;failed=true;req.unpipe(output);output.destroy();fs.rm(target,{force:true},()=>{});if(!res.headersSent)res.writeHead(code,{'Content-Type':'application/json'}).end(JSON.stringify({error:message}));req.resume();};
    req.on('data',chunk=>{size+=chunk.length;if(size>CLOUD_LIMIT)fail(413,'Dosya boyutu sınırı aşıyor.');});
    req.on('aborted',()=>fail(400,'Yükleme yarıda kesildi.'));
    req.on('error',()=>fail(400,'Bağlantı hatası.'));
    output.on('error',()=>fail(500,'Dosya kaydedilemedi.'));
    output.on('finish',()=>{if(failed)return;try{fs.writeFileSync(meta,JSON.stringify({name,size,created:new Date().toISOString()}),{flag:'wx',mode:0o600});res.writeHead(201,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({url:'/f/'+id}));}catch{fs.rm(target,{force:true},()=>{});res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Kayıt başarısız.'}));}});
    req.pipe(output);return true;
  }
  if(req.method==='GET' && /^\/f\/[a-f0-9]{40}$/.test(pathname)) {
    const id=pathname.slice(3);let metadata,stat;
    try{metadata=JSON.parse(fs.readFileSync(path.join(STORE,id+'.json'),'utf8'));stat=fs.statSync(path.join(STORE,id+'.bin'));}catch{res.writeHead(404).end('Dosya bulunamadı.');return true;}
    const fallback=cleanFilename(metadata.name).replace(/["\r\n]/g,'_');
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':stat.size,'Content-Disposition':`attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});
    fs.createReadStream(path.join(STORE,id+'.bin')).pipe(res);return true;
  }
  if(pathname.startsWith('/api/')||pathname.startsWith('/f/')){res.writeHead(404).end('Not found');return true;}
  return false;
}
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Invalid URL'); return; }
  if (pathname === '/api/health') {
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({ ok:true, signaling:'/signal', screenSignaling:'/screen-signal', activeRooms:rooms.size }));
    return;
  }
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (cloudRequest(req, res, pathname)) return;
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403).end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss: stun: turn:; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
function send(ws, value) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); }
function freshCode() {
  for (let i = 0; i < 100; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!rooms.has(code)) return code;
  }
  throw new Error('Oda kodu üretilemedi');
}
function leave(ws) {
  const code = ws.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  ws.roomCode = null;
  if (!room) return;
  room.peers.delete(ws);
  for (const peer of room.peers) send(peer, { type: 'peer-left' });
  if (room.peers.size === 0) rooms.delete(code);
}

wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { send(ws, { type: 'error', message: 'Geçersiz ileti.' }); return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'create') {
      leave(ws);
      const code = freshCode();
      rooms.set(code, { peers: new Set([ws]) });
      ws.roomCode = code;
      send(ws, { type: 'created', code, iceServers: iceServers(), maxFileBytes: MAX_FILE_BYTES });
      return;
    }
    if (msg.type === 'join') {
      const code = String(msg.code || '').replace(/\D/g, '').slice(0, 6);
      if (!/^\d{6}$/.test(code)) { send(ws, { type: 'error', message: 'Bu oda bulunamadı. Kodu kontrol edip yeniden deneyin.' }); return; }
      if (ws.roomCode === code) { send(ws, { type: 'joined', code, iceServers: iceServers(), maxFileBytes: MAX_FILE_BYTES }); return; }
      const room = rooms.get(code);
      if (!room) { send(ws, { type: 'error', message: 'Bu oda bulunamadı. Kodu kontrol edip yeniden deneyin.' }); return; }
      if (room.peers.size >= 2) { send(ws, { type: 'error', message: 'Bu oda zaten dolu.' }); return; }
      leave(ws);
      const currentRoom = rooms.get(code);
      if (!currentRoom || currentRoom.peers.size >= 2) { send(ws, { type: 'error', message: 'Bu oda artık kullanılamıyor.' }); return; }
      currentRoom.peers.add(ws);
      ws.roomCode = code;
      const host = [...currentRoom.peers].find(peer => peer !== ws);
      send(ws, { type: 'joined', code, iceServers: iceServers(), maxFileBytes: MAX_FILE_BYTES });
      send(host, { type: 'peer-joined', iceServers: iceServers() });
      return;
    }
    if (msg.type === 'signal') {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.peers.has(ws)) return;
      for (const peer of room.peers) if (peer !== ws) send(peer, { type: 'signal', data: msg.data });
      return;
    }
    if (msg.type === 'leave') leave(ws);
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

// Separate, consent-based screen-share signaling rooms.
const screenRooms = new Map();
const screenWss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
function screenSend(ws, payload) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); }
function screenLeave(ws) {
  const code = ws.screenCode;
  if (!code) return;
  const room = screenRooms.get(code);
  ws.screenCode = null;
  if (!room) return;
  if (room[ws.screenRole] === ws) room[ws.screenRole] = null;
  const other = room.sender || room.viewer;
  if (other) screenSend(other, { type: 'peer-left' });
  if (!room.sender && !room.viewer) screenRooms.delete(code);
}
screenWss.on('connection', ws => {
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'create-viewer') {
      screenLeave(ws);
      let code;
      do { code = String(crypto.randomInt(100000, 1000000)); } while (screenRooms.has(code));
      screenRooms.set(code, { viewer: ws, sender: null });
      ws.screenCode = code; ws.screenRole = 'viewer';
      screenSend(ws, { type: 'created', code, iceServers: iceServers() });
    } else if (m.type === 'join-sender') {
      const code = String(m.code || '');
      const room = screenRooms.get(code);
      if (!/^\d{6}$/.test(code) || !room || room.sender) return screenSend(ws, {type:'error',message:'Oda bulunamadı veya dolu.'});
      screenLeave(ws);
      room.sender = ws; ws.screenCode = code; ws.screenRole = 'sender';
      screenSend(ws, { type:'joined', iceServers:iceServers() });
      screenSend(room.viewer, { type:'sender-joined' });
    } else if (m.type === 'signal') {
      const room = screenRooms.get(ws.screenCode);
      if (!room || (room[ws.screenRole] !== ws)) return;
      const other = ws.screenRole === 'viewer' ? room.sender : room.viewer;
      if (other && JSON.stringify(m.data || {}).length < 100000) screenSend(other, {type:'signal',data:m.data});
    } else if (m.type === 'leave') screenLeave(ws);
  });
  ws.on('close', () => screenLeave(ws));
  ws.on('error', () => screenLeave(ws));
});

server.on('upgrade', (req, socket, head) => {
  let route;
  try { route = new URL(req.url, 'http://localhost').pathname; }
  catch { socket.destroy(); return; }
  const target = route === '/signal' ? wss : route === '/screen-signal' ? screenWss : null;
  if (!target) { socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
  try { target.handleUpgrade(req, socket, head, ws => target.emit('connection', ws, req)); }
  catch (error) { console.error('WebSocket upgrade failed:', error); socket.destroy(); }
});
server.listen(PORT, '0.0.0.0', () => console.log(`Dosya paylaşımı hazır: http://localhost:${PORT}`));
