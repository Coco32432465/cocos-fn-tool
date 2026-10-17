// Duo-Synergie: node test/duo.test.js
const assert = require('assert');
const CFT = require('../app/cft-import.js');
require('../app/cft-stats.js');
const S = CFT.stats;
// Spieler läuft linear von (x0,0) nach (x1,0) zwischen t0 und t1
const walk = (x0, x1, t0, t1) => { const a = []; for (let t = 0; t <= 600; t += 5) { const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))); a.push([t, x0 + (x1 - x0) * u, 0, 0, 0]); } return a; };
const N = { x: 0, y: 0, r: 10000 };
const R = (me, mate, extra) => Object.assign({ tn: 2, dur: 600, zones: [{ s: 300, f: 400, N }], players: [me, mate] }, extra);
// Mate rotiert früher (bei t≈260 drin), du erst bei t≈350; du stirbst zuerst
let r = S.duoGame(R({ name: 'Ich', pts: walk(30000, 0, 200, 400), dead: 450 }, { name: 'Kai', pts: walk(30000, 0, 200, 300), dead: 500 }));
assert.strictEqual(r.length, 1); assert.strictEqual(r[0].first, 'me'); assert.deepStrictEqual(r[0].rot, { me: 0, mate: 1, tie: 0 });
assert.ok(r[0].dist > 0 && r[0].near < 1);
// gleich schnell, beide überleben, immer zusammen
r = S.duoGame(R({ name: 'Ich', pts: walk(30000, 0, 200, 300) }, { name: 'Kai', pts: walk(30000, 0, 200, 300) }));
assert.strictEqual(r[0].first, ''); assert.deepStrictEqual(r[0].rot, { me: 0, mate: 0, tie: 1 }); assert.strictEqual(r[0].near, 1); assert.strictEqual(r[0].dist, 0);
// Solo-Runde liefert nichts
assert.deepStrictEqual(S.duoGame({ tn: 1, players: [{ pts: [] }] }), []);
// über mehrere Runden, Bots zählen nicht
const g = (meDead, mateDead, mateFast, pl, name) => ({ mtime: pl, m: { pl, k: 0 }, real: R({ name: 'Ich', pts: walk(30000, 0, 200, mateFast ? 400 : 300), dead: meDead }, { name: name || 'Kai', pts: walk(30000, 0, 200, mateFast ? 300 : 400), dead: mateDead }) });
const G = [g(450, null, true, 3), g(400, 500, true, 1), g(420, 520, true, 5), g(null, 300, false, 2, 'kai'), { m: { pl: 4 }, real: R({ name: 'Ich', pts: walk(0, 0, 0, 1) }, { name: 'Bot', bot: true, pts: walk(0, 0, 0, 1) }) }];
const D = S.duo(G);
assert.strictEqual(D.length, 1); assert.strictEqual(D[0].games, 4); // Name ohne Groß/Klein
assert.strictEqual(D[0].meFirst, 3); assert.strictEqual(D[0].mateFirst, 1); assert.strictEqual(D[0].rotMate, 3); assert.strictEqual(D[0].rotMe, 1);
assert.strictEqual(D[0].wins, 1); assert.strictEqual(D[0].place, 2.8);
const tips = S.duoTips(D[0]).join(' ');
assert.ok(/Du stirbst in 3 von 4/.test(tips)); assert.ok(/Kai ist bei 3 von 4 Zonen früher/.test(tips));
assert.ok(/ein paar Runden/.test(S.duoTips({ name: 'X', games: 1 })[0]));
assert.ok(/ausgeglichen/.test(S.duoTips({ name: 'X', games: 5, meFirst: 1, mateFirst: 1, rotMe: 2, rotMate: 2, near: 80 })[0]));
console.log('duo ok');
