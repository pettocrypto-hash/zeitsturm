// Partikeleffekte, Feld-Impulse, Zeitsturm, Blitze und die Siegerehrung in 3D.
import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { ease } from './world.js';

const PODIUM_Y = 21;

export class Effects {
  constructor(world) {
    this.world = world;
    this.q = world.q;
    this.storm = null;
    world.addUpdater((dt, t) => this.update(dt, t));
  }

  burst(pos, color = '#2fe6ff', count = 60, speed = 7, life = 1.1) {
    const n = Math.max(8, Math.round(count * this.q.particles));
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const v = [];
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize();
      v.push(dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ size: 0.7, map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, m);
    this.world.scene.add(pts);
    let t = 0;
    const off = this.world.addUpdater((dt) => {
      t += dt;
      for (let i = 0; i < n; i++) {
        v[i].y -= 9 * dt;
        p[i * 3] += v[i].x * dt; p[i * 3 + 1] += v[i].y * dt; p[i * 3 + 2] += v[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      m.opacity = Math.max(0, 1 - t / life);
      if (t >= life) { off(); this.world.scene.remove(pts); geo.dispose(); m.dispose(); }
    });
  }

  ring(pos, color = '#ffffff', size = 4) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const r = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), m);
    r.rotation.x = -Math.PI / 2;
    r.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
    this.world.scene.add(r);
    this.world.tween(0.8, (e) => { const s = 1 + e * size; r.scale.set(s, s, s); m.opacity = 0.9 * (1 - e); }, ease.out)
      .then(() => { this.world.scene.remove(r); r.geometry.dispose(); m.dispose(); });
  }

  column(pos, color = '#ffc83a') {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 18, 24, 1, true), m);
    c.position.copy(pos).add(new THREE.Vector3(0, 9, 0));
    this.world.scene.add(c);
    this.world.tween(1.4, (e) => { m.opacity = Math.sin(e * Math.PI) * 0.35; c.scale.set(1 + e * 0.3, 1, 1 + e * 0.3); })
      .then(() => { this.world.scene.remove(c); c.geometry.dispose(); m.dispose(); });
  }

  confetti(center, duration = 6) {
    const n = Math.round(420 * Math.max(0.5, this.q.particles));
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const v = [];
    const palette = ['#2fe6ff', '#ff3fb4', '#ffc83a', '#8cff4a', '#a77bff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      p[i * 3] = center.x + (Math.random() - 0.5) * 4; p[i * 3 + 1] = center.y + 2; p[i * 3 + 2] = center.z + (Math.random() - 0.5) * 4;
      v.push(new THREE.Vector3((Math.random() - 0.5) * 16, 10 + Math.random() * 12, (Math.random() - 0.5) * 16));
      const c = palette[i % palette.length];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, m);
    this.world.scene.add(pts);
    let t = 0;
    const off = this.world.addUpdater((dt) => {
      t += dt;
      for (let i = 0; i < n; i++) {
        v[i].y -= 9 * dt; v[i].multiplyScalar(1 - dt * 0.6);
        p[i * 3] += v[i].x * dt + Math.sin(t * 3 + i) * dt; p[i * 3 + 1] += v[i].y * dt; p[i * 3 + 2] += v[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      m.opacity = t > duration - 1 ? Math.max(0, duration - t) : 1;
      if (t >= duration) { off(); this.world.scene.remove(pts); geo.dispose(); m.dispose(); }
    });
  }

  // Zeitsturm: wirbelnde Partikelwolke und gelegentliche Blitze
  setStorm(on) {
    this.world.setStorm(on ? 1 : 0);
    if (on && !this.storm) {
      const n = Math.round(900 * this.q.particles);
      const geo = new THREE.BufferGeometry();
      const p = new Float32Array(n * 3);
      const d = [];
      for (let i = 0; i < n; i++) d.push({ a: Math.random() * Math.PI * 2, r: 50 + Math.random() * 45, y: -10 + Math.random() * 40, s: 0.15 + Math.random() * 0.3 });
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const m = new THREE.PointsMaterial({ size: 1.1, map: glowTexture(), color: '#ff5a7a', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(geo, m);
      this.world.scene.add(pts);
      this.storm = { pts, d, p, geo, next: 3 };
    } else if (!on && this.storm) {
      this.world.scene.remove(this.storm.pts);
      this.storm = null;
    }
  }

  lightning() {
    const pts = [];
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 40;
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let y = 70; y > -2; y -= 6) { pts.push(new THREE.Vector3(x, y, z)); x += (Math.random() - 0.5) * 6; z += (Math.random() - 0.5) * 6; }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color: '#ffd6f0', transparent: true, opacity: 1, toneMapped: false });
    const line = new THREE.Line(geo, m);
    this.world.scene.add(line);
    const hemi = this.world.hemi, base = hemi.intensity;
    this.world.tween(0.45, (e) => { m.opacity = 1 - e; hemi.intensity = base + (1 - e) * 2.2; })
      .then(() => { this.world.scene.remove(line); geo.dispose(); m.dispose(); hemi.intensity = base; });
    this.onLightning?.();
  }

  // Sternschnuppe quer über den Himmel
  shootingStar() {
    const a = Math.random() * Math.PI * 2, r = 260 + Math.random() * 120, y = 140 + Math.random() * 90;
    const start = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const dir = new THREE.Vector3(-Math.sin(a), -0.35, Math.cos(a)).normalize().multiplyScalar(90 + Math.random() * 60);
    const geo = new THREE.BufferGeometry().setFromPoints([start, start.clone()]);
    const m = new THREE.LineBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.9, toneMapped: false, fog: false });
    const line = new THREE.Line(geo, m);
    this.world.scene.add(line);
    const pos = geo.attributes.position;
    this.world.tween(1.1, (e) => {
      const head = start.clone().addScaledVector(dir, e), tail = start.clone().addScaledVector(dir, Math.max(0, e - 0.25));
      pos.setXYZ(0, tail.x, tail.y, tail.z); pos.setXYZ(1, head.x, head.y, head.z); pos.needsUpdate = true;
      m.opacity = 0.9 * (1 - e);
    }, ease.out).then(() => { this.world.scene.remove(line); geo.dispose(); m.dispose(); });
  }

  update(dt, t) {
    this.nextStar = (this.nextStar ?? 4) - dt;
    if (this.nextStar <= 0) { this.nextStar = 6 + Math.random() * 10; if (!document.hidden) this.shootingStar(); }
    const s = this.storm;
    if (!s) return;
    for (let i = 0; i < s.d.length; i++) {
      const o = s.d[i];
      o.a += dt * o.s;
      s.p[i * 3] = Math.cos(o.a) * o.r; s.p[i * 3 + 1] = o.y + Math.sin(t + i) * 0.5; s.p[i * 3 + 2] = Math.sin(o.a) * o.r;
    }
    s.geo.attributes.position.needsUpdate = true;
    s.next -= dt;
    if (s.next <= 0) { this.lightning(); s.next = 4 + Math.random() * 7; }
  }

  // Siegerpodest am Zeitportal
  podium(ranking, pieces) {
    const g = new THREE.Group();
    const heights = [3.2, 2.2, 1.4, 0.8];
    const xs = [0, -3.4, 3.4, 6.6];
    const colors = ['#ffc83a', '#c9d3e6', '#d08a4a', '#5b6a8a'];
    const cam = this.world.camera.position;
    const theta = Math.atan2(cam.x, cam.z);
    ranking.forEach((pid, place) => {
      const h = heights[place] ?? 0.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), new THREE.MeshStandardMaterial({ color: '#1b2048', emissive: new THREE.Color(colors[place] || '#5b6a8a'), emissiveIntensity: 0.45, metalness: 0.5, roughness: 0.3 }));
      m.position.set(xs[place] ?? 9, h / 2, 0);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      const piece = pieces.items[pid];
      if (piece) {
        // Position im gedrehten Podest (siehe unten), Blick Richtung Kamera
        const x = xs[place] ?? 9;
        piece.group.position.set(x * Math.cos(theta), PODIUM_Y + h, -x * Math.sin(theta));
        piece.group.scale.setScalar(1.3);
        piece.body.rotation.y = theta;
        piece.moving = true;
      }
    });
    g.position.set(0, PODIUM_Y, 0);
    g.rotation.y = theta;
    // Bühnenlicht von vorne oben auf die Siegerinnen und Sieger
    const spot = new THREE.PointLight('#fff4dd', 140, 40, 1.6);
    spot.position.set(0, 9, 7);
    g.add(spot);
    this.world.scene.add(g);
    this.podiumGroup = g;
    // Im Hochformat liegt das Ergebnis-Panel unten: Blickpunkt tiefer setzen, damit das Podest oben frei steht
    const portrait = window.innerWidth < window.innerHeight;
    this.world.focusOn(new THREE.Vector3(0, PODIUM_Y + (portrait ? -4 : 1), 0), portrait ? 30 : 22, 1.08);
    this.confetti(new THREE.Vector3(0, PODIUM_Y + 4, 0), 9);
  }
}
