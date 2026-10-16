// Replay-Bibliothek: node test/library.test.js
const assert = require('assert');
const CFT = require('../app/cft-import.js');
require('../app/cft-stats.js');
const S = CFT.stats, DAY = 864e5, NOW = 1.8e12;
const mk = (d, tot, pl, k, mode, poi, n) => ({ path: 'C:/R/' + n + '.replay', mtime: NOW - d * DAY, tot, m: { pl, k, n, g: tot >= 75 ? 'A' : 'B' }, real: { meta: { mode, landPoi: poi } } });
const G = [mk(1, 80, 1, 7, 'Reload', 'Lifty Lodge', 'Game A'), mk(2, 50, 14, 2, 'Reload', 'Golden Grove', 'Game B'), mk(5, 60, 6, 4, 'ShowdownAlt Solo', null, 'Cup 1'), mk(40, 30, 0, 0, '', null, 'Alt'), { m: null }];

let r = S.library(G, {}, NOW);
assert.strictEqual(r.n, 4); assert.strictEqual(r.list[0].m.n, 'Game A'); // neueste zuerst, kaputte Einträge raus
assert.strictEqual(r.wins, 1); assert.strictEqual(r.kills, 13); assert.strictEqual(r.place, 7); assert.strictEqual(r.avg, 55);
assert.deepStrictEqual(S.libModes(G), ['Reload', 'ShowdownAlt Solo']);
assert.strictEqual(S.library(G, { mode: 'Reload' }, NOW).n, 2);
assert.strictEqual(S.library(G, { res: 'win' }, NOW).n, 1);
assert.strictEqual(S.library(G, { res: 'top10' }, NOW).n, 2);
assert.strictEqual(S.library(G, { res: 'rest' }, NOW).n, 2); // Platz 14 + unbekannt
assert.strictEqual(S.library(G, { days: 7 }, NOW).n, 3);
assert.strictEqual(S.library(G, { q: 'golden' }, NOW).list[0].m.n, 'Game B');
assert.strictEqual(S.library(G, { q: 'reload lifty' }, NOW).n, 1); // alle Wörter müssen passen
assert.strictEqual(S.library(G, { q: 'xyz' }, NOW).n, 0);
assert.strictEqual(S.library(G, { sort: 'place' }, NOW).list.map(g => g.m.pl).join(','), '1,6,14,0');
assert.strictEqual(S.library(G, { sort: 'score' }, NOW).list[0].tot, 80);
assert.strictEqual(S.library(G, { sort: 'kills' }, NOW).list[1].m.k, 4);
assert.strictEqual(S.library(G, { sort: 'old' }, NOW).list[0].m.n, 'Alt');
const favs = {}; favs[S.libKey(G[2])] = 1;
assert.strictEqual(S.library(G, { favs, favOnly: true }, NOW).list[0].m.n, 'Cup 1');
assert.strictEqual(S.libKey({ fname: 'x.json', m: {} }), 'x.json');
assert.strictEqual(S.library([], {}, NOW).avg, 0);
console.log('library ok');
