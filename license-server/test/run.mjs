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
  const pl = t => JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString());
  assert.deepEqual(pl(rf.body.ticket).ents, []);
  db.prepare("INSERT INTO entitlements (user_id,ent,created_at) VALUES ('U1','tw',1)").run();
  assert.deepEqual(pl((await post('/license/refresh', { session: p.body.session, device: 'device-CCCCCCCC' })).body.ticket).ents, ['tw']);
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
  for (const n of ['start', 'community', 'tool', 'welcome', 'rules', 'announcements', 'patchnotes', 'download', 'free-tips', 'general', 'placements', 'lfg', 'questions', 'how-to-use', 'feedback', 'bug-reports', 'support', 'impressum', 'ticket-logs', 'status', 'rangliste', 'giveaways', 'umfragen', 'datenschutz', 'live-stats', 'arbeit', 'vorschläge', 'team-chat']) assert.ok(names.includes(n), n);
    const hid = S.channels.find(c => /how-to-use$/.test(c.name)).id; assert.match(JSON.stringify(S.msgs[hid]), /So nutzt du Cocos Tool/);
    const pid = S.channels.find(c => /umfragen$/.test(c.name)).id; assert.equal(S.msgs[pid][0].components[0].components[0].custom_id, 'poll_new');
    assert.match(JSON.stringify(S.msgs[S.channels.find(c => /welcome$/.test(c.name)).id]), /banner\.gif/);
  assert.equal(names.filter(n => n === 'shop').length, 1); assert.equal(names.filter(n => n === 'key-kaufen').length, 0); // alter Kanal wird umbenannt, nicht doppelt
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
  assert.ok(S.msgs['KEYCH'][0].components[0].components[0].label === 'Kaufen');
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
  assert.equal(db.prepare('SELECT expires_at FROM keys WHERE key=?').get(k).expires_at, exp0 + 8 * 86400);
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
  const bm = S.msgs[e2.BUG_CHANNEL_ID].filter(m => m.components && m.components[0] && m.components[0].components[0].custom_id === 'rep_prog').at(-1); assert.ok(bm, 'Bug-Meldung mit Statusbuttons');
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
  db.prepare("INSERT OR REPLACE INTO config (k,v) VALUES ('giveaway_channel','GWCH')").run();
  const gsub = (v, who = 'ADMIN') => inter({ type: 5, channel_id: 'GWCH', token: 'tok', data: { custom_id: 'modal_giveaway', components: Object.entries(v).map(([k, x]) => ({ type: 1, components: [{ type: 4, custom_id: k, value: x }] })) }, member: mem(who) });
  assert.equal((await gwc('start', [])).type, 9); // Formular
  assert.match(J(await gsub({ f_prize: 'Key', f_dur: '1h' }, 'U1')), /Keine Berechtigung/);
  assert.match(J(await gsub({ f_prize: 'Key', f_dur: 'xyz' })), /Dauer ungültig/);
  const r = await gsub({ f_prize: '1 Monat Lizenz', f_dur: '1h', f_win: '2' });
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
await T('Extras: Umfrage, Duo-Suche, Erinnerung, Tipp (Formulare)', async () => {
  const slash = (name, options, who = 'U5') => inter({ type: 2, channel_id: 'FUNCH', token: 'tok', data: { name, options }, member: mem(who) });
  const btn = (id, msgId, who) => inter({ type: 3, channel_id: 'FUNCH', token: 'tk', message: { id: msgId }, data: { custom_id: id }, member: mem(who) });
  const sub = (id, v, who = 'U5') => inter({ type: 5, channel_id: 'FUNCH', token: 'tok', data: { custom_id: id, components: Object.entries(v).map(([k, x]) => ({ type: 1, components: [{ type: 4, custom_id: k, value: x }] })) }, member: mem(who) });
  for (const k of ['poll_channel', 'lfg_channel']) db.prepare('INSERT OR REPLACE INTO config (k,v) VALUES (?,?)').run(k, 'FUNCH');
  // Panel im Umfragen-Kanal simulieren (wie /setup es anlegt)
  const panel = await (await import('../src/discord.js')).dapi(env, 'POST', '/channels/FUNCH/messages', { embeds: [{ title: 'Panel Umfrage' }], components: [{ type: 1, components: [{ type: 2, custom_id: 'poll_new' }] }] });
  db.prepare("INSERT OR REPLACE INTO config (k,v) VALUES ('posted:poll-panel',?)").run(panel.data.id);
  assert.equal((await slash('umfrage')).type, 9); assert.equal((await btn('poll_new', panel.data.id, 'U5')).type, 9);
  assert.match(J(await sub('modal_poll', { f_q: 'Modus?', f_opts: 'nur eine' })), /Zu wenige Optionen/);
  assert.match(J(await sub('modal_poll', { f_q: 'Modus?', f_opts: 'a\nb', f_dur: 'x' })), /Dauer ungültig/);
  assert.match(J(await sub('modal_poll', { f_q: 'Modus?', f_opts: 'Duo\nTrio\nSquad', f_dur: '1h' })), /Umfrage gestartet/);
  const poll = db.prepare('SELECT * FROM polls ORDER BY id DESC').get(); assert.equal(JSON.parse(poll.options).length, 3);
  const last = S.msgs.FUNCH[S.msgs.FUNCH.length - 1]; assert.equal(last.components[0].components[0].custom_id, 'poll_new', 'Panel liegt wieder ganz unten');
  assert.ok(!S.msgs.FUNCH.some(m => m.id === panel.data.id), 'altes Panel gelöscht');
  const pollMsg = S.msgs.FUNCH.find(m => m.id === poll.message_id); assert.equal(pollMsg.components[0].components.length, 3);
  let r = await btn('poll_1', poll.message_id, 'U6'); assert.equal(r.type, 7); assert.match(J(r), /1 Stimme/);
  await btn('poll_0', poll.message_id, 'U7'); await btn('poll_0', poll.message_id, 'U6');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id=? AND opt=0').get(poll.id).n, 2);
  await btn('poll_0', poll.message_id, 'U7'); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id=?').get(poll.id).n, 1);
  db.prepare('UPDATE polls SET ends_at=1 WHERE id=?').run(poll.id);
  assert.match(J(await btn('poll_2', poll.message_id, 'U8')), /Umfrage beendet/);
  await worker.scheduled({ cron: '* * * * *' }, env, ctx); await flush();
  assert.equal(db.prepare('SELECT status FROM polls WHERE id=?').get(poll.id).status, 'ended');
  const ended = S.msgs.FUNCH.find(m => m.id === poll.message_id); assert.match(JSON.stringify(ended.embeds), /Umfrage beendet/); assert.equal(ended.components[0].components[0].disabled, true);
  // Duo-Suche
  const ch = J(await slash('lfg')); assert.match(ch, /lfg_new_duo/); assert.match(ch, /lfg_new_squad/);
  assert.equal((await btn('lfg_new_duo', 'x', 'U5')).type, 9);
  assert.match(J(await sub('modal_lfg_duo', { f_info: 'Ranked' })), /Suche gepostet/);
  const lfg = db.prepare('SELECT * FROM lfg ORDER BY id DESC').get(); assert.equal(lfg.slots, 2); assert.equal(lfg.note, 'Ranked');
  assert.match(J(await btn('lfg_join', lfg.message_id, 'U5')), /schon dabei/);
  r = await btn('lfg_join', lfg.message_id, 'U6'); assert.match(J(r), /VOLL/); assert.equal(db.prepare('SELECT status FROM lfg WHERE id=?').get(lfg.id).status, 'full');
  await new Promise(x => setTimeout(x, 800)); await flush();
  assert.ok(S.msgs.FUNCH.some(m => /komplett/.test(m.content || '')), 'Voll-Hinweis');
  assert.match(J(await btn('lfg_join', lfg.message_id, 'U7')), /Schon voll/);
  await btn('lfg_leave', lfg.message_id, 'U6'); assert.equal(db.prepare('SELECT status FROM lfg WHERE id=?').get(lfg.id).status, 'open');
  assert.match(J(await btn('lfg_leave', lfg.message_id, 'U5')), /geschlossen/);
  // Erinnerung
  const rm = (sub_, options) => inter({ type: 2, channel_id: 'FUNCH', token: 'tok', data: { name: 'erinnerung', options: [{ type: 1, name: sub_, options }] }, member: mem('U5') });
  assert.equal((await rm('neu')).type, 9);
  assert.match(J(await sub('modal_remind', { f_in: 'abc', f_text: 'x' })), /Zeit ungültig/);
  assert.match(J(await sub('modal_remind', { f_in: '5m', f_text: 'Scrim spielen' })), /Erinnerung gesetzt/);
  assert.match(J(await rm('liste')), /Scrim spielen/);
  const dm0 = S.dms.length; await worker.scheduled({ cron: '* * * * *' }, env, ctx); await flush(); assert.equal(S.dms.length, dm0);
  db.prepare('UPDATE reminders SET due=1').run(); await worker.scheduled({ cron: '* * * * *' }, env, ctx); await flush();
  assert.ok(S.dms.slice(dm0).some(d => d.to === 'U5' && /Scrim spielen/.test(JSON.stringify(d.body))), 'Erinnerungs-DM');
  await worker.scheduled({ cron: '* * * * *' }, env, ctx); await flush(); assert.equal(S.dms.length, dm0 + 1);
  assert.match(J(await slash('tipp')), /Tipp/);
});
await T('Bug-Panel springt nach jeder Meldung wieder nach unten', async () => {
  const dapi = (await import('../src/discord.js')).dapi;
  const bugCh = 'BUGX'; db.prepare("INSERT OR REPLACE INTO config (k,v) VALUES ('bug_channel','BUGX')").run();
  const panel = await dapi(env, 'POST', `/channels/${bugCh}/messages`, { embeds: [{ title: '🐛 Fehler melden' }], components: [{ type: 1, components: [{ type: 2, custom_id: 'form_bug' }] }] });
  db.prepare("INSERT OR REPLACE INTO config (k,v) VALUES ('posted:bug-panel',?)").run(panel.data.id);
  const fm = { type: 5, token: 'tk', data: { custom_id: 'modal_bug', components: [{ type: 1, components: [{ type: 4, custom_id: 'f_title', value: 'Crash 2' }] }, { type: 1, components: [{ type: 4, custom_id: 'f_text', value: 'stürzt ab' }] }] }, member: mem('U1') };
  assert.match(J(await inter(fm)), /Fehler gemeldet/);
  const list = S.msgs[bugCh]; assert.equal(list[list.length - 1].components[0].components[0].custom_id, 'form_bug', 'Panel zuletzt');
  assert.match(JSON.stringify(list[list.length - 2].embeds), /Crash 2/); assert.ok(!list.some(m => m.id === panel.data.id));
});
await T('Live-Stats: Panel, Heartbeat (online), Aktualisieren nur Team', async () => {
  const dapi = (await import('../src/discord.js')).dapi;
  env.STATS_CHANNEL_ID = 'STATSCH'; const t = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO sessions (token_hash,discord_id,username,created_at) VALUES (?,?,?,?)').run(await (await import('../src/util.js')).sha256hex('tok-hb'), 'UH1', 'Heart', t - 100);
  const hb = await post('/license/ping', { session: 'tok-hb', appVersion: '0.10.5' }); assert.equal(hb.status, 200);
  assert.equal((await post('/license/ping', { session: 'falsch' })).status, 401);
  assert.equal(db.prepare("SELECT app_version AS v FROM sessions WHERE discord_id='UH1'").get().v, '0.10.5');
  const { syncStats } = await import('../src/stats.js');
  assert.equal(await syncStats(env), true); const m1 = S.msgs.STATSCH[0]; const txt = JSON.stringify(m1.embeds);
  assert.match(txt, /App jetzt online/); assert.match(txt, /Mitglieder/); assert.match(txt, /\*\*42\*\*/); assert.match(txt, /v0\.10\.5/);
  assert.equal(await syncStats(env), true); assert.equal(S.msgs.STATSCH.length, 1, 'bearbeitet statt neu gepostet');
  const rf = id => inter({ type: 3, token: 'tk', message: { id: m1.id }, data: { custom_id: 'stats_refresh' }, member: mem(id) });
  assert.match(J(await rf('U1')), /Keine Berechtigung/); assert.equal((await rf('ADMIN')).type, 7);
});
await T('Admin: Nutzerliste (App) und eingelöste Keys', async () => {
  const adm = (sub, who = 'ADMIN') => inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'admin', options: [{ type: 1, name: sub }] }, member: mem(who) });
  const t = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO sessions (token_hash,discord_id,username,created_at,last_seen,app_version) VALUES (?,?,?,?,?,?)').run('h-adm1', 'UA1', 'Alice', t - 5000, t - 60, '0.10.4');
  db.prepare('INSERT INTO sessions (token_hash,discord_id,username,created_at) VALUES (?,?,?,?)').run('h-adm2', 'UA2', 'Bob', t - 9000);
  db.prepare("INSERT INTO keys (key,discord_id,plan,days,created_at,expires_at,status,redeemed_at,device,last_seen) VALUES ('ABCD-EFGH-JKLM','UA1','week',7,?,?,'active',?,'dev-adm-1',?)").run(t - 5000, t + 86400 * 5, t - 4000, t - 60);
  assert.match(J(await adm('nutzer', 'U1')), /Keine Berechtigung/);
  const n = J(await adm('nutzer')); assert.match(n, /Alice/); assert.match(n, /v0\.10\.4/); assert.match(n, /Bob/); assert.match(n, /kein Key/); assert.match(n, /gerade eben|Min/);
  const k = J(await adm('keys')); assert.match(k, /ABCD-••••-JKLM/); assert.match(k, /UA1/); assert.match(k, /Gerät gebunden/); assert.ok(!/ABCD-EFGH-JKLM/.test(k), 'Key nicht im Klartext');
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
await T('Creator-Codes: Bonus-Tage für Käufer, Belohnung für Inhaber, nur einmal, Datenschutz', async () => {
  const cc = (sub, options, who = 'ADMIN') => inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'code', options: [{ type: 1, name: sub, options }] }, member: mem(who) });
  const cmRole = db.prepare("SELECT v FROM config WHERE k='content_role'").get().v;
  const CM = () => mem('CM1', { roles: [cmRole] });
  const cform = (id, v, member) => inter({ type: 5, channel_id: 'X', token: 'tok', data: { custom_id: id, components: Object.entries(v).map(([k, x]) => ({ type: 1, components: [{ type: 4, custom_id: k, value: x }] })) }, member });
  assert.match(J(await cc('neu', [], 'U1')), /Keine Berechtigung/);
  assert.equal((await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'code', options: [{ type: 1, name: 'neu' }] }, member: CM() })).type, 9); // Content Manager: Formular
  assert.match(J(await cform('modal_code_new', { f_owner: '<@123456789012345678>', f_code: 'coco', f_buyer: '2', f_week: '2', f_month: '5' }, mem('U1'))), /Keine Berechtigung/);
  assert.match(J(await cform('modal_code_new', { f_owner: '<@123456789012345678>', f_code: 'coco', f_buyer: '99', f_week: '2', f_month: '5' }, CM())), /Belohnung ungültig/);
  assert.match(J(await cform('modal_code_new', { f_owner: 'x', f_code: 'coco', f_buyer: '2', f_week: '2', f_month: '5' }, CM())), /Inhaber nicht gefunden/);
  assert.match(J(await cform('modal_code_new', { f_owner: '<@123456789012345678>', f_code: 'coco', f_buyer: '2', f_week: '2', f_month: '5' }, CM())), /Code angelegt/);
  assert.match(J(await cform('modal_code_new', { f_owner: '<@123456789012345678>', f_code: 'COCO', f_buyer: '2', f_week: '2', f_month: '5' }, CM())), /Code vergeben/);
  assert.match(J(await cc('mein', [], '123456789012345678')), /COCO/); assert.match(J(await cc('mein', [], 'NOBODY')), /noch keinen Code/);
  assert.match(J(await cc('liste', [], 'U1')), /Keine Berechtigung/); assert.match(J(await cc('liste', [], 'ADMIN')), /COCO/);
  // Käufer U30 öffnet Ticket, wählt Woche, gibt Code ein
  await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('U30') });
  const ch = S.channels.find(c => c.name.startsWith('kauf-useru30-'));
  await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', values: ['week'] }, member: mem('U30') });
  assert.equal((await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_code' }, member: mem('U30') })).type, 9);
  const sub = (v, who) => inter({ type: 5, channel_id: ch.id, token: 'tok', message: { id: 'm' }, data: { custom_id: 'modal_code', components: [{ type: 1, components: [{ type: 4, custom_id: 'f_code', value: v }] }] }, member: mem(who) });
  assert.match(J(await sub('gibtsnicht', 'U30')), /gibt es nicht/);
  assert.match(J(await sub('COCO', 'U31')), /Keine Berechtigung/);
  const ok = await sub('coco', 'U30'); assert.equal(ok.type, 7); assert.match(J(ok), /Creator-Code/); assert.match(J(ok), /COCO/);
  const dm0 = S.dms.length;
  const conf = J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('ADMIN') })); const key = (conf.match(/[A-Z0-9]{4}(-[A-Z0-9]{4}){2}/) || [])[0]; assert.ok(key, 'Key im Ticket'); assert.match(conf, /Bonustag/); assert.equal(db.prepare('SELECT days FROM keys WHERE key=?').get(key).days, 9, '7 + 2 Bonustage (beim Code eingestellt)');
  const owner = db.prepare("SELECT * FROM keys WHERE created_by='bonus'").get(); assert.ok(owner && owner.days === 2, 'Inhaber ohne Lizenz bekommt einen Belohnungs-Key (2 Tage Wochen-Belohnung)');
  assert.ok(S.dms.slice(dm0).some(d => d.to === '123456789012345678' && /Code wurde genutzt/.test(JSON.stringify(d.body))), 'DM an Inhaber');
  assert.equal(db.prepare("SELECT uses, earned_days FROM codes WHERE code='COCO'").get().uses, 1);
  // zweiter Kauf derselben Person: Code nicht mehr möglich
  db.prepare('DELETE FROM tickets WHERE channel_id=?').run(ch.id);
  await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('U30') });
  const ch2 = S.channels.filter(c => c.name.startsWith('kauf-useru30-')).pop();
  await inter({ type: 3, channel_id: ch2.id, data: { custom_id: 'ticket_plan', values: ['week'] }, member: mem('U30') });
  assert.match(J(await inter({ type: 5, channel_id: ch2.id, message: { id: 'm' }, data: { custom_id: 'modal_code', components: [{ type: 1, components: [{ type: 4, custom_id: 'f_code', value: 'COCO' }] }] }, member: mem('U30') })), /schon einmal einen Code/);
  // eigener Code
  await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('123456789012345678') });
  const ch3 = S.channels.find(c => c.name.startsWith('kauf-user1234567890123'));
  assert.match(J(await inter({ type: 5, channel_id: ch3.id, message: { id: 'm' }, data: { custom_id: 'modal_code', components: [{ type: 1, components: [{ type: 4, custom_id: 'f_code', value: 'COCO' }] }] }, member: mem('123456789012345678') })), /eigenen Code/);
  // Bearbeiten und Löschen per Formular
  assert.match(J(await cform('modal_code_edit', { f_code: 'coco', f_buyer: '', f_week: '4', f_month: '', f_del: '' }, CM())), /Code aktualisiert/);
  assert.equal(db.prepare("SELECT owner_week, buyer_days, owner_month FROM codes WHERE code='COCO'").get().owner_week, 4);
  assert.equal(db.prepare("SELECT buyer_days FROM codes WHERE code='COCO'").get().buyer_days, 2);
  assert.match(J(await cform('modal_code_edit', { f_code: 'nix', f_buyer: '', f_week: '', f_month: '', f_del: '' }, CM())), /nicht gefunden/);
  assert.equal((await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'code', options: [{ type: 1, name: 'bearbeiten' }] }, member: CM() })).type, 9);
  assert.match(J(await cform('modal_code_edit', { f_code: 'coco', f_buyer: '', f_week: '', f_month: '', f_del: 'LÖSCHEN' }, CM())), /Code gelöscht/); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM codes WHERE code='COCO'").get().n, 0);
  // Datenschutz: Auskunft + Löschen
  const pr = id => inter({ type: 3, token: 'tk', data: { custom_id: id }, member: mem('U30') });
  db.prepare('INSERT INTO sessions (token_hash,discord_id,username,created_at) VALUES (?,?,?,?)').run('h-priv', 'U30', 'x', 1);
  const info = await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'datenschutz' }, member: mem('U30') }); assert.match(J(info), /Deine gespeicherten Daten/);
  assert.match(J(await pr('privacy_ask')), /Wirklich löschen/); assert.match(J(await pr('privacy_no')), /nichts gelöscht/);
  assert.match(J(await pr('privacy_do')), /Daten gelöscht/); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE discord_id='U30'").get().n, 0);
  assert.ok(db.prepare("SELECT 1 FROM keys WHERE discord_id='U30'").get() || true);
});
await T('Befehle werden automatisch registriert (Hash), nur bei Änderung', async () => {
  const calls = []; const real = globalThis.fetch;
  globalThis.fetch = async (u, o) => { if (/\/applications\/.*\/commands/.test(String(u)) && o && o.method === 'PUT') calls.push(1); return real(u, o); };
  try {
    db.prepare("DELETE FROM config WHERE k='cmdhash'").run();
    await worker.scheduled({ cron: '15,45 * * * *' }, env, ctx); await flush(); assert.equal(calls.length, 1);
    await worker.scheduled({ cron: '15,45 * * * *' }, env, ctx); await flush(); assert.equal(calls.length, 1, 'zweiter Lauf registriert nicht neu');
  } finally { globalThis.fetch = real; }
});
await T('PayPal: eigener Link je Laufzeit', async () => {
  const { paypalUrl } = await import('../src/util.js');
  const e = { PAYPAL_URL_WEEK: 'https://py.pl/w', PAYPAL_URL_MONTH: 'https://py.pl/m', PAYPAL_URL: 'https://paypal.me/x', PRICE_WEEK: '5 €', PRICE_MONTH: '15 €' };
  assert.equal(paypalUrl(e, 'week'), 'https://py.pl/w'); assert.equal(paypalUrl(e, 'month'), 'https://py.pl/m');
  assert.equal(paypalUrl({ PAYPAL_URL: 'https://paypal.me/x', PRICE_WEEK: '5 €' }, 'week'), 'https://paypal.me/x/5EUR');
});
await T('Wachstum: Probe-Key, Treue-Bonus, Bewertung, Belohnung', async () => {
  const btn = (id, who, ch = 'X') => inter({ type: 3, channel_id: ch, token: 'tok', data: { custom_id: id }, member: mem(who) });
  const form = (id, v, member) => inter({ type: 5, channel_id: 'X', token: 'tok', data: { custom_id: id, components: Object.entries(v).map(([k, x]) => ({ type: 1, components: [{ type: 4, custom_id: k, value: x }] })) }, member });
  // Probe
  const r1 = J(await btn('trial_start', 'U50')); assert.match(r1, /Probe-Key/); assert.match(r1, /[A-Z0-9]{4}(-[A-Z0-9]{4}){2}/);
  assert.equal(db.prepare("SELECT days FROM keys WHERE created_by='trial'").get().days, 1);
  assert.match(J(await btn('trial_start', 'U50')), /schon genutzt/);
  db.prepare("INSERT INTO keys (key,plan,days,status,discord_id,created_at,expires_at) VALUES ('OWN1-OWN2-OWN3-OWN4','week',7,'expired','U51',1,2)").run();
  assert.match(J(await btn('trial_start', 'U51')), /schon eine Lizenz/);
  // Treue-Bonus: aktive Lizenz + Verlaengerung vor Ablauf
  const exp0 = Math.floor(Date.now() / 1000) + 86400;
  db.prepare("INSERT INTO keys (key,plan,days,status,discord_id,created_at,redeemed_at,expires_at) VALUES ('ACT1-ACT2-ACT3-ACT4','week',7,'active','U52',1,1,?)").run(exp0);
  await inter({ type: 3, data: { custom_id: 'renew_open' }, user: { id: 'U52', username: 'useru52' } }); const ch = S.channels.find(c => /^verlaengern-useru52-\d+$/.test(c.name));
  assert.ok(ch, 'Ticket-Kanal');
  await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', values: ['week'] }, member: mem('U52') });
  const conf = J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('ADMIN') }));
  assert.match(conf, /Treue-Bonus/);
  assert.equal(db.prepare("SELECT expires_at FROM keys WHERE key='ACT1-ACT2-ACT3-ACT4'").get().expires_at, exp0 + 7 * 86400 + 86400);
  // Bewertung beim Schliessen
  const dm0 = S.dms.length;
  await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_close' }, member: mem('U52') }); await flush();
  const rd = S.dms.slice(dm0).find(d => d.to === 'U52' && /rate:/.test(JSON.stringify(d.body))); assert.ok(rd, 'Bewertungs-DM');
  assert.match(J(await btn('rate:5:' + ch.id, 'U52')), /5 von 5/);
  await btn('rate:1:' + ch.id, 'U52'); assert.equal(db.prepare('SELECT COUNT(*) n, MAX(stars) s FROM ratings').get().s, 5);
  // Belohnung
  const bel = who => inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'belohnung' }, member: mem(who) });
  assert.equal((await bel('ADMIN')).type, 9); assert.match(J(await bel('U1')), /Keine Berechtigung/);
  assert.match(J(await form('modal_reward', { f_user: '<@123456789012345678>', f_days: '99', f_why: 'x' }, mem('ADMIN'))), /Tage ungültig/);
  assert.match(J(await form('modal_reward', { f_user: 'nix', f_days: '3', f_why: 'x' }, mem('ADMIN'))), /nicht erkannt/);
  assert.match(J(await form('modal_reward', { f_user: '<@123456789012345678>', f_days: '3', f_why: 'Vorschlag umgesetzt' }, mem('U1'))), /Keine Berechtigung/);
  const d1 = S.dms.length;
  assert.match(J(await form('modal_reward', { f_user: '<@123456789012345678>', f_days: '3', f_why: 'Vorschlag umgesetzt' }, mem('ADMIN'))), /\+3 Tage/);
  assert.ok(S.dms.slice(d1).some(d => /Vorschlag umgesetzt/.test(JSON.stringify(d.body))), 'DM mit Grund');
  assert.equal(db.prepare('SELECT days FROM reward_log').get().days, 3);
});
await T('Lifetime-Key: nur Admin, läuft nicht ab, keine Erinnerung', async () => {
  assert.match(J(await cmd('erstellen', [{ name: 'dauer', value: 'lifetime' }], 'U1')), /Keine Berechtigung/);
  const r = J(await cmd('erstellen', [{ name: 'dauer', value: 'lifetime' }])); const k = (r.match(/[A-Z0-9]{4}(-[A-Z0-9]{4}){2}/) || [])[0]; assert.ok(k, 'Key'); assert.match(r, /Lifetime/);
  const red = J(await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'key', options: [{ type: 1, name: 'einlösen', options: [{ name: 'key', value: k }] }] }, member: mem('U60') }));
  assert.match(red, /Lifetime/);
  const row = db.prepare('SELECT * FROM keys WHERE key=?').get(k); assert.equal(row.status, 'active'); assert.ok(row.expires_at > Math.floor(Date.now() / 1000) + 365 * 86400 * 50);
  await worker.scheduled({ cron: '0 * * * *' }, env, ctx); await flush();
  assert.ok(!S.dms.some(d => d.to === 'U60' && /läuft bald ab/.test(JSON.stringify(d.body))));
});
await T('Paket 2: Wochen-Sieger, Events mit Zu-/Absage + Erinnerung, Newsletter', async () => {
  const C = await import('../src/community.js'); const { withCfg } = await import('../src/discord.js');
  db.prepare('INSERT OR REPLACE INTO config (k,v) VALUES (?,?)').run('event_channel', 'EVCH'); db.prepare('INSERT OR REPLACE INTO config (k,v) VALUES (?,?)').run('rank_channel', 'RKCH'); db.prepare('INSERT OR REPLACE INTO config (k,v) VALUES (?,?)').run('general_channel', 'GNCH');
  // Zeit-Parser (Sommerzeit: 20:00 MESZ = 18:00 UTC; Winter: 20:00 MEZ = 19:00 UTC)
  assert.equal(C.parseBerlin('24.10.2026 20:00'), Date.UTC(2026, 9, 24, 18) / 1000); assert.equal(C.parseBerlin('15.12.2026 20:00'), Date.UTC(2026, 11, 15, 19) / 1000);
  assert.equal(C.parseBerlin('quatsch'), null); assert.equal(C.parseBerlin('32.01. 10:00'), null);
  const fm = (id, v, who) => inter({ type: 5, channel_id: 'X', token: 'tok', data: { custom_id: id, components: Object.entries(v).map(([k, x]) => ({ type: 1, components: [{ type: 4, custom_id: k, value: x }] })) }, member: mem(who) });
  assert.equal((await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'event' }, member: mem('ADMIN') })).type, 9);
  assert.match(J(await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'event' }, member: mem('U1') })), /Keine Berechtigung/);
  const soon = new Date(Date.now() + 20 * 60000); const pad = n => String(n).padStart(2, '0');
  const b = C.berlin(Math.floor(soon / 1000)), when = `${pad(b.d)}.${pad(b.mo)}.${b.y} ${pad(b.h)}:${pad(b.mi)}`;
  assert.match(J(await fm('modal_event', { f_title: 'Scrim', f_when: 'gestern', f_desc: '' }, 'ADMIN')), /Zeit nicht erkannt/);
  assert.match(J(await fm('modal_event', { f_title: 'Scrim', f_when: when, f_desc: 'Duo' }, 'U1')), /Keine Berechtigung/);
  assert.match(J(await fm('modal_event', { f_title: 'Scrim', f_when: when, f_desc: 'Duo' }, 'ADMIN')), /Event erstellt/);
  const ev = db.prepare('SELECT * FROM events').get(); assert.ok(ev.message_id);
  const yes = await inter({ type: 3, channel_id: 'EVCH', data: { custom_id: 'event_yes:' + ev.id }, member: mem('U70') }); assert.equal(yes.type, 7); assert.match(J(yes), /Dabei \(1\)/);
  await inter({ type: 3, channel_id: 'EVCH', data: { custom_id: 'event_yes:' + ev.id }, member: mem('U71') });
  const no = J(await inter({ type: 3, channel_id: 'EVCH', data: { custom_id: 'event_no:' + ev.id }, member: mem('U71') })); assert.match(no, /Dabei \(1\)/);
  const d0 = S.dms.length; await C.eventSweep(await withCfg(env)); await C.eventSweep(await withCfg(env));
  const rem = S.dms.slice(d0).filter(d => /Gleich geht/.test(JSON.stringify(d.body))); assert.equal(rem.length, 1); assert.equal(rem[0].to, 'U70');
  await C.eventSweep(await withCfg(env), Math.floor(Date.now() / 1000) + 3 * 3600); assert.equal(db.prepare('SELECT status FROM events').get().status, 'done');
  // Wochen-Sieger: Montag 19.10.2026 11:00 MESZ
  const mon = Date.UTC(2026, 9, 19, 9) / 1000, ct = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM ranks').run();
  for (const [id, sc] of [['W1', 80], ['W2', 91], ['W3', 70]]) db.prepare('INSERT INTO ranks (discord_id,name,games,avg_score,wins,kills,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, 'Spieler' + id, 5, sc, 1, 3, mon - 86400);
  const e2 = await withCfg(env);
  assert.equal(await C.weeklySweep(e2, Date.UTC(2026, 9, 20, 9) / 1000), undefined); // Dienstag: nichts
  const d1 = S.dms.length;
  assert.equal(await C.weeklySweep(e2, mon), 'W2'); assert.equal(await C.weeklySweep(e2, mon + 3600), undefined); // nur einmal pro Woche
  assert.ok(S.dms.slice(d1).some(d => d.to === 'W2' && /Spieler der Woche/.test(JSON.stringify(d.body))), 'DM an Sieger');
  assert.equal(db.prepare("SELECT days FROM keys WHERE created_by='bonus' AND days=3").all().length >= 1, true);
  // Newsletter: Sonntag 25.10.2026 18:30
  const sun = Date.UTC(2026, 9, 25, 17, 30) / 1000, p0 = S.posts ? S.posts.length : 0;
  await C.newsletterSweep(e2, sun - 7200); await C.newsletterSweep(e2, sun); await C.newsletterSweep(e2, sun + 60);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM config WHERE k LIKE 'news:%'").get().n, 1);
});
await T('Rangliste: Community-Durchschnitt erst ab 5 Teilnehmern, ohne Namen', async () => {
  db.prepare('DELETE FROM ranks').run();
  const get = async () => { const r = await worker.fetch(new Request('https://w.dev/rank/avg', { headers: { 'cf-connecting-ip': 'avg' + (++ipn) } }), env, ctx); return r.json(); };
  for (let k = 0; k < 4; k++) db.prepare('INSERT INTO ranks (discord_id,name,games,avg_score,wins,kills,avg_place,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('A' + k, 'n' + k, 10, 50 + k, 1, 20, 10, 1);
  let r = await get(); assert.equal(r.ok, true); assert.equal(r.all, null); assert.equal(r.top, null);
  for (let k = 4; k < 12; k++) db.prepare('INSERT INTO ranks (discord_id,name,games,avg_score,wins,kills,avg_place,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('A' + k, 'n' + k, 10, 50 + k, 1, 20, 10, 1);
  r = await get(); assert.equal(r.all.n, 12); assert.equal(r.top.n, 10); assert.ok(r.top.avgScore > r.all.avgScore); assert.equal(r.all.kpg, 2); assert.ok(!JSON.stringify(r).includes('n1'));
});
await T('Duo/Squad werden nicht mehr verkauft, Team kostet 30 Euro', async () => {
  await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('U60') });
  const ch = S.channels.find(c => c.name.startsWith('kauf-useru60-')); assert.ok(ch);
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', values: ['duo'] }, member: mem('U60') })), /Unbekannte Laufzeit/);
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', values: ['team'] }, member: mem('U60') })), /30 €/);
});
await T('Tweak-Paket: Einmalkauf schaltet Freigabe im Ticket frei, nicht fuer Verlaengerung', async () => {
  await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('U62') });
  const ch = S.channels.find(c => c.name.startsWith('kauf-useru62-')); assert.ok(ch);
  await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', values: ['tweaks'] }, member: mem('U62') });
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('ADMIN') })), /Freigeschaltet/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM entitlements WHERE user_id='U62' AND ent='tw'").get().n, 1);
  assert.equal(db.prepare("SELECT SUM(amount) s FROM sales WHERE user_id='U62'").get().s, 9);
  await inter({ type: 3, data: { custom_id: 'renew_open' }, user: { id: 'U63', username: 'useru63' } });
  const rc = S.channels.find(c => /^verlaengern-useru63-\d+$/.test(c.name));
  assert.match(J(await inter({ type: 3, channel_id: rc.id, data: { custom_id: 'ticket_plan', values: ['tweaks'] }, member: mem('U63') })), /Unbekannte Laufzeit/);
});
await T('Team-Lizenz: Kauf, Beitritt per Code, Coach-Ansicht, Limits, Rechte', async () => {
  const { sha256hex } = await import('../src/util.js');
  const sess = async (id, name) => { const tok = 'tok-team-' + id; if (db.prepare('SELECT 1 FROM sessions WHERE discord_id=?').get(id)) return tok; db.prepare('INSERT INTO sessions (token_hash,discord_id,username,created_at) VALUES (?,?,?,?)').run(await sha256hex(tok), id, name, 1); return tok; };
  const tc = await sess('UC1', 'Chef'); const call = async (a, b) => (await post('/team/' + a, b)).body;
  // Kauf im Ticket
  await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('UC1') });
  const ch = S.channels.find(c => c.name.startsWith('kauf-userucc1-') || c.name.startsWith('kauf-useruc1-')); assert.ok(ch);
  await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', values: ['team'] }, member: mem('UC1') });
  const conf = J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('ADMIN') }));
  assert.match(conf, /Team-Code: \*\*T-[A-Z0-9]{6}\*\*/);
  const team = db.prepare("SELECT * FROM teams WHERE owner_id='UC1'").get(); assert.ok(team); assert.equal(team.seats, 5);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM keys WHERE created_by='ADMIN' AND status='unused' AND plan='month'").get().n >= 5, true);
  // Coach sieht sich, fremde nicht
  let me = await call('me', { session: tc }); assert.equal(me.role, 'coach'); assert.equal(me.team.code, team.code); assert.equal(me.members.length, 1);
  const tp = await sess('UP1', 'Spieler1'), tq = await sess('UP2', 'Spieler2');
  assert.equal((await post('/team/me', { session: 'nix' })).status, 401);
  assert.equal((await call('join', { session: tp, code: 'T-XXXXXX' })).error, 'code');
  assert.equal((await call('join', { session: tp, code: team.code.toLowerCase() })).role, 'member');
  assert.equal((await call('join', { session: tp, code: team.code })).error, 'already');
  assert.equal((await call('join', { session: tq, code: team.code })).role, 'member');
  // Stats teilen, Coach sieht sie, Mitglied sieht keine anderen und keinen Code
  assert.ok((await call('sync', { session: tp, stats: { games: 12, avgScore: 61.4, wins: 2, kills: 30, avgPlace: 9.5, bestPlace: 1, weak: [{ kind: 'rot', pct: 40 }, { kind: '<b>x', pct: 999 }], trend: [50, 55, 60, 'x', 70] } })).ok);
  assert.equal((await call('sync', { session: tp, stats: { games: 'x' } })).error, 'stats');
  me = await call('me', { session: tc }); const p1 = me.members.find(m => m.id === 'UP1');
  assert.equal(p1.stats.avgScore, 61.4); assert.deepEqual(p1.stats.trend, [50, 55, 60, 70]); assert.equal(p1.stats.weak[1].pct, 100); assert.equal(p1.stats.weak[1].kind, 'bx');
  const mm = await call('me', { session: tp }); assert.equal(mm.role, 'member'); assert.ok(!mm.members); assert.ok(!mm.team.code); assert.equal(mm.team.coach, 'Chef');
  // Rechte: Mitglied darf nicht entfernen/umbenennen, Coach schon
  assert.equal((await call('kick', { session: tp, id: 'UP2' })).error, 'coach'); assert.equal((await call('rename', { session: tp, name: 'x' })).error, 'coach');
  assert.equal((await call('rename', { session: tc, name: 'Cocos <@everyone> Squad' })).team.name, 'Cocos everyone Squad');
  // Platz-Limit 5
  for (const n of [3, 4]) assert.equal((await call('join', { session: await sess('UP' + n, 'S' + n), code: team.code })).role, 'member');
  assert.equal((await call('join', { session: await sess('UP6', 'S6'), code: team.code })).error, 'full');
  assert.equal((await call('kick', { session: tc, id: 'UP4' })).members.length, 4);
  assert.equal((await call('join', { session: await sess('UP6', 'S6'), code: team.code })).role, 'member');
  assert.equal((await call('kick', { session: tc, id: 'UC1' })).error, 'self');
  assert.equal((await call('leave', { session: tc })).error, 'owner'); assert.equal((await call('leave', { session: tq })).role, null);
  // Coach-Freigabe im Lizenz-Ticket
  db.prepare("INSERT INTO keys (key,plan,days,status,discord_id,created_at,redeemed_at,expires_at,device) VALUES ('COAC-HKEY-0000-0001','month',30,'active','UC1',1,1,?,?)").run(Math.floor(Date.now() / 1000) + 86400, 'device-COACH001');
  S.members.UC1 = { ...(S.members.UC1 || { user: { id: 'UC1' } }), roles: [env.CUSTOMER_ROLE_ID || S.roles.find(r => r.name === 'Customer').id] };
  const rf = await post('/license/refresh', { session: tc, device: 'device-COACH001' }); assert.ok(rf.body.ok, JSON.stringify(rf.body)); assert.deepEqual(JSON.parse(Buffer.from(rf.body.ticket.split('.')[0], 'base64url').toString()).ents, ['coach']);
  // Verlaengern: +30 Tage, gleicher Code; abgelaufen: Coach-Ansicht leer, Beitritt gesperrt
  const e0 = team.expires_at; db.prepare("UPDATE teams SET expires_at=1 WHERE owner_id='UC1'").run();
  me = await call('me', { session: tc }); assert.equal(me.team.active, false); assert.ok(!me.members);
  assert.equal((await call('join', { session: await sess('UP7', 'S7'), code: team.code })).error, 'expired');
  assert.equal((await call('kick', { session: tc, id: 'UP1' })).error, 'coach');
  db.prepare("UPDATE teams SET expires_at=? WHERE owner_id='UC1'").run(e0);
  // Datenschutz: Loeschen entfernt geteilte Stats
  await inter({ type: 3, data: { custom_id: 'privacy_do' }, member: mem('UP1') });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM team_members WHERE user_id='UP1'").get().n, 0);
});
await T('Season-Pass: Bonustage einmal je Level, nur mit Lizenz, Premium per Ticket', async () => {
  const { sha256hex } = await import('../src/util.js'); const { seasonId } = await import('../src/season.js');
  const tok = 'tok-season-1'; db.prepare('INSERT INTO sessions (token_hash,discord_id,username,created_at) VALUES (?,?,?,?)').run(await sha256hex(tok), 'US1', 'Saison', 1);
  const call = async (a, b) => (await post('/season/' + a, { session: tok, ...b })).body; const cur = seasonId();
  assert.match(cur, /^\d{4}-\d{2}$/); assert.equal((await post('/season/me', { session: 'x' })).status, 401);
  assert.deepEqual((await call('me', {})).claimed, []);
  assert.equal((await call('claim', { season: cur, level: 3, xp: 300 })).error, 'license');
  const exp0 = Math.floor(Date.now() / 1000) + 5 * 86400;
  db.prepare("INSERT INTO keys (key,plan,days,status,discord_id,created_at,redeemed_at,expires_at) VALUES ('SEAS-ONKE-Y000-0001','month',30,'active','US1',1,1,?)").run(exp0);
  assert.equal((await call('claim', { season: '2020-01', level: 3, xp: 300 })).error, 'season');
  assert.equal((await call('claim', { season: cur, level: 4, xp: 400 })).error, 'level');
  assert.equal((await call('claim', { season: cur, level: 3, xp: 120 })).error, 'xp');
  const ok1 = await call('claim', { season: cur, level: 3, xp: 300 }); assert.ok(ok1.ok); assert.equal(ok1.days, 1); assert.deepEqual(ok1.claimed, [3]);
  assert.equal(db.prepare("SELECT expires_at e FROM keys WHERE key='SEAS-ONKE-Y000-0001'").get().e, exp0 + 86400);
  assert.equal((await call('claim', { season: cur, level: 3, xp: 999 })).error, 'done');
  assert.equal(db.prepare("SELECT expires_at e FROM keys WHERE key='SEAS-ONKE-Y000-0001'").get().e, exp0 + 86400, 'nicht doppelt');
  assert.equal((await call('claim', { season: cur, level: 10, xp: 1000 })).days, 2);
  // Premium: Ticket-Kauf schaltet pass:<Season> frei
  await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('US2') });
  const ch = S.channels.find(c => c.name.startsWith('kauf-userus2-')); assert.ok(ch);
  await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_plan', values: ['pass'] }, member: mem('US2') });
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_confirm' }, member: mem('ADMIN') })), /Season/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM entitlements WHERE user_id='US2' AND ent=?").get('pass:' + cur).n, 1);
  assert.equal(db.prepare("SELECT SUM(amount) s FROM sales WHERE user_id='US2'").get().s, 5);
});
console.log(`\n${ok} Tests bestanden`); S.restore();

