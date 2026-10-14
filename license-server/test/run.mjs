// Lokaler Test ohne Cloudflare: D1 wird mit node:sqlite nachgebaut, Discord-API gemockt.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign, verify, createPublicKey } from 'node:crypto';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const D1 = {
  prepare(sql) {
    const st = db.prepare(sql); let args = [];
    const o = {
      bind(...a) { args = a; return o; },
      async first() { return st.get(...args) || null; },
      async all() { return { results: st.all(...args) }; },
      async run() { const r = st.run(...args); return { meta: { changes: Number(r.changes) } }; }
    }; return o;
  }
};

// Schluessel
const disc = generateKeyPairSync('ed25519');
const discPubHex = disc.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const sig = generateKeyPairSync('ed25519');
const env = {
  DB: D1, DISCORD_APP_ID: '111', DISCORD_PUBLIC_KEY: discPubHex, GUILD_ID: 'G', CUSTOMER_ROLE_ID: 'ROLE',
  TICKET_CATEGORY_ID: 'CAT', PANEL_CHANNEL_ID: 'PAN', ADMIN_USER_IDS: 'ADMIN', BOT_TOKEN: 'bt', CLIENT_SECRET: 'cs',
  SIGNING_KEY: sig.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), SETUP_SECRET: 'sec'
};

// Discord-API mock
const calls = []; const members = { U1: { roles: [] } }; let chanN = 0;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), m = opt.method || 'GET'; calls.push(m + ' ' + u.replace('https://discord.com/api/v10', ''));
  const R = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  let mm;
  if ((mm = u.match(/members\/(\w+)\/roles\/ROLE$/))) { const x = members[mm[1]] ||= { roles: [] }; if (m === 'PUT') { if (!x.roles.includes('ROLE')) x.roles.push('ROLE'); } else x.roles = x.roles.filter(r => r !== 'ROLE'); return new Response(null, { status: 204 }); }
  if ((mm = u.match(/members\/(\w+)$/))) return members[mm[1]] ? R({ roles: members[mm[1]].roles }) : R({ message: 'x' }, 404);
  if (u.endsWith('/guilds/G/channels')) return R({ id: 'CH' + (++chanN) });
  if (u.endsWith('/users/@me/channels')) return R({ id: 'DM1' });
  if (u.includes('/messages')) return R({ id: 'M1' });
  if (u.includes('/commands')) return R([]);
  if (u.endsWith('/oauth2/token')) return R({ access_token: 'at' });
  if (u.endsWith('/users/@me')) return R({ id: 'U1', username: 'tester', global_name: 'Tester' });
  if (m === 'DELETE' && u.includes('/channels/')) return R({});
  return R({}, 404);
};

const ctx = { waitUntil() {} };
async function inter(body) {
  const raw = JSON.stringify(body), ts = String(Date.now());
  const s = sign(null, Buffer.from(ts + raw), disc.privateKey).toString('hex');
  const r = await worker.fetch(new Request('https://w.dev/interactions', { method: 'POST', body: raw, headers: { 'x-signature-ed25519': s, 'x-signature-timestamp': ts } }), env, ctx);
  return { status: r.status, body: r.status === 200 ? await r.json() : null };
}
const post = async (p, b) => { const r = await worker.fetch(new Request('https://w.dev' + p, { method: 'POST', body: JSON.stringify(b) }), env, ctx); return r.json(); };
const mem = id => ({ user: { id, username: 'tester' } });
let ok = 0; const T = (n, f) => f().then(() => { ok++; console.log('ok  ', n); }, e => { console.log('FAIL', n, '\n', e); process.exitCode = 1; });

