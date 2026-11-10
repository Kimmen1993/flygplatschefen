// Koppling till Home Assistant (navet som pratar med Apple Home, Homey, Hue, Sonos m.fl.).
export function createHA({ onState, onStatus }) {
  let ws = null, id = 1, status = 'off';
  const states = new Map(), pending = new Map();
  const setStatus = (s, msg) => { status = s; onStatus(s, msg); };

  function connect(url, token) {
    disconnect();
    if (!url || !token) { setStatus('off'); return; }
    let u = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(u)) u = 'http://' + u;
    if (location.protocol === 'https:' && u.startsWith('http:')) {
      setStatus('error', 'Sidan körs via https – använd din https-adress till Home Assistant (t.ex. Nabu Casa-länken).'); return;
    }
    setStatus('connecting');
    try { ws = new WebSocket(u.replace(/^http/, 'ws') + '/api/websocket'); }
    catch (e) { setStatus('error', 'Felaktig adress'); return; }
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      else if (m.type === 'auth_invalid') { setStatus('error', 'Fel token'); ws.close(); }
      else if (m.type === 'auth_ok') {
        send({ type: 'get_states' }, res => { res.forEach(s => { states.set(s.entity_id, s); onState(s.entity_id, s); }); setStatus('on'); });
        send({ type: 'subscribe_events', event_type: 'state_changed' });
      }
      else if (m.type === 'result' && pending.has(m.id)) { const cb = pending.get(m.id); pending.delete(m.id); if (m.success) cb(m.result); }
      else if (m.type === 'event' && m.event?.data?.new_state) { const s = m.event.data.new_state; states.set(s.entity_id, s); onState(s.entity_id, s); }
    };
    ws.onerror = () => setStatus('error', 'Kunde inte nå Home Assistant');
    ws.onclose = () => { if (status === 'on') setStatus('error', 'Anslutningen bröts'); };
  }
  function send(msg, cb) { if (!ws || ws.readyState !== 1) return; msg.id = id++; if (cb) pending.set(msg.id, cb); ws.send(JSON.stringify(msg)); }
  function disconnect() { if (ws) { ws.onclose = null; ws.close(); ws = null; } states.clear(); }
  function call(domain, service, data) { send({ type: 'call_service', domain, service, service_data: data }); }

  return {
    connect, disconnect, call,
    get ok() { return status === 'on'; },
    get status() { return status; },
    entities(prefixes) { return [...states.keys()].filter(e => !prefixes || prefixes.some(p => e.startsWith(p + '.'))).sort(); },
    state(e) { return states.get(e); },
  };
}
