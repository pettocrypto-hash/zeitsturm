// ZEITSTURM Regel-Engine.
// Reiner Zustandsautomat: createGame() erzeugt einen Zustand, applyAction() verändert ihn und liefert Ereignisse
// für Animationen/UI. Kein DOM, kein Netzwerk – läuft im Browser (Host/Hot-Seat) und in Node (Simulation).
import { TOPICS, EPOCHS, EPOCH_INFO, GOAL_FRAGMENTS, STATE_VERSION } from './constants.js';
import { buildBoard } from './board.js';
import { CARDS, EVENTS, MOTIONS, buildCardDeck } from './content.js';
import { nextRandom, randInt, shuffle, pick } from './rng.js';

export const BOARD = buildBoard();
const NODES = BOARD.nodes;

let BANK = [];
let BANK_BY_ID = {};
export function setQuestionBank(list) {
  BANK = list;
  BANK_BY_ID = Object.fromEntries(list.map((q) => [q.id, q]));
}
export function getQuestion(id) { return BANK_BY_ID[id]; }

export const DEFAULT_SETTINGS = {
  maxRounds: 30,
  stormRound: 20,
  turnTime: 90,
  difficulty: 'normal',
  topics: [...TOPICS],
};

let EV = [];
function emit(type, data = {}) { EV.push({ type, ...data }); }

// ---------------------------------------------------------------- Erzeugung
export function createGame({ players, settings = {}, seed = 1 }) {
  const s = {
    v: STATE_VERSION,
    seed,
    rng: seed >>> 0,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players: players.map((p, i) => ({
      id: i, name: p.name, color: p.color, figure: p.figure,
      isBot: !!p.isBot, style: p.style || 'scholar',
      pos: BOARD.hub, stars: Object.fromEntries(TOPICS.map((t) => [t, 0])),
      influence: 4, fragments: 0, cards: [], reputation: 5,
      shieldUntil: 0, reflect: false, stormImmune: false, skip: false, beaten: [],
      ally: null, allyUntil: 0,
      stats: { correct: 0, wrong: 0, duelsWon: 0, duelsLost: 0, betrayals: 0, votesWon: 0, bidTotal: 0,
        motionsPassed: 0, cardsPlayed: 0, sabotages: 0, steps: 0, music: 0, challenges: 0, trades: 0, influenceMax: 4,
        doubles: 0, archives: 0, streams: 0 },
    })),
    round: 1,
    turnCount: 0,
    current: 0,
    pending: null,
    ctx: {},
    mods: { blocked: [], opened: [], removed: [], recolor: {} },
    rules: { quizBonus: 0, quizBonusUntil: 0, duelBanUntil: 0, duelStake: 1, handLimit: 5, incomeUntil: 0, marketDiscount: 0, bossEasy: 0 },
    stormRound: 0,
    decks: { q: {}, events: [], motions: [], cards: [] },
    fund: 0,
    winner: null,
    winType: null,
    log: [],
    seq: 0,
  };
  s.stormRound = s.settings.stormRound;
  for (const t of TOPICS) s.decks.q[t] = shuffle(s, BANK.filter((q) => q.topic === t).map((q) => q.id));
  s.decks.events = shuffle(s, EVENTS.map((e) => e.id));
  s.decks.motions = shuffle(s, MOTIONS.map((m) => m.id));
  s.decks.cards = shuffle(s, buildCardDeck());
  EV = [];
  for (const p of s.players) { drawCard(s, p); drawCard(s, p); }
  emit('gameStart');
  startTurn(s);
  flushLog(s);
  return s;
}

// ---------------------------------------------------------------- Hilfsfunktionen
export function activeTopics(s) { return s.settings.topics.length ? s.settings.topics : TOPICS; }
export function stormActive(s) { return s.round > s.stormRound; }
export function hasShield(s, p) { return p.shieldUntil >= s.round; }

export function effectiveTopic(s, nodeId) {
  const node = NODES[nodeId];
  // Umfärbe-Anträge wirken auf die Themenfelder der Hauptinsel einer Epoche
  let t = s.mods.recolor[node.island] && node.type === 'topic' && node.area === 'main' ? s.mods.recolor[node.island] : node.topic;
  const act = activeTopics(s);
  if (!act.includes(t)) t = act[(TOPICS.indexOf(t) + node.id) % act.length];
  return t;
}

export function starColors(p) { return TOPICS.filter((t) => p.stars[t] > 0).length; }
export function starTotal(p) { return TOPICS.reduce((a, t) => a + p.stars[t], 0); }
export function missingTopics(s, p) { return activeTopics(s).filter((t) => p.stars[t] <= 0); }
export function isEligible(s, p) { return missingTopics(s, p).length === 0 && p.fragments >= GOAL_FRAGMENTS; }
export function score(p) { return starTotal(p) * 2 + starColors(p) + p.fragments * 5 + Math.floor(p.influence / 3); }

export function ranking(s) {
  return [...s.players].sort((a, b) => score(b) - score(a) || b.fragments - a.fragments || starTotal(b) - starTotal(a) || b.influence - a.influence);
}

export function openNext(s, nodeId) {
  const out = NODES[nodeId].next.filter((n) => !s.mods.blocked.includes(`${nodeId}>${n}`));
  for (const b of s.mods.opened) {
    const ob = BOARD.optional[b];
    if (ob.from === nodeId && !out.includes(ob.to)) out.push(ob.to);
  }
  return out;
}

function addInf(s, p, n) {
  p.influence = Math.max(0, p.influence + n);
  p.stats.influenceMax = Math.max(p.stats.influenceMax, p.influence);
}
function clampRep(p) { p.reputation = Math.max(0, Math.min(10, p.reputation)); }

function drawCard(s, p) {
  if (!s.decks.cards.length) s.decks.cards = shuffle(s, buildCardDeck());
  const c = s.decks.cards.pop();
  p.cards.push(c);
  const limit = s.rules.handLimit;
  while (p.cards.length > limit) p.cards.shift();
  return c;
}

function removeCard(p, cardId) {
  const i = p.cards.indexOf(cardId);
  if (i < 0) return false;
  p.cards.splice(i, 1);
  return true;
}

function lastPlace(s) {
  const r = ranking(s);
  const last = r[r.length - 1];
  return score(r[0]) - score(last) >= 5 ? last : null;
}
function leader(s) { return ranking(s)[0]; }

function voteBase(s, p) { return s.rules.flatVote ? 1 : 1 + (p.reputation >= 8 ? 1 : 0) - (p.reputation <= 2 ? 1 : 0); }

export function pendingActors(pending) {
  if (!pending) return [];
  if (pending.waiting) return pending.waiting;
  return pending.player != null ? [pending.player] : [];
}

