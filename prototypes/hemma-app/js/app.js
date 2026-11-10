// Hemma – kopplar ihop ritning, 3D, panelerna och smarta hemmet.
import { S, home, emit, on, load, save, commit, undo, redo, clearHistory, template, uid, movePoint, wallLen, nameOf, polyArea, roomAt, makeItem } from './store.js';
import { CATS, ITEMS, OPENINGS, PALETTE, FLOORS, HOME_TYPES } from './catalog.js';
import { createPlan } from './plan2d.js';
import { createView } from './view3d.js';
import { createHA } from './ha.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT = 0;
window.toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); };

load();
const ui = { toast: window.toast, toolDone() { if (!S.placing && (S.tool === 'add' || S.tool === 'room')) S.tool = 'select'; renderToolbar(); renderRight(); hint(); } };
const plan = createPlan($('#plan'), ui);
const view = createView($('#pane3d'), { device: onDevice, toast: window.toast, toolDone: ui.toolDone });
const ha = createHA({ onState: haState, onStatus: (s, msg) => { renderSide(); if (msg) window.toast(msg); if (s === 'on') { window.toast('Ansluten till Home Assistant ✔'); renderRight(); } } });
let catTab = 'oppningar';

// ---------- händelser från datan ----------
let stateT = 0;
on((kind, id) => {
  if (kind === 'item') { plan.draw(); view.syncItem(id); return; }
  if (kind === 'state') { plan.draw(); view.states(); cancelAnimationFrame(stateT); stateT = requestAnimationFrame(() => { if (S.mode === 'styr') renderRight(); }); return; }
  if (kind === 'sel') { plan.draw(); view.highlight(); renderRight(); return; }
  plan.draw(); view.build();
  if (id !== 'panel' && id !== 'drag') renderRight();
  if (id !== 'drag') { renderSide(); $('#homeName').value = home().name; }
});

// ---------- sidomeny ----------
function renderSide() {
  const h = home();
  $('#side').innerHTML = `
    <div class="logo">HEMMA</div><div class="sub">MINA HEM · KONTROLLRUM</div>
    <div class="sec">LÄGE</div>
    <div class="modes"><button class="mode ${S.mode === 'styr' ? 'on' : ''}" data-mode="styr"><b>🏠</b>Styr</button><button class="mode ${S.mode === 'bygg' ? 'on' : ''}" data-mode="bygg"><b>✏️</b>Bygg</button></div>
    <div class="sec">MINA HEM</div>
    ${S.homes.map(x => `<button class="nav ${x.id === h.id ? 'on' : ''}" data-home="${x.id}"><i>${HOME_TYPES[x.type]?.icon || '🏡'}</i><span>${esc(x.name)}</span><span class="x" data-del="${x.id}">✕</span></button>`).join('')}
    <button class="nav" data-new><i>＋</i>Nytt hem</button>
    <div class="sec hidem">KOPPLAT</div>
    <div class="sys hidem" data-ha>Home Assistant <span class="dot ${ha.status}"></span></div>
    <div class="note hidem" style="padding:0 10px 6px">Apple Home, Homey, Hue, IKEA, Sonos… kopplas in via Home Assistant.</div>
    <div class="sec hidem">FIL</div>
    <button class="small hidem" data-export>⬇ Spara som fil</button>
    <button class="small hidem" data-import>⬆ Öppna fil</button>`;
}
$('#side').addEventListener('click', e => {
  const t = e.target.closest('[data-mode],[data-home],[data-new],[data-ha],[data-export],[data-import],[data-del]'); if (!t) return;
  if (t.dataset.del) { e.stopPropagation(); if (S.homes.length < 2) return window.toast('Du behöver minst ett hem');
    const x = S.homes.find(h => h.id === t.dataset.del); if (confirm(`Ta bort "${x.name}"?`)) { S.homes = S.homes.filter(h => h !== x); if (S.cur === x.id) switchHome(S.homes[0].id); else emit('full'); } return; }
  if (t.dataset.mode) setMode(t.dataset.mode);
  else if (t.dataset.home) switchHome(t.dataset.home);
  else if (t.hasAttribute('data-new')) newHomeDialog();
  else if (t.hasAttribute('data-ha')) haDialog();
  else if (t.hasAttribute('data-export')) exportHome();
  else if (t.hasAttribute('data-import')) $('#fileJson').click();
});
function switchHome(id) { S.cur = id; S.sel = null; S.placing = null; clearHistory(); emit('full'); view.buildNow(); view.fitCam(); plan.fit(); }
function setMode(m) {
  S.mode = m; S.sel = null; S.placing = null; S.tool = 'select'; plan.cancel();
  if (m === 'styr') { S.cut = true; S.day = false; } else { S.day = true; if (!S._seenBygg) S.view = innerWidth < 980 ? '2d' : 'split'; }
  S._seenBygg = S._seenBygg || m === 'bygg';
  renderAll(); view.build(); setTimeout(() => plan.fit(), 60);
}

