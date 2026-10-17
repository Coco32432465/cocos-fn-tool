// Community-Paket 2: Wochen-Cup (cup.js), Event-Kalender mit Zu-/Absage, woechentlicher Newsletter.
import { now, emb, eph, bad, COL } from './util.js';
import { dapi, tryDM, getCfg, setCfg, editMsg, isTeam, isCodeManager } from './discord.js';
import { topRanks } from './rank.js';
import { TIPS } from './fun.js';
import { cupFinish } from './cup.js';

const TZ = 'Europe/Berlin';
const mrow = (id, label, style, max, ph, req = true) => ({ type: 1, components: [{ type: 4, custom_id: id, label, style, max_length: max, required: req, placeholder: ph }] });
const mval = (i, id) => { for (const r of i.data.components || []) for (const c of r.components || []) if (c.custom_id === id) return String(c.value || '').trim(); return ''; };

/* ---------- Zeit in Berlin ---------- */
export function berlin(ts) {
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(ts * 1000)).forEach(x => { p[x.type] = x.value; });
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) }; // wd: 0 = Montag
}
const off = ts => { const b = berlin(ts); return Date.UTC(b.y, b.mo - 1, b.d, b.h, b.mi) / 1000 - Math.floor(ts / 60) * 60; };
export function parseBerlin(str, t = now()) {
  const m = String(str).trim().match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?\s*(?:um\s*)?(\d{1,2})[:.](\d{2})(?:\s*uhr)?$/i);
  if (!m) return null;
  const y = m[3] ? +m[3] : berlin(t).y, mo = +m[2], d = +m[1], h = +m[4], mi = +m[5];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const g = Date.UTC(y, mo - 1, d, h, mi) / 1000;
  let ts = g - off(g); ts = g - off(ts);
  if (!m[3] && ts < t - 86400) { const g2 = Date.UTC(y + 1, mo - 1, d, h, mi) / 1000; ts = g2 - off(g2); }
  return ts;
}
// Kalenderwoche als Schluessel (Montag der Woche, Berlin)
export const weekKey = t => { const b = berlin(t), mon = new Date(Date.UTC(b.y, b.mo - 1, b.d - b.wd)); return mon.toISOString().slice(0, 10); };

/* ---------- Wochen-Sieger = Wöchentlicher Cup (cup.js) ---------- */
export const weeklySweep = (env, t = now()) => cupFinish(env, t);

