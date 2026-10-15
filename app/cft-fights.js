/* Coco's Fn Tool – Fight-Analyse
 *
 * Findet alle Kämpfe deines Teams in einem geparsten Replay (R aus CFT.parse) und bewertet jeden:
 * Ausgangslage (HP/Schild, Mats, Höhe, Mates in der Nähe, Gegner in der Nähe), Ausgang und was besser gewesen wäre.
 * Läuft im Browser (window.CFT.fights) und in Node (Tests).
 */
(function (root) {
  'use strict';
  var CFT = root.CFT || (typeof require === 'function' ? require('./cft-import.js') : {});
  root.CFT = CFT;

  var GAP = 14;            // Sekunden ohne Ereignis -> neuer Kampf
  var NEAR_ENEMY = 4500;   // cm: Gegner in dieser Nähe zählen zum Kampf (45 m)
  var NEAR_MATE = 4500;    // cm: Mate gilt als "dabei"
  var F_STORM = 32;

  function d2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function idx(pts, t) {
    var lo = 0, hi = pts.length - 1;
    if (t <= pts[0][0]) return 0;
    if (t >= pts[hi][0]) return hi;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (pts[m][0] <= t) lo = m; else hi = m; }
    return lo;
  }
  function zAt(p, t) { return p.pts.length ? (p.pts[idx(p.pts, t)][3] || 0) : 0; }
  function alive(p, t) { return p.dead == null || t < p.dead; }
  function present(p, t) { return p.pts.length && alive(p, t) && t >= p.pts[0][0] - 0.5 && t <= p.pts[p.pts.length - 1][0] + 6; }
  function grade(s) { return s >= 75 ? 'A' : s >= 55 ? 'B' : s >= 40 ? 'C' : 'D'; }
  function plural(n, a, b) { return n === 1 ? a : b; }

  /**
   * @param {object} R   Replay-Modell (R.players, R.hits, R.ev, R.tn, R.invNames)
   * @returns {Array}    Kämpfe, nach Zeit sortiert
   */
  CFT.fights = function (R) {
    if (!R || !R.players || !R.players.length) return [];
    var P = R.players, tn = R.tn || 1, me = P[0], hits = R.hits || [], ev = R.ev || [], names = R.invNames || [];

    /* --- Auslöser sammeln --- */
    var trig = [];
    hits.forEach(function (h) { trig.push({ t: h.t, kind: 'hit', k: h.k, dmg: h.dmg }); });
    ev.forEach(function (e) {
      var vt = e.v != null && e.v < tn, kt = e.k != null && e.k < tn && !(vt && e.k === e.v);
      if (vt || kt) trig.push({ t: e.t, kind: 'ev', e: e });
    });
    trig.sort(function (a, b) { return a.t - b.t; });
    if (!trig.length) return [];

    /* --- zu Kämpfen gruppieren --- */
    var groups = [], cur = null;
    trig.forEach(function (x) {
      if (cur && x.t - cur.t1 <= GAP) { cur.items.push(x); cur.t1 = x.t; }
      else { cur = { t0: x.t, t1: x.t, items: [x] }; groups.push(cur); }
    });

    var out = [];
    groups.forEach(function (g) {
      var ts = Math.max(0, g.t0 - 1.5), pme = CFT.posAt(me, ts);
      if (!pme || !present(me, ts) && !(me.dead != null && me.dead >= g.t0 - 3)) return;

      /* beteiligte Gegner: aus Treffern/Ereignissen + alle in der Nähe */
      var enemy = {};
      g.items.forEach(function (x) {
        if (x.kind === 'hit' && x.k >= tn) enemy[x.k] = 1;
        if (x.kind === 'ev') {
          var e = x.e;
          if (e.v != null && e.v >= tn) enemy[e.v] = 1;
          if (e.k != null && e.k >= tn && e.k < P.length) enemy[e.k] = 1;
        }
      });
      var nearE = 0, minD = Infinity, teams = {};
      for (var i = tn; i < P.length; i++) {
        var p = P[i];
        if (!present(p, ts) && !enemy[i]) continue;
        var q = CFT.posAt(p, ts);
        if (!q) continue;
        var dd = d2(q, pme);
        if (dd <= NEAR_ENEMY || enemy[i]) {
          if (dd <= NEAR_ENEMY) nearE++;
          enemy[i] = 1;
          if (dd < minD) minD = dd;
          teams[p.team >= 0 ? 't' + p.team : 'p' + p.id] = 1;
        }
      }
      var enemyN = Object.keys(enemy).length, teamN = Object.keys(teams).length;

      /* Mates */
      var matesNear = 0, mateAlive = 0, minMate = Infinity;
      for (var m = 1; m < tn; m++) {
        var mp = P[m]; if (!present(mp, ts)) continue;
        mateAlive++;
        var mq = CFT.posAt(mp, ts); if (!mq) continue;
        var md = d2(mq, pme); if (md < minMate) minMate = md;
        if (md <= NEAR_MATE) matesNear++;
      }

      /* Zustand zu Kampfbeginn */
      var v = CFT.vitAt(me, ts), total = v ? Math.round(v.hp + v.sh) : null;
      var iv = CFT.invAt(me, ts, names), mats = iv ? iv.wood + iv.stone + iv.metal : null, heals = 0;
      if (iv) Object.keys(iv.heal).forEach(function (k) { heals += iv.heal[k]; });
      var dz = null;
      if (enemyN) {
        var bestE = null;
        for (var j = tn; j < P.length; j++) {
          if (!enemy[j] || !present(P[j], ts)) continue;
          var eq = CFT.posAt(P[j], ts); if (!eq) continue;
          var ed = d2(eq, pme); if (!bestE || ed < bestE.d) bestE = { d: ed, z: zAt(P[j], ts) };
        }
        if (bestE) dz = zAt(me, ts) - bestE.z;
      }
      var storm = !!(CFT.flagsAt(me, ts) & F_STORM);

      /* Wer hat die Distanz geschlossen? (6 s vor Kampfbeginn: wer ist mehr auf den anderen zugelaufen) */
      var came = null;
      (function () {
        var m0 = CFT.posAt(me, ts - 6); if (!m0 || !pme) return;
        var moveMe = d2(m0, pme), mvE = 0, nE = 0, closeBefore = Infinity, closeNow = Infinity;
        for (var j = tn; j < P.length; j++) {
          if (!enemy[j]) continue;
          var e1 = CFT.posAt(P[j], ts), e0 = CFT.posAt(P[j], ts - 6); if (!e1 || !e0) continue;
          var dn = d2(e1, pme); if (dn > NEAR_ENEMY * 1.4) continue;
          mvE += d2(e1, e0); nE++;
          closeNow = Math.min(closeNow, dn); closeBefore = Math.min(closeBefore, d2(e0, m0));
        }
        if (!nE || !isFinite(closeBefore) || closeBefore - closeNow < 400) return;
        mvE /= nE;
        if (mvE > moveMe * 1.25) came = 'enemy'; else if (moveMe > mvE * 1.25) came = 'me';
      })();

      /* Ausgang */
      var kills = 0, elims = 0, losses = 0, iDown = false;
      g.items.forEach(function (x) {
        if (x.kind !== 'ev') return;
        var e = x.e, vt = e.v != null && e.v < tn, kt = e.k != null && e.k < tn && !(vt && e.k === e.v);
        if (kt && !vt) { kills++; if (!e.down) elims++; }
        if (vt) { losses++; if (e.v === 0) iDown = true; }
      });
      var iDied = me.dead != null && me.dead >= g.t0 && me.dead <= g.t1 + 8;
      var result = (iDied || iDown && !kills) ? 'lost' : kills > 0 && losses === 0 ? 'won' : kills > 0 ? 'trade' : losses > 0 ? 'lostmate' : 'survived';

      /* wer hat zuerst zugeschlagen? (Treffer auf dich vor eigenem Kill/Down) */
      var firstHit = null, firstOwn = null;
      g.items.forEach(function (x) {
        if (x.kind === 'hit' && firstHit == null) firstHit = x.t;
        if (x.kind === 'ev' && firstOwn == null && x.e.k != null && x.e.k < tn && !(x.e.v != null && x.e.v < tn)) firstOwn = x.t;
      });
      var surprised = firstHit != null && (firstOwn == null || firstHit < firstOwn - 0.5);
      var dur = g.t1 - g.t0;

      /* --- Bewertung --- */
      var s = 60, tags = [];
      function add(k, good, w, txt, better) { s += w; tags.push({ k: k, good: good, w: Math.abs(w), txt: txt, better: better || '' }); }
      var mine = 1 + matesNear, solo = tn <= 1;
      if (total != null) {
        if (total >= 180) add('hp', true, 8, 'Volle HP + Schild (' + total + ')');
        else if (total < 100) add('hp', false, -15, 'Nur ' + total + ' HP + Schild beim Kampfstart', came === 'enemy'
          ? 'Die Gegner sind zu dir gekommen – mit nur ' + total + ' HP + Schild war das ein Nachteil. Heile oder trinke Schild schon, sobald du Gegner hörst oder siehst, und baue sofort Deckung, statt offen stehen zu bleiben.'
          : 'Vor dem Fight healen/Schild trinken – unter 100 gar nicht erst pushen, erst Cover bauen und heilen.');
      }
      if (dz != null) {
        if (dz > 400) add('high', true, 8, 'Höhenvorteil');
        else if (dz < -400) add('low', false, -10, 'Tiefer als der Gegner (' + Math.round(-dz / 100) + ' m)', came === 'enemy' ? 'Gegner von oben: sofort Deckung bauen und selbst Höhe nehmen (Ramp/Floor), statt tief stehen zu bleiben.' : 'Höhe nehmen, bevor du pusht: Ramp/Floor bauen oder einen Winkel mit Cover wählen.');
      }
      if (tn > 1 && mateAlive > 0) {
        if (matesNear >= 1) add('team', true, 8, matesNear + ' Mate' + plural(matesNear, '', 's') + ' in der Nähe');
        else if (minMate > 6000) add('alone', false, -12, 'Mates ' + Math.round(minMate / 100) + ' m entfernt', 'Kämpfe nur, wenn ein Mate in ca. 40 m ist – sonst zurück zum Team und gemeinsam pushen.');
      }
      if (solo) {
        if (nearE >= 4) add('outnum', false, -10, nearE + ' Gegner in 45 m um dich', 'Bei vielen Gegnern gleichzeitig nicht in der Mitte kämpfen: Rand oder Höhe suchen, einzelne Gegner herausziehen und Mats für Cover aufsparen.');
        else if (nearE >= 2) add('outnum', false, -5, nearE + ' Gegner in 45 m um dich', 'Bei mehreren Gegnern erst Cover bauen und einen nach dem anderen nehmen, statt offen zu pushen.');
      } else {
        var diff = nearE - mine;
        if (diff >= 2) add('outnum', false, -12, nearE + ' Gegner gegen ' + mine + ' von euch', came === 'enemy'
          ? 'Die Gegner haben euch gepusht: sofort Wand/Cover bauen, Höhe nehmen und mit dem Mate zusammen den Kampf annehmen, statt einzeln offen zu stehen.'
          : 'Bei Unterzahl nicht pushen: Distanz halten, Cover/Höhe nehmen und auf den Zonenzug oder ein Mate warten.');
        else if (diff === 1) add('outnum', false, -6, nearE + ' Gegner gegen ' + mine + ' von euch', came === 'enemy' ? 'Die Gegner sind zu euch gekommen: Mate heranholen und gemeinsam Cover bauen, bevor ihr zurückschießt.' : 'Bei knapper Unterzahl Mate dazuholen, bevor du den Kampf annimmst.');
        if (teamN >= 3) add('third', false, -8, 'Mehrere Teams im Kampf (' + teamN + ')', 'Bei Third-Party sofort Position wechseln, statt im offenen Feld weiterzukämpfen.');
      }
      if (mats != null && mats < 150 && dur > 5) add('mats', false, -8, 'Nur ' + mats + ' Mats im Kampf', 'Vor Fights mindestens 300–500 Mats sammeln – ohne Mats hast du kein Cover und keine Höhe.');
      if (storm) add('storm', false, -6, 'Kampf im Sturm', 'Vor der Zone kämpfen: im Sturm verlierst du HP und die Gegner haben die bessere Position.');
      if (heals > 0 && total != null && total < 100) add('heal', false, -6, heals + ' Heilitem' + plural(heals, '', 's') + ' ungenutzt', 'Heilitems vor dem Kampf benutzen, nicht danach.');
      if (surprised) add('surprise', false, -8, 'Gegner hat zuerst getroffen', 'Mehr scouten (Geräusche, Gebäude vorher checken), damit du den ersten Schuss machst.');
      if (result === 'won') add('result', true, 14, kills + ' ' + plural(kills, 'Gegner', 'Gegner') + ' ausgeschaltet' + (losses ? ' (Mate verloren)' : ''));
      else if (result === 'trade') add('result', true, 4, kills + ' Gegner ausgeschaltet, aber Mate verloren');
      else if (result === 'lost') add('result', false, -14, iDied ? 'Du bist im Kampf ausgeschieden' : 'Du wurdest niedergeschossen');
      else if (result === 'lostmate') add('result', false, -8, 'Ein Mate ist im Kampf gefallen');
      s = Math.max(5, Math.min(99, Math.round(s)));

      var bad = tags.filter(function (x) { return !x.good && x.k !== 'result'; }).sort(function (a, b) { return b.w - a.w; });
      var good = tags.filter(function (x) { return x.good && x.k !== 'result'; }).sort(function (a, b) { return b.w - a.w; });
      var poi = CFT.poiAt ? CFT.poiAt(pme[0], pme[1]) : null;
      out.push({
        t0: Math.round(g.t0 * 10) / 10, t1: Math.round(g.t1 * 10) / 10, ts: ts, dur: Math.round(dur),
        x: pme[0], y: pme[1], poi: poi ? poi.label : null,
        result: result, score: s, grade: grade(s), hp: total, mats: mats, heals: heals,
        enemies: enemyN, enemyNear: nearE, solo: tn <= 1, teams: teamN, matesNear: matesNear, dist: isFinite(minD) ? Math.round(minD / 100) : null,
        dz: dz == null ? null : Math.round(dz / 100), kills: kills, elims: elims, losses: losses,
        surprised: surprised, storm: storm, came: came, tags: tags,
        why: (result === 'won' || result === 'trade' ? (good[0] || bad[0]) : (bad[0] || good[0])) || null,
        better: bad.length ? bad[0].better : ''
      });
    });
    return out;
  };

  /** Bilanz über mehrere Games: [{fights:[...]}, ...] oder direkt Listen */
  CFT.fightSummary = function (lists) {
    var all = [], s = { n: 0, won: 0, trade: 0, lost: 0, lostmate: 0, survived: 0, avg: 0, top: [] };
    (lists || []).forEach(function (l) { (l || []).forEach(function (f) { all.push(f); }); });
    s.n = all.length;
    if (!s.n) return s;
    var cnt = {};
    all.forEach(function (f) {
      s[f.result]++;
      s.avg += f.score;
      if (f.result === 'lost' || f.result === 'lostmate' || f.result === 'trade') f.tags.forEach(function (t) { if (!t.good && t.k !== 'result') { var c = cnt[t.k] || (cnt[t.k] = { k: t.k, n: 0, w: 0, txt: t.txt, better: t.better }); c.n++; c.w += t.w; } });
    });
    s.avg = Math.round(s.avg / s.n);
    s.winRate = Math.round(100 * (s.won + s.trade) / s.n);
    s.top = Object.keys(cnt).map(function (k) { return cnt[k]; }).sort(function (a, b) { return b.n - a.n || b.w - a.w; }).slice(0, 3);
    return s;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CFT;
})(typeof window !== 'undefined' ? window : globalThis);
