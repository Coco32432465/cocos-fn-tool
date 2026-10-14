// Coco's Fn Tool – Lizenz-Server + Discord-Bot (Cloudflare Worker, D1)
// Endpunkte:
//   POST /interactions        Discord (Slash-Commands, Buttons)
//   GET  /setup?secret=...    einmalig: Commands registrieren + Ticket-Panel posten
//   GET  /auth/start?cid=     Discord-Login starten (App oeffnet den Browser)
//   GET  /auth/callback       Rueckkehr von Discord
//   POST /auth/poll           App holt sich die Sitzung ab
//   POST /license/activate    Key einloesen   {session, key, device}
//   POST /license/refresh     Ticket erneuern {session, device}

const DISCORD = 'https://discord.com/api/v10';
const PLANS = { week: { days: 7, label: '1 Woche' }, month: { days: 30, label: '1 Monat' } };
const TICKET_TTL = 7 * 86400; // Gueltigkeit eines Zeittickets in der App
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const now = () => Math.floor(Date.now() / 1000);
const enc = new TextEncoder();
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });
const hex2u8 = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b642u8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const admins = env => String(env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const rnd = n => crypto.getRandomValues(new Uint8Array(n));

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function newKey() {
  const r = rnd(16);
  const ch = [...r].map(b => KEY_CHARS[b % KEY_CHARS.length]).join('');
  return ch.match(/.{4}/g).join('-');
}

/* ---------- Discord REST ---------- */
async function dapi(env, method, path, body) {
  const r = await fetch(DISCORD + path, {
    method,
    headers: { authorization: 'Bot ' + env.BOT_TOKEN, 'content-type': 'application/json', 'x-audit-log-reason': 'cft-license' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* leer */ }
  return { ok: r.ok, status: r.status, data };
}
const addRole = (env, uid) => dapi(env, 'PUT', `/guilds/${env.GUILD_ID}/members/${uid}/roles/${env.CUSTOMER_ROLE_ID}`);
const delRole = (env, uid) => dapi(env, 'DELETE', `/guilds/${env.GUILD_ID}/members/${uid}/roles/${env.CUSTOMER_ROLE_ID}`);

// true = hat die Rolle, false = nicht (oder nicht auf dem Server), null = Discord gerade nicht erreichbar
async function hasRole(env, uid) {
  try {
    const r = await dapi(env, 'GET', `/guilds/${env.GUILD_ID}/members/${uid}`);
    if (r.status === 404) return false;
    if (!r.ok) return null;
    return (r.data.roles || []).includes(env.CUSTOMER_ROLE_ID);
  } catch (e) { return null; }
}

/* ---------- Signatur (Zeitticket) ---------- */
async function signTicket(env, payload) {
  const key = await crypto.subtle.importKey('pkcs8', b642u8(env.SIGNING_KEY), { name: 'Ed25519' }, false, ['sign']);
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, enc.encode(body)));
  return body + '.' + b64u(sig);
}

async function verifyDiscord(request, env, raw) {
  const sig = request.headers.get('x-signature-ed25519');
  const ts = request.headers.get('x-signature-timestamp');
  if (!sig || !ts) return false;
  try {
    const k = await crypto.subtle.importKey('raw', hex2u8(env.DISCORD_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', k, hex2u8(sig), enc.encode(ts + raw));
  } catch (e) { return false; }
}

/* ---------- Hilfen fuer Texte ---------- */
const fmtDate = ts => new Date(ts * 1000).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
const ephem = content => ({ type: 4, data: { content, flags: 64 } });
const msg = (content, extra = {}) => ({ type: 4, data: { content, ...extra } });
const isAdmin = (env, i) => admins(env).includes((i.member && i.member.user || i.user || {}).id);

/* ---------- Key ausstellen / verlaengern ---------- */
async function issueKey(env, uid, planId) {
  const plan = PLANS[planId];
  const t = now();
  const ex = await env.DB.prepare('SELECT * FROM keys WHERE discord_id=? AND revoked=0 ORDER BY expires_at DESC LIMIT 1').bind(uid).first();
  let key, expires, renewed = false;
  if (ex) {
    key = ex.key; renewed = true;
    expires = Math.max(t, ex.expires_at) + plan.days * 86400;
    await env.DB.prepare('UPDATE keys SET expires_at=?, plan=?, role_removed=0 WHERE key=?').bind(expires, planId, key).run();
  } else {
    key = newKey(); expires = t + plan.days * 86400;
    await env.DB.prepare('INSERT INTO keys (key,discord_id,plan,created_at,expires_at) VALUES (?,?,?,?,?)').bind(key, uid, planId, t, expires).run();
  }
  await addRole(env, uid);
  return { key, expires, renewed, plan };
}

async function tryDM(env, uid, text) {
  const ch = await dapi(env, 'POST', '/users/@me/channels', { recipient_id: uid });
  if (!ch.ok) return false;
  const m = await dapi(env, 'POST', `/channels/${ch.data.id}/messages`, { content: text });
  return m.ok;
}

/* ---------- Discord-Interaktionen ---------- */
async function handleInteraction(i, env, ctx) {
  if (i.type === 1) return { type: 1 };
  const uid = (i.member && i.member.user || i.user || {}).id;

  // Buttons
  if (i.type === 3) {
    const id = i.data.custom_id;
    if (id === 'ticket_open') return openTicket(i, env, uid);
    if (id === 'ticket_close') return closeTicket(i, env, ctx, uid);
    return ephem('Unbekannte Aktion.');
  }

  // Slash-Commands
  if (i.type === 2) {
    const name = i.data.name;
    const opt = n => ((i.data.options || []).find(o => o.name === n) || {}).value;
    if (!isAdmin(env, i)) return ephem('Dieser Befehl ist nur für das Team.');

    if (name === 'key') {
      const planId = opt('plan') || 'month';
      if (!PLANS[planId]) return ephem('Unbekannter Plan.');
      let target = opt('user');
      let inTicket = false;
      if (!target) {
        const t = await env.DB.prepare('SELECT user_id FROM tickets WHERE channel_id=?').bind(i.channel_id).first();
        if (!t) return ephem('Nutze `/key` in einem Ticket-Kanal oder gib `user` an.');
        target = t.user_id; inTicket = true;
      }
      const r = await issueKey(env, target, planId);
      const text = `${r.renewed ? '🔁 Verlängert' : '🔑 Dein Key'} · ${r.plan.label}\n\`\`\`${r.key}\`\`\`Gültig bis **${fmtDate(r.expires)}**.\nIn der App: **Mit Discord verbinden** → Key eingeben. Der Key ist an dein Discord-Konto und ein Gerät gebunden – nicht weitergeben.`;
      const dm = await tryDM(env, target, text);
      if (inTicket) return msg(`<@${target}>\n${text}\n${dm ? '(Auch per DM gesendet.)' : ''}\nDu kannst das Ticket jetzt mit dem Button schließen.`);
      return ephem(`Key für <@${target}> (${r.plan.label}): \`${r.key}\` · bis ${fmtDate(r.expires)} · ${dm ? 'per DM zugestellt' : 'DM nicht möglich – bitte selbst senden'}`);
    }

    if (name === 'revoke') {
      const key = String(opt('key') || '').trim().toUpperCase();
      const row = await env.DB.prepare('SELECT * FROM keys WHERE key=?').bind(key).first();
      if (!row) return ephem('Key nicht gefunden.');
      await env.DB.prepare('UPDATE keys SET revoked=1 WHERE key=?').bind(key).run();
      const other = await env.DB.prepare('SELECT 1 AS x FROM keys WHERE discord_id=? AND revoked=0 AND expires_at>?').bind(row.discord_id, now()).first();
      if (!other) await delRole(env, row.discord_id);
      return ephem(`Key gesperrt (<@${row.discord_id}>). Customer-Rolle ${other ? 'bleibt (weiterer Key aktiv)' : 'entzogen'}.`);
    }

    if (name === 'reset-device') {
      const key = String(opt('key') || '').trim().toUpperCase();
      const r = await env.DB.prepare('UPDATE keys SET device=NULL WHERE key=?').bind(key).run();
      return ephem(r.meta && r.meta.changes ? 'Gerät freigegeben – der Nutzer kann sich auf einem neuen PC anmelden.' : 'Key nicht gefunden.');
    }

    if (name === 'keys') {
      const target = opt('user');
      const q = target
        ? env.DB.prepare('SELECT * FROM keys WHERE discord_id=? ORDER BY created_at DESC LIMIT 15').bind(target)
        : env.DB.prepare('SELECT * FROM keys ORDER BY created_at DESC LIMIT 15');
      const rows = (await q.all()).results || [];
      if (!rows.length) return ephem('Keine Keys.');
      const t = now();
      const lines = rows.map(r => {
        const st = r.revoked ? '⛔ gesperrt' : r.expires_at < t ? '⌛ abgelaufen' : '✅ aktiv';
        return `\`${r.key}\` <@${r.discord_id}> · ${st} · bis ${fmtDate(r.expires_at)} · ${r.device ? 'Gerät gebunden' : 'frei'}`;
      });
      return ephem(lines.join('\n'));
    }
    return ephem('Unbekannter Befehl.');
  }
  return ephem('Nicht unterstützt.');
}

async function openTicket(i, env, uid) {
  const ex = await env.DB.prepare('SELECT channel_id FROM tickets WHERE user_id=?').bind(uid).first();
  if (ex) return ephem(`Du hast schon ein offenes Ticket: <#${ex.channel_id}>`);
  const uname = ((i.member && i.member.user || {}).username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const allow = String(1024 + 2048 + 32768 + 65536); // sehen, schreiben, Dateien, Verlauf
  const overwrites = [
    { id: env.GUILD_ID, type: 0, deny: '1024' },
    { id: uid, type: 1, allow },
    { id: env.DISCORD_APP_ID, type: 1, allow: String(1024 + 2048 + 16384 + 65536) },
    ...admins(env).map(a => ({ id: a, type: 1, allow }))
  ];
  const ch = await dapi(env, 'POST', `/guilds/${env.GUILD_ID}/channels`, {
    name: `ticket-${uname}`, type: 0, parent_id: env.TICKET_CATEGORY_ID, topic: `ticket:${uid}`, permission_overwrites: overwrites
  });
  if (!ch.ok) return ephem('Ticket konnte nicht erstellt werden. Bitte melde dich beim Team.');
  await env.DB.prepare('INSERT INTO tickets (channel_id,user_id,created_at) VALUES (?,?,?)').bind(ch.data.id, uid, now()).run();
  await dapi(env, 'POST', `/channels/${ch.data.id}/messages`, {
    content: `<@${uid}> ${admins(env).map(a => `<@${a}>`).join(' ')}`,
    embeds: [{
      title: "Coco's Fn Tool – Key kaufen",
      description: `**Preise**\n• 1 Woche: **${env.PRICE_WEEK || '5 €'}**\n• 1 Monat: **${env.PRICE_MONTH || '15 €'}**\n\n${env.PAYMENT_TEXT || ''}\n\nSchreib hier, welchen Plan du möchtest. Sobald die Zahlung bestätigt ist, schaltet das Team deinen Key frei – du bekommst ihn hier und per DM.`,
      color: 0x2f7bff
    }],
    components: [{ type: 1, components: [{ type: 2, style: 4, label: 'Ticket schließen', custom_id: 'ticket_close' }] }]
  });
  return ephem(`Dein Ticket: <#${ch.data.id}>`);
}

async function closeTicket(i, env, ctx, uid) {
  const t = await env.DB.prepare('SELECT * FROM tickets WHERE channel_id=?').bind(i.channel_id).first();
  if (!t) return ephem('Das ist kein Ticket.');
  if (t.user_id !== uid && !admins(env).includes(uid)) return ephem('Nur der Ticket-Ersteller oder das Team kann schließen.');
  await env.DB.prepare('DELETE FROM tickets WHERE channel_id=?').bind(i.channel_id).run();
  ctx.waitUntil((async () => { await new Promise(r => setTimeout(r, 3000)); await dapi(env, 'DELETE', `/channels/${i.channel_id}`); })());
  return msg('Ticket wird geschlossen …');
}

/* ---------- Setup (Commands + Panel) ---------- */
async function setup(env) {
  const cmds = [
    { name: 'key', description: 'Key freischalten (Team)', options: [
      { type: 3, name: 'plan', description: 'Laufzeit', required: true, choices: [{ name: '1 Woche', value: 'week' }, { name: '1 Monat', value: 'month' }] },
      { type: 6, name: 'user', description: 'Nutzer (im Ticket weglassen)', required: false }] },
    { name: 'revoke', description: 'Key sperren (Team)', options: [{ type: 3, name: 'key', description: 'Key', required: true }] },
    { name: 'reset-device', description: 'Gerätebindung zurücksetzen (Team)', options: [{ type: 3, name: 'key', description: 'Key', required: true }] },
    { name: 'keys', description: 'Keys anzeigen (Team)', options: [{ type: 6, name: 'user', description: 'Nutzer', required: false }] }
  ];
  const reg = await dapi(env, 'PUT', `/applications/${env.DISCORD_APP_ID}/guilds/${env.GUILD_ID}/commands`, cmds);
  const panel = await dapi(env, 'POST', `/channels/${env.PANEL_CHANNEL_ID}/messages`, {
    embeds: [{
      title: "Coco's Fn Tool – Lizenz",
      description: `Hol dir den Zugang zu **Coco's Fn Tool**.\n\n• 1 Woche: **${env.PRICE_WEEK || '5 €'}**\n• 1 Monat: **${env.PRICE_MONTH || '15 €'}**\n\nKlick auf **Key kaufen**, um ein privates Ticket zu öffnen.`,
      color: 0x2f7bff
    }],
    components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Key kaufen', emoji: { name: '🔑' }, custom_id: 'ticket_open' }] }]
  });
  return { commands: reg.ok ? 'ok' : reg.data, panel: panel.ok ? 'ok' : panel.data };
}

/* ---------- Discord-Login (OAuth) ---------- */
const page = (title, text, ok = true) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#05070d;color:#e8eefc;font-family:system-ui,sans-serif">
<div style="max-width:420px;padding:32px;border:1px solid ${ok ? '#2f7bff' : '#ff4d4d'};border-radius:16px;background:#0b1020;text-align:center">
<h2 style="margin:0 0 10px">${title}</h2><p style="color:#9fb0d0;line-height:1.5">${text}</p></div></body>`,
  { headers: { 'content-type': 'text/html; charset=utf-8' } });

async function authStart(url, env) {
  const cid = url.searchParams.get('cid') || '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(cid)) return page('Ungültiger Link', 'Bitte starte die Verbindung noch einmal aus der App.', false);
  const q = new URLSearchParams({
    client_id: env.DISCORD_APP_ID, response_type: 'code', scope: 'identify',
    redirect_uri: url.origin + '/auth/callback', state: cid, prompt: 'none'
  });
  return Response.redirect('https://discord.com/oauth2/authorize?' + q, 302);
}

async function authCallback(url, env) {
  const code = url.searchParams.get('code'), cid = url.searchParams.get('state') || '';
  if (!code || !/^[A-Za-z0-9_-]{16,64}$/.test(cid)) return page('Abgebrochen', 'Die Verbindung wurde nicht bestätigt. Du kannst es in der App erneut versuchen.', false);
  const tok = await fetch(DISCORD + '/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.DISCORD_APP_ID, client_secret: env.CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: url.origin + '/auth/callback' })
  });
  if (!tok.ok) return page('Fehler', 'Discord hat den Login abgelehnt. Bitte erneut versuchen.', false);
  const t = await tok.json();
  const me = await fetch(DISCORD + '/users/@me', { headers: { authorization: 'Bearer ' + t.access_token } });
  if (!me.ok) return page('Fehler', 'Dein Discord-Konto konnte nicht gelesen werden.', false);
  const u = await me.json();
  await env.DB.prepare('INSERT OR REPLACE INTO logins (cid,discord_id,username,created_at,claimed) VALUES (?,?,?,?,0)').bind(cid, u.id, u.global_name || u.username, now()).run();
  return page('Verbunden ✓', `Hallo ${(u.global_name || u.username).replace(/[<>&]/g, '')}! Dein Discord-Konto ist verknüpft. Du kannst dieses Fenster schließen und zur App zurückgehen.`);
}

async function authPoll(body, env) {
  const cid = String(body.cid || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(cid)) return json({ ok: false, error: 'bad_cid' }, 400);
  const row = await env.DB.prepare('SELECT * FROM logins WHERE cid=?').bind(cid).first();
  if (!row || now() - row.created_at > 600) return json({ ok: false, pending: true });
  if (row.claimed) return json({ ok: false, error: 'claimed' });
  const claim = await env.DB.prepare('UPDATE logins SET claimed=1 WHERE cid=? AND claimed=0').bind(cid).run();
  if (!(claim.meta && claim.meta.changes)) return json({ ok: false, error: 'claimed' });
  const token = b64u(rnd(32));
  await env.DB.prepare('INSERT INTO sessions (token_hash,discord_id,username,created_at) VALUES (?,?,?,?)').bind(await sha256hex(token), row.discord_id, row.username, now()).run();
  return json({ ok: true, session: token, user: { id: row.discord_id, name: row.username } });
}

/* ---------- Lizenz ---------- */
async function getSession(env, token) {
  if (!token) return null;
  return env.DB.prepare('SELECT * FROM sessions WHERE token_hash=?').bind(await sha256hex(String(token))).first();
}

async function grant(env, sess, key, device) {
  const dev = String(device || '').slice(0, 128);
  if (dev.length < 8) return json({ ok: false, error: 'device', message: 'Geräte-ID fehlt.' }, 400);
  const t = now();
  let row;
  if (key) row = await env.DB.prepare('SELECT * FROM keys WHERE key=?').bind(key).first();
  else row = await env.DB.prepare('SELECT * FROM keys WHERE discord_id=? ORDER BY revoked ASC, expires_at DESC LIMIT 1').bind(sess.discord_id).first();
  if (!row) return json({ ok: false, error: 'invalid', message: 'Key nicht gefunden.' }, 403);
  if (row.discord_id !== sess.discord_id) return json({ ok: false, error: 'owner', message: 'Dieser Key gehört zu einem anderen Discord-Konto.' }, 403);
  if (row.revoked) return json({ ok: false, error: 'revoked', message: 'Dieser Key wurde gesperrt.' }, 403);
  if (row.expires_at <= t) return json({ ok: false, error: 'expired', message: 'Dein Key ist abgelaufen. Verlängere im Discord über ein Ticket.' }, 403);
  if (row.device && row.device !== dev) return json({ ok: false, error: 'device', message: 'Der Key ist schon auf einem anderen Gerät aktiv. Melde dich im Discord für einen Reset.' }, 403);
  const role = await hasRole(env, sess.discord_id);
  if (role === false) return json({ ok: false, error: 'role', message: 'Dir fehlt die Customer-Rolle im Discord.' }, 403);
  if (!row.device) await env.DB.prepare('UPDATE keys SET device=? WHERE key=? AND device IS NULL').bind(dev, row.key).run();
  const exp = Math.min(t + TICKET_TTL, row.expires_at);
  const ticket = await signTicket(env, { v: 1, uid: sess.discord_id, name: sess.username, dev, iat: t, exp, keyExp: row.expires_at });
  return json({ ok: true, ticket, exp, keyExp: row.expires_at, user: { id: sess.discord_id, name: sess.username } });
}

async function licenseActivate(body, env) {
  const sess = await getSession(env, body.session);
  if (!sess) return json({ ok: false, error: 'session', message: 'Bitte verbinde zuerst dein Discord-Konto.' }, 401);
  const key = String(body.key || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(key)) return json({ ok: false, error: 'format', message: 'Ungültiges Key-Format.' }, 400);
  return grant(env, sess, key, body.device);
}

async function licenseRefresh(body, env) {
  const sess = await getSession(env, body.session);
  if (!sess) return json({ ok: false, error: 'session', message: 'Bitte verbinde dein Discord-Konto erneut.' }, 401);
  return grant(env, sess, null, body.device);
}

/* ---------- Cron: abgelaufene Keys -> Rolle entziehen ---------- */
async function expireSweep(env) {
  const t = now();
  const rows = (await env.DB.prepare('SELECT * FROM keys WHERE role_removed=0 AND (expires_at<? OR revoked=1)').bind(t).all()).results || [];
  for (const r of rows) {
    const other = await env.DB.prepare('SELECT 1 AS x FROM keys WHERE discord_id=? AND revoked=0 AND expires_at>=?').bind(r.discord_id, t).first();
    if (!other) await delRole(env, r.discord_id);
    await env.DB.prepare('UPDATE keys SET role_removed=1 WHERE key=?').bind(r.key).run();
  }
  return rows.length;
}

/* ---------- Einstieg ---------- */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/interactions' && request.method === 'POST') {
        const raw = await request.text();
        if (!(await verifyDiscord(request, env, raw))) return new Response('bad signature', { status: 401 });
        return json(await handleInteraction(JSON.parse(raw), env, ctx));
      }
      if (url.pathname === '/setup') {
        if (!env.SETUP_SECRET || url.searchParams.get('secret') !== env.SETUP_SECRET) return new Response('nope', { status: 403 });
        return json(await setup(env));
      }
      if (url.pathname === '/auth/start') return authStart(url, env);
      if (url.pathname === '/auth/callback') return authCallback(url, env);
      if (request.method === 'POST' && ['/auth/poll', '/license/activate', '/license/refresh'].includes(url.pathname)) {
        let body; try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'json' }, 400); }
        if (url.pathname === '/auth/poll') return authPoll(body, env);
        if (url.pathname === '/license/activate') return licenseActivate(body, env);
        return licenseRefresh(body, env);
      }
      if (url.pathname === '/') return new Response('cft-license ok');
      return new Response('not found', { status: 404 });
    } catch (e) {
      return json({ ok: false, error: 'server', message: 'Serverfehler. Bitte später erneut versuchen.' }, 500);
    }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(expireSweep(env)); }
};

export { expireSweep };
