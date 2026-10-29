// Spielbrett in 3D: Epochen-Archipel mit Nebeninseln, Feldern, Wegen, Wolkenmeer und dem Zeitportal.
// Performance (Handy): Felder als InstancedMesh (3 Draw-Calls für alle Felder), statische Wege und Dekor
// werden pro Material zu wenigen Meshes zusammengefügt.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOARD } from '../core/engine.js';
import { EPOCH_INFO, TOPIC_INFO, FIELD_INFO, TOPICS } from '../core/constants.js';
import { flowTexture, glowTexture, windowTexture, iconAtlas, waterTexture } from './textures.js';

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
// Glattes Wertrauschen für Gelände und Wolken
function noise2(x, y, seed = 0) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}

export function nodeTop(id) {
  const n = NODES[id];
  return new THREE.Vector3(n.x, n.y + 0.25, n.z);
}

const EDGE_STYLE = {
  path:     { color: '#d8e6ff', radius: 0.14, lift: 0.45, speed: 0.35, opacity: 0.75 },
  bridge:   { color: '#2fe6ff', radius: 0.24, lift: 2.6,  speed: 0.6,  opacity: 0.9 },
  islet:    { color: '#7dffb2', radius: 0.22, lift: 1.8,  speed: 0.6,  opacity: 0.9 },
  spoke:    { color: '#b07bff', radius: 0.24, lift: 1.8,  speed: 0.6,  opacity: 0.9 },
  optional: { color: '#ffc83a', radius: 0.26, lift: 18,   speed: 0.6,  opacity: 0.95 },
};

