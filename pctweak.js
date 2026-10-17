// PC-Check + FPS-Tweak-Paket (Hauptprozess).
// scan()  = gratis: liest Hardware und Einstellungen aus und zeigt, was FPS/Eingabeverzoegerung kostet.
// apply() = Tweak-Paket (bezahlt, wird im Hauptprozess gegen das Lizenz-Ticket geprueft): setzt nur Einstellungen und die
//           Fortnite-Config-Datei, mit Sicherung vorher und Zurueck-Knopf. Kein Eingriff ins Spiel selbst (kein Injizieren, kein Speicherzugriff).
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const K_DVR = 'HKCU\\System\\GameConfigStore', K_CAP = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR';
const K_GBAR = 'HKCU\\Software\\Microsoft\\GameBar', K_MOUSE = 'HKCU\\Control Panel\\Mouse';
const K_GPU = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', K_BG = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications';
const S_USER = '/Script/FortniteGame.FortGameUserSettings', S_SG = 'ScalabilityGroups';

/* ---------- Standard-System (Windows) ---------- */
function defaultSys() {
  const run = (cmd, args, timeout = 8000) => new Promise(res => execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 1 << 20 }, (err, out, se) => res({ ok: !err, out: String(out || ''), err: String(se || (err && err.message) || '') })));
  return {
    platform: process.platform,
    run,
    cpus: () => os.cpus(), totalmem: () => os.totalmem(),
    env: process.env,
    read: p => fs.readFileSync(p, 'utf8'), write: (p, t) => fs.writeFileSync(p, t), exists: p => fs.existsSync(p), mkdir: p => fs.mkdirSync(p, { recursive: true }), copy: (a, b) => fs.copyFileSync(a, b),
    async regGet(key, name) {
      const r = await run('reg', ['query', key, '/v', name]);
      const m = r.ok && new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(REG_\\w+)\\s+(.*)$', 'mi').exec(r.out);
      if (!m) return null;
      const v = m[2].trim(); return m[1] === 'REG_DWORD' ? parseInt(v, 16) : v;
    },
    async regSet(key, name, type, value) { return (await run('reg', ['add', key, '/v', name, '/t', type, '/d', String(value), '/f'])).ok; },
    async regDel(key, name) { return (await run('reg', ['delete', key, '/v', name, '/f'])).ok; }
  };
}

/* ---------- reine Logik ---------- */
function tierOf(hw) {
  const g = String(hw.gpu || ''), ram = hw.ramGB || 0, cores = hw.cores || 0;
  if (ram && ram < 8) return 'low';
  if (/\b(UHD|HD Graphics|Iris|Vega \d|Radeon\(TM\) Graphics|Radeon Graphics|GT ?[0-9]{3}\b|GTX ?(9\d\d|10[0-5]\d|16[0-5]\d)|RX ?(4|5[0-5])\d0)\b/i.test(g)) return 'low';
  if (/\bRTX ?(40|50)\d0|\bRTX ?30[789]0|\bRX ?(7[6-9]\d0|69\d0|68\d0)/i.test(g) && ram >= 16 && cores >= 6) return 'high';
  if (cores && cores < 4) return 'low';
  return 'mid';
}
const TIER_LABEL = { low: 'Schwacher PC', mid: 'Mittelklasse', high: 'High-End' };

// Fortnite-Grafik je Stufe (0 = niedrig … 3 = episch). Sichtweite bleibt hoch, damit man Gegner frueh sieht.
function fortProfile(tier) {
  const base = { 'sg.ViewDistanceQuality': 3, 'sg.ShadowQuality': 0, 'sg.PostProcessQuality': 0, 'sg.FoliageQuality': 0 };
  const per = {
    low: { 'sg.AntiAliasingQuality': 0, 'sg.TextureQuality': 0, 'sg.EffectsQuality': 0, 'sg.ShadingQuality': 0 },
    mid: { 'sg.AntiAliasingQuality': 0, 'sg.TextureQuality': 1, 'sg.EffectsQuality': 0, 'sg.ShadingQuality': 0 },
    high: { 'sg.AntiAliasingQuality': 1, 'sg.TextureQuality': 2, 'sg.EffectsQuality': 1, 'sg.ShadingQuality': 1 }
  };
  return { sg: { ...base, ...(per[tier] || per.mid) }, user: { bUseVSync: 'False', bMotionBlur: 'False' } };
}

