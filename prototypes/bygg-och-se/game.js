// Flygplatschefen – "Bygg och se" (prototyp 2). Slängkod för att testa kärnan, se README.md.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ================================================================ inställningar
const CELL = 12, COLS = 26, ROWS = 14;
const RW_ROW = 1, RW_C0 = 2, RW_C1 = 23, RW_N = RW_C1 - RW_C0 + 1;   // banan, index 0 = östra änden (där planen sätter ner)
const TERM_ROW = 13, TERM_C0 = 5, TERM_C1 = 20, GATE_ROW = 12;
const COST = { taxi: 30, road: 10, gate: 350, biggate: 600, depot: 250 };
const CFG = {
  startMoney: 6000,
  taxiSpeed: 9, truckSpeed: 11,
  fuelTime: 5, boardTime: 9,
  minRoll: { s: 6, b: 9 },        // rutor efter sättning innan planet kan svänga av
  takeoffRoll: { s: 7, b: 11 },   // rutor bana som krävs framför planet vid start
  divertAfter: 75,
  schedTurn: 100,                 // sek från ankomst till planerad avgång
  grace: 15,
  pay: { s: 250, b: 550 },
  latePerSec: 4,
  trucksPerDepot: 2,
};
const AIRLINES = [
  { code: 'NF', color: 0x2f6fd6 }, { code: 'FA', color: 0xd8443a },
  { code: 'SG', color: 0x1f9e74 }, { code: 'BL', color: 0xe0a326 },
];

// ================================================================ grund
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x232a40, 300, 950);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 3500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = 1.35;
controls.minDistance = 40;
controls.maxDistance = 650;

function fitCamera() {
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  const portrait = camera.aspect < 0.9;
  controls.target.set(0, 0, portrait ? 4 : -2);
  const dir = portrait ? new THREE.Vector3(0.0, 0.85, -0.53) : new THREE.Vector3(0.05, 0.74, -0.67);
  const dist = THREE.MathUtils.clamp((portrait ? 150 : 200) / Math.tan(hfov / 2), 150, 600);
  camera.position.copy(controls.target).addScaledVector(dir.normalize(), dist);
}
fitCamera();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); fitCamera();
});

// ================================================================ rutnät
const X0 = -COLS * CELL / 2, Z0 = -ROWS * CELL / 2;
const key = (c, r) => r * COLS + c;
const kc = k => k % COLS, kr = k => Math.floor(k / COLS);
const cxw = c => X0 + (c + 0.5) * CELL, czw = r => Z0 + (r + 0.5) * CELL;
const cellPos = k => new THREE.Vector3(cxw(kc(k)), 0, czw(kr(k)));
const inGrid = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
const rwIdx = c => RW_C1 - c;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function nbrs(k) {
  const c = kc(k), r = kr(k), out = [];
  for (const [dc, dr] of DIRS) if (inGrid(c + dc, r + dr)) out.push(key(c + dc, r + dr));
  return out;
}

const G = Array.from({ length: COLS * ROWS }, () => ({ type: null, ref: null }));
for (let c = 0; c < COLS; c++) G[key(c, RW_ROW)].type = (c >= RW_C0 && c <= RW_C1) ? 'runway' : 'blocked';
for (let c = TERM_C0; c <= TERM_C1; c++) G[key(c, TERM_ROW)].type = 'terminal';
const occ = new Array(COLS * ROWS).fill(null);   // vilket plan som håller rutan
let netV = 0;

const isGate = t => t === 'gate' || t === 'biggate';
const rwAdj = k => { const r = kr(k), c = kc(k); return (r === RW_ROW - 1 || r === RW_ROW + 1) && c >= RW_C0 && c <= RW_C1; };

// BFS från en eller flera källor. canEnter(k) avgör vilka rutor som får passeras.
function bfs(sources, canEnter) {
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  const q = [];
  for (const s of sources) { prev[s] = s; q.push(s); }
  for (let i = 0; i < q.length; i++) {
    for (const n of nbrs(q[i])) if (prev[n] === -1 && canEnter(n)) { prev[n] = q[i]; q.push(n); }
  }
  return prev;
}
// gå från "from" mot källan; returnerar rutorna efter "from"
function walk(prev, from) {
  if (prev[from] === -1) return null;
  const out = []; let k = from, guard = 0;
  while (prev[k] !== k && guard++ < 999) { k = prev[k]; out.push(k); }
  return out;
}
const planePass = (from, self) => k => k === from || (G[k].type === 'taxi' && (!self || !occ[k] || occ[k] === self));
const truckPass = (from, avoid) => k => k === from || ((G[k].type === 'taxi' || G[k].type === 'road') && (!avoid || !occ[k]));

// ================================================================ texturer & ljus
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTexture();
function noiseTexture(base, spread, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    img.data[i] = base[0] + n; img.data[i + 1] = base[1] + n; img.data[i + 2] = base[2] + n; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function windowTexture(cols) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 64);
  const w = 1024 / cols;
  for (let i = 0; i < cols; i++) {
    if (Math.random() > 0.85) continue;
    g.fillStyle = `rgba(255, ${200 + Math.random() * 40 | 0}, ${130 + Math.random() * 50 | 0}, ${0.6 + Math.random() * 0.4})`;
    g.fillRect(i * w + 2, 6, w - 4, 52);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function lightPoints(list, color, size, parent = scene) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flat(), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: GLOW, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  parent.add(p); return p;
}
function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size); return s;
}

scene.add(new THREE.HemisphereLight(0x7a8cc8, 0x2a2618, 1.9));
const moon = new THREE.DirectionalLight(0xb0c0ff, 1.6);
moon.position.set(-80, 160, -110);
moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -200, right: 200, top: 140, bottom: -140, near: 10, far: 500 });
moon.shadow.camera.updateProjectionMatrix(); moon.shadow.bias = -0.0005;
scene.add(moon);
const dusk = new THREE.DirectionalLight(0xff8a4a, 1.3); dusk.position.set(300, 30, 60); scene.add(dusk);

{ // himmel + stjärnor
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){
      float h = vP.y; vec3 top = vec3(0.03,0.05,0.13), mid = vec3(0.13,0.17,0.32), hor = vec3(0.88,0.45,0.24);
      float east = smoothstep(-0.2, 1.0, vP.x) * 0.9 + 0.1;
      vec3 c = mix(mid, top, smoothstep(0.05, 0.6, h));
      c = mix(mix(mid, hor, east), c, smoothstep(-0.02, 0.18, h));
      if (h < -0.02) c = vec3(0.07,0.08,0.12);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 16), mat));
  const pts = [];
  for (let i = 0; i < 500; i++) {
    const th = Math.random() * Math.PI * 2, y = 0.25 + Math.random() * 0.75, r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(th) * r * 1500, y * 1500, Math.sin(th) * r * 1500);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  const city = [];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, r = 600 + Math.random() * 300;
    city.push([Math.cos(a) * r, 0.5 + Math.random() * 3, Math.sin(a) * r]);
  }
  const cp = lightPoints(city, 0xffc58a, 3.2); cp.material.fog = false; cp.material.opacity = 0.7;
}

