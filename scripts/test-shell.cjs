const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {app, BrowserWindow} = require('electron');

// Application shell tests. They run the real renderer with controllable stubs: auth, room list,
// presence and chat answer only when a scenario says so, and a fake Peer opens on demand. Nothing
// reaches the network, and nothing here is a real Firebase or P2P session.

const stubs = `(() => {
  const listeners = {}; let profile = null;
  const store = (name, callback) => { listeners[name] = callback; return () => { if (listeners[name] === callback) delete listeners[name]; }; };
  window.__cloud = {listeners, joins: [], gate: null, rooms: {K7M4PQ2A: {code: 'K7M4PQ2A', name: 'Sala dos amigos', ownerUid: 'zz-me'}, R4NK3D99: {code: 'R4NK3D99', name: 'Ranked de sexta', ownerUid: 'u-luna'}}, setProfile: value => { profile = value; }};
  window.focoCloud = {
    isConfigured: () => true, cleanCode: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
    onAuthChanged: callback => store('auth', callback), getProfile: async () => profile,
    watchUserRooms: async callback => store('userRooms', callback),
    findRoom: async code => ({...window.__cloud.rooms[code], id: code, host: false}),
    joinRoom: async (code, _profile, peerId) => { window.__cloud.joins.push({code, peerId}); if (window.__cloud.gate) await window.__cloud.gate; return {...window.__cloud.rooms[code], id: code, role: 'owner', canStream: true}; },
    watchMemberList: async (code, callback) => store('members:' + code, callback),
    verifyRoomPeer: async (_room, uid, peerId) => ({uid, peerId, canStream: true}),
    watchRoomChat: async (code, callback) => store('chat:' + code, callback),
    watchRoom: async (code, callback) => store('room:' + code, callback),
    exitRoom: async () => {}, updateRoomMember: async () => {}, logout: async () => {}
  };
  window.__peers = [];
  window.Peer = class { constructor() { this.id = 'p-me-' + window.__peers.length; this.handlers = {}; this.open = false; this.destroyed = false; window.__peers.push(this); }
    on(type, handler) { (this.handlers[type] ||= []).push(handler); } emit(type, ...args) { for (const handler of this.handlers[type] || []) handler(...args); }
    openNow() { this.open = true; this.emit('open', this.id); } destroy() { this.destroyed = true; } connect() { return {on() {}, send() {}, close() {}}; } call() { return null; } reconnect() {} };
  window.focoDesktop = {listSources: async () => [], resolveProcess: async () => 1, startAudioCapture: async () => true, stopAudioCapture: async () => true, setFullscreen: async active => Boolean(active), getAppVersion: async () => 'test', writeClipboard: async () => true, getUpdateStatus: async () => ({state: 'unavailable', reason: 'development'}), checkForUpdates: async () => ({}), getPendingInvite: async () => '', onInvite: () => () => {}, onAudioChunk: () => () => {}, onUpdateStatus: () => () => {}, platform: 'win32'};
  localStorage.removeItem('foco.sidebarCollapsed'); localStorage.removeItem('foco.panelOpen');
})();`;

// Shared helpers, installed once in the page.
function helpers() {
  window.focoI18n.setLanguage('pt-BR');
  window.__results = [];
  window.__check = (name, ok, detail = '') => window.__results.push({name, ok: Boolean(ok), detail: String(detail)});
  window.__sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  window.__until = async (predicate, timeout = 3000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (predicate()) return true; await __sleep(30); } return predicate(); };
  window.__visible = selector => { const el = document.querySelector(selector); return Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  window.__stream = () => { const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180; const context = canvas.getContext('2d'); let frame = 0; setInterval(() => { context.fillStyle = `hsl(${frame++ * 9 % 360} 60% 40%)`; context.fillRect(0, 0, 320, 180); }, 50); return canvas.captureStream(20); };
  window.__fakeCall = (peer, metadata) => ({peer, metadata, handlers: {}, peerConnection: Object.assign(new EventTarget(), {connectionState: 'connected', getStats: async () => new Map()}), answer() {}, on(type, handler) { (this.handlers[type] ||= []).push(handler); }, emit(type, ...args) { for (const handler of this.handlers[type] || []) handler(...args); }, close() { if (this.closed) return; this.closed = true; this.emit('close'); }});
  window.__members = (...list) => Object.fromEntries([['zz-me', {uid: 'zz-me', peerId: window.__peers.at(-1)?.id || 'p-me-x', nickname: 'Eu', online: true, role: 'owner'}], ...list.map(item => [item.uid, item])]);
  window.__text = selector => document.querySelector(selector)?.textContent.trim() ?? null;
  // A hidden test window produces no animation frames, so a CSS transition (even a 0.01ms one)
  // never finishes. Transitions are switched off here; the visible app is checked separately.
  const noTransitions = document.createElement('style'); noTransitions.textContent = '*, *::before, *::after { transition: none !important; }'; document.head.append(noTransitions);
}

