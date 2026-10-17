// Giveaways: Team startet per Befehl, Teilnahme per Button, Ende automatisch (Cron/Alarm), Gewinner bekommen sofort ein privates Ticket.
import { now, emb, eph, bad, COL } from './util.js';
import { dapi, tryDM, isTeam } from './discord.js';
import { makeTicketChannel } from './tickets.js';

const CLOSE = [{ type: 1, components: [{ type: 2, style: 2, label: 'Ticket schließen', custom_id: 'ticket_close' }] }];
const JOIN = dis => [{ type: 1, components: [{ type: 2, style: 3, label: 'Teilnehmen', custom_id: 'gw_join', emoji: { name: '🎉' }, disabled: !!dis }] }];

export function parseDuration(s) {
  const m = String(s || '').trim().toLowerCase().match(/^(\d{1,4})\s*(m|min|h|std|d|t|tag|tage)$/);
  if (!m) return null;
  const n = Number(m[1]), u = m[2], sec = n * (u === 'm' || u === 'min' ? 60 : u === 'h' || u === 'std' ? 3600 : 86400);
  return sec >= 60 && sec <= 30 * 86400 ? sec : null;
}

function giveEmbed(env, g, count, ended, winners) {
  return emb(env, {
    title: ended ? '🎉 Giveaway beendet' : '🎉 GIVEAWAY', color: ended ? COL.neutral : 0xf1c40f,
    desc: `**${g.prize}**\n\n${ended ? (winners && winners.length ? `🏆 **Gewinner:** ${winners.map(w => `<@${w}>`).join(', ')}` : 'Es gab keine Teilnehmer.') : 'Klicke auf **Teilnehmen**. Gewinner werden automatisch ausgelost und bekommen ein privates Ticket.'}`,
    fields: [
      { name: ended ? 'Beendet' : 'Endet', value: `<t:${g.ends_at}:${ended ? 'f' : 'R'}>`, inline: true },
      { name: 'Gewinner', value: String(g.winners), inline: true },
      { name: 'Teilnehmer', value: String(count), inline: true },
      { name: 'Gehostet von', value: `<@${g.host}>`, inline: true }
    ]
  });
}

const countOf = async (env, id) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM gw_entries WHERE gw_id=?').bind(id).first()).n;

const mrow = (id, label, style, max, ph, req = true) => ({ type: 1, components: [{ type: 4, custom_id: id, label, style, max_length: max, required: req, placeholder: ph }] });
const mval = (i, id) => { for (const r of i.data.components || []) for (const c of r.components || []) if (c.custom_id === id) return String(c.value || '').trim(); return ''; };
export const openGiveawayModal = () => ({ type: 9, data: { custom_id: 'modal_giveaway', title: 'Giveaway starten', components: [
  mrow('f_prize', 'Was gibt es zu gewinnen?', 1, 200, 'z. B. 1 Monat Ninjago Tools Lizenz'),
  mrow('f_dur', 'Dauer (z. B. 30m, 2h, 3d)', 1, 6, '3d'),
  mrow('f_win', 'Anzahl Gewinner (1 bis 10)', 1, 2, '1', false)] } });

