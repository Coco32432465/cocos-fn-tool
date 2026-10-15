/* ============================================================================
   EINSTELLUNGEN – hier eintragen, nichts anderes im Code anfassen.
   ============================================================================ */
window.CFT_CONFIG = {
  /* Discord-Server-Einladung, z. B. 'https://discord.gg/abcdefg'. Leer = Button zeigt einen Hinweis. */
  discordInvite: 'https://discord.gg/sZJAMkZMEN',

  /* Social-Media-Links (leer lassen = Hinweis beim Klick) */
  social: {
    TikTok: '',
    Twitch: '',
    YouTube: ''
  },

  /* Lizenz-System (Discord + Key, Server siehe Ordner license-server/).
     required: true  = VOD-Analyse nur mit gueltiger Lizenz.  false = jeder darf rein (zum Testen).
     endpoint  = Adresse deines Workers.  publicKey = oeffentlicher Schluessel aus "npm run gen-key". */
  license: {
    required: true,
    endpoint: 'https://cft-license.cocotool.workers.dev',
    publicKey: 'MCowBQYDK2VwAyEA0qt2OkB1HR5rpGZRt9sJeyKSq0P6S63FBTj/JIWTzy0='
  },

  /* Neue Replays im Fortnite-Ordner automatisch im Hintergrund analysieren */
  autoAnalyze: true,
  /* Wie viele der neuesten Replays maximal automatisch analysiert werden (jedes dauert beim ersten Mal 1–2 Min.) */
  autoAnalyzeMax: 5
};
