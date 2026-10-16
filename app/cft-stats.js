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

  if (typeof module !== 'undefined' && module.exports) module.exports = CFT;
})(typeof window !== 'undefined' ? window : globalThis);
