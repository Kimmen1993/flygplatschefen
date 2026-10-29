// Flygplatschefen – 3D-känsla (prototyp). Snabb och slängbar kod, se README.md.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------- inställningar
const CFG = {
  duration: 300,          // sekunder per pass
  goal: 8,                // avgångar för att klara passet
  waitLimit: 30,          // sek ett plan väntar på dig innan betyget börjar sjunka
  waitDrain: 0.6,         // betygs-% per sekund och plan när det väntat för länge
  goAroundPenalty: 8,
  emergencyAt: 110,
  emergencyTime: 60,
  emergencyNoFire: 25,
  emergencyDivert: 30,
  departureBonus: 2,
  fuelTime: 6,
  boardTime: 8,
  spawnTimes: [4, 28, 52, 72, 92, 128, 146, 166, 186, 206, 226, 248, 268],
  gatesX: [-30, 0, 30],
};

const AIRLINES = [
  { code: 'NF', color: 0x2f6fd6 },  // Nordflyg
  { code: 'FA', color: 0xd8443a },  // Fjällair
  { code: 'SG', color: 0x1f9e74 },  // Skärgårdsflyg
  { code: 'BL', color: 0xe0a326 },  // Blåsut
];

// ---------------------------------------------------------------- grund
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1c2236, 220, 820);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = 1.38;
controls.minDistance = 35;
controls.maxDistance = 520;

function fitCamera() {
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  const portrait = camera.aspect < 0.9;
  // liggande skärm: från bansidan; stående (telefon): längs banan så att planen kommer in från horisonten
  controls.target.set(portrait ? -20 : -55, 0, portrait ? 15 : 22);
  const dir = portrait ? new THREE.Vector3(0.82, 0.62, -0.12) : new THREE.Vector3(0.1, 0.55, -0.83);
  const dist = THREE.MathUtils.clamp((portrait ? 72 : 132) / Math.tan(hfov / 2), 120, 420);
  camera.position.copy(controls.target).addScaledVector(dir.normalize(), dist);
}
fitCamera();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  fitCamera();
});

// ---------------------------------------------------------------- texturer
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTexture();

function noiseTexture(base, spread, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    img.data[i] = base[0] + n; img.data[i + 1] = base[1] + n; img.data[i + 2] = base[2] + n; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(cols, lit = 0.85) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 64);
  const w = 1024 / cols;
  for (let i = 0; i < cols; i++) {
    if (Math.random() > lit) continue;
    const k = 0.6 + Math.random() * 0.4;
    g.fillStyle = `rgba(255, ${200 + Math.random() * 40 | 0}, ${130 + Math.random() * 50 | 0}, ${k})`;
    g.fillRect(i * w + 2, 6, w - 4, 52);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- ljus & himmel
scene.add(new THREE.HemisphereLight(0x6a7cb8, 0x2a2618, 1.7));
const moon = new THREE.DirectionalLight(0xa9bbff, 1.5);
moon.position.set(-60, 140, -90);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -170, right: 170, top: 120, bottom: -120, near: 10, far: 400 });
moon.shadow.camera.updateProjectionMatrix();
moon.shadow.bias = -0.0005;
scene.add(moon);
const dusk = new THREE.DirectionalLight(0xff8a4a, 1.3);
dusk.position.set(-300, 25, -60);
scene.add(dusk);

{ // himmel med gradient
  const geo = new THREE.SphereGeometry(1400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 top = vec3(0.03,0.05,0.13);
        vec3 mid = vec3(0.12,0.16,0.30);
        vec3 hor = vec3(0.85,0.42,0.22);
        float west = smoothstep(0.2, -1.0, vP.x) * 0.9 + 0.1;
        vec3 c = mix(mid, top, smoothstep(0.05, 0.6, h));
        c = mix(mix(mid, hor, west), c, smoothstep(-0.02, 0.18, h));
        if (h < -0.02) c = vec3(0.07,0.08,0.12);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
  // stjärnor
  const pts = [];
  for (let i = 0; i < 500; i++) {
    const th = Math.random() * Math.PI * 2, y = 0.25 + Math.random() * 0.75, r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(th) * r * 1300, y * 1300, Math.sin(th) * r * 1300);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
}

// ---------------------------------------------------------------- statiska ljuspunkter
function lightPoints(list, color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flat(), 3));
  const m = new THREE.PointsMaterial({ color, size, map: GLOW, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const p = new THREE.Points(g, m); scene.add(p); return p;
}
function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size); return s;
}