async function startupAndRooms() {
  const startupDone = () => document.querySelector('#startupScreen').classList.contains('is-done');
  await __sleep(1300);
  __check('Startup não fecha antes da primeira resposta de autenticação', !startupDone() && !__cloud.listeners.userRooms);
  __cloud.setProfile({username: 'eu', nickname: 'Eu', status: 'Disponível', color: '#9b83ff', photo: '', showActivity: true, activity: ''});
  await __cloud.listeners.auth({uid: 'zz-me'});
  await __until(startupDone, 2000);
  __check('Com sessão: o formulário de login nunca aparece e o startup fecha', document.querySelector('#authGate').hidden && startupDone());
  const list = document.querySelector('#roomList');
  __check('Lista de salas carregando: skeleton com aria-busy, sem salas inventadas nem "nenhuma sala"', list.getAttribute('aria-busy') === 'true' && list.querySelector('.room-skeleton') && !list.querySelector('[data-room]') && !/Nenhuma sala/.test(list.textContent), list.textContent.trim());
  __check('Perfil real no rodapé da sidebar', __text('#profileName') === 'Eu' && __text('#profileAvatar') === 'E');
  await __sleep(10300);
  __check('Sem resposta em 10 s: aviso de demora, mantendo o skeleton (não vira "vazio")', /demorando/.test(list.textContent) && list.querySelector('.room-skeleton'), list.textContent.trim());
  __cloud.listeners.userRooms([]);
  __check('Carregado e vazio: "Nenhuma sala ainda"', list.getAttribute('aria-busy') === null && __text('#roomList .empty-rooms') === 'Nenhuma sala ainda', __text('#roomList'));
  __cloud.listeners.userRooms(Object.values(__cloud.rooms).map(room => ({...room})));
  __check('Carregado com dados: salas reais na lista', document.querySelectorAll('#roomList [data-room]').length === 2);
  const search = document.querySelector('#roomSearch'); search.value = 'zzz'; search.dispatchEvent(new Event('input'));
  __check('Busca sem resultado: "Nenhuma sala encontrada" (diferente de vazio)', __text('#roomList .empty-rooms') === 'Nenhuma sala encontrada');
  search.value = ''; search.dispatchEvent(new Event('input'));
  __check('Sem sala aberta: barra mostra Início e esconde ações de sala; painel oculto', __text('#roomName') === 'Início' && !__visible('#shareButton') && !__visible('#copyRoomCode') && !__visible('#sidePanel') && __visible('#noRoomPanel'));
}

async function sidebar() {
  const toggle = document.querySelector('#sidebarToggle'), width = () => Math.round(document.querySelector('#sidebar').getBoundingClientRect().width);
  await __sleep(250);
  const expandedWidth = width();
  toggle.click(); await __sleep(300);
  __check('1. Recolher: sidebar de 56px, aria-expanded=false, rótulo "Expandir", preferência salva', document.body.classList.contains('sidebar-collapsed') && width() === 56 && toggle.getAttribute('aria-expanded') === 'false' && toggle.title === 'Expandir barra lateral' && localStorage.getItem('foco.sidebarCollapsed') === 'true', `${expandedWidth} → ${width()}`);
  __check('Sidebar recolhida mantém navegação: iniciais das salas e ações com rótulo', [...document.querySelectorAll('#roomList .room-initial')].every(el => el.getClientRects().length) && document.querySelector('#createRoom').getAttribute('aria-label') && __visible('#createRoom') && __visible('#joinRoom') && __visible('#profileButton') && __visible('#settingsButton'));
  toggle.click(); await __sleep(300);
  __check('1. Expandir: volta a 240px', !document.body.classList.contains('sidebar-collapsed') && width() === 240 && toggle.getAttribute('aria-expanded') === 'true', `${width()} class=${document.body.className} cols=${getComputedStyle(document.querySelector('.app-shell')).gridTemplateColumns} pref=${localStorage.getItem('foco.sidebarCollapsed')}`);
}