// ================================================================ statisk värld
const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });
function box(w, h, d, mat, x, y, z, { cast = false, receive = true, parent = scene } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
}
const mats = {
  asphalt: M(0x2c2e33, { roughness: 0.8 }), taxi: M(0x383b41, { roughness: 0.8 }), road: M(0x5c5f66, { roughness: 0.85 }),
  concrete: M(0x6a6d73, { map: noiseTexture([130, 130, 135], 16, 2) }), white: M(0xdfe2e7, { roughness: 0.6 }),
  yellow: M(0xe0b53c, { roughness: 0.6 }), steel: M(0x6b717b, { roughness: 0.6 }),
};
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3500, 3500), new THREE.MeshStandardMaterial({ map: noiseTexture([48, 66, 44], 24, 260), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL), new THREE.MeshStandardMaterial({ color: 0x55704c, roughness: 1, transparent: true, opacity: 0.35 }));
  zone.rotation.x = -Math.PI / 2; zone.position.y = 0.02; zone.receiveShadow = true; scene.add(zone);
}
// bana
const RW_X = (cxw(RW_C0) + cxw(RW_C1)) / 2, RW_Z = czw(RW_ROW), RW_LEN = RW_N * CELL;
box(RW_LEN + 8, 0.22, 10.5, mats.asphalt, RW_X, 0.11, RW_Z);
for (let x = RW_X - RW_LEN / 2 + 14; x <= RW_X + RW_LEN / 2 - 14; x += 11) box(5, 0.05, 0.45, mats.white, x, 0.24, RW_Z);
for (const e of [-1, 1]) for (let z = -4; z <= 4; z += 1.3) box(5, 0.05, 0.7, mats.white, RW_X + e * (RW_LEN / 2 - 2), 0.24, RW_Z + z);
{
  const edge = [];
  for (let x = RW_X - RW_LEN / 2 - 4; x <= RW_X + RW_LEN / 2 + 4; x += 7) edge.push([x, 0.5, RW_Z - 5.6], [x, 0.5, RW_Z + 5.6]);
  lightPoints(edge, 0xfff1c9, 2.6);
  const thr = [], end = [];
  for (let z = -5; z <= 5; z += 1.4) { thr.push([RW_X + RW_LEN / 2 + 4, 0.5, RW_Z + z]); end.push([RW_X - RW_LEN / 2 - 4, 0.5, RW_Z + z]); }
  lightPoints(thr, 0x4dff8a, 3); lightPoints(end, 0xff3b3b, 3);
  const appr = [];
  for (let x = RW_X + RW_LEN / 2 + 10; x <= RW_X + RW_LEN / 2 + 100; x += 6) appr.push([x, 0.6, RW_Z]);
  lightPoints(appr, 0xffffff, 2.4);
}
const rabbit = glowSprite(0xffffff, 9); scene.add(rabbit);
// terminal
const TERM_X = (cxw(TERM_C0) + cxw(TERM_C1)) / 2, TERM_W = (TERM_C1 - TERM_C0 + 1) * CELL, TERM_FRONT = czw(TERM_ROW) - 4;
box(TERM_W, 12, 16, M(0x3d424b, { roughness: 0.7 }), TERM_X, 6, TERM_FRONT + 8, { cast: true });
box(TERM_W + 2, 0.8, 18, M(0x2a2e35), TERM_X, 12.4, TERM_FRONT + 8, { cast: true });
{
  const win = new THREE.Mesh(new THREE.PlaneGeometry(TERM_W - 2, 6.5),
    new THREE.MeshStandardMaterial({ color: 0x111418, emissive: 0xffffff, emissiveMap: windowTexture(80), emissiveIntensity: 1.3, roughness: 0.3 }));
  win.position.set(TERM_X, 6.5, TERM_FRONT - 0.05); win.rotation.y = Math.PI; scene.add(win);
  const roofL = [];
  for (let x = TERM_X - TERM_W / 2 + 6; x <= TERM_X + TERM_W / 2; x += 16) roofL.push([x, 13.2, TERM_FRONT + 1]);
  lightPoints(roofL, 0xffe1b0, 6);
}
// torn, hangar, brandstation (dekor utanför rutnätet)
box(5, 32, 5, M(0x4c525c), X0 - 22, 16, czw(9), { cast: true });
{
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.5, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x0d1a1c, emissive: 0x4fd6c8, emissiveIntensity: 0.55, roughness: 0.2 }));
  cab.position.set(X0 - 22, 34.5, czw(9)); scene.add(cab);
  box(12, 0.8, 12, M(0x2a2e35), X0 - 22, 37.2, czw(9));
}
const towerBeacon = glowSprite(0xff2a2a, 6); towerBeacon.position.set(X0 - 22, 39, czw(9)); scene.add(towerBeacon);
box(30, 14, 24, M(0x5a6170, { roughness: 0.6 }), X0 + COLS * CELL + 24, 7, czw(6), { cast: true });
box(0.4, 11, 20, M(0x0d0f14), X0 + COLS * CELL + 8.8, 5.6, czw(6));
// rutnätslinjer (syns när man bygger)
const gridLines = (() => {
  const pts = [];
  for (let c = 0; c <= COLS; c++) pts.push(X0 + c * CELL, 0.3, Z0, X0 + c * CELL, 0.3, Z0 + ROWS * CELL);
  for (let r = 0; r <= ROWS; r++) pts.push(X0, 0.3, Z0 + r * CELL, X0 + COLS * CELL, 0.3, Z0 + r * CELL);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09 }));
  scene.add(l); return l;
})();
// tillåtna gate-rutor markeras svagt
const gateRowHint = box(TERM_W, 0.05, CELL, new THREE.MeshBasicMaterial({ color: 0x38d39f, transparent: true, opacity: 0.08, depthWrite: false }), TERM_X, 0.05, czw(GATE_ROW));

// ================================================================ byggt innehåll (ritas om vid ändring)
let built = new THREE.Group(); scene.add(built);
const geo = {
  tile: new THREE.BoxGeometry(CELL, 0.16, CELL),
  road: new THREE.BoxGeometry(CELL * 0.62, 0.14, CELL * 0.62),
  roadArm: new THREE.BoxGeometry(CELL * 0.62, 0.14, CELL / 2),
  line: new THREE.BoxGeometry(0.35, 0.04, CELL / 2),
  dash: new THREE.BoxGeometry(0.25, 0.04, CELL / 2 - 2),
};
const dummy = new THREE.Object3D();
const labelsEl = document.getElementById('labels');
let placeLabels = [];

function instanced(g, m, items, y) {
  const im = new THREE.InstancedMesh(g, m, Math.max(1, items.length));
  im.count = items.length; im.receiveShadow = true;
  items.forEach((it, i) => {
    dummy.position.set(it.x, y, it.z); dummy.rotation.set(0, it.ry || 0, 0); dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  });
  built.add(im); return im;
}

