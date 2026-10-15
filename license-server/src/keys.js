// Key-Verwaltung: erstellen, einloesen, sperren, Geraet zuruecksetzen, Abfragen.
// Status: unused (erstellt, noch nicht eingeloest) | active (eingeloest, Ablauf laeuft) | revoked
import { now, newKey, PLANS, PLAN_ALL } from './util.js';
import { addRole, delRole } from './discord.js';

export async function createKeys(env, planId, count, by) {
  const plan = PLAN_ALL[planId], t = now(), out = [];
  for (let n = 0; n < count; n++) {
    const key = newKey();
    await env.DB.prepare("INSERT INTO keys (key,plan,days,status,created_at,created_by) VALUES (?,?,?,'unused',?,?)").bind(key, planId, plan.days, t, by || null).run();
    out.push(key);
  }
  return out;
}

export const getKey = (env, key) => env.DB.prepare('SELECT * FROM keys WHERE key=?').bind(key).first();

// Bindet einen unbenutzten Key an ein Discord-Konto, setzt den Ablauf ab jetzt und vergibt die Rolle Customer.
export async function redeemKey(env, uid, key) {
  const row = await getKey(env, key);
  if (!row) return { ok: false, code: 'invalid', message: 'Key nicht gefunden.' };
  if (row.status === 'revoked') return { ok: false, code: 'revoked', message: 'Dieser Key wurde gesperrt.' };
  if (row.status === 'active') {
    return row.discord_id === uid
      ? { ok: true, code: 'already', row }
      : { ok: false, code: 'taken', message: 'Dieser Key wurde bereits von einem anderen Konto eingelöst.' };
  }
  const t = now(), exp = t + Math.round(row.days * 86400);
  const r = await env.DB.prepare("UPDATE keys SET status='active', discord_id=?, redeemed_at=?, expires_at=?, role_removed=0 WHERE key=? AND status='unused'").bind(uid, t, exp, key).run();
  if (!(r.meta && r.meta.changes)) return { ok: false, code: 'taken', message: 'Dieser Key wurde gerade eingelöst.' };
  await addRole(env, uid);
  return { ok: true, code: 'redeemed', row: { ...row, status: 'active', discord_id: uid, redeemed_at: t, expires_at: exp } };
}

// Beste (spaeteste gueltige) Lizenz eines Nutzers
export const bestKey = (env, uid) => env.DB.prepare("SELECT * FROM keys WHERE discord_id=? AND status<>'unused' ORDER BY (status='revoked') ASC, expires_at DESC LIMIT 1").bind(uid).first();

// Fuer die App: bevorzugt den Key, der zu diesem Geraet gehoert, dann einen noch freien, sonst den besten
export async function pickKey(env, uid, dev) {
  const rows = (await env.DB.prepare("SELECT * FROM keys WHERE discord_id=? AND status<>'unused' ORDER BY expires_at DESC LIMIT 20").bind(uid).all()).results || [];
  const t = now(), valid = rows.filter(r => r.status === 'active' && r.expires_at > t);
  return valid.find(r => r.device === dev) || valid.find(r => !r.device) || valid[0] || rows.find(r => r.status !== 'revoked') || rows[0] || null;
}

export async function revokeKey(env, key) {
  const row = await getKey(env, key);
  if (!row) return null;
  await env.DB.prepare("UPDATE keys SET status='revoked' WHERE key=?").bind(key).run();
  let roleKept = false;
  if (row.discord_id) {
    const other = await env.DB.prepare("SELECT 1 AS x FROM keys WHERE discord_id=? AND status='active' AND expires_at>?").bind(row.discord_id, now()).first();
    if (other) roleKept = true; else await delRole(env, row.discord_id);
  }
  return { row, roleKept };
}

export async function resetDevice(env, key) {
  const r = await env.DB.prepare('UPDATE keys SET device=NULL WHERE key=?').bind(key).run();
  return !!(r.meta && r.meta.changes);
}

export const statusOf = (row, t = now()) => row.status === 'revoked' ? 'Gesperrt' : row.status === 'unused' ? 'Nicht eingelöst' : row.expires_at <= t ? 'Abgelaufen' : 'Aktiv';

export async function listKeys(env, uid) {
  const q = uid
    ? env.DB.prepare('SELECT * FROM keys WHERE discord_id=? ORDER BY created_at DESC LIMIT 15').bind(uid)
    : env.DB.prepare('SELECT * FROM keys ORDER BY created_at DESC LIMIT 15');
  return (await q.all()).results || [];
}

// Taeglicher Job: abgelaufenen Nutzern die Rolle entziehen + DM. (Cloudflare Free: max. ~14 Nutzer je Lauf, Rest beim naechsten.)
export async function expireSweep(env, notify) {
  const t = now();
  const rows = (await env.DB.prepare("SELECT * FROM keys WHERE role_removed=0 AND status='active' AND expires_at<=? ORDER BY expires_at LIMIT 14").bind(t).all()).results || [];
  let n = 0;
  for (const r of rows) {
    const other = await env.DB.prepare("SELECT 1 AS x FROM keys WHERE discord_id=? AND status='active' AND expires_at>?").bind(r.discord_id, t).first();
    if (!other) { await delRole(env, r.discord_id); if (notify) await notify(r); n++; }
    await env.DB.prepare('UPDATE keys SET role_removed=1 WHERE key=?').bind(r.key).run();
  }
  return n;
}

// Zahlung bestaetigt: bestehende Lizenz verlaengern (Ablauf + Laufzeit) oder neuen Key erstellen
export async function extendLicense(env, uid, planId, by) {
  const plan = PLAN_ALL[planId];
  const row = await env.DB.prepare("SELECT * FROM keys WHERE discord_id=? AND status='active' ORDER BY expires_at DESC LIMIT 1").bind(uid).first();
  if (!row) { const [key] = await createKeys(env, planId, 1, by); return { mode: 'new', key }; }
  const base = Math.max(now(), row.expires_at), exp = base + Math.round(plan.days * 86400);
  await env.DB.prepare('UPDATE keys SET expires_at=?, role_removed=0, reminded=0 WHERE key=?').bind(exp, row.key).run();
  await addRole(env, uid);
  return { mode: 'extended', key: row.key, expires_at: exp };
}
