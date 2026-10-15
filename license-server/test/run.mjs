// Lokaler Test (ohne Cloudflare/Discord): Migration, Tickets, Key-System, API, Rate-Limit, Cron, Setup.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../src/index.js';
import { runSetup } from '../src/setup.js';
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
  const ch = S.channels.find(c => c.name === 'kauf-useru1'); assert.ok(ch); assert.ok(ch.permission_overwrites.some(o => o.id === 'G' && o.deny === '1024'));
  assert.match(J(await inter({ type: 3, data: { custom_id: 'ticket_buy' }, member: mem('U1') })), /bereits/);
  assert.match(J(await inter({ type: 3, data: { custom_id: 'ticket_support' }, member: mem('U1') })), /<#C\d+>/);
  const first = S.msgs[ch.id][0]; assert.equal(first.components[0].components[0].type, 3); // Dropdown vorhanden
});
await T('Dropdown Laufzeit zeigt Preis + Zahlungshinweis, Fremde nicht', async () => {
  const ch = S.channels.find(c => c.name === 'kauf-useru1');
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
  const t = S.channels.find(c => c.name === 'kauf-useru1');
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
  const names = S.channels.map(c => c.name);
  for (const n of ['START', 'COMMUNITY', 'TOOL', 'welcome', 'rules', 'announcements', 'patchnotes', 'download', 'free-tips', 'general', 'placements', 'lfg', 'questions', 'how-to-use', 'feedback', 'bug-reports', 'support', 'impressum', 'ticket-logs']) assert.ok(names.includes(n), n);
  assert.equal(names.filter(n => n === 'key-kaufen').length, 1); // vorhanden, nicht doppelt
  for (const n of ['Admin', 'Customer', 'Member', 'Tester']) assert.equal(S.roles.filter(x => x.name === n).length, 1, n);
  const ann = S.channels.find(c => c.name === 'announcements'); assert.ok(ann.permission_overwrites.some(o => o.id === 'G' && o.deny === '2048')); // nur Admin schreibt
  const gen = S.channels.find(c => c.name === 'general'); assert.equal(gen.permission_overwrites, undefined); // offen
  const dl = S.msgs[S.channels.find(c => c.name === 'download').id][0]; assert.equal(dl.components[0].components[0].style, 5); assert.match(dl.components[0].components[0].url, /^https:/);
  assert.ok(S.msgs[S.channels.find(c => c.name === 'welcome').id][0].embeds[0].color === 0x1e6bff);
  assert.ok(S.msgs[S.channels.find(c => c.name === 'rules').id][0].components[0].components[0].custom_id === 'rules_accept');
  assert.ok(S.msgs['KEYCH'][0].components[0].components[0].label === 'Key kaufen');
  const before = S.channels.length, msgsBefore = Object.values(S.msgs).flat().length;
  await inter({ type: 2, channel_id: 'X', token: 'tok', data: { name: 'setup' }, member: mem('ADMIN') }); await flush();
  assert.equal(S.channels.length, before); assert.equal(Object.values(S.msgs).flat().length, msgsBefore);
  assert.match(JSON.stringify(S.patched.at(-1)), /vorhanden/);
});
await T('/setup: Rollen-Beitritt per Regel-Button + Limit-Fortsetzung', async () => {
  assert.match(J(await inter({ type: 3, data: { custom_id: 'rules_accept' }, member: mem('U1') })), /Member/);
  const memberId = S.roles.find(r => r.name === 'Member').id; assert.ok(S.members.U1.roles.includes(memberId));
  // Limit: mit 12 Aufrufen nur teilweise, mit Wiederholung vollständig
  const S2 = makeDiscord(); const { D1: D2 } = makeDb(['schema.sql']); const { env: e2 } = makeEnv(D2);
  const r1 = await runSetup({ ...e2, _budget: { n: 0, max: 12 } }, false); assert.equal(r1.partial, true);
  let r = r1, guard = 0; while (r.partial && guard++ < 10) r = await runSetup({ ...e2, _budget: { n: 0, max: 12 } }, false);
  assert.equal(r.partial, false); assert.equal(S2.channels.filter(c => c.name === 'welcome').length, 1);
  S2.restore();
});
await T('Ticket schließen: Transkript im Log-Kanal, Kanal gelöscht, Fremde nicht', async () => {
  const ch = S.channels.find(c => c.name === 'kauf-useru1'); const logId = S.channels.find(c => c.name === 'ticket-logs').id;
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_close' }, member: mem('U9') })), /Keine Berechtigung/);
  assert.match(J(await inter({ type: 3, channel_id: ch.id, data: { custom_id: 'ticket_close' }, member: mem('U1') })), /geschlossen/);
  await flush();
  const f = S.files.find(x => x.ch === logId); assert.ok(f, 'Transkript fehlt'); assert.match(f.text, /Transkript/); assert.match(f.text, /Lizenzbestellung/); assert.match(f.name, /\.txt$/);
  assert.ok(S.deleted.includes(ch.id));
});
console.log(`\n${ok} Tests bestanden`); S.restore();
