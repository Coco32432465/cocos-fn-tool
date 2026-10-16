// Test der Mehr-Game-Auswertung: node test/stats.test.js
const assert = require('assert');
const CFT = require('../app/cft-import.js');
require('../app/cft-stats.js');
const S = CFT.stats, DAY = 864e5, NOW = 1.8e12;
const mk = (d, tot, pl, k, mis) => ({ mtime: NOW - d * DAY, tot, ph: [tot, tot - 10, tot - 20], m: { pl, k, n: 'g' }, mis: mis || [] });
const games = [mk(1, 70, 1, 5, [{ kind: 'rot', sev: 400 }]), mk(3, 60, 8, 2, [{ kind: 'rot', sev: 400 }, { kind: 'storm', sev: 300 }]), mk(10, 40, 20, 0, [{ kind: 'early', sev: 900 }]), mk(12, 30, 0, 1, []), mk(40, 90, 3, 9, [])];

assert.strictEqual(S.period(games, 7, NOW).length, 2);
assert.strictEqual(S.period(games, 30, NOW).length, 4);
assert.strictEqual(S.period(games, 0, NOW).length, 5);
assert.strictEqual(S.previous(games, 7, NOW).length, 2); // Tage 7-14
const cur = S.summary(S.period(games, 7, NOW)), prev = S.summary(S.previous(games, 7, NOW));
assert.strictEqual(cur.n, 2); assert.strictEqual(cur.score, 65); assert.strictEqual(cur.wins, 1); assert.strictEqual(cur.kills, 7); assert.strictEqual(cur.place, 4.5);
assert.strictEqual(prev.score, 35); assert.strictEqual(prev.place, 20); // Platz 0 (unbekannt) zählt nicht
const d = S.delta(cur, prev, 'score', false); assert.ok(d.good && d.d === 30);
const dp = S.delta(cur, prev, 'place', true); assert.ok(dp.good && dp.d === -15.5);
assert.strictEqual(S.delta(cur, S.summary([]), 'score', false), null);
const w = S.weaknesses(S.period(games, 0, NOW));
assert.strictEqual(w[0].kind, 'rot'); assert.strictEqual(w[0].pct, 40); assert.ok(w.every(x => x.label));
const ph = S.phases(cur); assert.strictEqual(ph.weak.name, 'Endgame'); assert.strictEqual(ph.strong.name, 'Offspawn');
const se = S.series(S.sorted(games), 2); assert.strictEqual(se.length, 5); assert.strictEqual(se[0].t < se[4].t, true); assert.ok(se.some(x => x.win));
assert.strictEqual(S.trendText(S.sorted(games).slice(0, 3)), null);
console.log('stats ok');

// Trainingsplan
const many = [mk(1, 70, 1, 5, [{ kind: 'rot', sev: 400 }]), mk(2, 60, 8, 2, [{ kind: 'rot', sev: 400 }, { kind: 'storm', sev: 300 }]), mk(3, 40, 20, 0, [{ kind: 'rot', sev: 400 }, { kind: 'early', sev: 900 }]), mk(4, 50, 11, 1, [{ kind: 'storm', sev: 300 }])];
assert.strictEqual(S.autoPlan(games.slice(0, 2), NOW), null); // zu wenig Daten
const plan = S.autoPlan(many, NOW);
assert.ok(plan && plan.items.length >= 2 && plan.items.length <= 3); assert.strictEqual(plan.items[0].kind, 'rot'); assert.strictEqual(plan.items[0].base, 75);
assert.ok(plan.items.every(i => i.tasks.length === 3 && i.goal.indexOf('%') > 0));
Object.keys(S.LABEL).forEach(k => assert.ok(S.DRILLS[k] && S.DRILLS[k].tasks.length >= 4, 'Drill für ' + k));
assert.strictEqual(S.PRESETS.length, 5); assert.ok(S.presetPlan('aim', NOW).items[0].tasks.length >= 4); assert.strictEqual(S.presetPlan('x', NOW), null);
plan.started = NOW - 2.5 * DAY; plan.items[0].tasks[0].done = true;
const pr = S.planProgress(plan, many); // 2 Games seit Start -> noch keine Quote
assert.strictEqual(pr.done, 1); assert.ok(pr.pct > 0); assert.strictEqual(pr.items[0].now, null); assert.strictEqual(pr.items[0].need, 1);
plan.started = NOW - 10 * DAY; const pr2 = S.planProgress(plan, many);
assert.strictEqual(pr2.items[0].now, 75); assert.strictEqual(pr2.items[0].good, false);
assert.match(S.weekKey(NOW), /^\d{4}-W\d+$/);
console.log('plan ok');

