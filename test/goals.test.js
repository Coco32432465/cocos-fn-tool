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

// Wöchentlicher Cup: Ø der besten 5 Noten der Woche, gewertet ab 3 Runden
const CG = [70, 90, 40, 85, 60, 95, 30].map((tot, i) => mk(ws + i * 3600e3, tot, i === 1 ? 1 : 12, 2)).concat([mk(ws - DAY, 100, 1, 9)]);
const CW = S.cupWeek(CG, NOW);
assert.strictEqual(CW.games, 7); assert.strictEqual(CW.counted, 5); assert.strictEqual(CW.score, 80); assert.strictEqual(CW.best, 95);
assert.strictEqual(CW.wins, 1); assert.strictEqual(CW.kills, 14); assert.strictEqual(CW.ranked, true);
const C2 = S.cupWeek(CG.slice(0, 2), NOW); assert.strictEqual(C2.ranked, false); assert.strictEqual(C2.score, 80);
assert.deepStrictEqual(S.cupWeek([], NOW), { games: 0, score: 0, best: 0, wins: 0, kills: 0, counted: 0, ranked: false });
console.log('cup ok');

// Benachrichtigungen: Daily-Spin-Erinnerung einmal am Tag ab der eingestellten Uhrzeit
const at = h => new Date(2026, 9, 15, h, 5).getTime();
assert.deepStrictEqual(S.notifyPrefs(null), { spin: true, upd: true, hour: 18 });
assert.deepStrictEqual(S.notifyPrefs({ spin: false, upd: false, hour: 99 }), { spin: false, upd: false, hour: 18 });
assert.strictEqual(S.spinRemind(null, null, at(17)), null); // vor 18 Uhr
const r1 = S.spinRemind(null, null, at(18)); assert.ok(r1 && r1.day === S.dayKey(at(18)) && r1.streak === 0);
assert.strictEqual(S.spinRemind(null, null, at(19), r1.day), null); // heute schon erinnert
assert.strictEqual(S.spinRemind(null, { spin: false }, at(19)), null); // ausgeschaltet
assert.ok(S.spinRemind(null, { hour: 9 }, at(9))); // eigene Uhrzeit
const spun = S.spinDo(null, at(10), 0.1, 0.2).state;
assert.strictEqual(S.spinRemind(spun, null, at(20)), null); // heute schon gedreht
const tmr = new Date(2026, 9, 16, 18, 30).getTime(), r2 = S.spinRemind(spun, null, tmr);
assert.ok(r2 && r2.streak === 1, 'Streak von gestern wird genannt');
console.log('notify ok');

// Server-Titel (Clip des Monats)
assert.deepStrictEqual(S.entTitles(['tw', 'title:clip', 'pass:2026-10']), ['🎬 Clip des Monats']);
assert.deepStrictEqual(S.entTitles(null), []);
console.log('ent titles ok');
