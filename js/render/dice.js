// Würfel mit physikalisch wirkender Animation: Wurf, Schwerkraft, Abprallen, Ausrollen auf das Ergebnis.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { diceFaceTexture } from './textures.js';

// Materialreihenfolge von BoxGeometry: +x, -x, +y, -y, +z, -z. Gegenüberliegende Seiten ergeben 7.
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

export class Dice {
  constructor(world) {
    this.world = world;
    const mats = FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: diceFaceTexture(v), roughness: 0.35, metalness: 0.05 }));
    this.geo = new RoundedBoxGeometry(1.6, 1.6, 1.6, 4, 0.22);
    this.mats = mats;
    this.dice = [];
  }

  make() {
    const m = new THREE.Mesh(this.geo, this.mats);
    m.castShadow = true;
    m.visible = false;
    this.world.scene.add(m);
    return m;
  }

  // Wirft 1–2 Würfel bei `origin` und landet garantiert auf `values`.
  async roll(values, origin, onBounce) {
    if (document.hidden) return; // im Hintergrund keine Physik-Frames
    while (this.dice.length < values.length) this.dice.push(this.make());
    const floorY = origin.y + 0.8;
    const cam = this.world.camera.position.clone();
    const toCam = cam.sub(origin).setY(0).normalize();
    const side = new THREE.Vector3(-toCam.z, 0, toCam.x);
    const sims = values.map((v, i) => {
      const d = this.dice[i];
      d.visible = true;
      d.scale.setScalar(1);
      const start = origin.clone().add(toCam.clone().multiplyScalar(5)).add(side.clone().multiplyScalar((i - (values.length - 1) / 2) * 2.4)).setY(origin.y + 7);
      d.position.copy(start);
      d.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      const vel = toCam.clone().multiplyScalar(-6 - Math.random() * 2).add(side.clone().multiplyScalar((Math.random() - 0.5) * 3)).setY(2 + Math.random() * 2);
      const spin = new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
      return { d, v, vel, spin, settled: false };
    });

    // Physik-Phase
    await new Promise((resolve) => {
      let tAcc = 0;
      const onHide = () => { if (document.hidden) done(); };
      const done = () => { off(); clearTimeout(guard); document.removeEventListener('visibilitychange', onHide); resolve(); };
      const guard = setTimeout(done, 2500); // Watchdog ohne Frames
      document.addEventListener('visibilitychange', onHide);
      const off = this.world.addUpdater((dt) => {
        tAcc += dt;
        for (const s of sims) {
          s.vel.y -= 28 * dt;
          s.d.position.addScaledVector(s.vel, dt);
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.spin.x * dt, s.spin.y * dt, s.spin.z * dt));
          s.d.quaternion.premultiply(q);
          if (s.d.position.y < floorY) {
            s.d.position.y = floorY;
            if (Math.abs(s.vel.y) > 2.5) onBounce?.(Math.min(1, Math.abs(s.vel.y) / 14));
            s.vel.y = -s.vel.y * 0.42;
            s.vel.x *= 0.72; s.vel.z *= 0.72;
            s.spin.multiplyScalar(0.6);
          }
        }
        if (tAcc > 1.05) done();
      });
    });

    // Ausrollen: auf die Zielseite drehen
    const targets = sims.map((s) => {
      const idx = FACE_VALUES.indexOf(s.v);
      const base = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[idx], new THREE.Vector3(0, 1, 0));
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(toCam.x, toCam.z) + (Math.random() - 0.5) * 0.4);
      return { from: s.d.quaternion.clone(), to: yaw.multiply(base), y0: s.d.position.y };
    });
    await this.world.tween(0.45, (e) => {
      sims.forEach((s, i) => {
        s.d.quaternion.slerpQuaternions(targets[i].from, targets[i].to, e);
        s.d.position.y = targets[i].y0 + (floorY - targets[i].y0) * e + Math.sin(e * Math.PI) * 0.4;
      });
    });
    await this.world.wait(0.9);
    await this.world.tween(0.3, (e) => sims.forEach((s) => s.d.scale.setScalar(1 - e)));
    sims.forEach((s) => { s.d.visible = false; });
  }
}
