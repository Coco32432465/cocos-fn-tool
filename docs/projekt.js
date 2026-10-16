/* ============================================================================
   PROJEKT-DASHBOARD – Daten für docs/index.html. Hier pflegen.
   Versionen und Patchnotes kommen automatisch aus app/patchnotes.js.

   status:  'braucht-dich' | 'offen' | 'arbeit' | 'fertig'
   bereich: 'App' | 'Discord' | 'Server' | 'Werbung'
   aufwand: 'S' (Stunden) | 'M' (ein Abend) | 'L' (mehrere Tage)
   ============================================================================ */
window.PROJEKT = {
  stand: '2026-10-17',

  /* Update, das gerade auf Freigabe wartet (leer lassen = keins) */
  freigabe: {
    version: '0.19.0',
    titel: 'Replay-Bibliothek und Runde als Bild teilen',
    pr: 'https://github.com/Coco32432465/cocos-fn-tool/pull/47',
    hinweis: 'Liegt als Draft-PR bereit. Erst nach deinem Okay wird gemergt, dann baut GitHub den Release automatisch.'
  },

  aufgaben: [
    { status: 'braucht-dich', bereich: 'App', text: 'Update 0.19.0 prüfen und freigeben (Draft-PR mergen)' },
    { status: 'braucht-dich', bereich: 'App', text: 'Tweaks und Fortnite-Grafik einmal auf einem echten Windows-PC testen' },
    { status: 'braucht-dich', bereich: 'App', text: 'Screenshot vom Viewer-HUD schicken (für die HUD-Feinarbeit)' },
    { status: 'braucht-dich', bereich: 'Discord', text: '/setup erneuern, damit das Key-Panel alle Produkte zeigt; Bot-Rolle über alle Team-Rollen schieben' },
    { status: 'braucht-dich', bereich: 'Server', text: 'Einmal pro Woche D1-Backup (Keys, Verkäufe) exportieren' },
    { status: 'offen', bereich: 'App', text: 'Wochenziele: Ziel aus dem Trainingsplan mit Fortschrittsbalken und Haken pro Woche', aufwand: 'M' },
    { status: 'offen', bereich: 'App', text: 'Erfolge und Abzeichen im Profil (10 Replays, 5 Tage Streak, erstes Top 10)', aufwand: 'S' },
    { status: 'offen', bereich: 'App', text: 'Coach-Notizen: Markierungen und Kommentare im Replay speichern', aufwand: 'L' },
    { status: 'offen', bereich: 'App', text: 'Duo-Synergie: zwei Spieler vergleichen (wer stirbt zuerst, wer rotiert früher)', aufwand: 'L' },
    { status: 'offen', bereich: 'Discord', text: 'Probe-Key: 1 Tag gratis, einmal pro Konto', aufwand: 'S' },
    { status: 'offen', bereich: 'Discord', text: 'Willkommens-DM mit Download und ersten Schritten', aufwand: 'S' },
    { status: 'offen', bereich: 'Discord', text: 'Windows-SmartScreen-Hinweis im #download-Panel', aufwand: 'S' },
    { status: 'fertig', bereich: 'App', text: 'Replay-Bibliothek mit Suche, Filtern und Favoriten (0.19.0)' },
    { status: 'fertig', bereich: 'App', text: 'Runde als Bild teilen, Post und Story (0.19.0)' },
    { status: 'fertig', bereich: 'App', text: 'Daily Spin als Glücksrad, neues Menü (0.18.0)' },
    { status: 'fertig', bereich: 'App', text: 'Season-Pass, Team-Lizenz, PC-Check und Tweak-Paket (0.12 bis 0.16)' },
    { status: 'fertig', bereich: 'App', text: 'Fortschritt, Trainingsplan, Landung und Rotation, Patchnotes-Modus (0.10)' }
  ],

  ideen: [
    { bereich: 'App', titel: 'Replay-Tresor', text: 'Beste und schlechteste Replays mit Notiz sichern, auch wenn Fortnite sie löscht', aufwand: 'M' },
    { bereich: 'App', titel: 'Gegner-Scouting', text: 'Spielweise der Gegner in Zone 4 aus einem Replay zusammenfassen', aufwand: 'L' },
    { bereich: 'App', titel: 'Daily-Spin-Erweiterung', text: 'Seltene Gewinne wie Farbschema, Titel oder Bonustag (Server nötig)', aufwand: 'M' },
    { bereich: 'App', titel: 'Benachrichtigungen', text: '„Heute noch nicht gedreht“ und „Neues Update“', aufwand: 'S' },
    { bereich: 'App', titel: 'Wochenreport als Bild', text: 'Wie das Runden-Bild, aber für die ganze Woche', aufwand: 'S' },
    { bereich: 'Discord', titel: 'Wöchentlicher Cup', text: 'Bester Score der Woche gewinnt Bonustage, Ranking im Kanal', aufwand: 'M' },
    { bereich: 'Discord', titel: 'Clip des Monats', text: 'Clips mit Abstimmung, Gewinner bekommt Titel in der App', aufwand: 'S' },
    { bereich: 'Discord', titel: 'Replay-Feedback-Abend', text: 'Einmal pro Woche Zuschauer-Replays live reviewen', aufwand: 'S' },
    { bereich: 'Discord', titel: 'Rollen-Stufen', text: 'Rolle nach Streak oder Level (Bronze bis Diamant)', aufwand: 'M' },
    { bereich: 'Discord', titel: 'FAQ-Bot', text: '/hilfe beantwortet die 10 häufigsten Fragen', aufwand: 'S' },
    { bereich: 'Werbung', titel: 'Landing-Page', text: 'Eine Seite mit Banner, Download, Preisen und Screenshots', aufwand: 'M' },
    { bereich: 'Werbung', titel: 'Vorher/Nachher-Clips', text: 'Clips aus echten Reviews für TikTok und Twitch', aufwand: 'S' },
    { bereich: 'Werbung', titel: 'Creator-Rolle', text: 'Streamer bekommen einen Gratis-Key gegen Erwähnung', aufwand: 'S' }
  ]
};
