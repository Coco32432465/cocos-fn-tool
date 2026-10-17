// /setup: baut Kategorien, Kanaele, Rollen und Start-Embeds auf. Bereits Vorhandenes wird uebersprungen.
// Cloudflare Free erlaubt ~50 Discord-Aufrufe je Ausfuehrung: bei grossen Aufbauten einfach /setup noch einmal ausfuehren.
import { emb, COL, price, eph, bits, PERM } from './util.js';
import { statsEmbed, statsRows } from './stats.js';
import { PRIVACY_FIELDS } from './privacy.js';
import { dapi, setCfg, getCfg } from './discord.js';
import { boardEmbed } from './rank.js';
import { downloadComponents } from './panels.js';

const VIEW = 1024, HIST = 65536, SEND = 2048;
const ROLES = [
  { name: 'Admin', key: 'admin_role', color: 0x1e6bff, hoist: true, perms: String(BigInt(16 + 2 + 4 + 8192) + (1n << 40n)) },
  // Team-Rollen mit echten Rechten (Timeout, Verschieben, Stummschalten, Nachrichten verwalten ...)
  { name: 'Moderator', key: 'mod_role', color: 0xe74c3c, hoist: true, perms: bits(PERM.KICK, PERM.AUDIT, PERM.PRIORITY, PERM.MSG_MANAGE, PERM.MUTE, PERM.DEAFEN, PERM.MOVE, PERM.NICK, PERM.THREADS, PERM.TIMEOUT) },
  { name: 'Supporter', key: 'support_role', color: 0x1abc9c, hoist: true, perms: bits(PERM.MSG_MANAGE, PERM.THREADS, PERM.TIMEOUT, PERM.MOVE) },
  { name: 'Developer', key: 'dev_role', color: 0x9b59b6, hoist: true, perms: bits(PERM.THREADS, PERM.MOVE, PERM.PRIORITY) },
  { name: 'Content Manager', key: 'content_role', color: 0xe91e8c, hoist: true, perms: '0' },
  { name: 'Content Creator', key: 'creator_role', color: 0xff6ec7, hoist: true, perms: '0' },
  { name: 'Customer', key: 'customer_role', color: 0x2ecc71, hoist: true, perms: '0' },
  { name: 'Top 10', key: 'rank_role', color: 0xf1c40f, hoist: true, perms: '0' }, // vergibt der Bot automatisch an die Rangliste
  { name: 'Tester', key: 'tester_role', color: 0xf1c40f, hoist: false, perms: '0' },
  { name: 'Member', key: 'member_role', color: 0x8ea0c0, hoist: false, perms: '0' },
  { name: 'User', key: 'user_role', color: 0x5c97ff, hoist: false, perms: '0' } // Zugangs-Rolle: ohne sie sieht man keine Kanaele
];
const STAFF = ['admin_role', 'mod_role', 'support_role', 'dev_role'];
// Mit diesen Rollen sind die Kanaele sichtbar. Alle anderen (z. B. Freunde ohne Rolle) sehen nichts.
const ACCESS = [...STAFF, 'content_role', 'creator_role', 'customer_role', 'rank_role', 'tester_role', 'member_role', 'user_role'];
// [name, Emoji, Beschreibung, nurTeamSchreibt, Art]   Art: leer = Text | 'voice' | 'forum'
const RENAMED = { shop: 'key-kaufen' }; // frueherer Kanalname, wird beim Setup umbenannt
const FORUM_TAGS = ['💡 Idee', '🐛 Problem', '⏳ In Arbeit', '✅ Umgesetzt', '❌ Abgelehnt'].map(name => ({ name }));
const STRUCT = [
  { cat: 'START', emoji: '🚀', ch: [['welcome', '👋', 'Willkommen und erste Schritte', 1], ['rules', '📜', 'Server-Regeln', 1], ['announcements', '📢', 'Ankündigungen', 1], ['patchnotes', '🧩', "Patchnotes zu Ninjago Tools", 1], ['status', '📊', 'Live-Status: aktuelle Version und Download', 1], ['download', '📥', 'Download der App', 1], ['free-tips', '💡', 'Kostenlose Fortnite-Tipps', 0]] },
  { cat: 'COMMUNITY', emoji: '💬', ch: [['general', '💬', 'Allgemeiner Austausch', 0], ['placements', '🏆', 'Eure Platzierungen und Ergebnisse', 0], ['rangliste', '🥇', 'Community-Rangliste (per App freiwillig)', 1], ['giveaways', '🎉', 'Giveaways: mitmachen und gewinnen', 1], ['umfragen', '📊', 'Umfragen: starte eigene Abstimmungen per Button', 1], ['lfg', '🎮', 'Mitspieler suchen: Duo, Trio oder Squad per Button', 1], ['events', '📅', 'Events und Scrims: per Button zu- oder absagen', 1], ['questions', '❓', 'Fragen zu Fortnite und zum Tool', 0]] },
  { cat: 'TOOL', emoji: '🛠️', ch: [['how-to-use', '📖', 'So nutzt du das Tool', 1], ['feedback', '💌', 'Dein Feedback zum Tool (Button unten)', 1], ['bug-reports', '🐛', 'Fehler melden (Button unten)', 1], ['support', '🎫', 'Hilfe per Ticket', 1], ['shop', '🛒', 'Shop: Lizenz, Team, Tweak-Paket und Season-Pass', 1], ['impressum', '⚖️', 'Impressum', 1], ['datenschutz', '🔒', 'Datenschutz: was gespeichert wird und deine Rechte', 1]] },
  { cat: 'WORKSPACE', emoji: '🧰', ch: [['arbeit', '🎧', 'Team-Call – nur für das Team', 0, 'voice'], ['live-stats', '📈', 'Live-Stats: Keys, Nutzer, Umsatz (nur Team)', 1, '', 'admin'], ['meine-sachen', '📝', 'Deine privaten Notizen, Links und Dateien (nur Admin)', 1, '', 'admin'], ['vorschläge', '💡', 'Dein Vorschlag fürs Tool: ein Beitrag pro Idee, mit Tag und Beschreibung. Mit 👍 abstimmen.', 0, 'forum']] },
  { cat: 'INTERN', emoji: '🔒', priv: 'staff', ch: [['team-chat', '💼', 'Interner Team-Chat', 1, '', 'staff'], ['ticket-logs', '🗂️', 'Ticket-Transkripte (nur Team)', 1, '', 'admin']] }
];
const TYPE = { '': 0, voice: 2, forum: 15 };
const chName = (emoji, name) => `${emoji}│${name}`;
const catName = (emoji, name) => `${emoji} ${name}`;
const baseCh = n => String(n).toLowerCase().replace(/^[^a-z0-9]+/, '');       // "📜│rules" -> "rules"
const baseCat = n => String(n).toLowerCase().replace(/[^a-z]/g, '');           // "🚀 START" -> "start"
const normOv = a => (a || []).map(o => `${o.id}:${o.type}:${o.allow || '0'}:${o.deny || '0'}`).sort().join('|');

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
    const staffIds = STAFF.filter(k => rid[k]).map(k => rid[k]);
    const adminUsers = String(env.ADMIN_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
    const userIds = ACCESS.filter(k => rid[k] && !STAFF.includes(k)).map(k => rid[k]);
    const accessAllow = ACCESS.filter(k => rid[k]).map(k => ({ id: rid[k], type: 0, allow: String(VIEW + HIST) }));
    const bot = (extra) => ({ id: env.DISCORD_APP_ID, type: 1, allow: String(VIEW + HIST + SEND + extra) });
    const writers = (roleIds) => [...roleIds.map(id => ({ id, type: 0, allow: String(VIEW + HIST + SEND) })), ...adminUsers.map(u => ({ id: u, type: 1, allow: String(VIEW + HIST + SEND) }))];
    const teamWrite = writers(staffIds);
    // sichtbar nur mit Zugangsrolle; offen = alle mit Zugang duerfen schreiben
    const ovOpen = () => [{ id: gid, type: 0, deny: String(VIEW) }, ...accessAllow, bot(0)];
    // gesperrt = alle mit Zugang lesen nur, Team schreibt
    const ovLocked = () => [{ id: gid, type: 0, deny: String(VIEW + SEND) }, ...accessAllow, ...teamWrite, bot(0)];
    const ovStaff = () => [{ id: gid, type: 0, deny: String(VIEW) }, ...teamWrite, bot(0)];
    const ovAdmin = () => [{ id: gid, type: 0, deny: String(VIEW) }, ...writers(['admin_role', 'mod_role', 'support_role'].map(k => rid[k]).filter(Boolean)), bot(0)];
    // Workspace: alle sehen den Call, aber nur das Team darf hinein; im Forum duerfen alle Beitraege erstellen
    const ovVoice = () => [{ id: gid, type: 0, deny: String(VIEW) },
      ...userIds.map(id => ({ id, type: 0, allow: bits(PERM.VIEW), deny: bits(PERM.CONNECT, PERM.SPEAK) })),
      ...staffIds.map(id => ({ id, type: 0, allow: bits(PERM.VIEW, PERM.CONNECT, PERM.SPEAK, PERM.STREAM) })),
      ...adminUsers.map(u => ({ id: u, type: 1, allow: bits(PERM.VIEW, PERM.CONNECT, PERM.SPEAK, PERM.STREAM) })), bot(0)];
    const ovForum = () => [{ id: gid, type: 0, deny: String(VIEW) },
      ...ACCESS.filter(k => rid[k]).map(k => ({ id: rid[k], type: 0, allow: bits(PERM.VIEW, PERM.HIST, PERM.SEND_THREAD, PERM.PUB_THREAD, PERM.ATTACH, PERM.EMBED, PERM.REACT) })), bot(0)];
    const ids = {};
    for (const S of STRUCT) {
      const wantName = catName(S.emoji, S.cat), wantOv = S.priv ? ovStaff() : ovOpen();
      let cat = chans.find(c => c.type === 4 && baseCat(c.name) === S.cat.toLowerCase());
      if (!cat) {
        const c = await dapi(env, 'POST', `/guilds/${gid}/channels`, { name: wantName, type: 4, permission_overwrites: wantOv });
        if (!c.ok) { L(`Kategorie ${S.cat}: Fehler (${c.status})`); continue; }
        cat = c.data; L(`Kategorie ${S.cat}: erstellt`);
      } else if (cat.name !== wantName || normOv(cat.permission_overwrites) !== normOv(wantOv)) {
        const c = await dapi(env, 'PATCH', `/channels/${cat.id}`, { name: wantName, permission_overwrites: wantOv });
        L(`Kategorie ${S.cat}: ${c.ok ? 'aktualisiert' : 'Fehler (' + c.status + ')'}`);
      } else L(`Kategorie ${S.cat}: ok`);
      for (const [name, emoji, topic, locked, kind = '', priv] of S.ch) {
        const want = chName(emoji, name), typ = TYPE[kind];
        const ov = kind === 'voice' ? ovVoice() : kind === 'forum' ? ovForum() : priv === 'admin' ? ovAdmin() : priv === 'staff' || S.priv ? ovStaff() : locked ? ovLocked() : ovOpen();
        const ex = chans.find(c => c.type === typ && baseCh(c.name) === name) || (RENAMED[name] && chans.find(c => c.type === typ && baseCh(c.name) === RENAMED[name]));
        if (ex) {
          ids[name] = ex.id;
          if (ex.name !== want || ex.parent_id !== cat.id || normOv(ex.permission_overwrites) !== normOv(ov)) {
            const c = await dapi(env, 'PATCH', `/channels/${ex.id}`, { name: want, parent_id: cat.id, permission_overwrites: ov });
            L(`#${name}: ${c.ok ? 'aktualisiert' : 'Fehler (' + c.status + ')'}`);
          } else L(`#${name}: ok`);
          continue;
        }
        const body = { name: want, type: typ, parent_id: cat.id, permission_overwrites: ov };
        if (kind !== 'voice') body.topic = topic;
        if (kind === 'forum') Object.assign(body, { available_tags: FORUM_TAGS, default_reaction_emoji: { emoji_name: '👍' }, default_sort_order: 1 });
        const c = await dapi(env, 'POST', `/guilds/${gid}/channels`, body);
        if (!c.ok) { L(`#${name}: Fehler (${c.status})`); continue; }
        ids[name] = c.data.id; L(`#${name}: erstellt`);
      }
    }
    for (const [name, key] of [['ticket-logs', 'log_channel'], ['shop', 'key_channel'], ['support', 'support_channel'], ['feedback', 'feedback_channel'], ['bug-reports', 'bug_channel'], ['status', 'status_channel'], ['rangliste', 'rank_channel'], ['giveaways', 'giveaway_channel'], ['umfragen', 'poll_channel'], ['lfg', 'lfg_channel'], ['events', 'event_channel'], ['live-stats', 'stats_channel'], ['general', 'general_channel'], ['download', 'download_channel']]) {
      if (ids[name]) await setCfg(env, key, ids[name]);
    }

    const M = n => ids[n] ? `<#${ids[n]}>` : `#${n}`;
    const posts = [
      ['welcome', 'welcome', { embeds: [emb(env, { banner: true, title: "Willkommen bei Ninjago Tools", desc: "Ninjago Tools ist das VOD-Review-Tool für Fortnite: Replays analysieren, Fehler erkennen und dein Gameplay auf das nächste Level bringen.", fields: [
        { name: 'Erste Schritte', value: `1. Regeln lesen: ${M('rules')}\n2. Anleitung: ${M('how-to-use')}\n3. App laden: ${M('download')}` },
        { name: 'Lizenz und Shop', value: `Für die VOD-Analyse brauchst du einen Key: ${M('shop')}` },
        { name: 'Community', value: `Rangliste: ${M('rangliste')} · Ideen einreichen: ${M('vorschläge')}` },
        { name: 'Hilfe', value: `Fragen: ${M('questions')} · Support per Ticket: ${M('support')}` }] })] }],
      ['rules', 'rules', { embeds: [emb(env, { title: 'Regeln', desc: '**1. Respekt** – Geh respektvoll mit allen um. Keine Beleidigungen, Diskriminierung oder Hetze.\n**2. Kein Spam** – Keine Werbung, Fremd-Links oder Mehrfach-Posts.\n**3. Keys sind persönlich** – Ein Key ist an dein Discord-Konto und ein Gerät gebunden. Weitergabe führt zur Sperre ohne Erstattung.\n**4. Zahlung nur im Ticket** – Bezahlt wird ausschließlich im Ticket-Kanal. Das Team schreibt dich nie zuerst privat an.\n**5. Discord-Richtlinien** – Es gelten die Nutzungsbedingungen und Community-Richtlinien von Discord.\n\nMit dem Button bestätigst du die Regeln und erhältst die Rolle **Member**.' })], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Regeln akzeptieren', custom_id: 'rules_accept' }] }] }],
      ['download', 'download', { embeds: [emb(env, { banner: true, title: 'Download', desc: "Lade die aktuelle Version von Ninjago Tools herunter. Updates installiert die App danach automatisch.", fields: [
        { name: 'System', value: 'Windows 10/11 (64-Bit)', inline: true }, { name: 'Lizenz', value: `Für die VOD-Analyse nötig – ${M('shop')}`, inline: true }] })], components: downloadComponents(env.DOWNLOAD_URL || 'https://github.com/Coco32432465/cocos-fn-tool/releases/latest') }],
      ['shop', 'key-panel', { embeds: [emb(env, { banner: true, title: "🛒 Ninjago Tools Shop", desc: 'Alles, was du für Ninjago Tools kaufen kannst. Eröffne ein Ticket, wähle, was du willst, bezahle und bekomme es nach der Bestätigung freigeschaltet.', fields: [
        { name: '🔑 Lizenz', value: `1 Woche **${price(env, 'week')}** · 1 Monat **${price(env, 'month')}**\nVOD-Analyse, alle Modi, 1 Gerät pro Key`, inline: true },
        { name: '🏆 Team-Lizenz', value: `**${price(env, 'team')}** pro Monat\n5 Keys + Coach-Dashboard für dein ganzes Team`, inline: true },
        { name: '⚙️ Tweak-Paket', value: `**${price(env, 'tweaks')}** einmalig\nFPS-Einstellungen für Fortnite und Windows per Klick, mit Zurück-Knopf. Der PC-Check ist gratis.`, inline: true },
        { name: '🏅 Season-Pass Premium', value: `**${price(env, 'pass')}** pro Season\nExtra-Belohnungen und +25 % XP. Der kostenlose Pass ist für alle in der App.`, inline: true },
        { name: '🎁 Creator-Code', value: 'Du hast den Code eines Creators? Gib ihn im Ticket ein: **Bonus-Tage** extra für dich, der Creator wird belohnt.', inline: true },
        { name: 'Ablauf', value: '1. Ticket eröffnen und Produkt wählen\n2. Bezahlen\n3. Das Team bestätigt, dein Kauf ist freigeschaltet\n4. Keys gibst du in der App mit Discord-Verbindung ein' }] })], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Kaufen', custom_id: 'ticket_buy', emoji: { name: '🛒' } }, { type: 2, style: 3, label: '3 Tage gratis testen', custom_id: 'trial_start' }] }] }],
      ['umfragen', 'poll-panel', { embeds: [emb(env, { title: '📊 Umfrage starten', desc: 'Du willst die Community etwas fragen? Klicke auf den Button, schreib deine Frage und die Optionen (eine pro Zeile) und fertig. Alle stimmen per Klick ab, nochmal klicken zieht die Stimme zurück.', fields: [{ name: 'Gut zu wissen', value: 'Bis zu 5 Optionen · Dauer frei wählbar (Standard 24 Stunden) · Das Ergebnis erscheint automatisch am Ende.' }] })], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Neue Umfrage', custom_id: 'poll_new', emoji: { name: '📊' } }] }] }],
      ['lfg', 'lfg-panel', { embeds: [emb(env, { title: '🎮 Mitspieler suchen', desc: 'Such dir ein Duo, Trio oder Squad. Klicke auf eine Größe, schreib optional kurz dazu, worum es geht (Ranked, Zero Build, Scrims, Uhrzeit), und deine Suche erscheint hier. Wer mitspielen will, klickt auf **Beitreten**.', fields: [{ name: 'Ablauf', value: 'Sobald alle Plätze belegt sind, meldet sich der Bot mit einer Erwähnung. Mit **Verlassen** trittst du aus oder schließt deine Suche.' }] })], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Duo', custom_id: 'lfg_new_duo', emoji: { name: '2️⃣' } }, { type: 2, style: 1, label: 'Trio', custom_id: 'lfg_new_trio', emoji: { name: '3️⃣' } }, { type: 2, style: 1, label: 'Squad', custom_id: 'lfg_new_squad', emoji: { name: '4️⃣' } }] }] }],
      ['how-to-use', 'howto', { embeds: [emb(env, { banner: true, title: '📖 So nutzt du Ninjago Tools', desc: `Von der Installation zur ersten Analyse in wenigen Minuten.\n\n### 🚀 Los geht’s\n**1 · App laden**\nHol dir Ninjago Tools im Kanal ${M('download')}. Updates kommen danach automatisch.\n\n**2 · Mit Discord verbinden**\nApp starten, **Mit Discord verbinden** klicken, im Browser bestätigen.\n\n**3 · Lizenz aktivieren**\nKey holen im ${M('shop')} (oder 3 Tage gratis testen) und in der App eingeben. Die Laufzeit startet erst beim Einlösen.\n\n**4 · Replays analysieren**\nDie App findet neue Replays selbst. Du kannst auch Dateien per Drag and Drop laden.`, fields: [
        { name: '🧭 Die Modi', value: '**VOD Review** · Replay Viewer mit Fehlern und Kämpfen\n**Fortschritt & Training** · Trend, Session, Vergleich, Trainingsplan, Team\n**Landung & Rotation** · deine Landeorte und Rotationen\n**PC-Check & Tweaks** · FPS-Bremsen finden und beheben\n**Season-Pass** · Aufgaben, Level und Belohnungen\n**Patchnotes** · alles Neue auf einen Blick' },
        { name: '💡 Gut zu wissen', value: '• Deine Replays bleiben auf deinem PC\n• Ein Key gilt für ein Gerät\n• Rangliste und Team-Teilen sind freiwillig', inline: true },
        { name: '🆘 Hilfe', value: `Fragen: ${M('questions')}\nFehler: ${M('bug-reports')}\nSupport: ${M('support')}`, inline: true }] })] }],
      ['live-stats', 'stats-panel', { embeds: [await statsEmbed(env)], components: statsRows() }],
      ['datenschutz', 'privacy', { embeds: [emb(env, { title: '🔒 Datenschutz', desc: 'Kurz und ehrlich: Wir speichern nur, was für Lizenz, Support und Community nötig ist. Deine **Replays bleiben auf deinem PC**.', fields: PRIVACY_FIELDS })] }],
      ['status', 'status', { embeds: [emb(env, { title: '📊 Ninjago Tools · Status', desc: 'Der Status wird in wenigen Minuten automatisch aktualisiert.' })] }],
      ['rangliste', 'rankboard', { embeds: [boardEmbed(env, [], 0)] }],
      ['feedback', 'feedback-panel', { embeds: [emb(env, { title: '💌 Feedback senden', desc: 'Dir gefällt etwas, du vermisst etwas oder hast eine Idee? Klicke auf den Button und schreib uns – dein Feedback landet direkt beim Team.', fields: [{ name: 'Größere Ideen', value: `Poste sie im Forum ${M('vorschläge')}, dort kann die Community abstimmen.` }] })], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Feedback senden', custom_id: 'form_feedback', emoji: { name: '💌' } }] }] }],
      ['bug-reports', 'bug-panel', { embeds: [emb(env, { title: '🐛 Fehler melden', desc: 'Etwas funktioniert nicht? Klicke auf den Button, beschreibe den Fehler und nenne die App-Version. Das Team setzt den Status (Offen → In Arbeit → Erledigt).', fields: [{ name: 'Tipp', value: 'Schreib, was du vorher gemacht hast und welche Replay-Datei betroffen ist.' }] })], components: [{ type: 1, components: [{ type: 2, style: 4, label: 'Fehler melden', custom_id: 'form_bug', emoji: { name: '🐛' } }] }] }],
      ['support', 'support-panel', { embeds: [emb(env, { title: 'Support', desc: 'Du brauchst Hilfe mit dem Tool oder deinem Key? Eröffne ein privates Ticket, das Team meldet sich.', fields: [{ name: 'Tipp', value: `Häufige Fragen findest du in ${M('questions')} und ${M('how-to-use')}.` }] })], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Hilfe-Ticket öffnen', custom_id: 'ticket_support' }] }] }]
    ];
    for (const [chName, flag, payload] of posts) {
      const cid = ids[chName]; if (!cid) continue;
      const stored = await getCfg(env, 'posted:' + flag);
      if (!renew && stored) { L(`Nachricht ${flag}: schon gepostet`); continue; }
      // Eigene Nachrichten im Kanal suchen: gespeicherte ID oder gleicher Titel (auch Altlasten/Duplikate)
      const h = await dapi(env, 'GET', `/channels/${cid}/messages?limit=50`);
      const title = payload.embeds[0].title;
      const mine = h.ok ? h.data.filter(m => m.author && m.author.id === env.DISCORD_APP_ID) : [];
      const same = mine.filter(m => m.id === stored || (m.embeds || []).some(e => e.title === title));
      const target = same.find(m => m.id === stored) || same[0];
      if (target && !renew) { await setCfg(env, 'posted:' + flag, target.id); L(`Nachricht ${flag}: schon vorhanden`); continue; }
      if (target) { // erneuern = bestehende Nachricht bearbeiten, Doppelte loeschen
        const e = await dapi(env, 'PATCH', `/channels/${cid}/messages/${target.id}`, { content: '', embeds: payload.embeds, components: payload.components || [] });
        if (e.ok) {
          await setCfg(env, 'posted:' + flag, target.id);
          let del = 0; for (const d of same) if (d.id !== target.id && del < 5) { await dapi(env, 'DELETE', `/channels/${cid}/messages/${d.id}`); del++; }
          L(`Nachricht ${flag}: aktualisiert${del ? ` (${del} Doppelte gelöscht)` : ''}`); continue;
        }
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
