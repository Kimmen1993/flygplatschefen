// Rallystallet – känslotest (prototyp). Slängkod, se README.md.
import * as THREE from 'three';

// ================================================================ inställningar
const CFG = {
  roadHalf: 4.5, shoulder: 2.2,
  gravity: 15,
  vmax: 46, accel: 10.5, brake: 16, reverseMax: 8,
  steerMax: 2.25,
  grip: { dry: 5.6, wet: 4.3 },
  tyre: {
    hard: { name: 'Hårda grusdäck', dry: 1.0, wet: 0.84, wear: 1.0 },
    soft: { name: 'Mjuka grusdäck', dry: 1.07, wet: 0.98, wear: 1.7 },
  },
  serviceMin: 20, latePenalty: 10, resetPenalty: 5,
  rivals: [
    { name: 'M. Lindqvist', car: 'Grön #3', k: -0.035 }, { name: 'J. Berg', car: 'Blå #7', k: -0.012 },
    { name: 'S. Nyström', car: 'Vit #11', k: 0.012 }, { name: 'K. Holm', car: 'Röd #14', k: 0.04 },
    { name: 'E. Virtanen', car: 'Gul #21', k: 0.075 },
  ],
};
const STAGE_NAMES = ['Lövåsen', 'Rävåsen', 'Tallmon', 'Granbacken', 'Björkliden', 'Myrhult', 'Kråkberget', 'Stensjön'];

// ================================================================ grund
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 2500);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x4a4030, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x4a7ac0) }, hor: { value: new THREE.Color(0xf3d6a8) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y*2.2, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, h), 1.0); }',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat); scene.add(sky);
scene.fog = new THREE.Fog(0xdcd4c4, 120, 700);

// ================================================================ hjälp
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const noiseH = (x, z) => 5 * Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013) + 3 * Math.sin(x * 0.027 + z * 0.021) + 1.5 * Math.sin(x * 0.06 - z * 0.05) + 0.6 * Math.sin(x * 0.13 + z * 0.11);
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 4; return t;
}
const gravelTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#8a7a63'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { const v = 90 + Math.random() * 90; g.fillStyle = `rgb(${v + 20},${v + 8},${v - 12})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  // hjulspår
  g.fillStyle = 'rgba(70,58,44,0.35)'; g.fillRect(w * 0.28, 0, w * 0.1, h); g.fillRect(w * 0.62, 0, w * 0.1, h);
});
const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4f6b35'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const v = Math.random(); g.fillStyle = `rgb(${60 + v * 50},${85 + v * 60},${35 + v * 30})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 3); }
});

