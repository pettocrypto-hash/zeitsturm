// Automatisierte Bot-Simulation: node sim/simulate.mjs [Anzahl] [Seed]
// Prüft Abstürze, Endlosschleifen/Deadlocks und die Balance der drei Spielstile.
import { createGame, applyAction, setQuestionBank, pendingActors, ranking, score, BOARD } from '../js/core/engine.js';
import { botAction, seedBots, BOT_STYLES } from '../js/core/bots.js';
import { countJunctions } from '../js/core/board.js';
import { TOPICS } from '../js/core/constants.js';
import { CARDS, EVENTS, MOTIONS } from '../js/core/content.js';
import QUESTIONS from '../js/data/de/questions/index.js';
import { validateBank } from './validate.mjs';

const N = Number(process.argv[2] || 300);
const BASE = Number(process.argv[3] || 1000);
// --varied: wechselnde Rundenzahl, Schwierigkeit und Themenauswahl (Robustheitstest)
const VARIED = process.argv.includes('--varied');
const MAX_ACTIONS = 6000;

setQuestionBank(QUESTIONS);
const problems = validateBank(QUESTIONS);
console.log(`Fragen: ${QUESTIONS.length} | Karten: ${Object.keys(CARDS).length} | Ereignisse: ${EVENTS.length} | Anträge: ${MOTIONS.length} | Kreuzungen: ${countJunctions(BOARD)} | Felder: ${BOARD.nodes.length}`);
for (const t of TOPICS) {
  const qs = QUESTIONS.filter((q) => q.topic === t);
  const types = {};
  qs.forEach((q) => { types[q.type] = (types[q.type] || 0) + 1; });
  console.log(`  ${t}: ${qs.length}  ${JSON.stringify(types)}`);
}
if (problems.length) { console.log('FRAGEN-PROBLEME:\n' + problems.join('\n')); process.exitCode = 1; }

const stats = { games: 0, errors: 0, stuck: 0, crashes: 0, winType: {}, styleWins: {}, styleGames: {}, styleFair: {}, seatWins: {}, seatFair: {}, rounds: [], actions: [], bySize: {}, detail: {}, portalRounds: [] };
const errorSamples = [];
const fields = {};

for (let g = 0; g < N; g++) {
  const seed = BASE + g * 7919;
  seedBots(seed ^ 0x9e3779b9);
  // Spielerzahl und Stil-Rotation unabhängig voneinander, damit jeder Stil gleich oft auf jedem Platz sitzt
  const n = 2 + (g % 3);
  const rot = Math.floor(g / 3) % 3;
  const styles = [];
  for (let i = 0; i < n; i++) styles.push(BOT_STYLES[(rot + i) % 3]);
  const players = styles.map((st, i) => ({ name: `Bot${i}`, color: i, figure: i, isBot: true, style: st }));
  let s;
  const settings = { turnTime: 0 };
  if (VARIED) {
    settings.maxRounds = [15, 20, 30][g % 3];
    settings.stormRound = Math.round(settings.maxRounds * 2 / 3);
    settings.difficulty = ['leicht', 'normal', 'schwer'][Math.floor(g / 3) % 3];
    const k = 3 + (g % 4);
    settings.topics = TOPICS.filter((_, i) => (i + g) % 6 < k);
  }
  try {
    s = createGame({ players, seed, settings });
  } catch (e) { stats.crashes++; errorSamples.push(`create: ${e.stack}`); continue; }
  let actions = 0;
  let lastErr = 0;
  try {
    while (s.winner == null && actions < MAX_ACTIONS) {
      const actors = pendingActors(s.pending);
      if (!actors.length) { stats.stuck++; errorSamples.push(`kein Akteur: ${JSON.stringify(s.pending)}`); break; }
      const a = botAction(s, actors[0]);
      if (!a) { stats.stuck++; errorSamples.push(`keine Bot-Aktion für ${s.pending.kind}`); break; }
      const r = applyAction(s, a);
      actions++;
      for (const e of r.events) if (e.type === 'land') fields[e.field] = (fields[e.field] || 0) + 1;
      if (!r.ok) {
        stats.errors++;
        if (errorSamples.length < 15) errorSamples.push(`${s.pending.kind}: ${r.error} ${JSON.stringify(a)}`);
        if (++lastErr > 20) {
          // Ungültige Aktion wiederholt sich – Spieler beendet Phase
          const fallback = { player: actors[0], type: s.pending.kind === 'market' ? 'marketDone' : s.pending.kind === 'post' ? 'endTurn' : 'roll' };
          applyAction(s, fallback);
          lastErr = 0;
        }
      } else lastErr = 0;
    }
  } catch (e) {
    stats.crashes++;
    if (errorSamples.length < 15) errorSamples.push(`CRASH g${g}: ${e.stack}`);
    continue;
  }
  if (s.winner == null) { stats.stuck++; errorSamples.push(`Spiel ${g} ohne Ende nach ${actions} Aktionen (Runde ${s.round}, ${s.pending?.kind})`); continue; }
  stats.games++;
  for (const p of s.players) {
    const d = (stats.detail[p.style] = stats.detail[p.style] || { n: 0, frag: 0, colors: 0, inf: 0, duels: 0, motions: 0, score: 0, correct: 0, sab: 0 });
    d.n++; d.frag += p.fragments; d.colors += Object.values(p.stars).filter((x) => x > 0).length; d.inf += p.influence;
    d.duels += p.stats.duelsWon; d.motions += p.stats.motionsPassed; d.score += score(p); d.correct += p.stats.correct; d.sab += p.stats.sabotages;
  }
  if (s.winType === 'portal') stats.portalRounds.push(s.round);
  stats.winType[s.winType] = (stats.winType[s.winType] || 0) + 1;
  const winStyle = s.players[s.winner].style;
  stats.styleWins[winStyle] = (stats.styleWins[winStyle] || 0) + 1;
  for (const st of styles) { stats.styleGames[st] = (stats.styleGames[st] || 0) + 1; stats.styleFair[st] = (stats.styleFair[st] || 0) + 1 / n; }
  stats.seatWins[s.winner] = (stats.seatWins[s.winner] || 0) + 1;
  for (let i = 0; i < n; i++) stats.seatFair[i] = (stats.seatFair[i] || 0) + 1 / n;
  stats.rounds.push(s.round);
  stats.actions.push(actions);
  const key = `${n}P`;
  stats.bySize[key] = stats.bySize[key] || { games: 0, portal: 0, rounds: 0 };
  stats.bySize[key].games++;
  stats.bySize[key].rounds += s.round;
  if (s.winType === 'portal') stats.bySize[key].portal++;
}

