// Community-Rangliste: Spieler teilen freiwillig (Opt-in in der App) ihre Gesamtstats.
// Rang = Durchschnittsnote (mind. 3 Runden), danach Siege.
import { now, json, emb, eph, bad, COL, sha256hex } from './util.js';
import { dapi, getCfg, setCfg, addRole, delRole, editMsg } from './discord.js';
import { hit } from './auth.js';

const MIN_GAMES = 3;
const MEDAL = ['🥇', '🥈', '🥉'];
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

async function session(env, token) {
  return token ? env.DB.prepare('SELECT * FROM sessions WHERE token_hash=?').bind(await sha256hex(String(token))).first() : null;
}

export async function rankSubmit(body, env) {
  const s = await session(env, body.session);
  if (!s) return json({ ok: false, error: 'session' }, 401);
  if (!(await hit(env, 'rank:' + s.discord_id, 30, 3600))) return json({ ok: false, error: 'rate' }, 429);
  const st = body.stats || {};
  const games = num(st.games, 0, 100000), avg = num(st.avgScore, 0, 100), wins = num(st.wins, 0, 100000), kills = num(st.kills, 0, 1e6);
  if (games == null || avg == null || wins == null || kills == null) return json({ ok: false, error: 'stats' }, 400);
  const place = num(st.avgPlace, 1, 100), best = num(st.bestPlace, 1, 100);
  await env.DB.prepare(`INSERT INTO ranks (discord_id,name,games,avg_score,wins,kills,avg_place,best_place,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(discord_id) DO UPDATE SET name=excluded.name,games=excluded.games,avg_score=excluded.avg_score,wins=excluded.wins,kills=excluded.kills,avg_place=excluded.avg_place,best_place=excluded.best_place,updated_at=excluded.updated_at`)
    .bind(s.discord_id, String(s.username || 'Spieler').slice(0, 32), Math.round(games), Math.round(avg * 10) / 10, Math.round(wins), Math.round(kills), place, best == null ? null : Math.round(best), now()).run();
  return json({ ok: true });
}

export async function rankLeave(body, env) {
  const s = await session(env, body.session);
  if (!s) return json({ ok: false, error: 'session' }, 401);
  await env.DB.prepare('DELETE FROM ranks WHERE discord_id=?').bind(s.discord_id).run();
  return json({ ok: true });
}

export const topRanks = async (env, n = 10) =>
  (await env.DB.prepare('SELECT * FROM ranks WHERE games>=? ORDER BY avg_score DESC, wins DESC, games DESC LIMIT ?').bind(MIN_GAMES, n).all()).results || [];

