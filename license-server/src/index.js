// Coco's Fn Tool – Lizenz-Server + Discord-Bot (Cloudflare Worker, D1/SQLite)
//   POST /interactions        Discord (Slash-Commands, Buttons, Dropdowns)
//   GET  /register?secret=    einmalig: Slash-Commands registrieren
//   GET  /auth/start?cid=     Discord-Login starten (App oder Website)
//   GET  /auth/callback       Rueckkehr von Discord
//   POST /auth/poll           Sitzung abholen
//   POST /license/activate    Key einloesen   {session, key, device}
//   POST /license/refresh     Ticket erneuern {session, device}
//   POST /api/verify          {key, deviceId} -> {valid, expiresAt}
import { json, now, emb, eph, bad, noPerm, COL, PLANS, PLAN_ALL, fmtDate, normKey, KEY_RE } from './util.js';
import { dapi, addRole, delRole, tryDM, verifyDiscord, withCfg, isAdmin } from './discord.js';
import { createKeys, redeemKey, bestKey, revokeKey, resetDevice, listKeys, statusOf, expireSweep } from './keys.js';
import { openTicket, selectPlan, closeTicket } from './tickets.js';
import { runSetup, setupEmbed } from './setup.js';
import { authStart, authCallback, authPoll, licenseActivate, licenseRefresh, apiVerify, hit, blocked, cleanup, corsHeaders } from './auth.js';

const COMMANDS = [
  { name: 'setup', description: 'Server automatisch aufbauen (Admin)', options: [{ type: 5, name: 'erneuern', description: 'Start-Embeds und Panels neu posten', required: false }] },
  { name: 'zugang', description: 'Serverzugang (Rolle User) vergeben oder entziehen (Admin)', options: [
    { type: 6, name: 'user', description: 'Nutzer', required: true },
    { type: 5, name: 'entfernen', description: 'Zugang entziehen statt vergeben', required: false }] },
  { name: 'key', description: 'Lizenz-Keys', options: [
    { type: 1, name: 'erstellen', description: 'Keys erzeugen (Admin)', options: [
      { type: 3, name: 'dauer', description: 'Laufzeit', required: true, choices: [{ name: '1 Woche', value: 'week' }, { name: '1 Monat', value: 'month' }, { name: '10 Minuten (Test)', value: 'test' }] },
      { type: 4, name: 'anzahl', description: 'Wie viele Keys (1–25)', required: false, min_value: 1, max_value: 25 }] },
    { type: 1, name: 'einlösen', description: 'Key an dein Konto binden und freischalten', options: [{ type: 3, name: 'key', description: 'XXXX-XXXX-XXXX', required: true }] },
    { type: 1, name: 'info', description: 'Deine Lizenz anzeigen' },
    { type: 1, name: 'reset-gerät', description: 'Gerätebindung zurücksetzen (Admin)', options: [{ type: 3, name: 'key', description: 'Lizenz-Key', required: true }] },
    { type: 1, name: 'sperren', description: 'Key sperren (Admin)', options: [{ type: 3, name: 'key', description: 'Lizenz-Key', required: true }] },
    { type: 1, name: 'liste', description: 'Keys anzeigen (Admin)', options: [{ type: 6, name: 'user', description: 'Nur Keys dieses Nutzers', required: false }] }
  ] }
];

function keyEmbedList(env, keys, plan) {
  return emb(env, { title: keys.length > 1 ? `${keys.length} Keys erstellt` : 'Key erstellt', color: COL.ok,
    desc: '```\n' + keys.join('\n') + '\n```',
    fields: [{ name: 'Laufzeit', value: plan.label, inline: true }, { name: 'Geräte', value: '1 pro Key', inline: true },
      { name: 'Einlösen', value: 'In der App (Mit Discord verbinden → Key eingeben) oder mit `/key einlösen`. Die Laufzeit beginnt erst beim Einlösen.' }] });
}