export class Board3D {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.edges = new Map();
    this.dynamicEdges = [];
    this.optionalEdges = [];
    this.highlights = [];
    this.anims = [];
    this.particleSets = [];
    this.q = world.q;
    this.tension = 0;
    this.moodTimer = 0;
    this.build();
    world.addUpdater((dt, t) => this.update(dt, t));
  }

  build() {
    this.buildCloudSea();
    BOARD.islands.forEach((isl) => this.buildIsland(isl));
    BOARD.islets.forEach((it) => this.buildIslet(it));
    this.buildPortal();
    this.buildTiles();
    this.buildEdges();
    this.buildDebris();
  }

  // ------------------------------------------------------------ Wolkenmeer unter dem Archipel
  buildCloudSea() {
    const matSea = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { t: { value: 0 }, colA: { value: new THREE.Color('#1a1446') }, colB: { value: new THREE.Color('#7c4dff') }, colC: { value: new THREE.Color('#ff7ad9') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP,1.0); }',
      fragmentShader: `uniform float t; uniform vec3 colA; uniform vec3 colB; uniform vec3 colC; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ v += a*n(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          vec2 p = vP.xz * 0.011;
          float c = fbm(p + vec2(t*0.012, t*0.007));
          float c2 = fbm(p*2.2 - vec2(t*0.02, -t*0.01));
          float d = smoothstep(0.32, 0.9, c*0.75 + c2*0.45);
          vec3 col = mix(colA, colB, d);
          col = mix(col, colC, smoothstep(0.75, 1.0, c2) * 0.35);
          float r = length(vP.xz);
          float fade = smoothstep(520.0, 140.0, r);
          gl_FragColor = vec4(col, (0.25 + d*0.6) * fade);
        }`,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1), matSea);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -40;
    sea.renderOrder = -1;
    this.group.add(sea);
    this.sea = matSea;
  }

  // ------------------------------------------------------------ Hauptinseln
  buildIsland(isl) {
    const info = EPOCH_INFO[isl.epoch];
    const [cx, cy, cz] = isl.center;
    const R = isl.size;
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    this.group.add(g);
    isl.group = g;
    const r = rng(1000 + isl.index * 77);
    const [tx, tz] = isl.tangent, [rx, rz] = isl.radial;
    const toXZ = (u, v) => [tx * u + rx * v, tz * u + rz * v];
    // Felder dieser Insel in lokalen Koordinaten (für Gelände-Abflachung und Dekor-Abstände)
    const local = NODES.filter((n) => n.island === isl.index && n.area === 'main').map((n) => [n.x - cx, n.z - cz]);
    const nearNode = (x, z, d) => local.some(([nx, nz]) => (nx - x) ** 2 + (nz - z) ** 2 < d * d);

    this.buildTerrain(g, R, info, isl.index, local, 1.6, 24);
    const staticRoot = new THREE.Group(), dynamicRoot = new THREE.Group();
    g.add(staticRoot, dynamicRoot);

    const place = (obj, u, v, { dynamic = false, face = 'inward' } = {}) => {
      const [x, z] = toXZ(u, v);
      obj.position.x = x; obj.position.z = z;
      const target = face === 'inward' ? new THREE.Vector3(-cx, obj.position.y, -cz) : new THREE.Vector3(x * 2, obj.position.y, z * 2);
      obj.lookAt(target);
      (dynamic ? dynamicRoot : staticRoot).add(obj);
      return obj;
    };
    const ctx = { place, r, decor: this.q.decor, info, anims: this.anims, board: this, toXZ, nearNode };
    const builders = { antike: buildAntike, mittelalter: buildMittelalter, industrie: buildIndustrie, weltkrieg: buildWeltkrieg, kalterkrieg: buildKalterkrieg, zukunft: buildZukunft };
    builders[isl.epoch](ctx);
    this.scatterFoliage(g, R - 1.2, info, isl.epoch, r, nearNode, [[-5, 3, 5], [0, 16, 2.6], [0, -2.5, 2.8]].map(([u, v, d]) => [...toXZ(u, v), d]));
    bakeStatic(staticRoot);

    if (['antike', 'mittelalter', 'zukunft'].includes(isl.epoch)) {
      const water = { antike: '#ffe2a0', mittelalter: '#8fd6ff', zukunft: '#45f3ff' }[isl.epoch];
      this.addWaterfall(g, ...toXZ(...polar(R - 0.3, 150)), toXZ(...polar(1, 150)), water);
    }
    if (this.q.lights) {
      const light = new THREE.PointLight(info.accent, 70, 46, 1.6);
      light.position.set(0, 10, 0);
      g.add(light);
    }
    this.addAmbientParticles(g, R, info.accent, isl.epoch, r);
  }

  buildTerrain(g, R, info, seed, local, skirtH, rockH) {
    // Oberfläche: Scheibe mit leichtem Relief, unter den Feldern flach; Farbe mit sanften Variationen
    const geo = new THREE.RingGeometry(0.001, R, 72, 12);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(info.color), dark = base.clone().multiplyScalar(0.72), light = base.clone().lerp(new THREE.Color('#ffffff'), 0.18);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.hypot(x, z) / R;
      let flat = 1;
      for (const [nx, nz] of local) { const dd = Math.hypot(nx - x, nz - z); if (dd < 2.6) flat = Math.min(flat, Math.max(0, (dd - 1.6) / 1)); }
      const n = noise2(x * 0.22, z * 0.22, seed) * 0.8 + noise2(x * 0.6, z * 0.6, seed + 3) * 0.35;
      pos.setY(i, (n - 0.5) * 0.7 * flat * (1 - d * d));
      c.copy(dark).lerp(light, Math.min(1, n)).lerp(dark, Math.max(0, d - 0.8) * 2);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 }));
    top.receiveShadow = true;
    g.add(top);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R, R - 0.6, skirtH, 72, 1, true), mat(new THREE.Color(info.color).multiplyScalar(0.55).getStyle(), { side: THREE.DoubleSide }));
    skirt.position.y = -skirtH / 2;
    g.add(skirt);
    // Felsunterseite mit Rauschen
    const rockGeo = new THREE.ConeGeometry(R - 0.4, rockH, 36, 8);
    rockGeo.rotateX(Math.PI);
    const p = rockGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * 0.9 + seed) * Math.cos(z * 0.8) * 0.9 + Math.sin(y * 1.3 + x) * 0.6;
      const f = 1 + n * 0.12 * (1 - (y + rockH / 2) / rockH);
      p.setXYZ(i, x * f, y, z * f);
    }
    rockGeo.computeVertexNormals();
    const rock = mesh(rockGeo, mat('#2a2438', { flatShading: true, roughness: 1 }), false);
    rock.position.y = -skirtH - rockH / 2;
    g.add(rock);
    // Leuchtende Kristallsplitter in der Felsunterseite
    const shard = new THREE.OctahedronGeometry(0.9, 0);
    const shards = new THREE.InstancedMesh(shard, glowMat(info.accent, 1.8), 7);
    const dmy = new THREE.Object3D();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + seed, rr = R * (0.55 + (i % 3) * 0.1), yy = -skirtH - 2 - (i % 4) * 2.4;
      dmy.position.set(Math.cos(a) * rr, yy, Math.sin(a) * rr);
      dmy.rotation.set(a, a * 2, 0); dmy.scale.set(0.7, 1.6 + (i % 2), 0.7);
      dmy.updateMatrix(); shards.setMatrixAt(i, dmy.matrix);
    }
    g.add(shards);
    // Leuchtender Rand und farbiges Leuchten unter der Insel
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.14, 8, 96), glowMat(info.accent, 2.2));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.05;
    g.add(rim);
    const under = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: info.accent, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
    under.scale.set(R * 2, R * 2, 1); under.position.y = -skirtH - rockH * 0.6;
    g.add(under);
  }

  scatterFoliage(g, R, info, epoch, r, nearNode, keepOut) {
    const look = {
      antike: ['#7c8f4a', '#d9cfb5'], mittelalter: ['#2f6a37', '#7b7f86'], industrie: ['#5b4a3c', '#3c3c44'],
      weltkrieg: ['#5f6a45', '#8c8a80'], kalterkrieg: ['#e6eef6', '#9aa0a8'], zukunft: ['#43e0ff', '#5b6cff'],
    }[epoch];
    const n = Math.round(90 * this.q.decor);
    const tuftGeo = epoch === 'zukunft' ? new THREE.OctahedronGeometry(0.35, 0) : new THREE.ConeGeometry(0.32, 0.9, 5);
    const stoneGeo = new THREE.DodecahedronGeometry(0.35, 0);
    const tufts = new THREE.InstancedMesh(tuftGeo, epoch === 'zukunft' ? glowMat(look[0], 1.4) : mat(look[0], { flatShading: true }), n);
    const stones = new THREE.InstancedMesh(stoneGeo, mat(look[1], { flatShading: true }), Math.round(n / 2));
    const dmy = new THREE.Object3D();
    let a = 0, b = 0, guard = 0;
    while ((a < n || b < stones.count) && guard++ < n * 30) {
      const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * R;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (nearNode(x, z, 2.1) || keepOut.some(([kx, kz, d]) => (kx - x) ** 2 + (kz - z) ** 2 < d * d)) continue;
      dmy.position.set(x, 0.1, z);
      dmy.rotation.set(0, r() * 6, 0);
      const s = 0.6 + r() * 0.9;
      dmy.scale.set(s, s * (0.8 + r() * 0.6), s);
      dmy.updateMatrix();
      if (a < n && (b >= stones.count || r() < 0.67)) tufts.setMatrixAt(a++, dmy.matrix);
      else if (b < stones.count) stones.setMatrixAt(b++, dmy.matrix);
    }
    tufts.count = a; stones.count = b;
    tufts.castShadow = true; tufts.receiveShadow = true; stones.receiveShadow = true;
    g.add(tufts, stones);
  }

  addWaterfall(g, x, z, [dx, dz], color) {
    const tex = waterTexture(color).clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, 3);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 26), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    fall.position.set(x + dx * 0.4, -13, z + dz * 0.4);
    fall.lookAt(new THREE.Vector3(x + dx * 10, -13, z + dz * 10));
    g.add(fall);
    const lip = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, toneMapped: false }));
    lip.rotation.x = -Math.PI / 2; lip.position.set(x - dx * 1.2, 0.12, z - dz * 1.2);
    g.add(lip);
    const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    mist.scale.set(9, 6, 1); mist.position.set(x + dx * 1.2, -25, z + dz * 1.2);
    g.add(mist);
    this.anims.push((dt) => { tex.offset.y += dt * 0.9; });
  }

  addAmbientParticles(g, R, accent, kind, r) {
    const count = Math.round(80 * this.q.particles);
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, rad = r() * R;
      pos[i * 3] = Math.cos(a) * rad; pos[i * 3 + 1] = 1 + r() * 10; pos[i * 3 + 2] = Math.sin(a) * rad;
      seeds[i] = r() * 100;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.45, map: glowTexture(), color: accent, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(pts);
    this.particleSets.push({ pts, seeds, base: pos.slice(), kind });
  }

  // ------------------------------------------------------------ Nebeninseln
  buildIslet(it) {
    const [cx, cy, cz] = it.center;
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    this.group.add(g);
    const prev = EPOCH_INFO[BOARD.islands[it.index].epoch], next = EPOCH_INFO[BOARD.islands[(it.index + 1) % 6].epoch];
    const info = { color: new THREE.Color(prev.color).lerp(new THREE.Color(next.color), 0.5).getStyle(), accent: next.accent };
    const local = it.nodes.map((id) => [NODES[id].x - cx, NODES[id].z - cz]);
    this.buildTerrain(g, it.size, info, 50 + it.index, local, 1.2, 12);
    const r = rng(500 + it.index);
    const staticRoot = new THREE.Group();
    g.add(staticRoot);
    // Pavillon mit Laternen in der Inselmitte
    const pav = new THREE.Group();
    const wood = mat('#6b4a2b'), roof = mat(prev.accent, { roughness: 0.5 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const post = cyl(0.12, 0.12, 2.4, 6, wood); post.position.set(Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5); pav.add(post); }
    const rf = cone(2.3, 1.4, 6, roof); rf.position.y = 3.1; pav.add(rf);
    const floor = cyl(1.8, 1.9, 0.25, 6, mat('#d9cfb5')); floor.position.y = 0.12; pav.add(floor);
    staticRoot.add(pav);
    const lantern = sphere(0.35, glowMat('#ffd27a', 2.6), 10, 8); lantern.position.y = 2.1;
    g.add(lantern);
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2, rad = 1.5 + r() * 1.5;
      const tr = new THREE.Group();
      const trunk = cyl(0.12, 0.2, 1, 6, wood); trunk.position.y = 0.5; tr.add(trunk);
      const crown = sphere(0.7, mat(k % 2 ? '#3f7a3f' : prev.accent, { flatShading: true }), 7, 5); crown.position.y = 1.4; tr.add(crown);
      tr.position.set(Math.cos(a) * rad + 0.0001, 0, Math.sin(a) * rad);
      if (local.some(([x, z]) => (x - tr.position.x) ** 2 + (z - tr.position.z) ** 2 < 4)) continue;
      staticRoot.add(tr);
    }
    bakeStatic(staticRoot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.06, 6, 40), glowMat(next.accent, 2.5));
    ring.position.y = 4.6;
    g.add(ring);
    this.anims.push((dt, t) => { ring.rotation.x = Math.sin(t * 0.7 + it.index) * 0.4; ring.rotation.z = t * 0.5; lantern.position.y = 2.1 + Math.sin(t * 2 + it.index) * 0.08; });
  }

  buildDebris() {
    const r = rng(42);
    const n = Math.round(34 * this.q.decor);
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const inst = new THREE.InstancedMesh(geo, mat('#2c2740', { flatShading: true }), n);
    const data = [];
    const dmy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rad = 30 + r() * 80;
      data.push({ x: Math.cos(a) * rad, y: -8 + r() * 18, z: Math.sin(a) * rad, s: 0.6 + r() * 1.8, spin: (r() - 0.5) * 0.4, bob: r() * 10 });
    }
    this.group.add(inst);
    this.anims.push((dt, t) => {
      data.forEach((d, i) => {
        dmy.position.set(d.x, d.y + Math.sin(t * 0.5 + d.bob) * 0.8, d.z);
        dmy.rotation.set(t * d.spin, t * d.spin * 0.7, 0);
        dmy.scale.setScalar(d.s);
        dmy.updateMatrix();
        inst.setMatrixAt(i, dmy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------ Zeitportal mit Uhrring
  buildPortal() {
    const g = new THREE.Group();
    const hub = NODES[BOARD.hub];
    g.position.set(hub.x, 0, hub.z);
    this.group.add(g);
    this.portal = g;
    const base = mesh(new THREE.CylinderGeometry(7.5, 9.5, 2.4, 48), mat('#1a1d38', { metalness: 0.6, roughness: 0.35 }));
    base.position.y = 1.0;
    g.add(base);
    const under = mesh(new THREE.ConeGeometry(9.5, 16, 32, 1), mat('#221c35', { flatShading: true }), false);
    under.rotation.x = Math.PI; under.position.y = -8.2;
    g.add(under);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.18, 8, 90), glowMat('#2fe6ff', 1.6));
    rim.rotation.x = Math.PI / 2; rim.position.y = 2.25;
    g.add(rim);
    // Uhrring: zwölf Stundenmarken und zwei langsam laufende Zeiger
    const clock = new THREE.Group();
    clock.position.y = 2.3;
    g.add(clock);
    const dial = new THREE.Mesh(new THREE.RingGeometry(10.4, 11.2, 96), new THREE.MeshBasicMaterial({ color: '#2fe6ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, toneMapped: false }));
    dial.rotation.x = -Math.PI / 2;
    clock.add(dial);
    const markMat = glowMat('#ffc83a', 2.4);
    const marks = new THREE.Group();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const mk = new THREE.Mesh(new THREE.BoxGeometry(k % 3 === 0 ? 0.5 : 0.25, 0.12, 1.4), markMat);
      mk.position.set(Math.cos(a) * 12, 0, Math.sin(a) * 12);
      mk.rotation.y = -a + Math.PI / 2;
      marks.add(mk);
    }
    clock.add(marks);
    bakeStatic(marks);
    const hand = (len, w, color) => {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, len), new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.85 }));
      m.position.z = 2.6 + len / 2;
      pivot.add(m);
      clock.add(pivot);
      return pivot;
    };
    const hourHand = hand(5.6, 0.45, '#ffc83a'), minuteHand = hand(8.6, 0.25, '#2fe6ff');
    const colors = ['#2fe6ff', '#ff3fb4', '#ffc83a'];
    this.portalRings = [5.6, 4.4, 3.2].map((rad, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.14 + i * 0.03, 10, 90), glowMat(colors[i], 1.35));
      ring.position.y = 9;
      g.add(ring);
      return ring;
    });
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
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 70, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#2fe6ff', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 39;
    g.add(beam);
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
      // Spannung: Je näher jemand dem Portal-Sieg ist, desto schneller drehen die Ringe
      this.portalPhase = (this.portalPhase || 0) + dt * (1 + this.tension * 1.8);
      const ph = this.portalPhase;
      this.portalRings[0].rotation.x = ph * 0.5; this.portalRings[0].rotation.y = ph * 0.3;
      this.portalRings[1].rotation.y = -ph * 0.7; this.portalRings[1].rotation.z = ph * 0.4;
      this.portalRings[2].rotation.x = -ph * 0.9; this.portalRings[2].rotation.z = ph * 0.2;
      minuteHand.rotation.y = -t * 0.25; hourHand.rotation.y = -t * 0.25 / 12;
      coreMat.uniforms.t.value = t;
      coreMat.uniforms.power.value += ((0.5 + this.tension * 1.4 + (this.tension >= 1 ? Math.sin(t * 5) * 0.4 : 0)) - coreMat.uniforms.power.value) * Math.min(1, dt * 2);
      beam.material.opacity = 0.06 + this.tension * 0.14;
      core.lookAt(this.world.camera.position);
    });
    const tile = mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 6), mat('#1c2350', { emissive: new THREE.Color('#2fe6ff'), emissiveIntensity: 0.35 }));
    tile.position.set(0, hub.y - 0.05, 0);
    g.add(tile);
    this.hubTile = tile;
  }

  // 0 = niemand nah dran, 1 = jemand kann das Portal betreten
  setPortalTension(v) { this.tension = Math.max(0, Math.min(1, v)); }

  // ------------------------------------------------------------ Felder (instanziert)
  tileLook(n, topicOverride) {
    if (n.type === 'topic') {
      const t = topicOverride || n.topic;
      return { color: TOPIC_INFO[t].color, key: `topic:${t}` };
    }
    return { color: FIELD_INFO[n.type].color, key: `field:${n.type}` };
  }

  buildTiles() {
    const entries = [
      ...TOPICS.map((t) => ({ key: `topic:${t}`, symbol: TOPIC_INFO[t].icon, bg: TOPIC_INFO[t].color })),
      ...Object.entries(FIELD_INFO).filter(([k]) => k !== 'topic').map(([k, f]) => ({ key: `field:${k}`, symbol: f.icon, bg: f.color })),
      { key: 'removed', symbol: '✖', bg: '#3a1020', fg: '#ff5470', dim: true },
    ];
    this.atlas = iconAtlas(entries);
    const nodes = NODES.filter((n) => n.type !== 'hub');
    const N = nodes.length;
    this.tileNodes = nodes.map((n) => n.id);
    this.tileIndex = new Map(nodes.map((n, i) => [n.id, i]));
    this.tileState = nodes.map((n) => ({
      node: n, x: n.x, y: n.y - 0.05, z: n.z, scale: n.type === 'challenge' ? 1.35 : 1, rotY: (n.id * 0.37) % (Math.PI / 3),
      removed: false, sink: 0, pulse: 0, look: this.tileLook(n),
    }));
    const bodyGeo = new THREE.CylinderGeometry(1.32, 1.48, 0.5, 6);
    this.tileBodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: '#141a3c', metalness: 0.35, roughness: 0.4, emissive: new THREE.Color('#0a0f2a') }), N);
    this.tileBodies.castShadow = true; this.tileBodies.receiveShadow = true;
    const rimGeo = new THREE.RingGeometry(1.08, 1.4, 6, 1);
    rimGeo.rotateX(-Math.PI / 2);
    this.tileRims = new THREE.InstancedMesh(rimGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), N);
    const iconGeo = new THREE.CircleGeometry(0.88, 32);
    iconGeo.rotateX(-Math.PI / 2);
    const cells = new Float32Array(N * 2);
    iconGeo.setAttribute('iconCell', new THREE.InstancedBufferAttribute(cells, 2));
    const iconMat = new THREE.MeshBasicMaterial({ map: this.atlas.texture, alphaTest: 0.35, toneMapped: false });
    const scale = this.atlas.scale.toFixed(6);
    iconMat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute vec2 iconCell;\n' + shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * ${scale} + iconCell;\n#endif`);
    };
    this.tileIcons = new THREE.InstancedMesh(iconGeo, iconMat, N);
    this.iconCells = iconGeo.attributes.iconCell;
    this.group.add(this.tileBodies, this.tileRims, this.tileIcons);
    this.dummy = new THREE.Object3D();
    this.tileAnims = new Set();
    for (let i = 0; i < N; i++) { this.applyLook(i); this.composeTile(i); }
    for (const m of [this.tileBodies, this.tileRims, this.tileIcons]) m.instanceMatrix.needsUpdate = true;
    // Wächter-Kronen über den Herausforderungen
    this.crowns = BOARD.islands.map((isl) => {
      const n = NODES[isl.ids.g];
      const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), glowMat('#ffb300', 2.2));
      crown.position.set(n.x, n.y + 2.8, n.z);
      this.group.add(crown);
      this.anims.push((dt, t) => { crown.rotation.y += dt * 1.2; crown.position.y = n.y + 2.8 + Math.sin(t * 2 + n.id) * 0.25; });
      return crown;
    });
  }

  applyLook(i) {
    const st = this.tileState[i];
    const color = st.removed ? '#5a1426' : st.look.color;
    this.tileRims.setColorAt(i, new THREE.Color(color));
    const cell = this.atlas.index.get(st.removed ? 'removed' : st.look.key) || [0, 0];
    this.iconCells.setXY(i, cell[0], cell[1]);
    this.iconCells.needsUpdate = true;
    if (this.tileRims.instanceColor) this.tileRims.instanceColor.needsUpdate = true;
  }

  composeTile(i) {
    const st = this.tileState[i], d = this.dummy;
    const pulse = st.pulse > 0 ? Math.sin(st.pulse * Math.PI) : 0;
    const s = st.scale * (1 + pulse * 0.18), sy = 1 + pulse * 0.6;
    const y = st.y - st.sink * 0.55;
    d.position.set(st.x, y, st.z); d.rotation.set(0, st.rotY, st.sink * 0.12); d.scale.set(s, sy, s);
    d.updateMatrix(); this.tileBodies.setMatrixAt(i, d.matrix);
    d.position.y = y + 0.255 * sy + 0.005; d.scale.set(s, 1, s);
    d.updateMatrix(); this.tileRims.setMatrixAt(i, d.matrix);
    d.position.y = y + 0.255 * sy + 0.012; d.rotation.set(0, 0, st.sink * 0.12); d.scale.set(s * (st.scale > 1 ? 1.1 : 1), 1, s * (st.scale > 1 ? 1.1 : 1));
    d.updateMatrix(); this.tileIcons.setMatrixAt(i, d.matrix);
  }

  recolor(nodeId, topic) {
    const i = this.tileIndex.get(nodeId);
    if (i == null || this.tileState[i].node.type !== 'topic') return;
    this.tileState[i].look = this.tileLook(this.tileState[i].node, topic);
    this.applyLook(i);
  }

  setRemoved(nodeId, removed, animate = true) {
    const i = this.tileIndex.get(nodeId);
    if (i == null) return;
    const st = this.tileState[i];
    if (st.removed === removed) return;
    st.removed = removed;
    this.applyLook(i);
    if (!animate) { st.sink = removed ? 1 : 0; this.composeTile(i); this.flushTiles(); return; }
    st.sinkFrom = st.sink; st.sinkTo = removed ? 1 : 0; st.sinkT = 0;
    this.tileAnims.add(i);
  }

  pulseTile(nodeId) {
    const i = this.tileIndex.get(nodeId);
    if (i == null) { if (nodeId === BOARD.hub) this.world.tween(0.45, (k) => { const s = 1 + Math.sin(k * Math.PI) * 0.15; this.hubTile.scale.set(s, 1, s); }); return; }
    this.tileState[i].pulse = 0.0001;
    this.tileAnims.add(i);
  }

  flushTiles() {
    this.tileBodies.instanceMatrix.needsUpdate = true;
    this.tileRims.instanceMatrix.needsUpdate = true;
    this.tileIcons.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ Wege
  edgeKind(from, to) {
    const a = NODES[from], b = NODES[to];
    if (a.area === 'islet' || b.area === 'islet') return 'islet';
    if (a.bridge || b.bridge) return 'bridge';
    if (a.spoke || b.spoke || a.type === 'hub') return 'spoke';
    return 'path';
  }

  edgeGeometry(from, to, kind, withUvScale) {
    const st = EDGE_STYLE[kind];
    const a = nodeTop(from), b = nodeTop(to);
    a.y -= 0.1; b.y -= 0.1;
    const len = a.distanceTo(b);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += st.lift;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const segs = Math.max(6, Math.round(len * 1.1));
    const geo = new THREE.TubeGeometry(curve, segs, st.radius, 6, false);
    if (withUvScale) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.max(1, len / 2.6));
    }
    return { geo, curve, len };
  }

  buildEdges() {
    const closable = new Set([...BOARD.bridges.map((b) => `${b.from}>${b.to}`), ...BOARD.spokes.map((s) => `${s.from}>${s.to}`)]);
    const staticGeos = {}, bodyGeos = [];
    for (const n of NODES) for (const to of n.next) {
      const key = `${n.id}>${to}`;
      const kind = this.edgeKind(n.id, to);
      if (closable.has(key)) { this.buildDynamicEdge(n.id, to, kind); continue; }
      const { geo, curve, len } = this.edgeGeometry(n.id, to, kind, true);
      (staticGeos[kind] = staticGeos[kind] || []).push(geo);
      if (kind !== 'path') bodyGeos.push(new THREE.TubeGeometry(curve, Math.max(6, Math.round(len * 1.1)), EDGE_STYLE[kind].radius * 1.9, 6, false));
      this.edges.set(key, { from: n.id, to, kind, state: 'open', static: true });
    }
    this.flowMaterials = [];
    for (const [kind, geos] of Object.entries(staticGeos)) {
      const st = EDGE_STYLE[kind];
      const tex = flowTexture(st.color).clone();
      tex.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: st.opacity, depthWrite: false, toneMapped: false });
      this.group.add(new THREE.Mesh(mergeGeometries(geos), material));
      this.flowMaterials.push({ tex, speed: st.speed });
    }
    if (bodyGeos.length) this.group.add(new THREE.Mesh(mergeGeometries(bodyGeos), mat('#151a35', { transparent: true, opacity: 0.55 })));
    for (const ob of BOARD.optional) {
      const e = this.buildDynamicEdge(ob.from, ob.to, 'optional');
      e.mesh.visible = false;
      this.optionalEdges[ob.id] = e;
    }
  }

  buildDynamicEdge(from, to, kind) {
    const st = EDGE_STYLE[kind];
    const { geo, curve, len } = this.edgeGeometry(from, to, kind, false);
    const tex = flowTexture(st.color).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, len / 2.6), 1);
    const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: st.opacity, depthWrite: false, toneMapped: false, color: '#ffffff' });
    const m = new THREE.Mesh(geo, material);
    const body = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(6, Math.round(len * 1.1)), st.radius * 1.9, 6, false), mat('#151a35', { transparent: true, opacity: 0.55 }));
    m.add(body);
    this.group.add(m);
    const e = { from, to, kind, mesh: m, tex, curve, state: 'open', speed: st.speed };
    this.edges.set(`${from}>${to}`, e);
    this.dynamicEdges.push(e);
    return e;
  }

  setEdgeBlocked(from, to, blocked) {
    const e = this.edges.get(`${from}>${to}`);
    if (!e || !e.mesh) return;
    e.state = blocked ? 'blocked' : 'open';
    e.mesh.material.color.set(blocked ? '#ff2a4a' : '#ffffff');
    e.mesh.material.opacity = blocked ? 0.35 : EDGE_STYLE[e.kind].opacity;
    if (blocked && !e.barrier) {
      const p = e.curve.getPoint(0.15);
      const bar = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.13, 8, 24), glowMat('#ff2a4a', 2.5));
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
    if (!animate) { geo.setDrawRange(0, Infinity); return; }
    this.world.tween(1.6, (k) => { geo.setDrawRange(0, Math.floor(total * k)); });
  }

  // Brett-Zustand aus dem Spielzustand übernehmen (neue Partie, Spielstand, Reconnect)
  syncMods(mods, effectiveTopic) {
    for (const e of this.dynamicEdges) {
      if (e.kind === 'optional') continue;
      const blocked = mods.blocked.includes(`${e.from}>${e.to}`);
      if ((e.state === 'blocked') !== blocked) this.setEdgeBlocked(e.from, e.to, blocked);
    }
    this.optionalEdges.forEach((e, id) => {
      if (mods.opened.includes(id)) this.showOptional(id, false);
      else { e.mesh.visible = false; e.mesh.geometry.setDrawRange(0, Infinity); }
    });
    this.tileState.forEach((st, i) => {
      const id = st.node.id;
      const removed = mods.removed.includes(id);
      if (st.removed !== removed) { st.removed = removed; st.sink = removed ? 1 : 0; this.composeTile(i); }
      if (st.node.type === 'topic') st.look = this.tileLook(st.node, effectiveTopic(id));
      this.applyLook(i);
    });
    this.flushTiles();
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
      arrow.userData.nodeId = id;
      this.group.add(arrow);
      this.highlights.push(ring, arrow);
    }
  }

  // Weg-Vorschau: kleine goldene Markierung auf dem voraussichtlichen Landefeld
  markLanding(nodeIds) {
    for (const id of nodeIds) {
      const p = nodeTop(id);
      const m = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.1, 6, 32), glowMat('#ffc83a', 2.8));
      m.rotation.x = Math.PI / 2;
      m.position.copy(p).add(new THREE.Vector3(0, 0.35, 0));
      m.userData.nodeId = id;
      m.userData.landing = true;
      this.group.add(m);
      this.highlights.push(m);
    }
  }

  clearHighlight() {
    for (const h of this.highlights) { this.group.remove(h); h.geometry.dispose(); }
    this.highlights = [];
  }

  pickTile(raycaster) {
    const hits = raycaster.intersectObjects([this.tileBodies, this.hubTile, ...this.highlights], false);
    for (const hit of hits) {
      if (hit.object === this.tileBodies && hit.instanceId != null) return this.tileNodes[hit.instanceId];
      if (hit.object === this.hubTile) return BOARD.hub;
      if (hit.object.userData.nodeId != null) return hit.object.userData.nodeId;
    }
    return null;
  }

  update(dt, t) {
    for (const f of this.flowMaterials) f.tex.offset.x -= dt * f.speed;
    for (const e of this.dynamicEdges) if (e.state === 'open' && e.mesh.visible) e.tex.offset.x -= dt * e.speed;
    for (const a of this.anims) a(dt, t);
    for (const h of this.highlights) { const s = h.userData.landing ? 1 + Math.sin(t * 4) * 0.2 : 1 + Math.sin(t * 6) * 0.12; h.scale.set(s, s, s); }
    if (this.highlights.length) this.world.poke();
    this.sea.uniforms.t.value = t;
    // Farbstimmung: Himmel nimmt die Farbe der betrachteten Epoche an
    this.moodTimer -= dt;
    if (this.moodTimer <= 0) {
      this.moodTimer = 0.5;
      const tg = this.world.controls.target;
      let best = null, bd = 1e9;
      for (const isl of BOARD.islands) { const d = (isl.center[0] - tg.x) ** 2 + (isl.center[2] - tg.z) ** 2; if (d < bd) { bd = d; best = isl; } }
      const near = bd < 36 * 36 && this.world.mode !== 'overview';
      this.world.setMood(near ? new THREE.Color(EPOCH_INFO[best.epoch].accent).multiplyScalar(0.45) : '#3b1d5c');
    }
    if (this.tileAnims.size) {
      for (const i of [...this.tileAnims]) {
        const st = this.tileState[i];
        let done = true;
        if (st.pulse > 0) { st.pulse += dt / 0.45; if (st.pulse >= 1) st.pulse = 0; else done = false; }
        if (st.sinkT != null) {
          st.sinkT = Math.min(1, st.sinkT + dt / 0.8);
          st.sink = st.sinkFrom + (st.sinkTo - st.sinkFrom) * st.sinkT;
          if (st.sinkT >= 1) st.sinkT = null; else done = false;
        }
        this.composeTile(i);
        if (done) this.tileAnims.delete(i);
      }
      this.flushTiles();
    }
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

function polar(r, deg) { return [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)]; }

