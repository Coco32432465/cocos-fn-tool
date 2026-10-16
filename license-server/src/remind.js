// Erinnerung 3 Tage vor Ablauf: DM mit Button "Verlaengern" (oeffnet direkt ein Verlaengerungs-Ticket).
import { now, emb, COL, fmtDate, PLAN_ALL } from './util.js';
import { tryDM } from './discord.js';

export const RENEW_BUTTON = [{ type: 1, components: [{ type: 2, style: 1, label: 'Jetzt verlängern', custom_id: 'renew_open', emoji: { name: '🔁' } }] }];

export function reminderPayload(env, row) {
  const left = Math.max(1, Math.ceil((row.expires_at - now()) / 86400));
  return { embeds: [emb(env, {
    title: '⏰ Deine Lizenz läuft bald ab', color: 0xf1c40f,
    desc: `Deine Cocos-Tool-Lizenz endet in **${left} Tag${left === 1 ? '' : 'en'}**. Verlängere **vor Ablauf** und du bekommst **+1 Bonustag** geschenkt.`,
    fields: [
      { name: 'Läuft ab am', value: `**${fmtDate(row.expires_at)}**`, inline: true },
      { name: 'Aktuelle Laufzeit', value: (PLAN_ALL[row.plan] || {}).label || row.plan, inline: true },
      { name: 'So geht’s', value: 'Klicke auf **Jetzt verlängern**. Es öffnet sich ein Ticket mit dem PayPal-Link. Nach der Zahlung schickst du dort einen Screenshot, das Team verlängert deine Lizenz.' }
    ] })], components: RENEW_BUTTON };
}

// Kostenlose Cloudflare-Version: wenige Nutzer je Lauf, der Rest beim naechsten Stundenlauf.
export async function remindSweep(env, max = 8) {
  const t = now();
  const rows = (await env.DB.prepare("SELECT * FROM keys WHERE status='active' AND reminded=0 AND discord_id IS NOT NULL AND plan NOT IN ('test','trial','lifetime') AND expires_at>? AND expires_at<=? ORDER BY expires_at LIMIT ?").bind(t, t + 3 * 86400, max).all()).results || [];
  let n = 0;
  for (const r of rows) {
    const later = await env.DB.prepare("SELECT 1 AS x FROM keys WHERE discord_id=? AND status='active' AND expires_at>?").bind(r.discord_id, t + 3 * 86400).first();
    if (!later) { await tryDM(env, r.discord_id, reminderPayload(env, r)); n++; }
    await env.DB.prepare('UPDATE keys SET reminded=1 WHERE key=?').bind(r.key).run();
  }
  return n;
}