async function handleKey(i, env, ctx, uid) {
  const sub = i.data.options[0], opt = n => ((sub.options || []).find(o => o.name === n) || {}).value;
  const admin = isAdmin(env, i);
  if (['erstellen', 'reset-gerät', 'sperren', 'liste'].includes(sub.name) && !admin) return noPerm(env);

  if (sub.name === 'erstellen') {
    const planId = opt('dauer'), count = Math.min(25, Math.max(1, opt('anzahl') || 1));
    if (!PLAN_ALL[planId]) return bad(env, 'Unbekannte Laufzeit', '');
    const keys = await createKeys(env, planId, count, uid);
    const inTicket = await env.DB.prepare('SELECT user_id FROM tickets WHERE channel_id=?').bind(i.channel_id).first();
    const e = keyEmbedList(env, keys, PLAN_ALL[planId]);
    if (inTicket) return { type: 4, data: { content: `<@${inTicket.user_id}>`, embeds: [e] } }; // im Ticket sichtbar fuer den Kunden
    return { type: 4, data: { embeds: [e], flags: 64 } };
  }

  if (sub.name === 'einlösen') {
    const key = normKey(opt('key'));
    if (!KEY_RE.test(key)) return bad(env, 'Ungültiges Format', 'Erwartet: `XXXX-XXXX-XXXX`');
    const r = await redeemKey(env, uid, key);
    if (!r.ok) return bad(env, 'Einlösen fehlgeschlagen', r.message);
    return eph(env, { title: r.code === 'already' ? 'Bereits eingelöst' : 'Lizenz freigeschaltet', color: COL.ok,
      desc: 'Die Rolle **Customer** ist aktiv. Öffne jetzt die App, verbinde dein Discord-Konto und gib den Key ein.',
      fields: [{ name: 'Laufzeit', value: (PLAN_ALL[r.row.plan] || {}).label || r.row.plan, inline: true }, { name: 'Gültig bis', value: fmtDate(r.row.expires_at), inline: true }, { name: 'Geräte', value: '1', inline: true }] });
  }

  if (sub.name === 'info') {
    const row = await bestKey(env, uid);
    if (!row) return eph(env, { title: 'Keine Lizenz', desc: 'Du hast noch keinen Key eingelöst. Öffne ein Ticket in <#' + (env.PANEL_CHANNEL_ID || '') + '> oder nutze `/key einlösen`.', color: COL.neutral });
    const st = statusOf(row);
    return eph(env, { title: 'Deine Lizenz', color: st === 'Aktiv' ? COL.ok : COL.bad, fields: [
      { name: 'Status', value: st, inline: true }, { name: 'Laufzeit', value: (PLAN_ALL[row.plan] || {}).label || row.plan, inline: true },
      { name: 'Gültig bis', value: fmtDate(row.expires_at), inline: true }, { name: 'Gerät', value: row.device ? 'Gebunden (1 von 1)' : 'Noch nicht gebunden', inline: true },
      { name: 'Key', value: '`' + row.key.slice(0, 4) + '-••••-' + row.key.slice(-4) + '`', inline: true }] });
  }

  if (sub.name === 'reset-gerät') {
    const key = normKey(opt('key'));
    return (await resetDevice(env, key))
      ? eph(env, { title: 'Gerät freigegeben', color: COL.ok, desc: 'Der Key kann auf einem neuen PC aktiviert werden.', fields: [{ name: 'Key', value: '`' + key + '`' }] })
      : bad(env, 'Key nicht gefunden', '`' + key + '`');
  }

  if (sub.name === 'sperren') {
    const key = normKey(opt('key'));
    const r = await revokeKey(env, key);
    if (!r) return bad(env, 'Key nicht gefunden', '`' + key + '`');
    return eph(env, { title: 'Key gesperrt', color: COL.bad, fields: [
      { name: 'Key', value: '`' + key + '`', inline: true }, { name: 'Nutzer', value: r.row.discord_id ? `<@${r.row.discord_id}>` : 'nicht eingelöst', inline: true },
      { name: 'Customer-Rolle', value: !r.row.discord_id ? '–' : r.roleKept ? 'Bleibt (weiterer Key aktiv)' : 'Entzogen', inline: true }] });
  }

  if (sub.name === 'liste') {
    const rows = await listKeys(env, opt('user'));
    if (!rows.length) return eph(env, { title: 'Lizenzübersicht', desc: 'Keine Keys vorhanden.', color: COL.neutral });
    const t = now();
    return eph(env, { title: 'Lizenzübersicht', desc: rows.map(r => `\`${r.key}\` · ${r.discord_id ? `<@${r.discord_id}>` : 'frei'}\n${statusOf(r, t)} · ${(PLAN_ALL[r.plan] || {}).label || r.plan}${r.expires_at ? ' · bis ' + fmtDate(r.expires_at) : ''}${r.status === 'active' ? ' · ' + (r.device ? 'Gerät gebunden' : 'Gerät frei') : ''}`).join('\n\n') });
  }
  return bad(env, 'Unbekannter Befehl', '');
}

