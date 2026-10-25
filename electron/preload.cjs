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

// Development-only live reload. main.cjs passes this argument only for unpackaged runs.
// Nothing is exposed to the page: the isolated preload world updates the shared DOM.
if (process.argv.includes('--foco-dev-tools')) {
  const pendingStyles = new Map();
  let reloadNotice = null;

  // A new <link> is inserted right after the current one and the old one is removed only
  // after the new sheet loads, so the cascade order is kept and nothing flashes unstyled.
  const reloadStylesheet = (file, version) => {
    if (!/^[\w.-]+\.css$/.test(file)) return;
    const target = new URL(file, location.href).pathname;
    const current = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find(link => !link.dataset.focoDevPending && new URL(link.href).pathname === target);
    if (!current) return;
    pendingStyles.get(file)?.remove();
    const next = current.cloneNode();
    const url = new URL(current.href);
    url.searchParams.set('dev', String(version));
    next.href = url.href;
    next.dataset.focoDevPending = 'true';
    next.addEventListener('load', () => {
      if (pendingStyles.get(file) !== next) return;
      pendingStyles.delete(file);
      delete next.dataset.focoDevPending;
      current.remove();
      console.info(`[foco:dev] ${file} aplicado sem recarregar a página.`);
    }, { once: true });
    next.addEventListener('error', () => {
      if (pendingStyles.get(file) === next) pendingStyles.delete(file);
      next.remove();
      console.warn(`[foco:dev] Não foi possível carregar ${file}; a versão anterior foi mantida.`);
    }, { once: true });
    pendingStyles.set(file, next);
    current.after(next);
  };

  const noticeButton = (label, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.assign(button.style, { height: '28px', padding: '0 10px', border: '1px solid rgba(255,255,255,.16)', borderRadius: '6px', background: '#2a2b34', color: '#ececf1', font: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' });
    button.addEventListener('click', onClick);
    return button;
  };

  // Appended outside <body> so the i18n MutationObserver never touches it.
  const showReloadNotice = files => {
    reloadNotice?.remove();
    reloadNotice = document.createElement('div');
    reloadNotice.setAttribute('role', 'status');
    Object.assign(reloadNotice.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647', display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '460px', padding: '10px 12px', border: '1px solid rgba(255,255,255,.16)', borderRadius: '8px', background: '#1c1d24', color: '#ececf1', boxShadow: '0 8px 24px rgba(0,0,0,.45)', font: '13px/1.4 "Segoe UI", sans-serif' });
    const text = document.createElement('span');
    text.textContent = `[dev] ${files.join(', ')} alterado. Reload automático suspenso para não derrubar a sala.`;
    reloadNotice.append(text,
      noticeButton('Recarregar agora', () => location.reload()),
      noticeButton('Dispensar', () => { reloadNotice?.remove(); reloadNotice = null; }));
    document.documentElement.append(reloadNotice);
  };

  // JavaScript has no safe hot swap here: reload only when no room is open and no dialog
  // is in use. Otherwise a reload would end the room connection and any transmission.
  const handleCodeChange = files => {
    const body = document.body;
    const busy = body && (!body.classList.contains('no-room') || document.querySelector('dialog[open]'));
    if (busy) { showReloadNotice(files); return; }
    console.info(`[foco:dev] ${files.join(', ')} alterado. Recarregando a interface.`);
    location.reload();
  };

  ipcRenderer.on('foco:dev-css-changed', (_event, payload) => {
    for (const file of Array.isArray(payload?.files) ? payload.files : []) reloadStylesheet(String(file), payload.version);
  });
  ipcRenderer.on('foco:dev-code-changed', (_event, payload) => {
    const files = Array.isArray(payload?.files) ? payload.files.map(String) : [];
    if (files.length) handleCodeChange(files);
  });
}
