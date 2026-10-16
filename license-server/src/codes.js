// Creator-Codes: Kaeufer geben im Kauf-Ticket einen Code ein. Keine Rabatte (Preise sind schon niedrig), sondern Bonus-Tage:
// der Kaeufer bekommt Extra-Tage, der Code-Inhaber (z. B. ein Creator) Belohnungs-Tage pro Kauf.
import { now, emb, eph, bad, COL, fmtDate } from './util.js';
import { dapi, tryDM, isCodeManager } from './discord.js';
import { addRole } from './discord.js';
import { newKey } from './util.js';

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
// Standardwerte (Variablen) oder die Werte, die beim Code eingestellt wurden
export const rewards = (env, row) => ({
  buyer: row && row.buyer_days != null ? row.buyer_days : num(env.CODE_BUYER_BONUS, 1),
  owner: { week: row && row.owner_week != null ? row.owner_week : num(env.CODE_OWNER_WEEK, 1), month: row && row.owner_month != null ? row.owner_month : num(env.CODE_OWNER_MONTH, 3) } });
export const codeRow = (env, code) => env.DB.prepare('SELECT * FROM codes WHERE code=?').bind(code).first();
const CAP = { buyer: 14, week: 30, month: 90 };
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
  return { ok: true, code, owner: row.owner, buyer: rewards(env, row).buyer };
}

// Beim Bestaetigen der Zahlung: Bonus fuer den Kaeufer ist schon eingerechnet (siehe tickets.js), hier die Belohnung fuer den Inhaber
// Bonus-Tage gutschreiben: laufende Lizenz verlaengern oder (ohne Lizenz) einen neuen Key erzeugen, dazu eine DM
export async function grantDays(env, uid, d, title, text) {
  const t = now(), act = await env.DB.prepare("SELECT * FROM keys WHERE discord_id=? AND status='active' ORDER BY expires_at DESC LIMIT 1").bind(uid).first();
  let key = null, exp = null;
  if (act) {
    exp = Math.max(t, act.expires_at) + Math.round(d * 86400);
    await env.DB.prepare('UPDATE keys SET expires_at=?, role_removed=0, reminded=0 WHERE key=?').bind(exp, act.key).run();
    await addRole(env, uid);
  } else {
    key = newKey();
    await env.DB.prepare("INSERT INTO keys (key,plan,days,status,created_at,created_by) VALUES (?,?,?,'unused',?,?)").bind(key, 'week', d, t, 'bonus').run();
  }
  await tryDM(env, uid, { embeds: [emb(env, { title, color: 0xf1c40f, desc: text,
    fields: key ? [{ name: 'Dein Key', value: '```\n' + key + '\n```' }, { name: 'Einlösen', value: 'In der App oder mit `/key einlösen`.' }] : [{ name: 'Neues Ablaufdatum', value: `**${fmtDate(exp)}**` }] })] });
  return { key, exp };
}

export async function payOut(env, ticket, buyer) {
  const code = ticket.code; if (!code) return null;
  const row = await env.DB.prepare('SELECT * FROM codes WHERE code=?').bind(code).first();
  if (!row || row.owner === buyer) return null;
  const claim = await env.DB.prepare('INSERT OR IGNORE INTO code_uses (user_id,code,plan,created_at) VALUES (?,?,?,?)').bind(buyer, code, ticket.plan, now()).run();
  if (!(claim.meta && claim.meta.changes)) return null; // schon einmal genutzt
  const r = rewards(env, row), d = r.owner[ticket.plan] || 0;
  await env.DB.prepare('UPDATE codes SET uses=uses+1, earned_days=earned_days+? WHERE code=?').bind(d, code).run();
  if (!d) return { code, owner: row.owner, days: 0, buyer: r.buyer };
  await grantDays(env, row.owner, d, '🎁 Dein Code wurde genutzt', `Jemand hat **${code}** bei einem Kauf eingelöst. Danke fürs Teilen! Belohnung: **+${days(d)}**.`);
  return { code, owner: row.owner, days: d, buyer: r.buyer };
}

