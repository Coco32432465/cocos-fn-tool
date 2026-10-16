// Season-Pass: Aufgaben und Level laufen in der App; hier werden nur die Tage-Belohnungen abgeholt (einmal je Level und Season, mit Obergrenze).
import { now, json, sha256hex } from './util.js';
import { hit } from './auth.js';
import { berlin } from './community.js';
import { grantDays } from './codes.js';

export const LEVEL_XP = 100, MAX_LEVEL = 10;
export const DAY_REWARDS = { 3: 1, 6: 1, 10: 2 }; // Level -> Bonustage (zusammen max. 4 je Season)
export const seasonId = (ts = now()) => { const b = berlin(ts); return `${b.y}-${String(b.mo).padStart(2, '0')}`; };
const session = async (env, token) => token ? env.DB.prepare('SELECT * FROM sessions WHERE token_hash=?').bind(await sha256hex(String(token))).first() : null;

export async function seasonApi(action, body, env) {
  const s = await session(env, body.session);
  if (!s) return json({ ok: false, error: 'session' }, 401);
  if (!(await hit(env, 'season:' + s.discord_id, 60, 3600))) return json({ ok: false, error: 'rate' }, 429);
  const uid = s.discord_id, cur = seasonId();
  const claimed = async () => ((await env.DB.prepare('SELECT level FROM season_claims WHERE user_id=? AND season=? ORDER BY level').bind(uid, cur).all()).results || []).map(r => r.level);
  if (action === 'me') return json({ ok: true, season: cur, claimed: await claimed() });
  if (action === 'claim') {
    const lvl = Math.round(Number(body.level)), xp = Number(body.xp);
    if (body.season !== cur) return json({ ok: false, error: 'season', message: 'Diese Season ist vorbei. Aktualisiere die App.' }, 409);
    const days = DAY_REWARDS[lvl];
    if (!days) return json({ ok: false, error: 'level', message: 'Für dieses Level gibt es keine Bonustage.' }, 400);
    if (!Number.isFinite(xp) || xp < lvl * LEVEL_XP || xp > 5000) return json({ ok: false, error: 'xp', message: 'Level noch nicht erreicht.' }, 403);
    const has = await env.DB.prepare("SELECT 1 AS x FROM keys WHERE discord_id=? AND status='active' AND expires_at>?").bind(uid, now()).first();
    if (!has) return json({ ok: false, error: 'license', message: 'Dafür brauchst du eine aktive Lizenz.' }, 403);
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO season_claims (user_id,season,level,created_at) VALUES (?,?,?,?)').bind(uid, cur, lvl, now()).run();
    if (!(ins.meta && ins.meta.changes)) return json({ ok: false, error: 'done', message: 'Schon abgeholt.', claimed: await claimed() }, 409);
    await grantDays(env, uid, days, '🏅 Season-Belohnung', `Du hast in der Season **${cur}** Level **${lvl}** erreicht: **+${days} Bonustag${days === 1 ? '' : 'e'}**.`);
    return json({ ok: true, days, claimed: await claimed() });
  }
  return json({ ok: false, error: 'action' }, 400);
}
