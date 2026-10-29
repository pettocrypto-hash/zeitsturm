// Vier unterscheidbare, animierte Spielfiguren aus Grundkörpern.
import * as THREE from 'three';
import { BOARD } from '../core/engine.js';
import { nodeTop } from './board3d.js';
import { labelTexture, glowTexture } from './textures.js';
import { ease } from './world.js';

const SLOT = [[-0.55, -0.45], [0.55, -0.45], [-0.55, 0.55], [0.55, 0.55]];

function std(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2, ...extra }); }
function glow(color, i = 1.8) { return new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: i, roughness: 0.3 }); }
function add(g, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = true;
  g.add(m);
  return m;
}

// Figur-Designs: Chronist (Robe + Sanduhr), Ingenieurin (Zahnrad-Halo), Diplomatin (Hut + Schärpe), Pilot (Schutzbrille + Flügel)
const DESIGNS = {
  chronist(g, color) {
    add(g, new THREE.ConeGeometry(0.62, 1.7, 14), std('#2a2f55'), 0, 0.85);
    add(g, new THREE.CylinderGeometry(0.64, 0.64, 0.1, 14), glow(color, 1.2), 0, 0.25);
    add(g, new THREE.SphereGeometry(0.34, 16, 12), std('#f0d6c0'), 0, 1.85);
    add(g, new THREE.ConeGeometry(0.42, 0.6, 14), std(color), 0, 2.2);
    const hg = new THREE.Group(); hg.position.set(0.75, 1.5, 0); g.add(hg);
    add(hg, new THREE.ConeGeometry(0.18, 0.28, 10), glow('#ffd27a', 1.4), 0, 0.15).rotation.x = Math.PI;
    add(hg, new THREE.ConeGeometry(0.18, 0.28, 10), glow('#ffd27a', 1.4), 0, -0.15);
    return (t) => { hg.rotation.z = Math.sin(t * 1.5) * 0.4; hg.position.y = 1.5 + Math.sin(t * 2) * 0.1; };
  },
  ingenieurin(g, color) {
    add(g, new THREE.CylinderGeometry(0.42, 0.55, 1.3, 14), std('#3b3f4f'), 0, 0.75);
    add(g, new THREE.SphereGeometry(0.36, 16, 12), std('#e7c2a5'), 0, 1.75);
    add(g, new THREE.SphereGeometry(0.38, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(color), 0, 1.82);
    add(g, new THREE.BoxGeometry(0.9, 0.18, 0.6), glow(color, 1.1), 0, 1.1);
    const halo = new THREE.Group(); halo.position.y = 2.45; g.add(halo);
    add(halo, new THREE.TorusGeometry(0.42, 0.07, 6, 20), glow(color, 2));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const tth = add(halo, new THREE.BoxGeometry(0.12, 0.16, 0.08), glow(color, 2), Math.cos(a) * 0.5, Math.sin(a) * 0.5); tth.rotation.z = a; }
    halo.rotation.x = Math.PI / 2;
    return (t) => { halo.rotation.z = t * 1.5; };
  },
  diplomatin(g, color) {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.7, 0), new THREE.Vector2(0.45, 0.6), new THREE.Vector2(0.32, 1.2), new THREE.Vector2(0.36, 1.45), new THREE.Vector2(0, 1.5)];
    add(g, new THREE.LatheGeometry(pts, 18), std('#f2f2f8'), 0, 0.15);
    const sash = add(g, new THREE.TorusGeometry(0.42, 0.06, 6, 24), glow(color, 1.5), 0, 1.0);
    sash.rotation.x = Math.PI / 2.4;
    add(g, new THREE.SphereGeometry(0.33, 16, 12), std('#d9a98a'), 0, 1.92);
    add(g, new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20), std(color), 0, 2.16);
    add(g, new THREE.CylinderGeometry(0.3, 0.32, 0.36, 16), std(color), 0, 2.36);
    const doc = add(g, new THREE.BoxGeometry(0.34, 0.44, 0.04), glow('#ffffff', 0.8), 0.62, 1.2, 0.2);
    return (t) => { doc.rotation.y = Math.sin(t * 1.2) * 0.5; };
  },
  pilot(g, color) {
    add(g, new THREE.CapsuleGeometry(0.4, 0.8, 6, 12), std('#5a4636'), 0, 0.85);
    add(g, new THREE.SphereGeometry(0.36, 16, 12), std('#e9c4a6'), 0, 1.8);
    add(g, new THREE.SphereGeometry(0.38, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), std('#3a2a1e'), 0, 1.84);
    const gog = add(g, new THREE.TorusGeometry(0.33, 0.07, 6, 20), glow(color, 1.8), 0, 1.86, 0.06);
    gog.scale.set(1, 0.45, 1);
    const wings = new THREE.Group(); wings.position.set(0, 1.15, -0.4); g.add(wings);
    const wl = add(wings, new THREE.BoxGeometry(0.9, 0.08, 0.4), glow(color, 1.2), -0.55, 0); wl.rotation.z = 0.25;
    const wr = add(wings, new THREE.BoxGeometry(0.9, 0.08, 0.4), glow(color, 1.2), 0.55, 0); wr.rotation.z = -0.25;
    return (t) => { wl.rotation.z = 0.25 + Math.sin(t * 6) * 0.15; wr.rotation.z = -0.25 - Math.sin(t * 6) * 0.15; };
  },
};