function islandOf(nodeId) { return NODES[nodeId].island; }

// ---------------------------------------------------------------- Fragen
function targetDiff(s, island) {
  const base = island < 0 ? 2 : island < 2 ? 1 : island < 4 ? 2 : 3;
  const d = { leicht: -1, normal: 0, schwer: 1 }[s.settings.difficulty] || 0;
  return Math.max(1, Math.min(3, base + d));
}

function drawQuestion(s, topics, types, epoch, diff) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let best = null, bestScore = 99, bestTopic = null;
    for (const t of topics) {
      const deck = s.decks.q[t];
      for (let i = deck.length - 1; i >= 0; i--) {
        const q = BANK_BY_ID[deck[i]];
        if (!types.includes(q.type)) continue;
        const sc = (q.epoch === epoch || q.epoch < 0 ? 0 : 1.5) + Math.abs(q.diff - diff) + nextRandom(s) * 0.9;
        if (sc < bestScore) { bestScore = sc; best = q; bestTopic = t; }
      }
    }
    if (best) {
      const deck = s.decks.q[bestTopic];
      deck.splice(deck.indexOf(best.id), 1);
      return best;
    }
    // Stapel erschöpft: ohne Wiederholung nicht mehr möglich – Thema neu mischen
    for (const t of topics) s.decks.q[t] = shuffle(s, BANK.filter((q) => q.topic === t).map((q) => q.id));
    emit('reshuffle', { topics });
  }
  return BANK.find((q) => topics.includes(q.topic)) || BANK[0];
}

export function questionOrder(s, q) {
  const n = q.type === 'match' ? q.pairs.length : q.a ? q.a.length : 0;
  return n ? shuffle(s, [...Array(n).keys()]) : [];
}

export function checkAnswer(q, ans) {
  switch (q.type) {
    case 'mc': return ans === 0;
    case 'tf': return ans === q.c;
    case 'est': return typeof ans === 'number' && Math.abs(ans - q.c) <= q.tol;
    case 'order':
    case 'match': return Array.isArray(ans) && ans.length === (q.pairs || q.a).length && ans.every((v, i) => v === i);
    default: return false;
  }
}

// ---------------------------------------------------------------- Zugablauf
function startTurn(s) {
  const p = s.players[s.current];
  s.ctx = { cardPlayed: false, tailwind: false, steps: 0, path: [], trades: 0, tradeLimit: 1, allied: false, betrayed: false };
  if (p.skip) {
    p.skip = false;
    emit('skip', { player: p.id });
    return nextTurn(s);
  }
  const last = lastPlace(s);
  if (last && last.id === p.id) {
    s.ctx.tailwind = true;
    addInf(s, p, 1);
    emit('tailwind', { player: p.id });
  }
  s.pending = { kind: 'turn', player: p.id };
  emit('turnStart', { player: p.id, round: s.round });
}

function nextTurn(s) {
  if (s.winner != null) return;
  s.turnCount++;
  s.current = (s.current + 1) % s.players.length;
  if (s.current === 0) {
    s.round++;
    if (s.round > s.settings.maxRounds) return endGame(s, 'score', ranking(s)[0].id);
    roundStart(s);
  }
  startTurn(s);
}

function roundStart(s) {
  emit('roundStart', { round: s.round, storm: stormActive(s) });
  for (const p of s.players) {
    if (p.ally != null && p.allyUntil < s.round) {
      const q = s.players[p.ally];
      p.ally = null; q.ally = null;
      p.reputation++; q.reputation++; clampRep(p); clampRep(q);
      emit('allianceEnd', { a: p.id, b: q.id });
    }
  }
  if (s.rules.incomeUntil >= s.round) for (const p of s.players) addInf(s, p, 1);
  if (s.rules.quizBonusUntil && s.rules.quizBonusUntil < s.round) s.rules.quizBonusUntil = 0;
  if (stormActive(s)) {
    if (s.round === s.stormRound + 1) emit('stormBegins');
    removeFields(s, 4);
    for (const p of s.players) if (!p.stormImmune && p.influence > 0 && s.round % 2 === 0) addInf(s, p, -1);
  }
}

function removeFields(s, n) {
  const occupied = new Set(s.players.map((p) => p.pos));
  const cand = NODES.filter((nd) => nd.type !== 'hub' && nd.type !== 'challenge' && nd.next.length < 2
    && !s.mods.removed.includes(nd.id) && !occupied.has(nd.id)).map((nd) => nd.id);
  const picked = shuffle(s, cand).slice(0, Math.min(n, Math.max(0, 70 - s.mods.removed.length)));
  if (!picked.length) return;
  s.mods.removed.push(...picked);
  emit('fieldsRemoved', { nodes: picked });
}

function beginMove(s, p, steps) {
  s.ctx.steps = steps;
  s.ctx.path = [p.pos];
  continueMove(s, p);
}

function continueMove(s, p) {
  while (s.ctx.steps > 0) {
    const opts = openNext(s, p.pos);
    if (!opts.length) break;
    if (opts.length > 1) {
      s.pending = { kind: 'path', player: p.id, options: opts, steps: s.ctx.steps };
      if (s.ctx.path.length > 1) emit('move', { player: p.id, path: s.ctx.path.slice(), partial: true });
      s.ctx.path = [p.pos];
      return;
    }
    if (stepTo(s, p, opts[0])) return;
  }
  finishMove(s, p);
}

// Gibt true zurück, wenn das Spiel durch den Schritt geendet hat.
function stepTo(s, p, n) {
  p.pos = n;
  p.stats.steps++;
  s.ctx.steps--;
  s.ctx.path.push(n);
  const node = NODES[n];
  if (n === BOARD.hub && isEligible(s, p)) {
    emit('move', { player: p.id, path: s.ctx.path.slice() });
    endGame(s, 'portal', p.id);
    return true;
  }
  if (node.type === 'challenge' && !p.beaten.includes(node.island) && !s.mods.removed.includes(n)) s.ctx.steps = 0;
  return false;
}

function finishMove(s, p) {
  if (s.ctx.path.length > 1) emit('move', { player: p.id, path: s.ctx.path.slice() });
  land(s, p);
}

