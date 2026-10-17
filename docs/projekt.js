/* ============================================================================
   PROJEKT-DASHBOARD – Daten für docs/index.html. Hier pflegen.
   Versionen und Patchnotes kommen automatisch aus app/patchnotes.js.

   status:  'braucht-dich' | 'offen' | 'arbeit' | 'fertig'
   bereich: 'App' | 'Discord' | 'Server' | 'Werbung'
   aufwand: 'S' (Stunden) | 'M' (ein Abend) | 'L' (mehrere Tage)
   ============================================================================ */
window.PROJEKT = {
  stand: '2026-10-17',

  /* Update, das gerade auf Freigabe wartet (null = keins) */
  freigabe: null,

  aufgaben: [
    { status: 'braucht-dich', bereich: 'App', text: 'Tweaks und Fortnite-Grafik einmal auf einem echten Windows-PC testen' },
    { status: 'braucht-dich', bereich: 'App', text: 'Screenshot vom Viewer-HUD schicken (für die HUD-Feinarbeit)' },
    { status: 'braucht-dich', bereich: 'Discord', text: '/setup mit erneuern: True ausführen, damit Key- und Download-Panel aktuell sind; Bot-Rolle über alle Team-Rollen schieben' },
    { status: 'braucht-dich', bereich: 'Server', text: 'Einmal pro Woche D1-Backup (Keys, Verkäufe) exportieren' },
    { status: 'offen', bereich: 'App', text: 'Coach-Notizen: Markierungen und Kommentare im Replay speichern', aufwand: 'L' },
    { status: 'offen', bereich: 'App', text: 'Duo-Synergie: zwei Spieler vergleichen (wer stirbt zuerst, wer rotiert früher)', aufwand: 'L' },
    { status: 'fertig', bereich: 'Werbung', text: 'Landing-Page mit Download, Screenshots und Preisen (0.26.0)' },
    { status: 'fertig', bereich: 'Discord', text: 'Clip des Monats mit Abstimmung und Titel in der App (0.25.0)' },
    { status: 'fertig', bereich: 'Discord', text: 'FAQ-Bot: /hilfe und Auswahlmenü im Fragen-Kanal (0.24.0)' },
    { status: 'fertig', bereich: 'App', text: 'Benachrichtigungen: Daily-Spin-Erinnerung und Update-Hinweis (0.23.0)' },
    { status: 'fertig', bereich: 'Discord', text: 'Wöchentlicher Cup mit Live-Tabelle, /rank cup und 7 Bonustagen für Platz 1 (0.22.0)' },
    { status: 'fertig', bereich: 'Discord', text: 'Willkommens-DM nach den Regeln und SmartScreen-Hinweis im #download-Panel (0.21.0)' },
    { status: 'fertig', bereich: 'App', text: 'Wochenziele, Erfolge, Wochenreport als Bild, Bild-Button im Viewer (0.20.0)' },
    { status: 'fertig', bereich: 'App', text: 'Umbenennung zu Ninjago Tools (0.19.1)' },
    { status: 'fertig', bereich: 'App', text: 'Replay-Bibliothek mit Suche, Filtern und Favoriten (0.19.0)' },
    { status: 'fertig', bereich: 'App', text: 'Runde als Bild teilen, Post und Story (0.19.0)' },
    { status: 'fertig', bereich: 'Discord', text: 'Probe-Key auf 3 Tage verlängert, passend zur Werbung (0.19.0)' },
    { status: 'fertig', bereich: 'App', text: 'Daily Spin als Glücksrad, neues Menü (0.18.0)' },
    { status: 'fertig', bereich: 'App', text: 'Season-Pass, Team-Lizenz, PC-Check und Tweak-Paket (0.12 bis 0.16)' },
    { status: 'fertig', bereich: 'App', text: 'Fortschritt, Trainingsplan, Landung und Rotation, Patchnotes-Modus (0.10)' }
  ],

  ideen: [
    { bereich: 'App', titel: 'Replay-Tresor', text: 'Beste und schlechteste Replays mit Notiz sichern, auch wenn Fortnite sie löscht', aufwand: 'M' },
    { bereich: 'App', titel: 'Gegner-Scouting', text: 'Spielweise der Gegner in Zone 4 aus einem Replay zusammenfassen', aufwand: 'L' },
    { bereich: 'App', titel: 'Daily-Spin-Erweiterung', text: 'Seltene Gewinne wie Farbschema, Titel oder Bonustag (Server nötig)', aufwand: 'M' },
    { bereich: 'Discord', titel: 'Replay-Feedback-Abend', text: 'Einmal pro Woche Zuschauer-Replays live reviewen', aufwand: 'S' },
    { bereich: 'Discord', titel: 'Rollen-Stufen', text: 'Rolle nach Streak oder Level (Bronze bis Diamant)', aufwand: 'M' },
    { bereich: 'Werbung', titel: 'Vorher/Nachher-Clips', text: 'Clips aus echten Reviews für TikTok und Twitch', aufwand: 'S' },
    { bereich: 'Werbung', titel: 'Creator-Rolle', text: 'Streamer bekommen einen Gratis-Key gegen Erwähnung', aufwand: 'S' }
  ]
};
