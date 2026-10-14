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

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
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