function land(s, p, depth = 0) {
  const node = NODES[p.pos];
  emit('land', { player: p.id, node: node.id, field: node.type });
  if (s.mods.removed.includes(node.id)) { emit('voidField', { player: p.id }); return toPost(s, p); }
  switch (node.type) {
    case 'topic': return startQuiz(s, p, node.id);
    case 'event': return runEvent(s, p);
    case 'duel': return startDuelSetup(s, p);
    case 'parliament': return startParliament(s, p);
    case 'concert': return startConcert(s, p);
    case 'market': s.pending = { kind: 'market', player: p.id, bought: 0, star: false, fragment: false }; return;
    case 'portal': {
      const here = node.island;
      s.pending = { kind: 'portal', player: p.id, options: [0, 1, 2, 3, 4, 5].filter((i) => i !== here) };
      return;
    }
    case 'challenge':
      if (p.beaten.includes(node.island)) { addInf(s, p, 1); emit('bossBeatenAlready', { player: p.id }); return toPost(s, p); }
      return startChallenge(s, p, node.island);
    case 'hub':
      addInf(s, p, 1);
      emit('portalClosed', { player: p.id });
      return toPost(s, p);
    case 'archive': {
      // Archiv: eine Karte und 1 Einfluss
      const card = drawCard(s, p);
      addInf(s, p, 1);
      p.stats.archives++;
      emit('archive', { player: p.id, card });
      return toPost(s, p);
    }
    case 'stream': {
      // Zeitstrom: trägt die Figur bis zum Ziel des Stroms, dort wird das Feld ausgeführt
      if (depth > 2 || node.streamTo == null) return toPost(s, p);
      const path = [node.id];
      let cur = node.id;
      while (cur !== node.streamTo && path.length < 12) { cur = NODES[cur].next[0]; path.push(cur); }
      p.pos = node.streamTo;
      p.stats.streams++;
      emit('stream', { player: p.id, path });
      return land(s, p, depth + 1);
    }
    default: return toPost(s, p);
  }
}

function toPost(s, p) {
  if (s.winner != null) return;
  s.pending = { kind: 'post', player: s.current };
}

// ---------------------------------------------------------------- Quiz
function startQuiz(s, p, nodeId) {
  const topic = effectiveTopic(s, nodeId);
  const island = islandOf(nodeId);
  const q = drawQuestion(s, [topic], ['mc', 'tf', 'est'], island, targetDiff(s, island));
  s.pending = { kind: 'quiz', player: p.id, qid: q.id, order: questionOrder(s, q), topic, removed: [], second: false, double: false, extraTime: 0 };
  emit('quiz', { player: p.id, qid: q.id });
}

function quizInfluence(s, q) {
  return 1 + q.diff + s.rules.quizBonus + (s.rules.quizBonusUntil ? 1 : 0) + (stormActive(s) ? 1 : 0);
}

function answerQuiz(s, p, ans) {
  const pd = s.pending;
  const q = BANK_BY_ID[pd.qid];
  const ok = checkAnswer(q, ans);
  if (!ok && pd.second) {
    pd.second = false;
    if (q.type === 'mc' && typeof ans === 'number') pd.removed.push(ans);
    emit('secondChance', { player: p.id, qid: q.id, answer: ans });
    return;
  }
  emit('quizResult', { player: p.id, qid: q.id, answer: ans, correct: ok });
  if (ok) {
    p.stats.correct++;
    const inf = quizInfluence(s, q);
    if (p.ally != null) { addInf(s, s.players[p.ally], 1); emit('allyShare', { player: p.ally, from: p.id }); }
    s.pending = { kind: 'reward', player: p.id, topic: pd.topic, inf, double: pd.double };
  } else {
    p.stats.wrong++;
    toPost(s, p);
  }
}

function useJoker(s, p, cardId) {
  const pd = s.pending;
  if (CARDS[cardId]?.when !== 'quiz' || !p.cards.includes(cardId)) return false;
  const q = BANK_BY_ID[pd.qid];
  if (cardId === 'j_fifty') {
    if (q.type !== 'mc') return false;
    const wrong = shuffle(s, [1, 2, 3].filter((i) => !pd.removed.includes(i)));
    pd.removed.push(...wrong.slice(0, 2));
  } else if (cardId === 'j_swap') {
    const nq = drawQuestion(s, [q.topic], [q.type === 'order' || q.type === 'match' ? q.type : 'mc', 'tf'], q.epoch, q.diff);
    pd.qid = nq.id; pd.order = questionOrder(s, nq); pd.removed = [];
  } else if (cardId === 'j_second') pd.second = true;
  else if (cardId === 'j_double') pd.double = true;
  else if (cardId === 'j_time') pd.extraTime = (pd.extraTime || 0) + 30;
  removeCard(p, cardId);
  p.stats.cardsPlayed++;
  emit('cardPlayed', { player: p.id, card: cardId });
  return true;
}

// ---------------------------------------------------------------- Ereignisse
function runEvent(s, p) {
  if (!s.decks.events.length) s.decks.events = shuffle(s, EVENTS.map((e) => e.id));
  const id = s.decks.events.pop();
  applyEventEffects(s, EVENTS.find((e) => e.id === id).fx);
  emit('event', { id, player: p.id });
  toPost(s, p);
}

