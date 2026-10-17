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
// Replay-Tresor
assert.strictEqual(S.fileName(G[0]), 'Game A.replay');
assert.strictEqual(S.fileName({ path: 'C:\\Demos\\x.replay' }), 'x.replay');
const V = { 'Cup 1.replay': 'Turnier-Clutch', 'Game B.replay': '' };
assert.strictEqual(S.library(G, { vault: V, vaultOnly: true }, NOW).n, 2);
assert.strictEqual(S.library(G, { vault: V, q: 'clutch' }, NOW).list[0].m.n, 'Cup 1'); // Notiz ist durchsuchbar
assert.strictEqual(S.library(G, { vaultOnly: true }, NOW).n, 0);
let sg = S.vaultSuggest(G, {}, 3);
assert.deepStrictEqual(sg.map(g => g.m.n), ['Game A']); // Sieg bzw. Note ab 70
sg = S.vaultSuggest(G.concat([mk(3, 90, 4, 9, 'Reload', null, 'Top'), mk(3, 75, 2, 5, 'Reload', null, 'Gut')]), {}, 2);
assert.deepStrictEqual(sg.map(g => g.m.n), ['Game A', 'Top']); // Siege zuerst, dann beste Note
assert.strictEqual(S.vaultSuggest(G, { 'Game A.replay': '' }, 3).length, 0);
assert.strictEqual(S.vaultSuggest([{ tot: 99, m: { pl: 1 } }], {}, 3).length, 0); // ohne Datei nichts zu sichern
// Coach-Notizen
assert.deepStrictEqual(S.marksNorm([30, { t: 12.4, txt: 'Zu früh' }, null, { t: 'x' }]), [{ t: 12, txt: 'Zu früh' }, { t: 30, txt: '' }]);
let ML = S.marksSet([30], 31, '  Rotation   verpasst ');
assert.deepStrictEqual(ML, [{ t: 30, txt: 'Rotation verpasst' }]); // nah am Marker: Text ergänzt
ML = S.marksSet(ML, 95, 'Box gut gebaut');
assert.strictEqual(ML.length, 2); assert.strictEqual(S.marksSet(ML, 0, 'x'.repeat(400))[0].txt.length, S.NOTE_MAX);
assert.strictEqual(S.marksText(ML, 'Reload Game 4'), 'Reload Game 4\n00:30  Rotation verpasst\n01:35  Box gut gebaut');
assert.strictEqual(S.marksText([5]), '00:05  (Marker)'); assert.strictEqual(S.marksText([]), '');
console.log('library ok');