// ---------- topp & verktyg ----------
$('#homeName').addEventListener('change', e => { commit(); home().name = e.target.value.trim() || 'Mitt hem'; emit('full'); });
function renderTop() {
  const h = home();
  $('#crumb').textContent = `HEMMA / ${(HOME_TYPES[h.type]?.name || 'Hus').toUpperCase()} / ${S.mode === 'styr' ? 'STYR' : 'BYGG'}`;
  $('#homeName').value = h.name;
  $('#topRight').innerHTML = `
    ${S.mode === 'bygg' ? `<div class="seg">${[['2d', '📐 2D'], ['split', '◫ Båda'], ['3d', '🧊 3D']].map(([k, l]) => `<button data-view="${k}" class="${S.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <button class="ib ${S.cut ? 'on' : ''}" data-cut title="Låga väggar så man ser in">${S.cut ? '🏠 Låga väggar' : '🏠 Hela väggar'}</button>
    <button class="ib" data-day>${S.day ? '☀️ Dag' : '🌙 Kväll'}</button>
    <button class="ib" data-cam title="Centrera">⤢</button>`;
  $('#stage').dataset.view = S.mode === 'styr' ? '3d' : S.view;
  requestAnimationFrame(() => { plan.resize(); view.resize(); });
}
$('#topRight').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.view) { S.view = t.dataset.view; renderTop(); requestAnimationFrame(() => plan.fit()); }
  if (t.hasAttribute('data-cut')) { S.cut = !S.cut; renderTop(); view.build(); }
  if (t.hasAttribute('data-day')) { S.day = !S.day; renderTop(); view.setLighting(); }
  if (t.hasAttribute('data-cam')) { view.fitCam(); plan.fit(); }
});
const TOOLS = [['select', '✋', 'Välj'], ['room', '⬜', 'Rum'], ['wall', '🧱', 'Vägg'], ['add', '🛋️', 'Lägg till'], ['bild', '🖼️', 'Bild']];
function renderToolbar() {
  if (S.mode !== 'bygg') { $('#toolbar').innerHTML = ''; return; }
  const cur = S.placing ? 'add' : S.tool;
  $('#toolbar').innerHTML = TOOLS.map(([k, i, l]) => `<button class="tool ${cur === k ? 'on' : ''}" data-tool="${k}">${i}<small>${l}</small></button>`).join('') +
    `<span class="sep"></span><button class="tool" data-undo>↶<small>Ångra</small></button><button class="tool" data-redo>↷<small>Gör om</small></button>`;
}
$('#toolbar').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.hasAttribute('data-undo')) return undo();
  if (t.hasAttribute('data-redo')) return redo();
  setTool(t.dataset.tool);
});
function setTool(k) {
  S.tool = k; S.placing = null; plan.cancel(); S.sel = null;
  if ((k === 'room' || k === 'wall' || k === 'bild') && S.view === '3d') { S.view = 'split'; renderTop(); }
  if (k === 'bild' && !home().bg) $('#fileImg').click();
  renderToolbar(); renderRight(); hint(); emit('sel');
}
function hint() {
  const H = {
    select: '✋ Klicka för att välja · dra för att flytta · R = vrid · Delete = ta bort',
    room: '⬜ Dra en rektangel i ritningen = nytt rum med väggar',
    wall: '🧱 Klicka punkt för punkt i ritningen · dubbelklicka eller Esc = klar',
    add: '🛋️ Välj något i listan till höger',
    bild: '🖼️ Dra bilden på plats · kalibrera med ett mått du vet',
  };
  let t = S.mode === 'styr' ? '👆 Klicka på lampor, dörrar, gardiner och TV i huset · klicka på ett golv = rummets lampor'
    : S.placing ? (S.placing.kind === 'item' ? '👆 Klicka där den ska stå · Shift = flera · Alt = inte mot vägg' : '👆 Klicka på en vägg') : H[S.tool];
  $('#hint').textContent = t;
}
$('#zoom2d').addEventListener('click', e => { const z = e.target.dataset.z; if (!z) return; z === 'fit' ? plan.fit() : plan.zoom(+z); });

// ---------- högerpanel ----------
function renderRight() {
  const el = $('#right');
  if (S.mode === 'styr') { el.innerHTML = controlPanel(); return; }
  if (S.tool === 'bild') { el.innerHTML = bgPanel(); return; }
  if (S.tool === 'add' || S.placing) { el.innerHTML = catalogPanel(); return; }
  const h = home(), s = S.sel;
  if (s?.type === 'item') { const it = h.items.find(i => i.id === s.id); if (it) { el.innerHTML = itemPanel(it); fillEnts(); return; } }
  if (s?.type === 'opening') { const o = h.openings.find(i => i.id === s.id); if (o) { el.innerHTML = openingPanel(o); fillEnts(); return; } }
  if (s?.type === 'wall') { const w = h.walls.find(i => i.id === s.id); if (w) { el.innerHTML = wallPanel(w); return; } }
  if (s?.type === 'room') { const r = h.rooms.find(i => i.id === s.id); if (r) { el.innerHTML = roomPanel(r); return; } }
  el.innerHTML = homePanel();
}
function fillEnts() { $('#ents').innerHTML = ha.entities().map(e => `<option value="${e}">${esc(ha.state(e)?.attributes?.friendly_name || '')}</option>`).join(''); }
const cm = v => Math.round(v * 100);
const field = (label, f, val, type = 'cm') => `<label class="f">${label}<input data-f="${f}" data-u="${type}" value="${type === 'cm' ? cm(val) : esc(val)}" ${type === 'cm' || type === 'num' ? 'inputmode="decimal"' : ''}></label>`;
const swatches = (f, cur) => `<div class="sws">${PALETTE.map(c => `<button class="swc ${c === cur ? 'on' : ''}" style="background:${c}" data-color="${c}" data-f="${f}"></button>`).join('')}<input type="color" data-f="${f}" data-u="color" value="${cur || '#ffffff'}"></div>`;
const opt = (f, cur, list) => `<div class="opt">${list.map(([v, l]) => `<button data-opt="${f}" data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

