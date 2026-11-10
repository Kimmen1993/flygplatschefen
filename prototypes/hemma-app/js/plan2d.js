// 2D-ritningen: rita rum/väggar, placera och dra saker, kalibrera bakgrundsbild.
import { S, home, emit, commit, proj, addWall, addRoom, findWall, snapToWall, makeItem, makeOpening, movePoint,
  polyArea, centroid, inPoly, wallLen } from './store.js';
import { ITEMS, OPENINGS } from './catalog.js';

export function createPlan(canvas, ui) {
  const ctx = canvas.getContext('2d');
  let scale = 40, ox = 0, oy = 0, dpr = 1;
  const ts = p => ({ x: p.x * scale + ox, y: p.y * scale + oy });
  const tw = (sx, sy) => ({ x: (sx - ox) / scale, y: (sy - oy) / scale });
  let drag = null, mouse = null, chain = null, rect = null, ghost = null, calib = null;
  const bgImg = new Image(); let bgSrc = null;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr; draw();
  }
  function fit() {
    const h = home(); const pts = [...h.walls.flatMap(w => [w.a, w.b]), ...h.rooms.flatMap(r => r.pts)];
    let x0 = 0, y0 = 0, x1 = 10, y1 = 8;
    if (pts.length) { x0 = Math.min(...pts.map(p => p.x)); x1 = Math.max(...pts.map(p => p.x)); y0 = Math.min(...pts.map(p => p.y)); y1 = Math.max(...pts.map(p => p.y)); }
    const W = canvas.clientWidth, H = canvas.clientHeight; if (!W || !H) return;
    scale = Math.max(8, Math.min(W / (x1 - x0 + 3), H / (y1 - y0 + 3), 120));
    ox = W / 2 - (x0 + x1) / 2 * scale; oy = H / 2 - (y0 + y1) / 2 * scale; draw();
  }

  // ---------- snäpp ----------
  function snap(p, step = 0.1) {
    const h = home(), R = 12 / scale;
    for (const w of h.walls) for (const q of [w.a, w.b]) if (Math.hypot(q.x - p.x, q.y - p.y) < R) return { ...q, snapped: true };
    for (const r of h.rooms) for (const q of r.pts) if (Math.hypot(q.x - p.x, q.y - p.y) < R) return { ...q, snapped: true };
    return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
  }
  function ortho(from, p) {
    const dx = p.x - from.x, dy = p.y - from.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dy) < Math.abs(dx) * 0.14) return { x: p.x, y: from.y };
    if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dx) < Math.abs(dy) * 0.14) return { x: from.x, y: p.y };
    return p;
  }

  // ---------- träff ----------
  function hitItem(p) {
    const h = home(); const list = [...h.items].sort((a, b) => (b.elev + b.h) - (a.elev + a.h));
    for (const it of list) {
      const a = -it.rot * Math.PI / 180, dx = p.x - it.x, dy = p.y - it.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= Math.max(it.w, .2) / 2 && Math.abs(ly) <= Math.max(it.d, .2) / 2) return it;
    }
  }
  function hitOpening(p) {
    const h = home();
    for (const o of h.openings) { const w = h.walls.find(w => w.id === o.wall); if (!w) continue;
      const pr = proj(p, w.a, w.b); if (Math.abs(pr.d) < w.t / 2 + .15 && Math.abs(pr.t - o.t) < o.w / 2) return o; }
  }
  function hitWall(p) { const f = findWall(home(), p, 0.25); return f && f.d < f.wall.t / 2 + .1 ? f.wall : null; }
  function hitHandle(p) {
    const h = home(), sel = S.sel; if (!sel || sel.type !== 'wall') return null;
    const w = h.walls.find(w => w.id === sel.id); if (!w) return null;
    for (const q of [w.a, w.b]) if (Math.hypot(q.x - p.x, q.y - p.y) < 10 / scale) return q;
  }
  function hitRoom(p) { const h = home(); return [...h.rooms].reverse().find(r => inPoly(p, r.pts)); }

  // ---------- rita ----------
  function draw() {
    const h = home(); if (!h) return;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f2238'; ctx.fillRect(0, 0, W, H);
    // bakgrundsbild
    if (h.bg) {
      if (bgSrc !== h.bg.src) { bgSrc = h.bg.src; bgImg.src = h.bg.src; bgImg.onload = draw; }
      if (bgImg.complete && bgImg.naturalWidth) {
        const p = ts(h.bg); ctx.globalAlpha = h.bg.opacity ?? .5;
        ctx.drawImage(bgImg, p.x, p.y, bgImg.naturalWidth * h.bg.mpp * scale, bgImg.naturalHeight * h.bg.mpp * scale); ctx.globalAlpha = 1;
      }
    }
    // rutnät
    const step = scale > 60 ? .1 : scale > 20 ? .5 : 1;
    const a = tw(0, 0), b = tw(W, H);
    ctx.lineWidth = 1;
    for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) { const sx = Math.round(x * scale + ox) + .5;
      ctx.strokeStyle = Math.abs(x - Math.round(x)) < 1e-6 ? 'rgba(156,200,255,.14)' : 'rgba(156,200,255,.05)'; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke(); }
    for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) { const sy = Math.round(y * scale + oy) + .5;
      ctx.strokeStyle = Math.abs(y - Math.round(y)) < 1e-6 ? 'rgba(156,200,255,.14)' : 'rgba(156,200,255,.05)'; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke(); }
    // rum
    for (const r of h.rooms) {
      const sel = S.sel?.type === 'room' && S.sel.id === r.id;
      ctx.beginPath(); r.pts.forEach((q, i) => { const s = ts(q); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath();
      ctx.fillStyle = hexA(r.floor, sel ? .5 : .28); ctx.fill();
      if (sel) { ctx.strokeStyle = '#ff7a2f'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    // saker (golv först)
    const items = [...h.items].sort((a, b) => a.elev - b.elev);
    for (const it of items) drawItem(it, S.sel?.type === 'item' && S.sel.id === it.id);
    // väggar
    for (const w of h.walls) drawWall(h, w);
    // rumsnamn
    ctx.textAlign = 'center';
    for (const r of h.rooms) { const c = ts(centroid(r.pts));
      ctx.font = '600 13px system-ui'; ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText(r.name, c.x + 1, c.y - 3);
      ctx.fillStyle = '#e6f0ff'; ctx.fillText(r.name, c.x, c.y - 4);
      ctx.font = '11px system-ui'; ctx.fillStyle = '#9cc8ff'; ctx.fillText(polyArea(r.pts).toFixed(1).replace('.', ',') + ' m²', c.x, c.y + 11); }
    // mått på väggar
    const cx = h.walls.length ? centroid(h.walls.flatMap(w => [w.a, w.b])) : { x: 0, y: 0 };
    ctx.font = '11px system-ui';
    for (const w of h.walls) {
      const L = wallLen(w); if (L * scale < 45) continue;
      const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }, ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
      let nx = -uy, ny = ux; if ((m.x - cx.x) * nx + (m.y - cx.y) * ny < 0) { nx = -nx; ny = -ny; }
      const off = w.t / 2 + 12 / scale, s = ts({ x: m.x + nx * off, y: m.y + ny * off });
      let ang = Math.atan2(uy, ux); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang); ctx.fillStyle = '#9cc8ff'; ctx.fillText(L.toFixed(2).replace('.', ',') + ' m', 0, 4); ctx.restore();
    }
    // verktygs-förhandsvisning
    if (rect) { const p0 = ts(rect.a), p1 = ts(rect.b); ctx.strokeStyle = '#ff7a2f'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y); ctx.setLineDash([]);
      label(`${Math.abs(rect.b.x - rect.a.x).toFixed(1)} × ${Math.abs(rect.b.y - rect.a.y).toFixed(1)} m`, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2); }
    if (chain && mouse) { const last = chain[chain.length - 1], p = ortho(last, snap(mouse)), s0 = ts(last), s1 = ts(p);
      ctx.strokeStyle = '#ff7a2f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
      label(Math.hypot(p.x - last.x, p.y - last.y).toFixed(2).replace('.', ',') + ' m', (s0.x + s1.x) / 2, (s0.y + s1.y) / 2 - 14); }
    if (ghost) drawGhost();
    if (calib?.p1) { const s = ts(calib.p1); dot(s, '#ff7a2f'); if (mouse) { const m = ts(mouse); ctx.strokeStyle = '#ff7a2f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(m.x, m.y); ctx.stroke(); } }
    if (S.tool === 'wall' && mouse && !chain) { const p = snap(mouse); dot(ts(p), p.snapped ? '#7bd88f' : '#ff7a2f'); }
  }
  function label(t, x, y) { ctx.font = '600 12px system-ui'; const w = ctx.measureText(t).width + 12;
    ctx.fillStyle = 'rgba(10,14,10,.85)'; ctx.fillRect(x - w / 2, y - 10, w, 20); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(t, x, y + 4); }
  function dot(s, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, 7); ctx.fill(); }

  function drawWall(h, w) {
    const L = wallLen(w); if (L < .01) return;
    const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, nx = -uy, ny = ux, t2 = w.t / 2;
    const ops = h.openings.filter(o => o.wall === w.id).sort((a, b) => a.t - b.t);
    const sel = S.sel?.type === 'wall' && S.sel.id === w.id;
    const seg = (s, e, fill) => { const P = (t, d) => ts({ x: w.a.x + ux * t + nx * d, y: w.a.y + uy * t + ny * d });
      const q = [P(s, -t2), P(e, -t2), P(e, t2), P(s, t2)]; ctx.beginPath(); q.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); };
    let cur = -t2;
    const wallFill = sel ? '#ff9a5c' : '#eaf3ff';
    for (const o of ops) { const s = o.t - o.w / 2, e = o.t + o.w / 2; if (s > cur) seg(cur, s, wallFill); cur = Math.max(cur, e); }
    if (L + t2 > cur) seg(cur, L + t2, wallFill);
    for (const o of ops) {
      const os = S.sel?.type === 'opening' && S.sel.id === o.id, col = os ? '#ff7a2f' : '#9cc8ff';
      const P = (t, d) => ts({ x: w.a.x + ux * t + nx * d, y: w.a.y + uy * t + ny * d });
      ctx.strokeStyle = col; ctx.lineWidth = os ? 2.5 : 1.3;
      if (o.kind === 'window') {
        seg(o.t - o.w / 2, o.t + o.w / 2, os ? 'rgba(255,122,47,.25)' : 'rgba(156,200,255,.18)');
        for (const d of [-t2, 0, t2]) { const p0 = P(o.t - o.w / 2, d), p1 = P(o.t + o.w / 2, d); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
        if (o.blind !== 'none') { const p0 = P(o.t - o.w / 2, (t2 + .05) * insideSign(h, w, o)), p1 = P(o.t + o.w / 2, (t2 + .05) * insideSign(h, w, o));
          ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.setLineDash([]); }
      } else if (o.kind === 'door') {
        const hingeT = o.hinge === 'L' ? o.t - o.w / 2 : o.t + o.w / 2, other = o.hinge === 'L' ? o.t + o.w / 2 : o.t - o.w / 2, sd = o.swing;
        const hp = P(hingeT, 0), tip = P(hingeT, sd * o.w), op = P(other, 0);
        ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
        const a0 = Math.atan2(tip.y - hp.y, tip.x - hp.x), a1 = Math.atan2(op.y - hp.y, op.x - hp.x);
        let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, o.w * scale, a0, a1, da < 0); ctx.stroke();
        if (o.state?.open > .5) { ctx.fillStyle = '#ff6b5b'; const c = P(o.t, 0); ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, 7); ctx.fill(); }
      } else if (o.kind === 'garage') {
        ctx.setLineDash([6, 4]); const p0 = P(o.t - o.w / 2, 0), p1 = P(o.t + o.w / 2, 0); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.setLineDash([]);
      } else if (os) { seg(o.t - o.w / 2, o.t + o.w / 2, 'rgba(255,122,47,.25)'); }
    }
    if (sel) for (const q of [w.a, w.b]) { const s = ts(q); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ff7a2f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, 7); ctx.fill(); ctx.stroke(); }
  }

  function drawItem(it, sel, alpha = 1) {
    const c = ITEMS[it.type], s = ts(it);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(it.rot * Math.PI / 180); ctx.globalAlpha = alpha;
    const w = it.w * scale, d = it.d * scale;
    if (c.dev === 'light' && it.state?.on) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 1.6); g.addColorStop(0, `rgba(255,190,100,${.45 * it.state.bri + .1})`); g.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, scale * 1.6, 0, 7); ctx.fill();
    }
    if (c.ceil || c.dev === 'light') {
      ctx.fillStyle = it.state?.on ? '#ffc061' : 'rgba(0,0,0,.25)'; ctx.strokeStyle = '#ffc061'; ctx.lineWidth = 1.6;
      if (it.type === 'ledlist') { ctx.fillRect(-w / 2, -3, w, 6); ctx.strokeRect(-w / 2, -3, w, 6); }
      else { const r = Math.max(6, Math.min(w, d) / 2.5); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * .7, -r * .7); ctx.lineTo(r * .7, r * .7); ctx.moveTo(r * .7, -r * .7); ctx.lineTo(-r * .7, r * .7); ctx.stroke(); }
    } else {
      ctx.fillStyle = hexA(it.color, it.type === 'matta' || it.type === 'altan' || it.type === 'gang' ? .55 : .9);
      ctx.strokeStyle = 'rgba(200,225,255,.75)'; ctx.lineWidth = 1;
      roundRect(-w / 2, -d / 2, w, d, Math.min(4, w / 4, d / 4)); ctx.fill(); ctx.stroke();
      // fronten
      if (it.d > .05 && !['matta', 'altan', 'gang', 'pool', 'trad', 'buske', 'vaxt'].includes(it.type)) {
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w / 2 + 2, d / 2 - 2); ctx.lineTo(w / 2 - 2, d / 2 - 2); ctx.stroke(); }
      if (it.type === 'sang' || it.type === 'sang90') { ctx.fillStyle = hexA(it.color2 || '#fff', .95); ctx.fillRect(-w / 2 + 2, -d / 2 + d * .3, w - 4, d * .68);
        ctx.fillStyle = '#fff'; const n = it.w > 1.2 ? 2 : 1; for (let i = 0; i < n; i++) ctx.fillRect(-w / 2 + 4 + i * (w - 8) / n + 2, -d / 2 + 4, (w - 8) / n - 4, d * .16); }
      const fs = Math.min(w, d) * .6;
      if (fs > 11) { ctx.font = `${Math.min(fs, 26)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.rotate(-it.rot * Math.PI / 180);
        ctx.globalAlpha = alpha * .9; ctx.fillText(c.icon, 0, 1); ctx.textBaseline = 'alphabetic'; }
    }
    ctx.restore();
    if (sel) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(it.rot * Math.PI / 180); ctx.strokeStyle = '#ff7a2f'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
      ctx.strokeRect(-Math.max(w, 10) / 2 - 3, -Math.max(d, 10) / 2 - 3, Math.max(w, 10) + 6, Math.max(d, 10) + 6); ctx.setLineDash([]); ctx.restore(); }
  }
  function drawGhost() {
    const h = home();
    if (ghost.item) drawItem(ghost.item, false, .55);
    if (ghost.opening) { const { wall, t, w } = ghost.opening; const L = wallLen(wall), ux = (wall.b.x - wall.a.x) / L, uy = (wall.b.y - wall.a.y) / L;
      const p0 = ts({ x: wall.a.x + ux * (t - w / 2), y: wall.a.y + uy * (t - w / 2) }), p1 = ts({ x: wall.a.x + ux * (t + w / 2), y: wall.a.y + uy * (t + w / 2) });
      ctx.strokeStyle = '#ff7a2f'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------- mus ----------
  const pos = e => { const r = canvas.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const { sx, sy } = pos(e), p = tw(sx, sy), h = home();
    if (e.button === 1 || e.button === 2) { drag = { pan: true, sx, sy, ox, oy }; return; }
    if (S.placing) { place(p, e.shiftKey); return; }
    if (S.tool === 'room') { const q = snap(p); rect = { a: q, b: q }; return; }
    if (S.tool === 'wall') {
      const q = chain ? ortho(chain[chain.length - 1], snap(p)) : snap(p);
      if (!chain) { chain = [q]; draw(); return; }
      const last = chain[chain.length - 1];
      if (Math.hypot(q.x - last.x, q.y - last.y) < .05) { chain = null; draw(); return; }
      commit(); addWall(h, last, q); chain.push(q);
      if (Math.hypot(q.x - chain[0].x, q.y - chain[0].y) < .01) chain = null;
      emit('full'); return;
    }
    if (S.tool === 'bild') { bgDown(p, sx, sy); return; }
    // välj
    const hd = hitHandle(p); if (hd) { commit(); drag = { end: { ...hd } }; return; }
    const it = hitItem(p);
    if (it) { commit(); select({ type: 'item', id: it.id }); drag = { item: it, dx: p.x - it.x, dy: p.y - it.y, moved: false }; return; }
    const o = hitOpening(p); if (o) { commit(); select({ type: 'opening', id: o.id }); drag = { opening: o }; return; }
    const w = hitWall(p); if (w) { commit(); select({ type: 'wall', id: w.id }); drag = { wall: w, start: p, a: { ...w.a }, b: { ...w.b } }; return; }
    const r = hitRoom(p); select(r ? { type: 'room', id: r.id } : null);
    drag = { pan: true, sx, sy, ox, oy };
  });
  canvas.addEventListener('pointermove', e => {
    const { sx, sy } = pos(e), p = tw(sx, sy), h = home(); mouse = p;
    if (drag?.pan) { ox = drag.ox + sx - drag.sx; oy = drag.oy + sy - drag.sy; draw(); ui.onPan?.(); return; }
    if (rect) { rect.b = snap(p); draw(); return; }
    if (drag?.item) {
      const it = drag.item; let q = { x: Math.round((p.x - drag.dx) / .05) * .05, y: Math.round((p.y - drag.dy) / .05) * .05 };
      if (ITEMS[it.type].snap && !e.altKey) { const sw = snapToWall(h, it, q); if (sw) { q = sw; it.rot = sw.rot; } }
      it.x = q.x; it.y = q.y; drag.moved = true; emit('item', it.id); return;
    }
    if (drag?.opening) { const o = drag.opening, w = h.walls.find(w => w.id === o.wall); const pr = proj(p, w.a, w.b);
      o.t = Math.round(Math.min(Math.max(pr.t, o.w / 2), pr.L - o.w / 2) / .05) * .05; emit('full', 'drag'); return; }
    if (drag?.wall) { const dx = Math.round((p.x - drag.start.x) / .05) * .05, dy = Math.round((p.y - drag.start.y) / .05) * .05;
      const w = drag.wall; movePoint(h, w.a, { x: drag.a.x + dx, y: drag.a.y + dy }); movePoint(h, w.b, { x: drag.b.x + dx, y: drag.b.y + dy }); emit('full', 'drag'); return; }
    if (drag?.end) { const q = snap(p, .05); const to = { x: q.x, y: q.y }; movePoint(h, drag.end, to); drag.end = to; emit('full', 'drag'); return; }
    if (drag?.bg) { h.bg.x = drag.bx + p.x - drag.p.x; h.bg.y = drag.by + p.y - drag.p.y; draw(); return; }
    // spöke vid placering
    if (S.placing) updateGhost(p, e.altKey);
    canvas.style.cursor = S.placing || S.tool !== 'select' ? 'crosshair' : (hitHandle(p) || hitItem(p) || hitOpening(p) || hitWall(p)) ? 'move' : 'default';
    if (chain || S.tool === 'wall' || calib) draw();
  });
  canvas.addEventListener('pointerup', () => {
    const h = home();
    if (rect) { const x0 = Math.min(rect.a.x, rect.b.x), y0 = Math.min(rect.a.y, rect.b.y), w = Math.abs(rect.b.x - rect.a.x), d = Math.abs(rect.b.y - rect.a.y);
      rect = null;
      if (w >= .5 && d >= .5) { commit(); const r = addRoom(h, x0, y0, w, d, 'Rum ' + (h.rooms.length + 1)); S.sel = { type: 'room', id: r.id }; emit('full'); ui.toolDone?.(); }
      else draw(); return; }
    if (drag && !drag.pan && !drag.bg) emit('full');
    if (drag?.bg) emit('full');
    drag = null;
  });
  canvas.addEventListener('dblclick', () => { if (chain) { chain = null; draw(); } });
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); const { sx, sy } = pos(e), p = tw(sx, sy);
    scale = Math.min(300, Math.max(8, scale * Math.exp(-e.deltaY * .0015))); ox = sx - p.x * scale; oy = sy - p.y * scale; draw();
  }, { passive: false });

  function select(sel) { S.sel = sel; emit('sel'); }

  function updateGhost(p, alt) {
    const h = home(), pl = S.placing;
    if (pl.kind === 'item') {
      const c = ITEMS[pl.key], it = { type: pl.key, x: p.x, y: p.y, rot: pl.rot || 0, w: c.w, d: c.d, h: c.h, elev: c.elev || 0, color: c.color, color2: c.color2, state: c.dev ? { on: true, bri: .8 } : null };
      if (c.snap && !alt) { const sw = snapToWall(h, it, p); if (sw) Object.assign(it, sw); }
      ghost = { item: it };
    } else { const f = findWall(h, p, .5), c = OPENINGS[pl.key];
      ghost = f ? { opening: { wall: f.wall, t: Math.min(Math.max(f.t, c.w / 2), wallLen(f.wall) - c.w / 2), w: c.w } } : null; }
    draw();
  }
  function place(p, keep) {
    const h = home(), pl = S.placing; updateGhost(p, false);
    if (pl.kind === 'item' && ghost?.item) { commit(); const g = ghost.item; const it = makeItem(h, pl.key, Math.round(g.x * 100) / 100, Math.round(g.y * 100) / 100, g.rot);
      if (it.state) it.state.on = true; S.sel = { type: 'item', id: it.id }; }
    else if (pl.kind === 'opening' && ghost?.opening) { commit(); const o = makeOpening(h, pl.key, ghost.opening.wall, Math.round(ghost.opening.t * 20) / 20); S.sel = { type: 'opening', id: o.id }; }
    else { ui.toast?.('Klicka på en vägg'); return; }
    if (!keep) { S.placing = null; ghost = null; }
    emit('full'); ui.toolDone?.();
  }

  // ---------- bakgrundsbild ----------
  function bgDown(p) {
    const h = home(); if (!h.bg) return;
    if (calib) {
      if (!calib.p1) { calib.p1 = p; draw(); return; }
      const d = Math.hypot(p.x - calib.p1.x, p.y - calib.p1.y);
      const real = parseFloat((prompt('Hur långt är det mellan punkterna i verkligheten? (meter)', d.toFixed(2)) || '').replace(',', '.'));
      if (real > 0 && d > 0) { commit(); const k = real / d, p1 = calib.p1;
        h.bg.x = p1.x - (p1.x - h.bg.x) * k; h.bg.y = p1.y - (p1.y - h.bg.y) * k; h.bg.mpp *= k; ui.toast?.('Bilden har rätt skala nu ✔'); }
      calib = null; emit('full'); return;
    }
    commit(); drag = { bg: true, p, bx: h.bg.x, by: h.bg.y };
  }

  return {
    draw, resize, fit,
    cancel() { chain = null; rect = null; ghost = null; calib = null; draw(); },
    calibrate() { calib = {}; draw(); },
    zoom(f) { const W = canvas.clientWidth / 2, H = canvas.clientHeight / 2, p = tw(W, H); scale = Math.min(300, Math.max(8, scale * f)); ox = W - p.x * scale; oy = H - p.y * scale; draw(); },
  };
}

export function insideSign(h, w, o) {
  const L = wallLen(w), ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, nx = -uy, ny = ux;
  const c = { x: w.a.x + ux * o.t, y: w.a.y + uy * o.t }, off = w.t / 2 + .3;
  const a = h.rooms.some(r => inPoly({ x: c.x + nx * off, y: c.y + ny * off }, r.pts));
  const b = h.rooms.some(r => inPoly({ x: c.x - nx * off, y: c.y - ny * off }, r.pts));
  return a && !b ? 1 : b && !a ? -1 : 1;
}
export function hexA(hex, a) { const n = parseInt((hex || '#888888').slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
