// 3D-vyn: bygger huset från datan, animerar lampor/dörrar/gardiner, klick och dra i 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { S, home, emit, commit, snapToWall, findWall, makeItem, makeOpening, wallLen, roomAt } from './store.js';
import { ITEMS, OPENINGS } from './catalog.js';
import { insideSign } from './plan2d.js';

export function createView(host, api) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  cam.position.set(20, 18, 24);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = 1.48; controls.minDistance = 2; controls.maxDistance = 90;
  controls.screenSpacePanning = false;

  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x3a3226, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2c0, 2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  const world = new THREE.Group(); scene.add(world);
  let refs = { items: {}, openings: {}, pick: [] };
  let selBox = null, built = false, need = false, lastSig = '';

  // ---------- material & texturer ----------
  const mats = new Map();
  function M(color, o = {}) {
    const k = color + JSON.stringify(o); if (mats.has(k)) return mats.get(k);
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: .75, ...o }); mats.set(k, m); return m;
  }
  const texCache = new Map();
  function floorTex(style, color) {
    const k = style + color; if (texCache.has(k)) return texCache.get(k);
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    const base = new THREE.Color(color); g.fillStyle = color; g.fillRect(0, 0, 512, 512);
    const shade = (f) => { const cc = base.clone().multiplyScalar(f); return `rgb(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0})`; };
    let rnd = 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    if (style === 'tra') { const pw = 512 / 6; for (let i = 0; i < 6; i++) { let y = -R() * 300; while (y < 512) { const L = 200 + R() * 260;
      g.fillStyle = shade(.88 + R() * .22); g.fillRect(i * pw, y, pw, L); g.strokeStyle = 'rgba(0,0,0,.18)'; g.strokeRect(i * pw + .5, y + .5, pw - 1, L - 1);
      for (let j = 0; j < 6; j++) { g.strokeStyle = 'rgba(0,0,0,.05)'; g.beginPath(); const xx = i * pw + R() * pw; g.moveTo(xx, y); g.lineTo(xx + R() * 6 - 3, y + L); g.stroke(); } y += L; } } }
    else if (style === 'klinker') { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = shade(.95 + R() * .1); g.fillRect(i * 256 + 3, j * 256 + 3, 250, 250); }
      g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 254, 512, 4); g.fillRect(254, 0, 4, 512); g.fillRect(0, 0, 512, 3); g.fillRect(0, 0, 3, 512); }
    else if (style === 'grass') { for (let i = 0; i < 9000; i++) { g.fillStyle = shade(.75 + R() * .5); g.fillRect(R() * 512, R() * 512, 2, 4); } }
    else { for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${R() > .5 ? '255,255,255' : '0,0,0'},${R() * .06})`; g.fillRect(R() * 512, R() * 512, 3, 3); } }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const size = style === 'grass' ? 4 : style === 'klinker' ? 1.2 : 1.8; t.repeat.set(1 / size, 1 / size);
    texCache.set(k, t); return t;
  }
  function floorMat(style, color) { const k = 'F' + style + color; if (mats.has(k)) return mats.get(k);
    const m = new THREE.MeshStandardMaterial({ map: floorTex(style, color), roughness: style === 'klinker' ? .35 : .7 }); mats.set(k, m); return m; }
  let screenTex = null;
  function tvScreen() { if (screenTex) return screenTex; const c = document.createElement('canvas'); c.width = 256; c.height = 144; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 256, 144); gr.addColorStop(0, '#1d4e89'); gr.addColorStop(.5, '#e86a33'); gr.addColorStop(1, '#2a1a4a'); g.fillStyle = gr; g.fillRect(0, 0, 256, 144);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 22px system-ui'; g.fillText('▶  Fredagsfilm', 18, 124);
    screenTex = new THREE.CanvasTexture(c); screenTex.colorSpace = THREE.SRGBColorSpace; return screenTex; }
  const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();

  // ---------- hjälpare ----------
  function B(g, w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'string' ? M(mat) : mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
  function C(g, rt, rb, h, mat, x, y, z, seg = 20, open = false) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), typeof mat === 'string' ? M(mat) : mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
  const metal = '#9aa0a6', metalM = () => M(metal, { metalness: .8, roughness: .3 });

  function doors(g, w, h, y0, z, n, color, handleTop = true) {
    const dw = w / n;
    for (let i = 0; i < n; i++) { const cx = -w / 2 + dw * (i + .5);
      B(g, dw - .006, h, .018, color, cx, y0 + h / 2, z);
      const hx = n === 1 ? cx + dw / 2 - .05 : (i % 2 === 0 ? cx + dw / 2 - .04 : cx - dw / 2 + .04);
      B(g, .012, .14, .02, metalM(), hx, handleTop ? y0 + h - .1 : y0 + .1, z + .015); }
  }

  // ---------- möbler ----------
  function buildItem(it) {
    const g = new THREE.Group(), { w, d, h } = it, c = it.color, c2 = it.color2, cat = ITEMS[it.type];
    const ref = { group: g, it };
    const front = d / 2;
    switch (it.type) {
      case 'underskap': case 'diskho': case 'spis': {
        B(g, w - .02, .1, d - .07, '#1d1d1d', 0, .05, -.035);
        B(g, w - .01, h - .14, d - .04, c, 0, .1 + (h - .14) / 2, -.02);
        if (it.type === 'spis') { B(g, w - .03, .14, .018, c, 0, h - .04 - .08, front - .01); B(g, w - .03, h - .32, .018, M('#141414', { roughness: .15, metalness: .3 }), 0, .1 + (h - .32) / 2, front - .01);
          B(g, w * .7, .02, .02, metalM(), 0, h - .29, front + .01); }
        else { B(g, w - .03, .16, .018, c, 0, h - .04 - .09, front - .01); B(g, .14, .012, .02, metalM(), 0, h - .04 - .06, front + .005); doors(g, w - .02, h - .37, .11, front - .01, w > .7 ? 2 : 1, c); }
        B(g, w, .04, d + .02, it.type === 'spis' ? M(c2 || '#151515', { roughness: .15 }) : c2 || '#3b3b3b', 0, h - .02, .01);
        if (it.type === 'diskho') { B(g, w * .62, .006, d * .55, M('#b8bec4', { metalness: .8, roughness: .25 }), 0, h + .001, .03);
          C(g, .015, .015, .26, metalM(), 0, h + .13, -d / 2 + .08); B(g, .025, .025, .2, metalM(), 0, h + .25, -d / 2 + .17); }
        if (it.type === 'spis') for (const [x, z] of [[-.13, -.12], [.13, -.12], [-.13, .12], [.13, .12]]) C(g, .085, .085, .004, M('#333'), x, h + .002, z, 24);
        break; }
      case 'overskap': B(g, w - .01, h, d - .02, c, 0, h / 2, -.01); doors(g, w - .01, h - .01, .005, front - .01, w > .7 ? 2 : 1, c, false); break;
      case 'flakt': B(g, w, .08, d, M(c, { metalness: .7, roughness: .3 }), 0, .04, 0); B(g, w * .4, h - .08, d * .5, M(c, { metalness: .7, roughness: .3 }), 0, .08 + (h - .08) / 2, -d * .25); break;
      case 'hogskap': B(g, w - .01, .1, d - .07, '#1d1d1d', 0, .05, -.035); B(g, w - .01, h - .1, d - .04, c, 0, .1 + (h - .1) / 2, -.02); doors(g, w - .01, h - .12, .11, front - .01, w > .7 ? 2 : 1, c); break;
      case 'kyl': { const mm = M(c, { metalness: .55, roughness: .3 }); B(g, w - .01, h, d - .04, mm, 0, h / 2, -.02);
        B(g, w - .012, h * .62, .02, mm, 0, h - h * .31, front - .01); B(g, w - .012, h * .36, .02, mm, 0, h * .18, front - .01);
        B(g, .02, h * .4, .03, metalM(), w / 2 - .06, h - h * .3, front + .02); B(g, .02, h * .2, .03, metalM(), w / 2 - .06, h * .26, front + .02); break; }
      case 'koksoe': B(g, w - .1, .1, d - .35, '#1d1d1d', 0, .05, -.1); B(g, w - .04, h - .14, d - .3, c, 0, .1 + (h - .14) / 2, -.1);
        { const n = Math.max(2, Math.round(w / .6)), dw = (w - .06) / n, bz = -.1 - (d - .3) / 2;
          for (let i = 0; i < n; i++) { const x = -(w - .06) / 2 + dw * (i + .5); B(g, dw - .006, h - .2, .018, c, x, .12 + (h - .2) / 2, bz - .01); B(g, .012, .14, .02, metalM(), x + dw / 2 - .05, h - .2, bz - .025); } }
        B(g, w + .04, .05, d, c2 || '#e8e4dc', 0, h - .025, 0); break;
      case 'matbord': case 'soffbord': case 'skrivbord': {
        B(g, w, .04, d, c, 0, h - .02, 0); const lx = w / 2 - .06, lz = d / 2 - .06;
        for (const [x, z] of [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]]) B(g, .05, h - .04, .05, it.type === 'skrivbord' ? '#2b2b2b' : c, x, (h - .04) / 2, z); break; }
      case 'stol': case 'barstol': { const sh = it.type === 'barstol' ? .72 : .45;
        B(g, w, .05, d * .9, c, 0, sh, 0); const lx = w / 2 - .03, lz = d * .45 - .03;
        for (const [x, z] of [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]]) B(g, .03, sh, .03, c, x, sh / 2, z);
        B(g, w, h - sh - .02, .04, c, 0, sh + (h - sh) / 2, -d * .45 + .02); break; }
      case 'soffa': case 'fatolj': case 'utesoffa': {
        const n = it.type === 'fatolj' ? 1 : w > 2.1 ? 3 : 2, aw = .16, sw = (w - aw * 2) / n;
        for (const [x, z] of [[w / 2 - .06, d / 2 - .06], [-w / 2 + .06, d / 2 - .06], [w / 2 - .06, -d / 2 + .06], [-w / 2 + .06, -d / 2 + .06]]) B(g, .05, .08, .05, '#222', x, .04, z);
        B(g, w, .26, d, c, 0, .08 + .13, 0);
        for (let i = 0; i < n; i++) B(g, sw - .02, .13, d - .26, shade(c, 1.08), -w / 2 + aw + sw * (i + .5), .34 + .065, .1);
        B(g, w - aw * 2, h - .34, .22, c, 0, .34 + (h - .34) / 2, -d / 2 + .11);
        for (let i = 0; i < n; i++) B(g, sw - .04, h - .45, .14, shade(c, 1.12), -w / 2 + aw + sw * (i + .5), .47 + (h - .45) / 2 - .02, -d / 2 + .27);
        for (const s of [-1, 1]) B(g, aw, .62 - .08, d, c, s * (w / 2 - aw / 2), .08 + .27, 0);
        break; }
      case 'bokhylla': { B(g, w, h, .02, c, 0, h / 2, -d / 2 + .01); for (const s of [-1, 1]) B(g, .02, h, d, c, s * (w / 2 - .01), h / 2, 0);
        const n = Math.max(2, Math.round(h / .38)); let seed = it.id.charCodeAt(0) * 7 + 3; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const cols = ['#7a2e2e', '#2e4a7a', '#c9a227', '#2f5d50', '#ddd6c8', '#3b3b3b', '#a0704a'];
        for (let i = 0; i <= n; i++) { const y = i * (h - .02) / n + .01; B(g, w - .04, .02, d - .02, c, 0, y, .01);
          if (i < n) { let x = -w / 2 + .03; while (x < w / 2 - .08) { const bw = .025 + R() * .04, bh = .18 + R() * .1; if (R() > .15) B(g, bw, bh, d * .7, cols[(R() * cols.length) | 0], x + bw / 2, y + .01 + bh / 2, 0); x += bw + .003; } } }
        break; }
      case 'matta': B(g, w, .012, d, M(c, { roughness: 1 }), 0, .006, 0); break;
      case 'vaxt': C(g, w * .32, w * .26, .38, c, 0, .19, 0); for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(w * .38, 0), M('#3f7a3a', { flatShading: true }));
        m.position.set(Math.sin(i * 2.1) * w * .15, .5 + i * (h - .6) / 4, Math.cos(i * 2.1) * w * .15); m.castShadow = true; g.add(m); } break;
      case 'sang': case 'sang90': {
        B(g, w, .25, d, c, 0, .07 + .125, 0); for (const s of [-1, 1]) for (const t of [-1, 1]) B(g, .05, .07, .05, '#222', s * (w / 2 - .05), .035, t * (d / 2 - .05));
        B(g, w - .06, .2, d - .08, '#f4f2ee', 0, .32 + .1, .02);
        B(g, w - .02, .07, d * .64, c2 || '#e6ebf0', 0, .53, d * .17);
        B(g, w - .02, .3, .05, c2 || '#e6ebf0', 0, .37, d / 2 - .02 + .015);
        const np = w > 1.2 ? 2 : 1; for (let i = 0; i < np; i++) B(g, (w - .16) / np - .04, .12, .36, '#ffffff', -w / 2 + .08 + (w - .16) / np * (i + .5), .58, -d / 2 + .3);
        B(g, w + .02, 1.05, .08, c, 0, .525, -d / 2 + .04); break; }
      case 'nattduks': B(g, w, h - .06, d, c, 0, .06 + (h - .06) / 2, 0); for (const s of [-1, 1]) for (const t of [-1, 1]) B(g, .03, .06, .03, '#222', s * (w / 2 - .03), .03, t * (d / 2 - .03));
        B(g, w - .04, .002, .002, '#000', 0, h - .16, front + .001); B(g, .1, .012, .02, metalM(), 0, h - .09, front + .01); break;
      case 'garderob': B(g, w, h, d - .02, c, 0, h / 2, -.01); doors(g, w - .01, h - .02, .01, front - .01, Math.max(2, Math.round(w / .5)), c); break;
      case 'spegel': {
        B(g, w, h, .02, c, 0, h / 2, -d / 2 + .01);
        const mirror = new Reflector(new THREE.PlaneGeometry(w - .05, h - .05), { clipBias: .003, textureWidth: 512, textureHeight: Math.round(512 * h / w), color: 0xc0c4c8 });
        mirror.position.set(0, h / 2, -d / 2 + .022); g.add(mirror); ref.mirror = mirror; break; }
      case 'toalett': B(g, .34, .4, .45, c, 0, .2, .08); B(g, .38, .06, .52, c, 0, .43, .06); B(g, .38, .38, .18, c, 0, .62, -d / 2 + .09); B(g, .1, .015, .05, metalM(), 0, .82, -d / 2 + .09); break;
      case 'handfat': B(g, w, .45, d - .02, c2 || '#9a7550', 0, .35 + .225, -.01); B(g, w, .07, d, c, 0, h - .035, 0); B(g, w * .6, .004, d * .55, '#e0e4e6', 0, h + .001, .03);
        C(g, .012, .012, .16, metalM(), 0, h + .08, -d / 2 + .06); B(g, .02, .02, .1, metalM(), 0, h + .155, -d / 2 + .1); break;
      case 'badkar': B(g, w, h, d, c, 0, h / 2, 0); B(g, w - .12, .004, d - .12, '#dfe5e8', 0, h + .002, 0); C(g, .015, .015, .2, metalM(), -w / 2 + .1, h + .1, -d / 2 + .06); break;
      case 'dusch': { B(g, w, .05, d, '#f2f2f2', 0, .025, 0); const glass = M('#cfe8ef', { transparent: true, opacity: .22, roughness: .05, metalness: .1 });
        B(g, w, h - .05, .01, glass, 0, h / 2, d / 2); B(g, .01, h - .05, d, glass, -w / 2, h / 2, 0);
        C(g, .012, .012, h - .2, metalM(), w / 2 - .08, (h - .2) / 2 + .1, -d / 2 + .05); C(g, .1, .1, .02, metalM(), w / 2 - .2, h - .1, -d / 2 + .2); break; }
      case 'tvattmaskin': B(g, w - .01, h, d - .02, c, 0, h / 2, -.01); { const r = C(g, .2, .2, .03, M('#2a3238', { metalness: .4, roughness: .2 }), 0, h * .45, front); r.rotation.x = Math.PI / 2; } B(g, w - .05, .08, .01, '#d0d0d0', 0, h - .06, front); break;
      case 'taklampa': { const sh = .26;
        B(g, .012, h - sh, .012, '#111', 0, sh + (h - sh) / 2, 0);
        const shadeM = new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: .5, metalness: .3, side: THREE.DoubleSide });
        const cone = C(g, .05, w / 2, sh, shadeM, 0, sh / 2, 0, 28, true); cone.castShadow = false;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0x777777 })); bulb.position.y = .06; g.add(bulb);
        ref.bulb = bulb; ref.lightY = .0; ref.power = 14; break; }
      case 'spot': { C(g, w / 2, w / 2, h, c, 0, h / 2, 0); const bulb = C(g, w / 2.6, w / 2.6, .005, new THREE.MeshStandardMaterial({ color: 0x777777 }), 0, -.001, 0); ref.bulb = bulb; ref.lightY = -.15; ref.power = 6; break; }
      case 'golvlampa': { C(g, .16, .18, .03, c, 0, .015, 0); C(g, .012, .012, h - .3, c, 0, (h - .3) / 2, 0);
        const sm = new THREE.MeshStandardMaterial({ color: new THREE.Color(c2), roughness: .9, side: THREE.DoubleSide, transparent: true, opacity: .96 });
        const s = C(g, .13, .2, .3, sm, 0, h - .15, 0, 28, true); s.castShadow = false; ref.shade = s; ref.lightY = h - .2; ref.power = 8; break; }
      case 'bordslampa': { C(g, .06, .08, .03, c, 0, .015, 0); C(g, .015, .015, h - .2, c, 0, (h - .2) / 2, 0);
        const sm = new THREE.MeshStandardMaterial({ color: new THREE.Color(c2), roughness: .9, side: THREE.DoubleSide });
        const s = C(g, .08, w / 2, .2, sm, 0, h - .1, 0, 24, true); s.castShadow = false; ref.shade = s; ref.lightY = h - .12; ref.power = 4; break; }
      case 'ledlist': { const strip = B(g, w, .015, .025, new THREE.MeshStandardMaterial({ color: 0x777777 }), 0, 0, 0); strip.castShadow = false; ref.bulb = strip; ref.lightY = -.05; ref.power = 4; break; }
      case 'tv': { B(g, w, h, .035, '#0b0b0b', 0, h / 2, -d / 2 + .02);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - .03, h - .03), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: .15, metalness: .2 }));
        scr.position.set(0, h / 2, -d / 2 + .039); g.add(scr); ref.screen = scr; break; }
      case 'tvbank': B(g, w, h - .1, d, c, 0, .1 + (h - .1) / 2, 0); for (let i = 0; i < 3; i++) B(g, w / 3 - .01, h - .14, .01, shade(c, 1.15), -w / 3 + i * w / 3, .12 + (h - .14) / 2, front + .001);
        for (const s of [-1, 1]) for (const t of [-1, 1]) B(g, .03, .1, .03, metalM(), s * (w / 2 - .05), .05, t * (d / 2 - .05)); break;
      case 'hogtalare': case 'golvhogtalare': { B(g, w, h, d, c, 0, h / 2, 0); const cones = [];
        const n = it.type === 'golvhogtalare' ? 2 : 1;
        for (let i = 0; i < n; i++) { const cn = C(g, w * .32, w * .32, .02, M('#2c2c2c', { roughness: .4 }), 0, h * (n === 2 ? .3 + i * .25 : .35), front); cn.rotation.x = Math.PI / 2; cones.push(cn); }
        const tw = C(g, w * .12, w * .12, .02, metalM(), 0, h * .82, front); tw.rotation.x = Math.PI / 2; ref.cones = cones; break; }
      case 'soundbar': { B(g, w, h, d, c, 0, h / 2, 0); B(g, w - .02, h - .02, .005, M('#333', { roughness: 1 }), 0, h / 2, front + .001); ref.cones = []; break; }
      case 'altan': { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [M(c), M(c), floorMat('tra', c), M(c), M(c), M(c)]);
        m.position.y = h / 2; m.receiveShadow = m.castShadow = true; g.add(m);
        scaleTopUV(m.geometry, w, d); break; }
      case 'pool': { const cp = '#d9d4c8'; B(g, w, h, .2, cp, 0, h / 2, -d / 2 + .1); B(g, w, h, .2, cp, 0, h / 2, d / 2 - .1); B(g, .2, h, d, cp, -w / 2 + .1, h / 2, 0); B(g, .2, h, d, cp, w / 2 - .1, h / 2, 0);
        const water = B(g, w - .4, .02, d - .4, M(c, { roughness: .05, metalness: .1, emissive: new THREE.Color(c), emissiveIntensity: .25, transparent: true, opacity: .92 }), 0, .03, 0); water.castShadow = false; break; }
      case 'gang': { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [M(c), M(c), floorMat('klinker', c), M(c), M(c), M(c)]); m.position.y = h / 2; m.receiveShadow = true; g.add(m); scaleTopUV(m.geometry, w, d); break; }
      case 'trad': { C(g, .12, .18, h * .45, '#4a3020', 0, h * .225, 0, 8);
        for (const [x, y, z, s] of [[0, .62, 0, .5], [.25, .5, .15, .36], [-.22, .55, -.2, .38], [.05, .82, .05, .34]]) {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(w * s, 1), M(shade(c, .9 + s * .3), { flatShading: true, roughness: .9 })); m.position.set(x * w, y * h, z * w); m.castShadow = true; m.receiveShadow = true; g.add(m); } break; }
      case 'buske': { for (const [x, z, s] of [[0, 0, .5], [.25, .1, .35], [-.2, -.15, .38]]) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(w * s, 1), M(c, { flatShading: true, roughness: .9 }));
        m.position.set(x * w, h * .45, z * w); m.scale.y = h / w * 1.1; m.castShadow = true; g.add(m); } break; }
      case 'utelampa': { C(g, .05, .06, h - .12, c, 0, (h - .12) / 2, 0); const bulb = C(g, .065, .065, .12, new THREE.MeshStandardMaterial({ color: 0x777777 }), 0, h - .06, 0); C(g, .08, .08, .02, c, 0, h + .01, 0);
        ref.bulb = bulb; ref.lightY = h - .06; ref.power = 3; break; }
      case 'staket': { const n = Math.max(2, Math.round(w / .14)); for (let i = 0; i < n; i++) B(g, .09, h, .02, c, -w / 2 + (i + .5) * w / n, h / 2, 0); for (const y of [.2, h - .2]) B(g, w, .06, .04, shade(c, .85), 0, y, -.03); break; }
      case 'grill': { B(g, w, .35, d, c, 0, .75, 0); const lid = C(g, d / 2, d / 2, w, c, 0, .92, 0, 20); lid.rotation.z = Math.PI / 2; lid.scale.set(1, 1, .7);
        for (const s of [-1, 1]) for (const t of [-1, 1]) B(g, .03, .58, .03, c, s * (w / 2 - .05), .29, t * (d / 2 - .05)); B(g, w + .3, .02, d * .8, '#555', 0, .7, 0); break; }
      case 'bil': { const pm = M(c, { metalness: .6, roughness: .25 }); B(g, w, .55, d, pm, 0, .2 + .275, 0); B(g, w - .1, .08, d - .05, pm, 0, .78, .1);
        const cab = B(g, w - .16, .5, d * .5, M('#151b22', { metalness: .4, roughness: .1 }), 0, 1.06, -.15); cab.scale.x = 1;
        B(g, w - .2, .04, d * .48, pm, 0, 1.33, -.15);
        for (const [x, z] of [[w / 2 - .12, d / 2 - .8], [-w / 2 + .12, d / 2 - .8], [w / 2 - .12, -d / 2 + .75], [-w / 2 + .12, -d / 2 + .75]]) {
          const wh = C(g, .33, .33, .24, '#111', x, .33, z, 24); wh.rotation.z = Math.PI / 2; const rim = C(g, .2, .2, .25, metalM(), x, .33, z, 16); rim.rotation.z = Math.PI / 2; }
        for (const s of [-1, 1]) { B(g, .35, .08, .02, M('#fff', { emissive: 0xffffff, emissiveIntensity: .6 }), s * (w / 2 - .3), .6, d / 2 + .005); B(g, .35, .06, .02, M('#c22', { emissive: 0xff2222, emissiveIntensity: .5 }), s * (w / 2 - .3), .65, -d / 2 - .005); }
        break; }
      default: B(g, w, h, d, c, 0, h / 2, 0);
    }
    if (cat.dev === 'light') {
      const L = new THREE.PointLight(0xffb978, 0, it.type === 'utelampa' ? 6 : 9, 2); L.position.y = ref.lightY ?? h / 2; g.add(L); ref.light = L;
    }
    if (cat.dev === 'tv') { const L = new THREE.PointLight(0x7aa7ff, 0, 4, 2); L.position.set(0, h / 2, front + .3); g.add(L); ref.light = L; ref.power = 2; }
    g.position.set(it.x, it.elev || 0, it.y); g.rotation.y = -it.rot * Math.PI / 180;
    g.traverse(o => { o.userData.pick = { type: 'item', id: it.id }; });
    return ref;
  }
  function scaleTopUV(geo, w, d) { const uv = geo.attributes.uv; for (let i = 8; i < 12; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d); uv.needsUpdate = true; }

  // ---------- väggar, dörrar, fönster ----------
  function buildWall(h, w, H) {
    const L = wallLen(w); if (L < .01) return;
    const g = new THREE.Group(); g.position.set(w.a.x, 0, w.a.y); g.rotation.y = Math.atan2(-(w.b.y - w.a.y), w.b.x - w.a.x);
    const t = w.t, wm = M(w.color || '#eeebe5', { roughness: .92 }), cap = M('#3a3a3a');
    const ops = h.openings.filter(o => o.wall === w.id).sort((a, b) => a.t - b.t);
    const piece = (x0, x1, y0, y1) => { if (x1 - x0 < .005 || y1 - y0 < .005) return; const m = B(g, x1 - x0, y1 - y0, t, wm, (x0 + x1) / 2, (y0 + y1) / 2, 0); m.userData.pick = { type: 'wall', id: w.id };
      if (Math.abs(y1 - H) < .001) { const cm = B(g, x1 - x0, .012, t + .002, cap, (x0 + x1) / 2, H + .006, 0); cm.castShadow = false; cm.userData.pick = m.userData.pick; } };
    let cur = -t / 2;
    for (const o of ops) { const s = o.t - o.w / 2, e = o.t + o.w / 2; piece(cur, s, 0, H); cur = Math.max(cur, e);
      piece(s, e, 0, Math.min(o.sill, H)); if (o.sill + o.h < H) piece(s, e, o.sill + o.h, H); }
    piece(cur, L + t / 2, 0, H);
    world.add(g);
    for (const o of ops) buildOpening(h, w, o, g, H);
  }
  function buildOpening(h, w, o, g, H) {
    const t = w.t, ref = { o }, s = o.t - o.w / 2, e = o.t + o.w / 2, top = o.sill + o.h, fm = M(o.color || '#ffffff', { roughness: .5 });
    const pickIt = m => { m.traverse(x => x.userData.pick = { type: 'opening', id: o.id }); return m; };
    if (top > H + .01 && o.kind !== 'hole') { /* lågt snitt: visa bara den nedre delen */ }
    const vis = Math.min(top, H);
    if (o.kind === 'window') {
      const f = .05;
      [[s + f / 2, o.sill + o.h / 2, f, o.h], [e - f / 2, o.sill + o.h / 2, f, o.h]].forEach(([x, y, ww, hh]) => { if (o.sill < H) pickIt(B(g, ww, Math.min(hh, H - o.sill), t * .6, fm, x, o.sill + Math.min(hh, H - o.sill) / 2, 0)); });
      if (o.sill < H) pickIt(B(g, o.w, f, t * .6, fm, o.t, o.sill + f / 2, 0));
      if (top <= H) pickIt(B(g, o.w, f, t * .6, fm, o.t, top - f / 2, 0));
      if (o.w > 1.0 && o.sill < H) pickIt(B(g, .04, Math.min(o.h, H - o.sill), t * .5, fm, o.t, o.sill + Math.min(o.h, H - o.sill) / 2, 0));
      const gh = Math.max(0, Math.min(o.h - f * 2, H - o.sill - f));
      if (gh > .01) { const glass = new THREE.Mesh(new THREE.BoxGeometry(o.w - f * 2, gh, .01), M('#9fc3d6', { transparent: true, opacity: .25, roughness: .05, metalness: .2 }));
        glass.position.set(o.t, o.sill + f + gh / 2, 0); glass.castShadow = false; g.add(pickIt(glass)); }
      if (o.sill > .3 && o.sill < H) pickIt(B(g, o.w + .06, .03, t + .06, '#e8e8e8', o.t, o.sill - .015, 0));
      if (o.blind !== 'none') {
        const side = insideSign(h, w, o) * (t / 2 + .03);
        const bg = new THREE.Group(); bg.position.set(o.t, top, side); g.add(bg);
        const roll = C(bg, .03, .03, o.w + .04, o.blindColor, 0, -.03, 0, 12); roll.rotation.z = Math.PI / 2;
        let cloth;
        if (o.blind === 'persienn') { cloth = new THREE.Group(); const n = Math.round(o.h / .05);
          for (let i = 0; i < n; i++) { const sl = B(cloth, o.w, .004, .045, o.blindColor, 0, -(i + .5) * .05, 0); sl.rotation.x = .5; }
          ref.slats = cloth.children; }
        else { cloth = B(bg, o.w, 1, .006, M(o.blindColor, { roughness: 1, side: THREE.DoubleSide }), 0, -.5, 0); }
        bg.add(cloth); ref.cloth = cloth; ref.blindH = o.h; ref.blindG = bg; pickIt(bg);
      }
    } else if (o.kind === 'door') {
      const f = .06, fz = t + .02;
      pickIt(B(g, f, Math.min(o.h, H), fz, fm, s + f / 2, Math.min(o.h, H) / 2, 0)); pickIt(B(g, f, Math.min(o.h, H), fz, fm, e - f / 2, Math.min(o.h, H) / 2, 0));
      if (o.h <= H) pickIt(B(g, o.w, f, fz, fm, o.t, o.h - f / 2, 0));
      const lw = o.w - f * 2, lh = Math.min(o.h - f - .01, H - .01), hingeX = o.hinge === 'L' ? s + f : e - f, dir = o.hinge === 'L' ? 1 : -1;
      const pivot = new THREE.Group(); pivot.position.set(hingeX, 0, 0); g.add(pivot);
      const leaf = B(pivot, lw, lh, .04, M(o.color, { roughness: .45 }), dir * lw / 2, .01 + lh / 2, 0);
      B(pivot, .12, .02, .05, metalM(), dir * (lw - .08), 1.0, .04); B(pivot, .12, .02, .05, metalM(), dir * (lw - .08), 1.0, -.04);
      pickIt(pivot); ref.pivot = pivot; ref.sign = -dir * o.swing; ref.leaf = leaf;
    } else if (o.kind === 'garage') {
      const f = .08; pickIt(B(g, f, Math.min(o.h, H), t + .02, fm, s + f / 2, Math.min(o.h, H) / 2, 0)); pickIt(B(g, f, Math.min(o.h, H), t + .02, fm, e - f / 2, Math.min(o.h, H) / 2, 0));
      const pg = new THREE.Group(); pg.position.set(o.t, o.h, 0); g.add(pg);
      const n = 5, ph = o.h / n; for (let i = 0; i < n; i++) B(pg, o.w - f * 2, ph - .01, .05, M(o.color, { metalness: .4, roughness: .45 }), 0, -(i + .5) * ph, 0);
      pickIt(pg); ref.panel = pg; ref.gh = o.h;
    }
    refs.openings[o.id] = ref;
  }

  // ---------- bygg hela scenen ----------
  function disposeWorld() {
    world.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isReflector || o.getRenderTarget) { o.dispose?.(); } });
    world.clear(); refs = { items: {}, openings: {}, pick: [] }; selBox = null;
  }
  function build() {
    need = false; const h = home(); if (!h) return; disposeWorld();
    const pts = [...h.walls.flatMap(w => [w.a, w.b]), ...h.rooms.flatMap(r => r.pts), ...h.items.map(i => ({ x: i.x, y: i.y }))];
    let x0 = -5, x1 = 15, y0 = -5, y1 = 15; if (pts.length) { x0 = Math.min(...pts.map(p => p.x)); x1 = Math.max(...pts.map(p => p.x)); y0 = Math.min(...pts.map(p => p.y)); y1 = Math.max(...pts.map(p => p.y)); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, size = Math.max(x1 - x0, y1 - y0, 8);
    bounds = { cx, cy, size };
    // mark
    const gs = size * 3 + 40;
    if (h.type !== 'lagenhet') { const gm = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs), floorMat('grass', '#4b6a3a'));
      gm.rotation.x = -Math.PI / 2; gm.position.set(cx, -.02, cy); gm.receiveShadow = true; const uv = gm.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * gs, uv.getY(i) * gs);
      gm.userData.pick = { type: 'ground' }; world.add(gm); }
    else { const gm = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 1.5, .3, y1 - y0 + 1.5), M('#3a3d40')); gm.position.set(cx, -.16, cy); gm.receiveShadow = true; gm.userData.pick = { type: 'ground' }; world.add(gm); }
    // golv
    for (const r of h.rooms) {
      const sh = new THREE.Shape(r.pts.map(p => new THREE.Vector2(p.x, -p.y)));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), floorMat(r.style || 'tra', r.floor)); m.rotation.x = -Math.PI / 2; m.position.y = .002; m.receiveShadow = true;
      m.userData.pick = { type: 'room', id: r.id }; world.add(m);
      const base = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .1, bevelEnabled: false }), M('#8a8580')); base.rotation.x = -Math.PI / 2; base.position.y = -.1; base.receiveShadow = true; world.add(base);
    }
    // väggar
    const cut = S.cut ? 1.15 : 0;
    for (const w of h.walls) buildWall(h, w, cut ? Math.min(cut, w.h) : w.h);
    // saker
    for (const it of h.items) { const ref = buildItem(it); refs.items[it.id] = ref; world.add(ref.group);
      if (cut && it.elev > cut - .05 && !ITEMS[it.type].dev) ref.group.visible = false; }
    // sol
    sun.position.set(cx - size * .6, size * 1.2, cy + size * .8); sun.target.position.set(cx, 0, cy);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -size * .9; sc.right = sc.top = size * .9; sc.near = 1; sc.far = size * 4; sc.updateProjectionMatrix();
    const sig = h.id + ':' + (h.walls.length > 0); if (!built || sig !== lastSig) fitCam(); built = true; lastSig = sig;
    applyStates(true); setLighting(); highlight();
  }
  let bounds = { cx: 6, cy: 5, size: 12 };
  function fitCam() { const { cx, cy, size } = bounds; controls.target.set(cx, 0, cy); const s = Math.max(size, 10); cam.position.set(cx + s * .9, s * 1.15, cy + s * 1.3); controls.update(); }

  function setLighting() {
    const day = S.day;
    hemi.intensity = day ? 1.6 : .45; hemi.color.set(day ? 0xdde8ff : 0x6d82b8); hemi.groundColor.set(day ? 0x4a4030 : 0x141410);
    sun.intensity = day ? 2.6 : .35; sun.color.set(day ? 0xffe6c8 : 0x9fb4ff);
    const bg = day ? 0x1b2219 : 0x0c0f0c; scene.background = new THREE.Color(bg); scene.fog = new THREE.Fog(bg, bounds.size * 2.2, bounds.size * 5);
  }

  // ---------- tillstånd (lampor, dörrar, gardiner) ----------
  function applyStates(instant) {
    const h = home();
    for (const it of h.items) { const r = refs.items[it.id]; if (!r) continue; const st = it.state || {};
      r.target = st.on ? (st.bri ?? .8) : 0; if (instant) r.cur = r.target; }
    for (const o of h.openings) { const r = refs.openings[o.id]; if (!r) continue; r.tOpen = o.state?.open || 0; r.tBlind = o.state?.blind || 0;
      if (instant) { r.open = r.tOpen; r.blind = r.tBlind; } }
  }
  function animate(dt) {
    const k = Math.min(1, dt * 5), now = performance.now() / 1000;
    for (const id in refs.items) { const r = refs.items[id]; if (r.target === undefined) continue;
      r.cur += (r.target - r.cur) * k; const v = r.cur, dev = ITEMS[r.it.type].dev;
      if (r.light) r.light.intensity = v * (r.power || 10) * (dev === 'tv' ? 1 : 1);
      if (r.bulb) { r.bulb.material.emissive.setRGB(1, .72, .42); r.bulb.material.emissiveIntensity = v * 3; r.bulb.material.color.setScalar(v > .05 ? 1 : .45); }
      if (r.shade) { r.shade.material.emissive.setRGB(1, .7, .4); r.shade.material.emissiveIntensity = v * .9; }
      if (r.screen) { const m = r.screen.material; if (v > .05 && !m.emissiveMap) { m.emissiveMap = tvScreen(); m.emissive.set(0xffffff); m.needsUpdate = true; } m.emissiveIntensity = v * 1.2; }
      if (r.cones) { const p = v > .5 ? 1 + Math.abs(Math.sin(now * 9)) * .12 : 1; r.cones.forEach(c => c.scale.set(p, 1, p)); }
    }
    for (const id in refs.openings) { const r = refs.openings[id];
      r.open += ((r.tOpen ?? 0) - (r.open ?? 0)) * k; r.blind += ((r.tBlind ?? 0) - (r.blind ?? 0)) * k;
      if (r.pivot) r.pivot.rotation.y = r.sign * r.open * Math.PI * .5;
      if (r.panel) { r.panel.scale.y = 1 - r.open * .92; }
      if (r.cloth) { const L = Math.max(.001, r.blind * r.blindH);
        if (r.slats) r.slats.forEach((s, i) => { const y = (i + .5) * .05; s.visible = y <= L + .001; s.rotation.x = r.blind > .02 ? .25 : 1.2; });
        else { r.cloth.scale.y = L; r.cloth.position.y = -L / 2 - .03; r.cloth.visible = L > .01; } }
    }
  }

  // ---------- markering ----------
  function highlight() {
    if (selBox) { scene.remove(selBox); selBox = null; }
    const s = S.sel; if (!s || S.mode !== 'bygg') return;
    let obj = null;
    if (s.type === 'item') obj = refs.items[s.id]?.group;
    if (obj) { selBox = new THREE.BoxHelper(obj, 0xff7a2f); scene.add(selBox); }
  }

  // ---------- klick & dra ----------
  const ray = new THREE.Raycaster(), mv = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hp = new THREE.Vector3();
  let down = null, drag = null;
  function rayAt(e) { const r = renderer.domElement.getBoundingClientRect(); mv.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(mv, cam); }
  function pickAt(e) { rayAt(e); const hits = ray.intersectObjects(world.children, true);
    for (const h of hits) { let o = h.object, vis = true; while (o) { if (!o.visible) { vis = false; break; } o = o.parent; } if (!vis) continue;
      const p = h.object.userData.pick; if (p) return { ...p, point: h.point }; } return null; }
  renderer.domElement.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; down = { x: e.clientX, y: e.clientY }; drag = null;
    if (S.mode !== 'bygg' || S.placing) return;
    const p = pickAt(e);
    if (p?.type === 'item') { const it = home().items.find(i => i.id === p.id); if (!it) return; rayAt(e); ray.ray.intersectPlane(plane, hp);
      drag = { it, dx: hp.x - it.x, dy: hp.z - it.y, moved: false, committed: false }; controls.enabled = false; S.sel = { type: 'item', id: it.id }; emit('sel'); }
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (drag) { rayAt(e); if (!ray.ray.intersectPlane(plane, hp)) return; const it = drag.it;
      if (!drag.committed) { commit(); drag.committed = true; }
      let q = { x: Math.round((hp.x - drag.dx) / .05) * .05, y: Math.round((hp.z - drag.dy) / .05) * .05 };
      if (ITEMS[it.type].snap && !e.altKey) { const sw = snapToWall(home(), it, q); if (sw) { q = sw; it.rot = sw.rot; } }
      it.x = q.x; it.y = q.y; drag.moved = true; emit('item', it.id); return; }
    if (S.mode === 'styr') { const p = pickAt(e); renderer.domElement.style.cursor = p && (p.type === 'item' && ITEMS[home().items.find(i => i.id === p.id)?.type]?.dev || p.type === 'opening' || p.type === 'room') ? 'pointer' : 'grab'; }
  });
  window.addEventListener('pointerup', e => {
    if (drag) { const moved = drag.moved; drag = null; controls.enabled = true; if (moved) { emit('full'); down = null; return; } }
    if (!down || e.target !== renderer.domElement) { down = null; return; }
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null; const p = pickAt(e);
    if (S.mode === 'styr') { if (p) api.device(p); return; }
    if (S.placing) { placeAt(e, p); return; }
    if (!p || p.type === 'ground') S.sel = null; else S.sel = { type: p.type, id: p.id };
    emit('sel');
  });
  function placeAt(e, p) {
    const h = home(), pl = S.placing; rayAt(e); ray.ray.intersectPlane(plane, hp);
    if (pl.kind === 'item') { let q = { x: Math.round(hp.x * 20) / 20, y: Math.round(hp.z * 20) / 20, rot: 0 }; const c = ITEMS[pl.key];
      if (c.snap) { const sw = snapToWall(h, { w: c.w, d: c.d }, q); if (sw) q = sw; }
      commit(); const it = makeItem(h, pl.key, q.x, q.y, q.rot); if (it.state) it.state.on = true; S.sel = { type: 'item', id: it.id }; }
    else { const pt = p?.point || hp; const f = findWall(h, { x: pt.x, y: pt.z }, .6); if (!f) { api.toast('Klicka på en vägg'); return; }
      const c = OPENINGS[pl.key]; commit(); const o = makeOpening(h, pl.key, f.wall, Math.round(Math.min(Math.max(f.t, c.w / 2), wallLen(f.wall) - c.w / 2) * 20) / 20); S.sel = { type: 'opening', id: o.id }; }
    if (!e.shiftKey) S.placing = null; emit('full'); api.toolDone();
  }

  // ---------- loop ----------
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(host);
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    if (!host.offsetParent) return;
    if (need) build();
    animate(dt); controls.update(); if (selBox) selBox.update(); renderer.render(scene, cam);
  });

  return {
    build() { need = true; },
    buildNow: build,
    syncItem(id) { const r = refs.items[id]; if (!r) return; const it = r.it; r.group.position.set(it.x, it.elev || 0, it.y); r.group.rotation.y = -it.rot * Math.PI / 180; },
    states() { applyStates(false); },
    highlight, fitCam, setLighting, resize,
    topView() { const { cx, cy, size } = bounds; controls.target.set(cx, 0, cy); cam.position.set(cx, size * 1.6, cy + .01); },
  };
}