// Landeorte + Rotation
const dg = (name, tot, pl_, k, early, rot) => ({ mtime: NOW, tot, ph: [tot, tot, tot], m: { pl: pl_, k }, mis: early ? [{ kind: 'early', sev: 900 }] : [], real: { meta: { landName: name, landNear: true, landPt: [0.3, 0.4], stormSec: 0 } }, rot: rot || [] });
const dl = [dg('Tilted', 40, 20, 1, true), dg('Tilted', 30, 25, 0, true), dg('Tilted', 35, 18, 1, false), dg('Lazy', 80, 2, 6, false), dg('Lazy', 70, 5, 4, false), dg('Solo', 50, 10, 2, false)];
const D = S.drops(dl); assert.strictEqual(D[0].name, 'Tilted'); assert.strictEqual(D[0].c, 3); assert.strictEqual(D[0].earlyPct, 67); assert.strictEqual(D[0].score, 35);
const adv = S.dropAdvice(D); assert.strictEqual(adv.best.name, 'Lazy'); assert.strictEqual(adv.worst.name, 'Tilted'); assert.match(adv.text, /früh/);
assert.strictEqual(S.dropAdvice(S.drops([dl[0]])).best, null);
const rg = (oks) => dg('X', 50, 5, 1, false, oks.map((ok, i) => ({ k: i + 1, ok, gap: ok === false ? 5000 : -100 })));
const ro = S.rotation([rg([true, false, false]), rg([true, false, true]), rg([false, false, null])]);
assert.strictEqual(ro.zones[0].okPct, 67); assert.strictEqual(ro.zones[1].okPct, 0); assert.strictEqual(ro.zones[1].gapM, 50); assert.strictEqual(ro.weak.k, 2);
assert.ok(ro.tips.length >= 1); assert.strictEqual(S.rotation([]).n, 0); assert.deepStrictEqual(S.rotation([]).tips, []);

// Session: Games mit <= 90 Min Abstand; alte Games gehoeren nicht dazu
(function () {
  const H = 3600000, T0 = NOW;
  const g2 = (h, tot, pl, k, mis) => ({ mtime: T0 - h * H, tot, ph: [tot, tot - 10, tot - 30], m: { pl, k, n: 'g' + h }, mis: mis || [] });
  const sess = S.session([g2(30, 50, 10, 1), g2(3, 40, 20, 0, [{ kind: 'rot', sev: 400 }]), g2(2.2, 80, 1, 6, [{ kind: 'rot', sev: 400 }]), g2(1.5, 60, 5, 2, [{ kind: 'storm', sev: 300 }])]);
  assert.strictEqual(sess.n, 3); assert.strictEqual(sess.best.tot, 80); assert.strictEqual(sess.worst.tot, 40);
  assert.strictEqual(sess.mistakes[0].kind, 'rot'); assert.ok(sess.goal.length > 10); assert.strictEqual(sess.curve.length, 3);
  assert.strictEqual(S.session([]), null);
  assert.strictEqual(S.session([g2(1, 50, 5, 1)]).same, true);
  // Vergleich
  const cmp = S.compare({ n: 10, score: 70, place: 8, kpg: 3, wins: 2 }, { avgScore: 60, avgPlace: 12, kpg: 4, winPct: 10 });
  const by = k => cmp.filter(x => x.key === k)[0];
  assert.strictEqual(by('score').better, true); assert.strictEqual(by('place').better, true); assert.strictEqual(by('kpg').better, false); assert.strictEqual(by('win').better, true);
  assert.deepStrictEqual(S.compare({ n: 0 }, {}), []);
})();

