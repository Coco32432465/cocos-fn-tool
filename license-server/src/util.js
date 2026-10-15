// Gemeinsame Helfer: Zeit, Kodierung, Key-Erzeugung, Darstellung (Embeds in Schwarz-Blau #1E6BFF).
export const now = () => Math.floor(Date.now() / 1000);
export const enc = new TextEncoder();
export const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', ...h } });
export const hex2u8 = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
export const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b642u8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const rnd = n => crypto.getRandomValues(new Uint8Array(n));
export async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const PLANS = { week: { days: 7, label: '1 Woche' }, month: { days: 30, label: '1 Monat' } };
export const KEY_RE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){2,3}$/; // neu: XXXX-XXXX-XXXX, aeltere 4er-Keys bleiben gueltig
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 Zeichen, ohne 0/O/1/I
export function newKey() {
  const ch = [...rnd(12)].map(b => KEY_CHARS[b % 32]).join('');
  return ch.match(/.{4}/g).join('-');
}
export const normKey = k => String(k || '').trim().toUpperCase();

const TZ = 'Europe/Berlin';
export const fmtDate = ts => new Date(ts * 1000).toLocaleDateString('de-DE', { timeZone: TZ });
export const fmtDateTime = ts => new Date(ts * 1000).toLocaleString('de-DE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
export const price = (env, planId) => (planId === 'week' ? env.PRICE_WEEK : env.PRICE_MONTH) || '';

/* ---------- Embeds ---------- */
export const COL = { brand: 0x1e6bff, ok: 0x2ecc71, bad: 0xe5484d, neutral: 0x4f545c };
export const DEFAULT_ICON = 'https://raw.githubusercontent.com/Coco32432465/cocos-fn-tool/main/app/icon.png';
export function emb(env, o) {
  const e = { title: o.title, color: o.color == null ? COL.brand : o.color, footer: { text: "Coco's Fn Tool" }, timestamp: new Date().toISOString() };
  if (o.desc) e.description = o.desc;
  if (o.fields) e.fields = o.fields;
  if (env.ICON_URL !== '-') e.thumbnail = { url: env.ICON_URL || DEFAULT_ICON };
  return e;
}
export const eph = (env, o) => ({ type: 4, data: { embeds: [emb(env, o)], flags: 64 } });
export const bad = (env, title, desc) => eph(env, { title, desc, color: COL.bad });
export const noPerm = env => bad(env, 'Keine Berechtigung', 'Dieser Befehl ist dem Team vorbehalten.');
