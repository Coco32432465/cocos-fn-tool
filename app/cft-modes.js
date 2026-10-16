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
    + '#cm .tk{display:flex;gap:12px;align-items:flex-start;padding:9px 0;cursor:pointer;font-size:17px;line-height:1.3;border-top:1px solid #ffffff0d}#cm .tk:first-of-type{border-top:0}'
    + '#cm .tk input{position:absolute;opacity:0}#cm .tk i{flex:none;width:22px;height:22px;border-radius:7px;border:1.5px solid #ffffff44;display:grid;place-items:center;font-style:normal;font-size:14px;color:#fff;transition:.15s;margin-top:1px}'
    + '#cm .tk:hover i{border-color:var(--acc)}#cm .tk.done i{background:var(--acc);border-color:var(--acc);box-shadow:0 0 10px var(--acc)}#cm .tk.done span{color:var(--mute);text-decoration:line-through}'
    + '#cm .pi{border:1px solid rgba(var(--rgb),.2);border-radius:12px;padding:14px 16px;background:#0c0c11}#cm .pi h4{font:800 16px Orbitron,sans-serif;color:#fff;letter-spacing:.06em}#cm .pi .gl{color:var(--dim,#9a9aa6);font-size:16px;margin:4px 0 8px}'
    + '#cm .pb2{height:10px;border-radius:10px;background:#ffffff12;overflow:hidden;margin:8px 0 4px}#cm .pb2 i{display:block;height:100%;background:linear-gradient(90deg,var(--acc2),var(--acc));box-shadow:0 0 12px var(--acc)}'
    + '#cm .mv{font-size:15px;margin:6px 0;color:var(--mute)}#cm .mv b.g{color:#4ade80}#cm .mv b.r{color:#ff5a67}'
    + '#cm .btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}#cm .pbtn{font:800 14px Orbitron,sans-serif;letter-spacing:.12em;padding:12px 18px;border-radius:9px;border:1px solid var(--acc);background:var(--acc);color:#fff;cursor:pointer;box-shadow:0 0 18px rgba(var(--rgb),.35)}'
    + '#cm .pbtn.gh{background:transparent;color:var(--acc-light);box-shadow:none;border-color:rgba(var(--rgb),.4)}#cm .pbtn:hover{filter:brightness(1.15)}'
    + '#cm .gr{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}#cm .gr .pi{display:flex;flex-direction:column;gap:6px}#cm .gr .pi .btns{margin-top:auto;padding-top:8px}'
    + '#cm table.tb{width:100%;border-collapse:collapse;font-size:16px}#cm .tb th{text-align:left;color:var(--mute);font:700 12px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:6px 10px;border-bottom:1px solid #ffffff1a}'
    + '#cm .tb td{padding:11px 10px;border-bottom:1px solid #ffffff0d}#cm .tb tr.cl{cursor:pointer}#cm .tb tr.cl:hover td{background:rgba(var(--rgb),.08)}#cm .tb td b{color:#fff}#cm .tb .hl{color:#4ade80}#cm .tb .lw{color:#ff5a67}'
    + '#cm .cmw{position:relative;width:100%;aspect-ratio:1;border-radius:12px;overflow:hidden;border:1px solid rgba(var(--rgb),.25)}#cm .cmw img{position:absolute;inset:0;width:100%;height:100%}'
    + '#cm .cmw i{position:absolute;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;background:var(--acc);border:2px solid #fff;box-shadow:0 0 10px var(--acc);opacity:.9}'
    + '#cm .zb{display:flex;align-items:flex-end;gap:10px;height:170px;padding:10px 4px 0}#cm .zb div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;font-size:13px;color:var(--mute)}'
    + '#cm .zb div i{display:block;width:100%;max-width:56px;border-radius:7px 7px 0 0;background:linear-gradient(180deg,var(--acc),var(--acc2));min-height:3px}#cm .zb div.bd i{background:linear-gradient(180deg,#ff5a67,#a3182a)}#cm .zb div b{color:#fff;font:700 13px Orbitron,sans-serif}'
    + '#cm .tip{border-left:3px solid var(--acc);padding:8px 14px;margin:8px 0;background:rgba(var(--rgb),.07);border-radius:0 8px 8px 0;font-size:17px;line-height:1.35}'
    + '#cm .sr{flex:1;min-width:220px;background:#0c0c11;border:1px solid #ffffff1c;border-radius:10px;color:#fff;font:600 16px Rajdhani,sans-serif;padding:10px 14px}#cm .sr:focus{outline:none;border-color:var(--acc);box-shadow:0 0 14px rgba(var(--rgb),.3)}'
    + '#cm .pnl{display:flex;flex-direction:column;gap:12px}#cm .pnr{display:grid;grid-template-columns:150px 1fr;gap:16px;background:rgba(18,18,24,.8);border:1px solid rgba(var(--rgb),.18);border-radius:12px;padding:14px 18px}'
    + '#cm .pnr.cur{border-color:var(--acc);box-shadow:0 0 22px rgba(var(--rgb),.25)}#cm .pnr .v b{font:800 20px Orbitron,sans-serif;color:#fff;display:block}#cm .pnr .v span{color:var(--mute);font-size:14px}'
    + '#cm .pnr .v em{display:inline-block;margin-top:6px;font:700 11px Rajdhani,sans-serif;letter-spacing:.14em;font-style:normal;text-transform:uppercase;padding:2px 9px;border-radius:99px;border:1px solid var(--acc);color:var(--acc-light)}'
    + '#cm .pnr p{font-size:17px;line-height:1.45;color:var(--txt)}@media(max-width:700px){#cm .pnr{grid-template-columns:1fr}}'
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
  document.addEventListener('keydown', function (e) { if (e.code === 'Escape' && root.classList.contains('on')) { var pm = $('poimap'); if (pm && !pm.hidden) return; e.stopPropagation(); close(); } }, true);
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

  /* ---------- Fortschritt: Trainingsplan ---------- */
  function renderTrain(w) {
    var all = games(), plan = store.get('cft_plan'), h = '';
    if (plan && plan.items) {
      var pr = ST.planProgress(plan, all);
      h += '<div class="pn"><h3>Aktiver Plan · ' + esc(plan.name) + '</h3><p class="s">Gestartet am ' + esc(new Date(plan.started).toLocaleDateString('de-DE')) + ' · ' + pr.newGames + ' neue Game' + (pr.newGames === 1 ? '' : 's') + ' seitdem</p>'
        + '<div class="pb2"><i style="width:' + pr.pct + '%"></i></div><p class="s">' + pr.done + ' von ' + pr.total + ' Aufgaben erledigt (' + pr.pct + ' %)</p>'
        + '<div class="gr" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:10px">' + plan.items.map(function (it, ii) {
          var pi = pr.items[ii], mv = '';
          if (it.kind) {
            mv = pi.now == null ? '<p class="mv">Noch ' + (pi.need || 3) + ' neue Game' + ((pi.need || 3) === 1 ? '' : 's') + ' bis zur ersten Auswertung. Start: ' + it.base + ' %</p>'
              : '<p class="mv">Seit Planstart: <b class="' + (pi.good ? 'g' : 'r') + '">' + pi.now + ' %</b> (vorher ' + it.base + ' %, Ziel unter ' + it.target + ' %) · ' + pi.n + ' Games' + (pi.reached ? ' · <b class="g">Ziel erreicht!</b>' : '') + '</p>';
          }
          return '<div class="pi"><h4>' + esc(it.title) + '</h4><p class="gl">' + esc(it.goal) + '</p>' + mv + it.tasks.map(function (t, ti) {
            return '<label class="tk' + (t.done ? ' done' : '') + '" data-i="' + ii + '" data-t="' + ti + '"><input type="checkbox"' + (t.done ? ' checked' : '') + '><i>' + (t.done ? '✓' : '') + '</i><span>' + esc(t.t) + '</span></label>';
          }).join('') + '</div>';
        }).join('') + '</div><div class="btns"><button class="pbtn gh" id="plEnd">Plan beenden</button></div></div>';
    } else {
      var auto = ST.autoPlan(all), W = ST.weaknesses(ST.period(all, 30).length >= 3 ? ST.period(all, 30) : ST.sorted(all)).slice(0, 3);
      h += '<div class="pn"><h3>Auto-Plan aus deinen Replays</h3>' + (auto
        ? '<p class="s">Aus deinen letzten Games erstelle ich einen Wochenplan gegen deine häufigsten Fehler:</p>' + auto.items.map(function (it) { return '<div class="bar weak"><span>' + esc(it.title) + '</span><div><i style="width:' + it.base + '%"></i></div><b>' + it.base + ' %</b></div>'; }).join('') + '<div class="btns"><button class="pbtn" id="plAuto">Plan starten</button></div>'
        : '<p class="s">' + (all.length < 3 ? 'Dafür brauche ich mindestens 3 analysierte Games. Du hast ' + all.length + '.' : 'In deinen Games gibt es keinen Fehler, der oft genug vorkommt. Starke Leistung, nimm einen fertigen Plan unten.') + '</p>') + '</div>';
    }
    h += '<div class="pn"><h3>Fertige Pläne</h3><p class="s">Feste Pläne für ein Thema. Du kannst jederzeit wechseln.</p><div class="gr">' + ST.PRESETS.map(function (p) {
      return '<div class="pi"><h4>' + esc(p.name) + '</h4><p class="gl">' + esc(p.blurb) + '</p><p class="mv">' + p.tasks.length + ' Aufgaben</p><div class="btns"><button class="pbtn gh" data-pre="' + p.id + '">Plan starten</button></div></div>';
    }).join('') + '</div></div>';
    w.innerHTML = h;
    var again = function () { renderTrain(w); };
    var a = w.querySelector('#plAuto'); if (a) a.onclick = function () { var p = ST.autoPlan(games()); if (p) { store.set('cft_plan', p); again(); } };
    var e = w.querySelector('#plEnd'); if (e) e.onclick = function () { store.set('cft_plan', null); again(); };
    [].forEach.call(w.querySelectorAll('[data-pre]'), function (b) { b.onclick = function () { var go = function () { store.set('cft_plan', ST.presetPlan(b.dataset.pre)); again(); }; if (store.get('cft_plan') && !window.confirm('Der aktuelle Plan wird ersetzt. Fortfahren?')) return; go(); }; });
    [].forEach.call(w.querySelectorAll('.tk'), function (l) {
      l.onclick = function (ev) { ev.preventDefault(); var p = store.get('cft_plan'); if (!p) return; var t = p.items[+l.dataset.i].tasks[+l.dataset.t]; t.done = !t.done; store.set('cft_plan', p); again(); };
    });
  }


  /* ---------- Fortschritt: Session-Zusammenfassung + Momentum ---------- */
  function momentum(L) {
    var W = 900, H = 230, Lm = 44, R = 20, T = 14, B = 34, x = function (i) { return Lm + i * (W - Lm - R) / 2; }, y = function (v) { return T + (100 - Math.max(0, Math.min(100, v))) * (H - T - B) / 100; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Momentum-Kurve über die drei Phasen">';
    [75, 55, 40, 0].forEach(function (g) { s += '<line x1="' + Lm + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="#fff" stroke-opacity=".09" stroke-dasharray="4 5"/>'; });
    L.games.forEach(function (g) { var ph = g.ph || []; if (ph.length < 3) return; s += '<polyline fill="none" stroke="var(--acc-light)" stroke-opacity=".28" stroke-width="1.6" points="' + [0, 1, 2].map(function (i) { return x(i).toFixed(1) + ',' + y(ph[i]).toFixed(1); }).join(' ') + '"/>'; });
    s += '<polyline fill="none" stroke="var(--acc)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px var(--acc))" points="' + [0, 1, 2].map(function (i) { return x(i).toFixed(1) + ',' + y(L.curve[i]).toFixed(1); }).join(' ') + '"/>';
    [0, 1, 2].forEach(function (i) { s += '<circle cx="' + x(i) + '" cy="' + y(L.curve[i]).toFixed(1) + '" r="6" fill="var(--acc)" stroke="#0A0A0C" stroke-width="2"/><text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" fill="#9a9aa6" font-size="14" font-family="Rajdhani,sans-serif">' + ST.PHASES[i] + '</text><text x="' + x(i) + '" y="' + (y(L.curve[i]) - 12).toFixed(1) + '" text-anchor="middle" fill="#fff" font-size="14" font-weight="700" font-family="Orbitron,sans-serif">' + fmt1(L.curve[i] / 10) + '</text>'; });
    return s + '</svg>';
  }
  function renderSession(w) {
    var L = ST.session(games());
    if (!L) return empty(w);
    var S = L.sum, nm = function (g) { return esc((g.m && g.m.n) || 'Game'); }, pl = function (g) { return g.m && g.m.pl > 0 ? '#' + g.m.pl : '–'; };
    var tt = ST.phases(S), h = '<div class="pn"><h3>Deine letzte Session</h3><p class="s">' + L.n + ' Game' + (L.n === 1 ? '' : 's') + ' am ' + esc(new Date(L.from).toLocaleDateString('de-DE')) + ', ' + esc(new Date(L.from).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })) + ' bis ' + esc(new Date(L.to).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })) + ' Uhr.</p></div>'
      + '<div class="kp">' + kpiS('Ø Note', fmt1(S.score / 10) + ' / 10', S.n + ' Games') + kpiS('Ø Platz', S.place ? '#' + fmt1(S.place) : '–', 'Beste: ' + (S.best ? '#' + S.best : '–')) + kpiS('Elims', S.kills, 'Ø ' + fmt1(S.kpg) + ' pro Game') + kpiS('Siege', S.wins, S.top10 + ' × Top 10') + '</div>'
      + (L.same ? '' : '<div class="two"><div class="pn"><h3>Beste Runde</h3><p class="s"><b style="color:#4ade80">' + nm(L.best) + '</b><br>Note ' + fmt1(L.best.tot / 10) + ' · Platz ' + pl(L.best) + ' · ' + ((L.best.m && L.best.m.k) || 0) + ' Elims</p></div>'
        + '<div class="pn"><h3>Schwächste Runde</h3><p class="s"><b style="color:#ff5a67">' + nm(L.worst) + '</b><br>Note ' + fmt1(L.worst.tot / 10) + ' · Platz ' + pl(L.worst) + ' · ' + ((L.worst.m && L.worst.m.k) || 0) + ' Elims</p></div></div>')
      + '<div class="pn"><h3>Momentum-Kurve</h3><p class="s">So lief deine Session durch die drei Phasen (dicke Linie = Durchschnitt, dünne Linien = einzelne Games).' + (tt.weak && tt.strong.v !== tt.weak.v ? ' Dein Einbruch liegt in der <b>' + tt.weak.name + '</b>.' : '') + '</p>' + momentum(L) + '</div>'
      + '<div class="two"><div class="pn"><h3>Deine 2 größten Fehler</h3>' + (L.mistakes.length ? L.mistakes.map(function (x) { return '<div class="bar weak"><span>' + esc(x.label) + '</span><div><i style="width:' + Math.max(3, x.pct) + '%"></i></div><b>' + x.pct + ' %</b></div>'; }).join('') : '<p class="s">Keine auffälligen Fehler. Stark!</p>') + '</div>'
      + '<div class="pn"><h3>Ziel für die nächste Session</h3><div class="tip">' + esc(L.goal) + '</div></div></div>';
    w.innerHTML = h;
  }

  /* ---------- Fortschritt: Vergleich mit der Community ---------- */
  var REF = null, REFT = 0;
  function renderCompare(w) {
    var all = games();
    if (!all.length) return empty(w);
    var mine = ST.summary(ST.sorted(all));
    var draw = function (ref) {
      if (!ref || !ref.ok) { w.innerHTML = '<div class="emp"><b>Vergleich nicht verfügbar</b>Du bist offline oder der Server ist gerade nicht erreichbar.</div>'; return; }
      if (!ref.all && !ref.top) { w.innerHTML = '<div class="emp"><b>Noch zu wenige Teilnehmer</b>Der Vergleich startet, sobald mindestens 5 Spieler die Rangliste aktiviert haben (Einstellungen → Rangliste). Du kannst gleich selbst mitmachen!</div>'; return; }
      var block = function (title, r, sub) {
        var rows = ST.compare(mine, r); if (!rows.length) return '';
        return '<div class="pn"><h3>' + title + '</h3><p class="s">' + sub + '</p>' + rows.map(function (x) {
          var mv = x.div === 10 ? x.mine / 10 : x.mine, rv = x.div === 10 ? x.ref / 10 : x.ref, mx = Math.max(mv, rv, 0.1);
          return '<div class="bar ' + (x.better ? 'good' : 'weak') + '"><span>' + x.label + '<span class="ctg ' + (x.better ? 'g' : 'r') + '">' + (x.better ? 'besser' : 'darunter') + '</span></span><div><i style="width:' + Math.max(3, mv / mx * 100) + '%"></i></div><b>' + (x.unit || '') + fmt1(mv) + (x.suffix || '') + '</b></div>'
            + '<div class="bar"><span style="color:var(--mute)">Community</span><div><i style="width:' + Math.max(3, rv / mx * 100) + '%;opacity:.5"></i></div><b style="color:var(--mute)">' + (x.unit || '') + fmt1(rv) + (x.suffix || '') + '</b></div>';
        }).join('') + '</div>';
      };
      w.innerHTML = '<div class="pn"><h3>Du gegen die Community</h3><p class="s">Verglichen werden deine Werte über alle ' + mine.n + ' analysierten Games mit den freiwillig geteilten Durchschnittswerten der Rangliste. Es werden nur Durchschnitte angezeigt, keine Namen.</p></div><div class="two">'
        + block('Alle Spieler (' + (ref.all ? ref.all.n : 0) + ')', ref.all, 'Der Durchschnitt aller Teilnehmer.') + block('Top 10', ref.top, 'Der Durchschnitt der zehn besten Spieler. Das ist dein Ziel.') + '</div>';
    };
    if (REF && Date.now() - REFT < 120000) return draw(REF);
    w.innerHTML = '<div class="emp"><b>Lade Vergleich …</b></div>';
    if (!(window.fn && window.fn.rankAvg)) return draw(null);
    window.fn.rankAvg().then(function (r) { REF = r; REFT = Date.now(); if (cur === 'fort' && tab === 'cmp') draw(r); }, function () { draw(null); });
  }


  /* ---------- Team (Coach-Dashboard) ---------- */
  var TM = { d: null, msg: '', err: false, busy: false };
  var hasTeam = function () { return window.fn && window.fn.team; };
  var teamTimer = 0;
  window.cftTeamSync = function () { // nach neuen Analysen: nur wenn der Spieler in einem Team ist
    clearTimeout(teamTimer);
    teamTimer = setTimeout(function () { var m = store.get('cft_team'); var P = ST.teamPayload && ST.teamPayload(CFT.games); if (m && m.in && P && hasTeam()) window.fn.team('sync', { stats: P }); }, 5000);
  };
  function spark(t) {
    if (!t || t.length < 2) return '';
    var W = 96, H = 26, mn = Math.min.apply(null, t), mx = Math.max.apply(null, t), r = (mx - mn) || 1;
    var pts = t.map(function (v, i) { return (i * W / (t.length - 1)).toFixed(1) + ',' + (H - 3 - (v - mn) / r * (H - 6)).toFixed(1); }).join(' ');
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><polyline points="' + pts + '" fill="none" stroke="var(--acc)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function teamStyle() {
    if (document.getElementById('tmcss')) return;
    var st = document.createElement('style'); st.id = 'tmcss';
    st.textContent = '#cm .tmt{width:100%;border-collapse:collapse}#cm .tmt th{font:700 13px Rajdhani,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);text-align:left;padding:8px 10px;border-bottom:1px solid #ffffff1c}'
      + '#cm .tmt td{padding:10px;border-bottom:1px solid #ffffff10;font-size:17px;color:var(--txt);vertical-align:middle}#cm .tmt td b{color:#fff}#cm .tmt .n{text-align:right;font-variant-numeric:tabular-nums}'
      + '#cm .tmt button{font:700 13px Rajdhani,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);background:transparent;border:1px solid #ffffff22;border-radius:8px;padding:5px 10px;cursor:pointer}#cm .tmt button:hover{color:#ff5a6a;border-color:#ff5a6a}'
      + '#cm .tmi{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}#cm .tmi div{background:rgba(var(--rgb),.08);border:1px solid rgba(var(--rgb),.2);border-radius:12px;padding:12px 14px}'
      + '#cm .tmi span{display:block;color:var(--mute);font:700 12px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase}#cm .tmi b{display:block;color:#fff;font-size:19px;margin-top:3px}'
      + '#cm .tmc{font:800 22px Orbitron,sans-serif;letter-spacing:.14em;color:var(--acc-light);user-select:all}'
      + '#cm .tmin{font:600 18px Rajdhani,sans-serif;color:#fff;background:#0c0c11;border:1px solid #ffffff2a;border-radius:10px;padding:10px 14px;letter-spacing:.1em;text-transform:uppercase;width:220px}';
    document.head.appendChild(st);
  }
  function tmCall(w, a, b, then) {
    TM.busy = true; TM.msg = ''; TM.err = false;
    window.fn.team(a, b).then(function (r) {
      TM.busy = false;
      if (r && r.ok) { if (r.role !== undefined) TM.d = r; if (then) then(r); }
      else { TM.msg = (r && (r.message || r.error)) || 'Das hat nicht geklappt.'; TM.err = true; }
      renderTeam(w, true);
    }).catch(function () { TM.busy = false; TM.msg = 'Nicht erreichbar.'; TM.err = true; renderTeam(w, true); });
  }
  function renderTeam(w, keep) {
    teamStyle();
    if (!hasTeam()) { w.innerHTML = '<div class="emp"><b>Nur in der Desktop-App</b>Team-Funktionen brauchen die installierte App und eine Discord-Verbindung.</div>'; return; }
    if (!keep || !TM.d) {
      if (!keep) { w.innerHTML = '<div class="emp"><b>Lade Team …</b></div>'; }
      return window.fn.team('me').then(function (r) {
        if (!r || !r.ok) { w.innerHTML = '<div class="emp"><b>Team nicht verfügbar</b>' + esc((r && (r.message || r.error)) || 'Bitte zuerst im Menü mit Discord verbinden.') + '</div>'; return; }
        TM.d = r; store.set('cft_team', { in: !!r.role });
        var P = ST.teamPayload && ST.teamPayload(CFT.games);
        if (r.role && P) window.fn.team('sync', { stats: P });
        renderTeam(w, true);
      });
    }
    var d = TM.d, h = '', dis = TM.busy ? ' disabled' : '';
    if (TM.msg) h += '<div class="pcbox' + (TM.err ? '' : '') + '"><p style="color:' + (TM.err ? '#ff5a6a' : '#fff') + '">' + esc(TM.msg) + '</p></div>';
    if (!d.role) {
      h += '<div class="pcbox"><h3>Team beitreten</h3><p>Gib den Team-Code von deinem Coach ein. Dein Coach sieht dann deine <b>Gesamtwerte</b> (Ø Note, Runden, Siege, Elims, häufigste Fehler, Notenverlauf). <b>Keine Replays, keine Einzelheiten.</b> Du kannst das Team jederzeit verlassen, dann sind deine Werte für den Coach weg.</p>'
        + '<input class="tmin" id="tmcode" maxlength="12" placeholder="T-XXXXXX" autocomplete="off"> <button class="pcbtn" id="tmjoin"' + dis + '>Beitreten</button></div>'
        + '<div class="pcbox"><h3>Du bist Coach?</h3><p>Mit der <b>Team-Lizenz</b> (5 Keys und Coach-Dashboard) siehst du Stats, Schwächen und Verlauf deines ganzen Teams. Kaufen: im Discord ein Kauf-Ticket öffnen und „Team-Lizenz“ wählen.</p></div>';
    } else if (d.role === 'member') {
      h += '<div class="pcbox"><h3>' + esc(d.team.name) + '</h3><p>Coach: <b>' + esc(d.team.coach || 'Coach') + '</b>. Dein Coach sieht deine Gesamtwerte und wird bei neuen Analysen automatisch aktualisiert.' + (d.team.active ? '' : ' <b style="color:#ff5a6a">Die Team-Lizenz ist abgelaufen.</b>') + '</p>'
        + '<button class="pcbtn" id="tmsync"' + dis + '>Jetzt aktualisieren</button><button class="pcbtn g" id="tmleave"' + dis + '>Team verlassen</button></div>';
    } else {
      var ms = d.members || [], I = ST.teamInsight && ST.teamInsight(ms);
      h += '<div class="pcbox"><h3>' + esc(d.team.name) + '</h3><p>Team-Code zum Weitergeben: <span class="tmc">' + esc(d.team.code) + '</span><br>' + ms.length + ' von ' + d.team.seats + ' Plätzen belegt · gültig bis <b>' + new Date(d.team.expires_at * 1000).toLocaleDateString('de-DE') + '</b>'
        + (d.team.active ? '' : ' · <b style="color:#ff5a6a">abgelaufen. Verlängere im Discord.</b>') + '</p>'
        + '<input class="tmin" id="tmname" maxlength="24" value="' + esc(d.team.name) + '" style="text-transform:none"> <button class="pcbtn g" id="tmren"' + dis + '>Umbenennen</button></div>';
      if (d.team.active) {
        if (I) {
          h += '<div class="pcbox"><h3>Team-Überblick</h3><div class="tmi"><div><span>Team-Ø Note</span><b>' + fmt1(I.avg) + '</b></div>'
            + '<div><span>Stärkster</span><b>' + esc(I.best.name) + ' · ' + fmt1(I.best.stats.avgScore) + '</b></div>'
            + (I.worst ? '<div><span>Braucht Hilfe</span><b>' + esc(I.worst.name) + ' · ' + fmt1(I.worst.stats.avgScore) + '</b></div>' : '')
            + (I.rising && I.rising.d > 0 ? '<div><span>Steigt am stärksten</span><b>' + esc(I.rising.m.name) + ' · +' + fmt1(I.rising.d) + '</b></div>' : '')
            + (I.shared ? '<div><span>Gemeinsame Schwäche</span><b>' + esc(I.shared.label) + ' (' + I.shared.count + ' von ' + I.shared.total + ')</b></div>' : '') + '</div></div>';
        }
        h += '<div class="pcbox"><h3>Spieler</h3><table class="tmt"><tr><th>Name</th><th class="n">Runden</th><th class="n">Ø Note</th><th class="n">Ø Platz</th><th class="n">Siege</th><th>Häufigster Fehler</th><th>Verlauf</th><th></th></tr>'
          + ms.map(function (m) {
            var st = m.stats, w0 = st && st.weak && st.weak[0];
            return '<tr><td><b>' + esc(m.name) + '</b>' + (m.coach ? ' <span style="color:var(--mute)">(Coach)</span>' : '') + '</td>'
              + (st ? '<td class="n">' + st.games + '</td><td class="n"><b>' + fmt1(st.avgScore) + '</b></td><td class="n">' + (st.avgPlace ? '#' + fmt1(st.avgPlace) : '–') + '</td><td class="n">' + st.wins + '</td><td>' + (w0 && ST.LABEL[w0.kind] ? esc(ST.LABEL[w0.kind]) + ' · ' + w0.pct + ' %' : '–') + '</td><td>' + spark(st.trend) + '</td>'
                : '<td colspan="6" style="color:var(--mute)">Noch nichts geteilt (braucht analysierte Replays)</td>')
              + '<td>' + (m.coach ? '' : '<button data-k="' + esc(m.id) + '"' + dis + '>Entfernen</button>') + '</td></tr>';
          }).join('') + '</table></div>';
      }
    }
    h += '<div class="cc"><button id="tmref"' + dis + '>Aktualisieren</button></div>';
    w.innerHTML = h;
    var $q = function (id) { return w.querySelector('#' + id); };
    if ($q('tmjoin')) $q('tmjoin').onclick = function () { var c = $q('tmcode').value; tmCall(w, 'join', { code: c }, function (r) { store.set('cft_team', { in: true }); var P = ST.teamPayload && ST.teamPayload(CFT.games); if (P) window.fn.team('sync', { stats: P }); TM.msg = 'Du bist im Team.'; TM.err = false; }); };
    if ($q('tmleave')) $q('tmleave').onclick = function () { tmCall(w, 'leave', {}, function () { store.set('cft_team', { in: false }); TM.d = { ok: true, role: null }; TM.msg = 'Du hast das Team verlassen.'; }); };
    if ($q('tmsync')) $q('tmsync').onclick = function () { var P = ST.teamPayload && ST.teamPayload(CFT.games); if (!P) { TM.msg = 'Noch keine analysierten Runden zum Teilen.'; TM.err = true; return renderTeam(w, true); } tmCall(w, 'sync', { stats: P }, function () { TM.msg = 'Aktualisiert.'; }); };
    if ($q('tmren')) $q('tmren').onclick = function () { var n = $q('tmname').value.trim(); if (n) tmCall(w, 'rename', { name: n }); };
    if ($q('tmref')) $q('tmref').onclick = function () { TM.d = null; TM.msg = ''; renderTeam(w); };
    [].forEach.call(w.querySelectorAll('[data-k]'), function (b) { b.onclick = function () { tmCall(w, 'kick', { id: b.dataset.k }); }; });
  }

  /* ---------- Season-Pass (eigener Modus im Hauptmenü) ---------- */
  var SN = { claimed: [], ents: [], msg: '', err: false, busy: false };
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var TASK_ICON = { analyze: '🎬', wins: '👑', top10: '🏅', elims: '🎯', score: '📈', streak: '🔥', clean: '✨', team: '👥' };
  var hasSeason = function () { return window.fn && window.fn.season; };
  function seasonState() {
    var id = ST.seasonId(), tm = store.get('cft_team'), pv = store.get('cft_prem');
    var prem = SN.ents.indexOf('pass:' + id) >= 0 || (pv && pv === id);
    return ST.season(CFT.games, { premium: !!prem, teamIn: !!(tm && tm.in) });
  }
  function saveUnlocks(sn) { // Kosmetik bleibt dauerhaft freigeschaltet, auch nach Season-Ende
    var c = ST.passCosmetics(sn.level, sn.premium), u = store.get('cft_unl') || { themes: [], titles: [] };
    c.themes.forEach(function (x) { if (u.themes.indexOf(x) < 0) u.themes.push(x); }); c.titles.forEach(function (x) { if (u.titles.indexOf(x) < 0) u.titles.push(x); });
    store.set('cft_unl', u); return u;
  }
  window.cftSeasonRefresh = function () { try { saveUnlocks(seasonState()); } catch (e) { /* ohne Season weiter */ } };
  function seasonStyle() {
    if (document.getElementById('sncss')) return;
    var st = document.createElement('style'); st.id = 'sncss';
    st.textContent = '#cm .snhero{position:relative;overflow:hidden;display:grid;grid-template-columns:auto 1fr auto;gap:28px;align-items:center;padding:24px 28px;border-radius:18px;border:1px solid rgba(var(--rgb),.35);background:radial-gradient(120% 140% at 0% 0%,rgba(var(--rgb),.22),transparent 60%),linear-gradient(135deg,#12121a,#0c0c11);box-shadow:0 0 40px rgba(var(--rgb),.14)}'
      + '#cm .snhero.prem{border-color:#ffc83d88;box-shadow:0 0 44px rgba(255,200,61,.16)}@media(max-width:860px){#cm .snhero{grid-template-columns:1fr;justify-items:center;text-align:center}}'
      + '#cm .snring{position:relative;width:132px;height:132px}#cm .snring svg{width:100%;height:100%;transform:rotate(-90deg)}#cm .snring circle{fill:none;stroke-width:10}#cm .snring .bg{stroke:#ffffff14}#cm .snring .fg{stroke:var(--acc);stroke-linecap:round;filter:drop-shadow(0 0 8px var(--acc));transition:stroke-dashoffset .6s}'
      + '#cm .snhero.prem .snring .fg{stroke:#ffc83d;filter:drop-shadow(0 0 8px #ffc83d)}#cm .snring b{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font:900 38px Orbitron,sans-serif;color:#fff;line-height:1}#cm .snring b small{font:700 12px Rajdhani,sans-serif;letter-spacing:.2em;color:var(--mute);margin-bottom:4px}'
      + '#cm .snhero h2{font:900 26px Orbitron,sans-serif;letter-spacing:.06em;color:#fff}#cm .snhero p{color:var(--dim,#9a9aa6);font-size:17px;margin-top:6px}#cm .snhero p b{color:#fff}'
      + '#cm .snchip{display:inline-block;font:800 12px Rajdhani,sans-serif;letter-spacing:.16em;text-transform:uppercase;padding:4px 12px;border-radius:99px;border:1px solid rgba(var(--rgb),.5);color:var(--acc-light);margin:0 8px 8px 0}#cm .snchip.g{border-color:#ffc83d99;color:#ffc83d;background:rgba(255,200,61,.1)}'
      + '#cm .snnext{margin-top:12px;font-size:17px;color:#fff;background:rgba(255,255,255,.05);border:1px solid #ffffff14;border-radius:10px;padding:9px 14px;display:inline-block}'
      + '#cm .snhero select{font:700 16px Rajdhani,sans-serif;color:#fff;background:#0c0c11;border:1px solid #ffffff2a;border-radius:9px;padding:8px 12px;margin-top:6px}'
      + '#cm .sntrack{position:relative;display:grid;grid-template-columns:repeat(10,minmax(104px,1fr));gap:10px;overflow-x:auto;padding:4px 2px 10px}'
      + '#cm .snc{display:flex;flex-direction:column;gap:8px;align-items:stretch;position:relative}#cm .snc .nd{position:relative;height:30px;display:flex;align-items:center;justify-content:center}'
      + '#cm .snc .nd:before{content:"";position:absolute;left:-6px;right:-6px;top:50%;height:4px;margin-top:-2px;background:#ffffff14}#cm .snc.on .nd:before{background:var(--acc);box-shadow:0 0 10px rgba(var(--rgb),.6)}'
      + '#cm .snc .nd i{position:relative;font-style:normal;font:900 13px Orbitron,sans-serif;min-width:30px;height:30px;border-radius:99px;display:flex;align-items:center;justify-content:center;background:#0c0c11;border:2px solid #ffffff2a;color:var(--mute)}'
      + '#cm .snc.on .nd i{border-color:var(--acc);color:#fff;background:rgba(var(--rgb),.35);box-shadow:0 0 14px rgba(var(--rgb),.5)}#cm .snc.cur .nd i{background:var(--acc)}'
      + '#cm .snt{min-height:92px;border-radius:12px;border:1px solid #ffffff1c;background:rgba(18,18,24,.8);padding:10px 6px;text-align:center;font-size:14px;color:var(--mute);display:flex;flex-direction:column;justify-content:center;align-items:center;gap:5px}'
      + '#cm .snt .ic{font-size:22px;line-height:1}#cm .snt em{font-style:normal;font:800 11px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}#cm .snt strong{color:#fff;font-size:16px;line-height:1.1}'
      + '#cm .snt.got{border-color:var(--acc);background:rgba(var(--rgb),.14);box-shadow:0 0 14px rgba(var(--rgb),.25)}#cm .snt.got em{color:var(--acc-light)}#cm .snt.pre{border-style:dashed}#cm .snt.pre.got{border-style:solid;border-color:#ffc83d;background:rgba(255,200,61,.12);box-shadow:0 0 14px rgba(255,200,61,.22)}#cm .snt.pre.got em{color:#ffc83d}'
      + '#cm .snt.lock{opacity:.55}#cm .snt button{font:800 12px Rajdhani,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#fff;background:var(--acc);border:0;border-radius:7px;padding:6px 10px;cursor:pointer;box-shadow:0 0 12px rgba(var(--rgb),.5)}'
      + '#cm .snk{position:relative;background:rgba(18,18,24,.8);border:1px solid rgba(var(--rgb),.2);border-radius:14px;padding:16px 18px;display:grid;grid-template-columns:auto 1fr;gap:4px 14px;align-items:center}#cm .snk.rec{border-color:var(--acc);box-shadow:0 0 22px rgba(var(--rgb),.22)}#cm .snk.fin{opacity:.7}#cm .snk.rec h4,#cm .snk.fin h4{padding-right:96px}'
      + '#cm .snk .ic{grid-row:1/3;font-size:30px;width:52px;height:52px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:rgba(var(--rgb),.12);border:1px solid rgba(var(--rgb),.3)}'
      + '#cm .snk h4{font:800 18px Rajdhani,sans-serif;color:#fff;letter-spacing:.03em}#cm .snk p{color:var(--dim,#9a9aa6);font-size:15px}#cm .snk .tag{position:absolute;top:10px;right:12px;font:800 11px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-light)}'
      + '#cm .snseg{grid-column:1/-1;display:grid;grid-template-columns:repeat(var(--n),1fr);gap:6px;margin-top:8px}#cm .snseg div{position:relative;height:10px;border-radius:99px;background:#ffffff14;overflow:hidden}#cm .snseg div i{display:block;height:100%;background:var(--acc);box-shadow:0 0 8px var(--acc)}#cm .snseg div.d i{background:#37e08a;box-shadow:0 0 8px #37e08a}'
      + '#cm .snsl{grid-column:1/-1;display:grid;grid-template-columns:repeat(var(--n),1fr);gap:6px;font:700 12px Rajdhani,sans-serif;letter-spacing:.06em;color:var(--mute);text-align:center}#cm .snsl .d{color:#37e08a}';
    document.head.appendChild(st);
  }
  function tile(r, sn, kind) {
    var x = r[kind]; if (!x) return '<div class="snt' + (kind === 'prem' ? ' pre' : '') + ' lock"><em>' + (kind === 'prem' ? 'Premium' : '') + '</em><span class="ic" style="opacity:.25">' + (kind === 'prem' ? '★' : '·') + '</span></div>';
    var got = sn.level >= r.lvl && (kind === 'free' || sn.premium), cls = 'snt' + (got ? ' got' : '') + (kind === 'prem' ? ' pre' : '') + (!got && sn.level < r.lvl ? ' lock' : '');
    var ic = x.type === 'days' ? '⏳' : x.type === 'theme' ? '🎨' : '🏷️', nm = x.type === 'days' ? '+' + x.days + ' Tag' + (x.days === 1 ? '' : 'e') : x.type === 'theme' ? x.label : x.id, em = x.type === 'days' ? 'Bonustage' : x.type === 'theme' ? 'Farbschema' : 'Titel';
    var extra = '';
    if (x.type === 'days' && got) extra = SN.claimed.indexOf(r.lvl) >= 0 ? '<em>✓ abgeholt</em>' : '<button data-c="' + r.lvl + '"' + (SN.busy ? ' disabled' : '') + '>Abholen</button>';
    else if (kind === 'prem' && !sn.premium) extra = '<em>🔒 Premium</em>';
    return '<div class="' + cls + '"><span class="ic">' + ic + '</span><em>' + em + '</em><strong>' + esc(nm) + '</strong>' + extra + '</div>';
  }
  function nextReward(sn) {
    for (var i = 0; i < ST.PASS.length; i++) { var r = ST.PASS[i]; if (r.lvl > sn.level) { var x = r.free; return { lvl: r.lvl, x: x, need: r.lvl * ST.LEVEL_XP - sn.xp }; } }
    return null;
  }
  function renderSeason(w, keep) {
    seasonStyle();
    if (!keep && hasSeason()) {
      w.innerHTML = '<div class="emp"><b>Lade Season …</b></div>';
      return Promise.all([window.fn.licState ? window.fn.licState() : {}, window.fn.season('me')]).then(function (a) {
        SN.ents = (a[0] && a[0].ents) || []; if (a[1] && a[1].ok) SN.claimed = a[1].claimed || [];
        if (SN.ents.indexOf('pass:' + ST.seasonId()) >= 0) store.set('cft_prem', ST.seasonId());
        renderSeason(w, true);
      }).catch(function () { renderSeason(w, true); });
    }
    var sn = seasonState(), u = saveUnlocks(sn), parts = sn.id.split('-'), h = '', R = 54, C = 2 * Math.PI * R;
    if (SN.msg) h += '<div class="pcbox"><p style="color:' + (SN.err ? '#ff5a6a' : '#fff') + '">' + esc(SN.msg) + '</p></div>';
    var title = store.get('cft_title'); if (title && u.titles.indexOf(title) < 0) title = null;
    var nx = nextReward(sn), rec = null;
    sn.tasks.forEach(function (t) { if (t.next) { var p = t.value / t.next.need; if (!rec || p > rec.p) rec = { id: t.id, p: p }; } });
    h += '<div class="snhero' + (sn.premium ? ' prem' : '') + '"><div class="snring"><svg viewBox="0 0 132 132"><circle class="bg" cx="66" cy="66" r="' + R + '"/><circle class="fg" cx="66" cy="66" r="' + R + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - sn.pct / 100)).toFixed(1) + '"/></svg><b><small>LEVEL</small>' + sn.level + '</b></div>'
      + '<div><span class="snchip">Season ' + MONTHS[+parts[1] - 1] + ' ' + parts[0] + '</span><span class="snchip">Noch ' + sn.daysLeft + ' Tag' + (sn.daysLeft === 1 ? '' : 'e') + '</span>' + (sn.premium ? '<span class="snchip g">★ Premium</span>' : '') + '<h2>' + sn.xp + ' XP</h2>'
      + '<p>' + (sn.max ? '<b>Maximales Level erreicht.</b> Stark!' : 'Noch <b>' + (ST.LEVEL_XP - sn.into) + ' XP</b> bis Level ' + (sn.level + 1)) + ' · ' + sn.games + ' Game' + (sn.games === 1 ? '' : 's') + ' in dieser Season' + (sn.premium ? ' · +25 % XP' : '') + '</p>'
      + (nx && nx.x ? '<div class="snnext">Nächste Belohnung (Lv ' + nx.lvl + '): <b>' + esc(nx.x.type === 'days' ? '+' + nx.x.days + ' Bonustag' + (nx.x.days === 1 ? '' : 'e') : nx.x.type === 'theme' ? 'Farbschema ' + nx.x.label : 'Titel ' + nx.x.id) + '</b> · noch ' + nx.need + ' XP</div>' : '') + '</div>'
      + '<div style="text-align:center">' + (u.titles.length ? '<p style="margin:0 0 4px;font-size:14px">Dein Titel</p><select id="sntitle"><option value="">Kein Titel</option>' + u.titles.map(function (t) { return '<option' + (t === title ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' : '<p style="font-size:14px">Titel schaltest du mit Leveln frei</p>') + '</div></div>';
    if (!sn.premium) h += '<div class="pcbox pclock"><p>★ <b>Season-Pass Premium</b> bringt dir goldene Extra-Belohnungen (Farbschemata und Titel) und <b>25 % mehr XP</b>. Kaufen: im Discord im Kanal <b>Shop</b> ein Ticket öffnen und „Season-Pass Premium“ wählen, danach hier auf Aktualisieren.</p></div>';
    h += '<div class="pcbox"><h3>Belohnungs-Leiste</h3><div class="sntrack">' + ST.PASS.map(function (r) {
      return '<div class="snc' + (sn.level >= r.lvl ? ' on' : '') + (sn.level === r.lvl ? ' cur' : '') + '"><div class="nd"><i>' + r.lvl + '</i></div>' + tile(r, sn, 'free') + tile(r, sn, 'prem') + '</div>';
    }).join('') + '</div><p style="margin-top:6px;color:var(--mute);font-size:14px">Oben: kostenloser Pass · Unten: Premium. Farbschemata und Titel behältst du dauerhaft (Einstellungen → Farben). Bonustage holst du hier ab, einmal je Level und Season.</p></div>';
    h += '<div class="pcbox"><h3>Aufgaben</h3><div class="gr" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px">' + sn.tasks.map(function (t) {
      var n = t.tiers.length, nxt = t.next, fin = !nxt, prev = 0, segs = '', labs = '';
      t.tiers.forEach(function (x) {
        var pct = x.done ? 100 : Math.max(0, Math.min(100, Math.round(100 * (t.value - prev) / (x.need - prev))));
        segs += '<div class="' + (x.done ? 'd' : '') + '"><i style="width:' + pct + '%"></i></div>'; labs += '<span class="' + (x.done ? 'd' : '') + '">' + (x.done ? '✓ ' : '') + x.need + ' · ' + x.xp + ' XP</span>'; prev = x.need;
      });
      var val = fmt1(t.value).replace(/,0$/, '');
      return '<div class="snk' + (rec && rec.id === t.id ? ' rec' : '') + (fin ? ' fin' : '') + '">' + (rec && rec.id === t.id ? '<span class="tag">Fast geschafft</span>' : fin ? '<span class="tag" style="color:#37e08a">Erledigt</span>' : '') + '<div class="ic">' + (TASK_ICON[t.id] || '⭐') + '</div><h4>' + esc(t.title) + '</h4>'
        + '<p>' + (fin ? 'Alle Stufen geschafft' + (t.unit ? ' (' + val + ' ' + esc(t.unit) + ')' : '') : val + ' / ' + nxt.need + ' ' + esc(t.unit) + ' · +' + nxt.xp + ' XP') + '</p>'
        + '<div class="snseg" style="--n:' + n + '">' + segs + '</div><div class="snsl" style="--n:' + n + '">' + labs + '</div></div>';
    }).join('') + '</div></div>';
    h += '<div class="cc"><button id="snref">Aktualisieren</button></div>';
    w.innerHTML = h;
    var ti = w.querySelector('#sntitle'); if (ti) ti.onchange = function () { store.set('cft_title', ti.value || null); };
    w.querySelector('#snref').onclick = function () { SN.msg = ''; renderSeason(w, false); };
    [].forEach.call(w.querySelectorAll('[data-c]'), function (b) {
      b.onclick = function () {
        SN.busy = true; SN.msg = ''; renderSeason(w, true);
        window.fn.season('claim', { season: sn.id, level: +b.dataset.c, xp: sn.xp }).then(function (r) {
          SN.busy = false; SN.err = !(r && r.ok);
          if (r && r.claimed) SN.claimed = r.claimed;
          SN.msg = r && r.ok ? '+' + r.days + ' Bonustag' + (r.days === 1 ? '' : 'e') + ' sind auf deinem Key gutgeschrieben.' : ((r && (r.message || r.error)) || 'Das hat nicht geklappt.');
          renderSeason(w, true);
        });
      };
    });
  }
  MODES.fort = { title: 'Fortschritt & Training', tabs: [['trend', 'Trend'], ['sess', 'Session'], ['cmp', 'Vergleich'], ['train', 'Trainingsplan'], ['team', 'Team']], render: function (t, w) { if (t === 'team') renderTeam(w); else if (t === 'train') renderTrain(w); else if (t === 'sess') renderSession(w); else if (t === 'cmp') renderCompare(w); else renderTrend(w); } };
  bind('mtFort', 'fort');
  MODES.season = { title: 'Season-Pass', tabs: [], render: function (t, w) { renderSeason(w, !hasSeason()); } };
  bind('mtSeason', 'season');
  /* ---------- Landung & Rotation ---------- */
  function renderDrops(w) {
    var G = ST.sorted(games()).filter(function (g) { return g.real; });
    if (!G.length) return empty(w);
    var L = ST.drops(G), adv = ST.dropAdvice(L);
    if (!L.length) { w.innerHTML = '<div class="emp"><b>Keine Landeorte erkannt</b>Bei deinen Replays konnte kein Landepunkt bestimmt werden.</div>'; return; }
    var all = []; L.forEach(function (x) { x.pts.forEach(function (q) { all.push(q); }); });
    var h = '<div class="two"><div class="pn"><h3>Deine Landeorte</h3>' + (adv.text ? '<p class="s">' + adv.text + '</p>' : '') + '<table class="tb"><tr><th>Ort</th><th>Landungen</th><th>Ø Note</th><th>Ø Platz</th><th>Elims</th><th>Früh tot</th></tr>'
      + L.map(function (x, i) {
        var cls = adv.best && x.name === adv.best.name ? 'hl' : adv.worst && x.name === adv.worst.name && adv.worst.name !== adv.best.name ? 'lw' : '';
        return '<tr class="cl" data-i="' + i + '"><td><b class="' + cls + '">' + esc(x.name) + '</b></td><td>' + x.c + '</td><td>' + fmt1(x.score / 10) + '</td><td>' + (x.place ? '#' + Math.round(x.place) : '–') + '</td><td>' + fmt1(x.kpg) + '</td><td>' + x.earlyPct + ' %</td></tr>';
      }).join('') + '</table><p class="s" style="margin-top:10px">Klicke auf einen Ort, um die Landepunkte auf der Karte zu sehen.</p></div>'
      + '<div class="pn"><h3>Alle Landungen</h3>' + (window.cftMapSrc ? '<div class="cmw"><img alt="Karte" src="' + window.cftMapSrc + '">' + all.map(function (q) { return '<i style="left:' + q[0] * 100 + '%;top:' + q[1] * 100 + '%"></i>'; }).join('') + '</div>' : '<p class="s">Karte nicht verfügbar.</p>') + '</div></div>';
    w.innerHTML = h;
    [].forEach.call(w.querySelectorAll('tr.cl'), function (r) { r.onclick = function () { var x = L[+r.dataset.i]; if (window.cftPoiMap) window.cftPoiMap({ n: x.name, pts: x.pts, near: x.near }); }; });
  }
  function renderRot(w) {
    var G = ST.sorted(games()).filter(function (g) { return g.real; });
    if (!G.length) return empty(w);
    var R = ST.rotation(G);
    if (!R.n) { w.innerHTML = '<div class="emp"><b>Keine Rotationsdaten</b>In deinen Replays gibt es noch keine ausgewerteten Zonenwechsel.</div>'; return; }
    var h = '<div class="kp">' + kpiS('Rechtzeitig rotiert', R.okPct + ' %', 'über alle Zonenzüge') + kpiS('Schwächster Zonenzug', R.weak ? 'Zone ' + (R.weak.k + 1) : '–', R.weak ? R.weak.okPct + ' % rechtzeitig' : 'noch zu wenig Daten')
      + kpiS('Sturmschaden', R.stormPct + ' %', 'der Games' + (R.stormSecAvg ? ' · Ø ' + R.stormSecAvg + ' s im Sturm' : '')) + kpiS('Team zu weit weg', R.teamPct + ' %', 'der Games') + '</div>';
    h += '<div class="pn"><h3>Rechtzeitig in der nächsten Zone</h3><p class="s">Anteil der Games, in denen du beim Zonenstart schon in der nächsten Zone warst. Rot = unter 60 %.</p><div class="zb">'
      + R.zones.map(function (z) { return '<div class="' + (z.okPct < 60 ? 'bd' : '') + '"><b>' + z.okPct + '%</b><i style="height:' + Math.max(3, z.okPct * 1.1) + 'px" title="' + z.n + ' Games' + (z.gapM ? ' · Ø ' + z.gapM + ' m außerhalb' : '') + '"></i>Z' + (z.k + 1) + '</div>'; }).join('') + '</div></div>';
    h += '<div class="pn"><h3>Das solltest du ändern</h3>' + R.tips.map(function (t) { return '<div class="tip">' + esc(t) + '</div>'; }).join('') + '</div>';
    w.innerHTML = h;
  }
  function kpiS(l, v, sub) { return '<div class="k"><small>' + l + '</small><b>' + v + '</b><i>' + esc(sub) + '</i></div>'; }
  MODES.drop = { title: 'Landung & Rotation', tabs: [['land', 'Landeorte'], ['rot', 'Rotation']], render: function (t, w) { if (t === 'rot') renderRot(w); else renderDrops(w); } };
  bind('mtDrop', 'drop');
  /* ---------- Patchnotes ---------- */
  var PQ = '', PT = '';
  function ago(d) { if (!d) return ''; var t = Date.parse(d); if (isNaN(t)) return d; var n = Math.floor((Date.now() - t) / 864e5); return n <= 0 ? 'Heute' : n === 1 ? 'Gestern' : n < 30 ? 'vor ' + n + ' Tagen' : new Date(t).toLocaleDateString('de-DE'); }
  function renderPatch(w) {
    var L = (window.PATCHNOTES || []).slice();
    var tags = []; L.forEach(function (n) { if (n.tag && tags.indexOf(n.tag) < 0) tags.push(n.tag); });
    w.innerHTML = '<div class="cc"><input class="sr" id="pnq" placeholder="Patchnotes durchsuchen …" value="' + esc(PQ) + '" aria-label="Suchen"><button data-tg="" class="' + (PT ? '' : 'on') + '">Alle</button>' + tags.map(function (t) { return '<button data-tg="' + esc(t) + '" class="' + (PT === t ? 'on' : '') + '">' + esc(t) + '</button>'; }).join('') + '</div><div class="pnl" id="pnl"></div>';
    var list = w.querySelector('#pnl'), cur = null;
    var draw = function () {
      var q = PQ.trim().toLowerCase();
      var R = L.filter(function (n) { return (!PT || n.tag === PT) && (!q || (n.v + ' ' + n.text + ' ' + (n.tag || '')).toLowerCase().indexOf(q) >= 0); });
      list.innerHTML = R.length ? R.map(function (n) {
        return '<div class="pnr' + (cur && n.v === cur ? ' cur' : '') + '"><div class="v"><b>v' + esc(n.v) + '</b><span>' + esc(ago(n.date)) + (n.date ? ' · ' + esc(n.date) : '') + '</span>' + (n.tag ? '<br><em>' + esc(n.tag) + '</em>' : '') + (cur && n.v === cur ? '<br><em>Installiert</em>' : '') + '</div><p>' + esc(n.text) + '</p></div>';
      }).join('') : '<div class="emp"><b>Nichts gefunden</b>Versuche einen anderen Suchbegriff.</div>';
    };
    draw();
    if (window.fn && window.fn.version) window.fn.version().then(function (v) { cur = v; draw(); });
    w.querySelector('#pnq').oninput = function () { PQ = this.value; draw(); };
    [].forEach.call(w.querySelectorAll('.cc button'), function (b) { b.onclick = function () { PT = b.dataset.tg; renderPatch(w); }; });
  }
  MODES.patch = { title: 'Patchnotes', tabs: [], render: function (t, w) { renderPatch(w); } };
  bind('mtPatch', 'patch');


  /* ---------- PC-Check & Tweak-Paket ---------- */
  (function () {
    var st = document.createElement('style');
    st.textContent = '#cm .pcs{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:900px){#cm .pcs{grid-template-columns:1fr}}'
      + '#cm .pcbox{background:rgba(18,18,24,.8);border:1px solid rgba(var(--rgb),.22);border-radius:14px;padding:18px 20px}'
      + '#cm .pcbox h3{font:800 16px Orbitron,sans-serif;letter-spacing:.08em;color:#fff;margin-bottom:10px}'
      + '#cm .pcbox p{color:var(--dim,#9a9aa6);font-size:17px;line-height:1.4}#cm .pcbox p b{color:#fff}'
      + '#cm .pcsc{display:flex;align-items:center;gap:16px}#cm .pcsc strong{font:900 44px Orbitron,sans-serif;color:var(--acc-light)}#cm .pcsc.bad strong{color:#ff5a6a}'
      + '#cm .pcf{display:grid;grid-template-columns:34px 1fr auto;gap:12px;align-items:start;padding:12px 0;border-top:1px solid #ffffff12}#cm .pcf:first-child{border-top:0}'
      + '#cm .pcf i{font-style:normal;font:800 18px Orbitron,sans-serif;text-align:center}#cm .pcf.ok i{color:#37e08a}#cm .pcf.fix i{color:#ff5a6a}#cm .pcf.na i{color:var(--mute)}'
      + '#cm .pcf b{display:block;color:#fff;font-size:18px}#cm .pcf span{color:var(--dim,#9a9aa6);font-size:15px;display:block;margin-top:2px}'
      + '#cm .pcf em{font-style:normal;color:var(--mute);font-size:15px;text-align:right;white-space:nowrap}'
      + '#cm .pcbtn{font:800 16px Rajdhani,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#fff;background:rgba(var(--rgb),.25);border:1px solid var(--acc);border-radius:10px;padding:12px 22px;cursor:pointer;margin:6px 10px 0 0}'
      + '#cm .pctier{margin-top:10px}#cm .pctier .pcbtn{padding:6px 12px;font-size:14px;margin:4px 6px 0 0}#cm .pctier .pcbtn.on{color:#fff;border-color:var(--acc);background:rgba(var(--rgb),.25)}#cm .pcf small{color:var(--mute);font-size:14px}#cm .pcf u{text-decoration:none;font-size:12px;letter-spacing:.1em;color:var(--acc);border:1px solid var(--acc);border-radius:6px;padding:1px 6px;margin-left:6px}#cm .pcf input{accent-color:var(--acc)}'
      + '#cm .pcbtn:hover{box-shadow:0 0 18px rgba(var(--rgb),.45)}#cm .pcbtn.g{background:transparent;border-color:#ffffff30;color:var(--mute)}#cm .pcbtn[disabled]{opacity:.5;cursor:default}'
      + '#cm .pclock{border-color:var(--acc);box-shadow:0 0 22px rgba(var(--rgb),.18)}#cm .pcbox.pcmsg{font-size:17px;color:#fff}#cm .pcbox.pcmsg.r{color:#ff5a6a;border-color:#ff5a6a66}';
    document.head.appendChild(st);
    var S = { scan: null, ents: [], msg: '', busy: false, tier: null, off: {} };
    var opts = function () { return S.tier ? { tier: S.tier } : {}; };
    var chosen = function (r) { return r.findings.filter(function (f) { return f.state === 'fix' && !S.off[f.id]; }).map(function (f) { return f.id; }); };
    var hasFn = function () { return window.fn && window.fn.pcScan; };
    function draw(w) {
      if (!hasFn()) { w.innerHTML = '<div class="emp"><b>Nur in der Desktop-App</b>Der PC-Check braucht die installierte App.</div>'; return; }
      var r = S.scan;
      if (!r) { w.innerHTML = '<div class="emp"><b>Prüfe deinen PC …</b>Hardware und Einstellungen werden gelesen. Es wird nichts verändert.</div>'; return; }
      if (!r.ok) { w.innerHTML = '<div class="emp"><b>Check nicht möglich</b>' + esc(r.error || 'Unbekannter Fehler') + '</div>'; return; }
      var unlocked = S.ents.indexOf('tw') >= 0, hw = r.hw || {};
      var h = (S.msg ? '<div class="pcbox pcmsg' + (S.err ? ' r' : '') + '">' + esc(S.msg) + '</div>' : '') + '<div class="pcs"><div class="pcbox"><h3>Dein PC</h3><p><b>' + esc(hw.cpu || 'CPU unbekannt') + '</b> · ' + esc(hw.cores) + ' Threads<br><b>' + esc(hw.gpu || 'Grafikkarte nicht erkannt') + '</b><br>' + esc(hw.ramGB) + ' GB RAM · Stufe: <b>' + esc(r.tierLabel) + '</b>' + (S.tier && r.auto !== r.tier ? ' (von dir gewählt)' : '') + '</p><p class="pctier">Grafik-Profil: ' + (r.tiers || []).map(function (t) { return '<button class="pcbtn g' + (t.id === r.tier ? ' on' : '') + '" data-t="' + t.id + '">' + esc(t.label) + '</button>'; }).join('') + '</p></div>'
        + '<div class="pcbox"><h3>Ergebnis</h3><div class="pcsc' + (r.score < 60 ? ' bad' : '') + '"><strong>' + r.score + ' %</strong><p>' + (r.open ? '<b>' + r.open + ' Punkt' + (r.open === 1 ? '' : 'e') + '</b> kosten dich FPS oder Eingabe-Präzision.' : 'Alles optimal eingestellt. Nichts zu tun.') + '</p></div></div></div>';
      h += '<div class="pcbox"><h3>Befunde</h3>' + r.findings.map(function (f) {
        var ic = f.state === 'ok' ? '✓' : f.state === 'fix' ? '✗' : '–';
        var cb = f.state === 'fix' && unlocked ? '<input type="checkbox" data-c="' + f.id + '"' + (S.off[f.id] ? '' : ' checked') + '> ' : '';
        return '<div class="pcf ' + f.state + '"><i>' + ic + '</i><div><b>' + cb + esc(f.title) + (f.gain && f.state === 'fix' ? ' <u>' + esc(f.gain) + '</u>' : '') + '</b><span>' + esc(f.state === 'na' ? 'Nicht gefunden, wird übersprungen.' : f.state === 'ok' ? 'Passt.' : f.why) + (f.state === 'fix' && f.what ? '<br><small>Geändert wird: ' + esc(f.what) + '</small>' : '') + '</span></div><em>' + (f.state === 'fix' ? esc(f.now) + ' → ' + esc(f.want) : '') + '</em></div>';
      }).join('') + (r.info || []).map(function (i) { return '<div class="pcf na"><i>i</i><div><b>' + esc(i.title) + '</b><span>' + esc(i.text) + '</span></div><em></em></div>'; }).join('') + '</div>';
      if (r.open || r.backup) {
        if (!unlocked && r.open) {
          h += '<div class="pcbox pclock"><h3>Tweak-Paket</h3><p>Der Check ist gratis. Mit dem <b>Tweak-Paket</b> (Einmalkauf) setzt die App alle Punkte mit einem Klick: vorher wird gesichert, und mit <b>Zurücksetzen</b> ist alles wieder wie vorher. Kaufen: im Discord ein <b>Kauf-Ticket</b> öffnen und „Tweak-Paket“ wählen.</p><button class="pcbtn" data-a="ref">Schon gekauft? Aktualisieren</button></div>';
        } else {
          h += '<div class="pcbox"><h3>Tweaks</h3><p>Schließe <b>Fortnite</b> vorher. Es werden nur Windows-Einstellungen und die Fortnite-Config geändert, nichts am Spiel selbst. Vorher werden die alten Werte gesichert.</p>'
            + (r.open ? '<button class="pcbtn" data-a="apply"' + (S.busy || !chosen(r).length ? ' disabled' : '') + '>' + (chosen(r).length === r.open ? 'Alle Tweaks anwenden' : chosen(r).length + ' von ' + r.open + ' Tweaks anwenden') + '</button>' : '')
            + (r.backup ? '<button class="pcbtn g" data-a="undo"' + (S.busy ? ' disabled' : '') + '>Zurücksetzen</button>' : '') + '</div>';
        }
      }
      h += '<div class="cc"><button data-a="scan">Erneut prüfen</button></div>';
      w.innerHTML = h;
      [].forEach.call(w.querySelectorAll('[data-a]'), function (b) { b.onclick = function () { act(b.dataset.a, w); }; });
      [].forEach.call(w.querySelectorAll('[data-t]'), function (b) { b.onclick = function () { S.tier = b.dataset.t === r.auto ? null : b.dataset.t; load(w, true); }; });
      [].forEach.call(w.querySelectorAll('[data-c]'), function (b) { b.onchange = function () { S.off[b.dataset.c] = !b.checked; draw(w); }; });
    }
    function load(w, keep) {
      if (!keep) S.tier = null;
      S.scan = null; draw(w);
      Promise.all([window.fn.pcScan(opts()), window.fn.licState ? window.fn.licState() : {}]).then(function (a) { S.scan = a[0]; S.ents = (a[1] && a[1].ents) || []; draw(w); })
        .catch(function (e) { S.scan = { ok: false, error: String(e && e.message || e) }; draw(w); });
    }
    function act(a, w) {
      S.msg = ''; S.err = false;
      if (a === 'scan') return load(w);
      if (a === 'ref') { S.msg = 'Prüfe Freischaltung …'; draw(w); return window.fn.licRefresh().then(function (l) { S.ents = (l && l.ents) || []; S.msg = S.ents.indexOf('tw') >= 0 ? 'Tweak-Paket freigeschaltet.' : 'Noch nicht freigeschaltet. Das Team bestätigt die Zahlung im Ticket.'; S.err = S.ents.indexOf('tw') < 0; draw(w); }); }
      S.busy = true; S.msg = a === 'apply' ? 'Wende Tweaks an … (Wiederherstellungspunkt kann etwas dauern)' : 'Setze zurück …'; draw(w);
      (a === 'apply' ? window.fn.pcApply(chosen(S.scan), opts()) : window.fn.pcRevert()).then(function (r) {
        S.busy = false; S.err = !r.ok;
        if (a === 'apply') S.msg = r.locked ? r.error : !r.ok ? (r.error || 'Fehlgeschlagen.') : (r.applied.length + ' Tweak' + (r.applied.length === 1 ? '' : 's') + ' angewendet' + (r.failed.length ? ', ' + r.failed.length + ' fehlgeschlagen' : '') + '. ' + (r.restore === 'yes' ? 'Windows-Wiederherstellungspunkt erstellt. ' : 'Kein Windows-Wiederherstellungspunkt möglich (App als Administrator starten), die Sicherung der alten Werte gibt es trotzdem. ') + 'Starte Fortnite neu, damit die Grafik greift.' + (r.restart ? ' Für Maus, Game-Aufnahme und Spielmodus am besten Windows neu starten (oder dich einmal ab- und wieder anmelden).' : ''));
        else S.msg = r.ok ? 'Alles zurückgesetzt.' : (r.error || 'Fehlgeschlagen.');
        return window.fn.pcScan(opts());
      }).then(function (sc) { S.scan = sc; draw(w); }).catch(function (e) { S.busy = false; S.msg = String(e && e.message || e); S.err = true; draw(w); });
    }
    MODES.pc = { title: 'PC-Check & Tweaks', tabs: [], render: function (t, w) { if (!hasFn()) return draw(w); load(w); } };
    bind('mtPc', 'pc');
  })();

})();
