// Bruksåret 1780–81 – känslotest: masugn + kolning + hammarsmedja under ett helt år (prototyp, slängkod).
// Fakta: design/research/bruket-referens.md
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ================================================================ inställningar
const CFG = {
  secDayOff: 1.6, secDayOn: 4.5, yearDays: 365,
  // masugn
  slots: 8, descent: 1.6, orePerCharge: 0.6, skpPerTon: 7.35, hearthPerCharge: 2.9, tapTime: 0.15,
  freezeT: 1180, freezeHold: 0.9, hardFreezeT: 1110, freezeRepairDays: 8, freezeRepairCost: 350,
  wearT: 1500, wearBase: 0.32, relineDays: 15, relineCost: 600,
  mineOre: 3.2, roast: { rate: 6, q: 0.0 },
  // smedja
  hammerCap: 16, coalPerSkp: 0.09, barYield: 0.8,
  // ekonomi
  wageBase: 8, wageFurnace: 18, wageSmith: 8, wageKolare: 2, horseCost: 1.5,
  coalBuy: 6, pigPrice: 8,
  // kolning
  milaBuild: 3, milaBurn: 16, milaCool: 3, milaYield: 34,
};
const LOTS = [
  { name: 'Bruksskogen', d: 0.6, milor: 2, ang: 2.2 }, { name: 'Kvarnbacken', d: 1.2, milor: 3, ang: 0.9 },
  { name: 'Västra hagen', d: 1.8, milor: 4, ang: 2.9 }, { name: 'Tjärnmossen', d: 2.5, milor: 6, ang: 1.5 },
  { name: 'Storberget', d: 3.2, milor: 8, ang: 0.4 }, { name: 'Älgmyren', d: 4.0, milor: 10, ang: 2.5 },
  { name: 'Finnskogen', d: 5.2, milor: 14, ang: 1.1 }, { name: 'Kronoparken', d: 6.5, milor: 20, ang: 1.9 },
].map(l => ({ ...l, waiting: 0 }));

// ================================================================ tillstånd
const S = {
  day: 0, speed: 1, running: false, over: false,
  // masugn
  fOn: false, T: 1300, Tprev: 1300, Tlast: 1300, ratio: 1.0, blast: 0.8, shaft: [], hearth: 0, hearthIron: 0, hearthQ: 0, tapping: 0,
  ansats: 4, wear: 72, hanging: 0, frozen: 0, coldTime: 0, relining: 0,
  // material
  coal: 60, rawOre: 20, ore: 80, oreQ: 0.55, oreDrift: 0, mineQBonus: 0,
  pig: 260, pigQ: 0.95, bar: 40, money: 4000,
  // kolning
  kolare: 2, horses: 2, milor: [], kolWageBonus: 0,
  // smedja
  takt: 1, prio: 'F', broken: 0, smithRate: 0,
  // väder
  water: 0.75, wind: 0.3, snow: false, snowStart: 172 + Math.random() * 14, snowEnd: 296 + Math.random() * 12,
  frostLeft: 0, iceCut: false, thawLeft: 0, droughtLeft: 0, damBonus: 0, floodLeft: 0, stormLeft: 0, extraWatch: false, badOreLeft: 0,
  price: 16, contracts: [], fired: new Set(), stats: { produced: 0, freezes: 0, hangs: 0, burnedMilor: 0, milorDone: 0, bars: 0 },
  hint: {}, open: null, autoTap: true,
};
S.start = { money: S.money, coal: S.coal, pig: S.pig, bar: S.bar };
const MONTH_WATER = [0.8, 0.75, 0.85, 1.15, 1.0, 0.75, 0.55, 0.5, 0.75, 0.95, 1.0, 0.9];   // jan..dec