function applyEventEffects(s, fx) {
  const P = s.players;
  for (const f of fx) {
    switch (f.op) {
      case 'inf': P.forEach((p) => addInf(s, p, f.n)); break;
      case 'draw': P.forEach((p) => { for (let i = 0; i < f.n; i++) drawCard(s, p); }); break;
      case 'handCap': P.forEach((p) => { while (p.cards.length > s.rules.handLimit) p.cards.shift(); }); break;
      case 'redistribute': {
        const total = P.reduce((a, p) => a + p.influence, 0);
        const each = Math.floor(total / P.length);
        s.fund += total - each * P.length;
        P.forEach((p) => { p.influence = each; });
        break;
      }
      case 'richToPoor': {
        const sorted = [...P].sort((a, b) => b.influence - a.influence);
        const rich = sorted[0], poor = sorted[sorted.length - 1];
        if (rich !== poor) { const n = Math.min(f.n, rich.influence); addInf(s, rich, -n); addInf(s, poor, n); }
        break;
      }
      case 'leaderInf': addInf(s, leader(s), f.n); break;
      case 'lastInf': { const r = ranking(s); addInf(s, r[r.length - 1], f.n); break; }
      case 'starForWeakest': {
        const min = Math.min(...P.map(starColors));
        for (const p of P.filter((x) => starColors(x) === min)) {
          const miss = missingTopics(s, p);
          if (miss.length) p.stars[pick(s, miss)]++;
        }
        break;
      }
      case 'loseCard': P.forEach((p) => { if (p.cards.length) p.cards.splice(randInt(s, 0, p.cards.length - 1), 1); }); break;
      case 'leaderLoseCard': { const l = leader(s); if (l.cards.length) l.cards.splice(randInt(s, 0, l.cards.length - 1), 1); break; }
      case 'cardForLast': { const r = ranking(s); for (let i = 0; i < f.n; i++) drawCard(s, r[r.length - 1]); break; }
      case 'fundPayout': {
        const each = Math.floor(s.fund / P.length);
        P.forEach((p) => addInf(s, p, each));
        s.fund -= each * P.length;
        break;
      }
      case 'fundTax': P.forEach((p) => { const n = Math.min(f.n, p.influence); addInf(s, p, -n); s.fund += n; }); break;
      case 'rep': P.forEach((p) => { p.reputation += f.n; clampRep(p); }); break;
      case 'leaderRep': { const l = leader(s); l.reputation += f.n; clampRep(l); break; }
      case 'breakShields': P.forEach((p) => { p.shieldUntil = 0; p.reflect = false; }); break;
      case 'breakAlliances': P.forEach((p) => { p.ally = null; p.allyUntil = 0; }); break;
      case 'quizBonus': s.rules.quizBonusUntil = s.round + f.rounds; break;
      case 'fragmentWeakest': {
        const min = Math.min(...P.map((p) => p.fragments));
        const max = Math.max(...P.map((p) => p.fragments));
        const weak = P.filter((p) => p.fragments === min);
        if (min < max && weak.length === 1) weak[0].fragments++;
        else P.forEach((p) => addInf(s, p, 1));
        break;
      }
      case 'leaderLoseFragment': {
        const l = [...P].sort((a, b) => b.fragments - a.fragments)[0];
        if (l.fragments >= 3 && !hasShield(s, l)) l.fragments--;
        break;
      }
      case 'scatter': P.forEach((p) => { if (p.pos !== BOARD.hub) p.pos = BOARD.islands[randInt(s, 0, 5)].ids.e; }); emit('scatter', { positions: P.map((p) => p.pos) }); break;
      case 'stormRemove': removeFields(s, f.n); break;
      case 'repairFields': { const back = s.mods.removed.splice(0, f.n); if (back.length) emit('fieldsRepaired', { nodes: back }); break; }
      case 'halveInf': P.forEach((p) => { p.influence = Math.ceil(p.influence / 2); }); break;
      case 'skipLeader': { const l = leader(s); if (!hasShield(s, l)) l.skip = true; break; }
      default: break;
    }
  }
}

// ---------------------------------------------------------------- Duell
export function duelTargets(s, p) {
  if (s.rules.duelBanUntil >= s.round) return [];
  return s.players.filter((o) => o.id !== p.id && o.id !== p.ally && !hasShield(s, o)).map((o) => o.id);
}

function startDuelSetup(s, p) {
  const targets = duelTargets(s, p);
  if (!targets.length) {
    addInf(s, p, 2);
    emit('duelNone', { player: p.id });
    return toPost(s, p);
  }
  s.pending = { kind: 'duelSetup', player: p.id, targets, topics: activeTopics(s) };
}

function startDuel(s, p, target, topic, stake) {
  const o = s.players[target];
  if (stake === 'fragment' && (p.fragments < 1 || o.fragments < 1)) stake = 'influence';
  const q = drawQuestion(s, [topic], ['mc', 'tf'], -1, 2);
  s.pending = { kind: 'duel', players: [p.id, target], waiting: [p.id, target], qid: q.id, order: questionOrder(s, q), answers: {}, stake, topic, round: 1, removed: [] };
  emit('duelStart', { a: p.id, b: target, topic, stake, qid: q.id });
}

function resolveDuel(s) {
  const pd = s.pending;
  const [a, b] = pd.players;
  const q = BANK_BY_ID[pd.qid];
  const A = s.players[a], B = s.players[b];
  let winner = null;
  if (q.type === 'est') {
    const da = Math.abs((pd.answers[a] ?? Infinity) - q.c), db = Math.abs((pd.answers[b] ?? Infinity) - q.c);
    if (da < db) winner = a; else if (db < da) winner = b;
  } else {
    const ca = checkAnswer(q, pd.answers[a]), cb = checkAnswer(q, pd.answers[b]);
    if (ca && !cb) winner = a; else if (cb && !ca) winner = b;
    else if (pd.round === 1) {
      emit('duelRound', { a, b, qid: q.id, answers: { ...pd.answers }, tie: true });
      const est = drawQuestion(s, activeTopics(s), ['est'], -1, 2);
      if (est.type === 'est') {
        Object.assign(pd, { qid: est.id, order: [], answers: {}, waiting: [a, b], round: 2 });
        return;
      }
    }
  }
  const result = { a, b, qid: q.id, answers: { ...pd.answers }, winner, stake: pd.stake };
  if (winner != null) {
    const W = s.players[winner], L = winner === a ? B : A;
    if (pd.stake === 'fragment' && L.fragments > 0) { L.fragments--; W.fragments++; result.amount = 1; }
    else {
      const amount = Math.min(L.influence, 3 * s.rules.duelStake * (stormActive(s) ? 2 : 1));
      addInf(s, L, -amount); addInf(s, W, amount); result.amount = amount;
    }
    // Siegprämie aus der Bank: macht Duelle zu einem eigenständigen Weg (Saboteur-Spielstil)
    addInf(s, W, 2);
    drawCard(s, W);
    W.stats.duelsWon++; L.stats.duelsLost++;
  }
  emit('duelResult', result);
  toPost(s, s.players[s.current]);
}

// ---------------------------------------------------------------- Parlament
function motionApplicable(s, m) {
  switch (m.op) {
    case 'openBridge': return !s.mods.opened.includes(m.b);
    case 'closeBridge': {
      const br = BOARD.bridges[m.island];
      return !s.mods.blocked.includes(`${br.from}>${br.node}`) && openNext(s, br.from).length > 1;
    }
    case 'closeSpoke': {
      const sp = BOARD.spokes[m.island];
      return !s.mods.blocked.includes(`${sp.from}>${sp.to}`) && openNext(s, sp.from).length > 1;
    }
    case 'recolor': return s.mods.recolor[m.island] !== m.topic && activeTopics(s).includes(m.topic);
    case 'rule':
      if (m.rule === 'storm') return !stormActive(s);
      if (m.rule === 'handLimit') return s.rules.handLimit > m.value;
      if (m.rule === 'duelStake') return s.rules.duelStake < 2;
      if (m.rule === 'bossEasy') return !s.rules.bossEasy;
      if (m.rule === 'marketDiscount') return s.rules.marketDiscount < 2;
      return true;
    case 'fundPayout': return s.fund >= s.players.length;
    default: return true;
  }
}

function drawMotions(s, n) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 80) {
    if (!s.decks.motions.length) s.decks.motions = shuffle(s, MOTIONS.map((m) => m.id));
    const id = s.decks.motions.pop();
    const m = MOTIONS.find((x) => x.id === id);
    if (motionApplicable(s, m) && !out.includes(id)) out.push(id);
  }
  return out;
}

