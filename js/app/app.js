// App-Steuerung: Bildschirme (Menü, Lobbys), Sitzungen (lokal/Host/Client), Endbildschirm.
import { h, btn, clear, modal, toast, seg, UI, ask, tapFeedback, setFeedback } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { TOPICS, TOPIC_INFO, PLAYER_COLORS, FIGURES, MAX_PLAYERS, EPOCHS } from '../core/constants.js';
import { createGame, ranking, score, starTotal, starColors, awards, BOARD } from '../core/engine.js';
import { BOT_STYLES } from '../core/bots.js';
import { makeSeed } from '../core/rng.js';
import { Session } from './session.js';
import { prefs, savePrefs, loadGame, clearGame, saveOnline, loadOnline, flushSave } from './prefs.js';
import { HostNet, ClientNet, makeCode, normalizeCode, makeToken } from '../net/net.js';
import { GameUI } from '../ui/game.js';
import { colorOf, playerTag } from '../ui/actions.js';
import { FIGURE_ICONS } from '../render/pieces.js';
import { openRules, openSettings, openWhatsNew } from '../ui/info.js';
import { Tutorial } from '../ui/tutorial.js';
import { qrCanvas } from '../ui/qr.js';

const BOT_NAMES = ['Ada', 'Kleo', 'Hypatia', 'Leo', 'Marco', 'Nefertiti', 'Galilei', 'Curie', 'Tesla', 'Ibn Battuta'];
export const APP_VERSION = '2.1';
const QUESTION_EVENTS = new Set(['quiz', 'challengeStep', 'duelStart', 'duelRound']);

export class App {
  constructor({ render, audio }) {
    this.render = render;
    this.audio = audio;
    this.screen = null;
    this.game = null;
    this.session = null;
    this.net = null;
    this.tutorial = null;
    setFeedback(audio, prefs.haptics);
    window.addEventListener('beforeunload', () => flushSave());
    // Android-Zurück-Taste / Wischgeste: erst Dialoge schließen, dann nachfragen statt das Spiel zu verlassen
    window.addEventListener('popstate', () => this.onBack());
  }

  guardBack() {
    if (history.state?.zeitsturm) return;
    history.pushState({ zeitsturm: true }, '');
  }

  async onBack() {
    const backs = document.querySelectorAll('.backdrop');
    if (backs.length) {
      const close = backs[backs.length - 1].querySelector('.modal-head .btn.ghost');
      close?.click();
      if (backs.length > 1 || this.session || this.net || !this.screen?.classList.contains('menu-screen')) this.guardBack();
      return;
    }
    if (this.session) {
      this.guardBack();
      if (await ask(t('menu.leaveConfirm'), t('menu.leave'), t('common.cancel'))) this.leaveGame();
      return;
    }
    if (this.net) {
      this.guardBack();
      if (await ask(t('lobby.closeConfirm'), t('common.yes'), t('common.no'))) { saveOnline(null); this.showMenu(); }
      return;
    }
    if (this.screen && !this.screen.classList.contains('menu-screen')) this.showMenu();
  }

  // Fragen-Gedächtnis: gestellte Fragen auf diesem Gerät merken (kommen in späteren Partien seltener)
  rememberQuestions(events) {
    let changed = false;
    for (const e of events) {
      if (!QUESTION_EVENTS.has(e.type) || !e.qid || prefs.seenQuestions.includes(e.qid)) continue;
      prefs.seenQuestions.push(e.qid);
      changed = true;
    }
    if (!changed) return;
    if (prefs.seenQuestions.length > 600) prefs.seenQuestions.splice(0, prefs.seenQuestions.length - 600);
    clearTimeout(this.seenTimer);
    this.seenTimer = setTimeout(savePrefs, 3000);
  }

  // ------------------------------------------------------------------ Bildschirm-Wechsel
  setScreen(el) {
    this.screen?.remove();
    this.screen = el;
    if (el) UI().appendChild(el);
    if (el && !el.classList.contains('menu-screen')) this.guardBack();
  }

  menuCamera() {
    const w = this.render.world;
    w.overview();
    w.controls.autoRotate = true;
    w.controls.autoRotateSpeed = 0.35;
  }