function rebuild() {
  scene.remove(built);
  built.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
  built = new THREE.Group(); scene.add(built);
  placeLabels.forEach(p => p.el.remove()); placeLabels = [];
  const taxi = [], roads = [], roadArms = [], lines = [], dashes = [], greens = [];
  const gnum = new Map();
  G.map((x, k) => isGate(x.type) ? k : -1).filter(k => k >= 0).sort((a, b) => kc(b) - kc(a)).forEach((k, i) => gnum.set(k, i + 1));
  for (let k = 0; k < G.length; k++) {
    const t = G[k].type; if (!t) continue;
    const p = cellPos(k);
    if (t === 'taxi') {
      taxi.push({ x: p.x, z: p.z }); greens.push([p.x, 0.45, p.z]);
      for (const n of nbrs(k)) {
        const nt = G[n].type;
        if (nt === 'taxi' || isGate(nt) || nt === 'runway') {
          const d = cellPos(n).sub(p).normalize();
          lines.push({ x: p.x + d.x * CELL / 4, z: p.z + d.z * CELL / 4, ry: d.x !== 0 ? Math.PI / 2 : 0 });
        }
      }
    } else if (t === 'road') {
      roads.push({ x: p.x, z: p.z });
      for (const n of nbrs(k)) {
        const nt = G[n].type;
        if (nt === 'road' || nt === 'taxi' || isGate(nt) || nt === 'depot') {
          const d = cellPos(n).sub(p).normalize();
          roadArms.push({ x: p.x + d.x * CELL / 4, z: p.z + d.z * CELL / 4, ry: d.x !== 0 ? Math.PI / 2 : 0 });
          dashes.push({ x: p.x + d.x * CELL / 4, z: p.z + d.z * CELL / 4, ry: d.x !== 0 ? Math.PI / 2 : 0 });
        }
      }
    } else if (isGate(t)) {
      const big = t === 'biggate'; const gateNo = gnum.get(k);
      const pad = box(CELL, 0.16, CELL, mats.concrete, p.x, 0.08, p.z, { parent: built });
      box(0.35, 0.05, CELL - 2, mats.yellow, p.x, 0.19, p.z - 1, { parent: built });
      box(4, 0.05, 0.35, mats.yellow, p.x, 0.19, p.z + 4.5, { parent: built });
      const bl = TERM_FRONT - (p.z + 1.5);
      box(big ? 3.2 : 2.4, 2.4, bl, mats.steel, p.x - (big ? 4 : 3), 4.2, p.z + 1.5 + bl / 2, { cast: true, parent: built });
      box(1.2, 4, 1.2, M(0x4b5059), p.x - (big ? 4 : 3), 2, p.z + 2.5, { parent: built });
      G[k].ref.no = gateNo;
      placeLabels.push(makePlaceLabel(`${big ? 'Storgate' : 'Gate'} ${gateNo}`, new THREE.Vector3(p.x + 3, 12, p.z + 4)));
      // bit taxibana-linje in i gaten
      for (const n of nbrs(k)) if (G[n].type === 'taxi') {
        const d = cellPos(n).sub(p).normalize();
        lines.push({ x: p.x + d.x * CELL / 4, z: p.z + d.z * CELL / 4, ry: d.x !== 0 ? Math.PI / 2 : 0 });
      }
    } else if (t === 'depot') {
      box(CELL, 0.14, CELL, mats.concrete, p.x, 0.07, p.z, { parent: built });
      box(5.5, 4.5, 4.5, M(0x8a4b2a, { roughness: 0.7 }), p.x + 2.5, 2.25, p.z + 3, { cast: true, parent: built });
      for (const dz of [-3, 1]) {
        const tk = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 5, 14), M(0xd0d4da, { roughness: 0.35, metalness: 0.5 }));
        tk.position.set(p.x - 3, 2.5, p.z + dz); tk.castShadow = true; built.add(tk);
      }
      lightPoints([[p.x + 2.5, 5.2, p.z + 0.6]], 0xffd9a0, 4, built);
      placeLabels.push(makePlaceLabel('⛽ Tankdepå', new THREE.Vector3(p.x, 9, p.z)));
    }
  }
  instanced(geo.tile, mats.taxi, taxi, 0.08);
  instanced(geo.road, mats.road, roads, 0.07);
  instanced(geo.roadArm, mats.road, roadArms, 0.07);
  instanced(geo.line, mats.yellow, lines, 0.19);
  instanced(geo.dash, mats.white, dashes, 0.17);
  if (greens.length) lightPoints(greens, 0x3dff8a, 1.8, built);
}
function makePlaceLabel(text, pos) {
  const el = document.createElement('div'); el.className = 'lbl place'; el.textContent = text;
  labelsEl.appendChild(el); return { el, pos };
}

// markörer vid banan som visar var avfarter och startplatser fungerar (bara när man bygger)
const rwMarks = [];
{
  const mk = (i, text, color) => {
    const x = cxw(RW_C1 - i);
    box(0.6, 2.2, 0.6, new THREE.MeshBasicMaterial({ color }), x, 1.1, RW_Z + 7);
    const el = document.createElement('div'); el.className = 'lbl place'; el.textContent = text; el.style.color = '#' + color.toString(16).padStart(6, '0');
    labelsEl.appendChild(el); rwMarks.push({ el, pos: new THREE.Vector3(x, 3, RW_Z + 7) });
  };
  mk(0, '🛬 Planen sätter ner här', 0xffffff);
  mk(CFG.minRoll.s, '↓ Första avfart', 0x38d39f);
  mk(RW_N - 1 - CFG.takeoffRoll.s, '↑ Sista startplats', 0x6aa8ff);
}

// ================================================================ modeller
function buildPlane(color, scale) {
  const g = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 2.6; g.add(body);
  const skin = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.4, metalness: 0.25 });
  const livery = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 });
  const add = (gm, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(gm, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; body.add(o); return o; };
  add(new THREE.CylinderGeometry(1.3, 1.3, 12, 18), skin, 0, 0, 0, 0, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(1.3, 18, 12), skin, 6, 0, 0).scale.set(2.1, 1, 1);
  add(new THREE.ConeGeometry(1.3, 5, 18), skin, -8.5, 0.25, 0, 0, 0, Math.PI / 2);
  add(new THREE.BoxGeometry(12.5, 0.32, 2.64), livery, 0, -0.55, 0);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(3.4, 0.28, 8), skin, -2.0, -0.55, s * 4.6, 0, -s * 0.38, 0);
    add(new THREE.CylinderGeometry(0.62, 0.55, 2.8, 14), livery, 0.4, -1.35, s * 3.6, 0, 0, Math.PI / 2);
    add(new THREE.BoxGeometry(1.6, 0.18, 3.2), skin, -9.2, 0.45, s * 1.8, 0, -s * 0.4, 0);
  }
  const fin = new THREE.Shape();
  fin.moveTo(-6.6, 0); fin.lineTo(-10.6, 0); fin.lineTo(-11.0, 4.3); fin.lineTo(-9.4, 4.3); fin.closePath();
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.3, bevelEnabled: false }); fg.translate(0, 0, -0.15);
  add(fg, livery, 0, 0.9, 0);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(9, 0.22, 0.05), winMat, 0.6, 0.45, s * 1.29).castShadow = false;
  const L = {
    red: glowSprite(0xff3030, 2.2), green: glowSprite(0x30ff70, 2.2), beacon: glowSprite(0xff2020, 3.2),
    strobe: glowSprite(0xffffff, 3.5), landing: glowSprite(0xfff4dd, 9),
  };
  L.red.position.set(-3.6, -0.3, -8.3); L.green.position.set(-3.6, -0.3, 8.3);
  L.beacon.position.set(-1, 1.5, 0); L.strobe.position.set(-11, 0.4, 0); L.landing.position.set(8.8, -0.4, 0);
  Object.values(L).forEach(l => body.add(l));
  g.scale.setScalar(scale); g.rotation.order = 'YZX';
  scene.add(g);
  return { group: g, lights: L };
}
function buildTruck() {
  const g = new THREE.Group();
  const add = (gm, m, x, y, z) => { const o = new THREE.Mesh(gm, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(1.8, 1.8, 2.2), M(0xf0f0f0, { roughness: 0.5 }), 2.3, 1.3, 0);
  add(new THREE.CylinderGeometry(1.0, 1.0, 4.4, 14), M(0xd9d9d9, { roughness: 0.35, metalness: 0.5 }), -0.9, 1.5, 0).rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(6.2, 0.4, 2.2), M(0x2a2a2a), 0.3, 0.45, 0);
  const beacon = glowSprite(0xffa020, 2.6); beacon.position.set(2.3, 2.5, 0); g.add(beacon);
  g.scale.setScalar(0.8); scene.add(g);
  return { group: g, beacon };
}

// ================================================================ spelläge
const S = {
  phase: 'INTRO', day: 1, money: CFG.startMoney, t: 0, speed: 1,
  planes: [], depots: [], gates: [],
  schedule: [], spawnIdx: 0, dayDeps: 0, dayOnTime: 0, dayDiverts: 0, dayEarned: 0, dayFlights: 0,
  totalDeps: 0, mods: { extraFlights: 0, bigShare: 0, payMult: 1, rush: false, boardMult: 1, taxiDiscount: 1 },
  rw: null, landCheck: 0, fuelCheck: 0, toldNoGate: 0, epoch: 0,
};
let flightNo = 100 + Math.floor(Math.random() * 300);

