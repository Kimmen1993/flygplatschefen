// Datamodell, sparning, ångra och mallar.
import { ITEMS, OPENINGS } from './catalog.js';

export const uid = () => Math.random().toString(36).slice(2, 10);
const KEY = 'hemma.v1';
const r3 = v => Math.round(v * 1000) / 1000;

export const S = {
  homes: [], cur: null, ha: { url: '', token: '' },
  mode: 'styr', tool: 'select', view: '3d', sel: null, placing: null, day: false, cut: true,
};

const listeners = [];
export const on = f => listeners.push(f);
let saveT = 0;
// kind: 'full' (allt ritas om), 'item' (bara flytt av ett objekt), 'state' (lampor/dörrar), 'sel' (markering)
export function emit(kind = 'full', id) {
  for (const f of listeners) f(kind, id);
  if (kind !== 'sel') { clearTimeout(saveT); saveT = setTimeout(save, 500); }
}
export const home = () => S.homes.find(h => h.id === S.cur);

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ homes: S.homes, cur: S.cur, ha: S.ha })); }
  catch (e) { window.toast?.('Kunde inte spara – bakgrundsbilden är för stor'); }
}
export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && d.homes && d.homes.length) {
      S.homes = d.homes; S.cur = d.homes.some(h => h.id === d.cur) ? d.cur : d.homes[0].id; S.ha = d.ha || S.ha; return;
    }
  } catch (e) { /* börja om */ }
  const h = template('villa'); S.homes = [h]; S.cur = h.id;
}

// ---------- ångra ----------
const undoStack = [], redoStack = [];
export function commit() {
  undoStack.push(JSON.stringify(home())); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0;
}
function replace(json) {
  const h = JSON.parse(json); const i = S.homes.findIndex(x => x.id === h.id);
  if (i >= 0) S.homes[i] = h; S.sel = null; emit('full');
}
export function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(home())); replace(undoStack.pop()); }
export function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(home())); replace(redoStack.pop()); }
export function clearHistory() { undoStack.length = 0; redoStack.length = 0; }

// ---------- geometri ----------
export function proj(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-9, ux = dx / L, uy = dy / L;
  const px = p.x - a.x, py = p.y - a.y;
  return { t: px * ux + py * uy, d: -px * uy + py * ux, L, ux, uy };
}
export const wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
export function polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s / 2); }
export function centroid(pts) { let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length }; }
export function inPoly(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
export const roomAt = (h, p) => h.rooms.find(r => inPoly(p, r.pts));

// Ny vägg – delar som redan täcks av en befintlig vägg hoppas över (så rum kan dela väggar).
export function addWall(h, a, b, o = {}) {
  const L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 0.05) return [];
  const cover = [];
  for (const w of h.walls) {
    const p1 = proj(w.a, a, b), p2 = proj(w.b, a, b);
    if (Math.abs(p1.d) < 0.03 && Math.abs(p2.d) < 0.03) {
      const s = Math.max(Math.min(p1.t, p2.t), 0), e = Math.min(Math.max(p1.t, p2.t), L);
      if (e - s > 0.01) cover.push([s, e]);
    }
  }
  cover.sort((x, y) => x[0] - y[0]);
  const pieces = []; let cur = 0;
  for (const [s, e] of cover) { if (s > cur + 0.05) pieces.push([cur, s]); cur = Math.max(cur, e); }
  if (L > cur + 0.05) pieces.push([cur, L]);
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, out = [];
  for (const [s, e] of pieces) {
    const w = { id: uid(), a: { x: r3(a.x + ux * s), y: r3(a.y + uy * s) }, b: { x: r3(a.x + ux * e), y: r3(a.y + uy * e) },
      t: o.t || 0.15, h: o.h || h.ceiling || 2.5, color: o.color || '#eeebe5' };
    h.walls.push(w); out.push(w);
  }
  return out;
}
export function addRoom(h, x, y, w, d, name, floor = '#b8915f', style = 'tra', o = {}) {
  const pts = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + d }, { x, y: y + d }];
  const r = { id: uid(), name, pts, floor, style }; h.rooms.push(r);
  for (let i = 0; i < 4; i++) addWall(h, pts[i], pts[(i + 1) % 4], o);
  return r;
}
// Flyttar en hörnpunkt – alla väggar och rum som delar punkten följer med.
export function movePoint(h, from, to) {
  const eq = p => Math.abs(p.x - from.x) < 1e-3 && Math.abs(p.y - from.y) < 1e-3;
  for (const w of h.walls) { if (eq(w.a)) w.a = { ...to }; if (eq(w.b)) w.b = { ...to }; }
  for (const r of h.rooms) r.pts = r.pts.map(p => eq(p) ? { ...to } : p);
}
export function findWall(h, p, maxD = 0.4) {
  let best = null;
  for (const w of h.walls) {
    const pr = proj(p, w.a, w.b);
    if (pr.t < 0 || pr.t > pr.L) continue;
    const d = Math.abs(pr.d);
    if (d < maxD && (!best || d < best.d)) best = { wall: w, t: pr.t, d, side: Math.sign(pr.d) || 1 };
  }
  return best;
}
// Lägger möbeln mot närmaste vägg och vänder fronten ut i rummet.
export function snapToWall(h, it, p) {
  let best = null;
  for (const w of h.walls) {
    const pr = proj(p, w.a, w.b);
    if (pr.t < -0.05 || pr.t > pr.L + 0.05) continue;
    const need = w.t / 2 + it.d / 2, gap = Math.abs(Math.abs(pr.d) - need);
    if (Math.abs(pr.d) < need + 0.3 && (!best || gap < best.gap)) best = { w, pr, need, gap };
  }
  if (!best) return null;
  const { w, pr, need } = best, s = Math.sign(pr.d) || 1, nx = -pr.uy * s, ny = pr.ux * s;
  const t = Math.min(Math.max(pr.t, it.w / 2), pr.L - it.w / 2);
  return { x: r3(w.a.x + pr.ux * t + nx * need), y: r3(w.a.y + pr.uy * t + ny * need), rot: Math.round(Math.atan2(-nx, ny) * 180 / Math.PI + 360) % 360 };
}

