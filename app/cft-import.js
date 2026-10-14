/* Coco's Fn Tool – Import & Analyse für das ReplayDump-Format "cft-1"
 *
 * Wandelt die JSON-Ausgabe von ReplayDump.exe in das interne Modell um, das Viewer und
 * Cup-Report nutzen. Alles hier arbeitet in Weltkoordinaten (cm); erst CFT.proj() rechnet auf die
 * Kartenbild-Koordinaten (0..1) um.
 *
 * Läuft im Browser (window.CFT) und in Node (module.exports) – letzteres für Tests.
 */
(function (root) {
  'use strict';

  var CFT = root.CFT || {};
  root.CFT = CFT;
  CFT.games = CFT.games || [];
  CFT.myName = CFT.myName || '';

  /* ------------------------------------------------------------------ Kalibrierung */
  var DEFAULT_H = 131072;
  CFT.cal = CFT.cal || { swap: false, fx: false, fy: false, H: 131072, ox: 0, oy: 0, saved: false };
  try {
    if (root.localStorage) {
      var sv = JSON.parse(root.localStorage.getItem('cft_cal3') || 'null');
      if (sv && sv.H) { for (var k in sv) CFT.cal[k] = sv[k]; CFT.cal.saved = true; }
    }
  } catch (e) { /* ohne Speicher weiterarbeiten */ }

  CFT.saveCal = function () {
    CFT.cal.saved = true;
    try { root.localStorage.setItem('cft_cal3', JSON.stringify(CFT.cal)); } catch (e) { /* egal */ }
  };

  /** Weltkoordinate (cm) -> Position auf dem Kartenbild (0..1) */
  CFT.proj = function (x, y) {
    var c = CFT.cal, H = c.H || DEFAULT_H, u = x / H, v = y / H, t;
    if (c.swap) { t = u; u = v; v = t; }
    if (c.fx) u = -u;
    if (c.fy) v = -v;
    return [(u + 1) / 2 + (c.ox || 0), (v + 1) / 2 + (c.oy || 0)];
  };
  /** Länge in Weltkoordinaten -> Länge im Kartenbild (0..1) */
  CFT.len = function (l) { return l / (2 * (CFT.cal.H || DEFAULT_H)); };

  /* ------------------------------------------------------------------ Helfer */
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d === undefined ? null : d); }
  function fmt(t) {
    t = Math.max(0, t);
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  CFT.fmt = fmt;
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function lerp(a, b, u) { return a + (b - a) * u; }

  /** Index des letzten Punktes mit pts[i][0] <= t (oder 0) */
  function idxAt(pts, t) {
    var lo = 0, hi = pts.length - 1;
    if (t <= pts[0][0]) return 0;
    if (t >= pts[hi][0]) return hi;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (pts[m][0] <= t) lo = m; else hi = m; }
    return lo;
  }
  function posAt(p, t) {
    var a = p.pts, n = a.length;
    if (!n) return null;
    if (t <= a[0][0]) return [a[0][1], a[0][2]];
    if (t >= a[n - 1][0]) return [a[n - 1][1], a[n - 1][2]];
    var lo = idxAt(a, t), hi = Math.min(n - 1, lo + 1), u = (t - a[lo][0]) / ((a[hi][0] - a[lo][0]) || 1);
    return [lerp(a[lo][1], a[hi][1], u), lerp(a[lo][2], a[hi][2], u)];
  }
  function flagsAt(p, t) { return p.pts.length ? p.pts[idxAt(p.pts, t)][4] : 0; }
  function alive(p, t) { return p.dead == null || t < p.dead; }
  var F_BUS = 1, F_SKY = 2, F_DBNO = 16, F_STORM = 32, F_CHUTE = 64, F_AIR = 1 | 2 | 64;
  CFT.posAt = posAt;
  CFT.flagsAt = flagsAt;
  CFT.started = function (p, t) { return p.pts.length > 0 && t >= p.pts[0][0] - 0.5; };

  /* ------------------------------------------------------------------ Zonen */
  function zoneState(R, t) {
    var Z = R.zones;
    if (!Z.length) return { c: R.z0 ? [R.z0.x, R.z0.y, R.z0.r] : [0, 0, 0], nx: null, n: 1, shr: false, hold: 0, f: 0 };
    var i = -1;
    for (var k = 0; k < Z.length; k++) if (Z[k].s <= t) i = k;
    if (i < 0) {
      return { c: [Z[0].L.x, Z[0].L.y, Z[0].L.r], nx: [Z[0].N.x, Z[0].N.y, Z[0].N.r], n: 1, shr: false, hold: Z[0].s, f: Z[0].f };
    }
    var e = Z[i];
    if (t < e.f) {
      var u = (t - e.s) / Math.max(1, e.f - e.s);
      return { c: [lerp(e.L.x, e.N.x, u), lerp(e.L.y, e.N.y, u), lerp(e.L.r, e.N.r, u)], nx: [e.N.x, e.N.y, e.N.r], n: i + 2, shr: true, hold: e.s, f: e.f };
    }
    var nz = Z[i + 1];
    return { c: [e.N.x, e.N.y, e.N.r], nx: nz ? [nz.N.x, nz.N.y, nz.N.r] : null, n: i + 2, shr: false, hold: nz ? nz.s : null, f: e.f };
  }
  CFT.zoneState = zoneState;
  function zoneNo(R, t) { return zoneState(R, t).n; }

  /* ------------------------------------------------------------------ Momentaufnahme für die Mini-Maps */
  function snapshot(R, t) {
    var zs = zoneState(R, t), me = R.players[0], s = { c: zs.c, nx: zs.nx, me: posAt(me, t), mates: [], oth: [] };
    R.players.forEach(function (p, i) {
      if (i === 0 || !p.pts.length || !alive(p, t)) return;
      var q = posAt(p, t);
      if (!q) return;
      (i < R.tn ? s.mates : s.oth).push(q);
    });
    return s;
  }

  /* ------------------------------------------------------------------ Parser: cft-1 -> Modell */
  CFT.parse = function (d, fname) {
    if (!d || typeof d !== 'object') throw new Error('Die Datei enthält kein gültiges JSON-Objekt.');
    if (d.format !== 'cft-1') throw new Error('Unbekanntes Format (' + (d.format || 'ohne Kennung') + '). Erwartet wird die Ausgabe von ReplayDump (cft-1).');
    var meta = d.meta || {}, pl = d.players || [], kl = d.kills || [], zl = d.zones || [], dl = d.drops || [], tr = d.tracks || {};
    if (!pl.length) throw new Error('Keine Spielerdaten im Replay gefunden.');

    /* --- Spieler + Spuren --- */
    var P = pl.map(function (p) {
      return {
        id: p.id, name: p.name || ('Spieler ' + p.id), bot: !!p.bot, owner: !!p.owner, epic: p.epic || '',
        team: num(p.team, -1), place: num(p.placement, -1), kills: num(p.kills, 0),
        dead: num(p.deathT), pts: (tr[String(p.id)] || []).filter(function (a) { return a && a.length >= 3; })
      };
    });

    /* --- Zeitnullpunkt: der Parser setzt t0 selbst. Falls nicht (Zeiten absolut), normalisieren wir hier --- */
    /* Lobby-/Vorstart-Positionen weit außerhalb der Karte (vor dem Bus) abschneiden */
    var LIM = 150000;
    P.forEach(function (p) {
      var i0 = 0;
      while (i0 < p.pts.length && (Math.abs(p.pts[i0][1]) > LIM || Math.abs(p.pts[i0][2]) > LIM)) i0++;
      if (i0 > 0) p.pts = p.pts.slice(i0);
    });
    var minT = Infinity;
    P.forEach(function (p) { if (p.pts.length) minT = Math.min(minT, p.pts[0][0]); });
    var shift = (isFinite(minT) && minT > 5) ? minT : 0;
    function T(t) { return t - shift; }
    if (shift) {
      P.forEach(function (p) {
        p.pts = p.pts.map(function (a) { return [a[0] - shift, a[1], a[2], a[3] || 0, a[4] || 0]; });
        if (p.dead != null) p.dead -= shift;
      });
    } else {
      P.forEach(function (p) { p.pts = p.pts.map(function (a) { return [a[0], a[1], a[2], a[3] || 0, a[4] || 0]; }); });
    }
    /* Flags liegen im Parser an Index 4; Tracks bestehen dort aus [t,x,y,z,flags] -> hier [t,x,y,z,flags] */

    /* --- ich selbst --- */
    var me = null;
    P.forEach(function (p) { if (!me && (p.owner || (meta.ownerId != null && meta.ownerId >= 0 && p.id === meta.ownerId))) me = p; });
    if (!me && CFT.myName) {
      var nm = CFT.myName.toLowerCase();
      P.forEach(function (p) { if (!me && p.pts.length && (p.name.toLowerCase().indexOf(nm) >= 0 || p.epic.toLowerCase() === nm)) me = p; });
    }
    if (!me) P.filter(function (p) { return !p.bot && p.pts.length; }).forEach(function (p) { if (!me || p.pts.length > me.pts.length) me = p; });
    if (!me || me.pts.length < 10) throw new Error('Für deinen Spieler wurden keine (oder zu wenige) Positionsdaten gefunden.');
    var span = me.pts[me.pts.length - 1][0] - me.pts[0][0];
    if (span < 60) throw new Error('Deine Positionen haben keine gültigen Zeitstempel (Zeitspanne nur ' + Math.round(span) + ' s). Bitte ReplayDump aus Version 0.7.0 oder neuer verwenden.');

    /* --- Team --- */
    var teamIds = null;
    (d.teams || []).forEach(function (t) { if (t.index === me.team && t.ids) teamIds = t.ids; });
    var mates = P.filter(function (p) {
      return p !== me && p.pts.length && ((me.team >= 0 && p.team === me.team) || (teamIds && teamIds.indexOf(p.id) >= 0));
    }).slice(0, 3);
    var others = P.filter(function (p) { return p !== me && mates.indexOf(p) < 0 && p.pts.length; });
    var O = [me].concat(mates, others), tn = 1 + mates.length, idIdx = {}, nameOf = {};
    P.forEach(function (p) { nameOf[p.id] = p.name; });
    O.forEach(function (p, i) { idIdx[p.id] = i; });

    /* --- Kill-Feed (inkl. Knockdowns) --- */
    var ev = [];
    kl.forEach(function (k) {
      var t = num(k.t);
      if (t == null || k.revived) return;
      t = T(t);
      if (t < -5) return;
      var v = idIdx[k.victim], kk = idIdx[k.killer];
      ev.push({
        t: t, vid: k.victim, kid: k.killer, v: v, k: kk, down: !!k.down,
        vn: nameOf[k.victim] || ('Spieler ' + k.victim), kn: (k.killer != null && k.killer >= 0 && k.killer !== k.victim) ? (nameOf[k.killer] || ('Spieler ' + k.killer)) : null,
        dist: num(k.dist, 0)
      });
    });
    ev.sort(function (a, b) { return a.t - b.t; });
    /* Todeszeiten aus dem Kill-Feed ergänzen */
    var byId = {};
    P.forEach(function (p) { byId[p.id] = p; });
    ev.forEach(function (e) {
      if (e.down) return;
      var p = byId[e.vid];
      if (p && (p.dead == null || e.t < p.dead)) p.dead = e.t;
    });
    var deadTimes = P.filter(function (p) { return p.dead != null; }).map(function (p) { return p.dead; }).sort(function (a, b) { return a - b; });

    /* --- Zonen (mit Kette: letzte Zone = Ziel der vorherigen) --- */
    var chain = [], prevN = null, z0 = null;
    zl.forEach(function (z) {
      var nr = num(z.nr), nx = num(z.nx), ny = num(z.ny);
      if (!nr || nx == null || ny == null) return;
      var N = { x: nx, y: ny, r: nr }, L;
      var lr = num(z.lr), lx = num(z.lx), ly = num(z.ly);
      if (lr > 0 && lx != null && ly != null && (lx !== 0 || ly !== 0)) L = { x: lx, y: ly, r: lr };
      else if (prevN) L = { x: prevN.x, y: prevN.y, r: prevN.r };
      else L = { x: nx, y: ny, r: num(z.r, nr) || nr };
      var s = T(num(z.start, 0)), f = T(num(z.end, 0));
      chain.push({ s: s, f: f, L: L, N: N });
      prevN = N;
    });
    var Zs = [];
    chain.forEach(function (c, i) {
      var valid = c.s > -5 && c.f > c.s && (c.f - c.s) < 900;
      if (!valid) { if (i === 0) z0 = c.N; return; }
      var last = Zs[Zs.length - 1];
      if (last && Math.abs(last.N.x - c.N.x) < 300 && Math.abs(last.N.y - c.N.y) < 300 && Math.abs(last.N.r - c.N.r) < 100) return;
      Zs.push(c);
    });

    /* --- Supply Drops --- */
    var drops = [];
    dl.forEach(function (s) {
      var t = num(s.t), x = num(s.x), y = num(s.y);
      if (t == null || t < 0 || x == null || y == null) return;
      var lt = num(s.lootedT);
      drops.push({ t: T(t), x: x, y: y, looted: !!s.looted, lt: (lt != null && lt > 0) ? T(lt) : null });
    });

    /* --- Dauer --- */
    var dur = 0;
    P.forEach(function (p) { if (p.pts.length) dur = Math.max(dur, p.pts[p.pts.length - 1][0]); });
    ev.forEach(function (e) { dur = Math.max(dur, e.t); });
    Zs.forEach(function (z) { dur = Math.max(dur, z.f); });
    dur = Math.max(60, Math.ceil(dur));

    /* --- Spieler fürs Modell (DBNO-Intervalle) --- */
    var players = O.map(function (p, i) {
      var dbno = [], st = null;
      p.pts.forEach(function (a) {
        if ((a[4] & F_DBNO) && st == null) st = a[0];
        else if (!(a[4] & F_DBNO) && st != null) { dbno.push([st, a[0]]); st = null; }
      });
      if (st != null) dbno.push([st, p.dead != null ? p.dead : dur]);
      return { id: p.id, name: p.name, team: p.team, bot: p.bot, pts: p.pts, dead: p.dead, dbno: dbno, mate: i < tn };
    });

    var R = { dur: dur, tn: tn, nPlayers: P.length, players: players, zones: Zs, z0: z0, drops: drops, deadTimes: deadTimes, feed: [], cal: null };
    var mp = players[0];

    /* --- Platzierung --- */
    var place = num(meta.placement, -1);
    if (!(place > 0)) (d.teams || []).forEach(function (t) { if (t.index === me.team && t.placement > 0) place = t.placement; });
    if (!(place > 0) && me.place > 0) place = me.place;
    var win = place === 1;

    /* --- Landung & Team-Nähe --- */
    var iSky = -1, landT = null, i;
    for (i = 0; i < mp.pts.length && mp.pts[i][0] < 400; i++) { if (mp.pts[i][4] & F_AIR) { iSky = i; break; } }
    if (iSky >= 0) {
      var high = false;
      for (i = iSky; i < mp.pts.length; i++) {
        if (mp.pts[i][3] > 20000) high = true;
        /* gelandet = wieder niedrig (Höhe), nachdem wir oben waren; ohne Höhenangabe: Flags */
        if (high ? (mp.pts[i][3] < 4000 && !(mp.pts[i][4] & (F_BUS | F_SKY))) : (i > iSky && !(mp.pts[i][4] & F_AIR))) { landT = mp.pts[i][0]; break; }
      }
    }
    function nearestMate(t) {
      var best = null, me0 = posAt(mp, t);
      if (!me0) return null;
      for (var j = 1; j < tn; j++) {
        var m = players[j];
        if (!alive(m, t)) continue;
        var q = posAt(m, t);
        if (q) { var dd = dist(me0, q); if (best == null || dd < best) best = dd; }
      }
      return best;
    }

    /* --- Analyse: Rotation je Zonenzug --- */
    var mis = [], good = [], rot = [];
    Zs.forEach(function (z, idx) {
      var k = idx + 1;
      var rec = { k: k, s: z.s, gap: null, ok: null, team: null };
      if (alive(mp, z.s)) {
        var pm = posAt(mp, z.s), gap = dist(pm, [z.N.x, z.N.y]) - z.N.r;
        rec.gap = gap; rec.ok = gap <= Math.max(1500, 0.02 * z.N.r);
        var allIn = true, cnt = 1;
        for (var j = 1; j < tn; j++) {
          if (!alive(players[j], z.s)) continue;
          cnt++;
          var q = posAt(players[j], z.s);
          if (!q || dist(q, [z.N.x, z.N.y]) > z.N.r) allIn = false;
        }
        rec.team = allIn && cnt >= 2 && rec.ok;
        if (!rec.ok && gap > Math.max(2500, 0.04 * z.N.r)) {
          mis.push({ t: z.s, kind: 'rot', sev: gap / 100, val: Math.round(gap / 100) + ' m', unit: 'außerhalb', zone: k + 1,
            txt: 'Zone ' + (k + 1) + ' zog zu und du standest noch ' + Math.round(gap / 100) + ' m außerhalb der nächsten Zone.',
            better: 'Rotiere schon beim Ping los und sei vor dem Zonenzug im neuen Kreis – so musst du nicht durch den Sturm laufen.' });
        } else if (rec.team) {
          good.push({ t: z.s, txt: 'Das ganze Team war schon in der nächsten Zone (Zone ' + (k + 1) + ')' });
        }
      }
      rot.push(rec);
    });

    /* --- Analyse: Sturm --- */
    var stormSec = 0, runs = [], cu = null;
    mp.pts.forEach(function (a, ix) {
      var nextT = ix + 1 < mp.pts.length ? mp.pts[ix + 1][0] : a[0];
      if (a[4] & F_STORM) {
        stormSec += Math.min(5, Math.max(0, nextT - a[0]));
        if (!cu) cu = { s: a[0], e: a[0] };
        else if (a[0] - cu.e <= 4) cu.e = a[0];
        else { runs.push(cu); cu = { s: a[0], e: a[0] }; }
      } else if (cu && a[0] - cu.e > 4) { runs.push(cu); cu = null; }
    });
    if (cu) runs.push(cu);
    runs.filter(function (r) { return r.e - r.s >= 8; }).sort(function (a, b) { return (b.e - b.s) - (a.e - a.s); }).slice(0, 2).forEach(function (r) {
      var secs = Math.round(r.e - r.s);
      mis.push({ t: r.s, kind: 'storm', sev: secs, val: secs + ' s', unit: 'im Sturm', zone: zoneNo(R, r.s),
        txt: 'Du hast ' + secs + ' s im Sturm gestanden (Zone ' + zoneNo(R, r.s) + ').',
        better: 'Plane die Rotation früher und nutze Mobility, bevor der Sturm dich erreicht.' });
    });

    /* --- Analyse: Tod / Knockdown / Team getrennt --- */
    var myDown = null, myDeathEv = null;
    ev.forEach(function (e) {
      if (e.vid !== me.id) return;
      if (e.down && !myDown) myDown = e;
      if (!e.down && !myDeathEv) myDeathEv = e;
    });
    var tEnd = (me.dead != null) ? me.dead : null;
    if (tEnd != null) {
      var tk = myDown && myDown.t <= tEnd ? myDown.t : tEnd, nm = nearestMate(tk - 1), zn = zoneNo(R, tk);
      var by = myDeathEv && myDeathEv.kn ? ' von ' + myDeathEv.kn : '';
      var dd = myDeathEv && myDeathEv.dist > 0 ? ' (' + Math.round(myDeathEv.dist) + ' m)' : '';
      if (landT != null && tEnd - landT < 150) {
        mis.push({ t: tk, kind: 'early', sev: 900, val: 'Game over', unit: '', zone: zn,
          txt: 'Du wurdest nur ' + Math.round(tEnd - landT) + ' s nach der Landung eliminiert' + by + dd + '.',
          better: 'Landet mit weniger Gegnern oder hol dir erst Waffe und Schild, bevor du den ersten Kampf annimmst.' });
      } else if (nm != null && nm > 8000) {
        mis.push({ t: tk, kind: 'alone', sev: 700 + nm / 200, val: 'Game over', unit: '', zone: zn,
          txt: 'Du bist in Zone ' + zn + ' ausgeschieden' + by + dd + ' – dein nächster Mate war ' + Math.round(nm / 100) + ' m entfernt.',
          better: 'Bleibt in Reichweite (unter ca. 40 m), damit ihr Fights gemeinsam nehmt und euch wiederbeleben könnt.' });
      } else {
        mis.push({ t: tk, kind: 'death', sev: 600, val: 'Game over', unit: '', zone: zn,
          txt: 'Du bist in Zone ' + zn + ' ausgeschieden' + by + dd + '.',
          better: 'Prüfe vor dem Fight Zone, Heilung und Deckung – und nimm nur Fights, in denen du die bessere Position hast.' });
      }
    }
    /* Mates, die weit weg von dir gestorben sind, solange du lebtest */
    var far = null;
    ev.forEach(function (e) {
      if (e.down || e.v == null || e.v < 1 || e.v >= tn || !alive(mp, e.t)) return;
      var a = posAt(players[e.v], e.t), b = posAt(mp, e.t);
      if (!a || !b) return;
      var dd2 = dist(a, b);
      if (dd2 > 10000 && (!far || dd2 > far.d)) far = { t: e.t, d: dd2, n: e.vn, kn: e.kn };
    });
    if (far) mis.push({ t: far.t, kind: 'team', sev: 500 + far.d / 200, val: Math.round(far.d / 100) + ' m', unit: 'getrennt', zone: zoneNo(R, far.t),
      txt: far.n + ' wurde' + (far.kn ? ' von ' + far.kn : '') + ' eliminiert, während du ' + Math.round(far.d / 100) + ' m entfernt warst.',
      better: 'Haltet als Team engen Kontakt – wer allein steht, verliert den Fight, bevor Hilfe da ist.' });

    /* --- Auswahl: maximal 8, nach Zeit sortiert --- */
    mis.sort(function (a, b) { return b.sev - a.sev; });
    mis = mis.slice(0, 8).sort(function (a, b) { return a.t - b.t; });
    mis.forEach(function (m) { m.snap = snapshot(R, m.t); });

    /* --- Feed --- */
    var A = (typeof root.THEME === 'object' && root.THEME && root.THEME.acc) ? root.THEME.acc : '#FF003C';
    var feed = [];
    ev.forEach(function (e) {
      var vt = e.v != null && e.v < tn, kt = e.k != null && e.k < tn && !(vt && e.k === e.v);
      var dd = e.dist > 0 ? ' (' + Math.round(e.dist) + ' m)' : '';
      var txt = e.kn
        ? e.kn + (e.down ? ' schießt ' : ' eliminiert ') + e.vn + (e.down ? ' nieder' : '') + dd
        : e.vn + (e.down ? ' wurde niedergeschossen' : ' ist ausgeschieden');
      var c = (kt || vt) ? (e.down ? '#fbbf77' : (kt ? A : '#f4f4f5')) : '#ffffff22';
      var item = { t: e.t, mk: kt || vt, c: c, txt: txt };
      if (!e.down && e.v != null) item.e = { t: e.t, v: e.v, k: e.k != null ? e.k : 999 };
      feed.push(item);
    });
    Zs.forEach(function (z, idx) { feed.push({ t: z.s, mk: true, c: '#d4d4d8', txt: 'Zone ' + (idx + 2) + ' zieht zu' }); });
    drops.forEach(function (s) {
      feed.push({ t: s.t, mk: false, c: '#ffffff22', txt: 'Supply Drop gelandet' });
      if (s.lt != null) feed.push({ t: s.lt, mk: false, c: '#ffffff22', txt: 'Supply Drop geplündert' });
    });
    if (landT != null) {
      feed.push({ t: landT, mk: true, c: '#d4d4d8', txt: 'Du bist gelandet' });
      var first = null;
      ev.forEach(function (e) { if (!first && ((e.v != null && e.v < tn) || (e.k != null && e.k < tn))) first = e; });
      if (first && first.t > landT) feed.push({ t: first.t, mk: true, c: '#d4d4d8', tip: true, txt: 'Erster Kampf deines Teams ' + Math.round(first.t - landT) + ' s nach der Landung' });
    }
    mis.forEach(function (m) { feed.push({ t: m.t, mk: true, c: '#fb923c', tip: true, mis: true, txt: m.txt, better: m.better }); });
    good.slice(0, 2).forEach(function (g) { feed.push({ t: g.t, mk: true, c: '#4ade80', tip: true, txt: g.txt }); });
    feed.sort(function (a, b) { return a.t - b.t; });
    R.feed = feed;

    /* --- Reihen für die Matrix "Wo deine Games brechen" --- */
    var starts = Zs.map(function (z) { return z.s; });
    var GR = [[1, 2], [3, 4], [5, 6], [7, 99]];  // Zonenzüge je Gruppe (1 = erster Zonenzug)
    var rows = ['Offspawn'];
    var gStart = GR.map(function (g) { return starts[g[0] - 1] != null ? starts[g[0] - 1] : null; });
    GR.forEach(function (g, gi) { rows.push(gi === 3 ? 'Rotation ab Zone 8' : 'Rotation Zone ' + (g[0] + 1) + '–' + (g[1] + 1)); });
    rows.push('Win');
    var res = rows.map(function () { return 'none'; }), bounds = [0].concat(gStart.map(function (x) { return x == null ? Infinity : x; })), endRow = -1;
    if (tEnd != null) {
      for (i = 0; i < rows.length - 1; i++) { if (tEnd >= bounds[i] && (i + 1 >= bounds.length - 0 || tEnd < (bounds[i + 1] != null ? bounds[i + 1] : Infinity))) { endRow = i; break; } }
      if (endRow < 0) endRow = rows.length - 2;
    }
    /* Offspawn */
    var landNear = landT != null ? nearestMate(landT + 20) : null;
    if (endRow === 0) res[0] = 'end';
    else res[0] = (tn > 1 && landNear != null && landNear > 25000) ? 'bad' : 'ok';
    /* Gruppen */
    GR.forEach(function (g, gi) {
      var row = gi + 1;
      if (gStart[gi] == null) return;
      if (endRow >= 0 && row > endRow) return;
      if (endRow === row) { res[row] = 'end'; return; }
      var bad = false, any = false;
      rot.forEach(function (r) { if (r.k >= g[0] && r.k <= g[1] && r.ok != null) { any = true; if (!r.ok) bad = true; } });
      res[row] = any ? (bad ? 'bad' : 'ok') : 'ok';
    });
    res[rows.length - 1] = win ? 'win' : 'none';
    var ds = res.indexOf('end'); if (ds < 0) ds = res.indexOf('bad'); if (ds < 0) ds = 0;

    /* --- Phasen-Noten --- */
    var W = { ok: 1, bad: 0.45, end: 0.12, none: 0 };
    function rowScore(j) { return W[res[j]] * 100; }
    var surv = (tEnd != null && landT != null) ? Math.min(1, Math.max(0, (tEnd - landT) / 150)) : 1;
    var off = res[0] === 'end' ? 8 + 30 * surv : res[0] === 'bad' ? 62 : 90 + Math.min(10, tn > 1 && landNear != null ? Math.max(0, 10 - landNear / 5000) : 6);
    var mid = (rowScore(1) + rowScore(2)) / 2 - Math.min(20, stormSec / 6);
    var end = (rowScore(3) + rowScore(4)) / 2;
    if (win) { off = Math.max(off, 88); mid = Math.max(mid, 82); end = Math.max(end, 92); }
    var ph = [off, mid, end].map(function (v) { return Math.max(5, Math.min(100, Math.round(v))); });
    var tot = Math.round((ph[0] + ph[1] + ph[2]) / 3), L = tot >= 75 ? 'A' : tot >= 55 ? 'B' : tot >= 40 ? 'C' : 'D';

    /* --- Titel --- */
    var base = String(fname || 'Replay').replace(/^.*[\\/]/, '').replace(/\.(json|replay)$/i, '');
    var mt = base.match(/(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})/), when = '';
    if (mt) when = mt[3] + '.' + mt[2] + '.' + mt[1] + ' ' + mt[4] + ':' + mt[5];
    else if (meta.startedUtc) { var dt = new Date(meta.startedUtc); if (!isNaN(dt)) when = dt.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    var pls = String(meta.playlist || '').replace(/^Playlist_/i, '').replace(/_/g, ' ').trim();
    var title = (when ? when : base) + (pls ? ' · ' + pls : '') + (num(meta.round, 0) > 0 ? ' · Runde ' + meta.round : '');

    R.meta = { me: me.name, teamSize: tn, players: P.length, positions: O.reduce(function (s, p) { return s + p.pts.length; }, 0), kills: ev.length, zones: Zs.length,
      place: place > 0 ? place : null, mis: mis.length, landT: landT, stormSec: Math.round(stormSec), playlist: pls };
    var kills = num(me.kills, 0);
    var m = { n: title, pl: place > 0 ? place : 0, pts: 0, k: kills, g: L, s: 7, real: R, ph: ph, mis: mis };
    return { i: 0, c: res, rows: rows, ds: ds, win: win, ph: ph, tot: tot, m: m, real: R, mis: mis, rot: rot, fname: base };
  };

  /** Spuren-Daten in Kartenkoordinaten umrechnen (für Viewer) – und Auto-Skalierung beim ersten Replay */
  CFT.autoScale = function () { if (!CFT.cal.H) CFT.cal.H = DEFAULT_H; };

  /** Ein geparstes cft-1-Objekt hinzufügen */
  CFT.add = function (data, fname) {
    var g = CFT.parse(data, fname);
    CFT.autoScale(g);
    g.i = CFT.games.length;
    CFT.games.push(g);
    return g;
  };

  /** Datei (Browser File) lesen und hinzufügen */
  CFT.addFile = function (file) {
    return file.text().then(function (txt) { return CFT.add(JSON.parse(txt), file.name); });
  };

  CFT.clear = function () { CFT.games.length = 0; };

  if (typeof module !== 'undefined' && module.exports) module.exports = CFT;
})(typeof window !== 'undefined' ? window : globalThis);
