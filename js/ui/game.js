// Spielbildschirm: HUD, Spielerleiste, Aktionsbereich, Ereignis-Präsentation (Animationen, Ergebnisse, Erklärungen).
import * as THREE from 'three';
import { h, btn, clear, modal, toast, banner, vibrate, sleep, UI, ask } from './dom.js';
import { t } from '../i18n/index.js';
import { TOPICS, TOPIC_INFO, EPOCHS, GOAL_FRAGMENTS } from '../core/constants.js';
import { CARDS, CARD_KIND_ICON } from '../core/content.js';
import { BOARD, getQuestion, pendingActors, effectiveTopic, score, starColors, hasShield, isEligible } from '../core/engine.js';
import { renderPanel, waitingPanel, colorOf, pname, playerTag, cardEl, motionCard, bundleText } from './actions.js';
import { renderResult, answerText, correctText } from './questions.js';
import { nodeTop } from '../render/board3d.js';
import { FIGURE_ICONS } from '../render/pieces.js';

const SECRET = new Set(['vote', 'duel', 'trade', 'allianceReq']);
const HEAVY = new Set(['roll', 'move', 'teleport', 'scatter', 'quizResult', 'event', 'voteResult', 'duelResult', 'challengeStep', 'challengeResult', 'portalJump', 'duelStart', 'challengeStart', 'turnStart', 'gameOver', 'boardChanged', 'stormBegins']);
const EMOJIS = ['👍', '😂', '😮', '😡', '🎉', '🤝', '🗡', '🤔', '🔥', '👑'];

export class GameUI {
  constructor(app, session) {
    this.app = app;
    this.session = session;
    this.audio = app.audio;
    this.R = app.render;
    this.queue = [];
    this.busy = false;
    this.waiters = [];
    this.view = session.view();
    this.curtainKey = '';
    this.pathMode = null;
    this.chatLog = [];
    this.lastTick = -1;
    this.lastActive = -1;
    session.waitIdle = () => this.idle();
    this.build();
    this.R.pieces.setup(this.view.players, colorOf);
    this.R.board.syncMods(this.view.mods, (id) => effectiveTopic(this.view, id));
    this.R.effects.setStorm(this.view.round > this.view.stormRound);
    this.unsub = session.on((e) => this.onSession(e));
    this.timerInt = setInterval(() => this.tickTimer(), 250);
    this.bindCanvas();
  }

