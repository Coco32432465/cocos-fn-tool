// Wachstum: Probe-Key, Ticket-Bewertung, Belohnungs-Formular fuers Team.
import { now, emb, eph, bad, COL, PLAN_ALL } from './util.js';
import { dapi, tryDM, isTeam, isCodeManager } from './discord.js';
import { createKeys } from './keys.js';
import { grantDays } from './codes.js';
import { hit } from './auth.js';

/* ---------- Probe-Key: 1 Tag gratis, einmal pro Person ---------- */
export async function startTrial(i, env, uid) {
  if (!(await hit(env, 'trial:' + uid, 3, 3600))) return bad(env, 'Zu viele Versuche', 'Bitte warte kurz.');
  const had = await env.DB.prepare('SELECT 1 AS x FROM trials WHERE user_id=?').bind(uid).first();
  if (had) return bad(env, 'Probe schon genutzt', 'Jede Person kann die Probe einmal nutzen. Hol dir gern eine Lizenz über **Key kaufen**.');
  const owned = await env.DB.prepare("SELECT 1 AS x FROM keys WHERE discord_id=? AND status<>'unused'").bind(uid).first();
  if (owned) return bad(env, 'Du hattest schon eine Lizenz', 'Die Probe ist für neue Nutzer gedacht. Verlängern geht über **Key kaufen**.');
  const [key] = await createKeys(env, 'trial', 1, 'trial');
  await env.DB.prepare('INSERT INTO trials (user_id,key,created_at) VALUES (?,?,?)').bind(uid, key, now()).run();
  return eph(env, { title: '🎁 Dein Probe-Key (1 Tag)', color: COL.ok, desc: '```\n' + key + '\n```',
    fields: [{ name: 'So geht’s', value: '1. App laden (Kanal **download**)\n2. **Mit Discord verbinden**\n3. Key eingeben. Die 24 Stunden starten erst beim Einlösen.' }, { name: 'Gefällt dir das Tool?', value: 'Im Kanal **key-kaufen** gibt es Wochen- und Monatslizenzen.' }] });
}

/* ---------- Ticket-Bewertung ---------- */
const STARS = (ch, done) => [{ type: 1, components: [1, 2, 3, 4, 5].map(n => ({ type: 2, style: 2, label: '⭐ ' + n, custom_id: `rate:${n}:${ch}`, disabled: !!done })) }];
export const askRating = (env, uid, ch, typeLabel) => tryDM(env, uid, { embeds: [emb(env, { title: 'Wie war dein Ticket?', desc: `Danke, dass du dich gemeldet hast. Gib dem Support kurz eine Bewertung (${typeLabel}). Das dauert nur einen Klick.` })], components: STARS(ch) });

export async function rate(i, env, uid, n, ch) {
  const stars = Number(n);
  if (!(stars >= 1 && stars <= 5)) return bad(env, 'Ungültige Bewertung', '');
  await env.DB.prepare('INSERT OR IGNORE INTO ratings (channel_id,user_id,stars,created_at) VALUES (?,?,?,?)').bind(String(ch), uid, stars, now()).run();
  return { type: 7, data: { embeds: [emb(env, { title: 'Danke für deine Bewertung!', color: COL.ok, desc: `Du hast **${stars} von 5 Sternen** vergeben. Das hilft uns, besser zu werden.` })], components: [] } };
}

export async function ratingSummary(env) {
  const r = (await env.DB.prepare('SELECT COUNT(*) AS n, AVG(stars) AS a FROM ratings').first()) || {};
  return r.n ? `⭐ **${(Math.round(r.a * 10) / 10).toLocaleString('de-DE')}** von 5 (${r.n} Bewertung${r.n === 1 ? '' : 'en'})` : 'noch keine Bewertungen';
}

/* ---------- Belohnung per Formular (z. B. fuer umgesetzte Vorschlaege) ---------- */
const mrow = (id, label, style, max, ph, req = true) => ({ type: 1, components: [{ type: 4, custom_id: id, label, style, max_length: max, required: req, placeholder: ph }] });
const mval = (i, id) => { for (const r of i.data.components || []) for (const c of r.components || []) if (c.custom_id === id) return String(c.value || '').trim(); return ''; };
export const openRewardModal = () => ({ type: 9, data: { custom_id: 'modal_reward', title: 'Belohnung vergeben', components: [
  mrow('f_user', 'Wer? (@Erwähnung oder Discord-ID)', 1, 60, 'z. B. @Coco oder 123456789012345678'),
  mrow('f_days', 'Bonus-Tage (1 bis 30)', 1, 3, '3'),
  mrow('f_why', 'Grund (steht in der Nachricht an den Nutzer)', 2, 200, 'z. B. Dein Vorschlag „Heatmap“ wurde umgesetzt')] } });

export async function submitReward(i, env, uid) {
  if (!isTeam(env, i) && !isCodeManager(env, i)) return bad(env, 'Keine Berechtigung', 'Belohnungen vergibt das Team.');
  const raw = mval(i, 'f_user'), m = raw.match(/^<@!?(\d{15,22})>$/) || raw.match(/^(\d{15,22})$/);
  if (!m) return bad(env, 'Nutzer nicht erkannt', 'Gib die @Erwähnung oder Discord-ID an (Rechtsklick, „ID kopieren“).');
  const d = Number(mval(i, 'f_days').replace(',', '.'));
  if (!(d >= 1 && d <= 30)) return bad(env, 'Tage ungültig', 'Bitte 1 bis 30 Tage.');
  const why = mval(i, 'f_why').slice(0, 200) || 'Danke für deine Unterstützung!';
  await grantDays(env, m[1], d, '🎁 Belohnung vom Team', `**+${d} Bonus-Tag${d === 1 ? '' : 'e'}**\n${why}`);
  await env.DB.prepare('INSERT INTO reward_log (user_id,days,reason,by_id,created_at) VALUES (?,?,?,?,?)').bind(m[1], d, why, uid, now()).run();
  return eph(env, { title: 'Belohnung vergeben', color: COL.ok, desc: `<@${m[1]}> bekommt **+${d} Tage**.` });
}