// ================================================================ sträcka
let stage = null;
function buildStage(seed, wet) {
  if (stage) { scene.remove(stage.group); stage.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const R = rng(seed);
  const group = new THREE.Group(); scene.add(group);
  // kontrollpunkter: slumpvandring framåt
  const pts = [new THREE.Vector3(0, 0, 0)];
  let h = 0, x = 0, z = 0;
  pts.push(new THREE.Vector3(60, 0, 0)); x = 60;
  for (let i = 0; i < 24; i++) {
    const r = R();
    const turn = r < 0.35 ? (R() - 0.5) * 0.5 : r < 0.75 ? (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.4) : (R() < 0.5 ? -1 : 1) * (0.95 + R() * 0.5);
    h = clamp(h + turn, -1.3, 1.3);
    const len = 65 + R() * 55;
    x += Math.cos(h) * len; z += Math.sin(h) * len;
    pts.push(new THREE.Vector3(x, 0, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const L = curve.getLength();
  const N = Math.floor(L / 2);
  const P = curve.getSpacedPoints(N);
  const S = P.map((p, i) => ({ x: p.x, z: p.z, s: i * L / N, y: 0, th: 0, k: 0 }));
  for (let i = 0; i < S.length; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
    S[i].th = Math.atan2(b.z - a.z, b.x - a.x);
  }
  for (let i = 0; i < S.length; i++) {
    const a = S[Math.max(0, i - 2)], b = S[Math.min(S.length - 1, i + 2)];
    S[i].k = wrapA(b.th - a.th) / Math.max(1, b.s - a.s);
  }
  // höjd: utjämnad terräng + krön
  const raw = S.map(p => noiseH(p.x, p.z) * 0.8);
  for (let i = 0; i < S.length; i++) {
    let sum = 0, n = 0;
    for (let j = i - 30; j <= i + 30; j++) if (j >= 0 && j < S.length) { sum += raw[j]; n++; }
    S[i].y = sum / n;
  }
  const crests = [];
  for (let tries = 0; tries < 200 && crests.length < 6; tries++) {
    const i = 80 + Math.floor(R() * (S.length - 160));
    let flat = true; for (let j = i - 20; j <= i + 12; j++) if (Math.abs(S[j].k) > 0.012) flat = false;
    if (!flat || crests.some(c => Math.abs(c.i - i) < 110)) continue;
    crests.push({ i, s: S[i].s, hgt: 1.8 + R() * 1.8, big: false });
  }
  crests.forEach(c => { c.big = c.hgt > 2.9; });
  for (const c of crests) for (let j = c.i - 14; j <= c.i + 14; j++) {
    if (j < 0 || j >= S.length) continue;
    const d = (j - c.i) * 2; S[j].y += c.hgt * Math.exp(-(d * d) / (2 * 7.5 * 7.5));
  }
  crests.sort((a, b) => a.s - b.s);

  // spatial hash av vägpunkter
  const CELLH = 20, hash = new Map();
  S.forEach((p, i) => { const k = `${Math.floor(p.x / CELLH)},${Math.floor(p.z / CELLH)}`; if (!hash.has(k)) hash.set(k, []); hash.get(k).push(i); });
  function nearestIdx(x, z) {
    const gx = Math.floor(x / CELLH), gz = Math.floor(z / CELLH); let best = -1, bd = 1e9;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = hash.get(`${gx + a},${gz + b}`); if (!l) continue;
      for (const i of l) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    return { i: best, d: Math.sqrt(bd) };
  }
  function terrainH(x, z, near) {
    const n = near || nearestIdx(x, z);
    const base = noiseH(x, z) * 1.15;
    if (n.i < 0) return base;
    const w = smooth(CFG.roadHalf + 1.5, 34, n.d);
    // diken längs vägen
    const ditch = -0.7 * smooth(CFG.roadHalf + 1, CFG.roadHalf + 3.5, n.d) * (1 - smooth(CFG.roadHalf + 4, CFG.roadHalf + 9, n.d));
    return lerp(S[n.i].y, base, w) + ditch;
  }

  // terräng: tät korridor längs vägen + grov bakgrund under
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  S.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
  const pad = 320, W = maxX - minX + pad * 2, D = maxZ - minZ + pad * 2;
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, color: wet ? 0x8a9a80 : 0xffffff, roughness: 1 });
  const offs = [-120, -80, -54, -36, -25, -17, -12, -8.5, -6.5, -5.2, -4, 0, 4, 5.2, 6.5, 8.5, 12, 17, 25, 36, 54, 80, 120];
  const cols = offs.length, cv = [], cuv = [], ci = []; let rows = 0;
  for (let i = 0; i < S.length; i += 2) {
    const p = S[i], nx = -Math.sin(p.th), nz = Math.cos(p.th);
    for (const o of offs) {
      const x = p.x + nx * o, z = p.z + nz * o;
      let y = Math.abs(o) <= 5.2 ? p.y - 0.1 : terrainH(x, z);
      cv.push(x, y - 0.05, z); cuv.push(x / 8, z / 8);
    }
    rows++;
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; ci.push(a, b, d, b, e, d); }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
  cg.setIndex(ci); cg.computeVertexNormals();
  const corridor = new THREE.Mesh(cg, grassMat); corridor.receiveShadow = true; group.add(corridor);
  const tg = new THREE.PlaneGeometry(W, D, 120, 120); tg.rotateX(-Math.PI / 2);
  tg.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = tg.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)) - 1.6);
  tg.computeVertexNormals();
  const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 8, uv.getY(i) * D / 8);
  const terrain = new THREE.Mesh(tg, grassMat); terrain.receiveShadow = true; group.add(terrain);

  // vägband
  const rv = [], ruv = [], ri = [];
  const half = CFG.roadHalf + 0.6;
  S.forEach((p, i) => {
    const nx = -Math.sin(p.th), nz = Math.cos(p.th);
    rv.push(p.x - nx * half, p.y + 0.02, p.z - nz * half, p.x + nx * half, p.y + 0.02, p.z + nz * half);
    ruv.push(0, p.s / 9, 1, p.s / 9);
    if (i > 0) { const a = (i - 1) * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  rg.setIndex(ri); rg.computeVertexNormals();
  const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: gravelTex, color: wet ? 0x8d8070 : 0xffffff, roughness: wet ? 0.55 : 0.95, metalness: wet ? 0.15 : 0 }));
  road.receiveShadow = true; group.add(road);

  // träd
  const trees = [], treeGrid = new Map();
  const addTree = (x, z, s, birch) => {
    const n = nearestIdx(x, z); if (n.d < CFG.roadHalf + 3.2) return;
    const t = { x, z, y: terrainH(x, z, n), s, birch, r: 0.45 * s };
    trees.push(t);
    if (n.d < 18) { const k = `${Math.floor(x / 10)},${Math.floor(z / 10)}`; if (!treeGrid.has(k)) treeGrid.set(k, []); treeGrid.get(k).push(t); }
  };
  for (let i = 0; i < S.length; i += 3) {
    const p = S[i], nx = -Math.sin(p.th), nz = Math.cos(p.th);
    for (const side of [-1, 1]) {
      const cnt = R() < 0.6 ? 2 : 1;
      for (let c = 0; c < cnt; c++) {
        const d = CFG.roadHalf + 3.5 + Math.pow(R(), 1.6) * 70;
        addTree(p.x + nx * d * side + (R() - 0.5) * 4, p.z + nz * d * side + (R() - 0.5) * 4, 0.8 + R() * 0.7, R() < 0.18);
      }
    }
  }
  for (let i = 0; i < 2600; i++) addTree(minX - pad * 0.7 + R() * (W * 0.85), minZ - pad * 0.7 + R() * (D * 0.85), 0.9 + R() * 0.8, R() < 0.12);
  const pines = trees.filter(t => !t.birch), birches = trees.filter(t => t.birch);
  const dummy = new THREE.Object3D();
  const mkInst = (geo, mat, list, f) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length); m.castShadow = true; m.receiveShadow = true;
    list.forEach((t, i) => { f(t); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    group.add(m); return m;
  };
  const coneG = new THREE.ConeGeometry(2.6, 9, 7); coneG.translate(0, 7.5, 0);
  const cone2G = new THREE.ConeGeometry(2.0, 6, 7); cone2G.translate(0, 11, 0);
  const trunkG = new THREE.CylinderGeometry(0.28, 0.4, 4, 6); trunkG.translate(0, 2, 0);
  const pineMat = new THREE.MeshStandardMaterial({ color: wet ? 0x1f3a24 : 0x264a2b, roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
  const birchTrunkMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 });
  const birchTopG = new THREE.IcosahedronGeometry(2.8, 0); birchTopG.translate(0, 7, 0);
  const birchMat = new THREE.MeshStandardMaterial({ color: wet ? 0x58783a : 0x7ea24a, roughness: 0.9, flatShading: true });
  const place = t => { dummy.position.set(t.x, t.y - 0.2, t.z); dummy.rotation.set(0, t.x * 13 % 6, 0); dummy.scale.set(t.s, t.s * (0.9 + (t.z * 7 % 1) * 0.3), t.s); };
  mkInst(coneG, pineMat, pines, place); mkInst(cone2G, pineMat, pines, place); mkInst(trunkG, trunkMat, pines, place);
  mkInst(trunkG.clone().scale(0.8, 1.6, 0.8), birchTrunkMat, birches, place); mkInst(birchTopG, birchMat, birches, place);

  // stenar vid vägkanten
  const rocks = [];
  for (let i = 0; i < S.length; i += 9) if (R() < 0.35) {
    const p = S[i], side = R() < 0.5 ? -1 : 1, d = CFG.roadHalf + 2.2 + R() * 3;
    const x = p.x - Math.sin(p.th) * d * side, z = p.z + Math.cos(p.th) * d * side;
    rocks.push({ x, z, y: terrainH(x, z), s: 0.5 + R() * 0.9 });
  }
  mkInst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x7d7b78, roughness: 1, flatShading: true }), rocks,
    t => { dummy.position.set(t.x, t.y + 0.1, t.z); dummy.rotation.set(t.x, t.z, 0); dummy.scale.set(t.s * 1.3, t.s * 0.7, t.s); });

  // start- och målportal, publik vid krön
  const startS = 4, finishS = L - 30;
  const portal = (s, color, text) => {
    const i = Math.round(s / (L / N)), p = S[i], nx = -Math.sin(p.th), nz = Math.cos(p.th);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    for (const sd of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.5, 0.4), m); post.position.set(p.x + nx * 6 * sd, p.y + 2.75, p.z + nz * 6 * sd); post.castShadow = true; group.add(post); }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 12.4), new THREE.MeshStandardMaterial({ map: canvasTex(512, 64, (g, w, hh) => { g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, hh); g.fillStyle = '#fff'; g.font = 'bold 44px system-ui'; g.textAlign = 'center'; g.fillText(text, w / 2, 48); }) }));
    banner.position.set(p.x, p.y + 5.2, p.z); banner.rotation.y = -p.th; group.add(banner);
  };
  portal(startS + 4, 0x16a34a, 'START');
  portal(finishS, 0xdc2626, 'MÅL');
  const fans = [];
  for (const c of crests) for (let n = 0; n < 9; n++) {
    const p = S[c.i + 6 + Math.floor(R() * 10)], side = R() < 0.5 ? -1 : 1, d = CFG.roadHalf + 5 + R() * 4;
    const x = p.x - Math.sin(p.th) * d * side, z = p.z + Math.cos(p.th) * d * side;
    fans.push({ x, z, y: terrainH(x, z), c: [0xd94040, 0x2f6fd6, 0xf0c020, 0xffffff, 0x2a2a2a][Math.floor(R() * 5)] });
  }
  const fanG = new THREE.CapsuleGeometry(0.32, 1.0, 3, 6); fanG.translate(0, 0.85, 0);
  const fanM = new THREE.InstancedMesh(fanG, new THREE.MeshStandardMaterial({ roughness: 0.8 }), fans.length);
  fans.forEach((f, i) => { dummy.position.set(f.x, f.y, f.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); fanM.setMatrixAt(i, dummy.matrix); fanM.setColorAt(i, new THREE.Color(f.c)); });
  fanM.castShadow = true; group.add(fanM);

  // kartläsarens noter
  const notes = [];
  const step = 10;
  for (let i = 0; i + 16 < S.length; i += 5) {
    const d = wrapA(S[i + 15].th - S[i].th);             // riktningsändring över 30 m
    const deg = Math.abs(d) * 180 / Math.PI;
    if (deg < 9) continue;
    const sev = deg > 95 ? 0 : deg > 70 ? 1 : deg > 52 ? 2 : deg > 38 ? 3 : deg > 25 ? 4 : deg > 15 ? 5 : 6;
    const dir = d > 0 ? 'Höger' : 'Vänster';
    const last = notes[notes.length - 1];
    if (last && !last.crest && last.dir === dir && S[i].s - last.s < 32) { last.sev = Math.min(last.sev, sev); last.end = S[i + 15].s; continue; }
    notes.push({ s: S[i].s, end: S[i + 15].s, dir, sev });
  }
  for (const c of crests) notes.push({ s: c.s - 12, crest: true, big: c.big });
  notes.sort((a, b) => a.s - b.s);
  notes.forEach(n => {
    n.text = n.crest ? (n.big ? 'Hopp!' : 'Krön') : n.sev === 0 ? `${n.dir} hårnål` : `${n.dir} ${n.sev}`;
    n.say = n.crest ? (n.big ? 'hopp' : 'krön') : n.sev === 0 ? `${n.dir.toLowerCase()} hårnål` : `${n.dir.toLowerCase()} ${['', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex'][n.sev]}`;
  });

  // referenstid utifrån kurvorna
  const aLat = wet ? 7.2 : 8.6;
  let par = 0;
  for (let i = 1; i < S.length; i++) { const v = Math.min(41, Math.sqrt(aLat / Math.max(1e-4, Math.abs(S[i].k)))); par += (S[i].s - S[i - 1].s) / v; }
  par *= 1.45;

  stage = { group, S, L, N, nearestIdx, terrainH, treeGrid, notes, startS, finishS, par, wet, crests, seed };
  return stage;
}

