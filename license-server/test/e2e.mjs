// Ende-zu-Ende: App-Modul license.js  <->  Worker (lokal per HTTP), Discord gemockt.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { generateKeyPairSync, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const require = createRequire(import.meta.url);
const { create } = require('../../license.js');

const db = new DatabaseSync(':memory:'); db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const D1 = { prepare(sql) { const st = db.prepare(sql); let a = []; const o = { bind(...x) { a = x; return o; }, async first() { return st.get(...a) || null; }, async all() { return { results: st.all(...a) }; }, async run() { const r = st.run(...a); return { meta: { changes: Number(r.changes) } }; } }; return o; } };
const sig = generateKeyPairSync('ed25519'), disc = generateKeyPairSync('ed25519');
const env = { DB: D1, DISCORD_APP_ID: '111', DISCORD_PUBLIC_KEY: disc.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'), GUILD_ID: 'G', CUSTOMER_ROLE_ID: 'ROLE', TICKET_CATEGORY_ID: 'C', PANEL_CHANNEL_ID: 'P', ADMIN_USER_IDS: 'ADMIN', BOT_TOKEN: 'b', CLIENT_SECRET: 's', SIGNING_KEY: sig.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') };

const members = { U1: { roles: [] } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, opt);
  const R = (d, s = 200) => new Response(JSON.stringify(d), { status: s }); let m;
  if ((m = u.match(/members\/(\w+)\/roles\/ROLE$/))) { const x = members[m[1]] ||= { roles: [] }; opt.method === 'PUT' ? (x.roles.includes('ROLE') || x.roles.push('ROLE')) : (x.roles = x.roles.filter(r => r !== 'ROLE')); return new Response(null, { status: 204 }); }
  if ((m = u.match(/members\/(\w+)$/))) return members[m[1]] ? R({ roles: members[m[1]].roles }) : R({}, 404);
  if (u.endsWith('/oauth2/token')) return R({ access_token: 'at' });
  if (u.endsWith('/users/@me')) return R({ id: 'U1', username: 'tester', global_name: 'Tester' });
  if (u.includes('/users/@me/channels')) return R({ id: 'DM' });
  if (u.includes('/messages')) return R({ id: 'M' });
  return R({}, 404);
};
const srv = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request('http://127.0.0.1:' + srv.address().port + req.url, { method: req.method, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined, headers: req.headers }), env, { waitUntil() {} });
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;

const appDir = mkdtempSync(join(tmpdir(), 'cft-')); mkdirSync(join(appDir, 'app'));
writeFileSync(join(appDir, 'app', 'config.js'), `window.CFT_CONFIG={license:{required:true,endpoint:'${base}',publicKey:'${sig.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}'}};`);
const mk = (dir) => create({ userDataDir: dir, appDir, openExternal: async url => { // simuliert: Nutzer klickt im Browser durch Discord
  const u = new URL(url); const cid = u.searchParams.get('cid');
  assert.equal(u.pathname, '/auth/start'); await realFetch(base + '/auth/callback?code=c&state=' + cid); } });
const dataDir = mkdtempSync(join(tmpdir(), 'cftd-'));
let A = mk(dataDir), ok = 0;
const T = async (n, f) => { try { await f(); ok++; console.log('ok  ', n); } catch (e) { console.log('FAIL', n, '\n', e); process.exitCode = 1; } };

// Key ausstellen (als Admin, ueber Interaktion)
async function adminKey(plan) {
  const raw = JSON.stringify({ type: 2, channel_id: 'x', data: { name: 'key', options: [{ name: 'plan', value: plan }, { name: 'user', value: 'U1' }] }, member: { user: { id: 'ADMIN' } } });
  const ts = String(Date.now()); const s = sign(null, Buffer.from(ts + raw), disc.privateKey).toString('hex');
  const r = await realFetch(base + '/interactions', { method: 'POST', body: raw, headers: { 'x-signature-ed25519': s, 'x-signature-timestamp': ts } });
  return (await r.json()).data.content.match(/[A-Z0-9]{4}(-[A-Z0-9]{4}){3}/)[0];
}
await T('Start: nicht verbunden, nicht gueltig', async () => { const s = await A.state(); assert.equal(s.connected, false); assert.equal(s.valid, false); assert.equal(s.required, true); });
await T('Discord verbinden', async () => { const s = await A.login(); assert.equal(s.connected, true); assert.equal(s.user.id, 'U1'); assert.equal(s.valid, false); });
let KEY;
await T('falscher Key abgelehnt', async () => { const s = await A.activate('AAAA-BBBB-CCCC-DDDD'); assert.equal(s.valid, false); assert.match(s.error, /nicht gefunden/); });
await T('echter Key aktiviert, Ticket gueltig', async () => { KEY = await adminKey('week'); const s = await A.activate(KEY); assert.equal(s.valid, true, JSON.stringify(s)); assert.ok(s.keyExp > Date.now() / 1000 + 6 * 86400); });
await T('Zustand ueberlebt Neustart (gespeichert)', async () => { const B = mk(dataDir); assert.equal((await B.state()).valid, true); });
await T('anderer PC (andere Geraete-ID) ist ungueltig', async () => { const B = mk(dataDir); await B._dev(); const st = JSON.parse(readFileSync(join(dataDir, 'license.json'), 'utf8')); const C = create({ userDataDir: dataDir, appDir, openExternal: async () => {}, now: () => Math.floor(Date.now() / 1000) }); /* gleiche Maschine => gueltig; Ticket-Pruefung mit fremdem dev */ assert.equal(C._checkTicket(st.ticket, 'fremd'), null); });
await T('Refresh klappt; Rolle weg -> Ticket verworfen', async () => { assert.equal((await A.refresh()).valid, true); members.U1.roles = []; const s = await A.refresh(); assert.equal(s.valid, false); assert.match(s.error, /Rolle/); members.U1.roles = ['ROLE']; });
await T('Offline: gueltiges Ticket bleibt', async () => { const s0 = await A.activate(KEY); assert.equal(s0.valid, true); const B = create({ userDataDir: dataDir, appDir, openExternal: async () => {}, fetchImpl: async () => { throw new Error('offline'); } }); assert.equal((await B.refresh()).valid, true); });
await T('Ablauf: Ticket nach exp ungueltig', async () => { const B = create({ userDataDir: dataDir, appDir, openExternal: async () => {}, now: () => Math.floor(Date.now() / 1000) + 8 * 86400 }); assert.equal((await B.state()).valid, false); });
await T('Logout loescht alles', async () => { const s = await A.logout(); assert.equal(s.connected, false); assert.equal(s.valid, false); });
srv.close(); console.log(`\n${ok} E2E-Tests bestanden`);