  showMenu() {
    this.teardown();
    this.menuCamera();
    this.audio.startMusic('hub');
    const save = loadGame();
    const online = loadOnline();
    const params = new URLSearchParams(location.search);
    const room = normalizeCode(params.get('room'));
    if (room) history.replaceState(null, '', location.pathname);
    const el = h('div', { class: 'screen clear menu-screen' }, h('div', { class: 'screen-inner' },
      h('div', { class: 'logo' }, 'ZEITSTURM'),
      h('p', { class: 'tagline' }, t('menu.tagline')),
      !prefs.tutorialSeen && !save?.state ? h('div', { class: 'card tight row' },
        h('span', { style: { fontSize: '26px' } }, '🎓'),
        h('div', { class: 'grow small' }, h('b', {}, t('menu.newHere')), h('div', { class: 'muted' }, t('menu.newHereText'))),
        btn(t('menu.tutorialShort'), () => this.startTutorial(), 'small primary')) : null,
      save?.state && save.state.winner == null ? btn(['▶ ', t('menu.resume', { round: save.state.round })], () => this.resume(save), 'primary big block') : null,
      online && !save?.state ? btn(['🔁 ', t('menu.rejoin', { code: online.code })], () => this.join(online.code, online.name, online.token), 'primary big block') : null,
      btn(['👥 ', t('menu.local')], () => this.showLocalSetup(), save?.state ? 'big block' : 'primary big block'),
      btn(['🌐 ', t('menu.online')], () => this.showOnline(room), 'big block'),
      prefs.tutorialSeen || save?.state ? btn(['🎓 ', t('menu.tutorial')], () => this.startTutorial(), 'big block') : null,
      h('div', { class: 'grid2' },
        btn(['❔ ', t('menu.rules')], () => this.openRules(), 'block'),
        btn(['⚙ ', t('menu.settings')], () => this.openSettings(), 'block')),
      document.fullscreenEnabled ? btn(['⛶ ', t('menu.fullscreen')], () => this.toggleFullscreen(), 'ghost block') : null,
      (this.installSlot = h('div', { class: 'col' }, this.installPrompt ? btn(['📲 ', t('menu.install')], () => this.install(), 'ghost block') : null)),
      h('p', { class: 'muted small center' }, t('menu.footer')),
      h('p', { class: 'muted small center' }, `Version ${APP_VERSION} · `, h('a', { href: '#', style: { color: 'var(--accent)' }, onClick: (e) => { e.preventDefault(); openWhatsNew(); } }, t('menu.whatsNew')))));
    this.setScreen(el);
    if (room) this.showOnline(room);
  }

  teardown() {
    this.game?.destroy(); this.game = null;
    this.session?.destroy(); this.session = null;
    this.net?.close(); this.net = null;
    this.tutorial?.destroy(); this.tutorial = null;
    this.endEl?.remove(); this.endEl = null;
    this.lobbyState = null;
    this.render.world.controls.autoRotate = false;
    if (this.render.effects.podiumGroup) { this.render.world.scene.remove(this.render.effects.podiumGroup); this.render.effects.podiumGroup = null; }
    this.render.pieces.setup([], colorOf);
    this.render.board.clearHighlight();
    this.render.board.syncMods({ blocked: [], opened: [], removed: [], recolor: {} }, (id) => BOARD.nodes[id].topic);
    this.render.effects.setStorm(false);
    document.querySelectorAll('.backdrop, .curtain, .coach').forEach((e) => e.remove());
  }

  // ------------------------------------------------------------------ Lokales Spiel (Hot-Seat)
  showLocalSetup() {
    const seats = [
      { kind: 'human', name: prefs.name || t('setup.player', { n: 1 }), color: prefs.color, figure: prefs.figure, style: 'scholar' },
      { kind: 'bot', name: BOT_NAMES[0], color: PLAYER_COLORS.find((c) => c.id !== prefs.color).id, figure: FIGURES.find((f) => f !== prefs.figure), style: 'scholar' },
    ];
    const cfg = { maxRounds: prefs.maxRounds, turnTime: prefs.turnTime, difficulty: prefs.difficulty, botLevel: prefs.botLevel, topics: [...prefs.topics] };
    const body = h('div', { class: 'col' });
    const render = () => {
      clear(body);
      seats.forEach((st, i) => body.appendChild(seatEditor(st, i, seats, render, { removable: seats.length > 2, kindToggle: true })));
      if (seats.length < MAX_PLAYERS) {
        body.appendChild(h('div', { class: 'grid2' },
          btn(['＋ ', t('setup.addHuman')], () => { seats.push(newSeat(seats, 'human')); render(); }, 'block ghost'),
          btn(['＋ ', t('setup.addBot')], () => { seats.push(newSeat(seats, 'bot')); render(); }, 'block ghost')));
      }
      body.appendChild(settingsEditor(cfg));
      body.appendChild(btn(['🚀 ', t('setup.start')], () => {
        const human = seats.find((s) => s.kind === 'human');
        if (human) { prefs.name = human.name; prefs.color = human.color; prefs.figure = human.figure; }
        Object.assign(prefs, { maxRounds: cfg.maxRounds, turnTime: cfg.turnTime, difficulty: cfg.difficulty, botLevel: cfg.botLevel, topics: cfg.topics });
        savePrefs();
        this.startLocal(seats, cfg);
      }, 'primary big block'));
    };
    render();
    this.setScreen(h('div', { class: 'screen' }, h('div', { class: 'screen-inner' },
      h('div', { class: 'row' }, btn('←', () => this.showMenu(), 'icon-btn ghost', { 'aria-label': t('common.back') }), h('h2', { class: 'title' }, t('setup.title'))),
      body)));
  }

  startLocal(seats, cfg, { tutorial = false } = {}) {
    this.teardown();
    clearGame();
    const players = seats.map((s) => ({ name: s.name.trim() || '?', color: s.color, figure: s.figure, isBot: s.kind === 'bot', style: s.style }));
    const state = createGame({ players, seed: tutorial ? 20251 : makeSeed(), settings: { ...cfg, stormRound: Math.round(cfg.maxRounds * 2 / 3) }, avoid: prefs.seenQuestions });
    const humanSeats = seats.map((s, i) => (s.kind === 'human' ? i : -1)).filter((i) => i >= 0);
    this.lastLocal = { seats, cfg };
    this.launch(new Session({ mode: 'local', state, humanSeats, tutorial }));
  }