// ================================================================ bilen
function buildCar() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.35, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2a38, roughness: 0.1, metalness: 0.6 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; body.add(o); return o; };
  add(new THREE.BoxGeometry(4.1, 0.75, 1.8), paint, 0, 0.75, 0);
  add(new THREE.BoxGeometry(2.1, 0.7, 1.6), paint, -0.35, 1.45, 0);
  add(new THREE.BoxGeometry(0.06, 0.55, 1.45), glass, 0.72, 1.45, 0).rotation.z = -0.5;
  add(new THREE.BoxGeometry(1.7, 0.5, 0.04), glass, -0.35, 1.47, 0.81);
  add(new THREE.BoxGeometry(1.7, 0.5, 0.04), glass, -0.35, 1.47, -0.81);
  add(new THREE.BoxGeometry(4.12, 0.22, 1.82), accent, 0, 0.92, 0);           // rand
  add(new THREE.BoxGeometry(1.1, 0.04, 1.82), accent, 1.4, 1.13, 0);         // huvstreck
  add(new THREE.BoxGeometry(0.3, 0.12, 1.7), dark, -2.05, 1.25, 0);          // vinge
  add(new THREE.BoxGeometry(0.1, 0.3, 0.1), dark, -1.95, 1.1, 0.7); add(new THREE.BoxGeometry(0.1, 0.3, 0.1), dark, -1.95, 1.1, -0.7);
  add(new THREE.BoxGeometry(0.25, 0.4, 1.9), dark, 2.08, 0.55, 0);           // front
  add(new THREE.BoxGeometry(0.5, 0.18, 0.5), dark, -0.2, 1.88, 0);           // takskopa
  const numTex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill(); c.fillStyle = '#111'; c.font = 'bold 80px system-ui'; c.textAlign = 'center'; c.fillText('9', 64, 92); });
  for (const sd of [-1, 1]) { const n = add(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshStandardMaterial({ map: numTex, transparent: true }), 0.1, 0.78, sd * 0.905); n.rotation.y = sd < 0 ? Math.PI : 0; n.castShadow = false; }
  const lampM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 1.5 });
  for (const sd of [-0.55, 0.55]) add(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12), lampM, 2.22, 0.75, sd).rotation.z = Math.PI / 2;
  for (const sd of [-0.25, 0.25]) add(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 12), lampM, 2.22, 0.55, sd).rotation.z = Math.PI / 2;
  // bakruta, bakljus, stötfångare, avgasrör
  add(new THREE.BoxGeometry(0.05, 0.5, 1.4), glass, -1.43, 1.43, 0).rotation.z = 0.55;
  const tailM = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2010, emissiveIntensity: 0.9 });
  for (const sd of [-0.68, 0.68]) add(new THREE.BoxGeometry(0.06, 0.22, 0.36), tailM, -2.06, 0.88, sd);
  add(new THREE.BoxGeometry(0.22, 0.32, 1.86), dark, -2.05, 0.5, 0);
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 }), -2.15, 0.38, 0.55).rotation.z = Math.PI / 2;
  // stänkskydd
  for (const sd of [-0.75, 0.75]) add(new THREE.BoxGeometry(0.05, 0.4, 0.35), accent, -1.75, 0.3, sd);
  // hjul
  const wheels = [];
  const tyreG = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16); tyreG.rotateX(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10); rimG.rotateX(Math.PI / 2);
  const tyreM = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }), rimM = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.3, metalness: 0.7 });
  for (const [x, z, front] of [[1.35, 0.85, 1], [1.35, -0.85, 1], [-1.3, 0.85, 0], [-1.3, -0.85, 0]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.36, z); g.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const t = new THREE.Mesh(tyreG, tyreM); t.castShadow = true; spin.add(t); spin.add(new THREE.Mesh(rimG, rimM));
    wheels.push({ pivot, spin, front });
  }
  g.rotation.order = 'YXZ';
  scene.add(g);
  return { group: g, body, wheels, paint };
}
const car = buildCar();