// Statisches Dekor pro Material zu einem Mesh zusammenführen (spart Draw-Calls auf dem Handy)
function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent) return;
    let geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const list = buckets.get(o.material) || [];
    list.push({ geo, obj: o });
    buckets.set(o.material, list);
  });
  for (const [material, items] of buckets) {
    const merged = mergeGeometries(items.map((it) => it.geo));
    if (!merged) continue; // nicht zusammenführbar: Originale behalten
    for (const it of items) it.obj.parent.remove(it.obj);
    const m = new THREE.Mesh(merged, material);
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
  }
}

// ======================================================================= Epochen-Dekor
// Freie Flächen (lokal u, v): Hauptbau (-5, 3), Wächter-Hort (0, 16), Platz (0, -2.5), Ränder r ≈ 16.5, Südband v ≈ -12.5
const BAND = [177.5, 152.5, 127.5, 52.5, 27.5, 2.5].map((a) => polar(16.4, a));
const SOUTH = [[-5, -12.6], [0, -13], [5, -12.6]];

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
function lamp(color) {
  const g = new THREE.Group();
  const post = cyl(0.07, 0.1, 2, 6, mat('#2b2b33', { metalness: 0.6 })); post.position.y = 1; g.add(post);
  const bulb = sphere(0.22, glowMat(color, 2.6), 8, 6); bulb.position.y = 2.1; g.add(bulb);
  return g;
}
function scaled(obj, s) { obj.scale.setScalar(s); return obj; }

