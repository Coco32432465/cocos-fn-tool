// Clip des Monats: /clip einreichen postet den Clip mit Abstimm-Button, am 1. des Monats gewinnt der Clip mit den meisten Stimmen.
// Preis: Titel „Clip des Monats“ in der App (Entitlement title:clip, kommt mit dem nächsten Lizenz-Abgleich).
import { now, emb, eph, bad, COL } from './util.js';
import { dapi, tryDM, getCfg, setCfg } from './discord.js';
import { berlin } from './community.js';
import { seasonId } from './season.js';

export const CLIP_HOSTS = ['youtube.com', 'youtu.be', 'tiktok.com', 'twitch.tv', 'medal.tv', 'streamable.com', 'outplayed.tv', 'allestars.com'];
export const CLIP_MAX = 2; // Clips pro Person und Monat
export const CLIP_ENT = 'title:clip';
const clean = s => String(s || '').replace(/[*_`~|@<>]/g, '').trim();

export function clipUrl(raw) {
  let u; try { u = new URL(String(raw || '').trim()); } catch (e) { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase().replace(/^(www\.|m\.|clips\.|vm\.)/, '');
  return CLIP_HOSTS.some(x => h === x || h.endsWith('.' + x)) ? u.toString() : null;
}
const voteRow = (id, n, off) => [{ type: 1, components: [{ type: 2, style: off ? 2 : 1, label: `Stimme · ${n}`, custom_id: 'clip_vote:' + id, emoji: { name: '👍' }, disabled: !!off }] }];
const votes = async (env, id) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM clip_votes WHERE clip_id=?').bind(id).first()).n;

export const clipTop = async (env, month, n = 5) => (await env.DB.prepare(`SELECT c.*, (SELECT COUNT(*) FROM clip_votes v WHERE v.clip_id=c.id) AS n FROM clips c WHERE c.month=? ORDER BY n DESC, c.created_at ASC LIMIT ?`).bind(month, n).all()).results || [];

export async function handleClip(i, env, uid) {
  const sub = (i.data.options || [])[0] || {}, opt = k => ((sub.options || []).find(o => o.name === k) || {}).value;
  const month = seasonId();
  if (sub.name === 'einreichen') {
    if (!env.CLIP_CHANNEL_ID) return bad(env, 'Noch nicht eingerichtet', 'Das Team muss zuerst `/setup` ausführen.');
    const url = clipUrl(opt('link')), title = clean(opt('titel')).slice(0, 80) || 'Mein Clip';
    if (!url) return bad(env, 'Link nicht erkannt', `Erlaubt sind Links von ${CLIP_HOSTS.join(', ')} (mit https://).`);
    const mine = (await env.DB.prepare('SELECT COUNT(*) AS n FROM clips WHERE user_id=? AND month=?').bind(uid, month).first()).n;
    if (mine >= CLIP_MAX) return bad(env, 'Limit erreicht', `Du kannst pro Monat ${CLIP_MAX} Clips einreichen.`);
    if (await env.DB.prepare('SELECT 1 AS x FROM clips WHERE url=? AND month=?').bind(url, month).first()) return bad(env, 'Schon eingereicht', 'Dieser Clip ist diesen Monat schon dabei.');
    const ins = await env.DB.prepare('INSERT INTO clips (user_id,url,title,month,channel_id,created_at) VALUES (?,?,?,?,?,?)').bind(uid, url, title, month, env.CLIP_CHANNEL_ID, now()).run();
    const id = ins.meta.last_row_id;
    const p = await dapi(env, 'POST', `/channels/${env.CLIP_CHANNEL_ID}/messages`, { content: `🎬 **${title}** von <@${uid}>\n${url}`, allowed_mentions: { parse: [] }, components: voteRow(id, 0) });
    if (!p.ok) { await env.DB.prepare('DELETE FROM clips WHERE id=?').bind(id).run(); return bad(env, 'Posten fehlgeschlagen', 'Bitte später erneut versuchen.'); }
    await env.DB.prepare('UPDATE clips SET message_id=? WHERE id=?').bind(p.data.id, id).run();
    return eph(env, { title: 'Clip eingereicht', color: COL.ok, desc: `Dein Clip steht jetzt in <#${env.CLIP_CHANNEL_ID}>. Am Monatsende gewinnt der Clip mit den meisten Stimmen den Titel **Clip des Monats** in der App.` });
  }
  if (sub.name === 'top') {
    const rows = await clipTop(env, month, 5);
    return eph(env, { title: '🎬 Clip des Monats · aktueller Stand', color: 0xf1c40f,
      desc: rows.length ? rows.map((r, k) => `**${k + 1}.** [${clean(r.title)}](https://discord.com/channels/${env.GUILD_ID}/${r.channel_id}/${r.message_id}) von <@${r.user_id}> · ${r.n} Stimme${r.n === 1 ? '' : 'n'}`).join('\n') : 'Diesen Monat wurde noch kein Clip eingereicht. Sei der Erste mit `/clip einreichen`!' });
  }
  return bad(env, 'Unbekannter Befehl', '');
}

export async function voteClip(i, env, uid, id) {
  const c = await env.DB.prepare('SELECT * FROM clips WHERE id=?').bind(Number(id)).first();
  if (!c) return bad(env, 'Clip nicht gefunden', '');
  if (c.month !== seasonId() || c.status !== 'open') return bad(env, 'Abstimmung beendet', 'Für diesen Clip kann nicht mehr abgestimmt werden.');
  if (c.user_id === uid) return bad(env, 'Eigener Clip', 'Für deinen eigenen Clip kannst du nicht stimmen.');
  const had = await env.DB.prepare('SELECT 1 AS x FROM clip_votes WHERE clip_id=? AND user_id=?').bind(c.id, uid).first();
  if (had) await env.DB.prepare('DELETE FROM clip_votes WHERE clip_id=? AND user_id=?').bind(c.id, uid).run();
  else await env.DB.prepare('INSERT OR IGNORE INTO clip_votes (clip_id,user_id) VALUES (?,?)').bind(c.id, uid).run();
  return { type: 7, data: { components: voteRow(c.id, await votes(env, c.id)) } };
}

// Am 1. des Monats ab 10 Uhr: Vormonat auswerten, Buttons sperren, Gewinner bekommt den Titel
export async function clipSweep(env, t = now()) {
  const b = berlin(t); if (b.d !== 1 || b.h < 10) return;
  const prev = seasonId(t - 2 * 86400), key = 'clipwin:' + prev;
  if (await getCfg(env, key)) return;
  await setCfg(env, key, '1');
  const rows = await clipTop(env, prev, 3);
  const all = (await env.DB.prepare("SELECT * FROM clips WHERE month=? AND status='open'").bind(prev).all()).results || [];
  await env.DB.prepare("UPDATE clips SET status='closed' WHERE month=?").bind(prev).run();
  for (const c of all.slice(0, 30)) if (c.message_id) await dapi(env, 'PATCH', `/channels/${c.channel_id}/messages/${c.message_id}`, { components: voteRow(c.id, await votes(env, c.id), true) });
  const w = rows[0];
  if (!w || !w.n) return;
  await env.DB.prepare("UPDATE clips SET status='won' WHERE id=?").bind(w.id).run();
  await env.DB.prepare('INSERT OR IGNORE INTO entitlements (user_id,ent,created_at) VALUES (?,?,?)').bind(w.user_id, CLIP_ENT, now()).run();
  await tryDM(env, w.user_id, { embeds: [emb(env, { title: '🎬 Dein Clip ist Clip des Monats!', color: 0xf1c40f, desc: `**${clean(w.title)}** hat mit ${w.n} Stimme${w.n === 1 ? '' : 'n'} gewonnen. In der App kannst du jetzt den Titel **🎬 Clip des Monats** wählen (Season-Pass → Dein Titel).` })] });
  const ch = w.channel_id || env.CLIP_CHANNEL_ID;
  if (ch) await dapi(env, 'POST', `/channels/${ch}/messages`, { content: `<@${w.user_id}>`, allowed_mentions: { users: [w.user_id] }, embeds: [emb(env, { title: '🏆 Clip des Monats', color: 0xf1c40f,
    desc: `Glückwunsch <@${w.user_id}>! **${clean(w.title)}** hat gewonnen.\n${w.url}\n\n${rows.map((r, k) => `${['🥇', '🥈', '🥉'][k]} ${clean(r.title)} · ${r.n} Stimme${r.n === 1 ? '' : 'n'}`).join('\n')}`,
    fields: [{ name: 'Neuer Monat', value: 'Ab jetzt läuft die nächste Runde. Reich deinen Clip mit `/clip einreichen` ein.' }] })] });
  return w.user_id;
}

export const clipPanel = env => ({ embeds: [emb(env, { banner: true, title: '🎬 Clip des Monats', desc: 'Zeig deinen besten Fortnite-Moment! Jeder Clip landet hier, und die Community stimmt per 👍 ab.',
  fields: [
    { name: 'Einreichen', value: `\`/clip einreichen\` mit Link und Titel (YouTube, TikTok, Twitch, Medal, Streamable, Outplayed). Bis zu ${CLIP_MAX} Clips pro Monat.` },
    { name: 'Abstimmen', value: 'Klick unter einem Clip auf **👍 Stimme**. Nochmal klicken nimmt die Stimme zurück. Für den eigenen Clip geht es nicht.', inline: true },
    { name: 'Preis', value: 'Am 1. des Monats gewinnt der Clip mit den meisten Stimmen den Titel **🎬 Clip des Monats** in der App.', inline: true },
    { name: 'Stand', value: '`/clip top` zeigt die aktuellen Top 5.' }] })] });
