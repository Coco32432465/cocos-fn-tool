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
assert.strictEqual(SH.fileName(d), 'cocos-tool-reload-duo-game-4.png');
assert.ok(SH.FORMATS.story[1] > SH.FORMATS.post[1]);
console.log('share ok');
