// Discord-REST, Rollen, Signaturpruefung, Konfiguration aus der Datenbank.
import { enc, hex2u8 } from './util.js';

const API = 'https://discord.com/api/v10';

export async function dapi(env, method, path, body) {
  if (env._budget) { if (env._budget.n >= env._budget.max) throw new Error('BUDGET'); env._budget.n++; }
  const r = await fetch(API + path, {
    method,
    headers: { authorization: 'Bot ' + env.BOT_TOKEN, 'content-type': 'application/json', 'x-audit-log-reason': 'cft-license' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null; try { data = await r.json(); } catch (e) { /* leer */ }
  return { ok: r.ok, status: r.status, data };
}

// Nachricht mit Datei-Anhang (Transkript)
export async function dapiFile(env, channelId, payload, filename, text) {
  if (env._budget) { if (env._budget.n >= env._budget.max) throw new Error('BUDGET'); env._budget.n++; }
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ ...payload, attachments: [{ id: 0, filename }] }));
  fd.append('files[0]', new Blob([text], { type: 'text/plain; charset=utf-8' }), filename);
  const r = await fetch(`${API}/channels/${channelId}/messages`, { method: 'POST', headers: { authorization: 'Bot ' + env.BOT_TOKEN }, body: fd });
  return { ok: r.ok, status: r.status };
}

export const addRole = (env, uid, role) => dapi(env, 'PUT', `/guilds/${env.GUILD_ID}/members/${uid}/roles/${role || env.CUSTOMER_ROLE_ID}`);
export const delRole = (env, uid, role) => dapi(env, 'DELETE', `/guilds/${env.GUILD_ID}/members/${uid}/roles/${role || env.CUSTOMER_ROLE_ID}`);

// true = hat die Rolle, false = nicht (oder nicht auf dem Server), null = Discord gerade nicht erreichbar
export async function hasRole(env, uid) {
  try {
    const r = await dapi(env, 'GET', `/guilds/${env.GUILD_ID}/members/${uid}`);
    if (r.status === 404) return false;
    if (!r.ok) return null;
    return (r.data.roles || []).includes(env.CUSTOMER_ROLE_ID);
  } catch (e) { return null; }
}

export async function tryDM(env, uid, payload) {
  try {
    const ch = await dapi(env, 'POST', '/users/@me/channels', { recipient_id: uid });
    if (!ch.ok) return false;
    return (await dapi(env, 'POST', `/channels/${ch.data.id}/messages`, payload)).ok;
  } catch (e) { return false; }
}

export async function verifyDiscord(request, env, raw) {
  const sig = request.headers.get('x-signature-ed25519'), ts = request.headers.get('x-signature-timestamp');
  if (!sig || !ts) return false;
  try {
    const k = await crypto.subtle.importKey('raw', hex2u8(env.DISCORD_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', k, hex2u8(sig), enc.encode(ts + raw));
  } catch (e) { return false; }
}

/* ---------- Konfiguration: Werte aus /setup (Datenbank) ueberschreiben die Variablen ---------- */
const MAP = { customer_role: 'CUSTOMER_ROLE_ID', member_role: 'MEMBER_ROLE_ID', admin_role: 'ADMIN_ROLE_ID', tester_role: 'TESTER_ROLE_ID', user_role: 'USER_ROLE_ID', log_channel: 'LOG_CHANNEL_ID', key_channel: 'PANEL_CHANNEL_ID', support_channel: 'SUPPORT_CHANNEL_ID',
  mod_role: 'MOD_ROLE_ID', support_role: 'SUPPORTER_ROLE_ID', dev_role: 'DEV_ROLE_ID', creator_role: 'CREATOR_ROLE_ID', rank_role: 'RANK_ROLE_ID',
  feedback_channel: 'FEEDBACK_CHANNEL_ID', bug_channel: 'BUG_CHANNEL_ID', status_channel: 'STATUS_CHANNEL_ID', rank_channel: 'RANK_CHANNEL_ID', general_channel: 'GENERAL_CHANNEL_ID', download_channel: 'DOWNLOAD_CHANNEL_ID' };
export async function withCfg(env) {
  let rows = [];
  try { rows = (await env.DB.prepare('SELECT k,v FROM config').all()).results || []; } catch (e) { /* Tabelle fehlt noch */ }
  const o = { ...env };
  for (const r of rows) if (MAP[r.k] && r.v) o[MAP[r.k]] = r.v;
  return o;
}
export const setCfg = (env, k, v) => env.DB.prepare('INSERT INTO config (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, String(v)).run();
export const getCfg = async (env, k) => { const r = await env.DB.prepare('SELECT v FROM config WHERE k=?').bind(k).first(); return r ? r.v : null; };

export const adminIds = env => String(env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
export function isAdmin(env, i) {
  const m = i.member || {}, uid = (m.user || i.user || {}).id;
  if (adminIds(env).includes(uid)) return true;
  if (env.ADMIN_ROLE_ID && (m.roles || []).includes(env.ADMIN_ROLE_ID)) return true;
  try { return (BigInt(m.permissions || '0') & 8n) === 8n; } catch (e) { return false; }
}

// Team = Admin oder Moderator/Supporter (duerfen Zahlungen bestaetigen und Tickets verwalten)
export function isTeam(env, i) {
  if (isAdmin(env, i)) return true;
  const roles = (i.member || {}).roles || [];
  return [env.MOD_ROLE_ID, env.SUPPORTER_ROLE_ID].some(r => r && roles.includes(r));
}
export const editMsg = (env, ch, id, payload) => dapi(env, 'PATCH', `/channels/${ch}/messages/${id}`, payload);
