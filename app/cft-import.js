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
  var DEFAULT_H = 153000;
  CFT.cal = CFT.cal || { swap: false, fx: false, fy: false, H: 153000, ox: 0.012, oy: -0.011, saved: false };
  try {
    if (root.localStorage) {
      var sv = JSON.parse(root.localStorage.getItem('cft_cal5') || 'null');
      if (sv && sv.H) { for (var k in sv) CFT.cal[k] = sv[k]; CFT.cal.saved = true; }
    }
  } catch (e) { /* ohne Speicher weiterarbeiten */ }

  CFT.saveCal = function () {
    CFT.cal.saved = true;
    try { root.localStorage.setItem('cft_cal5', JSON.stringify(CFT.cal)); } catch (e) { /* egal */ }
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

  /* ------------------------------------------------------------------ POIs (Position auf dem Kartenbild, 0..1) */
  CFT.POIS = [
    ['Lifty Lodge', 0.333, 0.150], ['Freaky Fields', 0.600, 0.235], ['Wonkeeland', 0.745, 0.305], ['Chopped Shop', 0.172, 0.330],
    ['Nightmare Neighborhood', 0.428, 0.372], ['Green Hill Zone', 0.317, 0.483], ["Reality's Reign", 0.545, 0.490],
    ['Golden Grove', 0.789, 0.539], ['Stone Sanctum', 0.456, 0.631], ['Shaken Sanctuary', 0.667, 0.676],
    ['Heatwave Harbor', 0.222, 0.683], ['Sunken Shores', 0.433, 0.794], ['Cluster Coast', 0.733, 0.813], ['Roter-Geist-Insel', 0.313, 0.803]
  ];
  /** nächster Ort zu einer Weltposition; innerhalb ~9 % der Kartenbreite = "in", sonst "bei" */
  CFT.poiAt = function (wx, wy) {
    var p = CFT.proj(wx, wy), best = null;
    CFT.POIS.forEach(function (q) { var d = Math.hypot(p[0] - q[1], p[1] - q[2]); if (!best || d < best.d) best = { name: q[0], d: d }; });
    if (!best) return null;
    best.near = best.d <= 0.09;
    best.label = (best.near ? '' : 'bei ') + best.name;
    return best;
  };

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
  /* Leben/Schild + Inventar (nur fuer den Replay-Besitzer vorhanden) */
  function seriesAt(a, t) {
    if (!a || !a.length) return null;
    if (t < a[0][0]) return a[0];
    var lo = 0, hi = a.length - 1;
    if (t >= a[hi][0]) return a[hi];
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (a[m][0] <= t) lo = m; else hi = m; }
    return a[lo];
  }
  function itemCat(n) {
    n = String(n || '').toLowerCase();
    if (/wooditemdata/.test(n)) return { k: 'wood' };
    if (/stoneitemdata/.test(n)) return { k: 'stone' };
    if (/metalitemdata/.test(n)) return { k: 'metal' };
    if (/wads|goldbar|currency_gold/.test(n)) return { k: 'gold' };
    if (/ammo/.test(n)) return { k: 'ammo', l: /shell/.test(n) ? 'Shells' : /rocket/.test(n) ? 'Raketen' : /energy|cell/.test(n) ? 'Energie' : /heavy/.test(n) ? 'Schwer' : /medium/.test(n) ? 'Mittel' : /light/.test(n) ? 'Leicht' : 'Muni' };
    if (/pickaxe|harvest|buildingitem|edittool|^wall|^floor|^stair|^roof|^trap_|emote|spray|toy|contrail|glider/.test(n)) return { k: 'skip' };
    var r = /_sr(_|$)|legendary|_t05/.test(n) ? 5 : /_vr(_|$)|epic|_t04/.test(n) ? 4 : /_uc(_|$)|uncommon|_t02/.test(n) ? 2 : /_r(_|$)|rare|_t03/.test(n) ? 3 : 1;
    if (/chug/.test(n)) return { k: 'heal', l: 'Chug Jug', n: 'chug' };
    if (/shieldsmall|minishield|mini/.test(n)) return { k: 'heal', l: 'Mini-Schild', n: 'mini' };
    if (/shield|slurp|bigpot/.test(n) && !/shotgun|shockwave/.test(n)) return { k: 'heal', l: /slurp/.test(n) ? 'Slurp' : 'Schild', n: 'shield' };
    if (/bandage/.test(n)) return { k: 'heal', l: 'Bandage', n: 'bandage' };
    if (/medkit/.test(n)) return { k: 'heal', l: 'Medkit', n: 'medkit' };
    if (/fish|mushroom|apple|banana|coconut|pepper|corn|slurpfish|potion|splash/.test(n)) return { k: 'heal', l: 'Food', n: 'food' };
    if (/hook_?gun|grappl/.test(n)) return { k: 'util', l: 'Enterhaken', r: r };
    if (/shotgun/.test(n)) return { k: 'wpn', l: 'SG', r: r };
    if (/smg|submachine|combat_smg|burst_?smg/.test(n)) return { k: 'wpn', l: 'SMG', r: r };
    if (/sniper|dmr|bolt|heavy_?sniper/.test(n)) return { k: 'wpn', l: 'SNP', r: r };
    if (/pistol|revolver|handcannon|sidearm/.test(n)) return { k: 'wpn', l: 'PIS', r: r };
    if (/assault|rifle|scar|burst|ar_/.test(n)) return { k: 'wpn', l: 'AR', r: r };
    if (/rocket|launcher|grenade|boom|c4|clingers|stink|impulse|trap|shockwave|bouncer|portafort|rift|kit|guardian/.test(n)) return { k: 'util', l: /grenade/.test(n) ? 'Granate' : /launcher|rocket/.test(n) ? 'Raketen' : /shockwave/.test(n) ? 'Shockwave' : 'Util', r: r };
    if (/^wid_|weapon/.test(n)) return { k: 'wpn', l: 'WPN', r: r };
    return { k: 'util', l: 'Item', r: r };
  }
  CFT.vitAt = function (p, t) { if (!p.vit || p.vit.length < 5) return null; var e = seriesAt(p.vit, t); return e ? { hp: e[1], sh: e[2] } : null; };
  CFT.invAt = function (p, t, names) {
    if (!p.inv || p.inv.length < 2) return null;
    var e = seriesAt(p.inv, t);
    if (!e) return null;
    var o = { wood: 0, stone: 0, metal: 0, gold: 0, wpn: [], heal: {}, util: [], ammo: {} };
    e[1].forEach(function (it) {
      var nm = names[it[0]], c = itemCat(nm), n = it[1];
      if (c.k === 'wood' || c.k === 'stone' || c.k === 'metal' || c.k === 'gold') o[c.k] += n;
      else if (c.k === 'ammo') o.ammo[c.l] = (o.ammo[c.l] || 0) + n;
      else if (c.k === 'wpn') o.wpn.push({ l: c.l, r: c.r, raw: nm });
      else if (c.k === 'util') o.util.push({ l: c.l, n: n, raw: nm });
      else if (c.k === 'heal') o.heal[c.l] = (o.heal[c.l] || 0) + n;
    });
    return o;
  };
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
        dead: num(p.deathT), pts: (tr[String(p.id)] || []).filter(function (a) { return a && a.length >= 3; }),
        vit: ((d.vitals || {})[String(p.id)] || []).filter(function (a) { return a && a.length >= 3; }),
        inv: (((d.inv || {}).p || {})[String(p.id)] || []).filter(function (a) { return a && a.length >= 2; })
      };
    });

    var hasNet = !!((d.vitals && Object.keys(d.vitals).length) || (d.inv && d.inv.p && Object.keys(d.inv.p).length));
    /* --- Zeitnullpunkt: der Parser setzt t0 selbst. Falls nicht (Zeiten absolut), normalisieren wir hier --- */
    /* Lobby-/Vorstart-Positionen weit außerhalb der Karte (vor dem Bus) abschneiden */
    var LIM = 170000;
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
        p.vit = p.vit.map(function (a) { return [a[0] - shift, a[1], a[2]]; });
        p.inv = p.inv.map(function (a) { return [a[0] - shift, a[1]]; });
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
    /* --- Leben/Inventar-Zuordnung absichern (Solo: Besitzer-ID kann fehlen -> Schluessel "-1" oder andere ID) --- */
    (function () {
      function longest(obj, skip) {
        var bk = null, bl = 0;
        Object.keys(obj || {}).forEach(function (k) { var l = (obj[k] || []).length; if (l > bl && !skip[k]) { bl = l; bk = k; } });
        return bk;
      }
      var ownV = {}, ownI = {};
      P.forEach(function (p) { if (p !== me && p.vit.length >= 5) ownV[String(p.id)] = 1; if (p !== me && p.inv.length >= 2) ownI[String(p.id)] = 1; });
      if (me.vit.length < 5) { var kv = longest(d.vitals, ownV); if (kv && d.vitals[kv].length >= 5) me.vit = d.vitals[kv].filter(function (a) { return a && a.length >= 3; }).map(function (a) { return [a[0] - shift, a[1], a[2]]; }); }
      if (me.inv.length < 2) { var ki = longest((d.inv || {}).p, ownI); if (ki && d.inv.p[ki].length >= 2) me.inv = d.inv.p[ki].filter(function (a) { return a && a.length >= 2; }).map(function (a) { return [a[0] - shift, a[1]]; }); }
    })();
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
      return { id: p.id, name: p.name, team: p.team, bot: p.bot, pts: p.pts, dead: p.dead, dbno: dbno, mate: i < tn, vit: p.vit, inv: p.inv };
    });

    var R = { dur: dur, tn: tn, nPlayers: Math.max(tn, Math.min(100, P.length)), players: players, zones: Zs, z0: z0, drops: drops, deadTimes: deadTimes, feed: [], cal: null, invNames: ((d.inv || {}).names || []), hasNet: hasNet };
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
    var landPos = landT != null ? posAt(mp, landT + 3) : null, landPoi = landPos ? CFT.poiAt(landPos[0], landPos[1]) : null;
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

    /* --- Hilfen für die Analyse --- */
    function present(p, t) { return p.pts.length && alive(p, t) && CFT.started(p, t) && t <= p.pts[p.pts.length - 1][0] + 6; }
    var foesAll = players.slice(tn).filter(function (p) { return !p.bot; });
    function foes(t, pos, rad) {
      var out = [];
      if (!pos) return out;
      foesAll.forEach(function (p) {
        if (!present(p, t)) return;
        var q = posAt(p, t);
        if (!q) return;
        var dd = dist(pos, q);
        if (dd <= rad) out.push({ p: p, d: dd, q: q });
      });
      return out;
    }
    function zAt(p, t) { return p.pts.length ? p.pts[idxAt(p.pts, t)][3] : 0; }
    function speedMe(t) {
      var a = posAt(mp, t - 8), b = posAt(mp, t), v = a && b ? dist(a, b) / 8 : 0;
      return Math.max(550, Math.min(900, v || 700));
    }
    function teamsOf(list) {
      var s = {}, n = 0;
      list.forEach(function (f) { var k = f.p.team >= 0 ? 't' + f.p.team : 'p' + f.p.id; if (!s[k]) { s[k] = 1; n++; } });
      return n;
    }
    function inZone(pt, N) { return dist(pt, [N.x, N.y]) <= N.r; }
    function meters(cm) { return Math.round(cm / 100); }
    function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }

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
          var pres = 0, inn = 0;
          foesAll.forEach(function (p) { if (!present(p, z.s)) return; var q2 = posAt(p, z.s); if (!q2) return; pres++; if (inZone(q2, z.N)) inn++; });
          var pct = pres >= 6 ? Math.round(100 * inn / pres) : null;
          var lead = Math.round(gap / speedMe(z.s)), stS = 0, gm = meters(gap);
          mp.pts.forEach(function (a) { if (a[0] >= z.s && a[0] <= z.f + 15 && (a[4] & F_STORM)) stS++; });
          var facts = [gm + ' m außerhalb'];
          if (pct != null) facts.push(pct + ' % der Gegner schon drin');
          if (stS >= 3) facts.push(stS + ' s im Sturm');
          facts.push('~' + lead + ' s Vorlauf nötig');
          mis.push({ t: z.s, kind: 'rot', sev: Math.min(480, gap / 100 + 25 * k), val: gm + ' m', unit: 'außerhalb', zone: k + 1, facts: facts,
            txt: 'Zone ' + (k + 1) + ' zog zu und du standest noch ' + gm + ' m außerhalb der nächsten Zone' + (pct != null && pct >= 50 ? ' – ' + pct + ' % der Gegner waren schon drin.' : '.'),
            better: gap > 30000
              ? 'Du hast den Zonen-Ping verpasst: bei ' + gm + ' m Abstand musst du etwa ' + lead + ' s VOR dem Zonenzug losgehen. Rotiere, sobald die nächste Zone angezeigt wird, und sag es deinem Team an.'
              : 'Starte rund ' + Math.max(5, lead) + ' s früher' + (stS >= 3 ? ' und nimm die Kante der neuen Zone, statt quer durch den Sturm zu laufen.' : ', damit du vor dem Zug im neuen Kreis stehst.') + ' Wer zu spät kommt, trifft auf Gegner, die schon Position haben.' });
        } else if (rec.team) {
          good.push({ t: z.s, txt: 'Das ganze Team war schon in der nächsten Zone (Zone ' + (k + 1) + ') – saubere Rotation.' });
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
      var secs = Math.round(r.e - r.s), zz = zoneNo(R, r.s), p0 = posAt(mp, r.s), p1 = posAt(mp, r.e), run = p0 && p1 ? meters(dist(p0, p1)) : null;
      var facts = [secs + ' s im Sturm', 'Zone ' + zz];
      if (run != null) facts.push(run + ' m Strecke');
      mis.push({ t: r.s, kind: 'storm', sev: Math.min(420, secs * 2 + 15 * zz), val: secs + ' s', unit: 'im Sturm', zone: zz, facts: facts,
        txt: 'Du hast ' + secs + ' s im Sturm gestanden (Zone ' + zz + ')' + (run != null && run > 60 ? ' und dabei ' + run + ' m zurückgelegt.' : '.'),
        better: 'Der Sturm kostet dich Leben und Heilung. Verlasse deinen Spot schon beim Zonen-Ping und laufe an der Kante entlang – ' + (zz >= 5 ? 'ab Zone ' + zz + ' tickt er so stark, dass jede Sekunde zählt.' : 'plane die Rotation so, dass du den Kreis vor dem Zug erreichst.') });
    });

    /* --- Analyse: Position in den Zonen 4-7 (Rand vs. deep) und Höhe ab Zone 7 --- */
    var bestEdge = null, deepGood = null;
    Zs.forEach(function (z, idx) {
      var n = idx + 2;
      if (n < 4) return;
      var nextS = Zs[idx + 1] ? Zs[idx + 1].s : z.f + 60;
      var th = z.f + Math.min(25, Math.max(5, (nextS - z.f) * 0.5));
      if (!alive(mp, th) || !present(mp, th)) return;
      var pme = posAt(mp, th);
      if (!pme) return;
      var relMe = dist(pme, [z.N.x, z.N.y]) / z.N.r, inside = [];
      foesAll.forEach(function (p) {
        if (!present(p, th)) return;
        var q = posAt(p, th);
        if (q && inZone(q, z.N)) inside.push(dist(q, [z.N.x, z.N.y]) / z.N.r);
      });
      if (n <= 7 && relMe <= 1.0 && inside.length >= 6) {
        var outer = inside.filter(function (r) { return r > relMe; }).length, pOut = outer / inside.length;
        if (relMe > 0.65 && pOut < 0.35) {
          var central = Math.round(100 * (1 - pOut));
          if (!bestEdge || pOut < bestEdge.p) bestEdge = { p: pOut, item: {
            t: th, kind: 'edge', sev: 330 + n * 12 + (0.35 - pOut) * 120, val: Math.round(relMe * 100) + ' %', unit: 'Zonenrand', zone: n,
            facts: [Math.round(relMe * 100) + ' % des Zonenradius', central + ' % der Gegner zentraler', plural(inside.length, 'Gegner', 'Gegner') + ' in der Zone'],
            txt: 'Zone ' + n + ': Du standest am Zonenrand (' + Math.round(relMe * 100) + ' % des Radius) – ' + central + ' % der ' + inside.length + ' Gegner in der Zone waren zentraler als du.',
            better: n <= 5
              ? 'Ab Zone 4 zählt Position: gehe deep in die Zone und box dort up – oder spiele Outstorm und komme über die Deadside von außen rein. Am Rand wirst du von innen UND von außen gepusht.'
              : 'In Zone ' + n + ' entscheidet die Mitte: je kleiner der Kreis, desto mehr Fights kommen von innen auf dich zu. Nimm früh einen zentralen Spot oder bleibe konsequent hinter der Deadside-Linie.' } };
        } else if (relMe < 0.4 && pOut > 0.6 && !deepGood) {
          deepGood = { t: th, txt: 'Zone ' + n + ': Du hast dich zentral positioniert (' + Math.round(relMe * 100) + ' % des Radius) – so kommen die Fights zu dir.' };
        }
      }
      if (n >= 7) {
        var near = foes(th, pme, 15000);
        if (near.length >= 3) {
          var avgZ = near.reduce(function (s, f) { return s + zAt(f.p, th); }, 0) / near.length, dzc = avgZ - zAt(mp, th);
          if (dzc > 800) {
            mis.push({ t: th, kind: 'height', sev: 300 + Math.min(80, dzc / 100), val: meters(dzc) + ' m', unit: 'tiefer', zone: n,
              facts: [meters(dzc) + ' m unter dem Schnitt', plural(near.length, 'Gegner', 'Gegner') + ' in 150 m', 'Zone ' + n],
              txt: 'Zone ' + n + ': Du standest ' + meters(dzc) + ' m tiefer als der Durchschnitt der ' + near.length + ' Gegner um dich.',
              better: 'In der Endgame-Phase gewinnt der hohe Layer: wer oben steht, sieht Edits und Pushes zuerst. Nimm vor Zone 7 Höhe (Hügel, Gebäude, hohe Rampen), bevor der Kreis klein wird.' });
          } else if (dzc < -800 && !good.some(function (g) { return g.h; })) {
            good.push({ t: th, h: 1, txt: 'Zone ' + n + ': Du hattest den hohen Layer (' + meters(-dzc) + ' m über den Gegnern) – starke Endgame-Position.' });
          }
        }
      }
    });
    if (bestEdge) mis.push(bestEdge.item);
    if (deepGood) good.push(deepGood);

    /* --- Analyse: Landung (Hot Drop) --- */
    var hotLand = null;
    if (landT != null && landPos) {
      var nearL = foes(landT + 8, landPos, 15000), teamsL = teamsOf(nearL);
      hotLand = { n: nearL.length, teams: teamsL };
      if (nearL.length <= 3) good.push({ t: landT, txt: 'Ruhige Landung' + (landPoi ? ' ' + landPoi.label : '') + ': nur ' + plural(nearL.length, 'Gegner', 'Gegner') + ' in 150 m – du hattest Zeit zu looten.' });
    }

    /* --- Analyse: Tod / Knockdown --- */
    var myDown = null, myDeathEv = null;
    ev.forEach(function (e) {
      if (e.vid !== me.id) return;
      if (e.down && !myDown) myDown = e;
      if (!e.down && !myDeathEv) myDeathEv = e;
    });
    var tEnd = (me.dead != null) ? me.dead : null;
    if (tEnd != null) {
      var ke = (myDown && myDown.t <= tEnd) ? myDown : myDeathEv;
      var tk = ke ? ke.t : tEnd, zsK = zoneState(R, tk), zn = zsK.n, pK = posAt(mp, tk - 1) || posAt(mp, tk);
      var verb = ke && ke.down ? 'niedergeschossen' : 'eliminiert';
      var by = ke && ke.kn ? ' von ' + ke.kn : '', dm = ke && ke.dist > 0 ? Math.round(ke.dist) : null;
      var fl = foes(tk - 1, pK, 10000), nF = fl.length, nm = nearestMate(tk - 1), mAlive = 0;
      for (var jm = 1; jm < tn; jm++) if (alive(players[jm], tk)) mAlive++;
      var rel = zsK.c[2] > 0 && pK ? dist(pK, [zsK.c[0], zsK.c[1]]) / zsK.c[2] : 0;
      var inStorm = !!(flagsAt(mp, tk - 1) & F_STORM) || rel > 1.04;
      var kP = ke && ke.kid != null ? byId[ke.kid] : null, dzK = (kP && present(kP, tk - 1)) ? zAt(kP, tk - 1) - zAt(mp, tk - 1) : null;
      var loss = null;
      ev.forEach(function (e) { if (e.v != null && e.v >= 1 && e.v < tn && !e.down && e.t < tk && tk - e.t <= 30) loss = e; });
      var sprint = !!(flagsAt(mp, tk - 2) & 4), sinceLand = landT != null ? Math.round(tk - landT) : null;
      var bf = [];
      if (dm != null) bf.push(dm + ' m Distanz');
      if (nF >= 2) bf.push(plural(nF, 'Gegner', 'Gegner') + ' in 100 m');
      if (nm != null && tn > 1) bf.push('Mate ' + meters(nm) + ' m entfernt');
      var item = null;
      if (sinceLand != null && sinceLand < 150) {
        var heavy = nF >= 3 || (hotLand && hotLand.n >= 5);
        item = { kind: 'early', sev: 900, val: 'Game over', unit: '', facts: ['' + sinceLand + ' s nach Landung'].concat(hotLand && hotLand.n ? [plural(hotLand.n, 'Gegner', 'Gegner') + ' am Landeplatz'] : [], bf),
          txt: 'Du wurdest nur ' + sinceLand + ' s nach der Landung ' + verb + by + (dm != null ? ' (' + dm + ' m)' : '') + '.' + (heavy ? ' Am Landeplatz waren ' + Math.max(nF, hotLand ? hotLand.n : 0) + ' Gegner in der Nähe.' : ''),
          better: heavy
            ? 'Der Landeplatz war zu heiß: lande dort, wo höchstens 1–2 Teams hinfallen, und hol dir erst Waffe, Schild und Mats. Den ersten Fight nimmst du nur mit Ausrüstung.'
            : (dm != null && dm > 50 ? 'Auf Distanz (' + dm + ' m) ohne Deckung verlierst du den Schlagabtausch. Nach der Landung zuerst Cover suchen und Waffe looten, statt offen über das Feld zu laufen.'
              : 'Prüfe nach der Landung zuerst, wer in der Nähe ist. Erst Waffe und Heilung looten, dann den Fight annehmen – nicht sofort pushen.') };
      } else if (inStorm) {
        item = { kind: 'storm', sev: 780, val: 'Game over', unit: '', facts: ['Zone ' + zn, rel > 1 ? Math.round((rel - 1) * 100) + ' % außerhalb des Kreises' : 'im Sturm'].concat(bf),
          txt: 'Du bist in Zone ' + zn + ' im bzw. am Sturm ' + verb + by + (dm != null ? ' (' + dm + ' m)' : '') + ' – du hast die Zone zu spät erreicht und warst dadurch geschwächt.',
          better: 'Wer im Sturm kämpft, hat schon Leben verloren. Gehe früher los und komm gesund in der Zone an – dort kannst du Fights aus der Position heraus annehmen.' };
      } else if (tn > 1 && nm != null && nm > 8000 && mAlive > 0) {
        item = { kind: 'alone', sev: 700 + Math.min(100, nm / 200), val: 'Game over', unit: '', facts: ['Zone ' + zn].concat(bf),
          txt: 'Du bist in Zone ' + zn + ' ' + verb + by + (dm != null ? ' (' + dm + ' m)' : '') + ' – dein nächster Mate war ' + meters(nm) + ' m entfernt.',
          better: 'Bleibt in Reichweite (unter ca. 40 m): so könnt ihr Fights zu zweit nehmen und euch wiederbeleben. Wer allein steht, verliert den Fight, bevor Hilfe da ist.' };
      } else if (loss && tEnd - loss.t < 30) {
        item = { kind: 'aftermate', sev: 760, val: 'Game over', unit: '', facts: ['Zone ' + zn, 'nur ' + Math.round(tk - loss.t) + ' s nach Mate-Verlust'].concat(bf),
          txt: 'Nur ' + Math.round(tk - loss.t) + ' s nachdem ' + loss.vn + ' gefallen war, wurdest du in Zone ' + zn + ' ' + verb + by + '.',
          better: 'Nach einem Mate-Verlust nicht sofort nachpushen: erst Cover, Heilung und Überblick (Wo steht der Gegner? Wie viele sind es?), dann entscheiden. Ein 1vs2 ohne Position verlierst du fast immer.' };
      } else if (nF >= 3) {
        item = { kind: 'outnum', sev: 740, val: 'Game over', unit: '', facts: ['Zone ' + zn].concat(bf),
          txt: 'In Zone ' + zn + ' wurdest du ' + verb + by + ' – ' + nF + ' Gegner standen in 100 m um dich' + (mAlive > 0 && (nm == null || nm > 4000) ? ', dein Team war nicht in der Nähe.' : '.'),
          better: (nm != null && nm <= 4000 ? 'Ihr wart zusammen, aber bei ' : 'Bei ') + 'so vielen Gegnern im Umkreis ist jeder Fight ein Third-Party-Risiko. Weiche aus, bevor es eng wird, oder nimm den Kampf nur, wenn ihr ihn schnell entscheiden könnt und Cover habt.' };
      } else if (dzK != null && dzK > 700) {
        item = { kind: 'lowground', sev: 720, val: 'Game over', unit: '', facts: ['Gegner ' + meters(dzK) + ' m höher', 'Zone ' + zn].concat(bf),
          txt: 'In Zone ' + zn + ' wurdest du ' + verb + by + (dm != null ? ' (' + dm + ' m)' : '') + ' – der Gegner stand ' + meters(dzK) + ' m höher als du.',
          better: 'Wer oben steht, gewinnt den Schlagabtausch. Nimm Höhe oder Deckung, bevor du in einen Fight gehst – und lauf nicht frontal gegen einen höheren Gegner an.' };
      } else if (dm != null && dm >= 60) {
        item = { kind: 'range', sev: 650, val: 'Game over', unit: '', facts: ['Zone ' + zn].concat(bf).concat(sprint ? ['beim Sprint erwischt'] : []),
          txt: 'In Zone ' + zn + ' wurdest du auf ' + dm + ' m ' + verb + by + (sprint ? ' – du bist dabei offen gerannt.' : '.'),
          better: 'Auf große Distanz verlierst du gegen jeden, der dich sieht. Laufe nicht ungedeckt über offenes Gelände: bewege dich von Deckung zu Deckung oder bau dir eine Wand, bevor du kreuzt.' };
      } else {
        item = { kind: 'death', sev: 600, val: 'Game over', unit: '', facts: ['Zone ' + zn].concat(bf),
          txt: 'Du bist in Zone ' + zn + ' ' + verb + by + (dm != null ? ' (' + dm + ' m)' : '') + '.',
          better: 'Prüfe vor jedem Fight Zone, Heilung und Deckung – und nimm nur Fights, in denen du die bessere Position hast. Wenn du unsicher bist, resette erst.' };
      }
      item.t = tk; item.zone = zn;
      mis.push(item);
    }

    /* --- Analyse: Mates, die weit weg von dir fielen --- */
    var far = null;
    ev.forEach(function (e) {
      if (e.v == null || e.v < 1 || e.v >= tn || !alive(mp, e.t)) return;
      var a = posAt(players[e.v], e.t), b = posAt(mp, e.t);
      if (!a || !b) return;
      var dd2 = dist(a, b);
      if (dd2 > 10000 && (!far || dd2 > far.d)) far = { t: e.t, d: dd2, n: e.vn, kn: e.kn, down: e.down };
    });
    if (far) mis.push({ t: far.t, kind: 'team', sev: 500 + Math.min(100, far.d / 200), val: meters(far.d) + ' m', unit: 'getrennt', zone: zoneNo(R, far.t),
      facts: [meters(far.d) + ' m Abstand', 'Zone ' + zoneNo(R, far.t)],
      txt: far.n + ' wurde' + (far.kn ? ' von ' + far.kn : '') + (far.down ? ' niedergeschossen' : ' eliminiert') + ', während du ' + meters(far.d) + ' m entfernt warst.',
      better: 'Haltet engen Kontakt: wenn ein Mate down geht, musst du in wenigen Sekunden bei ihm sein können. Bleibt unter ca. 40 m zusammen und gebt euch Cover beim Wiederbeleben.' });

    /* --- Treffer auf dich (geschaetzt): HP+Schild-Abfall mit Gegner im Umkreis --- */
    R.hits = [];
    if (mp.vit && mp.vit.length >= 5) {
      var lastHit = -9;
      for (var vi = 1; vi < mp.vit.length && R.hits.length < 400; vi++) {
        var va = mp.vit[vi - 1], vb = mp.vit[vi], drop = (va[1] + va[2]) - (vb[1] + vb[2]);
        if (drop < 8 || vb[0] - va[0] > 4 || vb[0] - lastHit < 0.8) continue;
        var tb = vb[0], pme = posAt(mp, tb), bestF = null;
        if (!pme) continue;
        for (var fi = tn; fi < players.length; fi++) {
          var fp = players[fi];
          if (!present(fp, tb)) continue;
          var fq = posAt(fp, tb); if (!fq) continue;
          var dd0 = dist(fq, pme);
          if (dd0 < 12000 && (!bestF || dd0 < bestF.d)) bestF = { k: fi, d: dd0 };
        }
        if (bestF) { R.hits.push({ t: Math.round(tb * 10) / 10, k: bestF.k, dmg: Math.round(drop) }); lastHit = tb; }
      }
    }

    /* --- Analyse: Leben / Schild / Heilung (nur wenn der Replay-Besitzer Leben-Daten hat) --- */
    if (mp.vit && mp.vit.length > 5) {
      var invN = (d.inv || {}).names || [];
      var healN = function (t) {
        var iv = CFT.invAt(mp, t, invN), o = [], n = 0;
        if (iv) Object.keys(iv.heal).forEach(function (k) { o.push(iv.heal[k] + '× ' + k); n += iv.heal[k]; });
        return { txt: o.join(', '), n: n, has: !!iv };
      };
      var lowBest = null;
      Zs.forEach(function (z, k) {
        if (k < 2 || z.s <= (landT != null ? landT + 10 : 0) || (mp.dead != null && z.s > mp.dead - 3)) return;
        var v0 = CFT.vitAt(mp, z.s); if (!v0) return;
        var tot = v0.hp + v0.sh, hl = healN(z.s);
        if (tot < 130 && (!lowBest || tot < lowBest.tot)) lowBest = { z: z, k: k, v: v0, tot: tot, hl: hl };
      });
      if (lowBest) {
        var lz = lowBest.k + 1, lv = lowBest.v, lh = lowBest.hl;
        mis.push({ t: lowBest.z.s, kind: 'lowhp', sev: 440 + Math.min(60, (130 - lowBest.tot) / 2), val: Math.round(lowBest.tot) + ' HP', unit: 'bei Zonenstart', zone: lz,
          facts: ['Leben ' + Math.round(lv.hp), 'Schild ' + Math.round(lv.sh)].concat(lh.has ? [lh.n ? lh.txt + ' im Inventar' : 'keine Heilung im Inventar'] : []),
          txt: 'Zone ' + lz + ' zog zu und du hattest nur ' + Math.round(lv.hp) + ' Leben und ' + Math.round(lv.sh) + ' Schild – das ist wenig Puffer für den ersten Fight im Kreis.',
          better: lh.has && lh.n
            ? 'Du hattest ' + lh.txt + ' dabei: heile während der Rotation (Bandage/Schild trinken, solange niemand schießt), damit du mit vollem Puffer in die Zone kommst.'
            : 'Sammle vor Zone ' + lz + ' Schild und Heilung ein (Kisten, Loot der Gegner), statt mit halber Leiste in den Kreis zu gehen.' });
      }
      /* mit ungenutzter Heilung gestorben */
      if (mp.dead != null && mp.dead > 30) {
        var vD = CFT.vitAt(mp, mp.dead - 8), hD = healN(mp.dead - 3);
        if (vD && hD.has && hD.n >= 2 && vD.hp + vD.sh < 150) {
          mis.push({ t: mp.dead - 8, kind: 'unheal', sev: 680, val: hD.n + '×', unit: 'Heilung übrig', zone: zoneNo(R, mp.dead - 8),
            facts: ['Leben ' + Math.round(vD.hp), 'Schild ' + Math.round(vD.sh), hD.txt + ' übrig'],
            txt: 'Kurz vor deiner Elimination hattest du nur ' + Math.round(vD.hp) + ' Leben und ' + Math.round(vD.sh) + ' Schild – im Inventar lagen aber noch ' + hD.txt + '.',
            better: 'Nutze Heilung, sobald du aus dem Fight bist: erst Deckung bauen, dann trinken/heilen. Mit vollem Schild überlebst du den nächsten Peek deutlich öfter.' });
        }
      }
    }

    /* --- Analyse: Team-Abstand über das ganze Game --- */
    if (tn > 1 && landT != null) {
      var sp = [], endS = tEnd != null ? tEnd : dur, worst = null;
      for (var ts = landT + 20; ts < endS - 5; ts += 10) {
        var dn = nearestMate(ts);
        if (dn == null) continue;
        sp.push(dn);
        if (!worst || dn > worst.d) worst = { t: ts, d: dn };
      }
      if (sp.length >= 6) {
        var avg = sp.reduce(function (s, v) { return s + v; }, 0) / sp.length, wide = Math.round(100 * sp.filter(function (v) { return v > 10000; }).length / sp.length);
        if (avg > 7000) mis.push({ t: worst.t, kind: 'spread', sev: 420 + Math.min(60, avg / 300), val: meters(avg) + ' m', unit: 'Ø Abstand', zone: zoneNo(R, worst.t),
          facts: ['Ø ' + meters(avg) + ' m zum nächsten Mate', wide + ' % der Zeit über 100 m', 'Max. ' + meters(worst.d) + ' m'],
          txt: 'Du warst im Schnitt ' + meters(avg) + ' m von deinem nächsten Mate entfernt (' + wide + ' % der Zeit über 100 m) – hier waren es ' + meters(worst.d) + ' m.',
          better: 'Ein Team funktioniert nur zusammen: bleibt im Schnitt unter 40 m. Sprecht Rotationen und Landespots vorher ab und lauft gemeinsam los – so gewinnt ihr 2v1-Fights statt einzeln zu sterben.' });
        else if (avg < 4500) good.push({ t: worst.t, txt: 'Starkes Team-Spacing: im Schnitt nur ' + meters(avg) + ' m zum nächsten Mate.' });
      }
    }

    /* --- Auswahl: maximal 8 (je Art höchstens 2), nach Zeit sortiert --- */
    mis.sort(function (a, b) { return b.sev - a.sev; });
    var cntK = {};
    mis = mis.filter(function (m) { cntK[m.kind] = (cntK[m.kind] || 0) + 1; return cntK[m.kind] <= 2; }).slice(0, 8).sort(function (a, b) { return a.t - b.t; });
    mis.forEach(function (m) { m.snap = snapshot(R, m.t); });
    /* --- Auswirkung: HP+Schild-Verlust im Fehlerfenster (nur mit Leben-Daten) --- */
    if (mp.vit && mp.vit.length >= 5) {
      mis.forEach(function (m) {
        var go = m.val === 'Game over', a0 = go ? m.t - 12 : m.t, a1 = go ? m.t : m.t + 15;
        var s0 = CFT.vitAt(mp, a0); if (!s0) return;
        var st = s0.hp + s0.sh, mn = st;
        mp.vit.forEach(function (e) { if (e[0] >= a0 && e[0] <= a1) mn = Math.min(mn, e[1] + e[2]); });
        if (st - mn >= 20) { m.hpLoss = Math.round(st - mn); m.facts = (m.facts || []).concat(['−' + m.hpLoss + ' HP in ' + Math.round(a1 - a0) + ' s']); }
      });
    }

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
      var item = { t: e.t, mk: kt || vt, c: c, txt: txt, kill: kt && !e.down };
      if (!e.down && e.v != null) item.e = { t: e.t, v: e.v, k: e.k != null ? e.k : 999 };
      if (vt && e.k != null && e.k >= tn && e.k < players.length) item.h = { k: e.k, v: e.v, down: !!e.down };
      feed.push(item);
    });
    Zs.forEach(function (z, idx) { feed.push({ t: z.s, mk: true, c: '#d4d4d8', txt: 'Zone ' + (idx + 2) + ' zieht zu' }); });
    drops.forEach(function (s) {
      feed.push({ t: s.t, mk: false, c: '#ffffff22', txt: 'Supply Drop gelandet' });
      if (s.lt != null) feed.push({ t: s.lt, mk: false, c: '#ffffff22', txt: 'Supply Drop geplündert' });
    });
    if (landT != null) {
      feed.push({ t: landT, mk: true, c: '#d4d4d8', txt: landPoi ? 'Du bist gelandet: ' + landPoi.label : 'Du bist gelandet' });
      var first = null;
      ev.forEach(function (e) { if (!first && ((e.v != null && e.v < tn) || (e.k != null && e.k < tn))) first = e; });
      if (first && first.t > landT) feed.push({ t: first.t, mk: true, c: '#d4d4d8', tip: true, txt: 'Erster Kampf deines Teams ' + Math.round(first.t - landT) + ' s nach der Landung' });
    }
    mis.forEach(function (m) { feed.push({ t: m.t, mk: true, c: '#fb923c', tip: true, mis: true, txt: m.txt, better: m.better, kind: m.kind, val: m.val, unit: m.unit, zone: m.zone, facts: m.facts, snap: m.snap }); });
    good.slice(0, 3).forEach(function (g) { feed.push({ t: g.t, mk: true, c: '#4ade80', tip: true, txt: g.txt }); });
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
      place: place > 0 ? place : null, mis: mis.length, landT: landT, landPoi: landPoi ? landPoi.label : null, landName: landPoi ? landPoi.name : null, stormSec: Math.round(stormSec), playlist: pls };
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

  CFT.sortGames = function () { CFT.games.sort(function (a, b) { return (a.mtime || 0) - (b.mtime || 0); }); CFT.games.forEach(function (g, i) { g.i = i; }); };
  CFT.clear = function () { CFT.games.length = 0; };

  if (typeof module !== 'undefined' && module.exports) module.exports = CFT;
})(typeof window !== 'undefined' ? window : globalThis);
