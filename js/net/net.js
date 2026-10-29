// Online-Multiplayer über WebRTC (PeerJS). Kein eigener Server: Der öffentliche PeerJS-Vermittlungsdienst
// stellt nur die Verbindung her, danach laufen die Daten direkt zwischen den Geräten.
// Die Peer-ID enthält die Spielversion: Geräte mit altem und neuem Brett landen nie im selben Raum
const PREFIX = 'zeitsturm-v2-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
export function normalizeCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5); }
export function makeToken() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function peerAvailable() { return typeof window.Peer === 'function'; }

async function waitForPeerLib() {
  for (let i = 0; i < 50 && !peerAvailable(); i++) await new Promise((r) => setTimeout(r, 100));
  if (!peerAvailable()) throw new Error('peerjs');
}

// ------------------------------------------------------------------ Host
export class HostNet {
  constructor({ code, onMessage, onJoin, onLeave, onStatus }) {
    this.code = code;
    this.onMessage = onMessage;
    this.onJoin = onJoin;
    this.onLeave = onLeave;
    this.onStatus = onStatus || (() => {});
    this.conns = new Map();
    this.closed = false;
    this.attempts = 0;
  }

  async start() {
    await waitForPeerLib();
    return new Promise((resolve, reject) => {
      const peer = (this.peer = new window.Peer(PREFIX + this.code, { debug: 0 }));
      let opened = false;
      peer.on('open', () => { opened = true; this.attempts = 0; this.onStatus('open'); resolve(); });
      peer.on('connection', (conn) => this.accept(conn));
      peer.on('disconnected', () => { if (!this.closed) { this.onStatus('reconnecting'); setTimeout(() => { try { peer.reconnect(); } catch (e) { /* neu versuchen */ } }, 1000); } });
      peer.on('error', (err) => {
        if (!opened) {
          // Nach einem Neuladen ist die alte ID beim Vermittlungsdienst kurz noch belegt – erneut versuchen
          if (err.type === 'unavailable-id' && this.retryTaken && this.attempts++ < 12) {
            peer.destroy();
            setTimeout(() => this.start().then(resolve, reject), 2500);
            return;
          }
          reject(err);
        } else this.onStatus('error', err.type);
      });
    });
  }

  accept(conn) {
    const c = { conn, pid: null, token: null, id: conn.peer };
    conn.on('open', () => { this.conns.set(conn.peer, c); });
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') { this.send(c, { t: 'pong' }); return; }
      if (msg.t === 'hello') { this.onJoin(c, msg); return; }
      this.onMessage(c, msg);
    });
    const gone = () => {
      if (!this.conns.has(conn.peer)) return;
      this.conns.delete(conn.peer);
      this.onLeave(c);
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  clients() { return [...this.conns.values()]; }

  send(c, msg) { try { if (c.conn.open) c.conn.send(msg); } catch (e) { /* Verbindung weg */ } }

  broadcast(msg, except) { for (const c of this.conns.values()) if (c !== except) this.send(c, msg); }

  kick(c, reason) { this.send(c, { t: 'kicked', reason }); setTimeout(() => c.conn.close(), 300); }

  close() {
    this.closed = true;
    for (const c of this.conns.values()) try { c.conn.close(); } catch (e) { /* egal */ }
    try { this.peer?.destroy(); } catch (e) { /* egal */ }
  }
}

// ------------------------------------------------------------------ Client
export class ClientNet {
  constructor({ code, hello, onMessage, onStatus }) {
    this.code = code;
    this.hello = hello;
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.closed = false;
    this.retries = 0;
    this.lastPong = Date.now();
  }

  async connect() {
    await waitForPeerLib();
    if (this.peer && !this.peer.destroyed) { this.openConn(); return; }
    this.onStatus('connecting');
    const peer = (this.peer = new window.Peer({ debug: 0 }));
    peer.on('open', () => this.openConn());
    peer.on('disconnected', () => { if (!this.closed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* egal */ } }, 1000); });
    peer.on('error', (err) => {
      if (this.closed) return;
      if (err.type === 'peer-unavailable') this.retry('host-missing');
      else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') this.retry('network');
      else this.retry(err.type);
    });
  }

  openConn() {
    if (this.closed) return;
    const conn = (this.conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' }));
    conn.on('open', () => {
      this.retries = 0;
      this.lastPong = Date.now();
      this.onStatus('connected');
      conn.send({ t: 'hello', ...this.hello() });
      clearInterval(this.ping);
      this.ping = setInterval(() => {
        try { conn.send({ t: 'ping' }); } catch (e) { /* egal */ }
        if (Date.now() - this.lastPong > 15000) { try { conn.close(); } catch (e) { /* egal */ } }
      }, 4000);
    });
    conn.on('data', (msg) => {
      if (msg?.t === 'pong') { this.lastPong = Date.now(); return; }
      this.onMessage(msg);
    });
    conn.on('close', () => { clearInterval(this.ping); if (!this.closed) this.retry('lost'); });
    conn.on('error', () => { clearInterval(this.ping); if (!this.closed) this.retry('lost'); });
  }

  retry(reason) {
    if (this.closed || this.retryTimer) return;
    this.retries++;
    if (this.retries > 60) { this.onStatus('failed', reason); return; }
    this.onStatus('reconnecting', reason);
    const delay = Math.min(5000, 1200 + this.retries * 400);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.peer && !this.peer.destroyed && !this.peer.disconnected) this.openConn();
      else { try { this.peer?.destroy(); } catch (e) { /* egal */ } this.peer = null; this.connect(); }
    }, delay);
  }

  send(msg) { try { if (this.conn?.open) this.conn.send(msg); } catch (e) { /* offline */ } }
  sendAction(action) { this.send({ t: 'act', action }); }

  close() {
    this.closed = true;
    clearInterval(this.ping);
    clearTimeout(this.retryTimer);
    try { this.conn?.close(); } catch (e) { /* egal */ }
    try { this.peer?.destroy(); } catch (e) { /* egal */ }
  }
}
