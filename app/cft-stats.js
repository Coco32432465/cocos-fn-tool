/* Cocos Tool – Auswertungen über mehrere Games (Trend, Schwächen, Trainingsplan, Landeorte, Rotation)
 * Reine Funktionen auf CFT.games (siehe cft-import.js). Läuft im Browser (window.CFT.stats) und in Node (Tests). */
(function (root) {
  'use strict';
  var CFT = root.CFT || (typeof require === 'function' ? require('./cft-import.js') : {});
  root.CFT = CFT;
  var S = CFT.stats = {};

  var DAY = 864e5;
  var avg = function (a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; };
  var r1 = function (v) { return Math.round(v * 10) / 10; };
  var pl = function (g) { return (g.m && g.m.pl > 0) ? g.m.pl : 0; };
  var ts = function (g) { return g.mtime || 0; };

  S.LABEL = { rot: 'Zu spät rotiert', storm: 'Sturmschaden', early: 'Früher Tod / Hot Drop', alone: 'Allein unterwegs', death: 'Kritischer Fehler', team: 'Mate zu weit weg', spread: 'Team zu weit auseinander', edge: 'Am Zonenrand gestanden', height: 'Höhenvorteil verloren', outnum: 'In Unterzahl gekämpft', lowground: 'Tiefer als die Gegner', range: 'Auf Distanz erwischt', aftermate: 'Nach Mate-Verlust gestorben', lowhp: 'Wenig HP bei Zonenstart', unheal: 'Heilung nicht genutzt' };

  S.sorted = function (games) { return (games || []).filter(function (g) { return g && g.m; }).slice().sort(function (a, b) { return ts(a) - ts(b); }); };

  /** Games der letzten `days` Tage (0/null = alle). `now` nur für Tests. */
  S.period = function (games, days, now) {
    var G = S.sorted(games);
    if (!days) return G;
    var from = (now || Date.now()) - days * DAY;
    return G.filter(function (g) { return ts(g) >= from; });
  };
  S.previous = function (games, days, now) {
    if (!days) return [];
    var n = now || Date.now(), a = n - 2 * days * DAY, b = n - days * DAY;
    return S.sorted(games).filter(function (g) { return ts(g) >= a && ts(g) < b; });
  };

  S.summary = function (G) {
    var places = G.map(pl).filter(function (p) { return p > 0; });
    var ph = [0, 1, 2].map(function (i) { return r1(avg(G.map(function (g) { return (g.ph || [])[i] || 0; }))); });
    return {
      n: G.length, score: r1(avg(G.map(function (g) { return g.tot || 0; }))), ph: ph,
      place: places.length ? r1(avg(places)) : 0, best: places.length ? Math.min.apply(null, places) : 0,
      wins: G.filter(function (g) { return pl(g) === 1; }).length, top10: places.filter(function (p) { return p <= 10; }).length,
      kills: G.reduce(function (s, g) { return s + ((g.m && g.m.k) || 0); }, 0),
      kpg: G.length ? r1(G.reduce(function (s, g) { return s + ((g.m && g.m.k) || 0); }, 0) / G.length) : 0
    };
  };

  /** Verlauf je Game + gleitender Durchschnitt (Fenster w) */
  S.series = function (G, w) {
    w = w || 5;
    return G.map(function (g, i) {
      var win = G.slice(Math.max(0, i - w + 1), i + 1);
      return { t: ts(g), tot: g.tot || 0, ma: r1(avg(win.map(function (x) { return x.tot || 0; }))), place: pl(g), kills: (g.m && g.m.k) || 0, win: pl(g) === 1, name: g.m && g.m.n };
    });
  };

  /** Differenz zur Vorperiode; good = true wenn Veränderung positiv zu werten ist */
  S.delta = function (cur, prev, key, lowerBetter) {
    if (!prev.n || !cur.n || !prev[key] || !cur[key]) return null;
    var d = r1(cur[key] - prev[key]);
    return { d: d, good: lowerBetter ? d < 0 : d > 0, flat: Math.abs(d) < 0.05 };
  };

  /** Häufigste Fehlerarten: Anteil der Games, in denen die Art vorkam */
  S.weaknesses = function (G) {
    var cnt = {}, sev = {};
    G.forEach(function (g) {
      var seen = {};
      (g.mis || (g.m && g.m.mis) || []).forEach(function (x) {
        if (!x || !S.LABEL[x.kind]) return;
        if (!seen[x.kind]) { seen[x.kind] = 1; cnt[x.kind] = (cnt[x.kind] || 0) + 1; sev[x.kind] = (sev[x.kind] || 0) + (x.sev || 0); }
      });
    });
    return Object.keys(cnt).map(function (k) { return { kind: k, label: S.LABEL[k], n: cnt[k], pct: G.length ? Math.round(100 * cnt[k] / G.length) : 0, sev: sev[k] / cnt[k] }; })
      .sort(function (a, b) { return (b.pct * (0.5 + b.sev / 1000)) - (a.pct * (0.5 + a.sev / 1000)); });
  };

  S.PHASES = ['Offspawn', 'Midgame', 'Endgame'];
  S.phases = function (sum) {
    var P = sum.ph.map(function (v, i) { return { name: S.PHASES[i], v: v }; });
    var s = P.slice().sort(function (a, b) { return a.v - b.v; });
    return { list: P, weak: s[0], strong: s[s.length - 1] };
  };

  /** Kurze Textbewertung des Trends (letzte Hälfte vs. erste Hälfte der Games) */
  S.trendText = function (G) {
    if (G.length < 4) return null;
    var h = Math.floor(G.length / 2), a = avg(G.slice(0, h).map(function (g) { return g.tot || 0; })), b = avg(G.slice(h).map(function (g) { return g.tot || 0; }));
    var d = r1(b - a);
    return d >= 2 ? { dir: 'up', d: d } : d <= -2 ? { dir: 'down', d: d } : { dir: 'flat', d: d };
  };

  /* ---------- Landeorte ---------- */
  var hasKind = function (g, k) { return (g.mis || (g.m && g.m.mis) || []).some(function (x) { return x && x.kind === k; }); };
  var meta = function (g) { return (g.real && g.real.meta) || {}; };

  /** Landeorte gruppiert: Anzahl, Ø Note, Ø Platz, Elims, Früh-Tod-Quote, Koordinaten für die Karte */
  S.drops = function (G) {
    var M = {};
    G.forEach(function (g) {
      var me = meta(g), n = me.landName; if (!n) return;
      var o = M[n] || (M[n] = { name: n, c: 0, tot: 0, pl: [], k: 0, early: 0, wins: 0, pts: [], near: me.landNear !== false });
      o.c++; o.tot += g.tot || 0; o.k += (g.m && g.m.k) || 0;
      if (pl(g) > 0) o.pl.push(pl(g));
      if (pl(g) === 1) o.wins++;
      if (hasKind(g, 'early')) o.early++;
      if (me.landPt) o.pts.push(me.landPt);
    });
    return Object.keys(M).map(function (k) {
      var o = M[k];
      return { name: o.name, c: o.c, score: r1(o.tot / o.c), place: o.pl.length ? r1(avg(o.pl)) : 0, kpg: r1(o.k / o.c), wins: o.wins, earlyPct: Math.round(100 * o.early / o.c), pts: o.pts, near: o.near };
    }).sort(function (a, b) { return b.c - a.c || b.score - a.score; });
  };
  /** Beste/schwächste Landung (ab 2 Landungen) und Textempfehlung */
  S.dropAdvice = function (L) {
    var pool = L.filter(function (x) { return x.c >= 2; });
    if (pool.length < 2) return { best: null, worst: null, text: L.length ? 'Landungen werden aussagekräftig, sobald du an einem Ort mindestens zweimal gelandet bist.' : '' };
    var by = pool.slice().sort(function (a, b) { return b.score - a.score; }), best = by[0], worst = by[by.length - 1];
    var t = 'Dein stärkster Landeort ist <b>' + best.name + '</b> (Ø Note ' + r1(best.score / 10) + (best.place ? ', Ø Platz #' + Math.round(best.place) : '') + ').';
    if (worst.name !== best.name && best.score - worst.score >= 5) t += ' Am schwächsten läuft es bei <b>' + worst.name + '</b>' + (worst.earlyPct >= 40 ? ': dort stirbst du in ' + worst.earlyPct + ' % der Games früh. Probier einen ruhigeren Ort.' : ' (Ø Note ' + r1(worst.score / 10) + ').');
    return { best: best, worst: worst, text: t };
  };

  /** Rotation: je Zonenzug Anteil der Games, in denen du rechtzeitig in der nächsten Zone warst */
  S.rotation = function (G) {
    var Z = {}, any = 0, okAll = 0, storm = 0, stormSec = 0, stormN = 0, team = 0;
    G.forEach(function (g) {
      (g.rot || []).forEach(function (r) {
        if (r.ok == null) return;
        var z = Z[r.k] || (Z[r.k] = { k: r.k, n: 0, ok: 0, gap: 0, gapN: 0 });
        z.n++; any++; if (r.ok) { z.ok++; okAll++; }
        if (r.gap != null && r.gap > 0) { z.gap += r.gap; z.gapN++; }
      });
      if (hasKind(g, 'storm')) storm++;
      var ss = meta(g).stormSec; if (ss > 0) { stormSec += ss; stormN++; }
      if (hasKind(g, 'team') || hasKind(g, 'spread')) team++;
    });
    var zones = Object.keys(Z).map(function (k) { var z = Z[k]; return { k: z.k, n: z.n, okPct: Math.round(100 * z.ok / z.n), gapM: z.gapN ? Math.round(z.gap / z.gapN / 100) : 0 }; }).sort(function (a, b) { return a.k - b.k; });
    var weak = zones.filter(function (z) { return z.n >= 2; }).sort(function (a, b) { return a.okPct - b.okPct; })[0] || null;
    var tips = [];
    if (any) {
      var early = zones.filter(function (z) { return z.k <= 3 && z.n >= 2; }), late = zones.filter(function (z) { return z.k >= 6 && z.n >= 2; });
      var lowE = early.length && avg(early.map(function (z) { return z.okPct; })) < 60, lowL = late.length && avg(late.map(function (z) { return z.okPct; })) < 60;
      if (lowE) tips.push('Du rotierst in den frühen Zonen oft zu spät. Starte direkt, wenn die neue Zone erscheint, und nutze die Zeit zum Looten unterwegs.');
      if (lowL) tips.push('In den späten Zonen bist du oft außerhalb der nächsten Zone. Lege vor Zone 6 deine Endposition fest und gehe früh Richtung Innenseite.');
      if (storm >= Math.max(2, G.length * 0.3)) tips.push('In ' + Math.round(100 * storm / G.length) + ' % deiner Games nimmst du Sturmschaden. Fülle vor jedem Zonenzug Heilung auf und plane den Weg zuerst.');
      if (team >= Math.max(2, G.length * 0.3)) tips.push('Dein Team ist oft zu weit auseinander (' + Math.round(100 * team / G.length) + ' % der Games). Rotiert gemeinsam und sagt den Weg an.');
      if (!tips.length) tips.push('Deine Rotation ist solide. Achte weiter auf den hohen Layer in den späten Zonen.');
    }
    return { n: any, okPct: any ? Math.round(100 * okAll / any) : 0, zones: zones, weak: weak, stormPct: G.length ? Math.round(100 * storm / G.length) : 0, stormSecAvg: stormN ? Math.round(stormSec / stormN) : 0, teamPct: G.length ? Math.round(100 * team / G.length) : 0, tips: tips };
  };

  /* ---------- Training: Übungen je Fehlerart, fertige Pläne, Auto-Plan ---------- */
  S.DRILLS = {
    rot: { goal: 'Rechtzeitig in der nächsten Zone sein', tasks: ['Öffne bei jedem Zonenzug sofort die Map und lege dein nächstes Ziel fest', 'Starte die Rotation, wenn die neue Zone erscheint, nicht erst wenn der Sturm näher kommt', 'Spiele 3 Games und peile immer die Innenseite des Kreises an', 'Schau nach jedem Game im Replay, bei welchem Zonenzug du zu spät warst'] },
    storm: { goal: 'Keinen Schaden mehr im Sturm nehmen', tasks: ['Fülle vor jedem Zonenzug Heilung und Schild auf', 'Merke dir die Sturm-Timer: bei Zonenstart sofort loslaufen', 'Plane den Weg vor dem Loot: erst Ziel, dann Items', 'Spiele 3 Games ohne einen Tick Sturmschaden'] },
    early: { goal: 'Die erste Minute überleben', tasks: ['Lande 3 Games an einem ruhigeren Ort (siehe Landung & Rotation)', 'Hol dir zuerst Waffe und Heilung, bevor du den ersten Fight nimmst', 'Nimm Fights in der ersten Minute nur, wenn dein Mate in der Nähe ist', 'Prüfe im Replay, wie viele Gegner beim Landen in 150 m waren'] },
    alone: { goal: 'Nie allein gegen mehrere kämpfen', tasks: ['Bleib in den ersten 5 Minuten unter 40 m zu deinem Mate', 'Sag vor jeder Rotation an, wohin ihr lauft', 'Warte vor dem Fight kurz auf deinen Mate und lass ihn mitschießen', 'Spiele 3 Games, in denen ihr beim ersten Fight beide dabei seid'] },
    team: { goal: 'Näher an deinem Mate bleiben', tasks: ['Bleib in den ersten 5 Minuten unter 40 m zu deinem Mate', 'Rotiert gemeinsam und sagt den Weg an', 'Benutze Pings für Gegner, Loot und Ziel', 'Prüfe im Replay die Stelle, an der ihr euch getrennt habt'] },
    spread: { goal: 'Das Team zusammenhalten', tasks: ['Rotiert gemeinsam und sagt den Weg an', 'Bleibt im Midgame unter 70 m Abstand', 'Teilt Heilung und Mats, bevor ihr trennt', 'Spielt 3 Games mit der festen Regel: beide in der gleichen Zone'] },
    aftermate: { goal: 'Nach einem Verlust nicht sofort in den nächsten Fight', tasks: ['Resette nach jedem Down: heilen, Mats prüfen, Deckung suchen', 'Gib bei Unterzahl Position auf statt zu pushen', 'Sammle den Loot deines Mates ein, bevor du weiterläufst', 'Prüfe im Replay, was direkt nach dem Verlust passierte'] },
    death: { goal: 'Bessere Entscheidungen vor Fights', tasks: ['Prüfe vor jedem Fight Zone, Heilung und Deckung', 'Nimm nur Fights, in denen du Höhe oder Deckung hast', 'Reviewe nach jedem Tod eine Minute: Was war die Entscheidung?', 'Spiele 3 Games mit der Regel: lieber resetten als pushen'] },
    edge: { goal: 'Besser in der Zone stehen', tasks: ['Stell dich in den späten Zonen auf die Innenseite des Kreises', 'Bleib nicht am Rand stehen, wenn der Kreis sich schließt', 'Lege vor Zone 6 deine Endposition fest', 'Prüfe im Replay, wie weit du am Zonenrand warst'] },
    height: { goal: 'Den hohen Layer halten', tasks: ['Nimm vor Fights zuerst Höhe: Rampe oder Gelände', 'Sammle ab Zone 5 genug Mats für Höhe (mind. 300)', 'Halte den hohen Layer, auch wenn ein Gegner pusht', 'Prüfe im Replay, wann die Gegner höher standen'] },
    lowground: { goal: 'Nie tiefer als die Gegner kämpfen', tasks: ['Nimm vor Fights zuerst Höhe: Rampe oder Gelände', 'Lauf nicht frontal gegen höhere Gegner an', 'Wechsle die Position, statt unten zu bleiben', 'Prüfe im Replay, wo die Gegner höher standen als du'] },
    outnum: { goal: 'Keine Fights in Unterzahl', tasks: ['Zähle vor dem Fight die Gegner und pinge sie', 'Geh bei Unterzahl raus, statt zu pushen', 'Warte auf deinen Mate, bevor du anfängst', 'Prüfe im Replay, wie viele Gegner in der Nähe waren'] },
    range: { goal: 'Nicht auf Distanz erwischt werden', tasks: ['Laufe von Deckung zu Deckung, nicht über offenes Gelände', 'Baue beim Kreuzen eine Wand', 'Weiche Snipern aus, statt zurück zu schießen', 'Prüfe im Replay, wo du offen gerannt bist'] },
    lowhp: { goal: 'Mit vollen Werten in jeden Zonenzug', tasks: ['Fülle vor jedem Zonenzug auf 100 HP und 100 Schild', 'Behalte immer mindestens 2 Heilitems', 'Heile nach jedem Fight, bevor du weiterläufst', 'Zähle im Replay, bei welchen Zonen du zu wenig HP hattest'] },
    unheal: { goal: 'Heilung nutzen, bevor du stirbst', tasks: ['Heile bei unter 70 HP sofort, bevor du etwas anderes machst', 'Lege Heilung auf feste Hotkeys', 'Heile nach jedem Fight, nicht erst vor dem nächsten', 'Prüfe im Replay, wann du Heilung übrig hattest'] }
  };

  S.PRESETS = [
    { id: 'aim', name: 'Aim & Tracking', blurb: 'Treffsicherheit und Crosshair-Kontrolle, 10 Minuten am Tag', tasks: ['Mache vor jeder Session 5 Minuten Aim-Aufwärmen (Flicks und Tracking)', 'Spiele 1 Game nur mit bewusstem Crosshair auf Kopfhöhe', 'Ändere diese Woche deine Sensitivity nicht', 'Reviewe 3 verlorene Fights: Warum hast du nicht getroffen?', 'Spiele 3 Games und schau, wie viele Schüsse du auf Distanz wirklich triffst'] },
    { id: 'rotation', name: 'Rotation', blurb: 'Früh und sicher durch jede Zone', tasks: ['Öffne bei jedem Zonenzug sofort die Map', 'Spiele 5 Games und peile immer die Innenseite des Kreises an', 'Fülle vor jedem Zonenzug Heilung und Schild auf', 'Reviewe die Rotation in Zone 5 bis 8 im Replay', 'Spiele 3 Games ohne Sturmschaden'] },
    { id: 'endgame', name: 'Endgame', blurb: 'Bessere Positionen in den letzten Zonen', tasks: ['Sammle vor Zone 5 mindestens 300 Mats', 'Nimm ab Zone 6 früh Höhe', 'Kämpfe im Endgame nur, wenn dein Mate nah ist', 'Spiele 3 Runden mit Fokus auf die Endposition', 'Reviewe jedes Endgame: Wer hatte die Höhe?'] },
    { id: 'team', name: 'Team-Play', blurb: 'Zusammen spielen statt allein verlieren', tasks: ['Bleib in den ersten 5 Minuten unter 40 m zu deinem Mate', 'Sagt vor jeder Rotation an, wohin ihr lauft', 'Benutze Pings für Gegner, Loot und Ziel', 'Teilt Heilung und Mats gleichmäßig', 'Reviewe, wann ihr euch getrennt habt'] },
    { id: 'boxfight', name: 'Boxfights & Edits', blurb: 'Nahkampf, Edits und schnelle Entscheidungen', tasks: ['Mache täglich 10 Minuten Edit-Aufwärmen', 'Spiele 5 Boxfights gegen Freunde oder in einer Übungsumgebung', 'Übe Reset-Edits: raus aus der Box, neue Wand, wieder rein', 'Benutze im Fight bewusst eine Wand pro Schuss-Wechsel', 'Reviewe 3 Nahkämpfe: Wer hat zuerst gebaut?'] }
  ];

  S.weekKey = function (now) { var d = new Date(now || Date.now()); var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + Math.ceil(((t - y0) / DAY + 1) / 7); };

  /** Auto-Plan aus den häufigsten Fehlern (max. 3). Ohne ausreichend Daten: null. */
  S.autoPlan = function (games, now) {
    var G = S.period(games, 30, now); if (G.length < 3) G = S.sorted(games);
    if (G.length < 3) return null;
    var W = S.weaknesses(G).filter(function (w) { return S.DRILLS[w.kind] && w.pct >= 20; }).slice(0, 3);
    if (!W.length) return null;
    return {
      type: 'auto', name: 'Dein Wochenplan', started: now || Date.now(), week: S.weekKey(now),
      items: W.map(function (w) {
        var D = S.DRILLS[w.kind];
        return { id: w.kind, title: w.label, goal: D.goal + ': von ' + w.pct + ' % auf unter ' + Math.max(5, Math.round(w.pct * 0.6)) + ' % der Games', kind: w.kind, base: w.pct, target: Math.max(5, Math.round(w.pct * 0.6)), tasks: D.tasks.slice(0, 3).map(function (t) { return { t: t, done: false }; }) };
      })
    };
  };
  S.presetPlan = function (id, now) {
    var P = S.PRESETS.filter(function (p) { return p.id === id; })[0]; if (!P) return null;
    return { type: 'preset', name: P.name, started: now || Date.now(), week: S.weekKey(now), items: [{ id: P.id, title: P.name, goal: P.blurb, tasks: P.tasks.map(function (t) { return { t: t, done: false }; }) }] };
  };
  /** Fortschritt: erledigte Aufgaben + Fehlerquote seit Planstart (ab 3 neuen Games) */
  S.planProgress = function (plan, games) {
    var total = 0, done = 0;
    plan.items.forEach(function (it) { it.tasks.forEach(function (t) { total++; if (t.done) done++; }); });
    var G = S.sorted(games).filter(function (g) { return (g.mtime || 0) >= plan.started; });
    var items = plan.items.map(function (it) {
      if (!it.kind) return { id: it.id, now: null };
      if (G.length < 3) return { id: it.id, now: null, need: 3 - G.length };
      var w = S.weaknesses(G).filter(function (x) { return x.kind === it.kind; })[0], pct = w ? w.pct : 0;
      return { id: it.id, now: pct, n: G.length, good: pct < it.base, reached: pct <= it.target };
    });
    return { total: total, done: done, pct: total ? Math.round(100 * done / total) : 0, items: items, newGames: G.length };
  };

  /** Letzte Session = Games mit höchstens `gapMin` Minuten Abstand (Standard 90). Liefert Zusammenfassung, beste/schlechteste Runde, 2 größte Fehler, Ziel. */
  S.session = function (games, gapMin) {
    var G = S.sorted(games); if (!G.length) return null;
    var gap = (gapMin || 90) * 60000, a = G.length - 1;
    while (a > 0 && ts(G[a]) - ts(G[a - 1]) <= gap) a--;
    var L = G.slice(a), sum = S.summary(L);
    var best = L[0], worst = L[0];
    L.forEach(function (g) { if ((g.tot || 0) > (best.tot || 0)) best = g; if ((g.tot || 0) < (worst.tot || 0)) worst = g; });
    var W = S.weaknesses(L).slice(0, 2), top = W[0] && S.DRILLS[W[0].kind];
    var goal = top ? top.goal + ' (häufigster Fehler: ' + W[0].label + ')' : (sum.n >= 2 ? 'Halte deine Note stabil und versuche, die schwächste Phase anzuheben.' : 'Spiele mehr Games, damit ich Muster erkennen kann.');
    return { games: L, n: L.length, from: ts(L[0]), to: ts(L[L.length - 1]), sum: sum, best: best, worst: worst, mistakes: W, goal: goal,
      curve: sum.ph, same: best === worst };
  };

  /** Vergleich mit der Community: mine = S.summary, ref = {avgScore, avgPlace, kpg, winPct}. */
  S.compare = function (sum, ref) {
    if (!sum || !sum.n || !ref) return [];
    var wp = r1(100 * sum.wins / sum.n);
    return [
      { key: 'score', label: 'Ø Note', mine: sum.score, ref: r1(ref.avgScore), unit: '', scale: 100, lower: false, div: 10 },
      { key: 'place', label: 'Ø Platz', mine: sum.place, ref: r1(ref.avgPlace), unit: '#', scale: 100, lower: true, div: 1 },
      { key: 'kpg', label: 'Elims pro Game', mine: sum.kpg, ref: r1(ref.kpg), unit: '', scale: 10, lower: false, div: 1 },
      { key: 'win', label: 'Siegquote', mine: wp, ref: r1(ref.winPct), unit: '', suffix: ' %', scale: 100, lower: false, div: 1 }
    ].filter(function (x) { return x.mine && x.ref; }).map(function (x) {
      x.better = x.lower ? x.mine < x.ref : x.mine > x.ref; x.diff = r1(Math.abs(x.mine - x.ref) / x.div); return x;
    });
  };

  /** Team: das teilt ein Spieler mit seinem Coach (nur Gesamtwerte, keine Replays). Nur echte Runden. */
  S.teamPayload = function (games) {
    var G = S.sorted((games || []).filter(function (g) { return g && g.real; })); if (!G.length) return null;
    var sum = S.summary(G);
    return { games: sum.n, avgScore: sum.score, wins: sum.wins, kills: sum.kills, avgPlace: sum.place, bestPlace: sum.best,
      weak: S.weaknesses(G).slice(0, 3).map(function (w) { return { kind: w.kind, pct: w.pct }; }),
      trend: G.slice(-12).map(function (g) { return Math.round(g.tot || 0); }) };
  };

  /** Team-Auswertung fuer den Coach: Durchschnitt, Staerkster/Schwaechster, gemeinsame Schwaeche. members = [{name, stats}] */
  S.teamInsight = function (members) {
    var M = (members || []).filter(function (m) { return m && m.stats && m.stats.games > 0; });
    if (!M.length) return null;
    var av = r1(avg(M.map(function (m) { return m.stats.avgScore; })));
    var byScore = M.slice().sort(function (a, b) { return b.stats.avgScore - a.stats.avgScore; });
    var cnt = {};
    M.forEach(function (m) { (m.stats.weak || []).slice(0, 2).forEach(function (w) { if (S.LABEL[w.kind]) cnt[w.kind] = (cnt[w.kind] || 0) + 1; }); });
    var kinds = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
    var shared = kinds.length && cnt[kinds[0]] >= 2 ? { kind: kinds[0], label: S.LABEL[kinds[0]], count: cnt[kinds[0]], total: M.length } : null;
    function slope(t) { return t && t.length >= 4 ? r1(avg(t.slice(-3)) - avg(t.slice(0, 3))) : 0; }
    return { n: M.length, avg: av, best: byScore[0], worst: byScore.length > 1 ? byScore[byScore.length - 1] : null, shared: shared,
      rising: M.map(function (m) { return { m: m, d: slope(m.stats.trend) }; }).sort(function (a, b) { return b.d - a.d; })[0] };
  };

  /* ---------- Season-Pass: Aufgaben, XP, Level (kalendermonatlich, Berlin-Zeit). Belohnungs-Tage holt der Server ab. ---------- */
  var BERLIN = null;
  function berlinParts(t) {
    try {
      BERLIN = BERLIN || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
      var p = {}; BERLIN.formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
      return { y: +p.year, m: +p.month, d: +p.day };
    } catch (e) { var d = new Date(t); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; }
  }
  S.seasonId = function (t) { var b = berlinParts(t == null ? Date.now() : t); return b.y + '-' + (b.m < 10 ? '0' : '') + b.m; };
  S.seasonDaysLeft = function (t) { var b = berlinParts(t == null ? Date.now() : t); return new Date(Date.UTC(b.y, b.m, 0)).getUTCDate() - b.d + 1; };
  S.LEVEL_XP = 100; S.MAX_LEVEL = 10; S.PASS_BOOST = 1.25;
  S.PASS = [ // Level -> Belohnung. days = Bonustage (Server), theme/title = Kosmetik (bleibt dauerhaft)
    { lvl: 1, free: { type: 'title', id: 'Rookie' } },
    { lvl: 2, free: { type: 'theme', id: 'neon', label: 'Neon Pink' }, prem: { type: 'theme', id: 'sunset', label: 'Sunset' } },
    { lvl: 3, free: { type: 'days', days: 1 } },
    { lvl: 4, free: { type: 'title', id: 'Grinder' }, prem: { type: 'title', id: 'Season Elite' } },
    { lvl: 5, free: { type: 'theme', id: 'cyan', label: 'Cyan' } },
    { lvl: 6, free: { type: 'days', days: 1 }, prem: { type: 'theme', id: 'ice', label: 'Ice' } },
    { lvl: 7, free: { type: 'title', id: 'Veteran' } },
    { lvl: 8, free: { type: 'theme', id: 'toxic', label: 'Toxic' }, prem: { type: 'title', id: 'Legende' } },
    { lvl: 9, free: { type: 'title', id: 'Elite' } },
    { lvl: 10, free: { type: 'days', days: 2 }, prem: { type: 'theme', id: 'prism', label: 'Prism' } }
  ];
  S.SEASON_TASKS = [
    { id: 'analyze', title: 'Replays analysieren', unit: 'Replays', tiers: [[10, 60], [25, 100], [50, 140]] },
    { id: 'wins', title: 'Siege holen', unit: 'Siege', tiers: [[1, 60], [3, 100], [6, 140]] },
    { id: 'top10', title: 'Top-10-Platzierungen', unit: 'Top 10', tiers: [[5, 40], [15, 80], [30, 120]] },
    { id: 'elims', title: 'Elims sammeln', unit: 'Elims', tiers: [[20, 40], [60, 80], [120, 120]] },
    { id: 'score', title: 'Ø Note der letzten 10 Games', unit: 'Ø Note', tiers: [[55, 50], [65, 80], [75, 120]] },
    { id: 'streak', title: 'Tage in Folge gespielt', unit: 'Tage', tiers: [[2, 40], [4, 70], [7, 110]] },
    { id: 'clean', title: 'Games ohne erkannten Fehler', unit: 'Games', tiers: [[3, 50], [8, 90], [15, 130]] },
    { id: 'team', title: 'Einem Team beitreten', unit: '', tiers: [[1, 50]] }
  ];
  /** Fortschritt in der aktuellen Season. opts: { now, premium, teamIn } */
  S.season = function (games, opts) {
    opts = opts || {}; var now = opts.now == null ? Date.now() : opts.now, id = S.seasonId(now);
    var G = S.sorted((games || []).filter(function (g) { return g && g.real && g.m && S.seasonId(ts(g)) === id; }));
    var days = {}; G.forEach(function (g) { var b = berlinParts(ts(g)); days[b.y * 10000 + b.m * 100 + b.d] = Date.UTC(b.y, b.m - 1, b.d); });
    var keys = Object.keys(days).map(function (k) { return days[k]; }).sort(function (a, b) { return a - b; }), best = 0, run = 0;
    keys.forEach(function (d, i) { run = i && d - keys[i - 1] === DAY ? run + 1 : 1; if (run > best) best = run; });
    var last10 = G.slice(-10), V = {
      analyze: G.length, wins: G.filter(function (g) { return pl(g) === 1; }).length, top10: G.filter(function (g) { return pl(g) > 0 && pl(g) <= 10; }).length,
      elims: G.reduce(function (s, g) { return s + ((g.m && g.m.k) || 0); }, 0), score: last10.length >= 5 ? r1(avg(last10.map(function (g) { return g.tot || 0; }))) : 0,
      streak: best, clean: G.filter(function (g) { var m = g.mis || (g.m && g.m.mis); return Array.isArray(m) && m.length === 0; }).length, team: opts.teamIn ? 1 : 0
    };
    var base = 0, tasks = S.SEASON_TASKS.map(function (t) {
      var v = V[t.id] || 0, xp = 0, next = null;
      var tiers = t.tiers.map(function (x) { var done = v >= x[0]; if (done) xp += x[1]; else if (!next) next = x; return { need: x[0], xp: x[1], done: done }; });
      base += xp; return { id: t.id, title: t.title, unit: t.unit, value: v, tiers: tiers, xp: xp, next: next ? { need: next[0], xp: next[1] } : null };
    });
    var xp = Math.round(base * (opts.premium ? S.PASS_BOOST : 1)), cap = S.MAX_LEVEL * S.LEVEL_XP;
    var level = Math.min(S.MAX_LEVEL, Math.floor(xp / S.LEVEL_XP));
    return { id: id, daysLeft: S.seasonDaysLeft(now), games: G.length, tasks: tasks, base: base, xp: xp, level: level, premium: !!opts.premium,
      into: level >= S.MAX_LEVEL ? S.LEVEL_XP : xp - level * S.LEVEL_XP, pct: Math.min(100, Math.round(100 * xp / cap)), max: level >= S.MAX_LEVEL };
  };
  /** Kosmetik, die zu Level/Premium freigeschaltet ist: { themes: [...], titles: [...] } */
  S.passCosmetics = function (level, premium) {
    var out = { themes: [], titles: [] };
    S.PASS.forEach(function (r) {
      if (r.lvl > level) return;
      [r.free, premium ? r.prem : null].forEach(function (x) { if (!x) return; if (x.type === 'theme') out.themes.push(x.id); if (x.type === 'title') out.titles.push(x.id); });
    });
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CFT;
})(typeof window !== 'undefined' ? window : globalThis);
