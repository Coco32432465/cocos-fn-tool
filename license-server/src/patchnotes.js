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

// Text in Stichpunkte: pro Satz eine Zeile, mit passendem Emoji
const ICONS = [
  [/fix|behoben|korrekt|nicht mehr|stabil/i, '🛠️'], [/karte|landeort|landepunkt|gelände/i, '🗺️'], [/kalender|cup|turnier/i, '📅'],
  [/leben|schild|heil|hp/i, '❤️'], [/fight|kampf|treffer|gegner/i, '⚔️'], [/design|layout|menü|farb|theme|aussehen/i, '🎨'],
  [/discord|bot|key|lizenz/i, '💬'], [/patchnotes|news/i, '📰'], [/solo|duo|trio|squad|modus/i, '🎮'], [/tipp|analyse|bewert|note/i, '🧠']
];
const iconFor = t => { for (const [re, ic] of ICONS) if (re.test(t)) return ic; return '✨'; };
export function bullets(text) {
  const parts = String(text).split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"])/).map(s => s.trim()).filter(Boolean);
  return parts.map(s => `${iconFor(s)} ${s}`).join('\n\n').slice(0, 3800);
}

const TAGS = { NEU: ['🆕 Neues Update', 0x1e6bff], FIX: ['🛠️ Fehlerbehebung', 0x2ecc71], FEATURE: ['🚀 Neues Feature', 0x8b5cf6], UPDATE: ['📦 Update', 0x1e6bff] };

export function patchEmbed(env, n) {
  const [label, color] = TAGS[n.tag] || ['🆕 Update', COL.brand];
  const ts = /^\d{4}-\d{2}-\d{2}$/.test(n.date) ? Math.floor(Date.parse(n.date + 'T12:00:00Z') / 1000) : Math.floor(Date.now() / 1000);
  const e = {
    author: { name: 'COCOS TOOL · PATCHNOTES', icon_url: env.ICON_URL && env.ICON_URL !== '-' ? env.ICON_URL : DEFAULT_ICON },
    title: `⚡ Version ${n.v} ist da!`,
    description: `**${label}**\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n${bullets(n.text)}\n\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
    color,
    fields: [
      { name: '🏷️ Version', value: `\`v${n.v}\``, inline: true },
      { name: '📆 Datum', value: `<t:${ts}:D>`, inline: true },
      { name: '⬇️ Update', value: 'Lädt die App automatisch', inline: true }
    ],
    footer: { text: `Cocos Tool · v${n.v} · ${n.tag}` },
    timestamp: new Date(ts * 1000).toISOString()
  };
  if (env.ICON_URL !== '-') e.thumbnail = { url: env.ICON_URL || DEFAULT_ICON };
  return e;
}

// Kanal "patchnotes" finden oder (falls /setup noch nicht lief) selbst anlegen
async function ensureChannel(env) {
  const chans = (await dapi(env, 'GET', `/guilds/${env.GUILD_ID}/channels`)).data || [];
  const ex = chans.find(c => c.type === 0 && baseCh(c.name) === 'patchnotes');
  if (ex) return ex;
  const ann = chans.find(c => c.type === 0 && baseCh(c.name) === 'announcements') || chans.find(c => c.type === 0 && baseCh(c.name) === 'rules');
  const body = { name: '🧩│patchnotes', type: 0, topic: 'Patchnotes zu Cocos Tool – neue Versionen erscheinen hier automatisch' };
  if (ann) { body.parent_id = ann.parent_id; body.permission_overwrites = ann.permission_overwrites; }
  const r = await dapi(env, 'POST', `/guilds/${env.GUILD_ID}/channels`, body);
  return r.ok ? r.data : null;
}

export async function postPatchnotes(env, src, max = 3) {
  const notes = parsePatchnotes(src);
  if (!notes.length) return { ok: false, reason: 'keine Eintraege gefunden' };
  const ch = await ensureChannel(env);
  if (!ch) return { ok: false, reason: 'Kanal "patchnotes" fehlt und konnte nicht angelegt werden (Bot-Rechte: Kanäle verwalten)' };
  const hist = (await dapi(env, 'GET', `/channels/${ch.id}/messages?limit=50`)).data || [];
  const posted = new Set();
  hist.forEach(m => (m.embeds || []).forEach(e => { const x = /v(\d+\.\d+\.\d+)/.exec((e.footer && e.footer.text) || ''); if (x) posted.add(x[1]); }));
  // nur Versionen, die neuer sind als alles Gepostete (beim ersten Mal die letzten drei)
  const newest = [...posted].sort(cmpV).pop();
  let todo = notes.filter(n => !posted.has(n.v) && (!newest || cmpV(n.v, newest) > 0));
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