(function () {
  var S = CFT.stats;
  var mk = function (tot, pl, k, kinds, real) { return { tot: tot, real: real === undefined ? true : real, mtime: Date.now() + tot, m: { pl: pl, k: k }, mis: (kinds || []).map(function (x) { return { kind: x, sev: 500 }; }) }; };
  assert.strictEqual(S.teamPayload([]), null); assert.strictEqual(S.teamPayload([mk(50, 5, 1, [], false)]), null, 'Demo/unechte Runden nie teilen');
  var P = S.teamPayload([mk(40, 10, 2, ['rot']), mk(60, 1, 5, ['rot', 'storm']), mk(80, 3, 4, [])]);
  assert.strictEqual(P.games, 3); assert.strictEqual(P.avgScore, 60); assert.strictEqual(P.wins, 1); assert.strictEqual(P.kills, 11); assert.strictEqual(P.bestPlace, 1);
  assert.strictEqual(P.weak[0].kind, 'rot'); assert.strictEqual(P.weak[0].pct, 67); assert.deepStrictEqual(P.trend, [40, 60, 80]);
  var big = []; for (var i = 0; i < 20; i++) big.push(mk(i, 5, 0, [])); assert.strictEqual(S.teamPayload(big).trend.length, 12);
  assert.deepStrictEqual(Object.keys(P).sort(), ['avgPlace', 'avgScore', 'bestPlace', 'games', 'kills', 'trend', 'weak', 'wins']);
  var T = S.teamInsight([{ name: 'A', stats: { games: 5, avgScore: 70, weak: [{ kind: 'rot', pct: 50 }], trend: [50, 60, 70, 80] } }, { name: 'B', stats: { games: 8, avgScore: 50, weak: [{ kind: 'rot', pct: 40 }, { kind: 'storm', pct: 30 }], trend: [60, 55, 50, 45] } }, { name: 'C', stats: null }, { name: 'D', stats: { games: 0 } }]);
  assert.strictEqual(T.n, 2); assert.strictEqual(T.avg, 60); assert.strictEqual(T.best.name, 'A'); assert.strictEqual(T.worst.name, 'B');
  assert.strictEqual(T.shared.kind, 'rot'); assert.strictEqual(T.shared.count, 2); assert.strictEqual(T.rising.m.name, 'A'); assert.ok(T.rising.d > 0);
  assert.strictEqual(S.teamInsight([]), null); assert.strictEqual(S.teamInsight([{ name: 'A', stats: { games: 3, avgScore: 50, weak: [{ kind: 'rot', pct: 5 }] } }]).shared, null);
})();

