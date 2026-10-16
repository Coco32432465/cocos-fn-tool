# Einrichtung: Lizenz-Server + Discord-Bot

Alles läuft kostenlos auf Cloudflare. Du brauchst **Node.js** und ein **Cloudflare-Konto**.
Öffne ein Terminal (PowerShell) **in diesem Ordner** (`license-server`).

## 1. Installieren und anmelden
```
npm install
npx wrangler login
```
Der Browser öffnet sich, bestätige den Zugriff.

## 2. Datenbank anlegen
```
npx wrangler d1 create cft-license
```
In der Ausgabe steht eine `database_id = "…"`. Trage sie in `wrangler.toml` bei `database_id` ein (ersetze `HIER_DIE_DATABASE_ID_EINTRAGEN`). Danach:
```
npm run db:init
```

## 3. Signatur-Schlüssel erzeugen
```
npm run gen-key
```
Du bekommst zwei Zeilen:
- **PRIVAT**: geheim, kommt gleich als Secret in den Worker.
- **OEFFENTLICH**: schick sie mir (oder trage sie später in `app/config.js` bei `license.publicKey` ein).

## 4. Geheimnisse eintragen
Jeder Befehl fragt nach dem Wert, füge ihn ein und bestätige mit Enter:
```
npx wrangler secret put BOT_TOKEN        (Bot-Token aus dem Developer Portal)
npx wrangler secret put CLIENT_SECRET    (Client Secret aus OAuth2)
npx wrangler secret put SIGNING_KEY      (der PRIVATE Schlüssel aus Schritt 3)
npx wrangler secret put SETUP_SECRET     (ein Passwort, das du dir ausdenkst, z. B. 24 zufällige Zeichen)
```
Beim ersten Mal fragt Wrangler eventuell, ob der Worker angelegt werden soll: mit `y` bestätigen.

## 5. Veröffentlichen
```
npx wrangler deploy
```
Am Ende steht deine Adresse, z. B. `https://cft-license.DEINNAME.workers.dev`. **Diese Adresse schickst du mir.**

## 6. Im Discord Developer Portal eintragen
Anwendung öffnen:
1. **Allgemeine Informationen → Interactions Endpoint URL**: `https://cft-license.DEINNAME.workers.dev/interactions` einfügen und speichern. Discord prüft sofort. Wenn „Gespeichert" kommt, passt alles. Kommt ein Fehler, stimmt Public Key oder Adresse nicht.
2. **OAuth2 → Redirects → Add Redirect**: `https://cft-license.DEINNAME.workers.dev/auth/callback` einfügen und speichern.

## 7. Commands registrieren (einmalig)
Im Browser öffnen (mit deinem Setup-Passwort):
```
https://cft-license.DEINNAME.workers.dev/register?secret=DEIN_SETUP_PASSWORT
```
Es sollte `{"commands":"ok"}` erscheinen. Danach im Discord als Admin `/setup` ausführen: das legt Kanäle, Rollen und die Panels (Key kaufen, Support) an.

## 8. Testen
1. Klick auf **Key kaufen** in #key-kaufen → privates Ticket, im Dropdown die Laufzeit wählen (Preis und Zahlungshinweis erscheinen).
2. Im Ticket: `/key erstellen dauer:1 Woche` → der Key erscheint im Ticket.
3. `/key einlösen` mit dem Key (oder direkt in der App) → Rolle Customer, `/key info` zeigt den Ablauf.
4. Ticket mit dem Button schließen → Transkript landet in #ticket-logs.

## Befehle
| Befehl | Wer | Wirkung |
|---|---|---|
| `/setup [erneuern]` | Admin | Baut Kategorien, Kanäle, Rollen und Start-Embeds auf. Vorhandenes wird übersprungen. |
| `/key erstellen dauer anzahl` | Admin | Erzeugt 1–25 Keys (`XXXX-XXXX-XXXX`). Im Ticket-Kanal sieht der Kunde sie sofort. Die Laufzeit startet erst beim Einlösen. |
| `/key einlösen key` | alle | Bindet den Key an das eigene Konto, startet die Laufzeit, vergibt die Rolle Customer. |
| `/key info` | alle | Zeigt Laufzeit, Ablauf, Gerätebindung. |
| `/key reset-gerät key` | Admin | Gerätebindung lösen (neuer PC). |
| `/key sperren key` | Admin | Key sperren, Rolle entziehen. |
| `/key liste [user]` | Admin | Übersicht der letzten Keys. |

Täglich um 04:00 UTC entzieht der Server abgelaufenen Nutzern die Rolle Customer und schickt eine DM.