function startParliament(s, p) {
  const options = drawMotions(s, 2);
  if (!options.length) { addInf(s, p, 1); return toPost(s, p); }
  s.pending = { kind: 'motion', player: p.id, options };
}

function startVote(s, p, motionId) {
  s.pending = { kind: 'vote', motion: motionId, proposer: p.id, waiting: s.players.map((x) => x.id), votes: {} };
  emit('motionProposed', { player: p.id, motion: motionId });
}

function resolveVote(s) {
  const pd = s.pending;
  const m = MOTIONS.find((x) => x.id === pd.motion);
  let yes = 0, no = 0, veto = null, flip = false;
  const weights = {};
  for (const p of s.players) {
    const v = pd.votes[p.id] || { side: 'abstain', bid: 0 };
    let w = 0;
    if (v.side !== 'abstain') {
      w = voteBase(s, p) + v.bid;
      if (v.card === 'v_double') w *= 2;
      if (p.ally != null) {
        const av = pd.votes[p.ally];
        if (av && av.side === v.side) w += 1;
      }
    }
    weights[p.id] = w;
    if (v.side === 'yes') yes += w; else if (v.side === 'no') no += w;
    if (v.card === 'v_veto' || v.card === 'v_super' || v.card === 'v_delay') veto = veto ?? p.id;
    if (v.card === 'v_flip') flip = !flip;
    const paid = v.side === 'abstain' || v.card === 'v_super' ? 0 : v.bid;
    addInf(s, p, -paid);
    s.fund += paid;
    p.stats.bidTotal += paid;
  }
  let passed = yes > no;
  if (flip) passed = !passed;
  if (veto != null) passed = false;
  if (passed) {
    applyMotion(s, m);
    const prop = s.players[pd.proposer];
    addInf(s, prop, 2);
    prop.stats.motionsPassed++;
  }
  for (const p of s.players) {
    const v = pd.votes[p.id];
    if (v && v.side !== 'abstain' && (v.side === 'yes') === passed && veto == null) p.stats.votesWon++;
  }
  if (veto != null && pd.votes[veto]?.card === 'v_delay') s.decks.motions.unshift(pd.motion);
  emit('voteResult', { motion: pd.motion, votes: pd.votes, weights, yes, no, passed, veto, flip });
  toPost(s, s.players[s.current]);
}

function applyMotion(s, m) {
  switch (m.op) {
    case 'openBridge': s.mods.opened.push(m.b); emit('boardChanged', { kind: 'open', b: m.b }); break;
    case 'closeBridge': { const br = BOARD.bridges[m.island]; s.mods.blocked.push(`${br.from}>${br.node}`); emit('boardChanged', { kind: 'close', island: m.island }); break; }
    case 'closeSpoke': { const sp = BOARD.spokes[m.island]; s.mods.blocked.push(`${sp.from}>${sp.to}`); emit('boardChanged', { kind: 'spoke', island: m.island }); break; }
    case 'recolor': s.mods.recolor[m.island] = m.topic; emit('boardChanged', { kind: 'recolor', island: m.island }); break;
    case 'rule':
      if (m.rule === 'quizBonus') s.rules.quizBonus += m.value;
      else if (m.rule === 'duelBan') s.rules.duelBanUntil = s.round + m.value;
      else if (m.rule === 'duelStake') s.rules.duelStake = m.value;
      else if (m.rule === 'handLimit') { s.rules.handLimit = m.value; applyEventEffects(s, [{ op: 'handCap' }]); }
      else if (m.rule === 'income') s.rules.incomeUntil = s.round + m.value;
      else if (m.rule === 'storm') s.stormRound = Math.max(s.round, s.stormRound + m.value);
      else if (m.rule === 'marketDiscount') s.rules.marketDiscount += m.value;
      else if (m.rule === 'bossEasy') s.rules.bossEasy = 1;
      break;
    case 'fundTax': applyEventEffects(s, [{ op: 'fundTax', n: m.n }]); break;
    case 'fundPayout': applyEventEffects(s, [{ op: 'fundPayout' }]); break;
    case 'richTax': { const r = [...s.players].sort((a, b) => b.influence - a.influence)[0]; const n = Math.min(m.n, r.influence); addInf(s, r, -n); s.fund += n; break; }
    case 'amnesty': s.players.forEach((p) => { p.reputation = 5; }); break;
    case 'draw': applyEventEffects(s, [{ op: 'draw', n: m.n }]); break;
    default: break;
  }
}

// ---------------------------------------------------------------- Konzert, Markt, Portal, Herausforderung
const MINIGAMES = ['rhythm', 'melody', 'instrument'];
function startConcert(s, p) {
  s.pending = { kind: 'concert', player: p.id, game: pick(s, MINIGAMES), seed: randInt(s, 1, 1e9), level: 1 + Math.min(2, Math.floor((s.round - 1) / 10)) };
  emit('concert', { player: p.id, game: s.pending.game });
}

export function marketPrices(s) {
  const d = s.rules.marketDiscount;
  return { card: Math.max(1, 3 - d), star: Math.max(3, 6 - d), fragment: Math.max(7, 10 - d * 2), sell: 3 };
}

function portalJump(s, p, island) {
  const r = randInt(s, 1, 6);
  let result;
  if (r === 1 && !p.stormImmune) {
    const lose = Math.min(3, p.influence);
    addInf(s, p, -lose);
    if (p.cards.length) p.cards.splice(randInt(s, 0, p.cards.length - 1), 1);
    result = 'penalty';
  } else {
    const target = r === 2 ? randInt(s, 0, 5) : island;
    p.pos = BOARD.islands[target].ids.e;
    result = r === 2 ? 'random' : 'ok';
  }
  emit('portalJump', { player: p.id, roll: r, result, pos: p.pos });
  toPost(s, p);
}

function startChallenge(s, p, island) {
  const type = EPOCH_INFO[EPOCHS[island]].boss;
  const topics = activeTopics(s);
  const diff = targetDiff(s, island);
  const stages = [];
  if (type === 'order' || type === 'match') stages.push(drawQuestion(s, topics, [type], island, diff).id);
  while (stages.length < 3) stages.push(drawQuestion(s, topics, stages.length === 2 && type === 'match' ? ['est'] : ['mc', 'tf'], island, diff).id);
  const needed = 2 - (s.rules.bossEasy ? 1 : 0) + (s.settings.difficulty === 'schwer' ? 1 : 0);
  const first = BANK_BY_ID[stages[0]];
  s.pending = { kind: 'challenge', player: p.id, island, boss: type, stages, stage: 0, correct: 0, needed, qid: stages[0], order: questionOrder(s, first), removed: [], second: false, double: false, extraTime: 0 };
  emit('challengeStart', { player: p.id, island, boss: type });
}

