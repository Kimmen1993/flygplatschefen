// Gör om en planritning (bild) till väggar, öppningar och rum.
// Idé: tjocka mörka streck = väggar. Tunna streck (text, möbler, fönsterlinjer) filtreras bort.
// Väggarna tunnas ut till mittlinjer, glapp mellan väggändar blir dörrar/fönster, slutna ytor blir rum.

export function detectPlan(img) {
  const kd = Math.min(1, 1400 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const W = Math.round((img.naturalWidth || img.width) * kd), H = Math.round((img.naturalHeight || img.height) * kd), N = W * H;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const dark = new Uint8Array(N), lum = new Uint8Array(N);
  for (let i = 0; i < N; i++) lum[i] = px[i * 4] * .299 + px[i * 4 + 1] * .587 + px[i * 4 + 2] * .114;
  for (let i = 0; i < N; i++) dark[i] = (px[i * 4] * .299 + px[i * 4 + 1] * .587 + px[i * 4 + 2] * .114) < 150 ? 1 : 0;
  // mörka ytor som når bildkanten (ramar, mörk bakgrund) räknas inte
  floodClear(dark, W, H);

  const r = Math.max(2, Math.round(Math.max(W, H) / 450));
  const dist = chamfer(dark, W, H);
  const core = new Uint8Array(N); for (let i = 0; i < N; i++) core[i] = dist[i] >= r + .5 ? 0 : 1; // 0 = kärna
  const toCore = chamfer(core, W, H);
  const wall = new Uint8Array(N); for (let i = 0; i < N; i++) wall[i] = dark[i] && toCore[i] <= r + 1.5 ? 1 : 0;

  // mittlinjer
  const sk = wall.slice(); thin(sk, W, H);
  let chains = trace(sk, W, H);
  // längd & tjocklek per kedja
  chains = chains.map(c => ({ pts: c.pts, a: c.a, b: c.b, len: c.pts.length, t: 2 * avg(c.pts.map(p => dist[p.y * W + p.x])) + 1 }));
  // ta bort korta utstickare vid hörn
  const deg = new Map(); const key = p => p.y * W + p.x;
  for (const c of chains) for (const e of [c.a, c.b]) deg.set(key(e), (deg.get(key(e)) || 0) + 1);
  chains = chains.filter(c => { const fa = deg.get(key(c.a)) === 1, fb = deg.get(key(c.b)) === 1;
    if (fa && fb) return c.len >= Math.max(r * 2, c.t * .6); if (fa || fb) return c.len >= Math.max(c.t * .75, r * 2); return true; });
  chains = chains.filter(c => c.len >= 2);

  // förenkla till raka segment
  let segs = [];
  for (const c of chains) { const s = dp(c.pts, Math.max(1.5, r * .9)); for (let i = 0; i < s.length - 1; i++) segs.push({ a: { ...s[i] }, b: { ...s[i + 1] }, t: c.t }); }
  segs = segs.filter(s => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > .5);

  // slå ihop närliggande ändpunkter
  const tol = r * 2.5, pts = [];
  const pointFor = p => { for (const q of pts) if (Math.hypot(q.x - p.x, q.y - p.y) < tol) { q.n++; q.x += (p.x - q.x) / q.n; q.y += (p.y - q.y) / q.n; return q; } const q = { x: p.x, y: p.y, n: 1 }; pts.push(q); return q; };
  segs = segs.map(s => ({ a: pointFor(s.a), b: pointFor(s.b), t: s.t })).filter(s => s.a !== s.b);
  // räta upp nästan vågräta/lodräta
  for (const s of segs) { const ang = Math.abs(Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x)) * 180 / Math.PI;
    if (ang < 4 || ang > 176) { const y = (s.a.y + s.b.y) / 2; s.a.y = s.b.y = y; }
    else if (Math.abs(ang - 90) < 4) { const x = (s.a.x + s.b.x) / 2; s.a.x = s.b.x = x; } }
  // slå ihop raka fortsättningar
  for (let changed = true; changed;) { changed = false;
    for (const p of pts) { const ss = segs.filter(s => s.a === p || s.b === p); if (ss.length !== 2) continue;
      const o1 = ss[0].a === p ? ss[0].b : ss[0].a, o2 = ss[1].a === p ? ss[1].b : ss[1].a;
      const a1 = Math.atan2(p.y - o1.y, p.x - o1.x), a2 = Math.atan2(o2.y - p.y, o2.x - p.x);
      let da = Math.abs(a1 - a2); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da < 5 * Math.PI / 180) { segs = segs.filter(s => s !== ss[0] && s !== ss[1]); segs.push({ a: o1, b: o2, t: (ss[0].t + ss[1].t) / 2 }); changed = true; break; } } }

  // glapp mellan fria väggändar = öppningar
  const free = [];
  for (const p of pts) { const ss = segs.filter(s => s.a === p || s.b === p); if (ss.length !== 1) continue;
    const o = ss[0].a === p ? ss[0].b : ss[0].a, L = Math.hypot(p.x - o.x, p.y - o.y); free.push({ p, d: { x: (p.x - o.x) / L, y: (p.y - o.y) / L }, t: ss[0].t }); }
  const maxGap = Math.max(W, H) * .3, cand = [];
  for (const e of free) for (const f of free) { if (e === f) continue;
    const vx = f.p.x - e.p.x, vy = f.p.y - e.p.y, L = Math.hypot(vx, vy); if (L < r * 2 || L > maxGap) continue;
    const cos = (vx * e.d.x + vy * e.d.y) / L, side = Math.abs(vx * e.d.y - vy * e.d.x), back = e.d.x * f.d.x + e.d.y * f.d.y;
    if (cos > .94 && back < -.85 && side < Math.max(e.t, f.t) * 1.5) cand.push({ e, f, L }); }
  cand.sort((a, b) => a.L - b.L); const used = new Set(), gaps = [];
  for (const c of cand) { if (used.has(c.e) || used.has(c.f)) continue; used.add(c.e); used.add(c.f); gaps.push({ a: c.e.p, b: c.f.p, t: (c.e.t + c.f.t) / 2 }); }
  // väggände som pekar mot en annan vägg (t.ex. dörr in till ett rum) – sök rakt fram
  const tSorted = segs.map(s => s.t).sort((a, b) => a - b), tThin = tSorted[Math.floor(tSorted.length * .25)] || 8;
  const maxRay = tThin * 12;
  for (const e of free) { if (used.has(e)) continue; let best = null;
    for (const s of segs) { if (s.a === e.p || s.b === e.p) continue;
      const sx = s.b.x - s.a.x, sy = s.b.y - s.a.y, den = e.d.x * sy - e.d.y * sx; if (Math.abs(den) < 1e-6) continue;
      const qx = s.a.x - e.p.x, qy = s.a.y - e.p.y, t = (qx * sy - qy * sx) / den, u = (qx * e.d.y - qy * e.d.x) / den;
      if (u < -.02 || u > 1.02 || t < r * 2 || t > maxRay) continue;
      if (!best || t < best.t) best = { t, x: e.p.x + e.d.x * t, y: e.p.y + e.d.y * t, s }; }
    if (best) { used.add(e); gaps.push({ a: e.p, b: { x: best.x, y: best.y }, t: e.t, hitWall: best.s }); } }

  // hinder = väggar + öppningar → rum
  const bc = document.createElement('canvas'); bc.width = W; bc.height = H; const bg = bc.getContext('2d', { willReadFrequently: true });
  const im = bg.createImageData(W, H); for (let i = 0; i < N; i++) { const v = wall[i] ? 0 : 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  bg.putImageData(im, 0, 0); bg.strokeStyle = '#000'; bg.lineCap = 'square';
  for (const gp of gaps) { bg.lineWidth = gp.t + 2; bg.beginPath(); bg.moveTo(gp.a.x, gp.a.y); bg.lineTo(gp.b.x, gp.b.y); bg.stroke(); }
  const bd = bg.getImageData(0, 0, W, H).data, block = new Uint8Array(N); for (let i = 0; i < N; i++) block[i] = bd[i * 4] < 128 ? 1 : 0;
  const label = new Int32Array(N); // -1 ute, 0 ej satt, >0 rum
  bfs(block, label, W, H, edgeSeeds(W, H), -1);
  const minA = Math.pow(Math.max(W, H) * .035, 2), rooms = []; let id = 0;
  for (let i = 0; i < N; i++) if (!block[i] && !label[i]) { id++; const area = bfs(block, label, W, H, [i], id);
    if (area >= minA) { const poly = contour(label, W, H, i, id); const s = dp(poly, Math.max(1.5, r * 1.2)); if (s.length >= 4) rooms.push({ pts: s.slice(0, -1), area }); } }

  // fönster eller dörr? Fönster har flera tunna linjer i glappet. Ytterväggs-glapp gränsar mot "ute".
  for (const gp of gaps) {
    const L = Math.hypot(gp.b.x - gp.a.x, gp.b.y - gp.a.y), ux = (gp.b.x - gp.a.x) / L, uy = (gp.b.y - gp.a.y) / L, nx = -uy, ny = ux;
    let runs = 0, n = 0;
    for (const f of [.3, .5, .7]) { const cx = gp.a.x + ux * L * f, cy = gp.a.y + uy * L * f; let prev = 0, rr = 0;
      for (let s = -gp.t * 1.3; s <= gp.t * 1.3; s += .5) { const x = Math.round(cx + nx * s), y = Math.round(cy + ny * s); const v = x >= 0 && y >= 0 && x < W && y < H ? lum[y * W + x] < 215 : 0; if (v && !prev) rr++; prev = v; }
      runs += rr; n++; }
    const off = gp.t + r * 3, mx = (gp.a.x + gp.b.x) / 2, my = (gp.a.y + gp.b.y) / 2;
    const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= W || y >= H ? -1 : label[y * W + x]; };
    const s1 = at(mx + nx * off, my + ny * off), s2 = at(mx - nx * off, my - ny * off);
    gp.exterior = s1 === -1 || s2 === -1; gp.runs = runs / n; gp.window = gp.exterior && runs / n >= 1.5;
  }
  return { dbg: location.hash === '#sk' ? { sk, wall, chains } : null, W, H, kd, walls: segs.map(s => ({ a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y }, t: s.t })), gaps, rooms, r };
}

