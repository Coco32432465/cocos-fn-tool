const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const parserExe = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'ReplayDump.exe')
    : path.join(__dirname, 'bin', 'ReplayDump.exe');


// ---------- Auto-Update (GitHub Releases) ----------
let mainWin = null;
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
  autoUpdater.on('update-downloaded', i => setUpdate({ state: 'ready', version: i.version }));
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
    title: "Coco's Fn Tool",
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
      out.push({ path: p, name: f, mtime: st.mtimeMs, size: st.size });
    } catch (_) { /* Datei verschwunden */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
});

// Cache: geparste Replays werden einmal umgewandelt und danach aus dem Cache geladen
const cacheDir = () => {
  const d = path.join(app.getPath('userData'), 'cache');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const CACHE_VERSION = 'p1'; // erhöhen, wenn sich der Parser ändert
function cacheFile(file) {
  const st = fs.statSync(file);
  const key = (path.basename(file) + '_' + st.size + '_' + Math.round(st.mtimeMs)).replace(/[^\w.-]+/g, '_');
  return path.join(cacheDir(), CACHE_VERSION + '_' + key + '.json');
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

app.whenReady().then(() => { createWindow(); initUpdater(); });
app.on('window-all-closed', () => app.quit());
