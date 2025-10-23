const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setApiKey: (key) => ipcRenderer.invoke('settings:set-api-key', key),
  getUsageSummary: () => ipcRenderer.invoke('usage:get-summary'),
  getLatestDigest: () => ipcRenderer.invoke('digest:get-latest'),
  triggerDigest: () => ipcRenderer.invoke('digest:trigger'),
  updatePreferences: (updates) => ipcRenderer.invoke('preferences:update', updates),
  onDigest: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const listener = (_event, digest) => callback(digest);
    ipcRenderer.on('digest:new', listener);
    return () => ipcRenderer.removeListener('digest:new', listener);
  }
});