function buildAntike({ place, r, decor }) {
  const marble = mat('#f1ead8', { roughness: 0.6 });
  const gold = glowMat('#ffcf6b', 0.9);
  const t = new THREE.Group();
  const steps = box(9.6, 0.4, 6.4, marble); steps.position.y = 0.2; t.add(steps);
  const base = box(8.8, 0.5, 5.6, marble); base.position.y = 0.65; t.add(base);
  for (let i = 0; i < 5; i++) for (const z of [-2.2, 2.2]) { const c = cyl(0.3, 0.36, 3.6, 12, marble); c.position.set(-3.6 + i * 1.8, 2.7, z); t.add(c); }
  const arch = box(8.8, 0.55, 5.6, marble); arch.position.y = 4.75; t.add(arch);
  const roof = prism(6, 1.6, 9.2, marble); roof.position.y = 5.02; roof.rotation.y = Math.PI / 2; t.add(roof);
  const frieze = box(8.9, 0.14, 5.7, gold); frieze.position.y = 4.5; t.add(frieze);
  place(scaled(t, 0.8), -5, 3);
  const st = new THREE.Group();
  const ped = cyl(0.6, 0.7, 1, 10, marble); ped.position.y = 0.5; st.add(ped);
  const fig = cone(0.45, 1.8, 10, gold); fig.position.y = 1.9; st.add(fig);
  const head = sphere(0.3, gold); head.position.y = 3.0; st.add(head);
  place(st, 0, 16);
  const amph = new THREE.Group();
  for (let i = 0; i < 3; i++) { const ring = mesh(new THREE.CylinderGeometry(1.6 + i * 0.6, 1.6 + i * 0.6, 0.32, 20, 1, false, 0, Math.PI), marble); ring.position.y = 0.16 + i * 0.32; amph.add(ring); }
  place(amph, 0, -2.5);
  const trunk = mat('#6b4a2b'), olive = mat('#7c8f4a', { flatShading: true });
  BAND.slice(0, Math.max(3, Math.round(BAND.length * decor))).forEach(([u, v], i) => {
    if (i % 2) { const c = cyl(0.3, 0.36, 0.8 + r() * 1.8, 10, marble); c.position.y = c.geometry.parameters.height / 2; place(c, u, v); }
    else place(tree(trunk, olive, 0.9 + r() * 0.4), u, v);
  });
  SOUTH.forEach(([u, v], i) => place(i === 1 ? tree(trunk, olive, 1.1) : cyl(0.3, 0.36, 1.2, 10, marble), u, v));
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
  for (const [x, z, w, d] of [[0, -3.5, 7, 0.6], [0, 3.5, 7, 0.6], [-3.5, 0, 0.6, 7], [3.5, 0, 0.6, 7]]) { const wall = box(w, 2.6, d, stone); wall.position.set(x, 1.3, z); castle.add(wall); }
  const keep = box(3, 5, 3, stone); keep.position.y = 2.5; castle.add(keep);
  const kr = cone(2.3, 2.2, 4, roofR); kr.position.y = 6.1; kr.rotation.y = Math.PI / 4; castle.add(kr);
  place(scaled(castle, 0.62), -5, 3);
  const well = new THREE.Group();
  const ring = cyl(1.1, 1.2, 0.9, 12, stone); ring.position.y = 0.45; well.add(ring);
  const wr = cone(1.4, 1, 4, wood); wr.position.y = 2.4; well.add(wr);
  for (const x of [-0.9, 0.9]) { const p = cyl(0.08, 0.08, 1.9, 5, wood); p.position.set(x, 1.4, 0); well.add(p); }
  place(well, 0, -2.5);
  const flag = new THREE.Group();
  const pole = cyl(0.08, 0.1, 4, 6, wood); pole.position.y = 2; flag.add(pole);
  const cloth = box(0.06, 1, 1.6, banner); cloth.position.set(0, 3.4, 0.8); flag.add(cloth);
  place(flag, 0, 16);
  const trunk = mat('#4a3320'), needle = mat('#2f5a34', { flatShading: true });
  BAND.slice(0, Math.max(3, Math.round(BAND.length * decor))).forEach(([u, v]) => place(pine(trunk, needle, 0.8 + r() * 0.6), u, v));
  SOUTH.forEach(([u, v], i) => {
    if (i === 1) { const house = new THREE.Group(); const hb = box(2.2, 1.6, 1.8, mat('#e8dcc0')); hb.position.y = 0.8; house.add(hb); const hr = prism(2.6, 1.3, 2.1, wood); hr.position.y = 1.6; house.add(hr); place(house, u, v); }
    else place(pine(trunk, needle, 1), u, v);
  });
}

