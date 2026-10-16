// Team-Lizenz: ein Coach kauft das Team (5 Keys + Coach-Dashboard), Spieler treten per Code bei und teilen freiwillig ihre Gesamtstats.
import { now, json, sha256hex } from './util.js';
import { hit } from './auth.js';

export const TEAM_SEATS = 5, TEAM_DAYS = 30, TEAM_MAX_NAME = 24;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => { const b = crypto.getRandomValues(new Uint8Array(6)); return 'T-' + [...b].map(x => CODE_CHARS[x % CODE_CHARS.length]).join(''); };
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const session = async (env, token) => token ? env.DB.prepare('SELECT * FROM sessions WHERE token_hash=?').bind(await sha256hex(String(token))).first() : null;
const cleanName = (s, d) => String(s || d).replace(/[\u0000-\u001f<>@`*_~|]/g, '').trim().slice(0, TEAM_MAX_NAME) || d;

// beim Kauf: Team anlegen oder um 30 Tage verlaengern; der Kaeufer (Coach) ist selbst Mitglied
export async function createOrExtendTeam(env, uid, uname) {
  const t = now();
  if (!uname) { const r = await env.DB.prepare('SELECT username FROM sessions WHERE discord_id=? ORDER BY created_at DESC LIMIT 1').bind(uid).first(); uname = r && r.username; }
  let team = await env.DB.prepare('SELECT * FROM teams WHERE owner_id=?').bind(uid).first();
  if (team) {
    const exp = Math.max(t, team.expires_at) + TEAM_DAYS * 86400;
    await env.DB.prepare('UPDATE teams SET expires_at=? WHERE id=?').bind(exp, team.id).run();
    return { ...team, expires_at: exp, extended: true };
  }
  let code = newCode();
  for (let n = 0; n < 5 && await env.DB.prepare('SELECT 1 AS x FROM teams WHERE code=?').bind(code).first(); n++) code = newCode();
  const exp = t + TEAM_DAYS * 86400, name = cleanName('Team ' + (uname || ''), 'Mein Team');
  const r = await env.DB.prepare('INSERT INTO teams (owner_id,name,code,seats,expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(uid, name, code, TEAM_SEATS, exp, t).run();
  const id = r.meta && (r.meta.last_row_id || r.meta.lastRowId);
  await env.DB.prepare('DELETE FROM team_members WHERE user_id=?').bind(uid).run(); // war er Mitglied eines anderen Teams, wechselt er in sein eigenes
  await env.DB.prepare('INSERT INTO team_members (team_id,user_id,name,joined_at) VALUES (?,?,?,?)').bind(id, uid, cleanName(uname, 'Coach'), t).run();
  return { id, owner_id: uid, name, code, seats: TEAM_SEATS, expires_at: exp, extended: false };
}

export const isCoach = async (env, uid) => !!(await env.DB.prepare('SELECT 1 AS x FROM teams WHERE owner_id=? AND expires_at>?').bind(uid, now()).first());

function cleanStats(st) {
  st = st || {};
  const games = num(st.games, 0, 100000), avg = num(st.avgScore, 0, 100), wins = num(st.wins, 0, 100000), kills = num(st.kills, 0, 1e6);
  if (games == null || avg == null || wins == null || kills == null) return null;
  const place = num(st.avgPlace, 0, 100), best = num(st.bestPlace, 0, 100);
  const weak = (Array.isArray(st.weak) ? st.weak : []).slice(0, 3).map(w => ({ kind: String((w && w.kind) || '').replace(/[^a-z_]/gi, '').slice(0, 24), pct: num(w && w.pct, 0, 100) })).filter(w => w.kind && w.pct != null);
  const trend = (Array.isArray(st.trend) ? st.trend : []).slice(-12).map(x => num(x, 0, 100)).filter(x => x != null).map(x => Math.round(x));
  return { games: Math.round(games), avgScore: Math.round(avg * 10) / 10, wins: Math.round(wins), kills: Math.round(kills), avgPlace: place == null ? 0 : Math.round(place * 10) / 10, bestPlace: best == null ? 0 : Math.round(best), weak, trend };
}

async function view(env, uid) {
  const m = await env.DB.prepare('SELECT m.*, t.name AS tname, t.code, t.seats, t.expires_at, t.owner_id FROM team_members m JOIN teams t ON t.id=m.team_id WHERE m.user_id=?').bind(uid).first();
  if (!m) return { ok: true, role: null };
  const coach = m.owner_id === uid, active = m.expires_at > now();
  const out = { ok: true, role: coach ? 'coach' : 'member', team: { name: m.tname, seats: m.seats, expires_at: m.expires_at, active, ...(coach ? { code: m.code } : {}) } };
  if (coach && active) {
    const rows = (await env.DB.prepare('SELECT user_id,name,stats,updated_at,joined_at FROM team_members WHERE team_id=? ORDER BY joined_at').bind(m.team_id).all()).results || [];
    out.members = rows.map(r => { let st = null; try { st = JSON.parse(r.stats); } catch (e) { /* noch nichts geteilt */ } return { id: r.user_id, name: r.name, coach: r.user_id === m.owner_id, stats: st, updated: r.updated_at || 0 }; });
  } else if (!coach) {
    const o = await env.DB.prepare('SELECT name FROM team_members WHERE team_id=? AND user_id=?').bind(m.team_id, m.owner_id).first();
    out.team.coach = o ? o.name : 'Coach';
  }
  return out;
}

export async function teamApi(action, body, env) {
  const s = await session(env, body.session);
  if (!s) return json({ ok: false, error: 'session' }, 401);
  if (!(await hit(env, 'team:' + s.discord_id, 120, 3600))) return json({ ok: false, error: 'rate' }, 429);
  const uid = s.discord_id;
  if (action === 'me') return json(await view(env, uid));
  if (action === 'join') {
    const code = String(body.code || '').trim().toUpperCase();
    const t = await env.DB.prepare('SELECT * FROM teams WHERE code=?').bind(code).first();
    if (!(await hit(env, 'teamjoin:' + uid, 10, 3600))) return json({ ok: false, error: 'rate' }, 429);
    if (!t) return json({ ok: false, error: 'code', message: 'Diesen Team-Code gibt es nicht.' }, 404);
    if (t.expires_at <= now()) return json({ ok: false, error: 'expired', message: 'Die Team-Lizenz ist abgelaufen. Frag deinen Coach.' }, 403);
    const cur = await env.DB.prepare('SELECT team_id FROM team_members WHERE user_id=?').bind(uid).first();
    if (cur && cur.team_id === t.id) return json({ ok: false, error: 'already', message: 'Du bist schon in diesem Team.' }, 409);
    if (cur) return json({ ok: false, error: 'other', message: 'Du bist schon in einem Team. Verlasse es zuerst.' }, 409);
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM team_members WHERE team_id=?').bind(t.id).first()).n;
    if (n >= t.seats) return json({ ok: false, error: 'full', message: 'Das Team ist voll.' }, 409);
    await env.DB.prepare('INSERT INTO team_members (team_id,user_id,name,joined_at) VALUES (?,?,?,?)').bind(t.id, uid, cleanName(s.username, 'Spieler'), now()).run();
    return json(await view(env, uid));
  }
  if (action === 'leave') {
    const m = await env.DB.prepare('SELECT m.team_id, t.owner_id FROM team_members m JOIN teams t ON t.id=m.team_id WHERE m.user_id=?').bind(uid).first();
    if (!m) return json({ ok: true, role: null });
    if (m.owner_id === uid) return json({ ok: false, error: 'owner', message: 'Der Coach kann sein Team nicht verlassen.' }, 403);
    await env.DB.prepare('DELETE FROM team_members WHERE user_id=?').bind(uid).run();
    return json({ ok: true, role: null });
  }
  if (action === 'sync') {
    const st = cleanStats(body.stats);
    if (!st) return json({ ok: false, error: 'stats' }, 400);
    const r = await env.DB.prepare('UPDATE team_members SET stats=?, updated_at=? WHERE user_id=?').bind(JSON.stringify(st), now(), uid).run();
    return json({ ok: !!(r.meta && r.meta.changes) });
  }
  const t = await env.DB.prepare('SELECT * FROM teams WHERE owner_id=?').bind(uid).first();
  if (!t || t.expires_at <= now()) return json({ ok: false, error: 'coach', message: 'Das kann nur der Coach mit aktiver Team-Lizenz.' }, 403);
  if (action === 'kick') {
    const target = String(body.id || '');
    if (target === uid) return json({ ok: false, error: 'self', message: 'Du kannst dich nicht selbst entfernen.' }, 400);
    await env.DB.prepare('DELETE FROM team_members WHERE team_id=? AND user_id=?').bind(t.id, target).run();
    return json(await view(env, uid));
  }
  if (action === 'rename') {
    await env.DB.prepare('UPDATE teams SET name=? WHERE id=?').bind(cleanName(body.name, t.name), t.id).run();
    return json(await view(env, uid));
  }
  return json({ ok: false, error: 'action' }, 400);
}