function homePanel() {
  const h = home();
  return `<h2>${HOME_TYPES[h.type]?.icon || '🏡'} ${esc(h.name)}</h2>
    <div class="tips">
      <div><b>⬜</b>Rita rum: välj Rum och dra en ruta</div>
      <div><b>🛋️</b>Lägg till: dörrar, fönster, kök, möbler, lampor</div>
      <div><b>✋</b>Klicka på något för att ändra mått och färg</div>
      <div><b>🖼️</b>Har du en planritning? Lägg in den som bild och rita ovanpå</div>
    </div>
    <h3>HEMMET</h3>
    <label class="f">Typ</label>${opt('home.type', h.type, Object.entries(HOME_TYPES).map(([k, v]) => [k, v.icon + ' ' + v.name]))}
    <div style="height:10px"></div>
    <label class="f">Takhöjd (cm)<input data-f="home.ceiling" data-u="cm" value="${cm(h.ceiling)}"></label>
    <div class="note">${h.rooms.length} rum · ${h.rooms.reduce((s, r) => s + polyArea(r.pts), 0).toFixed(0)} m² · ${h.items.length} saker</div>`;
}
function catalogPanel() {
  const list = catTab === 'oppningar' ? Object.entries(OPENINGS).map(([k, v]) => ['opening', k, v]) : Object.entries(ITEMS).filter(([, v]) => v.cat === catTab).map(([k, v]) => ['item', k, v]);
  return `<h2>🛋️ Lägg till</h2>
    <div class="chips">${CATS.map(([k, n, i]) => `<button class="chip ${catTab === k ? 'on' : ''}" data-cat="${k}">${i} ${n}</button>`).join('')}</div>
    <div class="grid">${list.map(([kind, k, v]) => `<button class="cat ${S.placing?.key === k ? 'on' : ''}" data-place="${kind}:${k}"><b>${v.icon}</b>${v.name}</button>`).join('')}</div>
    <p class="note">Välj, klicka sedan i ritningen eller i 3D. Skåp, sängar, TV m.m. lägger sig automatiskt mot väggen.</p>`;
}
function itemPanel(it) {
  const c = ITEMS[it.type];
  return `<h2>${c.icon} ${esc(c.name)}</h2>
    ${field('Namn (valfritt)', 'name', it.name, 'text')}
    <div class="g2">${field('Bredd (cm)', 'w', it.w)}${field('Djup (cm)', 'd', it.d)}${field('Höjd (cm)', 'h', it.h)}${field('Över golvet (cm)', 'elev', it.elev)}</div>
    <label class="f">Vrid</label><div class="btns" style="margin-bottom:10px"><button class="btn" data-act="rot-90">⟲ 90°</button><button class="btn" data-act="rot-15">⟲ 15°</button><button class="btn" data-act="rot15">⟳ 15°</button><button class="btn" data-act="rot90">⟳ 90°</button></div>
    <label class="f">${c.c1 || 'Färg'}</label>${swatches('color', it.color)}
    ${c.c2 ? `<label class="f">${c.c2}</label>${swatches('color2', it.color2)}` : ''}
    ${c.dev ? `<h3>SMART ENHET</h3>
      <label class="f">Koppling i Home Assistant<input data-f="entity" data-u="text" list="ents" value="${esc(it.entity)}" placeholder="${c.dev === 'light' ? 'light.vardagsrum' : 'media_player.tv'}"></label>
      <div class="btns"><button class="btn acc" data-act="test">${it.state?.on ? 'Släck / stäng av' : 'Tänd / sätt på'}</button></div>
      ${c.dev === 'light' && it.state?.on ? `<label class="f" style="margin-top:8px">Ljusstyrka<input type="range" min="5" max="100" value="${Math.round((it.state.bri ?? .8) * 100)}" data-bri="${it.id}"></label>` : ''}` : ''}
    <div class="btns" style="margin-top:14px"><button class="btn" data-act="dup">⧉ Kopiera</button><button class="btn danger" data-act="del">🗑 Ta bort</button></div>`;
}
function openingPanel(o) {
  const c = OPENINGS[o.key];
  return `<h2>${c.icon} ${esc(c.name)}</h2>
    ${field('Namn (valfritt)', 'name', o.name, 'text')}
    <div class="g2">${field('Bredd (cm)', 'w', o.w)}${field('Höjd (cm)', 'h', o.h)}${o.kind === 'window' ? field('Bröstning (cm)', 'sill', o.sill) : ''}</div>
    ${o.kind === 'door' ? `<label class="f">Gångjärn</label>${opt('hinge', o.hinge, [['L', '◧ Vänster'], ['R', 'Höger ◨']])}<div class="btns" style="margin:8px 0 10px"><button class="btn" data-act="swing">⇅ Öppnas åt andra hållet</button></div>` : ''}
    ${o.kind !== 'hole' ? `<label class="f">Färg</label>${swatches('color', o.color)}` : ''}
    ${o.kind === 'window' ? `<h3>GARDIN</h3>${opt('blind', o.blind, [['none', 'Ingen'], ['rullgardin', 'Rullgardin'], ['persienn', 'Persienn']])}
      ${o.blind !== 'none' ? `<div style="height:8px"></div><label class="f">Gardinfärg</label>${swatches('blindColor', o.blindColor)}
      <label class="f">Nere: ${Math.round(o.state.blind * 100)}%<input type="range" min="0" max="100" value="${Math.round(o.state.blind * 100)}" data-blind="${o.id}"></label>
      <label class="f">Koppling gardin (cover)<input data-f="blindEntity" data-u="text" list="ents" value="${esc(o.blindEntity)}" placeholder="cover.sovrum"></label>` : ''}` : ''}
    ${o.kind !== 'hole' ? `<h3>${o.kind === 'garage' ? 'PORTÖPPNARE' : 'BRYTARE (ÖPPEN/STÄNGD)'}</h3>
      <label class="f">Koppling i Home Assistant<input data-f="entity" data-u="text" list="ents" value="${esc(o.entity)}" placeholder="${o.kind === 'garage' ? 'cover.garageport' : 'binary_sensor.ytterdorr'}"></label>
      <div class="btns"><button class="btn acc" data-act="testdoor">${o.state.open > .5 ? 'Stäng' : 'Öppna'} (test)</button></div>` : ''}
    <div class="btns" style="margin-top:14px"><button class="btn danger" data-act="del">🗑 Ta bort</button></div>`;
}
function wallPanel(w) {
  return `<h2>🧱 Vägg</h2>
    <div class="g2">${field('Längd (cm)', 'len', wallLen(w))}${field('Tjocklek (cm)', 't', w.t)}${field('Höjd (cm)', 'h', w.h)}</div>
    <label class="f">Färg</label>${swatches('color', w.color)}
    <p class="note">Dra väggen eller de vita hörnen i ritningen för att flytta. Rummen följer med.</p>
    <div class="btns"><button class="btn danger" data-act="del">🗑 Ta bort vägg</button></div>`;
}
function roomPanel(r) {
  return `<h2>⬜ Rum</h2>
    ${field('Namn', 'name', r.name, 'text')}
    <label class="f">Golv</label>${opt('style', r.style || 'tra', Object.entries(FLOORS))}
    <div style="height:8px"></div><label class="f">Golvfärg</label>${swatches('floor', r.floor)}
    <label class="f">Väggfärg i hela rummet</label>${swatches('roomwalls', null)}
    <div class="note">${polyArea(r.pts).toFixed(1).replace('.', ',')} m²</div>
    <div class="btns"><button class="btn danger" data-act="del">🗑 Ta bort rum</button></div>`;
}
function bgPanel() {
  const b = home().bg;
  return `<h2>🖼️ Bild att rita på</h2>
    <div class="steps"><div><b>1</b>Lägg in en planritning eller ett foto</div><div><b>2</b>Kalibrera: klicka två punkter och skriv avståndet</div><div><b>3</b>Rita rum och väggar ovanpå</div></div>
    <div class="btns"><button class="btn acc" data-act="bgnew">${b ? 'Byt bild' : 'Välj bild'}</button>${b ? '<button class="btn" data-act="calib">📏 Kalibrera</button>' : ''}</div>
    ${b ? `<label class="f" style="margin-top:12px">Synlighet<input type="range" min="10" max="100" value="${Math.round((b.opacity ?? .5) * 100)}" data-bgop></label>
      <div class="btns"><button class="btn danger" data-act="bgdel">Ta bort bild</button></div>` : ''}
    <p class="note" style="margin-top:12px">Snart: AI som gör om foton av rummet till ritning automatiskt.</p>`;
}