const cost = tool => tool === 'taxi' ? Math.round(COST.taxi * S.mods.taxiDiscount) : COST[tool];

// ================================================================ bygga
function canBuild(tool, k) {
  const c = kc(k), r = kr(k), t = G[k].type;
  if (tool === 'erase') {
    if (!t || t === 'runway' || t === 'blocked' || t === 'terminal') return 'Inget att riva';
    if (occ[k]) return 'Ett plan står här';
    if (isGate(t) && G[k].ref.res) return 'Gaten används';
    if (t === 'depot' && G[k].ref.trucks.some(tr => tr.state !== 'IDLE')) return 'Tankbilarna är ute';
    if (S.planes.some(p => p.truckAt === k) || S.depots.some(d => d.trucks.some(tr => tr.cell === k && tr.state !== 'IDLE'))) return 'Ett fordon är här';
    return null;
  }
  if (t) return t === 'runway' ? 'Det här är banan' : t === 'terminal' ? 'Terminalen' : t === 'blocked' ? 'Gräs vid banänden' : 'Upptaget';
  if ((tool === 'gate' || tool === 'biggate') && (r !== GATE_ROW || c < TERM_C0 || c > TERM_C1)) return 'Gater bara precis framför terminalen';
  if (S.money < cost(tool)) return 'För lite pengar';
  return null;
}
function build(tool, k) {
  if (canBuild(tool, k)) return false;
  const t = G[k].type;
  if (tool === 'erase') {
    const refund = refundFor(k);
    if (isGate(t)) S.gates.splice(S.gates.indexOf(G[k].ref), 1);
    if (t === 'depot') { const d = G[k].ref; d.trucks.forEach(tr => scene.remove(tr.group)); S.depots.splice(S.depots.indexOf(d), 1); }
    G[k].type = null; G[k].ref = null; G[k].paid = 0; S.money += refund;
  } else {
    S.money -= cost(tool);
    G[k].type = tool; G[k].paid = cost(tool); G[k].epoch = S.epoch;
    if (isGate(tool)) { G[k].ref = { key: k, big: tool === 'biggate', res: null, no: 0 }; S.gates.push(G[k].ref); }
    if (tool === 'depot') {
      const d = { key: k, trucks: [] }; G[k].ref = d; S.depots.push(d);
      for (let i = 0; i < CFG.trucksPerDepot + (S.mods.extraTrucks || 0); i++) addTruck(d, i);
    }
  }
  netV++; rebuild(); updateChecklist();
  return true;
}
// allt du bygger innan du öppnar kan rivas gratis; efter det får du halva tillbaka
function refundFor(k) {
  const c = G[k]; if (!c.paid) return 0;
  return S.phase !== 'RUN' && c.epoch === S.epoch ? c.paid : Math.round(c.paid * 0.5);
}
function addTruck(d, i) {
  const tr = { ...buildTruck(), depot: d, cell: d.key, pos: cellPos(d.key).add(new THREE.Vector3(-3 + i * 2.2, 0, -3 + i * 2.2)), heading: Math.PI / 2, path: [], state: 'IDLE', plane: null, block: 0, kind: 'truck' };
  tr.home = tr.pos.clone();
  d.trucks.push(tr); return tr;
}

// ================================================================ checklista
function analyse() {
  const exits = [], holds = [];
  for (let c = RW_C0; c <= RW_C1; c++) for (const r of [RW_ROW - 1, RW_ROW + 1]) {
    const k = key(c, r); if (G[k].type !== 'taxi') continue;
    const i = rwIdx(c);
    if (i >= CFG.minRoll.s) exits.push(k);
    if (i <= RW_N - 1 - CFG.takeoffRoll.s) holds.push(k);
  }
  let gateIn = false, gateOut = false, fuel = false;
  for (const g of S.gates) {
    const prev = bfs([g.key], planePass(-1));
    if (exits.some(k => prev[k] !== -1)) gateIn = true;
    if (holds.some(k => prev[k] !== -1)) gateOut = true;
    if (S.depots.some(d => bfs([g.key], truckPass(d.key))[d.key] !== -1)) fuel = true;
  }
  const touch = S.planes.length || G.some((x, k) => x.type === 'taxi' && rwAdj(k));
  return { touch, exits: exits.length > 0, gates: S.gates.length > 0, gateIn, gateOut, fuel };
}
function updateChecklist() {
  const el = document.getElementById('check');
  const a = analyse();
  const row = (ok, txt) => `<div class="${ok ? 'y' : 'n'}">${ok ? '✓' : '○'} ${txt}</div>`;
  const allOk = a.exits && a.gates && a.gateIn && a.gateOut && a.fuel;
  el.innerHTML = `<h3>${allOk ? 'Redo att öppna' : 'Att bygga'}</h3>`
    + row(a.exits, 'Taxibana som når banan en bit in (avfart)')
    + row(a.gates, 'Minst en gate framför terminalen')
    + row(a.gateIn, 'Väg från avfarten till en gate')
    + row(a.gateOut, 'Väg från gate till banan där det finns gott om bana kvar (start)')
    + row(a.fuel, 'Tankdepå med väg till gaterna');
  el.classList.toggle('hidden', (S.phase !== 'BUILD' || innerWidth < 760) && allOk);
  rwMarks.forEach(m => m.el.classList.toggle('hidden', S.phase === 'RUN'));
}

// ================================================================ dagens trafik
function planDay() {
  const n = 5 + (S.day - 1) * 3 + S.mods.extraFlights;
  const win = 110 + (S.day - 1) * 25;
  const times = [];
  if (S.mods.rush) {
    const waves = Math.max(2, Math.round(n / 4));
    for (let i = 0; i < n; i++) { const w = i % waves; times.push(8 + w * (win / waves) + Math.random() * 14); }
  } else for (let i = 0; i < n; i++) times.push(4 + Math.random() * win);
  times.sort((a, b) => a - b);
  S.schedule = times.map(t => ({ t, big: Math.random() < S.mods.bigShare }));
  S.spawnIdx = 0; S.dayFlights = n; S.dayDeps = 0; S.dayOnTime = 0; S.dayDiverts = 0; S.dayEarned = 0; S.t = 0;
}

const HOLD_C = new THREE.Vector3(cxw(RW_C1) + 200, 0, RW_Z + 80);
function spawnPlane(big) {
  const al = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
  const p = {
    id: Math.random(), cs: `${al.code} ${flightNo++}`, big, size: big ? 'b' : 's',
    ...buildPlane(al.color, big ? 0.8 : 0.58),
    pos: new THREE.Vector3(), heading: Math.PI, pitch: 0, roll: 0, dir: null,
    state: 'AIR_HOLD', wait: 0, block: 0, spawnT: S.t, sched: S.t + CFG.schedTurn + (big ? 15 : 0),
    holdA: Math.random() * Math.PI * 2, holdAlt: 40, cell: -1, path: [], moving: false, netV: -1,
    gate: null, exitK: -1, fuelDone: false, board: 0, kind: 'plane',
  };
  p.pos.set(HOLD_C.x + Math.cos(p.holdA) * 40, p.holdAlt, HOLD_C.z + Math.sin(p.holdA) * 40);
  const el = document.createElement('div'); el.className = 'lbl hidden'; labelsEl.appendChild(el); p.label = el;
  S.planes.push(p);
}
function removePlane(p) {
  scene.remove(p.group); p.label.remove();
  S.gates.forEach(g => { if (g.res === p) g.res = null; });
  if (S.rw === p) S.rw = null;
  S.planes.splice(S.planes.indexOf(p), 1);
  for (let k = 0; k < occ.length; k++) if (occ[k] === p) occ[k] = null;
}

