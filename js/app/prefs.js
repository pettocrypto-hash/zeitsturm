// Einstellungen und Spielstände im Browser (localStorage). Alle Zugriffe sind abgesichert,
// damit private Fenster oder blockierter Speicher das Spiel nicht verhindern.
import { TOPICS, STATE_VERSION } from '../core/constants.js';

const KEY = 'zeitsturm.prefs.v1';
// Spielstände hängen vom Brett ab: neue Brett-Version = neuer Speicherschlüssel
const SAVE_KEY = `zeitsturm.save.v${STATE_VERSION}`;
const ONLINE_KEY = `zeitsturm.online.v${STATE_VERSION}`;

export function isMobile() {
  return matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const DEFAULTS = {
  quality: null,         // wird beim ersten Start automatisch gewählt
  music: 0.55,
  sfx: 0.8,
  lang: 'de',
  haptics: true,
  name: '',
  color: 'cyan',
  figure: 'chronist',
  turnTime: 90,
  difficulty: 'normal',
  maxRounds: 30,
  topics: [...TOPICS],
  botSpeed: 'normal',
  botLevel: 'normal',
  tutorialSeen: false,
  bigText: false,
  reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  seenQuestions: [],
};

function read(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function write(key, v) {
  try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; }
}

export const prefs = { ...DEFAULTS, ...(read(KEY) || {}) };
if (!prefs.quality) prefs.quality = isMobile() ? 'medium' : 'high';

export function savePrefs() { write(KEY, prefs); }

// ---------------------------------------------------------------- Spielstand
let pending = null, timer = null;
export function saveGame(data) {
  pending = data;
  if (timer) return;
  timer = setTimeout(flushSave, 1200);
}
export function flushSave() {
  clearTimeout(timer); timer = null;
  if (pending) { write(SAVE_KEY, { ...pending, savedAt: Date.now() }); pending = null; }
}
export function loadGame() {
  const g = read(SAVE_KEY);
  return g && g.state && g.state.v === STATE_VERSION ? g : null;
}
export function clearGame() { pending = null; clearTimeout(timer); timer = null; write(SAVE_KEY, null); }

window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

// ---------------------------------------------------------------- Online-Wiederbeitritt
export function saveOnline(info) { write(ONLINE_KEY, info ? { ...info, at: Date.now() } : null); }
export function loadOnline() {
  const v = read(ONLINE_KEY);
  return v && Date.now() - v.at < 8 * 3600 * 1000 ? v : null;
}