// ---------- styrpanel ----------
function controlPanel() {
  const h = home();
  const lights = h.items.filter(i => ITEMS[i.type].dev === 'light'), media = h.items.filter(i => ['tv', 'speaker'].includes(ITEMS[i.type].dev));
  const doors = h.openings.filter(o => o.kind === 'door' || o.kind === 'garage'), blinds = h.openings.filter(o => o.kind === 'window' && o.blind !== 'none');
  const on = lights.filter(i => i.state?.on).length, open = doors.filter(o => o.state.open > .5).length;
  const src = x => x.entity ? (ha.ok && ha.state(x.entity) ? x.entity : x.entity + ' · ej ansluten') : 'Demo – ej kopplad';
  return `
    <div class="summary"><span>💡 ${on} av ${lights.length} tända</span><span>${open ? '🔴' : '🟢'} ${open} öppna</span><span>🪟 ${blinds.filter(o => o.state.blind > .5).length} nere</span></div>
    <div class="scenes"><button class="scene" data-scene="home"><b>🏠</b>Välkommen</button><button class="scene" data-scene="bio"><b>🎬</b>Bio</button><button class="scene" data-scene="morning"><b>☀️</b>Morgon</button><button class="scene" data-scene="off"><b>🌙</b>Allt av</button></div>
    <div class="card"><h3>💡 BELYSNING</h3>${lightGroups(h, lights, src) || '<div class="note">Inga lampor än – lägg till under Bygg.</div>'}</div>
    <div class="card"><h3>🚪 DÖRRAR & PORTAR</h3>${doors.map(o => `<div class="row" data-dev="opening:${o.id}"><div class="l"><span>${esc(nameOf(h, o))}</span><em>${esc(src(o))}</em></div><span class="pill ${o.state.open > .5 ? 'bad' : 'ok'}">${o.state.open > .5 ? 'Öppen' : 'Stängd'}</span></div>`).join('') || '<div class="note">Inga dörrar.</div>'}</div>
    ${blinds.length ? `<div class="card"><h3>🪟 GARDINER</h3>${blinds.map(o => `<div class="row" data-dev="blind:${o.id}"><div class="l"><span>${esc(nameOf(h, o))}</span><em>${o.blind === 'persienn' ? 'Persienn' : 'Rullgardin'} · ${esc(o.blindEntity || 'Demo')}</em></div><span class="pill ${o.state.blind > .5 ? 'bad' : 'ok'}">${o.state.blind > .5 ? 'Nere' : 'Uppe'}</span></div>
      <input type="range" min="0" max="100" value="${Math.round(o.state.blind * 100)}" data-blind="${o.id}">`).join('')}</div>` : ''}
    ${media.length ? `<div class="card"><h3>🎵 MEDIA</h3>${media.map(i => `<div class="row" data-dev="item:${i.id}"><div class="l"><span>${ITEMS[i.type].icon} ${esc(nameOf(h, i))}</span><em>${esc(src(i))}</em></div><span class="sw ${i.state?.on ? 'on' : ''}"></span></div>`).join('')}</div>` : ''}
    <p class="note">Koppla till riktiga prylar: välj en sak under ✏️ Bygg och skriv in dess namn i Home Assistant.</p>`;
}