// ================================================================ rörelse
function moveTo(e, target, speed, dt) {
  const v = target.clone().sub(e.pos); const len = v.length();
  if (len < 1e-4) return true;
  v.normalize(); e.dir = v;
  if (len <= speed * dt) { e.pos.copy(target); return true; }
  e.pos.addScaledVector(v, speed * dt); return false;
}
function lerpAngle(a, b, k) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, k);
}
function steer(e, dt, rate, reverse = false) {
  if (!e.dir || Math.hypot(e.dir.x, e.dir.z) < 0.05) return 0;
  let tgt = Math.atan2(-e.dir.z, e.dir.x); if (reverse) tgt += Math.PI;
  const b = e.heading; e.heading = lerpAngle(e.heading, tgt, rate * dt);
  return (e.heading - b) / Math.max(dt, 1e-4);
}

// Taxa längs p.path (rutnycklar). Håller ruta + nästa ruta. Returnerar true när framme.
function taxiStep(p, dt, routeFn) {
  if (!p.moving) {
    if (p.netV !== netV) { const np = routeFn(false); p.noPath = !np; if (np) p.path = np; p.netV = netV; }
    if (!p.path.length) return true;
    const nk = p.path[0];
    const passable = G[nk].type === 'taxi' || (isGate(G[nk].type) && p.gate && p.gate.key === nk);
    if (!passable) { p.netV = -1; p.block += dt; return false; }
    if (occ[nk] && occ[nk] !== p) {
      p.block += dt;
      if (p.block > 3 && routeFn && (p.reT = (p.reT || 0) + dt) > 2) { p.reT = 0; const np = routeFn(true); if (np && np[0] !== nk) p.path = np; }
      return false;
    }
    occ[nk] = p; p.moving = true; p.to = nk; p.noPath = false;
  }
  const done = moveTo(p, cellPos(p.to), CFG.taxiSpeed, dt);
  steer(p, dt, p.reverse ? 4 : 5, p.reverse);
  if (done) {
    if (p.cell >= 0 && occ[p.cell] === p) occ[p.cell] = null;
    if (p.cell >= 0 && isGate(G[p.cell].type) && G[p.cell].ref && G[p.cell].ref.res === p) G[p.cell].ref.res = null;
    p.cell = p.to; p.path.shift(); p.moving = false; p.block = 0; p.reverse = false;
  }
  return false;
}
function routeToGate(p) {
  return avoid => {
    const prev = bfs([p.gate.key], planePass(p.cell, avoid ? p : null));
    return walk(prev, p.cell);
  };
}
function holdCandidates(size) {
  const out = [];
  for (let c = RW_C0; c <= RW_C1; c++) for (const r of [RW_ROW - 1, RW_ROW + 1]) {
    const k = key(c, r);
    if (G[k].type === 'taxi' && rwIdx(c) <= RW_N - 1 - CFG.takeoffRoll[size]) out.push(k);
  }
  return out;
}
function routeToHold(p) {
  return avoid => {
    const hs = holdCandidates(p.size).filter(k => !occ[k] || occ[k] === p);
    if (!hs.length) return null;
    const prev = bfs(hs, planePass(p.cell, avoid ? p : null));
    return walk(prev, p.cell);
  };
}

// ================================================================ banan
function planLanding(p) {
  let best = null;
  for (const g of S.gates) {
    if (g.res || (p.big && !g.big)) continue;
    const prev = bfs([g.key], planePass(-1));
    for (let i = CFG.minRoll[p.size]; i < RW_N; i++) {
      const c = RW_C1 - i;
      for (const r of [RW_ROW - 1, RW_ROW + 1]) {
        const k = key(c, r);
        if (G[k].type !== 'taxi' || prev[k] === -1) continue;
        const len = walk(prev, k).length;
        const score = i * 100 + len + (g.big && !p.big ? 50 : 0);
        if (!best || score < best.score) best = { gate: g, exitI: i, score };
      }
    }
  }
  return best;
}
function updateRunway(dt) {
  if (S.rw) return;
  S.landCheck -= dt;
  const deps = S.planes.filter(p => p.state === 'HOLD_SHORT').sort((a, b) => b.wait - a.wait);
  const arrs = S.planes.filter(p => p.state === 'AIR_HOLD').sort((a, b) => b.wait - a.wait);
  let arr = null, plan = null;
  if (arrs.length && S.landCheck <= 0) {
    S.landCheck = 0.4;
    for (const a of arrs) { plan = planLanding(a); if (plan) { arr = a; break; } }
    if (!arr && arrs[0].wait > 12 && S.t - S.toldNoGate > 20) { S.toldNoGate = S.t; toast(`${arrs[0].cs} cirklar – ingen ledig gate eller väg från banan.`, 'warn'); }
  }
  const dep = deps[0];
  if (dep && (!arr || dep.wait + 8 >= arr.wait)) startTakeoff(dep);
  else if (arr) startLanding(arr, plan);
}
function startLanding(p, plan) {
  S.rw = p; p.gate = plan.gate; plan.gate.res = p; p.exitI = plan.exitI;
  p.state = 'FINAL'; p.v = 34;
  p.air = [new THREE.Vector3(cxw(RW_C1) + 260, 34, RW_Z), new THREE.Vector3(cxw(RW_C1) + 6, 0, RW_Z)];
}
function startTakeoff(p) {
  S.rw = p; p.state = 'LINEUP'; p.rwK = key(kc(p.cell), RW_ROW);
}

