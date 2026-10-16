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
   vod   optional: 0 = hat nichts mit dem VOD Review zu tun (nicht im Dashboard, aber im Discord)

   Angezeigt werden die neuesten Einträge (Anzahl: PATCHNOTES_MAX).
   ============================================================================ */
window.PATCHNOTES_MAX = 4;
window.PATCHNOTES = [
  { v: '0.10.9', date: '2026-10-16', tag: 'NEU', text: 'Lifetime-Lizenzen werden in der App als „Lifetime“ angezeigt' },
  { v: '0.10.8', date: '2026-10-16', tag: 'UPDATE', text: 'Datenschutz-Hinweis in den Einstellungen: was die App sendet und wie du deine Daten im Discord mit /datenschutz ansiehst oder löschst. Neu im Discord: Creator-Codes mit Bonus-Tagen, Formulare statt Befehlsfelder.', vod: 0 },
  { v: '0.10.7', date: '2026-10-16', tag: 'UPDATE', text: 'Die linke Seite zeigt jetzt „Zuletzt analysiert“ statt der News-Liste. Alle Neuerungen findest du weiter im Modus „Patchnotes“.' },
  { v: '0.10.6', date: '2026-10-16', tag: 'NEU', text: 'Beim Start lädt die App alle schon gespeicherten Replays automatisch aus dem Cache, nichts muss mehr neu eingelesen werden (auch nach Updates). Die App erkennt jetzt den Modus: Landeorte und Karte gibt es nur bei Reload, bei anderen Modi bleibt die Karte aus. In den Einstellungen lässt sich die Karte für alle Modi einschalten.' },
  { v: '0.10.5', date: '2026-10-16', tag: 'UPDATE', text: 'Die App meldet sich alle paar Minuten beim Lizenz-Server, damit das Team sieht, wie viele Nutzer gerade online sind. Dazu im Discord: animiertes Banner, Umfragen und Mitspielersuche per Button und Formular, Erste-Schritte-Anleitung und Live-Stats für das Team.', vod: 0 },
  { v: '0.10.4', date: '2026-10-16', tag: 'FEATURE', text: 'Die App meldet ihre Version beim Lizenz-Check. Admins sehen im Discord mit /admin nutzer, wer die App hat und wann sie zuletzt genutzt wurde, und mit /admin keys, wer welchen Key eingelöst hat.', vod: 0 },
  { v: '0.10.3', date: '2026-10-16', tag: 'NEU', text: 'Neuer Modus „Patchnotes“: alle Neuerungen von Cocos Tool auf einen Blick, durchsuchbar und nach NEU, FIX oder FEATURE filterbar. Die installierte Version ist markiert.' },
  { v: '0.10.2', date: '2026-10-16', tag: 'NEU', text: 'Neuer Modus „Landung & Rotation“: Vergleich deiner Landeorte (Ø Note, Ø Platz, Elims, früher Tod) mit Karte, dazu die Rotation je Zonenzug, Sturmschaden und Team-Abstand mit konkreten Tipps.' },
  { v: '0.10.1', date: '2026-10-16', tag: 'NEU', text: 'Trainingsplan: Die App erstellt aus deinen häufigsten Fehlern einen Wochenplan mit Übungen zum Abhaken und zeigt, ob sich deine Fehlerquote seit Planstart verbessert. Dazu fünf fertige Pläne: Aim, Rotation, Endgame, Team-Play und Boxfights.' },
  { v: '0.10.0', date: '2026-10-16', tag: 'NEU', text: 'Neuer Modus „Fortschritt & Training“: Verlauf deiner Gesamtnote als Diagramm (7 Tage, 30 Tage, alle), Ø Platz, Elims und Siege im Vergleich zur Vorperiode, Stärken und Schwächen je Spielphase und deine häufigsten Fehler. Rangliste: Siege, Elims und Ø Platz wurden bisher nicht richtig übertragen, das ist behoben.' },
  { v: '0.9.12', date: '2026-10-15', tag: 'NEU', text: 'Community-Rangliste: In den Einstellungen kannst du freiwillig teilnehmen. Deine Ø Note, Runden, Siege und Kills erscheinen dann in der Rangliste im Discord, die Top 10 bekommen eine eigene Rolle. Jederzeit abschaltbar.' },
  { v: '0.9.11', date: '2026-10-15', tag: 'NEU', text: 'Knock-Anzeige im Viewer: großes „KNOCKED“-Banner, solange du am Boden bist, und „WIEDERBELEBT“ danach. Fight-Tipps erkennen jetzt, wenn die Gegner zu dir gekommen sind (kein „pushen“-Tipp mehr). Leben und Schild laden jetzt auch in Solo-Replays (Replays werden einmalig neu eingelesen). Twitch-Link im Dashboard. Patchnotes im Discord sehen besser aus.' },
  { v: '0.9.10', date: '2026-10-15', tag: 'NEU', text: 'Turniere & Cups als Monatskalender (wie im Tracker): Cups erscheinen farbig am Spieltag, ein Klick wählt den Cup. Landeorte: ohne echten Ortsnamen heißt es „Freies Gelände“, ein Klick zeigt den Landepunkt auf der Karte. Der Tipp in der Live-Analyse ist komplett sichtbar, ohne Scrollen. Das Dashboard zeigt jetzt alle Patchnotes mit VOD-Review-Bezug.' },
  { v: '0.9.9', date: '2026-10-15', tag: 'NEU', text: 'App heißt jetzt „Cocos Tool“ und die Modus-Auswahl hat ein neues Design. Wiederbelebte Spieler gelten nicht mehr als tot. Treffer-Linien kommen nur noch von lebenden Gegnern in plausibler Entfernung. Leben und Schild laden jetzt auch in Solo-Replays. Neuer Discord-Kanal „Patchnotes“: neue Versionen werden automatisch als Embed gepostet.' },
  { v: '0.9.8', date: '2026-10-15', tag: 'NEU', text: 'Spalten stehen fest, nur die einzelnen Felder scrollen (Dashboard + Viewer). Fight-Analyse erkennt Solo (kein „von euch“ mehr, Gegner im 45-m-Umkreis). „Cup Report“ heißt jetzt Runden-Report; neue Cup-Auswahl im Dashboard (Runden nach Playlist + Tag gruppiert) für Cup-Report und Stats. Landeort „Cluster Coast“ entfernt' },
  { v: '0.9.7', date: '2026-10-15', tag: 'NEU', text: 'Fight-Analyse: jeder Kampf deines Teams wird bewertet (HP, Mats, Höhe, Mates, Unterzahl, Third-Party, Sturm) mit Note A–D und konkretem Verbesserungstipp. Neuer Tab „Fights“ im Replay-Viewer und Fight-Bilanz mit Siegquote im Cup-Report' },
  { v: '0.9.6', date: '2026-10-15', tag: 'NEU', text: 'Dashboard luftiger und breiter (mehr Platz auf großen Bildschirmen, kürzere News-Karten), App startet jetzt direkt im gewählten Farbschema (kein rotes Aufblitzen mehr bei Blau · Lila u. a.), Discord-Einladung hinterlegt' },
  { v: '0.9.5', date: '2026-10-15', tag: 'NEU', text: 'Neues Key-Format XXXX-XXXX-XXXX (ältere Keys bleiben gültig), Key wird beim ersten Aktivieren in der App eingelöst und die Laufzeit startet dann. Neuer Lizenz-Bot: Server-Setup, Tickets mit Laufzeit-Auswahl, Transkripte, Key-Befehle und Verifizierungs-API', vod: 0 },
  { v: '0.9.4', date: '2026-10-14', tag: 'NEU', text: 'Lizenz-System: Discord-Konto per Login verbinden, Key aus dem Discord-Ticket eingeben, Zugang wird vom Server geprüft (1 Gerät pro Key, Ablauf, Offline-Toleranz). Dazu Lizenz-Server mit Bot, Ticket-Panel und Team-Commands', vod: 0 },
  { v: '0.9.3', date: '2026-10-14', tag: 'NEU', text: 'Update-Hinweis als zentriertes Fenster, Solo-HUD-Fix (Leben/Schild/Mats auch in Solo-Runden, Replays werden einmalig neu analysiert), dynamische Report-Namen (Game/Session/Scrim Report), Discord-Button + Lizenz-Key-Vorbereitung, rote Schusslinie auf der Karte bei Treffern' },
  { v: '0.9.2', date: '2026-10-14', tag: 'NEU', text: '„Woran du arbeiten solltest“: Top 5 über alle Games (Mehr anzeigen), gleiche Fehler gruppiert („5× in 3 Games“), rote Auswirkungs-Badges (Game vorbei, −HP, Meter), aufklappbar mit Direktsprung ins Replay; Top 3 auch im Dashboard' },
  { v: '0.9.1', date: '2026-10-14', tag: 'NEU', text: 'Karten-Legende unter der Karte, dezente rote Gegner-Punkte, Zonen immer lila, du immer im Vordergrund (grün), rotes „!“ für Kills in der Timeline, HUD-Daten (Leben, Schild, Mats, Waffen, Muni) mit klarem Hinweis, wenn sie im Replay fehlen' },
  { v: '0.9.0', date: '2026-10-14', tag: 'NEU', text: 'Feinschliff: fester Analyse-Kasten, Dashboard ohne Scrollen, Muni in den Spielerkarten, Gegner als rote Punkte, Zone-einpassen-Button, Schwarz-Blau als Standard, neues transparentes Icon, Fade-Out-Spur, Spielerzahl max. 100' },
  { v: '0.8.9', date: '2026-10-14', tag: 'NEU', text: 'Dashboard scrollt nicht mehr als Ganzes (Spalten scrollen einzeln). Neue Leben-Tipps: „Wenig HP bei Zonenstart“ und „Heilung nicht genutzt“. Replays werden einmal neu eingelesen, damit Leben & Inventar erscheinen' },
  { v: '0.8.8', date: '2026-10-14', tag: 'FIX', text: 'Live Analysis: Pfeile ‹ › springen jetzt korrekt zum vorherigen/nächsten Fehler (nichts wird mehr übersprungen); Karte um ca. 35 m nachjustiert' },
  { v: '0.8.7', date: '2026-10-14', tag: 'FIX', text: 'Hauptmenü: Kacheln sind beim Drüberfahren nicht mehr unscharf (Hover hebt sie jetzt an, statt sie zu skalieren)', vod: 0 },
  { v: '0.8.6', date: '2026-10-14', tag: 'NEU', text: 'Review-Layout aufgeräumt: größere Karte, rechts Tabs (Analyse / Feed / Games). Spielerkarten zeigen Leben, Schild, Mats, Waffen & Heilung (Daten nur für dich – aus neu eingelesenen Replays)' },
  { v: '0.8.5', date: '2026-10-14', tag: 'NEU', text: 'Replay-Karte: Zoomen (Mausrad, +/−), Verschieben per Ziehen, „Mir folgen“, Spur ein-/ausblendbar' },
  { v: '0.8.4', date: '2026-10-14', tag: 'NEU', text: 'Deutlich bessere Tipps: Zonenrand/Deep-Position, Höhe im Endgame, Hot Drops, Team-Abstand, Todesursachen mit Fakten-Chips' },
  { v: '0.8.3', date: '2026-10-14', tag: 'NEU', text: 'Hauptmenü mit Bildern (VOD Review in der Mitte), 4 neue Farbschemata (Grün, Gold, Blau·Lila, Grün·Blau), genauere Kartenausrichtung, Landeort Roter-Geist-Insel' },
  { v: '0.8.2', date: '2026-10-14', tag: 'NEU', text: 'Neues Hauptmenü "Select a Mode" mit Hauptmenü-Button in allen Ansichten', vod: 0 },
  { v: '0.8.1', date: '2026-10-14', tag: 'NEU', text: 'Landeorte mit Namen, Auto-Analyse neuer Replays, lokale Schriften, neues App-Icon' },
  { v: '0.8.0', date: '2026-10-14', tag: 'NEU', text: 'Neues 3-Spalten-Layout: Games, Matrix, Spieler-Cards, Live Analysis & Event Feed' },
  { v: '0.7.1', date: '2026-10-14', tag: 'FIX',     text: 'Karte korrekt ausgerichtet, Statusleiste unten, Patchnotes aus Datei' },
  { v: '0.7.0', date: '2026-10-14', tag: 'NEU',     text: 'Echte Replay-Daten: 2D-Viewer, Fehler-Analyse und Cup-Report aus deinen Matches' },
  { v: '0.6.0',                      tag: 'FEATURE', text: 'Themes & Einstellungen', vod: 0 },
  { v: '0.5.1',                      tag: 'FIX',     text: 'Stabilere Auto-Updates', vod: 0 },
  { v: '0.5.0',                      tag: 'UPDATE',  text: 'Automatische Updates über GitHub', vod: 0 }
];
