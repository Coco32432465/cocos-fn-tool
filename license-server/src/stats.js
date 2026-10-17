import { ratingSummary } from './growth.js';
// Live-Statistik fuer das Team: ein Embed im Kanal live-stats, alle 5 Minuten aktualisiert (Button "Aktualisieren" fuer sofort).
import { now, emb, COL, fmtDateTime } from './util.js';
import { dapi, editMsg, getCfg, setCfg } from './discord.js';

const one = async (env, sql, ...b) => (await env.DB.prepare(sql).bind(...b).first()) || {};
const eur = n => `${(Math.round(n * 100) / 100).toLocaleString('de-DE')} €`;

export async function statsEmbed(env) {
  const t = now();
  const k = await one(env, `SELECT SUM(status='active' AND expires_at>?) AS act, SUM(status!='unused') AS used, SUM(status='unused') AS unused,
    SUM(status='active' AND expires_at>? AND expires_at<=?) AS soon, SUM(status='active' AND expires_at<=?) AS exp, SUM(status='revoked') AS rev FROM keys`, t, t, t + 3 * 86400, t);
  const dev = await one(env, "SELECT COUNT(*) AS n FROM keys WHERE device IS NOT NULL AND status='active' AND expires_at>?", t);
  const app = await one(env, `SELECT COUNT(DISTINCT discord_id) AS tot,
    COUNT(DISTINCT CASE WHEN COALESCE(last_seen,created_at)>? THEN discord_id END) AS now10,
    COUNT(DISTINCT CASE WHEN COALESCE(last_seen,created_at)>? THEN discord_id END) AS d1,
    COUNT(DISTINCT CASE WHEN COALESCE(last_seen,created_at)>? THEN discord_id END) AS d7 FROM sessions`, t - 600, t - 86400, t - 7 * 86400);
  const vers = (await env.DB.prepare(`SELECT app_version AS v, COUNT(DISTINCT discord_id) AS n FROM sessions WHERE app_version IS NOT NULL AND app_version!='' AND COALESCE(last_seen,created_at)>? GROUP BY app_version ORDER BY n DESC LIMIT 4`).bind(t - 7 * 86400).all()).results || [];
  const s7 = await one(env, 'SELECT COALESCE(SUM(amount),0) AS sum, COUNT(*) AS n FROM sales WHERE created_at>?', t - 7 * 86400);
  const s30 = await one(env, 'SELECT COALESCE(SUM(amount),0) AS sum, COUNT(*) AS n FROM sales WHERE created_at>?', t - 30 * 86400);
  const tk = await one(env, 'SELECT COUNT(*) AS n FROM tickets');
  const gw = await one(env, "SELECT COUNT(*) AS n FROM giveaways WHERE status='active'");
  const pl = await one(env, "SELECT COUNT(*) AS n FROM polls WHERE status='active'");
  const rk = await one(env, 'SELECT COUNT(*) AS n FROM ranks');
  const g = await dapi(env, 'GET', `/guilds/${env.GUILD_ID}?with_counts=true`);
  const mem = g.ok && g.data ? g.data : {};
  return emb(env, { title: '📈 Ninjago Tools · Live-Stats', color: COL.brand, fields: [
    { name: '🟢 App jetzt online', value: `**${app.now10 || 0}** (letzte 10 Min)\nHeute aktiv: ${app.d1 || 0}\n7 Tage aktiv: ${app.d7 || 0}\nMit Discord verbunden: ${app.tot || 0}`, inline: true },
    { name: '🔑 Keys', value: `Eingelöst gesamt: **${k.used || 0}**\nAktiv: **${k.act || 0}** (${dev.n || 0} mit Gerät)\nLäuft in 3 Tagen ab: ${k.soon || 0}\nAbgelaufen: ${k.exp || 0} · Gesperrt: ${k.rev || 0}\nNoch nicht eingelöst: ${k.unused || 0}`, inline: true },
    { name: '💶 Umsatz', value: `7 Tage: **${eur(s7.sum)}** (${s7.n})\n30 Tage: **${eur(s30.sum)}** (${s30.n})`, inline: true },
    { name: '💬 Discord', value: `Mitglieder: **${mem.approximate_member_count != null ? mem.approximate_member_count : '?'}**\nOnline: **${mem.approximate_presence_count != null ? mem.approximate_presence_count : '?'}**`, inline: true },
    { name: '🎫 Aktivität', value: `Tickets offen: ${tk.n || 0}\nGiveaways laufen: ${gw.n || 0}\nUmfragen laufen: ${pl.n || 0}\nRangliste: ${rk.n || 0}\nSupport: ${await ratingSummary(env)}`, inline: true },
    { name: '🧩 App-Versionen (7 Tage)', value: vers.length ? vers.map(r => `v${r.v}: ${r.n}`).join('\n') : 'noch keine Daten', inline: true },
    { name: 'Stand', value: `${fmtDateTime(t)} · aktualisiert alle 5 Minuten`, inline: false }] });
}

export const statsRows = () => [{ type: 1, components: [{ type: 2, style: 2, label: 'Aktualisieren', custom_id: 'stats_refresh', emoji: { name: '🔄' } }] }];

export async function syncStats(env) {
  const ch = env.STATS_CHANNEL_ID;
  if (!ch) return false;
  const payload = { embeds: [await statsEmbed(env)], components: statsRows() };
  const id = await getCfg(env, 'posted:stats-panel');
  if (id && /^\d+$/.test(id)) { const r = await editMsg(env, ch, id, payload); if (r.ok) return true; }
  const p = await dapi(env, 'POST', `/channels/${ch}/messages`, payload);
  if (p.ok) await setCfg(env, 'posted:stats-panel', p.data.id);
  return p.ok;
}
