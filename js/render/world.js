// 3D-Welt: Renderer, Kamera, Nachbearbeitung (Bloom), Qualitätsstufen und Animations-Takt.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { glowTexture } from './textures.js';

export const QUALITY = {
  low:    { prCap: 1,    shadows: false, shadowSize: 512,  bloom: false, particles: 0.35, lights: false, decor: 0.45, samples: 0 },
  medium: { prCap: 1.6,  shadows: true,  shadowSize: 1024, bloom: true,  particles: 0.7,  lights: false, decor: 0.8,  samples: 0 },
  high:   { prCap: 2.25, shadows: true,  shadowSize: 2048, bloom: true,  particles: 1,    lights: true,  decor: 1,    samples: 4 },
};

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

export class World {
  constructor(canvas, qualityName = 'medium') {
    this.canvas = canvas;
    this.qualityName = qualityName;
    this.q = QUALITY[qualityName];
    this.updaters = new Set();
    this.tweens = [];
    this.time = 0;
    this.scale = 1;               // adaptive Auflösungsskalierung
    this.frames = 0; this.fpsTime = 0; this.fps = 60;
    this.followTarget = null;
    this.followPaused = false;
    this.mode = 'follow';

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: qualityName !== 'low', powerPreference: 'high-performance', alpha: false }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070a1c, 0.003);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1000);
    this.camera.position.set(0, 150, 190);

    const c = (this.controls = new OrbitControls(this.camera, canvas));
    c.enableDamping = true; c.dampingFactor = 0.08;
    c.minDistance = 10; c.maxDistance = 280;
    c.maxPolarAngle = 1.38; c.minPolarAngle = 0.15;
    c.enablePan = true; c.panSpeed = 0.8; c.rotateSpeed = 0.7; c.zoomSpeed = 1.1;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.addEventListener('start', () => { this.followPaused = true; this.onUserCamera?.(); });

    this.buildEnvironment();
    this.setupComposer();
    this.applyQuality(qualityName);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flushTweens(); });
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; });

    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.frame());
  }

  buildEnvironment() {
    const s = this.scene;
    // Himmelskuppel mit Farbverlauf
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x0a0f35) }, bottom: { value: new THREE.Color(0x02030a) }, tint: { value: new THREE.Color(0x3b1d5c) }, storm: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 tint; uniform float storm; varying vec3 vP;
        void main(){ float h = vP.y*0.5+0.5; vec3 c = mix(bottom, top, smoothstep(0.0,1.0,h));
          c += tint * pow(1.0-abs(vP.y), 6.0) * 0.6; c = mix(c, vec3(0.35,0.05,0.12), storm*0.35*(1.0-h));
          gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);
    s.add(this.sky);

    // Sterne
    const n = 1800;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = 420 + Math.random() * 120;
      const sq = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(th) * sq * rr; pos[i * 3 + 1] = Math.abs(u) * rr * 0.9 + 20; pos[i * 3 + 2] = Math.sin(th) * sq * rr;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, map: glowTexture(), transparent: true, depthWrite: false, color: 0xbfd4ff, fog: false, sizeAttenuation: true }));
    s.add(this.stars);

    // Farbige Nebelschleier am Himmel
    const nebula = [['#6a3cff', 0.16], ['#ff3fb4', 0.1], ['#2fe6ff', 0.1], ['#ffc83a', 0.06], ['#7c4dff', 0.12]];
    nebula.forEach(([color, opacity], i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      const a = (i / nebula.length) * Math.PI * 2 + 0.6;
      sp.position.set(Math.cos(a) * 430, 80 + (i % 3) * 70, Math.sin(a) * 430);
      sp.scale.set(420, 260, 1);
      s.add(sp);
    });

    this.hemi = new THREE.HemisphereLight(0x9fb8ff, 0x1a1030, 0.85);
    s.add(this.hemi);
    // Die Sonne folgt dem Kamerafokus: kleiner Schattenbereich = scharfe Schatten trotz großem Brett
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1dd, 1.6));
    this.sunOffset = new THREE.Vector3(40, 90, 30);
    sun.position.copy(this.sunOffset);
    sun.shadow.camera.left = -55; sun.shadow.camera.right = 55; sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 240;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
    s.add(sun);
    s.add(sun.target);
  }

  // Kamerafahrt über den Archipel (Spielstart)
  async flyover() {
    const c = this.controls;
    this.followPaused = true;
    this.cinematic = true;
    const portrait = window.innerWidth < window.innerHeight;
    await this.tween(3.6, (k) => {
      const a = -Math.PI * 0.75 + k * Math.PI * 1.05;
      const rad = (portrait ? 230 : 190) - k * 90;
      this.camera.position.set(Math.cos(a) * rad, 150 - k * 70, Math.sin(a) * rad);
      c.target.set(0, 0, 0);
    }, ease.inOut);
    this.cinematic = false;
    this.followPaused = false;
  }

  setupComposer() {
    const size = new THREE.Vector2(256, 256);
    const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: this.q.samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(size, 0.62, 0.42, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  applyQuality(name) {
    this.qualityName = name;
    this.q = QUALITY[name];
    const r = this.renderer;
    r.shadowMap.enabled = this.q.shadows;
    this.sun.castShadow = this.q.shadows;
    if (this.q.shadows) {
      this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((mm) => { mm.needsUpdate = true; }); } });
    this.scale = 1;
    this.onQuality?.(this.q);
    this.resize();
  }

  pixelRatio() {
    return Math.max(0.6, Math.min(window.devicePixelRatio || 1, this.q.prCap) * this.scale);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Hochformat: etwas weiterer Blickwinkel, damit das Brett aufs Handy passt
    this.camera.fov = w < h ? 62 : 48;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
  }

  addUpdater(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  tween(duration, fn, easing = ease.inOut) {
    // Unsichtbare Seite (App im Hintergrund): keine Frames – Animation sofort abschließen, damit nichts hängt
    if (document.hidden) { fn(easing(1), 1); return Promise.resolve(); }
    return new Promise((resolve) => {
      const tw = { t0: this.time, duration: Math.max(0.001, duration), fn, easing, resolve };
      // Watchdog: Falls keine Frames kommen (Tab im Hintergrund), trotzdem abschließen
      tw.guard = setTimeout(() => this.finishTween(tw), duration * 1000 + 1500);
      this.tweens.push(tw);
    });
  }

  finishTween(tw) {
    const i = this.tweens.indexOf(tw);
    if (i < 0) return;
    this.tweens.splice(i, 1);
    clearTimeout(tw.guard);
    tw.fn(tw.easing(1), 1);
    tw.resolve();
  }

  flushTweens() {
    for (const tw of this.tweens.slice()) this.finishTween(tw);
  }

  wait(seconds) { return this.tween(seconds, () => {}); }

  follow(getter) {
    this.followTarget = getter;
    this.followPaused = false;
    this.mode = 'follow';
  }

  overview() {
    this.mode = 'overview';
    this.followPaused = false;
  }

  focusOn(vec, distance = 30, polar = null) {
    this.mode = 'focus';
    this.focusPoint = vec.clone();
    this.focusDistance = distance;
    this.focusPolar = polar;
    this.followPaused = false;
  }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 };
  }

  updateCamera(dt) {
    const c = this.controls;
    if (this.followPaused) return;
    const k = 1 - Math.pow(0.0025, dt);
    let target, dist;
    const portrait = window.innerWidth < window.innerHeight;
    if (this.mode === 'overview') { target = new THREE.Vector3(0, 0, 0); dist = portrait ? 235 : 168; }
    else if (this.mode === 'focus' && this.focusPoint) { target = this.focusPoint; dist = this.focusDistance; }
    else if (this.followTarget) { target = this.followTarget(); dist = portrait ? 46 : 38; }
    if (!target) return;
    c.target.lerp(target, k);
    const off = this.camera.position.clone().sub(c.target);
    const cur = off.length();
    const desiredPolar = this.mode === 'overview' ? 0.62 : this.mode === 'focus' && this.focusPolar ? this.focusPolar : 0.95;
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.radius = cur + (dist - cur) * k;
    sph.phi = sph.phi + (desiredPolar - sph.phi) * k * 0.6;
    off.setFromSpherical(sph);
    this.camera.position.copy(c.target).add(off);
  }

  frame() {
    if (this.lost) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    // Tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      const t = Math.min(1, (this.time - tw.t0) / tw.duration);
      tw.fn(tw.easing(t), t);
      if (t >= 1) { this.tweens.splice(i, 1); clearTimeout(tw.guard); tw.resolve(); }
    }
    for (const u of this.updaters) u(dt, this.time);
    this.updateCamera(dt);
    this.controls.update();
    this.sun.target.position.copy(this.controls.target);
    this.sun.position.copy(this.controls.target).add(this.sunOffset);
    this.stars.rotation.y += dt * 0.004;
    if (this.q.bloom) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  // Adaptive Auflösung: hält die Bildrate auf Handys stabil
  adapt(dt) {
    this.frames++; this.fpsTime += dt;
    if (this.fpsTime < 2) return;
    this.fps = this.frames / this.fpsTime;
    this.frames = 0; this.fpsTime = 0;
    if (document.hidden) return;
    const old = this.scale;
    if (this.fps < 45 && this.scale > 0.6) this.scale = Math.max(0.6, this.scale - 0.12);
    else if (this.fps > 57 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.05);
    if (old !== this.scale) this.resize();
  }

  setStorm(level) {
    this.sky.material.uniforms.storm.value = level;
    this.scene.fog.color.setHex(level > 0 ? 0x1a0a16 : 0x070a1c);
  }
}