// einfacher INI-Editor: setzt key=value in [section], ohne den Rest anzutasten
function iniGet(text, section, key) {
  let cur = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*\[(.+)\]\s*$/.exec(line); if (m) { cur = m[1]; continue; }
    if (cur === section) { const kv = /^\s*([^=;#\s][^=]*?)\s*=\s*(.*?)\s*$/.exec(line); if (kv && kv[1] === key) return kv[2]; }
  }
  return null;
}
function iniSet(text, section, key, value) {
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = String(text || '').split(/\r?\n/);
  let cur = null, secEnd = -1, found = false;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\[(.+)\]\s*$/.exec(lines[i]);
    if (m) { if (cur === section && secEnd < 0) secEnd = i; cur = m[1]; continue; }
    if (cur === section) {
      const kv = /^\s*([^=;#\s][^=]*?)\s*=/.exec(lines[i]);
      if (kv && kv[1] === key) { lines[i] = key + '=' + value; found = true; }
    }
  }
  if (found) return lines.join(nl);
  if (cur === section && secEnd < 0) { // Abschnitt ist der letzte
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(key + '=' + value, ''); return lines.join(nl);
  }
  if (secEnd >= 0) { let at = secEnd; while (at > 0 && lines[at - 1] === '') at--; lines.splice(at, 0, key + '=' + value); return lines.join(nl); }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.push('', '[' + section + ']', key + '=' + value, ''); return lines.join(nl);
}

function create(sys, { userDataDir }) {
  sys = sys || defaultSys();
  const win = sys.platform === 'win32';
  const bdir = path.join(userDataDir, 'tweak-backup'), bfile = path.join(bdir, 'backup.json');
  const iniPath = () => path.join(sys.env.LOCALAPPDATA || '', 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');
  const loadBackup = () => { try { return JSON.parse(sys.read(bfile)); } catch (e) { return null; } };

  // Fortnite-Programmdatei ueber die Epic-Launcher-Liste finden (ohne Suche auf der Platte)
  function fortniteExe() {
    try {
      const f = path.join(sys.env.PROGRAMDATA || 'C:\\ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');
      if (!sys.exists(f)) return null;
      const L = (JSON.parse(sys.read(f)).InstallationList || []).find(x => x && x.AppName === 'Fortnite' && x.InstallLocation);
      if (!L) return null;
      const exe = path.join(L.InstallLocation, 'FortniteGame', 'Binaries', 'Win64', 'FortniteClient-Win64-Shipping.exe');
      return sys.exists(exe) ? exe : null;
    } catch (e) { return null; }
  }

  async function hardware() {
    const cpus = sys.cpus() || [];
    let gpu = '';
    if (win) {
      const r = await sys.run('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join "|"']);
      const names = r.ok ? r.out.trim().split('|').map(s => s.trim()).filter(Boolean) : [];
      gpu = names.find(n => /nvidia|geforce|rtx|gtx|radeon|rx\s?\d/i.test(n)) || names[0] || '';
    }
    return { cpu: ((cpus[0] || {}).model || '').replace(/\s+/g, ' ').trim(), cores: cpus.length, ramGB: Math.round((sys.totalmem() || 0) / 1073741824), gpu };
  }

  async function read() {
    const st = { win, power: null, dvr: null, cap: null, gmode: null, mouse: null, ini: null, iniFound: false, exe: null, gpuPref: null, bg: null };
    if (win) {
      const pr = await sys.run('powercfg', ['/getactivescheme']);
      const g = /([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\s*\((.*?)\)/i.exec(pr.out || '');
      if (g) st.power = { guid: g[1].toLowerCase(), name: g[2] };
      st.dvr = await sys.regGet(K_DVR, 'GameDVR_Enabled'); st.cap = await sys.regGet(K_CAP, 'AppCaptureEnabled');
      st.gmode = await sys.regGet(K_GBAR, 'AutoGameModeEnabled'); st.mouse = await sys.regGet(K_MOUSE, 'MouseSpeed');
      st.bg = await sys.regGet(K_BG, 'GlobalUserDisabled');
      st.exe = fortniteExe(); if (st.exe) st.gpuPref = await sys.regGet(K_GPU, st.exe);
    }
    try { if (sys.exists(iniPath())) { st.ini = sys.read(iniPath()); st.iniFound = true; } } catch (e) { /* ohne Datei weiter */ }
    return st;
  }

  const pickTier = (opts, auto) => (opts && TIER_LABEL[opts.tier]) ? opts.tier : auto; // Nutzer darf die erkannte Stufe ueberschreiben

  // Jeder Fix: erkennt den Ist-Zustand, kennt den Wunschzustand, wendet an und stellt zurueck.
  function fixes(tier) {
    const prof = fortProfile(tier);
    return [
      { id: 'power', gain: 'FPS', what: 'Windows-Energiesparplan auf „Höchstleistung“', title: 'Energiesparplan', why: 'Im Energiesparmodus taktet die CPU runter und verursacht FPS-Einbrüche in Kämpfen.',
        bad: s => !!s.power && s.power.guid !== HIGH_PERF && !/h(ö|oe)chstleistung|high performance|ultimate|maximale/i.test(s.power.name),
        now: s => s.power ? s.power.name : 'unbekannt', want: 'Höchstleistung',
        async apply(s) { const r = await sys.run('powercfg', ['/setactive', HIGH_PERF]); return r.ok ? { prev: s.power.guid } : null; },
        async undo(p) { return (await sys.run('powercfg', ['/setactive', p.prev])).ok; } },
      { id: 'dvr', gain: 'FPS · Ruckler', what: 'Game DVR und Hintergrundaufnahme in der Registry ausschalten', title: 'Windows Game-Aufnahme (Game DVR)', why: 'Die Hintergrundaufnahme kostet FPS und kann Ruckler auslösen.',
        bad: s => s.dvr === 1 || s.cap === 1, now: s => (s.dvr === 1 || s.cap === 1) ? 'An' : 'Aus', want: 'Aus',
        async apply(s) { const a = await sys.regSet(K_DVR, 'GameDVR_Enabled', 'REG_DWORD', 0), b = await sys.regSet(K_CAP, 'AppCaptureEnabled', 'REG_DWORD', 0); return a && b ? { dvr: s.dvr, cap: s.cap } : null; },
        async undo(p) { let ok = true; if (p.dvr != null) ok = (await sys.regSet(K_DVR, 'GameDVR_Enabled', 'REG_DWORD', p.dvr)) && ok; if (p.cap != null) ok = (await sys.regSet(K_CAP, 'AppCaptureEnabled', 'REG_DWORD', p.cap)) && ok; return ok; } },
      { id: 'gmode', gain: 'Ruckler', what: 'Windows-Spielmodus in der Registry einschalten', title: 'Windows Spielmodus', why: 'Der Spielmodus gibt dem Spiel Vorrang vor Hintergrundprogrammen.',
        bad: s => s.gmode === 0, now: s => s.gmode === 0 ? 'Aus' : 'An', want: 'An',
        async apply(s) { return (await sys.regSet(K_GBAR, 'AutoGameModeEnabled', 'REG_DWORD', 1)) ? { prev: s.gmode } : null; },
        async undo(p) { return sys.regSet(K_GBAR, 'AutoGameModeEnabled', 'REG_DWORD', p.prev == null ? 0 : p.prev); } },
      { id: 'mouse', gain: 'Aim', what: 'Zeigerbeschleunigung (MouseSpeed und Schwellen) in der Registry auf 0', title: 'Mausbeschleunigung', why: 'Zeigerbeschleunigung macht Aim unberechenbar: gleiche Handbewegung, andere Weite.',
        bad: s => s.mouse != null && String(s.mouse) !== '0', now: s => String(s.mouse) === '0' ? 'Aus' : 'An', want: 'Aus',
        async apply(s) { const r = (await sys.regSet(K_MOUSE, 'MouseSpeed', 'REG_SZ', 0)) && (await sys.regSet(K_MOUSE, 'MouseThreshold1', 'REG_SZ', 0)) && (await sys.regSet(K_MOUSE, 'MouseThreshold2', 'REG_SZ', 0)); return r ? { prev: String(s.mouse) } : null; },
        async undo(p) { return sys.regSet(K_MOUSE, 'MouseSpeed', 'REG_SZ', p.prev); }, note: 'Wirkt nach Neuanmeldung bei Windows.' },
      { id: 'fnini', gain: 'FPS · Sicht', what: 'Grafikwerte (sg.*, VSync, Bewegungsunschärfe) in GameUserSettings.ini, vorher als Kopie gesichert', title: 'Fortnite-Grafik für ' + TIER_LABEL[tier], why: 'Niedrige Schatten, Effekte und Nachbearbeitung bringen FPS und ein klareres Bild. Sichtweite bleibt hoch.',
        bad: s => s.iniFound && Object.entries(prof.sg).some(([k, v]) => String(iniGet(s.ini, S_SG, k)) !== String(v)) || (s.iniFound && Object.entries(prof.user).some(([k, v]) => iniGet(s.ini, S_USER, k) !== v)),
        now: s => s.iniFound ? 'weicht ab' : 'Datei nicht gefunden', want: 'Profil „' + TIER_LABEL[tier] + '“', needsFile: true,
        async apply(s) {
          const p = iniPath(); if (!s.iniFound) return null;
          sys.mkdir(bdir); sys.copy(p, path.join(bdir, 'GameUserSettings.ini'));
          let t = s.ini; for (const [k, v] of Object.entries(prof.sg)) t = iniSet(t, S_SG, k, v); for (const [k, v] of Object.entries(prof.user)) t = iniSet(t, S_USER, k, v);
          sys.write(p, t); return { file: true };
        },
        async undo() { const b = path.join(bdir, 'GameUserSettings.ini'); if (!sys.exists(b)) return false; sys.copy(b, iniPath()); return true; }, note: 'Fortnite vorher schließen.' },
      { id: 'gpu', gain: 'FPS', what: 'Windows-Grafikeinstellung: Fortnite läuft auf der starken Grafikkarte (Laptops mit zwei Grafikchips)', title: 'Fortnite auf die starke Grafikkarte',
        why: 'Bei Laptops und PCs mit zwei Grafikchips startet Windows Spiele manchmal auf der schwachen Grafik. Das kostet viele FPS.',
        needs: s => !!s.exe, bad: s => !/GpuPreference=2/i.test(String(s.gpuPref || '')), now: s => /GpuPreference=2/i.test(String(s.gpuPref || '')) ? 'Hohe Leistung' : 'Windows entscheidet', want: 'Hohe Leistung',
        async apply(s) { return (await sys.regSet(K_GPU, s.exe, 'REG_SZ', 'GpuPreference=2;')) ? { exe: s.exe, prev: s.gpuPref } : null; },
        async undo(p) { return p.prev == null ? sys.regDel(K_GPU, p.exe) : sys.regSet(K_GPU, p.exe, 'REG_SZ', p.prev); } },
      { id: 'bgapps', gain: 'FPS', what: 'Hintergrund-Apps von Windows in der Registry ausschalten', title: 'Hintergrund-Apps',
        why: 'Apps aus dem Microsoft Store laufen im Hintergrund weiter und fressen CPU und Netzwerk, während du spielst.',
        bad: s => s.bg !== 1, now: s => s.bg === 1 ? 'Aus' : 'An', want: 'Aus',
        async apply(s) { return (await sys.regSet(K_BG, 'GlobalUserDisabled', 'REG_DWORD', 1)) ? { prev: s.bg } : null; },
        async undo(p) { return p.prev == null ? sys.regDel(K_BG, 'GlobalUserDisabled') : sys.regSet(K_BG, 'GlobalUserDisabled', 'REG_DWORD', p.prev); } }
    ];
  }

  async function scan(opts) {
    const hw = await hardware(), auto = tierOf(hw), tier = pickTier(opts, auto), st = await read(), list = fixes(tier), bk = loadBackup();
    const findings = list.map(f => {
      const skip = (f.needsFile && !st.iniFound) || (f.needs && !f.needs(st)) || (!st.win && !f.needsFile);
      const applied = !!(bk && bk.applied && bk.applied[f.id]);
      const bad = !skip && f.bad(st);
      return { id: f.id, title: f.title, why: f.why, what: f.what || '', gain: f.gain || '', now: f.now(st), want: f.want, note: f.note || '', state: skip ? 'na' : bad ? 'fix' : 'ok', applied };
    });
    const info = [];
    if (hw.ramGB && hw.ramGB < 16) info.push({ title: 'Arbeitsspeicher', text: hw.ramGB + ' GB RAM: ' + (hw.ramGB < 8 ? 'sehr knapp, Fortnite braucht mindestens 8 GB, besser 16 GB.' : 'reicht, aber 16 GB sind für Fortnite plus Discord und Browser entspannter.') });
    if (/UHD|HD Graphics|Iris|Radeon.*Graphics$/i.test(hw.gpu) && !/RTX|GTX|RX ?\d/i.test(hw.gpu)) info.push({ title: 'Grafikkarte', text: 'Die Grafik ist in die CPU eingebaut (' + hw.gpu + '). Prüfe, ob der Monitor an der Grafikkarte hängt und nicht am Mainboard.' });
    const open = findings.filter(f => f.state === 'fix').length, total = findings.filter(f => f.state !== 'na').length;
    return { ok: true, hw, tier, auto, tiers: Object.keys(TIER_LABEL).map(id => ({ id, label: TIER_LABEL[id] })), tierLabel: TIER_LABEL[tier], findings, info, score: total ? Math.round((total - open) / total * 100) : 100, open, backup: !!(bk && bk.applied && Object.keys(bk.applied).length), win };
  }

  async function apply(ids, opts) {
    if (!win) return { ok: false, error: 'Die Tweaks funktionieren nur unter Windows.' };
    const hw = await hardware(), tier = pickTier(opts, tierOf(hw)), st = await read(), all = fixes(tier);
    const want = all.filter(f => (ids || all.map(x => x.id)).includes(f.id) && !(f.needsFile && !st.iniFound) && !(f.needs && !f.needs(st)) && f.bad(st));
    if (!want.length) return { ok: true, applied: [], failed: [], restore: 'skipped' };
    // Sicherung der alten Werte + Windows-Wiederherstellungspunkt (best effort, braucht Admin und aktivierten Schutz)
    const bk = loadBackup() || { applied: {} };
    let restore = 'no';
    const rp = await sys.run('powershell', ['-NoProfile', '-Command', 'Checkpoint-Computer -Description "Ninjago Tools Tweaks" -RestorePointType MODIFY_SETTINGS -ErrorAction Stop'], 60000);
    restore = rp.ok ? 'yes' : 'no';
    const applied = [], failed = [];
    for (const f of want) {
      let prev = null; try { prev = await f.apply(st); } catch (e) { prev = null; }
      if (prev) { if (!bk.applied[f.id]) bk.applied[f.id] = prev; applied.push(f.id); } else failed.push(f.id);
    }
    bk.time = Date.now(); bk.tier = tier;
    try { sys.mkdir(bdir); sys.write(bfile, JSON.stringify(bk)); } catch (e) { /* Sicherung nicht schreibbar */ }
    return { ok: true, applied, failed, restore, restart: applied.some(id => ['mouse', 'dvr', 'gmode', 'bgapps'].includes(id)), notes: want.filter(f => applied.includes(f.id) && f.note).map(f => f.title + ': ' + f.note) };
  }

  async function revert() {
    const bk = loadBackup();
    if (!bk || !bk.applied || !Object.keys(bk.applied).length) return { ok: false, error: 'Keine Sicherung gefunden. Es gibt nichts zurückzusetzen.' };
    const all = fixes(bk.tier || 'mid'), done = [], failed = [];
    for (const f of all) {
      const p = bk.applied[f.id]; if (!p) continue;
      let ok = false; try { ok = await f.undo(p); } catch (e) { ok = false; }
      if (ok) { delete bk.applied[f.id]; done.push(f.id); } else failed.push(f.id);
    }
    try { sys.write(bfile, JSON.stringify(bk)); } catch (e) { /* egal */ }
    return { ok: !failed.length, reverted: done, failed, error: failed.length ? 'Nicht alles konnte zurückgesetzt werden.' : '' };
  }

  return { scan, apply, revert, hardware };
}

module.exports = { create, defaultSys, tierOf, fortProfile, iniGet, iniSet, TIER_LABEL, HIGH_PERF };