const avg = (a) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(1);
console.log(`\nPartien: ${stats.games}/${N} beendet | Abstürze: ${stats.crashes} | Hänger: ${stats.stuck} | ungültige Bot-Aktionen: ${stats.errors}`);
console.log(`Siegarten: ${JSON.stringify(stats.winType)} | Ø Runden: ${avg(stats.rounds)} | Ø Aktionen: ${avg(stats.actions)} | max Aktionen: ${Math.max(...stats.actions)}`);
console.log('Siegquote je Stil (Siege / Teilnahmen) und Verhältnis zum fairen Erwartungswert (1,00 = exakt fair):');
for (const st of BOT_STYLES) {
  const w = stats.styleWins[st] || 0, gms = stats.styleGames[st] || 1, fair = stats.styleFair[st] || 1;
  console.log(`  ${st.padEnd(11)} ${String(w).padStart(4)} / ${gms}  = ${(100 * w / gms).toFixed(1)} %   Faktor ${(w / fair).toFixed(2)}`);
}
console.log('Siegfaktor je Sitzplatz (Startreihenfolge): ' + Object.keys(stats.seatFair).map((i) => `Platz ${Number(i) + 1}: ${((stats.seatWins[i] || 0) / stats.seatFair[i]).toFixed(2)}`).join(' | '));
console.log(`Ø Runde eines Portal-Siegs: ${avg(stats.portalRounds)}`);
console.log('Ø am Spielende je Stil: Fragmente | Sternfarben | Einfluss | Duellsiege | Anträge | Sabotagen | richtige Antworten | Gesamtwert');
for (const [st, d] of Object.entries(stats.detail)) {
  const f = (x) => (x / d.n).toFixed(1).padStart(5);
  console.log(`  ${st.padEnd(11)} ${f(d.frag)} ${f(d.colors)} ${f(d.inf)} ${f(d.duels)} ${f(d.motions)} ${f(d.sab)} ${f(d.correct)} ${f(d.score)}`);
}
for (const [k, v] of Object.entries(stats.bySize)) console.log(`  ${k}: ${v.games} Partien, Portal-Siege ${(100 * v.portal / v.games).toFixed(0)} %, Ø Runden ${(v.rounds / v.games).toFixed(1)}`);
const landed = Object.entries(fields).map(([k, v]) => `${k}:${v}`).join(' ');
console.log(`Feldtypen betreten: ${landed}`);
if (errorSamples.length) console.log('\nBeispiele:\n' + errorSamples.slice(0, 15).join('\n'));
if (stats.crashes || stats.stuck) process.exitCode = 1;
