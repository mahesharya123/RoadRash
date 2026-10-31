import * as THREE from 'three';

// ---------- helpers ----------
const $ = (id: string) => document.getElementById(id)!;
const R = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
// Touch UI shows on touch devices AND whenever the browser is phone-sized (e.g. DevTools device mode); re-checked live.
let sawTouch = false;
const isTouchUI = () => sawTouch || matchMedia('(pointer:coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(hover:hover) and (pointer:fine)').matches) || innerWidth <= 820 || innerHeight <= 500;
const syncTouch = () => document.body.classList.toggle('touch', isTouchUI());
const touch = isTouchUI(); syncTouch();
addEventListener('resize', syncTouch); addEventListener('orientationchange', syncTouch);
matchMedia('(pointer:coarse)').addEventListener('change', syncTouch);
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !sawTouch) { sawTouch = true; syncTouch(); } }, true);
addEventListener('touchstart', () => { if (!sawTouch) { sawTouch = true; syncTouch(); } }, { passive: true, capture: true });
const LANES = [-5.28, -1.76, 1.76, 5.28];
const MAXX = 7.5; // playable half-width (road is +-8, barrier at 8.4)

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfdcff, 40, 340);
scene.background = new THREE.Color(0x8fc8ff);
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 700);

// day / sunset / night palettes (cycle with level)
const PAL = [
  { sky: 0x8fc8ff, fog: 0xbfdcff, sun: 2.2, hemi: 1.0, mtn: 0x7d97b5, night: 0 },
  { sky: 0xff9a5a, fog: 0xffb98a, sun: 1.6, hemi: 0.7, mtn: 0x8a5a60, night: 0.3 },
  { sky: 0x0a1230, fog: 0x0d1738, sun: 0.35, hemi: 0.5, mtn: 0x1a2447, night: 1 },
];
const cur = { sky: new THREE.Color(PAL[0].sky), fog: new THREE.Color(PAL[0].fog), mtn: new THREE.Color(PAL[0].mtn), sun: 2.2, hemi: 1, night: 0 };
const hemi = new THREE.HemisphereLight(0xdfeeff, 0x4a5a3a, 1);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 40, bottom: -40, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
scene.add(hemi, sun, sun.target);

