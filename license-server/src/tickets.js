// Tickets: Kauf-Ticket (mit Laufzeit-Dropdown) und Hilfe-Ticket, Schliessen mit Transkript.
import { now, emb, eph, bad, COL, PLANS, price, fmtDateTime } from './util.js';
import { dapi, dapiFile, adminIds, isAdmin } from './discord.js';

const ALLOW = String(1024 + 2048 + 32768 + 65536); // sehen, schreiben, Dateien, Verlauf
const TYPES = { buy: { prefix: 'kauf', label: 'Kauf-Ticket' }, support: { prefix: 'hilfe', label: 'Hilfe-Ticket' } };

function components(type, plan) {
  const rows = [];
  if (type === 'buy') rows.push({ type: 1, components: [{ type: 3, custom_id: 'ticket_plan', placeholder: 'Laufzeit wählen', options: Object.entries(PLANS).map(([id, p]) => ({ label: p.label, value: id, description: `${p.days} Tage Zugang`, default: id === plan })) }] });
  rows.push({ type: 1, components: [{ type: 2, style: 2, label: 'Ticket schließen', custom_id: 'ticket_close' }] });
  return rows;
}

function ticketEmbed(env, type, uid, plan) {
  if (type === 'support') return emb(env, {
    title: 'Support-Ticket',
    desc: `Hallo <@${uid}>, beschreibe bitte kurz dein Anliegen. Das Team meldet sich hier.`,
    fields: [{ name: 'Hilfreich', value: 'Version der App, was du gemacht hast, Fehlermeldung oder Screenshot.' }, { name: 'Status', value: 'Offen' }]
  });
  const p = plan && PLANS[plan];
  return emb(env, {
    title: 'Lizenzbestellung',
    desc: `Hallo <@${uid}>, wähle unten die gewünschte Laufzeit. Preis und Zahlungshinweis siehst du danach hier.`,
    fields: p ? [
      { name: 'Laufzeit', value: p.label, inline: true },
      { name: 'Preis', value: `**${price(env, plan)}**`, inline: true },
      { name: 'Geräte', value: '1 pro Key', inline: true },
      { name: 'Zahlung', value: env.PAYMENT_TEXT || 'Wird im Ticket mit dem Team geklärt.' },
      { name: 'Ablauf', value: '1. Zahlung durchführen\n2. Team bestätigt die Zahlung und erstellt deinen Key\n3. Key in der App eingeben oder mit `/key einlösen`' },
      { name: 'Status', value: 'Zahlung ausstehend' }
    ] : [
      { name: 'Tarife', value: `1 Woche · **${price(env, 'week')}**\n1 Monat · **${price(env, 'month')}**` },
      { name: 'Status', value: 'Laufzeit noch nicht gewählt' }
    ]
  });
}