export function makeItem(h, type, x, y, rot = 0, extra = {}) {
  const c = ITEMS[type];
  const it = { id: uid(), type, x, y, rot, w: c.w, d: c.d, h: c.h, elev: c.ceil ? (h.ceiling || 2.5) - c.h : (c.elev || 0),
    color: c.color, color2: c.color2 || null, name: '', entity: '', state: c.dev ? { on: false, bri: 0.8 } : null, ...extra };
  if (extra.on !== undefined) { it.state.on = extra.on; delete it.on; }
  h.items.push(it); return it;
}
export function makeOpening(h, key, wall, t, extra = {}) {
  const c = OPENINGS[key];
  const o = { id: uid(), key, kind: c.kind, wall: wall.id, t, w: c.w, h: c.h, sill: c.sill, color: c.color, hinge: 'L', swing: 1,
    blind: 'none', blindColor: '#ece6da', entity: '', blindEntity: '', name: '', state: { open: 0, blind: 0 }, ...extra };
  h.openings.push(o); return o;
}
export function nameOf(h, x) {
  const base = x.name || (x.type ? ITEMS[x.type].name : OPENINGS[x.key].name);
  if (x.name) return base;
  let p = x;
  if (!x.type) { const w = h.walls.find(w => w.id === x.wall); if (w) { const L = wallLen(w), ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
    const c = { x: w.a.x + ux * x.t, y: w.a.y + uy * x.t };
    const r = roomAt(h, { x: c.x - uy * .3, y: c.y + ux * .3 }) || roomAt(h, { x: c.x + uy * .3, y: c.y - ux * .3 });
    return r ? `${base} · ${r.name}` : base; } }
  const r = roomAt(h, p); return r ? `${base} · ${r.name}` : base;
}

// ---------- mallar ----------
function blank(name, type) { return { id: uid(), name, type, ceiling: 2.5, walls: [], rooms: [], openings: [], items: [], bg: null }; }
function op(h, key, x, y, extra) { const f = findWall(h, { x, y }, 0.2); if (f) makeOpening(h, key, f.wall, f.t, extra); }

export function template(kind) {
  if (kind === 'villa') return villa();
  if (kind === 'lagenhet') return apartment();
  if (kind === 'stuga') return cabin();
  return blank('Mitt nya hem', kind === 'tom-lagenhet' ? 'lagenhet' : 'hus');
}