// ================================================================ 3D-scen
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb9c3d3, 200, 900);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 3000);
camera.position.set(-40, 21, -44);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(3, 7, 2); controls.enableDamping = true; controls.maxPolarAngle = 1.45; controls.minDistance = 12; controls.maxDistance = 600;
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const hemi = new THREE.HemisphereLight(0xc4d4f0, 0x6c6a72, 1.05); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd2a6, 1.7);
sun.position.set(-160, 90, -120); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 600 });
sun.shadow.bias = -0.0004; scene.add(sun);
const skyU = { top: { value: new THREE.Color(0x4f7bc0) }, mid: { value: new THREE.Color(0xb4c6dc) }, hor: { value: new THREE.Color(0xf6dcc0) } };
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y, -0.1, 1.0);
    float sunSide = smoothstep(0.3, -1.0, vP.x) * 0.8; vec3 c = mix(mix(mid, hor, sunSide), top, smoothstep(0.02, 0.45, h)); gl_FragColor = vec4(c, 1.0); }`,
})));

const clamp = THREE.MathUtils.clamp;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function tex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; return t;
}
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
function mesh(geo, mat, x, y, z, { cast = true, receive = true, parent = scene, ry = 0 } = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
}
const box = (w, h, d, mat, x, y, z, o) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
function roof(w, d, h, mat, x, y, z, o = {}) {
  const s = new THREE.Shape(); s.moveTo(-d / 2 - 0.4, 0); s.lineTo(d / 2 + 0.4, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w + 0.8, bevelEnabled: false }); g.translate(0, 0, -(w + 0.8) / 2); g.rotateY(Math.PI / 2);
  return mesh(g, mat, x, y, z, o);
}
const GLOW = tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const sprite = (color, size, opacity = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(size); return s; };

const snowTex = tex(256, 256, (g, w, h) => { g.fillStyle = '#e9eef6'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { const v = 215 + Math.random() * 40; g.fillStyle = `rgb(${v - 8},${v - 3},${v + 6})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
const grassTex = tex(256, 256, (g, w, h) => { g.fillStyle = '#7d8a55'; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = Math.random(); g.fillStyle = `rgb(${95 + v * 60},${110 + v * 60},${55 + v * 35})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 3); } });
const stoneTex = tex(256, 256, (g, w, h) => {
  g.fillStyle = '#5e5a55'; g.fillRect(0, 0, w, h); let y = 0;
  while (y < h) { const rh = 14 + Math.random() * 14; let x = -Math.random() * 30; while (x < w) { const rw = 22 + Math.random() * 30, v = 85 + Math.random() * 55; g.fillStyle = `rgb(${v},${v - 4},${v - 9})`; g.fillRect(x + 2, y + 2, rw - 3, rh - 3); x += rw; } y += rh; }
}, [3, 3]);
const woodRed = tex(128, 128, (g, w, h) => { g.fillStyle = '#7b2a1e'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, 0, 2, h); } }, [4, 1]);
const mats = {
  stone: M(0xffffff, { map: stoneTex }), red: M(0xffffff, { map: woodRed }), roof: M(0x3a3634, { roughness: 0.8 }),
  roofTop: M(0xeef2f8, { roughness: 0.95 }), dark: M(0x1d1a18), wood: M(0x5a4430), yellow: M(0xd7b46a), sand: M(0x4a3d33),
  window: new THREE.MeshStandardMaterial({ color: 0x2a1f12, emissive: 0xffb860, emissiveIntensity: 0.9 }),
};
const groundMat = M(0xffffff, { map: grassTex, roughness: 1 });

// ---------------- terräng
const RIVER_Z = -34;
function groundH(x, z) {
  let h = 13.5 * sstep(8, 26, z) + 9 * sstep(55, 170, z) + 6 * sstep(-60, -150, z);
  h += 2.2 * Math.sin(x * 0.02) * Math.cos(z * 0.025) * sstep(20, 60, Math.abs(z - 10) + Math.abs(x) * 0.3);
  h += 7 * Math.sin(x * 0.006 + 1) * Math.sin(z * 0.007) * sstep(120, 260, Math.hypot(x, z));
  h -= 2.4 * (1 - sstep(4, 8, Math.abs(z - RIVER_Z)));
  return h;
}
{
  const g = new THREE.PlaneGeometry(1400, 1400, 260, 260); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 90, uv.getY(i) * 90);
  mesh(g, groundMat, 0, 0, 0, { cast: false });
}
const ice = new THREE.Mesh(new THREE.PlaneGeometry(1400, 9), M(0xc8d8e6, { roughness: 0.25, metalness: 0.1 })); ice.rotation.x = -Math.PI / 2; ice.position.set(0, -1.15, RIVER_Z); scene.add(ice);
const riverWater = new THREE.Mesh(new THREE.PlaneGeometry(1400, 9), M(0x34506a, { roughness: 0.12, metalness: 0.35 })); riverWater.rotation.x = -Math.PI / 2; riverWater.position.set(0, -1.2, RIVER_Z); scene.add(riverWater);

// ---------------- masugnen och bruket (som prototyp 4)
const FX = 0, FZ = 8;
{ const g = new THREE.CylinderGeometry(4.95, 7.78, 13, 4, 1); g.rotateY(Math.PI / 4); mesh(g, mats.stone, FX, 6.5, FZ); }
box(10.2, 0.6, 10.2, mats.stone, FX, 13.2, FZ);
box(3.2, 3.6, 1.0, mats.dark, FX, 1.8, FZ - 5.6, { cast: false });
const archGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.8 }));
archGlow.position.set(FX, 1.6, FZ - 6.15); archGlow.rotation.y = Math.PI; scene.add(archGlow);
box(8, 4, 8, mats.red, FX, 15.5, FZ + 0.5); roof(8, 8, 2.6, mats.roofTop, FX, 17.5, FZ + 0.5);
const gicht = sprite(0xffa040, 9); gicht.position.set(FX - 1, 20.5, FZ - 1); scene.add(gicht);
{ const zA = FZ + 4.5, zB = 27, y = 13.6; box(3, 0.4, zB - zA, mats.wood, FX, y, (zA + zB) / 2);
  for (let z = zA + 2; z < zB; z += 4) { const hh = y - groundH(FX, z); if (hh > 0.5) for (const s of [-1, 1]) box(0.35, hh, 0.35, mats.wood, FX + s * 1.2, y - hh / 2, z); } }
{ const z0 = FZ - 7.5, z1 = -14; box(16, 0.1, z0 - z1, mats.sand, FX, 0.05, (z0 + z1) / 2, { cast: false });
  for (const x of [-7.5, 7.5]) for (let z = z1; z <= z0; z += 4.5) box(0.4, 6, 0.4, mats.wood, FX + x, 3, z);
  roof(z0 - z1, 16, 3.2, mats.roofTop, FX, 6, (z0 + z1) / 2); }
const pigBars = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 7), new THREE.MeshStandardMaterial({ color: 0x2b2522, emissive: 0xff5a10, emissiveIntensity: 0 })); m.position.set(FX - 5 + i * 2, 0.12, -6); scene.add(m); pigBars.push(m); }
const tapLight = new THREE.PointLight(0xff7a2a, 0, 40, 1.6); tapLight.position.set(FX, 2.5, -4); scene.add(tapLight);
const archLight = new THREE.PointLight(0xff8a3c, 0, 18, 1.8); archLight.position.set(FX, 2, FZ - 9); scene.add(archLight);
box(7, 5, 6, mats.red, FX + 10, 2.5, FZ - 2); roof(6, 7, 2, mats.roofTop, FX + 10, 5, FZ - 2, { ry: Math.PI / 2 });
box(1.2, 1.2, 40, mats.wood, FX + 13, 1.8, -14);
function waterWheel(x, z, r) {
  const g = new THREE.Group(); g.position.set(x, -0.6 + r * 0.55, z); const rimM = M(0x4a3828);
  for (const s of [-0.6, 0.6]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 6, 28), rimM); t.position.x = s; t.rotation.y = Math.PI / 2; t.castShadow = true; g.add(t); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const p = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.9), rimM); p.position.set(0, Math.sin(a) * r, Math.cos(a) * r); p.rotation.x = -a; p.castShadow = true; g.add(p); }
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.15, r * 2, 0.2), rimM); s.rotation.x = i / 6 * Math.PI; g.add(s); }
  scene.add(g); return g;
}
const wheelF = waterWheel(FX + 13, RIVER_Z + 3.4, 3.6);
box(4, 4, 12, mats.wood, -80, 0.4, RIVER_Z);
box(26, 7, 10, mats.red, -24, 17, 34); roof(26, 10, 4, mats.roofTop, -24, 20.5, 34);
const coalPile = mesh(new THREE.ConeGeometry(5, 3, 10), M(0x1a1716, { roughness: 1 }), -24, 14.5, 26);
{ const g = new THREE.CylinderGeometry(2.6, 3.8, 6.5, 4, 1); g.rotateY(Math.PI / 4); mesh(g, mats.stone, 18, 16.8, 31); }
const SMITH = new THREE.Vector3(46, 2.5, -16);
box(16, 5, 9, mats.stone, 46, 2.5, -16); roof(16, 9, 3, mats.roofTop, 46, 5, -16);
box(1.6, 9, 1.6, mats.stone, 51, 6, -14);
const smithyGlow = sprite(0xff8a3c, 6, 0.7); smithyGlow.position.set(51, 11.5, -14); scene.add(smithyGlow);
box(10, 1.4, 0.1, mats.window, 46, 2.2, -20.55, { cast: false });
const wheelH = waterWheel(42, RIVER_Z + 3.4, 3.0);
box(20, 9, 11, mats.yellow, 92, groundH(92, 34) + 4.5, 34); roof(20, 11, 4.5, mats.roofTop, 92, groundH(92, 34) + 9, 34);
for (let i = 0; i < 6; i++) { const x = 60 + i * 13, z = 62 + (i % 2) * 6, y = groundH(x, z); box(9, 3.6, 6, mats.red, x, y + 1.8, z); roof(9, 6, 2.4, mats.roofTop, x, y + 3.6, z); }
const workerG = new THREE.CapsuleGeometry(0.3, 1.1, 3, 6); workerG.translate(0, 0.85, 0);
[[-1.5, -9], [1.8, -10], [3.5, -5], [44, -21], [-20, 28]].forEach(([x, z]) => mesh(workerG, M(0x2c2622), x, groundH(x, z), z));

// ---------------- skiften och milor i skogen
const LOT_POS = LOTS.map(l => { const r = 85 + l.d * 48, a = l.ang; const x = Math.cos(a) * r - 20, z = Math.sin(a) * r * 0.85 + 30; return new THREE.Vector3(x, groundH(x, z), z); });
const forestCenter = LOT_POS.slice(0, 5).reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / 5);
{
  // gläntor (lite mörkare mark) där skiftena är
  LOT_POS.forEach(p => { const m = new THREE.Mesh(new THREE.CircleGeometry(16, 20), M(0x5d5040, { roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.15, p.z); m.receiveShadow = true; scene.add(m); });
}
// träd: barr, björk; snömössor syns bara på vintern
let snowCaps, birchTops;
{
  const pines = [], birches = [];
  const free = (x, z) => !(Math.abs(z - RIVER_Z) < 10 || (x > -110 && x < 60 && z < -40 && z > -120) || (x > -40 && x < 110 && z > -30 && z < 75) || (x > -40 && x < 12 && z > 20 && z < 45) || LOT_POS.some(p => Math.hypot(p.x - x, p.z - z) < 18));
  for (let i = 0; i < 4200; i++) {
    const x = (Math.random() - 0.5) * 1100, z = (Math.random() - 0.35) * 1000;
    if (!free(x, z)) continue;
    (Math.random() < 0.18 ? birches : pines).push({ x, z, y: groundH(x, z), s: 0.7 + Math.random() * 0.9 });
  }
  const d = new THREE.Object3D();
  const add = (geo, mat, list, f) => { const m = new THREE.InstancedMesh(geo, mat, list.length); m.castShadow = true; m.receiveShadow = true; list.forEach((t, i) => { f(t); d.updateMatrix(); m.setMatrixAt(i, d.matrix); }); scene.add(m); return m; };
  const g1 = new THREE.ConeGeometry(2.6, 8, 7); g1.translate(0, 6.5, 0);
  const g2 = new THREE.ConeGeometry(1.7, 4, 7); g2.translate(0, 9.7, 0);
  const g3 = new THREE.ConeGeometry(1.3, 2.6, 7); g3.translate(0, 11.4, 0);
  const tr = new THREE.CylinderGeometry(0.25, 0.35, 3, 6); tr.translate(0, 1.5, 0);
  const pl = t => { d.position.set(t.x, t.y - 0.3, t.z); d.scale.setScalar(t.s); d.rotation.y = t.x; };
  add(g1, M(0x22392a), pines, pl); add(g2, M(0x2a4532), pines, pl); snowCaps = add(g3, M(0xeef2f8), pines, pl); add(tr, M(0x3d2e22), pines, pl);
  const bt = new THREE.CylinderGeometry(0.22, 0.3, 6, 6); bt.translate(0, 3, 0);
  const btop = new THREE.IcosahedronGeometry(2.6, 0); btop.translate(0, 6.8, 0);
  add(bt, M(0xe8e4da), birches, pl); birchTops = add(btop, M(0x7ea24a, { flatShading: true }), birches, pl);
}
// mila-modeller
const milaGeo = new THREE.SphereGeometry(4.2, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
const woodStackGeo = new THREE.CylinderGeometry(3.6, 4.2, 3.2, 14);
const coalHeapGeo = new THREE.ConeGeometry(4, 1.8, 12);
function milaMesh(m) {
  const g = new THREE.Group();
  const lot = LOT_POS[m.lot], k = m.slot;
  g.position.set(lot.x + Math.cos(k * 2.1) * 8, lot.y, lot.z + Math.sin(k * 2.1) * 8);
  m.dome = new THREE.Mesh(milaGeo, M(0x3d3026, { roughness: 1 })); m.dome.scale.y = 0.62; m.dome.castShadow = true; g.add(m.dome);
  m.stack = new THREE.Mesh(woodStackGeo, M(0x8a6a44)); m.stack.position.y = 1.6; m.stack.castShadow = true; g.add(m.stack);
  m.heap = new THREE.Mesh(coalHeapGeo, M(0x151312)); m.heap.position.y = 0.9; g.add(m.heap);
  m.flame = sprite(0xff5a1a, 7, 0); m.flame.position.y = 3.2; g.add(m.flame);
  m.hut = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.6, 6), M(0x5a4430)); m.hut.position.set(7, 1.3, 2); m.hut.castShadow = true; g.add(m.hut);
  scene.add(g); m.group = g;
}

// ---------------- rök, nederbörd, släde
const SMOKE_N = 320;
const smokeGeo = new THREE.BufferGeometry(); const smokePos = new Float32Array(SMOKE_N * 3), smokeA = new Float32Array(SMOKE_N), smokeLife = new Float32Array(SMOKE_N), smokeSrcI = new Int16Array(SMOKE_N).fill(-1);
smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3)); smokeGeo.setAttribute('alpha', new THREE.BufferAttribute(smokeA, 1));
const smoke = new THREE.Points(smokeGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: { color: { value: new THREE.Color(0x8d8a88) } },
  vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = (900.0 + (1.0-alpha)*2600.0) / -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 color; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; gl_FragColor = vec4(color, vA*(1.0-d*2.0)*0.45); }',
}));
smoke.frustumCulled = false; scene.add(smoke);
for (let i = 0; i < SMOKE_N; i++) smokeLife[i] = Math.random();
const PREC_N = 1500;
const precGeo = new THREE.BufferGeometry(); const precPos = new Float32Array(PREC_N * 3);
for (let i = 0; i < PREC_N; i++) precPos.set([(Math.random() - 0.5) * 200, Math.random() * 80, (Math.random() - 0.5) * 200], i * 3);
precGeo.setAttribute('position', new THREE.BufferAttribute(precPos, 3));
const prec = new THREE.Points(precGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, map: GLOW, transparent: true, opacity: 0.85, depthWrite: false }));
prec.frustumCulled = false; scene.add(prec);
const sled = new THREE.Group();
{ const a = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 1.6), M(0x1d1917)); a.position.y = 0.9; a.castShadow = true; sled.add(a);
  const h = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.7), M(0x5a3a22)); h.position.set(3, 1.5, 0); h.castShadow = true; sled.add(h); }
scene.add(sled); sled.visible = false;
let sledT = -1, sledFrom = null;

// ================================================================ hjälp: datum, logg
const $ = id => document.getElementById(id);
const fmtN = n => Math.round(n).toLocaleString('sv-SE');
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const dateOf = day => { const d = new Date(1780, 5, 1); d.setDate(d.getDate() + Math.floor(day)); return d; };
const dateStr = day => { const d = dateOf(day); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const monthOf = day => dateOf(day).getMonth();
function seasonName(day) { const m = monthOf(day); return m >= 5 && m <= 7 ? 'Sommar' : m >= 8 && m <= 10 ? 'Höst' : m === 11 || m <= 1 ? 'Vinter' : m === 2 && S.snow ? 'Vinter' : 'Vår'; }
function log(text, kind = '') {
  const el = document.createElement('div'); el.className = `msg panel ${kind}`; el.textContent = text;
  $('log').prepend(el); while ($('log').children.length > 4) $('log').lastChild.remove();
  setTimeout(() => el.classList.add('out'), 7000); setTimeout(() => el.remove(), 7900);
}
function hint(id, text) { if (S.tut || S.hint[id]) return; S.hint[id] = true; log('💡 ' + text, 'tip'); }

// ================================================================ vatten & väder
function waterShare() {
  // returnerar { F, S } – andel vatten masugnen resp. smedjan får
  let w = S.water;
  if (S.floodLeft > 0 && S.floodDamage) w = 0;
  const fNeeds = S.fOn && S.frozen <= 0, sNeeds = S.pig > 0.5 && S.broken <= 0;
  if (!fNeeds) return { F: 0, S: Math.min(1, w) };
  if (!sNeeds) return { F: Math.min(1, w), S: 0 };
  if (w >= 1.2) return { F: 1, S: 1 };
  const first = Math.min(1, w), second = clamp(w - 0.15, 0.25, 1);
  return S.prio === 'F' ? { F: first, S: second } : { F: second, S: first };
}
function weatherStep(dd) {
  const m = monthOf(S.day);
  let w = MONTH_WATER[m] + S.damBonus;
  if (S.droughtLeft > 0) { S.droughtLeft -= dd; w *= 0.6; if (S.droughtLeft <= 0) log('Regnet har kommit – ån stiger igen.', 'good'); }
  if (S.frostLeft > 0) { S.frostLeft -= dd; w = Math.min(w, S.iceCut ? 0.85 : 0.5); if (S.iceCut) S.money -= 25 * dd; if (S.frostLeft <= 0) { S.iceCut = false; log('Kölden har släppt.', 'good'); } }
  if (S.floodLeft > 0) { S.floodLeft -= dd; if (S.floodLeft <= 0 && S.floodDamage) { S.floodDamage = false; log('Hjulen är lagade efter vårfloden.', 'good'); } }
  S.water += (w - S.water) * Math.min(1, dd * 0.8);
  S.wind = clamp(S.wind + (Math.random() - 0.5) * 0.6 * Math.sqrt(dd), 0, 1);
  if (S.stormLeft > 0) { S.stormLeft -= dd; S.wind = Math.max(S.wind, 0.85); }
  const wasSnow = S.snow;
  S.snow = S.day >= S.snowStart && S.day < S.snowEnd && !(S.thawLeft > 0);
  if (S.thawLeft > 0) { S.thawLeft -= dd; if (S.thawLeft <= 0) log('Kylan är tillbaka och slädföret bär igen.', 'good'); }
  if (S.snow && !wasSnow && !S.hint.snow) { S.hint.snow = true; log('❄ Snön har lagt sig – slädföre! Kolkörningen går nu tre gånger fortare.', 'good'); }
  if (!S.snow && wasSnow && S.day > S.snowEnd - 1) log('Snön smälter – slädföret är slut för i år.', 'warn');
  if (S.badOreLeft > 0) { S.badOreLeft -= dd; if (S.badOreLeft <= 0) { S.mineQBonus = 0; log('Gruvan är tillbaka i bra malm.', 'good'); } }
}

// ================================================================ masugnen (från prototyp 4)
function meltingMix() { const s = [...S.shaft].sort((a, b) => b.pos - a.pos); const a = s[0], b = s[1] || a; return { r: a.r * 0.65 + b.r * 0.35, q: a.q * 0.65 + b.q * 0.35 }; }
function baseT(r, q, bl) {
  let t = 1372 + 300 * (1.1 - r) + 140 * (bl - 0.75) - 900 * Math.max(0, 0.55 - q) + 300 * Math.max(0, q - 0.55);
  if (S.frostLeft > 0) t -= 25;
  if (S.thawLeft > 0) t -= 30;
  return t;
}
function targetT(bl) {
  if (S.frozen > 0) return 900;
  if (S.shaft.length === 0) return 1000;
  const m = meltingMix();
  let t = baseT(m.r, m.q, bl);
  if (S.hearth > 92) t -= 90 * Math.min(1.5, (S.hearth - 92) / 8);
  if (S.hanging) t -= 60;
  return t;
}
// prognos: vad temperaturen blir när satserna som ligger i schaktet har nått ner (≈ ett dygn)
function forecastT() {
  if (!S.fOn || S.frozen > 0 || !S.shaft.length) return null;
  const bl = S.blEff || Math.min(S.blast, waterShare().F);
  const s = [...S.shaft].sort((a, b) => b.pos - a.pos).slice(0, 5);
  const r = s.reduce((a, c) => a + c.r, 0) / s.length, q = s.reduce((a, c) => a + c.q, 0) / s.length;
  return baseT(r, q, bl) - (S.hanging ? 40 : 0);
}
// masmästarens råd: vilken malmsats som ger ≈ 1 405 °C med nuvarande bläster och malm
function recRatio() {
  const bl = S.blEff || Math.min(S.blast, waterShare().F);
  const t0 = baseT(1.1, S.oreQ, bl);
  return clamp(Math.round((1.1 + (t0 - 1405) / 300) * 20) / 20, 0.7, 1.5);
}
function advice() {
  if (!S.fOn) return '';
  if (S.frozen > 0) return 'Härden bryts upp. Starta sedan med mycket kol (låg malmsats).';
  if (S.hanging) return 'Beskickningen hänger! Sänk blästern till ungefär 40 % så blir raset mindre, eller tryck "Stöt loss".';
  if (S.hearth > 80) return 'Härden är nästan full – tappa nu!';
  const f = forecastT(), rr = recRatio(), T = S.T;
  if (T < 1260) return `Ugnen är farligt kall! Höj blästern direkt (det verkar på en gång) och sänk malmsatsen till ${rr.toFixed(2).replace('.', ',')} eller lägre.`;
  if (f !== null && f < 1320) return `Satserna i schaktet gör ugnen för kall om ett dygn. Sänk malmsatsen till ≈ ${rr.toFixed(2).replace('.', ',')} och höj blästern lite.`;
  if (f !== null && f > 1490) return `Ugnen kommer gå för varmt (slösar kol, sliter fodret). Höj malmsatsen till ≈ ${rr.toFixed(2).replace('.', ',')}.`;
  if (S.ratio > rr + 0.1) return `Malmsatsen ${S.ratio.toFixed(2).replace('.', ',')} är för hög – när de satserna når härden (om ungefär ett halvt dygn) blir ugnen för kall. Lagom är ≈ ${rr.toFixed(2).replace('.', ',')}.`;
  if (S.ratio < rr - 0.15) return `Malmsatsen ${S.ratio.toFixed(2).replace('.', ',')} är låg – ugnen kommer gå varmt och slösa kol. Lagom är ≈ ${rr.toFixed(2).replace('.', ',')}.`;
  if (S.ansats > 40) return 'Mycket ansats i schaktet – kör lite varmare (lägre malmsats) en tid så smälter den bort.';
  return `Ugnen går bra. Lagom malmsats nu: ≈ ${rr.toFixed(2).replace('.', ',')}.`;
}
function addCharge() {
  const oreNeed = CFG.orePerCharge * S.ratio;
  if (S.coal < 1 || S.ore < oreNeed) return false;
  S.coal -= 1; S.ore -= oreNeed; S.shaft.push({ pos: 0, r: S.ratio, q: S.oreQ }); return true;
}
function meltCharge(c) {
  const T = S.T, yieldT = clamp((T - 1160) / 220, 0.25, 1);
  const iron = CFG.orePerCharge * c.r * c.q * CFG.skpPerTon * yieldT;
  S.hearth += CFG.hearthPerCharge * (0.55 + 0.45 * c.r / 1.1) * (1 + (0.55 - c.q) * 1.5); S.hearthIron += iron;
  S.hearthQ += iron * (T > 1380 ? 1 : T > 1300 ? 0.9 : 0.75);
  S.ansats += Math.max(0, 0.55 - c.q) * 18 + Math.max(0, c.r - 1.35) * 3;
}
function slip(controlled, bl) {
  const n = Math.min(S.shaft.length, 2); S.shaft.sort((a, b) => b.pos - a.pos);
  const dropped = S.shaft.splice(0, n);
  const drop = (controlled ? 0.5 : 1) * (30 + 90 * bl) * (1 + S.ansats / 150) * (dropped.reduce((a, c) => a + c.r, 0) / (1.1 * Math.max(1, n)));
  dropped.forEach(meltCharge); S.T -= drop; S.hanging = 0; S.stats.hangs++; S.lastSlip = S.day;
  log(`Hängningen släppte – beskickningen rasade ner kall! Härden föll ${Math.round(drop)} °C.`, controlled ? 'warn' : 'bad');
}
function freeze() {
  S.frozen = CFG.freezeRepairDays; S.stats.freezes++; S.money -= CFG.freezeRepairCost;
  S.hearth = 0; S.hearthIron = 0; S.hearthQ = 0; S.tapping = 0; S.hanging = 0;
  log(`HÄRDEN HAR FRUSIT! ${CFG.freezeRepairDays} dagars stillestånd och ${CFG.freezeRepairCost} daler för att bryta upp den.`, 'bad');
  const why = S.ratio > recRatio() + 0.08 ? `Malmsatsen var ${S.ratio.toFixed(2).replace('.', ',')} – för mycket malm för den här malmen och blästern (lagom hade varit ≈ ${recRatio().toFixed(2).replace('.', ',')}).`
    : (S.blEff || 0) < 0.6 ? 'Blästern var för svag – ugnen fick för lite luft för att hålla värmen.' : S.stats.hangs && S.lastSlip && S.day - S.lastSlip < 1.5 ? 'En hängning rasade ner kall beskickning i härden.' : 'Temperaturen låg under 1 180 °C för länge.';
  setTimeout(() => $('event').classList.contains('hidden') && openEvent('Härden frös', `<p>${why}</p><p>Arbetarna bryter nu upp den stelnade järnklumpen – 8 dagar och ${CFG.freezeRepairCost} daler. Nästa gång: håll koll på <b>prognosen</b> och <b>masmästarens råd</b> i masugnspanelen, och höj blästern så fort det blir kallt.</p>`, [{ t: 'Uppfattat', d: '', f: () => {} }]), 50);
}
function lightFurnace() {
  if (S.fOn || S.relining > 0) return;
  if (S.wear >= 60) { log('Infodringen är för sliten – mura om ugnen först.', 'warn'); return; }
  if (S.coal < 40) { log('För lite kol i kolhuset för att tända (minst 40 lass).', 'warn'); return; }
  S.fOn = true; S.T = 1320; S.hearth = 0; S.ansats = 4; S.coldTime = 0;
  S.shaft = []; for (let i = 0; i < CFG.slots; i++) S.shaft.push({ pos: i / CFG.slots, r: 0.8, q: S.oreQ });
  S.coal -= 25;
  log('Masugnen är tänd! Blåsningen har börjat.', 'good');
  hint('lit', 'Satserna tar ungefär ett dygn ner genom schaktet. Håll härden mellan 1 330 och 1 480 °C.');
}
function blowDown(reason) {
  if (!S.fOn) return;
  if (S.hearthIron > 0) { const q = S.hearthQ / S.hearthIron; S.pigQ = (S.pigQ * S.pig + q * S.hearthIron) / (S.pig + S.hearthIron); S.pig += S.hearthIron; S.stats.produced += S.hearthIron; }
  S.fOn = false; S.shaft = []; S.hearth = 0; S.hearthIron = 0; S.hearthQ = 0; S.frozen = 0; S.hanging = 0; S.tapping = 0;
  log(reason || 'Masugnen är nedblåst.', 'warn');
}
function furnaceStep(dd) {
  if (S.relining > 0) { S.relining -= dd; if (S.relining <= 0) { S.relining = 0; S.wear = 0; log('Masugnen är ommurad och redo att tändas.', 'good'); } return; }
  if (!S.fOn) return;
  S.money -= CFG.wageFurnace * dd;
  const bl = Math.min(S.blast, waterShare().F);
  S.blEff = bl;
  if (S.frozen > 0) {
    S.frozen -= dd; S.T += (900 - S.T) * Math.min(1, dd * 2);
    if (S.frozen <= 0) { S.frozen = 0; S.T = 1320; S.ansats = Math.max(0, S.ansats - 20); S.shaft = []; for (let i = 0; i < CFG.slots; i++) S.shaft.push({ pos: i / CFG.slots, r: 0.8, q: S.oreQ }); log('Härden är lagad – ugnen tänd igen.', 'good'); }
    return;
  }
  if (bl < 0.1) {
    // ingen bläster: ugnen dämpas – svalnar långsamt men fryser inte
    S.T += (1250 - S.T) * Math.min(1, dd * 0.2); S.coldTime = 0;
    hint('banked', 'Blästern står still – masugnen är dämpad. Den svalnar sakta tills hjulen går igen.');
    return;
  }
  if (!S.hanging) {
    const risk = Math.max(0, S.ansats - 28) / 100 * 1.4 * bl;
    if (Math.random() < risk * dd) { S.hanging = 0.2 + Math.random() * 0.6; log('Beskickningen hänger sig i masugnen!', 'warn'); }
    for (const c of S.shaft) c.pos += CFG.descent * bl * dd;
  } else { S.hanging -= dd; if (S.hanging <= 0) slip(false, bl); }
  S.shaft.sort((a, b) => b.pos - a.pos);
  while (S.shaft.length && S.shaft[0].pos >= 1) meltCharge(S.shaft.shift());
  let g = 0;
  while (g++ < 3 && (S.shaft.length === 0 || Math.min(...S.shaft.map(c => c.pos)) >= 1 / CFG.slots)) { if (!addCharge()) break; }
  if (S.coal < 1 && S.shaft.length === 0) { blowDown('Kolet tog slut – masugnen fick blåsas ner.'); return; }
  if (S.coal < 1) hint('nocoal', 'Kolhuset är tomt! Ugnen svalnar när de sista satserna smält.');
  S.T += (targetT(bl) - S.T) * Math.min(1, dd * 3.2);
  if (S.tut && S.T < 1240) S.T = 1240;   // lärotiden: masmästaren räddar ugnen innan den fryser
  if (S.T < 1265 && !S.warnedCold) {
    S.warnedCold = true;
    openEvent('Masugnen håller på att frysa!', `<p>Härden är nere i ${Math.round(S.T)} °C. Under ungefär 1 180 °C stelnar järnet, och då måste härden brytas upp – 8 dagars stillestånd.</p><p><b>Gör så här:</b></p><ul><li><b>Höj blästern</b> – det värmer ugnen direkt.</li><li><b>Sänk malmsatsen</b> (mer kol per sats) till ungefär ${recRatio().toFixed(2).replace('.', ',')}. Det verkar när satserna når härden, om ungefär ett halvt dygn.</li><li>Håll ett öga på <b>prognosen</b> i masugnspanelen – den visar vad som är på väg.</li></ul>`, [{ t: 'Uppfattat', d: 'Spelet fortsätter.', f: () => { if (S.open !== 'F') openStation('F'); } }]);
  }
  if (S.T < 1250 && S.day - (S.coldLog || -9) > 2) { S.coldLog = S.day; log(`⚠ Härden är kall (${Math.round(S.T)} °C) – höj blästern och sänk malmsatsen!`, 'bad'); }
  S.ansats = clamp(S.ansats - Math.max(0, S.T - 1440) * 0.03 * dd - 0.4 * dd, 0, 100);
  S.wear += CFG.wearBase * dd + (S.T > CFG.wearT ? (S.T - CFG.wearT) * 0.035 * dd : 0) + (S.hearth > 100 ? 2.5 * dd : 0);
  if (S.tapping > 0) {
    S.tapping -= dd;
    if (S.tapping <= 0) {
      const iron = S.hearthIron, q = iron > 0 ? S.hearthQ / iron : 1;
      S.pigQ = (S.pigQ * S.pig + q * iron) / Math.max(0.001, S.pig + iron); S.pig += iron; S.stats.produced += iron;
      S.hearth = 4; S.hearthIron = 0; S.hearthQ = 0; S.tapping = 0; barCool = 1; S.stats.taps = (S.stats.taps || 0) + 1;
      log(`Tappat ${Math.round(iron)} skp ${q > 0.95 ? 'grått' : q > 0.85 ? 'halvgrått' : 'vitt'} tackjärn.`, q > 0.95 ? 'good' : 'warn');
    }
  }
  if (S.autoTap && S.hearth >= 85 && S.tapping <= 0) S.tapping = CFG.tapTime;
  if (S.hearth > 85 && !S.autoTap && S.day - (S.fullLog || -9) > 1) { S.fullLog = S.day; log('⚠ Härden är nästan full – tappa nu! Annars når slaggen formorna och ugnen kyls ner.', 'bad'); }
  S.hearth = Math.min(S.hearth, 106);
  if (S.T < CFG.freezeT) S.coldTime += dd; else S.coldTime = Math.max(0, S.coldTime - dd);
  if (S.T < CFG.hardFreezeT || S.coldTime > CFG.freezeHold) freeze();
  if (S.wear >= 100) blowDown('Infodringen är utbränd – masugnen måste blåsas ner!');
}
function tap() { if (!S.fOn || S.tapping > 0 || S.frozen > 0 || S.hearth < 10) return; S.tapping = CFG.tapTime; }
function poke() { if (!S.hanging) return; if (Math.random() < 0.6) slip(true, S.blEff || 0.5); else { log('Stötningen lyckades inte.', 'warn'); S.T -= 6; } }

// ================================================================ kolningen
function freeKolare() { return S.kolare - S.milor.filter(m => m.phase !== 'KLAR').length; }
function startMila(li) {
  const lot = LOTS[li];
  if (freeKolare() <= 0) { log('Ingen ledig kolare – anställ fler eller vänta tills en mila är klar.', 'warn'); return; }
  if (lot.milor <= 0) { log(`${lot.name} är uthugget.`, 'warn'); return; }
  if (monthOf(S.day) === 3) { log('I april går inte att resa milor – tjälen går ur marken och vägarna är bottenlösa.', 'warn'); return; }
  lot.milor--;
  const slot = S.milor.filter(m => m.lot === li).length;
  const m = { lot: li, slot, phase: 'BYGG', t: 0, drag: 10, loss: 0, fire: false };
  milaMesh(m); S.milor.push(m);
  log(`En kolare börjar resa en mila på ${lot.name}.`);
}
function tata(m) {
  if (m.phase !== 'KOL') return;
  if (m.drag < 35 && !m.fire) { return; }
  m.drag = 8; if (m.fire) { m.fire = false; log(`Milan på ${LOTS[m.lot].name} är släckt och tätad – ${Math.round(m.loss * 100)} % av kolet förlorat.`, 'warn'); }
}
function kolStep(dd) {
  S.money -= (S.kolare * (CFG.wageKolare + S.kolWageBonus) + S.horses * CFG.horseCost) * dd;
  for (const m of [...S.milor]) {
    if (m.phase === 'BYGG') { m.t += dd; if (m.t >= CFG.milaBuild) { m.phase = 'KOL'; m.t = 0; m.drag = 10; } }
    else if (m.phase === 'KOL') {
      m.t += dd;
      if (!m.fire) {
        m.drag += (2.5 + S.wind * 4) * dd;
        const spikeP = (0.17 + S.wind * 0.3) * (S.extraWatch ? 0.5 : 1);
        if (Math.random() < spikeP * dd) m.drag += 18 + Math.random() * 26;
        if (m.drag >= 100) { m.fire = true; m.drag = 100; log(`🔥 Elden har slagit igenom i milan på ${LOTS[m.lot].name}! Täta den, annars brinner kolet upp.`, 'bad'); }
      } else {
        m.loss += 0.45 * dd;
        if (m.loss >= 1) { log(`Milan på ${LOTS[m.lot].name} brann upp helt. Veckors arbete förlorat.`, 'bad'); S.stats.burnedMilor++; removeMila(m); continue; }
      }
      if (m.t >= CFG.milaBurn && !m.fire) { m.phase = 'SVAL'; m.t = 0; }
    } else if (m.phase === 'SVAL') {
      m.t += dd;
      if (m.t >= CFG.milaCool) {
        const y = Math.round(CFG.milaYield * (1 - m.loss) * (0.9 + Math.random() * 0.2));
        LOTS[m.lot].waiting += y; S.stats.milorDone++; m.phase = 'KLAR'; m.t = 0;
        log(`Milan på ${LOTS[m.lot].name} är riven: ${y} lass kol väntar på att köras in.`, 'good');
      }
    } else if (m.phase === 'KLAR') { m.t += dd; if (m.t > 4) removeMila(m); }
  }
  // kolkörning: närmaste skiften först
  let cap = S.horses * (S.snow ? 9 : 3) * dd;
  const order = LOTS.map((l, i) => i).filter(i => LOTS[i].waiting > 0.01).sort((a, b) => LOTS[a].d - LOTS[b].d);
  for (const i of order) {
    if (cap <= 0) break;
    const lot = LOTS[i], per = 0.8 + lot.d;
    const amt = Math.min(lot.waiting, cap / per);
    lot.waiting -= amt; S.coal += amt; cap -= amt * per;
    if (amt > 0.3 && sledT < 0 && Math.random() < 0.3) { sledT = 0; sledFrom = LOT_POS[i]; }
  }
}
function removeMila(m) { scene.remove(m.group); S.milor.splice(S.milor.indexOf(m), 1); }

// ================================================================ smedjan
function smithStep(dd) {
  S.money -= CFG.wageSmith * dd;
  if (S.tut && S.tut.locked.has('S')) { S.smithRate = 0; return; }
  if (S.broken > 0) { S.broken -= dd; if (S.broken <= 0 && S.repairing) { S.broken = 0; S.repairing = false; log('Nytt hammarskaft på plats – smedjan går igen.', 'good'); } else if (!S.repairing) S.broken = Math.max(S.broken, 0.01); S.smithRate = 0; return; }
  const w = waterShare().S;
  const cap = CFG.hammerCap * w * S.takt * dd;
  const coalNeed = CFG.coalPerSkp * (S.takt > 1 ? 1.25 : 1);
  const use = Math.min(S.pig, cap, S.coal / coalNeed);
  S.smithRate = use / dd;
  if (use > 0) { S.pig -= use; S.bar += use * CFG.barYield * S.pigQ; S.coal -= use * coalNeed; S.stats.bars += use * CFG.barYield * S.pigQ; }
  const risk = S.takt > 1 ? 0.02 : S.takt < 1 ? 0.001 : 0.004;
  if (use > 0 && Math.random() < risk * dd) { S.broken = 1; S.repairing = false; log('💥 Hammarskaftet sprack! Smedjan står still tills det är bytt.', 'bad'); }
}

// ================================================================ kontrakt & händelser
const CONTRACT_OFFERS = [
  { day: 2, from: 'Handelshuset Lindegren & Son, Stockholm', amount: 450, due: 228, price: 21, advance: 2500 },
  { day: 138, from: 'En holländsk skeppare i Gävle', amount: 400, due: 304, price: 22, advance: 0 },
  { day: 248, from: 'Kronans faktori i Stockholm', amount: 250, due: 350, price: 23, advance: 0 },
];
function offerContract(c) {
  openEvent('Ett kontrakt erbjuds', `<p><b>${c.from}</b> vill köpa <b>${c.amount} skeppund stångjärn</b>, levererat senast <b>${dateStr(c.due)}</b>, för <b>${c.price} daler/skp</b>${c.advance ? ` med ${fmtN(c.advance)} daler i förskott nu` : ''}. Klarar bruket inte leveransen blir det vite (6 daler per skeppund som fattas).</p><p class="small">Du har ${fmtN(S.bar)} skp stångjärn och ${fmtN(S.pig)} skp tackjärn i lager. Smedjan gör upp till ${Math.round(CFG.hammerCap * CFG.barYield)} skp stångjärn per dag med fullt vatten.</p>`, [
    { t: 'Skriv på', d: 'Mer betalt än järnvågen brukar ge.', f: () => { S.contracts.push({ ...c, done: false }); if (c.advance) S.money += c.advance; } },
    { t: 'Tacka nej', d: 'Inga åtaganden.', f: () => {} },
  ]);
}
function settle(c) {
  c.done = true;
  const del = Math.min(Math.floor(S.bar), c.amount), pay = del * c.price - c.advance, fine = (c.amount - del) * 6;
  S.bar -= del; S.money += pay - fine; c.delivered = del;
  openEvent('Leveransdag', del >= c.amount
    ? `<p>${c.amount} skeppund stångjärn lastas och går till ${c.from}. ${fmtN(pay)} daler kommer in i kassan${c.advance ? ' (efter förskottet)' : ''}.</p>`
    : `<p>Bruket kunde bara leverera <b>${del} av ${c.amount}</b> skeppund till ${c.from}. ${fmtN(pay)} daler betalas${c.advance ? ' (efter förskottet)' : ''}, men vitet blir <b>${fmtN(fine)} daler</b>.</p>`,
    [{ t: 'Fortsätt', d: '', f: () => {} }]);
}
const EVENTS = [
  { at: [32, 48], id: 'drought', title: 'Torka', text: 'Det har inte regnat på flera veckor. Ån är lägre än någon kan minnas, och hjulen går trögt. Man kan bygga på dammen så att den håller mer vatten, både nu och framöver.',
    start: () => { S.droughtLeft = 24; },
    choices: [{ t: 'Bygg på dammen', d: '400 daler. Mer vatten resten av året.', f: () => { S.money -= 400; S.damBonus = 0.15; } }, { t: 'Vänta på regn', d: 'Gratis.', f: () => {} }] },
  { at: [75, 95], id: 'storm', title: 'Höststormar', text: 'Det blåser upp till storm. Blåsten driver drag genom milorna, så elden slår lätt igenom täckningen. Kolarna kan sätta extra vakt dygnet runt.',
    start: () => { S.stormLeft = 6; },
    choices: [{ t: 'Sätt extra vakt vid milorna', d: '80 daler. Halverar risken för plötsliga genombrott under stormen.', f: () => { S.money -= 80; S.extraWatchLeft = 6; } }, { t: 'Klara oss som vanligt', d: 'Håll själv koll på milorna.', f: () => {} }] },
  { at: [108, 125], id: 'rival', title: 'Grannbruket lockar kolare', text: 'Grannbruket erbjuder kolarna högre betalning för att kola åt dem i stället.',
    cond: () => S.kolare >= 2,
    choices: [{ t: 'Höj kolarnas lön', d: '+0,5 daler per dag och kolare resten av året.', f: () => { S.kolWageBonus = 0.5; } }, { t: 'Låt dem gå', d: 'Du förlorar en kolare (en pågående mila blir kvar utan vakt om alla är upptagna).', f: () => { S.kolare = Math.max(1, S.kolare - 1); } }] },
  { at: [200, 222], id: 'frost', title: 'Köldknäpp', text: 'Trettio grader kallt. Ån fryser kring hjulen och blästern blir kall.',
    start: () => { S.frostLeft = 6 + Math.random() * 4; },
    choices: [{ t: 'Hugg upp isen', d: '25 daler per dag så länge kölden varar.', f: () => { S.iceCut = true; } }, { t: 'Låt det vara', d: 'Hjulen går på halv kraft tills det blir mildare.', f: () => {} }] },
  { at: [228, 245], id: 'badore', title: 'Sämre malm från gruvan', text: 'Gruvan har brutit in i en mager, stenig del av malmkroppen. Det bygger ansats i masugnen.',
    start: () => { S.mineQBonus = -0.06; S.badOreLeft = 14; },
    choices: [{ t: 'Köp bättre malm från grannbruket', d: '300 daler.', f: () => { S.money -= 300; S.mineQBonus = 0; } }, { t: 'Kör på med egen malm', d: 'Håll koll på ansatsen.', f: () => {} }] },
  { at: [255, 272], id: 'thaw', title: 'Blidväder', text: 'Blidvädret har förstört slädföret. Ingen kolkörning med släde på en dryg vecka, och kolet blir fuktigt.',
    start: () => { S.thawLeft = 8; },
    choices: [{ t: 'Köp kol av bönderna', d: '60 lass för 420 daler.', f: () => { S.money -= 420; S.coal += 60; } }, { t: 'Klara oss', d: 'Hushålla med kolet.', f: () => {} }] },
  { at: [312, 325], id: 'flood', title: 'Vårflod', text: 'Snösmältningen har gett den största vårfloden på många år. Dammen knakar. Förstärker ni den nu går det säkert bra – annars kan floden slita med sig hjulrännorna.',
    start: () => { S.floodLeft = 8; },
    choices: [{ t: 'Förstärk dammen', d: '250 daler.', f: () => { S.money -= 250; } }, { t: 'Chansa', d: 'Hälften av gångerna håller det. Annars står hjulen still i 8 dagar.', f: () => { if (Math.random() < 0.5) { S.floodDamage = true; log('Floden slet med sig hjulrännorna! Hjulen står still i 8 dagar.', 'bad'); } else log('Dammen höll!', 'good'); } }] },
];
for (const e of EVENTS) e.day = e.at[0] + Math.random() * (e.at[1] - e.at[0]);
function checkEvents() {
  if (S.tut || !$('event').classList.contains('hidden')) return;
  for (const c of S.contracts) if (!c.done && S.day >= c.due) { settle(c); return; }
  for (const c of CONTRACT_OFFERS) if (!c.offered && S.day >= c.day) { c.offered = true; offerContract(c); return; }
  for (const e of EVENTS) {
    if (S.fired.has(e.id) || S.day < e.day || (e.cond && !e.cond())) continue;
    S.fired.add(e.id); e.start && e.start();
    openEvent(e.title, `<p>${e.text}</p>`, e.choices); return;
  }
}
let pausedBy = null;
function openEvent(title, html, choices) {
  pausedBy = S.speed; S.speed = 0;
  $('evTitle').textContent = title; $('evText').innerHTML = html; $('evChoices').innerHTML = '';
  for (const c of choices) {
    const b = document.createElement('button'); b.className = 'choice'; b.innerHTML = `<b>${c.t}</b>${c.d ? `<span>${c.d}</span>` : ''}`;
    b.onclick = () => { c.f(); $('event').classList.add('hidden'); S.speed = pausedBy || 1; pausedBy = null; refreshSpeed(); };
    $('evChoices').appendChild(b);
  }
  $('event').classList.remove('hidden'); refreshSpeed();
}

// ================================================================ huvudsteg
function step(dd) {
  S.day += dd;
  S.money -= CFG.wageBase * dd;
  S.rawOre += CFG.mineOre * dd;
  const ra = Math.min(S.rawOre, CFG.roast.rate * dd);
  if (ra > 0) {
    S.oreDrift = clamp(S.oreDrift + (Math.random() - 0.5) * 0.05 * Math.sqrt(dd), -0.045, 0.045);
    const q = 0.55 + S.mineQBonus + S.oreDrift; S.oreQ = (S.oreQ * S.ore + q * ra) / Math.max(0.001, S.ore + ra); S.ore += ra; S.rawOre -= ra;
  }
  S.price = clamp(S.price + (Math.random() - 0.5) * 2.6 * Math.sqrt(dd), 13, 19.5);
  if (S.extraWatchLeft > 0) { S.extraWatchLeft -= dd; S.extraWatch = S.extraWatchLeft > 0; }
  weatherStep(dd); furnaceStep(dd); kolStep(dd); smithStep(dd);
  // tips
  if (S.day > 20 && S.wear >= 60 && S.relining <= 0 && !S.fOn) hint('reline', 'Masugnens infodring är sliten. Mura om den under sommaren, så att den är redo till vintern.');
  if (S.money < 1200 && S.bar > 60) hint('sell', 'Kassan sjunker. Sälj stångjärn på järnvågen (panelen till höger) – spara bara det du behöver till kontrakten.');
  if (S.day > 6 && S.milor.length === 0) hint('kol', 'Kolhuset är nästan tomt. Res milor ute i skogen nu, så att det finns kol till vinterns blåsning.');
  if (S.day > 120 && !S.fOn && S.coal > 150 && S.wear < 60) hint('lightnow', 'Det finns kol nog för att tända masugnen. Den drar ungefär 10 lass kol per dygn – fortsätt kola och köra in kol medan den blåser. Många bruk tände när snön kom och slädföret bar.');
  if (S.day > 200 && !S.fOn && S.wear < 60 && S.coal >= 40) hint('lightlate', 'Det är mitt i vintern och masugnen står kall! Utan tackjärn blir det inget stångjärn till kontrakten. Tänd den nu.');
}

// ================================================================ årets slut
function endYear() {
  if (S.over) return; S.over = true;
  if (S.fOn) blowDown();
  for (const c of S.contracts) if (!c.done) settle(c);
  const val = s => s.money + s.coal * 4 + s.pig * CFG.pigPrice + s.bar * 16;
  const profit = val(S) - val(S.start);
  const failed = S.contracts.filter(c => c.delivered < c.amount).length;
  let st = profit >= 23000 ? 3 : profit >= 14000 ? 2 : profit > 0 ? 1 : 0;
  if (failed) st = Math.min(st, 1);
  $('event').classList.add('hidden');
  setTimeout(() => {
    $('evTitle').textContent = 'Bruksåret är slut';
    $('evText').innerHTML = `<p>Det har blivit juni igen. Så här gick året:</p><div class="stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</div>
      <table>
        <tr><td>Tackjärn blåst i masugnen</td><td class="r">${fmtN(S.stats.produced)} skp</td></tr>
        <tr><td>Stångjärn smitt</td><td class="r">${fmtN(S.stats.bars)} skp</td></tr>
        <tr><td>Milor kolade / brunna</td><td class="r">${S.stats.milorDone} / ${S.stats.burnedMilor}</td></tr>
        <tr><td>Frusna härdar · hängningar</td><td class="r">${S.stats.freezes} · ${S.stats.hangs}</td></tr>
        <tr><td>Kontrakt fullgjorda</td><td class="r">${S.contracts.length - failed} av ${S.contracts.length}</td></tr>
        <tr><td><b>Årets vinst (kassa + lager)</b></td><td class="r"><b>${fmtN(profit)} daler</b></td></tr>
      </table>
      <p class="small">I det riktiga spelet fortsätter du år efter år: bygger ut, möter konkurrenter och går in i nya epoker.</p>`;
    $('evChoices').innerHTML = '';
    const b = document.createElement('button'); b.className = 'btn big'; b.textContent = 'Spela ett nytt år'; b.onclick = () => location.reload(); $('evChoices').appendChild(b);
    $('event').classList.remove('hidden');
  }, 300);
}

// ================================================================ UI
function refreshSpeed() { document.querySelectorAll('[data-sp]').forEach(b => b.classList.toggle('on', +b.dataset.sp === S.speed)); }
document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { if (!$('event').classList.contains('hidden')) return; S.speed = +b.dataset.sp; refreshSpeed(); });
const STATION_VIEW = {
  F: { t: new THREE.Vector3(3, 7, 2), p: new THREE.Vector3(-40, 21, -44) },
  K: { t: forestCenter.clone(), p: forestCenter.clone().add(new THREE.Vector3(-60, 150, -230)) },
  S: { t: SMITH.clone(), p: SMITH.clone().add(new THREE.Vector3(-28, 16, -30)) },
};
let fly = null;
function openStation(k) {
  if (S.tut && S.tut.locked.has(k)) return;
  S.open = S.open === k ? null : k;
  for (const id of ['F', 'K', 'S']) $('st' + id).classList.toggle('closed', S.open !== id);
  if (S.open === 'K') {
    // sikta på skiftena där det kolas (annars de närmaste)
    const idx = [...new Set(S.milor.map(m => m.lot))];
    const pts = (idx.length ? idx : [0, 1, 2, 3]).map(i => LOT_POS[i]);
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const spread = Math.max(60, ...pts.map(p => Math.hypot(p.x - c.x, p.z - c.z)));
    STATION_VIEW.K = { t: c, p: c.clone().add(new THREE.Vector3(-0.25, 0.55, -1).normalize().multiplyScalar(spread * 2.1 + 110)) };
  }
  if (S.open) fly = { t0: performance.now(), fromT: controls.target.clone(), fromP: camera.position.clone(), ...STATION_VIEW[k] };
}
document.querySelectorAll('.hd[data-st]').forEach(h => h.onclick = () => openStation(h.dataset.st));
$('ratio').oninput = e => S.ratio = +e.target.value;
$('blast').oninput = e => S.blast = +e.target.value;
$('tapBtn').onclick = tap; $('pokeBtn').onclick = poke;
$('autoTap').onchange = e => { S.autoTap = e.target.checked; };
$('followBtn').onclick = () => { S.ratio = recRatio(); $('ratio').value = S.ratio; };
$('blowDownBtn').onclick = () => { if (confirm('Blåsa ner masugnen? Den måste tändas igen, och det går åt kol.')) blowDown(); };
$('lightBtn').onclick = lightFurnace;
$('relineBtn').onclick = () => { if (S.fOn || S.relining > 0) return; S.relining = CFG.relineDays; S.money -= CFG.relineCost; log('Murarna börjar mura om masugnens schakt.'); };
$('kolPlus').onclick = () => { S.kolare = Math.min(8, S.kolare + 1); };
$('kolMinus').onclick = () => { if (freeKolare() > 0) S.kolare--; else log('Alla kolare är upptagna med milor.', 'warn'); };
$('horsePlus').onclick = () => { S.horses = Math.min(12, S.horses + 1); };
$('horseMinus').onclick = () => { S.horses = Math.max(0, S.horses - 1); };
document.querySelectorAll('[data-takt]').forEach(b => b.onclick = () => { S.takt = +b.dataset.takt; document.querySelectorAll('[data-takt]').forEach(x => x.classList.toggle('on', x === b)); });
document.querySelectorAll('[data-prio]').forEach(b => b.onclick = () => { S.prio = b.dataset.prio; document.querySelectorAll('[data-prio]').forEach(x => x.classList.toggle('on', x === b)); });
$('repairBtn').onclick = () => { if (S.broken > 0 && !S.repairing) { S.repairing = true; S.broken = 3; S.money -= 60; log('Smeden hämtar ett nytt hammarskaft – 3 dagar, 60 daler.'); } };
$('sellBtn').onclick = () => { const n = Math.min(50, Math.floor(S.bar)); if (n <= 0) return; S.bar -= n; S.money += n * S.price; log(`Sålde ${n} skp stångjärn för ${fmtN(n * S.price)} daler.`); S.stats.sold = (S.stats.sold || 0) + 1; };
$('sellPigBtn').onclick = () => { const n = Math.min(50, Math.floor(S.pig)); if (n <= 0) return; S.pig -= n; S.money += n * CFG.pigPrice; log(`Sålde ${n} skp tackjärn till grannbruket för ${fmtN(n * CFG.pigPrice)} daler.`); };
$('buyCoalBtn').onclick = () => { S.money -= 40 * CFG.coalBuy; S.coal += 40; log(`Köpte 40 lass kol av bönderna för ${40 * CFG.coalBuy} daler.`); };
$('startBtn').onclick = () => { $('intro').classList.add('hidden'); S.running = true; openStation('K'); setTimeout(() => hint('start', 'Börja med kolningen: res milor i skogsskiftena. Masugnen behöver mycket kol till vintern. Rutan "Att göra nu" till höger säger alltid vad som är viktigast.'), 1200); };
$('tutBtn').onclick = startTut;
if (/[?&]ar\b/.test(location.search)) { $('introNote').textContent = 'Lärotiden är klar. Nu gäller det på riktigt.'; $('tutBtn').classList.add('hidden'); }

// ================================================================ att göra nu
function kolTotal() { return S.coal + LOTS.reduce((a, l) => a + l.waiting, 0) + S.milor.filter(m => m.phase !== 'KLAR').length * CFG.milaYield; }
function todos() {
  const out = [];
  for (const m of S.milor) if (m.fire || (m.phase === 'KOL' && m.drag >= 60)) { out.push({ t: `Täta milan på ${LOTS[m.lot].name}!`, w: 'Röken slår igenom – annars brinner kolet upp. Tryck på milans skylt.', bad: true }); break; }
  const fc = forecastT();
  if (S.fOn && S.frozen <= 0 && (S.T < 1300 || (fc !== null && (fc < 1320 || fc > 1500)) || S.hanging || (!S.autoTap && S.hearth > 80))) out.push({ t: 'Masugnen behöver dig', w: advice(), bad: true });
  if (S.broken > 0 && !S.repairing) out.push({ t: 'Byt hammarskaftet i smedjan', w: 'Smedjan står still tills det är lagat.', bad: true });
  const c = S.contracts.filter(c => !c.done).sort((a, b) => a.due - b.due)[0];
  if (c && S.bar < c.amount) {
    const left = Math.ceil(c.due - S.day), needPig = (c.amount - S.bar) / (CFG.barYield * S.pigQ);
    out.push({ t: `Kontrakt: ${fmtN(S.bar)} av ${c.amount} skp stångjärn`, w: `${left} dagar kvar till leveransen (${c.from}). ` + (S.pig < needPig && !S.fOn ? 'Tackjärnet räcker inte – masugnen måste blåsa.' : 'Låt smedjan arbeta, och sälj inte det järnet.'), bad: left < 25 });
  }
  const kt = kolTotal();
  if (!S.fOn) {
    if (S.wear >= 60 && S.relining <= 0) out.push({ t: 'Mura om masugnen', w: 'Infodringen är för sliten för att tända. Det tar 15 dagar – gör det innan vintern.' });
    else if (S.relining <= 0 && S.coal >= 150) out.push({ t: 'Tänd masugnen', w: S.snow || S.day > 170 ? 'Du har kol nog att börja blåsa. Utan tackjärn blir det inget stångjärn.' : 'Du har kol nog. Många bruk väntade till snön, för då går kolkörningen tre gånger fortare.' });
    if (kt < 500 && S.day < 300) out.push({ t: `Samla kol till vintern: ${fmtN(kt)} av ≈ 500 lass`, w: 'Räknat på kolhuset, det som väntar i skogen och milorna som kolar. Masugnen drar ≈ 10 lass per dygn.' });
  }
  if (freeKolare() > 0 && monthOf(S.day) !== 3 && S.day < 310 && LOTS.some(l => l.milor > 0)) out.push({ t: `Res milor – ${freeKolare()} kolare står sysslolösa`, w: 'Öppna Kolningen och tryck "Res mila". Skiften nära bruket går fortast att köra hem.' });
  if (S.fOn && S.coal < 60) out.push({ t: 'Kolet tar slut snart', w: 'Kör hem kol med fler hästar, res fler milor eller köp kol av bönderna (nedan).', bad: true });
  if (S.money < 500) out.push({ t: 'Kassan är låg', w: 'Sälj stångjärn eller tackjärn nedan, men spara det som behövs till kontrakten.', bad: S.money < 0 });
  if (!out.length) out.push({ t: 'Allt rullar', w: 'Öka farten (2× eller 4×) tills något behöver dig.' });
  return out.slice(0, 3);
}

// ================================================================ så hänger det ihop
function coalPerDay() { return (S.fOn && S.frozen <= 0 ? CFG.descent * CFG.slots * (S.blEff || 0.8) : 0) + S.smithRate * CFG.coalPerSkp; }
function chainHTML() {
  const card = (cls, title, val, st, why, wide) => `<div class="card ${cls} ${wide ? 'wide' : ''}"><h4>${title}<span>${val}</span></h4><div class="st2">${st}</div><div class="why">${why}</div></div>`;
  const arr = (t, wide = true) => `<div class="arr ${wide ? 'wide' : ''}">▼ ${t}</div>`;
  const alarmM = S.milor.some(m => m.fire || (m.phase === 'KOL' && m.drag >= 60));
  const waiting = LOTS.reduce((a, l) => a + l.waiting, 0), active = S.milor.filter(m => m.phase !== 'KLAR').length;
  const cpd = coalPerDay(), days = cpd > 0.5 ? S.coal / cpd : Infinity;
  const fc = forecastT(), ws = waterShare();
  const fBad = S.fOn && (S.frozen > 0 || S.T < 1300 || S.hanging || (fc !== null && fc < 1320));
  const fWarn = S.fOn && (S.T < 1330 || S.T > 1480 || (fc !== null && (fc < 1330 || fc > 1480)) || S.hearth > 80);
  const c = S.contracts.filter(c => !c.done).sort((a, b) => a.due - b.due)[0];
  const cBad = c && S.bar < c.amount && c.due - S.day < 25;
  const daily = CFG.wageBase + CFG.wageSmith + (S.fOn ? CFG.wageFurnace : 0) + S.kolare * (CFG.wageKolare + S.kolWageBonus) + S.horses * CFG.horseCost;
  return `<div class="chain">
    ${card(alarmM ? 'bad' : freeKolare() > 0 && S.day < 310 ? 'warn' : '', '🌲 Skogen', `${active} milor`, alarmM ? '⚠ En mila släpper igenom röken – täta den!' : `${freeKolare()} lediga kolare · ${fmtN(waiting)} lass väntar på körning`, 'Kolarna gör kol av ved i milor (≈ 3 veckor). Fler kolare = fler milor. Hästarna kör hem kolet – 3× fortare på vinterns slädföre.')}
    ${card('', '⛏ Gruvan', `${fmtN(S.ore)} t malm`, `Malmen är ${S.oreQ > 0.57 ? 'rik' : S.oreQ < 0.53 ? 'mager' : 'normal'}`, 'Bryts och rostas av sig själv. Mager malm gör ugnen kallare.')}
    ${arr('kol + malm', false)}${arr('', false)}
    ${card(S.fOn && days < 5 ? 'bad' : S.fOn && days < 15 ? 'warn' : '', '⚫ Kolhuset', `${fmtN(S.coal)} lass`, cpd > 0.5 ? `Räcker ≈ ${days > 99 ? '99+' : Math.round(days)} dygn (går åt ${Math.round(cpd)} lass/dygn)` : 'Inget kol går åt just nu', 'Masugnen äter det mesta av kolet, smedjan lite. Tar kolet slut måste ugnen blåsas ner.', true)}
    ${arr('i masugnen')}
    ${card(fBad ? 'bad' : fWarn ? 'warn' : S.fOn ? '' : 'warn', '🔥 Masugnen', S.fOn ? (S.frozen > 0 ? 'frusen' : `${Math.round(S.T)} °C`) : 'står kall', S.fOn ? advice() : S.relining > 0 ? 'Muras om.' : S.wear >= 60 ? 'Infodringen är sliten – mura om innan du tänder.' : 'Tänd den när du har kol nog (helst på vintern).', `Styrs med <b>malmsatsen</b> (mer malm = kallare, verkar efter ≈ 1 dygn) och <b>blästern</b> (mer luft = varmare, verkar direkt). Blästern drivs av vattenhjulet – får ${Math.round(ws.F * 100)} % vatten nu.`, true)}
    ${arr('tackjärn')}
    ${card('', '🧱 Tackjärn', `${fmtN(S.pig)} skp`, `Tappas ur härden när den är full${S.fOn ? ` (härden ${Math.round(S.hearth)} %)` : ''}`, 'Mellanvara. Kan säljas billigt (8 daler), men är värt dubbelt som stångjärn.', true)}
    ${arr('i smedjan')}
    ${card(S.broken > 0 ? 'bad' : S.pig < 1 ? 'warn' : '', '🔨 Smedjan', `${Math.round(S.smithRate * CFG.barYield * S.pigQ)} skp/dag`, S.broken > 0 ? 'Hammarskaftet är trasigt!' : S.pig < 1 ? 'Inget tackjärn att smida' : `Får ${Math.round(ws.S * 100)} % vatten`, 'Vattenhammaren gör stångjärn av tackjärn. Den <b>delar vattnet</b> med masugnen – välj i smedjan vem som går först när ån är låg.', true)}
    ${arr('stångjärn')}
    ${card(cBad ? 'bad' : '', '💰 Kunderna', `${fmtN(S.bar)} skp stångjärn`, c ? `Nästa kontrakt: ${c.amount} skp om ${Math.ceil(c.due - S.day)} dagar (${c.price} daler/skp)` : `Järnvågen betalar ${Math.round(S.price)} daler/skp just nu`, 'Kontrakt betalar bäst men måste levereras i tid. Järnvågen köper när som helst till dagspris.', true)}
    ${arr('pengar')}
    ${card(S.money < 0 ? 'bad' : S.money < 800 ? 'warn' : '', '🏦 Kassan', `${fmtN(S.money)} daler`, `Kostar ${fmtN(daily)} daler per dag`, 'Löner till masbruk, smeder och kolare plus hästfoder. Pengar kommer bara in när du säljer järn.', true)}
  </div>`;
}
let chainPrev = null;
function openChain() { if (S.tut) S.tut.chainOpened = true; if ($('chain').classList.contains('hidden')) { chainPrev = S.speed; S.speed = 0; refreshSpeed(); } $('chainBody').innerHTML = chainHTML(); $('chain').classList.remove('hidden'); }
$('chainBtn').onclick = openChain;
$('chainClose').onclick = () => { $('chain').classList.add('hidden'); S.speed = chainPrev ?? 1; refreshSpeed(); };

// ================================================================ lärotiden
const ratioOk = () => Math.abs(S.ratio - recRatio()) < 0.06;
const TUT = [
  { title: 'Välkommen till bruket', read: true, html: () => `<p>Det är december och masugnen brinner. Jag är masmästaren. Jag visar dig hur bruket fungerar, <b>en sak i taget</b>.</p><p>Spelet står still medan du läser. Du kan inte förstöra något under lärotiden.</p>` },
  { title: 'Masugnen', read: true, open: 'F', focus: 'tempBox', html: () => `<p>Siffran är <b>värmen i härden</b>, längst ner i ugnen där järnet smälter.</p><ul><li><b>Grönt (1 330–1 480 °C)</b> är bra.</li><li><b>För kallt:</b> järnet stelnar och ugnen fryser. Det kostar 8 dagar och mycket pengar.</li><li><b>För varmt:</b> du slösar kol och sliter ut ugnen.</li></ul>` },
  { title: 'Schaktet', read: true, focus: 'shaftWrap', html: () => `<p>Ugnen fylls uppifrån med <b>satser</b>: ett lass kol plus lite malm. De sjunker sakta ner genom schaktet och smälter i botten.</p><p><b>Det tar ungefär ett dygn.</b> Därför märks det du ändrar först senare – ungefär som att styra ett stort skepp.</p>` },
  { title: 'Malmsatsen', focus: 'ctlRatio', html: () => `<p><b>Malmsatsen</b> är hur mycket malm du lägger på varje lass kol. Mer malm ger mer järn – men kolet räcker inte till att värma lika mycket, så <b>ugnen blir kallare</b>.</p>`, task: 'Prova: dra malmsatsen åt höger till 1,40.', done: () => S.ratio >= 1.38 },
  { title: 'Vänta och se', speed: 2, focus: 'rowFcast', html: () => `<p>Titta i schaktet: de nya satserna är ljusare, eftersom de har mer malm. <b>Prognosen</b> visar redan vad värmen blir när de når botten.</p><p>Nu låter vi tiden gå. Håll ögonen på värmen…</p>`, task: () => `Väntar tills ugnen blir sval (under 1 330 °C) – nu ${Math.round(S.T)} °C.`, done: () => S.T < 1330 },
  { title: 'Den blev kall!', focus: 'ctlBlast', html: () => `<p>Där ser du: satserna med mycket malm kom ner, och ugnen svalnade. Spelet är pausat.</p><p>Det snabbaste botemedlet är <b>blästern</b> – bälgarna som blåser in luft i ugnen. Mer luft ger hetare eld, och <b>det verkar direkt</b>.</p>`, task: 'Dra blästern till 100 %.', done: () => S.blast >= 0.95 },
  { title: 'Masmästarens råd', focus: 'advBox', html: () => `<p>Blästern hjälper på en gång, men orsaken är fortfarande malmsatsen. Den blå rutan räknar alltid ut <b>lagom malmsats</b> för malmen och blästern du har just nu.</p>`, task: 'Tryck på knappen "Sätt malmsats" i den blå rutan.', done: () => ratioOk() && S.ratio < 1.3 },
  { title: 'Tillbaka i det gröna', speed: 2, focus: 'tempBox', html: () => `<p>Nu sjunker satser med mer kol ner genom schaktet. Om en stund når de härden.</p>`, task: () => `Väntar tills värmen är över 1 340 °C – nu ${Math.round(S.T)} °C.`, done: () => S.T >= 1340 },
  { title: 'Tappa härden', speed: 1, focus: 'sectHearth', html: () => `<p>Järnet och slaggen samlas i <b>härden</b>. När den blir full måste du <b>tappa</b>: öppna hålet så att det glödande järnet rinner ut i sandbädden.</p><p>Tappar du inte når slaggen blästerhålen, och ugnen kyls ner snabbt.</p>`, task: () => S.hearth < 80 ? `Vänta tills härden är över 80 % (nu ${Math.round(S.hearth)} %), tryck sedan "Tappa härden".` : 'Tryck "Tappa härden" nu!', done: () => (S.stats.taps || 0) >= 1, enter: () => { S.autoTap = false; $('autoTap').checked = false; } },
  { title: 'Tackjärn', focus: 'autoTapL', html: () => `<p>Det där är <b>tackjärn</b> – bruksets mellanvara. Det hamnar i lagret till höger.</p><p>Tappningen är rutin, så masmästaren kan sköta den åt dig.</p>`, task: 'Kryssa i "Masmästaren tappar själv".', done: () => S.autoTap },
  { title: 'Det viktigaste om masugnen', read: true, html: () => `<ul><li><b>För kall?</b> Höj blästern (verkar direkt) och sänk malmsatsen (verkar efter ett dygn).</li><li><b>För varm?</b> Höj malmsatsen.</li><li><b>Prognosen</b> varnar innan det händer.</li><li><b>Osäker?</b> Gör som masmästaren säger i den blå rutan.</li></ul><p>Malmen och vattnet ändras hela tiden, så ugnen behöver tillsyn då och då.</p>` },
  { title: 'Hammarsmedjan', read: true, unlock: 'S', open: 'S', html: () => `<p>Tackjärn är för sprött för att ge bra betalt. I smedjan värms det och bearbetas under en stor, vattendriven hammare till <b>stångjärn</b> – det som kunderna vill ha.</p><p>Smedjans hammare och masugnens bälgar drivs båda av vattenhjul i ån, så de <b>delar på vattnet</b>. När ån är låg väljer du här vem som får vattnet först.</p>` },
  { title: 'Smid stångjärn', speed: 2, focus: 'rowBar', html: () => `<p>Smedjan arbetar av sig själv så länge den har tackjärn, kol och vatten. Stångjärnet hamnar i lagret till höger.</p>`, task: () => `Vänta tills du har 15 skp stångjärn (nu ${Math.floor(S.bar)}).`, done: () => S.bar >= 15 },
  { title: 'Sälj', focus: 'sellBtn', html: () => `<p>Stångjärn är pengar. Du kan sälja direkt på <b>järnvågen</b> till dagspriset, eller spara det till <b>kontrakt</b>. Kontrakten betalar bättre men har ett slutdatum.</p>`, task: 'Tryck "Sälj 50 skp stångjärn".', done: () => (S.stats.sold || 0) >= 1 },
  { title: 'Kassan', read: true, focus: 'moneyBox', html: () => `<p>Varje dag går pengar till löner och hästfoder – raden under kassan visar hur mycket. Masugnen kostar mest när den brinner.</p><p>Pengar kommer <b>bara</b> in när du säljer järn. Bruket måste alltså producera hela tiden.</p>` },
  { title: 'Kolet', unlock: 'K', open: 'K', focus: 'lots', html: () => `<p>Sist men viktigast: <b>kolet</b>. Masugnen äter ungefär 10 lass kol per dygn. Kolet görs av ved i <b>milor</b> ute i skogen, och varje kolare sköter en mila.</p>`, task: 'Res en mila i Bruksskogen (översta raden).', done: () => S.milor.length >= 1 },
  { title: 'Milan reses', speed: 4, focus: 'milor', html: () => `<p>Kolaren staplar veden och täcker den med jord och granris. Sedan tänds den, och veden kolar långsamt i ungefär 16 dagar.</p><p>Vi spolar fram (4×)…</p>`, task: () => { const m = S.milor[0]; return m ? `Milan: ${m.phase === 'BYGG' ? `reses ${Math.round(m.t / CFG.milaBuild * 100)} %` : 'tänd!'}` : ''; }, done: () => S.milor.some(m => m.phase === 'KOL') },
  { title: 'Röken slår igenom!', focus: 'milor', enter: () => { const m = S.milor.find(m => m.phase === 'KOL'); if (m) m.drag = 74; }, html: () => `<p>En mila måste pyra långsamt utan lågor. Blåser det, eller sjunker täckningen, får milan för mycket drag. Då slår röken igenom, och till slut brinner kolet upp.</p><p>Röd stapel betyder att kolaren måste <b>täta</b> milan. Milans skylt ute i skogen blinkar också.</p>`, task: 'Tryck "Täta milan".', done: () => S.milor.every(m => m.phase !== 'KOL' || m.drag < 30) },
  { title: 'Kolkörningen', read: true, html: () => `<p>När milan är klar körs kolet till kolhuset med häst. På vintern, med slädföre, går det <b>tre gånger fortare</b>.</p><p>Fler kolare och hästar ger mer kol, men alla vill ha lön.</p>` },
  { title: 'Hela bruket på en bild', focus: 'chainBtn', html: () => `<p>Knappen <b>📖 Så hänger det ihop</b> i listen överst visar hela kedjan, vad som styr vad och hur det går just nu.</p>`, task: 'Öppna den.', done: () => S.tut.chainOpened && $('chain').classList.contains('hidden'), doneTxt: 'Stäng den när du har tittat klart.' },
  { title: 'Nu kan du grunderna!', final: true, focus: 'todo', html: () => `<p>I det riktiga bruksåret börjar du i <b>juni</b>, med kall masugn och nästan tomt kolhus. Ett bruksår går till så här:</p><ul><li><b>Sommar och höst:</b> res milor och samla kol. Mura om masugnen.</li><li><b>Vinter:</b> tänd masugnen och blås tackjärn medan kolet räcker.</li><li><b>Hela året:</b> smedjan gör stångjärn, och kontrakten ska levereras i tid.</li></ul><p>Rutan <b>Att göra nu</b> uppe till höger säger alltid vad som är viktigast.</p>` },
];
function startTut() {
  $('intro').classList.add('hidden');
  Object.assign(S, { day: 190, snowStart: 150, snow: true, fOn: true, T: 1405, ratio: 1.1, blast: 0.8, hearth: 22, wear: 10, ansats: 4, coal: 320, ore: 200, pig: 60, bar: 0, money: 3000, autoTap: false, warnedCold: true, water: 0.9 });
  S.shaft = []; for (let i = 0; i < CFG.slots; i++) S.shaft.push({ pos: i / CFG.slots, r: 1.1, q: S.oreQ });
  $('ratio').value = S.ratio; $('blast').value = S.blast; $('autoTap').checked = false;
  S.tut = { i: -1, locked: new Set(['K', 'S']), chainOpened: false };
  $('todo').classList.add('hidden'); $('coach').classList.remove('hidden');
  applySeason(); S.running = true; tutGo(0);
}
function tutGo(i) {
  const t = S.tut; t.i = i; const st = TUT[i];
  document.querySelectorAll('.hl').forEach(e => e.classList.remove('hl'));
  if (st.unlock) t.locked.delete(st.unlock);
  for (const k of ['F', 'K', 'S']) $('st' + k).classList.toggle('locked', t.locked.has(k));
  if (st.open && S.open !== st.open) openStation(st.open);
  st.enter && st.enter();
  S.speed = st.speed || 0; refreshSpeed();
  $('coachStep').textContent = `Lärotiden · steg ${i + 1} av ${TUT.length}`;
  $('coachTitle').textContent = st.title; $('coachText').innerHTML = st.html() + (st.task ? '<div class="do" id="coachTask"></div>' : '');
  $('coachBtns').innerHTML = '';
  if (st.read || st.final) {
    const b = document.createElement('button'); b.className = 'btn ' + (st.final ? 'big' : 'fire');
    b.textContent = st.final ? 'Börja bruksåret 1780' : 'Fortsätt →';
    b.onclick = st.final ? endTut : () => tutGo(i + 1); $('coachBtns').appendChild(b);
  }
  if (st.focus) { const el = $(st.focus); el.classList.add('hl'); setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 400); }
  tutTick();
}
function tutTick() {
  const t = S.tut; if (!t || t.i < 0) return; const st = TUT[t.i];
  for (const k of ['K', 'S']) if (t.locked.has(k)) $('sum' + k).textContent = '🔒 kommer senare';
  if (st.task) { const el = $('coachTask'); const txt = typeof st.task === 'function' ? st.task() : st.task; const show = st.doneTxt && t.chainOpened ? st.doneTxt : txt; if (el && el.textContent !== '👉 ' + show) el.textContent = '👉 ' + show; }
  if (st.done && st.done()) {
    if (st.speed) { S.speed = 0; refreshSpeed(); }
    const next = t.i + 1; t.i = -2; const el = $('coachTask'); if (el) { el.textContent = '✔ Bra!'; el.classList.add('ok'); }
    setTimeout(() => tutGo(next), 900);
  }
}
function endTut() { try { localStorage.setItem('bruk_tut', '1'); } catch (e) {} location.href = location.pathname + '?ar'; }
$('coachSkip').onclick = () => { if (confirm('Hoppa över lärotiden och börja bruksåret?')) endTut(); };

// etiketter för milor i 3D
const labelsEl = $('labels');
const v3 = new THREE.Vector3();
function updateLabels() {
  const want = new Set(S.milor);
  for (const m of S.milor) {
    if (!m.label) { m.label = document.createElement('div'); m.label.className = 'lbl'; m.label.onclick = () => { if (m.fire || m.drag >= 60) tata(m); else openStation('K'); }; labelsEl.appendChild(m.label); }
    const txt = milaText(m);
    if (m.label._t !== txt.t) { m.label.textContent = txt.t; m.label._t = txt.t; }
    m.label.classList.toggle('alarm', txt.alarm);
    v3.copy(m.group.position); v3.y += 7; v3.project(camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
    m.label.style.display = vis ? '' : 'none';
    m.label.style.left = `${(v3.x + 1) / 2 * innerWidth}px`; m.label.style.top = `${(1 - v3.y) / 2 * innerHeight}px`;
  }
  for (const el of [...labelsEl.children]) if (![...want].some(m => m.label === el)) el.remove();
}
function milaText(m) {
  const n = LOTS[m.lot].name;
  if (m.phase === 'BYGG') return { t: `${n}: reses ${Math.round(m.t / CFG.milaBuild * 100)} %`, alarm: false };
  if (m.phase === 'KOL') return m.fire ? { t: `🔥 ${n}: BRINNER – täta!`, alarm: true } : { t: `${n}: kolar ${Math.round(m.t / CFG.milaBurn * 100)} %${m.drag >= 60 ? ' · ⚠ rök slår igenom – täta!' : ''}`, alarm: m.drag >= 60 };
  if (m.phase === 'SVAL') return { t: `${n}: svalnar`, alarm: false };
  return { t: `${n}: klar`, alarm: false };
}
function tempWord(T) { return T < 1200 ? 'fryser' : T < 1300 ? 'kall' : T < 1330 ? 'sval' : T <= 1480 ? 'bra' : T < 1520 ? 'het' : 'för het'; }
function updateUI() {
  $('date').textContent = dateStr(S.day);
  const left = CFG.yearDays - S.day;
  $('season').textContent = `${seasonName(S.day)} · ${Math.max(0, Math.ceil(left))} dagar kvar av året`;
  $('weather').textContent = `${S.snow ? '❄ slädföre' : monthOf(S.day) >= 5 && monthOf(S.day) <= 7 ? '☀' : '🌧'} · vind ${S.wind > 0.7 ? 'hård' : S.wind > 0.4 ? 'måttlig' : 'svag'}`;
  // masugn
  const fAlarm = S.fOn && (S.T < 1300 || S.hearth > 80 || S.hanging || S.T > 1500);
  $('sumF').innerHTML = (S.relining > 0 ? `muras om – ${Math.ceil(S.relining)} d` : !S.fOn ? 'står kall' : S.frozen > 0 ? 'frusen' : `blåser · ${Math.round(S.T)} °C`) + (fAlarm ? '<span class="badge">!</span>' : '');
  $('fOff').classList.toggle('hidden', S.fOn); $('fOn').classList.toggle('hidden', !S.fOn);
  $('fOffTxt').textContent = S.relining > 0 ? `Murarna arbetar – klart om ${Math.ceil(S.relining)} dagar.` : S.wear >= 60 ? 'Infodringen är för sliten för att tända. Mura om först.' : `Redo att tändas. Kräver minst 40 lass kol. Masugnen drar ungefär ${Math.round(CFG.descent * CFG.slots * 0.8)} lass kol per dygn.`;
  $('wearOff').textContent = `${Math.round(S.wear)} %`;
  $('lightBtn').disabled = S.relining > 0 || S.wear >= 60; $('relineBtn').disabled = S.relining > 0 || S.wear < 5;
  if (S.fOn) {
    const T = S.T; $('temp').textContent = S.frozen > 0 ? '—' : Math.round(T);
    const tr = T - S.Tprev; $('trend').textContent = S.frozen > 0 ? 'frusen' : `${tr > 1.5 ? '▲' : tr < -1.5 ? '▼' : '●'} ${tempWord(T)}`;
    $('trend').style.color = T < 1300 || T > 1500 ? 'var(--bad)' : T < 1330 || T > 1480 ? 'var(--warn)' : 'var(--ok)';
    $('tmark').style.left = `${clamp((T - 1100) / 460, 0, 1) * 100}%`;
    const fc = forecastT();
    $('fcast').textContent = fc === null ? '—' : `≈ ${Math.round(fc)} °C ${fc < S.T - 15 ? '▼' : fc > S.T + 15 ? '▲' : '●'}`;
    $('fcast').style.color = fc === null ? '' : fc < 1300 || fc > 1500 ? 'var(--bad)' : fc < 1330 || fc > 1480 ? 'var(--warn)' : 'var(--ok)';
    const adv = advice(); if ($('advice').textContent !== adv) $('advice').textContent = adv;
    $('followBtn').textContent = `Sätt malmsats ${recRatio().toFixed(2).replace('.', ',')}`;
    $('flame').textContent = S.frozen > 0 ? 'Härden bryts upp.' : `Gichtflamman ${T < 1260 ? 'mörkröd och osande' : T < 1330 ? 'röd och slö' : T < 1480 ? 'livlig, gulröd' : 'vitgul och skarp'} · slaggen ${T < 1300 ? 'seg' : T < 1480 ? 'lättflytande' : 'tunn'}`;
    let html = S.shaft.map(c => { const k = clamp((c.r - 0.6) / 1.2, 0, 1); return `<div class="ch" style="top:${clamp(c.pos, 0, 0.95) * 100}%;background:rgb(${28 + k * 112},${23 + k * 51},${20 + k * 24})"></div>`; }).join('');
    if (S.hanging) html += '<div class="hang"></div>'; $('shaft').innerHTML = html;
    const bl = S.blEff || 0;
    $('shaftTime').textContent = S.hanging ? '⚠ Hänger!' : bl > 0.05 ? `≈ ${(1 / (CFG.descent * bl)).toFixed(1).replace('.', ',')} dygn genom schaktet` : '';
    $('ansatsTxt').textContent = `${Math.round(S.ansats)} %`; $('ansats').style.width = `${S.ansats}%`;
    $('hearthTxt').textContent = S.tapping > 0 ? 'tappar…' : `${Math.round(S.hearth)} %`; $('hearth').style.width = `${clamp(S.hearth, 0, 100)}%`;
    $('hearth').style.background = S.hearth > 92 ? 'var(--bad)' : 'var(--fire)';
    $('wearTxt').textContent = `${Math.round(S.wear)} %`;
    $('ratioTxt').textContent = `${S.ratio.toFixed(2).replace('.', ',')} per lass kol`;
    const wf = waterShare().F;
    $('blastTxt').textContent = `${Math.round(S.blast * 100)} %${S.blast > wf + 0.01 ? ` (vattnet räcker till ${Math.round(wf * 100)} %)` : ''}`;
    const tb = $('tapBtn'); tb.disabled = S.tapping > 0 || S.frozen > 0 || S.hearth < 10; tb.classList.toggle('pulse', S.hearth > 78 && !tb.disabled);
    $('pokeBtn').disabled = !S.hanging;
  }
  // kolning
  const alarms = S.milor.filter(m => m.fire || (m.phase === 'KOL' && m.drag >= 60)).length;
  const active = S.milor.filter(m => m.phase !== 'KLAR').length;
  $('sumK').innerHTML = `${active} milor · ${freeKolare()} lediga kolare` + (alarms ? `<span class="badge">${alarms}</span>` : '');
  $('kolN').textContent = S.kolare; $('horseN').textContent = S.horses;
  const waiting = LOTS.reduce((a, l) => a + l.waiting, 0);
  $('haulTxt').textContent = `${S.snow ? 'Slädföre: kolkörningen går fort.' : 'Barmark: kolkörningen går långsamt (vagn).'} ${Math.round(waiting)} lass kol väntar i skogen.`;
  const mhtml = S.milor.filter(m => m.phase !== 'KLAR').map((m, i) => {
    const pr = m.phase === 'BYGG' ? m.t / CFG.milaBuild : m.phase === 'KOL' ? m.t / CFG.milaBurn : m.t / CFG.milaCool;
    const ph = { BYGG: 'Reses', KOL: m.fire ? '🔥 BRINNER' : 'Kolar', SVAL: 'Svalnar' }[m.phase];
    const alarm = m.fire || (m.phase === 'KOL' && m.drag >= 60);
    return `<div class="mila ${alarm ? 'alarm' : ''}"><div class="t"><b>${LOTS[m.lot].name}</b><span>${ph} ${Math.round(pr * 100)} %</span></div>
      ${m.phase === 'KOL' ? `<div class="row small" style="margin:3px 0 2px"><span>Drag i milan${m.loss > 0 ? ` · ${Math.round(m.loss * 100)} % förlorat` : ''}</span></div><div class="meter"><i style="width:${m.drag}%;background:${m.drag >= 60 ? 'var(--bad)' : 'var(--warn)'}"></i></div>
      <div class="btns"><button class="btn sm ${alarm ? 'fire pulse' : ''}" data-tata="${S.milor.indexOf(m)}" ${m.drag < 35 && !m.fire ? 'disabled' : ''}>Täta milan</button></div>` : ''}</div>`;
  }).join('') || '<p class="small">Inga milor igång.</p>';
  if ($('milor')._h !== mhtml) { $('milor').innerHTML = mhtml; $('milor')._h = mhtml; $('milor').querySelectorAll('[data-tata]').forEach(b => b.onclick = () => tata(S.milor[+b.dataset.tata])); }
  const lhtml = LOTS.map((l, i) => `<div class="lot"><span><b>${l.name}</b> · ${l.d.toString().replace('.', ',')} km · ${l.milor} milor kvar${l.waiting > 0.5 ? ` · <span style="color:var(--warn)">${Math.round(l.waiting)} lass väntar</span>` : ''}</span><button class="btn sm" data-lot="${i}" ${l.milor <= 0 || freeKolare() <= 0 ? 'disabled' : ''}>Res mila</button></div>`).join('');
  if ($('lots')._h !== lhtml) { $('lots').innerHTML = lhtml; $('lots')._h = lhtml; $('lots').querySelectorAll('[data-lot]').forEach(b => b.onclick = () => startMila(+b.dataset.lot)); }
  // smedja
  const ws = waterShare().S;
  $('sumS').innerHTML = (S.broken > 0 ? (S.repairing ? 'lagas…' : 'trasig') : S.pig < 0.5 ? 'inget tackjärn' : `${Math.round(S.smithRate * CFG.barYield * S.pigQ)} skp/dag`) + (S.broken > 0 && !S.repairing ? '<span class="badge">!</span>' : '');
  $('smithTxt').textContent = S.broken > 0 ? (S.repairing ? 'Smeden byter hammarskaftet…' : 'Hammarskaftet har spruckit!') : `Vatten till smedjan: ${Math.round(ws * 100)} %. Tackjärnet är ${S.pigQ > 0.95 ? 'grått' : S.pigQ > 0.85 ? 'halvgrått' : 'vitt'} – ${Math.round(CFG.barYield * S.pigQ * 100)} % blir stångjärn.`;
  $('repairBtn').classList.toggle('hidden', !(S.broken > 0 && !S.repairing));
  // höger
  $('money').textContent = S.money < 0 ? `${fmtN(S.money)} daler (lån)` : `${fmtN(S.money)} daler`; $('money').style.color = S.money < 0 ? 'var(--bad)' : '';
  const daily = CFG.wageBase + CFG.wageSmith + (S.fOn ? CFG.wageFurnace : 0) + S.kolare * (CFG.wageKolare + S.kolWageBonus) + S.horses * CFG.horseCost;
  $('costTxt').textContent = `Löner och foder: ${fmtN(daily)} daler/dag`;
  $('coal').textContent = `${fmtN(S.coal)} lass`;
  $('coalForest').textContent = waiting > 0.5 ? `+ ${fmtN(waiting)} lass väntar i skogen` : '';
  $('ore').textContent = `${fmtN(S.ore)} t`; $('pig').textContent = `${fmtN(S.pig)} skp`; $('bar').textContent = `${fmtN(S.bar)} skp`;
  $('water').style.width = `${clamp(S.water / 1.3, 0, 1) * 100}%`;
  $('waterTxt').textContent = `${S.water < 0.6 ? 'Lågt vatten' : S.water > 1.1 ? 'Högt vatten' : 'Normalt vatten'} – masugnen får ${Math.round(waterShare().F * 100)} %, smedjan ${Math.round(ws * 100)} %${S.frostLeft > 0 ? ' · ❄ isigt' : ''}${S.droughtLeft > 0 ? ' · torka' : ''}`;
  $('contracts').innerHTML = S.contracts.filter(c => !c.done).map(c => `<div class="row"><span>${c.amount} skp till ${dateStr(c.due).replace(/ 17\d\d/, '')}</span><b>${c.price} d/skp</b></div><div class="meter"><i style="width:${clamp(S.bar / c.amount, 0, 1) * 100}%;background:var(--ok)"></i></div>`).join('') || '<div class="small">Inga öppna kontrakt.</div>';
  $('price').textContent = `${Math.round(S.price)} daler/skp`;
  $('sellBtn').disabled = S.bar < 1; $('sellPigBtn').disabled = S.pig < 1;
  if (!S.tut) { const th = todos().map(x => `<div class="item ${x.bad ? 'bad' : ''}"><b>${x.t}</b><span>${x.w}</span></div>`).join(''); if ($('todoList')._h !== th) { $('todoList').innerHTML = th; $('todoList')._h = th; } }
  else tutTick();
  if (!$('chain').classList.contains('hidden')) { const ch = chainHTML(); if ($('chainBody')._h !== ch) { $('chainBody').innerHTML = ch; $('chainBody')._h = ch; } }
}

// ================================================================ årstider & effekter
let barCool = 0, lastSeason = '';
function applySeason() {
  const winter = S.snow || (monthOf(S.day) >= 11 || monthOf(S.day) <= 1) && S.day >= S.snowStart - 3;
  const m = monthOf(S.day);
  const key = winter ? 'W' : m >= 8 && m <= 10 ? 'A' : m === 3 || m === 4 ? 'P' : 'S';
  if (key === lastSeason) return; lastSeason = key;
  groundMat.map = winter ? snowTex : grassTex; groundMat.color.set(key === 'A' ? 0xb9a27a : key === 'P' ? 0xa79c74 : 0xffffff); groundMat.needsUpdate = true;
  snowCaps.visible = winter;
  mats.roofTop.color.set(winter ? 0xeef2f8 : 0x3e3a37);
  birchTops.material.color.set(key === 'A' ? 0xd29a32 : key === 'W' ? 0x6a5a4a : key === 'P' ? 0xa7c070 : 0x7ea24a);
  birchTops.visible = key !== 'W';
  ice.visible = winter; riverWater.visible = !winter;
  prec.material.size = winter ? 0.3 : 0.12; prec.material.color.set(winter ? 0xffffff : 0x9fb3c8);
  scene.fog.color.set(winter ? 0xb9c3d3 : key === 'A' ? 0xb7b5ad : 0xc7d3dc);
  skyU.top.value.set(winter ? 0x4a6fae : 0x4f86cf); skyU.hor.value.set(winter ? 0xf6d0b0 : 0xf2e2c8);
  sun.intensity = winter ? 1.5 : 2.1; hemi.intensity = winter ? 1.05 : 0.95;
}
function smokeSources() {
  const src = [[18, 20, 31, 0.5]];
  if (S.fOn && S.frozen <= 0) src.push([FX - 1, 19, FZ - 1, 1]);
  if (S.smithRate > 0.1) src.push([51, 10.5, -14, 0.8]);
  for (const m of S.milor) if (m.phase === 'KOL' || m.phase === 'SVAL') { const p = m.group.position; src.push([p.x, p.y + 3, p.z, m.fire ? 1.6 : 0.8]); }
  return src;
}
function updateVisuals(dt, simDays) {
  applySeason();
  const on = S.fOn && S.frozen <= 0, T = on ? S.T : 900, heat = clamp((T - 1150) / 400, 0, 1);
  gicht.visible = on; const fl = 0.85 + Math.sin(performance.now() / 90) * 0.1 + Math.random() * 0.08;
  gicht.scale.setScalar((5 + heat * 7) * fl); gicht.material.color.setHSL(0.03 + heat * 0.08, 1, 0.45 + heat * 0.15);
  archGlow.material.opacity = on ? 0.5 + heat * 0.5 : 0.05; archLight.intensity = on ? 15 + heat * 45 : 0;
  const sh = waterShare(), spd = S.running ? Math.max(0.3, S.speed) : 0.2;
  wheelF.rotation.x -= dt * (S.fOn ? sh.F : 0) * 1.2 * spd;
  wheelH.rotation.x -= dt * (S.smithRate > 0.1 ? sh.S : 0) * 1.0 * spd;
  tapLight.intensity = S.tapping > 0 ? 60 + Math.random() * 30 : barCool * 25;
  barCool = Math.max(0, barCool - simDays * 2.2); pigBars.forEach((b, i) => b.material.emissiveIntensity = Math.max(0, barCool * 2.2 - i * 0.05));
  smithyGlow.visible = S.smithRate > 0.1; smithyGlow.material.opacity = 0.4 + Math.random() * 0.3;
  coalPile.scale.setScalar(clamp(S.coal / 300, 0.1, 1.6));
  for (const m of S.milor) {
    m.stack.visible = m.phase === 'BYGG'; m.dome.visible = m.phase === 'KOL' || m.phase === 'SVAL'; m.heap.visible = m.phase === 'KLAR';
    if (m.phase === 'BYGG') m.stack.scale.y = clamp(m.t / CFG.milaBuild, 0.15, 1);
    m.dome.material.color.set(m.fire ? 0x5a2a16 : m.drag >= 60 ? 0x4a3a2c : 0x3d3026);
    m.flame.material.opacity = m.fire ? 0.7 + Math.random() * 0.3 : m.drag >= 80 ? 0.25 : 0;
  }
  // rök
  const src = smokeSources();
  for (let i = 0; i < SMOKE_N; i++) {
    smokeLife[i] -= dt * 0.12;
    if (smokeLife[i] <= 0) {
      const s = src[i % src.length]; smokeSrcI[i] = i % src.length;
      smokePos[i * 3] = s[0] + (Math.random() - 0.5); smokePos[i * 3 + 1] = s[1]; smokePos[i * 3 + 2] = s[2] + (Math.random() - 0.5); smokeLife[i] = s[3] > 1 ? 1 : 0.6 + 0.4 * s[3];
    }
    smokePos[i * 3] += dt * (1.2 + S.wind * 3); smokePos[i * 3 + 1] += dt * 2.4; smokePos[i * 3 + 2] += dt * 0.6;
    smokeA[i] = smokeLife[i];
  }
  smokeGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.alpha.needsUpdate = true;
  // nederbörd
  const m = monthOf(S.day), precip = S.snow ? 1 : (m >= 8 && m <= 10) || S.thawLeft > 0 ? 0.6 : 0;
  prec.visible = precip > 0;
  if (precip > 0) {
    const fall = S.snow ? 2.2 : 18;
    for (let i = 0; i < PREC_N; i++) { let y = precPos[i * 3 + 1] - dt * fall; if (y < 0) y += 80; precPos[i * 3 + 1] = y; }
    precGeo.attributes.position.needsUpdate = true; prec.position.set(controls.target.x, controls.target.y - 10, controls.target.z);
  }
  // släde/vagn
  if (sledT >= 0 && sledFrom) {
    sledT += dt * 0.07;
    if (sledT >= 1) { sledT = -1; sled.visible = false; }
    else { const to = new THREE.Vector3(-24, 0, 27); const p = sledFrom.clone().lerp(to, sledT); p.y = groundH(p.x, p.z); sled.position.copy(p); sled.rotation.y = -Math.atan2(to.z - sledFrom.z, to.x - sledFrom.x); sled.visible = true; }
  }
  // kameraflygning
  if (fly) {
    const k = Math.min(1, (performance.now() - fly.t0) / 1200), e = k * k * (3 - 2 * k);
    controls.target.lerpVectors(fly.fromT, fly.t, e); camera.position.lerpVectors(fly.fromP, fly.p, e);
    if (k >= 1) fly = null;
  }
}

// ================================================================ loop
const clock = new THREE.Clock();
let uiT = 0, trT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  let simDays = 0;
  if (S.running && !S.over && S.speed > 0) {
    simDays = dt / (S.fOn ? CFG.secDayOn : CFG.secDayOff) * S.speed * (window.__ts || 1);
    const n = Math.ceil(simDays / 0.01);
    for (let i = 0; i < n && !S.over; i++) step(simDays / n);
    checkEvents();
    if (S.day >= CFG.yearDays) endYear();
  }
  trT += dt; if (trT > 0.8) { S.Tprev = S.Tlast; S.Tlast = S.T; trT = 0; }
  updateVisuals(dt, simDays);
  controls.update();
  renderer.render(scene, camera);
  updateLabels();
  uiT += dt; if (uiT > 0.12) { uiT = 0; updateUI(); }
}
applySeason(); updateUI(); frame();
window.__y = { step, S, CFG, LOTS, tap, poke, tata, startMila, lightFurnace, blowDown, openStation, recRatio, advice, forecastT, todos, chainHTML, TUT };
