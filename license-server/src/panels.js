// Status-Panel: aktuelle App-Version (GitHub), Download-Button, Zahlen. Wird per Cron automatisch aktualisiert.
import { now, emb } from './util.js';
import { getCfg, setCfg, editMsg } from './discord.js';

const REPO = 'Coco32432465/cocos-fn-tool';

export async function latestRelease(env) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'user-agent': 'cocos-tool-bot', accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const exe = (j.assets || []).find(a => /\.exe$/i.test(a.name));
    return { tag: String(j.tag_name || '').replace(/^v/, ''), url: j.html_url, download: exe ? exe.browser_download_url : j.html_url, at: j.published_at ? Math.floor(Date.parse(j.published_at) / 1000) : null };
  } catch (e) { return null; }
}

// Button-Ziel: bevorzugt der eigene /download-Link (laedt direkt die Setup-Datei), sonst der GitHub-Direktlink
export const dlLink = (env, rel) => (env.DOWNLOAD_URL && /\/download$/.test(env.DOWNLOAD_URL)) ? env.DOWNLOAD_URL : rel.download;

// Direkt-Download-Ziel der neuesten Setup-Datei, 10 Minuten zwischengespeichert (GitHub-API-Limit schonen)
export async function downloadTarget(env) {
  const at = Number(await getCfg(env, 'dl_at')) || 0, url = await getCfg(env, 'dl_url');
  if (url && now() - at < 600) return url;
  const rel = await latestRelease(env);
  if (rel && rel.download) { await setCfg(env, 'dl_url', rel.download); await setCfg(env, 'dl_at', now()); return rel.download; }
  return url || `https://github.com/${REPO}/releases/latest`;
}

export const downloadComponents = url => [{ type: 1, components: [{ type: 2, style: 5, label: 'Download', url, emoji: { name: '📥' } }] }];

export async function syncStatus(env) {
  const rel = await latestRelease(env);
  if (!rel) return false;
  const t = now();
  const act = (await env.DB.prepare("SELECT COUNT(*) AS n FROM keys WHERE status='active' AND expires_at>?").bind(t).first()).n;
  const ranked = (await env.DB.prepare('SELECT COUNT(*) AS n FROM ranks').first()).n;
  const msg = await getCfg(env, 'posted:status');
  if (msg && env.STATUS_CHANNEL_ID && /^\d+$/.test(msg)) {
    await editMsg(env, env.STATUS_CHANNEL_ID, msg, {
      embeds: [emb(env, { title: '📊 Cocos Tool · Status', color: 0x2ecc71, desc: '🟢 **Lizenz-Server online**', fields: [
        { name: 'Aktuelle Version', value: `**v${rel.tag}**`, inline: true },
        { name: 'Veröffentlicht', value: rel.at ? `<t:${rel.at}:R>` : '–', inline: true },
        { name: 'Aktive Lizenzen', value: String(act), inline: true },
        { name: 'Rangliste', value: `${ranked} Spieler`, inline: true },
        { name: 'Update', value: 'Die App lädt neue Versionen automatisch.', inline: true },
        { name: 'Aktualisiert', value: `<t:${t}:R>`, inline: true }] })],
      components: [] // Downloads gibt es nur im Kanal #download
    });
  }
  // Download-Panel: Button immer auf die aktuelle Datei zeigen lassen
  const dmsg = await getCfg(env, 'posted:download');
  if (dmsg && env.DOWNLOAD_CHANNEL_ID && /^\d+$/.test(dmsg)) await editMsg(env, env.DOWNLOAD_CHANNEL_ID, dmsg, { components: downloadComponents(dlLink(env, rel)) });
  return true;
}
