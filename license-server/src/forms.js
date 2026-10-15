// Feedback- und Bug-Formulare (Buttons -> Modal -> Embed im Kanal) + Team-Statusbuttons fuer Bugs.
import { now, emb, eph, bad, COL, fmtDateTime } from './util.js';
import { dapi, isTeam } from './discord.js';
import { hit } from './auth.js';

const row = (id, label, style, max, ph, req = true) => ({ type: 1, components: [{ type: 4, custom_id: id, label, style, max_length: max, required: req, placeholder: ph }] });

export function openForm(kind) {
  if (kind === 'bug') return { type: 9, data: { custom_id: 'modal_bug', title: 'Fehler melden', components: [
    row('f_title', 'Kurzer Titel', 1, 80, 'z. B. Replay lädt nicht'),
    row('f_text', 'Was ist passiert?', 2, 1000, 'Beschreibe den Fehler so genau wie möglich'),
    row('f_steps', 'Schritte / Version der App', 2, 500, '1. … 2. … (App-Version steht unten links)', false)] } };
  return { type: 9, data: { custom_id: 'modal_feedback', title: 'Feedback senden', components: [
    row('f_title', 'Worum geht es?', 1, 80, 'z. B. Idee für den Viewer'),
    row('f_text', 'Dein Feedback', 2, 1000, 'Was gefällt dir, was fehlt, was kann besser werden?')] } };
}

const val = (i, id) => { for (const r of i.data.components || []) for (const c of r.components || []) if (c.custom_id === id) return String(c.value || '').trim(); return ''; };
const STATUS = { open: ['🔴 Offen', 0xe5484d], prog: ['🛠️ In Arbeit', 0xf1c40f], done: ['✅ Erledigt', 0x2ecc71] };

export async function submitForm(i, env, uid, kind) {
  if (!(await hit(env, 'form:' + uid, 5, 3600))) return bad(env, 'Zu viele Meldungen', 'Bitte warte kurz, bevor du eine weitere sendest.');
  const title = val(i, 'f_title').slice(0, 80), text = val(i, 'f_text').slice(0, 1000), steps = val(i, 'f_steps').slice(0, 500);
  const ch = kind === 'bug' ? env.BUG_CHANNEL_ID : env.FEEDBACK_CHANNEL_ID;
  if (!ch) return bad(env, 'Noch nicht eingerichtet', 'Das Team muss zuerst `/setup` ausführen.');
  const u = (i.member && i.member.user) || i.user || {};
  const bug = kind === 'bug';
  const e = emb(env, { title: `${bug ? '🐛' : '💌'} ${title || (bug ? 'Fehlerbericht' : 'Feedback')}`, color: bug ? STATUS.open[1] : COL.brand, desc: text,
    fields: [{ name: 'Von', value: `<@${uid}> (${u.username || 'unbekannt'})`, inline: true }, { name: 'Zeit', value: fmtDateTime(now()), inline: true }, ...(bug ? [{ name: 'Status', value: STATUS.open[0], inline: true }] : []), ...(steps ? [{ name: 'Schritte / Version', value: steps }] : [])] });
  const payload = { embeds: [e] };
  if (bug) payload.components = [{ type: 1, components: [{ type: 2, style: 2, label: 'In Arbeit', custom_id: 'rep_prog', emoji: { name: '🛠️' } }, { type: 2, style: 3, label: 'Erledigt', custom_id: 'rep_done', emoji: { name: '✅' } }] }];
  const r = await dapi(env, 'POST', `/channels/${ch}/messages`, payload);
  if (!r.ok) return bad(env, 'Nicht gesendet', 'Die Meldung konnte nicht gepostet werden. Bitte versuche es später erneut.');
  await env.DB.prepare('INSERT INTO reports (kind,user_id,title,created_at) VALUES (?,?,?,?)').bind(kind, uid, title, now()).run();
  return eph(env, { title: bug ? 'Fehler gemeldet' : 'Danke für dein Feedback', color: COL.ok, desc: `Deine Meldung wurde gepostet: <#${ch}>` });
}

// Team setzt den Status eines Bugs
export function setBugStatus(i, env, status) {
  if (!isTeam(env, i)) return bad(env, 'Keine Berechtigung', 'Nur das Team kann den Status ändern.');
  const src = (i.message && i.message.embeds && i.message.embeds[0]) || null;
  if (!src) return bad(env, 'Meldung nicht gefunden', '');
  const [label, color] = STATUS[status];
  const fields = (src.fields || []).map(f => f.name === 'Status' ? { ...f, value: label } : f);
  const done = status === 'done';
  return { type: 7, data: { embeds: [{ ...src, color, fields }], components: done ? [] : i.message.components } };
}