/* ---------- Newsletter ---------- */
export async function newsletterSweep(env, t = now()) {
  const b = berlin(t); if (b.wd !== 6 || b.h < 18) return; // Sonntag ab 18 Uhr
  const key = 'news:' + weekKey(t); if (await getCfg(env, key)) return;
  await setCfg(env, key, '1');
  const ch = env.GENERAL_CHANNEL_ID; if (!ch) return;
  const top = await topRanks(env, 3), ev = (await env.DB.prepare("SELECT * FROM events WHERE status='open' AND starts_at>? ORDER BY starts_at LIMIT 3").bind(t).all()).results || [];
  const act = (await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE last_seen>?').bind(t - 7 * 86400).first()).n;
  const tip = TIPS[Math.floor(t / 604800) % TIPS.length];
  const M = ['🥇', '🥈', '🥉'];
  const fields = [
    { name: '🥇 Top 3 der Rangliste', value: top.length ? top.map((r, k) => `${M[k]} **${String(r.name).replace(/[*_`~|]/g, '')}** · Ø ${Math.round(r.avg_score)}`).join('\n') : 'Noch leer. Sei der Erste!' },
    { name: '📅 Nächste Events', value: ev.length ? ev.map(e => `<t:${e.starts_at}:f> · **${e.title}**`).join('\n') : 'Gerade nichts geplant.' },
    { name: `💡 Tipp der Woche · ${tip[0]}`, value: tip[1] }];
  await dapi(env, 'POST', `/channels/${ch}/messages`, { embeds: [emb(env, { title: '📰 Ninjago Tools · Wochenrückblick', color: COL.brand, desc: `Diese Woche waren **${act}** Spieler mit der App aktiv. Hier dein Überblick:`, fields })] });
}

/* ---------- Events ---------- */
export const openEventModal = () => ({ type: 9, data: { custom_id: 'modal_event', title: 'Neues Event', components: [
  mrow('f_title', 'Titel', 1, 80, 'z. B. Scrim-Abend Duo'),
  mrow('f_when', 'Wann? (TT.MM. HH:MM, deutsche Zeit)', 1, 20, '24.10. 20:00'),
  mrow('f_desc', 'Beschreibung', 2, 500, 'Modus, Regeln, Anmeldung …', false)] } });

export async function eventEmbed(env, e) {
  const rs = (await env.DB.prepare('SELECT user_id, yes FROM event_rsvp WHERE event_id=? ORDER BY rowid').bind(e.id).all()).results || [];
  const yes = rs.filter(r => r.yes), no = rs.length - yes.length;
  return emb(env, { title: '📅 ' + e.title, color: e.status === 'open' ? COL.brand : COL.neutral, desc: (e.descr ? e.descr + '\n\n' : '') + `🕒 <t:${e.starts_at}:F> (<t:${e.starts_at}:R>)`,
    fields: [{ name: `✅ Dabei (${yes.length})`, value: yes.length ? yes.slice(0, 25).map(r => `<@${r.user_id}>`).join(' ') + (yes.length > 25 ? ' …' : '') : 'noch niemand' },
      { name: '❌ Absagen', value: String(no), inline: true }, { name: 'Von', value: `<@${e.created_by}>`, inline: true }] });
}
const evRows = (e, dis) => [{ type: 1, components: [{ type: 2, style: 3, label: 'Ich bin dabei', custom_id: 'event_yes:' + e.id, disabled: !!dis }, { type: 2, style: 4, label: 'Absagen', custom_id: 'event_no:' + e.id, disabled: !!dis }] }];

export async function submitEvent(i, env, uid) {
  if (!isTeam(env, i) && !isCodeManager(env, i)) return bad(env, 'Keine Berechtigung', 'Events legt das Team an.');
  const title = mval(i, 'f_title').slice(0, 80), ts = parseBerlin(mval(i, 'f_when'));
  if (!title) return bad(env, 'Titel fehlt', '');
  if (!ts || ts < now()) return bad(env, 'Zeit nicht erkannt', 'Bitte so: `24.10. 20:00` (deutsche Zeit, in der Zukunft).');
  if (!env.EVENT_CHANNEL_ID) return bad(env, 'Kein Event-Kanal', 'Führe `/setup erneuern` aus, dann gibt es den Kanal **events**.');
  const r = await env.DB.prepare("INSERT INTO events (title,descr,starts_at,created_by,created_at,status) VALUES (?,?,?,?,?,'open')").bind(title, mval(i, 'f_desc').slice(0, 500), ts, uid, now()).run();
  const e = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(r.meta.last_row_id).first();
  const p = await dapi(env, 'POST', `/channels/${env.EVENT_CHANNEL_ID}/messages`, { embeds: [await eventEmbed(env, e)], components: evRows(e) });
  if (!p.ok) { await env.DB.prepare('DELETE FROM events WHERE id=?').bind(e.id).run(); return bad(env, 'Posten fehlgeschlagen', 'Bot-Rechte im Kanal **events** prüfen.'); }
  await env.DB.prepare('UPDATE events SET channel_id=?, message_id=? WHERE id=?').bind(env.EVENT_CHANNEL_ID, p.data.id, e.id).run();
  return eph(env, { title: 'Event erstellt', color: COL.ok, desc: `**${title}** steht in <#${env.EVENT_CHANNEL_ID}>. Zusagen bekommen 30 Minuten vorher eine Erinnerung per DM.` });
}

export async function eventButton(i, env, uid, yes, id) {
  const e = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(Number(id)).first();
  if (!e || e.status !== 'open') return bad(env, 'Event vorbei', 'Dieses Event ist nicht mehr offen.');
  await env.DB.prepare('INSERT INTO event_rsvp (event_id,user_id,yes,reminded) VALUES (?,?,?,0) ON CONFLICT(event_id,user_id) DO UPDATE SET yes=excluded.yes').bind(e.id, uid, yes ? 1 : 0).run();
  return { type: 7, data: { embeds: [await eventEmbed(env, e)], components: evRows(e) } };
}

export async function eventSweep(env, t = now()) {
  const due = (await env.DB.prepare("SELECT r.event_id, r.user_id, e.title, e.starts_at FROM event_rsvp r JOIN events e ON e.id=r.event_id WHERE r.yes=1 AND r.reminded=0 AND e.status='open' AND e.starts_at<=? AND e.starts_at>? LIMIT 8").bind(t + 1800, t - 600).all()).results || [];
  for (const r of due) {
    await env.DB.prepare('UPDATE event_rsvp SET reminded=1 WHERE event_id=? AND user_id=?').bind(r.event_id, r.user_id).run();
    await tryDM(env, r.user_id, { embeds: [emb(env, { title: '⏰ Gleich geht’s los', color: COL.brand, desc: `**${r.title}** startet <t:${r.starts_at}:R>. Bis gleich!` })] });
  }
  const old = (await env.DB.prepare("SELECT * FROM events WHERE status='open' AND starts_at<? LIMIT 3").bind(t - 7200).all()).results || [];
  for (const e of old) {
    await env.DB.prepare("UPDATE events SET status='done' WHERE id=?").bind(e.id).run();
    if (e.channel_id && e.message_id) await editMsg(env, e.channel_id, e.message_id, { embeds: [await eventEmbed(env, { ...e, status: 'done', title: e.title + ' (beendet)' })], components: evRows(e, true) });
  }
}