// ---------------------------------------------------------------- mark & flygplats
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });
const pickables = [];
function box(w, h, d, material, x, y, z, { cast = false, receive = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; scene.add(m); return m;
}

{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ map: noiseTexture([52, 70, 48], 24, 220), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
}

const asphalt = mat(0x2c2e33, { roughness: 0.8 });
const taxiMat = mat(0x34373d);
const concrete = mat(0x55585e, { map: noiseTexture([120, 120, 125], 18, 10) });
const white = mat(0xd8dbe0, { roughness: 0.6 });
const yellow = mat(0xd9b23a, { roughness: 0.6 });

// Bana 09 längs x-axeln
const runway = box(190, 0.2, 11, asphalt, 0, 0.1, 0);
runway.userData.pick = { type: 'runway' }; pickables.push(runway);
for (let x = -80; x <= 80; x += 10) box(5, 0.05, 0.45, white, x, 0.22, 0);
for (const end of [-91, 91]) for (let z = -4; z <= 4; z += 1.3) box(5, 0.05, 0.7, white, end + (end < 0 ? 3 : -3), 0.22, z);
box(1.2, 0.05, 11, white, -62, 0.22, 0); // sättningszon

// banljus
const rwyEdge = [];
for (let x = -94; x <= 94; x += 6) { rwyEdge.push([x, 0.5, -6]); rwyEdge.push([x, 0.5, 6]); }
lightPoints(rwyEdge, 0xfff1c9, 2.6);
const thrGreen = [], endRed = [];
for (let z = -5.5; z <= 5.5; z += 1.4) { thrGreen.push([-96, 0.5, z]); endRed.push([96, 0.5, z]); }
lightPoints(thrGreen, 0x4dff8a, 3);
lightPoints(endRed, 0xff3b3b, 3);
// inflygningsljus + "kaninen" som blinkar mot banan
const appr = [];
for (let x = -102; x >= -190; x -= 6) { appr.push([x, 0.6, 0]); if (x % 30 === 0) for (let z = -6; z <= 6; z += 2) appr.push([x, 0.6, z]); }
lightPoints(appr, 0xffffff, 2.4);
const rabbit = glowSprite(0xffffff, 9); scene.add(rabbit);

// taxibanor
box(6, 0.16, 18, taxiMat, 52, 0.08, 9);        // avfart öst
box(94, 0.16, 6, taxiMat, 8, 0.08, 18);        // parallell taxibana
box(6, 0.16, 32, taxiMat, -75, 0.08, 17);      // in till banan väst
box(150, 0.14, 34, concrete, -12, 0.07, 37);   // plattan
box(28, 0.14, 14, concrete, 66, 0.07, 36);     // depå
const taxiGreen = [];
for (let z = 1; z <= 18; z += 3) taxiGreen.push([52, 0.4, z]);
for (let x = 52; x >= -36; x -= 4) taxiGreen.push([x, 0.4, 18]);
for (let z = 32; z >= 1; z -= 3) taxiGreen.push([-75, 0.4, z]);
lightPoints(taxiGreen, 0x3dff8a, 1.8);
const taxiBlue = [];
for (let x = 50; x >= -36; x -= 6) { taxiBlue.push([x, 0.4, 14.5]); }
for (let z = 6; z <= 28; z += 5) { taxiBlue.push([-78.5, 0.4, z]); taxiBlue.push([-71.5, 0.4, z]); }
lightPoints(taxiBlue, 0x4a7dff, 1.8);
// stopplinje vid väntläget
box(6, 0.05, 0.6, yellow, -75, 0.2, 9);
lightPoints([[-77, 0.5, 8.6], [-75.6, 0.5, 8.6], [-74.4, 0.5, 8.6], [-73, 0.5, 8.6]], 0xffa040, 1.6);

// terminal
const term = box(118, 11, 13, mat(0x3d424b, { roughness: 0.7 }), -12, 5.5, 60, { cast: true });
box(120, 0.8, 15, mat(0x2a2e35), -12, 11.4, 60, { cast: true });
const win = new THREE.Mesh(new THREE.PlaneGeometry(116, 6),
  new THREE.MeshStandardMaterial({ color: 0x111418, emissive: 0xffffff, emissiveMap: windowTexture(64), emissiveIntensity: 1.3, roughness: 0.3 }));
win.position.set(-12, 6, 53.45); win.rotation.y = Math.PI; scene.add(win);
// gatefält, bryggor och skyltar
const gates = CFG.gatesX.map((gx, i) => {
  box(0.35, 0.05, 18, yellow, gx, 0.17, 37);
  box(4, 0.05, 0.35, yellow, gx, 0.17, 46.5);
  box(2.6, 2.4, 8, mat(0x6b717b, { roughness: 0.6 }), gx - 3.2, 4.2, 49.5, { cast: true });
  box(1.2, 4, 1.2, mat(0x4b5059), gx - 3.2, 2, 46.5);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(22, 4, 20), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.set(gx, 2, 40); hit.userData.pick = { type: 'gate', idx: i }; scene.add(hit); pickables.push(hit);
  const ring = new THREE.Mesh(new THREE.RingGeometry(9, 10.2, 40), new THREE.MeshBasicMaterial({ color: 0x38d39f, transparent: true, opacity: 0.0, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(gx, 0.3, 42); scene.add(ring);
  return { x: gx, idx: i, plane: null, reserved: null, ring, name: `Gate ${i + 1}` };
});
// torn
box(5, 30, 5, mat(0x4c525c), 74, 15, 62, { cast: true });
{
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.5, 4.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x0d1a1c, emissive: 0x4fd6c8, emissiveIntensity: 0.55, roughness: 0.2 }));
  cab.position.set(74, 32.5, 62); scene.add(cab);
  box(12, 0.8, 12, mat(0x2a2e35), 74, 35.2, 62);
}
const towerBeacon = glowSprite(0xff2a2a, 6); towerBeacon.position.set(74, 37, 62); scene.add(towerBeacon);
// hangar (smygtitt på kommande innehåll)
box(26, 13, 22, mat(0x5a6170, { roughness: 0.6 }), 100, 6.5, 26, { cast: true });
box(0.4, 10, 18, mat(0x0d0f14), 86.9, 5.2, 26);
lightPoints([[86.5, 11, 18], [86.5, 11, 34]], 0xffd9a0, 4);
// strålkastarmaster på plattan
for (const [x, z] of [[-55, 30], [-15, 30], [25, 30], [60, 30]]) {
  box(0.6, 18, 0.6, mat(0x555a62), x, 9, z, { cast: true });
  const s = new THREE.SpotLight(0xffd7a0, 900, 70, 0.9, 0.6, 1.6);
  s.position.set(x, 18, z); s.target.position.set(x, 0, z + 10); scene.add(s, s.target);
  const g = glowSprite(0xffe1b0, 7); g.position.set(x, 18.2, z); scene.add(g);
}
// stadsljus vid horisonten
{
  const city = [];
  for (let i = 0; i < 900; i++) {
    const a = -0.4 + Math.random() * 2.2 + (Math.random() < 0.5 ? Math.PI : 0), r = 520 + Math.random() * 300;
    city.push([Math.cos(a) * r, 0.5 + Math.random() * 3, Math.sin(a) * r]);
  }
  const p = lightPoints(city, 0xffc58a, 3.2); p.material.fog = false; p.material.opacity = 0.7;
}

// ---------------------------------------------------------------- plan
function buildPlane(color) {
  const g = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 2.6; g.add(body);
  const skin = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.4, metalness: 0.25 });
  const livery = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.5, metalness: 0.5 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; body.add(o); return o;
  };
  add(new THREE.CylinderGeometry(1.3, 1.3, 12, 18), skin, 0, 0, 0, 0, 0, Math.PI / 2);
  const nose = add(new THREE.SphereGeometry(1.3, 18, 12), skin, 6, 0, 0); nose.scale.set(2.1, 1, 1);
  add(new THREE.ConeGeometry(1.3, 5, 18), skin, -8.5, 0.25, 0, 0, 0, Math.PI / 2);
  add(new THREE.BoxGeometry(12.5, 0.32, 2.64), livery, 0, -0.55, 0); // magstrimma
  for (const s of [-1, 1]) { // vingar
    const w = add(new THREE.BoxGeometry(3.4, 0.28, 8), skin, -0.6, -0.55, s * 4.6, 0, -s * 0.38, 0);
    w.position.x -= 1.4;
    add(new THREE.CylinderGeometry(0.62, 0.55, 2.8, 14), livery, 0.4, -1.35, s * 3.6, 0, 0, Math.PI / 2);
    add(new THREE.BoxGeometry(1.6, 0.18, 3.2), skin, -9.2, 0.45, s * 1.8, 0, -s * 0.4, 0);
  }
  const fin = new THREE.Shape();
  fin.moveTo(-6.6, 0); fin.lineTo(-10.6, 0); fin.lineTo(-11.0, 4.3); fin.lineTo(-9.4, 4.3); fin.closePath();
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.3, bevelEnabled: false }); fg.translate(0, 0, -0.15);
  add(fg, livery, 0, 0.9, 0);
  // fönster som lyser
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(9, 0.22, 0.05), winMat, 0.6, 0.45, s * 1.29).castShadow = false;
  add(new THREE.BoxGeometry(0.9, 0.4, 2.0), new THREE.MeshBasicMaterial({ color: 0x223040 }), 7.6, 0.55, 0).castShadow = false;
  // positionsljus
  const lights = {
    red: glowSprite(0xff3030, 2.2), green: glowSprite(0x30ff70, 2.2), tail: glowSprite(0xffffff, 1.8),
    beacon: glowSprite(0xff2020, 3.2), strobeL: glowSprite(0xffffff, 3.5), strobeR: glowSprite(0xffffff, 3.5),
    landing: glowSprite(0xfff4dd, 9),
  };
  lights.red.position.set(-3.6, -0.3, -8.3); lights.strobeL.position.copy(lights.red.position);
  lights.green.position.set(-3.6, -0.3, 8.3); lights.strobeR.position.copy(lights.green.position);
  lights.tail.position.set(-11, 0.4, 0); lights.beacon.position.set(-1, 1.5, 0);
  lights.landing.position.set(8.8, -0.4, 0);
  for (const l of Object.values(lights)) body.add(l);
  // osynlig träffyta
  const hit = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 20), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.y = 2.5; g.add(hit);
  // markering när valt
  const ring = new THREE.Mesh(new THREE.RingGeometry(10, 11.2, 40), new THREE.MeshBasicMaterial({ color: 0x38d39f, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.35; ring.visible = false; g.add(ring);
  g.rotation.order = 'YZX';
  scene.add(g);
  return { group: g, body, lights, hit, ring };
}

// ---------------------------------------------------------------- fordon
function buildFuelTruck() {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(1.8, 1.8, 2.2), mat(0xf0f0f0, { roughness: 0.5 }), 2.3, 1.3, 0);
  add(new THREE.CylinderGeometry(1.0, 1.0, 4.4, 14), mat(0xd9d9d9, { roughness: 0.35, metalness: 0.5 }), -0.9, 1.5, 0).rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(6.2, 0.4, 2.2), mat(0x2a2a2a), 0.3, 0.45, 0);
  add(new THREE.BoxGeometry(0.1, 0.7, 1.9), new THREE.MeshBasicMaterial({ color: 0x1b2633 }), 3.21, 1.6, 0);
  const beacon = glowSprite(0xffa020, 2.6); beacon.position.set(2.3, 2.5, 0); g.add(beacon);
  const ring = new THREE.Mesh(new THREE.RingGeometry(4, 4.7, 32), new THREE.MeshBasicMaterial({ color: 0x38d39f, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; ring.visible = false; g.add(ring);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.y = 1.5; g.add(hit);
  scene.add(g); return { group: g, beacon, ring, hit };
}
function buildFireTruck() {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(7, 2.6, 2.6), mat(0xc81e1e, { roughness: 0.45 }), 0, 1.7, 0);
  add(new THREE.BoxGeometry(6.6, 0.25, 2.3), mat(0xd8d8d8, { roughness: 0.4, metalness: 0.6 }), -0.3, 3.1, 0);
  add(new THREE.BoxGeometry(0.1, 0.9, 2.2), new THREE.MeshBasicMaterial({ color: 0x1b2633 }), 3.51, 2.2, 0);
  add(new THREE.BoxGeometry(7.2, 0.3, 2.7), mat(0xe8e8e8), 0, 1.0, 0);
  const b1 = glowSprite(0x2a6bff, 3.2); b1.position.set(2.8, 3.3, -0.8); g.add(b1);
  const b2 = glowSprite(0x2a6bff, 3.2); b2.position.set(2.8, 3.3, 0.8); g.add(b2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5, 5.8, 32), new THREE.MeshBasicMaterial({ color: 0x38d39f, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; ring.visible = false; g.add(ring);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.y = 1.5; g.add(hit);
  scene.add(g); return { group: g, b1, b2, ring, hit };
}
box(14, 6, 10, mat(0x7a2a24, { roughness: 0.7 }), 72, 3, 11, { cast: true }); // brandstation
lightPoints([[64.8, 5, 8], [64.8, 5, 14]], 0xffd9a0, 3);

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const FUEL_HOME = V(66, 38), FIRE_HOME = V(62, 11), FIRE_STANDBY = V(-35, 8.5);

// ---------------------------------------------------------------- tillstånd
const S = {
  t: 0, running: false, paused: false, speed: 1, rating: 100, deps: 0, over: false,
  planes: [], selected: null, spawnIdx: 0, emergencySpawned: false, goArounds: 0, lateSec: 0,
};
let flightNo = 100 + Math.floor(Math.random() * 300);

const fuel = { ...buildFuelTruck(), pos: FUEL_HOME.clone(), heading: Math.PI, path: [], state: 'IDLE', queue: [], target: null, timer: 0, kind: 'fuel' };
const fire = { ...buildFireTruck(), pos: FIRE_HOME.clone(), heading: Math.PI, path: [], state: 'IDLE', timer: 0, kind: 'fire' };
fuel.hit.userData.pick = { type: 'fuel' }; pickables.push(fuel.hit);
fire.hit.userData.pick = { type: 'fire' }; pickables.push(fire.hit);

const HOLD_C = V(-160, 75);
const STATE_ON_RUNWAY = new Set(['ROLLOUT', 'LINEUP', 'TAKEOFF', 'EMERG_STOP']);

function newPlane({ state, gate = null, emergency = false }) {
  const al = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
  const p = {
    id: Math.random(), cs: emergency ? 'AMB 07' : `${al.code} ${flightNo++}`, emergency,
    ...buildPlane(emergency ? 0xffffff : al.color),
    pos: V(0, 0), heading: 0, pitch: 0, roll: 0, path: [], v: 0, state, wait: 0, gate, spot: null,
    progress: 0, checked: false, holdA: Math.random() * Math.PI * 2, holdAlt: 32, emergTimer: CFG.emergencyTime, kind: 'plane',
  };
  if (emergency) {
    p.body.children.forEach(o => { if (o.material && o.material.color && o.material.color.getHex() === 0xffffff && o.isMesh) o.material = o.material.clone(), o.material.color.set(0xd42a2a); });
  }
  p.hit.userData.pick = { type: 'plane', plane: p };
  pickables.push(p.hit);
  if (state === 'HOLDING') {
    const n = S.planes.filter(q => q.state === 'HOLDING').length;
    p.holdAlt = 30 + n * 9;
    p.pos.set(HOLD_C.x + Math.cos(p.holdA) * 24, p.holdAlt, HOLD_C.z + Math.sin(p.holdA) * 24);
  } else if (state === 'AT_GATE') {
    const g = gates[gate]; g.plane = p;
    p.pos.set(g.x, 0, 43); p.heading = -Math.PI / 2;
  }
  // etikett
  const el = document.createElement('div'); el.className = 'lbl';
  el.addEventListener('pointerdown', e => { e.stopPropagation(); onPick({ type: 'plane', plane: p }); });
  labelsEl.appendChild(el); p.label = el;
  const strip = document.createElement('div'); strip.className = 'strip panel';
  strip.addEventListener('pointerdown', e => { e.stopPropagation(); onPick({ type: 'plane', plane: p }); });
  stripsEl.appendChild(strip); p.strip = strip;
  S.planes.push(p);
  return p;
}

function removePlane(p) {
  scene.remove(p.group); p.label.remove(); p.strip.remove();
  pickables.splice(pickables.indexOf(p.hit), 1);
  S.planes.splice(S.planes.indexOf(p), 1);
  if (S.selected === p) select(null);
}

// ---------------------------------------------------------------- UI-referenser
const $ = id => document.getElementById(id);
const labelsEl = $('labels'), stripsEl = $('strips'), hintEl = $('hint'), toastsEl = $('toasts');

function toast(text, kind = '') {
  const d = document.createElement('div'); d.className = `toast panel ${kind}`; d.textContent = text;
  toastsEl.prepend(d);
  while (toastsEl.children.length > 5) toastsEl.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 5000);
  setTimeout(() => d.remove(), 5700);
}

function placeLabel(text, pos, pick) {
  const el = document.createElement('div'); el.className = 'lbl place'; el.textContent = text;
  el.addEventListener('pointerdown', e => { e.stopPropagation(); onPick(pick); });
  labelsEl.appendChild(el);
  return { el, pos };
}
const placeLabels = [
  placeLabel('Bana 09', V(-20, 0, 6), { type: 'runway' }),
  ...gates.map(g => placeLabel(g.name, V(g.x, 52, 9), { type: 'gate', idx: g.idx })),
  placeLabel('⛽ Tankbil', null, { type: 'fuel' }),
  placeLabel('🚒 Brandbil', null, { type: 'fire' }),
];
placeLabels[0].kind = 'runway'; gates.forEach((g, i) => placeLabels[i + 1].kind = 'gate' + i);
placeLabels[4].obj = fuel; placeLabels[5].obj = fire;

// ---------------------------------------------------------------- val & kommandon
function select(x) {
  S.selected = x;
  for (const p of S.planes) p.ring.visible = p === x;
  fuel.ring.visible = x === fuel; fire.ring.visible = x === fire;
}

function onPick(pick) {
  if (!S.running || S.over) return;
  const sel = S.selected;
  if (!pick) { select(null); return; }
  if (pick.type === 'plane') {
    const p = pick.plane;
    if (sel === fuel && p.state === 'AT_GATE') { orderFuel(p); select(null); return; }
    select(sel === p ? null : p); return;
  }
  if (pick.type === 'fuel') {
    if (sel && sel.kind === 'plane' && sel.state === 'AT_GATE') { orderFuel(sel); select(null); return; }
    select(sel === fuel ? null : fuel); return;
  }
  if (pick.type === 'fire') { select(sel === fire ? null : fire); return; }
  if (pick.type === 'runway') {
    if (sel === fire) { sendFire(); select(null); return; }
    if (sel && sel.kind === 'plane') {
      if (sel.state === 'HOLDING') { clearLanding(sel); select(null); return; }
      if (sel.state === 'READY') { clearTakeoff(sel); select(null); return; }
    }
    if (!sel) toast('Välj ett plan först, sen banan.');
    return;
  }
  if (pick.type === 'gate') {
    const g = gates[pick.idx];
    if (sel && sel.kind === 'plane' && sel.state === 'EXIT_WAIT') {
      if (g.plane || g.reserved) { toast(`${g.name} är upptagen.`, 'warn'); return; }
      assignGate(sel, g); select(null); return;
    }
    if (g.plane) select(g.plane);
    return;
  }
}

function clearLanding(p) {
  p.state = 'APPROACH'; p.checked = false; p.wait = 0; p.v = 34;
  p.path = [V(-240, 40, 32), V(-300, 0, 26), V(-62, 0, 0)];
  toast(`${p.cs}: Klart för landning bana 09.`);
}
function clearTakeoff(p) {
  const g = gates[p.gate]; g.plane = null; p.gate = null;
  p.state = 'PUSHBACK'; p.wait = 0;
  p.path = [V(g.x, 27)];
  p.after = [V(g.x - 6, 24), V(-70, 24), V(-75, 19), V(-75, 9)];
  toast(`${p.cs}: Tryck ut och taxa till bana 09.`);
}
function assignGate(p, g) {
  g.reserved = p; p.gate = g.idx; p.state = 'TAXI_IN'; p.wait = 0;
  const from = p.spot;
  const path = [];
  if (from === 'C') path.push(V(50, 3), V(52, 10));
  if (from === 'C' || from === 'B') path.push(V(52, 18));
  path.push(V(g.x + 4, 18), V(g.x, 24), V(g.x, 30), V(g.x, 43));
  p.path = path; p.spot = null;
}
function orderFuel(p) {
  if (fuel.queue.includes(p) || fuel.target === p) return;
  p.state = 'FUEL_WAIT'; p.wait = 0;
  fuel.queue.push(p);
  if (fuel.target) toast(`Tankbilen är upptagen – ${p.cs} står i kö.`, 'warn');
}
function sendFire() {
  if (fire.state === 'STANDBY' || fire.state === 'OUT') { toast('Brandbilen är redan på väg till banan.'); return; }
  fire.state = 'OUT'; fire.path = [V(52, 11), V(48, 8.5), FIRE_STANDBY.clone()];
  toast('🚒 Räddningstjänsten rycker ut till banan.');
}

function runwayOccupied(except) {
  return S.planes.some(q => q !== except && (STATE_ON_RUNWAY.has(q.state) && !(q.state === 'TAKEOFF' && q.pos.y > 6) || (q.state === 'EXIT_WAIT' && q.spot === 'C')));
}
function shortFinal(except) {
  return S.planes.some(q => q !== except && q.state === 'APPROACH' && q.checked);
}

function penalty(n, why) { S.rating = Math.max(0, S.rating - n); if (why) toast(why, 'bad'); }

// ---------------------------------------------------------------- rörelse
function followPath(e, dt, speed, reverse = false) {
  let d = speed * dt;
  while (d > 0 && e.path.length) {
    const tgt = e.path[0];
    const v = tgt.clone().sub(e.pos); const len = v.length();
    if (len < 1e-4) { e.path.shift(); continue; }
    v.normalize(); e.dir = v.clone(); if (reverse) e.dir.multiplyScalar(-1);
    if (len <= d) { e.pos.copy(tgt); e.path.shift(); d -= len; }
    else { e.pos.addScaledVector(v, d); d = 0; }
  }
  return e.path.length === 0;
}
function lerpAngle(a, b, k) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + diff * Math.min(1, k);
}
function steer(e, dt, rate) {
  if (!e.dir) return 0;
  const target = Math.atan2(-e.dir.z, e.dir.x);
  if (Math.hypot(e.dir.x, e.dir.z) < 0.05) return 0;
  const before = e.heading;
  e.heading = lerpAngle(e.heading, target, rate * dt);
  return (e.heading - before) / Math.max(dt, 1e-4);
}

// ---------------------------------------------------------------- planens logik
function updatePlane(p, dt) {
  let airborne = false, turn = 0, pitchT = 0;
  switch (p.state) {
    case 'HOLDING': {
      airborne = true;
      p.holdA += dt * 0.32;
      const n = S.planes.filter(q => q.state === 'HOLDING').indexOf(p);
      p.holdAlt += ((30 + n * 9) - p.holdAlt) * Math.min(1, dt);
      const np = V(HOLD_C.x + Math.cos(p.holdA) * 24, HOLD_C.z + Math.sin(p.holdA) * 24, p.holdAlt);
      p.dir = np.clone().sub(p.pos).normalize(); p.pos.copy(np);
      turn = steer(p, dt, 4);
      p.wait += dt;
      if (p.emergency) {
        p.emergTimer -= dt;
        if (p.emergTimer <= 0) {
          penalty(CFG.emergencyDivert, `${p.cs} fick inte landa i tid och leds om till annan flygplats!`);
          p.state = 'DIVERT'; p.path = [V(-500, -300, 60)]; p.v = 36;
        }
      }
      break;
    }
    case 'DIVERT': case 'GONE': {
      airborne = true;
      if (followPath(p, dt, p.v)) { removePlane(p); return; }
      turn = steer(p, dt, 2);
      break;
    }
    case 'APPROACH': {
      airborne = true;
      if (p.emergency) p.emergTimer -= dt;
      if (!p.checked && p.pos.x > -150 && p.path.length === 1) {
        p.checked = true;
        if (runwayOccupied(p)) { goAround(p); break; }
      }
      const done = followPath(p, dt, p.v);
      turn = steer(p, dt, 2.2);
      pitchT = p.path.length === 1 ? 0.06 : 0;
      if (done) touchdown(p);
      break;
    }
    case 'GOAROUND': {
      airborne = true;
      const done = followPath(p, dt, p.v);
      turn = steer(p, dt, 1.8);
      pitchT = p.pos.y < 30 && p.pos.x < 60 ? 0.15 : 0;
      if (done) { p.state = 'HOLDING'; p.holdA = Math.atan2(p.pos.z - HOLD_C.z, p.pos.x - HOLD_C.x); p.holdAlt = p.pos.y; }
      break;
    }
    case 'ROLLOUT': {
      const stopX = p.emergency ? 8 : 45;
      const a = p.emergency ? 6.5 : 4.4;
      p.v = Math.max(p.emergency ? 0 : 7, p.v - a * dt);
      p.pos.x += p.v * dt; p.dir = V(1, 0);
      if (p.pos.x >= stopX || (p.emergency && p.v <= 0.2)) {
        if (p.emergency) { p.state = 'EMERG_STOP'; p.timer = 8; toast(`${p.cs} står still på banan – räddningstjänsten kontrollerar.`, 'warn'); }
        else exitRunway(p);
      }
      break;
    }
    case 'EMERG_STOP': {
      p.timer -= dt;
      if (p.timer <= 0) { p.state = 'TO_HANGAR'; p.path = [V(45, 0), V(50, 3), V(52, 12), V(60, 22), V(92, 28)]; }
      break;
    }
    case 'TO_HANGAR': {
      followPath(p, dt, 7); turn = steer(p, dt, 3);
      if (!p.path.length) { removePlane(p); toast(`${p.cs} bogserad in i hangaren. Bra hanterat!`, 'good'); if (fire.state !== 'IDLE') fireHome(); return; }
      break;
    }
    case 'TO_SPOT': {
      followPath(p, dt, 7); turn = steer(p, dt, 3);
      if (!p.path.length) { p.state = 'EXIT_WAIT'; p.wait = 0; toast(`${p.cs}: Lämnat banan – vilken gate?`); }
      break;
    }
    case 'EXIT_WAIT': p.wait += dt; break;
    case 'TAXI_IN': {
      const done = followPath(p, dt, 7); turn = steer(p, dt, 3);
      if (done) {
        const g = gates[p.gate]; g.reserved = null; g.plane = p;
        p.state = 'AT_GATE'; p.wait = 0;
      }
      break;
    }
    case 'AT_GATE': p.wait += dt; break;
    case 'FUEL_WAIT': p.wait += dt * 0.25; break;
    case 'FUELING': p.progress += dt / CFG.fuelTime; break;
    case 'BOARDING': {
      p.progress += dt / CFG.boardTime;
      if (p.progress >= 1) { p.state = 'READY'; p.wait = 0; toast(`${p.cs}: Klara för avgång!`); }
      break;
    }
    case 'READY': p.wait += dt; break;
    case 'PUSHBACK': {
      const done = followPath(p, dt, 2.6, true); steer(p, dt, 3);
      if (done) { p.state = 'TAXI_OUT'; p.path = p.after; }
      break;
    }
    case 'TAXI_OUT': {
      const done = followPath(p, dt, 7); turn = steer(p, dt, 3);
      if (done) { p.state = 'HOLD_SHORT'; p.holdT = 0; }
      break;
    }
    case 'HOLD_SHORT': {
      p.holdT += dt;
      if (!runwayOccupied(p) && !shortFinal(p)) { p.state = 'LINEUP'; p.path = [V(-75, 3), V(-71, 0), V(-68, 0)]; }
      else if (p.holdT > 1 && !p.toldHold) { p.toldHold = true; toast(`${p.cs} väntar vid banan – trafik.`); }
      break;
    }
    case 'LINEUP': {
      const done = followPath(p, dt, 5); steer(p, dt, 3);
      if (done) { p.state = 'TAKEOFF'; p.v = 5; p.dir = V(1, 0); }
      break;
    }
    case 'TAKEOFF': {
      p.v = Math.min(40, p.v + 6 * dt);
      p.pos.x += p.v * dt;
      if (p.v > 28) { airborne = true; p.pos.y += (p.v * 0.22) * dt; pitchT = 0.18; }
      steer(p, dt, 3);
      if (p.pos.x > 330) {
        S.deps++; S.rating = Math.min(100, S.rating + CFG.departureBonus);
        toast(`✈ ${p.cs} har lyft. Avgång ${S.deps}/${CFG.goal}`, 'good');
        removePlane(p); return;
      }
      break;
    }
  }
  if (p.state === 'APPROACH' || p.state === 'GOAROUND' || p.state === 'DIVERT') {
    pitchT += p.dir ? Math.atan(p.dir.y) * 0.5 : 0;
  }
  p.pitch += (pitchT - p.pitch) * Math.min(1, dt * 3);
  const rollT = airborne ? THREE.MathUtils.clamp(-turn * 0.8, -0.6, 0.6) : 0;
  p.roll += (rollT - p.roll) * Math.min(1, dt * 3);
  p.group.position.copy(p.pos);
  p.group.rotation.set(p.roll, p.heading, p.pitch);
  p.airborne = airborne;
  // väntan som drar betyg
  if (['HOLDING', 'EXIT_WAIT', 'AT_GATE', 'READY'].includes(p.state) && !p.emergency && p.wait > CFG.waitLimit) {
    S.rating = Math.max(0, S.rating - CFG.waitDrain * dt); S.lateSec += dt;
    if (!p.toldLate) { p.toldLate = true; toast(`${p.cs} har väntat för länge – betyget sjunker!`, 'bad'); }
  } else if (p.wait < CFG.waitLimit) p.toldLate = false;
}

function goAround(p) {
  p.state = 'GOAROUND'; S.goArounds++;
  p.path = [V(40, 0, 30), V(110, 50, 38), V(0, 110, 36), V(-130, 95, 34)];
  penalty(CFG.goAroundPenalty, `Banan var inte fri! ${p.cs} går runt.`);
}
function touchdown(p) {
  p.state = 'ROLLOUT'; p.pos.y = 0; p.v = 32;
  if (p.emergency) {
    if (fire.state === 'STANDBY') { S.rating = Math.min(100, S.rating + 5); toast(`${p.cs} har landat – räddningstjänsten var på plats. Snyggt!`, 'good'); }
    else penalty(CFG.emergencyNoFire, `${p.cs} landade utan räddningstjänst på plats!`);
  }
}
function exitRunway(p) {
  const occ = s => S.planes.some(q => q !== p && q.spot === s && (q.state === 'EXIT_WAIT' || q.state === 'TO_SPOT'));
  if (!occ('A')) { p.spot = 'A'; p.path = [V(50, 3), V(52, 10), V(52, 18), V(40, 18)]; }
  else if (!occ('B')) { p.spot = 'B'; p.path = [V(50, 3), V(52, 10)]; }
  else { p.spot = 'C'; p.state = 'EXIT_WAIT'; p.wait = 0; toast(`${p.cs} kommer inte av banan – taxibanan är full!`, 'bad'); return; }
  p.state = 'TO_SPOT';
}

// ---------------------------------------------------------------- fordonens logik
function updateFuel(dt) {
  if (fuel.state === 'IDLE' && fuel.queue.length) {
    const p = fuel.queue.shift();
    if (p.state !== 'FUEL_WAIT') return;
    fuel.target = p; fuel.state = 'GO';
    const gx = gates[p.gate].x;
    fuel.path = [V(fuel.pos.x, 29), V(gx + 12, 29), V(gx + 10, 38)];
  }
  if (fuel.state === 'GO') {
    if (followPath(fuel, dt, 9)) { fuel.state = 'FUELING'; fuel.target.state = 'FUELING'; fuel.target.progress = 0; }
  } else if (fuel.state === 'FUELING') {
    if (fuel.target.progress >= 1) {
      fuel.target.state = 'BOARDING'; fuel.target.progress = 0;
      fuel.target = null;
      if (fuel.queue.length) { fuel.state = 'IDLE'; }
      else { fuel.state = 'HOME'; fuel.path = [V(fuel.pos.x + 2, 29), V(66, 29), FUEL_HOME.clone()]; }
    }
  } else if (fuel.state === 'HOME') {
    if (fuel.queue.length) { fuel.state = 'IDLE'; fuel.path = []; }
    else if (followPath(fuel, dt, 9)) fuel.state = 'IDLE';
  }
  if (fuel.state === 'IDLE' && fuel.queue.length === 0 && fuel.pos.distanceTo(FUEL_HOME) > 1 && !fuel.path.length) fuel.state = 'HOME', fuel.path = [FUEL_HOME.clone()];
  steer(fuel, dt, 5);
  fuel.group.position.copy(fuel.pos); fuel.group.rotation.y = fuel.heading;
  fuel.beacon.material.opacity = fuel.state === 'IDLE' ? 0.25 : (Math.sin(S.t * 9) > 0 ? 1 : 0.15);
}
function fireHome() { fire.state = 'HOME'; fire.path = [V(48, 8.5), V(52, 11), FIRE_HOME.clone()]; }
function updateFire(dt) {
  if (fire.state === 'OUT') { if (followPath(fire, dt, 13)) { fire.state = 'STANDBY'; fire.timer = 0; toast('🚒 Räddningstjänsten står redo vid banan.'); } }
  else if (fire.state === 'STANDBY') {
    fire.timer += dt;
    const emergActive = S.planes.some(p => p.emergency);
    if (!emergActive && fire.timer > 15) fireHome();
  } else if (fire.state === 'HOME') { if (followPath(fire, dt, 10)) fire.state = 'IDLE'; }
  steer(fire, dt, 5);
  fire.group.position.copy(fire.pos); fire.group.rotation.y = fire.heading;
  const on = fire.state !== 'IDLE';
  const f = Math.sin(S.t * 14) > 0;
  fire.b1.material.opacity = on ? (f ? 1 : 0.1) : 0.15;
  fire.b2.material.opacity = on ? (f ? 0.1 : 1) : 0.15;
}

// ---------------------------------------------------------------- spawn
function spawner() {
  while (S.spawnIdx < CFG.spawnTimes.length && S.t >= CFG.spawnTimes[S.spawnIdx]) {
    S.spawnIdx++;
    const p = newPlane({ state: 'HOLDING' });
    toast(`📻 ${p.cs} anropar: begär landning.`);
  }
  if (!S.emergencySpawned && S.t >= CFG.emergencyAt) {
    S.emergencySpawned = true;
    const p = newPlane({ state: 'HOLDING', emergency: true });
    toast(`🚨 MAYDAY! ${p.cs} har rök i kabinen och måste landa inom ${CFG.emergencyTime} sekunder. Skicka brandbilen till banan!`, 'bad');
  }
}

// ---------------------------------------------------------------- texter
const STATUS = {
  HOLDING: ['Vill landa', true], APPROACH: ['Landar', false], GOAROUND: ['Går runt!', false], ROLLOUT: ['Bromsar', false],
  TO_SPOT: ['Lämnar banan', false], EXIT_WAIT: ['Välj gate', true], TAXI_IN: ['Taxar in', false],
  AT_GATE: ['Behöver bränsle', true], FUEL_WAIT: ['Väntar på tankbil', false], FUELING: ['Tankar', false],
  BOARDING: ['Ombordstigning', false], READY: ['Klar för start', true], PUSHBACK: ['Trycks ut', false],
  TAXI_OUT: ['Taxar ut', false], HOLD_SHORT: ['Väntar vid banan', false], LINEUP: ['Kör upp på banan', false],
  TAKEOFF: ['Startar', false], DIVERT: ['Leds om', false], EMERG_STOP: ['Kontrolleras', false], TO_HANGAR: ['Till hangaren', false],
};
const HINTS = {
  HOLDING: 'Tryck på banan för att ge landningstillstånd',
  EXIT_WAIT: 'Tryck på en ledig gate',
  AT_GATE: 'Tryck på tankbilen',
  READY: 'Tryck på banan för att ge starttillstånd',
};
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function planeText(p) {
  let [s, act] = STATUS[p.state] || [p.state, false];
  if (p.state === 'FUELING' || p.state === 'BOARDING') s += ` ${Math.min(99, Math.floor(p.progress * 100))}%`;
  if (p.emergency && (p.state === 'HOLDING' || p.state === 'APPROACH')) s = `MAYDAY · ${fmt(Math.max(0, p.emergTimer))}`;
  const late = act && p.wait > CFG.waitLimit;
  return { s, act, late };
}

const v3 = new THREE.Vector3();
function screenPos(pos) {
  v3.copy(pos).project(camera);
  return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight, vis: v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2 };
}

function updateUI() {
  const left = Math.max(0, CFG.duration - S.t);
  $('time').textContent = fmt(left);
  $('time').style.color = left < 30 ? 'var(--bad)' : '';
  $('deps').textContent = `${S.deps}/${CFG.goal}`;
  $('rating').textContent = `${Math.round(S.rating)}%`;
  const fill = $('ratingFill'); fill.style.width = `${S.rating}%`;
  fill.style.background = S.rating > 70 ? 'var(--ok)' : S.rating > 40 ? 'var(--warn)' : 'var(--bad)';

  for (const p of S.planes) {
    const { s, act, late } = planeText(p);
    const wb = act && !p.emergency ? `<div class="wbar"><i style="width:${Math.max(0, 100 - p.wait / CFG.waitLimit * 100)}%;${late ? 'background:var(--bad)' : ''}"></i></div>` : '';
    const html = `<b>${p.cs}</b><span class="s">${s}</span>${wb}`;
    if (p.label._h !== html) { p.label.innerHTML = html; p.label._h = html; }
    p.label.className = `lbl${act ? ' act pulse' : ''}${late ? ' late' : ''}${p.emergency ? ' emerg' : ''}${S.selected === p ? ' sel' : ''}`;
    const sp = screenPos(v3.copy(p.pos).add({ x: 0, y: 8, z: 0 }).clone());
    p.label.style.display = sp.vis ? '' : 'none';
    p.label.style.left = `${sp.x}px`; p.label.style.top = `${sp.y}px`;
    const sh = `<div class="cs"><span>${p.cs}</span><span>${p.gate != null ? 'G' + (p.gate + 1) : ''}</span></div><div class="st">${s}</div>${wb}`;
    if (p.strip._h !== sh) { p.strip.innerHTML = sh; p.strip._h = sh; }
    p.strip.className = `strip panel${act ? ' act' : ''}${late ? ' late' : ''}${p.emergency ? ' emerg' : ''}${S.selected === p ? ' sel' : ''}`;
  }
  // ordning: de som behöver dig först
  const order = [...S.planes].sort((a, b) => (b.emergency - a.emergency) || ((planeText(b).act) - (planeText(a).act)) || (b.wait - a.wait));
  order.forEach((p, i) => { if (stripsEl.children[i] !== p.strip) stripsEl.insertBefore(p.strip, stripsEl.children[i] || null); });

  // platsetiketter + vilka mål som gäller nu
  const sel = S.selected;
  const targets = new Set();
  if (sel === fire) targets.add('runway');
  if (sel && sel.kind === 'plane') {
    if (sel.state === 'HOLDING' || sel.state === 'READY') targets.add('runway');
    if (sel.state === 'EXIT_WAIT') gates.forEach((g, i) => { if (!g.plane && !g.reserved) targets.add('gate' + i); });
    if (sel.state === 'AT_GATE') targets.add('fuel');
  }
  gates.forEach((g, i) => { g.ring.material.opacity = targets.has('gate' + i) ? 0.55 + Math.sin(S.t * 6) * 0.3 : 0; });
  for (const pl of placeLabels) {
    const pos = pl.obj ? v3.copy(pl.obj.pos).add({ x: 0, y: 6, z: 0 }).clone() : pl.pos;
    const sp = screenPos(pos);
    pl.el.style.display = sp.vis ? '' : 'none';
    pl.el.style.left = `${sp.x}px`; pl.el.style.top = `${sp.y}px`;
    const isT = targets.has(pl.kind) || (pl.obj === fuel && targets.has('fuel'));
    pl.el.classList.toggle('target', isT);
  }
  // hjälptext
  let hint = 'Tryck på ett plan för att välja det';
  if (sel === fuel) hint = 'Tryck på ett plan vid gate som behöver bränsle';
  else if (sel === fire) hint = 'Tryck på banan för att skicka brandbilen';
  else if (sel && sel.kind === 'plane') hint = `${sel.cs}: ${HINTS[sel.state] || (STATUS[sel.state] || [''])[0]}`;
  if (hintEl.textContent !== hint) hintEl.textContent = hint;
  hintEl.classList.toggle('sel', !!sel);
}

// ---------------------------------------------------------------- klick i 3D
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 450;
  down = null;
  if (moved > 7 || !quick) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(pickables, false);
  // plan och fordon före banor och gater
  const rank = h => ({ plane: 0, fuel: 1, fire: 1, gate: 2, runway: 3 })[h.object.userData.pick.type];
  hits.sort((a, b) => rank(a) - rank(b) || a.distance - b.distance);
  onPick(hits.length ? hits[0].object.userData.pick : null);
});

