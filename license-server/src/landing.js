// Landing-Page unter der Worker-Adresse (/): Banner, Download, Funktionen, Screenshots, Preise. Preise kommen aus der Konfiguration.
import { price } from './util.js';

const RAW = 'https://raw.githubusercontent.com/Coco32432465/cocos-fn-tool/main/';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const INVITE = 'https://discord.gg/6Ae38TFHNT';

const FEATURES = [
  ['🎬', 'VOD Review mit KI-Analyse', 'Lade dein Replay und sieh die ganze Runde auf der Karte: Zone, Rotation, Fights und Schaden. Die App zeigt deine Fehler mit Zeitpunkt und sagt dir, was besser geht.'],
  ['📈', 'Fortschritt und Trainingsplan', 'Note pro Phase, Trend über Wochen, Session-Zusammenfassung und ein Trainingsplan, der auf deine größte Schwäche zielt.'],
  ['🏆', 'Rangliste und Wochen-Cup', 'Miss dich mit der Community. Jeden Montag gewinnt Platz 1 im Cup Bonustage auf seinen Key.'],
  ['🎡', 'Season-Pass und Daily Spin', 'Jeden Monat neue Aufgaben, Level, Farbschemata und Titel. Einmal am Tag drehen für Bonus-XP.'],
  ['👥', 'Coach und Team', 'Mit der Team-Lizenz siehst du als Coach die Werte deiner Spieler und die gemeinsame Team-Schwäche.'],
  ['⚡', 'PC-Check und Tweaks', 'Der Check zeigt gratis, was dich FPS kostet. Mit dem Tweak-Paket stellt die App alles per Klick um und kann es jederzeit zurücksetzen.']
];
const SHOTS = [['viewer', 'Replay Viewer mit Live-Analyse'], ['progress', 'Trend deiner Gesamtnote'], ['menu', 'Hauptmenü mit allen Modi'], ['season', 'Season-Pass']];

