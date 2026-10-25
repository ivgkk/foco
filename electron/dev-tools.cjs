// Development-only tooling. main.cjs requires this module only when the app is not
// packaged, and electron-builder excludes it from distributed builds.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEV_ARGUMENT = '--foco-dev-tools';
const CSS_DEBOUNCE_MS = 120;
const CODE_DEBOUNCE_MS = 250;
const MAX_READ_RETRIES = 3;
const log = message => console.log(`[foco:dev] ${message}`);

function toggleDevTools(win) {
  if (win.isDestroyed()) return;
  const contents = win.webContents;
  if (contents.isDevToolsOpened()) contents.closeDevTools();
  else contents.openDevTools({ mode: 'detach' });
}

// `code` is empty for synthesized keys (SendKeys, some virtual keyboards), so `key` is the fallback.
const isKey = (input, code, key) => input.code === code || String(input.key).toLowerCase() === key;

// F12 / Ctrl+Shift+I toggle DevTools and Ctrl+R reloads. Only these exact combinations
// are consumed, so Foco's own keys (Escape, Enter in chat) keep working.
function handleShortcut(win, event, input) {
  if (input.type !== 'keyDown' || input.isAutoRepeat || input.alt || input.meta) return;
  const toggle = (isKey(input, 'F12', 'f12') && !input.control && !input.shift) || (input.control && input.shift && isKey(input, 'KeyI', 'i'));
  const reload = input.control && !input.shift && isKey(input, 'KeyR', 'r');
  if (toggle) { event.preventDefault(); toggleDevTools(win); }
  else if (reload) { event.preventDefault(); log('Recarregando a interface (Ctrl+R).'); win.webContents.reloadIgnoringCache(); }
}

function fileHash(dir, file) {
  try {
    const content = fs.readFileSync(path.join(dir, file));
    // Some editors truncate before writing; an empty read is treated as "not ready yet".
    return content.length ? crypto.createHash('sha1').update(content).digest('hex') : null;
  } catch {
    // Missing during an atomic rename, or EBUSY while the editor still holds the file.
    return null;
  }
}

function listFiles(dir, accept) {
  try { return fs.readdirSync(dir).filter(accept); } catch { return []; }
}

// fs.watch on Windows fires duplicate events, may omit the filename and reports atomic
// saves as renames. Instead of trusting individual events, every burst is debounced and
// the directory is rescanned; only files whose content hash changed are reported.
function watchDirectory(dir, { accept, delay, onChange }) {
  const hashes = new Map(listFiles(dir, accept).map(file => [file, fileHash(dir, file)]));
  let timer = null;
  let retries = 0;
  const scan = () => {
    timer = null;
    const changed = [];
    let pending = false;
    for (const file of listFiles(dir, accept)) {
      const next = fileHash(dir, file);
      if (!next) { pending = true; continue; }
      if (hashes.get(file) !== next) { hashes.set(file, next); changed.push(file); }
    }
    if (pending && retries < MAX_READ_RETRIES) { retries++; timer = setTimeout(scan, delay); }
    else retries = 0;
    if (changed.length) onChange(changed);
  };
  // persistent:false keeps the watcher from holding the process open after the window closes.
  const watcher = fs.watch(dir, { persistent: false }, (_type, filename) => {
    if (filename && !accept(String(filename))) return;
    clearTimeout(timer);
    retries = 0;
    timer = setTimeout(scan, delay);
  });
  watcher.on('error', error => { log(`Observador de ${dir} encerrado: ${error.message}`); clearTimeout(timer); watcher.close(); });
  return () => { clearTimeout(timer); watcher.close(); };
}

const isVisible = file => !file.startsWith('.');

function attach(win, { rendererDir, electronDir }) {
  const contents = win.webContents;
  const send = (channel, payload) => { if (!win.isDestroyed() && !contents.isDestroyed()) contents.send(channel, payload); };

  // Electron does not emit before-input-event for the DevTools window itself, so these
  // shortcuts work while the Foco window has focus.
  contents.on('before-input-event', (event, input) => handleShortcut(win, event, input));

  const disposers = [
    watchDirectory(rendererDir, {
      accept: file => isVisible(file) && file.endsWith('.css'),
      delay: CSS_DEBOUNCE_MS,
      onChange: files => {
        log(`CSS alterado: ${files.join(', ')}. Aplicando sem recarregar.`);
        send('foco:dev-css-changed', { files, version: Date.now() });
      }
    }),
    watchDirectory(rendererDir, {
      accept: file => isVisible(file) && /\.(js|html)$/.test(file),
      delay: CODE_DEBOUNCE_MS,
      onChange: files => {
        // The page loads the esbuild bundle, not the Firebase source module.
        if (files.includes('firebase-client.js')) log('firebase-client.js alterado. Rode "pnpm run bundle:firebase" para gerar o bundle.');
        const loaded = files.filter(file => file !== 'firebase-client.js');
        if (loaded.length) { log(`Código alterado: ${loaded.join(', ')}.`); send('foco:dev-code-changed', { files: loaded }); }
      }
    }),
    watchDirectory(electronDir, {
      accept: file => isVisible(file) && file.endsWith('.cjs'),
      delay: CODE_DEBOUNCE_MS,
      onChange: files => {
        // The sandboxed preload is read again on every page load; the main process is not.
        if (files.includes('preload.cjs')) send('foco:dev-code-changed', { files: ['preload.cjs'] });
        const mainFiles = files.filter(file => file !== 'preload.cjs');
        if (mainFiles.length) log(`${mainFiles.join(', ')} alterado. Reinicie o app para aplicar mudanças do processo main.`);
      }
    })
  ];

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const stop of disposers) stop();
    log('Observadores de arquivos encerrados.');
  };
  win.once('closed', dispose);
  log('Modo de desenvolvimento: F12/Ctrl+Shift+I abrem o DevTools, Ctrl+R recarrega e CSS é aplicado ao salvar.');
  return dispose;
}

module.exports = { DEV_ARGUMENT, attach };