const line = (r, i) => `${MEDAL[i] || `**${i + 1}.**`} **${String(r.name).replace(/[*_`~|]/g, '')}** · Ø Note **${Math.round(r.avg_score)}** · ${r.games} Runden · ${r.wins} Sieg${r.wins === 1 ? '' : 'e'} · ${r.kills} Kills`;

export function boardEmbed(env, rows, total) {
  return emb(env, {
    title: '🏆 Cocos Tool Rangliste', color: 0xf1c40f,
    desc: rows.length ? rows.map(line).join('\n\n') : 'Noch niemand in der Rangliste. Aktiviere sie in der App unter **Einstellungen → Rangliste** und sei der Erste!',
    fields: [
      { name: 'Wertung', value: `Ø Note über alle deine Runden (mind. ${MIN_GAMES}), dann Siege`, inline: true },
      { name: 'Teilnehmer', value: String(total), inline: true },
      { name: 'Mitmachen', value: 'App → Einstellungen → **Rangliste**. Freiwillig, jederzeit mit `/rank austragen` entfernbar.' }
    ]
  });
}

// Rangliste im Kanal aktualisieren + "Top 10"-Rolle vergeben
export async function syncRank(env) {
  const rows = await topRanks(env, 10);
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM ranks WHERE games>=?').bind(MIN_GAMES).first()).n;
  const msg = await getCfg(env, 'posted:rankboard');
  if (msg && env.RANK_CHANNEL_ID && /^\d+$/.test(msg)) await editMsg(env, env.RANK_CHANNEL_ID, msg, { embeds: [boardEmbed(env, rows, total)] });
  if (!env.RANK_ROLE_ID) return;
  let old = []; try { old = JSON.parse((await getCfg(env, 'rank_holders')) || '[]'); } catch (e) { /* leer */ }
  const now_ = rows.map(r => r.discord_id);
  const add = now_.filter(x => !old.includes(x)).slice(0, 6), del = old.filter(x => !now_.includes(x)).slice(0, 6);
  for (const u of add) await addRole(env, u, env.RANK_ROLE_ID);
  for (const u of del) await delRole(env, u, env.RANK_ROLE_ID);
  const kept = old.filter(x => now_.includes(x) || !del.includes(x)).concat(add);
  await setCfg(env, 'rank_holders', JSON.stringify([...new Set(kept)]));
}

// /rank top | ich | austragen
export async function handleRank(i, env, uid) {
  const sub = i.data.options[0].name;
  if (sub === 'top') {
    const rows = await topRanks(env, 10), total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM ranks WHERE games>=?').bind(MIN_GAMES).first()).n;
    return { type: 4, data: { embeds: [boardEmbed(env, rows, total)] } };
  }
  if (sub === 'ich') {
    const me = await env.DB.prepare('SELECT * FROM ranks WHERE discord_id=?').bind(uid).first();
    if (!me) return eph(env, { title: 'Nicht in der Rangliste', color: COL.neutral, desc: 'Aktiviere die Rangliste in der App unter **Einstellungen → Rangliste**.' });
    const pos = me.games >= MIN_GAMES ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM ranks WHERE games>=? AND (avg_score>? OR (avg_score=? AND wins>?))').bind(MIN_GAMES, me.avg_score, me.avg_score, me.wins).first()).n + 1 : null;
    return eph(env, { title: pos ? `Dein Rang: #${pos}` : 'Noch nicht platziert', color: COL.ok, fields: [
      { name: 'Ø Note', value: String(Math.round(me.avg_score)), inline: true }, { name: 'Runden', value: String(me.games), inline: true }, { name: 'Siege', value: String(me.wins), inline: true },
      { name: 'Kills', value: String(me.kills), inline: true }, { name: 'Ø Platz', value: me.avg_place ? '#' + Math.round(me.avg_place) : '–', inline: true }, { name: 'Beste Platzierung', value: me.best_place ? '#' + me.best_place : '–', inline: true },
      ...(pos ? [] : [{ name: 'Hinweis', value: `Es werden mindestens ${MIN_GAMES} Runden gebraucht.` }])] });
  }
  if (sub === 'austragen') {
    await env.DB.prepare('DELETE FROM ranks WHERE discord_id=?').bind(uid).run();
    return eph(env, { title: 'Aus der Rangliste entfernt', color: COL.ok, desc: 'Deine Daten wurden gelöscht. Du kannst dich in der App jederzeit wieder eintragen.' });
  }
  return bad(env, 'Unbekannter Befehl', '');
}

// Durchschnittswerte der Community (nur Summen, keine Namen). Erst ab 5 Teilnehmern, damit niemand erkennbar wird.
export async function rankAvg(env) {
  const q = lim => env.DB.prepare(`SELECT COUNT(*) AS n, AVG(avg_score) AS avgScore, AVG(avg_place) AS avgPlace, SUM(kills)*1.0/NULLIF(SUM(games),0) AS kpg, SUM(wins)*100.0/NULLIF(SUM(games),0) AS winPct
    FROM (SELECT * FROM ranks WHERE games>=? ORDER BY avg_score DESC, wins DESC, games DESC ${lim})`).bind(MIN_GAMES).first();
  const [all, top] = [await q(''), await q('LIMIT 10')];
  const clean = r => r && r.n >= 5 ? { n: r.n, avgScore: r.avgScore, avgPlace: r.avgPlace, kpg: r.kpg, winPct: r.winPct } : null;
  return json({ ok: true, all: clean(all), top: clean(top) });
}
