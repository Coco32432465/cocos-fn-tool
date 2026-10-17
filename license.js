// Lizenz-System (Hauptprozess): Discord-Verknuepfung, Key-Aktivierung, signierte Zeittickets.
// Der Server (license-server/) stellt Tickets aus; hier wird die Signatur geprueft (Ed25519, oeffentlicher Schluessel aus app/config.js).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const appVer = () => { try { return require('electron').app.getVersion(); } catch (e) { return ''; } };
const SALT = 'cft-license-v1';
const REFRESH_EVERY = 6 * 3600 * 1000; // Ticket alle 6 h im Hintergrund erneuern
const LOGIN_TIMEOUT = 5 * 60 * 1000;

function readConfig(appDir) {
  try {
    const code = fs.readFileSync(path.join(appDir, 'app', 'config.js'), 'utf8');
    const w = {}; new Function('window', code)(w);
    return (w.CFT_CONFIG && w.CFT_CONFIG.license) || {};
  } catch (e) { return {}; }
}

function machineId() {
  return new Promise(resolve => {
    const fallback = () => resolve(os.hostname() + '|' + os.userInfo().username + '|' + (os.cpus()[0] || {}).model);
    if (process.platform !== 'win32') return fallback();
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      const m = !err && /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out || '');
      m ? resolve(m[1]) : fallback();
    });
  });
}