  // ------------------------------------------------------------------ Aufbau
  build() {
    const online = this.session.mode !== 'local';
    this.roundEl = h('div', { class: 'round-pill' });
    this.stormEl = h('div', { class: 'storm-pill hidden' }, '⚡ ', t('hud.storm'));
    this.timerNum = h('div', { class: 't-num' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.innerHTML = '<circle cx="20" cy="20" r="17" fill="rgba(5,6,15,.7)" stroke="rgba(255,255,255,.12)" stroke-width="4"/><circle class="arc" cx="20" cy="20" r="17" fill="none" stroke="#2fe6ff" stroke-width="4" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset="0"/>';
    this.timerArc = svg.querySelector('.arc');
    this.timerEl = h('div', { class: 'timer hidden', 'aria-live': 'off' }, svg, this.timerNum);
    this.camBtn = btn('🎥', () => this.toggleCamera(), 'icon-btn', { 'aria-label': t('hud.camera'), title: t('hud.camera') });
    const top = h('div', { class: 'hud-top' },
      this.roundEl, this.stormEl, h('div', { class: 'grow' }), this.timerEl,
      btn('☰', () => this.openMenu(), 'icon-btn', { 'aria-label': t('hud.menu') }));
    this.playersEl = h('div', { class: 'players' });
    this.side = h('div', { class: 'hud-side' },
      this.camBtn,
      btn('📜', () => this.openLog(), 'icon-btn', { 'aria-label': t('hud.log') }),
      online ? btn('💬', () => this.openChat(), 'icon-btn', { 'aria-label': t('hud.chat') }) : null,
      btn('❔', () => this.app.openRules(), 'icon-btn', { 'aria-label': t('hud.rules') }));
    this.peekBox = h('div', { class: 'col' });
    this.dock = h('div', { class: 'dock' }, this.peekBox, h('div', { class: 'dock-slot' }));
    this.root = h('div', { class: 'passthrough game-root' }, top, this.playersEl, this.side, this.dock);
    UI().appendChild(this.root);
  }

  destroy() {
    clearInterval(this.timerInt);
    this.unsub?.();
    this.root.remove();
    this.qmodal?.back.remove();
    this.R.board.clearHighlight();
    this.canvasOff?.();
    document.querySelectorAll('.backdrop, .curtain, .coach, .toasts, .banner, .emoji-float').forEach((e) => e.remove());
  }

  // ------------------------------------------------------------------ Ablaufsteuerung
  idle() {
    if (!this.busy && !this.queue.length) return Promise.resolve();
    return new Promise((r) => this.waiters.push(r));
  }

  onSession(e) {
    if (e.type === 'update') { this.queue.push(e); this.pump(); }
    else if (e.type === 'error') { if (this.session.isLocal(e.action?.player)) { toast(t('err.action'), 'bad'); this.audio.sfx('error'); } }
    else if (e.type === 'timeout') toast(t('timer.timeout', { name: pname(this.view, e.player) }), 'bad');
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const item = this.queue.shift();
      const heavy = item.events.some((ev) => HEAVY.has(ev.type));
      if (heavy) { this.clearDock(); this.closeQuestion(); }
      if (item.initial) this.R.pieces.sync(item.state.players);
      for (const ev of item.events) {
        try { await this.present(ev, item.state); } catch (err) { console.error('Präsentation', ev, err); }
      }
      this.view = item.state;
      if (heavy || item.initial) this.renderPlayers();
    }
    this.busy = false;
    this.refresh();
    const w = this.waiters; this.waiters = [];
    w.forEach((r) => r());
  }

  refresh() {
    const s = this.view;
    this.R.pieces.sync(s.players);
    this.renderPlayers();
    this.renderTop();
    if (s.winner != null) { this.clearDock(); this.app.showEnd(s, this); return; }
    this.renderDock();
    this.app.tutorial?.onState(s, this);
  }

  act(a) {
    this.audio.unlock();
    this.session.act(a);
  }

  // ------------------------------------------------------------------ HUD
  renderTop() {
    const s = this.view;
    this.roundEl.textContent = t('hud.round', { n: Math.min(s.round, s.settings.maxRounds), max: s.settings.maxRounds });
    const storm = s.round > s.stormRound;
    this.stormEl.classList.toggle('hidden', !storm);
  }

  renderPlayers() {
    const s = this.view;
    clear(this.playersEl);
    const pd = s.pending || {};
    const actors = pendingActors(pd);
    for (const p of s.players) {
      const c = colorOf(p);
      const stars = h('div', { class: 'pc-stars' }, TOPICS.map((tp) => {
        const n = p.stars[tp];
        return h('div', { class: `star ${n ? 'has' : ''}`, style: n ? { background: TOPIC_INFO[tp].color } : {}, title: t(`topic.${tp}`) },
          TOPIC_INFO[tp].icon, n > 1 ? h('span', { class: 'n' }, String(n)) : null);
      }));
      const flags = [
        p.ally != null ? `🤝${colorOf(s.players[p.ally]).symbol}` : '',
        hasShield(s, p) ? '🛡' : '', p.reflect ? '🪞' : '', p.skip ? '⏸' : '', p.offline ? '📵' : '',
        isEligible(s, p) ? '✦' : '',
      ].join(' ');
      this.playersEl.appendChild(h('div', {
        class: `pchip ${s.current === p.id ? 'active' : ''} ${p.offline ? 'off' : ''}`, style: { '--pc': c.hex },
        onClick: () => this.openPlayer(p.id),
      },
        h('div', { class: 'pc-head' }, h('span', { class: 'pc-sym', style: { background: c.hex } }, c.symbol), h('span', { class: 'pc-name' }, p.name, p.isBot ? ' 🤖' : ''), h('span', { class: 'pc-flags' }, flags), actors.includes(p.id) ? h('span', { title: t('hud.acting') }, '⏳') : null),
        stars,
        h('div', { class: 'pc-res' },
          h('span', { title: t('res.influence') }, '◆ ', h('b', {}, String(p.influence))),
          h('span', { title: t('res.fragments') }, '⧗ ', h('b', {}, `${p.fragments}/${GOAL_FRAGMENTS}`)),
          h('span', { title: t('res.cards') }, '🂠 ', h('b', {}, String(p.cards.length))),
          h('span', { title: t('res.reputation') }, '★ ', h('b', {}, String(p.reputation))))));
    }
  }

  tickTimer() {
    const ses = this.session;
    if (!ses.deadline || this.view.winner != null) { this.timerEl.classList.add('hidden'); return; }
    const rem = Math.max(0, (ses.deadline - Date.now()) / 1000);
    const total = ses.timerTotal || 1;
    this.timerEl.classList.remove('hidden');
    this.timerNum.textContent = String(Math.ceil(rem));
    this.timerArc.setAttribute('stroke-dashoffset', String(106.8 * (1 - rem / total)));
    this.timerArc.setAttribute('stroke', rem < 10 ? '#ff5470' : '#2fe6ff');
    this.timerEl.classList.toggle('warn', rem < 10);
    const sec = Math.ceil(rem);
    const mine = pendingActors(this.view.pending).some((id) => ses.isLocal(id));
    if (mine && sec <= 5 && sec > 0 && sec !== this.lastTick) { this.lastTick = sec; this.audio.sfx('tick'); }
  }

  // ------------------------------------------------------------------ Aktionsbereich
  dockSlot() { return this.dock.querySelector('.dock-slot'); }
  clearDock() { clear(this.dockSlot()); this.clearPath(); }

  renderDock() {
    if (this.dockLocked) return;
    const s = this.view;
    const slot = this.dockSlot();
    clear(slot);
    this.clearPath();
    const pd = s.pending;
    if (!pd) return;
    const actors = pendingActors(pd);
    const local = actors.filter((id) => this.session.isLocal(id));
    if (!local.length) {
      this.closeQuestion();
      slot.appendChild(waitingPanel(s, actors));
      this.followActive();
      return;
    }
    const pid = local[0];
    const key = `${pid}|${pd.kind}|${pd.qid ?? ''}|${pd.motion ?? ''}|${s.turnCount}`;
    if (this.session.mode === 'local' && this.session.humanSeats.size > 1 && SECRET.has(pd.kind) && this.curtainKey !== key) {
      this.closeQuestion();
      this.showCurtain(s.players[pid], () => { this.curtainKey = key; this.renderDock(); });
      return;
    }
    const panel = renderPanel({ s, p: s.players[pid], pd, ui: this, act: (a) => this.act({ ...a, player: pid }) });
    if (panel) slot.appendChild(panel);
    if (pd.kind !== 'quiz' && pd.kind !== 'challenge' && pd.kind !== 'duel') this.closeQuestion();
    this.followActive();
  }

  showCurtain(p, onReady) {
    const c = colorOf(p);
    const cur = h('div', { class: 'curtain' },
      h('div', { style: { fontSize: '48px' } }, '🔒'),
      h('div', { class: 'who', style: { color: c.hex } }, c.symbol, ' ', p.name),
      h('div', { class: 'muted' }, t('curtain.text')),
      btn(t('curtain.ready', { name: p.name }), () => { cur.remove(); onReady(); }, 'primary big'));
    UI().appendChild(cur);
  }

  openQuestion(content, title) {
    if (this.qmodal && this.qmodal.back.isConnected) { this.qmodal.setContent(content); return; }
    this.qContent = content;
    this.qTitle = title;
    this.qmodal = modal({ title, icon: '❓', content, onClose: () => { this.qHidden = true; } });
    this.qHidden = false;
  }
  reopenQuestion() { if (this.qContent) { this.qmodal = null; this.openQuestion(this.qContent, this.qTitle); } }
  closeQuestion() { if (this.qmodal) { this.qmodal.back.remove(); this.qmodal = null; } }

  highlightPath(options) {
    this.pathMode = options;
    this.R.board.highlight(options);
    const p = this.view.players[this.view.current];
    if (p) this.R.world.focusOn(nodeTop(p.pos), 34);
  }
  clearPath() { this.pathMode = null; this.R.board.clearHighlight(); }

  bindCanvas() {
    const canvas = this.R.world.canvas;
    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
      down = null;
      if (!this.pathMode) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.R.world.camera);
      const id = this.R.board.pickTile(ray);
      if (id != null && this.pathMode.includes(id)) {
        const pid = pendingActors(this.view.pending)[0];
        if (this.session.isLocal(pid)) { this.clearPath(); this.act({ type: 'choosePath', node: id, player: pid }); }
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    this.canvasOff = () => { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); };
  }

