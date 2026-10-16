// Creator-Codes: Kaeufer geben im Kauf-Ticket einen Code ein. Keine Rabatte (Preise sind schon niedrig), sondern Bonus-Tage:
// der Kaeufer bekommt Extra-Tage, der Code-Inhaber (z. B. ein Creator) Belohnungs-Tage pro Kauf.
import { now, emb, eph, bad, COL, fmtDate } from './util.js';
import { dapi, tryDM, isAdmin } from './discord.js';
import { addRole } from './discord.js';

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
export const rewards = env => ({ buyer: num(env.CODE_BUYER_BONUS, 1), owner: { week: num(env.CODE_OWNER_WEEK, 1), month: num(env.CODE_OWNER_MONTH, 3) } });
export const normCode = c => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
const days = n => `${n} Tag${n === 1 ? '' : 'e'}`;

export const codeInfoText = (env, code, owner, plan) => {
  const r = rewards(env);
  return `Code **${code}** von <@${owner}>: du bekommst **+${days(r.buyer)}** extra${plan ? '' : ''}, der Code-Inhaber bekommt eine Belohnung.`;
};

export const openCodeModal = () => ({ type: 9, data: { custom_id: 'modal_code', title: 'Creator-Code eingeben', components: [
  { type: 1, components: [{ type: 4, custom_id: 'f_code', label: 'Code', style: 1, min_length: 2, max_length: 16, required: true, placeholder: 'z. B. COCO' }] }] } });

// Code fuer dieses Ticket pruefen und speichern. Gibt { ok, code, owner } oder { error }
export async function attachCode(env, ticket, uid, raw) {
  const code = normCode(raw);
  if (!ticket || (ticket.type !== 'buy' && ticket.type !== 'renew')) return { error: 'Codes gelten nur in Kauf- und Verlängerungs-Tickets.' };
  if (ticket.paid) return { error: 'Die Zahlung ist schon bestätigt, ein Code ist nicht mehr möglich.' };
  if (code.length < 2) return { error: 'Bitte gib einen gültigen Code ein.' };
  const row = await env.DB.prepare('SELECT * FROM codes WHERE code=?').bind(code).first();
  if (!row) return { error: `Den Code **${code}** gibt es nicht. Prüfe die Schreibweise.` };
  if (row.owner === uid) return { error: 'Den eigenen Code kannst du nicht selbst nutzen.' };
  const used = await env.DB.prepare('SELECT 1 AS x FROM code_uses WHERE user_id=?').bind(uid).first();
  if (used) return { error: 'Du hast schon einmal einen Code genutzt. Pro Person gilt ein Code, einmalig.' };
  await env.DB.prepare('UPDATE tickets SET code=? WHERE channel_id=?').bind(code, ticket.channel_id).run();
  return { ok: true, code, owner: row.owner };
}

// Beim Bestaetigen der Zahlung: Bonus fuer den Kaeufer ist schon eingerechnet (siehe tickets.js), hier die Belohnung fuer den Inhaber
export async function payOut(env, ticket, buyer) {
  const code = ticket.code; if (!code) return null;
  const row = await env.DB.prepare('SELECT * FROM codes WHERE code=?').bind(code).first();
  if (!row || row.owner === buyer) return null;
  const claim = await env.DB.prepare('INSERT OR IGNORE INTO code_uses (user_id,code,plan,created_at) VALUES (?,?,?,?)').bind(buyer, code, ticket.plan, now()).run();
  if (!(claim.meta && claim.meta.changes)) return null; // schon einmal genutzt
  const r = rewards(env), d = r.owner[ticket.plan] || 0;
  await env.DB.prepare('UPDATE codes SET uses=uses+1, earned_days=earned_days+? WHERE code=?').bind(d, code).run();
  if (!d) return { code, owner: row.owner, days: 0 };
  const t = now(), act = await env.DB.prepare("SELECT * FROM keys WHERE discord_id=? AND status='active' ORDER BY expires_at DESC LIMIT 1").bind(row.owner).first();
  let key = null, exp = null;
  if (act) {
    exp = Math.max(t, act.expires_at) + Math.round(d * 86400);
    await env.DB.prepare('UPDATE keys SET expires_at=?, role_removed=0, reminded=0 WHERE key=?').bind(exp, act.key).run();
    await addRole(env, row.owner);
  } else {
    const { newKey } = await import('./util.js'); key = newKey();
    await env.DB.prepare("INSERT INTO keys (key,plan,days,status,created_at,created_by) VALUES (?,?,?,'unused',?,?)").bind(key, 'week', d, t, 'code').run();
  }
  await tryDM(env, row.owner, { embeds: [emb(env, { title: '🎁 Dein Code wurde genutzt', color: 0xf1c40f, desc: `Jemand hat **${code}** bei einem Kauf eingelöst. Danke fürs Teilen! Belohnung: **+${days(d)}**.`,
    fields: key ? [{ name: 'Dein Key', value: '```\n' + key + '\n```' }, { name: 'Einlösen', value: 'In der App oder mit `/key einlösen`.' }] : [{ name: 'Neues Ablaufdatum', value: `**${fmtDate(exp)}**` }] })] });
  return { code, owner: row.owner, days: d };
}