await T('ping + falsche Signatur', async () => {
  assert.equal((await inter({ type: 1 })).body.type, 1);
  const r = await worker.fetch(new Request('https://w.dev/interactions', { method: 'POST', body: '{}', headers: { 'x-signature-ed25519': 'aa'.repeat(64), 'x-signature-timestamp': '1' } }), env, ctx);
  assert.equal(r.status, 401);
});
await T('setup nur mit Secret', async () => {
  assert.equal((await worker.fetch(new Request('https://w.dev/setup?secret=x'), env, ctx)).status, 403);
  const j = await (await worker.fetch(new Request('https://w.dev/setup?secret=sec'), env, ctx)).json();
  assert.equal(j.commands, 'ok'); assert.equal(j.panel, 'ok');
});
await T('Ticket oeffnen (einmal pro Nutzer)', async () => {
  const a = await inter({ type: 3, data: { custom_id: 'ticket_open' }, member: mem('U1') });
  assert.match(a.body.data.content, /<#CH1>/);
  const b = await inter({ type: 3, data: { custom_id: 'ticket_open' }, member: mem('U1') });
  assert.match(b.body.data.content, /schon ein offenes/);
});
await T('/key nur fuer Admin', async () => {
  const r = await inter({ type: 2, channel_id: 'CH1', data: { name: 'key', options: [{ name: 'plan', value: 'week' }] }, member: mem('U1') });
  assert.match(r.body.data.content, /nur für das Team/);
});
let KEY;
await T('/key im Ticket vergibt Key + Rolle', async () => {
  const r = await inter({ type: 2, channel_id: 'CH1', data: { name: 'key', options: [{ name: 'plan', value: 'week' }] }, member: mem('ADMIN') });
  KEY = r.body.data.content.match(/[A-Z0-9]{4}(-[A-Z0-9]{4}){3}/)[0];
  assert.ok(KEY); assert.ok(members.U1.roles.includes('ROLE'));
  const row = db.prepare('SELECT * FROM keys WHERE key=?').get(KEY);
  assert.ok(Math.abs(row.expires_at - Date.now() / 1000 - 7 * 86400) < 5);
});
let SESSION;
await T('Discord-Login: start -> callback -> poll (nur einmal)', async () => {
  const cid = 'abcdefghijklmnop1234';
  const s = await worker.fetch(new Request('https://w.dev/auth/start?cid=' + cid), env, ctx);
  assert.equal(s.status, 302); assert.match(s.headers.get('location'), /state=abcdefghijklmnop1234/);
  assert.deepEqual(await post('/auth/poll', { cid }), { ok: false, pending: true });
  const cb = await worker.fetch(new Request('https://w.dev/auth/callback?code=c&state=' + cid), env, ctx);
  assert.equal(cb.status, 200);
  const p = await post('/auth/poll', { cid }); assert.ok(p.ok); SESSION = p.session; assert.equal(p.user.id, 'U1');
  assert.equal((await post('/auth/poll', { cid })).ok, false);
});
let TICKET;
await T('Key einloesen + Ticket-Signatur pruefbar', async () => {
  const r = await post('/license/activate', { session: SESSION, key: KEY, device: 'device-AAAAAAAA' });
  assert.ok(r.ok, JSON.stringify(r)); TICKET = r.ticket;
  const [b, s] = TICKET.split('.');
  const pub = createPublicKey({ key: sig.publicKey.export({ type: 'spki', format: 'der' }), format: 'der', type: 'spki' });
  assert.ok(verify(null, Buffer.from(b), pub, Buffer.from(s, 'base64url')));
  const p = JSON.parse(Buffer.from(b, 'base64url')); assert.equal(p.uid, 'U1'); assert.equal(p.dev, 'device-AAAAAAAA');
});
await T('anderes Geraet wird abgelehnt, Reset hebt es auf', async () => {
  const r = await post('/license/refresh', { session: SESSION, device: 'device-BBBBBBBB' });
  assert.equal(r.error, 'device');
  await inter({ type: 2, channel_id: 'X', data: { name: 'reset-device', options: [{ name: 'key', value: KEY.toLowerCase() }] }, member: mem('ADMIN') });
  assert.ok((await post('/license/refresh', { session: SESSION, device: 'device-BBBBBBBB' })).ok);
});
await T('fremdes Konto kann Key nicht nutzen', async () => {
  const sess = 'other'; // eigene Sitzung fuer U2
  const crypto = await import('node:crypto');
  const h = crypto.createHash('sha256').update(sess).digest('hex');
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(h, 'U2', 'x', 1);
  assert.equal((await post('/license/activate', { session: sess, key: KEY, device: 'device-CCCCCCCC' })).error, 'owner');
  assert.equal((await post('/license/activate', { session: 'nix', key: KEY, device: 'device-CCCCCCCC' })).error, 'session');
});
await T('Rolle weg -> abgelehnt', async () => {
  members.U1.roles = [];
  assert.equal((await post('/license/refresh', { session: SESSION, device: 'device-BBBBBBBB' })).error, 'role');
  members.U1.roles = ['ROLE'];
});
await T('/key verlaengert denselben Key', async () => {
  const before = db.prepare('SELECT expires_at FROM keys WHERE key=?').get(KEY).expires_at;
  const r = await inter({ type: 2, channel_id: 'CH1', data: { name: 'key', options: [{ name: 'plan', value: 'month' }] }, member: mem('ADMIN') });
  assert.match(r.body.data.content, new RegExp(KEY));
  assert.equal(db.prepare('SELECT expires_at FROM keys WHERE key=?').get(KEY).expires_at, before + 30 * 86400);
});
await T('/revoke sperrt + entzieht Rolle', async () => {
  await inter({ type: 2, channel_id: 'X', data: { name: 'revoke', options: [{ name: 'key', value: KEY }] }, member: mem('ADMIN') });
  assert.equal((await post('/license/refresh', { session: SESSION, device: 'device-BBBBBBBB' })).error, 'revoked');
  assert.ok(!members.U1.roles.includes('ROLE'));
});
await T('abgelaufen + Cron entzieht Rolle', async () => {
  const r = await inter({ type: 2, channel_id: 'X', data: { name: 'key', options: [{ name: 'plan', value: 'week' }, { name: 'user', value: 'U3' }] }, member: mem('ADMIN') });
  const k = r.body.data.content.match(/[A-Z0-9]{4}(-[A-Z0-9]{4}){3}/)[0];
  assert.ok(members.U3.roles.includes('ROLE'));
  db.prepare('UPDATE keys SET expires_at=1 WHERE key=?').run(k);
  const { expireSweep } = await import('../src/index.js');
  await expireSweep(env);
  assert.ok(!members.U3.roles.includes('ROLE'));
});
await T('Ticket schliessen (Ersteller/Admin, Fremde nicht)', async () => {
  assert.match((await inter({ type: 3, channel_id: 'CH1', data: { custom_id: 'ticket_close' }, member: mem('U9') })).body.data.content, /Nur der Ticket/);
  assert.match((await inter({ type: 3, channel_id: 'CH1', data: { custom_id: 'ticket_close' }, member: mem('U1') })).body.data.content, /geschlossen/);
});
console.log(`\n${ok} Tests bestanden`);