async function enterRoom() {
  document.querySelector('#roomList [data-room="K7M4PQ2A"]').click();
  await __until(() => window.__peers.length === 1);
  const chip = document.querySelector('#connectionStatus');
  __check('9. Antes da sinalização: estado "pending" "Conectando à sala…", nunca "Conectado"', chip.dataset.state === 'pending' && __text('#connectionStatusLabel') === 'Conectando à sala…', chip.dataset.state);
  let release; __cloud.gate = new Promise(resolve => { release = resolve; });
  __peers[0].openNow(); await __sleep(50);
  __check('9. Sinalização aberta mas entrada na sala pendente: continua "pending"', chip.dataset.state === 'pending' && !/Conectado/.test(__text('#connectionStatusLabel')));
  __check('7. Presença não confirmada: contagem vazia (placeholder), lista em skeleton sem nomes', __text('#onlineCount') === '' && document.querySelector('#peopleList').getAttribute('aria-busy') === 'true' && !document.querySelector('#peopleList .person-chip'));
  __check('7. Chat não carregado: skeleton, sem "Nenhuma mensagem ainda"', document.querySelector('#chatMessages').getAttribute('aria-busy') === 'true' && !/Nenhuma mensagem/.test(__text('#chatMessages')));
  __check('Identificação real da sala já visível: nome e código conhecidos', __text('#roomName') === 'Sala dos amigos' && __text('#copyRoomCode') === 'K7M4PQ2A');
  release(); __cloud.gate = null;
  await __until(() => chip.dataset.state === 'connected');
  __check('9. Só após a entrada confirmada: "Conectado · P2P"', chip.dataset.state === 'connected' && __text('#connectionStatusLabel') === 'Conectado · P2P');
  __cloud.listeners['members:K7M4PQ2A'](__members({uid: 'u-luna', peerId: 'p-luna', nickname: 'Luna', online: true, streaming: false}));
  __check('Presença confirmada: contagem real (2) e lista com pessoas', __text('#onlineCount') === '2' && document.querySelectorAll('#peopleList .person-chip').length === 2 && __text('#memberCount') === '2 participantes');
  window.__oldMessage = {id: 'old', uid: 'u-luna', nickname: 'Luna', kind: 'text', text: 'Mensagem antiga', createdAt: Date.now() - 60000};
  __cloud.listeners['chat:K7M4PQ2A']([__oldMessage]);
  __check('Chat carregado: histórico exibido e não conta como não lido', __text('#chatMessages').includes('Mensagem antiga') && document.querySelector('#chatUnread').hidden);
}

