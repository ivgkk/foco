const { app, BrowserWindow, Menu, desktopCapturer, ipcMain, session, shell, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRendererMatcher } = require('./trusted-origin.cjs');
const { LoopbackCapture } = require('loopback-capture');
const { autoUpdater } = require('electron-updater');
// Development tooling never loads in packaged builds (and is excluded from them).
const devTools = app.isPackaged ? null : require('./dev-tools.cjs');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'WebRtcHideLocalIpsWithMdns');
let audioCapture = null;
let mainWindow = null;
let pendingInvite = '';
let autoUpdatesConfigured = false;
let updateTargetVersion = null;
let latestUpdateStatus = { state: 'starting', currentVersion: app.getVersion(), updatedAt: Date.now() };
function parseInvite(value) {
  if (typeof value !== 'string' || !value.toLowerCase().startsWith('foco:')) return '';
  try {
    const url = new URL(value);
    const code = (url.hostname === 'join' ? url.pathname.slice(1) : url.searchParams.get('code') || url.pathname.slice(1)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return code.length >= 6 ? code.slice(0, 10) : '';
  } catch { return ''; }
}
pendingInvite = process.argv.map(parseInvite).find(Boolean) || '';
app.setAsDefaultProtocolClient('foco', app.isPackaged ? undefined : process.execPath, app.isPackaged ? [] : [path.resolve(process.argv[1] || '.')]);
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else app.on('second-instance', (_event, argv) => {
  const code = argv.map(parseInvite).find(Boolean);
  if (code) {
    pendingInvite = code;
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send('foco:invite', code);
    }
  }
});
const sourcesByWebContents = new Map();
const sourceRequestVersionByWebContents = new Map();
const audioPidsByWebContents = new Map();
const rendererFile = path.resolve(__dirname, '..', 'renderer', 'index.html');
const isRendererUrl = createRendererMatcher(rendererFile);
function isTrusted(event) {
  return !!event.senderFrame && isRendererUrl(event.senderFrame.url);
}
function requireTrusted(event) {
  if (!isTrusted(event)) throw new Error('Origem não autorizada.');
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1440, height: 960, minWidth: 980, minHeight: 720,
    backgroundColor: '#0e0f13', title: 'Foco',
    ...(process.platform === 'win32' ? { icon: path.join(__dirname, '..', 'assets', 'foco.ico') } : {}),
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden',
      // The sidebar header and the room bar draw this 48px strip; keep color and height in sync
      // with --bg-app and --titlebar-height in renderer/tokens.css.
      titleBarOverlay: { color: '#0e0f13', symbolColor: '#a3a4ae', height: 48 }
    } : {}),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      ...(devTools ? { additionalArguments: [devTools.DEV_ARGUMENT] } : {})
    }
  });
  win.removeMenu();
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', (event, url) => {
    if (!isRendererUrl(url)) event.preventDefault();
  });
  win.webContents.once('destroyed', () => {
    sourcesByWebContents.delete(win.webContents.id);
    sourceRequestVersionByWebContents.delete(win.webContents.id);
    audioPidsByWebContents.delete(win.webContents.id);
  });
  if (devTools) devTools.attach(win, { rendererDir: path.dirname(rendererFile), electronDir: __dirname });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function sendUpdateStatus(status) {
  latestUpdateStatus = { ...status, currentVersion: app.getVersion(), updatedAt: Date.now() };
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('foco:update-status', latestUpdateStatus);
  }
}

async function checkForUpdates() {
  if (!autoUpdatesConfigured) return latestUpdateStatus;
  sendUpdateStatus({ state: 'checking' });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.warn('Não foi possível verificar atualizações:', error.message);
    sendUpdateStatus({ state: 'error' });
  }
  return latestUpdateStatus;
}

ipcMain.handle('foco:get-app-version', event => { requireTrusted(event); return app.getVersion(); });
ipcMain.handle('foco:clipboard-write', (event, value) => { requireTrusted(event); if (typeof value !== 'string' || value.length > 2048) throw new Error('Texto inválido para a área de transferência.'); clipboard.writeText(value); return true; });
ipcMain.handle('foco:get-update-status', event => { requireTrusted(event); return latestUpdateStatus; });
ipcMain.handle('foco:check-updates', event => { requireTrusted(event); return checkForUpdates(); });

