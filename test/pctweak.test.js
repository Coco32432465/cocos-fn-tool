// PC-Check + Tweak-Paket: Logik mit nachgebautem Windows (Registry, Dateien, powercfg)
const assert = require('assert');
const path = require('path');
const T = require('../pctweak.js');
let n = 0; const ok = (name, f) => f().then(() => { n++; console.log('ok  ', name); }, e => { console.error('FAIL', name, '\n', e); process.exit(1); });

const INI = path.join('C:\\L', 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');
function fakeSys(over = {}) {
  const reg = { 'HKCU\\System\\GameConfigStore|GameDVR_Enabled': 1, 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR|AppCaptureEnabled': 1,
    'HKCU\\Software\\Microsoft\\GameBar|AutoGameModeEnabled': 0, 'HKCU\\Control Panel\\Mouse|MouseSpeed': '1', ...(over.reg || {}) };
  const files = { [INI]: '[/Script/FortniteGame.FortGameUserSettings]\r\nbUseVSync=True\r\nbMotionBlur=True\r\nFrameRateLimit=144.000000\r\n\r\n[ScalabilityGroups]\r\nsg.ShadowQuality=3\r\nsg.TextureQuality=3\r\n', ...(over.files || {}) };
  const log = []; let plan = { guid: 'a1841308-3541-4fab-bc81-f71556f20b4a', name: 'Ausbalanciert' };
  const sys = {
    platform: 'win32', env: { LOCALAPPDATA: 'C:\\L' }, log,
    cpus: () => Array.from({ length: over.cores || 8 }, () => ({ model: 'AMD Ryzen 5 5600' })), totalmem: () => (over.ram || 16) * 1073741824,
    async run(cmd, args) {
      log.push([cmd, ...args].join(' '));
      if (cmd === 'powercfg' && args[0] === '/getactivescheme') return { ok: true, out: `Power Scheme GUID: ${plan.guid}  (${plan.name})` };
      if (cmd === 'powercfg' && args[0] === '/setactive') { plan = { guid: args[1], name: args[1] === T.HIGH_PERF ? 'Höchstleistung' : 'Ausbalanciert' }; return { ok: true, out: '' }; }
      if (cmd === 'powershell' && /Win32_VideoController/.test(args[2])) return { ok: true, out: over.gpu || 'NVIDIA GeForce RTX 3060' };
      if (cmd === 'powershell') return { ok: !over.noRestore, out: '' };
      return { ok: false, out: '' };
    },
    read: p => { if (!(p in files)) throw new Error('nf'); return files[p]; }, write: (p, t) => { files[p] = t; }, exists: p => p in files, mkdir() {}, copy: (a, b) => { files[b] = files[a]; },
    async regGet(k, nme) { const v = reg[k + '|' + nme]; return v === undefined ? null : v; },
    async regSet(k, nme, type, v) { reg[k + '|' + nme] = type === 'REG_DWORD' ? Number(v) : String(v); return true; }
  };
  return { sys, reg, files, getPlan: () => plan };
}
const tmp = () => require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'pct-'));