// ---------- hjälpare ----------
const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
function floodClear(m, W, H) { const st = []; for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1); }
  while (st.length) { const i = st.pop(); if (!m[i]) continue; m[i] = 0; const x = i % W, y = (i / W) | 0;
    if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W); } }
function chamfer(m, W, H) { // avstånd till närmaste 0-pixel
  const d = new Float32Array(W * H), INF = 1e9, D = 1.4142;
  for (let i = 0; i < W * H; i++) d[i] = m[i] ? INF : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!d[i]) continue; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + D); if (x < W - 1) v = Math.min(v, d[i - W + 1] + D); } d[i] = v; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!d[i]) continue; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 1); if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + D); if (x > 0) v = Math.min(v, d[i + W - 1] + D); } d[i] = v; }
  return d;
}
function thin(m, W, H) { // Zhang–Suen
  const del = [];
  for (let changed = true; changed;) { changed = false;
    for (let step = 0; step < 2; step++) { del.length = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (!m[i]) continue;
        const p2 = m[i - W], p3 = m[i - W + 1], p4 = m[i + 1], p5 = m[i + W + 1], p6 = m[i + W], p7 = m[i + W - 1], p8 = m[i - 1], p9 = m[i - W - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
        const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2); if (A !== 1) continue;
        if (step === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
        del.push(i); }
      for (const i of del) m[i] = 0; if (del.length) changed = true; } }
  // ta bort trappsteg så att varje linje bara har två grannar
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (!m[i]) continue;
    const n = m[i - W], e = m[i + 1], s = m[i + W], w = m[i - 1];
    if ((n && e && !m[i + W - 1]) || (e && s && !m[i - W - 1]) || (s && w && !m[i - W + 1]) || (w && n && !m[i + W + 1])) {
      const cnt = n + e + s + w + m[i - W - 1] + m[i - W + 1] + m[i + W - 1] + m[i + W + 1]; if (cnt === 2) m[i] = 0; } }
}
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
function trace(m, W, H) {
  const nb = (x, y) => NB.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H && m[b * W + a]);
  const isNode = (x, y) => nb(x, y).length !== 2, seen = new Uint8Array(W * H), chains = [];
  const walk = (sx, sy, nx, ny) => { const pts = [{ x: sx, y: sy }]; let px = sx, py = sy, cx = nx, cy = ny;
    for (let guard = 0; guard < W * H; guard++) { pts.push({ x: cx, y: cy }); if (isNode(cx, cy)) break; seen[cy * W + cx] = 1;
      const nxt = nb(cx, cy).find(([a, b]) => !(a === px && b === py) && !(seen[b * W + a] && !isNode(a, b)));
      if (!nxt) break; px = cx; py = cy; [cx, cy] = nxt; if (cx === sx && cy === sy) { pts.push({ x: cx, y: cy }); break; } }
    return pts; };
  const doneEdge = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!m[y * W + x] || !isNode(x, y)) continue;
    for (const [a, b] of nb(x, y)) { const k = (y * W + x) + ':' + (b * W + a); if (doneEdge.has(k) || (seen[b * W + a] && !isNode(a, b))) continue;
      const pts = walk(x, y, a, b); const end = pts[pts.length - 1], prev = pts[pts.length - 2] || pts[0];
      doneEdge.add(k); doneEdge.add((end.y * W + end.x) + ':' + (prev.y * W + prev.x));
      if (pts.length > 1) chains.push({ pts, a: pts[0], b: end }); } }
  // slutna slingor utan noder
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!m[y * W + x] || seen[y * W + x] || isNode(x, y)) continue;
    seen[y * W + x] = 1; const [a, b] = nb(x, y)[0]; const pts = walk(x, y, a, b); if (pts.length > 2) chains.push({ pts, a: pts[0], b: pts[pts.length - 1] }); }
  return chains;
}
function dp(pts, eps) { if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9; let md = 0, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) { const p = pts[i]; const d = L > 1e-6 ? Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L : Math.hypot(p.x - a.x, p.y - a.y); if (d > md) { md = d; mi = i; } }
  if (md > eps) { const l = dp(pts.slice(0, mi + 1), eps), r = dp(pts.slice(mi), eps); return l.slice(0, -1).concat(r); }
  return [a, b]; }
function edgeSeeds(W, H) { const s = []; for (let x = 0; x < W; x++) s.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) s.push(y * W, y * W + W - 1); return s; }
function bfs(block, label, W, H, seeds, id) { const q = new Int32Array(W * H); let h = 0, t = 0, n = 0;
  for (const s of seeds) if (!block[s] && !label[s]) { label[s] = id; q[t++] = s; }
  while (h < t) { const i = q[h++]; n++; const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && !block[j] && !label[j]) { label[j] = id; q[t++] = j; } }
  return n; }
function contour(label, W, H, start, id) { // Moore-grannspårning
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === id;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let x = start % W, y = (start / W) | 0; const sx = x, sy = y, out = [{ x, y }]; let d = 6;
  for (let guard = 0; guard < W * H; guard++) { let found = false;
    for (let k = 0; k < 8; k++) { const nd = (d + 6 + k) % 8, [dx, dy] = dirs[nd]; if (inside(x + dx, y + dy)) { x += dx; y += dy; d = nd; found = true; break; } }
    if (!found || (x === sx && y === sy)) break; out.push({ x, y }); }
  out.push({ x: sx, y: sy }); return out; }