function initializeAutoUpdates() {
  if (!app.isPackaged || process.platform !== 'win32') {
    sendUpdateStatus({ state: 'unavailable', reason: 'development' });
    return;
  }
  const updateManifest = path.join(process.resourcesPath, 'app-update.yml');
  if (!fs.existsSync(updateManifest)) {
    sendUpdateStatus({ state: 'unavailable', reason: 'not-configured' });
    return;
  }

  autoUpdatesConfigured = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ state: 'checking' }));
  autoUpdater.on('update-available', info => {
    updateTargetVersion = info.version;
    sendUpdateStatus({ state: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', info => sendUpdateStatus({ state: 'current', latestVersion: info.version }));
  autoUpdater.on('download-progress', progress => sendUpdateStatus({
    state: 'downloading', version: updateTargetVersion, percent: Math.round(progress.percent || 0)
  }));
  autoUpdater.on('update-downloaded', info => sendUpdateStatus({ state: 'ready', version: info.version }));
  autoUpdater.on('error', error => {
    console.warn('Atualização automática:', error.message);
    sendUpdateStatus({ state: 'error' });
  });
  setTimeout(() => checkForUpdates(), 800);
}

ipcMain.handle('foco:list-sources', async event => {
  requireTrusted(event);
  const senderId=event.sender.id,version=(sourceRequestVersionByWebContents.get(senderId)||0)+1;
  sourceRequestVersionByWebContents.set(senderId,version);
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true
  });
  if(!event.sender.isDestroyed()&&sourceRequestVersionByWebContents.get(senderId)===version)sourcesByWebContents.set(senderId,new Set(sources.map(source=>source.id)));
  return sources.map(s => ({
    id: s.id, name: s.name, type: s.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnail: s.thumbnail.toDataURL(), appIcon: s.appIcon?.toDataURL() || null
  }));
});

function getProcessIdForSource(sourceId) {
  return new Promise((resolve, reject) => {
    const match = /^window:(\d+):/.exec(sourceId || '');
    const hwnd = match ? Number(match[1]) : 0;
    // PowerShell cannot read script files from inside Electron's app.asar archive.
    // electron-builder unpacks this helper beside the archive for packaged builds.
    const resolver = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'resolve-process.ps1')
      : path.join(__dirname, 'resolve-process.ps1');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolver, String(hwnd)], { windowsHide: true });
    let output = '';
    let error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      const pid = Number(output.trim().split(/\r?\n/).pop());
      if (code !== 0 || !Number.isInteger(pid) || pid < 1) reject(new Error(error.trim() || 'Não foi possível identificar o aplicativo da janela.'));
      else resolve(pid);
    });
  });
}

ipcMain.handle('foco:resolve-process', async (event, sourceId) => {
  requireTrusted(event);
  if (typeof sourceId !== 'string' || !sourcesByWebContents.get(event.sender.id)?.has(sourceId)) throw new Error('Janela não autorizada para captura de áudio.');
  const pid = await getProcessIdForSource(sourceId);
  if (!audioPidsByWebContents.has(event.sender.id)) audioPidsByWebContents.set(event.sender.id, new Set());
  audioPidsByWebContents.get(event.sender.id).add(pid);
  return pid;
});
ipcMain.handle('foco:start-audio', async (event, pid) => {
  requireTrusted(event);
  if (!Number.isInteger(pid) || pid < 1) throw new Error('Processo de áudio inválido.');
  if (!audioPidsByWebContents.get(event.sender.id)?.has(pid)) throw new Error('Processo não autorizado para captura de áudio.');
  if (audioCapture) { try { audioCapture.stop(); } catch {} audioCapture = null; }
  const capture = new LoopbackCapture();
  capture.start(pid, true, chunk => {
    if (!event.sender.isDestroyed()) event.sender.send('foco:audio-chunk', new Uint8Array(chunk));
  });
  audioCapture = capture;
  return true;
});
ipcMain.handle('foco:stop-audio', async event => {
  requireTrusted(event);
  if (audioCapture) { try { audioCapture.stop(); } finally { audioCapture = null; } }
  return true;
});
ipcMain.handle('foco:set-fullscreen', (event, active) => {
  requireTrusted(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) throw new Error('A janela do Foco não está disponível.');
  win.setFullScreen(Boolean(active));
  return win.isFullScreen();
});
ipcMain.handle('foco:get-pending-invite', event => { requireTrusted(event); const code = pendingInvite; pendingInvite = ''; return code; });
ipcMain.on('foco:invite-consumed', (event, code) => { requireTrusted(event); if (pendingInvite === code) pendingInvite = ''; });

if (singleInstance) app.whenReady().then(() => {
  const canCaptureDisplay = (webContents, permission, details) => {
    if (webContents !== mainWindow?.webContents) return false;
    // Electron 39 reports legacy desktopCapturer/getUserMedia requests as
    // `media` with no mediaTypes. Newer Electron versions use `display-capture`.
    // Keep the legacy compatibility path restricted to empty media requests so
    // camera and microphone access remain denied.
    return permission === 'display-capture' ||
      (permission === 'media' && Array.isArray(details?.mediaTypes) && details.mediaTypes.length === 0);
  };
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(canCaptureDisplay(webContents, permission, details));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) =>
    canCaptureDisplay(webContents, permission, details));
  createWindow();
  initializeAutoUpdates();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (audioCapture) { try { audioCapture.stop(); } catch {} audioCapture = null; } if (process.platform !== 'darwin') app.quit(); });
