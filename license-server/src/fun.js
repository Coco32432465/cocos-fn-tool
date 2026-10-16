// Community-Extras: Umfragen, Duo-/Squad-Suche (LFG), Erinnerungen, Pro-Tipps.
import { now, emb, eph, bad, COL } from './util.js';
import { dapi, tryDM, editMsg } from './discord.js';
import { parseDuration } from './giveaway.js';

const userOf = i => (i.member && i.member.user) || i.user || {};
const opt = (i, n) => ((i.data.options || []).find(x => x.name === n) || {}).value;

/* ---------- Umfragen ---------- */
const BAR = 10;
const bar = (n, total) => { const f = total ? Math.round(n / total * BAR) : 0; return '█'.repeat(f) + '░'.repeat(BAR - f); };
const pollRows = (p, dis) => [{ type: 1, components: JSON.parse(p.options).map((o, k) => ({ type: 2, style: 1, label: o.slice(0, 80), custom_id: 'poll_' + k, disabled: !!dis })) }];

async function pollCounts(env, id) {
  const rows = (await env.DB.prepare('SELECT opt, COUNT(*) AS n FROM poll_votes WHERE poll_id=? GROUP BY opt').bind(id).all()).results || [];
  const c = {}; rows.forEach(r => { c[r.opt] = r.n; });
  return c;
}

export function pollEmbed(env, p, counts, ended) {
  const opts = JSON.parse(p.options), total = Object.values(counts).reduce((a, b) => a + b, 0);
  const top = Math.max(0, ...opts.map((_, k) => counts[k] || 0));
  const lines = opts.map((o, k) => {
    const n = counts[k] || 0, pct = total ? Math.round(n / total * 100) : 0;
    return `${ended && n === top && top > 0 ? '🏆' : '▫️'} **${o}**\n\`${bar(n, total)}\` ${n} Stimme${n === 1 ? '' : 'n'} · ${pct} %`;
  });
  return emb(env, { title: (ended ? '📊 Umfrage beendet: ' : '📊 ') + p.question, color: ended ? COL.neutral : COL.brand,
    desc: lines.join('\n\n'),
    fields: [{ name: ended ? 'Beendet' : 'Endet', value: `<t:${p.ends_at}:${ended ? 'f' : 'R'}>`, inline: true }, { name: 'Stimmen', value: String(total), inline: true }, { name: 'Von', value: `<@${p.host}>`, inline: true }] });
}