function answerChallenge(s, p, ans) {
  const pd = s.pending;
  const q = BANK_BY_ID[pd.qid];
  const ok = checkAnswer(q, ans);
  if (!ok && pd.second) {
    pd.second = false;
    if (q.type === 'mc' && typeof ans === 'number') pd.removed.push(ans);
    emit('secondChance', { player: p.id, qid: q.id, answer: ans });
    return;
  }
  if (ok) { pd.correct++; p.stats.correct++; } else p.stats.wrong++;
  emit('challengeStep', { player: p.id, qid: q.id, answer: ans, correct: ok, stage: pd.stage, total: pd.correct });
  pd.stage++;
  const remaining = pd.stages.length - pd.stage;
  if (pd.correct >= pd.needed || pd.correct + remaining < pd.needed) {
    const won = pd.correct >= pd.needed;
    if (won) {
      p.fragments += pd.double ? 2 : 1;
      p.beaten.push(pd.island);
      addInf(s, p, 2);
      p.stats.challenges++;
    }
    emit('challengeResult', { player: p.id, island: pd.island, won });
    return toPost(s, p);
  }
  const nq = BANK_BY_ID[pd.stages[pd.stage]];
  Object.assign(pd, { qid: nq.id, order: questionOrder(s, nq), removed: [] });
}

// ---------------------------------------------------------------- Karten zu Zugbeginn
function playTurnCard(s, p, a) {
  const def = CARDS[a.card];
  if (!def || def.when !== 'turn' || !p.cards.includes(a.card)) return 'invalid card';
  if (s.ctx.cardPlayed && def.kind !== 'jump') return 'one card per turn';
  let target = null;
  if (def.target) {
    target = s.players[a.target];
    if (!target || target.id === p.id) return 'invalid target';
  }
  removeCard(p, a.card);
  p.stats.cardsPlayed++;
  emit('cardPlayed', { player: p.id, card: a.card, target: target?.id });

  if (def.kind === 'jump') {
    const kind = a.card;
    if (kind === 't_island') {
      const isl = p.pos === BOARD.hub ? 0 : (islandOf(p.pos) + 1) % 6;
      p.pos = BOARD.islands[isl].ids.e;
      emit('teleport', { player: p.id, pos: p.pos });
      land(s, p);
      return null;
    }
    let steps = 4;
    if (kind === 't_six') steps = 10;
    else if (kind === 't_choose') steps = Math.max(2, Math.min(12, a.value | 0 || 2));
    else if (kind === 't_double') {
      const values = [randInt(s, 1, 6), randInt(s, 1, 6), randInt(s, 1, 6)];
      steps = values[0] + values[1] + values[2];
      emit('roll', { player: p.id, values, total: steps });
    }
    s.pending = { kind: 'moving', player: p.id };
    beginMove(s, p, steps);
    return null;
  }

  s.ctx.cardPlayed = true;
  if ((def.kind === 'sabotage' || def.kind === 'spy') && target) {
    if (hasShield(s, target)) { emit('blocked', { player: target.id, card: a.card }); return null; }
    if (target.reflect && def.kind === 'sabotage') {
      target.reflect = false;
      emit('reflected', { player: target.id, card: a.card });
      [target] = [p];
    }
    if (def.kind === 'sabotage') {
      p.stats.sabotages++;
      // Kopfgeld: Wer den Führenden sabotiert, erhält 3 Einfluss
      const lead = leader(s);
      if (target.id === lead.id && target.id !== p.id) { addInf(s, p, 3); emit('bounty', { player: p.id, target: target.id }); }
    }
    applyTargetCard(s, p, target, a.card);
    return null;
  }
  if (a.card === 'sp_scout') { drawCard(s, p); drawCard(s, p); }
  else if (a.card === 'sh_small') p.shieldUntil = s.round + 1;
  else if (a.card === 'sh_big') p.shieldUntil = s.round + 3;
  else if (a.card === 'sh_reflect') p.reflect = true;
  else if (a.card === 'sh_storm') { p.stormImmune = true; p.shieldUntil = Math.max(p.shieldUntil, s.round + 1); }
  else if (a.card === 'sh_pact') { p.shieldUntil = s.round + 1; if (p.ally != null) s.players[p.ally].shieldUntil = s.round + 1; }
  return null;
}

function applyTargetCard(s, p, t, card) {
  const actor = p;
  switch (card) {
    case 's_inf': { const n = Math.min(4, t.influence); addInf(s, t, -n); if (t !== actor) addInf(s, actor, n); break; }
    case 's_card': case 'sp_steal': {
      if (t.cards.length && t !== actor) { const c = t.cards.splice(randInt(s, 0, t.cards.length - 1), 1)[0]; actor.cards.push(c); while (actor.cards.length > s.rules.handLimit) actor.cards.shift(); }
      break;
    }
    case 's_back': if (t.pos !== BOARD.hub) { t.pos = BOARD.islands[islandOf(t.pos)].ids.e; emit('teleport', { player: t.id, pos: t.pos }); } break;
    case 's_skip': t.skip = true; break;
    case 's_star': {
      const owned = TOPICS.filter((x) => t.stars[x] > 0);
      if (owned.length) {
        const dup = owned.filter((x) => t.stars[x] > 1);
        t.stars[pick(s, dup.length ? dup : owned)]--;
      }
      break;
    }
    case 'sp_peek': emit('peek', { player: actor.id, target: t.id, cards: t.cards.slice() }); if (t !== actor) { const n = Math.min(1, t.influence); addInf(s, t, -n); addInf(s, actor, n); } break;
    case 'sp_copy': if (t.cards.length) { actor.cards.push(pick(s, t.cards)); while (actor.cards.length > s.rules.handLimit) actor.cards.shift(); } break;
    case 'sp_dossier': t.reputation -= 2; clampRep(t); addInf(s, actor, 2); break;
    default: break;
  }
}

