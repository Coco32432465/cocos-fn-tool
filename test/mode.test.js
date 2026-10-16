// Moduserkennung: Karte/Orte nur bei Reload (oder wenn der Schalter "alle Modi" an ist)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
global.window = global;
const CFT = require('../app/cft-import.js');
const C = CFT.CFT || global.CFT || CFT;
const files = fs.readdirSync('/tmp').filter(f => /^UnsavedReplay-.*\.json$/.test(f));
if (!files.length) { console.log('mode test skipped (keine Test-Replays)'); process.exit(0); }
const base = JSON.parse(fs.readFileSync(path.join('/tmp', files[0]), 'utf8'));
const mk = pl => { const d = JSON.parse(JSON.stringify(base)); d.meta.playlist = pl; return C.add(d, 'x.json'); };
const other = mk('Playlist_ShowdownAlt_Solo');
assert.strictEqual(other.real.meta.mapOn, false); assert.strictEqual(other.real.meta.landName, null); assert.strictEqual(other.real.meta.mode, 'ShowdownAlt Solo');
const rel = mk('Playlist_Respawn_Squad'); assert.strictEqual(rel.real.meta.mapOn, true); assert.strictEqual(rel.real.meta.mode, 'Reload');
const rel2 = mk('Playlist_Reload_Duos'); assert.strictEqual(rel2.real.meta.mode, 'Reload');
const unk = mk(''); assert.strictEqual(unk.real.meta.mapOn, true); // unbekannt: Karte bleibt an
global.localStorage = { getItem: k => (k === 'cft_mapall' ? '1' : null) };
assert.strictEqual(mk('Playlist_ShowdownAlt_Solo').real.meta.mapOn, true);
console.log('mode ok');
