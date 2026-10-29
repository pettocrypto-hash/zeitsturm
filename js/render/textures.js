// Prozedural erzeugte Canvas-Texturen (keine externen Assets).
import * as THREE from 'three';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

// Symbol auf rundem Grund – für Felder (Barrierefreiheit: Farbe + Symbol)
export function iconTexture(symbol, bg, fg = '#05060f') {
  const key = `icon:${symbol}:${bg}:${fg}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = bg;
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
  g.fillStyle = fg;
  g.font = '700 64px "Segoe UI Symbol","Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(symbol, 64, 70);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

// Würfelaugen
export function diceFaceTexture(n) {
  const key = `dice:${n}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(256, 256);
  const grd = g.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#dfe7ff');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]], 5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]] }[n];
  for (const [x, y] of P) {
    g.fillStyle = n === 1 ? '#ff3fb4' : '#141a3a';
    g.beginPath(); g.arc(x * 64, y * 64, n === 1 ? 30 : 22, 0, Math.PI * 2); g.fill();
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

// Fließende Energie auf Wegen (zeigt die Laufrichtung)
export function flowTexture(color = '#ffffff') {
  const key = `flow:${color}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(128, 16);
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0.05)');
  grd.addColorStop(0.7, color);
  grd.addColorStop(0.85, '#ffffff');
  grd.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 16);
  const t = finish(c, { repeat: true });
  cache.set(key, t);
  return t;
}

// Weicher Leuchtpunkt für Partikel
export function glowTexture() {
  if (cache.has('glow')) return cache.get('glow');
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = finish(c);
  cache.set('glow', t);
  return t;
}

// Namensschild mit Farbsymbol über den Figuren
export function labelTexture(text, color, symbol) {
  const [c, g] = canvas(256, 64);
  g.fillStyle = 'rgba(5,6,15,0.78)';
  roundRect(g, 2, 6, 252, 52, 18); g.fill();
  g.strokeStyle = color; g.lineWidth = 4; g.stroke();
  g.fillStyle = color;
  g.beginPath(); g.arc(32, 32, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#05060f'; g.font = '900 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(symbol, 32, 34);
  g.fillStyle = '#ffffff'; g.font = '800 26px Inter, sans-serif'; g.textAlign = 'left';
  g.fillText(text.length > 12 ? text.slice(0, 11) + '…' : text, 60, 34);
  return finish(c);
}

// Fenster-/Neonmuster für Gebäude
export function windowTexture(lit = '#ffd27a', base = '#1b2033', cols = 4, rows = 8) {
  const key = `win:${lit}:${base}:${cols}:${rows}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(64, 128);
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  const w = 64 / cols, h = 128 / rows;
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    if ((x * 7 + y * 13) % 5 === 0) continue;
    g.fillStyle = lit;
    g.globalAlpha = 0.5 + ((x * 3 + y * 5) % 4) * 0.15;
    g.fillRect(x * w + w * 0.25, y * h + h * 0.25, w * 0.5, h * 0.45);
  }
  g.globalAlpha = 1;
  const t = finish(c);
  cache.set(key, t);
  return t;
}

// Symbol-Atlas: alle Feldsymbole in einer Textur (8 × 8 Zellen), damit alle Felder in EINEM Draw-Call gerendert werden
export function iconAtlas(entries) {
  const cells = 8, size = 128;
  const [c, g] = canvas(cells * size, cells * size);
  const index = new Map();
  entries.forEach(({ key, symbol, bg, fg = '#05060f', dim = false }, i) => {
    const col = i % cells, row = Math.floor(i / cells);
    const cx = col * size + size / 2, cy = row * size + size / 2;
    g.save();
    g.globalAlpha = dim ? 0.35 : 1;
    g.fillStyle = bg;
    g.beginPath(); g.arc(cx, cy, size / 2 - 4, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
    g.fillStyle = fg;
    g.font = '700 64px "Segoe UI Symbol","Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(symbol, cx, cy + 6);
    g.restore();
    // UV-Ursprung liegt unten links (flipY), Zeile 0 ist oben
    index.set(key, [col / cells, 1 - (row + 1) / cells]);
  });
  const t = finish(c);
  t.generateMipmaps = true;
  return { texture: t, index, scale: 1 / cells };
}

// Senkrechte Wasserschlieren für Wasserfälle
export function waterTexture(color) {
  const key = `water:${color}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(64, 256);
  g.clearRect(0, 0, 64, 256);
  for (let i = 0; i < 26; i++) {
    const x = (i * 37) % 64, w = 2 + (i % 4);
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.3 + (i % 5) * 0.08, color);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.globalAlpha = 0.35 + (i % 3) * 0.2;
    g.fillRect(x, 0, w, 256);
  }
  const t = finish(c, { repeat: true });
  cache.set(key, t);
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