async function panel() {
  const toggle = document.querySelector('#panelToggle'), body = document.body;
  const startOpen = body.classList.contains('panel-open');
  __check('Padrão sem preferência: painel aberto em janela larga (1440px)', startOpen && __visible('#sidePanel'), `innerWidth=${innerWidth}`);
  toggle.click();
  __check('3. Fechar painel: some da tela, aria-expanded=false, preferência explícita salva', !body.classList.contains('panel-open') && !__visible('#sidePanel') && toggle.getAttribute('aria-expanded') === 'false' && localStorage.getItem('foco.panelOpen') === 'false');
  const now = Date.now();
  __cloud.listeners['chat:K7M4PQ2A']([__oldMessage, {id: 'mine', uid: 'zz-me', nickname: 'Eu', kind: 'text', text: 'Minha', createdAt: now - 1000}, {id: 'new', uid: 'u-luna', nickname: 'Luna', kind: 'text', text: 'Nova', createdAt: now}]);
  __check('Não lidas: só mensagens novas de outras pessoas (1) com painel fechado; ponto no botão do painel', __text('#chatUnread') === '1' && !document.querySelector('#chatUnread').hidden && !document.querySelector('#panelUnread').hidden, `chat=${__text('#chatUnread')} chatHidden=${document.querySelector('#chatUnread').hidden} dot=${document.querySelector('#panelUnread').hidden} seen=${state.chatSeenAt - now} open=${isPanelOpen()} msgs=${state.chatMessages.length}`);
  toggle.click();
  __check('3. Abrir painel na aba Chat zera as não lidas', body.classList.contains('panel-open') && document.querySelector('#chatUnread').hidden && document.querySelector('#panelUnread').hidden);
  document.querySelector('#peopleTab').click();
  __check('4. Aba Pessoas: aria-selected, painel de pessoas visível, chat oculto', document.querySelector('#peopleTab').getAttribute('aria-selected') === 'true' && __visible('#peopleList') && document.querySelector('#chatPane').hidden && document.querySelector('#chatTab').tabIndex === -1);
  document.querySelector('#peopleTab').dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
  __check('4. Teclado (setas) alterna para Chat e move o foco', document.querySelector('#chatTab').getAttribute('aria-selected') === 'true' && document.activeElement === document.querySelector('#chatTab') && !document.querySelector('#chatPane').hidden);
  toggle.click();
  document.querySelector('#participantsButton').click();
  __check('Botão de participantes abre o painel direto na aba Pessoas', body.classList.contains('panel-open') && document.querySelector('#peopleTab').getAttribute('aria-selected') === 'true');
  document.querySelector('#chatTab').click();
}

async function videoBefore() {
  const call = __fakeCall('p-luna', {name: 'Luna', ownerId: 'p-luna', userId: 'u-luna'});
  await handleCall(call); call.emit('stream', __stream());
  await __until(() => state.streamTiles.get('p-luna')?.mediaState === 'live');
  window.__video = state.streamTiles.get('p-luna').video; window.__time = __video.currentTime;
  for (let i = 0; i < 2; i++) { document.querySelector('#sidebarToggle').click(); document.querySelector('#panelToggle').click(); document.querySelector('#peopleTab').click(); document.querySelector('#chatTab').click(); document.querySelector('#participantsButton').click(); await __sleep(150); }
  __check('8a. Alternar sidebar, painel e abas 2x mantém o mesmo nó de vídeo', state.streamTiles.get('p-luna').video === __video && document.contains(__video) && document.querySelectorAll('#streamGrid video').length === 1);
  for(const [open,dialog] of [[openProfile,'#profileDialog'],[openSettings,'#settingsDialog'],[()=>showRoomDialog(false),'#roomDialog'],[openRoomManagement,'#roomManageDialog']]){
    open();__check(`Fase 7: ${dialog} preserva o vídeo ativo`,document.querySelector(dialog).open&&state.streamTiles.get('p-luna').video===__video&&document.contains(__video));document.querySelector(dialog).close();
  }
}

async function videoAfterResize() {
  const video = state.streamTiles.get('p-luna').video;
  __check('8b. Redimensionar a janela (1440 → 980×720 → 1440) não recria nem pausa o vídeo', video === __video && !video.paused && video.currentTime > __time, `${__time.toFixed(2)} → ${video.currentTime.toFixed(2)}`);
}

async function narrow() {
  const panelEl = document.querySelector('#sidePanel');
  localStorage.setItem('foco.panelOpen', 'true'); applyShellLayout();
  const mainWidthOpen = document.querySelector('#mainContent').getBoundingClientRect().width;
  localStorage.setItem('foco.panelOpen', 'false'); applyShellLayout();
  const mainWidthClosed = document.querySelector('#mainContent').getBoundingClientRect().width;
  localStorage.setItem('foco.panelOpen', 'true'); applyShellLayout();
  __check('Janela estreita (980px): painel vira gaveta sobreposta e não encolhe a área central', getComputedStyle(panelEl).position === 'absolute' && Math.abs(mainWidthOpen - mainWidthClosed) < 1, `main ${mainWidthOpen} vs ${mainWidthClosed}`);
  localStorage.removeItem('foco.sidebarCollapsed'); applyShellLayout();
  __check('Janela estreita sem preferência salva: sidebar recolhida por padrão', document.body.classList.contains('sidebar-collapsed'));
  __check('Sem rolagem horizontal da página em 980px', document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth, `${document.documentElement.scrollWidth}/${innerWidth}`);
  __check('Documento não rola verticalmente: regiões com rolagem própria', getComputedStyle(document.body).overflow === 'hidden' && document.documentElement.scrollHeight <= innerHeight + 1, `${document.documentElement.scrollHeight}/${innerHeight}`);
  localStorage.removeItem('foco.panelOpen'); applyShellLayout();
}