const openRooms = new Set();
function lightGroups(h, lights, src) {
  const groups = new Map();
  for (const i of lights) { const r = roomAt(h, i), k = r ? r.id : 'ute'; if (!groups.has(k)) groups.set(k, { name: r ? r.name : 'Ute', list: [] }); groups.get(k).list.push(i); }
  return [...groups].map(([k, g]) => { const n = g.list.filter(i => i.state.on).length, open = openRooms.has(k);
    return `<div class="row" data-group="${k}"><div class="l"><span>${open ? '▾' : '▸'} ${esc(g.name)}</span><em>${n} av ${g.list.length} tända</em></div><span class="sw ${n ? 'on' : ''}" data-gsw="${k}"></span></div>
    ${open ? g.list.map(i => `<div class="row" data-dev="item:${i.id}" style="padding-left:14px"><div class="l"><span>${ITEMS[i.type].icon} ${esc(i.name || ITEMS[i.type].name)}</span><em>${esc(src(i))}</em></div><span class="sw ${i.state?.on ? 'on' : ''}"></span></div>
      ${i.state?.on ? `<input type="range" min="5" max="100" value="${Math.round((i.state.bri ?? .8) * 100)}" data-bri="${i.id}">` : ''}`).join('') : ''}`; }).join('');
}

