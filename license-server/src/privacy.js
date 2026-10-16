// Datenschutz: Auskunft ("welche Daten hat der Bot?") und Loeschung per Button. Keys und Verkaeufe bleiben (Aufbewahrungspflicht).
import { now, emb, eph, bad, COL, fmtDate } from './util.js';

const cnt = async (env, sql, ...b) => ((await env.DB.prepare(sql).bind(...b).first()) || {}).n || 0;
const ROWS = [{ type: 1, components: [{ type: 2, style: 4, label: 'Meine Daten löschen', custom_id: 'privacy_ask', emoji: { name: '🗑️' } }] }];
const CONFIRM = [{ type: 1, components: [{ type: 2, style: 4, label: 'Ja, endgültig löschen', custom_id: 'privacy_do' }, { type: 2, style: 2, label: 'Abbrechen', custom_id: 'privacy_no' }] }];

export const PRIVACY_FIELDS = [
  { name: 'Was wir speichern', value: '• **Discord-ID und -Name** (beim Verbinden mit Discord, nur Kennung, keine E-Mail, keine Freunde)\\n• **Keys**: Laufzeit, Gerätebindung (anonyme Geräte-Kennung), Zeitpunkt der letzten Nutzung\\n• **App**: Version und „zuletzt online“ (Lebenszeichen alle paar Minuten)\\n• **Rangliste** nur, wenn du freiwillig teilnimmst: Name, Ø Note, Runden, Siege, Kills\\n• **Tickets**: Chatverlauf als Transkript für das Team, Zahlungsnachweise\\n• Umfragestimmen, Giveaway-Teilnahmen, Erinnerungen, Creator-Codes' },
  { name: 'Was NICHT passiert', value: 'Deine Replays und Analysen bleiben **lokal auf deinem PC**. Wir lesen keine Epic-Zugangsdaten, keine Nachrichten außerhalb des Bots und verkaufen nichts an Dritte.' },
  { name: 'Wofür', value: 'Lizenzprüfung und Support (Vertragserfüllung), Missbrauchsschutz und Statistiken für das Team (berechtigtes Interesse), Rangliste und Community-Funktionen (deine Einwilligung).' },
  { name: 'Dienstleister', value: 'Discord (Server, Login), Cloudflare (Hosting des Lizenz-Servers, Datenbank), GitHub (App-Updates), PayPal (Zahlung, läuft direkt zwischen dir und uns).' },
  { name: 'Speicherdauer', value: 'Konto- und Appdaten bis du sie löschst oder die Lizenz endet und du dich meldest. Zahlungs- und Key-Daten bleiben wegen gesetzlicher Aufbewahrungspflichten (bis zu 10 Jahre). Ticket-Transkripte werden nach Abschluss nicht für andere Zwecke genutzt.' },
  { name: 'Deine Rechte', value: 'Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Beschwerde bei einer Datenschutzbehörde. Auskunft und Löschung machst du selbst mit **`/datenschutz`**. Verantwortlicher: siehe Impressum.' }
].map(f => ({ ...f, value: f.value.replace(/\\n/g, '\n') }));

export const handlePrivacy = async (i, env, uid) => {
  const [keys, sess, rank, votes, rem, gw, codes, tick] = await Promise.all([
    cnt(env, 'SELECT COUNT(*) AS n FROM keys WHERE discord_id=?', uid), cnt(env, 'SELECT COUNT(*) AS n FROM sessions WHERE discord_id=?', uid),
    cnt(env, 'SELECT COUNT(*) AS n FROM ranks WHERE discord_id=?', uid), cnt(env, 'SELECT COUNT(*) AS n FROM poll_votes WHERE user_id=?', uid),
    cnt(env, 'SELECT COUNT(*) AS n FROM reminders WHERE user_id=?', uid), cnt(env, 'SELECT COUNT(*) AS n FROM gw_entries WHERE user_id=?', uid),
    cnt(env, 'SELECT COUNT(*) AS n FROM codes WHERE owner=?', uid), cnt(env, 'SELECT COUNT(*) AS n FROM tickets WHERE user_id=?', uid)]);
  return { type: 4, data: { flags: 64, embeds: [emb(env, { title: '🔒 Deine gespeicherten Daten', color: COL.brand,
    desc: 'Das hat der Bot aktuell zu deinem Discord-Konto gespeichert. Die vollständige Erklärung steht im Kanal **datenschutz**.',
    fields: [{ name: 'Lizenz-Keys', value: `${keys} (bleiben wegen Aufbewahrungspflicht)`, inline: true }, { name: 'App-Verbindungen', value: String(sess), inline: true }, { name: 'Rangliste', value: rank ? 'ja' : 'nein', inline: true },
      { name: 'Umfragestimmen', value: String(votes), inline: true }, { name: 'Erinnerungen', value: String(rem), inline: true }, { name: 'Giveaway-Teilnahmen', value: String(gw), inline: true },
      { name: 'Offene Tickets', value: String(tick), inline: true }, { name: 'Creator-Codes', value: String(codes), inline: true },
      { name: 'Löschen', value: 'Der Button entfernt App-Verbindungen (die App fragt dich dann nach einer neuen Verbindung), Rangliste, Stimmen, Giveaway-Teilnahmen und Erinnerungen. Keys und Zahlungen bleiben gespeichert, solange das Gesetz es verlangt.' }] })], components: ROWS } };
};

export const askDelete = env => ({ type: 4, data: { flags: 64, embeds: [emb(env, { title: 'Wirklich löschen?', color: COL.bad, desc: 'Das lässt sich nicht rückgängig machen. Deine App-Verbindung wird getrennt und du verlierst deinen Rangplatz.' })], components: CONFIRM } });

export async function doDelete(i, env, uid) {
  for (const [sql, ...b] of [
    ['DELETE FROM sessions WHERE discord_id=?', uid], ['DELETE FROM logins WHERE discord_id=?', uid], ['DELETE FROM ranks WHERE discord_id=?', uid], ['DELETE FROM team_members WHERE user_id=?', uid],
    ['DELETE FROM poll_votes WHERE user_id=?', uid], ['DELETE FROM gw_entries WHERE user_id=?', uid], ['DELETE FROM reminders WHERE user_id=?', uid],
    ['UPDATE keys SET last_seen=NULL WHERE discord_id=?', uid]]) { await env.DB.prepare(sql).bind(...b).run().catch(() => {}); }
  return { type: 7, data: { embeds: [emb(env, { title: '✅ Daten gelöscht', color: COL.ok, desc: 'App-Verbindungen, Rangliste, Stimmen, Giveaway-Teilnahmen und Erinnerungen sind entfernt. Für ein Ticket-Transkript oder weitere Anliegen öffne bitte ein Support-Ticket.' })], components: [] } };
}
export const cancelDelete = env => ({ type: 7, data: { embeds: [emb(env, { title: 'Abgebrochen', color: COL.neutral, desc: 'Es wurde nichts gelöscht.' })], components: [] } });