function buildIndustrie({ place, r, decor, anims, board }) {
  const brick = mat('#8a4a35', { roughness: 0.9 }), metal = mat('#5b6070', { metalness: 0.6, roughness: 0.4 });
  const win = new THREE.MeshStandardMaterial({ map: windowTexture('#ffb35a', '#3a2620', 6, 3), emissive: new THREE.Color('#ff9a3d'), emissiveMap: windowTexture('#ffb35a', '#000000', 6, 3), emissiveIntensity: 0.9 });
  const fac = new THREE.Group();
  const hall = mesh(new THREE.BoxGeometry(7.5, 2.8, 4), [brick, brick, brick, brick, win, win]);
  hall.position.y = 1.4; fac.add(hall);
  for (let i = 0; i < 4; i++) { const s = prism(1.9, 1, 4, metal); s.position.set(-2.8 + i * 1.88, 2.8, 0); fac.add(s); }
  const chimneys = [];
  for (const [x, h] of [[-2.5, 8], [0.8, 9.5], [3.2, 7]]) {
    const c = cyl(0.42, 0.6, h, 12, brick); c.position.set(x, h / 2, -2.6); fac.add(c);
    const band = cyl(0.62, 0.62, 0.3, 12, glowMat('#ff8a3d', 1.2)); band.position.set(x, h - 0.6, -2.6); fac.add(band);
    chimneys.push({ x, h });
  }
  // Rauch steigt aus den Schornsteinen (dynamisch)
  const smokeHolder = new THREE.Group();
  const n = Math.round(90 * board.q.particles);
  const pos = new Float32Array(n * 3);
  const life = [];
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  smokeHolder.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 1.6, map: glowTexture(), color: '#8f8a90', transparent: true, opacity: 0.35, depthWrite: false })));
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
  place(scaled(fac, 0.85), -5, 3);
  smokeHolder.scale.setScalar(0.85);
  place(smokeHolder, -5, 3, { dynamic: true });
  const gear = new THREE.Group();
  gear.add(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.35, 8, 24), metal));
  for (let i = 0; i < 12; i++) { const tooth = box(0.4, 0.6, 0.5, metal); const a = (i / 12) * Math.PI * 2; tooth.position.set(Math.cos(a) * 2.05, Math.sin(a) * 2.05, 0); tooth.rotation.z = a; gear.add(tooth); }
  const hubG = cyl(0.5, 0.5, 0.6, 12, glowMat('#ff8a3d', 1.4)); hubG.rotation.x = Math.PI / 2; gear.add(hubG);
  bakeStatic(gear); // Zahnkranz dreht als Ganzes – Teile zu wenigen Meshes zusammenführen
  const gearHolder = new THREE.Group(); gear.position.y = 2.8; gearHolder.add(gear);
  const post = box(0.4, 2.4, 0.4, metal); post.position.y = 1.2; gearHolder.add(post);
  place(gearHolder, 0, -2.5, { dynamic: true });
  anims.push((dt) => { gear.rotation.z += dt * 0.8; });
  const wt = new THREE.Group();
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const l = cyl(0.08, 0.08, 3, 6, metal); l.position.set(x, 1.5, z); wt.add(l); }
  const tank = cyl(1.3, 1.3, 1.6, 14, mat('#6d4c3a')); tank.position.y = 3.6; wt.add(tank);
  const tr = cone(1.4, 0.8, 14, metal); tr.position.y = 4.8; wt.add(tr);
  place(wt, 0, 16);
  BAND.slice(0, Math.max(2, Math.round(BAND.length * decor))).forEach(([u, v], i) => place(i % 2 ? lamp('#ffb35a') : box(1.6, 1 + r(), 1.4, i % 3 ? brick : metal), u, v));
  SOUTH.forEach(([u, v]) => { const shed = box(2.2, 1.3, 1.7, r() < 0.5 ? brick : metal); shed.position.y = 0.65; place(shed, u, v); });
}

