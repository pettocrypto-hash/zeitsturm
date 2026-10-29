// Deterministischer Zufall (mulberry32). Der Zustand liegt als Zahl im Spielzustand,
// damit Host, Spielstand-Speicherung und Simulation identisch reproduzierbar sind.

export function nextRandom(holder) {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(holder, min, max) {
  return min + Math.floor(nextRandom(holder) * (max - min + 1));
}

export function pick(holder, arr) {
  return arr[Math.floor(nextRandom(holder) * arr.length)];
}

export function shuffle(holder, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(holder) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