const C = {
  x: 0, z: 0, y: 0, vy: 0, th: 0, vx: 0, vz: 0, steer: 0, air: false, airT: 0,
  idx: 0, s: 0, dist: 0, rpm: 0, gear: 1, pitch: 0, roll: 0,
  health: { tyres: 1, susp: 1, engine: 1, gearbox: 1, body: 1 }, tyre: 'hard',
};
const PARTS = [
  ['tyres', '🛞 Däck'], ['susp', '🔩 Fjädring'], ['engine', '⚙️ Motor'], ['gearbox', '🔧 Växellåda'], ['body', '🚗 Kaross'],
];
function placeCarAtS(s) {
  const i = clamp(Math.round(s / (stage.L / stage.N)), 0, stage.S.length - 1), p = stage.S[i];
  C.x = p.x; C.z = p.z; C.y = p.y; C.th = p.th; C.vx = C.vz = C.vy = 0; C.idx = i; C.s = p.s; C.air = false; C.steer = 0;
}

// ================================================================ input
const keys = {};
const KEYMAP = { ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hand' };
addEventListener('keydown', e => {
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyR' && G.mode === 'DRIVE') resetToRoad();
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
document.querySelectorAll('#touch [data-k]').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); keys[k] = true; b.classList.add('on'); };
  const off = e => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});

// ================================================================ ljud
const A = { ctx: null };
function initAudio() {
  if (A.ctx) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)(); A.ctx = ctx;
  const master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); A.master = master;
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
  const o2 = ctx.createOscillator(); o2.type = 'square';
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 3;
  const eg = ctx.createGain(); eg.gain.value = 0.0;
  o1.connect(f); o2.connect(f); f.connect(eg); eg.connect(master); o1.start(); o2.start();
  A.o1 = o1; A.o2 = o2; A.ef = f; A.eg = eg;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 600; nf.Q.value = 0.7;
  const ng = ctx.createGain(); ng.gain.value = 0;
  n.connect(nf); nf.connect(ng); ng.connect(master); n.start();
  A.ng = ng; A.nf = nf; A.noise = buf;
}
function thud(strength) {
  if (!A.ctx) return;
  const s = A.ctx.createBufferSource(); s.buffer = A.noise;
  const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
  const g = A.ctx.createGain(); g.gain.setValueAtTime(Math.min(1.2, strength), A.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 0.35);
  s.connect(f); f.connect(g); g.connect(A.master); s.start(); s.stop(A.ctx.currentTime + 0.4);
}
function updateAudio(throttle, speed, surface) {
  if (!A.ctx) return;
  const t = A.ctx.currentTime, on = G.mode === 'DRIVE' || G.mode === 'COUNT';
  const base = 38 + C.rpm * 0.028;
  A.o1.frequency.setTargetAtTime(base, t, 0.05); A.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
  A.ef.frequency.setTargetAtTime(500 + C.rpm * 0.25 * (0.4 + throttle * 0.6), t, 0.05);
  A.eg.gain.setTargetAtTime(on ? 0.06 + throttle * 0.1 : 0, t, 0.1);
  A.ng.gain.setTargetAtTime(on && !C.air ? Math.min(0.5, speed / 60) * (surface === 'road' ? 0.6 : 1) : 0, t, 0.1);
  A.nf.frequency.setTargetAtTime(stage && stage.wet ? 1400 : 700, t, 0.2);
}
// kartläsare
let voiceOn = true;
const svVoice = () => speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('sv'));
function say(text) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text); u.lang = 'sv-SE'; u.rate = 1.35; u.pitch = 1.05;
  const v = svVoice(); if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// ================================================================ fysik