function buildWeltkrieg({ place, r, decor, anims }) {
  const olive = mat('#5c6345', { roughness: 0.9 }), steel = mat('#71767a', { metalness: 0.5, roughness: 0.5 }), concrete = mat('#8c8a80', { flatShading: true });
  const hangar = new THREE.Group();
  const arch = mesh(new THREE.CylinderGeometry(2.6, 2.6, 7, 18, 1, false, 0, Math.PI), olive);
  arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; arch.position.y = 0.05;
  hangar.add(arch);
  const door = box(0.1, 2.2, 3.6, mat('#2a2c22')); door.position.set(3.5, 1.1, 0); hangar.add(door);
  hangar.rotation.y = Math.PI / 2;
  const hw = new THREE.Group(); hw.add(hangar);
  place(scaled(hw, 0.85), -5, 3);
  const mast = new THREE.Group();
  const lattice = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.8, 9, 4, 6), new THREE.MeshBasicMaterial({ color: '#b9b7a6', wireframe: true }));
  lattice.position.y = 4.5; mast.add(lattice);
  const blink = sphere(0.25, glowMat('#ff2a2a', 3)); blink.position.y = 9.1; mast.add(blink);
  place(mast, 0, 16, { dynamic: true });
  anims.push((dt, t) => { blink.visible = Math.sin(t * 3) > 0; });
  const ship = new THREE.Group();
  const hull = sphere(1, mat('#c9c6bc', { metalness: 0.3, roughness: 0.5 }), 20, 12); hull.scale.set(3.6, 1, 1); ship.add(hull);
  const gond = box(1.2, 0.35, 0.5, olive); gond.position.y = -1.05; ship.add(gond);
  for (const [y, z, rx] of [[0.9, 0, 0], [-0.9, 0, 0], [0, 0.9, Math.PI / 2], [0, -0.9, Math.PI / 2]]) { const fin = box(0.9, 0.06, 0.6, olive); fin.position.set(-3.1, y * 0.6, z * 0.6); fin.rotation.x = rx; ship.add(fin); }
  bakeStatic(ship);
  const shipPivot = new THREE.Group(); ship.position.set(11, 14, 0); shipPivot.add(ship);
  place(shipPivot, 0, 0, { dynamic: true });
  anims.push((dt) => { shipPivot.rotation.y += dt * 0.12; });
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const sl = new THREE.Group();
  const lampM = cyl(0.4, 0.5, 0.6, 10, steel); lampM.position.y = 0.3; sl.add(lampM);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 22, 16, 1, true), beamMat); beam.position.y = 11; sl.add(beam);
  place(sl, 0, -2.5, { dynamic: true });
  anims.push((dt, t) => { sl.rotation.z = Math.sin(t * 0.4) * 0.35; sl.rotation.x = Math.cos(t * 0.33) * 0.25; });
  BAND.slice(0, Math.max(2, Math.round(BAND.length * decor))).forEach(([u, v], i) => { const b = box(2 + r(), 0.8, 1.4, i % 2 ? concrete : olive); b.position.y = 0.4; place(b, u, v); });
  SOUTH.forEach(([u, v]) => { const b = box(2.6, 1, 1.6, concrete); b.position.y = 0.5; place(b, u, v); });
}

