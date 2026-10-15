// /setup: baut Kategorien, Kanaele, Rollen und Start-Embeds auf. Bereits Vorhandenes wird uebersprungen.
// Cloudflare Free erlaubt ~50 Discord-Aufrufe je Ausfuehrung: bei grossen Aufbauten einfach /setup noch einmal ausfuehren.
import { emb, COL, price, eph } from './util.js';
import { dapi, setCfg, getCfg } from './discord.js';

const VIEW = 1024, HIST = 65536, SEND = 2048;
const ROLES = [
  { name: 'Admin', key: 'admin_role', color: 0x1e6bff, hoist: true, perms: String(BigInt(16 + 2 + 4 + 8192) + (1n << 40n)) },
  { name: 'Customer', key: 'customer_role', color: 0x2ecc71, hoist: true, perms: '0' },
  { name: 'Member', key: 'member_role', color: 0x8ea0c0, hoist: false, perms: '0' },
  { name: 'Tester', key: 'tester_role', color: 0xf1c40f, hoist: false, perms: '0' }
];
// [name, Beschreibung, nurAdminSchreibt]
const STRUCT = [
  { cat: 'START', ch: [['welcome', 'Willkommen und erste Schritte', 1], ['rules', 'Server-Regeln', 1], ['announcements', 'Ankündigungen', 1], ['patchnotes', "Patchnotes zu Coco's Fn Tool", 1], ['download', 'Download der App', 1], ['free-tips', 'Kostenlose Fortnite-Tipps', 0]] },
  { cat: 'COMMUNITY', ch: [['general', 'Allgemeiner Austausch', 0], ['placements', 'Eure Platzierungen und Ergebnisse', 0], ['lfg', 'Mitspieler suchen', 0], ['questions', 'Fragen zu Fortnite und zum Tool', 0]] },
  { cat: 'TOOL', ch: [['how-to-use', 'So nutzt du das Tool', 1], ['feedback', 'Dein Feedback zum Tool', 0], ['bug-reports', 'Fehler melden', 0], ['support', 'Hilfe per Ticket', 1], ['key-kaufen', 'Lizenz erwerben', 1], ['impressum', 'Impressum', 1]] },
  { cat: 'INTERN', priv: true, ch: [['ticket-logs', 'Ticket-Transkripte (nur Team)', 1]] }
];