// ---------- panel-händelser ----------
const right = $('#right');
right.addEventListener('click', e => {
  const h = home(), s = S.sel;
  const gsw = e.target.closest('[data-gsw]');
  if (gsw) { const k = gsw.dataset.gsw, ls = h.items.filter(i => ITEMS[i.type].dev === 'light' && ((roomAt(h, i)?.id) || 'ute') === k); const any = ls.some(i => i.state.on); ls.forEach(i => lightSet(i, !any, i.state.bri ?? .8)); return; }
  const grp = e.target.closest('[data-group]'); if (grp) { const k = grp.dataset.group; openRooms.has(k) ? openRooms.delete(k) : openRooms.add(k); renderRight(); return; }
  const t = e.target.closest('button,[data-dev]'); if (!t) return;
  if (t.dataset.cat) { catTab = t.dataset.cat; renderRight(); return; }
  if (t.dataset.place) { const [kind, key] = t.dataset.place.split(':'); S.placing = { kind, key }; S.tool = 'add'; renderRight(); renderToolbar(); hint(); return; }
  if (t.dataset.scene) return scene(t.dataset.scene);
  if (t.dataset.dev) { const [type, id] = t.dataset.dev.split(':'); return onDevice({ type: type === 'blind' ? 'blind' : type, id }); }
  if (t.dataset.color) { commit(); setField(t.dataset.f, t.dataset.color); emit('full'); return; }
  if (t.dataset.opt) { commit(); setField(t.dataset.opt, t.dataset.v); emit('full'); return; }
  const act = t.dataset.act; if (!act) return;
  const obj = selected();
  if (act.startsWith('rot')) { commit(); obj.rot = ((obj.rot + +act.slice(3)) % 360 + 360) % 360; emit('full', 'panel'); return; }
  if (act === 'del') return deleteSel();
  if (act === 'dup') { commit(); const c = JSON.parse(JSON.stringify(obj)); c.id = uid(); c.x += .3; c.y += .3; h.items.push(c); S.sel = { type: 'item', id: c.id }; emit('full'); return; }
  if (act === 'test') return onDevice({ type: 'item', id: obj.id }, true);
  if (act === 'testdoor') return onDevice({ type: 'opening', id: obj.id }, true);
  if (act === 'swing') { commit(); obj.swing = -obj.swing; emit('full'); return; }
  if (act === 'bgnew') return $('#fileImg').click();
  if (act === 'calib') { plan.calibrate(); window.toast('Klicka på två punkter i bilden'); return; }
  if (act === 'bgdel') { commit(); h.bg = null; emit('full'); return; }
});
right.addEventListener('change', e => {
  const t = e.target; if (!t.dataset.f) return;
  commit(); let v = t.value;
  if (t.dataset.u === 'cm') { v = parseFloat(v.replace(',', '.')) / 100; if (!(v >= 0)) { renderRight(); return; } }
  setField(t.dataset.f, v); emit('full', t.dataset.u === 'color' ? 'panel' : undefined);
});
right.addEventListener('input', e => {
  const t = e.target, h = home();
  if (t.dataset.u === 'color') { setField(t.dataset.f, t.value); emit('full', 'panel'); }
  if (t.dataset.bri) { const it = h.items.find(i => i.id === t.dataset.bri); lightSet(it, true, t.value / 100); }
  if (t.dataset.blind) { const o = h.openings.find(i => i.id === t.dataset.blind); blindSet(o, t.value / 100); const lab = t.closest('label'); if (lab) lab.firstChild.textContent = `Nere: ${t.value}%`; }
  if (t.hasAttribute('data-bgop')) { h.bg.opacity = t.value / 100; plan.draw(); save(); }
});
function selected() { const h = home(), s = S.sel; if (!s) return null;
  return s.type === 'item' ? h.items.find(i => i.id === s.id) : s.type === 'opening' ? h.openings.find(i => i.id === s.id) : s.type === 'wall' ? h.walls.find(i => i.id === s.id) : h.rooms.find(i => i.id === s.id); }
function setField(f, v) {
  const h = home();
  if (f === 'home.type') { h.type = v; return; }
  if (f === 'home.ceiling') { const old = h.ceiling; h.ceiling = v; h.walls.forEach(w => { if (Math.abs(w.h - old) < .01) w.h = v; });
    h.items.forEach(it => { if (ITEMS[it.type].ceil) it.elev = v - it.h; }); return; }
  const o = selected(); if (!o) return;
  if (f === 'len') { const L = wallLen(o), ux = (o.b.x - o.a.x) / L, uy = (o.b.y - o.a.y) / L; movePoint(h, o.b, { x: Math.round((o.a.x + ux * v) * 1000) / 1000, y: Math.round((o.a.y + uy * v) * 1000) / 1000 }); return; }
  if (f === 'roomwalls') { h.walls.forEach(w => { if (o.pts.some((p, i) => { const q = o.pts[(i + 1) % o.pts.length];
    const on = pt => Math.abs((q.x - p.x) * (pt.y - p.y) - (q.y - p.y) * (pt.x - p.x)) < .01 && pt.x >= Math.min(p.x, q.x) - .01 && pt.x <= Math.max(p.x, q.x) + .01 && pt.y >= Math.min(p.y, q.y) - .01 && pt.y <= Math.max(p.y, q.y) + .01;
    return on(w.a) && on(w.b); })) w.color = v; }); return; }
  if (f === 'h' && o.type && ITEMS[o.type].ceil) { o.elev = h.ceiling - v; }
  o[f] = v;
}
function deleteSel() {
  const h = home(), s = S.sel; if (!s) return; commit();
  if (s.type === 'item') h.items = h.items.filter(i => i.id !== s.id);
  if (s.type === 'opening') h.openings = h.openings.filter(i => i.id !== s.id);
  if (s.type === 'wall') { h.walls = h.walls.filter(i => i.id !== s.id); h.openings = h.openings.filter(o => o.wall !== s.id); }
  if (s.type === 'room') h.rooms = h.rooms.filter(i => i.id !== s.id);
  S.sel = null; emit('full');
}

