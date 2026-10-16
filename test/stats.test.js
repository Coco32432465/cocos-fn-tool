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
