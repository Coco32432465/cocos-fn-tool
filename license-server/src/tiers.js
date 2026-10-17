// Rollen-Stufen Bronze bis Diamant: aus Season-Level oder Daily-Spin-Streak (die App schickt beides mit dem Lebenszeichen).
import { now, emb, eph, COL } from './util.js';
import { addRole, delRole, tryDM } from './discord.js';

export const TIERS = [
  { id: 1, name: 'Bronze', emoji: '🥉', color: 0xcd7f32, level: 1, streak: 3 },
  { id: 2, name: 'Silber', emoji: '🥈', color: 0xc0c0c0, level: 3, streak: 7 },
  { id: 3, name: 'Gold', emoji: '🥇', color: 0xf1c40f, level: 5, streak: 14 },
  { id: 4, name: 'Platin', emoji: '💠', color: 0x4fd1c5, level: 7, streak: 21 },
  { id: 5, name: 'Diamant', emoji: '💎', color: 0x5dade2, level: 10, streak: 30 }
];
export const tierOf = (level, streak) => TIERS.reduce((t, x) => (level >= x.level || streak >= x.streak ? x.id : t), 0);
const roleOf = (env, id) => env['TIER' + id + '_ROLE_ID'];
const num = (v, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(hi, n) : null; };

// Aus dem Lebenszeichen: Stufe berechnen und bei Änderung die Rolle tauschen
export async function tierUpdate(env, uid, prog, t = now()) {
  if (!prog || typeof prog !== 'object') return null;
  const level = num(prog.level, 10), streak = num(prog.streak, 3650);
  if (level == null || streak == null) return null;
  const tier = tierOf(level, streak), old = await env.DB.prepare('SELECT * FROM tiers WHERE user_id=?').bind(uid).first();
  await env.DB.prepare(`INSERT INTO tiers (user_id,tier,level,streak,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET tier=excluded.tier,level=excluded.level,streak=excluded.streak,updated_at=excluded.updated_at`).bind(uid, tier, level, streak, t).run();
  const prev = old ? old.tier : 0;
  if (prev === tier) return tier;
  if (prev && roleOf(env, prev)) await delRole(env, uid, roleOf(env, prev));
  if (tier && roleOf(env, tier)) await addRole(env, uid, roleOf(env, tier));
  if (tier > prev) {
    const T = TIERS[tier - 1], next = TIERS[tier];
    await tryDM(env, uid, { embeds: [emb(env, { title: `${T.emoji} Neue Stufe: ${T.name}`, color: T.color, desc: `Stark! Du bist jetzt **${T.name}** und hast die passende Rolle im Discord.` + (next ? `\n\nNächste Stufe **${next.emoji} ${next.name}**: Season-Level ${next.level} oder ${next.streak} Tage Daily-Spin-Streak.` : '\n\nDas ist die höchste Stufe. Respekt!') })] });
  }
  return tier;
}

const reqLine = T => `${T.emoji} **${T.name}** · Season-Level ${T.level} oder ${T.streak} Tage Streak`;

// /stufe
export async function handleStufe(i, env, uid) {
  const me = await env.DB.prepare('SELECT * FROM tiers WHERE user_id=?').bind(uid).first(), cur = me ? me.tier : 0, T = TIERS[cur - 1], next = TIERS[cur];
  return eph(env, { title: T ? `${T.emoji} Deine Stufe: ${T.name}` : 'Noch keine Stufe', color: T ? T.color : COL.neutral,
    desc: (me ? `Season-Level **${me.level}** · Daily-Spin-Streak **${me.streak} Tag${me.streak === 1 ? '' : 'e'}**` : 'Verbinde die App mit Discord. Deine Stufe kommt dann automatisch.') + (next ? `\n\nNächste Stufe: ${reqLine(next)}` : ''),
    fields: [{ name: 'Alle Stufen', value: TIERS.map(reqLine).join('\n') }, { name: 'So steigst du auf', value: 'Level im Season-Pass sammeln oder jeden Tag den Daily Spin drehen. Die Rolle aktualisiert sich von selbst, solange die App läuft.' }] });
}