// ---------- smarta hemmet ----------
const dom = e => (e || '').split('.')[0];
const linked = e => e && ha.ok && ha.state(e);
function lightSet(it, onOff, bri) {
  if (linked(it.entity)) { const d = dom(it.entity);
    if (!onOff) ha.call(d, 'turn_off', { entity_id: it.entity });
    else ha.call(d, 'turn_on', d === 'light' && bri != null ? { entity_id: it.entity, brightness_pct: Math.round(bri * 100) } : { entity_id: it.entity }); }
  it.state.on = onOff; if (bri != null) it.state.bri = bri; emit('state');
}
function mediaSet(it, onOff) {
  if (linked(it.entity)) { const sp = ITEMS[it.type].dev === 'speaker'; ha.call('media_player', sp ? (onOff ? 'media_play' : 'media_pause') : (onOff ? 'turn_on' : 'turn_off'), { entity_id: it.entity }); }
  it.state.on = onOff; emit('state');
}
function doorSet(o, open) {
  if (linked(o.entity)) { const d = dom(o.entity);
    if (d === 'cover') ha.call('cover', open ? 'open_cover' : 'close_cover', { entity_id: o.entity });
    else if (d === 'lock') ha.call('lock', open ? 'unlock' : 'lock', { entity_id: o.entity });
    else { window.toast('Dörren visar vad dörrbrytaren säger'); return; } }
  o.state.open = open ? 1 : 0; emit('state');
}
function blindSet(o, v) {
  if (linked(o.blindEntity)) ha.call('cover', 'set_cover_position', { entity_id: o.blindEntity, position: Math.round((1 - v) * 100) });
  o.state.blind = v; emit('state');
}
function onDevice(p) {
  const h = home();
  if (p.type === 'item') { const it = h.items.find(i => i.id === p.id); if (!it) return; const dev = ITEMS[it.type].dev;
    if (dev === 'light') lightSet(it, !it.state.on, it.state.bri ?? .8); else if (dev) mediaSet(it, !it.state.on);
    else { const r = roomAt(h, it); if (r) roomLights(r); }
    if (S.mode === 'bygg') renderRight(); return; }
  if (p.type === 'opening') { const o = h.openings.find(i => i.id === p.id); if (!o) return;
    if (o.kind === 'window') { if (o.blind !== 'none') blindSet(o, o.state.blind > .5 ? 0 : 1); else window.toast('Fönstret har ingen gardin'); }
    else if (o.kind !== 'hole') doorSet(o, o.state.open < .5);
    if (S.mode === 'bygg') renderRight(); return; }
  if (p.type === 'blind') { const o = h.openings.find(i => i.id === p.id); blindSet(o, o.state.blind > .5 ? 0 : 1); return; }
  if (p.type === 'room') { const r = h.rooms.find(i => i.id === p.id); if (r) roomLights(r); }
}
function roomLights(r) {
  const h = home(), ls = h.items.filter(i => ITEMS[i.type].dev === 'light' && roomAt(h, i) === r);
  if (!ls.length) return window.toast(`Inga lampor i ${r.name}`);
  const anyOn = ls.some(i => i.state.on); ls.forEach(i => lightSet(i, !anyOn, i.state.bri ?? .8));
}
function scene(k) {
  const h = home(), lights = h.items.filter(i => ITEMS[i.type].dev === 'light'), blinds = h.openings.filter(o => o.blind && o.blind !== 'none');
  const room = i => roomAt(h, i)?.name || '';
  if (k === 'off') { lights.forEach(i => lightSet(i, false)); h.items.filter(i => ITEMS[i.type].dev && ITEMS[i.type].dev !== 'light').forEach(i => mediaSet(i, false)); }
  if (k === 'home') { lights.forEach(i => lightSet(i, /hall|kök|vardag|allrum/i.test(room(i)) || i.type === 'utelampa', .85)); blinds.forEach(o => blindSet(o, 0)); }
  if (k === 'morning') { blinds.forEach(o => blindSet(o, 0)); lights.forEach(i => lightSet(i, /kök|bad/i.test(room(i)), 1)); }
  if (k === 'bio') { const tv = h.items.find(i => i.type === 'tv'); const r = tv && roomAt(h, tv);
    lights.forEach(i => lightSet(i, !!r && roomAt(h, i) === r && i.type !== 'taklampa', .15));
    blinds.forEach(o => blindSet(o, 1)); if (tv) mediaSet(tv, true);
    h.items.filter(i => ITEMS[i.type].dev === 'speaker' && r && roomAt(h, i) === r).forEach(i => mediaSet(i, true)); }
  window.toast({ off: '🌙 Allt av', home: '🏠 Välkommen hem', morning: '☀️ God morgon', bio: '🎬 Bioläge' }[k]);
}
function haState(entity, st) {
  const h = home(); let hit = false;
  const pos = () => st.attributes?.current_position ?? (st.state === 'open' ? 100 : 0);
  for (const it of h.items) if (it.entity === entity && it.state) { hit = true; const dev = ITEMS[it.type].dev;
    if (dev === 'light') { it.state.on = st.state === 'on'; if (st.attributes?.brightness != null) it.state.bri = st.attributes.brightness / 255; }
    else if (dev === 'tv') it.state.on = !['off', 'standby', 'unavailable', 'unknown'].includes(st.state);
    else it.state.on = st.state === 'playing'; }
  for (const o of h.openings) {
    if (o.entity === entity) { hit = true; const d = dom(entity); o.state.open = d === 'cover' ? pos() / 100 : d === 'lock' ? (st.state === 'unlocked' ? 1 : 0) : (st.state === 'on' ? 1 : 0); }
    if (o.blindEntity === entity) { hit = true; o.state.blind = 1 - pos() / 100; }
  }
  if (hit) emit('state');
}