function villa() {
  const h = blank('Exempelhuset', 'hus'), O = 0.1, I = 0.075;
  // ytterväggar först (tjockare), sedan rummen
  const out = [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 10 }, { x: 0, y: 10 }];
  for (let i = 0; i < 4; i++) addWall(h, out[i], out[(i + 1) % 4], { t: 0.2 });
  addRoom(h, 0, 0, 14, 5.5, 'Kök & vardagsrum', '#b8915f', 'tra');
  addRoom(h, 0, 5.5, 4.5, 4.5, 'Sovrum', '#a88761', 'tra');
  addRoom(h, 4.5, 5.5, 3, 4.5, 'Hall', '#8d8d8d', 'klinker');
  addRoom(h, 7.5, 5.5, 3, 4.5, 'Badrum', '#d6d9dc', 'klinker');
  addRoom(h, 10.5, 5.5, 3.5, 4.5, 'Barnrum', '#b09070', 'tra');
  // väggfärger
  h.walls.forEach(w => { if (w.a.x === w.b.x && w.a.x === 0 && w.a.y < 5.5 && w.b.y <= 5.5) w.color = '#e6dccb'; });
  // dörrar
  op(h, 'ytterdorr', 6, 10, { swing: -1 });
  op(h, 'dorr', 4.5, 7.75, { swing: -1 });
  op(h, 'dorr', 7.5, 8.6, { w: .8 });
  op(h, 'oppning', 6, 5.5, { w: 1.2 });
  op(h, 'dorr', 13.3, 5.5, { swing: -1 });
  // fönster
  op(h, 'fonster', 1.8, 0, { w: 1.6, sill: .5, h: 1.6, blind: 'persienn' });
  op(h, 'fonsterdorr', 4.6, 0, { w: 1.0 });
  op(h, 'fonster', 7.4, 0, { w: 1.4, blind: 'persienn' });
  op(h, 'fonster', 10.5, 0, { w: .8, sill: 1.05, h: 1.0 });
  op(h, 'fonster', 14, 2.75, { w: 1.2 });
  op(h, 'fonster', 2.25, 10, { w: 1.4, blind: 'rullgardin', blindColor: '#e8e2d6', state: { open: 0, blind: .55 } });
  op(h, 'fonster', 9.4, 10, { w: .6, h: .6, sill: 1.4, blind: 'rullgardin' });
  op(h, 'fonster', 12.2, 10, { w: 1.2, blind: 'rullgardin', blindColor: '#7a8fa6' });
  op(h, 'fonster', 14, 6.6, { w: 1.0 });
  // vardagsrum
  makeItem(h, 'matta', 2.5, 2.75, 90, { w: 3, d: 2.2 });
  makeItem(h, 'tvbank', O + .2, 2.75, 270);
  makeItem(h, 'tv', O + .03, 2.75, 270, { elev: 1.0, on: false });
  makeItem(h, 'golvhogtalare', O + .15, 1.55, 270);
  makeItem(h, 'golvhogtalare', O + .15, 3.95, 270);
  makeItem(h, 'soffa', 3.7, 2.75, 90);
  makeItem(h, 'soffbord', 2.3, 2.75, 90);
  makeItem(h, 'fatolj', 1.2, .9, 315);
  makeItem(h, 'golvlampa', .45, .5, 0, { on: true });
  makeItem(h, 'vaxt', 6.4, .55, 0);
  makeItem(h, 'taklampa', 2.5, 2.75, 0, { on: true });
  // kök längs norra väggen
  const ky = O + .3;
  makeItem(h, 'kyl', 13.6, O + .325, 0);
  makeItem(h, 'hogskap', 13.0, ky, 0);
  [12.4, 11.2, 9.8, 9.2].forEach(x => makeItem(h, 'underskap', x, ky, 0));
  makeItem(h, 'spis', 11.8, ky, 0);
  makeItem(h, 'diskho', 10.5, ky, 0, { w: .8 });
  [12.4, 11.2, 9.8, 9.2].forEach(x => makeItem(h, 'overskap', x, O + .175, 0));
  makeItem(h, 'flakt', 11.8, O + .225, 0);
  makeItem(h, 'ledlist', 9.5, O + .3, 0, { w: 1.2, on: true });
  makeItem(h, 'ledlist', 11.8, O + .3, 0, { w: 1.8, on: true });
  makeItem(h, 'koksoe', 10.9, 2.6, 0);
  [10.2, 10.9, 11.6].forEach(x => makeItem(h, 'barstol', x, 3.35, 180));
  makeItem(h, 'taklampa', 10.3, 2.6, 0, { on: true, color: '#c9a227' });
  makeItem(h, 'taklampa', 11.5, 2.6, 0, { on: true, color: '#c9a227' });
  makeItem(h, 'matbord', 7.6, 2.75, 90);
  makeItem(h, 'stol', 7.05, 2.3, 270); makeItem(h, 'stol', 7.05, 3.2, 270);
  makeItem(h, 'stol', 8.15, 2.3, 90); makeItem(h, 'stol', 8.15, 3.2, 90);
  makeItem(h, 'taklampa', 7.6, 2.75, 0, { on: true });
  makeItem(h, 'hogtalare', 13.0, 2.75, 90, { elev: 0 });
  // sovrum
  makeItem(h, 'sang', O + 1.05, 7.75, 270);
  makeItem(h, 'nattduks', O + .2, 6.45, 270); makeItem(h, 'nattduks', O + .2, 9.05, 270);
  makeItem(h, 'bordslampa', O + .2, 6.45, 0, { on: true }); makeItem(h, 'bordslampa', O + .2, 9.05, 0);
  makeItem(h, 'garderob', 3.4, 5.5 + I + .3, 0, { w: 1.6 });
  makeItem(h, 'spegel', 4.5 - I - .02, 9.3, 90);
  makeItem(h, 'taklampa', 2.6, 7.75, 0);
  // hall
  makeItem(h, 'taklampa', 6, 7.75, 0, { on: true, color: '#f2efe9' });
  makeItem(h, 'spegel', 7.5 - I - .02, 6.4, 90, { w: .5, h: 1.2, elev: .6 });
  makeItem(h, 'vaxt', 4.9, 9.55, 0);
  // badrum
  makeItem(h, 'badkar', 9.4, 10 - O - .375, 180);
  makeItem(h, 'toalett', 10.5 - I - .325, 6.5, 90);
  makeItem(h, 'handfat', 8.4, 5.5 + I + .225, 0);
  makeItem(h, 'spegel', 8.4, 5.5 + I + .02, 0, { w: .6, h: .8, elev: 1.0 });
  makeItem(h, 'tvattmaskin', 7.5 + I + .3, 7.3, 270);
  makeItem(h, 'spot', 8.5, 7.5, 0); makeItem(h, 'spot', 9.6, 7.5, 0);
  // barnrum
  makeItem(h, 'sang90', 14 - O - 1.0, 8.4, 90);
  makeItem(h, 'skrivbord', 11.4, 5.5 + I + .3, 0);
  makeItem(h, 'stol', 11.4, 6.5, 180);
  makeItem(h, 'bokhylla', 10.5 + I + .175, 8.6, 270);
  makeItem(h, 'taklampa', 12.25, 7.75, 0, { color: '#2f5d50' });
  // ute
  makeItem(h, 'altan', 4, -1.7, 0, { w: 6, d: 3 });
  makeItem(h, 'utesoffa', 2.5, -2.6, 0);
  makeItem(h, 'grill', 6.4, -1.0, 0);
  makeItem(h, 'pool', 10.6, -2.3, 0);
  makeItem(h, 'gang', 6, 12.2, 0);
  makeItem(h, 'gang', 16.8, 7.5, 0, { w: 3.2, d: 9 });
  makeItem(h, 'bil', 16.8, 8.5, 0);
  [[-3, -3], [-3.5, 5], [-3, 12], [19.5, -3], [20, 13], [8, -5.5]].forEach(([x, y]) => makeItem(h, 'trad', x, y, 0));
  [[1, 11], [3, 11.2], [9, 11], [-1.2, -4], [12, 11]].forEach(([x, y]) => makeItem(h, 'buske', x, y, 0));
  [[5.2, 10.5], [6.8, 10.5], [1, -3.4], [7, -3.4], [12.9, -3.6]].forEach(([x, y]) => makeItem(h, 'utelampa', x, y, 0, { on: true }));
  makeItem(h, 'staket', 4, -4.6, 0, { w: 8 });
  return h;
}