async function pollStart(i, env, uid) {
  const q = String(opt(i, 'frage') || '').trim().slice(0, 200);
  const opts = String(opt(i, 'optionen') || '').split(/[;|]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
  if (!q) return bad(env, 'Frage fehlt', '');
  if (opts.length < 2) return bad(env, 'Zu wenige Optionen', 'Gib 2 bis 5 Optionen an, getrennt mit Semikolon: `Duo; Trio; Squad`.');
  const sec = opt(i, 'dauer') ? parseDuration(opt(i, 'dauer')) : 86400;
  if (!sec) return bad(env, 'Dauer ungültig', 'Beispiele: `30m`, `2h`, `3d`. Standard ist 24 Stunden.');
  const p = { question: q, options: JSON.stringify(opts), ends_at: now() + sec, host: uid };
  const msg = await dapi(env, 'POST', `/channels/${i.channel_id}/messages`, { embeds: [pollEmbed(env, p, {}, false)], components: pollRows(p) });
  if (!msg.ok) return bad(env, 'Umfrage nicht gepostet', 'Dem Bot fehlt die Berechtigung im Kanal.');
  await env.DB.prepare('INSERT INTO polls (channel_id,message_id,question,options,ends_at,host,status,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(i.channel_id, msg.data.id, q, p.options, p.ends_at, uid, 'active', now()).run();
  return eph(env, { title: 'Umfrage gestartet', color: COL.ok, desc: `Endet <t:${p.ends_at}:R>. Teilnehmer ändern ihre Stimme, indem sie eine andere Option anklicken; dieselbe Option nochmal = Stimme zurückziehen.` });
}

export async function votePoll(i, env, uid, k) {
  const p = await env.DB.prepare('SELECT * FROM polls WHERE message_id=?').bind(i.message && i.message.id).first();
  if (!p) return bad(env, 'Umfrage nicht gefunden', '');
  if (p.status !== 'active' || p.ends_at <= now()) return bad(env, 'Umfrage beendet', 'Abstimmen ist nicht mehr möglich.');
  if (!(k >= 0 && k < JSON.parse(p.options).length)) return bad(env, 'Ungültige Option', '');
  const had = await env.DB.prepare('SELECT opt FROM poll_votes WHERE poll_id=? AND user_id=?').bind(p.id, uid).first();
  if (had && had.opt === k) await env.DB.prepare('DELETE FROM poll_votes WHERE poll_id=? AND user_id=?').bind(p.id, uid).run();
  else await env.DB.prepare('INSERT INTO poll_votes (poll_id,user_id,opt) VALUES (?,?,?) ON CONFLICT(poll_id,user_id) DO UPDATE SET opt=excluded.opt').bind(p.id, uid, k).run();
  return { type: 7, data: { embeds: [pollEmbed(env, p, await pollCounts(env, p.id), false)], components: pollRows(p) } };
}

export async function pollSweep(env, max = 3) {
  const due = (await env.DB.prepare("SELECT * FROM polls WHERE status='active' AND ends_at<=? ORDER BY ends_at LIMIT ?").bind(now(), max).all()).results || [];
  for (const p of due) {
    const claim = await env.DB.prepare("UPDATE polls SET status='ended' WHERE id=? AND status='active'").bind(p.id).run();
    if (!(claim.meta && claim.meta.changes)) continue;
    await editMsg(env, p.channel_id, p.message_id, { embeds: [pollEmbed(env, p, await pollCounts(env, p.id), true)], components: pollRows(p, true) });
  }
  return due.length;
}

/* ---------- Duo-/Squad-Suche ---------- */
const LFG_SLOTS = { duo: 2, trio: 3, squad: 4 };
const LFG_NAME = { duo: 'Duo', trio: 'Trio', squad: 'Squad' };
const lfgRows = (full, closed) => [{ type: 1, components: [
  { type: 2, style: 3, label: 'Beitreten', custom_id: 'lfg_join', emoji: { name: '🎮' }, disabled: full || closed },
  { type: 2, style: 2, label: 'Verlassen', custom_id: 'lfg_leave', disabled: closed }] }];

export function lfgEmbed(env, g) {
  const mem = JSON.parse(g.members), full = mem.length >= g.slots, closed = g.status !== 'open';
  return emb(env, { title: `🎮 ${g.mode} gesucht ${full ? '· VOLL' : closed ? '· geschlossen' : ''}`.trim(), color: closed ? COL.neutral : full ? COL.ok : 0xf1c40f,
    desc: (g.note ? `*${g.note}*\n\n` : '') + mem.map((u, k) => `${k === 0 ? '👑' : '🎮'} <@${u}>`).join('\n') + Array.from({ length: Math.max(0, g.slots - mem.length) }, () => '\n▫️ *frei*').join(''),
    fields: [{ name: 'Plätze', value: `${mem.length}/${g.slots}`, inline: true }, { name: 'Host', value: `<@${g.host}>`, inline: true }] });
}

async function lfgStart(i, env, uid) {
  const mode = LFG_NAME[opt(i, 'modus')] || 'Duo', slots = LFG_SLOTS[opt(i, 'modus')] || 2;
  const note = String(opt(i, 'info') || '').trim().slice(0, 140);
  const g = { mode, slots, note, host: uid, members: JSON.stringify([uid]), status: 'open' };
  const msg = await dapi(env, 'POST', `/channels/${i.channel_id}/messages`, { embeds: [lfgEmbed(env, g)], components: lfgRows(false, false) });
  if (!msg.ok) return bad(env, 'Suche nicht gepostet', 'Dem Bot fehlt die Berechtigung im Kanal.');
  await env.DB.prepare('INSERT INTO lfg (channel_id,message_id,host,mode,slots,note,members,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(i.channel_id, msg.data.id, uid, mode, slots, note, g.members, 'open', now()).run();
  return eph(env, { title: 'Suche gepostet', color: COL.ok, desc: `Du bekommst eine Nachricht im Kanal, sobald alle Plätze belegt sind. Du schließt die Suche mit **Verlassen**.` });
}

export async function lfgButton(i, env, uid, join) {
  const g = await env.DB.prepare('SELECT * FROM lfg WHERE message_id=?').bind(i.message && i.message.id).first();
  if (!g) return bad(env, 'Suche nicht gefunden', '');
  if (g.status === 'closed') return bad(env, 'Suche beendet', '');
  let mem = JSON.parse(g.members), closed = false;
  if (join) {
    if (mem.includes(uid)) return bad(env, 'Du bist schon dabei', 'Mit **Verlassen** trittst du wieder aus.');
    if (mem.length >= g.slots) return bad(env, 'Schon voll', '');
    mem.push(uid);
  } else if (uid === g.host) {
    mem = mem.slice(0, 1); closed = true;
  } else {
    if (!mem.includes(uid)) return bad(env, 'Du bist nicht dabei', '');
    mem = mem.filter(u => u !== uid);
  }
  const full = !closed && mem.length >= g.slots, status = closed ? 'closed' : full ? 'full' : 'open';
  await env.DB.prepare('UPDATE lfg SET members=?, status=? WHERE id=?').bind(JSON.stringify(mem), status, g.id).run();
  const res = { type: 7, data: { embeds: [lfgEmbed(env, { ...g, members: JSON.stringify(mem), status: closed ? 'closed' : 'open' })], components: lfgRows(full, closed) } };
  if (full) res._full = { channel: g.channel_id, msg: g.message_id, host: g.host, members: mem, mode: g.mode };
  return res;
}

export const lfgFullNote = (env, f) => dapi(env, 'POST', `/channels/${f.channel}/messages`, {
  content: `🎮 **${f.mode} ist komplett!** ${f.members.map(u => `<@${u}>`).join(' ')} – viel Erfolg in der Lobby!`,
  message_reference: { message_id: f.msg, fail_if_not_exists: false }, allowed_mentions: { users: f.members } });

/* ---------- Erinnerungen ---------- */
async function remindSet(i, env, uid) {
  const sec = parseDuration(opt(i, 'in')), text = String(opt(i, 'text') || '').trim().slice(0, 300);
  if (!sec) return bad(env, 'Zeit ungültig', 'Beispiele: `30m`, `2h`, `3d` (1 Minute bis 30 Tage).');
  if (!text) return bad(env, 'Text fehlt', '');
  const open = (await env.DB.prepare('SELECT COUNT(*) AS n FROM reminders WHERE user_id=? AND sent=0').bind(uid).first()).n;
  if (open >= 10) return bad(env, 'Zu viele Erinnerungen', 'Du kannst höchstens 10 offene Erinnerungen haben.');
  const due = now() + sec;
  await env.DB.prepare('INSERT INTO reminders (user_id,text,due,sent) VALUES (?,?,?,0)').bind(uid, text, due).run();
  return eph(env, { title: '⏰ Erinnerung gesetzt', color: COL.ok, desc: `Ich schreibe dir <t:${due}:R> eine private Nachricht:\n> ${text}`, fields: [{ name: 'Hinweis', value: 'Private Nachrichten vom Server müssen erlaubt sein.' }] });
}

export async function reminderSweep(env, max = 8) {
  const due = (await env.DB.prepare('SELECT * FROM reminders WHERE sent=0 AND due<=? ORDER BY due LIMIT ?').bind(now(), max).all()).results || [];
  for (const r of due) {
    const claim = await env.DB.prepare('UPDATE reminders SET sent=1 WHERE id=? AND sent=0').bind(r.id).run();
    if (claim.meta && claim.meta.changes) await tryDM(env, r.user_id, { embeds: [emb(env, { title: '⏰ Erinnerung', desc: r.text })] });
  }
  await env.DB.prepare('DELETE FROM reminders WHERE sent=1 AND due<?').bind(now() - 86400).run().catch(() => {});
  return due.length;
}

async function remindList(i, env, uid) {
  const rows = (await env.DB.prepare('SELECT * FROM reminders WHERE user_id=? AND sent=0 ORDER BY due').bind(uid).all()).results || [];
  return eph(env, { title: '⏰ Deine Erinnerungen', color: rows.length ? COL.brand : COL.neutral, desc: rows.length ? rows.map(r => `**#${r.id}** · <t:${r.due}:R> · ${r.text}`).join('\n') : 'Keine offenen Erinnerungen.' });
}

export async function handleRemind(i, env, uid) {
  const sub = i.data.options[0].name;
  if (sub === 'liste') return remindList(i, env, uid);
  if (sub === 'löschen') {
    const r = await env.DB.prepare('DELETE FROM reminders WHERE id=? AND user_id=? AND sent=0').bind(opt({ data: i.data.options[0] }, 'id'), uid).run();
    return r.meta && r.meta.changes ? eph(env, { title: 'Erinnerung gelöscht', color: COL.ok }) : bad(env, 'Nicht gefunden', 'Prüfe die ID mit `/erinnerung liste`.');
  }
  return remindSet({ data: i.data.options[0] }, env, uid);
}

/* ---------- Pro-Tipps ---------- */
export const TIPS = [
  ['Rotation', 'Plane deine nächste Zone schon, bevor der Kreis zugeht. Wer früh rotiert, kämpft auf seinen Bedingungen statt im Gedränge.'],
  ['Landung', 'Lande dort, wo du im Schnitt am meisten überlebst. Zehn Landungen am selben Ort zeigen dir die Gegnermuster besser als zehn verschiedene.'],
  ['Aim', 'Fünf Minuten Aufwärmen im Kreativmodus vor der Session bringt mehr als eine Stunde blindes Spielen. Spiel erst, wenn die Hand warm ist.'],
  ['Endgame', 'Im Endgame zählen Höhe und Position vor Waffen. Nimm dir einen Platz, von dem du zwei Seiten kontrollierst.'],
  ['Boxfight', 'Bau erst, wenn du musst, und spiele dann aus der Deckung. Wer zuerst die höhere Position hat, gewinnt meist den Edit-Kampf.'],
  ['Teamplay', 'Sagt im Team Ziel, Position und Mats laut an. Ein kurzes „Eins unten, zwei Mats” rettet mehr Runden als jede perfekte Mechanik.'],
  ['VOD-Review', 'Schau dir pro Runde nur drei Dinge an: wo du gestorben bist, warum du dort warst, und was du eine Minute vorher hättest ändern können.'],
  ['Mindset', 'Nach einer Niederlage nicht sofort in die nächste Lobby. Eine kurze Pause und ein Gedanke, was du ändern willst, verhindert Tilt.'],
  ['Loot', 'Hör beim Looten auf die Umgebung. Wer ohne Sound plündert, wird von hinten überrascht.'],
  ['Storm', 'Der Sturm kostet Zeit. Wer ihn mit Heilung oder Mobilität vorbereitet, muss nicht in schlechten Positionen rotieren.']
];
const tip = (env, k) => { const t = TIPS[k % TIPS.length]; return eph(env, { title: `💡 Tipp · ${t[0]}`, desc: t[1] }); };
export function handleTipp(env) { const b = new Uint32Array(1); crypto.getRandomValues(b); return tip(env, b[0]); }

/* ---------- Routing ---------- */
export async function handleFun(i, env, uid) {
  const n = i.data.name;
  if (n === 'umfrage') return pollStart(i, env, uid);
  if (n === 'lfg') return lfgStart(i, env, uid);
  if (n === 'erinnerung') return handleRemind(i, env, uid);
  if (n === 'tipp') return handleTipp(env);
  return null;
}
export const _userOf = userOf;