(async () => {
  await ok('Stufen: schwach, Mittelklasse, High-End', async () => {
    assert.equal(T.tierOf({ gpu: 'Intel(R) UHD Graphics 630', ramGB: 16, cores: 8 }), 'low');
    assert.equal(T.tierOf({ gpu: 'NVIDIA GeForce GTX 1050', ramGB: 16, cores: 8 }), 'low');
    assert.equal(T.tierOf({ gpu: 'NVIDIA GeForce RTX 3060', ramGB: 16, cores: 8 }), 'mid');
    assert.equal(T.tierOf({ gpu: 'NVIDIA GeForce RTX 4070', ramGB: 32, cores: 12 }), 'high');
    assert.equal(T.tierOf({ gpu: 'NVIDIA GeForce RTX 4070', ramGB: 6, cores: 12 }), 'low');
    assert.equal(T.tierOf({ gpu: 'AMD Radeon RX 6700 XT', ramGB: 16, cores: 8 }), 'mid');
  });
  await ok('INI: Wert ersetzen, anhaengen, neuer Abschnitt, Zeilenenden bleiben', async () => {
    let t = '[A]\r\nx=1\r\ny=2\r\n\r\n[B]\r\nz=3\r\n';
    t = T.iniSet(t, 'A', 'x', 9); assert.equal(T.iniGet(t, 'A', 'x'), '9');
    t = T.iniSet(t, 'A', 'n', 5); assert.equal(T.iniGet(t, 'A', 'n'), '5'); assert.equal(T.iniGet(t, 'B', 'z'), '3');
    t = T.iniSet(t, 'B', 'q', 7); assert.equal(T.iniGet(t, 'B', 'q'), '7');
    t = T.iniSet(t, 'C', 'w', 1); assert.equal(T.iniGet(t, 'C', 'w'), '1'); assert.ok(!/[^\r]\n/.test(t), 'nur CRLF');
    assert.equal(T.iniGet(T.iniSet('', 'S', 'k', 'v'), 'S', 'k'), 'v');
  });
  await ok('Scan: findet Probleme, ohne etwas zu aendern', async () => {
    const f = fakeSys(); const P = T.create(f.sys, { userDataDir: tmp() });
    const r = await P.scan();
    assert.equal(r.tier, 'mid'); assert.equal(r.hw.gpu, 'NVIDIA GeForce RTX 3060');
    assert.deepEqual(r.findings.filter(x => x.state === 'fix').map(x => x.id).sort(), ['dvr', 'fnini', 'gmode', 'mouse', 'power']);
    assert.equal(r.score, 0); assert.equal(f.getPlan().name, 'Ausbalanciert'); assert.equal(f.reg['HKCU\\Control Panel\\Mouse|MouseSpeed'], '1');
  });
  await ok('Anwenden setzt alles, Zurueck stellt alles wieder her', async () => {
    const f = fakeSys(); const dir = tmp(); const P = T.create(f.sys, { userDataDir: dir });
    const orig = f.files[INI];
    const a = await P.apply(); assert.deepEqual(a.applied.sort(), ['dvr', 'fnini', 'gmode', 'mouse', 'power']); assert.equal(a.restore, 'yes'); assert.deepEqual(a.failed, []);
    assert.equal(f.getPlan().guid, T.HIGH_PERF); assert.equal(f.reg['HKCU\\System\\GameConfigStore|GameDVR_Enabled'], 0); assert.equal(f.reg['HKCU\\Software\\Microsoft\\GameBar|AutoGameModeEnabled'], 1); assert.equal(f.reg['HKCU\\Control Panel\\Mouse|MouseSpeed'], '0');
    const ini = f.files[INI];
    assert.equal(T.iniGet(ini, 'ScalabilityGroups', 'sg.ShadowQuality'), '0'); assert.equal(T.iniGet(ini, 'ScalabilityGroups', 'sg.ViewDistanceQuality'), '3'); assert.equal(T.iniGet(ini, 'ScalabilityGroups', 'sg.TextureQuality'), '1');
    assert.equal(T.iniGet(ini, '/Script/FortniteGame.FortGameUserSettings', 'bMotionBlur'), 'False'); assert.equal(T.iniGet(ini, '/Script/FortniteGame.FortGameUserSettings', 'FrameRateLimit'), '144.000000', 'Rest bleibt');
    const s2 = await P.scan(); assert.equal(s2.score, 100); assert.ok(s2.backup);
    const r = await P.revert(); assert.ok(r.ok, JSON.stringify(r));
    assert.equal(f.getPlan().guid, 'a1841308-3541-4fab-bc81-f71556f20b4a'); assert.equal(f.reg['HKCU\\System\\GameConfigStore|GameDVR_Enabled'], 1); assert.equal(f.reg['HKCU\\Software\\Microsoft\\GameBar|AutoGameModeEnabled'], 0); assert.equal(f.reg['HKCU\\Control Panel\\Mouse|MouseSpeed'], '1');
    assert.equal(f.files[INI], orig, 'INI exakt wie vorher');
    assert.equal((await P.revert()).ok, false);
  });
  await ok('Zweimal anwenden ueberschreibt die erste Sicherung nicht', async () => {
    const f = fakeSys(); const P = T.create(f.sys, { userDataDir: tmp() });
    await P.apply(); f.reg['HKCU\\System\\GameConfigStore|GameDVR_Enabled'] = 1; await P.apply(['dvr']);
    await P.revert(); assert.equal(f.reg['HKCU\\System\\GameConfigStore|GameDVR_Enabled'], 1);
  });
  await ok('Ohne Fortnite-Datei: Grafik wird uebersprungen; ohne Wiederherstellungspunkt trotzdem weiter', async () => {
    const f = fakeSys({ noRestore: true }); delete f.files[INI];
    const P = T.create(f.sys, { userDataDir: tmp() }); const s = await P.scan(); assert.equal(s.findings.find(x => x.id === 'fnini').state, 'na');
    const a = await P.apply(); assert.ok(!a.applied.includes('fnini')); assert.equal(a.restore, 'no'); assert.equal(a.applied.length, 4);
  });
  await ok('Schwacher PC bekommt niedrigeres Profil, Sichtweite bleibt hoch', async () => {
    const p = T.fortProfile('low'); assert.equal(p.sg['sg.TextureQuality'], 0); assert.equal(p.sg['sg.ViewDistanceQuality'], 3);
    assert.ok(T.fortProfile('high').sg['sg.TextureQuality'] > p.sg['sg.TextureQuality']);
  });
  await ok('Nicht-Windows: keine Aenderungen, klare Meldung', async () => {
    const f = fakeSys(); f.sys.platform = 'linux'; const P = T.create(f.sys, { userDataDir: tmp() });
    assert.equal((await P.apply()).ok, false);
  });
  console.log(`\n${n} PC-Tweak-Tests bestanden`);
})();