export async function submitGiveaway(i, env, uid) {
  if (!isTeam(env, i)) return bad(env, 'Keine Berechtigung', 'Giveaways kann nur das Team verwalten.');
  const prize = mval(i, 'f_prize').slice(0, 200), sec = parseDuration(mval(i, 'f_dur'));
  if (!prize) return bad(env, 'Preis fehlt', '');
  if (!sec) return bad(env, 'Dauer ungültig', 'Beispiele: `30m`, `2h`, `3d` (1 Minute bis 30 Tage).');
  const winners = Math.min(10, Math.max(1, Number(mval(i, 'f_win')) || 1));
  const ch = env.GIVEAWAY_CHANNEL_ID || i.channel_id, ends = now() + sec;
  const g = { prize, winners, ends_at: ends, host: uid };
  const msg = await dapi(env, 'POST', `/channels/${ch}/messages`, { embeds: [giveEmbed(env, g, 0)], components: JOIN() });
  if (!msg.ok) return bad(env, 'Giveaway nicht gepostet', 'Dem Bot fehlt die Berechtigung im Kanal.');
  const r = await env.DB.prepare('INSERT INTO giveaways (channel_id,message_id,prize,winners,ends_at,host,status,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(ch, msg.data.id, prize, winners, ends, uid, 'active', now()).run();
  const id = r.meta && r.meta.last_row_id;
  return eph(env, { title: 'Giveaway gestartet', color: COL.ok, desc: `<#${ch}> · endet <t:${ends}:R>`, fields: [{ name: 'ID', value: String(id || '?'), inline: true }, { name: 'Preis', value: prize, inline: true }, { name: 'Gewinner', value: String(winners), inline: true }] });
}

export async function joinGiveaway(i, env, uid) {
  const g = await env.DB.prepare('SELECT * FROM giveaways WHERE message_id=?').bind(i.message && i.message.id).first();
  if (!g) return bad(env, 'Giveaway nicht gefunden', '');
  if (g.status !== 'active' || g.ends_at <= now()) return bad(env, 'Giveaway beendet', 'Die Teilnahme ist nicht mehr möglich.');
  const had = await env.DB.prepare('SELECT 1 AS x FROM gw_entries WHERE gw_id=? AND user_id=?').bind(g.id, uid).first();
  if (had) await env.DB.prepare('DELETE FROM gw_entries WHERE gw_id=? AND user_id=?').bind(g.id, uid).run();
  else await env.DB.prepare('INSERT OR IGNORE INTO gw_entries (gw_id,user_id,name) VALUES (?,?,?)').bind(g.id, uid, String(((i.member && i.member.user) || i.user || {}).username || '').slice(0, 32)).run();
  const n = await countOf(env, g.id);
  // Teilnehmerzahl im Embed aktualisieren; die Bestaetigung geht als private Nachricht hinterher
  return { type: 7, data: { embeds: [giveEmbed(env, g, n)], components: JOIN() }, _note: had ? 'left' : 'joined' };
}

function pick(arr, n) {
  const a = arr.slice(), out = [], buf = new Uint32Array(1);
  while (a.length && out.length < n) { crypto.getRandomValues(buf); out.push(a.splice(buf[0] % a.length, 1)[0]); }
  return out;
}

async function winnerTicket(env, g, uid, name) {
  const ch = await makeTicketChannel(env, uid, 'giveaway', name);
  if (!ch.ok) return null;
  await env.DB.prepare('INSERT INTO tickets (channel_id,user_id,created_at,type,plan) VALUES (?,?,?,?,?)').bind(ch.data.id, uid, now(), 'giveaway', null).run();
  await dapi(env, 'POST', `/channels/${ch.data.id}/messages`, { content: `<@${uid}>`, embeds: [emb(env, { title: '🏆 Du hast gewonnen!', color: 0xf1c40f,
    desc: `Glückwunsch <@${uid}>! Du hast beim Giveaway **${g.prize}** gewonnen.\nSchreibe hier kurz, wie wir dir den Gewinn übergeben dürfen. Das Team meldet sich in diesem Ticket.`,
    fields: [{ name: 'Gewinn', value: g.prize, inline: true }, { name: 'Wichtig', value: 'Antworte bitte innerhalb von 48 Stunden, sonst wird neu ausgelost.', inline: true }] })], components: CLOSE });
  await tryDM(env, uid, { embeds: [emb(env, { title: '🎉 Du hast gewonnen!', color: 0xf1c40f, desc: `Du hast **${g.prize}** gewonnen! Dein privates Ticket: <#${ch.data.id}>` })] });
  return ch.data.id;
}

// Ziehung. reroll=true: nur neue Gewinner, bisherige ausgeschlossen
export async function drawGiveaway(env, g, { reroll = false, count } = {}) {
  const prev = JSON.parse(g.winner_ids || '[]');
  const rows = (await env.DB.prepare('SELECT user_id,name FROM gw_entries WHERE gw_id=?').bind(g.id).all()).results || [], names = Object.fromEntries(rows.map(r => [r.user_id, r.name])), all = rows.map(r => r.user_id);
  const pool = all.filter(u => !prev.includes(u));
  const won = pick(pool, count || g.winners);
  const total = await countOf(env, g.id);
  const tickets = [];
  for (const u of won) tickets.push(await winnerTicket(env, g, u, names[u]));
  const ids = prev.concat(won);
  await env.DB.prepare("UPDATE giveaways SET status='ended', winner_ids=? WHERE id=?").bind(JSON.stringify(ids), g.id).run();
  await dapi(env, 'PATCH', `/channels/${g.channel_id}/messages/${g.message_id}`, { embeds: [giveEmbed(env, { ...g, ends_at: reroll ? g.ends_at : Math.min(g.ends_at, now()) }, total, true, ids)], components: JOIN(true) });
  const text = won.length
    ? `🎉 Glückwunsch ${won.map(w => `<@${w}>`).join(', ')}! ${reroll ? 'Neu ausgelost: ' : 'Ihr habt '}**${g.prize}**${reroll ? '' : ' gewonnen'}! Euer privates Ticket findet ihr in der Kanalliste${tickets.some(Boolean) ? ': ' + tickets.filter(Boolean).map(t => `<#${t}>`).join(' ') : '.'}`
    : '😕 Das Giveaway ist vorbei, aber es gab keine (weiteren) Teilnehmer.';
  await dapi(env, 'POST', `/channels/${g.channel_id}/messages`, { content: text, message_reference: { message_id: g.message_id, fail_if_not_exists: false }, allowed_mentions: { users: won } });
  return won;
}

export async function endSweep(env, max = 3) {
  const due = (await env.DB.prepare("SELECT * FROM giveaways WHERE status='active' AND ends_at<=? ORDER BY ends_at LIMIT ?").bind(now(), max).all()).results || [];
  for (const g of due) {
    const claim = await env.DB.prepare("UPDATE giveaways SET status='ending' WHERE id=? AND status='active'").bind(g.id).run();
    if (claim.meta && claim.meta.changes) await drawGiveaway(env, g);
  }
  return due.length;
}

export async function handleGiveaway(i, env, uid) {
  if (!isTeam(env, i)) return bad(env, 'Keine Berechtigung', 'Giveaways kann nur das Team verwalten.');
  const sub = i.data.options[0], o = n => ((sub.options || []).find(x => x.name === n) || {}).value;
  if (sub.name === 'start') return openGiveawayModal();
  if (sub.name === 'liste') {
    const rows = (await env.DB.prepare('SELECT * FROM giveaways ORDER BY id DESC LIMIT 8').all()).results || [];
    if (!rows.length) return eph(env, { title: 'Giveaways', desc: 'Noch keine Giveaways.', color: COL.neutral });
    return eph(env, { title: 'Giveaways', desc: rows.map(g => `**#${g.id}** · ${g.prize} · ${g.status === 'active' ? `endet <t:${g.ends_at}:R>` : 'beendet'}`).join('\n') });
  }
  const g = await env.DB.prepare('SELECT * FROM giveaways WHERE id=?').bind(o('id')).first();
  if (!g) return bad(env, 'Giveaway nicht gefunden', 'Prüfe die ID mit `/giveaway liste`.');
  if (sub.name === 'ende') {
    const claim = await env.DB.prepare("UPDATE giveaways SET status='ending' WHERE id=? AND status='active'").bind(g.id).run();
    if (!(claim.meta && claim.meta.changes)) return bad(env, 'Schon beendet', 'Nutze `/giveaway reroll`, um neu auszulosen.');
    const won = await drawGiveaway(env, g);
    return eph(env, { title: 'Giveaway beendet', color: COL.ok, desc: won.length ? `Gewinner: ${won.map(w => `<@${w}>`).join(', ')}` : 'Keine Teilnehmer.' });
  }
  if (sub.name === 'reroll') {
    if (g.status === 'active') return bad(env, 'Läuft noch', 'Beende es zuerst mit `/giveaway ende`.');
    const won = await drawGiveaway(env, g, { reroll: true, count: Math.min(10, Math.max(1, Number(o('anzahl')) || 1)) });
    return eph(env, { title: 'Neu ausgelost', color: COL.ok, desc: won.length ? `Neue Gewinner: ${won.map(w => `<@${w}>`).join(', ')}` : 'Keine weiteren Teilnehmer.' });
  }
  return bad(env, 'Unbekannter Befehl', '');
}