export function landingHtml(env) {
  const dl = '/download', dc = env.DISCORD_INVITE || INVITE;
  const plans = [
    ['1 Woche', price(env, 'week'), 'Zum Reinschnuppern', ['VOD Review und alle Modi', '1 Gerät pro Key'], false],
    ['1 Monat', price(env, 'month'), 'Am beliebtesten', ['VOD Review und alle Modi', 'Rangliste, Cup und Season-Pass', '1 Gerät pro Key'], true],
    ['Team-Lizenz', price(env, 'team'), 'pro Monat', ['5 Keys für dein Team', 'Coach-Dashboard', 'Gemeinsame Team-Schwäche'], false]
  ];
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ninjago Tools · Fortnite VOD Review</title>
<meta name="description" content="Ninjago Tools analysiert deine Fortnite-Replays: Fehler, Rotation, Fights und Fortschritt. 3 Tage gratis testen.">
<meta property="og:title" content="Ninjago Tools · Fortnite VOD Review"><meta property="og:description" content="Replays analysieren, Fehler finden, besser werden. 3 Tage gratis testen."><meta property="og:image" content="${RAW}docs/landing/viewer.jpg">
<link rel="icon" href="${RAW}app/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#0A0A0C;--panel:#111118;--line:rgba(59,130,246,.22);--acc:#3b82f6;--acc2:#60a5fa;--txt:#e8e8ee;--mute:#9a9aa8}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{background:radial-gradient(120% 60% at 50% -10%,rgba(59,130,246,.18),transparent 60%),var(--bg);color:var(--txt);font:500 18px/1.5 Rajdhani,system-ui,sans-serif}
a{color:inherit}.w{max-width:1160px;margin:0 auto;padding:0 16px}
nav{display:flex;align-items:center;gap:16px;padding:18px 0}nav .lg{display:flex;align-items:center;gap:10px;font:900 18px Orbitron,sans-serif;letter-spacing:.08em;text-decoration:none}nav .lg img{width:34px;height:34px}nav .lg b{color:var(--acc)}
nav .sp{flex:1}nav a.l{color:var(--mute);text-decoration:none;font-weight:600}nav a.l:hover{color:#fff}@media(max-width:640px){nav a.l{display:none}}
.btn{display:inline-flex;align-items:center;gap:8px;font:800 14px Orbitron,sans-serif;letter-spacing:.1em;text-transform:uppercase;padding:15px 22px;border-radius:10px;text-decoration:none;border:1px solid var(--acc);transition:transform .15s}
.btn:hover{transform:translateY(-2px)}.btn.p{background:var(--acc);color:#fff;box-shadow:0 0 28px rgba(59,130,246,.45)}.btn.g{background:transparent;color:var(--acc2)}.btn.s{padding:10px 16px;font-size:12px}
.hero{text-align:center;padding:40px 0 30px}.hero .bn{width:100%;max-width:900px;border-radius:16px;border:1px solid var(--line);box-shadow:0 20px 80px rgba(59,130,246,.18)}
h1{font:900 clamp(30px,6vw,58px)/1.1 Orbitron,sans-serif;letter-spacing:.03em;margin:30px 0 14px;color:#fff}h1 span{color:var(--acc);text-shadow:0 0 30px rgba(59,130,246,.7)}
.hero p{color:var(--mute);font-size:21px;max-width:680px;margin:0 auto 26px}.cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.hint{margin-top:14px;color:var(--mute);font-size:15px}
section{padding:60px 0}h2{font:900 clamp(22px,3.5vw,32px) Orbitron,sans-serif;color:#fff;text-align:center;margin-bottom:10px}.sub{text-align:center;color:var(--mute);margin-bottom:34px}
.ft{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}.ft div{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px}
.ft i{font-style:normal;font-size:30px}.ft h3{font:800 16px Orbitron,sans-serif;color:#fff;margin:10px 0 6px;letter-spacing:.03em}.ft p{color:var(--mute);font-size:17px}
.sh{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}@media(max-width:760px){.sh{grid-template-columns:1fr}}
.sh figure{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden}.sh img{display:block;width:100%;height:auto;aspect-ratio:16/10;object-fit:cover}.sh figcaption{padding:10px 14px;color:var(--mute);font-size:15px}
.pr{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:stretch}
.pl{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px;display:flex;flex-direction:column;gap:10px}.pl.top{border-color:var(--acc);box-shadow:0 0 40px rgba(59,130,246,.25)}
.pl small{color:var(--acc2);font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:13px}.pl h3{font:800 18px Orbitron,sans-serif;color:#fff}.pl b{font:900 38px Orbitron,sans-serif;color:#fff}
.pl ul{list-style:none;color:var(--mute);flex:1}.pl li{padding:4px 0}.pl li::before{content:"✓ ";color:var(--acc2)}
.ex{margin-top:18px;text-align:center;color:var(--mute)}.ex b{color:#fff}
.st{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;counter-reset:s}.st div{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px}
.st div::before{counter-increment:s;content:counter(s);display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--acc);color:#fff;font:900 15px Orbitron,sans-serif;margin-bottom:10px}
.st h3{font:800 15px Orbitron,sans-serif;color:#fff;margin-bottom:6px}.st p{color:var(--mute);font-size:17px}
footer{border-top:1px solid var(--line);padding:30px 0 50px;color:var(--mute);font-size:15px;text-align:center}footer a{color:var(--acc2)}
</style></head><body>
<div class="w">
<nav><a class="lg" href="#"><img src="${RAW}app/icon.png" alt="">NINJAGO <b>TOOLS</b></a><span class="sp"></span><a class="l" href="#funktionen">Funktionen</a><a class="l" href="#preise">Preise</a><a class="btn s g" href="${esc(dc)}" rel="noopener">Discord</a></nav>
<header class="hero">
<img class="bn" src="${RAW}app/banner-ninjago.gif" alt="Ninjago Tools Banner" width="900" height="300">
<h1>Werde besser in <span>Fortnite</span></h1>
<p>Ninjago Tools analysiert deine Replays: Fehler, Rotation, Fights und Fortschritt. Du siehst genau, wo deine Runden kippen und woran du arbeiten musst.</p>
<div class="cta"><a class="btn p" href="${dl}">📥 Kostenlos herunterladen</a><a class="btn g" href="${esc(dc)}" rel="noopener">🎁 3 Tage gratis testen</a></div>
<div class="hint">Windows 10/11 · Den Probe-Key für 3 Tage gibt es im Discord, einmal pro Person</div>
</header>
<section id="funktionen"><h2>Alles für deine nächste Runde</h2><p class="sub">Ein Tool für Review, Training und Community.</p>
<div class="ft">${FEATURES.map(f => `<div><i>${f[0]}</i><h3>${esc(f[1])}</h3><p>${esc(f[2])}</p></div>`).join('')}</div></section>
<section id="screenshots"><h2>So sieht es aus</h2><p class="sub">Echte Ansichten aus der App.</p>
<div class="sh">${SHOTS.map(s => `<figure><img src="${RAW}docs/landing/${s[0]}.jpg" alt="${esc(s[1])}" loading="lazy" width="1440" height="900"><figcaption>${esc(s[1])}</figcaption></figure>`).join('')}</div></section>
<section id="preise"><h2>Preise</h2><p class="sub">Die Laufzeit startet erst, wenn du den Key einlöst. Bezahlt wird sicher im Discord-Ticket.</p>
<div class="pr">${plans.map(p => `<div class="pl${p[4] ? ' top' : ''}"><small>${esc(p[2])}</small><h3>${esc(p[0])}</h3><b>${esc(p[1])}</b><ul>${p[3].map(x => `<li>${esc(x)}</li>`).join('')}</ul><a class="btn ${p[4] ? 'p' : 'g'}" href="${esc(dc)}" rel="noopener">Im Discord kaufen</a></div>`).join('')}</div>
<p class="ex">Extras: <b>Tweak-Paket</b> ${esc(price(env, 'tweaks'))} einmalig · <b>Season-Pass Premium</b> ${esc(price(env, 'pass'))} pro Season</p></section>
<section id="start"><h2>In 3 Schritten zur ersten Review</h2><p class="sub">Dauert nur ein paar Minuten.</p>
<div class="st"><div><h3>App laden</h3><p>Setup starten. Zeigt Windows eine Warnung, klick auf <b>Weitere Informationen</b> und dann <b>Trotzdem ausführen</b>. Die App ist nur noch nicht signiert.</p></div>
<div><h3>Mit Discord verbinden</h3><p>Ein Klick in der App, im Browser bestätigen, fertig.</p></div>
<div><h3>Key einlösen</h3><p>Probe-Key für 3 Tage oder gekauften Key eingeben, Replay wählen und loslegen.</p></div></div>
<div class="cta" style="margin-top:28px"><a class="btn p" href="${dl}">📥 Jetzt herunterladen</a></div></section>
<footer>Ninjago Tools · Deine Replays bleiben auf deinem PC · Fragen? <a href="${esc(dc)}" rel="noopener">Komm in den Discord</a><br>Nicht verbunden mit Epic Games. Fortnite ist eine Marke von Epic Games, Inc.</footer>
</div></body></html>`;
}