let shake = 0;
const treeHit = new Set();
function physics(dt, inp) {
  const st = stage;
  const fx = Math.cos(C.th), fz = Math.sin(C.th), rx = -Math.sin(C.th), rz = Math.cos(C.th);
  let vf = C.vx * fx + C.vz * fz, vl = C.vx * rx + C.vz * rz;
  const speed = Math.hypot(C.vx, C.vz);
  // var på vägen?
  let best = C.idx, bd = 1e9;
  for (let j = Math.max(0, C.idx - 15); j < Math.min(st.S.length, C.idx + 25); j++) { const d = (st.S[j].x - C.x) ** 2 + (st.S[j].z - C.z) ** 2; if (d < bd) { bd = d; best = j; } }
  if (bd > 400) { const n = st.nearestIdx(C.x, C.z); if (n.i >= 0) { best = n.i; bd = n.d * n.d; } }
  C.idx = best; C.dist = Math.sqrt(bd); C.s = st.S[best].s;
  const surface = C.dist < CFG.roadHalf ? 'road' : C.dist < CFG.roadHalf + CFG.shoulder ? 'shoulder' : 'grass';
  const H = C.health, ty = CFG.tyre[C.tyre];
  const surfGrip = { road: 1, shoulder: 0.82, grass: 0.55 }[surface];
  const tyreGrip = (st.wet ? ty.wet : ty.dry) * (0.62 + 0.38 * H.tyres);
  let grip = (st.wet ? CFG.grip.wet : CFG.grip.dry) * surfGrip * tyreGrip;
  // styrning
  let target = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  target += (1 - H.susp) * 0.22;                                    // skadad fjädring drar åt höger
  C.steer += clamp(target - C.steer, -dt * 5.5, dt * 5.5);
  if (!C.air) {
    const sMax = CFG.steerMax * clamp(speed / 5, 0, 1) / (1 + speed / 26) * (inp.hand ? 1.4 : 1);
    C.th += C.steer * sMax * dt * Math.sign(vf || 1);
    // motor & broms
    const engine = 0.55 + 0.45 * H.engine, gbx = H.gearbox < 0.45 ? 0.82 : 1;
    const vmax = CFG.vmax * engine * gbx * (1 - (1 - H.body) * 0.08);
    if (inp.gas) vf += CFG.accel * engine * gbx * Math.max(0.05, 1 - (vf / vmax) ** 2) * dt * (surface === 'grass' ? 0.7 : 1);
    if (inp.brake) { if (vf > 0.5) vf = Math.max(0, vf - CFG.brake * dt * (0.7 + 0.3 * surfGrip)); else vf = Math.max(-CFG.reverseMax, vf - 6 * dt); }
    if (inp.hand) { vf -= Math.sign(vf) * Math.min(Math.abs(vf), 5 * dt); grip *= 0.32; }
    // motstånd
    const roll = { road: 0.25, shoulder: 0.7, grass: 2.4 }[surface];
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), (roll + 0.0021 * vf * vf) * dt);
    // sidogrepp
    vl *= Math.exp(-grip * dt);
    C.vx = fx * vf + rx * vl; C.vz = fz * vf + rz * vl;
  }
  C.x += C.vx * dt; C.z += C.vz * dt;
  // höjd & hopp
  const gy = st.terrainH(C.x, C.z, { i: C.idx, d: C.dist });
  C.vy -= CFG.gravity * dt; C.y += C.vy * dt;
  if (C.y <= gy) {
    if (C.air && C.airT > 0.25) {
      const imp = -C.vy;
      if (imp > 7) { hurt('susp', (imp - 7) * 0.035); hurt('gearbox', (imp - 7) * 0.012); thud(imp / 12); shake = Math.min(1, imp / 14); }
    }
    const prevY = C.y; C.y = gy;
    C.vy = Math.max(0, (gy - (prevY - C.vy * dt)) / dt) * 0.0 + Math.max(C.vy, 0);
    // följ marken: lodrät fart = markens lutning i färdriktningen
    const ahead = st.terrainH(C.x + C.vx * 0.05, C.z + C.vz * 0.05, { i: C.idx, d: C.dist });
    C.vy = (ahead - gy) / 0.05;
    C.air = false; C.airT = 0;
  } else if (C.y > gy + 0.25) { C.air = true; C.airT += dt; }
  // träd
  const gx = Math.floor(C.x / 10), gz = Math.floor(C.z / 10);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const l = st.treeGrid.get(`${gx + a},${gz + b}`); if (!l) continue;
    for (const t of l) {
      const dx = C.x - t.x, dz = C.z - t.z, d = Math.hypot(dx, dz), min = 1.5 + t.r;
      if (d < min && C.y < t.y + 6) {
        const nx = dx / d, nz = dz / d, vn = C.vx * nx + C.vz * nz;
        C.x = t.x + nx * min; C.z = t.z + nz * min;
        if (vn < 0) {
          const imp = -vn;
          C.vx -= (1.45) * vn * nx; C.vz -= (1.45) * vn * nz; C.vx *= 0.55; C.vz *= 0.55;
          if (imp > 3) {
            const front = (nx * Math.cos(C.th) + nz * Math.sin(C.th)) < -0.5;
            hurt('body', imp * 0.018); hurt('susp', imp * 0.009); if (front) hurt('engine', imp * 0.014);
            thud(imp / 15); shake = Math.min(1, imp / 18);
            if (imp > 9 && !treeHit.has(t)) { treeHit.add(t); flash(imp > 18 ? 'KRASCH!' : 'Aj!', 700); }
          }
        }
      }
    }
  }
  // slitage
  const slide = Math.abs(vl);
  hurt('tyres', (speed * 0.000055 + slide * 0.0004 + (surface === 'grass' ? speed * 0.0002 : 0)) * ty.wear * dt);
  if (surface === 'grass' && speed > 12) hurt('susp', speed * 0.00012 * dt);
  // varvtal & växel
  const sp = Math.abs(vf), gears = [0, 9, 16, 23, 30, 37, 99];
  let gear = 1; while (gear < 6 && sp > gears[gear]) gear++;
  if (H.gearbox < 0.45) gear = Math.min(gear, 5);
  const lo = gears[gear - 1], hi = Math.min(gears[gear], 48);
  C.gear = vf < -0.5 ? 'R' : gear;
  const tgtRpm = 1800 + clamp((sp - lo) / (hi - lo), 0, 1) * 5600 + (inp.gas && C.air ? 1500 : 0);
  C.rpm += (tgtRpm - C.rpm) * Math.min(1, dt * 8);
  return { speed, surface, slide, vf };
}
function hurt(part, n) { C.health[part] = Math.max(0, C.health[part] - n); }
function resetToRoad() {
  const p = stage.S[C.idx];
  placeCarAtS(p.s); G.penalty += CFG.resetPenalty; flash(`+${CFG.resetPenalty} s`, 800);
}

