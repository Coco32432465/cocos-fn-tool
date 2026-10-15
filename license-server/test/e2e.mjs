// Ende-zu-Ende: App-Modul license.js  <->  Worker (lokal per HTTP), Discord gemockt.
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeDb, makeEnv, makeDiscord, signer } from './mock.mjs';
const require = createRequire(import.meta.url);
const { create } = require('../../license.js');

const { D1 } = makeDb(['schema.sql']);
const { sig, disc, env } = makeEnv(D1);
const S = makeDiscord(); const members = S.members; const realFetch = globalThis.fetch;
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
  const body = { type: 2, channel_id: 'x', token: 't', data: { name: 'key', options: [{ type: 1, name: 'erstellen', options: [{ name: 'dauer', value: plan }] }] }, member: { user: { id: 'ADMIN' }, roles: [] } };
  const sg = signer(disc)(body);
  const r = await realFetch(base + '/interactions', { method: 'POST', body: sg.raw, headers: sg.headers });
  return JSON.stringify((await r.json()).data).match(/[A-Z0-9]{4}(-[A-Z0-9]{4}){2}/)[0];
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
