// Bruket – känslotest: en vintersäsong vid en träkolsmasugn (prototyp, slängkod). Se README.md.
// Fakta bakom: design/research/bruket-referens.md
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ================================================================ inställningar (förenklade, spelbalans)
const CFG = {
  secPerDay: 6,                 // realtid per speldag vid 1×
  seasonDays: 90,
  slots: 8,                     // satser i schaktet
  descent: 1.1,                 // schakthöjder per dag vid full bläster
  orePerCharge: 0.6,            // ton malm per enhet malmsats
  skpPerTon: 7.35,              // 1 skeppund ≈ 136 kg
  hearthPerCharge: 4.2,         // % härdfyllnad per smält sats (vid malmsats 1,1)
  tapTime: 0.15,                // dagar
  freezeT: 1200, freezeHold: 0.45, hardFreezeT: 1140,
  freezeRepairDays: 8, freezeRepairCost: 350,
  wearT: 1500,
  mineOre: 6.2,                 // ton rå malm per dag från gruvan
  roast: { N: { rate: 6.4, q: 0.0 }, G: { rate: 4.0, q: 0.05 } },
  hammerCap: 15,                // skp tackjärn per dag vid fullt vatten
  hammerCoal: 1.2,              // lass per dag
  wages: 90,                    // daler per dag (masmästare, smeder, uppsättare, gruvdrängar)
  coalCost: 4,                  // daler per lass som kolarna kör in
  coalPrice: 6,
  contract: { amount: 750, day: 80, price: 16, advance: 3000 },
  pigPrice: 6,
};

// ================================================================ simuleringens tillstånd
const S = {
  day: 0, speed: 1, running: false, over: false,
  T: 1370, Tprev: 1370, ratio: 1.1, blast: 0.8, waterCap: 1.0, iceCut: false,
  shaft: [], hearth: 18, hearthQ: 0, hearthIron: 0, tapping: 0, ansats: 4, wear: 0,
  hanging: 0, hangSlip: 0, frozen: 0, coldTime: 0,
  coal: 300, rawOre: 30, ore: 120, oreQ: 0.55, mineQBonus: 0, oreDrift: 0, roastMode: 'N',
  pig: 0, pigQ: 1, bar: 0, money: 1500,
  price: 12.5, contract: null, delivered: 0,
  deliveries: true, events: [], firedEvents: new Set(),
  stats: { produced: 0, freezes: 0, hangs: 0, coalBought: 0, sold: 0, income: 0 },
  hint: {},
};
const r2 = x => Math.round(x * 100) / 100;
for (let i = 0; i < CFG.slots; i++) S.shaft.push({ pos: i / CFG.slots, r: 1.1, q: 0.55 });

// ================================================================ 3D-scen
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb9c3d3, 160, 650);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 3000);
camera.position.set(-40, 21, -44);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(3, 7, 2); controls.enableDamping = true; controls.maxPolarAngle = 1.45; controls.minDistance = 12; controls.maxDistance = 320;
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

scene.add(new THREE.HemisphereLight(0xc4d4f0, 0x6c6a72, 1.05));
const sun = new THREE.DirectionalLight(0xffd2a6, 1.7);
sun.position.set(-160, 70, -120); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 500 });
sun.shadow.bias = -0.0004; scene.add(sun);
{
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){ float h = clamp(vP.y, -0.1, 1.0);
      vec3 top = vec3(0.32,0.45,0.66), mid = vec3(0.70,0.74,0.82), hor = vec3(0.98,0.78,0.62);
      float sunSide = smoothstep(0.3, -1.0, vP.x) * 0.8;
      vec3 c = mix(mix(mid, hor, sunSide), top, smoothstep(0.02, 0.45, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat));
}

// ---------------- hjälpare
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
// sadeltak: prisma längs x
function roof(w, d, h, mat, x, y, z, o = {}) {
  const s = new THREE.Shape(); s.moveTo(-d / 2 - 0.4, 0); s.lineTo(d / 2 + 0.4, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w + 0.8, bevelEnabled: false }); g.translate(0, 0, -(w + 0.8) / 2); g.rotateY(Math.PI / 2);
  return mesh(g, mat, x, y, z, o);
}
function glowTex() { return tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); }
const GLOW = glowTex();
const sprite = (color, size, opacity = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(size); return s; };

