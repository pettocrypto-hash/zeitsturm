// Aktions-Panels: Für jede Entscheidung der Engine (pending.kind) gibt es eine touch-freundliche Oberfläche.
import { h, btn, clear, modal, stepper, seg, toast, tapFeedback, ask } from './dom.js';
import { t } from '../i18n/index.js';
import { TOPICS, TOPIC_INFO, EPOCHS, FIELD_INFO, PLAYER_COLORS } from '../core/constants.js';
import { CARDS, CARD_KIND_ICON, MOTIONS } from '../core/content.js';
import { BOARD, getQuestion, activeTopics, marketPrices, effectiveTopic, starColors } from '../core/engine.js';
import { renderQuestion, jokerCards } from './questions.js';
import { playMinigame } from './minigames.js';

const NODES = BOARD.nodes;
export const colorOf = (p) => PLAYER_COLORS.find((c) => c.id === p.color) || PLAYER_COLORS[0];
export const pname = (s, id) => s.players[id]?.name ?? '?';

export function playerTag(p) {
  const c = colorOf(p);
  return h('span', { class: 'row', style: { display: 'inline-flex', gap: '6px' } },
    h('span', { class: 'pc-sym', style: { background: c.hex } }, c.symbol), h('b', {}, p.name));
}

export function cardEl(id, { onClick, disabled = false, selected = false } = {}) {
  const def = CARDS[id];
  if (!def) return h('div', { class: 'gcard disabled' }, h('div', { class: 'k' }, '🂠'), h('div', { class: 'n' }, '?'));
  return h('button', { type: 'button', class: `gcard k-${def.kind} ${disabled ? 'disabled' : ''} ${selected ? 'selected' : ''}`, onClick: () => { if (!disabled) { tapFeedback(); onClick?.(); } } },
    h('div', { class: 'k' }, CARD_KIND_ICON[def.kind]),
    h('div', { class: 'n' }, t(`card.${id}.name`)),
    h('div', { class: 'd' }, t(`card.${id}.desc`)));
}

export function motionCard(id, extra = null) {
  return h('div', { class: 'card tight' },
    h('div', { class: 'dock-title' }, '🏛 ', t(`motion.${id}.name`)),
    h('div', { class: 'muted' }, t(`motion.${id}.desc`)), extra);
}

function islandName(i) { return t(`epoch.${EPOCHS[i]}`); }

// Beschreibung einer Wegoption an einer Kreuzung
export function pathLabel(s, from, to) {
  const n = NODES[to], f = NODES[from];
  const opt = BOARD.optional.find((o) => o.from === from && o.to === to);
  if (opt) return { icon: '🌉', text: t('path.optional', { island: islandName(n.island) }) };
  if (f.type === 'hub') return { icon: '🏝', text: t('path.toIsland', { island: islandName(n.island) }) };
  if (n.name.startsWith('a1')) return { icon: '🛡', text: t('path.safe') };
  if (n.name.startsWith('b1')) return { icon: '⚠', text: t('path.risky', { field: t(FIELD_INFO[n.type].key) }) };
  if (n.bridge) return { icon: '🌉', text: t('path.bridge', { island: islandName((n.island + 1) % 6) }) };
  if (n.spoke) return { icon: '✦', text: t('path.spoke') };
  const field = n.type === 'topic' ? t(`topic.${effectiveTopic(s, to)}`) : t(FIELD_INFO[n.type].key);
  return { icon: FIELD_INFO[n.type].icon, text: field };
}

const WAIT_KEYS = { turn: 'wait.turn', path: 'wait.path', quiz: 'wait.quiz', reward: 'wait.reward', duelSetup: 'wait.duelSetup', duel: 'wait.duel', motion: 'wait.motion', vote: 'wait.vote', concert: 'wait.concert', market: 'wait.market', portal: 'wait.portal', challenge: 'wait.challenge', post: 'wait.post', trade: 'wait.trade', allianceReq: 'wait.alliance', moving: 'wait.turn' };

