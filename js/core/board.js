// Brett-Generierung „Archipel“: sechs große Epochen-Inseln um das Zeitportal, dazu sechs Nebeninseln.
// Das Brett ist ein gerichteter Graph. Kreuzungen (mehr als ein Nachfolger) erzwingen eine Wegwahl.
//
// Aufbau einer Epoche (lokale Polarkoordinaten: φ = 0° zeigt zur nächsten Insel, 90° nach außen, -90° zum Portal):
//   Eingang e ─┬─ langer Weg über den Inselbogen (Archiv, Wächter ♛, Markt, Parlament) ─┬─ Ausgang x
//              │           └ Kreuzung j2: Aussichtspfad durch das Inselinnere (Umweg mit Belohnungen)
//              └─ kurzer Fallenweg (Duell, Zeitstrom, Zeitportal, Ereignis) ───────────┘
//   Ausgang x ─┬─ Brücke zur nächsten Epoche
//              ├─ Inselhüpfen über die Nebeninsel (Handelsposten, Inselrat, Konzert, Archiv)
//              └─ Speiche zum großen Zeitportal
import { TOPICS, EPOCHS } from './constants.js';

export const ISLAND_RING = 66;   // Abstand der Inselmittelpunkte vom Portal
export const ISLAND_SIZE = 18.5; // Radius einer Hauptinsel
export const ISLET_RING = 82;    // Abstand der Nebeninseln
export const ISLET_SIZE = 8;

const ARC_R = 12.5;
// Inselbogen (langer Weg): φ in Grad, Feldtyp, Themen-Slot
const ARC = [
  { key: 'n190', phi: 190, type: 'topic', slot: 1, role: 'long' },
  { key: 'n165', phi: 165, type: 'event' },
  { key: 'n140', phi: 140, type: 'topic', slot: 2 },
  { key: 'n115', phi: 115, type: 'archive' },
  { key: 'g',    phi: 90,  type: 'challenge' },
  { key: 'j2',   phi: 65,  type: 'topic', slot: 3 },
  { key: 'n40',  phi: 40,  type: 'market', role: 'main' },
  { key: 'n15',  phi: 15,  type: 'parliament' },
  { key: 'n350', phi: -10, type: 'topic', slot: 4 },
];
// Aussichtspfad durch das Inselinnere (r, φ)
const LOOP = [
  { key: 'o1', r: 8,   phi: 75, type: 'concert', role: 'scenic' },
  { key: 'o2', r: 6.5, phi: 45, type: 'topic', slot: 5 },
  { key: 'o3', r: 8,   phi: 15, type: 'archive' },
];
// Kurzer Fallenweg entlang der Unterkante (u, v)
const LOW = [
  { key: 's1', u: -7.3, v: -7.6, trap: 0, role: 'short' },
  { key: 's2', u: -2.4, v: -7.9, type: 'stream' },
  { key: 's3', u: 2.4,  v: -7.9, trap: 1 },
  { key: 's4', u: 7.3,  v: -7.6, type: 'event' },
];