(function () {
  var S = CFT.stats;
  assert.strictEqual(S.seasonId(Date.UTC(2026, 9, 17, 12)), '2026-10'); assert.strictEqual(S.seasonId(Date.UTC(2026, 9, 31, 23, 30)), '2026-11', '23:30 UTC am 31.10. ist in Berlin schon November');
  assert.strictEqual(S.seasonDaysLeft(Date.UTC(2026, 9, 17, 12)), 15); assert.strictEqual(S.seasonDaysLeft(Date.UTC(2026, 9, 31, 12)), 1);
  var NOW = Date.UTC(2026, 9, 17, 12), D = 864e5;
  var mk = function (daysAgo, tot, pl, k, mis, real) { return { tot: tot, real: real === undefined ? true : real, mtime: NOW - daysAgo * D, m: { pl: pl, k: k }, mis: mis === undefined ? [] : mis }; };
  var s0 = S.season([], { now: NOW }); assert.strictEqual(s0.xp, 0); assert.strictEqual(s0.level, 0); assert.strictEqual(s0.tasks.length, 8); assert.strictEqual(s0.id, '2026-10');
  var G = []; for (var i = 0; i < 12; i++) G.push(mk(i % 5, 70, i === 0 ? 1 : 5, 3, i % 2 ? [{ kind: 'rot' }] : []));
  G.push(mk(40, 90, 1, 9, [])); G.push(mk(1, 90, 1, 9, [], false));
  var s1 = S.season(G, { now: NOW }), by = function (id) { return s1.tasks.filter(function (t) { return t.id === id; })[0]; };
  assert.strictEqual(s1.games, 12, 'Vormonat und unechte Runden zaehlen nicht'); assert.strictEqual(by('analyze').value, 12); assert.strictEqual(by('analyze').xp, 60);
  assert.strictEqual(by('wins').value, 1); assert.strictEqual(by('top10').value, 12); assert.strictEqual(by('score').value, 70); assert.strictEqual(by('score').xp, 130, '55 und 65 erreicht, 75 nicht');
  assert.strictEqual(by('streak').value, 5); assert.strictEqual(by('clean').value, 6); assert.strictEqual(by('elims').value, 36); assert.strictEqual(by('team').xp, 0);
  var base = s1.base; assert.strictEqual(s1.xp, base); assert.strictEqual(S.season(G, { now: NOW, premium: true }).xp, Math.round(base * 1.25)); assert.ok(S.season(G, { now: NOW, teamIn: true }).base === base + 50);
  assert.strictEqual(s1.level, Math.floor(base / 100)); assert.ok(s1.into >= 0 && s1.into < 100);
  var big = []; for (var j = 0; j < 80; j++) big.push(mk(j % 15, 80, 1, 10, [])); var sb = S.season(big, { now: NOW, teamIn: true, premium: true }); assert.strictEqual(sb.level, 10); assert.strictEqual(sb.max, true); assert.strictEqual(sb.pct, 100);
  var c3 = S.passCosmetics(3, false); assert.deepStrictEqual(c3.themes, ['neon']); assert.deepStrictEqual(c3.titles, ['Rookie']);
  var c10 = S.passCosmetics(10, true); assert.strictEqual(c10.themes.length, 6); assert.strictEqual(c10.titles.length, 6);
  assert.deepStrictEqual(S.passCosmetics(10, false).themes, ['neon', 'cyan', 'toxic']); assert.deepStrictEqual(S.passCosmetics(0, true), { themes: [], titles: [] });
})();

(function () {
  var S = require('../app/cft-stats.js').stats || require('../app/cft-stats.js'), n = Date.parse('2026-10-17T12:00:00Z');
  var a = S.spinDo(null, n, 0.5, 0.1); assert.ok(a.ok); assert.strictEqual(a.state.streak, 1); assert.strictEqual(a.gain, a.prize.xp + 5);
  assert.strictEqual(S.spinDo(a.state, n + 3600e3, 0.5, 0.1).ok, false, 'nur einmal pro Tag');
  var b = S.spinDo(a.state, n + 86400e3, 0.99, 0.9); assert.strictEqual(b.state.streak, 2); assert.strictEqual(b.prize.id, 'jack'); assert.strictEqual(b.state.bonus, a.state.bonus + 400 + 10);
  assert.strictEqual(S.spinDo(a.state, n + 3 * 86400e3, 0.1, 0.1).state.streak, 1, 'Streak reisst bei Pause');
  assert.strictEqual(S.spinDo(a.state, Date.parse('2026-11-02T10:00:00Z'), 0.1, 0.1).state.bonus, 25, 'Bonus startet je Season neu');
  assert.strictEqual(S.spinState(a.state, n).can, false); assert.strictEqual(S.spinState(a.state, n).prize.id, a.prize.id);
  assert.strictEqual(S.season([], { bonus: 200, now: n }).xp, 200); assert.strictEqual(S.season([], { bonus: 99999, now: n }).xp, S.SPIN_CAP);
  var big = null; for (var i = 0; i < 400; i++) big = S.spinDo(big && big.state, n + i * 86400e3 * 0 + i * 0, 0.99, 0.5) || big;
  assert.ok(S.spinPick(0).id === 'xp20' && S.SPIN_PRIZES.length === 6);
})();

console.log('drops ok');
