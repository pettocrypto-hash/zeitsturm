// Spielbrett in 3D: Epochen-Inseln, Felder, Wege, Brücken und das zentrale Zeitportal.
import * as THREE from 'three';
import { BOARD } from '../core/engine.js';
import { EPOCHS, EPOCH_INFO, TOPIC_INFO, FIELD_INFO } from '../core/constants.js';
import { iconTexture, flowTexture, glowTexture, windowTexture } from './textures.js';

const NODES = BOARD.nodes;
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts }));
  return matCache.get(key);
}
function glowMat(color, intensity = 1.6) {
  return mat(color, { emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4 });
}
function mesh(geo, material, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}
const box = (w, h, d, m) => mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, seg, m) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const cone = (r, h, seg, m) => mesh(new THREE.ConeGeometry(r, h, seg), m);
const sphere = (r, m, ws = 16, hs = 12) => mesh(new THREE.SphereGeometry(r, ws, hs), m);

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function nodeTop(id) {
  const n = NODES[id];
  return new THREE.Vector3(n.x, n.y + 0.25, n.z);
}

export class Board3D {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.tiles = new Map();
    this.edges = new Map();
    this.optionalEdges = [];
    this.highlights = [];
    this.anims = [];
    this.particleSets = [];
    this.q = world.q;
    this.build();
    world.addUpdater((dt, t) => this.update(dt, t));
  }

  build() {
    BOARD.islands.forEach((isl) => this.buildIsland(isl));
    this.buildPortal();
    for (const n of NODES) if (n.type !== 'hub') this.buildTile(n);
    for (const n of NODES) for (const to of n.next) this.buildEdge(n.id, to, n.bridge || NODES[to].bridge ? 'bridge' : n.spoke || NODES[to].spoke || n.type === 'hub' ? 'spoke' : 'path');
    for (const ob of BOARD.optional) {
      const e = this.buildEdge(ob.from, ob.to, 'optional');
      e.mesh.visible = false;
      this.optionalEdges[ob.id] = e;
    }
    this.buildDebris();
  }

  // ------------------------------------------------------------ Inseln
  buildIsland(isl) {
    const info = EPOCH_INFO[isl.epoch];
    const [cx, cy, cz] = isl.center;
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    this.group.add(g);
    isl.group = g;
    const r = rng(1000 + isl.index * 77);

    // Oberfläche
    const top = mesh(new THREE.CylinderGeometry(14, 13.2, 1.4, 40), mat(info.color, { roughness: 0.95 }), false);
    top.position.y = -0.3;
    g.add(top);
    // Felsunterseite mit Rauschen
    const rockGeo = new THREE.ConeGeometry(13.2, 18, 30, 8);
    rockGeo.rotateX(Math.PI);
    const p = rockGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * 0.9 + isl.index) * Math.cos(z * 0.8) * 0.9 + Math.sin(y * 1.3 + x) * 0.6;
      const f = 1 + n * 0.12 * (1 - (y + 9) / 18);
      p.setXYZ(i, x * f, y, z * f);
    }
    rockGeo.computeVertexNormals();
    const rock = mesh(rockGeo, mat('#2a2438', { flatShading: true, roughness: 1 }), false);
    rock.position.y = -10;
    g.add(rock);
    // Leuchtender Rand in Epochenfarbe
    const rim = new THREE.Mesh(new THREE.TorusGeometry(14, 0.14, 8, 80), glowMat(info.accent, 2.2));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.42;
    g.add(rim);
    // Farbiges Leuchten unter der Insel
    const under = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: info.accent, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
    under.scale.set(34, 34, 1); under.position.y = -13;
    g.add(under);
    if (this.q.lights) {
      const light = new THREE.PointLight(info.accent, 60, 38, 1.6);
      light.position.set(0, 9, 0);
      g.add(light);
    }

    const place = (obj, u, v) => {
      const [tx, tz] = isl.tangent, [rx, rz] = isl.radial;
      obj.position.x = tx * u + rx * v;
      obj.position.z = tz * u + rz * v;
      obj.lookAt(new THREE.Vector3(-cx, obj.position.y, -cz));
      g.add(obj);
      return obj;
    };
    const decor = this.q.decor;
    const builders = { antike: buildAntike, mittelalter: buildMittelalter, industrie: buildIndustrie, weltkrieg: buildWeltkrieg, kalterkrieg: buildKalterkrieg, zukunft: buildZukunft };
    builders[isl.epoch]({ place, r, decor, info, anims: this.anims, board: this, group: g });

    // Schwebende Epochen-Partikel
    const count = Math.round(70 * this.q.particles);
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, rad = r() * 15;
      pos[i * 3] = Math.cos(a) * rad; pos[i * 3 + 1] = 1 + r() * 9; pos[i * 3 + 2] = Math.sin(a) * rad;
      seeds[i] = r() * 100;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.45, map: glowTexture(), color: info.accent, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(pts);
    this.particleSets.push({ pts, seeds, base: pos.slice(), kind: isl.epoch });
  }

  buildDebris() {
    const r = rng(42);
    const m = mat('#2c2740', { flatShading: true });
    const n = Math.round(26 * this.q.decor);
    for (let i = 0; i < n; i++) {
      const geo = new THREE.DodecahedronGeometry(0.6 + r() * 1.6, 0);
      const d = mesh(geo, m, false);
      const a = r() * Math.PI * 2, rad = 25 + r() * 50;
      d.position.set(Math.cos(a) * rad, -6 + r() * 14, Math.sin(a) * rad);
      d.userData.spin = (r() - 0.5) * 0.4;
      d.userData.bob = r() * 10;
      this.group.add(d);
      this.anims.push((dt, t) => { d.rotation.y += d.userData.spin * dt; d.position.y += Math.sin(t * 0.6 + d.userData.bob) * dt * 0.25; });
    }
  }

  // ------------------------------------------------------------ Zeitportal
  buildPortal() {
    const g = new THREE.Group();
    const hub = NODES[BOARD.hub];
    g.position.set(hub.x, 0, hub.z);
    this.group.add(g);
    this.portal = g;
    const base = mesh(new THREE.CylinderGeometry(7.5, 9.5, 2.4, 48), mat('#1a1d38', { metalness: 0.6, roughness: 0.35 }));
    base.position.y = 1.0;
    g.add(base);
    const under = mesh(new THREE.ConeGeometry(9.5, 14, 32, 1), mat('#221c35', { flatShading: true }), false);
    under.rotation.x = Math.PI; under.position.y = -7.2;
    g.add(under);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.18, 8, 90), glowMat('#2fe6ff', 1.6));
    rim.rotation.x = Math.PI / 2; rim.position.y = 2.25;
    g.add(rim);
    const colors = ['#2fe6ff', '#ff3fb4', '#ffc83a'];
    this.portalRings = [5.6, 4.4, 3.2].map((rad, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.14 + i * 0.03, 10, 90), glowMat(colors[i], 1.35));
      ring.position.y = 9;
      g.add(ring);
      return ring;
    });
    // Wirbelnder Kern
    const coreMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { t: { value: 0 }, power: { value: 0.6 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float t; uniform float power; varying vec2 vUv;
        void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.y,p.x);
          float s = sin(a*5.0 + r*12.0 - t*3.0)*0.5+0.5; float glow = smoothstep(1.0,0.0,r);
          vec3 c = mix(vec3(0.18,0.9,1.0), vec3(1.0,0.25,0.7), s) * glow * (0.3+power*0.5);
          gl_FragColor = vec4(c, glow*(0.35+0.4*s)); }`,
    });
    const core = new THREE.Mesh(new THREE.CircleGeometry(4.6, 64), coreMat);
    core.position.y = 9;
    g.add(core);
    this.portalCore = core;
    // Lichtsäule
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#2fe6ff', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 34;
    g.add(beam);
    // Wirbel-Partikel
    const n = Math.round(320 * this.q.particles);
    const pos = new Float32Array(n * 3);
    const data = [];
    for (let i = 0; i < n; i++) data.push({ a: Math.random() * Math.PI * 2, r: 1 + Math.random() * 7, y: Math.random() * 16, s: 0.4 + Math.random() });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.38, map: glowTexture(), color: '#9ff3ff', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(pts);
    this.anims.push((dt, t) => {
      for (let i = 0; i < n; i++) {
        const d = data[i];
        d.a += dt * d.s * (1.6 - d.r * 0.12);
        d.y += dt * d.s * 1.2;
        d.r -= dt * 0.18;
        if (d.y > 18 || d.r < 0.4) { d.y = 2; d.r = 4 + Math.random() * 4; }
        pos[i * 3] = Math.cos(d.a) * d.r; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = Math.sin(d.a) * d.r;
      }
      pg.attributes.position.needsUpdate = true;
      this.portalRings[0].rotation.x = t * 0.5; this.portalRings[0].rotation.y = t * 0.3;
      this.portalRings[1].rotation.y = -t * 0.7; this.portalRings[1].rotation.z = t * 0.4;
      this.portalRings[2].rotation.x = -t * 0.9; this.portalRings[2].rotation.z = t * 0.2;
      coreMat.uniforms.t.value = t;
      core.lookAt(this.world.camera.position);
    });
    // Portal-Feld
    const tile = mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 6), mat('#1c2350', { emissive: new THREE.Color('#2fe6ff'), emissiveIntensity: 0.35 }));
    tile.position.set(0, hub.y - 0.05, 0);
    g.add(tile);
    const icon = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ map: iconTexture('✦', '#ffffff'), transparent: true, toneMapped: false }));
    icon.rotation.x = -Math.PI / 2; icon.position.set(0, hub.y + 0.22, 0);
    g.add(icon);
    this.tiles.set(BOARD.hub, { mesh: tile, icon, baseY: tile.position.y, node: hub, hub: true });
  }

  setPortalPower(v) { this.portalCore.material.uniforms.power.value = v; }

  // ------------------------------------------------------------ Felder
  tileLook(n, topicOverride) {
    if (n.type === 'topic') {
      const t = topicOverride || n.topic;
      return { color: TOPIC_INFO[t].color, symbol: TOPIC_INFO[t].icon };
    }
    return { color: FIELD_INFO[n.type].color, symbol: FIELD_INFO[n.type].icon };
  }

  buildTile(n) {
    const look = this.tileLook(n);
    const material = new THREE.MeshStandardMaterial({ color: '#161b38', emissive: new THREE.Color(look.color), emissiveIntensity: 0.28, roughness: 0.5, metalness: 0.3 });
    const big = n.type === 'challenge';
    const tile = mesh(new THREE.CylinderGeometry(big ? 1.75 : 1.32, big ? 1.95 : 1.48, 0.5, 6), material);
    tile.position.set(n.x, n.y - 0.05, n.z);
    tile.userData.nodeId = n.id;
    this.group.add(tile);
    const icon = new THREE.Mesh(new THREE.CircleGeometry(big ? 1.3 : 0.98, 32), new THREE.MeshBasicMaterial({ map: iconTexture(look.symbol, look.color), transparent: true, toneMapped: false }));
    icon.rotation.x = -Math.PI / 2;
    icon.position.set(n.x, n.y + 0.215, n.z);
    this.group.add(icon);
    const entry = { mesh: tile, icon, baseY: tile.position.y, node: n, removed: false };
    if (big) {
      // Wächter-Krone über der Herausforderung
      const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), glowMat('#ffb300', 2.2));
      crown.position.set(n.x, n.y + 2.4, n.z);
      this.group.add(crown);
      entry.crown = crown;
      this.anims.push((dt, t) => { crown.rotation.y += dt * 1.2; crown.position.y = n.y + 2.4 + Math.sin(t * 2 + n.id) * 0.25; });
    }
    this.tiles.set(n.id, entry);
  }

  recolor(nodeId, topic) {
    const e = this.tiles.get(nodeId);
    if (!e || e.node.type !== 'topic') return;
    const look = this.tileLook(e.node, topic);
    e.mesh.material.emissive.set(look.color);
    e.icon.material.map = iconTexture(look.symbol, look.color);
    e.icon.material.needsUpdate = true;
  }

  setRemoved(nodeId, removed, animate = true) {
    const e = this.tiles.get(nodeId);
    if (!e || e.removed === removed) return;
    e.removed = removed;
    const from = e.mesh.position.y, to = removed ? e.baseY - 0.55 : e.baseY;
    e.icon.material.opacity = removed ? 0.18 : 1;
    e.mesh.material.emissive.set(removed ? '#ff2a4a' : this.tileLook(e.node).color);
    e.mesh.material.emissiveIntensity = removed ? 0.5 : 0.28;
    const apply = (k) => {
      e.mesh.position.y = from + (to - from) * k;
      e.icon.position.y = e.mesh.position.y + 0.265;
      e.mesh.rotation.z = removed ? 0.12 * k : 0;
    };
    if (animate) this.world.tween(0.8, apply); else apply(1);
  }

  pulseTile(nodeId) {
    const e = this.tiles.get(nodeId);
    if (!e) return;
    this.world.tween(0.45, (k) => { const s = 1 + Math.sin(k * Math.PI) * 0.18; e.mesh.scale.set(s, 1 + Math.sin(k * Math.PI) * 0.6, s); });
  }

  // ------------------------------------------------------------ Wege
  buildEdge(from, to, kind) {
    const a = nodeTop(from), b = nodeTop(to);
    a.y -= 0.1; b.y -= 0.1;
    const len = a.distanceTo(b);
    const mid = a.clone().lerp(b, 0.5);
    const lift = kind === 'optional' ? 16 : kind === 'bridge' ? 2.2 : kind === 'spoke' ? 1.6 : 0.5;
    mid.y += lift;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const radius = kind === 'path' ? 0.14 : 0.24;
    const geo = new THREE.TubeGeometry(curve, Math.max(6, Math.round(len * 1.2)), radius, 6, false);
    const color = { path: '#d8e6ff', bridge: '#2fe6ff', spoke: '#b07bff', optional: '#ffc83a' }[kind];
    const tex = flowTexture(color).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, len / 2.6), 1);
    const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: kind === 'path' ? 0.75 : 0.9, depthWrite: false, toneMapped: false, color: '#ffffff' });
    const m = new THREE.Mesh(geo, material);
    this.group.add(m);
    if (kind !== 'path') {
      // dunkler Brückenkörper
      const body = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(6, Math.round(len * 1.2)), radius * 1.9, 6, false), mat('#151a35', { transparent: true, opacity: 0.55 }));
      body.visible = true;
      m.add(body);
      body.position.set(0, 0, 0);
    }
    const e = { from, to, kind, mesh: m, tex, curve, state: 'open' };
    this.edges.set(`${from}>${to}`, e);
    return e;
  }

  setEdgeBlocked(from, to, blocked) {
    const e = this.edges.get(`${from}>${to}`);
    if (!e) return;
    e.state = blocked ? 'blocked' : 'open';
    e.mesh.material.color.set(blocked ? '#ff2a4a' : '#ffffff');
    e.mesh.material.opacity = blocked ? 0.35 : 0.9;
    if (blocked && !e.barrier) {
      const p = e.curve.getPoint(0.15);
      const bar = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 8, 24), glowMat('#ff2a4a', 2.5));
      bar.position.copy(p);
      bar.lookAt(e.curve.getPoint(0.2));
      this.group.add(bar);
      e.barrier = bar;
    } else if (!blocked && e.barrier) {
      this.group.remove(e.barrier);
      e.barrier.geometry.dispose();
      e.barrier = null;
    }
  }

  showOptional(id, animate = true) {
    const e = this.optionalEdges[id];
    if (!e || e.mesh.visible) return;
    e.mesh.visible = true;
    const geo = e.mesh.geometry;
    const total = geo.index ? geo.index.count : geo.attributes.position.count;
    if (!animate) return;
    this.world.tween(1.6, (k) => { geo.setDrawRange(0, Math.floor(total * k)); });
  }

  // Board-Zustand aus dem Spielzustand übernehmen (z. B. nach Reconnect oder Spielstand laden)
  syncMods(mods, effectiveTopic) {
    for (const [key, e] of this.edges) {
      const blocked = mods.blocked.includes(key);
      if ((e.state === 'blocked') !== blocked) this.setEdgeBlocked(e.from, e.to, blocked);
    }
    this.optionalEdges.forEach((e, id) => {
      if (mods.opened.includes(id)) this.showOptional(id, false);
      else { e.mesh.visible = false; e.mesh.geometry.setDrawRange(0, Infinity); }
    });
    for (const [id, e] of this.tiles) {
      if (e.hub) continue;
      this.setRemoved(id, mods.removed.includes(id), false);
      if (e.node.type === 'topic') this.recolor(id, effectiveTopic(id));
    }
  }

  // ------------------------------------------------------------ Hervorhebung von Wegoptionen
  highlight(nodeIds, color = '#2fe6ff') {
    this.clearHighlight();
    for (const id of nodeIds) {
      const p = nodeTop(id);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.14, 8, 40), glowMat(color, 3));
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(p).add(new THREE.Vector3(0, 0.2, 0));
      ring.userData.nodeId = id;
      this.group.add(ring);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 4), glowMat(color, 2.4));
      arrow.rotation.x = Math.PI;
      arrow.position.copy(p).add(new THREE.Vector3(0, 3, 0));
      this.group.add(arrow);
      this.highlights.push(ring, arrow);
    }
  }

  clearHighlight() {
    for (const h of this.highlights) { this.group.remove(h); h.geometry.dispose(); }
    this.highlights = [];
  }

  pickTile(raycaster) {
    const objs = [...this.tiles.values()].map((e) => e.mesh).concat(this.highlights);
    const hit = raycaster.intersectObjects(objs, false)[0];
    return hit ? hit.object.userData.nodeId : null;
  }

  update(dt, t) {
    for (const e of this.edges.values()) if (e.state === 'open') e.tex.offset.x -= dt * (e.kind === 'path' ? 0.35 : 0.6);
    for (const e of this.optionalEdges) if (e?.mesh.visible) e.tex.offset.x -= dt * 0.6;
    for (const a of this.anims) a(dt, t);
    for (const h of this.highlights) { const s = 1 + Math.sin(t * 6) * 0.12; h.scale.set(s, s, s); }
    for (const ps of this.particleSets) {
      const arr = ps.pts.geometry.attributes.position.array;
      const rise = ps.kind === 'industrie' ? 0.5 : ps.kind === 'kalterkrieg' ? -0.35 : 0.12;
      for (let i = 0; i < ps.seeds.length; i++) {
        const s = ps.seeds[i];
        arr[i * 3] = ps.base[i * 3] + Math.sin(t * 0.3 + s) * 0.8;
        arr[i * 3 + 2] = ps.base[i * 3 + 2] + Math.cos(t * 0.27 + s) * 0.8;
        let y = ps.base[i * 3 + 1] + ((t * rise + s) % 10);
        if (rise < 0) y = 10 - ((t * -rise + s) % 10);
        arr[i * 3 + 1] = rise === 0.12 ? ps.base[i * 3 + 1] + Math.sin(t * 0.8 + s) * 0.6 : y;
      }
      ps.pts.geometry.attributes.position.needsUpdate = true;
    }
  }
}

// ======================================================================= Epochen-Dekor
function tree(m1, m2, h = 1) {
  const g = new THREE.Group();
  const trunk = cyl(0.14, 0.22, 1.1 * h, 6, m1); trunk.position.y = 0.55 * h; g.add(trunk);
  const crown = sphere(0.85 * h, m2, 8, 6); crown.position.y = 1.5 * h; g.add(crown);
  return g;
}
function pine(m1, m2, h = 1) {
  const g = new THREE.Group();
  const trunk = cyl(0.12, 0.18, 0.8 * h, 6, m1); trunk.position.y = 0.4 * h; g.add(trunk);
  const c1 = cone(0.9 * h, 1.8 * h, 7, m2); c1.position.y = 1.6 * h; g.add(c1);
  const c2 = cone(0.65 * h, 1.4 * h, 7, m2); c2.position.y = 2.4 * h; g.add(c2);
  return g;
}
function prism(w, h, d, m) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return mesh(geo, m);
}

function buildAntike({ place, r, decor, info, anims }) {
  const marble = mat('#f1ead8', { roughness: 0.6 });
  const gold = glowMat('#ffcf6b', 0.9);
  // Tempel (Wächter-Sitz hinter der Herausforderung)
  const t = new THREE.Group();
  const steps = box(9.6, 0.4, 6.4, marble); steps.position.y = 0.2; t.add(steps);
  const base = box(8.8, 0.5, 5.6, marble); base.position.y = 0.65; t.add(base);
  for (let i = 0; i < 5; i++) for (const z of [-2.2, 2.2]) {
    const c = cyl(0.3, 0.36, 3.6, 12, marble); c.position.set(-3.6 + i * 1.8, 2.7, z); t.add(c);
  }
  const arch = box(8.8, 0.55, 5.6, marble); arch.position.y = 4.75; t.add(arch);
  const roof = prism(6, 1.6, 9.2, marble); roof.position.y = 5.02; roof.rotation.y = Math.PI / 2; t.add(roof);
  const frieze = box(8.9, 0.14, 5.7, gold); frieze.position.y = 4.5; t.add(frieze);
  place(t, 0, 10.2);
  // Statue
  const st = new THREE.Group();
  const ped = cyl(0.6, 0.7, 1, 10, marble); ped.position.y = 0.5; st.add(ped);
  const fig = cone(0.45, 1.8, 10, gold); fig.position.y = 1.9; st.add(fig);
  const head = sphere(0.3, gold); head.position.y = 3.0; st.add(head);
  place(st, -6.5, -6);
  // Säulenstümpfe und Olivenbäume
  const trunk = mat('#6b4a2b'), olive = mat('#7c8f4a', { flatShading: true });
  const spots = [[-8, 5], [8, 6], [6, -7], [-3, -9], [3, 10.5], [-9, -3], [11, 4]];
  spots.slice(0, Math.max(2, Math.round(spots.length * decor))).forEach(([u, v], i) => {
    if (i % 2) { const c = cyl(0.3, 0.36, 0.8 + r() * 1.8, 10, marble); c.position.y = c.geometry.parameters.height / 2; place(c, u, v); }
    else place(tree(trunk, olive, 0.9 + r() * 0.4), u, v);
  });
  // Amphitheater (Halbring aus Stufen)
  const amph = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.CylinderGeometry(2.6 + i * 0.7, 2.6 + i * 0.7, 0.35, 24, 1, false, 0, Math.PI), marble);
    ring.position.y = 0.18 + i * 0.35; amph.add(ring);
  }
  place(amph, 5.5, -7.5);
}

function buildMittelalter({ place, r, decor }) {
  const stone = mat('#8d8f98', { flatShading: true, roughness: 0.95 });
  const roofR = mat('#8e2d2d'), roofB = mat('#2d4a8e'), wood = mat('#5b3b22');
  const banner = glowMat('#b6e07a', 0.8);
  const castle = new THREE.Group();
  for (const [x, z] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
    const tw = cyl(0.95, 1.05, 4.2, 10, stone); tw.position.set(x, 2.1, z); castle.add(tw);
    const rf = cone(1.25, 1.8, 10, x * z > 0 ? roofR : roofB); rf.position.set(x, 5.1, z); castle.add(rf);
    const fl = box(0.06, 0.5, 0.7, banner); fl.position.set(x, 6.3, z + 0.35); castle.add(fl);
  }
  for (const [x, z, w, d] of [[0, -3.5, 7, 0.6], [0, 3.5, 7, 0.6], [-3.5, 0, 0.6, 7], [3.5, 0, 0.6, 7]]) {
    const wall = box(w, 2.6, d, stone); wall.position.set(x, 1.3, z); castle.add(wall);
  }
  const keep = box(3, 5, 3, stone); keep.position.y = 2.5; castle.add(keep);
  const kr = cone(2.3, 2.2, 4, roofR); kr.position.y = 6.1; kr.rotation.y = Math.PI / 4; castle.add(kr);
  castle.scale.setScalar(0.85);
  place(castle, 0, 10.2);
  const trunk = mat('#4a3320'), needle = mat('#2f5a34', { flatShading: true });
  const spots = [[-8, 5], [8, 6.5], [6, -7], [-6, -7], [-2, -9.5], [2, -10], [-10, -3], [10.5, 4], [-4, 11]];
  spots.slice(0, Math.max(3, Math.round(spots.length * decor))).forEach(([u, v]) => place(pine(trunk, needle, 0.8 + r() * 0.6), u, v));
  // Fachwerkhaus
  const house = new THREE.Group();
  const hb = box(2.2, 1.6, 1.8, mat('#e8dcc0')); hb.position.y = 0.8; house.add(hb);
  const hr = prism(2.6, 1.3, 2.1, wood); hr.position.y = 1.6; house.add(hr);
  place(house, 5.5, -6.5);
}

function buildIndustrie({ place, r, decor, anims, board, group }) {
  const brick = mat('#8a4a35', { roughness: 0.9 }), metal = mat('#5b6070', { metalness: 0.6, roughness: 0.4 });
  const win = new THREE.MeshStandardMaterial({ map: windowTexture('#ffb35a', '#3a2620', 6, 3), emissive: new THREE.Color('#ff9a3d'), emissiveMap: windowTexture('#ffb35a', '#000000', 6, 3), emissiveIntensity: 0.9 });
  const fac = new THREE.Group();
  const hall = mesh(new THREE.BoxGeometry(7.5, 2.8, 4), [brick, brick, brick, brick, win, win]);
  hall.position.y = 1.4; fac.add(hall);
  for (let i = 0; i < 4; i++) { const s = prism(1.9, 1, 4, metal); s.position.set(-2.8 + i * 1.88, 2.8, 0); s.rotation.y = 0; fac.add(s); }
  const chimneys = [];
  for (const [x, h] of [[-2.5, 8], [0.8, 9.5], [3.2, 7]]) {
    const c = cyl(0.42, 0.6, h, 12, brick); c.position.set(x, h / 2, -2.6); fac.add(c);
    const band = cyl(0.62, 0.62, 0.3, 12, glowMat('#ff8a3d', 1.2)); band.position.set(x, h - 0.6, -2.6); fac.add(band);
    chimneys.push({ x, h });
  }
  place(fac, 0, 10);
  // Rauch aus den Schornsteinen
  const n = Math.round(90 * board.q.particles);
  const pos = new Float32Array(n * 3);
  const life = [];
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const smoke = new THREE.Points(pg, new THREE.PointsMaterial({ size: 1.6, map: glowTexture(), color: '#8f8a90', transparent: true, opacity: 0.35, depthWrite: false }));
  fac.add(smoke);
  for (let i = 0; i < n; i++) life.push({ c: i % chimneys.length, t: Math.random() * 4 });
  anims.push((dt) => {
    for (let i = 0; i < n; i++) {
      const L = life[i]; L.t += dt;
      if (L.t > 4) L.t = 0;
      const ch = chimneys[L.c];
      pos[i * 3] = ch.x + Math.sin(L.t * 1.3 + i) * 0.4 * L.t;
      pos[i * 3 + 1] = ch.h + L.t * 1.4;
      pos[i * 3 + 2] = -2.6 + L.t * 0.8;
    }
    pg.attributes.position.needsUpdate = true;
  });
  // Zahnrad
  const gear = new THREE.Group();
  gear.add(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.35, 8, 24), metal));
  for (let i = 0; i < 12; i++) {
    const tooth = box(0.4, 0.6, 0.5, metal);
    const a = (i / 12) * Math.PI * 2;
    tooth.position.set(Math.cos(a) * 2.05, Math.sin(a) * 2.05, 0); tooth.rotation.z = a;
    gear.add(tooth);
  }
  const hubG = cyl(0.5, 0.5, 0.6, 12, glowMat('#ff8a3d', 1.4)); hubG.rotation.x = Math.PI / 2; gear.add(hubG);
  const gearHolder = new THREE.Group(); gear.position.y = 2.8; gearHolder.add(gear);
  const post = box(0.4, 2.4, 0.4, metal); post.position.y = 1.2; gearHolder.add(post);
  place(gearHolder, -6.5, -6.5);
  anims.push((dt) => { gear.rotation.z += dt * 0.8; });
  // Wasserturm
  const wt = new THREE.Group();
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const l = cyl(0.08, 0.08, 3, 6, metal); l.position.set(x, 1.5, z); wt.add(l); }
  const tank = cyl(1.3, 1.3, 1.6, 14, mat('#6d4c3a')); tank.position.y = 3.6; wt.add(tank);
  const tr = cone(1.4, 0.8, 14, metal); tr.position.y = 4.8; wt.add(tr);
  place(wt, 6, -6.5);
  if (decor > 0.6) { const shed = box(2.4, 1.4, 1.8, brick); shed.position.y = 0.7; place(shed, -8.5, 5); const shed2 = box(1.8, 1.2, 1.6, metal); shed2.position.y = 0.6; place(shed2, 8.5, 5.5); }
}

function buildWeltkrieg({ place, r, decor, anims }) {
  const olive = mat('#5c6345', { roughness: 0.9 }), steel = mat('#71767a', { metalness: 0.5, roughness: 0.5 }), concrete = mat('#8c8a80', { flatShading: true });
  // Hangar
  const hangar = new THREE.Group();
  const arch = mesh(new THREE.CylinderGeometry(2.6, 2.6, 7, 18, 1, false, 0, Math.PI), olive);
  arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; arch.position.y = 0.05;
  hangar.add(arch);
  const door = box(0.1, 2.2, 3.6, mat('#2a2c22')); door.position.set(3.5, 1.1, 0); door.rotation.y = 0; hangar.add(door);
  hangar.rotation.y = Math.PI / 2;
  const hw = new THREE.Group(); hw.add(hangar);
  place(hw, 0, 10.4);
  // Funkmast mit Blinklicht
  const mast = new THREE.Group();
  const lattice = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.8, 9, 4, 6), new THREE.MeshBasicMaterial({ color: '#b9b7a6', wireframe: true }));
  lattice.position.y = 4.5; mast.add(lattice);
  const blink = sphere(0.25, glowMat('#ff2a2a', 3)); blink.position.y = 9.1; mast.add(blink);
  place(mast, -7, -6.5);
  anims.push((dt, t) => { blink.visible = Math.sin(t * 3) > 0; });
  // Luftschiff kreist über der Insel
  const ship = new THREE.Group();
  const hull = sphere(1, mat('#c9c6bc', { metalness: 0.3, roughness: 0.5 }), 20, 12); hull.scale.set(3.6, 1, 1); ship.add(hull);
  const gond = box(1.2, 0.35, 0.5, olive); gond.position.y = -1.05; ship.add(gond);
  for (const [y, z, rx] of [[0.9, 0, 0], [-0.9, 0, 0], [0, 0.9, Math.PI / 2], [0, -0.9, Math.PI / 2]]) { const fin = box(0.9, 0.06, 0.6, olive); fin.position.set(-3.1, y * 0.6, z * 0.6); fin.rotation.x = rx; ship.add(fin); }
  const shipPivot = new THREE.Group(); ship.position.set(9, 13, 0); shipPivot.add(ship);
  place(shipPivot, 0, 0);
  anims.push((dt) => { shipPivot.rotation.y += dt * 0.12; });
  // Scheinwerfer
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const sl = new THREE.Group();
  const lamp = cyl(0.4, 0.5, 0.6, 10, steel); lamp.position.y = 0.3; sl.add(lamp);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 22, 16, 1, true), beamMat); beam.position.y = 11; sl.add(beam);
  place(sl, 6.5, -7);
  anims.push((dt, t) => { sl.rotation.z = Math.sin(t * 0.4) * 0.35; sl.rotation.x = Math.cos(t * 0.33) * 0.25; });
  if (decor > 0.5) for (const [u, v] of [[-8.5, 5], [8.5, 5.5]]) { const b = box(2.6, 1, 1.6, concrete); b.position.y = 0.5; place(b, u, v); }
}

function buildKalterkrieg({ place, decor, anims }) {
  const white = mat('#e8ecf2', { roughness: 0.4 }), red = mat('#c8323f'), grey = mat('#6e7787', { metalness: 0.4 }), concrete = mat('#9aa0a8', { flatShading: true });
  // Rakete auf Startrampe
  const pad = new THREE.Group();
  const base = cyl(2.6, 2.9, 0.6, 16, concrete); base.position.y = 0.3; pad.add(base);
  const body = cyl(0.65, 0.65, 6.5, 16, white); body.position.y = 3.9; pad.add(body);
  const nose = cone(0.65, 1.6, 16, red); nose.position.y = 7.95; pad.add(nose);
  for (let i = 0; i < 3; i++) { const fin = box(0.08, 1.4, 1, red); const a = (i / 3) * Math.PI * 2; fin.position.set(Math.cos(a) * 0.8, 1.3, Math.sin(a) * 0.8); fin.rotation.y = -a; pad.add(fin); }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.5, 0.9, 1, 8, 1), new THREE.MeshBasicMaterial({ color: '#ff4d6a', wireframe: true }));
  tower.position.set(1.9, 4.25, 0); pad.add(tower);
  place(pad, 0, 10.2);
  // Satellitenschüssel
  const dish = new THREE.Group();
  const stand = cyl(0.15, 0.3, 2.2, 8, grey); stand.position.y = 1.1; dish.add(stand);
  const bowl = mesh(new THREE.SphereGeometry(1.8, 20, 10, 0, Math.PI * 2, 0, 0.95), mat('#dfe3ea', { side: THREE.DoubleSide, metalness: 0.3 }));
  bowl.rotation.x = Math.PI * 0.75; bowl.position.y = 2.5;
  const dishPivot = new THREE.Group(); dishPivot.add(bowl); dish.add(dishPivot);
  place(dish, -6.8, -6.5);
  anims.push((dt) => { dishPivot.rotation.y += dt * 0.3; });
  // Radar
  const radar = new THREE.Group();
  const rp = cyl(0.2, 0.3, 1.8, 8, grey); rp.position.y = 0.9; radar.add(rp);
  const bar = box(3, 0.5, 0.2, glowMat('#ff4d6a', 0.8)); bar.position.y = 2; radar.add(bar);
  place(radar, 6.5, -6.8);
  anims.push((dt) => { bar.rotation.y += dt * 1.5; });
  // Mauersegment mit Lichtern
  if (decor > 0.4) {
    const wall = new THREE.Group();
    const w = box(7, 1.8, 0.4, concrete); w.position.y = 0.9; wall.add(w);
    for (let i = 0; i < 4; i++) { const l = sphere(0.14, glowMat('#ffe9a8', 2.5)); l.position.set(-3 + i * 2, 1.95, 0); wall.add(l); }
    place(wall, -1, -10.5);
  }
  // Satellit umkreist die Insel
  const sat = new THREE.Group();
  const core = sphere(0.45, mat('#cfd6e2', { metalness: 0.8, roughness: 0.25 })); sat.add(core);
  for (let i = 0; i < 4; i++) { const ant = cyl(0.03, 0.03, 2, 4, grey); ant.rotation.z = 0.6 + i * 0.1; ant.rotation.y = i * Math.PI / 2; ant.position.y = -0.6; sat.add(ant); }
  const satPivot = new THREE.Group(); sat.position.set(12, 11, 0); satPivot.add(sat);
  place(satPivot, 0, 0);
  anims.push((dt) => { satPivot.rotation.y -= dt * 0.35; sat.rotation.x += dt; });
}

function buildZukunft({ place, r, decor, anims }) {
  const glass = mat('#9fe8ff', { transparent: true, opacity: 0.25, metalness: 0.8, roughness: 0.05 });
  const cols = ['#45f3ff', '#ff3fb4', '#8f7bff'];
  // Neon-Türme
  const city = new THREE.Group();
  const towers = [[-3, 0, 9], [-1, 1.5, 6.5], [1.2, -0.5, 11], [3.2, 1, 7.5], [0, 3, 5]];
  towers.forEach(([x, z, h], i) => {
    const c = cols[i % 3];
    const wm = new THREE.MeshStandardMaterial({ color: '#0d1030', map: windowTexture(c, '#0d1030', 3, 10), emissive: new THREE.Color(c), emissiveMap: windowTexture(c, '#000000', 3, 10), emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.6 });
    const t = mesh(new THREE.BoxGeometry(1.4, h, 1.4), wm); t.position.set(x, h / 2, z * 0.6); city.add(t);
    const cap = box(1.5, 0.12, 1.5, glowMat(c, 3)); cap.position.set(x, h + 0.06, z * 0.6); city.add(cap);
  });
  place(city, 0, 10);
  // Schwebende Holo-Ringe
  const holo = new THREE.Group();
  const rings = [0, 1, 2].map((i) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6 + i * 0.5, 0.06, 8, 60), glowMat(cols[i], 3)); ring.position.y = 4 + i * 0.6; holo.add(ring); return ring; });
  const orb = sphere(0.7, glowMat('#ffffff', 2.5)); orb.position.y = 4.6; holo.add(orb);
  place(holo, -6.5, -6.8);
  anims.push((dt, t) => { rings.forEach((rg, i) => { rg.rotation.x = t * (0.6 + i * 0.3); rg.rotation.y = t * (0.4 - i * 0.2); }); orb.position.y = 4.6 + Math.sin(t * 2) * 0.3; });
  // Glaskuppel
  const dome = new THREE.Group();
  const d = mesh(new THREE.SphereGeometry(2.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, false); dome.add(d);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 8, 40), glowMat('#45f3ff', 2.5)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; dome.add(ring);
  const plant = sphere(0.9, mat('#3fe08a', { emissive: new THREE.Color('#1aff8a'), emissiveIntensity: 0.4 })); plant.position.y = 0.8; dome.add(plant);
  place(dome, 6.5, -6.8);
  // Drohnen
  const n = Math.max(2, Math.round(5 * decor));
  const drones = [];
  for (let i = 0; i < n; i++) {
    const dr = sphere(0.22, glowMat(cols[i % 3], 3), 8, 6);
    const pivot = new THREE.Group(); dr.position.set(4 + r() * 6, 5 + r() * 5, 0); pivot.add(dr);
    pivot.rotation.y = r() * Math.PI * 2;
    place(pivot, 0, 0);
    drones.push({ pivot, sp: 0.3 + r() * 0.6 });
  }
  anims.push((dt) => drones.forEach((d) => { d.pivot.rotation.y += dt * d.sp; }));
}