export async function openTicket(i, env, uid, type) {
  const T = TYPES[type] || TYPES.buy;
  const ex = await env.DB.prepare('SELECT channel_id FROM tickets WHERE user_id=? AND type=?').bind(uid, type).first();
  if (ex) return eph(env, { title: 'Ticket bereits geöffnet', desc: `Du hast bereits ein offenes Ticket: <#${ex.channel_id}>`, color: COL.neutral });
  const uname = ((i.member && i.member.user || {}).username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const overwrites = [
    { id: env.GUILD_ID, type: 0, deny: '1024' },
    { id: uid, type: 1, allow: ALLOW },
    { id: env.DISCORD_APP_ID, type: 1, allow: String(1024 + 2048 + 16384 + 65536) },
    ...adminIds(env).map(a => ({ id: a, type: 1, allow: ALLOW })),
    ...(env.ADMIN_ROLE_ID ? [{ id: env.ADMIN_ROLE_ID, type: 0, allow: ALLOW }] : [])
  ];
  const ch = await dapi(env, 'POST', `/guilds/${env.GUILD_ID}/channels`, { name: `${T.prefix}-${uname}`, type: 0, parent_id: env.TICKET_CATEGORY_ID || undefined, topic: `${type}:${uid}`, permission_overwrites: overwrites });
  if (!ch.ok) return bad(env, 'Ticket nicht erstellt', 'Das Ticket konnte nicht angelegt werden. Bitte wende dich an das Team.');
  await env.DB.prepare('INSERT INTO tickets (channel_id,user_id,created_at,type) VALUES (?,?,?,?)').bind(ch.data.id, uid, now(), type).run();
  await dapi(env, 'POST', `/channels/${ch.data.id}/messages`, { content: `<@${uid}>`, embeds: [ticketEmbed(env, type, uid, null)], components: components(type, null) });
  return eph(env, { title: 'Ticket eröffnet', desc: `Dein Ticket: <#${ch.data.id}>`, color: COL.ok });
}

// Dropdown "Laufzeit": zeigt Preis + Zahlungshinweis
export async function selectPlan(i, env, uid) {
  const t = await env.DB.prepare('SELECT * FROM tickets WHERE channel_id=?').bind(i.channel_id).first();
  if (!t || t.type !== 'buy') return bad(env, 'Kein Kauf-Ticket', 'Die Auswahl gilt nur in Kauf-Tickets.');
  if (t.user_id !== uid && !isAdmin(env, i)) return bad(env, 'Keine Berechtigung', 'Nur der Ersteller des Tickets kann die Laufzeit wählen.');
  const plan = (i.data.values || [])[0];
  if (!PLANS[plan]) return bad(env, 'Unbekannte Laufzeit', '');
  await env.DB.prepare('UPDATE tickets SET plan=? WHERE channel_id=?').bind(plan, i.channel_id).run();
  return { type: 7, data: { embeds: [ticketEmbed(env, 'buy', t.user_id, plan)], components: components('buy', plan) } };
}

/* ---------- Schliessen mit Transkript ---------- */
async function fetchMessages(env, channelId) {
  let all = [], before = '';
  for (let p = 0; p < 3; p++) { // bis zu 300 Nachrichten
    const r = await dapi(env, 'GET', `/channels/${channelId}/messages?limit=100${before ? '&before=' + before : ''}`);
    if (!r.ok || !r.data.length) break;
    all = all.concat(r.data); before = r.data[r.data.length - 1].id;
    if (r.data.length < 100) break;
  }
  return all.reverse();
}

export function buildTranscript(t, msgs, closedBy) {
  const L = [`Transkript · ${(TYPES[t.type] || TYPES.buy).label}`, `Ersteller: ${t.user_id}`, `Geöffnet: ${fmtDateTime(t.created_at)}`, `Geschlossen: ${fmtDateTime(now())} von ${closedBy}`, `Nachrichten: ${msgs.length}`, '─'.repeat(48)];
  for (const m of msgs) {
    const ts = fmtDateTime(Math.floor(new Date(m.timestamp).getTime() / 1000));
    let c = m.content || '';
    for (const e of m.embeds || []) c += (c ? '\n' : '') + `[Embed] ${e.title || ''}${e.description ? ' – ' + e.description : ''}${(e.fields || []).map(f => `\n    ${f.name}: ${f.value}`).join('')}`;
    for (const a of m.attachments || []) c += `\n[Anhang] ${a.url}`;
    L.push(`[${ts}] ${m.author.username}${m.author.bot ? ' (Bot)' : ''}: ${c}`);
  }
  return L.join('\n');
}

export async function closeTicket(i, env, ctx, uid) {
  const t = await env.DB.prepare('SELECT * FROM tickets WHERE channel_id=?').bind(i.channel_id).first();
  if (!t) return bad(env, 'Kein Ticket', 'In diesem Kanal gibt es kein offenes Ticket.');
  if (t.user_id !== uid && !isAdmin(env, i)) return bad(env, 'Keine Berechtigung', 'Nur der Ersteller des Tickets oder das Team kann es schließen.');
  await env.DB.prepare('DELETE FROM tickets WHERE channel_id=?').bind(i.channel_id).run();
  const closer = (i.member && i.member.user && i.member.user.username) || uid;
  ctx.waitUntil((async () => {
    try {
      if (env.LOG_CHANNEL_ID) {
        const msgs = await fetchMessages(env, i.channel_id);
        const text = buildTranscript(t, msgs, closer);
        await dapiFile(env, env.LOG_CHANNEL_ID, { embeds: [emb(env, { title: 'Ticket geschlossen', fields: [
          { name: 'Typ', value: (TYPES[t.type] || TYPES.buy).label, inline: true }, { name: 'Ersteller', value: `<@${t.user_id}>`, inline: true },
          { name: 'Geschlossen von', value: closer, inline: true }, { name: 'Nachrichten', value: String(msgs.length), inline: true },
          { name: 'Dauer', value: Math.max(1, Math.round((now() - t.created_at) / 60)) + ' Min.', inline: true }] })] }, `transkript-${i.channel_id}.txt`, text);
      }
    } catch (e) { /* Transkript best effort */ }
    await new Promise(r => setTimeout(r, 2500));
    await dapi(env, 'DELETE', `/channels/${i.channel_id}`);
  })());
  return { type: 4, data: { embeds: [emb(env, { title: 'Ticket wird geschlossen', desc: env.LOG_CHANNEL_ID ? 'Das Transkript wird gespeichert, der Kanal danach gelöscht.' : 'Der Kanal wird in wenigen Sekunden gelöscht. (Kein Log-Kanal eingerichtet – führe `/setup` aus.)', color: COL.neutral })] } };
}
