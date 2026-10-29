// Qualitätsprüfung: Syntax aller Module, fehlende Übersetzungsschlüssel, Inhaltsmengen.
// Aufruf: node tools/check.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import de from '../js/i18n/de.js';
import { CARDS, EVENTS, MOTIONS } from '../js/core/content.js';
import { TOPICS, EPOCHS, FIELD_INFO, FIGURES } from '../js/core/constants.js';
import { INSTRUMENTS } from '../js/audio/audio.js';
import QUESTIONS from '../js/data/de/questions/index.js';
import { validateBank } from '../sim/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!['node_modules', '.git', 'icons'].includes(f)) walk(p); }
    else if (/\.(m?js)$/.test(f)) files.push(p);
  }
})(ROOT);

let problems = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { problems++; console.log(`SYNTAX ${f}\n${e.stderr}`); }
}

const used = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
}
const dynamic = [
  ...Object.keys(CARDS).flatMap((id) => [`card.${id}.name`, `card.${id}.desc`]),
  ...EVENTS.flatMap((e) => [`event.${e.id}.name`, `event.${e.id}.desc`]),
  ...MOTIONS.flatMap((m) => [`motion.${m.id}.name`, `motion.${m.id}.desc`]),
  ...TOPICS.map((x) => `topic.${x}`), ...EPOCHS.map((x) => `epoch.${x}`), ...Object.values(FIELD_INFO).map((f) => f.key),
  ...FIGURES.map((x) => `figure.${x}`), ...['scholar', 'politician', 'saboteur'].map((x) => `style.${x}`),
  ...['leicht', 'normal', 'schwer'].map((x) => `diff.${x}`), ...['low', 'medium', 'high'].map((x) => `quality.${x}`),
  ...['race', 'order', 'match'].map((x) => `boss.${x}`), ...['mc', 'tf', 'est', 'order', 'match'].map((x) => `qtype.${x}`),
  ...['joker', 'sabotage', 'jump', 'shield', 'veto', 'spy'].map((x) => `cardkind.${x}`), ...INSTRUMENTS.map((x) => `inst.${x}`),
  ...['rhythm', 'melody', 'instrument'].map((x) => `mg.${x}`), ...['star', 'inf', 'none'].map((x) => `concert.reward.${x}`),
  ...['card', 'star', 'fragment', 'sell'].map((x) => `ev.bought.${x}`),
  ...['brain', 'traitor', 'politician', 'duelist', 'saboteur', 'musician', 'walker', 'tycoon', 'lucky', 'archivist', 'pioneer'].flatMap((x) => [`award.${x}.icon`, `award.${x}.name`]),
  ...['leicht', 'normal', 'stark'].map((x) => `botlevel.${x}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((x) => `new.v21.${x}`),
  ...['main', 'islet', 'bridge', 'spoke'].map((x) => `area.${x}`),
  ...['ok', 'random', 'penalty'].map((x) => `portal.result.${x}`), ...['portal', 'score'].map((x) => `end.type.${x}`),
  ...['running', 'full', 'kicked'].map((x) => `online.kicked.${x}`),
  ...['goal', 'turn', 'resources', 'fields', 'parliament', 'alliances', 'cards', 'storm', 'controls'].flatMap((x) => [`rules.${x}.title`, `rules.${x}.body`]),
  ...Object.keys(FIELD_INFO).map((x) => `rules.field.${x}`),
  ...['intro', 'hud', 'camera', 'turn', 'path', 'quiz', 'reward', 'post', 'challenge', 'vote', 'motion', 'market', 'duel', 'concert', 'portal', 'event', 'finish'].flatMap((x) => [`tut.${x}.title`, `tut.${x}.body`]),
  ...['slow', 'normal', 'fast'].map((x) => `set.speed.${x}`),
  ...['turn', 'path', 'quiz', 'reward', 'duelSetup', 'duel', 'motion', 'vote', 'concert', 'market', 'portal', 'challenge', 'post', 'trade', 'alliance'].map((x) => `wait.${x}`),
];
const missing = [...used, ...dynamic].filter((k) => de[k] == null);
if (missing.length) { problems += missing.length; console.log('FEHLENDE TEXTE:\n  ' + [...new Set(missing)].join('\n  ')); }

const bank = validateBank(QUESTIONS);
if (bank.length) { problems += bank.length; console.log('FRAGEN:\n  ' + bank.join('\n  ')); }

const counts = { Fragen: QUESTIONS.length, Ereignisse: EVENTS.length, Anträge: MOTIONS.length, Karten: Object.keys(CARDS).length };
console.log(`Module: ${files.length} | Texte: ${Object.keys(de).length} | ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' | ')}`);
const req = { Fragen: 360, Ereignisse: 40, Anträge: 30, Karten: 30 };
for (const [k, v] of Object.entries(req)) if (counts[k] < v) { problems++; console.log(`ZU WENIG ${k}: ${counts[k]} < ${v}`); }
for (const tp of TOPICS) { const n = QUESTIONS.filter((q) => q.topic === tp).length; if (n < 60) { problems++; console.log(`Thema ${tp}: nur ${n} Fragen`); } }
console.log(problems ? `❌ ${problems} Problem(e)` : '✅ Alles in Ordnung');
process.exitCode = problems ? 1 : 0;