export async function runSetup(env, renew) {
  const lines = [];
  let partial = false;
  const L = (s) => lines.push(s);
  try {
    const gid = env.GUILD_ID;
    const roles = (await dapi(env, 'GET', `/guilds/${gid}/roles`)).data || [];
    const chans = (await dapi(env, 'GET', `/guilds/${gid}/channels`)).data || [];
    const rid = {};
    for (const R of ROLES) {
      let r = roles.find(x => x.name.toLowerCase() === R.name.toLowerCase());
      if (r) { L(`Rolle ${R.name}: vorhanden`); }
      else {
        let c = await dapi(env, 'POST', `/guilds/${gid}/roles`, { name: R.name, color: R.color, hoist: R.hoist, permissions: R.perms });
        if (!c.ok && R.perms !== '0') c = await dapi(env, 'POST', `/guilds/${gid}/roles`, { name: R.name, color: R.color, hoist: R.hoist, permissions: '0' });
        if (!c.ok) { L(`Rolle ${R.name}: Fehler (${c.status}) – Bot braucht „Rollen verwalten“`); continue; }
        r = c.data; L(`Rolle ${R.name}: erstellt`);
      }
      rid[R.key] = r.id; await setCfg(env, R.key, r.id);
    }
    const adminRole = rid.admin_role;
    const lockOv = adminRole => [
      { id: gid, type: 0, allow: String(VIEW + HIST), deny: String(SEND) },
      ...(adminRole ? [{ id: adminRole, type: 0, allow: String(SEND) }] : []),
      { id: env.DISCORD_APP_ID, type: 1, allow: String(SEND + VIEW) }
    ];
    const ids = {};
    for (const S of STRUCT) {
      let cat = chans.find(c => c.type === 4 && c.name.toLowerCase() === S.cat.toLowerCase());
      if (cat) L(`Kategorie ${S.cat}: vorhanden`);
      else {
        const ov = S.priv
          ? [{ id: gid, type: 0, deny: String(VIEW) }, ...(adminRole ? [{ id: adminRole, type: 0, allow: String(VIEW + HIST + SEND) }] : []), { id: env.DISCORD_APP_ID, type: 1, allow: String(VIEW + SEND) }]
          : [{ id: gid, type: 0, allow: String(VIEW + HIST) }];
        const c = await dapi(env, 'POST', `/guilds/${gid}/channels`, { name: S.cat, type: 4, permission_overwrites: ov });
        if (!c.ok) { L(`Kategorie ${S.cat}: Fehler (${c.status})`); continue; }
        cat = c.data; L(`Kategorie ${S.cat}: erstellt`);
      }
      for (const [name, topic, locked] of S.ch) {
        const ex = chans.find(c => c.type === 0 && c.name === name);
        if (ex) { ids[name] = ex.id; L(`#${name}: vorhanden`); continue; }
        const body = { name, type: 0, parent_id: cat.id, topic };
        if (locked && !S.priv) body.permission_overwrites = lockOv(adminRole);
        const c = await dapi(env, 'POST', `/guilds/${gid}/channels`, body);
        if (!c.ok) { L(`#${name}: Fehler (${c.status})`); continue; }
        ids[name] = c.data.id; L(`#${name}: erstellt`);
      }
    }
    if (ids['ticket-logs']) await setCfg(env, 'log_channel', ids['ticket-logs']);
    if (ids['key-kaufen']) await setCfg(env, 'key_channel', ids['key-kaufen']);
    if (ids['support']) await setCfg(env, 'support_channel', ids['support']);

    const M = n => ids[n] ? `<#${ids[n]}>` : `#${n}`;
    const posts = [
      ['welcome', 'welcome', { embeds: [emb(env, { title: "Willkommen bei Coco's Fn Tool", desc: "Coco's Fn Tool ist das VOD-Review-Tool für Fortnite: Replays analysieren, Fehler erkennen und dein Gameplay auf das nächste Level bringen.", fields: [
        { name: 'Erste Schritte', value: `1. Regeln lesen: ${M('rules')}\n2. Anleitung: ${M('how-to-use')}\n3. App laden: ${M('download')}` },
        { name: 'Lizenz', value: `Für die VOD-Analyse brauchst du einen Key: ${M('key-kaufen')}` },
        { name: 'Hilfe', value: `Fragen: ${M('questions')} · Support per Ticket: ${M('support')}` }] })] }],
      ['rules', 'rules', { embeds: [emb(env, { title: 'Regeln', desc: '**1. Respekt** – Geh respektvoll mit allen um. Keine Beleidigungen, Diskriminierung oder Hetze.\n**2. Kein Spam** – Keine Werbung, Fremd-Links oder Mehrfach-Posts.\n**3. Keys sind persönlich** – Ein Key ist an dein Discord-Konto und ein Gerät gebunden. Weitergabe führt zur Sperre ohne Erstattung.\n**4. Zahlung nur im Ticket** – Bezahlt wird ausschließlich im Ticket-Kanal. Das Team schreibt dich nie zuerst privat an.\n**5. Discord-Richtlinien** – Es gelten die Nutzungsbedingungen und Community-Richtlinien von Discord.\n\nMit dem Button bestätigst du die Regeln und erhältst die Rolle **Member**.' })], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Regeln akzeptieren', custom_id: 'rules_accept' }] }] }],
      ['download', 'download', { embeds: [emb(env, { title: 'Download', desc: "Lade die aktuelle Version von Coco's Fn Tool herunter. Updates installiert die App danach automatisch.", fields: [
        { name: 'System', value: 'Windows 10/11 (64-Bit)', inline: true }, { name: 'Lizenz', value: `Für die VOD-Analyse nötig – ${M('key-kaufen')}`, inline: true }] })], components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Download', url: env.DOWNLOAD_URL || 'https://example.com/download' }] }] }],
      ['key-kaufen', 'key-panel', { embeds: [emb(env, { title: "Coco's Fn Tool – Lizenz erwerben", desc: 'Eröffne ein Ticket, um eine Lizenz zu bestellen.', fields: [
        { name: '1 Woche', value: price(env, 'week'), inline: true }, { name: '1 Monat', value: price(env, 'month'), inline: true }, { name: 'Umfang', value: 'VOD-Analyse · 1 Gerät pro Key', inline: true },
        { name: 'Ablauf', value: '1. Ticket eröffnen und Laufzeit wählen\n2. Bezahlen\n3. Nach Bestätigung erhältst du deinen Key\n4. In der App mit Discord verbinden und Key eingeben' }] })], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Key kaufen', custom_id: 'ticket_buy' }] }] }],
      ['support', 'support-panel', { embeds: [emb(env, { title: 'Support', desc: 'Du brauchst Hilfe mit dem Tool oder deinem Key? Eröffne ein privates Ticket, das Team meldet sich.', fields: [{ name: 'Tipp', value: `Häufige Fragen findest du in ${M('questions')} und ${M('how-to-use')}.` }] })], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Hilfe-Ticket öffnen', custom_id: 'ticket_support' }] }] }]
    ];
    for (const [chName, flag, payload] of posts) {
      const cid = ids[chName]; if (!cid) continue;
      if (!renew && await getCfg(env, 'posted:' + flag)) { L(`Nachricht ${flag}: schon gepostet`); continue; }
      if (!renew) { // bereits vorhandene Bot-Nachricht mit gleichem Titel erkennen (z. B. altes Panel)
        const h = await dapi(env, 'GET', `/channels/${cid}/messages?limit=15`);
        if (h.ok && h.data.some(m => m.author && m.author.id === env.DISCORD_APP_ID && (m.embeds || []).some(e => e.title === payload.embeds[0].title))) { await setCfg(env, 'posted:' + flag, 1); L(`Nachricht ${flag}: schon vorhanden`); continue; }
      }
      const p = await dapi(env, 'POST', `/channels/${cid}/messages`, payload);
      if (p.ok) { await setCfg(env, 'posted:' + flag, p.data.id); L(`Nachricht ${flag}: gepostet`); } else L(`Nachricht ${flag}: Fehler (${p.status})`);
    }
  } catch (e) {
    if (String(e.message) === 'BUDGET') partial = true; else L('Fehler: ' + e.message);
  }
  return { lines, partial };
}

export function setupEmbed(env, res) {
  return emb(env, {
    title: res.partial ? 'Setup teilweise abgeschlossen' : 'Setup abgeschlossen',
    color: res.partial ? COL.neutral : COL.ok,
    desc: res.lines.join('\n').slice(0, 3800) + (res.partial ? '\n\nLimit erreicht – bitte `/setup` noch einmal ausführen. Fertiges wird übersprungen.' : '\n\nBereits Vorhandenes wurde übersprungen.')
  });
}