  followActive() {
    const i = this.view.current;
    if (this.camMode === 'overview') return;
    if (this.R.world.mode !== 'follow' || this.lastFollow !== i) {
      this.lastFollow = i;
      this.R.world.follow(() => this.R.pieces.position(i));
    }
  }

  toggleCamera() {
    if (this.camMode === 'overview') { this.camMode = 'follow'; this.lastFollow = -1; this.followActive(); toast(t('hud.camFollow')); }
    else { this.camMode = 'overview'; this.R.world.overview(); toast(t('hud.camOverview')); }
  }

  // ------------------------------------------------------------------ Ereignis-Präsentation
  async present(e, s) {
    const R = this.R, A = this.audio, P = R.pieces;
    const name = (id) => pname(s, id);
    const local = (id) => this.session.isLocal(id);
    switch (e.type) {
      case 'gameStart': banner(t('ev.gameStart')); A.startMusic('hub'); await sleep(900); break;
      case 'roundStart':
        if (e.round > 1) toast(t('ev.round', { n: e.round }));
        break;
      case 'stormBegins':
        banner(t('ev.storm'), t('ev.stormSub'));
        R.effects.setStorm(true);
        R.effects.lightning();
        A.sfx('storm'); vibrate([60, 40, 120]);
        A.setTension(0.35);
        await sleep(1600);
        break;
      case 'turnStart': {
        P.setActive(e.player);
        this.lastActive = e.player;
        this.camMode = this.camMode === 'overview' ? 'overview' : 'follow';
        this.lastFollow = -1;
        this.followActive();
        const p = s.players[e.player];
        const isl = BOARD.nodes[p.pos]?.island;
        A.startMusic(isl >= 0 ? EPOCHS[isl] : 'hub');
        A.setTension(s.round > s.stormRound ? 0.35 : 0);
        A.sfx('turn');
        if (local(e.player)) { vibrate(25); banner(this.session.humanSeats.size > 1 ? t('ev.yourTurnNamed', { name: p.name }) : t('ev.yourTurn')); }
        else banner(t('ev.turnOf', { name: p.name }));
        await sleep(700);
        break;
      }
      case 'skip': toast(t('ev.skip', { name: name(e.player) }), 'bad'); await sleep(500); break;
      case 'tailwind': toast(t('ev.tailwind', { name: name(e.player) }), 'good'); break;
      case 'roll': {
        A.sfx('roll');
        const origin = P.position(e.player);
        await R.dice.roll(e.values, origin, (k) => A.sfx('bounce', k));
        this.floatText(e.player, `🎲 ${e.total}`);
        break;
      }
      case 'move': {
        this.R.world.follow(() => P.position(e.player));
        let k = 0;
        await P.walk(e.player, e.path, (node, last) => { A.sfx('step', k++); if (last) R.board.pulseTile(node); });
        break;
      }
      case 'land': {
        const top = nodeTop(e.node);
        R.effects.ring(top, colorOf(s.players[e.player]).hex, 3);
        R.board.pulseTile(e.node);
        A.sfx('land');
        break;
      }
      case 'teleport':
        A.sfx('portal');
        await P.teleport(e.player, e.pos, () => R.effects.burst(nodeTop(e.pos), '#45f3ff', 50));
        break;
      case 'scatter':
        A.sfx('portal');
        await Promise.all(e.positions.map((pos, i) => P.teleport(i, pos, () => R.effects.burst(nodeTop(pos), '#ffc83a', 30))));
        break;
      case 'portalJump':
        if (e.result === 'penalty') {
          toast(t('ev.portalPenalty', { name: name(e.player), roll: e.roll }), 'bad');
          R.effects.burst(P.position(e.player), '#ff5470', 70);
          A.sfx('wrong'); vibrate([40, 30, 40]);
          await sleep(900);
        } else {
          toast(t(e.result === 'random' ? 'ev.portalRandom' : 'ev.portalOk', { name: name(e.player), roll: e.roll }), e.result === 'ok' ? 'good' : 'gold');
          A.sfx('portal');
          await P.teleport(e.player, e.pos, () => R.effects.burst(nodeTop(e.pos), '#45f3ff', 60));
        }
        break;
      case 'quiz': if (!local(e.player)) toast(t('ev.quiz', { name: name(e.player), topic: t(`topic.${getQuestion(e.qid)?.topic}`) })); break;
      case 'secondChance': toast(t('ev.secondChance', { name: name(e.player) }), 'gold'); break;
      case 'quizResult': await this.showQuizResult(e, s); break;
      case 'reward': {
        const pos = P.position(e.player);
        R.effects.burst(pos, e.choice === 'influence' ? '#ffc83a' : TOPIC_INFO[e.topic].color, 60);
        A.sfx('coin');
        toast(e.choice === 'influence' ? t('ev.rewardInf', { name: name(e.player), n: e.inf }) : e.choice === 'both' ? t('ev.rewardBoth', { name: name(e.player), topic: t(`topic.${e.topic}`), n: e.inf }) : t('ev.rewardStar', { name: name(e.player), topic: t(`topic.${e.topic}`) }), 'good');
        break;
      }
      case 'allyShare': toast(t('ev.allyShare', { name: name(e.player), from: name(e.from) })); break;
      case 'event': await this.showEventCard(e, s); break;
      case 'duelStart':
        A.setTension(1); A.sfx('duel'); vibrate([30, 30, 60]);
        banner(`⚔ ${name(e.a)} vs ${name(e.b)}`, t(`topic.${e.topic}`) + ' · ' + (e.stake === 'fragment' ? t('duel.stakeFrag') : t('duel.stakeInf')));
        await sleep(1300);
        break;
      case 'duelRound': toast(t('ev.duelTie'), 'gold'); await this.showDuelRound(e, s); break;
      case 'duelResult': await this.showDuelResult(e, s); A.setTension(s.round > s.stormRound ? 0.35 : 0); break;
      case 'duelNone': toast(t('ev.duelNone', { name: name(e.player) })); break;
      case 'duelSkipped': toast(t('ev.duelSkipped', { name: name(e.player) })); break;
      case 'motionProposed': toast(t('ev.motion', { name: name(e.player), motion: t(`motion.${e.motion}.name`) })); A.sfx('gavel'); break;
      case 'voteResult': await this.showVoteResult(e, s); break;
      case 'boardChanged': await this.showBoardChange(e, s); break;
      case 'concert': if (!local(e.player)) toast(t('ev.concert', { name: name(e.player), game: t(`mg.${e.game}`) })); break;
      case 'concertResult':
        toast(t('ev.concertResult', { name: name(e.player), pct: Math.round(e.score * 100), reward: t(`concert.reward.${e.reward}`) }), e.reward === 'none' ? 'bad' : 'good');
        if (e.reward !== 'none') R.effects.burst(P.position(e.player), '#e55ad2', 60);
        break;
      case 'bought': A.sfx('coin'); toast(t(`ev.bought.${e.what}`, { name: name(e.player), topic: e.topic ? t(`topic.${e.topic}`) : '' })); break;
      case 'challengeStart':
        A.setTension(0.7); A.sfx('event');
        banner(`♛ ${t(`boss.${e.boss}`)}`, t(`epoch.${EPOCHS[e.island]}`) + ' · ' + name(e.player));
        R.effects.column(nodeTop(BOARD.islands[e.island].ids.a2), '#ffb300');
        await sleep(1200);
        break;
      case 'challengeStep': await this.showChallengeStep(e, s); break;
      case 'challengeResult':
        A.setTension(s.round > s.stormRound ? 0.35 : 0);
        if (e.won) {
          A.sfx('victory'); vibrate([40, 40, 80]);
          banner(t('ev.fragmentWon'), name(e.player));
          R.effects.burst(P.position(e.player), '#ffb300', 120, 10);
          R.effects.column(P.position(e.player), '#ffc83a');
        } else { A.sfx('wrong'); banner(t('ev.challengeLost'), name(e.player)); }
        await sleep(1500);
        break;
      case 'bossBeatenAlready': toast(t('ev.bossBeaten', { name: name(e.player) })); break;
      case 'portalClosed': toast(t('ev.portalClosed', { name: name(e.player) })); break;
      case 'voidField': toast(t('ev.voidField', { name: name(e.player) }), 'bad'); break;
      case 'cardPlayed': {
        A.sfx('card');
        const target = e.target != null ? name(e.target) : null;
        toast(target ? t('ev.cardTarget', { name: name(e.player), card: t(`card.${e.card}.name`), target }) : t('ev.card', { name: name(e.player), card: t(`card.${e.card}.name`) }), CARDS[e.card]?.kind === 'sabotage' ? 'bad' : 'gold');
        if (target != null && CARDS[e.card]?.kind === 'sabotage') R.effects.burst(P.position(e.target), '#ff5470', 50);
        await sleep(350);
        break;
      }
      case 'blocked': toast(t('ev.blocked', { name: name(e.player) }), 'good'); break;
      case 'bounty': toast(t('ev.bounty', { name: name(e.player), target: name(e.target) }), 'gold'); break;
      case 'reflected': toast(t('ev.reflected', { name: name(e.player) }), 'gold'); break;
      case 'peek': if (local(e.player)) this.showPeek(e, s); break;
      case 'tradeOffer': toast(t('ev.tradeOffer', { from: name(e.from), to: name(e.to) })); break;
      case 'tradeCounter': toast(t('ev.tradeCounter', { from: name(e.to), to: name(e.from) })); break;
      case 'tradeDone': A.sfx('coin'); toast(t('ev.tradeDone', { from: name(e.from), to: name(e.to) }), 'good'); break;
      case 'tradeRejected': toast(t('ev.tradeRejected', { by: name(e.by) }), 'bad'); break;
      case 'tradeFailed': toast(t('ev.tradeFailed'), 'bad'); break;
      case 'allianceOffer': toast(t('ev.allianceOffer', { from: name(e.from), to: name(e.to) })); break;
      case 'allianceFormed': A.sfx('alliance'); toast(t('ev.allianceFormed', { a: name(e.a), b: name(e.b) }), 'good'); break;
      case 'allianceDeclined': toast(t('ev.allianceDeclined', { to: name(e.to) }), 'bad'); break;
      case 'allianceEnd': toast(t('ev.allianceEnd', { a: name(e.a), b: name(e.b) })); break;
      case 'betrayal':
        A.sfx('betray'); vibrate([80, 40, 80]);
        banner(t('ev.betrayal'), t('ev.betrayalSub', { name: name(e.player), victim: name(e.victim) }));
        R.effects.burst(P.position(e.player), '#ff3fb4', 80);
        await sleep(1200);
        break;
      case 'fieldsRemoved':
        A.sfx('thunder');
        R.effects.lightning();
        e.nodes.forEach((n) => R.board.setRemoved(n, true));
        toast(t('ev.fieldsRemoved', { n: e.nodes.length }), 'bad');
        await sleep(600);
        break;
      case 'fieldsRepaired': e.nodes.forEach((n) => R.board.setRemoved(n, false)); toast(t('ev.fieldsRepaired', { n: e.nodes.length }), 'good'); break;
      case 'reshuffle': toast(t('ev.reshuffle')); break;
      case 'playerOffline': toast(t('ev.offline', { name: name(e.player) }), 'bad'); break;
      case 'playerBack': toast(t('ev.back', { name: name(e.player) }), 'good'); break;
      case 'gameOver': A.stopMusic(); A.sfx('victory'); break;
      default: break;
    }
  }

