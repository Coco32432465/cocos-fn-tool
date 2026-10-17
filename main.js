const { app, BrowserWindow, ipcMain, Menu, shell, Notification } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const license = require('./license');
const pctweak = require('./pctweak');

const parserExe = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'ReplayDump.exe')
    : path.join(__dirname, 'bin', 'ReplayDump.exe');


// ---------- Windows-Benachrichtigungen ----------
let mainWin = null;
let notifyPrefs = { upd: true };
const liveToasts = new Set(); // Referenz halten, sonst räumt der GC den Hinweis samt Klick ab
if (process.platform === 'win32') app.setAppUserModelId('de.coco.fntool'); // gleiche ID wie im Installer, sonst zeigt Windows keine Hinweise
function toast(title, body, action) {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'app', 'icon.ico') });
  n.on('click', () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show(); mainWin.focus();
    if (action) mainWin.webContents.send('notify-click', action);
  });
  liveToasts.add(n); n.on('close', () => liveToasts.delete(n));
  n.show();
  return true;
}
ipcMain.handle('notify', (_e, o) => { o = o || {}; return toast(String(o.title || 'Ninjago Tools').slice(0, 80), String(o.body || '').slice(0, 200), /^[a-z]{1,20}$/.test(o.action || '') ? o.action : null); });
ipcMain.handle('notify-prefs', (_e, p) => { notifyPrefs = { upd: !(p && p.upd === false) }; return true; });