## Update von v1 auf v2 einspielen (bestehende Installation)
1. Ordner `license-server` mit dem neuen überschreiben. Die `wrangler.toml` enthält deine `database_id` bereits.
2. Datenbank umstellen (**nur einmal**): `npm run db:migrate`
3. `npx wrangler deploy`
4. Neue Commands registrieren: `https://cft-license.cocotool.workers.dev/register?secret=DEIN_SETUP_PASSWORT` im Browser öffnen. Es erscheint `{"commands":"ok"}`. Die alten Commands (`/revoke`, `/keys` …) verschwinden dabei.
5. Im Discord als Admin: `/setup`. Läuft das Limit voll (Hinweis „teilweise"), den Befehl einfach noch einmal ausführen.
6. Die neue Rolle **Admin** dir selbst geben und prüfen, dass die Bot-Rolle in der Rollenliste **über** Customer, Member und Tester steht.
7. Download-Link: in `wrangler.toml` bei `DOWNLOAD_URL` deine Website eintragen, `npx wrangler deploy`, danach `/setup erneuern:true` (die alte Download-Nachricht vorher löschen).
8. Impressum und Anleitung (#how-to-use) schreibst du selbst, die Kanäle sind angelegt und nur für Admins beschreibbar.

## Die API für Website oder andere Programme
`POST https://cft-license.cocotool.workers.dev/api/verify` mit `{"key":"XXXX-XXXX-XXXX","deviceId":"..."}` antwortet `{"valid":true,"expiresAt":"2026-11-01T12:00:00.000Z"}` oder `{"valid":false,"reason":"expired|revoked|device|invalid|not_redeemed|format"}`.
Das Gerät wird beim ersten gültigen Aufruf gebunden. Je IP gilt 40 Anfragen pro Minute, nach 10 Fehlversuchen in 30 Minuten wird die IP bis zum Ablauf gesperrt (HTTP 429).
Die App selbst nutzt `/license/activate` mit signiertem Ticket, das ist fälschungssicherer als `/api/verify`.

Discord-Login für deine Website: `…/auth/start?cid=ZUFALLSTEXT&next=https://deine-seite.de/fertig` öffnen. Die Adresse muss in `wrangler.toml` bei `ALLOWED_ORIGINS` stehen (z. B. `"https://deine-seite.de"`). Danach holt die Seite die Sitzung mit `POST …/auth/poll {"cid":"ZUFALLSTEXT"}` ab.

## Grenzen (ehrlich)
- **Member automatisch beim Beitritt** geht ohne dauerhaft laufenden Bot nicht. Stattdessen bekommt man die Rolle Member über den Button „Regeln akzeptieren".
- Cloudflare Free erlaubt ca. 50 Discord-Aufrufe je Ausführung. Der Täglich-Job bearbeitet deshalb höchstens 14 abgelaufene Nutzer je Lauf, der Rest folgt am nächsten Tag (der Zugang in der App endet unabhängig davon pünktlich).
- Transkripte erfassen die letzten 300 Nachrichten.

## Wenn etwas hakt
- Fehler anzeigen: `npx wrangler tail`, dann die Aktion im Discord wiederholen.
- Bot kann Rolle nicht vergeben: Bot-Rolle muss in der Rollenliste **über** der Zielrolle stehen.
- Ticket/Kanal lässt sich nicht erstellen: Bot braucht „Kanäle verwalten" und „Rollen verwalten".

## Server privat halten (Rolle „User“)
`/setup` legt die Rolle **User** an. Alle Kanäle sind für @everyone unsichtbar – nur wer User, Member, Customer, Tester oder Admin hat, sieht sie. Zugang vergeben/entziehen: `/zugang user:@Name` bzw. mit `entfernen:true`. Die Bot-Rolle muss in den Servereinstellungen über „User“ stehen. Kanäle und Kategorien bekommen Emojis (`📜│rules`); `/setup` benennt vorhandene Kanäle automatisch um.

## Bot v2 (Zahlung, Erinnerung, Rangliste, Rollen)
- `PAYPAL_URL` in `wrangler.toml` auf deinen PayPal.me-Link setzen (z. B. `https://paypal.me/deinname`). Der Bot hängt den Betrag automatisch an.
- Bot-Rolle muss in den Servereinstellungen **über** allen Team-Rollen stehen (Moderator, Supporter, Developer, Top 10 …).
- Danach einmal `/setup` (bei Limit-Hinweis nochmal) ausführen. Neue Befehle: `/rank`, `/admin stats`, `/team`.
- Cron-Jobs: stündlich Ablauf + 3-Tage-Erinnerung, :15/:45 Patchnotes + Status, :30 Rangliste. Alles auf dem kostenlosen Cloudflare-Plan.
- Tabellen/Spalten legt der Worker selbst an (Selbst-Migration), kein manueller SQL-Schritt.

## Giveaways & Ticket-Namen
- `/giveaway start preis dauer [gewinner] [kanal]` (Dauer z. B. `30m`, `2h`, `3d`), `/giveaway ende id`, `/giveaway reroll id [anzahl]`, `/giveaway liste` – nur Team.
- Teilnahme per Button (nochmal klicken = austragen). Ende automatisch (Cron jede Minute), Gewinner bekommen sofort ein privates Ticket + DM.
- Ticket-Kanäle heißen jetzt `thema-name-nr`, z. B. `support-ben-01`, `kauf-ben-02`, `giveaway-ben-01` (Zähler je Thema, sinkt nie).
- Neue Befehle: danach `/register` einmal neu aufrufen.