// ---------- dialoger ----------
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="mbox">${html}</div>`; m.hidden = false; return m; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) $('#modal').hidden = true; });
function newHomeDialog() {
  const m = modal(`<h2>Nytt hem</h2><div class="big4">
    <button data-t="villa"><b>🏡</b>Exempelhus<br><span class="note">Färdigt att utgå från</span></button>
    <button data-t="lagenhet"><b>🏢</b>Lägenhet<br><span class="note">2 rok att ändra i</span></button>
    <button data-t="stuga"><b>🌲</b>Sommarstuga<br><span class="note">Liten stuga med altan</span></button>
    <button data-t="tom"><b>✏️</b>Tomt<br><span class="note">Rita allt själv</span></button></div>
    <div class="btns" style="margin-top:14px"><button class="btn" data-close>Avbryt</button></div>`);
  m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    const h = template(b.dataset.t); S.homes.push(h); m.hidden = true; switchHome(h.id);
    if (b.dataset.t === 'tom') { setMode('bygg'); S.view = 'split'; setTool('room'); renderTop(); }
  });
}
function haDialog() {
  const m = modal(`<h2>🔌 Koppla ditt smarta hem</h2>
    <div class="steps"><div><b>1</b>Ha Home Assistant igång hemma (t.ex. Home Assistant Green)</div>
    <div><b>2</b>Lägg in Apple Home, Homey, Hue, Sonos m.m. i Home Assistant</div>
    <div><b>3</b>Profil → Säkerhet → skapa en "långlivad token" och klistra in här</div></div>
    <label class="f">Adress<input id="haUrl" value="${esc(S.ha.url)}" placeholder="https://xxxx.ui.nabu.casa  eller  http://homeassistant.local:8123"></label>
    <label class="f">Token<textarea id="haTok" rows="3" placeholder="eyJ0eXAiOiJKV1Qi...">${esc(S.ha.token)}</textarea></label>
    <p class="note">Token sparas bara i den här webbläsaren. Status: <span class="dot ${ha.status}"></span> ${{ on: 'Ansluten', off: 'Inte ansluten', error: 'Fel', connecting: 'Ansluter…' }[ha.status]}</p>
    <div class="btns"><button class="btn" data-close>Stäng</button>${S.ha.url ? '<button class="btn danger" id="haOff">Koppla från</button>' : ''}<button class="btn acc" id="haGo">Anslut</button></div>`);
  m.querySelector('#haGo').onclick = () => { S.ha = { url: $('#haUrl').value.trim(), token: $('#haTok').value.trim() }; save(); ha.connect(S.ha.url, S.ha.token); m.hidden = true; };
  const off = m.querySelector('#haOff'); if (off) off.onclick = () => { S.ha = { url: '', token: '' }; save(); ha.disconnect(); ha.connect(); m.hidden = true; };
}

// ---------- filer ----------
function exportHome() {
  const h = home(), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(h, null, 1)], { type: 'application/json' }));
  a.download = h.name.replace(/[^\wåäöÅÄÖ -]/g, '') + '.hemma.json'; a.click();
}
$('#fileJson').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const h = JSON.parse(await f.text()); if (!h.walls || !h.items) throw 0; h.id = uid(); S.homes.push(h); switchHome(h.id); window.toast('Öppnade ' + h.name); }
  catch (err) { window.toast('Filen gick inte att läsa'); }
});
$('#fileImg').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  commit(); const h = home(); h.bg = { src: c.toDataURL('image/jpeg', .8), x: 0, y: 0, mpp: 15 / c.width, opacity: .5 };
  S.tool = 'bild'; emit('full'); plan.calibrate(); window.toast('Klicka på två punkter du vet avståndet mellan'); renderToolbar(); hint();
});

// ---------- tangentbord ----------
window.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (S.mode !== 'bygg') return;
  if (e.key === 'Escape') { if (S.placing || S.tool !== 'select') setTool('select'); else { S.sel = null; plan.cancel(); emit('sel'); } return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); deleteSel(); return; }
  const it = S.sel?.type === 'item' && selected();
  if (it && e.key.toLowerCase() === 'r') { commit(); it.rot = ((it.rot + (e.shiftKey ? -15 : 90)) % 360 + 360) % 360; emit('full', 'panel'); return; }
  if (it && mod && e.key.toLowerCase() === 'd') { e.preventDefault(); right.querySelector('[data-act=dup]')?.click(); }
  const map = { v: 'select', '1': 'select', '2': 'room', '3': 'wall', '4': 'add' }; if (!mod && map[e.key]) setTool(map[e.key]);
});

// ---------- start ----------
function renderAll() { renderSide(); renderTop(); renderToolbar(); renderRight(); hint(); }
renderAll();
view.buildNow(); view.fitCam();
requestAnimationFrame(() => { plan.resize(); plan.fit(); });
window.addEventListener('resize', () => plan.resize());
new ResizeObserver(() => plan.resize()).observe($('#pane2d'));
if (S.ha.url && S.ha.token) ha.connect(S.ha.url, S.ha.token);
window.__hemma = { S, home, emit };