function buildKalterkrieg({ place, decor, anims, r }) {
  const white = mat('#e8ecf2', { roughness: 0.4 }), red = mat('#c8323f'), grey = mat('#6e7787', { metalness: 0.4 }), concrete = mat('#9aa0a8', { flatShading: true });
  const pad = new THREE.Group();
  const base = cyl(2.6, 2.9, 0.6, 16, concrete); base.position.y = 0.3; pad.add(base);
  const body = cyl(0.65, 0.65, 6.5, 16, white); body.position.y = 3.9; pad.add(body);
  const nose = cone(0.65, 1.6, 16, red); nose.position.y = 7.95; pad.add(nose);
  for (let i = 0; i < 3; i++) { const fin = box(0.08, 1.4, 1, red); const a = (i / 3) * Math.PI * 2; fin.position.set(Math.cos(a) * 0.8, 1.3, Math.sin(a) * 0.8); fin.rotation.y = -a; pad.add(fin); }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.5, 0.9, 1, 8, 1), new THREE.MeshBasicMaterial({ color: '#ff4d6a', wireframe: true }));
  tower.position.set(1.9, 4.25, 0); pad.add(tower);
  place(scaled(pad, 0.9), -5, 3);
  const dish = new THREE.Group();
  const stand = cyl(0.15, 0.3, 2.2, 8, grey); stand.position.y = 1.1; dish.add(stand);
  const bowl = mesh(new THREE.SphereGeometry(1.8, 20, 10, 0, Math.PI * 2, 0, 0.95), mat('#dfe3ea', { side: THREE.DoubleSide, metalness: 0.3 }));
  bowl.rotation.x = Math.PI * 0.75; bowl.position.y = 2.5;
  const dishPivot = new THREE.Group(); dishPivot.add(bowl); dish.add(dishPivot);
  place(dish, 0, -2.5, { dynamic: true });
  anims.push((dt) => { dishPivot.rotation.y += dt * 0.3; });
  const radar = new THREE.Group();
  const rp = cyl(0.2, 0.3, 1.8, 8, grey); rp.position.y = 0.9; radar.add(rp);
  const bar = box(3, 0.5, 0.2, glowMat('#ff4d6a', 0.8)); bar.position.y = 2; radar.add(bar);
  place(radar, 0, 16, { dynamic: true });
  anims.push((dt) => { bar.rotation.y += dt * 1.5; });
  const sat = new THREE.Group();
  const core = sphere(0.45, mat('#cfd6e2', { metalness: 0.8, roughness: 0.25 })); sat.add(core);
  for (let i = 0; i < 4; i++) { const ant = cyl(0.03, 0.03, 2, 4, grey); ant.rotation.z = 0.6 + i * 0.1; ant.rotation.y = i * Math.PI / 2; ant.position.y = -0.6; sat.add(ant); }
  bakeStatic(sat);
  const satPivot = new THREE.Group(); sat.position.set(15, 12, 0); satPivot.add(sat);
  place(satPivot, 0, 0, { dynamic: true });
  anims.push((dt) => { satPivot.rotation.y -= dt * 0.35; sat.rotation.x += dt; });
  BAND.slice(0, Math.max(2, Math.round(BAND.length * decor))).forEach(([u, v], i) => place(i % 2 ? lamp('#ffe9a8') : box(1.4, 1.2 + r(), 0.5, concrete), u, v));
  SOUTH.forEach(([u, v]) => { const w = box(3, 1.6, 0.4, concrete); w.position.y = 0.8; place(w, u, v); });
}