// ---------- textures ----------
function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number) {
  for (let i = 0; i < n; i++) { const v = (Math.random() * 255) | 0; g.fillStyle = `rgba(${v},${v},${v},${a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}
const roadTex = tex(512, 512, (g, w, h) => {
  g.fillStyle = '#3b3c42'; g.fillRect(0, 0, w, h); speckle(g, w, h, 9000, 0.12);
  g.fillStyle = '#e9e9e4'; g.fillRect(w * 0.06 - 5, 0, 10, h); g.fillRect(w * 0.94 - 5, 0, 10, h);
  for (const k of [0.28, 0.5, 0.72]) g.fillRect(w * k - 4, 0, 8, h * 0.35);
  g.fillStyle = 'rgba(0,0,0,.18)'; for (const k of [0.17, 0.39, 0.61, 0.83]) g.fillRect(w * k - 18, 0, 36, h);
}, 1, 60);
const grassTex = tex(256, 256, (g, w, h) => { g.fillStyle = '#4c7f3b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, 0.18); }, 70, 70);
const barrierTex = tex(128, 32, (g, w, h) => { g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h); g.fillStyle = '#d6342a'; g.fillRect(0, 0, w / 2, h); }, 50, 1);
const winTex = tex(128, 256, (g, w, h) => {
  g.fillStyle = '#5b6070'; g.fillRect(0, 0, w, h);
  for (let y = 8; y < h; y += 22) for (let x = 8; x < w; x += 20) { g.fillStyle = Math.random() < 0.45 ? '#ffe9a8' : '#2c3342'; g.fillRect(x, y, 11, 13); }
}, 1, 1);

// ---------- road, ground, barriers, mountains ----------
const std = (c: number, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const road = new THREE.Mesh(new THREE.PlaneGeometry(16, 600), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }));
road.rotation.x = -Math.PI / 2; road.receiveShadow = true;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true;
const barriers = [-1, 1].map((s) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 400), new THREE.MeshStandardMaterial({ map: barrierTex, roughness: 0.5, metalness: 0.2 }));
  b.position.set(s * 8.4, 0.45, 0); b.castShadow = b.receiveShadow = true; return b;
});
const mtnMat = new THREE.MeshBasicMaterial({ color: 0x7d97b5, fog: false });
const mountains = new THREE.Group();
for (let i = 0; i < 14; i++) {
  const h = R(60, 140), m = new THREE.Mesh(new THREE.ConeGeometry(R(60, 110), h, 5), mtnMat);
  m.position.set((i - 6.5) * 80 + R(-20, 20), h / 2 - 5, R(-20, 20)); mountains.add(m);
}
scene.add(road, ground, ...barriers, mountains);

// ---------- scenery ----------
const trunkM = std(0x5a3a22), leafM = [0x2f7d32, 0x3f9a3c, 0x22692b].map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true }));
const poleM = std(0x888c94, 0.5, 0.6), bulbM = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe08a, emissiveIntensity: 0 });
const bldM = [0xffffff, 0xd8c7b0, 0xb0c4d8, 0xd8b0b0].map((c) => new THREE.MeshStandardMaterial({ map: winTex, color: c, roughness: 0.8 }));
const shadow = (o: THREE.Object3D) => { o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; }); return o; };
const ADS = ['TURBO COLA', 'RASH FM 99.1', 'MOTO PARTS', 'DINER 24H', 'FUEL NEXT 5KM', 'HELMETS SAVE LIVES'];
function mkDeco(k: string): THREE.Object3D {
  const g = new THREE.Group();
  if (k === 'tree') {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), trunkM); t.position.y = 1.2;
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), leafM[(Math.random() * 3) | 0]); l.position.y = 3.8; l.scale.y = 1.3; g.add(t, l);
  } else if (k === 'pine') {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.5, 6), trunkM); t.position.y = 0.75; g.add(t);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(2.1 - i * 0.5, 2.4, 7), leafM[2]); c.position.y = 2.2 + i * 1.5; g.add(c); }
  } else if (k === 'lamp') {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7.5, 8), poleM); p.position.y = 3.75;
    const a = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), poleM); a.position.set(-1.1, 7.4, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.3), bulbM); b.position.set(-2.1, 7.3, 0); g.add(p, a, b);
  } else if (k === 'sign') {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 3), new THREE.MeshStandardMaterial({
      roughness: 0.6, map: tex(512, 220, (c, w, h) => { c.fillStyle = ['#c0392b', '#1f5fa8', '#1f8a4c', '#222'][(Math.random() * 4) | 0]; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 10; c.strokeRect(10, 10, w - 20, h - 20); c.fillStyle = '#fff'; c.font = 'italic 900 62px Impact,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ADS[(Math.random() * ADS.length) | 0], w / 2, h / 2); }),
    }));
    board.position.y = 6; const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 6), poleM), p2 = p1.clone();
    p1.position.set(-2.5, 2.5, -0.1); p2.position.set(2.5, 2.5, -0.1); g.add(board, p1, p2);
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), bldM[(Math.random() * 4) | 0]); g.add(b); b.receiveShadow = true;
  }
  return shadow(g);
}
interface Deco { o: THREE.Object3D; k: string }
const KINDS = ['tree', 'pine', 'lamp', 'tree', 'bld', 'pine', 'sign'];
const STEP = 6, NDECO = 105;
const decos: Deco[] = Array.from({ length: NDECO }, (_, i) => { const k = KINDS[i % KINDS.length], o = mkDeco(k); scene.add(o); return { o, k }; });
function place(d: Deco, z: number) {
  const s = Math.random() < 0.5 ? -1 : 1, o = d.o; o.position.z = z; o.rotation.y = 0;
  let x = 0;
  if (d.k === 'tree' || d.k === 'pine') { x = s * (10 + R(0, 22)); o.scale.setScalar(R(0.8, 1.4)); }
  else if (d.k === 'lamp') { x = s * 9.4; o.rotation.y = s > 0 ? 0 : Math.PI; }
  else if (d.k === 'sign') { x = s * 14; }
  else { x = s * (36 + R(0, 14)); o.scale.set(R(10, 18), R(12, 44), R(10, 18)); }
  o.position.x = x;
}

// ---------- vehicles ----------
const glassM = std(0x1b2430, 0.2, 0.8), tailM = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.5 }), tireM = std(0x15161a, 0.9);
const bx = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
const wheelGeo = (r: number, w: number) => new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2);
function makeCar(col: number) {
  const g = new THREE.Group(), body = std(col, 0.35, 0.5);
  g.add(bx(1.9, 0.6, 4.2, body, 0, 0.65, 0), bx(1.6, 0.55, 2.1, glassM, 0, 1.2, 0.2), bx(0.5, 0.18, 0.05, tailM, -0.65, 0.75, 2.11), bx(0.5, 0.18, 0.05, tailM, 0.65, 0.75, 2.11));
  for (const sx of [-1, 1]) for (const sz of [-1.4, 1.4]) { const w = new THREE.Mesh(wheelGeo(0.36, 0.25), tireM); w.position.set(sx * 0.95, 0.36, sz); w.castShadow = true; g.add(w); }
  return g;
}
function makeTruck() {
  const g = new THREE.Group(), cab = std([0xc0392b, 0x1f5fa8, 0xe0a020][(Math.random() * 3) | 0], 0.4, 0.4), tr = std([0xeeeeee, 0xcfd8dc, 0x8d6e4b][(Math.random() * 3) | 0], 0.6);
  g.add(bx(2.4, 2.3, 2.2, cab, 0, 1.75, -4.4), bx(2.0, 0.8, 0.1, glassM, 0, 2.3, -5.52), bx(2.5, 3.0, 8, tr, 0, 2.2, 1.5), bx(2.2, 0.4, 10.6, std(0x222222), 0, 0.6, 0), bx(0.6, 0.2, 0.05, tailM, -0.8, 0.9, 5.52), bx(0.6, 0.2, 0.05, tailM, 0.8, 0.9, 5.52));
  for (const sx of [-1, 1]) for (const sz of [-4.4, 1.5, 3.4]) { const w = new THREE.Mesh(wheelGeo(0.5, 0.3), tireM); w.position.set(sx * 1.1, 0.5, sz); w.castShadow = true; g.add(w); }
  return g;
}
interface Bike { g: THREE.Group; lean: THREE.Group; wf: THREE.Mesh; wr: THREE.Mesh; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group }
function makeBike(col: number, suit: number): Bike {
  const g = new THREE.Group(), lean = new THREE.Group(); g.add(lean);
  const paint = std(col, 0.3, 0.6), suitM = std(suit, 0.7), black = std(0x15151a, 0.6, 0.3), chrome = std(0xbfc4cc, 0.2, 0.9);
  const mk = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; lean.add(o); return o; };
  const wf = new THREE.Mesh(wheelGeo(0.36, 0.16), tireM), wr = new THREE.Mesh(wheelGeo(0.38, 0.22), tireM);
  wf.position.set(0, 0.36, -0.85); wr.position.set(0, 0.38, 0.85); wf.castShadow = wr.castShadow = true; lean.add(wf, wr);
  mk(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 12).rotateZ(Math.PI / 2), chrome, 0, 0.36, -0.85);
  mk(new THREE.BoxGeometry(0.28, 0.32, 1.4), black, 0, 0.62, 0.05);
  mk(new THREE.BoxGeometry(0.38, 0.3, 0.65), paint, 0, 0.95, -0.22);
  mk(new THREE.BoxGeometry(0.3, 0.1, 0.75), black, 0, 0.84, 0.38);
  mk(new THREE.BoxGeometry(0.5, 0.2, 0.4), paint, 0, 0.72, 0.85);
  mk(new THREE.BoxGeometry(0.08, 0.8, 0.08), chrome, 0, 0.76, -0.82).rotation.x = 0.3;
  mk(new THREE.BoxGeometry(1.0, 0.05, 0.05), black, 0, 1.17, -0.62);
  mk(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 1.2 }), 0, 1.05, -0.98);
  mk(new THREE.BoxGeometry(0.3, 0.06, 0.04), tailM, 0, 0.78, 1.1);
  mk(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 8).rotateX(Math.PI / 2), chrome, 0.24, 0.35, 0.35);
  // rider
  const torso = mk(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), suitM, 0, 1.38, 0.12); torso.rotation.x = -0.45;
  const head = mk(new THREE.SphereGeometry(0.2, 14, 12), paint, 0, 1.88, -0.2);
  mk(new THREE.BoxGeometry(0.3, 0.1, 0.12), black, 0, 1.88, -0.38);
  const limb = (len: number, rad: number, x: number, y: number, z: number, rx: number) => {
    const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.x = rx;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 4, 8), suitM); m.position.y = -len / 2 - rad; m.castShadow = true; p.add(m); lean.add(p); return p;
  };
  void torso; void head;
  return { g, lean, wf, wr, armL: limb(0.45, 0.075, -0.27, 1.6, -0.02, 1.0), armR: limb(0.45, 0.075, 0.27, 1.6, -0.02, 1.0), legL: limb(0.55, 0.1, -0.17, 0.98, 0.3, 0.3), legR: limb(0.55, 0.1, 0.17, 0.98, 0.3, 0.3) };
}
// aL/aR: arm swing 0..1, lR: right-leg kick 0..1
function pose(b: Bike, aL: number, aR: number, lR: number) {
  b.armL.rotation.set(1.0 - 1.6 * aL, 0, -1.6 * aL); b.armR.rotation.set(1.0 - 1.6 * aR, 0, 1.6 * aR);
  b.legR.rotation.set(0.3 - 1.1 * lR, 0, 1.3 * lR);
}

// ---------- entities ----------
interface E { kind: 'car' | 'truck' | 'rival'; idx: number; m: THREE.Group; bike?: Bike; on: boolean; x: number; z: number; v: number; vx: number; tx: number; hw: number; hl: number; hp: number; dead: number; side: number; cd: number; atk: number; hitT: number }
const ents: E[] = [];
const CARCOL = [0xd33a2c, 0x2a6fdb, 0xeeeeee, 0xf2b21a, 0x2a2a2a, 0x2fa84f, 0x8a3fd0];
const RIVCOL = [0xff5a1f, 0x1fb0ff, 0xb02fff, 0xffd01f, 0x1fff8a];
function addEnt(kind: E['kind'], idx: number) {
  let m: THREE.Group, bike: Bike | undefined, hw = 0.95, hl = 2.1;
  if (kind === 'car') m = makeCar(CARCOL[idx % CARCOL.length]);
  else if (kind === 'truck') { m = makeTruck(); hw = 1.25; hl = 5.5; }
  else { bike = makeBike(RIVCOL[idx % RIVCOL.length], [0x222222, 0x6a1b1b, 0x1b3a6a, 0x3a3a1b, 0x1b4a2a][idx % 5]); m = bike.g; hw = 0.4; hl = 1.0; }
  scene.add(m);
  ents.push({ kind, idx, m, bike, on: false, x: 0, z: 0, v: 0, vx: 0, tx: 0, hw, hl, hp: 1, dead: 0, side: 1, cd: 1, atk: 0, hitT: 0 });
}
for (let i = 0; i < 14; i++) addEnt('car', i);
for (let i = 0; i < 4; i++) addEnt('truck', i);
for (let i = 0; i < 5; i++) addEnt('rival', i);

// ---------- sparks ----------
const sparkM = new THREE.MeshBasicMaterial({ color: 0xffc040 });
const sparks = Array.from({ length: 48 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), sparkM); m.visible = false; scene.add(m); return { m, v: new THREE.Vector3(), t: 0 }; });
let sparkI = 0;
function burst(x: number, y: number, z: number, n: number, power = 6) {
  for (let i = 0; i < n; i++) { const s = sparks[sparkI++ % sparks.length]; s.m.position.set(x, y, z); s.v.set(R(-1, 1) * power, R(1, 1 + power * 0.6), R(-1, 1) * power); s.t = R(0.3, 0.8); s.m.visible = true; }
}

// ---------- audio (procedural, no external assets) ----------
let ac: AudioContext | null = null, eng: OscillatorNode, engG: GainNode, master: GainNode, muted = false, noiseBuf: AudioBuffer;
function initAudio() {
  if (ac) { void ac.resume(); return; }
  try {
    ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 1.8;
    const comp = ac.createDynamicsCompressor(); master.connect(comp).connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    eng = ac.createOscillator(); eng.type = 'sawtooth'; engG = ac.createGain(); engG.gain.value = 0;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    eng.connect(f).connect(engG).connect(master); eng.start();
  } catch { ac = null; }
}
function setMute(m: boolean) { muted = m; if (ac) master.gain.setTargetAtTime(m ? 0 : 1.8, ac.currentTime, 0.02); const b = document.getElementById('snd'); if (b) b.textContent = m ? '🔇' : '🔊'; }
function note(f: number, t: number, d: number, type: OscillatorType, v: number, f2 = 0) {
  if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.02);
}
function hit(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass') {
  if (!ac) return; const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
}
const now = () => (ac ? ac.currentTime : 0);
const sfx = {
  punch: () => { const t = now(); note(200, t, 0.14, 'sine', 0.7, 45); hit(t, 0.12, 0.5, 1200); },
  kick: () => { const t = now(); note(150, t, 0.2, 'sine', 0.9, 35); hit(t, 0.2, 0.7, 700); note(900, t, 0.06, 'square', 0.08, 200); },
  whiff: () => hit(now(), 0.14, 0.18, 3500, 'highpass'),
  crash: () => { const t = now(); hit(t, 0.5, 0.9, 900); note(110, t, 0.35, 'sawtooth', 0.4, 30); note(60, t, 0.4, 'sine', 0.8, 28); },
  scrape: () => hit(now(), 0.12, 0.2, 3500, 'bandpass'),
  ko: () => { const t = now(); [523, 659, 784, 1047].forEach((f, i) => note(f, t + i * 0.07, 0.18, 'square', 0.12)); hit(t, 0.4, 0.5, 500); },
  level: () => { const t = now(); [392, 494, 587, 784, 988].forEach((f, i) => note(f, t + i * 0.08, 0.25, 'triangle', 0.25)); },
  go: () => { const t = now(); note(440, t, 0.12, 'square', 0.12); note(880, t + 0.14, 0.3, 'square', 0.14); },
  gameover: () => {
    const t = now() + 0.1; note(330, t, 1.6, 'sawtooth', 0.25, 40); hit(t, 0.8, 0.8, 600);
    [440, 392, 349, 294, 220].forEach((f, i) => { note(f, t + 0.4 + i * 0.28, 0.5, 'triangle', 0.3); note(f / 2, t + 0.4 + i * 0.28, 0.5, 'sine', 0.3); });
    note(110, t + 1.9, 2.2, 'triangle', 0.35); note(82.4, t + 1.9, 2.2, 'sine', 0.4);
  },
};
// driving soundtrack: Am - F - C - G, 16-step bar, scheduled ahead of time
let musicOn = false, mT = 0, mStep = 0, mTimer = 0;
const ROOTS = [55, 43.65, 65.41, 49], ARP = [[1, 1.5, 2, 3, 2, 1.5, 2, 3], [1, 1.5, 2, 3, 2, 1.5, 2, 3], [1, 1.25, 1.5, 2, 1.5, 1.25, 1.5, 2], [1, 1.25, 1.5, 2, 1.5, 1.25, 1.5, 2]];
function startMusic() {
  if (!ac || musicOn) return; musicOn = true; mT = ac.currentTime + 0.1; mStep = 0;
  mTimer = window.setInterval(() => {
    if (!ac) return; const spb = 60 / (132 + level * 6) / 4;
    while (mT < ac.currentTime + 0.25) {
      const s = mStep % 16, bar = Math.floor(mStep / 16) % 4, r = ROOTS[bar];
      if (s % 4 === 0) { note(150, mT, 0.15, 'sine', 0.55, 40); }
      if (s === 4 || s === 12) hit(mT, 0.14, 0.22, 1800, 'highpass');
      if (s % 2 === 1) hit(mT, 0.04, 0.07, 7000, 'highpass');
      if (s % 2 === 0 || s === 7 || s === 15) note(r * (s % 8 === 6 ? 2 : 1), mT, spb * 1.6, 'sawtooth', 0.11);
      note(r * 4 * ARP[bar][s % 8], mT, spb * 1.2, 'square', 0.035);
      if (s === 0) note(r * 4, mT, spb * 14, 'triangle', 0.05);
      mT += spb; mStep++;
    }
  }, 40);
}
function stopMusic() { musicOn = false; clearInterval(mTimer); }

// ---------- game state ----------
type State = 'menu' | 'play' | 'over';
let joy = 0, joyY = 0, paused = false;
let state: State = 'menu', level = 1, shake = 0, crashT = 0, kos = 0, toastT = 0;
const p = { x: 0, z: 0, v: 0, vx: 0, hp: 100, score: 0, dist: 0, inv: 0, cd: 0, atkSide: 0, atkT: 0, crashed: false };
const player = makeBike(0xe02020, 0x1a1a1a); scene.add(player.g);
const allowed = (k: E['kind']) => (k === 'car' ? Math.min(14, 6 + level * 2) : k === 'truck' ? Math.min(4, 1 + level) : Math.min(5, 1 + level));

function respawn(e: E, init = false) {
  e.dead = 0; e.m.rotation.set(0, 0, 0); e.m.position.y = 0; e.vx = 0; e.atk = 0; e.hitT = 0; e.cd = R(1, 2.2); e.on = e.idx < allowed(e.kind); e.m.visible = e.on;
  let z = 0, x = 0;
  for (let t = 0; t < 14; t++) {
    if (e.kind === 'rival') z = init ? p.z - R(25, 110) : Math.random() < 0.5 ? p.z + R(30, 60) : p.z - R(110, 190);
    else z = p.z - (init ? R(30, 320) : R(220, 340));
    x = e.kind === 'rival' ? R(-6, 6) : LANES[(Math.random() * 4) | 0];
    if (!ents.some((o) => o !== e && o.on && Math.abs(o.z - z) < e.hl + o.hl + 7 && Math.abs(o.x - x) < 2.6)) break;
  }
  e.z = z; e.x = e.tx = x; e.side = Math.random() < 0.5 ? -1 : 1;
  e.v = e.kind === 'car' ? R(17, 28) + level : e.kind === 'truck' ? R(14, 20) : 30;
  e.hp = e.kind === 'rival' ? 40 + level * 8 : 1;
}
function applyLevel() {
  const pal = PAL[(level - 1) % PAL.length]; (cur as any).target = pal;
  for (const e of ents) if (!e.on && e.idx < allowed(e.kind)) respawn(e, true);
}
function reset() {
  Object.assign(p, { x: 0, z: 0, v: 14, vx: 0, hp: 100, score: 0, dist: 0, inv: 1, cd: 0, atkSide: 0, atkT: 0, crashed: false });
  level = 1; kos = 0; crashT = 0; shake = 0; (cur as any).target = PAL[0];
  player.g.rotation.set(0, 0, 0); player.lean.rotation.set(0, 0, 0); player.g.position.set(0, 0, 0);
  decos.forEach((d, i) => place(d, -i * STEP + 20));
  ents.forEach((e) => respawn(e, true));
}
function toast(t: string) { const el = $('toast'); el.textContent = t; el.style.opacity = '1'; toastT = 1.4; }
function start() {
  initAudio(); reset(); state = 'play'; paused = false; clearInputs(); $('pause').classList.remove('on');
  $('menu').classList.remove('on'); $('over').classList.remove('on'); toast('GO!'); sfx.go(); stopMusic(); startMusic();
}
$('start').addEventListener('click', start);
$('again').addEventListener('click', start);

// ---------- input ----------
const keys: Record<string, boolean> = {}, tc: Record<string, boolean> = {};
function attack(side: -1 | 1) {
  if (state !== 'play' || paused || p.crashed || p.atkT > 0) return;
  p.atkSide = side; p.atkT = 0.3; p.cd = 0.1;
  let hit = false;
  for (const e of ents) {
    if (e.kind !== 'rival' || !e.on || e.dead) continue;
    const dx = e.x - p.x, dz = e.z - p.z;
    if (Math.abs(dz) < 2.6 && dx * side > 0.2 && Math.abs(dx) < 3.2) {
      hit = true; e.hp -= side < 0 ? 18 : 26; e.vx = side * 9; e.hitT = 0.3; e.v *= 0.85;
      burst(e.x, 1.2, e.z, 10, 5); (side < 0 ? sfx.punch() : sfx.kick()); shake = Math.max(shake, 0.25);
      if (e.hp <= 0) { e.dead = 0.01; kos++; p.score += 500; toast('KNOCKOUT! +500'); sfx.ko(); }
    }
  }
  if (!hit) sfx.whiff();
}
addEventListener('keydown', (e) => {
  keys[e.code] = true; unlock();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if ((e.code === 'Enter' || e.code === 'Space') && state !== 'play' && (e.target as HTMLElement).tagName !== 'BUTTON') start();
  if (['KeyZ', 'KeyQ', 'KeyJ'].includes(e.code)) attack(-1);
  if (['KeyX', 'KeyE', 'KeyK'].includes(e.code)) attack(1);
  if (e.code === 'KeyP' || e.code === 'Escape') setPause(!paused);
  if (e.code === 'KeyM') { setMute(!muted); toast(muted ? 'MUTED' : 'SOUND ON'); }
});
const unlock = () => { initAudio(); if (ac && !paused && ac.state !== 'running') void ac.resume(); };
addEventListener('pointerdown', unlock); addEventListener('touchend', unlock);
$('snd').addEventListener('click', (ev) => { ev.stopPropagation(); unlock(); setMute(!muted); });
addEventListener('keyup', (e) => (keys[e.code] = false));
const joyEl = $('joy'), knobEl = $('knob'); let joyId = -1;
const ENDS = ['pointerup', 'pointercancel', 'lostpointercapture'];
function joyMove(ev: PointerEvent) {
  const r = joyEl.getBoundingClientRect(), max = r.width * 0.3;
  let dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2); const m = Math.hypot(dx, dy);
  if (m > max) { dx *= max / m; dy *= max / m; }
  knobEl.style.transform = `translate(${dx}px,${dy}px)`;
  const n = dx / max; joy = Math.abs(n) < 0.12 ? 0 : (Math.sign(n) * (Math.abs(n) - 0.12)) / 0.88; // dead zone + analog steer
  const ny = dy / max; joyY = Math.abs(ny) < 0.3 ? 0 : Math.sign(ny); // up (-1) = gas, down (+1) = brake/stop
}
joyEl.addEventListener('pointerdown', (ev) => { ev.preventDefault(); if (paused || joyId !== -1) return; joyId = ev.pointerId; try { joyEl.setPointerCapture(joyId); } catch { /* synthetic pointer */ } joyMove(ev); });
joyEl.addEventListener('pointermove', (ev) => { if (ev.pointerId === joyId) joyMove(ev); });
for (const t of ENDS) joyEl.addEventListener(t, ((ev: PointerEvent) => { if (ev.pointerId !== joyId) return; joyId = -1; joy = 0; joyY = 0; knobEl.style.transform = ''; }) as EventListener);
document.querySelectorAll<HTMLElement>('.tb').forEach((b) => {
  const k = b.dataset.k!; let id = -1;
  b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); if (paused || id !== -1) return; id = ev.pointerId; try { b.setPointerCapture(id); } catch { /* synthetic pointer */ } tc[k] = true; b.classList.add('on'); if (k === 'pl') attack(-1); if (k === 'kr') attack(1); });
  for (const t of ENDS) b.addEventListener(t, ((ev: PointerEvent) => { if (ev.pointerId !== id) return; id = -1; tc[k] = false; b.classList.remove('on'); }) as EventListener);
});
function clearInputs() {
  for (const k in keys) keys[k] = false; for (const k in tc) tc[k] = false;
  joy = 0; joyY = 0; joyId = -1; knobEl.style.transform = ''; document.querySelectorAll('.tb.on').forEach((x) => x.classList.remove('on'));
}
function setPause(v: boolean) {
  if (v === paused || (v && state !== 'play')) return;
  paused = v; $('pause').classList.toggle('on', v); clearInputs();
  if (ac) void (v ? ac.suspend() : ac.resume());
}
$('pausebtn').addEventListener('click', () => setPause(!paused));
$('resume').addEventListener('click', () => setPause(false));
$('restart').addEventListener('click', () => { setPause(false); start(); });
addEventListener('blur', () => setPause(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- gameplay ----------
function hurt(dmg: number, inv = 0.7) {
  if (p.inv > 0 || state !== 'play') return;
  p.hp -= dmg; p.inv = inv; shake = Math.min(1, 0.3 + dmg * 0.04);
  burst(p.x, 0.6, p.z, 14, 6); sfx.crash();
}
function updateEntities(dt: number, playing: boolean) {
  for (const e of ents) {
    if (!e.on) continue;
    e.hitT = Math.max(0, e.hitT - dt);
    if (e.dead > 0) { // tumbling knocked-out rival
      e.dead += dt; e.v *= 1 - dt * 1.4; e.m.rotation.z += dt * 9 * e.side; e.m.rotation.y += dt * 3;
      e.m.position.y = Math.max(0, Math.sin(Math.min(e.dead, 0.9) * Math.PI / 0.9) * 1.6);
      e.x += e.vx * dt; e.vx *= 1 - dt * 1.5; e.z -= e.v * dt;
      if (e.dead > 2) respawn(e); continue;
    }
    if (e.kind === 'rival') {
      const ahead = p.z - e.z, near = Math.abs(ahead) < 40;
      e.v += clamp(clamp(p.v - ahead * 0.4, 14, p.v + 22) - e.v, -22 * dt, 22 * dt);
      e.tx = near ? clamp(p.x + e.side * 1.7, -6.8, 6.8) : e.tx;
      for (const o of ents) if (o.on && o.kind !== 'rival' && o.z < e.z && e.z - o.z < o.hl + 16 && Math.abs(o.x - e.tx) < o.hw + 1.4) e.tx = clamp(o.x + (e.x >= o.x ? 1 : -1) * (o.hw + 1.5), -6.8, 6.8);
      e.x += (e.vx + (e.tx - e.x) * 2.4) * dt; e.vx *= 1 - dt * 4;
      e.cd -= dt;
      if (playing && !p.crashed && e.atk <= 0 && e.cd <= 0 && Math.abs(e.z - p.z) < 2.2 && Math.abs(e.x - p.x) < 2.4) { e.atk = 0.3; e.cd = Math.max(0.7, R(1.2, 2.3) - level * 0.12); }
      let aL = 0, aR = 0;
      if (e.atk > 0) {
        const prev = e.atk; e.atk -= dt; const k = Math.sin((1 - e.atk / 0.3) * Math.PI);
        if (p.x < e.x) aL = k; else aR = k;
        if (prev > 0.15 && e.atk <= 0.15 && Math.abs(e.z - p.z) < 2.6 && Math.abs(e.x - p.x) < 2.8) { hurt(5 + level, 0.35); p.vx += (p.x < e.x ? -1 : 1) * 5; }
      }
      pose(e.bike!, aL, aR, 0);
      e.bike!.lean.rotation.z = clamp(-(e.tx - e.x) * 0.12, -0.5, 0.5) + (e.hitT > 0 ? 0.3 * e.side : 0);
      e.bike!.wf.rotation.x -= e.v * dt / 0.36; e.bike!.wr.rotation.x -= e.v * dt / 0.38;
      e.m.rotation.y = clamp(-(e.tx - e.x) * 0.06, -0.3, 0.3);
    } else { // traffic follows leader in lane
      for (const o of ents) if (o !== e && o.on && o.kind !== 'rival' && Math.abs(o.x - e.x) < 2 && o.z < e.z && e.z - o.z < e.hl + o.hl + 10) e.v = Math.min(e.v, o.v);
    }
    e.z -= e.v * dt; e.m.position.x = e.x; e.m.position.z = e.z;
    if (e.z > p.z + 40 || e.z < p.z - 460) respawn(e);
  }
  if (!playing) return;
  // collisions with player
  for (const e of ents) {
    if (!e.on || e.dead) continue;
    const dx = p.x - e.x, dz = p.z - e.z, ox = 0.35 + e.hw - Math.abs(dx), oz = 1 + e.hl - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      const closing = Math.max(0, p.v - e.v);
      if (ox < oz) { const s = dx >= 0 ? 1 : -1; p.x += s * ox; p.vx = s * 5; if (e.kind === 'rival') e.vx = -s * 5; }
      else if (dz > 0) { p.z += oz; p.v = Math.min(p.v, e.v * 0.8); }
      else { p.z -= oz; p.v = Math.max(p.v, e.v); }
      hurt(Math.min(40, (e.kind === 'truck' ? 14 : e.kind === 'car' ? 9 : 3) + closing * 0.6));
      if (e.kind !== 'rival') p.v = Math.min(p.v, Math.max(8, e.v));
    }
  }
}
function update(dt: number) {
  const playing = state === 'play';
  if (tc.pl) attack(-1); if (tc.kr) attack(1); // held touch buttons repeat
  const steer = clamp((keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0) + joy, -1, 1);
  const gas = keys.ArrowUp || keys.KeyW || tc.gas || joyY < 0, brk = keys.ArrowDown || keys.KeyS || tc.brk || joyY > 0;
  const vmax = 56 + level * 2;
  p.inv = Math.max(0, p.inv - dt); p.atkT = Math.max(0, p.atkT - dt);
  if (state === 'menu') { p.v = 24; p.x += (Math.sin(performance.now() / 1500) * 2.5 - p.x) * dt; }
  else if (!p.crashed) {
    if (gas) p.v += 18 * (1 - p.v / (vmax + 8)) * dt; else p.v -= 3 * dt;
    if (brk) p.v -= 38 * dt;
    p.v = clamp(p.v, 0, vmax);
    p.vx += (steer * (8 + p.v * 0.12) - p.vx) * Math.min(1, dt * 6);
    p.x += p.vx * dt;
    if (Math.abs(p.x) > MAXX) { // barrier scrape
      p.x = Math.sign(p.x) * MAXX; p.vx = -Math.sign(p.x) * 1.5; p.v = Math.max(0, p.v - 14 * dt);
      p.hp -= 4 * dt; shake = Math.max(shake, 0.15); if (Math.random() < 0.5) burst(p.x + Math.sign(p.x) * 0.3, 0.5, p.z, 2, 3); if (Math.random() < 0.08) sfx.scrape();
    }
  } else { // wipe-out tumble
    crashT += dt; p.v *= 1 - dt * 1.6; p.x += p.vx * dt; p.vx *= 1 - dt;
    player.g.rotation.z += dt * 9; player.g.rotation.y += dt * 4; player.g.position.y = Math.max(0, Math.sin(Math.min(crashT, 0.8) * Math.PI / 0.8) * 1.8);
    if (Math.random() < 0.4) burst(p.x, 0.3, p.z, 2, 4);
    if (crashT > 1.4 && state === 'play') gameOver();
  }
  p.z -= p.v * dt;
  if (playing) { p.dist += p.v * dt; p.score += p.v * dt * 0.15; if (p.hp <= 0 && !p.crashed) { p.crashed = true; p.hp = 0; shake = 1; sfx.crash(); stopMusic(); burst(p.x, 0.8, p.z, 30, 9); } }
  const L = 1 + Math.floor(p.dist / 1500); if (playing && L !== level) { level = L; applyLevel(); toast('LEVEL ' + level); sfx.level(); }
  updateEntities(dt, playing && !p.crashed);

  // player visuals
  if (!p.crashed) {
    player.g.position.set(p.x, 0, p.z); player.g.rotation.set(0, clamp(-p.vx * 0.02, -0.25, 0.25), 0);
    player.lean.rotation.z = clamp(-p.vx * 0.05, -0.55, 0.55) + (p.inv > 0.4 ? Math.sin(p.inv * 40) * 0.1 : 0);
    const k = p.atkT > 0 ? Math.sin((1 - p.atkT / 0.3) * Math.PI) : 0;
    pose(player, p.atkSide < 0 ? k : 0, 0, p.atkSide > 0 ? k : 0);
  } else { player.g.position.x = p.x; player.g.position.z = p.z; }
  player.wf.rotation.x -= p.v * dt / 0.36; player.wr.rotation.x -= p.v * dt / 0.38;

  // world follows player (snapped so tiling stays seamless)
  road.position.z = Math.round(p.z / 10) * 10; ground.position.z = road.position.z; ground.position.x = 0;
  barriers.forEach((b) => (b.position.z = Math.round(p.z / 8) * 8)); mountains.position.z = p.z - 450; mountains.position.x = 0;
  for (const d of decos) if (d.o.position.z > p.z + 30) place(d, d.o.position.z - NDECO * STEP);
  sun.position.set(p.x + 25, 45, p.z + 15); sun.target.position.set(p.x, 0, p.z - 10);
  for (const s of sparks) if (s.m.visible) { s.t -= dt; s.v.y -= 18 * dt; s.m.position.addScaledVector(s.v, dt); if (s.t <= 0 || s.m.position.y < 0) s.m.visible = false; }

  // camera
  shake = Math.max(0, shake - dt * 1.6);
  const tx = p.x * 0.7, ty = 3.1 + p.v * 0.01, tz = p.z + 7.4 + p.v * 0.03;
  camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 6); camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 6); camera.position.z = tz;
  camera.position.x += R(-1, 1) * shake * 0.25; camera.position.y += R(-1, 1) * shake * 0.2;
  camera.lookAt(p.x * 0.85, 1.4, p.z - 14);
  camera.fov += (62 + p.v * 0.45 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();

  // palette blend
  const t = (cur as any).target as (typeof PAL)[0] | undefined;
  if (t) {
    const a = Math.min(1, dt * 0.8); cur.sky.lerp(new THREE.Color(t.sky), a); cur.fog.lerp(new THREE.Color(t.fog), a); cur.mtn.lerp(new THREE.Color(t.mtn), a);
    cur.sun += (t.sun - cur.sun) * a; cur.hemi += (t.hemi - cur.hemi) * a; cur.night += (t.night - cur.night) * a;
    (scene.background as THREE.Color).copy(cur.sky); (scene.fog as THREE.Fog).color.copy(cur.fog); mtnMat.color.copy(cur.mtn);
    sun.intensity = cur.sun; hemi.intensity = cur.hemi; bulbM.emissiveIntensity = cur.night * 3; tailM.emissiveIntensity = 1.5 + cur.night * 1.5;
  }

  // audio
  if (ac && eng) {
    const gear = Math.min(5, Math.floor(p.v / 12)), rpm = (p.v - gear * 12) / 12;
    eng.frequency.setTargetAtTime(60 + rpm * 120 + gear * 18, ac.currentTime, 0.05);
    engG.gain.setTargetAtTime(state === 'play' ? 0.09 + (gas ? 0.05 : 0) : 0, ac.currentTime, 0.1);
  }
  // HUD
  $('score').textContent = String(Math.floor(p.score)); $('dist').textContent = String(Math.floor(p.dist)); $('lvl').textContent = String(level);
  $('kmh').textContent = String(Math.round(p.v * 3.6)); $('spdbar').style.width = (p.v / (vmax + 4)) * 100 + '%';
  $('hpbar').style.width = clamp(p.hp, 0, 100) + '%';
  let rv: E | undefined; for (const e of ents) if (e.kind === 'rival' && e.on && !e.dead && Math.abs(e.z - p.z) < 25 && (!rv || Math.abs(e.z - p.z) < Math.abs(rv.z - p.z))) rv = e;
  $('riv').style.opacity = rv ? '1' : '0'; if (rv) $('rivbar').style.width = clamp((rv.hp / (40 + level * 8)) * 100, 0, 100) + '%';
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').style.opacity = '0';
}
function gameOver() {
  state = 'over'; stopMusic(); sfx.gameover();
  let best = 0; try { best = Number(localStorage.getItem('hr-best') || 0); if (p.score > best) { best = Math.floor(p.score); localStorage.setItem('hr-best', String(best)); } } catch { best = Math.max(best, Math.floor(p.score)); }
  $('fscore').textContent = String(Math.floor(p.score)); $('fdist').textContent = String(Math.floor(p.dist)); $('fko').textContent = String(kos); $('best').textContent = String(best);
  $('over').classList.add('on');
}

// ---------- boot ----------
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
reset(); camera.position.set(0, 3.1, 8); state = 'menu';
let last = performance.now();
renderer.setAnimationLoop((t) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; if (!paused) update(dt); renderer.render(scene, camera); });
(window as any).__game = { p, ents, get ac() { return ac; }, get music() { return musicOn; }, get joy() { return joy; }, get joyY() { return joyY; }, get paused() { return paused; }, get muted() { return muted; }, get state() { return state; }, start };
