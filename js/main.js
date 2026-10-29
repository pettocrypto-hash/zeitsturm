// Einstiegspunkt: lädt Einstellungen, Fragen, 3D-Welt, Audio und zeigt das Hauptmenü.
import { prefs } from './app/prefs.js';
import { setLang, loadQuestions, t } from './i18n/index.js';
import { setQuestionBank } from './core/engine.js';
import { World } from './render/world.js';
import { Board3D } from './render/board3d.js';
import { Pieces } from './render/pieces.js';
import { Dice } from './render/dice.js';
import { Effects } from './render/effects.js';
import { AudioEngine } from './audio/audio.js';
import { App } from './app/app.js';
import { applyAccessibility } from './ui/info.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch (e) { return false; }
}

async function boot() {
  const bootEl = document.getElementById('boot');
  const bootText = document.getElementById('boot-text');
  setLang(prefs.lang);
  applyAccessibility();
  if (!webglAvailable()) { bootText.textContent = t('boot.webgl'); return; }
  try {
    setQuestionBank(await loadQuestions(prefs.lang));
    const world = new World(document.getElementById('world'), prefs.quality);
    const board = new Board3D(world);
    const pieces = new Pieces(world);
    const dice = new Dice(world);
    const effects = new Effects(world);
    effects.motionScale = prefs.reduceMotion ? 0.35 : 1;
    const audio = new AudioEngine();
    audio.setVolumes(prefs.music, prefs.sfx);
    // Audio darf erst nach einer Nutzergeste starten (Mobilgeräte)
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    const app = new App({ render: { world, board, pieces, dice, effects }, audio });
    window.zeitsturm = app;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.offerInstall(e); });
    app.showMenu();
    // Ladebildschirm nach dem ersten Frame ausblenden – mit Zeit-Fallback, falls Frames gedrosselt werden
    let hidden = false;
    const hideBoot = () => { if (hidden) return; hidden = true; bootEl.classList.add('hide'); setTimeout(() => bootEl.remove(), 700); };
    requestAnimationFrame(hideBoot);
    setTimeout(hideBoot, 1200);
    registerServiceWorker();
  } catch (err) {
    console.error(err);
    bootText.textContent = `${t('boot.error')} ${err.message}`;
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return; // lokale Entwicklung ohne Cache
  navigator.serviceWorker.register('sw.js').catch(() => { /* Offline-Modus optional */ });
}

boot();
