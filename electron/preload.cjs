const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('focoDesktop', {
  listSources: () => ipcRenderer.invoke('foco:list-sources'),
  resolveProcess: sourceId => ipcRenderer.invoke('foco:resolve-process', sourceId),
  startAudioCapture: pid => ipcRenderer.invoke('foco:start-audio', pid),
  stopAudioCapture: () => ipcRenderer.invoke('foco:stop-audio'),
  setFullscreen: active => ipcRenderer.invoke('foco:set-fullscreen', Boolean(active)),
  getAppVersion: () => ipcRenderer.invoke('foco:get-app-version'),
  writeClipboard: value => ipcRenderer.invoke('foco:clipboard-write', String(value)),
  getUpdateStatus: () => ipcRenderer.invoke('foco:get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('foco:check-updates'),
  getPendingInvite: () => ipcRenderer.invoke('foco:get-pending-invite'),
  onInvite: callback => {
    const listener = (_event, code) => { callback(code); ipcRenderer.send('foco:invite-consumed', code); };
    ipcRenderer.on('foco:invite', listener);
    return () => ipcRenderer.removeListener('foco:invite', listener);
  },
  onAudioChunk: callback => {
    const listener = (_event, chunk) => callback(chunk);
    ipcRenderer.on('foco:audio-chunk', listener);
    return () => ipcRenderer.removeListener('foco:audio-chunk', listener);
  },
  onUpdateStatus: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('foco:update-status', listener);
    return () => ipcRenderer.removeListener('foco:update-status', listener);
  },
  platform: process.platform
});