// ================================================================ damm & regn
const DUST_N = 260;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST_N * 3), dustA = new Float32Array(DUST_N), dustVel = new Float32Array(DUST_N * 3), dustLife = new Float32Array(DUST_N);
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
dustGeo.setAttribute('alpha', new THREE.BufferAttribute(dustA, 1));
const dustMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { color: { value: new THREE.Color(0xb59e7e) }, size: { value: 420 } },
  vertexShader: 'attribute float alpha; varying float vA; uniform float size; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (0.6 + (1.0 - alpha)) / -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 color; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(color, vA * (1.0 - d*2.0) * 0.55); }',
});
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);
let dustI = 0;
function emitDust(n, speed) {
  for (let k = 0; k < n; k++) {
    const i = dustI = (dustI + 1) % DUST_N;
    const side = k % 2 ? 0.8 : -0.8;
    dustPos[i * 3] = C.x - Math.cos(C.th) * 1.6 - Math.sin(C.th) * side; dustPos[i * 3 + 1] = C.y + 0.3; dustPos[i * 3 + 2] = C.z - Math.sin(C.th) * 1.6 + Math.cos(C.th) * side;
    dustVel[i * 3] = -C.vx * 0.15 + (Math.random() - 0.5) * 2; dustVel[i * 3 + 1] = 0.6 + Math.random() * 1.2; dustVel[i * 3 + 2] = -C.vz * 0.15 + (Math.random() - 0.5) * 2;
    dustLife[i] = 1; dustA[i] = Math.min(1, speed / 25);
  }
}
function updateDust(dt) {
  for (let i = 0; i < DUST_N; i++) {
    if (dustLife[i] <= 0) { dustA[i] = 0; continue; }
    dustLife[i] -= dt * (stage.wet ? 1.6 : 0.55);
    dustPos[i * 3] += dustVel[i * 3] * dt; dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt; dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
    dustVel[i * 3] *= 0.97; dustVel[i * 3 + 2] *= 0.97;
    dustA[i] = Math.max(0, dustLife[i]) * dustA[i] / Math.max(0.01, dustLife[i] + dt);
  }
  dustGeo.attributes.position.needsUpdate = true; dustGeo.attributes.alpha.needsUpdate = true;
}
const RAIN_N = 1400;
const rainGeo = new THREE.BufferGeometry(); const rainPos = new Float32Array(RAIN_N * 6);
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45 }));
rain.frustumCulled = false; scene.add(rain);
for (let i = 0; i < RAIN_N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; rainPos.set([x, y, z, x + 0.1, y - 0.9, z], i * 6); }
function updateRain(dt) {
  rain.visible = !!stage.wet;
  if (!stage.wet) return;
  rain.position.set(camera.position.x, camera.position.y - 12, camera.position.z);
  for (let i = 0; i < RAIN_N; i++) {
    let y = rainPos[i * 6 + 1] - dt * 26; if (y < 0) y += 30;
    rainPos[i * 6 + 1] = y; rainPos[i * 6 + 4] = y - 0.9;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ================================================================ spelflöde
const $ = id => document.getElementById(id);
const G = {
  mode: 'INTRO', stageNo: 0, t: 0, penalty: 0, count: 0, times: [], penalties: [], rivalTimes: [], noteI: 0, noteSaid: -1,
  stages: [],
};
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
function flash(text, ms = 1000) { const m = $('msg'); m.textContent = text; m.style.opacity = 1; clearTimeout(flash.t); flash.t = setTimeout(() => { m.style.opacity = 0; }, ms); }

function newRally() {
  const base = Math.floor(Math.random() * 1e9);
  const names = [...STAGE_NAMES].sort(() => Math.random() - 0.5);
  G.stages = [{ seed: base, wet: false, name: `SS1 ${names[0]}` }, { seed: base + 77, wet: true, name: `SS2 ${names[1]}` }];
  G.stageNo = 0; G.times = []; G.penalties = []; G.rivalTimes = CFG.rivals.map(() => []);
  Object.keys(C.health).forEach(k => C.health[k] = 1); C.tyre = 'hard';
}
function setWeather(wet) {
  if (wet) {
    skyMat.uniforms.top.value.set(0x56606c); skyMat.uniforms.hor.value.set(0x9aa3ac);
    scene.fog.color.set(0x8e979f); scene.fog.near = 40; scene.fog.far = 330;
    sun.intensity = 0.7; hemi.intensity = 1.25; renderer.toneMappingExposure = 1.15;
  } else {
    skyMat.uniforms.top.value.set(0x4a7ac0); skyMat.uniforms.hor.value.set(0xf3d6a8);
    scene.fog.color.set(0xdcd4c4); scene.fog.near = 120; scene.fog.far = 700;
    sun.intensity = 2.4; hemi.intensity = 1.1; renderer.toneMappingExposure = 1.05;
  }
}
function startStage() {
  const def = G.stages[G.stageNo];
  buildStage(def.seed, def.wet); setWeather(def.wet);
  placeCarAtS(stage.startS); G.t = 0; G.penalty = 0; G.noteI = 0; G.noteSaid = -1; treeHit.clear();
  $('ssName').textContent = def.name + (def.wet ? ' · regn' : '');
  G.mode = 'COUNT'; G.count = 3.6;
  // rivalernas tider för sträckan
  CFG.rivals.forEach((r, i) => G.rivalTimes[i][G.stageNo] = stage.par * (1 + r.k + (Math.random() - 0.5) * 0.03));
}
function finishStage() {
  G.mode = 'DONE';
  G.times[G.stageNo] = G.t; G.penalties[G.stageNo] = G.penalty;
  const def = G.stages[G.stageNo];
  const me = G.t + G.penalty;
  const rows = CFG.rivals.map((r, i) => ({ name: r.name, car: r.car, t: G.rivalTimes[i][G.stageNo] })).concat([{ name: 'Du', car: 'Orange #9', t: me, me: true }]).sort((a, b) => a.t - b.t);
  const pos = rows.findIndex(r => r.me) + 1;
  flash('MÅL!', 1200); say(pos === 1 ? 'Mål! Snabbast hittills!' : `Mål! Plats ${pos}.`);
  setTimeout(() => {
    $('resTitle').textContent = `${def.name} – plats ${pos} av ${rows.length}`;
    $('resSub').textContent = `Din tid ${fmt(G.t)}${G.penalty ? ` + ${G.penalty} s straff` : ''}`;
    $('resTable').innerHTML = `<tr><th>#</th><th>Förare</th><th>Bil</th><th class="r">Tid</th><th class="r">Diff</th></tr>` +
      rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}</td><td>${r.car}</td><td class="r">${fmt(r.t)}</td><td class="r">${i ? '+' + (r.t - rows[0].t).toFixed(1) : ''}</td></tr>`).join('');
    $('resDmg').innerHTML = `<h2>Bilens skick</h2>` + dmgHtml();
    const last = G.stageNo === G.stages.length - 1;
    $('resBtn').textContent = last ? 'Se slutresultatet' : 'Till serviceparken';
    $('result').classList.remove('hidden');
  }, 1500);
}
function dmgHtml() {
  return `<div style="display:grid;grid-template-columns:auto 1fr 50px;gap:4px 10px;align-items:center;font-size:14px">` + PARTS.map(([k, n]) => {
    const h = C.health[k], col = h > 0.75 ? 'var(--ok)' : h > 0.45 ? 'var(--warn)' : 'var(--bad)';
    return `<span>${n}</span><div class="bar" style="height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden"><i style="display:block;height:100%;width:${h * 100}%;background:${col}"></i></div><span style="text-align:right">${Math.round(h * 100)}%</span>`;
  }).join('') + '</div>';
}
$('resBtn').onclick = () => {
  $('result').classList.add('hidden');
  if (G.stageNo === G.stages.length - 1) showFinal(); else openService();
};

// ---------------- service
const SV = { jobs: [], lanes: [[], []], tyre: 'hard' };
function openService() {
  G.mode = 'SERVICE';
  const next = G.stages[G.stageNo + 1];
  $('forecast').innerHTML = `<b>Prognos för ${next.name}:</b> ${next.wet ? '🌧️ Regn – blött och halt grus. Mjuka däck ger mer grepp men slits snabbare.' : '☀️ Torrt grus.'}`;
  const H = C.health; SV.lanes = [[], []]; SV.tyre = C.tyre;
  const mins = (k, a, b) => Math.ceil(a + b * (1 - H[k]));
  SV.jobs = [];
  SV.jobs.push({ id: 'tyres', name: 'Byt däck (alla fyra)', min: 4, part: 'tyres', why: `Slitage ${Math.round((1 - H.tyres) * 100)}%` });
  if (H.susp < 0.97) SV.jobs.push({ id: 'susp', name: 'Laga fjädring', min: mins('susp', 2, 14), part: 'susp', why: `Skick ${Math.round(H.susp * 100)}% – drar åt sidan` });
  if (H.engine < 0.97) SV.jobs.push({ id: 'engine', name: 'Laga motor & kylare', min: mins('engine', 3, 16), part: 'engine', why: `Skick ${Math.round(H.engine * 100)}% – mindre kraft` });
  if (H.gearbox < 0.97) SV.jobs.push({ id: 'gearbox', name: 'Byt växellåda', min: mins('gearbox', 5, 14), part: 'gearbox', why: `Skick ${Math.round(H.gearbox * 100)}%` });
  if (H.body < 0.97) SV.jobs.push({ id: 'body', name: 'Riktning & kaross', min: mins('body', 1, 8), part: 'body', why: `Skick ${Math.round(H.body * 100)}% – sämre fart` });
  renderService();
  $('service').classList.remove('hidden');
}
const laneLoad = l => SV.lanes[l].reduce((a, j) => a + j.min, 0);
function renderService() {
  const assigned = new Set(SV.lanes.flat().map(j => j.id));
  $('jobs').innerHTML = '';
  for (const j of SV.jobs) {
    const d = document.createElement('div'); d.className = 'job' + (assigned.has(j.id) ? ' done' : '');
    d.innerHTML = `<div><div class="nm">${j.name}</div><div class="st">${j.why}</div></div><div class="mn">${j.min} min</div>`;
    d.onclick = () => {
      if (assigned.has(j.id)) return;
      const l = laneLoad(0) <= laneLoad(1) ? 0 : 1; SV.lanes[l].push(j); renderService();
    };
    $('jobs').appendChild(d);
  }
  const scale = 100 / Math.max(28, laneLoad(0), laneLoad(1));
  const colors = { tyres: '#fbbf24', susp: '#60a5fa', engine: '#f87171', gearbox: '#c084fc', body: '#4ade80' };
  $('lanes').innerHTML = '';
  ['Mekaniker Anna', 'Mekaniker Leif'].forEach((who, l) => {
    const lane = document.createElement('div'); lane.className = 'lane';
    lane.innerHTML = `<span class="who">${who} · ${laneLoad(l)} min</span><div class="limit" style="left:${CFG.serviceMin * scale}%"></div>`;
    let x = 0;
    for (const j of SV.lanes[l]) {
      const b = document.createElement('div'); b.className = 'blk';
      b.style.left = `${x * scale}%`; b.style.width = `${j.min * scale}%`; b.style.background = colors[j.id];
      b.textContent = j.name.split(' ')[1] || j.name; b.title = 'Tryck för att ta bort';
      b.onclick = () => { SV.lanes[l] = SV.lanes[l].filter(q => q !== j); renderService(); };
      lane.appendChild(b); x += j.min;
    }
    $('lanes').appendChild(lane);
  });
  const total = Math.max(laneLoad(0), laneLoad(1)), late = Math.max(0, Math.ceil(total - CFG.serviceMin));
  $('svcsum').innerHTML = `Klart efter <b>${total} min</b> av ${CFG.serviceMin}. ` + (late ? `<span style="color:var(--bad)">${late} min sent = <b>+${late * CFG.latePenalty} s</b> straff</span>` : `<span style="color:var(--ok)">Inom tiden</span>`);
  const tyresJob = assigned.has('tyres');
  $('tyres').innerHTML = '';
  for (const k of ['hard', 'soft']) {
    const t = CFG.tyre[k], d = document.createElement('div'); d.className = 'tyre' + (SV.tyre === k ? ' on' : '');
    d.innerHTML = `<b>${t.name}</b>${k === 'hard' ? 'Håller länge. Mindre grepp i regn.' : 'Bra grepp i regn. Slits fort.'}`;
    d.onclick = () => {
      SV.tyre = k;
      if (k !== C.tyre && !tyresJob) { const l = laneLoad(0) <= laneLoad(1) ? 0 : 1; SV.lanes[l].push(SV.jobs.find(j => j.id === 'tyres')); }
      renderService();
    };
    $('tyres').appendChild(d);
  }
  if (!tyresJob && SV.tyre !== C.tyre) SV.tyre = C.tyre;
}
$('svcBtn').onclick = () => {
  const done = SV.lanes.flat();
  for (const j of done) C.health[j.part] = 1;
  if (done.some(j => j.id === 'tyres')) C.tyre = SV.tyre;
  const total = Math.max(laneLoad(0), laneLoad(1)), late = Math.max(0, Math.ceil(total - CFG.serviceMin));
  $('service').classList.add('hidden');
  G.stageNo++; startStage(); G.penalty = late * CFG.latePenalty;
  if (late) flash(`+${late * CFG.latePenalty} s`, 1200);
};

function showFinal() {
  G.mode = 'FINAL';
  const tot = i => G.rivalTimes[i].reduce((a, b) => a + b, 0);
  const me = G.times.reduce((a, b) => a + b, 0) + G.penalties.reduce((a, b) => a + b, 0);
  const rows = CFG.rivals.map((r, i) => ({ name: r.name, car: r.car, t: tot(i) })).concat([{ name: 'Du', car: 'Orange #9', t: me, me: true }]).sort((a, b) => a.t - b.t);
  const pos = rows.findIndex(r => r.me) + 1;
  $('resTitle').textContent = pos === 1 ? '🏆 Du vann rallyt!' : `Slutresultat: plats ${pos} av ${rows.length}`;
  $('resSub').textContent = pos === 1 ? 'Sponsorerna ringer redan.' : pos <= 3 ? 'På pallen! Nästa gång tar du segern.' : 'Det finns tid att hämta. Kör igen – sträckorna blir nya varje gång.';
  $('resTable').innerHTML = `<tr><th>#</th><th>Förare</th><th>Bil</th><th class="r">Totaltid</th><th class="r">Diff</th></tr>` +
    rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}</td><td>${r.car}</td><td class="r">${fmt(r.t)}</td><td class="r">${i ? '+' + (r.t - rows[0].t).toFixed(1) : ''}</td></tr>`).join('');
  $('resDmg').innerHTML = '<p class="small">Det här var ett känslotest: två sträckor och en servicepark. I det riktiga spelet blir det en hel karriär med rivaler, sponsorer, bilbyggen och fler mekaniker.</p>';
  $('resBtn').textContent = 'Kör en ny rally';
  $('resBtn').onclick = () => { $('result').classList.add('hidden'); newRally(); startStage(); $('resBtn').onclick = resBtnDefault; };
  $('result').classList.remove('hidden');
}
const resBtnDefault = $('resBtn').onclick;

$('startBtn').onclick = () => { initAudio(); $('intro').classList.add('hidden'); newRally(); startStage(); };
$('voiceBtn').onclick = () => { voiceOn = !voiceOn; $('voiceBtn').textContent = voiceOn ? '🔊' : '🔇'; if (!voiceOn) speechSynthesis.cancel(); };
$('resetBtn').onclick = () => { if (G.mode === 'DRIVE') resetToRoad(); };

// ================================================================ HUD
function arrowFor(n) {
  if (n.crest) return n.big ? '▲' : '⌒';
  return n.dir === 'Höger' ? '↱' : '↰';
}
function updateHUD(speed) {
  $('time').textContent = fmt(G.t);
  $('pen').textContent = G.penalty ? `+${G.penalty} s straff` : '';
  $('progress').firstElementChild.style.width = `${clamp((C.s - stage.startS) / (stage.finishS - stage.startS), 0, 1) * 100}%`;
  $('kmh').textContent = Math.round(speed * 3.6);
  $('gear').textContent = C.gear;
  // noter: nästa två framför bilen
  const ahead = stage.notes.filter(n => n.s > C.s - 5).slice(0, 2);
  const html = ahead.map((n, i) => `<div class="pn panel ${i ? 'next' : ''} ${n.crest ? 'hop' : ''}"><div class="ar">${arrowFor(n)}</div><div class="tx">${n.text}</div></div>`).join('');
  if ($('note')._h !== html) { $('note').innerHTML = html; $('note')._h = html; }
  // säg noten i god tid
  const lead = 45 + speed * 1.6;
  const n = stage.notes.find(q => q.s > C.s);
  if (n && n.s - C.s < lead && G.noteSaid !== n.s && G.mode === 'DRIVE') {
    G.noteSaid = n.s;
    const nxt = stage.notes[stage.notes.indexOf(n) + 1];
    say(nxt && nxt.s - n.s < 40 ? `${n.say}, in i ${nxt.say}` : n.say);
    if (nxt && nxt.s - n.s < 40) G.noteSaid = nxt.s;
  }
  const dh = PARTS.map(([k, nm]) => { const h = C.health[k], col = h > 0.75 ? '#4ade80' : h > 0.45 ? '#fbbf24' : '#f87171'; return `<span>${nm}</span><div class="bar"><i style="width:${h * 100}%;background:${col}"></i></div>`; }).join('');
  if ($('dmg')._h !== dh) { $('dmg').innerHTML = dh; $('dmg')._h = dh; }
}

// ================================================================ loop
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let lastSurface = 'road', lastThrottle = 0;
function frame() {
  requestAnimationFrame(frame);
  const ts = window.__ts || 1;
  const dt = Math.min(clock.getDelta(), 0.05) * ts;
  if (!stage) { renderer.render(scene, camera); return; }
  let info = { speed: 0, surface: 'road', slide: 0 };
  const inp = window.__auto ? autopilot() : { ...keys };
  if (G.mode === 'COUNT') {
    const prev = Math.ceil(G.count); G.count -= dt; const now = Math.ceil(G.count);
    if (now !== prev) { if (now > 0) { flash(String(now), 700); say(String(['', 'ett', 'två', 'tre'][now] || now)); } else { flash('KÖR!', 800); say('kör'); G.mode = 'DRIVE'; } }
  }
  if (G.mode === 'DRIVE' || G.mode === 'DONE') {
    const driving = G.mode === 'DRIVE';
    const steps = 3 * ts;
    for (let i = 0; i < steps; i++) info = physics(dt / steps, driving ? inp : { brake: true });
    if (driving) {
      G.t += dt;
      if (C.s >= stage.finishS && C.dist < 15) finishStage();
    }
    if (!C.air && info.speed > 6 && info.surface !== 'road' || (!C.air && info.speed > 9)) emitDust(info.surface === 'road' ? 1 : 2, info.speed);
    lastSurface = info.surface;
  }
  updateDust(dt); updateRain(dt);
  // bilens utseende
  const fwd = new THREE.Vector3(Math.cos(C.th), 0, Math.sin(C.th));
  car.group.position.set(C.x, C.y, C.z);
  car.group.rotation.y = -C.th;
  const vf = C.vx * fwd.x + C.vz * fwd.z, vl = C.vx * -fwd.z + C.vz * fwd.x;
  const tgtPitch = C.air ? clamp(C.vy * 0.02, -0.25, 0.2) : (keys.brake ? -0.035 : keys.gas ? 0.02 : 0);
  C.pitch += (tgtPitch - C.pitch) * Math.min(1, dt * 6);
  const tgtRoll = clamp(-C.steer * Math.abs(vf) * 0.004, -0.09, 0.09) + (1 - C.health.susp) * 0.05;
  C.roll += (tgtRoll - C.roll) * Math.min(1, dt * 5);
  car.body.rotation.set(C.roll, 0, C.pitch);
  car.body.position.y = (lastSurface === 'grass' ? Math.sin(G.t * 40) * 0.04 : 0) + (1 - C.health.susp) * Math.sin(G.t * 23) * 0.05;
  for (const w of car.wheels) { w.spin.rotation.z -= vf * dt / 0.36; if (w.front) w.pivot.rotation.y = -C.steer * 0.45; }
  // kamera
  const back = 8.2, up = 3.3;
  const tgt = new THREE.Vector3(C.x - fwd.x * back, C.y + up, C.z - fwd.z * back);
  if (G.mode === 'INTRO') tgt.set(C.x + 6, C.y + 2.5, C.z + 7);
  camPos.lerp(tgt, Math.min(1, dt * 4.5));
  const groundAtCam = stage.terrainH(camPos.x, camPos.z);
  if (camPos.y < groundAtCam + 1.2) camPos.y = groundAtCam + 1.2;
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.6; camera.position.y += (Math.random() - 0.5) * shake * 0.6; shake = Math.max(0, shake - dt * 2.5); }
  camLook.set(C.x + fwd.x * 6, C.y + 1.2, C.z + fwd.z * 6);
  camera.lookAt(camLook);
  sun.position.set(C.x - 60, C.y + 90, C.z - 40); sun.target.position.set(C.x, C.y, C.z);
  sky.position.copy(camera.position);
  const throttle = G.mode === 'DRIVE' && inp.gas ? 1 : 0;
  lastThrottle += (throttle - lastThrottle) * Math.min(1, dt * 6);
  updateAudio(lastThrottle, info.speed, info.surface);
  updateHUD(info.speed);
  renderer.render(scene, camera);
}

// autopilot (för test): följer vägen med fart efter kurvorna
function autopilot() {
  const S = stage.S, look = clamp(Math.round((8 + Math.hypot(C.vx, C.vz) * 0.45) / 2), 3, 40);
  const p = S[Math.min(S.length - 1, C.idx + look)];
  const want = Math.atan2(p.z - C.z, p.x - C.x), err = wrapA(want - C.th);
  let kmax = 0; for (let j = C.idx; j < Math.min(S.length, C.idx + 45); j++) kmax = Math.max(kmax, Math.abs(S[j].k));
  const vt = Math.min(40, Math.sqrt((stage.wet ? 6.2 : 7.4) / Math.max(1e-4, kmax)));
  const v = Math.hypot(C.vx, C.vz);
  return { gas: v < vt, brake: v > vt + 3, left: err < -0.04, right: err > 0.04, hand: false };
}

// startvy innan man trycker start
buildStage(12345, false); placeCarAtS(stage.startS); camPos.set(C.x + 6, C.y + 2.5, C.z + 7);
frame();
window.__r = { G, C, CFG, stage: () => stage, finishStage, openService };