// ================================================================ planens logik
const REASONS = { AIR_HOLD: 'Väntar på landning' };
function updatePlane(p, dt) {
  let airborne = false, turn = 0, pitchT = 0;
  p.problem = null;
  switch (p.state) {
    case 'AIR_HOLD': {
      airborne = true;
      p.holdA += dt * 0.28;
      const n = S.planes.filter(q => q.state === 'AIR_HOLD').indexOf(p);
      p.holdAlt += ((40 + n * 9) - p.holdAlt) * Math.min(1, dt);
      const np = new THREE.Vector3(HOLD_C.x + Math.cos(p.holdA) * 40, p.holdAlt, HOLD_C.z + Math.sin(p.holdA) * 40);
      p.dir = np.clone().sub(p.pos).normalize(); p.pos.copy(np); turn = steer(p, dt, 4);
      p.wait += dt;
      if (p.wait > 20) p.problem = ['prob', `Cirklar ${Math.floor(p.wait)} s`];
      if (p.wait > CFG.divertAfter) {
        p.state = 'DIVERT'; p.air = [new THREE.Vector3(HOLD_C.x + 500, 90, HOLD_C.z + 400)]; p.v = 40;
        S.dayDiverts++; toast(`${p.cs} gav upp och flög till en annan flygplats!`, 'bad');
      }
      break;
    }
    case 'DIVERT': case 'GONE':
      airborne = true;
      if (moveTo(p, p.air[0], p.v, dt)) { removePlane(p); return; }
      turn = steer(p, dt, 2);
      break;
    case 'FINAL': {
      airborne = true;
      if (moveTo(p, p.air[0], p.v, dt)) { p.air.shift(); if (!p.air.length) { p.state = 'ROLLOUT'; p.v = 30; p.pos.y = 0; } }
      turn = steer(p, dt, 2.2); pitchT = 0.06;
      break;
    }
    case 'ROLLOUT': {
      const minX = cxw(RW_C1 - CFG.minRoll[p.size]);
      const a = (30 * 30 - 8 * 8) / (2 * (p.pos.x - minX + 1e-3) + 1);
      p.v = Math.max(8, p.v - Math.max(2, a) * dt);
      const exitX = cxw(RW_C1 - p.exitI);
      const nx = p.pos.x - p.v * dt;
      if (nx <= exitX) {
        p.pos.x = exitX;
        // välj avfart på denna rad (helst mot gaten)
        const c = RW_C1 - p.exitI;
        const prev = bfs([p.gate.key], planePass(-1));
        const opts = [RW_ROW + 1, RW_ROW - 1].map(r => key(c, r)).filter(k => G[k].type === 'taxi' && prev[k] !== -1);
        const free = opts.find(k => !occ[k]);
        if (free !== undefined) { occ[free] = p; p.to = free; p.state = 'EXITING'; p.v = 8; }
        else if (!opts.length || (p.exitWait = (p.exitWait || 0) + dt) > 2) {
          p.exitWait = 0;
          // avfarten försvann – leta längre fram
          const nxt = findNextExit(p);
          if (nxt != null) p.exitI = nxt; else { p.v = 0; p.problem = ['bad', 'Kommer inte av banan!']; }
        } else { p.v = 0; p.wait += dt; p.problem = ['bad', 'Blockerar banan – avfarten upptagen']; }
      } else p.pos.x = nx;
      p.dir = new THREE.Vector3(-1, 0, 0); steer(p, dt, 3);
      break;
    }
    case 'EXITING': {
      if (moveTo(p, cellPos(p.to), 8, dt)) {
        p.cell = p.to; S.rw = null; p.state = 'TAXI_IN'; p.path = []; p.netV = -1; p.wait = 0;
      }
      steer(p, dt, 4);
      break;
    }
    case 'TAXI_IN': {
      if (taxiStep(p, dt, routeToGate(p))) {
        if (p.cell === p.gate.key) { p.state = 'AT_GATE'; p.board = 0; p.fuelDone = false; p.wait = 0; }
        else { p.netV = -1; }
      }
      if (p.noPath) p.problem = ['bad', 'Hittar ingen väg till gaten'];
      else if (p.block > 6) p.problem = ['bad', 'Trafikstopp!'];
      break;
    }
    case 'AT_GATE': {
      p.board = Math.min(CFG.boardTime, p.board + dt * S.mods.boardMult);
      p.wait += dt;
      if (!p.fuelDone && !p.truck && p.wait > 6) p.problem = ['prob', p.noTruck ? 'Ingen tankbil når hit!' : 'Väntar på tankbil'];
      if (p.board >= CFG.boardTime && p.fuelDone) { p.state = 'TAXI_OUT'; p.path = []; p.netV = -1; p.wait = 0; p.reverse = true; p.pushback = true; }
      break;
    }
    case 'TAXI_OUT': {
      if (taxiStep(p, dt, routeToHold(p))) {
        if (rwAdj(p.cell) && holdCandidates(p.size).includes(p.cell)) { p.state = 'HOLD_SHORT'; p.wait = 0; }
        else p.netV = -1;
      }
      if (p.pushback && p.cell !== p.gate.key) p.pushback = false;
      if (!p.pushback) p.reverse = false;
      if (p.noPath || (!p.path.length && !p.moving && p.state === 'TAXI_OUT')) p.problem = ['bad', 'Ingen väg till banan!'];
      else if (p.block > 6) p.problem = ['bad', 'Trafikstopp!'];
      break;
    }
    case 'HOLD_SHORT': p.wait += dt; if (p.wait > 15) p.problem = ['prob', 'Väntar på banan']; break;
    case 'LINEUP': {
      const tgt = cellPos(p.rwK);
      if (moveTo(p, tgt, 5, dt)) {
        if (occ[p.cell] === p) occ[p.cell] = null;
        p.dir = new THREE.Vector3(-1, 0, 0);
        if (Math.abs(lerpAngle(p.heading, Math.PI, 1) - p.heading) < 0.05 || p.lineT > 1.2) { p.state = 'TAKEOFF'; p.v = 5; p.startX = p.pos.x; }
        p.lineT = (p.lineT || 0) + dt;
      }
      steer(p, dt, 3);
      break;
    }
    case 'TAKEOFF': {
      p.v = Math.min(42, p.v + 7 * dt); p.pos.x -= p.v * dt;
      const rolled = (p.startX - p.pos.x) / CELL;
      if (rolled > CFG.takeoffRoll[p.size] * 0.85) { airborne = true; p.pos.y += p.v * 0.22 * dt; pitchT = 0.18; }
      if (S.rw === p && p.pos.y > 5) { S.rw = null; if (!p.counted) { p.counted = true; departed(p); } }
      p.dir = new THREE.Vector3(-1, 0, 0); steer(p, dt, 3);
      if (p.pos.x < X0 - 300) { removePlane(p); return; }
      break;
    }
  }
  if (p.state === 'FINAL' && p.dir) pitchT += Math.atan(p.dir.y) * 0.5;
  p.pitch += (pitchT - p.pitch) * Math.min(1, dt * 3);
  const rollT = airborne ? THREE.MathUtils.clamp(-turn * 0.8, -0.6, 0.6) : 0;
  p.roll += (rollT - p.roll) * Math.min(1, dt * 3);
  p.airborne = airborne;
  p.group.position.copy(p.pos); p.group.rotation.set(p.roll, p.heading, p.pitch);
}
function findNextExit(p) {
  const prev = bfs([p.gate.key], planePass(-1));
  for (let i = p.exitI + 1; i < RW_N; i++) for (const r of [RW_ROW - 1, RW_ROW + 1]) {
    const k = key(RW_C1 - i, r); if (G[k].type === 'taxi' && prev[k] !== -1) return i;
  }
  return null;
}
function departed(p) {
  const late = Math.max(0, S.t - p.sched - CFG.grace);
  const base = CFG.pay[p.size] * S.mods.payMult;
  const pay = Math.round(Math.max(base * 0.4, base - late * CFG.latePerSec));
  S.money += pay; S.dayEarned += pay; S.dayDeps++; S.totalDeps++;
  if (late <= 0) S.dayOnTime++;
  toast(`✈ ${p.cs} lyfte ${late <= 0 ? 'i tid' : `${Math.round(late)} s sent`} · +${pay} kr`, late <= 0 ? 'good' : 'warn');
}