function buildZukunft({ place, r, decor, anims }) {
  const glass = new THREE.MeshStandardMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.25, metalness: 0.8, roughness: 0.05 });
  const cols = ['#45f3ff', '#ff3fb4', '#8f7bff'];
  const city = new THREE.Group();
  // Ein Material pro Neonfarbe – so lassen sich die Türme zusammenführen
  const towerMats = cols.map((c) => new THREE.MeshStandardMaterial({ color: '#0d1030', map: windowTexture(c, '#0d1030', 3, 10), emissive: new THREE.Color(c), emissiveMap: windowTexture(c, '#000000', 3, 10), emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.6 }));
  [[-3, 0, 9], [-1, 1.5, 6.5], [1.2, -0.5, 11], [3.2, 1, 7.5], [0, 3, 5]].forEach(([x, z, h], i) => {
    const c = cols[i % 3];
    const wm = towerMats[i % 3];
    const tw = mesh(new THREE.BoxGeometry(1.4, h, 1.4), wm); tw.position.set(x, h / 2, z * 0.6); city.add(tw);
    const cap = box(1.5, 0.12, 1.5, glowMat(c, 3)); cap.position.set(x, h + 0.06, z * 0.6); city.add(cap);
  });
  place(scaled(city, 0.85), -5, 3);
  const holo = new THREE.Group();
  const rings = [0, 1, 2].map((i) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6 + i * 0.5, 0.06, 8, 60), glowMat(cols[i], 3)); ring.position.y = 4 + i * 0.6; holo.add(ring); return ring; });
  const orb = sphere(0.7, glowMat('#ffffff', 2.5)); orb.position.y = 4.6; holo.add(orb);
  place(holo, 0, -2.5, { dynamic: true });
  anims.push((dt, t) => { rings.forEach((rg, i) => { rg.rotation.x = t * (0.6 + i * 0.3); rg.rotation.y = t * (0.4 - i * 0.2); }); orb.position.y = 4.6 + Math.sin(t * 2) * 0.3; });
  const dome = new THREE.Group();
  const d = mesh(new THREE.SphereGeometry(2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, false); dome.add(d);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 8, 40), glowMat('#45f3ff', 2.5)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; dome.add(ring);
  const plant = sphere(0.8, mat('#3fe08a', { emissive: new THREE.Color('#1aff8a'), emissiveIntensity: 0.4 })); plant.position.y = 0.7; dome.add(plant);
  place(dome, 0, 16);
  const nDrones = Math.max(2, Math.round(5 * decor));
  const drones = [];
  for (let i = 0; i < nDrones; i++) {
    const dr = sphere(0.22, glowMat(cols[i % 3], 3), 8, 6);
    const pivot = new THREE.Group(); dr.position.set(5 + r() * 8, 6 + r() * 5, 0); pivot.add(dr);
    pivot.rotation.y = r() * Math.PI * 2;
    place(pivot, 0, 0, { dynamic: true });
    drones.push({ pivot, sp: 0.3 + r() * 0.6 });
  }
  anims.push((dt) => drones.forEach((dd) => { dd.pivot.rotation.y += dt * dd.sp; }));
  BAND.slice(0, Math.max(2, Math.round(BAND.length * decor))).forEach(([u, v], i) => place(i % 2 ? lamp(cols[i % 3]) : mesh(new THREE.OctahedronGeometry(0.8, 0), glowMat(cols[(i + 1) % 3], 1.6)), u, v));
  SOUTH.forEach(([u, v], i) => { const t = box(1.2, 2 + i, 1.2, glowMat(cols[i % 3], 0.6)); t.position.y = (2 + i) / 2; place(t, u, v); });
}
