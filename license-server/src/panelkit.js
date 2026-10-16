// Panels (Embed + Buttons) bleiben immer die letzte Nachricht im Kanal: nach jeder neuen Meldung/Umfrage wird das Panel unten neu gepostet.
import { dapi, getCfg, setCfg } from './discord.js';

export async function bumpPanel(env, channelId, flag) {
  if (!channelId) return false;
  try {
    const id = await getCfg(env, 'posted:' + flag);
    if (!id || !/^\d+$/.test(id)) return false;
    const old = await dapi(env, 'GET', `/channels/${channelId}/messages/${id}`);
    if (!old.ok) return false;
    const p = await dapi(env, 'POST', `/channels/${channelId}/messages`, { embeds: old.data.embeds, components: old.data.components });
    if (!p.ok) return false;
    await setCfg(env, 'posted:' + flag, p.data.id);
    await dapi(env, 'DELETE', `/channels/${channelId}/messages/${id}`);
    return true;
  } catch (e) { return false; }
}