  launch(session) {
    this.setScreen(null);
    this.session = session;
    session.botSpeed = prefs.botSpeed;
    session.on((e) => { if (e.type === 'update') this.rememberQuestions(e.events); });
    this.render.world.controls.autoRotate = false;
    this.game = new GameUI(this, session);
    session.start();
    this.guardBack();
    this.requestWakeLock();
  }

  resume(save) {
    if (save.mode === 'host' && save.room) { this.resumeHost(save); return; }
    this.teardown();
    this.launch(new Session({ mode: 'local', state: save.state, humanSeats: save.humanSeats }));
    toast(t('menu.resumed'), 'good');
  }

  startTutorial() {
    const seats = [
      { kind: 'human', name: prefs.name || t('setup.you'), color: prefs.color, figure: prefs.figure, style: 'scholar' },
      { kind: 'bot', name: t('tutorial.botName'), color: PLAYER_COLORS.find((c) => c.id !== prefs.color).id, figure: FIGURES.find((f) => f !== prefs.figure), style: 'scholar' },
    ];
    this.startLocal(seats, { maxRounds: 12, turnTime: 0, difficulty: 'leicht', topics: [...TOPICS] }, { tutorial: true });
    this.tutorial = new Tutorial(this);
    prefs.tutorialSeen = true; savePrefs();
  }

  leaveGame() {
    if (this.session?.mode === 'client') saveOnline(null);
    flushSave();
    this.releaseWakeLock();
    this.showMenu();
  }

