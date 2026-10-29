// Spielmechanik der Karten, Ereignisse und Anträge. Texte liegen sprachabhängig in js/data/<lang>/content.js.

// 30 Karten in sechs Arten. `when` bestimmt, in welcher Spielsituation sie gespielt werden dürfen.
export const CARDS = {
  // Joker – während einer Quizfrage oder Herausforderung
  j_fifty:   { kind: 'joker', when: 'quiz', copies: 3 },
  j_swap:    { kind: 'joker', when: 'quiz', copies: 2 },
  j_second:  { kind: 'joker', when: 'quiz', copies: 2 },
  j_double:  { kind: 'joker', when: 'quiz', copies: 2 },
  j_time:    { kind: 'joker', when: 'quiz', copies: 1 },
  // Sabotage – zu Zugbeginn gegen einen Gegner
  s_inf:     { kind: 'sabotage', when: 'turn', target: true, copies: 4 },
  s_card:    { kind: 'sabotage', when: 'turn', target: true, copies: 3 },
  s_back:    { kind: 'sabotage', when: 'turn', target: true, copies: 2 },
  s_skip:    { kind: 'sabotage', when: 'turn', target: true, copies: 2 },
  s_star:    { kind: 'sabotage', when: 'turn', target: true, copies: 1 },
  // Zeitsprung – ersetzt den Wurf
  t_three:   { kind: 'jump', when: 'turn', copies: 2 },
  t_six:     { kind: 'jump', when: 'turn', copies: 1 },
  t_choose:  { kind: 'jump', when: 'turn', value: true, copies: 2 },
  t_island:  { kind: 'jump', when: 'turn', copies: 2 },
  t_double:  { kind: 'jump', when: 'turn', copies: 2 },
  // Schutzschild – zu Zugbeginn
  sh_small:  { kind: 'shield', when: 'turn', copies: 3 },
  sh_big:    { kind: 'shield', when: 'turn', copies: 1 },
  sh_reflect:{ kind: 'shield', when: 'turn', copies: 2 },
  sh_storm:  { kind: 'shield', when: 'turn', copies: 1 },
  sh_pact:   { kind: 'shield', when: 'turn', copies: 1 },
  // Veto – bei einer Abstimmung im Parlament
  v_veto:    { kind: 'veto', when: 'vote', copies: 2 },
  v_super:   { kind: 'veto', when: 'vote', copies: 1 },
  v_double:  { kind: 'veto', when: 'vote', copies: 2 },
  v_flip:    { kind: 'veto', when: 'vote', copies: 1 },
  v_delay:   { kind: 'veto', when: 'vote', copies: 1 },
  // Spion – zu Zugbeginn
  sp_peek:   { kind: 'spy', when: 'turn', target: true, copies: 2 },
  sp_copy:   { kind: 'spy', when: 'turn', target: true, copies: 1 },
  sp_steal:  { kind: 'spy', when: 'turn', target: true, copies: 2 },
  sp_scout:  { kind: 'spy', when: 'turn', copies: 2 },
  sp_dossier:{ kind: 'spy', when: 'turn', target: true, copies: 1 },
};

export const CARD_KIND_ICON = { joker: '🃏', sabotage: '💣', jump: '⏩', shield: '🛡', veto: '✋', spy: '🕵' };

export function buildCardDeck() {
  const deck = [];
  for (const [id, c] of Object.entries(CARDS)) for (let i = 0; i < c.copies; i++) deck.push(id);
  return deck;
}

