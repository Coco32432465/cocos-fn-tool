// Tickets: Kauf-Ticket (mit Laufzeit-Dropdown) und Hilfe-Ticket, Schliessen mit Transkript.
import { now, emb, eph, bad, COL, PLANS, PLAN_ALL, price, priceNum, paypalUrl, fmtDateTime, fmtDate } from './util.js';
import { dapi, dapiFile, adminIds, isTeam, tryDM } from './discord.js';
import { createKeys, extendLicense, bestKey } from './keys.js';
import { askRating } from './growth.js';
import { attachCode, payOut, rewards, codeRow, openCodeModal } from './codes.js';
const codeInfo = async (env, c) => { if (!c) return null; const row = await codeRow(env, c); return row ? { code: row.code, buyer: rewards(env, row).buyer } : null; };

const ALLOW = String(1024 + 2048 + 32768 + 65536); // sehen, schreiben, Dateien, Verlauf
const TYPES = { buy: { prefix: 'kauf', label: 'Kauf-Ticket' }, renew: { prefix: 'verlaengern', label: 'Verlängerungs-Ticket' }, support: { prefix: 'support', label: 'Hilfe-Ticket' }, giveaway: { prefix: 'giveaway', label: 'Gewinn-Ticket' } };

function components(env, type, plan, code) {
  const rows = [];
  if (type === 'buy' || type === 'renew') rows.push({ type: 1, components: [{ type: 3, custom_id: 'ticket_plan', placeholder: 'Laufzeit wählen', options: Object.entries(PLANS).map(([id, p]) => ({ label: `${p.label} · ${price(env, id)}`, value: id, description: `${p.days} Tage Zugang`, default: id === plan })) }] });
  const btns = [];
  const pp = plan ? paypalUrl(env, plan) : '';
  if (pp) btns.push({ type: 2, style: 5, label: 'Mit PayPal bezahlen', url: pp, emoji: { name: '💳' } });
  if ((type === 'buy' || type === 'renew') && plan) btns.push({ type: 2, style: 3, label: 'Zahlung bestätigt (Team)', custom_id: 'ticket_confirm', emoji: { name: '✅' } });
  if ((type === 'buy' || type === 'renew') && !code) btns.push({ type: 2, style: 2, label: 'Creator-Code', custom_id: 'ticket_code', emoji: { name: '🎁' } });
  btns.push({ type: 2, style: 2, label: 'Ticket schließen', custom_id: 'ticket_close' });
  rows.push({ type: 1, components: btns });
  return rows;
}

