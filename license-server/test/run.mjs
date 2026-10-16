// Lokaler Test (ohne Cloudflare/Discord): Migration, Tickets, Key-System, API, Rate-Limit, Cron, Setup.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../src/index.js';
import { runSetup } from '../src/setup.js';
import { postPatchnotes, parsePatchnotes } from '../src/patchnotes.js';
import { makeDb, makeEnv, makeDiscord, signer } from './mock.mjs';

// 1) Migration v1 -> v2 mit Altdaten
const { db, D1 } = makeDb(['test/schema_v1.sql']);
db.prepare("INSERT INTO keys (key,discord_id,plan,created_at,expires_at,device) VALUES ('OLD1-OLD2-OLD3-OLD4','U9','week',1,4000000000,'dev-old-1')").run();
db.prepare("INSERT INTO keys (key,discord_id,plan,created_at,expires_at,revoked) VALUES ('REV1-REV2-REV3-REV4','U9','month',1,4000000000,1)").run();
db.prepare("INSERT INTO tickets VALUES ('CHX','U9',1)").run();
db.exec(await (await import('node:fs/promises')).readFile(new URL('../migrations/002_v2.sql', import.meta.url), 'utf8'));
const { disc, env } = makeEnv(D1); const sg = signer(disc); const S = makeDiscord();
const pend = []; const ctx = { waitUntil: p => pend.push(p) };
const flush = async () => { await Promise.all(pend.splice(0)); };

let ok = 0; const T = async (n, f) => { try { await f(); ok++; console.log('ok  ', n); } catch (e) { console.log('FAIL', n, '\n', e); process.exitCode = 1; } };
const mem = (id, extra = {}) => ({ user: { id, username: 'user' + id }, roles: [], ...extra });
async function inter(body) { const s = sg(body); const r = await worker.fetch(new Request('https://w.dev/interactions', { method: 'POST', body: s.raw, headers: s.headers }), env, ctx); return r.status === 200 ? r.json() : { status: r.status }; }
const J = r => JSON.stringify(r.data || r);
let ipn = 0;
const post = async (p, b, ip) => { const r = await worker.fetch(new Request('https://w.dev' + p, { method: 'POST', body: JSON.stringify(b), headers: { 'cf-connecting-ip': ip || 'ip' + (++ipn) } }), env, ctx); return { status: r.status, body: await r.json() }; };
const cmd = (sub, options, who = 'ADMIN', ch = 'X') => inter({ type: 2, channel_id: ch, token: 'tok', data: { name: 'key', options: [{ type: 1, name: sub, options }] }, member: mem(who) });
const KEYRE = /[A-Z0-9]{4}(-[A-Z0-9]{4}){2}/g;

