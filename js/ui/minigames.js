// Musik-Minispiele der Konzertfelder. Alle Töne entstehen live über die Web Audio API.
import { h, btn, clear, modal, vibrate, sleep } from './dom.js';
import { t } from '../i18n/index.js';
import { INSTRUMENTS } from '../audio/audio.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = Math.imul(s ^ (s >>> 15), s | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

export function playMinigame(game, { seed = 1, level = 1 }, audio) {
  audio.unlock();
  audio.setDuck(0.15);
  const run = { rhythm, melody, instrument }[game] || rhythm;
  return run(seed, level, audio).finally(() => audio.setDuck(1));
}

function frame(titleKey, introKey) {
  const status = h('div', { class: 'mg-status' });
  const prog = h('i', { style: { width: '0%' } });
  const stage = h('div', { class: 'mg-stage' });
  const content = h('div', { class: 'col' },
    h('div', { class: 'muted' }, t(introKey)),
    h('div', { class: 'progress' }, prog),
    status, stage);
  const md = modal({ title: t(titleKey), icon: '♫', content, closable: false });
  return { md, status, stage, setProgress: (f) => { prog.style.width = `${Math.round(f * 100)}%`; } };
}

// Audio-Uhr nur, wenn der AudioContext wirklich läuft – sonst Systemzeit (z. B. stumm geschaltetes iPhone)
function clock(audio) {
  const useAudio = audio.ctx && audio.ctx.state === 'running';
  return () => (useAudio ? audio.ctx.currentTime : performance.now() / 1000);
}

// ------------------------------------------------------------------ Rhythmus-Duell
async function rhythm(seed, level, audio) {
  const r = seeded(seed);
  const bpm = 88 + level * 10;
  const eighth = 60 / bpm / 2;
  const slots = 16;
  const pattern = [];
  for (let i = 0; i < slots; i++) pattern.push(i === 0 || i === 8 || r() < 0.32 + level * 0.06);
  const hits = pattern.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  const f = frame('mg.rhythm', 'mg.rhythmIntro');
  const row = h('div', { class: 'beat-row' }, pattern.map((on) => h('i', { class: on ? 'on' : '' })));
  const pad = h('div', { class: 'tap-pad', role: 'button', 'aria-label': t('mg.tap') }, t('mg.tap'));
  f.stage.append(row, pad);
  const now = clock(audio);
  const cells = [...row.children];

  const highlight = (start) => {
    for (let i = 0; i < slots; i++) setTimeout(() => { cells.forEach((c) => c.classList.remove('now')); cells[i]?.classList.add('now'); }, Math.max(0, (start + i * eighth - now()) * 1000));
    setTimeout(() => cells.forEach((c) => c.classList.remove('now')), (start + slots * eighth - now()) * 1000);
  };
  const countIn = (start) => { for (let i = 0; i < 4; i++) audio.drum('tick', start + i * eighth * 2, 1.2, audio.sfxBus); };

  f.status.textContent = t('mg.listen');
  await sleep(500);
  let t0 = now() + 0.2;
  countIn(t0);
  const p0 = t0 + 8 * eighth;
  hits.forEach((i) => audio.drum('frame', p0 + i * eighth, 1.3, audio.sfxBus));
  highlight(p0);
  await sleep((p0 + slots * eighth - now()) * 1000 + 300);

  f.status.textContent = t('mg.yourTurn');
  t0 = now() + 0.4;
  countIn(t0);
  const start = t0 + 8 * eighth;
  const taps = [];
  const onTap = (e) => {
    e.preventDefault();
    taps.push(now());
    audio.drum('clap', now(), 1, audio.sfxBus);
    pad.classList.add('flash'); setTimeout(() => pad.classList.remove('flash'), 90);
    vibrate(12);
  };
  pad.addEventListener('pointerdown', onTap);
  highlight(start);
  const endT = start + slots * eighth + 0.35;
  while (now() < endT) { f.setProgress(Math.max(0, (now() - start) / (endT - start))); await sleep(50); }
  pad.removeEventListener('pointerdown', onTap);

  // Auswertung: konstante Latenz herausrechnen (Median), dann Genauigkeit je Schlag
  const targets = hits.map((i) => start + i * eighth);
  const used = new Set();
  const errs = [];
  for (const tg of targets) {
    let best = -1, bd = 0.24;
    taps.forEach((tp, k) => { if (!used.has(k) && Math.abs(tp - tg) < bd) { bd = Math.abs(tp - tg); best = k; } });
    if (best >= 0) { used.add(best); errs.push(taps[best] - tg); } else errs.push(null);
  }
  const found = errs.filter((e) => e != null).sort((a, b) => a - b);
  const median = found.length ? found[Math.floor(found.length / 2)] : 0;
  let sum = 0;
  for (const e of errs) if (e != null) sum += Math.max(0, 1 - Math.abs(e - median) / 0.16);
  const extra = taps.length - used.size;
  const score = Math.max(0, Math.min(1, sum / targets.length - extra * 0.07));
  return finish(f, score);
}