function create({ userDataDir, appDir, openExternal, fetchImpl, now = () => Math.floor(Date.now() / 1000) }) {
  const cfg = readConfig(appDir);
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const file = path.join(userDataDir, 'license.json');
  let device = null, loginAbort = null, timer = null;

  const enabled = () => !!(cfg.endpoint && cfg.publicKey);
  const required = () => !!cfg.required;
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; } };
  const save = o => { try { fs.mkdirSync(userDataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(o)); } catch (e) { /* egal */ } };
  async function dev() {
    if (!device) device = crypto.createHash('sha256').update(SALT + '|' + await machineId()).digest('hex').slice(0, 40);
    return device;
  }

  function checkTicket(ticket, d) {
    try {
      const [body, sig] = String(ticket).split('.');
      const pub = crypto.createPublicKey({ key: Buffer.from(cfg.publicKey, 'base64'), format: 'der', type: 'spki' });
      if (!crypto.verify(null, Buffer.from(body), pub, Buffer.from(sig, 'base64url'))) return null;
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (p.dev !== d || p.exp <= now()) return null;
      return p;
    } catch (e) { return null; }
  }

  async function state(extra) {
    const s = load();
    const base = { enabled: enabled(), required: required(), connected: !!s.session, user: s.user || null, rank: !!s.rankOptIn };
    if (!enabled()) return { ...base, valid: true, ...(extra || {}) };
    const p = s.ticket ? checkTicket(s.ticket, await dev()) : null;
    return { ...base, valid: !!p, exp: p ? p.exp : 0, keyExp: p ? p.keyExp : 0, ents: p && Array.isArray(p.ents) ? p.ents : [], ...(extra || {}) };
  }

  async function post(p, body) {
    const r = await doFetch(cfg.endpoint.replace(/\/$/, '') + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch (e) { /* leer */ }
    return j;
  }

  async function login() {
    if (!enabled()) return state({ error: 'Lizenz-Server ist nicht eingerichtet.' });
    if (loginAbort) loginAbort.cancelled = true;
    const me = loginAbort = { cancelled: false };
    const cid = crypto.randomBytes(24).toString('base64url');
    await openExternal(cfg.endpoint.replace(/\/$/, '') + '/auth/start?cid=' + cid);
    const t0 = Date.now();
    while (!me.cancelled && Date.now() - t0 < LOGIN_TIMEOUT) {
      await new Promise(r => setTimeout(r, 2000));
      if (me.cancelled) break;
      let j; try { j = await post('/auth/poll', { cid }); } catch (e) { continue; }
      if (j.ok) {
        const s = load(); s.session = j.session; s.user = j.user; delete s.ticket; save(s);
        loginAbort = null;
        return state();
      }
      if (j.error === 'claimed' || j.error === 'bad_cid') break;
    }
    const cancelled = me.cancelled; loginAbort = null;
    return state({ error: cancelled ? '' : 'Zeit abgelaufen. Bitte erneut auf „Mit Discord verbinden“ klicken.' });
  }
  const loginCancel = () => { if (loginAbort) loginAbort.cancelled = true; return true; };

  async function applyGrant(j) {
    if (j && j.ok && j.ticket) {
      const d = await dev();
      if (!checkTicket(j.ticket, d)) return state({ error: 'Ticket ungültig (Signatur).' });
      const s = load(); s.ticket = j.ticket; if (j.user) s.user = j.user; save(s);
      return state();
    }
    if (j && j.error === 'session') { const s = load(); delete s.session; delete s.ticket; save(s); }
    else if (j && ['revoked', 'expired', 'role', 'device', 'invalid', 'owner'].includes(j.error)) { const s = load(); delete s.ticket; save(s); }
    return state({ error: (j && j.message) || 'Aktivierung fehlgeschlagen.' });
  }

  async function activate(key) {
    const s = load();
    if (!s.session) return state({ error: 'Bitte zuerst mit Discord verbinden.' });
    try { return await applyGrant(await post('/license/activate', { session: s.session, key: String(key || '').trim().toUpperCase(), device: await dev(), appVersion: appVer() })); }
    catch (e) { return state({ error: 'Lizenz-Server nicht erreichbar. Prüfe deine Internetverbindung.' }); }
  }

  async function refresh() {
    const s = load();
    if (!enabled() || !s.session) return state();
    try { return await applyGrant(await post('/license/refresh', { session: s.session, device: await dev(), appVersion: appVer() })); }
    catch (e) { return state(); } // offline: gueltiges Ticket bleibt bis zum Ablauf nutzbar
  }

  // Community-Rangliste (freiwillig): Opt-in wird lokal gemerkt, Werte gehen nur bei aktivem Opt-in raus.
  const cleanCup = c => c && typeof c === 'object' ? { games: Number(c.games) || 0, score: Number(c.score) || 0, best: Number(c.best) || 0, wins: Number(c.wins) || 0, kills: Number(c.kills) || 0 } : undefined;
  const cleanStats = st => { st = st || {}; const n = k => Number(st[k]); return { games: n('games'), avgScore: n('avgScore'), wins: n('wins'), kills: n('kills'), avgPlace: n('avgPlace') || undefined, bestPlace: n('bestPlace') || undefined, cup: cleanCup(st.cup) }; };
  async function rankSet(on, stats) {
    const s = load();
    if (!enabled() || !s.session) return state({ error: 'Bitte zuerst mit Discord verbinden.' });
    try {
      if (on) {
        const j = await post('/rank/submit', { session: s.session, stats: cleanStats(stats) });
        if (!j.ok) return state({ error: j.error === 'session' ? 'Sitzung abgelaufen. Bitte neu mit Discord verbinden.' : j.error === 'stats' ? 'Noch zu wenige analysierte Runden.' : 'Rangliste nicht erreichbar.' });
        s.rankOptIn = true;
      } else {
        await post('/rank/leave', { session: s.session });
        delete s.rankOptIn;
      }
      save(s);
    } catch (e) { return state({ error: 'Lizenz-Server nicht erreichbar.' }); }
    return state();
  }
  async function rankAvg() {
    if (!enabled()) return { ok: false };
    try { const r = await doFetch(cfg.endpoint.replace(/\/$/, '') + '/rank/avg', { method: 'GET' }); return await r.json(); } catch (e) { return { ok: false }; }
  }
  async function rankSync(stats) {
    const s = load();
    if (!s.rankOptIn || !s.session || !enabled()) return false;
    try { const j = await post('/rank/submit', { session: s.session, stats: cleanStats(stats) }); return !!j.ok; } catch (e) { return false; }
  }

  // Freischaltung (z. B. 'tw' = Tweak-Paket) kommt nur aus dem signierten Ticket, nie aus der Oberfläche
  async function hasEnt(e) { const s = load(); const p = s.ticket ? checkTicket(s.ticket, await dev()) : null; return !!(p && Array.isArray(p.ents) && p.ents.includes(e)); }

  // Team-Lizenz: Beitritt per Code, Stats teilen (freiwillig), Coach-Ansicht. Rechte prueft der Server.
  const TEAM_ACTIONS = ['me', 'join', 'leave', 'sync', 'kick', 'rename'];
  async function team(action, body) {
    const s = load();
    if (!enabled() || !s.session) return { ok: false, error: 'Bitte zuerst mit Discord verbinden.' };
    if (!TEAM_ACTIONS.includes(action)) return { ok: false, error: 'Unbekannte Aktion.' };
    const b = { session: s.session };
    if (action === 'join') b.code = String((body && body.code) || '').slice(0, 20);
    if (action === 'kick') b.id = String((body && body.id) || '').slice(0, 30);
    if (action === 'rename') b.name = String((body && body.name) || '').slice(0, 40);
    if (action === 'sync') b.stats = body && body.stats;
    try {
      const j = await post('/team/' + action, b);
      if (j && j.error === 'session') { return { ok: false, error: 'Sitzung abgelaufen. Bitte neu mit Discord verbinden.' }; }
      if (j && j.ok === false && !j.message) j.message = j.error === 'rate' ? 'Zu viele Anfragen, kurz warten.' : 'Das hat nicht geklappt.';
      return j || { ok: false, error: 'Keine Antwort.' };
    } catch (e) { return { ok: false, error: 'Lizenz-Server nicht erreichbar.' }; }
  }

  // Season-Pass: nur Bonustage-Belohnungen laufen ueber den Server (einmal je Level und Season)
  async function season(action, body) {
    const s = load();
    if (!enabled() || !s.session) return { ok: false, error: 'Bitte zuerst mit Discord verbinden.' };
    if (!['me', 'claim'].includes(action)) return { ok: false, error: 'Unbekannte Aktion.' };
    const b = { session: s.session };
    if (action === 'claim') { b.season = String((body && body.season) || '').slice(0, 7); b.level = Number(body && body.level); b.xp = Number(body && body.xp); }
    try { const j = await post('/season/' + action, b); if (j && j.error === 'session') return { ok: false, error: 'Sitzung abgelaufen. Bitte neu mit Discord verbinden.' }; return j || { ok: false, error: 'Keine Antwort.' }; }
    catch (e) { return { ok: false, error: 'Lizenz-Server nicht erreichbar.' }; }
  }

  function logout() { try { fs.unlinkSync(file); } catch (e) { /* weg */ } return state(); }

  // Lebenszeichen alle 5 Min (nur mit Discord-Sitzung): der Server zeigt damit, wie viele die App gerade nutzen
  async function ping() {
    const s = load();
    if (!enabled() || !s.session) return;
    try { await post('/license/ping', { session: s.session, appVersion: appVer(), ...(prog ? { prog } : {}) }); } catch (e) { /* offline */ }
  }
  // Season-Level und Daily-Spin-Streak für die Rollen-Stufe; bei Änderung kurz danach melden
  let prog = null, progT = 0;
  function setProg(p) {
    const n = { level: Math.max(0, Math.round(Number(p && p.level) || 0)), streak: Math.max(0, Math.round(Number(p && p.streak) || 0)) };
    if (prog && prog.level === n.level && prog.streak === n.streak) return false;
    prog = n; clearTimeout(progT); progT = setTimeout(ping, 10000); return true;
  }
  let pingTimer;
  function start() { refresh(); ping(); timer = setInterval(refresh, REFRESH_EVERY); pingTimer = setInterval(ping, 5 * 60 * 1000); }
  function stop() { clearInterval(timer); clearInterval(pingTimer); }

  return { setProg, season, team, hasEnt, rankSet, rankSync, rankAvg, state, login, loginCancel, activate, refresh, logout, start, stop, _checkTicket: checkTicket, _dev: dev };
}

function register(ipcMain, opts) {
  const L = create(opts);
  ipcMain.handle('lic-state', () => L.state());
  ipcMain.handle('lic-login', () => L.login());
  ipcMain.handle('lic-login-cancel', () => L.loginCancel());
  ipcMain.handle('lic-activate', (_e, key) => L.activate(key));
  ipcMain.handle('lic-refresh', () => L.refresh());
  ipcMain.handle('lic-logout', () => L.logout());
  ipcMain.handle('lic-rank-set', (_e, on, stats) => L.rankSet(!!on, stats));
  ipcMain.handle('lic-rank-avg', () => L.rankAvg());
  ipcMain.handle('lic-season', (_e, a, b) => L.season(String(a), b));
  ipcMain.handle('lic-team', (_e, a, b) => L.team(String(a), b));
  ipcMain.handle('lic-rank-sync', (_e, stats) => L.rankSync(stats));
  ipcMain.handle('lic-prog', (_e, p) => L.setProg(p));
  return L;
}

module.exports = { create, register };
