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
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (cloudRequest(req, res, pathname)) return;
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403).end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss: stun: turn:; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/signal', maxPayload: 64 * 1024 });
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

server.listen(PORT, '0.0.0.0', () => console.log(`Dosya paylaşımı hazır: http://localhost:${PORT}`));