// ---------- Auto-Update (GitHub Releases) ----------
let updateStatus = { state: 'idle' };
function setUpdate(s) {
  updateStatus = s;
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update-status', s);
}
function initUpdater() {
  if (!app.isPackaged) return; // im Testmodus (npm start) kein Update
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => setUpdate({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setUpdate({ state: 'none' }));
  autoUpdater.on('update-available', i => setUpdate({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', p => setUpdate({ state: 'downloading', version: updateStatus.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => {
    setUpdate({ state: 'ready', version: i.version });
    // Hinweis nur, wenn die App gerade im Hintergrund ist; im Vordergrund zeigt sie das Update selbst an
    if (notifyPrefs.upd && !(mainWin && !mainWin.isDestroyed() && mainWin.isFocused())) toast(`Update ${i.version} ist bereit`, 'Klick hier und starte Ninjago Tools neu, um das Update zu installieren.', 'update');
  });
  autoUpdater.on('error', e => setUpdate({ state: 'error', message: String(e && e.message || e) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 60 * 60 * 1000); // stündlich erneut prüfen
}
ipcMain.handle('get-update-status', () => updateStatus);
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('install-update', () => { autoUpdater.quitAndInstall(); });
ipcMain.handle('check-update', () => { if (app.isPackaged) return autoUpdater.checkForUpdates().then(() => true).catch(() => false); return false; });

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 650,
    backgroundColor: '#0A0A0C',
    icon: path.join(__dirname, 'app', 'icon.ico'),
    title: "Ninjago Tools",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWin = win;
  win.loadFile(path.join(__dirname, 'app', 'splash.html'));
  // Externe Links im normalen Browser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

// Replays im Standard-Fortnite-Ordner auflisten (neueste zuerst)
ipcMain.handle('list-replays', () => {
  const dir = path.join(process.env.LOCALAPPDATA || '', 'FortniteGame', 'Saved', 'Demos');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.replay')) continue;
    const p = path.join(dir, f);
    try {
      const st = fs.statSync(p);
      let cached = false; try { cached = fs.existsSync(cacheName(f, st.size, st.mtimeMs)); } catch (_) {}
      out.push({ path: p, name: f, mtime: st.mtimeMs, size: st.size, cached });
    } catch (_) { /* Datei verschwunden */ }
  }
  // Replay-Tresor: gesicherte Kopien auch dann zeigen, wenn Fortnite das Original schon gelöscht hat
  const V = vaultMeta(), have = new Set(out.map(r => r.name));
  for (const r of out) if (V[r.name]) { r.vault = true; r.note = V[r.name].note || ''; }
  for (const name of Object.keys(V)) {
    if (have.has(name)) continue;
    const p = path.join(vaultDir(), name);
    try {
      const st = fs.statSync(p);
      let cached = false; try { cached = fs.existsSync(cacheName(name, st.size, st.mtimeMs)); } catch (_) {}
      out.push({ path: p, name, mtime: st.mtimeMs, size: st.size, cached, vault: true, kept: true, note: V[name].note || '' });
    } catch (_) { /* Kopie fehlt */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
});

// ---------- Replay-Tresor ----------
// Kopien liegen in userData/vault, die Notizen in vault.json. Die Änderungszeit bleibt gleich, damit der Analyse-Cache weiter greift.
const VAULT_MAX = 50;
const vaultDir = () => { const d = path.join(app.getPath('userData'), 'vault'); fs.mkdirSync(d, { recursive: true }); return d; };
const vaultFile = () => path.join(vaultDir(), 'vault.json');
function vaultMeta() { try { const v = JSON.parse(fs.readFileSync(vaultFile(), 'utf8')); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } }
const vaultWrite = v => fs.writeFileSync(vaultFile(), JSON.stringify(v));
const vaultName = n => { n = path.basename(String(n || '')); return /\.replay$/i.test(n) && !/[\\/]/.test(n) ? n : null; };
const vaultNote = n => String(n || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 140);
function vaultList() {
  const V = vaultMeta();
  return Object.keys(V).map(name => ({ name, note: V[name].note || '', added: V[name].added || 0 })).sort((a, b) => b.added - a.added);
}
ipcMain.handle('vault-list', () => vaultList());
ipcMain.handle('vault-add', (_e, file, note) => {
  const name = vaultName(file);
  if (!name || !fs.existsSync(String(file))) return { ok: false, error: 'Replay-Datei nicht gefunden.' };
  const V = vaultMeta();
  if (!V[name] && Object.keys(V).length >= VAULT_MAX) return { ok: false, error: `Der Tresor ist voll (${VAULT_MAX} Replays). Entferne zuerst ein altes.` };
  const dst = path.join(vaultDir(), name);
  try {
    if (path.resolve(String(file)) !== path.resolve(dst)) {
      const st = fs.statSync(String(file));
      fs.copyFileSync(String(file), dst);
      fs.utimesSync(dst, st.atime, st.mtime);
    }
    V[name] = { note: vaultNote(note), added: (V[name] && V[name].added) || Date.now() };
    vaultWrite(V);
  } catch (e) { return { ok: false, error: 'Kopieren fehlgeschlagen: ' + String(e && e.message || e).slice(0, 120) }; }
  return { ok: true, list: vaultList() };
});
ipcMain.handle('vault-note', (_e, n, note) => {
  const name = vaultName(n), V = vaultMeta();
  if (!name || !V[name]) return { ok: false, error: 'Nicht im Tresor.' };
  V[name].note = vaultNote(note); vaultWrite(V);
  return { ok: true, list: vaultList() };
});
ipcMain.handle('vault-del', (_e, n) => {
  const name = vaultName(n), V = vaultMeta();
  if (!name || !V[name]) return { ok: false, error: 'Nicht im Tresor.' };
  delete V[name]; vaultWrite(V);
  try { fs.unlinkSync(path.join(vaultDir(), name)); } catch (_) {}
  return { ok: true, list: vaultList() };
});

// Cache: geparste Replays werden einmal umgewandelt und danach aus dem Cache geladen
const cacheDir = () => {
  const d = path.join(app.getPath('userData'), 'cache');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const CACHE_VERSION = 'p4'; // nur erhöhen, wenn sich der Parser ändert (App-Updates behalten den Cache)
function cacheName(name, size, mtimeMs) {
  const key = (name + '_' + size + '_' + Math.round(mtimeMs)).replace(/[^\w.-]+/g, '_');
  return path.join(cacheDir(), CACHE_VERSION + '_' + key + '.json');
}
function cacheFile(file) {
  const st = fs.statSync(file);
  return cacheName(path.basename(file), st.size, st.mtimeMs);
}

// Replay mit ReplayDump.exe in die schlanke JSON (cft-1) umwandeln und zurückgeben
ipcMain.handle('parse-replay', (_e, file) => new Promise((resolve, reject) => {
  if (!file || !fs.existsSync(file)) return reject('Replay-Datei nicht gefunden: ' + file);
  let cached = null;
  try { cached = cacheFile(file); } catch (_) { /* ohne Cache weiter */ }
  if (cached && fs.existsSync(cached)) {
    try {
      const data = JSON.parse(fs.readFileSync(cached, 'utf8'));
      return resolve({ data, jsonPath: cached, sizeMB: Math.max(1, Math.round(fs.statSync(cached).size / 1024 / 1024)), cached: true });
    } catch (_) { try { fs.unlinkSync(cached); } catch (__) {} }
  }
  const exe = parserExe();
  if (!fs.existsSync(exe)) return reject('ReplayDump.exe nicht gefunden: ' + exe);
  const outDir = path.join(app.getPath('temp'), 'cocos-fn-tool');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, path.basename(file).replace(/\.replay$/i, '') + '.json');
  try { fs.unlinkSync(out); } catch (_) {}
  execFile(exe, [file, out], { maxBuffer: 1024 * 1024 * 64, timeout: 15 * 60 * 1000 }, (err, stdout) => {
    if (err || !fs.existsSync(out)) return reject((stdout || '') + ((err && err.message) || ''));
    try {
      const data = JSON.parse(fs.readFileSync(out, 'utf8'));
      if (cached) { try { fs.copyFileSync(out, cached); } catch (_) {} }
      resolve({ data, jsonPath: out, sizeMB: Math.max(1, Math.round(fs.statSync(out).size / 1024 / 1024)), cached: false });
    } catch (e) { reject('JSON nicht lesbar: ' + e.message); }
  });
}));

app.whenReady().then(() => {
  const L = license.register(ipcMain, { userDataDir: app.getPath('userData'), appDir: __dirname, openExternal: u => shell.openExternal(u) });
  const PC = pctweak.create(null, { userDataDir: app.getPath('userData') });
  ipcMain.handle('pc-scan', (_e, o) => PC.scan(o && typeof o === 'object' ? { tier: String(o.tier || '') } : {}).catch(e => ({ ok: false, error: String(e && e.message || e) })));
  // Anwenden nur mit Tweak-Paket (Prüfung hier im Hauptprozess gegen das signierte Ticket); Zurücksetzen geht immer
  ipcMain.handle('pc-apply', async (_e, ids, o) => (await L.hasEnt('tw')) ? PC.apply(Array.isArray(ids) ? ids.map(String) : null, o && typeof o === 'object' ? { tier: String(o.tier || '') } : {}).catch(e => ({ ok: false, error: String(e && e.message || e) })) : { ok: false, locked: true, error: 'Dafür brauchst du das Tweak-Paket.' });
  ipcMain.handle('pc-revert', () => PC.revert().catch(e => ({ ok: false, error: String(e && e.message || e) })));
  createWindow(); initUpdater(); L.start();
});
app.on('window-all-closed', () => app.quit());