async function roomSwitch() {
  const before = __peers.length, video = state.streamTiles.get('p-luna').video;
  const local = __stream(); state.localStream = local; state.streams.set(state.peer.id, {stream: local, name: 'Eu', uid: 'zz-me', local: true, appName: 'Code', sourceType: 'Janela', quality: '720p'}); renderStreams();
  document.querySelector('#roomList [data-room="K7M4PQ2A"]').click(); await __sleep(50);
  __check('Clicar na sala atual não reconecta nem pede confirmação', __peers.length === before && !document.querySelector('#confirmDialog').open);
  document.querySelector('#roomList [data-room="R4NK3D99"]').click(); await __sleep(50);
  __check('5. Trocar de sala transmitindo: pede confirmação antes de qualquer ação', document.querySelector('#confirmDialog').open && __peers.length === before && __text('#confirmTitle') === 'Trocar de sala?' && document.activeElement === document.querySelector('#confirmCancel'));
  document.querySelector('#confirmCancel').click(); await __sleep(50);
  __check('6. Cancelar mantém sala, transmissão, tracks e vídeo intactos', !document.querySelector('#confirmDialog').open && state.activeRoom === 'K7M4PQ2A' && state.localStream === local && local.getTracks().every(track => track.readyState === 'live') && __peers.length === before && state.streamTiles.get('p-luna')?.video === video);
  document.querySelector('#roomList [data-room="R4NK3D99"]').click(); await __sleep(50);
  document.querySelector('#confirmDialog').dispatchEvent(new Event('cancel')); document.querySelector('#confirmDialog').close(); await __sleep(50);
  __check('6. Esc/fechar o diálogo também cancela', state.activeRoom === 'K7M4PQ2A' && state.localStream === local && __peers.length === before);
  document.querySelector('#roomList [data-room="R4NK3D99"]').click(); await __sleep(50);
  document.querySelector('#confirmAccept').click();
  await __until(() => state.activeRoom === 'R4NK3D99');
  __check('5. Confirmar encerra a transmissão e entra na outra sala', state.activeRoom === 'R4NK3D99' && state.localStream === null && __peers.length === before + 1 && __text('#roomName') === 'Ranked de sexta');
  __check('Troca de sala limpa os tiles da sala anterior', state.streamTiles.size === 0 && !document.contains(video));
  __peers.at(-1).openNow(); await __until(() => document.querySelector('#connectionStatus').dataset.state === 'connected');
  document.querySelector('#roomList [data-room="K7M4PQ2A"]').click(); await __until(() => state.activeRoom === 'K7M4PQ2A');
  __check('Sem transmissão ativa: troca direta, sem confirmação', state.activeRoom === 'K7M4PQ2A' && !document.querySelector('#confirmDialog').open);
}

async function titlebar() {
  const region = el => getComputedStyle(el).getPropertyValue('-webkit-app-region').trim();
  const bar = document.querySelector('.room-bar'), header = document.querySelector('.sidebar-header');
  const interactive = [...document.querySelectorAll('.room-bar button, .room-bar input, .sidebar-header button')];
  __check('10. Barra da sala e cabeçalho da sidebar são região de arrasto', region(bar) === 'drag' && region(header) === 'drag');
  __check('10. Todos os controles da barra são no-drag (clicáveis)', interactive.length >= 6 && interactive.every(el => region(el) === 'no-drag'), interactive.filter(el => region(el) !== 'no-drag').map(el => el.id).join(','));
  __check('10. Diálogos e toast ficam fora da região de arrasto', region(document.querySelector('#confirmDialog')) === 'no-drag' && region(document.querySelector('#toast')) === 'no-drag');
  __check('10. Altura da barra = --titlebar-height (48px, igual ao titleBarOverlay)', Math.round(bar.getBoundingClientRect().height) === 48 && getComputedStyle(document.documentElement).getPropertyValue('--titlebar-height').trim() === '48px');
  const last = [...bar.querySelectorAll('button')].filter(el => el.getClientRects().length).at(-1).getBoundingClientRect();
  __check('10. Sem overlay nativo (janela de teste): último controle a 12px da borda', Math.round(innerWidth - last.right) === 12, `${innerWidth - last.right}`);
}