// ---------------------------------------------------------------- knappar
$('startBtn').onclick = () => { $('intro').classList.add('hidden'); S.running = true; toast('Passet har börjat. Lycka till, chefen!', 'good'); };
$('againBtn').onclick = () => location.reload();
$('pauseBtn').onclick = () => { S.paused = !S.paused; $('pauseBtn').textContent = S.paused ? '▶' : '❚❚'; };
$('speedBtn').onclick = () => { S.speed = S.speed === 1 ? 2 : 1; $('speedBtn').textContent = `${S.speed}×`; };

function endGame(reason) {
  S.over = true; S.running = false; select(null);
  const ok = S.deps >= CFG.goal && reason !== 'rating';
  const stars = !ok ? 0 : S.rating >= 85 ? 3 : S.rating >= 65 ? 2 : 1;
  $('endTitle').textContent = ok ? 'Passet klart!' : 'Passet misslyckades';
  $('endStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('endText').textContent = reason === 'rating'
    ? 'Betyget rasade till noll – resenärerna och flygbolagen har fått nog.'
    : `${S.deps} av ${CFG.goal} avgångar · betyg ${Math.round(S.rating)}% · ${S.goArounds} go-arounds · tid kvar ${fmt(Math.max(0, CFG.duration - S.t))}`;
  $('endTip').textContent = stars === 3 ? 'Perfekt pass. Du är redo för en större flygplats!'
    : S.goArounds > 1 ? 'Tips: vänta med starttillstånd när ett plan är på väg in. Banan måste vara fri.'
    : S.lateSec > 20 ? 'Tips: håll koll på listan – planen högst upp behöver dig först.'
    : 'Tips: beställ tankbilen direkt när ett plan står vid gate. Den har kö.';
  $('end').classList.remove('hidden');
}

// ---------------------------------------------------------------- start
newPlane({ state: 'AT_GATE', gate: 0 });
newPlane({ state: 'AT_GATE', gate: 2 });

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 0.05);
  const dt = S.running && !S.paused ? raw * S.speed : 0;
  if (dt > 0) {
    S.t += dt;
    spawner();
    for (const p of [...S.planes]) updatePlane(p, dt);
    updateFuel(dt); updateFire(dt);
    if (S.deps >= CFG.goal) endGame('goal');
    else if (S.rating <= 0) endGame('rating');
    else if (S.t >= CFG.duration) endGame('time');
  } else if (!S.over) {
    for (const p of S.planes) { p.group.position.copy(p.pos); p.group.rotation.set(p.roll, p.heading, p.pitch); }
    fuel.group.position.copy(fuel.pos); fuel.group.rotation.y = fuel.heading;
    fire.group.position.copy(fire.pos); fire.group.rotation.y = fire.heading;
  }
  // blinkande ljus (går även i paus)
  const tt = performance.now() / 1000;
  for (const p of S.planes) {
    const L = p.lights;
    L.beacon.material.opacity = (tt * 1.2 % 1) < 0.12 ? 1 : 0.05;
    const st = (tt * 1.1 % 1) < 0.06;
    L.strobeL.material.opacity = L.strobeR.material.opacity = st && p.airborne ? 1 : 0;
    L.landing.material.opacity = p.airborne || p.state === 'TAKEOFF' || p.state === 'ROLLOUT' ? 1 : 0;
  }
  towerBeacon.material.opacity = (tt % 1.6) < 0.8 ? 1 : 0.2;
  const ri = Math.floor((tt * 2.2 % 1) * 16);
  rabbit.position.set(-190 + ri * 6, 1, 0); rabbit.material.opacity = ri < 15 ? 1 : 0;
  controls.update();
  renderer.render(scene, camera);
  updateUI();
}
frame();

// felsökning/test (prototyp)
window.__game = { S, onPick, gates, fuel, fire, CFG };