  // ------------------------------------------------------------------ Online
  showOnline(prefill = '') {
    const nameIn = h('input', { class: 'input', maxlength: '16', value: prefs.name || '', placeholder: t('setup.namePh'), autocomplete: 'nickname' });
    const codeIn = h('input', { class: 'input code', maxlength: '5', value: prefill, placeholder: 'ABCDE', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
    codeIn.addEventListener('input', () => { codeIn.value = normalizeCode(codeIn.value); });
    const name = () => { const n = nameIn.value.trim() || t('setup.player', { n: 1 }); prefs.name = n; savePrefs(); return n; };
    this.setScreen(h('div', { class: 'screen' }, h('div', { class: 'screen-inner' },
      h('div', { class: 'row' }, btn('←', () => this.showMenu(), 'icon-btn ghost', { 'aria-label': t('common.back') }), h('h2', { class: 'title' }, t('online.title'))),
      h('div', { class: 'card col' }, h('div', { class: 'field' }, h('label', {}, t('setup.name')), nameIn)),
      h('div', { class: 'card col' },
        h('h3', {}, t('online.host')), h('div', { class: 'muted small' }, t('online.hostInfo')),
        btn(['✨ ', t('online.create')], () => this.hostLobby(name()), 'primary big block')),
      h('div', { class: 'card col' },
        h('h3', {}, t('online.join')), h('div', { class: 'field' }, h('label', {}, t('online.code')), codeIn),
        btn(['🔗 ', t('online.joinBtn')], () => {
          const c = normalizeCode(codeIn.value);
          if (c.length !== 5) { toast(t('online.badCode'), 'bad'); return; }
          this.join(c, name());
        }, 'big block')),
      h('p', { class: 'muted small' }, t('online.note')))));
  }

  // ---------------- Host
  async hostLobby(name, reuse = null) {
    this.teardown();
    this.setScreen(h('div', { class: 'screen' }, h('div', { class: 'screen-inner' }, h('div', { class: 'logo', style: { fontSize: '28px' } }, t('online.creating')), h('div', { class: 'boot-ring', style: { margin: '0 auto' } }))));
    const lobby = reuse || {
      code: makeCode(),
      settings: { maxRounds: prefs.maxRounds, turnTime: prefs.turnTime, difficulty: prefs.difficulty, botLevel: prefs.botLevel, topics: [...prefs.topics] },
      seats: [
        { kind: 'human', name, color: prefs.color, figure: prefs.figure, ready: true, host: true, token: makeToken(), connected: true },
        { kind: 'open' }, { kind: 'open' }, { kind: 'open' },
      ],
    };
    this.lobbyState = lobby;
    const net = (this.net = new HostNet({
      code: lobby.code,
      onJoin: (c, msg) => this.hostOnJoin(c, msg),
      onLeave: (c) => this.hostOnLeave(c),
      onMessage: (c, msg) => this.hostOnMessage(c, msg),
      onStatus: (st) => { if (st === 'reconnecting') toast(t('online.serverReconnect'), 'bad'); },
    }));
    try {
      await net.start();
    } catch (err) {
      if (err?.type === 'unavailable-id' && !reuse) { lobby.code = makeCode(); net.close(); return this.hostLobby(name, lobby); }
      toast(t('online.failed'), 'bad');
      console.error(err);
      this.showOnline();
      return;
    }
    this.renderHostLobby();
  }

  publicLobby() {
    const L = this.lobbyState;
    return { code: L.code, settings: L.settings, seats: L.seats.map((s) => ({ ...s, token: undefined })) };
  }

  pushLobby() {
    if (!this.net) return;
    for (const c of this.net.clients()) this.net.send(c, { t: 'lobby', lobby: this.publicLobby(), you: c.seat });
    if (!this.session) this.renderHostLobby();
  }

  hostOnJoin(c, msg) {
    const L = this.lobbyState;
    // Wiederbeitritt per Token
    const known = L.seats.findIndex((s) => s.token && s.token === msg.token);
    if (known >= 0) {
      const seat = L.seats[known];
      seat.connected = true; c.seat = known; c.pid = seat.pid ?? null; c.token = seat.token;
      this.net.send(c, { t: 'welcome', seat: known, token: seat.token, code: L.code });
      if (this.session) {
        this.session.setConnected(c.pid, true);
        this.session.sendStateTo(c);
      } else this.pushLobby();
      return;
    }
    if (this.session) { this.net.kick(c, 'running'); return; }
    const free = L.seats.findIndex((s) => s.kind === 'open');
    if (free < 0) { this.net.kick(c, 'full'); return; }
    const taken = new Set(L.seats.filter((s) => s.kind !== 'open').map((s) => s.color));
    const takenF = new Set(L.seats.filter((s) => s.kind !== 'open').map((s) => s.figure));
    const token = makeToken();
    L.seats[free] = {
      kind: 'human', name: String(msg.name || '?').slice(0, 16), ready: false, token, connected: true,
      color: taken.has(msg.color) || !msg.color ? PLAYER_COLORS.find((x) => !taken.has(x.id)).id : msg.color,
      figure: FIGURES.find((f) => !takenF.has(f)) || FIGURES[0],
    };
    c.seat = free; c.token = token;
    this.net.send(c, { t: 'welcome', seat: free, token, code: L.code });
    this.audio.sfx('turn');
    toast(t('online.joined', { name: L.seats[free].name }), 'good');
    this.pushLobby();
  }

  hostOnLeave(c) {
    const L = this.lobbyState;
    if (c.seat == null || !L) return;
    const seat = L.seats[c.seat];
    if (this.session) {
      seat.connected = false;
      if (c.pid != null) this.session.setConnected(c.pid, false);
    } else {
      L.seats[c.seat] = { kind: 'open' };
      this.pushLobby();
    }
  }

  hostOnMessage(c, msg) {
    const L = this.lobbyState;
    if (c.seat == null) return;
    if (msg.t === 'seat' && !this.session) {
      const seat = L.seats[c.seat];
      const p = msg.patch || {};
      if (typeof p.name === 'string') seat.name = p.name.slice(0, 16) || seat.name;
      if (p.color && !L.seats.some((s, i) => i !== c.seat && s.kind !== 'open' && s.color === p.color)) seat.color = p.color;
      if (p.figure && FIGURES.includes(p.figure)) seat.figure = p.figure;
      if (typeof p.ready === 'boolean') seat.ready = p.ready;
      this.pushLobby();
    } else if (msg.t === 'act' && this.session) {
      if (msg.action?.player !== c.pid) return;
      const r = this.session.apply(msg.action);
      if (!r.ok) this.net.send(c, { t: 'error', error: r.error });
    } else if (msg.t === 'chat') {
      const seat = L.seats[c.seat];
      this.relayChat({ name: seat.name, color: PLAYER_COLORS.find((x) => x.id === seat.color)?.hex, text: String(msg.text || '').slice(0, 160) });
    } else if (msg.t === 'emoji' && c.pid != null) {
      this.relayEmoji(c.pid, String(msg.e || '').slice(0, 4));
    }
  }

  relayChat(m) {
    this.net?.broadcast({ t: 'chat', ...m });
    this.game?.addChat(m);
    if (!this.game) toast(`💬 ${m.name}: ${m.text}`);
  }
  relayEmoji(pid, e) {
    this.net?.broadcast({ t: 'emoji', pid, e });
    this.game?.showEmoji(pid, e);
  }

  sendChat(text) {
    if (!this.session) return;
    if (this.session.mode === 'host') {
      const me = this.lobbyState.seats[0];
      this.relayChat({ name: me.name, color: PLAYER_COLORS.find((x) => x.id === me.color)?.hex, text });
    } else this.net?.send({ t: 'chat', text });
  }
  sendEmoji(e) {
    if (!this.session) return;
    if (this.session.mode === 'host') this.relayEmoji(this.session.mySeat, e);
    else this.net?.send({ t: 'emoji', e });
  }

  renderHostLobby() {
    const L = this.lobbyState;
    const body = h('div', { class: 'col' });
    const shareUrl = `${location.origin}${location.pathname}?room=${L.code}`;
    body.appendChild(h('div', { class: 'card col center' },
      h('div', { class: 'muted small' }, t('lobby.code')),
      h('div', { class: 'roomcode' }, L.code),
      h('div', { class: 'qr-wrap' }, this.qrFor(shareUrl), h('div', { class: 'muted small' }, '📱 ', t('lobby.scan'))),
      h('div', { class: 'grid2' },
        btn(['📋 ', t('lobby.copy')], async () => { try { await navigator.clipboard.writeText(shareUrl); toast(t('lobby.copied'), 'good'); } catch (e) { toast(shareUrl); } }, 'ghost'),
        navigator.share ? btn(['📤 ', t('lobby.share')], () => navigator.share({ title: 'ZEITSTURM', text: t('lobby.shareText', { code: L.code }), url: shareUrl }).catch(() => {}), 'ghost') : null)));
    L.seats.forEach((st, i) => {
      if (st.kind === 'open') {
        body.appendChild(h('div', { class: 'seat' }, h('div', { class: 'seat-head' }, h('span', { class: 'seat-badge', style: { background: 'rgba(255,255,255,.1)', color: '#fff' } }, String(i + 1)), h('span', { class: 'muted grow' }, t('lobby.open'))),
          btn(['🤖 ', t('setup.addBot')], () => { L.seats[i] = newSeat(L.seats.filter((x) => x.kind !== 'open'), 'bot'); L.seats[i].ready = true; this.pushLobby(); }, 'small ghost')));
      } else if (i === 0) {
        body.appendChild(seatEditor(st, 0, L.seats, () => this.pushLobby(), { removable: false, local: true, hostSelf: true }));
      } else if (st.kind === 'bot') {
        body.appendChild(seatEditor(st, i, L.seats, () => this.pushLobby(), { removable: true, local: true, onRemove: () => { L.seats[i] = { kind: 'open' }; this.pushLobby(); } }));
      } else {
        const c = PLAYER_COLORS.find((x) => x.id === st.color) || PLAYER_COLORS[0];
        body.appendChild(h('div', { class: 'seat' }, h('div', { class: 'seat-head' },
          h('span', { class: 'seat-badge', style: { background: c.hex } }, c.symbol),
          h('b', { class: 'grow' }, st.name, ' ', FIGURE_ICONS[st.figure] || ''),
          h('span', { class: st.ready ? 'ready' : 'notready' }, st.ready ? t('lobby.ready') : t('lobby.notReady')),
          btn('✕', () => { const cl = this.net.clients().find((x) => x.seat === i); if (cl) this.net.kick(cl, 'kicked'); L.seats[i] = { kind: 'open' }; this.pushLobby(); }, 'small ghost icon-btn', { 'aria-label': t('lobby.kick') }))));
      }
    });
    body.appendChild(settingsEditor(L.settings, () => this.pushLobby()));
    const filled = L.seats.filter((s) => s.kind !== 'open');
    const ready = filled.length >= 2 && filled.every((s) => s.kind === 'bot' || s.ready);
    body.appendChild(btn(['🚀 ', t('lobby.start')], () => this.hostStart(), 'primary big block', { disabled: !ready }));
    if (!ready) body.appendChild(h('div', { class: 'muted small center' }, t('lobby.needReady')));
    this.setScreen(h('div', { class: 'screen' }, h('div', { class: 'screen-inner' },
      h('div', { class: 'row' }, btn('←', async () => { if (await ask(t('lobby.closeConfirm'), t('common.yes'), t('common.no'))) this.showMenu(); }, 'icon-btn ghost', { 'aria-label': t('common.back') }), h('h2', { class: 'title' }, t('lobby.title'))),
      body)));
  }

  hostStart() {
    const L = this.lobbyState;
    const seats = L.seats.filter((s) => s.kind !== 'open');
    seats.forEach((s, pid) => { s.pid = pid; });
    const players = seats.map((s) => ({ name: s.name, color: s.color, figure: s.figure, isBot: s.kind === 'bot', style: s.style }));
    const state = createGame({ players, seed: makeSeed(), settings: { ...L.settings, stormRound: Math.round(L.settings.maxRounds * 2 / 3) }, avoid: prefs.seenQuestions });
    for (const c of this.net.clients()) { c.pid = L.seats[c.seat]?.pid ?? null; }
    const room = { code: L.code, seats: L.seats.map((s) => ({ kind: s.kind, token: s.token, pid: s.pid, name: s.name, color: s.color, figure: s.figure, style: s.style })) };
    clearGame();
    const session = new Session({ mode: 'host', state, mySeat: 0, net: this.net, room });
    this.net.broadcast({ t: 'start' });
    this.launch(session);
    session.broadcast([{ type: 'gameStart' }]);
  }

  async resumeHost(save) {
    this.teardown();
    const L = (this.lobbyState = {
      code: save.room.code,
      settings: save.state.settings,
      seats: save.room.seats.map((s) => ({ ...s, connected: s.kind !== 'human', ready: true })),
    });
    L.seats[0].connected = true;
    this.setScreen(h('div', { class: 'screen' }, h('div', { class: 'screen-inner' }, h('div', { class: 'logo', style: { fontSize: '26px' } }, t('online.reopening', { code: L.code })), h('div', { class: 'boot-ring', style: { margin: '0 auto' } }))));
    const net = (this.net = new HostNet({
      code: L.code,
      onJoin: (c, msg) => this.hostOnJoin(c, msg),
      onLeave: (c) => this.hostOnLeave(c),
      onMessage: (c, msg) => this.hostOnMessage(c, msg),
    }));
    net.retryTaken = true;
    try { await net.start(); } catch (err) { toast(t('online.failed'), 'bad'); this.showMenu(); return; }
    const session = new Session({ mode: 'host', state: save.state, mySeat: 0, net, room: save.room });
    this.launch(session);
    L.seats.forEach((s) => { if (s.kind === 'human' && !s.host && s.pid != null) session.setConnected(s.pid, false); });
    toast(t('online.reopened', { code: L.code }), 'good');
  }

  // ---------------- Client
  join(code, name, token = null) {
    this.teardown();
    const saved = loadOnline();
    let myToken = token || (saved && saved.code === code ? saved.token : null);
    const status = h('div', { class: 'muted center' }, t('online.connecting'));
    this.setScreen(h('div', { class: 'screen' }, h('div', { class: 'screen-inner' },
      h('div', { class: 'row' }, btn('←', () => { saveOnline(null); this.showMenu(); }, 'icon-btn ghost'), h('h2', { class: 'title' }, t('online.joinTitle', { code }))),
      h('div', { class: 'boot-ring', style: { margin: '20px auto' } }), status)));
    const net = (this.net = new ClientNet({
      code,
      hello: () => ({ name, token: myToken, color: prefs.color }),
      onStatus: (st) => {
        if (st === 'connected') { this.netLost?.remove(); this.netLost = null; }
        if (st === 'reconnecting' || st === 'connecting') {
          if (this.session) this.showNetLost(); else status.textContent = t('online.connecting');
        }
        if (st === 'failed') { toast(t('online.failed'), 'bad'); this.netLost?.remove(); this.netLost = null; this.showMenu(); }
      },
      onMessage: (msg) => {
        if (msg.t === 'welcome') { myToken = msg.token; this.mySeatIdx = msg.seat; saveOnline({ code, token: msg.token, name }); }
        else if (msg.t === 'lobby' && !this.session) this.renderClientLobby(msg.lobby, msg.you);
        else if (msg.t === 'start') toast(t('online.starting'), 'good');
        else if (msg.t === 'state') this.clientState(msg);
        else if (msg.t === 'chat') { this.game?.addChat(msg); if (!this.game) toast(`💬 ${msg.name}: ${msg.text}`); }
        else if (msg.t === 'emoji') this.game?.showEmoji(msg.pid, msg.e);
        else if (msg.t === 'error') toast(t('err.action'), 'bad');
        else if (msg.t === 'kicked') { saveOnline(null); toast(t(`online.kicked.${msg.reason}`), 'bad'); this.showMenu(); }
      },
    }));
    net.connect().catch(() => { toast(t('online.noPeer'), 'bad'); this.showMenu(); });
  }

  showNetLost() {
    if (this.netLost) return;
    this.netLost = h('div', { class: 'toasts', style: { top: 'calc(110px + var(--safe-t))' } }, h('div', { class: 'toast bad', style: { animation: 'none' } }, '📡 ', t('online.lost')));
    UI().appendChild(this.netLost);
  }

  clientState(msg) {
    if (!this.session) {
      const session = new Session({ mode: 'client', state: msg.view, mySeat: msg.you, net: this.net });
      this.launch(session);
      session.receive({ ...msg, full: true });
      return;
    }
    this.session.receive(msg);
  }

  renderClientLobby(lobby, you) {
    const body = h('div', { class: 'col' });
    const mine = lobby.seats[you];
    body.appendChild(h('div', { class: 'card col center' }, h('div', { class: 'muted small' }, t('lobby.code')), h('div', { class: 'roomcode' }, lobby.code)));
    lobby.seats.forEach((st, i) => {
      if (st.kind === 'open') { body.appendChild(h('div', { class: 'seat' }, h('div', { class: 'seat-head' }, h('span', { class: 'seat-badge', style: { background: 'rgba(255,255,255,.1)', color: '#fff' } }, String(i + 1)), h('span', { class: 'muted' }, t('lobby.open'))))); return; }
      if (i === you) {
        const send = (patch) => this.net.send({ t: 'seat', patch });
        body.appendChild(seatEditor({ ...st }, i, lobby.seats, null, { removable: false, local: true, remote: send, readyToggle: true }));
        return;
      }
      const c = PLAYER_COLORS.find((x) => x.id === st.color) || PLAYER_COLORS[0];
      body.appendChild(h('div', { class: 'seat' }, h('div', { class: 'seat-head' },
        h('span', { class: 'seat-badge', style: { background: c.hex } }, c.symbol),
        h('b', { class: 'grow' }, st.name, st.kind === 'bot' ? ' 🤖' : '', st.host ? ` (${t('lobby.host')})` : '', ' ', FIGURE_ICONS[st.figure] || ''),
        st.kind === 'human' ? h('span', { class: st.ready ? 'ready' : 'notready' }, st.ready ? t('lobby.ready') : t('lobby.notReady')) : null)));
    });
    body.appendChild(h('div', { class: 'card col small' }, h('b', {}, t('lobby.settings')),
      h('div', {}, t('lobby.settingsLine', { rounds: lobby.settings.maxRounds, time: lobby.settings.turnTime ? `${lobby.settings.turnTime}s` : t('set.off'), diff: t(`diff.${lobby.settings.difficulty}`) })),
      h('div', {}, lobby.settings.topics.map((tp) => TOPIC_INFO[tp].icon).join(' '))));
    body.appendChild(h('div', { class: 'muted center' }, mine?.ready ? t('lobby.waitHost') : t('lobby.pressReady')));
    if (mine) { prefs.color = mine.color; prefs.figure = mine.figure; savePrefs(); }
    this.setScreen(h('div', { class: 'screen' }, h('div', { class: 'screen-inner' },
      h('div', { class: 'row' }, btn('←', () => { saveOnline(null); this.showMenu(); }, 'icon-btn ghost'), h('h2', { class: 'title' }, t('lobby.title'))), body)));
  }

  // ------------------------------------------------------------------ Spielende
  showEnd(s, gameUI) {
    if (this.endEl) return;
    clearGame();
    if (this.session?.mode === 'client') saveOnline(null);
    const rk = ranking(s);
    const winner = s.players[s.winner];
    this.render.effects.podium(rk.map((p) => p.id), this.render.pieces);
    this.render.effects.setStorm(false);
    this.audio.startMusic('zukunft');
    this.audio.setTension(0.2);
    const aw = awards(s);
    const awardEl = Object.entries(aw).filter(([, ids]) => ids.length).map(([key, ids]) => h('div', { class: 'award' },
      h('div', { class: 'a-ico' }, t(`award.${key}.icon`)), h('div', { class: 'a-name' }, t(`award.${key}.name`)),
      h('div', { class: 'a-who' }, ids.map((id) => s.players[id].name).join(', '))));
    const rows = rk.map((p, i) => h('div', { class: 'rank-row' },
      h('span', { class: 'r' }, `${i + 1}.`), playerTag(p), h('span', { class: 'grow' }),
      h('span', { class: 'small muted' }, `${starColors(p)}🎨 ${starTotal(p)}⭐ ${p.fragments}⧗ ${p.influence}◆`),
      h('b', {}, ` ${score(p)}`)));
    const canAgain = this.session?.mode === 'local' && !this.session.tutorial;
    const panel = h('div', { class: 'dock-card', style: { maxHeight: '50dvh' } },
      h('div', { class: 'verdict ok' }, '🏆 ', t('end.winner', { name: winner.name })),
      h('div', { class: 'muted center' }, t(`end.type.${s.winType}`)),
      h('h3', {}, t('end.ranking')), rows,
      h('h3', {}, t('end.awards')), h('div', { class: 'awards' }, awardEl),
      h('div', { class: 'spacer' }),
      h('div', { class: canAgain ? 'grid2' : '' },
        canAgain ? btn(['🔁 ', t('end.again')], () => this.startLocal(this.lastLocal.seats, this.lastLocal.cfg), 'primary') : null,
        btn(['🏠 ', t('end.menu')], () => this.leaveGame(), canAgain ? 'ghost' : 'primary block')));
    this.endEl = h('div', { class: 'dock', style: { zIndex: 20 } }, panel);
    UI().appendChild(this.endEl);
    gameUI.root.querySelector('.dock')?.classList.add('hidden');
  }

  // ------------------------------------------------------------------ Sonstiges
  prefsBotSpeed() { return prefs.botSpeed; }
  reducedMotion() { return !!prefs.reduceMotion; }

  qrFor(url) {
    try { const c = qrCanvas(url, 240); c.className = 'qr'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', t('lobby.scan')); return c; }
    catch (e) { return null; }
  }

  openRules() { openRules(); }
  openSettings() { openSettings(this); }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => screen.orientation?.unlock?.()).catch(() => {});
  }

  async requestWakeLock() {
    try { if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* nicht verfügbar */ }
    if (!this.wakeBound) {
      this.wakeBound = true;
      document.addEventListener('visibilitychange', () => { if (!document.hidden && this.session && (!this.wakeLock || this.wakeLock.released)) this.requestWakeLock(); });
    }
  }
  releaseWakeLock() { try { this.wakeLock?.release(); } catch (e) { /* egal */ } this.wakeLock = null; }

  // Der Browser bietet die Installation an: Button nur einfügen, Menü nicht neu aufbauen
  offerInstall(prompt) {
    this.installPrompt = prompt;
    if (this.installSlot?.isConnected && !this.installSlot.children.length) this.installSlot.appendChild(btn(['📲 ', t('menu.install')], () => this.install(), 'ghost block'));
  }

  async install() {
    if (!this.installPrompt) return;
    this.installPrompt.prompt();
    await this.installPrompt.userChoice.catch(() => {});
    this.installPrompt = null;
    this.installSlot?.replaceChildren();
  }
}

// ------------------------------------------------------------------ Bausteine für Lobbys
function newSeat(seats, kind) {
  const used = new Set(seats.map((s) => s.color));
  const usedF = new Set(seats.map((s) => s.figure));
  const usedN = new Set(seats.map((s) => s.name));
  const humans = seats.filter((s) => s.kind === 'human').length;
  return {
    kind,
    name: kind === 'bot' ? BOT_NAMES.find((n) => !usedN.has(n)) : t('setup.player', { n: humans + 1 }),
    color: PLAYER_COLORS.find((c) => !used.has(c.id)).id,
    figure: FIGURES.find((f) => !usedF.has(f)) || FIGURES[0],
    style: BOT_STYLES[seats.length % 3],
  };
}

function seatEditor(st, i, seats, onChange, { removable, remote, readyToggle, onRemove, hostSelf, kindToggle } = {}) {
  const c = PLAYER_COLORS.find((x) => x.id === st.color) || PLAYER_COLORS[0];
  const update = (patch) => { Object.assign(st, patch); if (remote) remote(patch); onChange?.(); };
  const box = h('div', { class: 'seat' });
  const head = h('div', { class: 'seat-head' },
    h('span', { class: 'seat-badge', style: { background: c.hex } }, c.symbol),
    st.kind === 'bot' ? h('b', { class: 'grow' }, '🤖 ', st.name) : h('input', {
      class: 'input grow', maxlength: '16', value: st.name, 'aria-label': t('setup.name'),
      onChange: (e) => update({ name: e.target.value.trim() || st.name }),
    }),
    hostSelf ? h('span', { class: 'badge' }, t('lobby.host')) : null,
    removable ? btn('✕', () => { if (onRemove) onRemove(); else { seats.splice(i, 1); onChange?.(); } }, 'small ghost icon-btn', { 'aria-label': t('setup.remove') }) : null);
  box.appendChild(head);
  if (kindToggle) {
    box.appendChild(seg([{ value: 'human', label: '🧑 ' + t('setup.human') }, { value: 'bot', label: '🤖 ' + t('setup.bot') }], st.kind, (v) => {
      st.kind = v;
      if (v === 'bot') st.name = BOT_NAMES.find((n) => !seats.some((s) => s.name === n)) || 'Bot';
      onChange();
    }));
  }
  if (st.kind === 'bot') {
    box.appendChild(seg(BOT_STYLES.map((s) => ({ value: s, label: t(`style.${s}`) })), st.style, (v) => { st.style = v; onChange?.(); }));
  }
  const taken = new Set(seats.filter((s, k) => k !== i && s.kind !== 'open').map((s) => s.color));
  box.appendChild(h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('setup.color') }, PLAYER_COLORS.map((pc) => h('button', {
    type: 'button', class: `swatch ${pc.id === st.color ? 'on' : ''} ${taken.has(pc.id) ? 'taken' : ''}`, style: { background: pc.hex }, 'aria-label': pc.id,
    onClick: () => { tapFeedback(); update({ color: pc.id }); if (remote) { box.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on')); } },
  }, pc.symbol))));
  box.appendChild(h('div', { class: 'figs' }, FIGURES.map((f) => h('button', {
    type: 'button', class: `fig ${f === st.figure ? 'on' : ''}`,
    onClick: () => { tapFeedback(); update({ figure: f }); if (remote) { box.querySelectorAll('.fig').forEach((x) => x.classList.toggle('on', x.dataset.f === f)); } },
    dataset: { f },
  }, h('span', { class: 'f-ico' }, FIGURE_ICONS[f]), t(`figure.${f}`)))));
  if (readyToggle) {
    box.appendChild(btn(st.ready ? ['✔ ', t('lobby.imReady')] : t('lobby.setReady'), () => update({ ready: !st.ready }), st.ready ? 'good block' : 'primary block big'));
  }
  return box;
}

function settingsEditor(cfg, onChange) {
  const ch = () => onChange?.();
  const topics = h('div', { class: 'row wrap' });
  const renderTopics = () => {
    clear(topics);
    TOPICS.forEach((tp) => topics.appendChild(h('button', {
      type: 'button', class: `toggle-chip ${cfg.topics.includes(tp) ? 'on' : ''}`,
      onClick: () => {
        tapFeedback();
        if (cfg.topics.includes(tp)) { if (cfg.topics.length > 3) cfg.topics = cfg.topics.filter((x) => x !== tp); else toast(t('setup.minTopics'), 'bad'); }
        else cfg.topics = [...cfg.topics, tp];
        renderTopics(); ch();
      },
    }, TOPIC_INFO[tp].icon, ' ', t(`topic.${tp}`))));
  };
  renderTopics();
  return h('div', { class: 'card col' },
    h('h3', {}, t('setup.rules')),
    h('div', { class: 'field' }, h('label', {}, t('set.rounds')), seg([15, 20, 30].map((n) => ({ value: n, label: String(n) })), cfg.maxRounds, (v) => { cfg.maxRounds = v; ch(); })),
    h('div', { class: 'field' }, h('label', {}, t('set.turnTime')), seg([0, 60, 90, 120].map((n) => ({ value: n, label: n ? `${n}s` : t('set.off') })), cfg.turnTime, (v) => { cfg.turnTime = v; ch(); })),
    h('div', { class: 'field' }, h('label', {}, t('set.difficulty')), seg(['leicht', 'normal', 'schwer'].map((d) => ({ value: d, label: t(`diff.${d}`) })), cfg.difficulty, (v) => { cfg.difficulty = v; ch(); })),
    h('div', { class: 'field' }, h('label', {}, t('set.botLevel')), seg(['leicht', 'normal', 'stark'].map((d) => ({ value: d, label: t(`botlevel.${d}`) })), cfg.botLevel || 'normal', (v) => { cfg.botLevel = v; ch(); })),
    h('div', { class: 'field' }, h('label', {}, t('set.topics')), topics));
}

export { EPOCHS };