async function languages() {
  __peers.at(-1).openNow(); await __until(() => typeof __cloud.listeners['members:K7M4PQ2A'] === 'function');
  __cloud.listeners['members:K7M4PQ2A'](__members({uid: 'u-luna', peerId: 'p-luna', nickname: 'Luna', online: true}));
  window.focoI18n.setLanguage('en-US'); await __sleep(60);
  const collapsedNow = document.body.classList.contains('sidebar-collapsed');
  const okSidebar = document.querySelector('#sidebarToggle').title === (collapsedNow ? 'Expand sidebar' : 'Collapse sidebar');
  const tabLabel = () => document.querySelector('#peopleTab').firstChild.nodeValue.trim();
  const okTabs = tabLabel() === 'People' && document.querySelector('#panelToggle').title === (document.body.classList.contains('panel-open') ? 'Hide panel' : 'Show panel');
  confirmRoomSwitch; const pending = (state.localStream = __stream(), confirmRoomSwitch('R4NK3D99')); await __sleep(60);
  const okConfirm = __text('#confirmTitle') === 'Switch rooms?' && __text('#confirmAccept') === 'End and switch';
  settleConfirm(false); await pending; state.localStream = null;
  window.focoI18n.setLanguage('fr-FR'); await __sleep(60);
  const okFr = tabLabel() === 'Personnes' && __text('#memberCount') === '2 participants';
  window.focoI18n.setLanguage('pt-BR'); await __sleep(60);
  __check('Rótulos dinâmicos do shell traduzidos ao trocar de idioma (en/fr) e de volta ao pt', okSidebar && okTabs && okConfirm && okFr && tabLabel() === 'Pessoas', `sidebar=${okSidebar} tabs=${okTabs} confirm=${okConfirm} fr=${okFr}`);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({show: false, width: 1440, height: 960, useContentSize: true, webPreferences: {partition: 'shell-fixture', contextIsolation: true, nodeIntegration: false, backgroundThrottling: false}});
  const rendererDir = path.join(__dirname, '..', 'renderer');
  const fixture = path.join(rendererDir, '.shell-smoke.html'), stubFile = path.join(rendererDir, '.shell-stubs.js');
  const run = fn => window.webContents.executeJavaScript(`(${fn.toString()})()`);
  // Wait until the page itself reports the new viewport instead of guessing a delay.
  const resize = async (width, height) => {
    window.setContentSize(width, height);
    for (let i = 0; i < 100; i++) {
      if (await window.webContents.executeJavaScript(`innerWidth === ${width} && innerHeight === ${height}`)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  };
  try {
    const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8')
      .replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/, '')
      .replace('<script src="firebase-client.bundle.js"></script>', '<script src=".shell-stubs.js"></script>');
    fs.writeFileSync(stubFile, stubs, 'utf8');
    fs.writeFileSync(fixture, html, 'utf8');
    await window.loadFile(fixture);
    await run(helpers);
    for (const step of [startupAndRooms, sidebar, enterRoom, panel, videoBefore]) await run(step);
    await resize(980, 720); await resize(1440, 960);
    await run(videoAfterResize);
    await resize(980, 720); await run(narrow); await resize(1440, 960);
    for (const step of [roomSwitch, titlebar, languages]) await run(step);
    const results = await window.webContents.executeJavaScript('window.__results');
    for (const {name, ok, detail} of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    const failed = results.filter(result => !result.ok);
    assert.equal(failed.length, 0, `${failed.length} shell scenario(s) failed.`);
    console.log(`shell passed: ${results.length} scenarios with stubbed auth, presence, chat and signaling.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const file of [fixture, stubFile]) { try { fs.unlinkSync(file); } catch {} }
    window.destroy();
    app.exit(process.exitCode||0);
  }
});
