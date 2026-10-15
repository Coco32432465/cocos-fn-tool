// Test der Fight-Analyse mit künstlichen Daten: node test/fights.test.js
const assert = require('assert');
const CFT = require('../app/cft-import.js');
require('../app/cft-fights.js');

const line = (x, y, z, t0, t1) => { const a = []; for (let t = t0; t <= t1; t += 1) a.push([t, x, y, z, 0]); return a; };
const pl = (id, team, pts, extra) => Object.assign({ id, name: 'P' + id, team, bot: false, pts, dead: null, dbno: [], mate: false, vit: [], inv: [] }, extra || {});
// Ich (0) + Mate (1) im Team 0; 3 Gegner (Team 1) in der Nähe, Mate weit weg -> Verlust
const me = pl(0, 0, line(0, 0, 0, 0, 200), { dead: 100, vit: [[0, 100, 100], [90, 40, 0], [100, 0, 0]] });
const mate = pl(1, 0, line(9000, 0, 0, 0, 200));
const e1 = pl(2, 1, line(2500, 0, 800, 0, 200)), e2 = pl(3, 1, line(3000, 500, 800, 0, 200)), e3 = pl(4, 1, line(3500, -500, 800, 0, 200));
const R = { tn: 2, players: [me, mate, e1, e2, e3], invNames: [], hits: [{ t: 95, k: 2, dmg: 60 }], ev: [{ t: 100, v: 0, k: 2, down: false }] };
let f = CFT.fights(R);
assert.strictEqual(f.length, 1);
assert.strictEqual(f[0].result, 'lost');
assert.ok(f[0].tags.some(t => t.k === 'alone'), 'allein');
assert.ok(f[0].tags.some(t => t.k === 'outnum'), 'Unterzahl');
assert.ok(f[0].tags.some(t => t.k === 'low'), 'tiefer');
assert.ok(f[0].score < 40, 'Score ' + f[0].score);
assert.ok(f[0].better.length > 10);

// Gewonnener Kampf: Mate nah, Gegner geschossen
const me2 = pl(0, 0, line(0, 0, 500, 0, 200), { vit: [[0, 100, 100]] });
const mate2 = pl(1, 0, line(1500, 0, 500, 0, 200));
const en = pl(2, 1, line(3000, 0, 0, 0, 200), { dead: 60 });
const R2 = { tn: 2, players: [me2, mate2, en], invNames: [], hits: [], ev: [{ t: 60, v: 2, k: 0, down: false }] };
f = CFT.fights(R2);
assert.strictEqual(f.length, 1);
assert.strictEqual(f[0].result, 'won');
assert.ok(f[0].score >= 75 && f[0].grade === 'A', 'Score ' + f[0].score);
assert.ok(f[0].tags.some(t => t.k === 'high'));

// Zwei getrennte Kämpfe + Zusammenfassung
const R3 = { tn: 2, players: [me2, mate2, en], invNames: [], hits: [], ev: [{ t: 60, v: 2, k: 0, down: false }, { t: 150, v: 1, k: 2, down: true }] };
f = CFT.fights(R3);
assert.strictEqual(f.length, 2);
const S = CFT.fightSummary([f]);
assert.strictEqual(S.n, 2);
assert.ok(S.winRate >= 0 && S.winRate <= 100);

// Leere Daten
assert.deepStrictEqual(CFT.fights({ tn: 1, players: [me2], hits: [], ev: [] }), []);
assert.deepStrictEqual(CFT.fights(null), []);
console.log('Fight-Analyse: alle Tests bestanden');
