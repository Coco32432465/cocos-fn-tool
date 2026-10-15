// Patchnotes automatisch in den Discord-Kanal posten.
// Quelle: app/patchnotes.js im oeffentlichen GitHub-Repo. Jede Version wird genau einmal gepostet
// (Pruefung ueber die letzten Nachrichten im Kanal), daher ist der Aufruf beliebig oft ungefaehrlich.
import { dapi } from './discord.js';
import { COL, DEFAULT_ICON } from './util.js';

const SRC = 'https://raw.githubusercontent.com/Coco32432465/cocos-fn-tool/main/app/patchnotes.js';
const baseCh = n => String(n).toLowerCase().replace(/^[^a-z0-9]+/, '');
const cmpV = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

export function parsePatchnotes(src) {
  const out = [], re = /\{\s*v:\s*'([\d.]+)'\s*,\s*date:\s*'([^']*)'\s*,\s*tag:\s*'([^']*)'\s*,\s*text:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src))) out.push({ v: m[1], date: m[2], tag: m[3], text: m[4].replace(/\\(.)/g, '$1') });
  return out.sort((a, b) => cmpV(b.v, a.v));
}

// Text in Stichpunkte: pro Satz eine Zeile
export function bullets(text) {
  const parts = String(text).split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"])/).map(s => s.trim()).filter(Boolean);
  return parts.map(s => '• ' + s).join('\n').slice(0, 3800);
}

export function patchEmbed(env, n) {
  const e = {
    title: `🧩 Cocos Tool v${n.v}`,
    description: bullets(n.text),
    color: n.tag === 'FIX' ? COL.ok : COL.brand,
    footer: { text: `Cocos Tool · v${n.v} · ${n.tag}` },
    timestamp: /^\d{4}-\d{2}-\d{2}$/.test(n.date) ? new Date(n.date + 'T12:00:00Z').toISOString() : new Date().toISOString()
  };
  if (env.ICON_URL !== '-') e.thumbnail = { url: env.ICON_URL || DEFAULT_ICON };
  return e;
}

export async function postPatchnotes(env, src, max = 3) {
  const notes = parsePatchnotes(src);
  if (!notes.length) return { ok: false, reason: 'keine Eintraege gefunden' };
  const chans = (await dapi(env, 'GET', `/guilds/${env.GUILD_ID}/channels`)).data || [];
  const ch = chans.find(c => c.type === 0 && baseCh(c.name) === 'patchnotes');
  if (!ch) return { ok: false, reason: 'Kanal "patchnotes" fehlt (bitte /setup ausfuehren)' };
  const hist = (await dapi(env, 'GET', `/channels/${ch.id}/messages?limit=50`)).data || [];
  const posted = new Set();
  hist.forEach(m => (m.embeds || []).forEach(e => { const x = /v(\d+\.\d+\.\d+)/.exec((e.footer && e.footer.text) || ''); if (x) posted.add(x[1]); }));
  // nur Versionen, die neuer sind als alles Gepostete (beim ersten Mal nur die neueste)
  const newest = [...posted].sort(cmpV).pop();
  let todo = notes.filter(n => !posted.has(n.v) && (!newest || cmpV(n.v, newest) > 0));
  if (!newest) todo = todo.slice(0, 1);
  todo = todo.slice(0, max).reverse(); // aelteste zuerst
  const sent = [];
  for (const n of todo) {
    const r = await dapi(env, 'POST', `/channels/${ch.id}/messages`, { embeds: [patchEmbed(env, n)] });
    if (r.ok) sent.push(n.v);
  }
  return { ok: true, sent };
}

export async function syncPatchnotes(env) {
  const r = await fetch(env.PATCHNOTES_URL || SRC, { headers: { 'cache-control': 'no-cache' } });
  if (!r.ok) return { ok: false, reason: 'GitHub ' + r.status };
  return postPatchnotes(env, await r.text());
}