// ================================================================ tankbilar
function updateFuel(dt) {
  S.fuelCheck -= dt;
  if (S.fuelCheck <= 0) {
    S.fuelCheck = 0.5;
    const needs = S.planes.filter(p => p.state === 'AT_GATE' && !p.fuelDone && !p.truck);
    for (const p of needs) {
      let best = null;
      for (const d of S.depots) {
        const idle = d.trucks.find(t => t.state === 'IDLE'); if (!idle) continue;
        const prev = bfs([p.gate.key], truckPass(d.key));
        const path = walk(prev, d.key);
        if (path && (!best || path.length < best.path.length)) best = { tr: idle, path };
      }
      const anyReach = S.depots.some(d => bfs([p.gate.key], truckPass(d.key))[d.key] !== -1);
      p.noTruck = !anyReach;
      if (best) { p.truck = best.tr; Object.assign(best.tr, { state: 'OUT', plane: p, path: best.path, cell: best.tr.depot.key, moving: false, block: 0, nv: netV }); }
    }
  }
  for (const d of S.depots) for (const tr of d.trucks) updateTruck(tr, dt);
}
function truckRoute(tr) {
  const goal = tr.state === 'OUT' ? tr.plane.gate.key : tr.depot.key;
  return avoid => walk(bfs([goal], truckPass(tr.cell, avoid)), tr.cell);
}
function updateTruck(tr, dt) {
  if (tr.state === 'OUT' || tr.state === 'BACK') {
    if (!tr.moving) {
      if (tr.state === 'OUT' && (!S.planes.includes(tr.plane) || tr.plane.state !== 'AT_GATE')) { tr.state = 'BACK'; tr.plane && (tr.plane.truck = null); tr.nv = -1; }
      if (tr.nv !== netV) { const np = truckRoute(tr)(false); if (np) tr.path = np; tr.nv = netV; }
      if (!tr.path.length) {
        if (tr.state === 'OUT') { tr.state = 'FUEL'; tr.timer = CFG.fuelTime; }
        else { tr.state = 'HOMING'; }
      } else {
        const nk = tr.path[0];
        const target = tr.state === 'OUT' ? tr.plane.gate.key : tr.depot.key;
        if (occ[nk] && nk !== target) {
          tr.block += dt;
          if (tr.block > 4) { const np = truckRoute(tr)(true); if (np && np[0] !== nk) tr.path = np; tr.block = 2; }
        } else {
          tr.moving = true; tr.to = nk; tr.block = 0;
          const a = cellPos(tr.cell), b = cellPos(nk), d = b.clone().sub(a).normalize();
          tr.goalPos = b.add(new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(3.2));
        }
      }
    }
    if (tr.moving) {
      if (moveTo(tr, tr.goalPos, CFG.truckSpeed, dt)) { tr.cell = tr.to; tr.path.shift(); tr.moving = false; }
    }
  } else if (tr.state === 'FUEL') {
    tr.timer -= dt;
    const pl = tr.plane;
    if (!S.planes.includes(pl)) { tr.state = 'BACK'; tr.nv = -1; }
    else if (tr.timer <= 0) { pl.fuelDone = true; pl.truck = null; tr.plane = null; tr.state = 'BACK'; tr.nv = -1; tr.path = []; }
  } else if (tr.state === 'HOMING') {
    if (moveTo(tr, tr.home, 6, dt)) { tr.state = 'IDLE'; tr.dir = new THREE.Vector3(0, 0, -1); }
  }
  steer(tr, dt, 6);
  tr.group.position.copy(tr.pos); tr.group.rotation.y = tr.heading;
  tr.beacon.material.opacity = tr.state === 'IDLE' ? 0.2 : (Math.sin(performance.now() / 70) > 0 ? 1 : 0.15);
}
// ================================================================ UI
const $ = id => document.getElementById(id);
const toastsEl = $('toasts');
function toast(text, kind = '') {
  const d = document.createElement('div'); d.className = `toast panel ${kind}`; d.textContent = text;
  toastsEl.prepend(d);
  while (toastsEl.children.length > 5) toastsEl.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 4500); setTimeout(() => d.remove(), 5200);
}
const fmtKr = n => `${Math.round(n).toLocaleString('sv-SE')} kr`;
document.querySelectorAll('[data-cost]').forEach(el => el.dataset.base = el.dataset.cost);
function refreshCosts() { document.querySelectorAll('[data-cost]').forEach(el => el.textContent = fmtKr(cost(el.dataset.base))); }
refreshCosts();

const v3 = new THREE.Vector3();
function screenPos(pos) {
  v3.copy(pos).project(camera);
  return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight, vis: v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 };
}
function updateUI() {
  $('day').textContent = `Dag ${S.day}`;
  $('phase').textContent = S.phase === 'RUN' ? 'Flygplatsen är öppen' : 'Bygg';
  $('money').textContent = fmtKr(S.money);
  $('deps').textContent = `${S.dayDeps}/${S.dayFlights || '–'}`;
  $('ontime').textContent = S.dayDeps ? `${Math.round(S.dayOnTime / S.dayDeps * 100)}%` : '–';
  for (const p of S.planes) {
    const show = !!p.problem;
    p.label.classList.toggle('hidden', !show);
    if (!show) continue;
    const html = `<b>${p.cs}</b> · ${p.problem[1]}`;
    if (p.label._h !== html) { p.label.innerHTML = html; p.label._h = html; }
    p.label.className = `lbl ${p.problem[0]}`;
    const sp = screenPos(v3.copy(p.pos).add(new THREE.Vector3(0, 9, 0)).clone());
    p.label.style.display = sp.vis ? '' : 'none';
    p.label.style.left = `${sp.x}px`; p.label.style.top = `${sp.y}px`;
  }
  for (const pl of [...placeLabels, ...rwMarks]) {
    if (pl.el.classList.contains('hidden')) continue;
    const sp = screenPos(pl.pos);
    pl.el.style.display = sp.vis ? '' : 'none';
    pl.el.style.left = `${sp.x}px`; pl.el.style.top = `${sp.y}px`;
  }
}

// ================================================================ verktyg & input
let tool = 'taxi';
function setTool(t) {
  tool = t;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  const look = t === 'look';
  controls.mouseButtons = { LEFT: look ? THREE.MOUSE.ROTATE : null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: look ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE };
  controls.touches = { ONE: look ? THREE.TOUCH.ROTATE : null, TWO: THREE.TOUCH.DOLLY_PAN };
  gridLines.visible = !look; gateRowHint.visible = t === 'gate' || t === 'biggate';
  ghost.visible = false; $('tip').classList.add('hidden');
}
document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

