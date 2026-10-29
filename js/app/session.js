// Spielsitzung: verbindet Engine, Bots, Rundenzeit, Speicherung und Netzwerk.
// mode 'local'  = Hot-Seat auf einem Gerät (alle Entscheidungen lokal)
// mode 'host'   = Online-Host: rechnet die Partie (Host-Autorität) und verteilt den Zustand
// mode 'client' = Online-Mitspieler: sendet Aktionen, erhält Zustand vom Host
import { applyAction, viewFor, sanitizeEvents, pendingActors } from '../core/engine.js';
import { botAction, timeoutAction } from '../core/bots.js';
import { saveGame } from './prefs.js';

const EXTRA_TIME = { concert: 45, vote: 10, trade: 20, market: 15, post: 10, duelSetup: 10, motion: 10 };

function signature(s) {
  const pd = s.pending || {};
  return [pd.kind, pd.player, pd.qid, pd.stage, pd.motion, pd.from, pd.extraTime, s.turnCount, s.round].join('|');
}

export class Session {
  constructor({ mode, state, humanSeats = [], mySeat = 0, net = null, room = null, tutorial = false }) {
    this.mode = mode;
    this.state = state;
    this.humanSeats = new Set(humanSeats);
    this.mySeat = mySeat;
    this.net = net;
    this.room = room;
    this.tutorial = tutorial;
    this.listeners = new Set();
    this.deadline = 0;
    this.timerTotal = 0;
    this.sig = '';
    this.autoToken = 0;
    this.botDelay = 750;
    this.waitIdle = () => Promise.resolve();
    this.disconnected = new Set();
    this.destroyed = false;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(e) { for (const fn of this.listeners) fn(e); }

  get authoritative() { return this.mode !== 'client'; }

  // Spieler, die auf diesem Gerät bedient werden
  isLocal(pid) {
    if (this.mode === 'client') return pid === this.mySeat;
    if (this.mode === 'host') return pid === this.mySeat;
    return this.humanSeats.has(pid);
  }

  localHumans() { return this.state.players.filter((p) => this.isLocal(p.id)).map((p) => p.id); }

  view() {
    if (this.mode === 'host') return viewFor(this.state, this.mySeat);
    return this.state;
  }

  start() {
    const s = this.state;
    const fresh = s.turnCount === 0 && s.round === 1;
    const events = s.winner != null ? [] : [...(fresh ? [{ type: 'gameStart' }] : []), { type: 'turnStart', player: s.current, round: s.round }];
    this.rearmTimer();
    this.emit({ type: 'update', state: this.view(), events, initial: true });
    this.scheduleAutomation();
  }

  act(action) {
    if (this.destroyed) return { ok: false };
    if (this.mode === 'client') { this.net.sendAction(action); return { ok: true }; }
    return this.apply(action);
  }

  apply(action) {
    if (this.destroyed || this.state.winner != null && action.type !== 'noop') return { ok: false };
    const r = applyAction(this.state, action);
    if (!r.ok) { this.emit({ type: 'error', error: r.error, action }); return r; }
    this.changed(r.events);
    return r;
  }

  changed(events) {
    this.rearmTimer();
    this.persist();
    if (this.mode === 'host') this.broadcast(events);
    this.emit({ type: 'update', state: this.view(), events });
    this.scheduleAutomation();
  }

  // ---------------------------------------------------------------- Bots
  async scheduleAutomation() {
    if (!this.authoritative || this.destroyed || this.state.winner != null) return;
    const token = ++this.autoToken;
    await this.waitIdle();
    if (token !== this.autoToken || this.destroyed) return;
    const s = this.state;
    const bot = pendingActors(s.pending).find((id) => s.players[id].isBot);
    if (bot == null) return;
    const fast = this.botSpeed === 'fast' ? 0.35 : this.botSpeed === 'slow' ? 1.6 : 1;
    await new Promise((r) => setTimeout(r, this.botDelay * fast * (s.pending.kind === 'vote' ? 0.5 : 1)));
    if (token !== this.autoToken || this.destroyed) return;
    if (!pendingActors(this.state.pending).includes(bot)) return;
    const a = botAction(this.state, bot);
    if (a) this.apply(a);
  }

  // ---------------------------------------------------------------- Rundenzeit
  rearmTimer() {
    clearTimeout(this.timerHandle);
    const s = this.state;
    if (!this.authoritative) return;
    const pd = s.pending;
    if (!pd || s.winner != null || pd.kind === 'gameover') { this.deadline = 0; return; }
    const humans = pendingActors(pd).filter((id) => !s.players[id].isBot);
    const base = this.tutorial ? 0 : s.settings.turnTime;
    const offline = humans.some((id) => this.disconnected.has(id));
    const sig = signature(s);
    if (!humans.length || (!base && !offline)) { this.deadline = 0; this.sig = sig; return; }
    if (sig !== this.sig || !this.deadline) {
      const total = (base || 25) + (EXTRA_TIME[pd.kind] || 0) + (pd.extraTime || 0);
      this.timerTotal = total;
      this.deadline = Date.now() + total * 1000;
    }
    this.sig = sig;
    this.timerHandle = setTimeout(() => this.onTimeout(), Math.max(0, this.deadline - Date.now()) + 60);
  }

  onTimeout() {
    if (this.destroyed) return;
    const s = this.state;
    for (const id of pendingActors(s.pending)) {
      if (s.players[id].isBot) continue;
      const a = timeoutAction(s, id);
      if (a) { this.emit({ type: 'timeout', player: id }); this.apply(a); return; }
    }
  }

  timerInfo() { return this.deadline ? { remaining: this.deadline - Date.now(), total: this.timerTotal } : null; }

  // ---------------------------------------------------------------- Netzwerk (Host)
  broadcast(events) {
    if (!this.net) return;
    for (const c of this.net.clients()) {
      if (c.pid == null) continue;
      this.net.send(c, { t: 'state', you: c.pid, view: viewFor(this.state, c.pid), events: sanitizeEvents(events, c.pid), timer: this.timerInfo() });
    }
  }

  sendStateTo(c) {
    if (c.pid == null) return;
    const s = this.state;
    this.net.send(c, { t: 'state', you: c.pid, view: viewFor(s, c.pid), events: s.winner != null ? [] : [{ type: 'turnStart', player: s.current, round: s.round }], timer: this.timerInfo(), full: true });
  }

  setConnected(pid, on) {
    if (on) this.disconnected.delete(pid); else this.disconnected.add(pid);
    if (this.state.players[pid]) this.state.players[pid].offline = !on;
    this.rearmTimer();
    if (this.mode === 'host') this.broadcast([{ type: on ? 'playerBack' : 'playerOffline', player: pid }]);
    this.emit({ type: 'update', state: this.view(), events: [{ type: on ? 'playerBack' : 'playerOffline', player: pid }] });
  }

  // ---------------------------------------------------------------- Netzwerk (Client)
  receive(msg) {
    this.state = msg.view;
    if (msg.you != null) this.mySeat = msg.you;
    this.deadline = msg.timer ? Date.now() + msg.timer.remaining : 0;
    this.timerTotal = msg.timer ? msg.timer.total : 0;
    this.emit({ type: 'update', state: this.state, events: msg.events || [], initial: !!msg.full });
  }

  // ---------------------------------------------------------------- Speichern
  persist() {
    if (this.mode === 'client' || this.tutorial) return;
    saveGame({ mode: this.mode, state: this.state, humanSeats: [...this.humanSeats], mySeat: this.mySeat, room: this.room });
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.timerHandle);
    this.listeners.clear();
  }
}