// ---------------------------------------------------------------- Handel & Bündnisse
function hasAssets(p, bundle) {
  if (!bundle) return true;
  if ((bundle.influence || 0) > p.influence) return false;
  for (const [t, n] of Object.entries(bundle.stars || {})) if ((p.stars[t] || 0) < n) return false;
  const cards = p.cards.slice();
  for (const c of bundle.cards || []) { const i = cards.indexOf(c); if (i < 0) return false; cards.splice(i, 1); }
  return true;
}
function transfer(s, from, to, bundle) {
  if (!bundle) return;
  const inf = bundle.influence || 0;
  addInf(s, from, -inf); addInf(s, to, inf);
  for (const [t, n] of Object.entries(bundle.stars || {})) { from.stars[t] -= n; to.stars[t] += n; }
  for (const c of bundle.cards || []) { removeCard(from, c); to.cards.push(c); }
  while (to.cards.length > s.rules.handLimit) to.cards.shift();
}
function bundleEmpty(b) {
  return !b || (!(b.influence > 0) && !Object.values(b.stars || {}).some((n) => n > 0) && !(b.cards || []).length);
}
function sanitizeBundle(b) {
  b = b || {};
  const stars = {};
  for (const t of TOPICS) { const n = Math.max(0, Math.floor(b.stars?.[t] || 0)); if (n) stars[t] = n; }
  return { influence: Math.max(0, Math.floor(b.influence || 0)), stars, cards: Array.isArray(b.cards) ? b.cards.filter((c) => CARDS[c]).slice(0, 5) : [] };
}

// ---------------------------------------------------------------- Spielende
function endGame(s, type, winnerId) {
  s.winner = winnerId;
  s.winType = type;
  s.pending = { kind: 'gameover' };
  emit('gameOver', { winner: winnerId, type, ranking: ranking(s).map((p) => p.id) });
}

export function awards(s) {
  const P = s.players;
  const best = (fn) => { const max = Math.max(...P.map(fn)); return max > 0 ? P.filter((p) => fn(p) === max).map((p) => p.id) : []; };
  return {
    brain: best((p) => p.stats.correct),
    traitor: best((p) => p.stats.betrayals),
    politician: best((p) => p.stats.motionsPassed * 2 + p.stats.votesWon),
    duelist: best((p) => p.stats.duelsWon),
    saboteur: best((p) => p.stats.sabotages),
    musician: best((p) => p.stats.music),
    walker: best((p) => p.stats.steps),
    tycoon: best((p) => p.stats.influenceMax),
    lucky: best((p) => p.stats.doubles || 0),
    archivist: best((p) => p.stats.archives || 0),
  };
}

// ---------------------------------------------------------------- Aktionen
export function applyAction(s, a) {
  EV = [];
  const err = dispatch(s, a);
  if (err) return { ok: false, error: err, events: [] };
  flushLog(s);
  return { ok: true, events: EV };
}

