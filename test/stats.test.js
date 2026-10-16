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
