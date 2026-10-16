// Gemeinsame Test-Helfer: D1-Nachbau (node:sqlite) und ein zustandsbehafteter Discord-Mock.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
const rd = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

export function makeDb(sqlFiles) {
  const db = new DatabaseSync(':memory:');
  for (const f of sqlFiles) db.exec(rd(f));
  const D1 = { prepare(sql) { const st = db.prepare(sql); let a = []; const o = { bind(...x) { a = x; return o; }, async first() { return st.get(...a) || null; }, async all() { return { results: st.all(...a) }; }, async run() { const r = st.run(...a); return { meta: { changes: Number(r.changes) } }; } }; return o; } };
  return { db, D1 };
}

export function makeEnv(D1) {
  const sig = generateKeyPairSync('ed25519'), disc = generateKeyPairSync('ed25519');
  return {
    sig, disc,
    env: { DB: D1, DISCORD_APP_ID: '111', DISCORD_PUBLIC_KEY: disc.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'), GUILD_ID: 'G', CUSTOMER_ROLE_ID: 'ROLE', TICKET_CATEGORY_ID: 'CAT', PANEL_CHANNEL_ID: 'KEYCH', ADMIN_USER_IDS: 'ADMIN', BOT_TOKEN: 'b', CLIENT_SECRET: 's', SETUP_SECRET: 'sec', PRICE_WEEK: '5 €', PRICE_MONTH: '15 €', SIGNING_KEY: sig.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') }
  };
}

export function makeDiscord() {
  const S = { roles: [{ id: 'ROLE', name: 'Customer' }], channels: [{ id: 'KEYCH', name: 'key-kaufen', type: 0 }, { id: 'CAT', name: 'Tickets', type: 4 }], msgs: {}, members: { U1: { roles: [] }, U2: { roles: [] } }, dms: [], deleted: [], files: [], calls: 0, n: 100, patched: [] };
  const real = globalThis.fetch;
  const R = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return real(url, opt);
    if (u.startsWith('https://api.github.com/repos/') && u.endsWith('/releases/latest')) return new Response(JSON.stringify({ tag_name: 'v9.9.9', html_url: 'https://github.com/x/y/releases/tag/v9.9.9', published_at: '2026-10-15T10:00:00Z', assets: [{ name: 'Setup.exe', browser_download_url: 'https://github.com/x/y/releases/download/v9.9.9/Setup.exe' }] }), { status: 200 });
    const m = opt.method || 'GET', p = u.replace('https://discord.com/api/v10', ''); S.calls++;
    let x;
    if (m === 'GET' && p === '/guilds/G/roles') return R(S.roles);
    if (m === 'POST' && p === '/guilds/G/roles') { const b = JSON.parse(opt.body); const r = { id: 'R' + (++S.n), ...b }; S.roles.push(r); return R(r); }
    if (m === 'GET' && p === '/guilds/G/channels') return R(S.channels);
    if (m === 'POST' && p === '/guilds/G/channels') { const b = JSON.parse(opt.body); const c = { id: 'C' + (++S.n), ...b }; S.channels.push(c); return R(c); }
    if (m === 'PATCH' && (x = p.match(/^\/channels\/(\w+)$/))) { const c = S.channels.find(c => c.id === x[1]); Object.assign(c, JSON.parse(opt.body)); S.chPatched = (S.chPatched || 0) + 1; return R(c); }
    if (m === 'DELETE' && (x = p.match(/^\/channels\/(\w+)$/))) { S.deleted.push(x[1]); S.channels = S.channels.filter(c => c.id !== x[1]); return R({}); }
    if (m === 'DELETE' && (x = p.match(/^\/channels\/(\w+)\/messages\/(\w+)$/))) { S.msgs[x[1]] = (S.msgs[x[1]] || []).filter(q => q.id !== x[2]); return new Response(null, { status: 204 }); }
    if (m === 'PATCH' && (x = p.match(/^\/channels\/(\w+)\/messages\/(\w+)$/))) { const msg = (S.msgs[x[1]] || []).find(q => q.id === x[2]); if (!msg) return R({}, 404); const b = JSON.parse(opt.body); if (b.embeds) msg.embeds = b.embeds; if (b.components) msg.components = b.components; S.edited = (S.edited || 0) + 1; return R(msg); }
    if ((x = p.match(/^\/channels\/(\w+)\/messages(\?.*)?$/))) {
      const id = x[1];
      if (m === 'GET') return R([...(S.msgs[id] || [])].reverse());
      let b, file = null;
      if (opt.body instanceof FormData) { b = JSON.parse(opt.body.get('payload_json')); file = await opt.body.get('files[0]').text(); S.files.push({ ch: id, text: file, name: opt.body.get('files[0]').name }); }
      else b = JSON.parse(opt.body);
      const msg = { id: String(++S.n), timestamp: new Date().toISOString(), content: b.content || '', embeds: b.embeds || [], components: b.components, attachments: [], author: { id: '111', username: 'Bot', bot: true } };
      (S.msgs[id] ||= []).push(msg); return R(msg);
    }
    if ((x = p.match(/^\/guilds\/G\/members\/(\w+)\/roles\/(\w+)$/))) { const mm = S.members[x[1]] ||= { roles: [] }; m === 'PUT' ? (mm.roles.includes(x[2]) || mm.roles.push(x[2])) : (mm.roles = mm.roles.filter(r => r !== x[2])); return new Response(null, { status: 204 }); }
    if ((x = p.match(/^\/guilds\/G\/members\/(\w+)$/))) return S.members[x[1]] ? R({ roles: S.members[x[1]].roles }) : R({}, 404);
    if (p === '/users/@me/channels') { const b = JSON.parse(opt.body); return R({ id: 'DM' + b.recipient_id }); }
    if (p.includes('/applications/') && p.endsWith('/commands')) return R([]);
    if (p.includes('/webhooks/')) { S.patched.push(JSON.parse(opt.body)); return R({}); }
    if (p === '/oauth2/token') return R({ access_token: 'at' });
    if (p === '/users/@me') return R({ id: 'U1', username: 'tester', global_name: 'Tester' });
    return R({}, 404);
  };
  // DMs mitschneiden: Nachrichten an DM-Kanaele
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => { const mm = String(url).match(/\/channels\/(DM\w+)\/messages/); if (mm && opt.method === 'POST') S.dms.push({ to: mm[1].slice(2), body: JSON.parse(opt.body) }); return orig(url, opt); };
  S.restore = () => { globalThis.fetch = real; };
  return S;
}

export function signer(disc) {
  return body => { const raw = JSON.stringify(body), ts = String(Date.now()); return { raw, headers: { 'x-signature-ed25519': sign(null, Buffer.from(ts + raw), disc.privateKey).toString('hex'), 'x-signature-timestamp': ts } }; };
}