export function buildBoard() {
  const nodes = [];
  const add = (n) => { n.id = nodes.length; n.next = []; nodes.push(n); return n.id; };
  const link = (a, b) => { if (!nodes[a].next.includes(b)) nodes[a].next.push(b); };
  const hub = add({ name: 'hub', island: -1, area: 'hub', type: 'hub', topic: null, x: 0, y: 2.5, z: 0 });
  const islands = [];

  // ---------------------------------------------------------------- Hauptinseln
  for (let i = 0; i < 6; i++) {
    const ang = (i * 60 - 90) * Math.PI / 180;
    const cx = Math.cos(ang) * ISLAND_RING, cz = Math.sin(ang) * ISLAND_RING;
    const cy = Math.sin(i * 1.7) * 1.6;
    const tx = -Math.sin(ang), tz = Math.cos(ang); // Tangente (Richtung nächste Insel)
    const rx = Math.cos(ang), rz = Math.sin(ang);  // radial nach außen
    const world = (u, v, lift = 0) => ({ x: cx + tx * u + rx * v, y: cy + 0.6 + lift, z: cz + tz * u + rz * v });
    const polar = (r, deg) => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)];
    let slot = 0;
    const topicFor = (k) => TOPICS[(i + k) % 6];
    const ids = {};
    const mk = (key, type, u, v, extra = {}) => {
      if (type === 'trap') type = (extra.trap + i) % 2 === 0 ? 'duel' : 'portal';
      const topic = type === 'topic' ? topicFor(extra.slot ?? slot++) : null;
      ids[key] = add({ name: `${key}_${i}`, island: i, area: 'main', type, topic, role: extra.role, ...world(u, v) });
      return ids[key];
    };

    mk('e', 'topic', ...polar(14, 210), { slot: 0 });
    for (const a of ARC) mk(a.key, a.type, ...polar(ARC_R, a.phi), a);
    for (const o of LOOP) mk(o.key, o.type, ...polar(o.r, o.phi), o);
    for (const s of LOW) mk(s.key, s.type || 'trap', s.u, s.v, s);
    mk('x', 'topic', ...polar(14, -30), { slot: 6 });

    // Langer Weg
    const arcKeys = ['e', ...ARC.map((a) => a.key), 'x'];
    for (let k = 0; k < arcKeys.length - 1; k++) link(ids[arcKeys[k]], ids[arcKeys[k + 1]]);
    // Aussichtspfad j2 → o1 → o2 → o3 → n15
    link(ids.j2, ids.o1); link(ids.o1, ids.o2); link(ids.o2, ids.o3); link(ids.o3, ids.n15);
    // Kurzer Fallenweg
    link(ids.e, ids.s1); link(ids.s1, ids.s2); link(ids.s2, ids.s3); link(ids.s3, ids.s4); link(ids.s4, ids.x);
    nodes[ids.s2].streamTo = ids.x;

    islands.push({ index: i, epoch: EPOCHS[i], angle: ang, center: [cx, cy, cz], tangent: [tx, tz], radial: [rx, rz], ids, size: ISLAND_SIZE });
  }

  // ---------------------------------------------------------------- Verbindungen zwischen den Epochen
  const bridges = [], spokes = [], islets = [];
  for (let i = 0; i < 6; i++) {
    const I = islands[i], J = islands[(i + 1) % 6];
    const X = nodes[I.ids.x], E = nodes[J.ids.e];
    const lerp = (a, b, f, lift = 0) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f + lift, z: a.z + (b.z - a.z) * f });

    // Direkte Brücke (zwei Felder)
    const br1 = add({ name: `br1_${i}`, island: i, area: 'bridge', type: 'event', topic: null, bridge: true, role: 'bridge', ...lerp(X, E, 1 / 3, 1.2) });
    const br2 = add({ name: `br2_${i}`, island: i, area: 'bridge', type: 'topic', topic: TOPICS[(i + 7) % 6], bridge: true, ...lerp(X, E, 2 / 3, 1.2) });
    link(I.ids.x, br1); link(br1, br2); link(br2, J.ids.e);
    bridges.push({ island: i, node: br1, from: I.ids.x, to: br1 });

    // Nebeninsel zwischen den Epochen, weiter außen
    const ia = (i * 60 - 60) * Math.PI / 180;
    const S = { x: Math.cos(ia) * ISLET_RING, y: -1.4 + Math.cos(i * 2.1) * 0.8, z: Math.sin(ia) * ISLET_RING };
    const inward = { x: -Math.cos(ia), z: -Math.sin(ia) }; // nach innen
    const side = { x: -Math.sin(ia), z: Math.cos(ia) };    // Richtung nächste Epoche
    const onIslet = (alpha, r = 5.2) => {
      const a = alpha * Math.PI / 180;
      return { x: S.x + (inward.x * Math.cos(a) + side.x * Math.sin(a)) * r, y: S.y + 0.6, z: S.z + (inward.z * Math.cos(a) + side.z * Math.sin(a)) * r };
    };
    const t2p = onIslet(-110), t5p = onIslet(110);
    const sat = (k, type, pos, extra = {}) => add({ name: `${k}_${i}`, island: i, area: 'islet', type, topic: type === 'topic' ? TOPICS[(i + extra.slot) % 6] : null, ...pos, ...extra });
    const t1 = sat('t1', 'market', lerp(X, t2p, 0.5, 1.4), { bridge: true, role: 'islet' });
    const t2 = sat('t2', 'parliament', t2p); // Inselrat
    const t3 = sat('t3', 'concert', onIslet(-150));
    const t4 = sat('t4', 'archive', onIslet(150));
    const t5 = sat('t5', 'topic', t5p, { slot: 9 });
    const t6 = sat('t6', 'event', lerp(t5p, E, 0.5, 1.4), { bridge: true });
    link(I.ids.x, t1); link(t1, t2); link(t2, t3); link(t3, t4); link(t4, t5); link(t5, t6); link(t6, J.ids.e);
    islets.push({ index: i, center: [S.x, S.y, S.z], inward: [inward.x, inward.z], side: [side.x, side.z], size: ISLET_SIZE, nodes: [t1, t2, t3, t4, t5, t6] });

    // Speiche zum Portal (drei Felder)
    const sp = [0.72, 0.48, 0.25].map((f, k) => add({
      name: `sp${k + 1}_${i}`, island: i, area: 'spoke', spoke: true, role: k === 0 ? 'spoke' : undefined,
      type: k === 0 ? 'duel' : k === 1 ? 'topic' : i % 2 === 0 ? 'portal' : 'event',
      topic: k === 1 ? TOPICS[(i + 10) % 6] : null,
      x: X.x * f, y: X.y * f + 2.2 * (1 - f) + 1, z: X.z * f,
    }));
    link(I.ids.x, sp[0]); link(sp[0], sp[1]); link(sp[1], sp[2]); link(sp[2], hub);
    spokes.push({ island: i, from: I.ids.x, to: sp[0] });
  }
  // Vom Portal aus führt je ein Weg in jede Epoche
  for (let i = 0; i < 6; i++) link(hub, islands[i].ids.e);

  // Optionale Brücken, die das Parlament öffnen kann (Parlamentsfeld der Insel i → Eingang der Insel i+2)
  const optional = [];
  for (let i = 0; i < 6; i++) {
    const to = (i + 2) % 6;
    optional.push({ id: i, a: i, b: to, from: islands[i].ids.n15, to: islands[to].ids.e });
  }

  return { nodes, hub, islands, islets, bridges, spokes, optional };
}

// Kreuzungen = Felder mit mehr als einem Nachfolger im Grundzustand
export function countJunctions(board) {
  return board.nodes.filter((n) => n.next.length > 1).length;
}
