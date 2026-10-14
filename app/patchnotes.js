/* ============================================================================
   PATCHNOTES – hier pflegen, nichts anderes im Code anfassen.

   Neuer Eintrag = einfach OBEN in die Liste einfügen:
     { v: '0.8.1', date: '2026-10-14', tag: 'NEU',     text: 'Landeorte mit Namen, Auto-Analyse neuer Replays, lokale Schriften, neues App-Icon' },
  { v: '0.8.0', date: '2026-10-14', tag: 'NEU',     text: 'Neues 3-Spalten-Layout: Games, Matrix, Spieler-Cards, Live Analysis & Event Feed' },
  { v: '0.7.1', date: '2026-10-20', tag: 'FIX', text: 'Kurzer Satz, was neu ist' },

   v     Versionsnummer (ohne "v")
   date  Datum JJJJ-MM-TT (optional; daraus wird "Heute", "vor 3 Tagen" ...)
   tag   NEU | FIX | FEATURE | UPDATE   (frei wählbar, wird als Label angezeigt)
   text  Eine Zeile, was sich geändert hat

   Angezeigt werden die neuesten Einträge (Anzahl: PATCHNOTES_MAX).
   ============================================================================ */
window.PATCHNOTES_MAX = 4;
window.PATCHNOTES = [
  { v: '0.8.6', date: '2026-10-14', tag: 'NEU', text: 'Review-Layout aufgeräumt: größere Karte, rechts Tabs (Analyse / Feed / Games). Spielerkarten zeigen Leben, Schild, Mats, Waffen & Heilung (Daten nur für dich – aus neu eingelesenen Replays)' },
  { v: '0.8.5', date: '2026-10-14', tag: 'NEU', text: 'Replay-Karte: Zoomen (Mausrad, +/−), Verschieben per Ziehen, „Mir folgen“, Spur ein-/ausblendbar' },
  { v: '0.8.4', date: '2026-10-14', tag: 'NEU', text: 'Deutlich bessere Tipps: Zonenrand/Deep-Position, Höhe im Endgame, Hot Drops, Team-Abstand, Todesursachen mit Fakten-Chips' },
  { v: '0.8.3', date: '2026-10-14', tag: 'NEU', text: 'Hauptmenü mit Bildern (VOD Review in der Mitte), 4 neue Farbschemata (Grün, Gold, Blau·Lila, Grün·Blau), genauere Kartenausrichtung, Landeort Roter-Geist-Insel' },
  { v: '0.8.2', date: '2026-10-14', tag: 'NEU', text: 'Neues Hauptmenü "Select a Mode" mit Hauptmenü-Button in allen Ansichten' },
  { v: '0.8.1', date: '2026-10-14', tag: 'NEU', text: 'Landeorte mit Namen, Auto-Analyse neuer Replays, lokale Schriften, neues App-Icon' },
  { v: '0.8.0', date: '2026-10-14', tag: 'NEU', text: 'Neues 3-Spalten-Layout: Games, Matrix, Spieler-Cards, Live Analysis & Event Feed' },
  { v: '0.7.1', date: '2026-10-14', tag: 'FIX',     text: 'Karte korrekt ausgerichtet, Statusleiste unten, Patchnotes aus Datei' },
  { v: '0.7.0', date: '2026-10-14', tag: 'NEU',     text: 'Echte Replay-Daten: 2D-Viewer, Fehler-Analyse und Cup-Report aus deinen Matches' },
  { v: '0.6.0',                      tag: 'FEATURE', text: 'Themes & Einstellungen' },
  { v: '0.5.1',                      tag: 'FIX',     text: 'Stabilere Auto-Updates' },
  { v: '0.5.0',                      tag: 'UPDATE',  text: 'Automatische Updates über GitHub' }
];