function apartment() {
  const h = blank('Lägenheten', 'lagenhet'), O = 0.1;
  const out = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }];
  for (let i = 0; i < 4; i++) addWall(h, out[i], out[(i + 1) % 4], { t: 0.2 });
  addRoom(h, 0, 0, 5, 4.5, 'Vardagsrum', '#b8915f');
  addRoom(h, 5, 0, 3, 4.5, 'Kök', '#cfc6b8', 'klinker');
  addRoom(h, 0, 4.5, 4, 3.5, 'Sovrum', '#a88761');
  addRoom(h, 4, 4.5, 2, 3.5, 'Hall', '#8d8d8d', 'klinker');
  addRoom(h, 6, 4.5, 2, 3.5, 'Badrum', '#d6d9dc', 'klinker');
  op(h, 'ytterdorr', 5, 8, { swing: -1 });
  op(h, 'dorr', 4, 6.25, { swing: -1 });
  op(h, 'dorr', 6, 6.25, { w: .8 });
  op(h, 'oppning', 5, 4.5, { w: 1.0 });
  op(h, 'oppning', 5, 2.25, { w: 2.0 });
  op(h, 'fonster', 2.5, 0, { w: 1.6, blind: 'persienn' });
  op(h, 'fonster', 6.5, 0, { w: 1.0 });
  op(h, 'fonster', 0, 6.25, { w: 1.2, blind: 'rullgardin' });
  makeItem(h, 'soffa', 2.5, 3.6, 180);
  makeItem(h, 'soffbord', 2.5, 2.5, 0);
  makeItem(h, 'tvbank', 2.5, O + .2, 0); makeItem(h, 'tv', 2.5, O + .03, 0, { elev: 1.0 });
  makeItem(h, 'taklampa', 2.5, 2.25, 0, { on: true });
  makeItem(h, 'kyl', 8 - O - .325, .4, 90);
  [1.0, 2.2].forEach(y => makeItem(h, 'underskap', 8 - O - .3, y, 90));
  makeItem(h, 'spis', 8 - O - .3, 1.6, 90);
  makeItem(h, 'diskho', 8 - O - .3, 2.9, 90);
  makeItem(h, 'matbord', 6.2, 3.4, 0, { w: 1.2, d: .8 });
  makeItem(h, 'taklampa', 6.5, 2.25, 0, { on: true });
  makeItem(h, 'sang', 2, 8 - O - 1.05, 180);
  makeItem(h, 'taklampa', 2, 6.25, 0);
  makeItem(h, 'toalett', 7, 8 - O - .325, 180);
  makeItem(h, 'dusch', 7.45, 5.05, 0, { w: .9, d: .9 });
  makeItem(h, 'taklampa', 5, 6.25, 0, { on: true });
  return h;
}

