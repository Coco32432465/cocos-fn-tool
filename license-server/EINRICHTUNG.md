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

## 7. Commands und Ticket-Panel anlegen (einmalig)
Im Browser öffnen (mit deinem Setup-Passwort):
```
https://cft-license.DEINNAME.workers.dev/setup?secret=DEIN_SETUP_PASSWORT
```
Es sollte `{"commands":"ok","panel":"ok"}` erscheinen. In #key-kaufen steht jetzt die Nachricht mit dem Button **Key kaufen**, und die Slash-Commands sind da.
Rufe diese Adresse **nicht nochmal** auf, sonst steht das Panel doppelt da.

## 8. Testen
1. Klick auf **Key kaufen** → ein privates Ticket entsteht.
2. Im Ticket: `/key plan:1 Woche` → der Bot postet den Key, vergibt die Rolle Customer und schickt eine DM.
3. Ticket mit dem Button schließen.

## Befehle (nur für dich)
| Befehl | Wirkung |
|---|---|
| `/key plan:… [user:…]` | Key erzeugen (im Ticket ohne `user`). Hat der Nutzer schon einen, wird dieser verlängert. |
| `/revoke key:…` | Key sperren, Rolle entziehen |
| `/reset-device key:…` | Gerätebindung lösen (neuer PC) |
| `/keys [user:…]` | Keys und Status anzeigen |

Stündlich entzieht der Server automatisch die Rolle bei abgelaufenen Keys.

## Wenn etwas hakt
- Fehler anzeigen: `npx wrangler tail`, dann die Aktion im Discord wiederholen.
- Bot kann Rolle nicht vergeben: Bot-Rolle muss in der Rollenliste **über** Customer stehen.
- Ticket lässt sich nicht erstellen: Bot braucht „Kanäle verwalten" und Zugriff auf die Kategorie Tickets.