function flushLog(s) {
  for (const e of EV) { e.seq = ++s.seq; s.log.push(e); }
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

function dispatch(s, a) {
  const pd = s.pending;
  if (!pd || pd.kind === 'gameover') return 'game over';
  const actors = pendingActors(pd);
  if (!actors.includes(a.player)) return 'not your turn';
  const p = s.players[a.player];

  switch (pd.kind) {
    case 'turn':
      if (a.type === 'roll') {
        // Zwei Würfel; Rückenwind: drei Würfel, die besten zwei zählen. Pasch bringt eine Karte.
        const values = [randInt(s, 1, 6), randInt(s, 1, 6)];
        if (s.ctx.tailwind) values.push(randInt(s, 1, 6));
        const best = values.slice().sort((x, y) => y - x).slice(0, 2);
        const total = best[0] + best[1];
        const doubles = best[0] === best[1];
        emit('roll', { player: p.id, values, total, tailwind: s.ctx.tailwind, doubles });
        if (doubles) {
          const card = drawCard(s, p);
          p.stats.doubles++;
          emit('doubles', { player: p.id, card });
        }
        s.pending = { kind: 'moving', player: p.id };
        beginMove(s, p, total);
        return null;
      }
      if (a.type === 'playCard') return playTurnCard(s, p, a);
      return 'bad action';

    case 'path': {
      if (a.type !== 'choosePath' || !pd.options.includes(a.node)) return 'bad path';
      s.pending = { kind: 'moving', player: p.id };
      if (!stepTo(s, p, a.node)) continueMove(s, p);
      return null;
    }

    case 'quiz':
      if (a.type === 'useJoker') return useJoker(s, p, a.card) ? null : 'joker invalid';
      if (a.type === 'answer') { answerQuiz(s, p, a.answer); return null; }
      return 'bad action';

    case 'challenge':
      if (a.type === 'useJoker') return useJoker(s, p, a.card) ? null : 'joker invalid';
      if (a.type === 'answer') { answerChallenge(s, p, a.answer); return null; }
      return 'bad action';

    case 'reward': {
      if (a.type !== 'reward') return 'bad action';
      const both = pd.double;
      if (a.choice === 'star' || both) { p.stars[pd.topic]++; }
      if (a.choice === 'influence' || both) addInf(s, p, pd.inf);
      emit('reward', { player: p.id, choice: both ? 'both' : a.choice, topic: pd.topic, inf: pd.inf });
      toPost(s, p);
      return null;
    }

    case 'duelSetup': {
      if (a.type === 'skipDuel') { emit('duelSkipped', { player: p.id }); toPost(s, p); return null; }
      if (a.type !== 'duel' || !pd.targets.includes(a.target)) return 'bad target';
      const topic = activeTopics(s).includes(a.topic) ? a.topic : activeTopics(s)[0];
      startDuel(s, p, a.target, topic, a.stake === 'fragment' ? 'fragment' : 'influence');
      return null;
    }

    case 'duel': {
      if (a.type !== 'answer') return 'bad action';
      pd.answers[p.id] = a.answer;
      pd.waiting = pd.waiting.filter((x) => x !== p.id);
      if (!pd.waiting.length) resolveDuel(s);
      return null;
    }

    case 'motion': {
      if (a.type !== 'propose' || !pd.options.includes(a.motion)) return 'bad motion';
      startVote(s, p, a.motion);
      return null;
    }

    case 'vote': {
      if (a.type !== 'vote') return 'bad action';
      const side = ['yes', 'no', 'abstain'].includes(a.side) ? a.side : 'abstain';
      const bid = Math.max(0, Math.min(p.influence, Math.floor(a.bid || 0)));
      let card = null;
      if (a.card && CARDS[a.card]?.when === 'vote' && p.cards.includes(a.card)) { card = a.card; removeCard(p, card); p.stats.cardsPlayed++; }
      pd.votes[p.id] = { side, bid, card };
      pd.waiting = pd.waiting.filter((x) => x !== p.id);
      emit('voted', { player: p.id });
      if (!pd.waiting.length) resolveVote(s);
      return null;
    }

    case 'concert': {
      if (a.type !== 'minigame') return 'bad action';
      const sc = Math.max(0, Math.min(1, Number(a.score) || 0));
      let reward = 'none';
      if (sc >= 0.75) { if (activeTopics(s).includes('mus')) { p.stars.mus++; reward = 'star'; } else reward = 'inf'; addInf(s, p, reward === 'star' ? 1 : 4); }
      else if (sc >= 0.4) { addInf(s, p, 2); reward = 'inf'; }
      p.stats.music = Math.max(p.stats.music, Math.round(sc * 100));
      emit('concertResult', { player: p.id, game: pd.game, score: sc, reward });
      toPost(s, p);
      return null;
    }

    case 'market': {
      const pr = marketPrices(s);
      if (a.type === 'buyCard') {
        if (pd.bought >= 2 || p.influence < pr.card) return 'cannot buy';
        addInf(s, p, -pr.card); pd.bought++; const c = drawCard(s, p); emit('bought', { player: p.id, what: 'card', card: c }); return null;
      }
      if (a.type === 'buyStar') {
        if (pd.star || p.influence < pr.star || !activeTopics(s).includes(a.topic)) return 'cannot buy';
        addInf(s, p, -pr.star); pd.star = true; p.stars[a.topic]++; emit('bought', { player: p.id, what: 'star', topic: a.topic }); return null;
      }
      if (a.type === 'buyFragment') {
        if (pd.fragment || p.influence < pr.fragment) return 'cannot buy';
        addInf(s, p, -pr.fragment); pd.fragment = true; p.fragments++; emit('bought', { player: p.id, what: 'fragment' }); return null;
      }
      if (a.type === 'sellStar') {
        if (!(p.stars[a.topic] > 0)) return 'no star';
        p.stars[a.topic]--; addInf(s, p, pr.sell); emit('bought', { player: p.id, what: 'sell', topic: a.topic }); return null;
      }
      // Auf dem Markt darf man danach zwei Handelsangebote an Mitspieler machen
      if (a.type === 'marketDone') { s.ctx.tradeLimit = 2; toPost(s, p); return null; }
      return 'bad action';
    }

    case 'portal': {
      if (a.type === 'portalStay') { toPost(s, p); return null; }
      if (a.type !== 'portalJump' || !pd.options.includes(a.island)) return 'bad island';
      portalJump(s, p, a.island);
      return null;
    }

    case 'post': {
      if (a.type === 'endTurn') { emit('turnEnd', { player: p.id }); nextTurn(s); return null; }
      if (a.type === 'trade') {
        if ((s.ctx.trades || 0) >= (s.ctx.tradeLimit || 1)) return 'already traded';
        const t = s.players[a.target];
        if (!t || t.id === p.id) return 'bad target';
        const offer = sanitizeBundle(a.offer), request = sanitizeBundle(a.request);
        if (bundleEmpty(offer) && bundleEmpty(request)) return 'empty trade';
        if (!hasAssets(p, offer) || !hasAssets(t, request)) return 'missing assets';
        s.ctx.trades = (s.ctx.trades || 0) + 1;
        s.pending = { kind: 'trade', player: t.id, from: p.id, to: t.id, offer, request, stage: 'offer' };
        emit('tradeOffer', { from: p.id, to: t.id, offer, request });
        return null;
      }
      if (a.type === 'ally') {
        if (s.ctx.allied || p.ally != null) return 'cannot ally';
        const t = s.players[a.target];
        if (!t || t.id === p.id || t.ally != null) return 'bad target';
        s.ctx.allied = true;
        s.pending = { kind: 'allianceReq', player: t.id, from: p.id };
        emit('allianceOffer', { from: p.id, to: t.id });
        return null;
      }
      if (a.type === 'betray') {
        if (p.ally == null || s.ctx.betrayed) return 'no ally';
        const q = s.players[p.ally];
        p.ally = null; q.ally = null; p.allyUntil = 0; q.allyUntil = 0;
        addInf(s, p, 4); p.reputation -= 3; clampRep(p);
        p.stats.betrayals++;
        s.ctx.betrayed = true;
        emit('betrayal', { player: p.id, victim: q.id });
        return null;
      }
      return 'bad action';
    }

    case 'trade': {
      const from = s.players[pd.from], to = s.players[pd.to];
      if (a.type === 'tradeAccept') {
        if (hasAssets(from, pd.offer) && hasAssets(to, pd.request)) {
          transfer(s, from, to, pd.offer); transfer(s, to, from, pd.request);
          from.stats.trades++; to.stats.trades++;
          emit('tradeDone', { from: from.id, to: to.id, offer: pd.offer, request: pd.request });
        } else emit('tradeFailed', { from: from.id, to: to.id });
        toPost(s, p); return null;
      }
      if (a.type === 'tradeReject') { emit('tradeRejected', { from: from.id, to: to.id, by: p.id }); toPost(s, p); return null; }
      if (a.type === 'tradeCounter' && pd.stage === 'offer') {
        const offer = sanitizeBundle(a.offer), request = sanitizeBundle(a.request);
        if (!hasAssets(from, offer) || !hasAssets(to, request)) return 'missing assets';
        Object.assign(pd, { offer, request, stage: 'counter', player: from.id });
        emit('tradeCounter', { from: from.id, to: to.id, offer, request });
        return null;
      }
      return 'bad action';
    }

    case 'allianceReq': {
      const from = s.players[pd.from];
      if (a.type === 'allyAccept' && from.ally == null && p.ally == null) {
        from.ally = p.id; p.ally = from.id;
        from.allyUntil = p.allyUntil = s.round + 5;
        emit('allianceFormed', { a: from.id, b: p.id });
      } else emit('allianceDeclined', { from: from.id, to: p.id });
      toPost(s, p);
      return null;
    }

    default: return 'no action expected';
  }
}

// ---------------------------------------------------------------- Sicht für einen Spieler (Netzwerk)
export function viewFor(s, playerId) {
  const v = JSON.parse(JSON.stringify(s));
  delete v.decks;
  v.rng = 0;
  for (const p of v.players) if (p.id !== playerId) p.cards = p.cards.map(() => '?');
  if (v.pending?.kind === 'vote') {
    for (const k of Object.keys(v.pending.votes)) if (Number(k) !== playerId) v.pending.votes[k] = { hidden: true };
  }
  if (v.pending?.kind === 'duel') {
    for (const k of Object.keys(v.pending.answers)) if (Number(k) !== playerId) v.pending.answers[k] = '?';
  }
  v.log = sanitizeEvents(v.log, playerId);
  return v;
}

// Verdeckte Informationen anderer Spieler entfernen (eingesehene/gezogene Karten)
export function sanitizeEvents(events, playerId) {
  return events.map((e) => {
    if (e.player === playerId) return e;
    if (e.type === 'peek') return { ...e, cards: [] };
    if ((e.type === 'archive' || e.type === 'doubles' || e.type === 'bought') && e.card) return { ...e, card: null };
    return e;
  });
}