await T('Migration: Altdaten bleiben, Status korrekt', async () => {
  const o = db.prepare("SELECT * FROM keys WHERE key='OLD1-OLD2-OLD3-OLD4'").get(); assert.equal(o.status, 'active'); assert.equal(o.days, 7); assert.equal(o.device, 'dev-old-1');
  assert.equal(db.prepare("SELECT status FROM keys WHERE key='REV1-REV2-REV3-REV4'").get().status, 'revoked');
  assert.equal(db.prepare("SELECT type FROM tickets WHERE channel_id='CHX'").get().type, 'buy');
});
await T('Signatur: Ping ok, falsche abgelehnt, /register nur mit Secret', async () => {
  assert.equal((await inter({ type: 1 })).type, 1);
  assert.equal((await worker.fetch(new Request('https://w.dev/interactions', { method: 'POST', body: '{}', headers: { 'x-signature-ed25519': 'aa'.repeat(64), 'x-signature-timestamp': '1' } }), env, ctx)).status, 401);
  assert.equal((await worker.fetch(new Request('https://w.dev/register?secret=x'), env, ctx)).status, 403);
  assert.equal((await (await worker.fetch(new Request('https://w.dev/register?secret=sec'), env, ctx)).json()).commands, 'ok');
});
await T('Kauf-Ticket: privater Kanal, einmal je Nutzer, Support separat', async () => {
  const a = await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('U1') }); assert.match(J(a), /<#C\d+>/);
  const ch = S.channels.find(c => c.name.startsWith('kauf-useru1-')); assert.ok(ch); assert.ok(ch.permission_overwrites.some(o => o.id === 'G' && o.deny === '1024'));
  assert.match(J(await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('U1') })), /bereits/);
  assert.match(J(await inter({ type: 3, data: { custom_id: 'ticket_support' }, member: mem('U1') })), /<#C\d+>/);
  const first = S.msgs[ch.id][0]; assert.equal(first.components[0].components[0].type, 3); // Dropdown vorhanden
});
await T('Dropdown Laufzeit zeigt Preis + Zahlungshinweis, Fremde nicht', async () => {
  const ch = S.channels.find(c => c.name.startsWith('kauf-useru1-'));
  const r = await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', component_type: 3, values: ['month'] }, member: mem('U1') });
  assert.equal(r.type, 7); assert.match(J(r), /15 €/); assert.match(J(r), /Zahlung/);
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', values: ['week'] }, member: mem('U5') })), /Keine Berechtigung/);
});
let K1, K2;
await T('/key erstellen: nur Admin, Anzahl, Format XXXX-XXXX-XXXX, im Ticket sichtbar', async () => {
  assert.match(J(await cmd('erstellen', [{ name: 'dauer', value: 'week' }], 'U1')), /Keine Berechtigung/);
  const r = await cmd('erstellen', [{ name: 'dauer', value: 'week' }, { name: 'anzahl', value: 3 }]);
  const ks = J(r).match(KEYRE); assert.equal(ks.length, 3); assert.equal(new Set(ks).size, 3); assert.equal(r.data.flags, 64);
  K1 = ks[0]; K2 = ks[1];
  assert.equal(db.prepare("SELECT status,days FROM keys WHERE key=?").get(K1).status, 'unused');
  const t = S.channels.find(c => c.name.startsWith('kauf-useru1-'));
  const rt = await cmd('erstellen', [{ name: 'dauer', value: 'month' }], 'ADMIN', t.id); assert.match(rt.data.content, /<@U1>/); assert.equal(rt.data.flags, undefined);
});
await T('/key einlösen: bindet, setzt Ablauf ab jetzt, vergibt Customer; Fremdnutzung abgelehnt', async () => {
  const r = await cmd('einlösen', [{ name: 'key', value: K1.toLowerCase() }], 'U1'); assert.match(J(r), /Lizenz freigeschaltet/);
  const row = db.prepare('SELECT * FROM keys WHERE key=?').get(K1); assert.equal(row.discord_id, 'U1'); assert.ok(Math.abs(row.expires_at - Date.now() / 1000 - 7 * 86400) < 10);
  assert.ok(S.members.U1.roles.includes('ROLE'));
  assert.match(J(await cmd('einlösen', [{ name: 'key', value: K1 }], 'U2')), /anderen Konto/);
  assert.match(J(await cmd('einlösen', [{ name: 'key', value: 'AAAA-BBBB-CCCC' }], 'U2')), /nicht gefunden/);
});
await T('/key info zeigt Laufzeit, Ablauf, Gerät', async () => {
  const r = J(await cmd('info', undefined, 'U1')); assert.match(r, /Aktiv/); assert.match(r, /1 Woche/); assert.match(r, /Noch nicht gebunden/);
  assert.match(J(await cmd('info', undefined, 'U2')), /Keine Lizenz/);
});
await T('/api/verify: nicht eingelöst, bindet Gerät, anderes Gerät abgelehnt, Format', async () => {
  const dv = 'device-AAAAAAAA';
  assert.equal((await post('/api/verify', { key: K2, deviceId: dv })).body.reason, 'not_redeemed');
  const v = await post('/api/verify', { key: K1, deviceId: dv }); assert.equal(v.body.valid, true); assert.match(v.body.expiresAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal((await post('/api/verify', { key: K1, deviceId: 'device-BBBBBBBB' })).body.reason, 'device');
  assert.equal((await post('/api/verify', { key: K1, deviceId: dv })).body.valid, true);
  assert.equal((await post('/api/verify', { key: 'zz', deviceId: dv })).status, 400);
  assert.match(J(await cmd('info', undefined, 'U1')), /Gebunden/);
});
await T('/key reset-gerät gibt das Gerät frei', async () => {
  assert.match(J(await cmd('reset-gerät', [{ name: 'key', value: K1 }])), /Gerät freigegeben/);
  assert.equal((await post('/api/verify', { key: K1, deviceId: 'device-BBBBBBBB' })).body.valid, true);
});
await T('Brute-Force: nach 10 Fehlversuchen gesperrt (429), andere IP unberührt', async () => {
  for (let n = 0; n < 10; n++) assert.equal((await post('/api/verify', { key: 'AAAA-BBBB-CC' + (10 + n), deviceId: 'device-XXXXXXXX' }, '9.9.9.9')).body.reason, 'invalid');
  assert.equal((await post('/api/verify', { key: K1, deviceId: 'device-BBBBBBBB' }, '9.9.9.9')).status, 429);
  assert.equal((await post('/api/verify', { key: K1, deviceId: 'device-BBBBBBBB' }, '8.8.8.8')).body.valid, true);
});
await T('Rate-Limit: > 40 Anfragen/Minute je IP -> 429', async () => {
  let last; for (let n = 0; n < 45; n++) last = await post('/auth/poll', { cid: 'abcdefghijklmnop' + n }, '7.7.7.7');
  assert.equal(last.status, 429);
});
await T('OAuth + App: Discord verbinden, unbenutzten Key in der App einlösen', async () => {
  const cid = 'abcdefghijklmnop1234';
  assert.equal((await worker.fetch(new Request('https://w.dev/auth/start?cid=' + cid), env, ctx)).status, 302);
  assert.equal((await post('/auth/poll', { cid }, '1.1.1.1')).body.pending, true);
  assert.equal((await worker.fetch(new Request('https://w.dev/auth/callback?code=c&state=' + cid), env, ctx)).status, 200);
  const p = await post('/auth/poll', { cid }, '1.1.1.1'); assert.ok(p.body.ok); assert.equal(p.body.user.id, 'U1');
  assert.equal((await post('/auth/poll', { cid }, '1.1.1.1')).body.error, 'claimed');
  const a = await post('/license/activate', { session: p.body.session, key: K2, device: 'device-CCCCCCCC' }, '1.1.1.1'); assert.ok(a.body.ok, J(a));
  assert.equal(db.prepare('SELECT discord_id,status FROM keys WHERE key=?').get(K2).status, 'active');
  const rf = await post('/license/refresh', { session: p.body.session, device: 'device-CCCCCCCC' }); assert.ok(rf.body.ok, JSON.stringify(rf));
});
await T('Website-Rücksprung nur für erlaubte Adressen', async () => {
  const e2 = { ...env, ALLOWED_ORIGINS: 'https://meine-seite.de' }; const cid = 'abcdefghijklmnop5678';
  assert.equal((await worker.fetch(new Request('https://w.dev/auth/start?cid=' + cid + '&next=' + encodeURIComponent('https://evil.example/x')), e2, ctx)).status, 200); // Fehlerseite, kein Redirect
  const r = await worker.fetch(new Request('https://w.dev/auth/start?cid=' + cid + '&next=' + encodeURIComponent('https://meine-seite.de/ok')), e2, ctx); assert.equal(r.status, 302);
  const state = new URL(r.headers.get('location')).searchParams.get('state');
  const cb = await worker.fetch(new Request('https://w.dev/auth/callback?code=c&state=' + state), e2, ctx); assert.equal(cb.status, 302); assert.equal(cb.headers.get('location'), 'https://meine-seite.de/ok');
});
await T('/key sperren: Key + Rolle weg; API meldet revoked', async () => {
  S.members.U1.roles = ['ROLE'];
  assert.match(J(await cmd('sperren', [{ name: 'key', value: K1 }])), /gesperrt/);
  assert.equal((await post('/api/verify', { key: K1, deviceId: 'device-BBBBBBBB' })).body.reason, 'revoked');
});
await T('Täglicher Job: abgelaufen -> Rolle entzogen + DM, nur einmal', async () => {
  const kk = J(await cmd('erstellen', [{ name: 'dauer', value: 'week' }])).match(KEYRE)[0];
  await cmd('einlösen', [{ name: 'key', value: kk }], 'U2'); assert.ok(S.members.U2.roles.includes('ROLE'));
  db.prepare('UPDATE keys SET expires_at=1 WHERE key=?').run(kk);
  await worker.scheduled({}, env, ctx); await flush();
  assert.ok(!S.members.U2.roles.includes('ROLE')); const dm = S.dms.filter(d => d.to === 'U2'); assert.equal(dm.length, 1); assert.match(JSON.stringify(dm[0].body), /abgelaufen/);
  await worker.scheduled({}, env, ctx); await flush(); assert.equal(S.dms.filter(d => d.to === 'U2').length, 1);
});
await T('/setup: baut Struktur, überspringt Vorhandenes, 2. Lauf ändert nichts', async () => {
  assert.match(J(await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'setup' }, member: mem('U1') })), /Keine Berechtigung/);
  const r = await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'setup' }, member: mem('ADMIN') }); assert.equal(r.type, 5); await flush();
  for (let g = 0; g < 6 && /Limit erreicht/.test(JSON.stringify(S.patched.at(-1))); g++) { await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'setup' }, member: mem('ADMIN') }); await flush(); }
  const names = S.channels.map(c => c.name.replace(/^[^a-z0-9]+/i, '').toLowerCase());
  for (const n of ['start', 'community', 'tool', 'welcome', 'rules', 'announcements', 'patchnotes', 'download', 'free-tips', 'general', 'placements', 'lfg', 'questions', 'how-to-use', 'feedback', 'bug-reports', 'support', 'impressum', 'ticket-logs', 'status', 'rangliste', 'giveaways', 'arbeit', 'vorschläge', 'team-chat']) assert.ok(names.includes(n), n);
  assert.equal(names.filter(n => n === 'key-kaufen').length, 1); // vorhanden, nicht doppelt
  for (const n of ['Admin', 'Moderator', 'Supporter', 'Developer', 'Content Creator', 'Top 10', 'Customer', 'Member', 'Tester', 'User']) assert.equal(S.roles.filter(x => x.name === n).length, 1, n);
  globalThis.byBase = b => S.channels.find(c => c.name.replace(/^[^a-z0-9]+/i, '') === b);
  assert.equal(byBase('rules').name, '📜│rules'); assert.equal(S.channels.find(c => c.name === '🚀 START').type, 4);
  const ann = byBase('announcements'); assert.ok(ann.permission_overwrites.some(o => o.id === 'G' && (BigInt(o.deny) & 2048n))); // nur Admin schreibt
  const userId = S.roles.find(r => r.name === 'User').id; const gen = byBase('general');
  assert.ok(gen.permission_overwrites.some(o => o.id === 'G' && o.deny === '1024')); assert.ok(gen.permission_overwrites.some(o => o.id === userId && (BigInt(o.allow) & 1024n))); // nur mit User-Rolle sichtbar
  assert.ok(!byBase('ticket-logs').permission_overwrites.some(o => o.id === userId)); // intern
  const dl = S.msgs[byBase('download').id][0]; assert.equal(dl.components[0].components[0].style, 5); assert.match(dl.components[0].components[0].url, /^https:/);
  assert.ok(S.msgs[byBase('welcome').id][0].embeds[0].color === 0x1e6bff);
  assert.ok(S.msgs[byBase('rules').id][0].components[0].components[0].custom_id === 'rules_accept');
  assert.ok(S.msgs['KEYCH'][0].components[0].components[0].label === 'Key kaufen');
  const before = S.channels.length, msgsBefore = Object.values(S.msgs).flat().length;
  await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'setup' }, member: mem('ADMIN') }); await flush();
  assert.equal(S.channels.length, before); const pc = S.chPatched || 0; assert.equal(Object.values(S.msgs).flat().length, msgsBefore);
  assert.equal(S.chPatched || 0, pc); assert.match(JSON.stringify(S.patched.at(-1)), /vorhanden/);
});
await T('/setup erneuern: bearbeitet bestehende Nachrichten statt neu zu posten, löscht Doppelte', async () => {
  const rules = byBase('rules').id, count = () => Object.values(S.msgs).flat().length;
  S.msgs[rules].push({ ...S.msgs[rules][0], id: '999001' }); // Altlast: Duplikat
  const before = count(), ed = S.edited || 0;
  await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'setup', options: [{ name: 'erneuern', value: true }] }, member: mem('ADMIN') }); await flush();
  for (let g = 0; g < 6 && /Limit erreicht/.test(JSON.stringify(S.patched.at(-1))); g++) { await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'setup', options: [{ name: 'erneuern', value: true }] }, member: mem('ADMIN') }); await flush(); }
  assert.equal(count(), before - 1); // nur das Duplikat ist weg, nichts neu gepostet
  assert.ok((S.edited || 0) > ed); assert.equal(S.msgs[rules].length, 1);
  assert.match(JSON.stringify(S.patched.at(-1)), /aktualisiert/);
});
await T('/setup: Rollen-Beitritt per Regel-Button + Limit-Fortsetzung', async () => {
  assert.match(J(await inter({ type: 3, data: { custom_id: 'rules_accept' }, member: mem('U1') })), /Member/);
  const memberId = S.roles.find(r => r.name === 'Member').id; assert.ok(S.members.U1.roles.includes(memberId));
  // Limit: mit 12 Aufrufen nur teilweise, mit Wiederholung vollständig
  const S2 = makeDiscord(); const { D1: D2 } = makeDb(['schema.sql']); const { env: e2 } = makeEnv(D2);
  const r1 = await runSetup({ ...e2, _budget: { n: 0, max: 12 } }, false); assert.equal(r1.partial, true);
  let r = r1, guard = 0; while (r.partial && guard++ < 10) r = await runSetup({ ...e2, _budget: { n: 0, max: 12 } }, false);
  assert.equal(r.partial, false); assert.equal(S2.channels.filter(c => c.name === '👋│welcome').length, 1);
  S2.restore();
});
await T('Ticket schließen: Transkript im Log-Kanal, Kanal gelöscht, Fremde nicht', async () => {
  const ch = S.channels.find(c => c.name.startsWith('kauf-useru1-')); const logId = S.channels.find(c => c.name.endsWith('ticket-logs')).id;
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_close' }, member: mem('U9') })), /Keine Berechtigung/);
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_close' }, member: mem('U1') })), /geschlossen/);
  await flush();
  const f = S.files.find(x => x.ch === logId); assert.ok(f, 'Transkript fehlt'); assert.match(f.text, /Transkript/); assert.match(f.text, /Lizenzbestellung/); assert.match(f.name, /\.txt$/);
  assert.ok(S.deleted.includes(ch.id));
});
await T('/zugang: User-Rolle vergeben und entziehen', async () => {
  assert.match(J(await inter({ type: 2, data: { name: 'zugang', options: [{ name: 'user', value: 'U1' }] }, member: mem('U1') })), /Keine Berechtigung/);
  const userId = S.roles.find(r => r.name === 'User').id; env.USER_ROLE_ID = userId;
  assert.match(J(await inter({ type: 2, data: { name: 'zugang', options: [{ name: 'user', value: 'U1' }] }, member: mem('ADMIN') })), /Zugang erteilt/);
  assert.ok(S.members.U1.roles.includes(userId));
  assert.match(J(await inter({ type: 2, data: { name: 'zugang', options: [{ name: 'user', value: 'U1' }, { name: 'entfernen', value: true }] }, member: mem('ADMIN') })), /Zugang entzogen/);
  assert.ok(!S.members.U1.roles.includes(userId));
});
// ---------- Bot v2 ----------
const sha = s => createHash('sha256').update(s).digest('hex');
let V2;
await T('Verlängern: Erinnerung 3 Tage vorher (einmal) -> Button -> Renew-Ticket -> Team bestätigt', async () => {
  const k = J(await cmd('erstellen', [{ name: 'dauer', value: 'week' }])).match(KEYRE)[0];
  await cmd('einlösen', [{ name: 'key', value: k }], 'U7');
  const t0 = Math.floor(Date.now() / 1000), exp0 = t0 + 2 * 86400;
  db.prepare('UPDATE keys SET expires_at=? WHERE key=?').run(exp0, k);
  await worker.scheduled({ cron: '0 * * * *' }, env, ctx); await flush();
  const dms = S.dms.filter(d => d.to === 'U7' && /läuft bald ab/.test(JSON.stringify(d.body)));
  assert.equal(dms.length, 1); assert.equal(dms[0].body.components[0].components[0].custom_id, 'renew_open');
  await worker.scheduled({ cron: '0 * * * *' }, env, ctx); await flush();
  assert.equal(S.dms.filter(d => d.to === 'U7' && /läuft bald ab/.test(JSON.stringify(d.body))).length, 1); // nur einmal
  const r = await inter({ type: 3, data: { custom_id: 'renew_open' }, user: { id: 'U7', username: 'user7' } }); // aus der DM, ohne member
  assert.match(J(r), /<#C\d+>/);
  const ch = S.channels.find(c => /^verlaengern-user7-\d+$/.test(c.name)); assert.ok(ch, 'Renew-Kanal fehlt');
  assert.equal(db.prepare('SELECT plan FROM tickets WHERE channel_id=?').get(ch.id).plan, 'week'); // Laufzeit vorbelegt
  const first = JSON.stringify(S.msgs[ch.id][0]); assert.match(first, /paypal|PayPal/i); assert.match(first, /Screenshot/);
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('U7') })), /Keine Berechtigung/);
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('ADMIN') })), /Zahlung bestätigt/);
  assert.equal(db.prepare('SELECT expires_at FROM keys WHERE key=?').get(k).expires_at, exp0 + 7 * 86400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sales WHERE user_id='U7' AND kind='renew'").get().n, 1);
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('ADMIN') })), /Schon bestätigt/);
  assert.equal(db.prepare('SELECT reminded FROM keys WHERE key=?').get(k).reminded, 0); // neue Erinnerung moeglich
});
await T('Kauf-Ticket bestätigen: neuer Key im Ticket', async () => {
  await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('U8') });
  const ch = S.channels.find(c => c.name.startsWith('kauf-useru8-'));
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('ADMIN') })), /Laufzeit fehlt/);
  await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', values: ['month'] }, member: mem('U8') });
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('ADMIN') })), KEYRE);
  assert.equal(db.prepare("SELECT SUM(amount) AS s FROM sales WHERE user_id='U8'").get().s, 15);
});
await T('Formulare: Feedback + Bug (Modal -> Embed), Team setzt Status', async () => {
  assert.equal((await inter({ type: 3, data: { custom_id: 'form_bug' }, member: mem('U1') })).type, 9);
  const modal = (id, t, x) => ({ type: 5, data: { custom_id: id, components: [{ type: 1, components: [{ type: 4, custom_id: 'f_title', value: t }] }, { type: 1, components: [{ type: 4, custom_id: 'f_text', value: x }] }] }, member: mem('U1') });
  assert.match(J(await inter(modal('modal_feedback', 'Idee', 'Mehr Statistiken bitte'))), /Danke/);
  assert.match(JSON.stringify(S.msgs[env.FEEDBACK_CHANNEL_ID || (await (async () => { const e = await (await import('../src/discord.js')).withCfg(env); return e.FEEDBACK_CHANNEL_ID; })())]), /Mehr Statistiken/);
  const e2 = await (await import('../src/discord.js')).withCfg(env);
  assert.match(J(await inter(modal('modal_bug', 'Crash', 'App stürzt ab'))), /Fehler gemeldet/);
  const bm = S.msgs[e2.BUG_CHANNEL_ID].at(-1); assert.equal(bm.components[0].components[0].custom_id, 'rep_prog');
  const asMsg = member => ({ type: 3, data: { custom_id: 'rep_prog' }, member, message: { embeds: bm.embeds, components: bm.components } });
  assert.match(J(await inter(asMsg(mem('U1')))), /Keine Berechtigung/);
  const up = await inter(asMsg(mem('ADMIN'))); assert.equal(up.type, 7); assert.match(J(up), /In Arbeit/);
});
await T('Rangliste: Opt-in per Sitzung, Top 10, Rolle, /rank ich + austragen', async () => {
  const e2 = await (await import('../src/discord.js')).withCfg(env);
  const mk = (n, uname) => db.prepare('INSERT INTO sessions (token_hash,discord_id,username,created_at) VALUES (?,?,?,?)').run(sha('tok-' + n), n, uname, 1);
  mk('U1', 'Alpha'); mk('U7', 'Bravo'); mk('U8', 'Charlie');
  assert.equal((await post('/rank/submit', { session: 'falsch', stats: {} })).status, 401);
  assert.equal((await post('/rank/submit', { session: 'tok-U1', stats: { games: 'x' } })).status, 400);
  assert.equal((await post('/rank/submit', { session: 'tok-U1', stats: { games: 10, avgScore: 80, wins: 2, kills: 40, avgPlace: 12, bestPlace: 1 } })).status, 200);
  assert.equal((await post('/rank/submit', { session: 'tok-U7', stats: { games: 5, avgScore: 90, wins: 1, kills: 10 } })).status, 200);
  assert.equal((await post('/rank/submit', { session: 'tok-U8', stats: { games: 2, avgScore: 99, wins: 9, kills: 99 } })).status, 200); // < 3 Runden
  const board = await inter({ type: 2, data: { name: 'rank', options: [{ type: 1, name: 'top' }] }, member: mem('U1') });
  const txt = J(board); assert.ok(txt.indexOf('Bravo') < txt.indexOf('Alpha')); assert.ok(!/Charlie/.test(txt));
  assert.match(J(await inter({ type: 2, data: { name: 'rank', options: [{ type: 1, name: 'ich' }] }, member: mem('U1') })), /Rang: #2/);
  assert.match(J(await inter({ type: 2, data: { name: 'rank', options: [{ type: 1, name: 'ich' }] }, member: mem('U8') })), /Noch nicht platziert/);
  const before = S.edited || 0; await worker.scheduled({ cron: '30 * * * *' }, env, ctx); await flush();
  assert.ok((S.edited || 0) > before, 'Ranglisten-Embed nicht aktualisiert');
  assert.match(JSON.stringify(S.msgs[e2.RANK_CHANNEL_ID][0].embeds), /Bravo/);
  assert.ok(S.members.U7.roles.includes(e2.RANK_ROLE_ID) && S.members.U1.roles.includes(e2.RANK_ROLE_ID));
  assert.match(J(await inter({ type: 2, data: { name: 'rank', options: [{ type: 1, name: 'austragen' }] }, member: mem('U7') })), /entfernt/);
  assert.equal((await post('/rank/leave', { session: 'tok-U1' })).status, 200);
  await worker.scheduled({ cron: '30 * * * *' }, env, ctx); await flush();
  assert.ok(!S.members.U7.roles.includes(e2.RANK_ROLE_ID));
});
await T('/admin stats + /team: nur Admin', async () => {
  const st = { type: 2, data: { name: 'admin', options: [{ type: 1, name: 'stats' }] } };
  assert.match(J(await inter({ ...st, member: mem('U1') })), /Keine Berechtigung/);
  const r = J(await inter({ ...st, member: mem('ADMIN') })); assert.match(r, /Umsatz/); assert.match(r, /Lizenzen/);
  const e2 = await (await import('../src/discord.js')).withCfg(env);
  const tm = (who, rem) => inter({ type: 2, data: { name: 'team', options: [{ name: 'user', value: 'U2' }, { name: 'rolle', value: 'moderator' }, ...(rem ? [{ name: 'entfernen', value: true }] : [])] }, member: mem(who) });
  assert.match(J(await tm('U1')), /Keine Berechtigung/);
  assert.match(J(await tm('ADMIN')), /Moderator/); assert.ok(S.members.U2.roles.includes(e2.MOD_ROLE_ID));
  assert.match(J(await tm('ADMIN', true)), /entzogen/); assert.ok(!S.members.U2.roles.includes(e2.MOD_ROLE_ID));
});
await T('Status-Panel + Willkommen: Version aus GitHub, Embed wird bearbeitet', async () => {
  const e2 = await (await import('../src/discord.js')).withCfg(env);
  const before = S.edited || 0; await worker.scheduled({ cron: '15,45 * * * *' }, env, ctx); await flush();
  assert.ok((S.edited || 0) > before); assert.match(JSON.stringify(S.msgs[e2.STATUS_CHANNEL_ID][0].embeds), /v9\.9\.9/);
  assert.match(JSON.stringify(S.msgs[e2.DOWNLOAD_CHANNEL_ID][0].components), /Setup\.exe/);
  const n = (S.msgs[e2.GENERAL_CHANNEL_ID] || []).length;
  await inter({ type: 3, data: { custom_id: 'rules_accept' }, member: mem('U2') }); await flush();
  assert.equal((S.msgs[e2.GENERAL_CHANNEL_ID] || []).length, n + 1);
});
await T('Gateway: Identify mit Präsenz, Heartbeat, Neuverbindung, Abschalten', async () => {
  const { Gateway, pingGateway } = await import('../src/gateway.js');
  const sent = []; let sockets = 0;
  class FakeWS { constructor() { this.readyState = 1; this.l = {}; sockets++; } accept() {} addEventListener(t, f) { this.l[t] = f; } send(x) { const o = JSON.parse(x); sent.push(o); if (o.op === 1) setTimeout(() => this.emit({ op: 11 }), 1); } close() { this.readyState = 3; } emit(o) { this.l.message({ data: JSON.stringify(o) }); } }
  const real = globalThis.fetch; let ws;
  globalThis.fetch = async u => { if (String(u).startsWith('https://gateway.discord.gg')) { ws = new FakeWS(); return { webSocket: ws }; } return real(u); };
  try {
    const state = { storage: { setAlarm: async () => {} } };
    const g = new Gateway(state, { BOT_TOKEN: 'T', GATEWAY: 'on' });
    await g.ensure(); assert.equal(sockets, 1);
    ws.emit({ op: 10, d: { heartbeat_interval: 20 } });
    const idf = sent.find(x => x.op === 2); assert.ok(idf); assert.equal(idf.d.presence.status, 'online'); assert.equal(idf.d.token, 'T');
    ws.emit({ op: 0, t: 'READY', s: 1, d: { session_id: 'S' } }); assert.equal(g.status, 'online');
    await new Promise(r => setTimeout(r, 60)); assert.ok(sent.some(x => x.op === 1)); // Heartbeat
    ws.emit({ op: 11 });
    await g.ensure(); assert.equal(sockets, 1); // laeuft, keine zweite Verbindung
    ws.emit({ op: 7 }); await g.ensure(); assert.equal(sockets, 2); // Reconnect -> Resume
    ws.emit({ op: 10, d: { heartbeat_interval: 1000 } }); assert.ok(sent.some(x => x.op === 6 && x.d.session_id === 'S'));
    g.env.GATEWAY = 'off'; await g.ensure(); assert.equal(g.status, 'off'); assert.equal(ws.readyState, 3);
    assert.equal(await pingGateway({ GATEWAY: 'off' }), null);
  } finally { globalThis.fetch = real; }
});
await T('Giveaway: Start, Teilnahme, automatische Ziehung, Gewinner-Ticket mit Nummer, Reroll', async () => {
  const gwc = (sub, options, who = 'ADMIN') => inter({ type: 2, channel_id: 'GWCH', token: 'tok', data: { name: 'giveaway', options: [{ type: 1, name: sub, options }] }, member: mem(who) });
  assert.match(J(await gwc('start', [{ name: 'preis', value: 'Key' }, { name: 'dauer', value: '1h' }], 'U1')), /Keine Berechtigung/);
  assert.match(J(await gwc('start', [{ name: 'preis', value: 'Key' }, { name: 'dauer', value: 'xyz' }])), /Dauer ungültig/);
  const r = await gwc('start', [{ name: 'preis', value: '1 Monat Lizenz' }, { name: 'dauer', value: '1h' }, { name: 'gewinner', value: 2 }, { name: 'kanal', value: 'GWCH' }]);
  assert.match(J(r), /Giveaway gestartet/); const gw = db.prepare('SELECT * FROM giveaways ORDER BY id DESC').get(); assert.equal(gw.winners, 2);
  const post_ = S.msgs.GWCH[0]; assert.equal(post_.components[0].components[0].custom_id, 'gw_join');
  const join = who => inter({ type: 3, token: 'tk', message: { id: gw.message_id }, data: { custom_id: 'gw_join' }, member: mem(who) });
  for (const u of ['U1', 'U2', 'U3']) assert.equal((await join(u)).type, 7);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gw_entries WHERE gw_id=?').get(gw.id).n, 3);
  await join('U3'); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gw_entries WHERE gw_id=?').get(gw.id).n, 2); // erneut klicken = austragen
  await join('U3');
  db.prepare('UPDATE giveaways SET ends_at=1 WHERE id=?').run(gw.id);
  await worker.scheduled({ cron: '* * * * *' }, env, ctx); await flush();
  const done = db.prepare('SELECT * FROM giveaways WHERE id=?').get(gw.id); assert.equal(done.status, 'ended');
  const won = JSON.parse(done.winner_ids); assert.equal(won.length, 2); assert.equal(new Set(won).size, 2);
  const tk = S.channels.filter(c => /^giveaway-user[a-z0-9]+-0[12]$/.test(c.name)); assert.equal(tk.length, 2, 'Gewinner-Tickets: ' + S.channels.map(c => c.name).join(','));
  assert.deepEqual(tk.map(c => c.name.slice(-2)).sort(), ['01', '02']);
  assert.ok(won.every(u => db.prepare("SELECT 1 FROM tickets WHERE user_id=? AND type='giveaway'").get(u)));
  assert.ok(S.dms.some(d => won.includes(d.to) && /gewonnen/.test(JSON.stringify(d.body))));
  assert.match(JSON.stringify(S.msgs.GWCH.at(-1)), /Glückwunsch/);
  assert.equal(S.msgs.GWCH[0].components[0].components[0].disabled, true);
  assert.match(J(await join('U2')), /beendet/);
  await worker.scheduled({ cron: '* * * * *' }, env, ctx); await flush(); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE type='giveaway'").get().n, 2); // nur einmal
  const rr = J(await gwc('reroll', [{ name: 'id', value: gw.id }])); assert.match(rr, /Neu ausgelost/);
  const won2 = JSON.parse(db.prepare('SELECT winner_ids FROM giveaways WHERE id=?').get(gw.id).winner_ids); assert.equal(won2.length, 3); assert.equal(new Set(won2).size, 3);
  assert.ok(S.channels.some(c => /^giveaway-.*-03$/.test(c.name)));
  await inter({ type: 3, data: { custom_id: 'ticket_support' }, member: mem('U1') });
  assert.ok(S.channels.some(c => /^support-useru1-0\d$/.test(c.name)), 'Support-Name');
});
await T('/download: leitet direkt auf die neueste Setup-Datei', async () => {
  const r = await worker.fetch(new Request('https://w.dev/download', { headers: { 'cf-connecting-ip': 'dlip' } }), env, ctx);
  assert.equal(r.status, 302); assert.match(r.headers.get('location'), /Setup\.exe$/);
});
await T('Patchnotes: Embed im Kanal, nur einmal pro Version', async () => {
  const S = makeDiscord(); try {
  S.channels.push({ id: 'ANN', name: '📢│announcements', type: 0, parent_id: 'CATX', permission_overwrites: [{ id: 'G', type: 0, deny: '2048' }] }); // /setup lief nie: Kanal wird selbst angelegt
  const src = "window.PATCHNOTES = [\n  { v: '0.9.9', date: '2026-10-15', tag: 'NEU', text: 'Erster Punkt. Zweiter Punkt mit \\'Zitat\\'.' },\n  { v: '0.9.8', date: '2026-10-15', tag: 'FIX', text: 'Alt.' }\n];";
  assert.equal(parsePatchnotes(src).length, 2);
  const r1 = await postPatchnotes(env, src); const pc = S.channels.find(c => c.name.endsWith('patchnotes')); assert.equal(pc.parent_id, 'CATX'); assert.deepEqual(r1.sent, ['0.9.8', '0.9.9']);
  const e = S.msgs[pc.id].at(-1).embeds[0]; assert.match(e.title, /Version 0\.9\.9/); assert.match(e.description, /Erster Punkt\.\n\n.*Zweiter Punkt/); assert.equal(e.fields.length, 3); assert.match(e.footer.text, /v0\.9\.9/);
  const n = S.msgs[pc.id].length; const r2 = await postPatchnotes(env, src); assert.deepEqual(r2.sent, []); assert.equal(S.msgs[pc.id].length, n);
  const r3 = await postPatchnotes(env, src.replace("[\n", "[\n  { v: '1.0.0', date: '2026-10-16', tag: 'NEU', text: 'Neu.' },\n")); assert.deepEqual(r3.sent, ['1.0.0']);
} finally { S.restore(); }
});
console.log(`\n${ok} Tests bestanden`); S.restore();

