// Wochenziele und Abzeichen: node test/goals.test.js
const assert = require('assert');
const CFT = require('../app/cft-import.js');
require('../app/cft-stats.js');
const S = CFT.stats, DAY = 864e5;
const NOW = new Date(2026, 9, 15, 18).getTime(); // Donnerstag
const mk = (t, tot, pl, k, mis) => ({ mtime: t, tot, m: { pl, k, n: 'g' }, mis: mis || [{ kind: 'rot', sev: 1 }] });
const ws = S.weekStart(NOW);
assert.strictEqual(new Date(ws).getDay(), 1); assert.strictEqual(new Date(ws).getHours(), 0); assert.ok(NOW - ws < 7 * DAY);
assert.strictEqual(S.weekStart(ws), ws); // Montag 00:00 bleibt
const G = [mk(ws + DAY, 70, 3, 6), mk(ws + 2 * DAY, 50, 20, 2), mk(ws - 3 * DAY, 60, 8, 4), mk(ws - 10 * DAY, 40, 30, 1)];
// Vorschlag aus 2 vergangenen Wochen mit je 1 Runde -> Minimum greift
const sug = S.suggestGoals(G, NOW);
assert.deepStrictEqual(sug, { games: 3, top10: 1, elims: 5, score: 5.5 });
const W = S.weekGoals(G, { games: 2, top10: 1, elims: 10, score: 6 }, NOW);
assert.strictEqual(W.games.length, 2); assert.strictEqual(W.values.score, 6); assert.strictEqual(W.values.elims, 8);
const it = id => W.items.find(i => i.id === id);
assert.strictEqual(it('games').done, true); assert.strictEqual(it('top10').done, true); assert.strictEqual(it('elims').pct, 80);
assert.strictEqual(it('score').pct, 99); // Ø erst ab 3 Runden voll
assert.strictEqual(W.done, 2); assert.strictEqual(W.daysLeft, 4); assert.match(W.week, /^2026-W\d+$/);
assert.strictEqual(S.weekGoals([], null, NOW).items.length, 4);
console.log('goals ok');

const B = S.badges([mk(ws, 80, 1, 11, []), mk(ws + DAY, 50, 9, 2), mk(ws + 2 * DAY, 40, 40, 0)], { weeks: 0 });
const b = id => B.list.find(x => x.id === id);
assert.ok(b('first').done && b('top10').done && b('win').done && b('grade').done && b('clean').done && b('elims10').done && b('streak3').done);
assert.ok(!b('ten').done && b('ten').pct === 30 && !b('streak7').done && !b('week').done);
assert.strictEqual(B.total, S.BADGES.length); assert.strictEqual(B.done, 7);
assert.strictEqual(S.badges([], {}).done, 0);
console.log('badges ok');