function payFields(env, type, plan, uname, code) {
  const p = PLAN_ALL[plan];
  const pay = paypalUrl(env, plan);
  const how = [
    pay ? `**1.** Klicke auf **Mit PayPal bezahlen** und sende **${price(env, plan)}**.` : `**1.** Das Team schickt dir gleich hier den PayPal-Link für **${price(env, plan)}**.`,
    `**2.** Mache einen **Screenshot der Zahlung** (Betrag, Datum und Empfänger müssen sichtbar sein) und sende ihn **hier in dieses Ticket**.`,
    type === 'renew' ? '**3.** Das Team prüft die Zahlung und **verlängert deine bestehende Lizenz** – du musst nichts neu eingeben.' : '**3.** Das Team prüft die Zahlung und schickt dir hier **deinen Key**. Den gibst du in der App ein.'
  ].join('\n');
  return [
    { name: 'Laufzeit', value: p.label, inline: true },
    { name: 'Preis', value: `**${price(env, plan)}**`, inline: true },
    { name: 'Geräte', value: '1 pro Key', inline: true },
    { name: '💳 So bezahlst du', value: how },
    { name: 'Verwendungszweck', value: `Dein Discord-Name${uname ? ` (\`${uname}\`)` : ''}`, inline: true },
    { name: 'Sicherheit', value: 'Zahle nur über den Link in diesem Ticket. Das Team schreibt dich nie zuerst privat an.', inline: true },
    ...(code ? [{ name: '🎁 Creator-Code', value: `**${code.code}** · du bekommst **+${code.buyer} Bonustag${code.buyer === 1 ? '' : 'e'}**` }] : []),
    { name: 'Status', value: '⏳ Zahlung ausstehend' }
  ];
}

function ticketEmbed(env, type, uid, plan, uname, code) {
  if (type === 'support') return emb(env, {
    title: 'Support-Ticket',
    desc: `Hallo <@${uid}>, beschreibe bitte kurz dein Anliegen. Das Team meldet sich hier.`,
    fields: [{ name: 'Hilfreich', value: 'Version der App, was du gemacht hast, Fehlermeldung oder Screenshot.' }, { name: 'Status', value: 'Offen' }]
  });
  const renew = type === 'renew';
  const p = plan && PLANS[plan];
  return emb(env, {
    title: renew ? 'Lizenz verlängern' : 'Lizenzbestellung',
    desc: `Hallo <@${uid}>, ${renew ? 'schön, dass du verlängern möchtest! Wähle unten die Laufzeit – sie wird an deine aktuelle Lizenz angehängt.' : 'wähle unten die gewünschte Laufzeit. Preis und Zahlungshinweis siehst du danach hier.'}`,
    fields: p ? payFields(env, type, plan, uname, code) : [
      { name: 'Tarife', value: `1 Woche · **${price(env, 'week')}**\n1 Monat · **${price(env, 'month')}**` },
      { name: 'Status', value: 'Laufzeit noch nicht gewählt' }
    ]
  });
}

// Fortlaufende Ticket-Nummer je Thema (kauf-ben-01, hilfe-ben-02 ...). Zaehler sinkt nie, auch wenn Tickets geschlossen werden.
async function nextNo(env, prefix) {
  const k = 'ticketno:' + prefix;
  await env.DB.prepare("INSERT OR IGNORE INTO config (k,v) VALUES (?,'0')").bind(k).run();
  await env.DB.prepare('UPDATE config SET v=CAST(CAST(v AS INTEGER)+1 AS TEXT) WHERE k=?').bind(k).run();
  const r = await env.DB.prepare('SELECT v FROM config WHERE k=?').bind(k).first();
  return String(Number(r && r.v) || 1).padStart(2, '0');
}

// Privaten Ticket-Kanal anlegen: <thema>-<name>-<nr>
export async function makeTicketChannel(env, uid, type, username) {
  const T = TYPES[type] || TYPES.buy;
  const uname = String(username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const team = [env.ADMIN_ROLE_ID, env.MOD_ROLE_ID, env.SUPPORTER_ROLE_ID].filter(Boolean);
  const overwrites = [
    { id: env.GUILD_ID, type: 0, deny: '1024' },
    { id: uid, type: 1, allow: ALLOW },
    { id: env.DISCORD_APP_ID, type: 1, allow: String(1024 + 2048 + 16384 + 65536) },
    ...adminIds(env).map(a => ({ id: a, type: 1, allow: ALLOW })),
    ...team.map(r => ({ id: r, type: 0, allow: ALLOW }))
  ];
  const no = await nextNo(env, T.prefix);
  const ch = await dapi(env, 'POST', `/guilds/${env.GUILD_ID}/channels`, { name: `${T.prefix}-${uname}-${no}`, type: 0, parent_id: env.TICKET_CATEGORY_ID || undefined, topic: `${type}:${uid}`, permission_overwrites: overwrites });
  return ch;
}

export async function openTicket(i, env, uid, type) {
  const T = TYPES[type] || TYPES.buy;
  const ex = await env.DB.prepare('SELECT channel_id FROM tickets WHERE user_id=? AND type=?').bind(uid, type).first();
  if (ex) return eph(env, { title: 'Ticket bereits geöffnet', desc: `Du hast bereits ein offenes Ticket: <#${ex.channel_id}>`, color: COL.neutral });
  const u = (i.member && i.member.user) || i.user || {};
  let plan = null;
  if (type === 'renew') { const bk = await bestKey(env, uid); if (bk && PLANS[bk.plan]) plan = bk.plan; }
  const ch = await makeTicketChannel(env, uid, type, u.username);
  if (!ch.ok) return bad(env, 'Ticket nicht erstellt', 'Das Ticket konnte nicht angelegt werden. Bitte wende dich an das Team.');
  await env.DB.prepare('INSERT INTO tickets (channel_id,user_id,created_at,type,plan) VALUES (?,?,?,?,?)').bind(ch.data.id, uid, now(), type, plan).run();
  await dapi(env, 'POST', `/channels/${ch.data.id}/messages`, { content: `<@${uid}>`, embeds: [ticketEmbed(env, type, uid, plan, u.username)], components: components(env, type, plan) });
  return eph(env, { title: 'Ticket eröffnet', desc: `Dein Ticket: <#${ch.data.id}>`, color: COL.ok });
}

// Dropdown "Laufzeit": zeigt Preis + Zahlungshinweis
export async function selectPlan(i, env, uid) {
  const t = await env.DB.prepare('SELECT * FROM tickets WHERE channel_id=?').bind(i.channel_id).first();
  if (!t || (t.type !== 'buy' && t.type !== 'renew')) return bad(env, 'Kein Kauf-Ticket', 'Die Auswahl gilt nur in Kauf- und Verlängerungs-Tickets.');
  if (t.user_id !== uid && !isTeam(env, i)) return bad(env, 'Keine Berechtigung', 'Nur der Ersteller des Tickets kann die Laufzeit wählen.');
  const plan = (i.data.values || [])[0];
  if (!PLANS[plan]) return bad(env, 'Unbekannte Laufzeit', '');
  await env.DB.prepare('UPDATE tickets SET plan=? WHERE channel_id=?').bind(plan, i.channel_id).run();
  const ci = await codeInfo(env, t.code);
  return { type: 7, data: { embeds: [ticketEmbed(env, t.type, t.user_id, plan, null, ci)], components: components(env, t.type, plan, ci) } };
}

export const codeButton = () => openCodeModal();
export async function submitCode(i, env, uid) {
  const t = await env.DB.prepare('SELECT * FROM tickets WHERE channel_id=?').bind(i.channel_id).first();
  if (!t) return bad(env, 'Kein Ticket', 'Codes gibst du in deinem Kauf-Ticket ein.');
  if (t.user_id !== uid) return bad(env, 'Keine Berechtigung', 'Nur der Ersteller des Tickets kann einen Code eingeben.');
  let raw = ''; for (const r of i.data.components || []) for (const c of r.components || []) if (c.custom_id === 'f_code') raw = c.value;
  const r = await attachCode(env, t, uid, raw);
  if (r.error) return bad(env, 'Code nicht angenommen', r.error);
  const ci = { code: r.code, buyer: r.buyer };
  return { type: 7, data: { embeds: [ticketEmbed(env, t.type, t.user_id, t.plan, null, ci)], components: components(env, t.type, t.plan, ci) } };
}

// Team: Zahlung geprueft -> Key erstellen bzw. Lizenz verlaengern
export async function confirmTicket(i, env, uid) {
  if (!isTeam(env, i)) return bad(env, 'Keine Berechtigung', 'Nur das Team kann die Zahlung bestätigen.');
  const t = await env.DB.prepare('SELECT * FROM tickets WHERE channel_id=?').bind(i.channel_id).first();
  if (!t || !t.plan || !PLANS[t.plan]) return bad(env, 'Laufzeit fehlt', 'Der Kunde muss zuerst eine Laufzeit wählen.');
  if (t.paid) return bad(env, 'Schon bestätigt', 'Für dieses Ticket wurde die Zahlung bereits bestätigt.');
  const claim = await env.DB.prepare('UPDATE tickets SET paid=1 WHERE channel_id=? AND paid=0').bind(i.channel_id).run();
  if (!(claim.meta && claim.meta.changes)) return bad(env, 'Schon bestätigt', 'Für dieses Ticket wurde die Zahlung bereits bestätigt.');
  const plan = PLANS[t.plan];
  let fields, kind, r_loyal = 0;
  if (t.type === 'renew') {
    const early = !!(await env.DB.prepare("SELECT 1 AS x FROM keys WHERE discord_id=? AND status='active' AND expires_at>?").bind(t.user_id, now()).first());
    const r = await extendLicense(env, t.user_id, t.plan, uid);
    const loyal = early && r.mode !== 'new' ? (Number(env.RENEW_BONUS) >= 0 && env.RENEW_BONUS !== undefined && env.RENEW_BONUS !== '' ? Number(env.RENEW_BONUS) : 1) : 0;
    if (loyal) { r.expires_at += Math.round(loyal * 86400); await env.DB.prepare('UPDATE keys SET expires_at=? WHERE key=?').bind(r.expires_at, r.key).run(); }
    r_loyal = loyal;
    kind = r.mode === 'new' ? 'new' : 'renew';
    fields = r.mode === 'new'
      ? [{ name: 'Dein Key', value: '```\n' + r.key + '\n```' }, { name: 'Einlösen', value: 'In der App (Mit Discord verbinden → Key eingeben).' }]
      : [{ name: 'Neues Ablaufdatum', value: `**${fmtDate(r.expires_at)}**`, inline: true }, { name: 'Laufzeit', value: `+ ${plan.label}`, inline: true }, { name: 'Hinweis', value: 'Du musst nichts neu eingeben – die App aktualisiert sich automatisch.' }];
  } else {
    const [key] = await createKeys(env, t.plan, 1, uid); kind = 'new';
    fields = [{ name: 'Dein Key', value: '```\n' + key + '\n```' }, { name: 'Laufzeit', value: plan.label, inline: true }, { name: 'Einlösen', value: 'In der App: **Mit Discord verbinden**, dann den Key eingeben. Die Laufzeit startet erst beim Einlösen.' }];
  }
  let codeNote = null;
  if (t.code) { // Bonus-Tage fuer den Kaeufer, Belohnung fuer den Code-Inhaber
    const po = await payOut(env, t, t.user_id), bonus = po ? po.buyer : 0;
    if (po) {
      if (bonus) {
        const keyVal = (fields.find(f => f.name === 'Dein Key') || {}).value;
        if (keyVal) await env.DB.prepare('UPDATE keys SET days=days+? WHERE key=?').bind(bonus, keyVal.replace(/`|\n/g, '').trim()).run();
        else await env.DB.prepare("UPDATE keys SET expires_at=expires_at+? WHERE discord_id=? AND status='active' AND expires_at=(SELECT MAX(expires_at) FROM keys WHERE discord_id=? AND status='active')").bind(Math.round(bonus * 86400), t.user_id, t.user_id).run();
      }
      codeNote = { name: '🎁 Creator-Code', value: `**${po.code}** eingelöst: **+${bonus} Bonustag${bonus === 1 ? '' : 'e'}** für dich, danke an <@${po.owner}>!` };
    }
  }
  await env.DB.prepare('INSERT INTO sales (user_id,plan,amount,kind,created_at) VALUES (?,?,?,?,?)').bind(t.user_id, t.plan, priceNum(price(env, t.plan)), kind, now()).run();
  if (typeof r_loyal !== 'undefined' && r_loyal) fields.push({ name: '💙 Treue-Bonus', value: `Du hast **vor Ablauf** verlängert: **+${r_loyal} Bonustag${r_loyal === 1 ? '' : 'e'}** geschenkt.` });
  if (codeNote) fields.push(codeNote);
  return { type: 4, data: { content: `<@${t.user_id}>`, embeds: [emb(env, { title: '✅ Zahlung bestätigt', color: COL.ok, desc: 'Vielen Dank! Dein Zugang ist freigeschaltet. Du kannst dieses Ticket jetzt schließen.', fields })] } };
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
  if (t.user_id !== uid && !isTeam(env, i)) return bad(env, 'Keine Berechtigung', 'Nur der Ersteller des Tickets oder das Team kann es schließen.');
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
    try { if (t.user_id !== undefined) await askRating(env, t.user_id, i.channel_id, (TYPES[t.type] || TYPES.buy).label); } catch (e) { /* optional */ }
    await new Promise(r => setTimeout(r, 2500));
    await dapi(env, 'DELETE', `/channels/${i.channel_id}`);
  })());
  return { type: 4, data: { embeds: [emb(env, { title: 'Ticket wird geschlossen', desc: env.LOG_CHANNEL_ID ? 'Das Transkript wird gespeichert, der Kanal danach gelöscht.' : 'Der Kanal wird in wenigen Sekunden gelöscht. (Kein Log-Kanal eingerichtet – führe `/setup` aus.)', color: COL.neutral })] } };
}
