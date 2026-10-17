const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('fn', {
  listReplays: () => ipcRenderer.invoke('list-replays'),
  parseReplay: (file) => ipcRenderer.invoke('parse-replay', file),
  pathFor: (file) => webUtils.getPathForFile(file),
  // Updates
  version: () => ipcRenderer.invoke('app-version'),
  updateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  // Lizenz
  licState: () => ipcRenderer.invoke('lic-state'),
  licLogin: () => ipcRenderer.invoke('lic-login'),
  licLoginCancel: () => ipcRenderer.invoke('lic-login-cancel'),
  licActivate: (k) => ipcRenderer.invoke('lic-activate', k),
  licRefresh: () => ipcRenderer.invoke('lic-refresh'),
  licLogout: () => ipcRenderer.invoke('lic-logout'),
  rankSet: (on, stats) => ipcRenderer.invoke('lic-rank-set', on, stats),
  rankAvg: () => ipcRenderer.invoke('lic-rank-avg'),
  rankSync: (stats) => ipcRenderer.invoke('lic-rank-sync', stats),
  progSet: (p) => ipcRenderer.invoke('lic-prog', p),
  season: (a, b) => ipcRenderer.invoke('lic-season', a, b),
  team: (a, b) => ipcRenderer.invoke('lic-team', a, b),
  pcScan: (o) => ipcRenderer.invoke('pc-scan', o),
  pcApply: (ids, o) => ipcRenderer.invoke('pc-apply', ids, o),
  pcRevert: () => ipcRenderer.invoke('pc-revert'),
  onUpdate: (cb) => ipcRenderer.on('update-status', (_e, s) => cb(s)),
  // Windows-Benachrichtigungen
  notify: (o) => ipcRenderer.invoke('notify', o),
  notifyPrefs: (p) => ipcRenderer.invoke('notify-prefs', p),
  onNotifyClick: (cb) => ipcRenderer.on('notify-click', (_e, a) => cb(a))
});