export function waitingPanel(s, actors) {
  const pd = s.pending;
  const names = actors.map((id) => pname(s, id)).join(', ');
  let extra = null;
  if (pd.kind === 'vote') extra = h('div', { class: 'muted small center' }, t('vote.progress', { n: s.players.length - pd.waiting.length, m: s.players.length }));
  return h('div', { class: 'dock-card' },
    h('div', { class: 'waiting' }, h('span', { class: 'dot-anim' }, t(WAIT_KEYS[pd.kind] || 'wait.turn', { name: names }))), extra);
}

// ------------------------------------------------------------------ Panels
export function renderPanel(ctx) {
  const fn = PANELS[ctx.pd.kind];
  return fn ? fn(ctx) : null;
}

const PANELS = {
  turn({ s, p, act, ui }) {
    const card = h('div', { class: 'dock-card' });
    let selected = null;
    const detail = h('div', { class: 'col' });
    const playable = (c) => CARDS[c]?.when === 'turn' && (!s.ctx?.cardPlayed || CARDS[c].kind === 'jump');
    const render = () => {
      clear(card);
      card.append(h('div', { class: 'dock-title' }, '🎲 ', t('turn.yours')));
      if (s.ctx?.tailwind) card.append(h('div', { class: 'muted small' }, '🌬 ', t('turn.tailwind')));
      if (p.cards.length) {
        card.append(h('div', { class: 'muted small' }, t('turn.cardsHint')));
        card.append(h('div', { class: 'hand' }, p.cards.map((c) => cardEl(c, { disabled: !playable(c), selected: selected === c, onClick: () => { selected = selected === c ? null : c; render(); } }))));
      }
      clear(detail);
      if (selected) detail.append(cardPlayUI(s, p, selected, act, () => { selected = null; render(); }));
      card.append(detail);
      card.append(btn(['🎲 ', t('turn.roll')], () => { ui.audio.unlock(); act({ type: 'roll' }); }, 'primary block big'));
    };
    render();
    return card;
  },

  path({ s, pd, act, ui }) {
    ui.highlightPath(pd.options);
    return h('div', { class: 'dock-card' },
      h('div', { class: 'dock-title' }, '🔀 ', t('path.title')),
      h('div', { class: 'muted small' }, t('path.hint', { n: pd.steps })),
      h('div', { class: pd.options.length > 3 ? 'grid2' : 'col' }, pd.options.map((o) => {
        const L = pathLabel(s, s.players[pd.player].pos, o);
        return btn([h('span', { class: 'ico' }, L.icon), L.text], () => { ui.clearPath(); act({ type: 'choosePath', node: o }); }, pd.options.length > 3 ? 'small' : 'block');
      })));
  },

  quiz(ctx) { return questionPanel(ctx, 'quiz'); },
  challenge(ctx) { return questionPanel(ctx, 'challenge'); },
  duel(ctx) { return questionPanel(ctx, 'duel'); },

  reward({ pd, act }) {
    const info = TOPIC_INFO[pd.topic];
    if (pd.double) {
      return h('div', { class: 'dock-card' }, h('div', { class: 'dock-title' }, '🎁 ', t('reward.title')),
        btn(t('reward.both', { topic: t(`topic.${pd.topic}`), n: pd.inf }), () => act({ type: 'reward', choice: 'star' }), 'primary block big'));
    }
    return h('div', { class: 'dock-card' },
      h('div', { class: 'dock-title' }, '🎁 ', t('reward.title')),
      h('div', { class: 'grid2' },
        btn([h('span', { class: 'ico' }, info.icon), t('reward.star', { topic: t(`topic.${pd.topic}`) })], () => act({ type: 'reward', choice: 'star' }), 'big', { style: `border-color:${info.color}` }),
        btn(['◆ ', t('reward.inf', { n: pd.inf })], () => act({ type: 'reward', choice: 'influence' }), 'big')));
  },

  duelSetup({ s, p, pd, act }) {
    let target = pd.targets[0], topic = pd.topics[0], stake = 'influence';
    const card = h('div', { class: 'dock-card' });
    const render = () => {
      clear(card);
      const T = s.players[target];
      const fragOk = p.fragments >= 1 && T.fragments >= 1;
      card.append(
        h('div', { class: 'dock-title' }, '⚔ ', t('duel.setup')),
        h('div', { class: 'muted small' }, t('duel.hint')),
        h('div', { class: 'field' }, h('label', {}, t('duel.opponent')), seg(pd.targets.map((id) => ({ value: id, label: s.players[id].name })), target, (v) => { target = v; render(); })),
        h('div', { class: 'field' }, h('label', {}, t('duel.topic')), h('div', { class: 'row wrap' }, pd.topics.map((tp) => h('button', { type: 'button', class: `toggle-chip ${tp === topic ? 'on' : ''}`, onClick: () => { tapFeedback(); topic = tp; render(); } }, TOPIC_INFO[tp].icon, ' ', t(`topic.${tp}`))))),
        h('div', { class: 'field' }, h('label', {}, t('duel.stake')), seg([{ value: 'influence', label: t('duel.stakeInf') }, ...(fragOk ? [{ value: 'fragment', label: t('duel.stakeFrag') }] : [])], fragOk ? stake : 'influence', (v) => { stake = v; })),
        h('div', { class: 'grid2' },
          btn(t('duel.skip'), () => act({ type: 'skipDuel' }), 'ghost'),
          btn(['⚔ ', t('duel.go')], () => act({ type: 'duel', target, topic, stake: fragOk ? stake : 'influence' }), 'hot')));
    };
    render();
    return card;
  },

  motion({ pd, act }) {
    return h('div', { class: 'dock-card' },
      h('div', { class: 'dock-title' }, '🏛 ', t('motion.choose')),
      h('div', { class: 'muted small' }, t('motion.hint')),
      h('div', { class: 'col' }, pd.options.map((id) => h('div', { class: 'col' }, motionCard(id), btn(t('motion.propose'), () => act({ type: 'propose', motion: id }), 'primary block')))));
  },

  vote({ s, p, pd, act }) {
    let side = pd.proposer === p.id ? 'yes' : 'abstain', bid = 0, card = null;
    const vetoes = [...new Set(p.cards.filter((c) => CARDS[c]?.when === 'vote'))];
    const weightEl = h('div', { class: 'muted small' });
    const base = s.rules?.flatVote ? 1 : 1 + (p.reputation >= 8 ? 1 : 0) - (p.reputation <= 2 ? 1 : 0);
    const upd = () => { weightEl.textContent = side === 'abstain' ? t('vote.abstainInfo') : t('vote.weight', { w: (base + bid) * (card === 'v_double' ? 2 : 1), base, bid }); };
    const st = stepper(0, 0, p.influence, (v) => { bid = v; upd(); });
    const cardRow = h('div', { class: 'hand' });
    const renderCards = () => { clear(cardRow); vetoes.forEach((c) => cardRow.appendChild(cardEl(c, { selected: card === c, onClick: () => { card = card === c ? null : c; renderCards(); upd(); } }))); };
    renderCards();
    upd();
    return h('div', { class: 'dock-card' },
      motionCard(pd.motion, h('div', { class: 'muted small' }, t('vote.proposedBy', { name: pname(s, pd.proposer) }))),
      h('div', { class: 'spacer' }),
      seg([{ value: 'yes', label: '👍 ' + t('vote.yes') }, { value: 'no', label: '👎 ' + t('vote.no') }, { value: 'abstain', label: t('vote.abstain') }], side, (v) => { side = v; upd(); }),
      h('div', { class: 'field' }, h('label', {}, t('vote.bid')), st.el, weightEl),
      vetoes.length ? h('div', { class: 'field' }, h('label', {}, t('vote.cards')), cardRow) : null,
      h('div', { class: 'muted small' }, t('vote.secret')),
      btn(['🗳 ', t('vote.submit')], () => act({ type: 'vote', side, bid: side === 'abstain' ? 0 : bid, card }), 'primary block big'));
  },

  concert({ pd, act, ui }) {
    return h('div', { class: 'dock-card' },
      h('div', { class: 'dock-title' }, '♫ ', t('concert.title', { game: t(`mg.${pd.game}`) })),
      h('div', { class: 'muted' }, t('concert.hint')),
      btn(['▶ ', t('concert.start')], async () => {
        ui.dockLocked = true;
        const score = await playMinigame(pd.game, { seed: pd.seed, level: pd.level }, ui.audio);
        ui.dockLocked = false;
        act({ type: 'minigame', score });
      }, 'hot block big'));
  },

  market({ s, p, pd, act }) {
    const pr = marketPrices(s);
    const miss = activeTopics(s).filter((tp) => p.stars[tp] === 0);
    const owned = TOPICS.filter((tp) => p.stars[tp] > 0);
    const pickTopic = (list, cb, title) => {
      const md = modal({ title, content: h('div', { class: 'col' }, list.map((tp) => btn([TOPIC_INFO[tp].icon, ' ', t(`topic.${tp}`), ` (${p.stars[tp]})`], () => { md.close(); cb(tp); }, 'block'))) });
    };
    return h('div', { class: 'dock-card' },
      h('div', { class: 'dock-title' }, '⇄ ', t('market.title')),
      h('div', { class: 'muted small' }, t('market.balance', { n: p.influence }), ' ', t('market.tradeHint')),
      h('div', { class: 'col' },
        btn(t('market.card', { n: pr.card }), () => act({ type: 'buyCard' }), 'block', { disabled: pd.bought >= 2 || p.influence < pr.card }),
        btn(t('market.star', { n: pr.star }), () => pickTopic(miss.length ? miss : activeTopics(s), (tp) => act({ type: 'buyStar', topic: tp }), t('market.starPick')), 'block', { disabled: pd.star || p.influence < pr.star }),
        btn(t('market.fragment', { n: pr.fragment }), () => act({ type: 'buyFragment' }), 'block', { disabled: pd.fragment || p.influence < pr.fragment }),
        btn(t('market.sell', { n: pr.sell }), () => pickTopic(owned, (tp) => act({ type: 'sellStar', topic: tp }), t('market.sellPick')), 'block ghost', { disabled: !owned.length }),
        btn(t('market.done'), () => act({ type: 'marketDone' }), 'primary block big')));
  },

  portal({ pd, act }) {
    return h('div', { class: 'dock-card' },
      h('div', { class: 'dock-title' }, '◎ ', t('portal.title')),
      h('div', { class: 'muted small' }, t('portal.hint')),
      h('div', { class: 'grid2' }, pd.options.map((i) => btn(islandName(i), () => act({ type: 'portalJump', island: i }), '', { style: `border-color:${['#ffcf6b', '#b6e07a', '#ff8a3d', '#d8d07a', '#ff4d6a', '#45f3ff'][i]}` }))),
      h('div', { class: 'spacer' }),
      btn(t('portal.stay'), () => act({ type: 'portalStay' }), 'ghost block'));
  },

  post({ s, p, act, ui }) {
    const others = s.players.filter((o) => o.id !== p.id);
    const canAlly = !s.ctx?.allied && p.ally == null && others.some((o) => o.ally == null);
    return h('div', { class: 'dock-card' },
      h('div', { class: 'dock-title' }, '🤝 ', t('post.title')),
      h('div', { class: 'muted small' }, t('post.hint')),
      h('div', { class: 'grid2' },
        btn(['⇄ ', t('post.trade'), s.ctx?.tradeLimit > 1 ? ` (${Math.max(0, s.ctx.tradeLimit - s.ctx.trades)})` : ''], () => openTrade(s, p, null, act), '', { disabled: (s.ctx?.trades || 0) >= (s.ctx?.tradeLimit || 1) }),
        btn(['🤝 ', t('post.ally')], () => {
          const md = modal({ title: t('post.allyPick'), content: h('div', { class: 'col' }, h('div', { class: 'muted small' }, t('post.allyInfo')), others.filter((o) => o.ally == null).map((o) => btn(playerTag(o), () => { md.close(); act({ type: 'ally', target: o.id }); }, 'block'))) });
        }, '', { disabled: !canAlly })),
      p.ally != null && !s.ctx?.betrayed ? btn(['🗡 ', t('post.betray', { name: pname(s, p.ally) })], async () => {
        if (await ask(t('post.betrayConfirm'), t('post.betrayYes'), t('common.cancel'))) act({ type: 'betray' });
      }, 'danger block') : null,
      btn(['⏭ ', t('post.end')], () => act({ type: 'endTurn' }), 'primary block big'));
  },

  trade({ s, p, pd, act }) {
    const from = s.players[pd.from], to = s.players[pd.to];
    const iAmTarget = p.id === pd.to;
    const give = iAmTarget ? pd.request : pd.offer;
    const get = iAmTarget ? pd.offer : pd.request;
    return h('div', { class: 'dock-card' },
      h('div', { class: 'dock-title' }, '⇄ ', pd.stage === 'counter' ? t('trade.counterFrom', { name: to.name }) : t('trade.offerFrom', { name: from.name })),
      h('div', { class: 'grid2' },
        h('div', { class: 'bundle' }, h('b', {}, t('trade.youGet')), bundleText(get)),
        h('div', { class: 'bundle' }, h('b', {}, t('trade.youGive')), bundleText(give))),
      h('div', { class: 'spacer' }),
      h('div', { class: pd.stage === 'offer' ? 'grid3' : 'grid2' },
        btn(t('trade.reject'), () => act({ type: 'tradeReject' }), 'ghost'),
        pd.stage === 'offer' ? btn(t('trade.counter'), () => openTrade(s, from, pd, act, true), '') : null,
        btn(t('trade.accept'), () => act({ type: 'tradeAccept' }), 'good')));
  },

  allianceReq({ s, pd, act }) {
    return h('div', { class: 'dock-card' },
      h('div', { class: 'dock-title' }, '🤝 ', t('ally.offer', { name: pname(s, pd.from) })),
      h('div', { class: 'muted small' }, t('post.allyInfo')),
      h('div', { class: 'grid2' }, btn(t('ally.decline'), () => act({ type: 'allyReject' }), 'ghost'), btn(t('ally.accept'), () => act({ type: 'allyAccept' }), 'good')));
  },
};