const ghost = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.96, 0.6, CELL * 0.96), new THREE.MeshBasicMaterial({ color: 0x38d39f, transparent: true, opacity: 0.35, depthWrite: false }));
ghost.visible = false; scene.add(ghost);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function cellAt(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(groundPlane, hitP)) return -1;
  const c = Math.floor((hitP.x - X0) / CELL), r = Math.floor((hitP.z - Z0) / CELL);
  return inGrid(c, r) ? key(c, r) : -1;
}
const PAINT = new Set(['taxi', 'road', 'erase']);
const NAMES = { taxi: 'Taxibana', road: 'Serviceväg', gate: 'Gate', biggate: 'Storgate', depot: 'Tankdepå', erase: 'Riv' };
let painting = false, lastCell = -1, downAt = null, pointers = 0, paintedAny = false;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => {
  pointers++;
  if (pointers > 1) { painting = false; return; }
  downAt = { x: e.clientX, y: e.clientY };
  if (S.phase === 'INTRO' || S.phase === 'SUMMARY' || tool === 'look' || e.button !== 0) return;
  if (PAINT.has(tool)) { painting = true; paintedAny = false; lastCell = cellAt(e.clientX, e.clientY); paint(lastCell); }
});
addEventListener('pointerup', e => {
  pointers = Math.max(0, pointers - 1);
  if (painting) { painting = false; if (paintedAny) refreshCosts(); }
  else if (downAt && e.target === cv && !PAINT.has(tool) && tool !== 'look' && e.button === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8 && S.phase !== 'INTRO' && S.phase !== 'SUMMARY') {
    const k = cellAt(e.clientX, e.clientY);
    if (k >= 0) { const why = canBuild(tool, k); if (why) toast(why, 'warn'); else build(tool, k); }
  }
  downAt = null;
});
addEventListener('pointercancel', () => { pointers = 0; painting = false; });
cv.addEventListener('pointermove', e => {
  if (tool === 'look' || S.phase === 'INTRO' || S.phase === 'SUMMARY') return;
  const k = cellAt(e.clientX, e.clientY);
  const tip = $('tip');
  if (k < 0) { ghost.visible = false; tip.classList.add('hidden'); return; }
  const why = canBuild(tool, k);
  ghost.visible = true; ghost.position.copy(cellPos(k)).setY(0.4);
  ghost.material.color.set(why ? 0xff5a5a : tool === 'erase' ? 0xffcf6b : 0x38d39f);
  if (e.pointerType === 'mouse') {
    tip.classList.remove('hidden'); tip.classList.toggle('bad', !!why);
    tip.textContent = why || (tool === 'erase' ? `Riv (+${fmtKr(refundFor(k))})` : `${NAMES[tool]} · ${fmtKr(cost(tool))}`);
    tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`;
  }
  if (painting && k !== lastCell && lastCell >= 0) {
    // fyll i rutor mellan förra och nuvarande (rakt, inga hopp)
    let c = kc(lastCell), r = kr(lastCell); const tc = kc(k), tr = kr(k);
    while (c !== tc || r !== tr) {
      if (Math.abs(tc - c) >= Math.abs(tr - r)) c += Math.sign(tc - c); else r += Math.sign(tr - r);
      paint(key(c, r));
    }
    lastCell = k;
  } else if (painting) { lastCell = k; paint(k); }
});
function paint(k) { if (k >= 0 && !canBuild(tool, k)) { build(tool, k); paintedAny = true; } }

// knappar
$('resetBtn').onclick = () => { if (confirm('Riva allt och börja om från början?')) location.reload(); };
$('startBtn').onclick = () => { $('intro').classList.add('hidden'); S.phase = 'BUILD'; updateChecklist(); };
$('openBtn').onclick = () => {
  const a = analyse();
  if (!(a.exits && a.gateIn && a.gateOut)) { toast('Bygg klart först: planen behöver väg från banan till en gate och tillbaka.', 'warn'); return; }
  if (!a.fuel) toast('Varning: ingen tankbil når gaterna – planen kommer att fastna.', 'warn');
  planDay(); S.phase = 'RUN'; S.epoch++; $('resetBtn').classList.add('hidden');
  $('openBtn').classList.add('hidden'); $('speeds').classList.remove('hidden');
  updateChecklist(); toast(`Dag ${S.day}: ${S.dayFlights} plan väntas. Flygplatsen är öppen!`, 'good');
};
document.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => {
  S.speed = +b.dataset.sp;
  document.querySelectorAll('[data-sp]').forEach(x => x.classList.toggle('on', x === b));
}));

// ================================================================ dagens slut & erbjudanden
const CARDS = [
  { id: 'charter', ic: '🧳', name: 'Charterbolaget', text: '+3 plan per dag från och med nu. Du får 600 kr direkt för avtalet.', apply: () => { S.mods.extraFlights += 3; S.money += 600; } },
  { id: 'jumbo', ic: '🛫', name: 'Jumbojet-bolaget', text: 'Var fjärde plan blir ett stort jetplan som betalar dubbelt. De behöver Storgate, längre bana och avfarter längre bort.', once: true, apply: () => { S.mods.bigShare = 0.25; document.querySelector('[data-tool=biggate]').classList.remove('locked'); } },
  { id: 'trucks', ic: '⛽', name: 'Tankbilsfirman', text: 'Varje tankdepå får en tankbil till, även depåer du bygger senare.', apply: () => { S.mods.extraTrucks = (S.mods.extraTrucks || 0) + 1; S.depots.forEach(d => addTruck(d, d.trucks.length)); } },
  { id: 'grant', ic: '🏛️', name: 'Kommunbidrag', text: '1 500 kr direkt till utbyggnad. Inga krav.', apply: () => { S.money += 1500; } },
  { id: 'rush', ic: '⏰', name: 'Rusningstimmar', text: 'Planen kommer i stora klungor i stället för jämnt, men alla betalar 50% mer.', once: true, apply: () => { S.mods.rush = true; S.mods.payMult *= 1.5; } },
  { id: 'board', ic: '🚶', name: 'Snabbare ombordstigning', text: 'Nya rutiner i terminalen: planen blir klara 30% snabbare vid gate.', once: true, apply: () => { S.mods.boardMult *= 1.45; } },
  { id: 'asphalt', ic: '🛣️', name: 'Billig asfalt', text: 'Taxibanor kostar hälften från och med nu.', once: true, apply: () => { S.mods.taxiDiscount = 0.5; } },
];
const taken = new Set();
function endDay() {
  S.phase = 'SUMMARY';
  const pct = S.dayDeps ? S.dayOnTime / S.dayFlights : 0;
  const stars = S.dayDiverts > 0 && pct < 0.7 ? Math.min(1, Math.round(pct * 3)) : pct >= 0.9 && !S.dayDiverts ? 3 : pct >= 0.65 ? 2 : pct >= 0.35 ? 1 : 0;
  $('sumTitle').textContent = `Dag ${S.day} klar`;
  $('sumStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('sumGrid').innerHTML = [
    [`${S.dayDeps}/${S.dayFlights}`, 'avgångar'], [`${S.dayOnTime}`, 'i tid'], [`${S.dayDiverts}`, 'gav upp'], [`+${fmtKr(S.dayEarned)}`, 'intjänat'],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  $('sumTip').textContent = S.dayDiverts ? 'Plan som cirklar för länge flyger till någon annan. Fler gater, snabbare väg till banan eller närmare tankdepå hjälper.'
    : stars < 3 ? 'Titta efter köer: står plan och väntar på varandra, på banan eller på tankbilen? Där är flaskhalsen.'
    : 'Snyggt! Nästa dag kommer fler plan.';
  $('nextDay').textContent = S.day + 1;
  const pool = CARDS.filter(c => !(c.once && taken.has(c.id)));
  const pick = []; while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  $('cards').innerHTML = '';
  for (const c of pick) {
    const b = document.createElement('button'); b.className = 'card';
    b.innerHTML = `<div class="ic">${c.ic}</div><b>${c.name}</b><span>${c.text}</span>`;
    b.onclick = () => { c.apply(); taken.add(c.id); nextDay(); };
    $('cards').appendChild(b);
  }
  $('summary').classList.remove('hidden');
}
function nextDay() {
  $('summary').classList.add('hidden');
  S.day++; S.phase = 'BUILD'; S.dayDeps = 0; S.dayFlights = 0; S.dayOnTime = 0;
  $('openBtn').classList.remove('hidden'); $('openBtn').textContent = `Öppna dag ${S.day} ▶`;
  $('speeds').classList.add('hidden');
  refreshCosts(); updateChecklist();
  toast(`Dag ${S.day}: bygg om eller bygg ut – öppna när du är redo.`);
}

// ================================================================ loop
setTool('taxi');
rebuild(); updateChecklist();
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 0.05);
  if (S.phase === 'RUN' && S.speed > 0) {
    // delsteg så att hög hastighet inte hoppar över rutor
    const steps = S.speed; const dt = raw;
    for (let s = 0; s < steps; s++) {
      S.t += dt;
      while (S.spawnIdx < S.schedule.length && S.t >= S.schedule[S.spawnIdx].t) { spawnPlane(S.schedule[S.spawnIdx].big); S.spawnIdx++; }
      updateRunway(dt);
      for (const p of [...S.planes]) updatePlane(p, dt);
      updateFuel(dt);
    }
    if (S.spawnIdx >= S.schedule.length && S.planes.length === 0) endDay();
    else if (S.spawnIdx >= S.schedule.length && S.t > S.schedule[S.schedule.length - 1].t + 200) {
      toast(`Dagen avbröts – ${S.planes.length} plan satt fast i trafiken.`, 'bad');
      for (const p of [...S.planes]) { S.dayDiverts++; removePlane(p); }
      endDay();
    }
  } else {
    for (const d of S.depots) for (const tr of d.trucks) { tr.group.position.copy(tr.pos); tr.group.rotation.y = tr.heading; }
  }
  const tt = performance.now() / 1000;
  for (const p of S.planes) {
    p.lights.beacon.material.opacity = (tt * 1.2 % 1) < 0.12 ? 1 : 0.05;
    p.lights.strobe.material.opacity = (tt * 1.1 % 1) < 0.06 ? 1 : 0.1;
    p.lights.landing.material.opacity = p.airborne || p.state === 'TAKEOFF' || p.state === 'ROLLOUT' ? 1 : 0;
  }
  towerBeacon.material.opacity = (tt % 1.6) < 0.8 ? 1 : 0.2;
  const ri = Math.floor((tt * 2.2 % 1) * 16);
  rabbit.position.set(RW_X + RW_LEN / 2 + 100 - ri * 6, 1, RW_Z); rabbit.material.opacity = ri < 15 ? 1 : 0;
  controls.update();
  renderer.render(scene, camera);
  updateUI();
}
frame();

// felsökning/test (prototyp)
window.__g = { S, G, build, key, setTool, analyse, CFG, occ, endDay, cellScreen: k => screenPos(cellPos(k)) };
