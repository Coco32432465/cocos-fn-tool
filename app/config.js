/* ============================================================================
   EINSTELLUNGEN – hier eintragen, nichts anderes im Code anfassen.
   ============================================================================ */
window.CFT_CONFIG = {
  /* Discord-Server-Einladung, z. B. 'https://discord.gg/abcdefg'. Leer = Button zeigt einen Hinweis. */
  discordInvite: '',

  /* Social-Media-Links (leer lassen = Hinweis beim Klick) */
  social: {
    TikTok: '',
    Twitch: '',
    YouTube: ''
  },

  /* Lizenz-Key-System (Vorbereitung). required:true = VOD-Analyse nur mit Discord-Name + gueltigem Key.
     endpoint = URL deines Lizenz-Servers (POST {discord,key} -> {ok:true|false,message}). Ohne endpoint wird nur das Format XXXX-XXXX-XXXX-XXXX geprueft. */
  license: { required: false, endpoint: '' },

  /* Neue Replays im Fortnite-Ordner automatisch im Hintergrund analysieren */
  autoAnalyze: true,
  /* Wie viele der neuesten Replays maximal automatisch analysiert werden (jedes dauert beim ersten Mal 1–2 Min.) */
  autoAnalyzeMax: 5
};
