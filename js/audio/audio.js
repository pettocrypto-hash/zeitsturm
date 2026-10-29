// Komplett synthetischer Sound: Effekte, Instrumente und dynamische Epochen-Musik (Web Audio API).
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Jede Epoche hat eine eigene, selbst komponierte Musik (Tonleiter, Tempo, Instrumente, Rhythmus).
const SONGS = {
  hub:         { bpm: 74,  root: 50, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], lead: 'bell',    pad: 'pad',     bass: 'sub',  drums: 'soft',   seed: 11 },
  antike:      { bpm: 84,  root: 50, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 0, 4], lead: 'lyre',    pad: 'flute',   bass: 'sub',  drums: 'frame',  seed: 23 },
  mittelalter: { bpm: 96,  root: 55, scale: [0, 2, 4, 5, 7, 9, 10], prog: [0, 6, 3, 0], lead: 'flute',   pad: 'organ',   bass: 'drone', drums: 'tabor', seed: 37 },
  industrie:   { bpm: 108, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4], lead: 'brass',   pad: 'organ',   bass: 'saw8', drums: 'mech',   seed: 41 },
  weltkrieg:   { bpm: 92,  root: 48, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 3, 4, 0], lead: 'strings', pad: 'strings', bass: 'sub',  drums: 'march',  seed: 53 },
  kalterkrieg: { bpm: 100, root: 52, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 5, 4], lead: 'synth',   pad: 'pad',     bass: 'pulse', drums: 'pulse', seed: 67 },
  zukunft:     { bpm: 118, root: 53, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 4, 5, 3], lead: 'synth',   pad: 'pad',     bass: 'saw8', drums: 'electro', seed: 79 },
};

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Motiv aus 16 Sechzehnteln: Tonstufe oder null (Pause). Deterministisch pro Epoche = „komponiert“.
function composeMotif(seed) {
  const r = seeded(seed);
  const a = [], b = [];
  for (let i = 0; i < 16; i++) {
    const strong = i % 4 === 0;
    a.push(strong || r() < 0.35 ? Math.floor(r() * 7) - (r() < 0.2 ? 7 : 0) : null);
    b.push(strong || r() < 0.3 ? Math.floor(r() * 7) + (r() < 0.25 ? 7 : 0) : null);
  }
  return [a, b];
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volumes = { music: 0.55, sfx: 0.8 };
    this.song = null;
    this.tension = 0;
    this.duck = 1;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* optional */ }
      const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.comp.connect(ctx.destination);
      this.musicBus = ctx.createGain(); this.musicBus.connect(this.comp);
      this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.comp);
      this.applyVolumes();
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.timer = setInterval(() => this.schedule(), 30);
      if (this.pendingSong) { const k = this.pendingSong; this.pendingSong = null; this.startMusic(k); }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setVolumes(music, sfx) {
    this.volumes = { music, sfx };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.5 * this.duck, t, 0.3);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx * 0.9, t, 0.05);
  }

  setDuck(v) { this.duck = v; this.applyVolumes(); }

  // ---------------------------------------------------------------- Bausteine
  env(gainNode, when, peak, attack, hold, release) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, when);
    g.linearRampToValueAtTime(peak, when + attack);
    g.setValueAtTime(peak, when + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, when + attack + hold + release);
    return when + attack + hold + release;
  }

  osc(type, freq, when, stop, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, when); o.detune.value = detune;
    o.connect(dest); o.start(when); o.stop(stop + 0.05);
    return o;
  }

  noise(when, dur, dest, { type = 'bandpass', freq = 2000, q = 1, gain = 0.5, attack = 0.002 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    src.connect(f); f.connect(g); g.connect(dest);
    this.env(g, when, gain, attack, 0, dur);
    src.start(when, Math.random()); src.stop(when + dur + 0.1);
    return { src, f, g };
  }

  // ---------------------------------------------------------------- Instrumente
  // Spielt eine Note auf einem synthetischen Instrument. dest: Ziel-Bus.
  note(inst, midi, when, dur, vel = 0.5, dest = this.sfxBus) {
    if (!this.ctx) return;
    const c = this.ctx;
    const f = midiHz(midi);
    const out = c.createGain();
    out.connect(dest);
    switch (inst) {
      case 'strings': {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.connect(out);
        const vib = c.createOscillator(); vib.frequency.value = 5.5; const vg = c.createGain(); vg.gain.value = 6; vib.connect(vg);
        const end = this.env(out, when, vel * 0.32, 0.18, dur, 0.35);
        for (const d of [-7, 7]) { const o = this.osc('sawtooth', f, when, end, lp, d); vg.connect(o.detune); }
        vib.start(when); vib.stop(end + 0.05);
        break;
      }
      case 'brass': {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.connect(out);
        lp.frequency.setValueAtTime(350, when); lp.frequency.linearRampToValueAtTime(2600, when + 0.07); lp.frequency.setTargetAtTime(1300, when + 0.08, 0.15);
        const end = this.env(out, when, vel * 0.3, 0.04, dur, 0.18);
        this.osc('sawtooth', f, when, end, lp); this.osc('sawtooth', f, when, end, lp, 5);
        break;
      }
      case 'organ': {
        const end = this.env(out, when, vel * 0.16, 0.02, dur, 0.12);
        [[1, 1], [2, 0.6], [3, 0.35], [4, 0.25], [6, 0.12]].forEach(([h, a]) => {
          const g = c.createGain(); g.gain.value = a; g.connect(out);
          this.osc('sine', f * h, when, end, g);
        });
        break;
      }
      case 'flute': {
        const vib = c.createOscillator(); vib.frequency.value = 5; const vg = c.createGain(); vg.gain.value = 8; vib.connect(vg);
        const end = this.env(out, when, vel * 0.3, 0.07, dur, 0.15);
        const o = this.osc('sine', f, when, end, out); vg.connect(o.detune);
        const t = c.createGain(); t.gain.value = 0.15; t.connect(out); this.osc('triangle', f * 2, when, end, t);
        vib.start(when); vib.stop(end);
        this.noise(when, Math.min(0.25, dur), out, { freq: f * 2, q: 6, gain: vel * 0.05 });
        break;
      }
      case 'lyre':
      case 'pluck': {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.connect(out);
        lp.frequency.setValueAtTime(inst === 'lyre' ? 4200 : 3000, when); lp.frequency.exponentialRampToValueAtTime(500, when + 0.6);
        out.gain.setValueAtTime(vel * 0.45, when); out.gain.exponentialRampToValueAtTime(0.0001, when + 1.1 + dur * 0.3);
        const end = when + 1.2 + dur * 0.3;
        this.osc('triangle', f, when, end, lp); this.osc('sawtooth', f, when, end, lp, 3);
        break;
      }
      case 'bell': {
        const mod = c.createOscillator(); mod.frequency.value = f * 3.5;
        const mg = c.createGain(); mg.gain.setValueAtTime(f * 2.2, when); mg.gain.exponentialRampToValueAtTime(1, when + 1.4);
        mod.connect(mg);
        out.gain.setValueAtTime(vel * 0.35, when); out.gain.exponentialRampToValueAtTime(0.0001, when + 1.8 + dur);
        const o = this.osc('sine', f, when, when + 1.9 + dur, out); mg.connect(o.frequency);
        mod.start(when); mod.stop(when + 2 + dur);
        break;
      }
      case 'synth': {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 9; lp.connect(out);
        lp.frequency.setValueAtTime(300, when); lp.frequency.exponentialRampToValueAtTime(3800, when + 0.06); lp.frequency.exponentialRampToValueAtTime(700, when + 0.06 + dur);
        const end = this.env(out, when, vel * 0.22, 0.005, dur, 0.12);
        this.osc('square', f, when, end, lp); this.osc('sawtooth', f, when, end, lp, -9);
        break;
      }
      case 'pad': {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.connect(out);
        const end = this.env(out, when, vel * 0.12, Math.min(0.8, dur * 0.5), dur * 0.5, 0.8);
        for (const d of [-12, 0, 12]) this.osc('sawtooth', f, when, end, lp, d);
        break;
      }
      case 'sub': case 'drone': case 'pulse': case 'saw8': {
        const type = inst === 'saw8' ? 'sawtooth' : inst === 'pulse' ? 'square' : 'triangle';
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = inst === 'drone' ? 600 : 420; lp.connect(out);
        const end = this.env(out, when, vel * (inst === 'drone' ? 0.16 : 0.32), 0.01, dur * 0.8, 0.1);
        this.osc(type, f, when, end, lp);
        break;
      }
      default: {
        const end = this.env(out, when, vel * 0.3, 0.01, dur, 0.1);
        this.osc('sine', f, when, end, out);
      }
    }
  }

  drum(kind, when, vel = 1, dest = this.musicBus) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (kind === 'kick') {
      const g = c.createGain(); g.connect(dest);
      const o = this.osc('sine', 140, when, when + 0.35, g);
      o.frequency.exponentialRampToValueAtTime(42, when + 0.25);
      this.env(g, when, 0.7 * vel, 0.002, 0.02, 0.28);
    } else if (kind === 'snare') {
      this.noise(when, 0.16, dest, { type: 'highpass', freq: 1800, gain: 0.32 * vel });
      const g = c.createGain(); g.connect(dest); this.osc('triangle', 190, when, when + 0.12, g); this.env(g, when, 0.18 * vel, 0.002, 0, 0.1);
    } else if (kind === 'hat') {
      this.noise(when, 0.04, dest, { type: 'highpass', freq: 7500, gain: 0.12 * vel });
    } else if (kind === 'frame') {
      this.noise(when, 0.18, dest, { type: 'bandpass', freq: 380, q: 3, gain: 0.5 * vel });
    } else if (kind === 'clap') {
      for (let i = 0; i < 3; i++) this.noise(when + i * 0.012, 0.09, dest, { type: 'bandpass', freq: 1500, q: 0.8, gain: 0.22 * vel });
    } else if (kind === 'tick') {
      const g = c.createGain(); g.connect(dest); this.osc('square', 2200, when, when + 0.03, g); this.env(g, when, 0.08 * vel, 0.001, 0, 0.025);
    }
  }

  // ---------------------------------------------------------------- Soundeffekte
  sfx(name, arg) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    const B = this.sfxBus;
    switch (name) {
      case 'click': this.note('sine', 84, t, 0.03, 0.4); break;
      case 'hover': this.note('sine', 91, t, 0.02, 0.15); break;
      case 'roll': for (let i = 0; i < 9; i++) this.noise(t + i * 0.055 + Math.random() * 0.03, 0.04, B, { freq: 2500 + Math.random() * 2500, q: 2, gain: 0.35 }); break;
      case 'bounce': this.drum('kick', t, 0.25 + (arg || 0.5) * 0.4, B); this.noise(t, 0.05, B, { freq: 3000, q: 1.5, gain: 0.25 * (arg || 0.5) }); break;
      case 'step': this.note('lyre', 72 + ((arg || 0) % 6) * 2, t, 0.05, 0.25); break;
      case 'land': this.note('bell', 79, t, 0.1, 0.3); break;
      case 'correct': [72, 76, 79, 84].forEach((m, i) => this.note('bell', m, t + i * 0.07, 0.15, 0.45)); break;
      case 'wrong': this.note('synth', 50, t, 0.18, 0.5); this.note('synth', 45, t + 0.2, 0.3, 0.5); break;
      case 'event': this.note('bell', 45, t, 0.6, 0.6); this.note('bell', 52, t + 0.02, 0.6, 0.35); break;
      case 'card': { const n = this.noise(t, 0.3, B, { freq: 800, q: 1.2, gain: 0.35, attack: 0.05 }); n.f.frequency.exponentialRampToValueAtTime(5000, t + 0.28); break; }
      case 'coin': this.note('bell', 88, t, 0.05, 0.3); this.note('bell', 93, t + 0.08, 0.1, 0.3); break;
      case 'gavel': this.drum('frame', t, 1.2, B); this.drum('kick', t, 0.5, B); break;
      case 'duel': [55, 58, 62].forEach((m) => this.note('brass', m, t, 0.5, 0.6)); this.drum('kick', t, 1, B); break;
      case 'turn': this.note('bell', 76, t, 0.1, 0.35); this.note('bell', 83, t + 0.12, 0.2, 0.35); break;
      case 'tick': this.drum('tick', t, 1, B); break;
      case 'portal': { const g = this.ctx.createGain(); g.connect(B); const o = this.osc('sawtooth', 120, t, t + 1.3, g); o.frequency.exponentialRampToValueAtTime(1600, t + 1.2); this.env(g, t, 0.12, 0.2, 0.6, 0.5); this.noise(t, 1.2, B, { freq: 1200, gain: 0.15, attack: 0.4 }); break; }
      case 'storm': { const n = this.noise(t, 2.5, B, { type: 'lowpass', freq: 300, gain: 0.5, attack: 0.6 }); n.f.frequency.linearRampToValueAtTime(1400, t + 1.8); break; }
      case 'thunder': this.noise(t, 2.2, B, { type: 'lowpass', freq: 180, gain: 0.8, attack: 0.01 }); break;
      case 'alliance': [67, 71, 74].forEach((m, i) => this.note('strings', m, t + i * 0.05, 0.5, 0.4)); break;
      case 'betray': this.note('brass', 49, t, 0.4, 0.6); this.note('brass', 50, t, 0.4, 0.5); break;
      case 'victory': {
        [60, 64, 67, 72].forEach((m, i) => this.note('brass', m, t + i * 0.16, 0.18, 0.6));
        [60, 64, 67, 72, 76].forEach((m) => this.note('brass', m, t + 0.7, 1.3, 0.45));
        this.drum('kick', t + 0.7, 1, B); this.drum('snare', t + 0.7, 1, B);
        break;
      }
      case 'error': this.note('square', 40, t, 0.12, 0.3); break;
      case 'doubles': [79, 83, 86, 91].forEach((m, i) => this.note('bell', m, t + i * 0.06, 0.12, 0.4)); this.drum('clap', t, 0.6, B); break;
      case 'stream': { const n = this.noise(t, 1.1, B, { type: 'bandpass', freq: 600, q: 0.8, gain: 0.35, attack: 0.08 }); n.f.frequency.exponentialRampToValueAtTime(2400, t + 0.9); [72, 76, 79].forEach((m, i) => this.note('flute', m, t + 0.1 + i * 0.12, 0.2, 0.25)); break; }
      case 'archive': for (let i = 0; i < 3; i++) this.noise(t + i * 0.07, 0.06, B, { type: 'highpass', freq: 3500, gain: 0.18 }); this.note('pluck', 74, t + 0.2, 0.2, 0.3); break;
      case 'firstClear': [67, 72, 76, 79, 84].forEach((m, i) => this.note('brass', m, t + i * 0.09, 0.22, 0.5)); this.drum('kick', t, 0.8, B); break;
      case 'discard': this.noise(t, 0.18, B, { type: 'bandpass', freq: 900, q: 1, gain: 0.2 }); this.note('pluck', 55, t + 0.05, 0.1, 0.2); break;
      case 'speed': this.note('synth', 84, t, 0.05, 0.25); this.note('synth', 91, t + 0.06, 0.05, 0.25); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- Musik
  startMusic(key) {
    if (!SONGS[key] || (this.song && this.song.key === key)) return;
    // Ohne Nutzergeste darf kein AudioContext entstehen – Musik startet dann beim ersten Antippen
    if (!this.ctx) { this.pendingSong = key; return; }
    const old = this.song;
    if (old) {
      old.bus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.6);
      setTimeout(() => old.bus.disconnect(), 3000);
    }
    const def = SONGS[key];
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    bus.gain.setTargetAtTime(1, this.ctx.currentTime + 0.2, 0.8);
    bus.connect(this.musicBus);
    this.song = { key, def, bus, motif: composeMotif(def.seed), step: 0, next: this.ctx.currentTime + 0.1 };
  }

  stopMusic() {
    this.pendingSong = null;
    if (this.song && this.ctx) {
      const s = this.song;
      s.bus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.5);
      setTimeout(() => s.bus.disconnect(), 2500);
    }
    this.song = null;
  }

  setTension(v) { this.tension = Math.max(0, Math.min(1, v)); }

  schedule() {
    const s = this.song;
    if (!s || !this.ctx || this.ctx.state !== 'running') return;
    const def = s.def;
    const spb = 60 / (def.bpm * (1 + this.tension * 0.22)) / 4; // Sekunden pro Sechzehntel
    while (s.next < this.ctx.currentTime + 0.15) {
      this.playStep(s, s.step, s.next, spb);
      s.step++;
      s.next += spb;
    }
  }

  playStep(s, step, when, spb) {
    const def = s.def, bus = s.bus;
    const i = step % 16, bar = Math.floor(step / 16);
    const chordDeg = def.prog[bar % def.prog.length];
    const deg = (d) => {
      const oct = Math.floor(d / 7);
      return def.root + def.scale[((d % 7) + 7) % 7] + 12 * oct;
    };
    const T = this.tension;
    // Pad (Akkord) zu Taktbeginn
    if (i === 0) for (const d of [0, 2, 4]) this.note(def.pad, deg(chordDeg + d) + 12, when, spb * 15, 0.5, bus);
    // Bass
    const bassHit = def.bass === 'saw8' ? i % 2 === 0 : def.bass === 'pulse' ? i % 4 === 0 || i % 4 === 3 : def.bass === 'drone' ? i === 0 : i % 8 === 0;
    if (bassHit) this.note(def.bass, deg(chordDeg) - 12, when, def.bass === 'drone' ? spb * 16 : spb * 1.8, 0.6, bus);
    // Melodie: Motiv A/B im Wechsel, ab Takt 8 eine Variation (Transposition)
    const motif = s.motif[Math.floor(bar / 2) % 2];
    const n = motif[i];
    const playLead = bar % 8 < 6 || T > 0.5;
    if (n != null && playLead) this.note(def.lead, deg(chordDeg + n + (bar % 8 >= 4 ? 2 : 0)) + 12, when, spb * (def.lead === 'lyre' ? 2 : 1.6), 0.4 + T * 0.2, bus);
    // Schlagzeug
    switch (def.drums) {
      case 'soft': if (i === 0) this.drum('frame', when, 0.4, bus); break;
      case 'frame': if (i === 0 || i === 6 || i === 10) this.drum('frame', when, i === 0 ? 0.9 : 0.5, bus); break;
      case 'tabor': if (i % 4 === 0) this.drum('frame', when, i === 0 ? 1 : 0.6, bus); if (i === 14) this.drum('frame', when, 0.4, bus); break;
      case 'mech': if (i % 4 === 0) this.drum('kick', when, 0.8, bus); if (i % 2 === 1) this.drum('hat', when, 0.8, bus); if (i === 4 || i === 12) this.drum('clap', when, 0.6, bus); break;
      case 'march': if (i === 0 || i === 8) this.drum('kick', when, 0.7, bus); if (i === 4 || i === 12 || i === 14 || i === 15) this.drum('snare', when, i > 12 ? 0.5 : 0.9, bus); break;
      case 'pulse': if (i % 4 === 0) this.drum('kick', when, 0.7, bus); if (i % 4 === 2) this.drum('hat', when, 1, bus); break;
      case 'electro': if (i % 4 === 0) this.drum('kick', when, 0.9, bus); if (i === 4 || i === 12) this.drum('clap', when, 0.8, bus); if (i % 2 === 1) this.drum('hat', when, 0.7, bus); break;
      default: break;
    }
    // Spannung: zusätzliche Hi-Hats und Pauken
    if (T > 0.4 && i % 2 === 0) this.drum('hat', when, 0.5 + T * 0.5, bus);
    if (T > 0.7 && (i === 0 || i === 3 || i === 8 || i === 11)) this.drum('kick', when, 0.6, bus);
  }
}

export const INSTRUMENTS = ['strings', 'brass', 'organ', 'flute', 'pluck', 'bell', 'synth'];
export { midiHz };