async function handleInteraction(i, env, ctx) {
  if (i.type === 1) return { type: 1 };
  const uid = (i.member && i.member.user || i.user || {}).id;

  if (i.type === 3) { // Buttons + Dropdowns
    const id = i.data.custom_id;
    if (id === 'ticket_buy' || id === 'ticket_open') return openTicket(i, env, uid, 'buy');
    if (id === 'ticket_support') return openTicket(i, env, uid, 'support');
    if (id === 'ticket_plan') return selectPlan(i, env, uid);
    if (id === 'ticket_close') return closeTicket(i, env, ctx, uid);
    if (id === 'rules_accept') {
      if (!env.MEMBER_ROLE_ID) return bad(env, 'Noch nicht eingerichtet', 'Das Team muss zuerst `/setup` ausführen.');
      const r = await addRole(env, uid, env.MEMBER_ROLE_ID);
      return r.ok ? eph(env, { title: 'Willkommen', color: COL.ok, desc: 'Du hast die Regeln akzeptiert und die Rolle **Member** erhalten.' }) : bad(env, 'Rolle nicht vergeben', 'Bitte melde dich beim Team.');
    }
    return bad(env, 'Unbekannte Aktion', '');
  }

  if (i.type === 2) {
    const name = i.data.name;
    if (name === 'setup') {
      if (!isAdmin(env, i)) return noPerm(env);
      const renew = !!((i.data.options || []).find(o => o.name === 'erneuern') || {}).value;
      ctx.waitUntil((async () => {
        const e2 = { ...env, _budget: { n: 0, max: 44 } };
        const res = await runSetup(e2, renew);
        await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${i.token}/messages/@original`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ embeds: [setupEmbed(env, res)] }) });
      })());
      return { type: 5, data: { flags: 64 } };
    }
    if (name === 'zugang') {
      if (!isAdmin(env, i)) return noPerm(env);
      const o = n => ((i.data.options || []).find(x => x.name === n) || {}).value;
      if (!env.USER_ROLE_ID) return bad(env, 'Rolle „User“ fehlt', 'Bitte zuerst `/setup` ausführen.');
      const target = o('user'), rem = !!o('entfernen');
      const r = rem ? await delRole(env, target, env.USER_ROLE_ID) : await addRole(env, target, env.USER_ROLE_ID);
      if (!r.ok) return bad(env, 'Rolle konnte nicht geändert werden', 'Die Bot-Rolle muss in den Servereinstellungen über der Rolle „User“ stehen.');
      return { type: 4, data: { embeds: [emb(env, { title: rem ? 'Zugang entzogen' : 'Zugang erteilt', color: rem ? COL.neutral : COL.ok, desc: `<@${target}> ${rem ? 'sieht den Server nicht mehr.' : 'hat jetzt Zugriff auf die Kanäle.'}` })], flags: 64 } };
    }
    if (name === 'key') return handleKey(i, env, ctx, uid);
  }
  return bad(env, 'Nicht unterstützt', '');
}

const notifyExpired = env => r => tryDM(env, r.discord_id, { embeds: [emb(env, { title: 'Deine Lizenz ist abgelaufen', color: COL.bad,
  desc: `Deine Lizenz (Key \`${r.key.slice(0, 4)}-••••-${r.key.slice(-4)}\`) ist am ${fmtDate(r.expires_at)} abgelaufen. Die Rolle Customer wurde entfernt.`,
  fields: [{ name: 'Verlängern', value: `Öffne ein Ticket in ${env.PANEL_CHANNEL_ID ? `<#${env.PANEL_CHANNEL_ID}>` : 'key-kaufen'}.` }] })] });

export default {
  async fetch(request, env0, ctx) {
    const url = new URL(request.url), ip = request.headers.get('cf-connecting-ip') || 'local';
    const cors = corsHeaders(env0, request);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (url.pathname === '/interactions' && request.method === 'POST') {
        const raw = await request.text();
        if (!(await verifyDiscord(request, env0, raw))) return new Response('bad signature', { status: 401 });
        return json(await handleInteraction(JSON.parse(raw), await withCfg(env0), ctx));
      }
      if (url.pathname === '/register' || url.pathname === '/setup') {
        if (!env0.SETUP_SECRET || url.searchParams.get('secret') !== env0.SETUP_SECRET) return new Response('nope', { status: 403 });
        const reg = await dapi(env0, 'PUT', `/applications/${env0.DISCORD_APP_ID}/guilds/${env0.GUILD_ID}/commands`, COMMANDS);
        return json({ commands: reg.ok ? 'ok' : reg.data });
      }
      if (url.pathname === '/auth/start') return authStart(url, env0);
      if (url.pathname === '/auth/callback') return authCallback(url, env0);
      const API = ['/auth/poll', '/license/activate', '/license/refresh', '/api/verify'];
      if (request.method === 'POST' && API.includes(url.pathname)) {
        if (!(await hit(env0, 'ip:' + ip, 40, 60))) return json({ ok: false, valid: false, error: 'rate', message: 'Zu viele Anfragen. Bitte kurz warten.' }, 429, cors);
        if (url.pathname !== '/auth/poll' && url.pathname !== '/license/refresh' && await blocked(env0, ip)) return json({ ok: false, valid: false, error: 'blocked', message: 'Zu viele Fehlversuche. Bitte später erneut versuchen.' }, 429, cors);
        let body; try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'json' }, 400, cors); }
        const env = await withCfg(env0);
        let res;
        if (url.pathname === '/auth/poll') res = await authPoll(body, env);
        else if (url.pathname === '/license/activate') res = await licenseActivate(body, env, ip);
        else if (url.pathname === '/license/refresh') res = await licenseRefresh(body, env);
        else res = await apiVerify(body, env, ip);
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
      }
      if (url.pathname === '/') return new Response('cft-license ok');
      return new Response('not found', { status: 404 });
    } catch (e) {
      return json({ ok: false, error: 'server', message: 'Serverfehler. Bitte später erneut versuchen.' }, 500, cors);
    }
  },
  async scheduled(event, env0, ctx) {
    ctx.waitUntil((async () => { const env = await withCfg(env0); await expireSweep(env, notifyExpired(env)); await cleanup(env0); })());
  }
};

export { expireSweep, COMMANDS };
