// /admin stats (Uebersicht) und /team (Team-Rollen verwalten).
import { now, emb, eph, bad, COL, fmtDateTime } from './util.js';
import { addRole, delRole, isAdmin } from './discord.js';

const one = async (env, sql, ...b) => (await env.DB.prepare(sql).bind(...b).first()) || {};

export async function adminStats(env) {
  const t = now(), d7 = t - 7 * 86400, d30 = t - 30 * 86400;
  const k = await one(env, `SELECT SUM(status='active' AND expires_at>?) AS act, SUM(status='active' AND expires_at<=?) AS exp, SUM(status='unused') AS unused, SUM(status='revoked') AS rev,
    SUM(status='active' AND expires_at>? AND expires_at<=?) AS soon, SUM(redeemed_at>?) AS new7 FROM keys`, t, t, t, t + 3 * 86400, d7);
  const s7 = await one(env, 'SELECT COALESCE(SUM(amount),0) AS sum, COUNT(*) AS n FROM sales WHERE created_at>?', d7);
  const s30 = await one(env, 'SELECT COALESCE(SUM(amount),0) AS sum, COUNT(*) AS n FROM sales WHERE created_at>?', d30);
  const sAll = await one(env, 'SELECT COALESCE(SUM(amount),0) AS sum, COUNT(*) AS n FROM sales');
  const ren = await one(env, "SELECT COUNT(*) AS n FROM sales WHERE kind='renew' AND created_at>?", d30);
  const tk = await one(env, 'SELECT COUNT(*) AS n FROM tickets');
  const rk = await one(env, 'SELECT COUNT(*) AS n FROM ranks');
  const bugs = await one(env, "SELECT COUNT(*) AS n FROM reports WHERE kind='bug' AND created_at>?", d30);
  const fb = await one(env, "SELECT COUNT(*) AS n FROM reports WHERE kind='feedback' AND created_at>?", d30);
  const eur = n => `${(Math.round(n * 100) / 100).toLocaleString('de-DE')} €`;
  return emb(env, { title: '📈 Admin-Übersicht', color: COL.brand, fields: [
    { name: '🔑 Lizenzen', value: `Aktiv: **${k.act || 0}**\nLäuft in 3 Tagen ab: **${k.soon || 0}**\nAbgelaufen: ${k.exp || 0}\nNicht eingelöst: ${k.unused || 0}\nGesperrt: ${k.rev || 0}`, inline: true },
    { name: '💶 Umsatz', value: `7 Tage: **${eur(s7.sum)}** (${s7.n})\n30 Tage: **${eur(s30.sum)}** (${s30.n})\nGesamt: ${eur(sAll.sum)} (${sAll.n})`, inline: true },
    { name: '👥 Nutzer', value: `Neu eingelöst (7 Tage): **${k.new7 || 0}**\nVerlängerungen (30 Tage): **${ren.n || 0}**\nRangliste: ${rk.n || 0}`, inline: true },
    { name: '🎫 Support', value: `Offene Tickets: **${tk.n || 0}**\nBug-Reports (30 Tage): ${bugs.n || 0}\nFeedback (30 Tage): ${fb.n || 0}`, inline: true },
    { name: 'Stand', value: fmtDateTime(t), inline: true }] });
}

const TEAM_ROLES = { moderator: ['MOD_ROLE_ID', 'Moderator'], supporter: ['SUPPORTER_ROLE_ID', 'Supporter'], developer: ['DEV_ROLE_ID', 'Developer'], creator: ['CREATOR_ROLE_ID', 'Content Creator'], manager: ['CONTENT_ROLE_ID', 'Content Manager'], tester: ['TESTER_ROLE_ID', 'Tester'] };

