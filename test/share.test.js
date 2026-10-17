// Runde als Bild: node test/share.test.js
const assert = require('assert');
const CFT = require('../app/cft-import.js');
require('../app/cft-stats.js');
require('../app/cft-share.js');
const SH = CFT.share;
const g = { mtime: Date.UTC(2026, 9, 16, 12), tot: 78, ph: [90, 70, 74], mis: [{ kind: 'storm', sev: 200 }, { kind: 'rot', sev: 400 }], m: { n: 'Reload Duo – Game 4', pl: 1, k: 7, g: 'A' }, real: { meta: { mode: 'Reload', landPoi: 'Lifty Lodge', players: 40 } } };
const d = SH.cardData(g);
assert.strictEqual(d.grade, 'A'); assert.strictEqual(d.win, true); assert.strictEqual(d.score, 78);
assert.deepStrictEqual(d.stats, [['Platz', '#1'], ['Elims', '7'], ['Spieler', '40']]);
assert.deepStrictEqual(d.phases.map(p => p[1]), [90, 70, 74]);
assert.strictEqual(d.focus, 'Zu spät rotiert'); assert.strictEqual(d.clean, false); assert.strictEqual(d.date, '16.10.2026');
const e = SH.cardData({ tot: 30, m: { n: 'X', pl: 0, k: 0 }, mis: [] });
assert.strictEqual(e.grade, 'D'); assert.deepStrictEqual(e.stats, [['Elims', '0']]); assert.strictEqual(e.clean, true); assert.deepStrictEqual(e.phases, []);
assert.strictEqual(SH.fileName(d), 'ninjago-tools-reload-duo-game-4.png');
assert.ok(SH.FORMATS.story[1] > SH.FORMATS.post[1]);
console.log('share ok');

// Wochenreport
const S = CFT.stats, DAY = 864e5, NOW = new Date(2026, 9, 15, 18).getTime(), ws = S.weekStart(NOW);
const wk = [{ mtime: ws + DAY, tot: 70, m: { pl: 1, k: 6, n: 'a' }, mis: [{ kind: 'storm' }] }, { mtime: ws + 2 * DAY, tot: 50, m: { pl: 20, k: 2, n: 'b' }, mis: [{ kind: 'storm' }, { kind: 'rot' }] }];
const w = SH.weekCardData(wk, { games: 4, top10: 1, elims: 5, score: 6 }, NOW);
assert.strictEqual(w.kicker, 'WOCHENREPORT'); assert.match(w.title, /^Woche \d+$/); assert.strictEqual(w.score, 60); assert.strictEqual(w.grade, 'B');
assert.deepStrictEqual(w.stats, [['Runden', '2'], ['Top 10', '1'], ['Siege', '1']]);
assert.strictEqual(w.phases[0][2], '2 / 4'); assert.strictEqual(w.phases[3][2], '6,0 / 6,0'); assert.strictEqual(w.focus, 'Sturmschaden');
assert.strictEqual(SH.weekCardData([], null, NOW).grade, '–');
console.log('week card ok');
