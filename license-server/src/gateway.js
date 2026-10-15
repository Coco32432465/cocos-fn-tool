// Bot dauerhaft "online": ein Durable Object haelt die Discord-Gateway-Verbindung (nur Praesenz, keine Events).
// Laeuft auf dem Gratis-Plan. Abschalten: Variable GATEWAY = "off" (dann trennt sich der Bot beim naechsten Alarm).
const GW = 'https://gateway.discord.gg/?v=10&encoding=json';
const ALARM_MS = 30000;

export class Gateway {
  constructor(state, env) { this.state = state; this.env = env; this.ws = null; this.seq = null; this.sid = null; this.hb = null; this.acked = true; this.connecting = false; this.status = 'idle'; }

  async fetch() { await this.ensure(); return new Response(JSON.stringify({ ok: true, status: this.status })); }
  async alarm() { await this.ensure(); }

  async ensure() {
    if (String(this.env.GATEWAY || '') === 'off') { this.close(); this.status = 'off'; return; }
    try { await this.state.storage.setAlarm(Date.now() + ALARM_MS); } catch (e) { /* ohne Alarm laeuft der Cron weiter an */ }
    if (this.ws && this.ws.readyState === 1 && this.acked) return;
    if (this.connecting) return;
    this.close();
    this.connecting = true;
    try {
      const r = await fetch(GW, { headers: { Upgrade: 'websocket' } });
      const ws = r.webSocket; if (!ws) { this.status = 'nows'; return; }
      ws.accept(); this.ws = ws; this.acked = true; this.status = 'connecting';
      ws.addEventListener('message', ev => this.onMsg(ev));
      ws.addEventListener('close', () => { if (this.ws === ws) { this.ws = null; this.stopHb(); this.status = 'closed'; } });
      ws.addEventListener('error', () => { if (this.ws === ws) { this.ws = null; this.stopHb(); this.status = 'error'; } });
    } catch (e) { this.status = 'error'; } finally { this.connecting = false; }
  }

  close() { this.stopHb(); try { if (this.ws) this.ws.close(1000, 'bye'); } catch (e) { /* schon zu */ } this.ws = null; }
  stopHb() { if (this.hb) { clearTimeout(this.hb); this.hb = null; } }
  send(o) { try { this.ws && this.ws.send(JSON.stringify(o)); } catch (e) { /* Verbindung weg, Alarm baut neu auf */ } }

  beat(ms) {
    this.hb = setTimeout(() => {
      if (!this.ws) return;
      if (!this.acked) { this.close(); return; } // keine Antwort -> Alarm verbindet neu
      this.acked = false; this.send({ op: 1, d: this.seq }); this.beat(ms);
    }, ms);
  }

  onMsg(ev) {
    let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data)); } catch (e) { return; }
    if (m.s != null) this.seq = m.s;
    if (m.op === 10) {
      this.stopHb(); this.beat(Math.floor(m.d.heartbeat_interval * Math.random())); // erster Beat mit Jitter
      if (this.sid) this.send({ op: 6, d: { token: this.env.BOT_TOKEN, session_id: this.sid, seq: this.seq } });
      else this.send({ op: 2, d: { token: this.env.BOT_TOKEN, intents: 0, properties: { os: 'linux', browser: 'cocos-tool', device: 'cocos-tool' }, presence: { status: 'online', afk: false, activities: [{ name: 'Cocos Tool', type: 3 }] } } });
      this.hbMs = m.d.heartbeat_interval;
    } else if (m.op === 11) { this.acked = true; this.status = 'online'; }
    else if (m.op === 1) this.send({ op: 1, d: this.seq });
    else if (m.op === 0 && m.t === 'READY') { this.sid = m.d.session_id; this.status = 'online'; }
    else if (m.op === 7) this.close();
    else if (m.op === 9) { if (!m.d) this.sid = null; this.close(); }
  }
}

// Vom Cron aufgerufen: stellt sicher, dass das Objekt laeuft (es haelt sich danach per Alarm selbst am Leben).
export async function pingGateway(env) {
  if (!env.GATEWAY_DO || String(env.GATEWAY || '') === 'off') return null;
  const stub = env.GATEWAY_DO.get(env.GATEWAY_DO.idFromName('main'));
  const r = await stub.fetch('https://gateway/ensure');
  return r.json();
}
