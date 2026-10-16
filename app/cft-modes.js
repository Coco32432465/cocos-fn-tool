/* Cocos Tool – Zusatz-Modi (Overlay über dem Menü): Fortschritt & Training, Landung & Rotation, Patchnotes.
 * Eigenständig: legt CSS und DOM selbst an, nutzt nur die Theme-Variablen der App und CFT.stats. */
(function () {
  'use strict';
  var CFT = window.CFT, ST = CFT && CFT.stats;
  if (!ST) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fmt1 = function (v) { return (Math.round(v * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ohne Speicher läuft es trotzdem */ } }
  };
  var fdate = function (ms) { try { return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); } catch (e) { return ''; } };

  /* ---------- CSS ---------- */
  var css = '#cm{position:fixed;inset:0;z-index:72;display:none;flex-direction:column;background:radial-gradient(120% 80% at 50% -10%,rgba(var(--rgb),.14),transparent 60%),var(--bg);color:var(--txt);font-family:Rajdhani,sans-serif}'
    + '#cm.on{display:flex;animation:fade .3s}'
    + '#cm .ch{display:flex;align-items:center;gap:18px;padding:16px 28px;border-bottom:1px solid rgba(var(--rgb),.2);flex-wrap:wrap}'
    + '#cm .cb{font:700 14px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-light);background:transparent;border:1px solid rgba(var(--rgb),.35);border-radius:9px;padding:9px 14px;cursor:pointer}'
    + '#cm .cb:hover{border-color:var(--acc);box-shadow:0 0 16px rgba(var(--rgb),.35)}'
    + '#cm h1{font:900 clamp(16px,2vw,24px) Orbitron,sans-serif;letter-spacing:.1em;color:#fff;margin-right:auto}'
    + '#cm .ct{display:flex;gap:8px;flex-wrap:wrap}'
    + '#cm .ct button,#cm .cc button{font:700 14px Rajdhani,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);background:#0c0c11;border:1px solid #ffffff1c;border-radius:99px;padding:8px 16px;cursor:pointer;transition:.18s}'
    + '#cm .ct button:hover,#cm .cc button:hover{color:#fff;border-color:rgba(var(--rgb),.6)}'
    + '#cm .ct button.on,#cm .cc button.on{color:#fff;background:rgba(var(--rgb),.22);border-color:var(--acc);box-shadow:0 0 14px rgba(var(--rgb),.3)}'
    + '#cm .cbody{flex:1;overflow-y:auto;padding:22px 28px 40px}'
    + '#cm .cw{max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:18px}'
    + '#cm .cc{display:flex;gap:8px;align-items:center;flex-wrap:wrap}'
    + '#cm .cc .lbl{color:var(--mute);font-size:14px;letter-spacing:.12em;text-transform:uppercase;margin-right:4px}'
    + '#cm .kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}'
    + '#cm .k{background:rgba(18,18,24,.8);border:1px solid rgba(var(--rgb),.22);border-radius:12px;padding:14px 16px;position:relative;overflow:hidden}'
    + '#cm .k small{display:block;color:var(--mute);font-size:13px;letter-spacing:.14em;text-transform:uppercase}'
    + '#cm .k b{display:block;font:800 28px Orbitron,sans-serif;color:#fff;margin-top:6px}'
    + '#cm .k b span{font-size:15px;color:var(--mute);font-weight:600}'
    + '#cm .k i{font-style:normal;font-size:14px;font-weight:700;margin-top:4px;display:block;color:var(--mute)}'
    + '#cm .k i.up{color:#4ade80}#cm .k i.dn{color:#ff5a67}'
    + '#cm .pn{background:rgba(18,18,24,.8);border:1px solid rgba(var(--rgb),.2);border-radius:14px;padding:18px 20px}'
    + '#cm .pn h3{font:800 14px Orbitron,sans-serif;letter-spacing:.14em;color:var(--acc-light);text-transform:uppercase;margin-bottom:12px}'
    + '#cm .pn p.s{color:var(--dim,#9a9aa6);font-size:16px;line-height:1.4;margin-bottom:8px}'
    + '#cm .two{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:900px){#cm .two{grid-template-columns:1fr}#cm .ch,#cm .cbody{padding-left:16px;padding-right:16px}}'
    + '#cm .bar{display:flex;align-items:center;gap:12px;margin:9px 0}#cm .bar span{width:190px;flex:none;font-size:16px;line-height:1.2}'
    + '#cm .bar div{flex:1;height:9px;border-radius:9px;background:#ffffff12;overflow:hidden}#cm .bar div i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,var(--acc2),var(--acc))}'
    + '#cm .bar b{width:64px;text-align:right;font:700 15px Orbitron,sans-serif}'
    + '#cm .bar.weak div i{background:linear-gradient(90deg,#ff5a67,#f1c40f)}#cm .bar.good div i{background:linear-gradient(90deg,#22c55e,#4ade80)}'
    + '#cm .ctg{display:inline-block;font:700 12px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:2px 9px;border-radius:99px;border:1px solid currentColor;margin-left:8px}'
    + '#cm .ctg.g{color:#4ade80}#cm .ctg.r{color:#ff5a67}'
    + '#cm .emp{text-align:center;padding:60px 20px;color:var(--dim,#9a9aa6);font-size:18px}#cm .emp b{display:block;font:800 20px Orbitron,sans-serif;color:#fff;margin-bottom:10px}'
    + '#cm svg.chart{width:100%;height:auto;display:block}'
    + '#cm .leg{display:flex;gap:18px;flex-wrap:wrap;color:var(--mute);font-size:14px;margin-top:6px}#cm .leg i{display:inline-block;width:18px;height:3px;border-radius:3px;vertical-align:middle;margin-right:6px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- Overlay ---------- */
  var root = document.createElement('div'); root.id = 'cm'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  root.innerHTML = '<div class="ch"><button class="cb" id="cmb">← Menü</button><h1 id="cmt"></h1><div class="ct" id="cmtabs"></div></div><div class="cbody"><div class="cw" id="cmw"></div></div>';
  document.body.appendChild(root);

  var MODES = {}, cur = null, tab = null;
  function open(id, t) {
    var M = MODES[id]; if (!M) return;
    cur = id; tab = t || (M.tabs[0] && M.tabs[0][0]);
    $('cmt').textContent = M.title; render(); root.classList.add('on');
  }
  function close() { root.classList.remove('on'); cur = null; }
  function render() {
    var M = MODES[cur]; if (!M) return;
    $('cmtabs').innerHTML = M.tabs.length > 1 ? M.tabs.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + esc(t[1]) + '</button>'; }).join('') : '';
    [].forEach.call($('cmtabs').querySelectorAll('button'), function (b) { b.onclick = function () { tab = b.dataset.t; render(); }; });
    var w = $('cmw'); w.innerHTML = ''; M.render(tab, w, render);
    root.querySelector('.cbody').scrollTop = 0;
  }
  $('cmb').onclick = close;
  document.addEventListener('keydown', function (e) { if (e.code === 'Escape' && root.classList.contains('on')) { e.stopPropagation(); close(); } }, true);
  window.cftModes = { open: open, close: close, register: function (id, M) { MODES[id] = M; } };
  function bind(btnId, mode) { var b = $(btnId); if (b) b.addEventListener('click', function (e) { e.stopPropagation(); open(mode); }); }
  CFT.modes = { bind: bind, esc: esc, fmt1: fmt1, store: store, fdate: fdate };

  function games() { return (CFT.games || []).filter(function (g) { return g && g.m; }); }
  function empty(w, msg) { w.innerHTML = '<div class="emp"><b>Noch keine Daten</b>' + esc(msg || 'Analysiere zuerst ein paar Replays im VOD Review, dann erscheinen hier deine Auswertungen.') + '</div>'; }
  CFT.modes.games = games; CFT.modes.empty = empty;

  /* ---------- Fortschritt: Trend ---------- */
  var PERIOD = store.get('cft_period'); if (PERIOD == null) PERIOD = 30;

  function chart(series) {
    var W = 900, H = 270, L = 44, R = 16, T = 14, B = 34, n = series.length;
    var x = function (i) { return n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1); };
    var y = function (v) { return T + (100 - v) * (H - T - B) / 100; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Verlauf der Gesamtnote">';
    [[75, 'A'], [55, 'B'], [40, 'C'], [0, 'D']].forEach(function (g) {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g[0]) + '" y2="' + y(g[0]) + '" stroke="#ffffff" stroke-opacity="' + (g[0] ? '.09' : '.18') + '" stroke-dasharray="' + (g[0] ? '4 5' : '0') + '"/>'
        + '<text x="' + (L - 10) + '" y="' + (y(g[0]) + 5) + '" text-anchor="end" fill="#7c7c8a" font-size="13" font-family="Orbitron,sans-serif">' + g[1] + '</text>';
    });
    var pts = function (k) { return series.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p[k]).toFixed(1); }).join(' '); };
    if (n > 1) {
      s += '<polyline points="' + pts('tot') + '" fill="none" stroke="var(--acc-light)" stroke-opacity=".35" stroke-width="1.5" stroke-linejoin="round"/>';
      s += '<polygon points="' + x(0) + ',' + y(0) + ' ' + pts('ma') + ' ' + x(n - 1) + ',' + y(0) + '" fill="var(--acc)" fill-opacity=".08"/>';
      s += '<polyline points="' + pts('ma') + '" fill="none" stroke="var(--acc)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 6px var(--acc))"/>';
    }
    if (n <= 80) series.forEach(function (p, i) {
      s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.tot).toFixed(1) + '" r="' + (p.win ? 6 : 3.6) + '" fill="' + (p.win ? '#f1c40f' : 'var(--acc-light)') + '" stroke="#0A0A0C" stroke-width="1.5"><title>' + esc(fdate(p.t) + ' · Note ' + fmt1(p.tot / 10) + ' / 10' + (p.place ? ' · Platz #' + p.place : '') + ' · ' + p.kills + ' Elims') + '</title></circle>';
    });
    var step = Math.max(1, Math.ceil(n / 8));
    series.forEach(function (p, i) { if (i % step === 0 || i === n - 1) s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" fill="#7c7c8a" font-size="12" font-family="Rajdhani,sans-serif">' + esc(fdate(p.t)) + '</text>'; });
    return s + '</svg>';
  }

  function kpi(label, val, unit, d, fmtD, extra) {
    var c = d ? (d.flat ? '' : d.good ? 'up' : 'dn') : '', arrow = d ? (d.flat ? '■' : d.d > 0 ? '▲' : '▼') : '';
    return '<div class="k"><small>' + label + '</small><b>' + val + (unit ? ' <span>' + unit + '</span>' : '') + '</b><i class="' + c + '">' + (d ? arrow + ' ' + fmtD(Math.abs(d.d)) + ' zur Vorperiode' : (extra || '&nbsp;')) + '</i></div>';
  }

  function renderTrend(w) {
    var all = games();
    if (!all.length) return empty(w);
    var G = ST.period(all, PERIOD), P = ST.previous(all, PERIOD);
    var chips = '<div class="cc"><span class="lbl">Zeitraum</span>' + [[7, '7 Tage'], [30, '30 Tage'], [0, 'Alle']].map(function (p) { return '<button data-p="' + p[0] + '" class="' + (p[0] === PERIOD ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</div>';
    if (!G.length) { w.innerHTML = chips + '<div class="emp"><b>Keine Games im Zeitraum</b>Wähle „Alle“ oder analysiere neuere Replays.</div>'; return wireChips(w); }
    var S = ST.summary(G), PS = ST.summary(P), tt = ST.trendText(G);
    var h = chips + '<div class="kp">'
      + kpi('Ø Note', fmt1(S.score / 10), '/ 10', ST.delta(S, PS, 'score', false), function (v) { return fmt1(v / 10); })
      + kpi('Ø Platz', S.place ? '#' + fmt1(S.place) : '–', '', ST.delta(S, PS, 'place', true), fmt1, 'Beste: ' + (S.best ? '#' + S.best : '–'))
      + kpi('Elims pro Game', fmt1(S.kpg), '', ST.delta(S, PS, 'kpg', false), fmt1, S.kills + ' gesamt')
      + kpi('Siege', S.wins, '', null, null, S.n + ' Game' + (S.n === 1 ? '' : 's'))
      + kpi('Top 10', S.top10, '', null, null, S.n ? Math.round(100 * S.top10 / S.n) + ' % der Games' : '') + '</div>';
    var headline = tt ? (tt.dir === 'up' ? 'Du wirst besser: <b style="color:#4ade80">+' + fmt1(tt.d / 10) + ' Notenpunkte</b> in der zweiten Hälfte des Zeitraums.'
      : tt.dir === 'down' ? 'Achtung, der Trend zeigt nach unten: <b style="color:#ff5a67">' + fmt1(tt.d / 10) + ' Notenpunkte</b> in der zweiten Hälfte.' : 'Stabil: deine Note bleibt in diesem Zeitraum etwa gleich.') : 'Für einen Trend brauchst du mindestens 4 Games im Zeitraum.';
    h += '<div class="pn"><h3>Verlauf deiner Gesamtnote</h3><p class="s">' + headline + '</p>' + chart(ST.series(G)) + '<div class="leg"><span><i style="background:var(--acc)"></i>Ø der letzten 5 Games</span><span><i style="background:var(--acc-light);opacity:.5"></i>einzelnes Game</span><span><i style="background:#f1c40f;height:9px;width:9px;border-radius:50%"></i>Sieg</span></div></div>';
    var ph = ST.phases(S), W = ST.weaknesses(G).slice(0, 5);
    h += '<div class="two"><div class="pn"><h3>Deine Phasen</h3>' + ph.list.map(function (p) {
      var tg = p === ph.strong && ph.strong.v !== ph.weak.v ? '<span class="ctg g">Stärke</span>' : p === ph.weak && ph.strong.v !== ph.weak.v ? '<span class="ctg r">Schwäche</span>' : '';
      return '<div class="bar ' + (tg.indexOf('Stärke') > 0 ? 'good' : tg ? 'weak' : '') + '"><span>' + p.name + tg + '</span><div><i style="width:' + Math.max(3, p.v) + '%"></i></div><b>' + fmt1(p.v / 10) + '</b></div>';
    }).join('') + (ph.strong.v !== ph.weak.v ? '<p class="s" style="margin-top:12px">Am meisten gewinnst du in der <b>' + ph.weak.name + '</b>: dort liegt dein größtes Potenzial.</p>' : '') + '</div>'
      + '<div class="pn"><h3>Häufigste Fehler</h3>' + (W.length ? W.map(function (x) {
        return '<div class="bar weak"><span>' + esc(x.label) + '</span><div><i style="width:' + Math.max(3, x.pct) + '%"></i></div><b>' + x.pct + ' %</b></div>';
      }).join('') + '<p class="s" style="margin-top:12px">Anteil deiner Games, in denen der Fehler vorkam. Im Trainingsplan packen wir das an.</p>' : '<p class="s">Keine auffälligen Fehler im Zeitraum. Stark!</p>') + '</div></div>';
    w.innerHTML = h; wireChips(w);
  }
  function wireChips(w) {
    [].forEach.call(w.querySelectorAll('.cc button'), function (b) { b.onclick = function () { PERIOD = +b.dataset.p; store.set('cft_period', PERIOD); render(); }; });
  }

  MODES.fort = { title: 'Fortschritt & Training', tabs: [['trend', 'Trend']], render: function (t, w) { renderTrend(w); } };
  bind('mtFort', 'fort');
})();
