// Erzeugt die App-Icons (PNG) prozedural – ohne externe Grafiken oder Abhängigkeiten.
// Aufruf: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// Motiv: leuchtendes Zeitportal (Ringe in Cyan/Magenta/Gold) mit Stern im Zentrum
function portal(scale, rounded) {
  return (x, y, size) => {
    const u = (x / size) * 2 - 1, v = (y / size) * 2 - 1;
    const r = Math.hypot(u, v) / scale;
    const ang = Math.atan2(v, u);
    // Hintergrund: Verlauf Nachtblau
    let R = mix(30, 5, Math.min(1, r * 0.8)), G = mix(36, 6, Math.min(1, r * 0.8)), B = mix(92, 15, Math.min(1, r * 0.8));
    const add = (cr, cg, cb, k) => { R += cr * k; G += cg * k; B += cb * k; };
    const ring = (rad, width, cr, cg, cb) => { const d = Math.abs(r - rad); add(cr, cg, cb, smooth(width, 0, d) + 0.35 * smooth(width * 5, 0, d)); };
    ring(0.78, 0.045, 47, 230, 255);
    ring(0.6, 0.04, 255, 63, 180);
    ring(0.43, 0.035, 255, 200, 58);
    // Wirbel im Inneren
    const swirl = Math.sin(ang * 5 + r * 14) * 0.5 + 0.5;
    add(80, 160, 255, smooth(0.42, 0, r) * swirl * 0.5);
    // Vierzackiger Stern
    const star = Math.abs(u / scale) * Math.abs(v / scale) * 40 + r * 2.2;
    add(255, 255, 255, smooth(0.42, 0.12, star));
    let A = 255;
    if (rounded) {
      const q = Math.max(Math.abs(u), Math.abs(v));
      const corner = Math.hypot(Math.max(0, Math.abs(u) - 0.78), Math.max(0, Math.abs(v) - 0.78));
      A = Math.round(255 * (q > 0.78 ? smooth(0.22, 0.2, corner) : 1));
    }
    return [Math.min(255, R), Math.min(255, G), Math.min(255, B), A].map((c) => Math.round(c));
  };
}

const files = [
  ['icon-180.png', 180, portal(1, false)],
  ['icon-192.png', 192, portal(1, true)],
  ['icon-512.png', 512, portal(1, true)],
  ['icon-maskable-512.png', 512, portal(1.25, false)],
];
for (const [name, size, fn] of files) {
  writeFileSync(join(OUT, name), png(size, fn));
  console.log('geschrieben:', name);
}
