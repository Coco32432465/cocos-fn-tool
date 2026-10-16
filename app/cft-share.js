/* Cocos Tool – Runde als Bild teilen (PNG für Discord, TikTok, Instagram).
 * cardData() ist rein (Tests in Node), draw()/save() laufen nur im Browser. */
(function (root) {
  'use strict';
  var CFT = root.CFT || (typeof require === 'function' ? require('./cft-import.js') : {});
  root.CFT = CFT;
  var SH = CFT.share = {};

  SH.FORMATS = { post: [1080, 1350], story: [1080, 1920] };
  var PH = ['Offspawn', 'Midgame', 'Endgame'];
  var grade = function (v) { return v >= 75 ? 'A' : v >= 55 ? 'B' : v >= 40 ? 'C' : 'D'; };

  /** Was auf die Karte kommt – nur Werte, die das Replay wirklich hat */
  SH.cardData = function (g) {
    var m = (g && g.m) || {}, me = (g && g.real && g.real.meta) || {}, LBL = (CFT.stats && CFT.stats.LABEL) || {};
    var mis = (g && (g.mis || m.mis)) || [], top = mis.slice().sort(function (a, b) { return (b.sev || 0) - (a.sev || 0); })[0];
    var ph = (g && g.ph) || m.ph || [], tot = Math.round((g && g.tot) || 0);
    var stats = [];
    if (m.pl > 0) stats.push(['Platz', '#' + m.pl]);
    stats.push(['Elims', String(m.k || 0)]);
    if (me.players) stats.push(['Spieler', String(me.players)]);
    else if (g && g.real && g.real.nPlayers) stats.push(['Spieler', String(g.real.nPlayers)]);
    return {
      title: m.n || 'Game', mode: me.mode || '', land: me.landPoi || '', win: m.pl === 1,
      grade: m.g || grade(tot), score: tot, stats: stats,
      phases: ph.length >= 3 ? PH.map(function (n, i) { return [n, Math.max(0, Math.min(100, Math.round(ph[i] || 0)))]; }) : [],
      focus: top ? (LBL[top.kind] || top.kind) : null, clean: Array.isArray(mis) && mis.length === 0,
      date: g && g.mtime ? new Date(g.mtime).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
    };
  };
  SH.fileName = function (d) { return 'cocos-tool-' + String(d.title || 'game').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.png'; };

  function css(name, fb) { try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; } }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function fit(c, t, max) { t = String(t); if (c.measureText(t).width <= max) return t; while (t.length > 1 && c.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; }

  /** Karte auf ein Canvas zeichnen */
  SH.draw = function (cv, d, fmt) {
    var sz = SH.FORMATS[fmt] || SH.FORMATS.post, W = sz[0], H = sz[1], c = cv.getContext('2d');
    cv.width = W; cv.height = H;
    var acc = css('--acc', '#3b82f6'), acc2 = css('--acc2', '#60a5fa'), rgb = css('--rgb', '59,130,246');
    var gcol = { A: '#4ade80', B: '#facc15', C: '#fb923c', D: '#ff5a67' }[d.grade] || acc;
    c.fillStyle = '#0A0A0C'; c.fillRect(0, 0, W, H);
    var gr = c.createRadialGradient(W / 2, -H * 0.05, 10, W / 2, -H * 0.05, H * 0.75); gr.addColorStop(0, 'rgba(' + rgb + ',.38)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = 1;
    for (var x = 0; x < W; x += 54) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (var y = 0; y < H; y += 54) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    var P = 80, st = H > 1500, V = function (v) { return Math.round(v * (st ? 1.18 : 0.9)); }, cy = st ? 230 : 104;
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillStyle = '#fff'; c.font = '900 46px Orbitron, sans-serif'; c.fillText('COCOS', P, cy);
    var cw = c.measureText('COCOS ').width; c.fillStyle = acc; c.shadowColor = acc; c.shadowBlur = 24; c.fillText('TOOL', P + cw, cy); c.shadowBlur = 0;
    c.textAlign = 'right'; c.fillStyle = '#9a9aa6'; c.font = '600 30px Rajdhani, sans-serif'; c.fillText(d.date, W - P, cy); c.textAlign = 'left';
    cy += V(90);
    c.fillStyle = acc2; c.font = '700 30px Rajdhani, sans-serif'; c.fillText([d.win ? 'VICTORY ROYALE' : 'ROUND REPORT', d.mode].filter(Boolean).join('  ·  ').toUpperCase(), P, cy);
    cy += V(70); c.fillStyle = '#fff'; c.font = '800 58px Orbitron, sans-serif'; c.fillText(fit(c, d.title, W - 2 * P), P, cy);
    if (d.land) { cy += V(52); c.fillStyle = '#c9c9d4'; c.font = '600 34px Rajdhani, sans-serif'; c.fillText(fit(c, 'Gelandet: ' + d.land, W - 2 * P), P, cy); }
    /* große Note */
    cy += V(56); var bh = V(300), bm = bh / 2;
    rr(c, P, cy, W - 2 * P, bh, 28); c.fillStyle = 'rgba(18,18,24,.9)'; c.fill(); c.strokeStyle = 'rgba(' + rgb + ',.45)'; c.lineWidth = 2; c.stroke();
    c.textAlign = 'center'; c.fillStyle = gcol; c.shadowColor = gcol; c.shadowBlur = 40; c.font = '900 200px Orbitron, sans-serif'; c.fillText(d.grade, P + 190, cy + bm + 75); c.shadowBlur = 0;
    c.textAlign = 'left'; c.fillStyle = '#9a9aa6'; c.font = '700 28px Rajdhani, sans-serif'; c.fillText('GESAMTNOTE', P + 380, cy + bm - 40);
    c.fillStyle = '#fff'; c.font = '800 96px Orbitron, sans-serif'; c.fillText((d.score / 10).toFixed(1).replace('.', ','), P + 380, cy + bm + 60);
    var sw = c.measureText((d.score / 10).toFixed(1).replace('.', ',')).width; c.fillStyle = '#9a9aa6'; c.font = '600 40px Rajdhani, sans-serif'; c.fillText('/ 10', P + 395 + sw, cy + bm + 60);
    cy += bh + V(40); var th = V(170);
    /* Kennzahlen */
    var n = d.stats.length, gap = 24, tw = (W - 2 * P - gap * (n - 1)) / n;
    d.stats.forEach(function (s, i) {
      var x0 = P + i * (tw + gap); rr(c, x0, cy, tw, th, 22); c.fillStyle = 'rgba(18,18,24,.9)'; c.fill(); c.strokeStyle = 'rgba(' + rgb + ',.25)'; c.stroke();
      c.textAlign = 'center'; c.fillStyle = '#9a9aa6'; c.font = '700 26px Rajdhani, sans-serif'; c.fillText(s[0].toUpperCase(), x0 + tw / 2, cy + th / 2 - 30);
      c.fillStyle = '#fff'; c.font = '800 64px Orbitron, sans-serif'; c.fillText(s[1], x0 + tw / 2, cy + th / 2 + 50);
    });
    c.textAlign = 'left'; cy += th + V(60);
    /* Phasen */
    d.phases.forEach(function (p) {
      c.fillStyle = '#e8e8ee'; c.font = '700 32px Rajdhani, sans-serif'; c.fillText(p[0], P, cy);
      c.textAlign = 'right'; c.font = '800 32px Orbitron, sans-serif'; c.fillText(String(p[1]), W - P, cy); c.textAlign = 'left';
      rr(c, P, cy + 16, W - 2 * P, 18, 9); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill();
      if (p[1] > 0) { var lg = c.createLinearGradient(P, 0, W - P, 0); lg.addColorStop(0, acc2); lg.addColorStop(1, acc); rr(c, P, cy + 16, Math.max(18, (W - 2 * P) * p[1] / 100), 18, 9); c.fillStyle = lg; c.shadowColor = acc; c.shadowBlur = 14; c.fill(); c.shadowBlur = 0; }
      cy += V(92);
    });
    /* Fokus */
    if (d.focus || d.clean) {
      cy += 6; rr(c, P, cy, W - 2 * P, 110, 18); c.fillStyle = 'rgba(' + rgb + ',.10)'; c.fill(); c.fillStyle = acc; c.fillRect(P, cy, 6, 110);
      c.fillStyle = '#9a9aa6'; c.font = '700 26px Rajdhani, sans-serif'; c.fillText(d.clean ? 'FEHLERFREI' : 'WORAN ICH ARBEITE', P + 34, cy + 44);
      c.fillStyle = '#fff'; c.font = '700 38px Rajdhani, sans-serif'; c.fillText(fit(c, d.clean ? 'Keine auffälligen Fehler in dieser Runde' : d.focus, W - 2 * P - 60), P + 34, cy + 88);
    }
    /* Fuß */
    c.textAlign = 'center'; c.fillStyle = '#9a9aa6'; c.font = '600 30px Rajdhani, sans-serif';
    c.fillText('Analysiert mit Cocos Tool  ·  ' + ((root.CFT_CONFIG && root.CFT_CONFIG.discordInvite) || '').replace(/^https?:\/\//, ''), W / 2, H - (st ? 70 : 40));
    c.textAlign = 'left';
    return cv;
  };

  /** Bild erzeugen und speichern; liefert den Dateinamen */
  SH.save = function (g, fmt) {
    var d = SH.cardData(g), cv = document.createElement('canvas');
    var go = function () {
      SH.draw(cv, d, fmt);
      var a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = SH.fileName(d);
      document.body.appendChild(a); a.click(); a.remove();
      return a.download;
    };
    var F = document.fonts, wait = F && F.load ? Promise.all(['900 46px Orbitron', '800 58px Orbitron', '700 30px Rajdhani', '600 30px Rajdhani'].map(function (f) { return F.load(f).catch(function () { }); })) : Promise.resolve();
    return wait.then(go);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CFT;
})(typeof window !== 'undefined' ? window : globalThis);
