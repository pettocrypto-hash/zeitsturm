// Brett-Generierung: sechs Epochen-Inseln um ein zentrales Zeitportal.
// Das Brett ist ein gerichteter Graph. Kreuzungen (mehr als ein Nachfolger) erzwingen eine Wegwahl.
import { TOPICS, EPOCHS } from './constants.js';

export const ISLAND_RADIUS_WORLD = 44;

// Lokales Layout einer Insel: u = entlang der Umlaufrichtung, v = radial nach außen.
const LAYOUT = [
  { key: 'e',  u: -10, v: 0,    type: 'topic', topicSlot: 0 },
  { key: 'm1', u: -7,  v: -1.6, type: 'event' },
  { key: 'm2', u: -4,  v: -1,   type: 'topic', topicSlot: 1 },  // Kreuzung 1: sicher/lang vs. riskant/kurz
  { key: 'a1', u: -2.6, v: 3.8, type: 'topic', topicSlot: 2 },
  { key: 'a2', u: 0.4, v: 6,    type: 'challenge' },             // Epochen-Herausforderung (Belohnung)
  { key: 'a3', u: 3.6, v: 3.8,  type: 'market' },
  { key: 'b1', u: 0,   v: -3,   type: 'trap' },                  // Falle: Duell oder Zeitportal
  { key: 'm3', u: 4,   v: -1,   type: 'parliament' },
  { key: 'm4', u: 7,   v: -1.6, type: 'concert' },
  { key: 'x',  u: 10,  v: 0,    type: 'topic', topicSlot: 3 },   // Kreuzung 2: nächste Insel vs. Speiche zum Portal
];
const TOPIC_OFFSETS = [0, 1, 3, 4];

export function buildBoard() {
  const nodes = [];
  const add = (n) => { n.id = nodes.length; n.next = []; nodes.push(n); return n.id; };
  const hub = add({ name: 'hub', island: -1, type: 'hub', topic: null, x: 0, y: 2.5, z: 0 });
  const islands = [];

  for (let i = 0; i < 6; i++) {
    const ang = (i * 60 - 90) * Math.PI / 180;
    const cx = Math.cos(ang) * ISLAND_RADIUS_WORLD, cz = Math.sin(ang) * ISLAND_RADIUS_WORLD;
    const cy = Math.sin(i * 1.7) * 1.5;
    const tx = -Math.sin(ang), tz = Math.cos(ang); // Tangente
    const rx = Math.cos(ang), rz = Math.sin(ang);  // radial
    const ids = {};
    for (const L of LAYOUT) {
      let type = L.type, topic = null;
      if (type === 'trap') type = i % 2 === 0 ? 'duel' : 'portal';
      if (type === 'topic') topic = TOPICS[(i + TOPIC_OFFSETS[L.topicSlot]) % 6];
      ids[L.key] = add({
        name: `${L.key}${i}`, island: i, type, topic,
        x: cx + tx * L.u + rx * L.v, y: cy + 0.6, z: cz + tz * L.u + rz * L.v,
      });
    }
    islands.push({ index: i, epoch: EPOCHS[i], angle: ang, center: [cx, cy, cz], tangent: [tx, tz], radial: [rx, rz], ids });
  }

  const link = (a, b) => { if (!nodes[a].next.includes(b)) nodes[a].next.push(b); };
  const bridges = [], spokes = [];

  for (let i = 0; i < 6; i++) {
    const I = islands[i].ids;
    link(I.e, I.m1); link(I.m1, I.m2);
    link(I.m2, I.a1); link(I.a1, I.a2); link(I.a2, I.a3); link(I.a3, I.m3); // sicherer, langer Weg
    link(I.m2, I.b1); link(I.b1, I.m3);                                     // riskanter Kurzweg
    link(I.m3, I.m4); link(I.m4, I.x);

    // Brücke zur nächsten Insel (ein Ereignisfeld in der Mitte)
    const J = islands[(i + 1) % 6].ids;
    const xa = nodes[I.x], eb = nodes[J.e];
    const br = add({ name: `br${i}`, island: i, type: 'event', topic: null, bridge: true,
      x: (xa.x + eb.x) / 2, y: (xa.y + eb.y) / 2 + 1.2, z: (xa.z + eb.z) / 2 });
    link(I.x, br); link(br, J.e);
    bridges.push({ island: i, node: br, from: I.x, to: br });

    // Speiche nach innen zum Portal
    const s1 = add({ name: `s1_${i}`, island: i, type: 'duel', topic: null, spoke: true,
      x: xa.x * 0.62, y: xa.y * 0.6 + 1.2, z: xa.z * 0.62 });
    const s2 = add({ name: `s2_${i}`, island: i, type: i % 2 === 0 ? 'portal' : 'event', topic: null, spoke: true,
      x: xa.x * 0.3, y: 1.8, z: xa.z * 0.3 });
    link(I.x, s1); link(s1, s2); link(s2, hub);
    spokes.push({ island: i, from: I.x, to: s1 });
  }
  // Vom Portal aus führt je ein Weg auf jede Insel
  for (let i = 0; i < 6; i++) link(hub, islands[i].ids.e);

  // Optionale Brücken, die das Parlament öffnen kann (Insel i -> Insel i+2)
  const optional = [];
  for (let i = 0; i < 6; i++) {
    const to = (i + 2) % 6;
    optional.push({ id: i, a: i, b: to, from: islands[i].ids.m4, to: islands[to].ids.m1 });
  }

  return { nodes, hub, islands, bridges, spokes, optional };
}

// Kreuzungen = Felder mit mehr als einem Nachfolger im Grundzustand
export function countJunctions(board) {
  return board.nodes.filter((n) => n.next.length > 1).length;
}