// ------------------------------------------------------------------ Karten ausspielen
function cardPlayUI(s, p, id, act, done) {
  const def = CARDS[id];
  let target = null, value = 3;
  const box = h('div', { class: 'card tight col' });
  const targets = s.players.filter((o) => o.id !== p.id);
  const render = () => {
    clear(box);
    box.append(h('b', {}, t(`card.${id}.name`)), h('div', { class: 'muted small' }, t(`card.${id}.desc`)));
    if (def.target) box.append(h('div', { class: 'field' }, h('label', {}, t('card.target')), seg(targets.map((o) => ({ value: o.id, label: o.name })), target, (v) => { target = v; render(); })));
    if (def.value) box.append(h('div', { class: 'field' }, h('label', {}, t('card.steps')), seg([1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) })), value, (v) => { value = v; })));
    box.append(h('div', { class: 'grid2' }, btn(t('common.cancel'), done, 'ghost'),
      btn(t('card.play'), () => act({ type: 'playCard', card: id, target, value }), 'hot', { disabled: def.target && target == null })));
  };
  render();
  return box;
}

// ------------------------------------------------------------------ Fragen (Quiz, Herausforderung, Duell)
function questionPanel({ s, p, pd, act, ui }, kind) {
  const q = getQuestion(pd.qid);
  if (!q) return null;
  const jokers = kind === 'duel' ? [] : jokerCards(p.cards);
  let head;
  if (kind === 'challenge') {
    head = h('div', { class: 'col' },
      h('div', { class: 'row between' }, h('b', {}, '♛ ', t(`boss.${pd.boss}`)), h('span', { class: 'badge' }, t('challenge.progress', { stage: pd.stage + 1, total: pd.stages.length, correct: pd.correct, needed: pd.needed }))),
      h('div', { class: 'progress' }, h('i', { style: { width: `${(pd.stage / pd.stages.length) * 100}%` } })));
  } else if (kind === 'duel') {
    const [a, b] = pd.players;
    head = h('div', { class: 'row between' }, h('b', {}, '⚔ ', t('duel.vs', { a: pname(s, a), b: pname(s, b) })), pd.round === 2 ? h('span', { class: 'badge' }, t('duel.tiebreak')) : null);
  } else head = pd.second ? h('div', { class: 'badge' }, t('q.secondChance')) : null;
  ui.openQuestion(h('div', { class: 'col' }, head,
    renderQuestion(q, pd, {
      jokers,
      onAnswer: (ans) => { ui.closeQuestion(); act({ type: 'answer', answer: ans }); },
      onJoker: (c) => act({ type: 'useJoker', card: c }),
    })), kind === 'duel' ? t('duel.title') : kind === 'challenge' ? t('challenge.title') : t('quiz.title'));
  return h('div', { class: 'dock-card' }, h('div', { class: 'waiting' }, t('quiz.open')), btn(t('quiz.show'), () => ui.reopenQuestion(), 'block'));
}

