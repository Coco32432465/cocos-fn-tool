// Discord-Login (OAuth2), Lizenz-Endpunkte fuer die App, oeffentliche /api/verify, Rate-Limit.
import { isCoach } from './team.js';
import { now, json, enc, b64u, b642u8, rnd, sha256hex, KEY_RE, normKey } from './util.js';
import { hasRole, dapi } from './discord.js';
import { redeemKey, getKey, pickKey } from './keys.js';

const DISCORD = 'https://discord.com/api/v10';
const TICKET_TTL = 7 * 86400;
const CID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/* ---------- Rate-Limit + Brute-Force-Schutz ---------- */
export async function hit(env, bucket, limit, windowSec) {
  const w = Math.floor(now() / windowSec);
  const r = await env.DB.prepare('INSERT INTO rl (bucket,w,n) VALUES (?,?,1) ON CONFLICT(bucket,w) DO UPDATE SET n=n+1 RETURNING n').bind(bucket, w).first();
  return !r || r.n <= limit;
}
const FAIL_LIMIT = 10, FAIL_WINDOW = 1800; // 10 Fehlversuche je 30 Min. -> Sperre bis Fensterende
export async function blocked(env, ip) {
  const w = Math.floor(now() / FAIL_WINDOW);
  const r = await env.DB.prepare('SELECT n FROM rl WHERE bucket=? AND w=?').bind('bf:' + ip, w).first();
  return !!r && r.n >= FAIL_LIMIT;
}
export const fail = (env, ip) => hit(env, 'bf:' + ip, 1e9, FAIL_WINDOW);
export const cleanup = env => env.DB.prepare('DELETE FROM rl WHERE w < ?').bind(Math.floor(now() / 3600) - 5).run().catch(() => {});

/* ---------- CORS (nur fuer deine Website) ---------- */
export function corsHeaders(env, request) {
  const o = request.headers.get('origin');
  const ok = o && String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean).includes(o);
  return ok ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS', vary: 'origin' } : {};
}

/* ---------- Signatur ---------- */
async function signTicket(env, payload) {
  const key = await crypto.subtle.importKey('pkcs8', b642u8(env.SIGNING_KEY), { name: 'Ed25519' }, false, ['sign']);
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, enc.encode(body)));
  return body + '.' + b64u(sig);
}