export const FIGURE_ICONS = { chronist: '⌛', ingenieurin: '⚙', diplomatin: '🎩', pilot: '✈' };

export class Pieces {
  constructor(world) {
    this.world = world;
    this.items = [];
    this.active = -1;
    world.addUpdater((dt, t) => this.update(dt, t));
  }

  setup(players, colorOf) {
    for (const it of this.items) this.world.scene.remove(it.group);
    this.items = players.map((p, i) => {
      const color = colorOf(p).hex;
      const group = new THREE.Group();
      const body = new THREE.Group();
      group.add(body);
      const anim = (DESIGNS[p.figure] || DESIGNS.chronist)(body, color);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.92, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
      group.add(ring);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(4, 4, 1); halo.position.y = 1.2;
      group.add(halo);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(p.name, color, colorOf(p).symbol), transparent: true, depthTest: false }));
      label.scale.set(3.2, 0.8, 1); label.position.y = 3.3; label.renderOrder = 5;
      group.add(label);
      group.scale.setScalar(0.85);
      this.world.scene.add(group);
      const item = { group, body, anim, ring, halo, label, index: i, node: p.pos, moving: false, phase: i * 1.7 };
      this.place(item, p.pos, players);
      return item;
    });
  }

  slotFor(index, nodeId) {
    const s = SLOT[index % 4];
    const k = nodeId === BOARD.hub ? 1.8 : 1;
    const top = nodeTop(nodeId);
    return new THREE.Vector3(top.x + s[0] * k, top.y, top.z + s[1] * k);
  }

  place(item, nodeId) {
    item.node = nodeId;
    item.group.position.copy(this.slotFor(item.index, nodeId));
  }

  sync(players) {
    players.forEach((p, i) => {
      const it = this.items[i];
      if (it && !it.moving && it.node !== p.pos) this.place(it, p.pos);
    });
  }

  position(i) { return this.items[i] ? this.items[i].group.position.clone() : new THREE.Vector3(); }

  setActive(i) { this.active = i; }

  async walk(i, path, onStep) {
    const it = this.items[i];
    if (!it) return;
    it.moving = true;
    for (let k = 1; k < path.length; k++) {
      const from = it.group.position.clone();
      const to = this.slotFor(it.index, path[k]);
      const dir = to.clone().sub(from);
      if (dir.lengthSq() > 0.01) it.body.rotation.y = Math.atan2(dir.x, dir.z);
      const dist = from.distanceTo(to);
      const dur = Math.min(0.55, 0.2 + dist * 0.022);
      await this.world.tween(dur, (e) => {
        it.group.position.lerpVectors(from, to, e);
        it.group.position.y += Math.sin(e * Math.PI) * (0.9 + dist * 0.05);
      }, ease.inOut);
      it.node = path[k];
      onStep?.(path[k], k === path.length - 1);
    }
    it.moving = false;
  }

  async teleport(i, nodeId, onMid) {
    const it = this.items[i];
    if (!it) return;
    it.moving = true;
    await this.world.tween(0.35, (e) => it.group.scale.setScalar(0.85 * (1 - e)), ease.inOut);
    this.place(it, nodeId);
    onMid?.();
    await this.world.tween(0.45, (e) => it.group.scale.setScalar(0.85 * e), ease.back);
    it.moving = false;
  }

  emoteBounce(i) {
    const it = this.items[i];
    if (!it) return;
    this.world.tween(0.5, (e) => { it.body.position.y = Math.sin(e * Math.PI) * 0.8; });
  }

  update(dt, t) {
    for (const it of this.items) {
      it.anim?.(t + it.phase);
      if (!it.moving) it.body.position.y = Math.abs(Math.sin(t * 2 + it.phase)) * (it.index === this.active ? 0.22 : 0.06);
      const act = it.index === this.active;
      it.halo.material.opacity += ((act ? 0.55 : 0) - it.halo.material.opacity) * Math.min(1, dt * 5);
      it.ring.rotation.z += dt * (act ? 2 : 0.3);
      const s = act ? 1 + Math.sin(t * 5) * 0.08 : 1;
      it.ring.scale.set(s, s, s);
    }
  }
}