  floatText(pid, text) {
    const p = this.R.pieces.position(pid).add(new THREE.Vector3(0, 3.5, 0));
    const sp = this.R.world.project(p);
    if (!sp.visible) return;
    const el = h('div', { class: 'emoji-float', style: { left: `${sp.x}px`, top: `${sp.y}px`, fontSize: '30px', fontWeight: '900' } }, text);
    UI().appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  showEmoji(pid, emoji) {
    this.floatText(pid, emoji);
    this.R.pieces.emoteBounce(pid);
  }

  // Ergebnis-Karte: blockierend für lokale Akteure (mit „Weiter“), sonst als kurze Info oberhalb des Docks
  async resultCard(content, { blocking, title, icon, auto = 12000 }) {
    if (blocking) {
      await new Promise((resolve) => {
        let done = false;
        const fin = () => { if (!done) { done = true; md.close(); resolve(); } };
        const md = modal({ title, icon, closable: false, content: h('div', { class: 'col' }, content, btn(t('common.continue'), fin, 'primary block big')) });
        setTimeout(fin, auto);
      });
    } else {
      const card = h('div', { class: 'dock-card', style: { maxHeight: '38dvh' } },
        h('div', { class: 'row between' }, h('b', {}, icon, ' ', title), btn('✕', () => card.remove(), 'ghost small icon-btn')), content);
      clear(this.peekBox);
      this.peekBox.appendChild(card);
      setTimeout(() => card.remove(), 9000);
      await sleep(700);
    }
  }

  async showQuizResult(e, s) {
    const q = getQuestion(e.qid);
    const p = s.players[e.player];
    this.audio.sfx(e.correct ? 'correct' : 'wrong');
    vibrate(e.correct ? 20 : [40, 30, 40]);
    this.R.effects.burst(this.R.pieces.position(e.player), e.correct ? '#5cff9d' : '#ff5470', e.correct ? 70 : 30);
    await this.resultCard(renderResult(q, e.answer, e.correct), { blocking: this.session.isLocal(e.player), title: `${p.name}: ${e.correct ? t('q.right') : t('q.wrong')}`, icon: e.correct ? '✅' : '❌' });
  }

  async showChallengeStep(e, s) {
    const q = getQuestion(e.qid);
    this.audio.sfx(e.correct ? 'correct' : 'wrong');
    if (this.session.isLocal(e.player)) await this.resultCard(renderResult(q, e.answer, e.correct), { blocking: true, title: t('challenge.step', { n: e.stage + 1 }), icon: '♛', auto: 9000 });
    else toast(t('ev.challengeStep', { name: pname(s, e.player), n: e.stage + 1, ok: e.correct ? '✔' : '✘' }), e.correct ? 'good' : 'bad');
  }

  async showDuelRound(e, s) {
    const q = getQuestion(e.qid);
    const rows = [e.a, e.b].map((id) => h('div', { class: 'kv' }, playerTag(s.players[id]), h('span', {}, answerText(q, e.answers[id]))));
    await this.resultCard(h('div', { class: 'col' }, h('div', { class: 'muted' }, q.q), rows, h('div', { class: 'kv' }, h('span', { class: 'muted' }, t('q.solution')), h('b', {}, correctText(q))), h('div', { class: 'explain' }, '💡 ', q.x)), { blocking: false, title: t('ev.duelTie'), icon: '⚔' });
  }

  async showDuelResult(e, s) {
    const q = getQuestion(e.qid);
    const rows = [e.a, e.b].map((id) => h('div', { class: 'kv' }, playerTag(s.players[id]), h('span', {}, answerText(q, e.answers[id]), id === e.winner ? ' 🏆' : '')));
    const verdict = e.winner == null ? t('duel.draw') : t('duel.winner', { name: pname(s, e.winner), amount: e.stake === 'fragment' ? t('duel.amountFrag') : t('duel.amountInf', { n: e.amount }) });
    if (e.winner != null) { this.R.effects.burst(this.R.pieces.position(e.winner), '#ffc83a', 90); this.audio.sfx('victory'); }
    const content = h('div', { class: 'col' }, h('div', { class: 'verdict ok' }, verdict), h('div', { class: 'muted' }, q.q), rows,
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, t('q.solution')), h('b', {}, correctText(q))), h('div', { class: 'explain' }, '💡 ', q.x));
    await this.resultCard(content, { blocking: this.session.isLocal(e.a) || this.session.isLocal(e.b), title: t('duel.result'), icon: '⚔' });
  }

  async showEventCard(e, s) {
    this.audio.sfx('event');
    vibrate(30);
    this.R.effects.column(this.R.pieces.position(e.player), '#ffd84d');
    const content = h('div', { class: 'col' },
      h('div', { class: 'verdict', style: { color: '#ffd84d' } }, '⚡ ', t(`event.${e.id}.name`)),
      h('div', { class: 'qtext', style: { fontSize: '17px', textAlign: 'center' } }, t(`event.${e.id}.desc`)),
      h('div', { class: 'muted small center' }, t('ev.eventFor', { name: pname(s, e.player) })));
    await this.resultCard(content, { blocking: true, title: t('ev.eventTitle'), icon: '⚡', auto: 5000 });
  }

  async showVoteResult(e, s) {
    this.audio.sfx('gavel');
    const total = Math.max(1, e.yes + e.no);
    const rows = s.players.map((p) => {
      const v = e.votes[p.id] || {};
      const side = v.side === 'yes' ? '👍' : v.side === 'no' ? '👎' : '–';
      return h('div', { class: 'kv' }, playerTag(p), h('span', {}, side, ` ${t('vote.weightShort', { w: e.weights[p.id] || 0 })}`, v.bid ? ` (◆${v.bid})` : '', v.card ? ` ${CARD_KIND_ICON.veto} ${t(`card.${v.card}.name`)}` : ''));
    });
    const content = h('div', { class: 'col' },
      motionCard(e.motion),
      h('div', { class: 'row between' }, h('b', {}, `👍 ${e.yes}`), h('b', {}, `👎 ${e.no}`)),
      h('div', { class: 'votebar' }, h('i', { style: { width: `${(e.yes / total) * 100}%` } })),
      rows,
      e.veto != null ? h('div', { class: 'badge' }, t('vote.vetoBy', { name: pname(s, e.veto) })) : null,
      e.flip ? h('div', { class: 'badge' }, t('vote.flipped')) : null,
      h('div', { class: `verdict ${e.passed ? 'ok' : 'no'}` }, e.passed ? t('vote.passed') : t('vote.failed')));
    await this.resultCard(content, { blocking: true, title: t('vote.result'), icon: '🏛', auto: 8000 });
  }

  async showBoardChange(e, s) {
    const B = this.R.board;
    if (e.kind === 'open') {
      const ob = BOARD.optional[e.b];
      const mid = nodeTop(ob.from).lerp(nodeTop(ob.to), 0.5);
      this.R.world.focusOn(mid, 80);
      B.showOptional(e.b);
      toast(t('ev.bridgeOpen'), 'gold');
      await sleep(1800);
    } else if (e.kind === 'close') {
      const br = BOARD.bridges[e.island];
      B.setEdgeBlocked(br.from, br.node, true);
      toast(t('ev.bridgeClosed'), 'bad');
    } else if (e.kind === 'spoke') {
      const sp = BOARD.spokes[e.island];
      B.setEdgeBlocked(sp.from, sp.to, true);
      toast(t('ev.spokeClosed'), 'bad');
    } else if (e.kind === 'recolor') {
      const isl = BOARD.islands[e.island];
      for (const id of Object.values(isl.ids)) if (BOARD.nodes[id].type === 'topic') B.recolor(id, effectiveTopic(s, id));
      toast(t('ev.recolor', { island: t(`epoch.${EPOCHS[e.island]}`) }), 'gold');
    }
    this.lastFollow = -1;
  }

  showPeek(e, s) {
    modal({ title: t('ev.peekTitle', { name: pname(s, e.target) }), icon: '🕵', content: h('div', { class: 'hand' }, e.cards.length ? e.cards.map((c) => cardEl(c)) : h('div', { class: 'muted' }, t('ev.peekNone'))) });
  }

  // ------------------------------------------------------------------ Menüs & Infos
  openPlayer(id) {
    const s = this.view;
    const p = s.players[id];
    const visible = this.session.mode === 'local' ? false : this.session.isLocal(id);
    const showCards = visible || (this.session.mode === 'local' && this.session.isLocal(id) && s.current === id);
    const c = colorOf(p);
    modal({
      title: p.name, icon: c.symbol,
      content: h('div', { class: 'col' },
        h('div', { class: 'muted small' }, `${FIGURE_ICONS[p.figure] || ''} ${t(`figure.${p.figure}`)}${p.isBot ? ' · ' + t(`style.${p.style}`) : ''}`),
        h('div', { class: 'kv' }, h('span', {}, t('res.score')), h('b', {}, String(score(p)))),
        h('div', { class: 'kv' }, h('span', {}, t('res.colors')), h('b', {}, `${starColors(p)}/6`)),
        h('div', { class: 'kv' }, h('span', {}, t('res.influence')), h('b', {}, String(p.influence))),
        h('div', { class: 'kv' }, h('span', {}, t('res.fragments')), h('b', {}, `${p.fragments}/${GOAL_FRAGMENTS}`)),
        h('div', { class: 'kv' }, h('span', {}, t('res.reputation')), h('b', {}, `${p.reputation}/10`)),
        h('div', { class: 'kv' }, h('span', {}, t('res.ally')), h('b', {}, p.ally != null ? pname(s, p.ally) : '–')),
        h('div', { class: 'kv' }, h('span', {}, t('res.beaten')), h('b', {}, p.beaten.length ? p.beaten.map((i) => t(`epoch.${EPOCHS[i]}`)).join(', ') : '–')),
        h('h3', {}, t('res.cards')),
        showCards ? h('div', { class: 'hand' }, p.cards.length ? p.cards.map((cc) => cardEl(cc)) : h('div', { class: 'muted' }, '–')) : h('div', { class: 'muted' }, t('res.cardsHidden', { n: p.cards.length }))),
    });
  }

  openLog() {
    const s = this.view;
    const lines = s.log.slice(-60).reverse().map((e) => describe(e, s)).filter(Boolean);
    modal({ title: t('hud.log'), icon: '📜', content: h('div', { class: 'feed' }, lines.length ? lines.map((l) => h('div', {}, l)) : h('div', { class: 'muted' }, '–')) });
  }

  openChat() {
    const log = h('div', { class: 'chat-log' });
    const renderLog = () => { clear(log); this.chatLog.slice(-60).forEach((m) => log.appendChild(h('div', { class: 'chat-msg' }, h('b', { style: { color: m.color } }, m.name), m.text))); log.scrollTop = log.scrollHeight; };
    renderLog();
    this.chatRender = renderLog;
    const input = h('input', { class: 'input', maxlength: '160', placeholder: t('chat.placeholder'), enterkeyhint: 'send' });
    const send = () => { const v = input.value.trim(); if (v) { this.app.sendChat(v); input.value = ''; } };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    modal({
      title: t('hud.chat'), icon: '💬', onClose: () => { this.chatRender = null; },
      content: h('div', { class: 'col' },
        h('div', { class: 'emoji-bar' }, EMOJIS.map((em) => h('button', { type: 'button', onClick: () => this.app.sendEmoji(em) }, em))),
        log, h('div', { class: 'row' }, input, btn('➤', send, 'primary icon-btn'))),
    });
  }

  addChat(msg) {
    this.chatLog.push(msg);
    if (this.chatRender) this.chatRender(); else toast(`💬 ${msg.name}: ${msg.text}`);
  }

  openMenu() {
    const md = modal({
      title: t('menu.title'), icon: '☰',
      content: h('div', { class: 'col' },
        btn(['❔ ', t('menu.rules')], () => { md.close(); this.app.openRules(); }, 'block'),
        btn(['⚙ ', t('menu.settings')], () => { md.close(); this.app.openSettings(); }, 'block'),
        document.fullscreenEnabled ? btn(['⛶ ', t('menu.fullscreen')], () => { md.close(); this.app.toggleFullscreen(); }, 'block') : null,
        h('div', { class: 'muted small' }, this.session.mode === 'client' ? t('menu.leaveInfoClient') : this.session.tutorial ? t('menu.leaveInfoTutorial') : t('menu.leaveInfo')),
        btn(['🚪 ', t('menu.leave')], async () => {
          md.close();
          if (await ask(t('menu.leaveConfirm'), t('menu.leave'), t('common.cancel'))) this.app.leaveGame();
        }, 'danger block')),
    });
  }
}