function cabin() {
  const h = blank('Sommarstugan', 'stuga'), O = 0.1;
  h.ceiling = 2.3;
  const out = [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 6 }, { x: 0, y: 6 }];
  for (let i = 0; i < 4; i++) addWall(h, out[i], out[(i + 1) % 4], { t: 0.2, h: 2.3, color: '#d9b48c' });
  addRoom(h, 0, 0, 7, 3.5, 'Allrum', '#d9b48c', 'tra', { h: 2.3, color: '#e6dccb' });
  addRoom(h, 0, 3.5, 4, 2.5, 'Sovrum', '#d9b48c', 'tra', { h: 2.3, color: '#e6dccb' });
  addRoom(h, 4, 3.5, 3, 2.5, 'Dusch & WC', '#cfc6b8', 'klinker', { h: 2.3, color: '#e6dccb' });
  op(h, 'fonsterdorr', 3.5, 0, { w: 1.4 });
  op(h, 'fonster', 1.2, 0, { w: 1.0 });
  op(h, 'fonster', 5.8, 0, { w: 1.0 });
  op(h, 'dorr', 2.5, 3.5);
  op(h, 'dorr', 5, 3.5, { w: .8 });
  op(h, 'fonster', 0, 4.75, { w: .9, blind: 'rullgardin' });
  op(h, 'ytterdorr', 7, 1.75);
  makeItem(h, 'soffa', 1.6, 2.6, 180, { w: 2.0, color: '#7a8fa6' });
  makeItem(h, 'matbord', 5, 1.8, 0, { w: 1.4 });
  makeItem(h, 'taklampa', 1.6, 1.6, 0, { on: true });
  makeItem(h, 'taklampa', 5, 1.8, 0, { on: true });
  makeItem(h, 'sang', 1.9, 6 - O - 1.05, 180, { d: 2.0 });
  makeItem(h, 'toalett', 6.5, 6 - O - .325, 180);
  makeItem(h, 'altan', 3.5, -1.6, 0, { w: 7, d: 2.8 });
  makeItem(h, 'utesoffa', 2, -2.2, 0);
  [[-3, -3], [10, -2], [10, 8], [-3, 8], [4, 10]].forEach(([x, y]) => makeItem(h, 'trad', x, y, 0));
  makeItem(h, 'utelampa', 6.6, -2.8, 0, { on: true });
  return h;
}