/* ---------- OAuth ---------- */
const page = (title, text, ok = true) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#05070d;color:#e8eefc;font-family:system-ui,sans-serif">
<div style="max-width:420px;padding:32px;border:1px solid ${ok ? '#1e6bff' : '#e5484d'};border-radius:16px;background:#0b1020;text-align:center">
<h2 style="margin:0 0 10px">${title}</h2><p style="color:#9fb0d0;line-height:1.5">${text}</p></div></body>`,
  { headers: { 'content-type': 'text/html; charset=utf-8' } });

const allowedNext = (env, n) => { try { const u = new URL(n); return String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).includes(u.origin) ? u.toString() : null; } catch (e) { return null; } };

export async function authStart(url, env) {
  const cid = url.searchParams.get('cid') || '';
  if (!CID_RE.test(cid)) return page('Ungültiger Link', 'Bitte starte die Verbindung noch einmal aus der App.', false);
  const next = url.searchParams.get('next');
  let state = cid;
  if (next) { const n = allowedNext(env, next); if (!n) return page('Ungültiger Link', 'Rücksprung-Adresse nicht erlaubt.', false); state += '.' + b64u(enc.encode(n)); }
  const q = new URLSearchParams({ client_id: env.DISCORD_APP_ID, response_type: 'code', scope: 'identify', redirect_uri: url.origin + '/auth/callback', state, prompt: 'none' });
  return Response.redirect('https://discord.com/oauth2/authorize?' + q, 302);
}

export async function authCallback(url, env) {
  const code = url.searchParams.get('code'), [cid, nx] = String(url.searchParams.get('state') || '').split('.');
  if (!code || !CID_RE.test(cid || '')) return page('Abgebrochen', 'Die Verbindung wurde nicht bestätigt. Du kannst es in der App erneut versuchen.', false);
  const tok = await fetch(DISCORD + '/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.DISCORD_APP_ID, client_secret: env.CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: url.origin + '/auth/callback' })
  });
  if (!tok.ok) return page('Fehler', 'Discord hat den Login abgelehnt. Bitte erneut versuchen.', false);
  const me = await fetch(DISCORD + '/users/@me', { headers: { authorization: 'Bearer ' + (await tok.json()).access_token } });
  if (!me.ok) return page('Fehler', 'Dein Discord-Konto konnte nicht gelesen werden.', false);
  const u = await me.json();
  await env.DB.prepare('INSERT OR REPLACE INTO logins (cid,discord_id,username,created_at,claimed) VALUES (?,?,?,?,0)').bind(cid, u.id, u.global_name || u.username, now()).run();
  if (nx) { try { const n = allowedNext(env, new TextDecoder().decode(b642u8(nx.replace(/-/g, '+').replace(/_/g, '/')))); if (n) return Response.redirect(n, 302); } catch (e) { /* normale Seite */ } }
  return page('Verbunden ✓', `Hallo ${(u.global_name || u.username).replace(/[<>&"]/g, '')}! Dein Discord-Konto ist verknüpft. Du kannst dieses Fenster schließen und zur App zurückgehen.`);
}

export async function authPoll(body, env) {
  const cid = String(body.cid || '');
  if (!CID_RE.test(cid)) return json({ ok: false, error: 'bad_cid' }, 400);
  const row = await env.DB.prepare('SELECT * FROM logins WHERE cid=?').bind(cid).first();
  if (!row || now() - row.created_at > 600) return json({ ok: false, pending: true });
  if (row.claimed) return json({ ok: false, error: 'claimed' });
  const claim = await env.DB.prepare('UPDATE logins SET claimed=1 WHERE cid=? AND claimed=0').bind(cid).run();
  if (!(claim.meta && claim.meta.changes)) return json({ ok: false, error: 'claimed' });
  const token = b64u(rnd(32));
  await env.DB.prepare('INSERT INTO sessions (token_hash,discord_id,username,created_at) VALUES (?,?,?,?)').bind(await sha256hex(token), row.discord_id, row.username, now()).run();
  return json({ ok: true, session: token, user: { id: row.discord_id, name: row.username } });
}

/* ---------- Lizenz fuer die App ---------- */
const getSession = async (env, token) => token ? env.DB.prepare('SELECT * FROM sessions WHERE token_hash=?').bind(await sha256hex(String(token))).first() : null;

async function grant(env, sess, key, device, ip, ver) {
  const dev = String(device || '').slice(0, 128);
  if (dev.length < 8) return json({ ok: false, error: 'device', message: 'Geräte-ID fehlt.' }, 400);
  const t = now();
  let row, fresh = false;
  if (key) {
    row = await getKey(env, key);
    if (row && row.status === 'unused') { // Einloesen direkt in der App
      const r = await redeemKey(env, sess.discord_id, key);
      if (!r.ok) return json({ ok: false, error: r.code, message: r.message }, 403);
      row = r.row; fresh = true;
    }
  } else row = await pickKey(env, sess.discord_id, dev);
  if (!row) { if (ip) await fail(env, ip); return json({ ok: false, error: 'invalid', message: 'Key nicht gefunden.' }, 403); }
  if (row.discord_id !== sess.discord_id) { if (ip) await fail(env, ip); return json({ ok: false, error: 'owner', message: 'Dieser Key gehört zu einem anderen Discord-Konto.' }, 403); }
  if (row.status === 'revoked') return json({ ok: false, error: 'revoked', message: 'Dieser Key wurde gesperrt.' }, 403);
  if (row.expires_at <= t) return json({ ok: false, error: 'expired', message: 'Dein Key ist abgelaufen. Verlängere im Discord über ein Ticket.' }, 403);
  if (row.device && row.device !== dev) return json({ ok: false, error: 'device', message: 'Der Key ist schon auf einem anderen Gerät aktiv. Melde dich im Discord für einen Reset.' }, 403);
  if (!fresh) { const role = await hasRole(env, sess.discord_id); if (role === false) return json({ ok: false, error: 'role', message: 'Dir fehlt die Customer-Rolle im Discord.' }, 403); }
  if (!row.device) await env.DB.prepare('UPDATE keys SET device=? WHERE key=? AND device IS NULL').bind(dev, row.key).run();
  const v = String(ver || '').slice(0, 20);
  await env.DB.prepare('UPDATE sessions SET last_seen=?, app_version=COALESCE(NULLIF(?,\'\'), app_version) WHERE token_hash=?').bind(t, v, sess.token_hash).run().catch(() => {});
  await env.DB.prepare('UPDATE keys SET last_seen=? WHERE key=?').bind(t, row.key).run().catch(() => {});
  const exp = Math.min(t + TICKET_TTL, row.expires_at);
  const ents = ((await env.DB.prepare('SELECT ent FROM entitlements WHERE user_id=?').bind(sess.discord_id).all().catch(() => null)) || { results: [] }).results.map(r => r.ent);
  if (await isCoach(env, sess.discord_id)) ents.push('coach');
  if (row.plan === 'lifetime' && !ents.includes('tw')) ents.push('tw'); // Lifetime enthält alle Extras
  const ticket = await signTicket(env, { v: 1, uid: sess.discord_id, name: sess.username, dev, iat: t, exp, keyExp: row.expires_at, ents });
  return json({ ok: true, ticket, exp, keyExp: row.expires_at, user: { id: sess.discord_id, name: sess.username } });
}

export async function licenseActivate(body, env, ip) {
  const sess = await getSession(env, body.session);
  if (!sess) return json({ ok: false, error: 'session', message: 'Bitte verbinde zuerst dein Discord-Konto.' }, 401);
  const key = normKey(body.key);
  if (!KEY_RE.test(key)) return json({ ok: false, error: 'format', message: 'Ungültiges Key-Format.' }, 400);
  return grant(env, sess, key, body.device, ip, body.appVersion);
}
export async function licensePing(body, env) {
  const sess = await getSession(env, body.session);
  if (!sess) return json({ ok: false, error: 'session' }, 401);
  await env.DB.prepare('UPDATE sessions SET last_seen=?, app_version=COALESCE(NULLIF(?,\'\'), app_version) WHERE token_hash=?').bind(now(), String(body.appVersion || '').slice(0, 20), sess.token_hash).run();
  return json({ ok: true });
}
export async function licenseRefresh(body, env) {
  const sess = await getSession(env, body.session);
  if (!sess) return json({ ok: false, error: 'session', message: 'Bitte verbinde dein Discord-Konto erneut.' }, 401);
  return grant(env, sess, null, body.device, null, body.appVersion);
}

/* ---------- Oeffentliche API: POST /api/verify {key, deviceId} -> {valid, expiresAt} ---------- */
export async function apiVerify(body, env, ip) {
  const key = normKey(body.key), dev = String(body.deviceId || '').slice(0, 128);
  if (!KEY_RE.test(key) || dev.length < 8) return json({ valid: false, reason: 'format' }, 400);
  const row = await getKey(env, key);
  if (!row) { await fail(env, ip); return json({ valid: false, reason: 'invalid' }); }
  if (row.status === 'revoked') return json({ valid: false, reason: 'revoked' });
  if (row.status === 'unused') return json({ valid: false, reason: 'not_redeemed' });
  const iso = new Date(row.expires_at * 1000).toISOString();
  if (row.expires_at <= now()) return json({ valid: false, reason: 'expired', expiresAt: iso });
  if (row.device && row.device !== dev) { await fail(env, ip); return json({ valid: false, reason: 'device' }); }
  if (!row.device) await env.DB.prepare('UPDATE keys SET device=? WHERE key=? AND device IS NULL').bind(dev, key).run();
  return json({ valid: true, expiresAt: iso });
}
