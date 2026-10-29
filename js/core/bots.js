// Einfache KI-Bots mit drei Spielstilen: scholar (Wissens-Sammler), politician (Politiker), saboteur (Saboteur).
// Bots verwenden einen eigenen Zufallsgenerator, damit Entscheidungen den Spiel-RNG nicht beeinflussen.
import { TOPICS, GOAL_FRAGMENTS } from './constants.js';
import { CARDS, MOTIONS } from './content.js';
import { BOARD, getQuestion, openNext, isEligible, missingTopics, score, ranking, duelTargets, marketPrices, effectiveTopic, hasShield, stormActive } from './engine.js';

const NODES = BOARD.nodes;
const R = { rng: 12345 };
function rnd() {
  let t = (R.rng = (R.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function seedBots(n) { R.rng = n >>> 0; }
const chance = (p) => rnd() < p;
const choice = (arr) => arr[Math.floor(rnd() * arr.length)];

export const BOT_STYLES = ['scholar', 'politician', 'saboteur'];
// Sabotage- und Spionagekarten nach Nutzen für den Spielenden selbst
const SAB_PRIORITY = ['s_inf', 'sp_dossier', 's_star', 's_skip', 'sp_steal', 's_card', 's_back', 'sp_copy', 'sp_peek'];
let ACCURACY = 0.72;
export function setBotAccuracy(a) { ACCURACY = a; }

function correctAnswer(q) {
  switch (q.type) {
    case 'mc': return 0;
    case 'tf': return q.c;
    case 'est': return q.c;
    default: return [...Array((q.pairs || q.a).length).keys()];
  }
}
function wrongAnswer(q, removed = []) {
  switch (q.type) {
    case 'mc': return choice([1, 2, 3].filter((i) => !removed.includes(i))) ?? 1;
    case 'tf': return !q.c;
    case 'est': return q.c + (chance(0.5) ? 1 : -1) * (q.tol + Math.max(1, Math.abs(q.c) * 0.3));
    default: { const n = (q.pairs || q.a).length; const a = [...Array(n).keys()]; [a[0], a[1]] = [a[1], a[0]]; return a; }
  }
}
function guess(q, removed) {
  const p = ACCURACY - 0.1 * (q.diff - 1) + (q.type === 'tf' ? 0.08 : 0) - (q.type === 'order' || q.type === 'match' ? 0.1 : 0);
  if (q.type === 'mc' && removed.length >= 2) return chance(Math.max(p, 0.6)) ? 0 : wrongAnswer(q, removed);
  if (q.type === 'est') {
    // Schätzungen streuen um den richtigen Wert
    const spread = q.tol * (chance(p) ? rnd() * 0.9 : 1.2 + rnd() * 2);
    return Math.round((q.c + (chance(0.5) ? spread : -spread)) * 100) / 100;
  }
  return chance(p) ? correctAnswer(q) : wrongAnswer(q, removed);
}

// Kürzeste Distanz (in Feldern) von jedem Knoten zu einer Zielmenge
function distancesTo(s, goals) {
  const dist = new Map();
  const rev = new Map();
  for (const n of NODES) for (const m of openNext(s, n.id)) { if (!rev.has(m)) rev.set(m, []); rev.get(m).push(n.id); }
  const queue = [];
  for (const g of goals) { dist.set(g, 0); queue.push(g); }
  while (queue.length) {
    const c = queue.shift();
    for (const pr of rev.get(c) || []) if (!dist.has(pr)) { dist.set(pr, dist.get(c) + 1); queue.push(pr); }
  }
  return dist;
}

function goalsFor(s, p) {
  if (isEligible(s, p)) return [BOARD.hub];
  const goals = [];
  const missing = missingTopics(s, p);
  if (p.fragments < GOAL_FRAGMENTS) {
    for (const isl of BOARD.islands) if (!p.beaten.includes(isl.index) && !s.mods.removed.includes(isl.ids.g)) goals.push(isl.ids.g);
  }
  if (missing.length && (p.fragments >= 3 || !goals.length)) {
    for (const n of NODES) if (n.type === 'topic' && !s.mods.removed.includes(n.id) && missing.includes(effectiveTopic(s, n.id))) goals.push(n.id);
  }
  const open = (id) => !s.mods.removed.includes(id);
  if (p.style === 'politician' && p.influence >= 9) for (const n of NODES) if (n.type === 'market' && open(n.id)) goals.push(n.id);
  if (p.style === 'saboteur' && p.cards.length < 2) for (const n of NODES) if (n.type === 'archive' && open(n.id)) goals.push(n.id);
  return goals.length ? goals : [BOARD.hub];
}

function cardValue(id) { return CARDS[id] ? 1.5 : 0; }
function bundleValue(s, p, b, receiving) {
  let v = (b.influence || 0);
  for (const [t, n] of Object.entries(b.stars || {})) {
    const have = p.stars[t];
    for (let i = 0; i < n; i++) {
      const count = receiving ? have + i : have - i - 1;
      v += count <= 0 ? 7 : 2.5;
    }
  }
  v += (b.cards || []).reduce((a, c) => a + cardValue(c), 0);
  return v;
}

function motionUtility(s, p, id) {
  const m = MOTIONS.find((x) => x.id === id);
  const rich = [...s.players].sort((a, b) => b.influence - a.influence)[0];
  const lead = ranking(s)[0];
  const st = p.style;
  switch (m.op) {
    case 'openBridge': return 0.5;
    case 'closeBridge': case 'closeSpoke': return lead.id === p.id ? -0.5 : 0.3;
    case 'recolor': return missingTopics(s, p).includes(m.topic) ? 1.5 : -0.3;
    case 'fundPayout': return s.fund >= 4 ? 1.5 : 0.2;
    case 'fundTax': return p.influence >= 8 ? -1 : -0.3;
    case 'richTax': return rich.id === p.id ? -2.5 : 1;
    case 'amnesty': return p.reputation < 5 ? 1.5 : -0.5;
    case 'draw': return st === 'saboteur' ? 1.5 : 0.6;
    case 'rule':
      switch (m.rule) {
        case 'quizBonus': return st === 'scholar' ? 2 : 0.6;
        case 'duelBan': return st === 'saboteur' ? -2.5 : st === 'scholar' ? 1.2 : 0;
        case 'duelStake': return st === 'saboteur' ? 2 : -1;
        case 'handLimit': return st === 'saboteur' ? -2 : 0.6;
        case 'income': return st === 'politician' ? 2 : 1;
        case 'storm': return (m.value < 0) === (lead.id === p.id) ? 1.5 : -1;
        case 'marketDiscount': return st === 'politician' ? 1.5 : 0.5;
        case 'bossEasy': return p.fragments < 4 ? 1.5 : 0;
        default: return 0;
      }
    default: return 0;
  }
}

export function botAction(s, pid, { timeout = false } = {}) {
  const pd = s.pending;
  const p = s.players[pid];
  const st = p.style;
  const me = (type, extra = {}) => ({ type, player: pid, ...extra });

  switch (pd.kind) {
    case 'turn': {
      if (timeout) return me('roll');
      const lead = ranking(s).find((o) => o.id !== pid);
      // Zeitsprung direkt ins Portal
      if (isEligible(s, p) && p.cards.includes('t_choose')) {
        const d = distancesTo(s, [BOARD.hub]).get(p.pos);
        if (d && d >= 2 && d <= 12) return me('playCard', { card: 't_choose', value: d });
      }
      if (!s.ctx.cardPlayed && p.cards.length) {
        const targets = s.players.filter((o) => o.id !== pid && o.id !== p.ally && !hasShield(s, o));
        const aggro = st === 'saboteur' ? 0.75 : st === 'politician' ? 0.35 : 0.25;
        const sab = SAB_PRIORITY.find((c) => p.cards.includes(c));
        if (sab && targets.length && chance(aggro)) {
          const t = targets.includes(lead) ? lead : targets.sort((a, b) => score(b) - score(a))[0];
          return me('playCard', { card: sab, target: t.id });
        }
        const shield = p.cards.find((c) => CARDS[c].kind === 'shield');
        if (shield && !hasShield(s, p) && (score(p) >= score(lead) || p.fragments >= 3) && chance(0.6)) return me('playCard', { card: shield });
        if (p.cards.includes('sp_scout') && chance(0.4)) return me('playCard', { card: 'sp_scout' });
        const jump = p.cards.find((c) => c === 't_six' || c === 't_double');
        if (jump && chance(0.2)) return me('playCard', { card: jump });
      }
      return me('roll');
    }
    case 'path': {
      const dist = distancesTo(s, goalsFor(s, p));
      let best = pd.options[0], bd = Infinity;
      for (const o of pd.options) {
        const d = (dist.get(o) ?? 99) + rnd() * 1.2;
        if (d < bd) { bd = d; best = o; }
      }
      if (chance(0.08)) best = choice(pd.options);
      return me('choosePath', { node: best });
    }
    case 'quiz':
    case 'challenge': {
      const q = getQuestion(pd.qid);
      if (timeout) return me('answer', { answer: null });
      if (pd.kind === 'challenge' && pd.stage === 0 && !pd.double && p.cards.includes('j_double') && chance(0.7)) return me('useJoker', { card: 'j_double' });
      if (q.type === 'mc' && !pd.removed.length && q.diff >= 2 && p.cards.includes('j_fifty') && chance(0.6)) return me('useJoker', { card: 'j_fifty' });
      if (!pd.second && pd.kind === 'challenge' && p.cards.includes('j_second') && chance(0.6)) return me('useJoker', { card: 'j_second' });
      return me('answer', { answer: guess(q, pd.removed) });
    }
    case 'reward': {
      const missing = p.stars[pd.topic] === 0;
      let choiceStar = true;
      if (st === 'politician') choiceStar = missing || (p.influence < 6 ? false : chance(0.3));
      else if (st === 'saboteur') choiceStar = missing || (p.influence < 6 ? false : chance(0.35));
      else choiceStar = missing || (p.influence < 6 ? chance(0.3) : chance(0.55));
      return me('reward', { choice: choiceStar ? 'star' : 'influence' });
    }
    case 'duelSetup': {
      if (timeout) return me('skipDuel');
      if (st === 'scholar' && chance(0.3)) return me('skipDuel');
      const ts = pd.targets.map((id) => s.players[id]).sort((a, b) => score(b) - score(a));
      const t = st === 'saboteur' ? ts[0] : choice(ts);
      const stake = p.fragments >= 1 && t.fragments >= 1 && (st === 'saboteur' ? chance(0.8) : chance(0.3)) ? 'fragment' : 'influence';
      return me('duel', { target: t.id, topic: choice(pd.topics), stake });
    }
    case 'duel': {
      const q = getQuestion(pd.qid);
      return me('answer', { answer: timeout ? null : guess(q, []) });
    }
    case 'motion': {
      const best = pd.options.map((id) => [id, motionUtility(s, p, id) + rnd() * 0.5]).sort((a, b) => b[1] - a[1])[0][0];
      return me('propose', { motion: best });
    }
    case 'vote': {
      if (timeout) return me('vote', { side: 'abstain', bid: 0 });
      let u = motionUtility(s, p, pd.motion) + (pd.proposer === pid ? 1.5 : 0);
      if (pd.proposer !== pid && s.players[pd.proposer].ally === pid) u += 0.8;
      const side = u > 0.4 ? 'yes' : u < -0.4 ? 'no' : 'abstain';
      let bid = 0;
      if (side !== 'abstain') {
        const eager = st === 'politician' ? 0.25 : 0.1;
        bid = Math.floor(Math.min(p.influence, p.influence * eager * Math.min(2, Math.abs(u))));
      }
      let card = null;
      const vetoes = p.cards.filter((c) => CARDS[c].when === 'vote');
      if (vetoes.length && u <= -1.5) card = vetoes.find((c) => c !== 'v_double') || null;
      else if (vetoes.includes('v_double') && Math.abs(u) >= 1.5) card = 'v_double';
      return me('vote', { side, bid, card });
    }
    case 'concert': {
      const sc = timeout ? 0 : Math.min(1, Math.max(0, 0.35 + rnd() * 0.65 - (pd.level - 1) * 0.08));
      return me('minigame', { score: sc });
    }
    case 'market': {
      if (timeout) return me('marketDone');
      const pr = marketPrices(s);
      const miss = missingTopics(s, p);
      const reserve = { politician: 0, saboteur: 0, scholar: 1 }[st];
      if (!pd.fragment && p.fragments < GOAL_FRAGMENTS && p.influence >= pr.fragment + reserve) return me('buyFragment');
      if (!pd.star && miss.length && p.influence >= pr.star + Math.min(2, reserve)) return me('buyStar', { topic: choice(miss) });
      if (pd.bought < 1 && p.influence >= pr.card + 3 && p.cards.length < 3 && chance(st === 'saboteur' ? 0.6 : 0.2)) return me('buyCard');
      if (st === 'politician' && miss.length && p.influence + 3 >= pr.star && !pd.star) {
        const dup = Object.keys(p.stars).find((t) => p.stars[t] >= 2);
        if (dup) return me('sellStar', { topic: dup });
      }
      return me('marketDone');
    }
    case 'portal': {
      if (timeout) return me('portalStay');
      const unbeaten = pd.options.filter((i) => !p.beaten.includes(i));
      if (isEligible(s, p)) {
        const d = distancesTo(s, [BOARD.hub]).get(p.pos) ?? 99;
        return d > 8 ? me('portalJump', { island: choice(pd.options) }) : me('portalStay');
      }
      if (unbeaten.length && chance(st === 'saboteur' ? 0.6 : 0.4)) return me('portalJump', { island: choice(unbeaten) });
      return me('portalStay');
    }
    case 'post': {
      if (timeout) return me('endTurn');
      const others = s.players.filter((o) => o.id !== pid);
      const lead = ranking(s)[0];
      if (p.ally != null && !s.ctx.betrayed) {
        const ally = s.players[p.ally];
        const w = st === 'saboteur' ? 0.25 : st === 'politician' ? 0.12 : 0.03;
        if (ally.id === lead.id && chance(w * 3)) return me('betray');
      }
      if (!s.ctx.allied && p.ally == null && chance(st === 'politician' ? 0.5 : 0.12)) {
        const cands = others.filter((o) => o.ally == null && o.id !== lead.id);
        if (cands.length) return me('ally', { target: choice(cands).id });
      }
      if ((s.ctx.trades || 0) < (s.ctx.tradeLimit || 1) && chance(st === 'politician' ? 0.45 : 0.3)) {
        const miss = missingTopics(s, p);
        for (const t of miss) {
          const seller = others.find((o) => o.stars[t] >= 2);
          if (seller && p.influence >= 4) return me('trade', { target: seller.id, offer: { influence: Math.min(p.influence, 5) }, request: { stars: { [t]: 1 } } });
        }
      }
      return me('endTurn');
    }
    case 'trade': {
      if (timeout) return me('tradeReject');
      const from = s.players[pd.from];
      const give = pd.player === pd.to ? pd.request : pd.offer;
      const get = pd.player === pd.to ? pd.offer : pd.request;
      const other = pd.player === pd.to ? from : s.players[pd.to];
      const vGet = bundleValue(s, p, get, true), vGive = bundleValue(s, p, give, false);
      const danger = isEligible(s, other) || (other.fragments >= 4 && missingTopics(s, other).length <= 1);
      if (!danger && vGet >= vGive) return me('tradeAccept');
      if (pd.stage === 'offer' && !danger && vGet + 3 >= vGive && (get.influence || 0) > 0) {
        const extra = Math.ceil(vGive - vGet) + 1;
        if (from.influence >= (pd.offer.influence || 0) + extra) return me('tradeCounter', { offer: { ...pd.offer, influence: (pd.offer.influence || 0) + extra }, request: pd.request });
      }
      return me('tradeReject');
    }
    case 'allianceReq': {
      const from = s.players[pd.from];
      const lead = ranking(s)[0];
      const ok = !timeout && from.reputation >= 4 && from.id !== lead.id && chance(st === 'politician' ? 0.75 : 0.5);
      return me(ok ? 'allyAccept' : 'allyReject');
    }
    default: return null;
  }
}

// Standardaktion bei Zeitüberschreitung eines menschlichen Spielers
export function timeoutAction(s, pid) { return botAction(s, pid, { timeout: true }); }

export { stormActive, TOPICS };
