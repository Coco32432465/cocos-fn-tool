// Gegner-Scouting: node test/scout.test.js
const assert = require('assert');
const CFT = require('../app/cft-import.js');
require('../app/cft-stats.js');
const S = CFT.stats;
// Spieler: von (x0,y0) nach (x1,y1) zwischen t0 und t1, Höhe z
const mv = (x0, y0, x1, y1, t0, t1, z) => { const a = []; for (let t = 0; t <= 900; t += 5) { const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))); a.push([t, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z || 0, 0]); } return a; };
const pl = (name, team, pts, dead) => ({ name, team, pts, dead: dead == null ? null : dead });
// wie im Viewer: Zone 2 ab t=50, Zone 3 ab t=100, Zone 4 ab t=300 bis Ende 900; Kreis um (0,0)
const Z = [{ s: 50, f: 90, L: { x: 0, y: 0, r: 100000 }, N: { x: 0, y: 0, r: 60000 } }, { s: 100, f: 150, L: { x: 0, y: 0, r: 60000 }, N: { x: 0, y: 0, r: 30000 } }, { s: 300, f: 350, L: { x: 0, y: 0, r: 30000 }, N: { x: 0, y: 0, r: 10000 } }];
const R = { dur: 900, tn: 2, zones: Z, players: [
  pl('Ich', 0, mv(5000, 0, 5000, 0, 0, 1)), pl('Mate', 0, mv(6000, 0, 6000, 0, 0, 1)),
  pl('Mitte', 1, mv(1000, 0, 1000, 0, 0, 1, 2000)), // steht in der Mitte, 20 m höher
  pl('Rand', 2, mv(8000, 0, 8000, 2000, 0, 900)), // am Rand
  pl('Sturm', 3, mv(200000, 0, 5000, 0, 300, 700)), // kommt spät aus dem Sturm, viel unterwegs
  pl('Tot', 4, mv(2000, 0, 2000, 0, 0, 1), 250), // vorher tot
  pl('Mitte2', 1, mv(1500, 500, 1500, 500, 0, 1, 1500), 600)
], ev: [{ t: 550, k: 2, v: 1 }, { t: 600, k: 3, v: 6 }, { t: 610, k: 2, v: 3, down: true }, { t: 200, k: 2, v: 5 }] };
assert.deepStrictEqual(S.scoutZones(R), [2, 3, 4]);
assert.deepStrictEqual(S.zoneWindow(R, 4), { s: 300, e: 900 }); assert.deepStrictEqual(S.zoneWindow(R, 3), { s: 100, e: 300 });
assert.strictEqual(S.zoneWindow(R, 5), null); assert.strictEqual(S.scout(R, 1), null);
const c = S.scout(R, 4);
assert.strictEqual(c.alive, 4); assert.strictEqual(c.teams, 3); assert.strictEqual(c.died, 1); // Mitte2 bei t=600
assert.strictEqual(c.mid, 2); assert.strictEqual(c.edge, 1); assert.strictEqual(c.storm, 1);
assert.strictEqual(c.high, 2); assert.strictEqual(c.camp, 3); assert.strictEqual(c.mobile, 1);
assert.strictEqual(c.kills, 2); assert.strictEqual(c.onUs, 1); assert.deepStrictEqual(c.top, [{ name: 'Mitte', kills: 1 }, { name: 'Rand', kills: 1 }]); // Knockdown und Kill vor der Zone zählen nicht
const tx = S.scoutText(c);
assert.ok(/Zone 4 lebten noch 4 Gegner in 3 Teams/.test(tx.lines[0]));
assert.ok(tx.tips.some(t => /Mitte/.test(t))); assert.ok(tx.tips.some(t => /Höhe/.test(t)));
assert.ok(/kaum noch Gegner/.test(S.scoutText({ zone: 6, alive: 1 }).lines[0]));
assert.deepStrictEqual(S.scoutText(null), { lines: [], tips: [] });
console.log('scout ok');