// ------------------------------------------------------------------ Melodie-Gedächtnis
async function melody(seed, level, audio) {
  const r = seeded(seed);
  const notes = [72, 76, 79, 83];
  const colors = ['#2fe6ff', '#ff3fb4', '#ffc83a', '#8cff4a'];
  const rounds = 4;
  const startLen = 2 + level;
  const seq = [];
  for (let i = 0; i < startLen + rounds; i++) seq.push(Math.floor(r() * 4));
  const f = frame('mg.melody', 'mg.melodyIntro');
  const pads = colors.map((c, i) => h('div', { class: 'pad', role: 'button', 'aria-label': String(i + 1), style: { background: c, color: c } }));
  f.stage.appendChild(h('div', { class: 'pads' }, pads));
  const light = async (i, ms = 380) => {
    pads[i].classList.add('lit');
    audio.note('bell', notes[i], audio.now + 0.01, ms / 1000, 0.55);
    await sleep(ms);
    pads[i].classList.remove('lit');
  };
  let completed = 0, partial = 0;
  outer: for (let round = 0; round < rounds; round++) {
    const len = startLen + round;
    f.status.textContent = t('mg.listen');
    f.setProgress(round / rounds);
    await sleep(600);
    for (let k = 0; k < len; k++) { await light(seq[k], Math.max(240, 420 - level * 40)); await sleep(110); }
    f.status.textContent = t('mg.repeat', { n: len });
    for (let k = 0; k < len; k++) {
      const pick = await new Promise((resolve) => {
        const handlers = pads.map((p, i) => {
          const fn = (e) => { e.preventDefault(); handlers.forEach((hh, j) => pads[j].removeEventListener('pointerdown', hh)); resolve(i); };
          p.addEventListener('pointerdown', fn);
          return fn;
        });
      });
      light(pick, 220);
      vibrate(10);
      if (pick !== seq[k]) {
        partial = k / len;
        audio.sfx('wrong');
        f.status.textContent = t('mg.wrongNote');
        await sleep(900);
        break outer;
      }
    }
    completed++;
    audio.sfx('coin');
  }
  return finish(f, Math.min(1, (completed + partial) / rounds));
}

// ------------------------------------------------------------------ Instrumente erkennen
async function instrument(seed, level, audio) {
  const r = seeded(seed);
  const rounds = 4;
  let correct = 0;
  const f = frame('mg.instrument', 'mg.instrumentIntro');
  const opts = h('div', { class: 'grid2' });
  const replay = btn(['🔊 ', t('mg.replay')], () => {}, 'ghost block');
  f.stage.append(replay, opts);
  const phrase = (inst) => {
    const base = inst === 'organ' || inst === 'strings' ? 60 : 67;
    const tt = audio.now + 0.05;
    [0, 4, 7, 12].forEach((iv, i) => audio.note(inst, base + iv, tt + i * 0.42, 0.36, 0.7));
  };
  for (let round = 0; round < rounds; round++) {
    f.setProgress(round / rounds);
    const inst = INSTRUMENTS[Math.floor(r() * INSTRUMENTS.length)];
    const pool = INSTRUMENTS.filter((x) => x !== inst);
    const choices = [inst];
    while (choices.length < 4) { const c = pool.splice(Math.floor(r() * pool.length), 1)[0]; choices.push(c); }
    choices.sort(() => r() - 0.5);
    f.status.textContent = t('mg.whichInstrument', { n: round + 1, total: rounds });
    replay.onclick = () => phrase(inst);
    phrase(inst);
    const pick = await new Promise((resolve) => {
      clear(opts);
      choices.forEach((c) => opts.appendChild(btn(t(`inst.${c}`), () => resolve(c), 'big')));
    });
    const ok = pick === inst;
    if (ok) { correct++; audio.sfx('correct'); vibrate(15); } else { audio.sfx('wrong'); vibrate([30, 40, 30]); }
    f.status.textContent = ok ? t('mg.right') : t('mg.wasInstrument', { name: t(`inst.${inst}`) });
    [...opts.children].forEach((b) => { b.disabled = true; });
    await sleep(1300);
  }
  return finish(f, correct / rounds);
}

async function finish(f, score) {
  f.setProgress(1);
  clear(f.stage);
  const pct = Math.round(score * 100);
  f.status.textContent = t('mg.score', { pct });
  f.stage.appendChild(h('div', { class: 'verdict ' + (score >= 0.75 ? 'ok' : score >= 0.4 ? '' : 'no') },
    score >= 0.75 ? t('mg.great') : score >= 0.4 ? t('mg.ok') : t('mg.bad')));
  await new Promise((resolve) => f.stage.appendChild(btn(t('common.continue'), resolve, 'primary block big')));
  f.md.close();
  return score;
}