// 40 Ereignisse. Jedes Ereignis besteht aus einer oder mehreren Wirkungen (op), die ALLE Spieler betreffen.
export const EVENTS = [
  { id: 'e_printing',    fx: [{ op: 'draw', n: 1 }] },
  { id: 'e_revolution',  fx: [{ op: 'redistribute' }] },
  { id: 'e_plague',      fx: [{ op: 'inf', n: -2 }] },
  { id: 'e_goldrush',    fx: [{ op: 'inf', n: 2 }] },
  { id: 'e_renaissance', fx: [{ op: 'starForWeakest' }] },
  { id: 'e_library',     fx: [{ op: 'loseCard' }, { op: 'inf', n: 1 }] },
  { id: 'e_reformation', fx: [{ op: 'richToPoor', n: 3 }] },
  { id: 'e_steam',       fx: [{ op: 'draw', n: 1 }, { op: 'inf', n: 1 }] },
  { id: 'e_crash',       fx: [{ op: 'inf', n: -3 }, { op: 'fundPayout' }] },
  { id: 'e_suffrage',    fx: [{ op: 'rep', n: 1 }] },
  { id: 'e_scandal',     fx: [{ op: 'leaderRep', n: -2 }] },
  { id: 'e_peace',       fx: [{ op: 'breakShields' }, { op: 'rep', n: 1 }] },
  { id: 'e_coldfront',   fx: [{ op: 'breakAlliances' }] },
  { id: 'e_moonlanding', fx: [{ op: 'quizBonus', rounds: 2 }] },
  { id: 'e_internet',    fx: [{ op: 'draw', n: 2 }, { op: 'handCap' }] },
  { id: 'e_archive',     fx: [{ op: 'fragmentWeakest' }] },
  { id: 'e_rift',        fx: [{ op: 'leaderLoseFragment' }] },
  { id: 'e_quake',       fx: [{ op: 'scatter' }] },
  { id: 'e_tax',         fx: [{ op: 'fundTax', n: 1 }] },
  { id: 'e_dividend',    fx: [{ op: 'fundPayout' }] },
  { id: 'e_silkroad',    fx: [{ op: 'inf', n: 1 }, { op: 'draw', n: 1 }] },
  { id: 'e_olympia',     fx: [{ op: 'lastInf', n: 4 }] },
  { id: 'e_eruption',    fx: [{ op: 'stormRemove', n: 2 }] },
  { id: 'e_restoration', fx: [{ op: 'repairFields', n: 3 }] },
  { id: 'e_marshall',    fx: [{ op: 'cardForLast', n: 2 }, { op: 'lastInf', n: 2 }] },
  { id: 'e_inquisition', fx: [{ op: 'loseCard' }] },
  { id: 'e_enlighten',   fx: [{ op: 'quizBonus', rounds: 3 }] },
  { id: 'e_wallfall',    fx: [{ op: 'breakAlliances' }, { op: 'inf', n: 2 }] },
  { id: 'e_spacerace',   fx: [{ op: 'leaderInf', n: 3 }, { op: 'lastInf', n: 3 }] },
  { id: 'e_hyperinfl',   fx: [{ op: 'halveInf' }] },
  { id: 'e_charter',     fx: [{ op: 'rep', n: 2 }] },
  { id: 'e_espionage',   fx: [{ op: 'leaderLoseCard' }, { op: 'cardForLast', n: 1 }] },
  { id: 'e_eclipse',     fx: [{ op: 'skipLeader' }] },
  { id: 'e_harvest',     fx: [{ op: 'inf', n: 3 }] },
  { id: 'e_flood',       fx: [{ op: 'inf', n: -1 }, { op: 'stormRemove', n: 1 }] },
  { id: 'e_festival',    fx: [{ op: 'draw', n: 1 }, { op: 'rep', n: 1 }] },
  { id: 'e_ai',          fx: [{ op: 'starForWeakest' }, { op: 'draw', n: 1 }] },
  { id: 'e_blackout',    fx: [{ op: 'breakShields' }, { op: 'loseCard' }] },
  { id: 'e_timequake',   fx: [{ op: 'scatter' }, { op: 'inf', n: 1 }] },
  { id: 'e_summit',      fx: [{ op: 'richToPoor', n: 2 }, { op: 'rep', n: 1 }] },
];

// 30 Anträge für das Parlament. Angenommene Anträge verändern Brett oder Regeln dauerhaft.
export const MOTIONS = [
  { id: 'm_bridge0', op: 'openBridge', b: 0 },
  { id: 'm_bridge1', op: 'openBridge', b: 1 },
  { id: 'm_bridge2', op: 'openBridge', b: 2 },
  { id: 'm_bridge3', op: 'openBridge', b: 3 },
  { id: 'm_bridge4', op: 'openBridge', b: 4 },
  { id: 'm_bridge5', op: 'openBridge', b: 5 },
  { id: 'm_close0',  op: 'closeBridge', island: 0 },
  { id: 'm_close1',  op: 'closeBridge', island: 1 },
  { id: 'm_close3',  op: 'closeBridge', island: 3 },
  { id: 'm_close4',  op: 'closeBridge', island: 4 },
  { id: 'm_spoke2',  op: 'closeSpoke', island: 2 },
  { id: 'm_spoke5',  op: 'closeSpoke', island: 5 },
  { id: 'm_color0',  op: 'recolor', island: 0, topic: 'sci' },
  { id: 'm_color2',  op: 'recolor', island: 2, topic: 'pol' },
  { id: 'm_color3',  op: 'recolor', island: 3, topic: 'geo' },
  { id: 'm_color5',  op: 'recolor', island: 5, topic: 'his' },
  { id: 'm_edu',     op: 'rule', rule: 'quizBonus', value: 1 },
  { id: 'm_duelban', op: 'rule', rule: 'duelBan', value: 3 },
  { id: 'm_arms',    op: 'rule', rule: 'duelStake', value: 2 },
  { id: 'm_handcap', op: 'rule', rule: 'handLimit', value: 3 },
  { id: 'm_income',  op: 'rule', rule: 'income', value: 4 },
  { id: 'm_levy',    op: 'fundTax', n: 2 },
  { id: 'm_payout',  op: 'fundPayout' },
  { id: 'm_richtax', op: 'richTax', n: 4 },
  { id: 'm_amnesty', op: 'amnesty' },
  { id: 'm_stormearly', op: 'rule', rule: 'storm', value: -3 },
  { id: 'm_stormlate',  op: 'rule', rule: 'storm', value: 3 },
  { id: 'm_market',  op: 'rule', rule: 'marketDiscount', value: 1 },
  { id: 'm_bosseasy',op: 'rule', rule: 'bossEasy', value: 1 },
  { id: 'm_archive', op: 'draw', n: 1 },
];