export async function handleTeam(i, env) {
  if (!isAdmin(env, i)) return bad(env, 'Keine Berechtigung', 'Dieser Befehl ist dem Admin vorbehalten.');
  const o = n => ((i.data.options || []).find(x => x.name === n) || {}).value;
  const [envKey, label] = TEAM_ROLES[o('rolle')] || [];
  if (!envKey || !env[envKey]) return bad(env, 'Rolle fehlt', 'Bitte zuerst `/setup` ausführen, damit die Rollen angelegt werden.');
  const rem = !!o('entfernen'), target = o('user');
  const r = rem ? await delRole(env, target, env[envKey]) : await addRole(env, target, env[envKey]);
  if (!r.ok) return bad(env, 'Rolle konnte nicht geändert werden', 'Die Bot-Rolle muss in den Servereinstellungen ganz oben (über den Team-Rollen) stehen.');
  return eph(env, { title: rem ? 'Rolle entzogen' : 'Rolle vergeben', color: rem ? COL.neutral : COL.ok, desc: `<@${target}> ${rem ? 'hat die Rolle' : 'ist jetzt'} **${label}**${rem ? ' nicht mehr.' : '.'}` });
}

// /admin nutzer: wer die App hat (Discord verbunden) · /admin keys: welche Keys eingeloest wurden
const ago = ts => { if (!ts) return 'nie'; const d = now() - ts; return d < 120 ? 'gerade eben' : d < 7200 ? `vor ${Math.round(d / 60)} Min` : d < 172800 ? `vor ${Math.round(d / 3600)} Std` : `vor ${Math.round(d / 86400)} Tagen`; };
const mask = k => `${k.slice(0, 4)}-••••-${k.slice(-4)}`;

export async function adminUsers(env) {
  const t = now();
  const tot = await one(env, 'SELECT COUNT(DISTINCT discord_id) AS n FROM sessions');
  const on = await one(env, 'SELECT COUNT(DISTINCT discord_id) AS n FROM sessions WHERE COALESCE(last_seen,created_at)>?', t - 86400);
  const lic = await one(env, "SELECT COUNT(DISTINCT discord_id) AS n FROM keys WHERE status='active' AND expires_at>?", t);
  const rows = (await env.DB.prepare(`SELECT discord_id, MAX(username) AS name, MAX(COALESCE(last_seen,created_at)) AS seen, MAX(app_version) AS ver, MIN(created_at) AS first
    FROM sessions GROUP BY discord_id ORDER BY seen DESC LIMIT 15`).all()).results || [];
  const lines = [];
  for (const r of rows) {
    const k = await one(env, 'SELECT status, expires_at FROM keys WHERE discord_id=? ORDER BY expires_at DESC LIMIT 1', r.discord_id);
    const lic = !k.status ? '🚫 kein Key' : k.status === 'revoked' ? '⛔ gesperrt' : k.expires_at > t ? `✅ bis ${fmtDateTime(k.expires_at).split(',')[0]}` : '⌛ abgelaufen';
    lines.push(`**${r.name || 'unbekannt'}** (<@${r.discord_id}>) · ${lic} · ${r.ver ? 'v' + r.ver : 'Version ?'} · ${ago(r.seen)}`);
  }
  return emb(env, { title: '👥 App-Nutzer', color: COL.brand, desc: lines.length ? lines.join('\n') : 'Noch niemand hat sich in der App mit Discord verbunden.',
    fields: [{ name: 'Mit Discord verbunden', value: String(tot.n || 0), inline: true }, { name: 'Aktiv (24 Std)', value: String(on.n || 0), inline: true }, { name: 'Mit gültigem Key', value: String(lic.n || 0), inline: true }] });
}

export async function adminKeys(env) {
  const rows = (await env.DB.prepare("SELECT * FROM keys WHERE status!='unused' ORDER BY redeemed_at DESC LIMIT 15").all()).results || [];
  const un = await one(env, "SELECT COUNT(*) AS n FROM keys WHERE status='unused'");
  const t = now();
  const lines = rows.map(r => `\`${mask(r.key)}\` · <@${r.discord_id}> · eingelöst ${r.redeemed_at ? fmtDateTime(r.redeemed_at) : '?'} · ${r.status === 'revoked' ? '⛔ gesperrt' : r.expires_at > t ? `✅ bis ${fmtDateTime(r.expires_at).split(',')[0]}` : '⌛ abgelaufen'} · ${r.device ? '💻 Gerät gebunden' : 'kein Gerät'} · zuletzt ${ago(r.last_seen)}`);
  return emb(env, { title: '🔑 Eingelöste Keys', color: COL.brand, desc: lines.length ? lines.join('\n') : 'Noch kein Key eingelöst.', fields: [{ name: 'Noch nicht eingelöst', value: String(un.n || 0), inline: true }] });
}