// ------------------------------------------------------------------ Handel
export function bundleText(b) {
  const parts = [];
  if (b.influence) parts.push(`◆ ${b.influence} ${t('res.influence')}`);
  for (const [tp, n] of Object.entries(b.stars || {})) if (n) parts.push(`${TOPIC_INFO[tp].icon} ${n}× ${t(`topic.${tp}`)}`);
  for (const c of b.cards || []) parts.push(`${CARD_KIND_ICON[CARDS[c]?.kind] || '🂠'} ${t(`card.${c}.name`)}`);
  return h('div', { class: 'col small' }, parts.length ? parts.map((x) => h('div', {}, x)) : h('div', { class: 'muted' }, t('trade.nothing')));
}

// Handelsangebot erstellen. Bei Gegenangebot (counter=true) bearbeitet der Empfänger das Angebot aus Sicht des Anbieters.
function openTrade(s, proposer, base, act, counter = false) {
  const others = s.players.filter((o) => o.id !== proposer.id);
  let partnerId = counter ? base.to : others[0].id;
  const offer = counter ? JSON.parse(JSON.stringify(base.offer)) : { influence: 0, stars: {}, cards: [] };
  const request = counter ? JSON.parse(JSON.stringify(base.request)) : { influence: 0, stars: {}, cards: [] };
  const body = h('div', { class: 'col' });
  const render = () => {
    clear(body);
    const partner = s.players[partnerId];
    const giver = proposer, taker = partner;
    if (!counter) body.append(h('div', { class: 'field' }, h('label', {}, t('trade.partner')), seg(others.map((o) => ({ value: o.id, label: o.name })), partnerId, (v) => { partnerId = v; offer.stars = {}; offer.cards = []; request.stars = {}; render(); })));
    const section = (title, bundle, owner, allowCards) => {
      const box = h('div', { class: 'bundle' }, h('b', {}, title));
      box.append(h('div', { class: 'row between' }, h('span', {}, '◆ ', t('res.influence')), stepper(bundle.influence || 0, 0, owner.influence, (v) => { bundle.influence = v; }).el));
      for (const tp of TOPICS) {
        if (!(owner.stars[tp] > 0)) continue;
        box.append(h('div', { class: 'row between' }, h('span', {}, TOPIC_INFO[tp].icon, ' ', t(`topic.${tp}`)), stepper(bundle.stars[tp] || 0, 0, owner.stars[tp], (v) => { bundle.stars[tp] = v; }).el));
      }
      if (allowCards && owner.cards.some((c) => CARDS[c])) {
        const row = h('div', { class: 'hand' });
        const picked = new Set();
        const rr = () => {
          clear(row);
          owner.cards.forEach((c, i) => row.appendChild(cardEl(c, { selected: picked.has(i), onClick: () => { if (picked.has(i)) picked.delete(i); else picked.add(i); bundle.cards = [...picked].map((k) => owner.cards[k]); rr(); } })));
        };
        rr();
        box.append(row);
      }
      return box;
    };
    body.append(section(counter ? t('trade.theyGive', { name: giver.name }) : t('trade.youGive'), offer, giver, !counter));
    body.append(section(counter ? t('trade.youGive') : t('trade.youWant', { name: taker.name }), request, taker, counter));
    body.append(btn(counter ? t('trade.sendCounter') : t('trade.send'), () => {
      md.close();
      act(counter ? { type: 'tradeCounter', offer, request } : { type: 'trade', target: partnerId, offer, request });
    }, 'primary block big'));
  };
  const md = modal({ title: counter ? t('trade.counterTitle') : t('trade.title'), icon: '⇄', content: body });
  render();
}

export { starColors };
