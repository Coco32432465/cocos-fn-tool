// Wöchentlicher Cup: Wertung = Ø der besten 5 Noten der Woche (mind. 3 Runden). Montag ab 10 Uhr gewinnt Platz 1 Bonustage.
// Mitmachen = Rangliste in der App aktiv; die App schickt die Wochenwerte mit /rank/submit.
import { now, emb } from './util.js';
import { dapi, getCfg, setCfg, editMsg } from './discord.js';
import { grantDays } from './codes.js';
import { berlin, weekKey, parseBerlin } from './community.js';

export const CUP_MIN = 3, CUP_BEST = 5;
const MEDAL = ['🥇', '🥈', '🥉'];
const num = (v, lo, hi) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const clean = s => String(s || 'Spieler').replace(/[*_`~|]/g, '');
export const cupPrize = env => { const d = num(env.CUP_PRIZE_DAYS, 0, 30); return d == null ? 7 : d; };
// Ende der Woche: nächster Montag 10:00 deutscher Zeit
export const cupEnd = (t = now()) => { const [y, mo, d] = weekKey(t).split('-').map(Number), m = new Date(Date.UTC(y, mo - 1, d + 7)); return parseBerlin(`${m.getUTCDate()}.${m.getUTCMonth() + 1}.${m.getUTCFullYear()} 10:00`); };

export async function cupStore(env, uid, name, c, t = now()) {
  if (!c || typeof c !== 'object') return false;
  const games = num(c.games, 0, 500), score = num(c.score, 0, 100), best = num(c.best, 0, 100), wins = num(c.wins, 0, 500), kills = num(c.kills, 0, 1e5);
  if (games == null || score == null) return false;
  await env.DB.prepare(`INSERT INTO cup (discord_id,week,name,games,score,best,wins,kills,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(discord_id,week) DO UPDATE SET name=excluded.name,games=excluded.games,score=excluded.score,best=excluded.best,wins=excluded.wins,kills=excluded.kills,updated_at=excluded.updated_at`)
    .bind(uid, weekKey(t), String(name || 'Spieler').slice(0, 32), Math.round(games), Math.round(score * 10) / 10, best == null ? null : Math.round(best), Math.round(wins || 0), Math.round(kills || 0), t).run();
  return true;
}

export const cupTop = async (env, week, n = 10) =>
  (await env.DB.prepare('SELECT * FROM cup WHERE week=? AND games>=? ORDER BY score DESC, games DESC, best DESC, updated_at ASC LIMIT ?').bind(week, CUP_MIN, n).all()).results || [];
const cupCount = async (env, week) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM cup WHERE week=? AND games>=?').bind(week, CUP_MIN).first()).n;

const line = (r, i) => `${MEDAL[i] || `**${i + 1}.**`} **${clean(r.name)}** · Cup-Note **${Math.round(r.score)}** · ${r.games} Runden${r.best != null ? ` · Bestnote ${r.best}` : ''}`;

export function cupEmbed(env, rows, total, t = now()) {
  const days = cupPrize(env), end = cupEnd(t);
  return emb(env, {
    title: '🏆 Wöchentlicher Cup', color: 0xf1c40f,
    desc: rows.length ? rows.map(line).join('\n') : `Diese Woche hat noch niemand ${CUP_MIN} Runden. Analysiere deine Replays und hol dir Platz 1!`,
    fields: [
      { name: 'Wertung', value: `Ø deiner besten ${CUP_BEST} Noten dieser Woche (mind. ${CUP_MIN} Runden)`, inline: true },
      { name: 'Preis', value: days > 0 ? `Platz 1: **+${days} Bonustage**` : 'Ruhm und Ehre', inline: true },
      { name: 'Ende', value: `<t:${end}:F> (<t:${end}:R>)`, inline: true },
      { name: 'Teilnehmer', value: String(total), inline: true },
      { name: 'Mitmachen', value: 'App → Einstellungen → **Rangliste** aktivieren. Jede analysierte Runde zählt automatisch, Montag startet ein neuer Cup.' }
    ]
  });
}

export async function cupBoard(env, t = now()) {
  const w = weekKey(t);
  return cupEmbed(env, await cupTop(env, w, 10), await cupCount(env, w), t);
}

// Live-Tabelle im Ranglisten-Kanal (stündlich mit der Rangliste)
export async function syncCup(env, t = now()) {
  const msg = await getCfg(env, 'posted:cupboard');
  if (msg && env.RANK_CHANNEL_ID && /^\d+$/.test(msg)) await editMsg(env, env.RANK_CHANNEL_ID, msg, { embeds: [await cupBoard(env, t)] });
}

// Montag ab 10 Uhr: Cup der Vorwoche auswerten, Sieger belohnen, Ergebnis posten
export async function cupFinish(env, t = now()) {
  const b = berlin(t); if (b.wd !== 0 || b.h < 10) return;
  const key = 'cup:' + weekKey(t); if (await getCfg(env, key)) return;
  await setCfg(env, key, '1');
  const last = weekKey(t - 7 * 86400), rows = await cupTop(env, last, 10);
  await env.DB.prepare('DELETE FROM cup WHERE week<?').bind(weekKey(t - 28 * 86400)).run();
  if (!rows.length) return;
  const w = rows[0], days = cupPrize(env);
  if (days > 0) await grantDays(env, w.discord_id, days, '🏆 Du hast den Wochen-Cup gewonnen!', `Platz 1 mit Cup-Note **${Math.round(w.score)}** aus ${w.games} Runden. Dein Preis: **+${days} Bonustage**.`);
  if (env.RANK_CHANNEL_ID) await dapi(env, 'POST', `/channels/${env.RANK_CHANNEL_ID}/messages`, { content: `<@${w.discord_id}>`, allowed_mentions: { users: [w.discord_id] }, embeds: [emb(env, {
    title: '🏆 Cup-Sieger der Woche', color: 0xf1c40f,
    desc: `Glückwunsch <@${w.discord_id}>!${days > 0 ? ` Dein Preis: **+${days} Bonustage**.` : ''}\n\n${rows.map(line).join('\n')}`,
    fields: [{ name: 'Neuer Cup', value: 'Der nächste Cup läuft schon. Jede Runde ab heute zählt.' }] })] });
  return w.discord_id;
}
