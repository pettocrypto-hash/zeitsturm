// Regeltests: prüfen gezielt einzelne Spielregeln der Engine.
// Aufruf: node sim/rules.test.mjs
import { createGame, applyAction, setQuestionBank, BOARD, getQuestion, effectiveTopic, sanitizeEvents, viewFor, projectLanding } from '../js/core/engine.js';
import { countJunctions } from '../js/core/board.js';
import QUESTIONS from '../js/data/de/questions/index.js';

setQuestionBank(QUESTIONS);
let failed = 0, passed = 0;
function check(name, cond, info = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${info}`); }
}
const I = BOARD.islands[0].ids;
const newGame = (seed = 7, n = 2) => createGame({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, style: 'scholar' })), seed, settings: { turnTime: 0 } });
const act = (s, a) => applyAction(s, { player: s.current, ...a });
const types = (r) => r.events.map((e) => e.type);
const correct = (q) => (q.type === 'mc' ? 0 : q.type === 'tf' || q.type === 'est' ? q.c : [...Array((q.pairs || q.a).length).keys()]);

console.log('Brett');
{
  check('175 Felder', BOARD.nodes.length === 175, BOARD.nodes.length);
  check('19 Kreuzungen', countJunctions(BOARD) === 19);
  check('keine Sackgassen', BOARD.nodes.every((n) => n.next.length > 0));
}

console.log('Würfeln');
{
  let sawDoubles = false;
  for (let seed = 1; seed < 300 && !sawDoubles; seed++) {
    const s = newGame(seed);
    const cards = s.players[0].cards.length;
    const r = act(s, { type: 'roll' });
    const roll = r.events.find((e) => e.type === 'roll');
    if (seed === 1) check('zwei Würfel, Summe 2–12', roll.values.length === 2 && roll.total === roll.values[0] + roll.values[1] && roll.total >= 2 && roll.total <= 12);
    if (roll.doubles) {
      sawDoubles = true;
      check('Pasch bringt eine Karte', types(r).includes('doubles') && s.players[0].cards.length === cards + 1);
    }
  }
  check('Pasch kommt vor', sawDoubles);
}

console.log('Archiv & Handlimit');
{
  const s = newGame();
  const p = s.players[0];
  p.pos = I.n165; p.cards = ['t_choose', 'j_fifty', 'j_swap', 'sh_small', 's_inf']; p.influence = 4;
  const r = act(s, { type: 'playCard', card: 't_choose', value: 2 });
  check('Präzisionssprung landet auf dem Archiv', p.pos === I.n115 && types(r).includes('archive'));
  check('Archiv: +1 Einfluss', p.influence === 5, p.influence);
  check('Archiv: +1 Karte', p.cards.length === 5, p.cards.length);
  const s2 = newGame();
  const q = s2.players[0];
  q.pos = I.n165; q.cards = ['t_choose', 'j_fifty', 'j_swap', 'sh_small', 's_inf'];
  q.cards.push('v_veto'); // 6 Karten – über dem Limit erst nach dem Ziehen
  s2.rules.handLimit = 5;
  const r2 = act(s2, { type: 'playCard', card: 't_choose', value: 2 });
  check('Handlimit meldet abgelegte Karte', types(r2).includes('discard') && q.cards.length === 5);
  const hidden = sanitizeEvents(r2.events, 1).find((e) => e.type === 'discard');
  check('abgelegte Karte bleibt vor Mitspielern verborgen', hidden && hidden.card === null);
}

console.log('Zeitstrom');
{
  const s = newGame();
  const p = s.players[0];
  p.pos = I.e; p.cards = ['t_choose'];
  act(s, { type: 'playCard', card: 't_choose', value: 2 });
  check('Kreuzung am Inseleingang', s.pending.kind === 'path' && s.pending.options.includes(I.s1));
  const r = act(s, { type: 'choosePath', node: I.s1 });
  check('Zeitstrom trägt bis zum Ausgang', types(r).includes('stream') && p.pos === I.x);
  check('am Ausgang wird das Feld ausgeführt', s.pending.kind === 'quiz');
}

console.log('Wächter & Erstbesieger');
{
  const s = newGame();
  const p = s.players[0];
  p.pos = I.n140; p.cards = ['t_choose']; p.influence = 4;
  act(s, { type: 'playCard', card: 't_choose', value: 8 });
  check('Wächter hält die Figur an', p.pos === I.g && s.pending.kind === 'challenge');
  let r;
  while (s.pending.kind === 'challenge') r = act(s, { type: 'answer', answer: correct(getQuestion(s.pending.qid)) });
  check('Sieg bringt ein Zeitfragment', p.fragments === 1 && p.beaten.includes(0));
  check('Erstbesieger-Bonus', types(r).includes('firstClear') && p.influence === 8, p.influence);
  act(s, { type: 'endTurn' });
  const q = s.players[1];
  q.pos = I.n140; q.cards = ['t_choose']; q.influence = 4;
  act(s, { type: 'playCard', card: 't_choose', value: 8 });
  let r2;
  while (s.pending.kind === 'challenge') r2 = act(s, { type: 'answer', answer: correct(getQuestion(s.pending.qid)) });
  check('zweiter Sieger erhält keinen Erstbesieger-Bonus', !types(r2).includes('firstClear') && q.influence === 6, q.influence);
  check('besiegter Wächter hält nicht mehr an', projectLanding(s, 0, I.n115, 3).kind !== 'stop');
}

console.log('Markt & Handel');
{
  const s = newGame();
  const p = s.players[0];
  p.pos = I.n350; p.cards = ['t_choose']; p.influence = 6;
  act(s, { type: 'playCard', card: 't_choose', value: 2 });
  check('Ausgang ist eine Dreifach-Kreuzung', s.pending.kind === 'path' && s.pending.options.length === 3);
  act(s, { type: 'choosePath', node: BOARD.islets[0].nodes[0] });
  check('Handelsposten der Nebeninsel ist ein Markt', s.pending.kind === 'market');
  act(s, { type: 'marketDone' });
  const offer = { player: 0, type: 'trade', target: 1, offer: { influence: 1 }, request: {} };
  let ok = 0;
  for (let k = 0; k < 3; k++) {
    const r = applyAction(s, offer);
    if (r.ok) { ok++; applyAction(s, { player: 1, type: 'tradeReject' }); }
  }
  check('nach dem Markt zwei Handelsangebote', ok === 2, ok);
}

console.log('Umfärben, Weg-Vorschau, Datenschutz');
{
  const s = newGame();
  s.mods.recolor[0] = 'sci';
  const br2 = BOARD.bridges[0].node + 1;
  check('Umfärben wirkt auf die Hauptinsel', effectiveTopic(s, I.e) === 'sci');
  check('Umfärben lässt Brücken unverändert', effectiveTopic(s, br2) === BOARD.nodes[br2].topic);
  const pl = projectLanding(s, 0, I.n165, 3);
  check('Weg-Vorschau: Landung auf dem Archiv', pl.kind === 'land' && pl.node === I.n115);
  check('Weg-Vorschau: Halt am Wächter', projectLanding(s, 0, I.n115, 6).kind === 'stop');
  const pj = projectLanding(s, 0, I.n15, 6);
  check('Weg-Vorschau: Stopp an der nächsten Kreuzung', pj.kind === 'junction' && pj.node === I.x && pj.left === 3, JSON.stringify(pj));
  const v = viewFor(newGame(3, 3), 1);
  check('Mitspieler-Ansicht ohne Stapel und Fragen-Gedächtnis', !v.decks && !v.avoid && v.players[0].cards.every((c) => c === '?'));
  const g = createGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 1, avoid: ['pol001', 'gibtsnicht'] });
  check('Fragen-Gedächtnis übernimmt nur gültige Fragen', g.avoid.length === 1 && g.avoid[0] === 'pol001');
}

console.log(failed ? `\n❌ ${failed} von ${passed + failed} Tests fehlgeschlagen` : `\n✅ Alle ${passed} Regeltests bestanden`);
process.exitCode = failed ? 1 : 0;