// Kurzbeschreibung eines Ereignisses für das Protokoll
export function describe(e, s) {
  const n = (id) => pname(s, id);
  switch (e.type) {
    case 'turnStart': return `▶ ${t('ev.turnOf', { name: n(e.player) })} (${t('hud.roundShort', { n: e.round })})`;
    case 'roll': return `🎲 ${n(e.player)}: ${e.values.join(' + ')}${e.values.length > 1 && !e.tailwind ? ` = ${e.total}` : e.tailwind ? ` → ${e.total}` : ''}`;
    case 'quizResult': return `${e.correct ? '✅' : '❌'} ${n(e.player)}: ${getQuestion(e.qid)?.q ?? ''}`;
    case 'reward': return `🎁 ${n(e.player)}: ${e.choice === 'influence' ? `+${e.inf} ◆` : e.choice === 'both' ? `${TOPIC_INFO[e.topic].icon} + ${e.inf} ◆` : TOPIC_INFO[e.topic].icon}`;
    case 'event': return `⚡ ${t(`event.${e.id}.name`)} – ${t(`event.${e.id}.desc`)}`;
    case 'duelResult': return `⚔ ${n(e.a)} vs ${n(e.b)}: ${e.winner == null ? t('duel.draw') : n(e.winner)}`;
    case 'voteResult': return `🏛 ${t(`motion.${e.motion}.name`)}: ${e.passed ? t('vote.passed') : t('vote.failed')} (${e.yes}:${e.no})`;
    case 'challengeResult': return `♛ ${n(e.player)}: ${e.won ? t('ev.fragmentWon') : t('ev.challengeLost')}`;
    case 'concertResult': return `♫ ${n(e.player)}: ${Math.round(e.score * 100)} %`;
    case 'cardPlayed': return `🂠 ${n(e.player)}: ${t(`card.${e.card}.name`)}${e.target != null ? ` → ${n(e.target)}` : ''}`;
    case 'betrayal': return `🗡 ${t('ev.betrayalSub', { name: n(e.player), victim: n(e.victim) })}`;
    case 'allianceFormed': return `🤝 ${t('ev.allianceFormed', { a: n(e.a), b: n(e.b) })}`;
    case 'tradeDone': return `⇄ ${t('ev.tradeDone', { from: n(e.from), to: n(e.to) })}`;
    case 'portalJump': return `◎ ${n(e.player)}: ${t(`portal.result.${e.result}`)}`;
    case 'fieldsRemoved': return `🌩 ${t('ev.fieldsRemoved', { n: e.nodes.length })}`;
    case 'stormBegins': return `⚡ ${t('ev.storm')}`;
    case 'bought': return `⇄ ${t(`ev.bought.${e.what}`, { name: n(e.player), topic: e.topic ? t(`topic.${e.topic}`) : '' })}`;
    case 'skip': return `⏸ ${t('ev.skip', { name: n(e.player) })}`;
    default: return null;
  }
}

export { bundleText };
