// FAQ-Bot: /hilfe [thema] und das Auswahlmenü im Fragen-Kanal beantworten die häufigsten Fragen.
import { emb, COL, price } from './util.js';

const ch = (id, name) => id ? `<#${id}>` : `#${name}`;
const RELEASES = 'https://github.com/Coco32432465/cocos-fn-tool/releases/latest';

export const FAQ = [
  { id: 'download', emoji: '📥', title: 'App laden und installieren', a: env => `Lade die App im ${ch(env.DOWNLOAD_CHANNEL_ID, 'download')} oder direkt [hier](${env.DOWNLOAD_URL || RELEASES}) (Windows 10/11, 64-Bit) und starte die Setup-Datei.\n\nZeigt Windows **„Der Computer wurde durch Windows geschützt“**, klick auf **Weitere Informationen** → **Trotzdem ausführen**. Die App ist nur noch nicht signiert.` },
  { id: 'discord', emoji: '🔗', title: 'Mit Discord verbinden', a: () => 'Starte die App und klick auf **Mit Discord verbinden**. Im Browser öffnet sich Discord, dort bestätigen und zurück zur App. Klappt es nicht, schließ den Browser-Tab und versuch es noch einmal.' },
  { id: 'kaufen', emoji: '🛒', title: 'Key kaufen und Preise', a: env => `1 Woche **${price(env, 'week')}** · 1 Monat **${price(env, 'month')}** · Team-Lizenz **${price(env, 'team')}** pro Monat.\n\nÖffne im ${ch(env.PANEL_CHANNEL_ID, 'key-panel')} ein Ticket, wähl das Produkt und bezahl dort. Nach der Bestätigung bekommst du deinen Key im Ticket.` },
  { id: 'einloesen', emoji: '🔑', title: 'Key einlösen und gratis testen', a: env => `Gib den Key in der App ein (nach **Mit Discord verbinden**) oder nutz \`/key einlösen\`. Die Laufzeit startet erst beim Einlösen.\n\nNoch keinen Key? Im ${ch(env.PANEL_CHANNEL_ID, 'key-panel')} gibt es einen **Probe-Key für 3 Tage**, einmal pro Person.` },
  { id: 'geraet', emoji: '💻', title: 'Neuer PC oder Windows neu installiert', a: env => `Ein Key gilt für **ein Gerät**. Wechselst du den PC, öffne ein Ticket im ${ch(env.SUPPORT_CHANNEL_ID, 'support')}. Das Team setzt die Gerätebindung zurück, danach kannst du dich auf dem neuen PC anmelden.` },
  { id: 'replays', emoji: '🎬', title: 'Wo sind meine Replays?', a: () => 'Schalte in Fortnite unter **Einstellungen → Spiel → Replays** das Aufzeichnen ein. Die App findet neue Replays dann automatisch im Fortnite-Ordner. Fortnite behält nur die letzten Runden, wichtige Replays also bald anschauen.' },
  { id: 'fehler', emoji: '🛠️', title: 'Replay lädt nicht oder Fehler', a: env => `Prüf zuerst, ob die App aktuell ist (Einstellungen → **Nach Updates suchen**). Sehr alte Replays nach einem großen Fortnite-Update lassen sich manchmal nicht mehr lesen.\n\nKlappt es weiter nicht, meld den Fehler mit App-Version im ${ch(env.BUG_CHANNEL_ID, 'bug-reports')}.` },
  { id: 'rangliste', emoji: '🏆', title: 'Rangliste und Wochen-Cup', a: env => `Aktiviere in der App **Einstellungen → Rangliste**. Ab 3 Runden stehst du in der Rangliste${env.RANK_CHANNEL_ID ? ` im <#${env.RANK_CHANNEL_ID}>` : ''}.\n\nIm **Wochen-Cup** zählt der Ø deiner besten 5 Noten der Woche. Platz 1 bekommt jeden Montag Bonustage. Tabelle: \`/rank cup\`, austragen: \`/rank austragen\`.` },
  { id: 'season', emoji: '🎡', title: 'Season-Pass und Daily Spin', a: env => `Jeden Monat startet eine neue Season mit Aufgaben und 10 Leveln. Auf Level 3, 6 und 10 gibt es Bonustage auf deinen Key. Premium-Pass: **${price(env, 'pass')}** pro Season.\n\nDen **Daily Spin** drehst du einmal am Tag im Hauptmenü für Bonus-XP. Die App erinnert dich, wenn du es vergisst.` },
  { id: 'updates', emoji: '🔄', title: 'Updates und Neuigkeiten', a: env => `Die App lädt Updates automatisch und fragt dann nach einem Neustart. Was neu ist, steht in der App unter **Patchnotes** und im Discord${env.PATCHNOTES_CHANNEL_ID ? ` im <#${env.PATCHNOTES_CHANNEL_ID}>` : ''}.` }
];

const menu = sel => [{ type: 1, components: [{ type: 3, custom_id: 'faq_pick', placeholder: 'Wähle eine Frage …', options: FAQ.map(f => ({ label: f.title, value: f.id, emoji: { name: f.emoji }, default: f.id === sel })) }] }];
const footer = env => ({ name: 'Nicht dabei?', value: `Frag im ${ch(env.QUESTIONS_CHANNEL_ID, 'questions')} oder öffne ein Ticket im ${ch(env.SUPPORT_CHANNEL_ID, 'support')}.` });

export const faqOverview = env => ({ embeds: [emb(env, { title: '❓ Häufige Fragen', color: COL.brand, desc: 'Wähl unten deine Frage, die Antwort siehst nur du.\n\n' + FAQ.map(f => `${f.emoji} ${f.title}`).join('\n'), fields: [footer(env)] })], components: menu() });
export function faqAnswer(env, id) {
  const f = FAQ.find(x => x.id === id);
  if (!f) return faqOverview(env);
  return { embeds: [emb(env, { title: `${f.emoji} ${f.title}`, color: COL.ok, desc: f.a(env), fields: [footer(env)] })], components: menu(f.id) };
}

// /hilfe [thema]
export function handleHilfe(i, env) {
  const t = ((i.data.options || []).find(o => o.name === 'thema') || {}).value;
  return { type: 4, data: { flags: 64, ...(t ? faqAnswer(env, t) : faqOverview(env)) } };
}
// Auswahl: in der eigenen (nur für dich sichtbaren) Antwort ersetzen, im öffentlichen Panel neu und privat antworten
export function faqPick(i, env) {
  const id = ((i.data && i.data.values) || [])[0], own = i.message && (i.message.flags & 64);
  return own ? { type: 7, data: faqAnswer(env, id) } : { type: 4, data: { flags: 64, ...faqAnswer(env, id) } };
}
export const FAQ_CHOICES = FAQ.map(f => ({ name: f.title, value: f.id }));
