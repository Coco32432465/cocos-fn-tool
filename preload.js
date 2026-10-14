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
  onUpdate: (cb) => ipcRenderer.on('update-status', (_e, s) => cb(s))
});