export async function handleCode(i, env, uid) {
  const sub = i.data.options[0], o = n => ((sub.options || []).find(x => x.name === n) || {}).value;
  if (sub.name === 'mein') {
    const rows = (await env.DB.prepare('SELECT * FROM codes WHERE owner=?').bind(uid).all()).results || [];
    if (!rows.length) return eph(env, { title: '🎁 Dein Creator-Code', color: COL.neutral, desc: 'Du hast noch keinen Code. Als Creator bekommst du einen vom Team, schreib uns in einem Support-Ticket.' });
    const r = rewards(env);
    return eph(env, { title: '🎁 Dein Creator-Code', desc: rows.map(c => `**${c.code}** · ${c.uses} Einlösung${c.uses === 1 ? '' : 'en'} · **${days(c.earned_days)}** verdient`).join('\n'),
      fields: [{ name: 'So funktioniert es', value: `Wer **${rows[0].code}** im Kauf-Ticket eingibt, bekommt **+${days(r.buyer)}** extra. Du bekommst pro Kauf **+${days(r.owner.week)}** (1 Woche) bzw. **+${days(r.owner.month)}** (1 Monat) auf deine Lizenz.` }] });
  }
  if (!isAdmin(env, i)) return bad(env, 'Keine Berechtigung', 'Dieser Befehl ist dem Admin vorbehalten.');
  if (sub.name === 'erstellen') {
    const target = o('user'), code = normCode(o('code') || '');
    if (code.length < 3) return bad(env, 'Code ungültig', 'Der Code braucht 3 bis 16 Zeichen (Buchstaben und Zahlen).');
    if (await env.DB.prepare('SELECT 1 AS x FROM codes WHERE code=?').bind(code).first()) return bad(env, 'Code vergeben', `**${code}** gibt es schon.`);
    await env.DB.prepare('INSERT INTO codes (code,owner,created_at) VALUES (?,?,?)').bind(code, target, now()).run();
    const r = rewards(env);
    return eph(env, { title: 'Code erstellt', color: COL.ok, desc: `**${code}** gehört jetzt <@${target}>.`, fields: [{ name: 'Belohnung Käufer', value: `+${days(r.buyer)}`, inline: true }, { name: 'Belohnung Inhaber', value: `+${days(r.owner.week)} (Woche) · +${days(r.owner.month)} (Monat)`, inline: true }] });
  }
  if (sub.name === 'löschen') {
    const res = await env.DB.prepare('DELETE FROM codes WHERE code=?').bind(normCode(o('code'))).run();
    return res.meta && res.meta.changes ? eph(env, { title: 'Code gelöscht', color: COL.ok }) : bad(env, 'Nicht gefunden', '');
  }
  const rows = (await env.DB.prepare('SELECT * FROM codes ORDER BY uses DESC, created_at DESC LIMIT 15').all()).results || [];
  return eph(env, { title: '🎁 Creator-Codes', desc: rows.length ? rows.map(c => `**${c.code}** · <@${c.owner}> · ${c.uses}× · ${days(c.earned_days)}`).join('\n') : 'Noch keine Codes.' });
}