/* ---------- Formulare fuer Content Manager ---------- */
const mrow = (id, label, style, max, ph, req = true, val) => ({ type: 1, components: [{ type: 4, custom_id: id, label, style, max_length: max, required: req, placeholder: ph, ...(val != null ? { value: String(val) } : {}) }] });
const mval = (i, id) => { for (const r of i.data.components || []) for (const c of r.components || []) if (c.custom_id === id) return String(c.value || '').trim(); return ''; };
const parseDays = (txt, cap) => { const n = Number(String(txt).replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= cap ? Math.round(n * 100) / 100 : null; };

export const openCodeNew = env => { const r = rewards(env); return { type: 9, data: { custom_id: 'modal_code_new', title: 'Neuen Creator-Code anlegen', components: [
  mrow('f_owner', 'Inhaber (@Erwähnung, Name oder Discord-ID)', 1, 60, 'z. B. @Coco oder 123456789012345678'),
  mrow('f_code', 'Code (3 bis 16 Buchstaben/Zahlen)', 1, 16, 'z. B. COCO'),
  mrow('f_buyer', `Bonus für den Käufer (Tage, max ${CAP.buyer})`, 1, 5, '1', true, r.buyer),
  mrow('f_week', `Belohnung Inhaber pro Wochen-Kauf (Tage, max ${CAP.week})`, 1, 5, '1', true, r.owner.week),
  mrow('f_month', `Belohnung Inhaber pro Monats-Kauf (Tage, max ${CAP.month})`, 1, 5, '3', true, r.owner.month)] } }; };

export const openCodeEdit = () => ({ type: 9, data: { custom_id: 'modal_code_edit', title: 'Creator-Code bearbeiten', components: [
  mrow('f_code', 'Welcher Code?', 1, 16, 'z. B. COCO'),
  mrow('f_buyer', 'Bonus für den Käufer (Tage), leer = nicht ändern', 1, 5, '1', false),
  mrow('f_week', 'Belohnung Inhaber Wochen-Kauf (Tage), leer = nicht ändern', 1, 5, '1', false),
  mrow('f_month', 'Belohnung Inhaber Monats-Kauf (Tage), leer = nicht ändern', 1, 5, '3', false),
  mrow('f_del', 'Zum Löschen LÖSCHEN eintippen', 1, 10, 'sonst leer lassen', false)] } });

async function resolveOwner(env, raw) {
  const t = String(raw || '').trim();
  const m = t.match(/^<@!?(\d{15,22})>$/) || t.match(/^(\d{15,22})$/);
  if (m) return m[1];
  const q = t.replace(/^@/, '');
  if (q.length < 2) return null;
  const r = await dapi(env, 'GET', `/guilds/${env.GUILD_ID}/members/search?query=${encodeURIComponent(q)}&limit=1`);
  return r.ok && r.data && r.data[0] && r.data[0].user ? r.data[0].user.id : null;
}

export async function submitCodeAdmin(i, env, uid) {
  if (!isCodeManager(env, i)) return bad(env, 'Keine Berechtigung', 'Codes verwaltet der Content Manager oder ein Admin.');
  if (i.data.custom_id === 'modal_code_new') {
    const code = normCode(mval(i, 'f_code'));
    if (code.length < 3) return bad(env, 'Code ungültig', 'Der Code braucht 3 bis 16 Zeichen (Buchstaben und Zahlen).');
    const owner = await resolveOwner(env, mval(i, 'f_owner'));
    if (!owner) return bad(env, 'Inhaber nicht gefunden', 'Gib den Inhaber als @Erwähnung oder Discord-ID an (Rechtsklick auf den Nutzer, „ID kopieren“).');
    const b = parseDays(mval(i, 'f_buyer'), CAP.buyer), w = parseDays(mval(i, 'f_week'), CAP.week), mo = parseDays(mval(i, 'f_month'), CAP.month);
    if (b == null || w == null || mo == null) return bad(env, 'Belohnung ungültig', `Tage als Zahl: Käufer 0 bis ${CAP.buyer}, Woche 0 bis ${CAP.week}, Monat 0 bis ${CAP.month}.`);
    if (await codeRow(env, code)) return bad(env, 'Code vergeben', `**${code}** gibt es schon. Ändern geht mit \`/code bearbeiten\`.`);
    await env.DB.prepare('INSERT INTO codes (code,owner,created_at,buyer_days,owner_week,owner_month) VALUES (?,?,?,?,?,?)').bind(code, owner, now(), b, w, mo).run();
    return eph(env, { title: '🎁 Code angelegt', color: COL.ok, desc: `**${code}** gehört <@${owner}>.`, fields: [
      { name: 'Käufer bekommt', value: `+${days(b)}`, inline: true }, { name: 'Inhaber pro Woche', value: `+${days(w)}`, inline: true }, { name: 'Inhaber pro Monat', value: `+${days(mo)}`, inline: true }] });
  }
  const code = normCode(mval(i, 'f_code')), row = await codeRow(env, code);
  if (!row) return bad(env, 'Code nicht gefunden', 'Prüfe die Schreibweise oder schau mit `/code liste` nach.');
  if (mval(i, 'f_del').toUpperCase() === 'LÖSCHEN') { await env.DB.prepare('DELETE FROM codes WHERE code=?').bind(code).run(); return eph(env, { title: 'Code gelöscht', color: COL.ok, desc: `**${code}** gibt es nicht mehr.` }); }
  const sets = [], vals = [];
  for (const [fld, col, cap] of [['f_buyer', 'buyer_days', CAP.buyer], ['f_week', 'owner_week', CAP.week], ['f_month', 'owner_month', CAP.month]]) {
    const raw = mval(i, fld); if (raw === '') continue;
    const n = parseDays(raw, cap); if (n == null) return bad(env, 'Belohnung ungültig', `Tage als Zahl von 0 bis ${cap}.`);
    sets.push(`${col}=?`); vals.push(n);
  }
  if (sets.length) await env.DB.prepare(`UPDATE codes SET ${sets.join(',')} WHERE code=?`).bind(...vals, code).run();
  const r = rewards(env, await codeRow(env, code));
  return eph(env, { title: 'Code aktualisiert', color: COL.ok, desc: `**${code}** · <@${row.owner}>`, fields: [{ name: 'Käufer bekommt', value: `+${days(r.buyer)}`, inline: true }, { name: 'Inhaber pro Woche', value: `+${days(r.owner.week)}`, inline: true }, { name: 'Inhaber pro Monat', value: `+${days(r.owner.month)}`, inline: true }] });
}

export async function handleCode(i, env, uid) {
  const sub = i.data.options[0];
  if (sub.name === 'mein') {
    const rows = (await env.DB.prepare('SELECT * FROM codes WHERE owner=?').bind(uid).all()).results || [];
    if (!rows.length) return eph(env, { title: '🎁 Dein Creator-Code', color: COL.neutral, desc: 'Du hast noch keinen Code. Als Creator bekommst du einen vom Content Manager, schreib uns in einem Support-Ticket.' });
    const c = rows[0], r = rewards(env, c);
    return eph(env, { title: '🎁 Dein Creator-Code', desc: rows.map(x => `**${x.code}** · ${x.uses} Einlösung${x.uses === 1 ? '' : 'en'} · **${days(x.earned_days)}** verdient`).join('\n'),
      fields: [{ name: 'So funktioniert es', value: `Wer **${c.code}** im Kauf-Ticket eingibt, bekommt **+${days(r.buyer)}** extra. Du bekommst pro Kauf **+${days(r.owner.week)}** (1 Woche) bzw. **+${days(r.owner.month)}** (1 Monat) auf deine Lizenz.` }] });
  }
  if (!isCodeManager(env, i)) return bad(env, 'Keine Berechtigung', 'Codes verwaltet der Content Manager oder ein Admin.');
  if (sub.name === 'neu') return openCodeNew(env);
  if (sub.name === 'bearbeiten') return openCodeEdit();
  const rows = (await env.DB.prepare('SELECT * FROM codes ORDER BY uses DESC, created_at DESC LIMIT 15').all()).results || [];
  return eph(env, { title: '🎁 Creator-Codes', desc: rows.length ? rows.map(c => { const r = rewards(env, c); return `**${c.code}** · <@${c.owner}> · ${c.uses}× · Käufer +${r.buyer} · Inhaber +${r.owner.week}/+${r.owner.month}`; }).join('\n') : 'Noch keine Codes.' });
}