// ---------------- material
const snowTex = tex(256, 256, (g, w, h) => { g.fillStyle = '#e9eef6'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { const v = 215 + Math.random() * 40; g.fillStyle = `rgb(${v - 8},${v - 3},${v + 6})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
const stoneTex = tex(256, 256, (g, w, h) => {
  g.fillStyle = '#5e5a55'; g.fillRect(0, 0, w, h);
  let y = 0;
  while (y < h) {
    const rh = 14 + Math.random() * 14; let x = -Math.random() * 30;
    while (x < w) { const rw = 22 + Math.random() * 30, v = 85 + Math.random() * 55; g.fillStyle = `rgb(${v},${v - 4},${v - 9})`; g.fillRect(x + 2, y + 2, rw - 3, rh - 3); x += rw; }
    y += rh;
  }
}, [3, 3]);
const woodRed = tex(128, 128, (g, w, h) => { g.fillStyle = '#7b2a1e'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, 0, 2, h); } for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${120 + Math.random() * 40},40,30,.25)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 6); } }, [4, 1]);
const woodGrey = tex(128, 128, (g, w, h) => { g.fillStyle = '#6c625a'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 14) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x, 0, 2, h); } }, [3, 1]);
const mats = {
  stone: M(0xffffff, { map: stoneTex }), red: M(0xffffff, { map: woodRed }), grey: M(0xffffff, { map: woodGrey }),
  roof: M(0x3a3634, { roughness: 0.8 }), snowRoof: M(0xeef2f8, { roughness: 0.95 }), dark: M(0x1d1a18), wood: M(0x5a4430),
  yellow: M(0xd7b46a), white: M(0xe8e2d6), ice: M(0xc8d8e6, { roughness: 0.25, metalness: 0.1 }), sand: M(0x4a3d33),
  window: new THREE.MeshStandardMaterial({ color: 0x2a1f12, emissive: 0xffb860, emissiveIntensity: 0.9 }),
};

// ---------------- terräng: dalbotten, å, slänt bakom masugnen
const RIVER_Z = -34;
function groundH(x, z) {
  let h = 13.5 * sstep(8, 26, z) + 9 * sstep(55, 170, z) + 6 * sstep(-60, -150, z);
  h += 2.2 * Math.sin(x * 0.02) * Math.cos(z * 0.025) * sstep(20, 60, Math.abs(z - 10) + Math.abs(x) * 0.3);
  h -= 2.4 * (1 - sstep(4, 8, Math.abs(z - RIVER_Z)));
  return h;
}
{
  const g = new THREE.PlaneGeometry(900, 900, 220, 220); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 60, uv.getY(i) * 60);
  mesh(g, M(0xffffff, { map: snowTex, roughness: 1 }), 0, 0, 0, { cast: false });
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(900, 9), mats.ice); ice.rotation.x = -Math.PI / 2; ice.position.set(0, -1.15, RIVER_Z); ice.receiveShadow = true; scene.add(ice);
  // öppen ränna vid hjulen (strömmande vatten)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 2.4), M(0x2c3f52, { roughness: 0.15, metalness: 0.3 })); water.rotation.x = -Math.PI / 2; water.position.set(25, -1.05, RIVER_Z + 3.4); scene.add(water);
}

// ---------------- MASUGNEN (fyrkantigt stentorn mot slänten, bro till uppsättningen)
const FX = 0, FZ = 8;
{
  const g = new THREE.CylinderGeometry(4.95, 7.78, 13, 4, 1); g.rotateY(Math.PI / 4);
  mesh(g, mats.stone, FX, 6.5, FZ);
  box(10.2, 0.6, 10.2, mats.stone, FX, 13.2, FZ);
  // arbetsvalv (framsida, mot gjuthuset) och formvalv (mot ån)
  box(3.2, 3.6, 1.0, mats.dark, FX, 1.8, FZ - 5.6, { cast: false });
  box(1.0, 3.0, 2.2, mats.dark, FX + 5.6, 1.5, FZ - 1, { cast: false });
}
const archGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.8 }));
archGlow.position.set(FX, 1.6, FZ - 6.15); archGlow.rotation.y = Math.PI; scene.add(archGlow);
// uppsättningshuset på toppen
box(8, 4, 8, mats.red, FX, 15.5, FZ + 0.5);
roof(8, 8, 2.6, mats.snowRoof, FX, 17.5, FZ + 0.5);
const gichtFlame = sprite(0xffa040, 9); gichtFlame.position.set(FX - 1, 20.5, FZ - 1); scene.add(gichtFlame);
const gichtFlame2 = sprite(0xff6020, 6); gichtFlame2.position.set(FX - 1, 21.8, FZ - 1); scene.add(gichtFlame2);
// bron från slänten
{
  const zA = FZ + 4.5, zB = 27, y = 13.6;
  box(3, 0.4, zB - zA, mats.wood, FX, y, (zA + zB) / 2);
  for (const s of [-1, 1]) box(0.15, 1, zB - zA, mats.wood, FX + s * 1.4, y + 0.6, (zA + zB) / 2);
  for (let z = zA + 2; z < zB; z += 4) { const hh = y - groundH(FX, z); if (hh > 0.5) for (const s of [-1, 1]) box(0.35, hh, 0.35, mats.wood, FX + s * 1.2, y - hh / 2, z); }
}
// gjuthuset framför: tak på stolpar, sandgolv med tackbädd
{
  const z0 = FZ - 7.5, z1 = -14;
  box(16, 0.1, z0 - z1, mats.sand, FX, 0.05, (z0 + z1) / 2, { cast: false });
  for (const x of [-7.5, 7.5]) for (let z = z1; z <= z0; z += 4.5) box(0.4, 6, 0.4, mats.wood, FX + x, 3, z);
  roof(z0 - z1, 16, 3.2, mats.roof, FX, 6, (z0 + z1) / 2, {});
  // snö på taket
  const sr = roof(z0 - z1, 16, 3.25, mats.snowRoof, FX, 6.05, (z0 + z1) / 2, {}); sr.scale.set(0.98, 1, 0.98);
}
// tackbädd: glödande rännor som svalnar
const pigBars = [];
for (let i = 0; i < 6; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 7), new THREE.MeshStandardMaterial({ color: 0x2b2522, emissive: 0xff5a10, emissiveIntensity: 0 }));
  m.position.set(FX - 5 + i * 2, 0.12, -6); scene.add(m); pigBars.push(m);
}
const tapStream = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 4), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
tapStream.position.set(FX, 0.14, FZ - 9.5); tapStream.visible = false; scene.add(tapStream);
const tapLight = new THREE.PointLight(0xff7a2a, 0, 40, 1.6); tapLight.position.set(FX, 2.5, -4); scene.add(tapLight);
const archLight = new THREE.PointLight(0xff8a3c, 40, 18, 1.8); archLight.position.set(FX, 2, FZ - 9); scene.add(archLight);
// blåsmaskinhus och vattenhjul vid ån
box(7, 5, 6, mats.red, FX + 10, 2.5, FZ - 2); roof(6, 7, 2, mats.snowRoof, FX + 10, 5, FZ - 2, { ry: Math.PI / 2 });
box(1.2, 1.2, 40, mats.wood, FX + 13, 1.8, -14);   // axel/ränna från hjulet
function waterWheel(x, z, r) {
  const g = new THREE.Group(); g.position.set(x, -0.6 + r * 0.55, z);
  const rimM = M(0x4a3828);
  for (const s of [-0.6, 0.6]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 6, 28), rimM); t.position.x = s; t.rotation.y = Math.PI / 2; t.castShadow = true; g.add(t); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const p = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.9), rimM); p.position.set(0, Math.sin(a) * r, Math.cos(a) * r); p.rotation.x = -a; p.castShadow = true; g.add(p); }
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.15, r * 2, 0.2), rimM); s.rotation.x = i / 6 * Math.PI; g.add(s); }
  const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 8), rimM); ax.rotation.z = Math.PI / 2; g.add(ax);
  scene.add(g); return g;
}
const wheelF = waterWheel(FX + 13, RIVER_Z + 3.4, 3.6);
// dammen uppströms
box(4, 4, 12, mats.wood, -80, 0.4, RIVER_Z);
// kolhuset på krönet, rostugnen, kolstaplar
box(26, 7, 10, mats.red, -24, 13.5 + 3.5, 34); roof(26, 10, 4, mats.snowRoof, -24, 20.5, 34, { ry: 0 });
const coalPile = mesh(new THREE.ConeGeometry(5, 3, 10), M(0x1a1716, { roughness: 1 }), -24, 13.5 + 1, 26);
{
  const g = new THREE.CylinderGeometry(2.6, 3.8, 6.5, 4, 1); g.rotateY(Math.PI / 4);
  mesh(g, mats.stone, 18, 13.6 + 3.2, 31);
}
const roastGlow = sprite(0xff6a20, 5, 0.6); roastGlow.position.set(18, 21, 31); scene.add(roastGlow);
// hammarsmedjan med eget hjul
box(16, 5, 9, mats.stone, 46, 2.5, -16); roof(16, 9, 3, mats.snowRoof, 46, 5, -16);
box(1.6, 9, 1.6, mats.stone, 51, 6, -14);
const smithyGlow = sprite(0xff8a3c, 6, 0.7); smithyGlow.position.set(51, 11.5, -14); scene.add(smithyGlow);
const smithyWin = box(10, 1.4, 0.1, mats.window, 46, 2.2, -20.55, { cast: false });
const wheelH = waterWheel(42, RIVER_Z + 3.4, 3.0);
// herrgård, arbetarbostäder, gruvlave
box(20, 9, 11, mats.yellow, 92, groundH(92, 34) + 4.5, 34); roof(20, 11, 4.5, mats.snowRoof, 92, groundH(92, 34) + 9, 34);
for (let x = 82; x <= 100; x += 4) box(1.8, 1.6, 0.1, mats.window, x, groundH(92, 34) + 3.5, 28.45, { cast: false });
for (let i = 0; i < 6; i++) {
  const x = 60 + i * 13, z = 62 + (i % 2) * 6, y = groundH(x, z);
  box(9, 3.6, 6, mats.red, x, y + 1.8, z); roof(9, 6, 2.4, mats.snowRoof, x, y + 3.6, z);
  box(1, 1, 0.1, mats.window, x - 2, y + 1.8, z - 3.05, { cast: false }); box(1, 1, 0.1, mats.window, x + 2, y + 1.8, z - 3.05, { cast: false });
}
{
  const x = -110, z = 120, y = groundH(x, z);
  box(5, 13, 5, mats.red, x, y + 6.5, z); roof(5, 5, 2.4, mats.snowRoof, x, y + 13, z);
  for (let i = 0; i < 8; i++) mesh(new THREE.DodecahedronGeometry(2 + Math.random() * 2, 0), M(0x6b6762, { flatShading: true }), x + 8 + Math.random() * 14, y, z - 6 + Math.random() * 12);
}
// arbetare (för skalan)
const workerG = new THREE.CapsuleGeometry(0.3, 1.1, 3, 6); workerG.translate(0, 0.85, 0);
const wM = M(0x2c2622);
const workers = [[-1.5, -9], [1.8, -10], [3.5, -5], [0.5, 22], [-1, 18], [44, -21], [-20, 28]].map(([x, z]) => mesh(workerG, wM, x, groundH(x, z) + (z > 14 && z < 27 && Math.abs(x) < 2 ? 13.8 - groundH(x, z) : 0), z));
// granar med snö
{
  const trees = [];
  const free = (x, z) => !(Math.abs(z - RIVER_Z) < 10 || (x > -110 && x < 60 && z < -40 && z > -120) || (x > -40 && x < 110 && z > -30 && z < 75) || (x > -40 && x < 12 && z > 20 && z < 45));
  for (let i = 0; i < 2600; i++) {
    const x = (Math.random() - 0.5) * 760, z = (Math.random() - 0.4) * 700;
    if (!free(x, z)) continue;
    trees.push({ x, z, y: groundH(x, z), s: 0.7 + Math.random() * 0.9 });
  }
  const d = new THREE.Object3D();
  const add = (geo, mat, f) => { const m = new THREE.InstancedMesh(geo, mat, trees.length); m.castShadow = true; m.receiveShadow = true; trees.forEach((t, i) => { f(t); d.updateMatrix(); m.setMatrixAt(i, d.matrix); }); scene.add(m); };
  const g1 = new THREE.ConeGeometry(2.6, 8, 7); g1.translate(0, 6.5, 0);
  const g2 = new THREE.ConeGeometry(1.7, 4, 7); g2.translate(0, 9.7, 0);
  const g3 = new THREE.ConeGeometry(1.3, 2.6, 7); g3.translate(0, 11.4, 0);
  const tr = new THREE.CylinderGeometry(0.25, 0.35, 3, 6); tr.translate(0, 1.5, 0);
  const pl = t => { d.position.set(t.x, t.y - 0.3, t.z); d.scale.setScalar(t.s); d.rotation.y = t.x; };
  add(g1, M(0x22392a), pl); add(g2, M(0x2a4532), pl); add(g3, mats.snowRoof, pl); add(tr, M(0x3d2e22), pl);
}
// rök från masugnen, smedjan och rostugnen + snöfall
const SMOKE_N = 140;
const smokeGeo = new THREE.BufferGeometry(); const smokePos = new Float32Array(SMOKE_N * 3), smokeA = new Float32Array(SMOKE_N), smokeLife = new Float32Array(SMOKE_N), smokeSrc = new Uint8Array(SMOKE_N);
smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3)); smokeGeo.setAttribute('alpha', new THREE.BufferAttribute(smokeA, 1));
const smoke = new THREE.Points(smokeGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { color: { value: new THREE.Color(0x8d8a88) } },
  vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = (900.0 + (1.0-alpha)*2600.0) / -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 color; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; gl_FragColor = vec4(color, vA*(1.0-d*2.0)*0.45); }',
}));
smoke.frustumCulled = false; scene.add(smoke);
const SMOKE_SRC = [[FX - 1, 19, FZ - 1], [51, 10.5, -14], [18, 20, 31]];
for (let i = 0; i < SMOKE_N; i++) { smokeLife[i] = Math.random(); smokeSrc[i] = i % 3; }
const SNOW_N = 1500;
const snowGeo = new THREE.BufferGeometry(); const snowPos = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) snowPos.set([(Math.random() - 0.5) * 200, Math.random() * 80, (Math.random() - 0.5) * 200], i * 3);
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, map: GLOW, transparent: true, opacity: 0.85, depthWrite: false }));
snow.frustumCulled = false; scene.add(snow);
// kolsläde (häst + släde) som kör in kol
const sled = new THREE.Group();
{ const a = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 1.6), M(0x1d1917)); a.position.y = 0.9; a.castShadow = true; sled.add(a);
  const h = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.7), M(0x5a3a22)); h.position.set(3, 1.5, 0); h.castShadow = true; sled.add(h);
  const hh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.5), M(0x5a3a22)); hh.position.set(4.3, 2.2, 0); sled.add(hh); }
scene.add(sled);
const SLED_PATH = [new THREE.Vector3(-200, 0, 70), new THREE.Vector3(-90, 0, 50), new THREE.Vector3(-40, 0, 36), new THREE.Vector3(-24, 0, 27)];
let sledT = -1;

// ================================================================ simulering
const $ = id => document.getElementById(id);
const fmtN = n => Math.round(n).toLocaleString('sv-SE');
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
function dateStr(day) {
  const d = new Date(1780, 11, 1); d.setDate(d.getDate() + Math.floor(day));
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function log(text, kind = '') {
  const el = document.createElement('div'); el.className = `msg panel ${kind}`; el.textContent = text;
  $('log').prepend(el);
  while ($('log').children.length > 4) $('log').lastChild.remove();
  setTimeout(() => el.classList.add('out'), 7000); setTimeout(() => el.remove(), 7900);
}
function hint(id, text) { if (S.hint[id]) return; S.hint[id] = true; log('💡 ' + text, 'tip'); }

function maxBlast() { return S.frozen > 0 ? 0 : S.waterCap; }
function meltingMix() {
  // de två nedersta satserna styr smältzonen
  const sorted = [...S.shaft].sort((a, b) => b.pos - a.pos);
  const a = sorted[0], b = sorted[1] || a;
  return { r: a.r * 0.65 + b.r * 0.35, q: a.q * 0.65 + b.q * 0.35 };
}
function targetT() {
  if (S.frozen > 0) return 900;
  if (S.shaft.length === 0) return 1000;
  const m = meltingMix(), bl = Math.min(S.blast, maxBlast());
  let t = 1372 + 300 * (1.1 - m.r) + 140 * (bl - 0.75) - 900 * Math.max(0, 0.55 - m.q) + 300 * Math.max(0, m.q - 0.55);
  if (S.hearth > 92) t -= 260 * (S.hearth - 92) / 8;      // slaggen når formorna
  if (S.hanging) t -= 60;
  if (S.frostLeft > 0) t -= 25;                           // kall bläster
  if (S.thawLeft > 0) t -= 30;                            // fuktigt kol
  return t;
}
function addCharge() {
  const coalNeed = 1, oreNeed = CFG.orePerCharge * S.ratio;
  if (S.coal < coalNeed || S.ore < oreNeed) return false;
  S.coal -= coalNeed; S.ore -= oreNeed;
  S.shaft.push({ pos: 0, r: S.ratio, q: S.oreQ });
  return true;
}
function meltCharge(c) {
  const T = S.T;
  const yieldT = clamp((T - 1160) / 220, 0.25, 1);
  const iron = CFG.orePerCharge * c.r * c.q * CFG.skpPerTon * yieldT;
  const fill = CFG.hearthPerCharge * (0.55 + 0.45 * c.r / 1.1) * (1 + (0.55 - c.q) * 1.5);
  S.hearth += fill; S.hearthIron += iron;
  const grade = T > 1380 ? 1 : T > 1300 ? 0.9 : 0.75;      // grått, halvgrått, vitt
  S.hearthQ += iron * grade;
  // ansats: dålig malm och mycket malm bygger, het gång smälter bort
  S.ansats += Math.max(0, 0.55 - c.q) * 18 + Math.max(0, c.r - 1.35) * 3;
}
function slip(controlled) {
  const n = Math.min(S.shaft.length, 2);
  S.shaft.sort((a, b) => b.pos - a.pos);
  const dropped = S.shaft.splice(0, n);
  const bl = Math.min(S.blast, maxBlast());
  const drop = (controlled ? 0.5 : 1) * (40 + 130 * bl) * (1 + S.ansats / 110) * (dropped.reduce((a, c) => a + c.r, 0) / (1.1 * n));
  dropped.forEach(c => { meltCharge(c); });
  S.T -= drop; S.hanging = 0;
  log(`Hängningen släppte – beskickningen rasade ner kall! Härden föll ${Math.round(drop)} °C.`, controlled ? 'warn' : 'bad');
  S.stats.hangs++;
}
function freeze() {
  S.frozen = CFG.freezeRepairDays; S.stats.freezes++;
  S.money -= CFG.freezeRepairCost; S.hearth = 0; S.hearthIron = 0; S.hearthQ = 0; S.tapping = 0; S.hanging = 0;
  log(`HÄRDEN HAR FRUSIT! Järnet stelnade i ugnen. Den måste brytas upp – ${CFG.freezeRepairDays} dagars stillestånd och ${CFG.freezeRepairCost} daler.`, 'bad');
  openEvent('Frusen härd', `Masugnen har frusit. Arbetarna bryter upp den stelnade järnklumpen ur härden med spett och slägga. Det tar ${CFG.freezeRepairDays} dagar och kostar ${CFG.freezeRepairCost} daler. Kolet ligger kvar i kolhuset under tiden.`, [{ t: 'Sätt igång arbetet', d: 'Inget att välja – det är så det går till.', f: () => {} }]);
}

function step(dd) {
  S.day += dd;
  // gruva & rostugn
  S.rawOre += CFG.mineOre * dd;
  const rm = CFG.roast[S.roastMode], roastAmt = Math.min(S.rawOre, rm.rate * dd);
  if (roastAmt > 0) {
    S.oreDrift = clamp(S.oreDrift + (Math.random() - 0.5) * 0.05 * Math.sqrt(dd), -0.045, 0.045);
    const qNew = 0.535 + rm.q + S.mineQBonus + S.oreDrift;
    S.oreQ = (S.oreQ * S.ore + qNew * roastAmt) / Math.max(0.001, S.ore + roastAmt); S.ore += roastAmt; S.rawOre -= roastAmt;
  }
  // kolleveranser med släde (under slädföre)
  if (S.deliveries && S.day < 72 && Math.random() < dd * 1.0) {
    const n = Math.round(4 + Math.random() * 3); S.coal += n; S.money -= n * CFG.coalCost; sledT = 0;
  }
  // löner
  S.money -= CFG.wages * dd;
  // hammarsmedjan
  const hamCap = CFG.hammerCap * clamp(S.waterCap + 0.1, 0.3, 1) * dd;
  const use = Math.min(S.pig, hamCap);
  if (use > 0 && S.coal > 0) {
    S.pig -= use; S.bar += use * 0.8 * S.pigQ; S.coal -= CFG.hammerCoal * dd * (use / hamCap);
  }
  // pris på järnvågen
  S.price = clamp(S.price + (Math.random() - 0.5) * 2.2 * Math.sqrt(dd), 9.5, 15.5);

  if (S.frozen > 0) {
    S.frozen -= dd;
    S.T += (900 - S.T) * Math.min(1, dd * 2);
    if (S.frozen <= 0) {
      S.frozen = 0; S.T = 1320; S.ansats = Math.max(0, S.ansats - 20);
      S.shaft = []; for (let i = 0; i < CFG.slots; i++) S.shaft.push({ pos: i / CFG.slots, r: 0.8, q: S.oreQ });
      log('Härden är lagad och ugnen tänd igen. Starta försiktigt – mycket kol i början.', 'good');
    }
    return;
  }
  // bläster & nedsjunkning
  const bl = Math.min(S.blast, maxBlast());
  if (!S.hanging) {
    // risk för hängning
    const risk = Math.max(0, S.ansats - 28) / 100 * 1.4 * bl;
    if (Math.random() < risk * dd) { S.hanging = 0.2 + Math.random() * 0.6; log('Beskickningen hänger sig! Satserna sjunker inte. Minska blästern eller stöt loss den.', 'warn'); hint('hang', 'Vid hängning: sänk blästern innan den släpper, så blir raset mindre. Eller tryck "Stöt loss".'); }
    for (const c of S.shaft) c.pos += CFG.descent * bl * dd;
  } else {
    S.hanging -= dd;
    if (S.hanging <= 0) slip(false);
  }
  // smält satser som nått botten
  S.shaft.sort((a, b) => b.pos - a.pos);
  while (S.shaft.length && S.shaft[0].pos >= 1) meltCharge(S.shaft.shift());
  // fyll på uppifrån
  let guard = 0;
  while (guard++ < 3 && (S.shaft.length === 0 || Math.min(...S.shaft.map(c => c.pos)) >= 1 / CFG.slots)) {
    if (!addCharge()) { if (!S.hint.empty) { S.hint.empty = true; log(S.coal < 1 ? 'Kolet är slut! Ugnen svalnar.' : 'Malmen är slut! Rostugnen hinner inte med.', 'bad'); } break; }
  }
  if (S.shaft.length >= 3) S.hint.empty = false;
  // temperatur
  S.T += (targetT() - S.T) * Math.min(1, dd * 1.9);
  S.ansats = clamp(S.ansats - Math.max(0, S.T - 1440) * 0.03 * dd - 0.4 * dd, 0, 100);
  if (S.T > CFG.wearT) S.wear += (S.T - CFG.wearT) * 0.035 * dd;
  S.wear += bl > 0.95 ? 0.04 * dd : 0;
  // tappning pågår
  if (S.tapping > 0) {
    S.tapping -= dd;
    if (S.tapping <= 0) {
      const iron = S.hearthIron, q = S.hearthIron > 0 ? S.hearthQ / S.hearthIron : 1;
      S.pigQ = (S.pigQ * S.pig + q * iron) / Math.max(0.001, S.pig + iron); S.pig += iron; S.stats.produced += iron;
      S.hearth = 4; S.hearthIron = 0; S.hearthQ = 0; S.tapping = 0;
      coolBarsStart();
      log(`Tappat ${Math.round(iron)} skeppund ${q > 0.95 ? 'grått' : q > 0.85 ? 'halvgrått' : 'vitt'} tackjärn.`, q > 0.95 ? 'good' : 'warn');
      if (q < 0.85) hint('white', 'Vitt tackjärn kommer från en för kall härd. Det ger mindre stångjärn i smedjan.');
    }
  }
  // formorna
  if (S.hearth > 100) { S.wear += 2.5 * dd; hint('tuy', 'Slaggen står över formorna! Tappa härden – ugnen kvävs och formorna bränns.'); }
  // kolet slut: ugnen blåses ner (ingen frysning)
  if (S.coal < 1 && S.shaft.length === 0 && !S.over) { log('Kolet är slut – masugnen blåses ner för säsongen.', 'warn'); endSeason('coal'); return; }
  // frysning
  if (S.T < CFG.freezeT) S.coldTime += dd; else S.coldTime = Math.max(0, S.coldTime - dd);
  if (S.T < CFG.hardFreezeT || S.coldTime > CFG.freezeHold) freeze();
  if (S.T < 1290) hint('cold', 'Härden blir kall! Sänk malmsatsen (mer kol) – men kom ihåg att det tar tid innan satserna når ner.');
  if (S.T > 1490) hint('hot', 'Ugnen går för varmt. Det slösar kol och sliter på infodringen. Öka malmsatsen.');
  if (S.hearth > 75) hint('tap', 'Härden börjar bli full – tappa den innan slaggen når formorna.');
  if (S.wear >= 100) endSeason('burnt');
}
function tap() {
  if (S.tapping > 0 || S.frozen > 0 || S.hearth < 10) return;
  S.tapping = CFG.tapTime;
}
function poke() {
  if (!S.hanging) return;
  if (Math.random() < 0.6) slip(true); else { log('Stötningen lyckades inte. Försök igen.', 'warn'); S.T -= 6; }
}

// ================================================================ händelser
const EVENTS = [
  { at: [14, 24], id: 'frost', title: 'Köldknäpp', text: 'Termometern visar trettio grader kallt. Ån fryser och vattenhjulet går trögt – blästern och hammaren tappar kraft. Arbetarna kan hugga upp isen kring hjulen dygnet runt, men det kostar.',
    start: () => { S.waterCap = 0.55; S.frostLeft = 6 + Math.random() * 4; },
    choices: [
      { t: 'Hugg upp isen', d: '25 daler per dag så länge kölden varar. Hjulen går nästan som vanligt.', f: () => { S.iceCut = true; S.waterCap = 0.88; } },
      { t: 'Låt det vara', d: 'Gratis, men blästern begränsas till 55 % tills det blir mildare.', f: () => {} },
    ] },
  { at: [32, 44], id: 'badore', title: 'Sämre malm från gruvan', text: 'Gruvfogden rapporterar att de brutit in i en mager och stenig del av malmkroppen. Malmen som kommer de närmaste veckorna innehåller mer berg och mindre järn – det bygger ansats i schaktet.',
    start: () => { S.mineQBonus = -0.06; S.badOreLeft = 14; },
    choices: [
      { t: 'Köp bättre malm från grannbruket', d: '300 daler. Malmkvaliteten håller sig normal.', f: () => { S.money -= 300; S.mineQBonus = 0; } },
      { t: 'Kör på med egen malm', d: 'Rosta grundligare och håll koll på ansatsen.', f: () => {} },
    ] },
  { at: [50, 58], id: 'thaw', title: 'Blidväder', text: 'Det har slagit om till blidväder och slädföret har gått sönder. Kolarna kan inte köra in något kol på en dryg vecka.',
    start: () => { S.deliveries = false; S.thawLeft = 8; },
    choices: [
      { t: 'Köp kol av bönderna i socknen', d: '60 lass för 420 daler, levereras direkt.', f: () => { S.money -= 420; S.coal += 60; S.stats.coalBought += 60; } },
      { t: 'Klara sig på det som finns', d: 'Hushålla med kolet – kanske sänka blästern.', f: () => {} },
    ] },
  { at: [62, 68], id: 'more', title: 'Handelshuset vill ha mer', text: 'Handelshuset i Stockholm har fått en stor order från Holland och undrar om bruket kan leverera ytterligare 150 skeppund stångjärn – till samma pris och samma datum.',
    cond: () => S.contract,
    choices: [
      { t: 'Ja, vi levererar mer', d: 'Kontraktet ökar till ' + (CFG.contract.amount + 150) + ' skeppund.', f: () => { S.contract.amount += 150; } },
      { t: 'Nej tack', d: 'Ingen risk.', f: () => {} },
    ] },
];
for (const e of EVENTS) e.day = e.at[0] + Math.random() * (e.at[1] - e.at[0]);
function checkEvents() {
  if (!$('event').classList.contains('hidden')) return;
  if (S.contract && !S.contractDone && S.day >= S.contract.day) { settleContract(); return; }
  for (const e of EVENTS) {
    if (S.firedEvents.has(e.id) || S.day < e.day || (e.cond && !e.cond())) continue;
    S.firedEvents.add(e.id);
    e.start && e.start();
    openEvent(e.title, e.text, e.choices.map(c => ({ t: c.t, d: c.d, f: c.f })));
    return;
  }
  // pågående väder
  if (S.frostLeft > 0) { S.frostLeft -= 0; }
}
function weatherTick(dd) {
  if (S.frostLeft > 0) {
    S.frostLeft -= dd; if (S.iceCut) S.money -= 25 * dd;
    if (S.frostLeft <= 0) { S.waterCap = 1; S.iceCut = false; log('Kölden har släppt – vattenhjulen går fullt igen.', 'good'); }
  }
  if (S.badOreLeft > 0) { S.badOreLeft -= dd; if (S.badOreLeft <= 0) { S.mineQBonus = 0; log('Gruvan är tillbaka i bra malm.', 'good'); } }
  if (S.thawLeft > 0) { S.thawLeft -= dd; if (S.thawLeft <= 0) { S.deliveries = true; log('Kylan är tillbaka och slädföret bär igen.', 'good'); } }
}
let pausedBy = null;
function openEvent(title, text, choices) {
  pausedBy = S.speed; S.speed = 0;
  $('evTitle').textContent = title; $('evText').textContent = text;
  $('evChoices').innerHTML = '';
  for (const c of choices) {
    const b = document.createElement('button'); b.className = 'choice';
    b.innerHTML = `<b>${c.t}</b><span>${c.d}</span>`;
    b.onclick = () => { c.f(); $('event').classList.add('hidden'); S.speed = pausedBy || 1; pausedBy = null; refreshSpeedBtns(); };
    $('evChoices').appendChild(b);
  }
  $('event').classList.remove('hidden'); refreshSpeedBtns();
}

// ================================================================ kontraktet
function settleContract(silent) {
  S.contractDone = true;
  const del = Math.min(Math.floor(S.bar), S.contract.amount);
  const pay = del * S.contract.price - S.contract.advance; S.money += pay; S.bar -= del; S.delivered = del;
  if (del >= S.contract.amount) {
    S.contractTxt = `Fullgjort: ${S.contract.amount} skp`;
    if (!silent) openEvent('Leveransdag', `Pråmarna lastas och ${del} skeppund stångjärn går till handelshuset. Kontraktet är fullgjort – efter förskottet kommer ${fmtN(pay)} daler in i kassan.`, [{ t: 'Utmärkt', d: 'Fortsätt blåsningen säsongen ut.', f: () => {} }]);
  } else {
    const fine = Math.round((S.contract.amount - del) * 6); S.money -= fine;
    S.contractTxt = `${fmtN(del)} av ${S.contract.amount} skp – vite ${fine} daler`;
    if (!silent) openEvent('Leveransdag', `Bruket kunde bara leverera ${del} av ${S.contract.amount} skeppund. Handelshuset betalar ${fmtN(pay)} daler (efter förskottet) men kräver ${fine} daler i vite för det som fattas.`, [{ t: 'Det svider', d: 'Fortsätt blåsningen säsongen ut.', f: () => {} }]);
  }
}

// ================================================================ säsongens slut
function endSeason(reason) {
  if (S.over) return; S.over = true; S.running = false;
  if (S.contract && !S.contractDone) settleContract(true);
  const contractTxt = S.contractTxt || '–';
  const leftover = S.bar * S.price + S.pig * CFG.pigPrice;
  const total = S.money + leftover;
  const profit = total - 1500;
  let st = profit >= 7500 ? 3 : profit >= 5000 ? 2 : profit > 0 ? 1 : 0;
  if (S.contract && S.delivered < S.contract.amount) st = Math.min(st, 1);
  if (reason === 'burnt') st = 0;
  const title = reason === 'burnt' ? 'Ugnen brann ut' : 'Blåsningen är slut';
  const text = reason === 'burnt' ? 'Infodringen i schaktet är utbränd och ugnen måste blåsas ner i förtid. Den måste muras om under sommaren.' : reason === 'coal' ? `Kolet tog slut ${dateStr(S.day)} och ugnen fick blåsas ner i förtid.` : 'Våren har kommit och ugnen blåses ner för sommaren.';
  $('evTitle').textContent = title;
  $('evText').innerHTML = `${text}<div class="stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</div>
    <table>
      <tr><td>Tackjärn producerat</td><td class="r">${fmtN(S.stats.produced)} skp</td></tr>
      <tr><td>Kontraktet</td><td class="r">${contractTxt}</td></tr>
      <tr><td>Frusna härdar</td><td class="r">${S.stats.freezes}</td></tr>
      <tr><td>Hängningar</td><td class="r">${S.stats.hangs}</td></tr>
      <tr><td>Kassa + lagervärde</td><td class="r">${fmtN(total)} daler</td></tr>
      <tr><td><b>Vinst för säsongen</b></td><td class="r"><b>${fmtN(profit)} daler</b></td></tr>
    </table>
    <p class="small">I det riktiga spelet bygger du ut bruket mellan säsongerna – fler kolmilor, bättre damm, lancashiresmide – och går vidare genom epokerna.</p>`;
  $('evChoices').innerHTML = '';
  const b = document.createElement('button'); b.className = 'btn big'; b.textContent = 'Blås en ny säsong'; b.onclick = () => location.reload();
  $('evChoices').appendChild(b);
  $('event').classList.remove('hidden');
}

// ================================================================ UI
function refreshSpeedBtns() { document.querySelectorAll('[data-sp]').forEach(b => b.classList.toggle('on', +b.dataset.sp === S.speed)); }
document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { if (!$('event').classList.contains('hidden')) return; S.speed = +b.dataset.sp; refreshSpeedBtns(); });
$('ratio').oninput = e => { S.ratio = +e.target.value; };
$('blast').oninput = e => { S.blast = +e.target.value; };
$('tapBtn').onclick = tap;
$('pokeBtn').onclick = poke;
$('roastN').onclick = () => { S.roastMode = 'N'; $('roastN').classList.add('on'); $('roastG').classList.remove('on'); };
$('roastG').onclick = () => { S.roastMode = 'G'; $('roastG').classList.add('on'); $('roastN').classList.remove('on'); };
$('sellBtn').onclick = () => {
  const n = Math.min(50, Math.floor(S.bar)); if (n <= 0) return;
  S.bar -= n; const inc = n * S.price; S.money += inc; S.stats.sold += n;
  log(`Sålde ${n} skp stångjärn på järnvågen för ${fmtN(inc)} daler.`);
};
$('buyCoalBtn').onclick = () => {
  const cost = Math.round(40 * CFG.coalPrice * (1 + S.stats.coalBought / 300));
  S.money -= cost; S.coal += 40; S.stats.coalBought += 40;
  log(`Köpte 40 lass kol av bönderna för ${cost} daler.`);
};
// startval: kontrakt eller fri försäljning
{
  const cs = [
    { t: `Skriv på kontraktet med handelshuset`, d: `Leverera ${CFG.contract.amount} skeppund stångjärn senast ${dateStr(CFG.contract.day)} för ${CFG.contract.price} daler/skp – mer än järnvågen brukar ge – och ${fmtN(CFG.contract.advance)} daler i förskott nu. Klarar du det inte blir det vite.`, f: () => { S.contract = { ...CFG.contract }; S.money += CFG.contract.advance; setTimeout(() => log(`Handelshuset betalar ${fmtN(CFG.contract.advance)} daler i förskott (förlag) – det dras av vid leveransen.`), 400); } },
    { t: 'Sälj fritt på järnvågen', d: 'Inga åtaganden. Priset går upp och ner under vintern.', f: () => { S.contract = null; } },
  ];
  for (const c of cs) {
    const b = document.createElement('button'); b.className = 'choice'; b.innerHTML = `<b>${c.t}</b><span>${c.d}</span>`;
    b.onclick = () => { c.f(); $('intro').classList.add('hidden'); S.running = true; log('Masugnen är tänd. Blåsningen har börjat!', 'good'); setTimeout(() => hint('start', 'Håll ett öga på schaktet: satsen du lägger i nu smälter först om nästan en dag.'), 2500); };
    $('introChoices').appendChild(b);
  }
}

function tempWord(T) { return T < 1200 ? 'fryser' : T < 1300 ? 'kall' : T < 1330 ? 'sval' : T <= 1480 ? 'bra' : T < 1520 ? 'het' : 'för het'; }
function updateUI() {
  $('date').textContent = dateStr(S.day);
  $('season').textContent = `Blåsningen, dag ${Math.min(CFG.seasonDays, Math.floor(S.day) + 1)} av ${CFG.seasonDays}`;
  const T = S.T;
  $('temp').textContent = S.frozen > 0 ? '—' : Math.round(T);
  const tr = T - S.Tprev;
  $('trend').textContent = S.frozen > 0 ? 'frusen' : `${tr > 1.5 ? '▲ stiger' : tr < -1.5 ? '▼ sjunker' : '● stadig'} · ${tempWord(T)}`;
  $('trend').style.color = T < 1300 || T > 1500 ? 'var(--bad)' : T < 1330 || T > 1480 ? 'var(--warn)' : 'var(--ok)';
  $('tmark').style.left = `${clamp((T - 1100) / 460, 0, 1) * 100}%`;
  $('flame').textContent = S.frozen > 0 ? 'Ugnen står stilla. Arbetarna bryter upp härden.'
    : `Gichtflamman: ${T < 1260 ? 'mörkröd och osande' : T < 1330 ? 'röd och slö' : T < 1480 ? 'livlig, gulröd' : 'vitgul och skarp'}`;
  $('slag').textContent = S.frozen > 0 ? '' : `Slaggen: ${T < 1260 ? 'svart och seg' : T < 1330 ? 'mörk och trögflytande' : T < 1480 ? 'ljus och lättflytande' : 'tunn som vatten'}`;
  // schaktet
  const sh = $('shaft');
  let html = S.shaft.map(c => {
    const k = clamp((c.r - 0.6) / 1.2, 0, 1);
    const col = `rgb(${28 + k * 112},${23 + k * 51},${20 + k * 24})`;
    return `<div class="ch" style="top:${clamp(c.pos, 0, 0.95) * 100}%;background:${col}"></div>`;
  }).join('');
  if (S.hanging) html += '<div class="hang"></div>';
  sh.innerHTML = html;
  const bl = Math.min(S.blast, maxBlast());
  $('shaftTime').textContent = S.frozen > 0 ? '' : S.hanging ? '⚠ Beskickningen hänger!' : bl > 0.05 ? `Genomgångstid ≈ ${(1 / (CFG.descent * bl)).toFixed(1).replace('.', ',')} dygn` : '';
  $('shaftTime').style.color = S.hanging ? 'var(--bad)' : '';
  $('ansatsTxt').textContent = `${Math.round(S.ansats)} %`; $('ansats').style.width = `${S.ansats}%`;
  $('ansats').style.background = S.ansats > 50 ? 'var(--bad)' : 'var(--warn)';
  $('hearthTxt').textContent = S.tapping > 0 ? 'tappar…' : `${Math.round(S.hearth)} %`;
  $('hearth').style.width = `${clamp(S.hearth, 0, 100)}%`;
  $('hearth').style.background = S.hearth > 92 ? 'var(--bad)' : 'var(--fire)';
  $('wearTxt').textContent = `${Math.round(S.wear)} %`; $('wearTxt').style.color = S.wear > 60 ? 'var(--bad)' : '';
  $('ratioTxt').textContent = `${S.ratio.toFixed(2).replace('.', ',')} per lass kol`;
  $('blastTxt').textContent = `${Math.round(S.blast * 100)} %${S.blast > maxBlast() + 0.01 ? ` (hjulet ger bara ${Math.round(maxBlast() * 100)} %)` : ''}`;
  $('waterTxt').textContent = S.frozen > 0 ? 'Blästern är avstängd.' : S.waterCap < 0.7 ? '❄ Ån är isig – hjulet går trögt.' : S.waterCap < 0.95 ? '❄ Isen hålls öppen kring hjulet.' : 'Vattenhjulet går fullt.';
  const tb = $('tapBtn'); tb.disabled = S.tapping > 0 || S.frozen > 0 || S.hearth < 10; tb.classList.toggle('pulse', S.hearth > 78 && !tb.disabled);
  $('pokeBtn').disabled = !S.hanging;
  // lager
  $('money').textContent = `${fmtN(S.money)} daler`; $('money').style.color = S.money < 0 ? 'var(--bad)' : '';
  $('coal').textContent = `${fmtN(S.coal)} lass`;
  const use = CFG.descent * CFG.slots * bl + CFG.hammerCoal;
  const daysLeft = CFG.seasonDays - S.day;
  const coalDays = S.coal / Math.max(0.5, use);
  $('coalDays').textContent = `räcker ≈ ${Math.round(coalDays)} dagar i nuvarande takt${S.deliveries && S.day < 72 ? ' (+ slädleveranser)' : ''}`;
  $('coalDays').style.color = coalDays < daysLeft * 0.6 && !(S.deliveries && S.day < 60) ? 'var(--warn)' : '';
  $('ore').textContent = `${fmtN(S.ore)} t`;
  $('pig').textContent = `${fmtN(S.pig)} skp`;
  $('pigQ').textContent = S.pig > 0.5 ? `kvalitet: ${S.pigQ > 0.95 ? 'grått' : S.pigQ > 0.85 ? 'halvgrått' : 'vitt'} – smedjan gör ${Math.round(80 * S.pigQ)} % stångjärn` : '';
  $('bar').textContent = `${fmtN(S.bar)} skp`;
  $('roastTxt').textContent = S.roastMode === 'N' ? `≈ ${CFG.roast.N.rate} t/dag, normal kvalitet` : `≈ ${CFG.roast.G.rate} t/dag, renare malm (mindre ansats)`;
  $('price').textContent = `${Math.round(S.price)} daler/skp`;
  $('contract').innerHTML = S.contract
    ? `<div class="row"><span>Kontrakt: ${S.contract.amount} skp till ${dateStr(S.contract.day).replace(' 1781', '')}</span></div><div class="meter"><i style="width:${clamp(S.bar / S.contract.amount, 0, 1) * 100}%;background:var(--ok)"></i></div><div class="row" style="font-size:11.5px;color:var(--muted)"><span>${fmtN(S.bar)} skp stångjärn i lager · ${CFG.contract.price} daler/skp</span></div>`
    : '<div class="row" style="color:var(--muted)">Inget kontrakt – fri försäljning.</div>';
  $('sellBtn').disabled = S.bar < 1;
}

// ================================================================ visuella effekter
let barCool = 0;
function coolBarsStart() { barCool = 1; }
function updateVisuals(dtReal, simDays) {
  const T = S.frozen > 0 ? 900 : S.T, on = S.frozen <= 0;
  const heat = clamp((T - 1150) / 400, 0, 1);
  gichtFlame.visible = gichtFlame2.visible = on;
  const fl = 0.85 + Math.sin(performance.now() / 90) * 0.1 + Math.random() * 0.08;
  gichtFlame.scale.setScalar((5 + heat * 7) * fl); gichtFlame2.scale.setScalar((3 + heat * 5) * fl);
  gichtFlame.material.color.setHSL(0.03 + heat * 0.08, 1, 0.45 + heat * 0.15);
  gichtFlame2.material.color.setHSL(0.02 + heat * 0.06, 1, 0.4 + heat * 0.2);
  archGlow.material.color.setHSL(0.04 + heat * 0.06, 1, 0.3 + heat * 0.3); archGlow.material.opacity = on ? 0.5 + heat * 0.5 : 0.1;
  archLight.intensity = on ? 15 + heat * 45 : 2;
  const bl = Math.min(S.blast, maxBlast());
  wheelF.rotation.x -= dtReal * bl * 1.2 * (S.running ? Math.max(0.3, S.speed) : 0.2);
  wheelH.rotation.x -= dtReal * clamp(S.waterCap, 0.3, 1) * 1.0 * (S.running ? Math.max(0.3, S.speed) : 0.2);
  // tappning
  const tapping = S.tapping > 0;
  tapStream.visible = tapping; tapLight.intensity = tapping ? 60 + Math.random() * 30 : barCool * 25;
  if (tapping) barCool = 1;
  barCool = Math.max(0, barCool - simDays * 2.2);
  pigBars.forEach((b, i) => { b.material.emissiveIntensity = Math.max(0, barCool * 2.2 - i * 0.05); });
  smithyGlow.material.opacity = 0.4 + Math.random() * 0.3;
  // rök
  for (let i = 0; i < SMOKE_N; i++) {
    smokeLife[i] -= dtReal * 0.12;
    if (smokeLife[i] <= 0) { const s = SMOKE_SRC[smokeSrc[i]]; smokePos[i * 3] = s[0] + (Math.random() - 0.5); smokePos[i * 3 + 1] = s[1]; smokePos[i * 3 + 2] = s[2] + (Math.random() - 0.5); smokeLife[i] = 1; }
    smokePos[i * 3] += dtReal * (1.6 + Math.random()); smokePos[i * 3 + 1] += dtReal * 2.4; smokePos[i * 3 + 2] += dtReal * 0.6;
    smokeA[i] = smokeSrc[i] === 0 && !on ? 0 : smokeLife[i];
  }
  smokeGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.alpha.needsUpdate = true;
  // snö
  for (let i = 0; i < SNOW_N; i++) {
    let y = snowPos[i * 3 + 1] - dtReal * 2.2; if (y < 0) y += 80;
    snowPos[i * 3 + 1] = y; snowPos[i * 3] += Math.sin(y * 0.3 + i) * dtReal * 0.3;
  }
  snowGeo.attributes.position.needsUpdate = true;
  snow.position.set(controls.target.x, 0, controls.target.z);
  // kolhögen och släden
  coalPile.scale.setScalar(clamp(S.coal / 380, 0.15, 1.3));
  if (sledT >= 0) {
    sledT += dtReal * 0.08;
    if (sledT >= 1) sledT = -1;
    else {
      const segs = SLED_PATH.length - 1, f = sledT * segs, i = Math.min(segs - 1, Math.floor(f)), t = f - i;
      const p = SLED_PATH[i].clone().lerp(SLED_PATH[i + 1], t); p.y = groundH(p.x, p.z);
      const dir = SLED_PATH[i + 1].clone().sub(SLED_PATH[i]);
      sled.position.copy(p); sled.rotation.y = -Math.atan2(dir.z, dir.x); sled.visible = true;
    }
  } else sled.visible = false;
}

// ================================================================ loop
const clock = new THREE.Clock();
let uiTimer = 0, tPrevTimer = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  let simDays = 0;
  if (S.running && !S.over && S.speed > 0) {
    simDays = dt / CFG.secPerDay * S.speed * (window.__ts || 1);
    const n = Math.ceil(simDays / 0.01);
    for (let i = 0; i < n && !S.over; i++) { step(simDays / n); weatherTick(simDays / n); }
    checkEvents();
    if (S.day >= CFG.seasonDays) endSeason('season');
  }
  tPrevTimer += dt;
  if (tPrevTimer > 0.8) { S.Tprev = S.Tlast ?? S.T; S.Tlast = S.T; tPrevTimer = 0; }
  updateVisuals(dt, simDays);
  controls.update();
  renderer.render(scene, camera);
  uiTimer += dt; if (uiTimer > 0.1) { uiTimer = 0; updateUI(); }
}
updateUI();
frame();
window.__b = { S, CFG, tap, poke, step, endSeason, camera, controls, EVENTS };
