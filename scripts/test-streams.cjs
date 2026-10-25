const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createFixtureRenderer } = require('./fixture-renderer.cjs');
const {app, BrowserWindow} = require('electron');

// Stream tile reconciliation tests. They run the real renderer (index.html + app.js) with the
// native bridge, Firebase and PeerJS replaced by stubs, fake PeerJS calls and synthetic canvas
// streams. No network, credentials or second machine are needed — and none of this proves that
// a real P2P transmission works; it checks how the UI keeps, updates and releases media.

const stubs = `window.focoDesktop={listSources:async()=>[],resolveProcess:async()=>1,startAudioCapture:async()=>true,stopAudioCapture:async()=>true,setFullscreen:async active=>Boolean(active),getAppVersion:async()=>'test',writeClipboard:async()=>true,getUpdateStatus:async()=>({state:'unavailable',reason:'development'}),checkForUpdates:async()=>({}),getPendingInvite:async()=>'',onInvite:()=>()=>{},onAudioChunk:()=>()=>{},onUpdateStatus:()=>()=>{},platform:'win32'};
window.focoCloud={isConfigured:()=>true,onAuthChanged:()=>()=>{},exitRoom:async()=>{},updateRoomMember:async()=>{},verifyRoomPeer:async(_room,uid,peerId)=>({uid,peerId,canStream:true}),cleanCode:value=>String(value||'').toUpperCase()};
window.Peer=function(){throw new Error('PeerJS is not available in stream tests.');};`;

async function scenarios() {
  window.focoI18n.setLanguage('pt-BR');
  const results = [];
  const check = (name, ok, detail = '') => results.push({name, ok: Boolean(ok), detail: String(detail)});
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (predicate, timeout = 4000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (predicate()) return true; await sleep(50); } return predicate(); };
  // Tiles register every media listener with an AbortSignal; count the ones still active.
  const signals = [];
  const addEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) { if (options && typeof options === 'object' && options.signal) signals.push(options.signal); return addEventListener.call(this, type, listener, options); };
  const activeListeners = () => signals.filter(signal => !signal.aborted).length;
  const tracks = [];
  const makeStream = ({fps = 20} = {}) => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext('2d'); let frame = 0;
    const draw = () => { context.fillStyle = `hsl(${(frame++ * 9) % 360} 60% 40%)`; context.fillRect(0, 0, 320, 180); };
    draw(); setInterval(draw, 1000 / fps);
    const stream = canvas.captureStream(fps);
    tracks.push(...stream.getTracks());
    return stream;
  };
  // A track that produces no frame until paint() is called (a canvas track emits one at start).
  const makeSilentStream = () => {
    const generator = new MediaStreamTrackGenerator({kind: 'video'}), writer = generator.writable.getWriter();
    const canvas = new OffscreenCanvas(320, 180), context = canvas.getContext('2d');
    const stream = new MediaStream([generator]); let timestamp = 0;
    stream.paint = () => { context.fillStyle = '#4a6'; context.fillRect(0, 0, 320, 180); setInterval(() => writer.write(new VideoFrame(canvas, {timestamp: timestamp += 50000})), 50); };
    tracks.push(generator);
    return stream;
  };
  class FakeCall {
    constructor(peer, metadata) {
      this.peer = peer; this.metadata = metadata; this.handlers = {}; this.bytes = 0;
      this.peerConnection = new EventTarget(); this.peerConnection.connectionState = 'connected';
      this.peerConnection.getStats = async () => new Map([['video', {type: 'inbound-rtp', kind: 'video', id: 'video', bytesReceived: this.bytes += 250000, frameWidth: 1280, frameHeight: 720, framesPerSecond: 30, timestamp: performance.now()}]]);
    }
    answer() {}
    on(type, handler) { (this.handlers[type] ||= []).push(handler); }
    emit(type, ...args) { for (const handler of this.handlers[type] || []) handler(...args); }
    close() { if (this.closed) return; this.closed = true; this.emit('close'); }
  }
  const lunaMeta = {name: 'Luna', ownerId: 'p-luna', userId: 'u-luna', appName: 'VALORANT', sourceType: 'Janela', quality: '1080p · 60 FPS'};
  const member = (uid, peerId, extra = {}) => ({uid, peerId, nickname: uid.slice(2), username: uid.slice(2), color: '#f2769e', status: 'Disponível', online: true, streaming: true, ...extra});
  const members = (...list) => Object.fromEntries([['zz-me', {uid: 'zz-me', peerId: 'p-me', nickname: 'Eu', online: true, role: 'owner'}], ...list.map(item => [item.uid, item])]);
  const enterRoom = () => {
    state.user = {uid: 'zz-me'}; state.profile = {...state.profile, nickname: 'Eu'};
    state.activeRoom = 'ROOM1'; state.roomConnected = true; state.currentRoomData = {code: 'ROOM1', ownerUid: 'zz-me'}; state.isHost = true;
    state.peer = {id: 'p-me', open: true, destroy() {}, connect() { return {on() {}, send() {}, close() {}}; }, call() { return null; }};
    document.body.classList.remove('no-room');
  };
  const tile = id => state.streamTiles.get(id);
  const videoTime = id => tile(id)?.video.currentTime ?? -1;
  const cards = () => [...$('#streamGrid').children];
  const live = id => until(() => tile(id)?.mediaState === 'live');

  try {
  enterRoom();
  let luna = member('u-luna', 'p-luna');
  syncRoomMembers(members(luna));
  const pending = state.pendingTiles.get('u-luna');
  check('Anúncio de presença vira card pendente "announced", sem badge AO VIVO', pending?.dataset.mediaState === 'announced' && !pending.querySelector('.live-badge'), pending?.dataset.mediaState);
  const callA = new FakeCall('p-luna', lunaMeta);
  await handleCall(callA); renderStreams();
  check('Chamada recebida sem mídia vira "connecting"', state.pendingTiles.get('u-luna')?.dataset.mediaState === 'connecting', state.pendingTiles.get('u-luna')?.dataset.mediaState);
  const s1 = makeStream();
  callA.emit('stream', s1);
  const lunaTile = tile('p-luna'), video = lunaTile?.video;
  check('MediaStream recebido cria um tile em "waiting" com AO VIVO oculto', lunaTile?.mediaState === 'waiting' && getComputedStyle(lunaTile.card.querySelector('.live-badge')).display === 'none', lunaTile?.mediaState);
  check('Card pendente é substituído pelo tile de mídia', !state.pendingTiles.has('u-luna') && cards().length === 1);
  check('Primeiro frame confirma "live" e mostra AO VIVO', await live('p-luna') && getComputedStyle(lunaTile.card.querySelector('.live-badge')).display !== 'none', lunaTile.mediaState);
  const t0 = videoTime('p-luna'); await sleep(500);
  check('O vídeo está avançando', videoTime('p-luna') > t0, `${t0.toFixed(2)} → ${videoTime('p-luna').toFixed(2)}`);

  // 1. Repeated renders
  for (let i = 0; i < 20; i++) renderStreams();
  check('1. Renderizar o mesmo stream 20x mantém o mesmo nó de vídeo', tile('p-luna').video === video && video.srcObject === s1 && cards().length === 1 && document.querySelectorAll('#streamGrid video').length === 1);
  // 2. Rename
  luna = {...luna, nickname: 'Luna Nova'}; syncRoomMembers(members(luna));
  check('2. Alterar o nome não recria o vídeo', tile('p-luna').video === video && tile('p-luna').name.textContent.includes('Luna Nova'), tile('p-luna').name.textContent);
  // 3. Avatar
  luna = {...luna, color: '#43c59e', photo: 'data:image/png;base64,iVBORw0KGgo='}; syncRoomMembers(members(luna));
  check('3. Alterar o avatar não recria o vídeo', tile('p-luna').video === video && tile('p-luna').avatar.getAttribute('style').includes('url('), tile('p-luna').avatar.getAttribute('style'));
  // 4 / 5. Another participant joins and leaves
  let before = videoTime('p-luna');
  syncRoomMembers(members(luna, member('u-caio', 'p-caio', {streaming: false}))); await sleep(300);
  check('4. Entrada de outro participante não reinicia o stream existente', tile('p-luna').video === video && videoTime('p-luna') > before && video.srcObject === s1);
  before = videoTime('p-luna');
  syncRoomMembers(members(luna)); await sleep(300);
  check('5. Saída de outro participante não reinicia o stream existente', tile('p-luna').video === video && videoTime('p-luna') > before && video.srcObject === s1);
  // 6. Volume and mute
  const slider = tile('p-luna').volume; slider.value = '30'; slider.dispatchEvent(new Event('input', {bubbles: true}));
  tile('p-luna').menu.querySelector('[data-action="mute"]').click();
  for (let i = 0; i < 5; i++) { luna = {...luna, status: 'Status ' + i}; syncRoomMembers(members(luna)); }
  renderStreams();
  check('6. Volume e mudo sobrevivem às atualizações', Math.abs(video.volume - .3) < .001 && video.muted && slider.value === '30' && tile('p-luna').volumeLabel.textContent === '30%' && tile('p-luna').menu.querySelector('[data-action="mute"] span').textContent === 'Ativar áudio', `volume=${video.volume} muted=${video.muted}`);
  // 7. Open menu
  tile('p-luna').more.click();
  luna = {...luna, nickname: 'Luna'}; syncRoomMembers(members(luna)); renderStreams();
  check('7. Menu aberto não fecha por atualização irrelevante', !tile('p-luna').menu.hidden && tile('p-luna').more.getAttribute('aria-expanded') === 'true');
  tile('p-luna').more.click();
  // 12. Quality updates
  await sampleStreamQuality('p-luna', state.streams.get('p-luna')); await sleep(30); await sampleStreamQuality('p-luna', state.streams.get('p-luna'));
  check('12. Atualizações de qualidade não recriam o vídeo', tile('p-luna').video === video && tile('p-luna').quality.textContent === '1280×720 · 30 FPS', tile('p-luna').quality.textContent);
  // Temporary interruption from the real connection state of the call
  callA.peerConnection.connectionState = 'disconnected'; callA.peerConnection.dispatchEvent(new Event('connectionstatechange'));
  const stalled = tile('p-luna').mediaState === 'stalled' && !tile('p-luna').status.hidden;
  callA.peerConnection.connectionState = 'connected'; callA.peerConnection.dispatchEvent(new Event('connectionstatechange'));
  check('Conexão "disconnected" marca "stalled" e volta a "live" ao reconectar', stalled && tile('p-luna').mediaState === 'live' && tile('p-luna').status.hidden);
  // This renderer-only suite stubs the DOM API; test:fullscreen exercises real Electron fullscreen.
  let fixtureFullscreen=null;
  Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>fixtureFullscreen});
  Element.prototype.requestFullscreen=async function(){fixtureFullscreen=this;document.dispatchEvent(new Event('fullscreenchange'));};
  document.exitFullscreen=async function(){fixtureFullscreen=null;document.dispatchEvent(new Event('fullscreenchange'));};
  // 11. Expanded and theater
  const card = tile('p-luna').card;
  setExpandedMode(card); renderStreams();
  const expanded = card.classList.contains('expanded') && state.expandedId === 'p-luna' && tile('p-luna').expand.querySelector('span').textContent === 'Voltar';
  setExpandedMode(card);
  await setTheaterMode(card); renderStreams();
  const theater = card.classList.contains('theater') && document.body.classList.contains('theater-active') && tile('p-luna').fullscreen.querySelector('span').textContent === 'Sair da tela cheia';
  await setTheaterMode(card);
  check('11. Modo ampliado e teatro continuam funcionando sem recriar o vídeo', expanded && theater && !card.classList.contains('theater') && !card.classList.contains('expanded') && tile('p-luna').video === video, `expanded=${expanded} theater=${theater}`);
  // 10. Reconnection: a newer call replaces the old one; late events of the old call are ignored
  const callB = new FakeCall('p-luna', lunaMeta), s2 = makeStream();
  await handleCall(callB); callB.emit('stream', s2);
  const replaced = tile('p-luna').video === video && video.srcObject === s2;
  callA.emit('stream', s1); callA.close();
  check('10. Reconexão: eventos atrasados da chamada antiga não sobrescrevem a nova mídia', replaced && state.streams.get('p-luna')?.stream === s2 && video.srcObject === s2 && state.incomingCalls.get('p-luna') === callB && await live('p-luna'), `srcObject é s2: ${video.srcObject === s2}`);
  check('Volume do participante é preservado na reconexão dentro da sala', Math.abs(video.volume - .3) < .001 && video.muted);
  // 8. Removal
  const removedTile = tile('p-luna');
  callB.close();
  // Presence still says Luna is streaming, so the slot falls back to a pending card, never to AO VIVO.
  check('8. Remover o stream limpa elementos e recursos locais', removedTile && !state.streamTiles.has('p-luna') && !document.contains(removedTile.card) && removedTile.video.srcObject === null && removedTile.mediaAbort === null && removedTile.noFrameTimer === null && cards().length === 1 && cards()[0].classList.contains('pending-stream') && document.querySelectorAll('#streamGrid video').length === 0);
  check('16a. Remover o tile não encerra as tracks do MediaStream', s2.getTracks().every(track => track.readyState === 'live'));
  // 9. Re-adding an ended transmission creates a new instance
  const callC = new FakeCall('p-luna', lunaMeta), s3 = makeStream();
  await handleCall(callC); callC.emit('stream', s3);
  check('9. Adicionar novamente cria uma nova instância de tile e vídeo', tile('p-luna') && tile('p-luna') !== removedTile && tile('p-luna').video !== video && tile('p-luna').video.srcObject === s3 && await live('p-luna'));
  // 15. Video keeps playing through a burst of interface updates
  const burstVideo = tile('p-luna').video; before = burstVideo.currentTime;
  for (let i = 0; i < 40; i++) { syncRoomMembers(members({...luna, status: 'burst ' + i}, member('u-x' + (i % 3), 'p-x' + (i % 3), {streaming: false}))); await sleep(20); }
  check('15. O vídeo continua avançando durante 40 atualizações de interface', tile('p-luna').video === burstVideo && burstVideo.currentTime > before + .4 && !burstVideo.paused, `${before.toFixed(2)} → ${burstVideo.currentTime.toFixed(2)}`);
  syncRoomMembers(members(luna));

  // Real WebRTC media path inside this process (two RTCPeerConnections, no PeerJS, no network):
  // the remote track's own lifecycle drives waiting → live → stalled → live.
  const sender = new RTCPeerConnection(), receiver = new RTCPeerConnection();
  sender.onicecandidate = event => event.candidate && receiver.addIceCandidate(event.candidate);
  receiver.onicecandidate = event => event.candidate && sender.addIceCandidate(event.candidate);
  const source = makeStream(); const sourceTrack = source.getVideoTracks()[0];
  const rtpSender = sender.addTrack(sourceTrack, source);
  const received = new Promise(resolve => { receiver.ontrack = event => resolve(event.streams[0]); });
  const offer = await sender.createOffer(); await sender.setLocalDescription(offer); await receiver.setRemoteDescription(offer);
  const answer = await receiver.createAnswer(); await receiver.setLocalDescription(answer); await sender.setRemoteDescription(answer);
  const remoteStream = await received;
  syncRoomMembers(members(luna, member('u-rtc', 'p-rtc')));
  const callR = new FakeCall('p-rtc', {name: 'Loopback', ownerId: 'p-rtc', userId: 'u-rtc'}); callR.peerConnection = receiver;
  await handleCall(callR); callR.emit('stream', remoteStream);
  const rtcWaiting = tile('p-rtc')?.mediaState === 'waiting';
  const rtcLive = await until(() => tile('p-rtc')?.mediaState === 'live', 8000);
  const rtcBefore = videoTime('p-rtc'); await sleep(600);
  check('WebRTC real (loopback): "waiting" até o primeiro frame decodificado, depois "live" e avançando', rtcWaiting && rtcLive && videoTime('p-rtc') > rtcBefore, `${tile('p-rtc')?.mediaState} ${rtcBefore.toFixed(2)} → ${videoTime('p-rtc').toFixed(2)}`);
  await rtpSender.replaceTrack(null);
  const rtcStalled = await until(() => tile('p-rtc')?.mediaState === 'stalled', 8000);
  await rtpSender.replaceTrack(sourceTrack);
  const rtcRecovered = await until(() => tile('p-rtc')?.mediaState === 'live', 8000);
  check('WebRTC real: envio interrompido dispara "mute" na track remota ("stalled") e retoma em "live"', rtcStalled && rtcRecovered, `stalled=${rtcStalled} recovered=${rtcRecovered}`);
  callR.close(); sender.close(); receiver.close();
  syncRoomMembers(members(luna));

  // Bounded "no image" state that recovers when a frame finally arrives
  syncRoomMembers(members(luna, member('u-bia', 'p-bia')));
  const callD = new FakeCall('p-bia', {name: 'Bia', ownerId: 'p-bia', userId: 'u-bia'}), silent = makeSilentStream();
  await handleCall(callD); callD.emit('stream', silent);
  await sleep(5400);
  const failed = tile('p-bia')?.mediaState === 'failed' && tile('p-bia').card.querySelector('.stream-error');
  silent.paint(); await until(() => tile('p-bia')?.mediaState === 'live', 3000);
  check('Sem imagem por 5 s: estado "failed" limitado, que se recupera quando chega o primeiro frame', failed && tile('p-bia').mediaState === 'live' && !tile('p-bia').card.querySelector('.stream-error'), tile('p-bia')?.mediaState);
  // Ended tracks
  silent.getVideoTracks()[0].stop(); silent.getVideoTracks()[0].dispatchEvent(new Event('ended'));
  check('Track encerrada marca o tile como "ended"', tile('p-bia').mediaState === 'ended');
  callD.close();

  // Local preview
  const local = makeStream();
  state.localStream = local; state.streams.set('p-me', {stream: local, name: 'Eu', uid: 'zz-me', local: true, appName: 'Code', sourceType: 'Janela', quality: '1280×720 · 60 FPS'}); renderStreams();
  const localTile = tile('p-me');
  check('Prévia local fica muda e oferece "Parar transmissão" em vez de mudo', localTile.video.muted && localTile.menu.querySelector('[data-action="stop"]') && !localTile.menu.querySelector('[data-action="mute"]') && await live('p-me'));
  check('Transmissão remota continua em foco quando a própria transmissão começa', state.focusedId === 'p-luna' && !localTile.card.classList.contains('is-focused'));
  focusStream('p-me');
  check('Usuário pode abrir a prévia local sem recriar vídeos', state.focusedId === 'p-me' && tile('p-luna').video === burstVideo && localTile.video.srcObject === local);
  state.streams.delete('p-me'); state.localStream = null; renderStreams();
  check('16b. Remover a prévia local não encerra a captura (responsabilidade de stopSharing)', !state.streamTiles.has('p-me') && local.getTracks().every(track => track.readyState === 'live'));

  // Language change keeps the same media elements
  const languageVideo = tile('p-luna').video;
  syncRoomMembers(members(luna, member('u-ana', 'p-ana')));
  window.focoI18n.setLanguage('en-US'); await sleep(50); renderStreams();
  const translated = state.pendingTiles.get('u-ana')?.querySelector('.pending-stream-message small').textContent;
  window.focoI18n.setLanguage('pt-BR'); await sleep(50);
  syncRoomMembers(members(luna));
  check('Troca de idioma traduz os tiles sem recriar o vídeo', tile('p-luna').video === languageVideo && translated === 'Connecting to video…', translated);

  // Phase 4 stage: layout switches only change classes and order, never media ownership.
  check('Stage com um stream usa foco por padrão', $('#streamGrid').dataset.count === '1' && state.focusedId === 'p-luna' && tile('p-luna').card.classList.contains('is-focused'));
  const extra = [member('u-bia', 'p-bia'), member('u-caio', 'p-caio'), member('u-dani', 'p-dani')];
  const extraCalls = [];
  for (const person of extra.slice(0, 2)) {
    syncRoomMembers(members(luna, ...extra.slice(0, extraCalls.length + 1)));
    const call = new FakeCall(person.peerId, {name: person.nickname, ownerId: person.peerId, userId: person.uid});
    extraCalls.push(call); await handleCall(call); call.emit('stream', makeStream());
    await live(person.peerId);
    const expected = extraCalls.length + 1;
    check(`Stage com ${expected} streams mantém o foco e os vídeos`, $('#streamGrid').dataset.count === String(expected) && state.focusedId === 'p-luna' && tile('p-luna').video === languageVideo && [...state.streamTiles.values()].every(item => item.video.srcObject === state.streams.get(item.id)?.stream));
  }
  const biaVideo = tile('p-bia').video, caioVideo = tile('p-caio').video;
  tile('p-bia').card.click();
  check('Clicar no filmstrip troca o foco sem mover ou recriar vídeos', state.focusedId === 'p-bia' && tile('p-bia').card.classList.contains('is-focused') && tile('p-bia').video === biaVideo && tile('p-caio').video === caioVideo && cards()[0] === tile('p-luna').card);
  $('#gridViewButton').click();
  check('Grade adaptativa preserva o foco e os nós de vídeo', state.displayMode === 'grid' && $('#streamGrid').classList.contains('grid-view') && $('#gridViewButton').getAttribute('aria-pressed') === 'true' && tile('p-bia').video === biaVideo);
  $('#listViewButton').click();
  check('Voltar do modo grade restaura Focus + Filmstrip', state.displayMode === 'focus' && state.focusedId === 'p-bia' && !$('#streamGrid').classList.contains('grid-view') && tile('p-bia').video === biaVideo);
  const arrow = key => document.body.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
  arrow('ArrowRight');
  check('Seta alterna foco sem reconectar', state.focusedId === 'p-caio' && tile('p-caio').video === caioVideo && state.incomingCalls.get('p-caio') === extraCalls[1]);
  const chat = $('#chatInput'); chat.disabled = false; chat.focus();
  chat.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
  chat.dispatchEvent(new KeyboardEvent('keydown', {key: 'm', bubbles: true}));
  check('Atalhos não atuam durante digitação no chat', state.focusedId === 'p-caio' && !caioVideo.muted);
  chat.blur(); arrow('m');
  check('M não oferece mudo para stream somente com vídeo', !caioVideo.muted && tile('p-caio').video === caioVideo && tile('p-caio').volume.parentElement.hidden && tile('p-caio').menu.querySelector('[data-action="mute"]').hidden);
  arrow('f');
  const shortcutFullscreen = state.theaterId === 'p-caio' && tile('p-caio').card.classList.contains('theater');
  arrow('Escape');
  check('F abre tela cheia e Esc sai sem recriar vídeo', shortcutFullscreen && state.theaterId === null && tile('p-caio').video === caioVideo);
  syncRoomMembers(members(luna, ...extra));
  const newCall = new FakeCall('p-dani', {name: 'Dani', ownerId: 'p-dani', userId: 'u-dani'}); extraCalls.push(newCall); await handleCall(newCall); newCall.emit('stream', makeStream());
  check('Novo stream mantém o foco existente', $('#streamGrid').dataset.count === '4' && state.focusedId === 'p-caio');
  extraCalls[1].close();
  check('Fim do stream focado escolhe outro stream válido', state.focusedId !== 'p-caio' && state.streams.has(state.focusedId) && !state.streamTiles.has('p-caio'));
  extraCalls[0].close(); newCall.close();
  syncRoomMembers(members(luna));

  // 13. Leaving the room
  disconnectRoom(false);
  check('13. Sair da sala limpa tiles, cards pendentes e preferências da sala', state.streamTiles.size === 0 && state.pendingTiles.size === 0 && state.playbackPrefs.size === 0 && cards().length === 1 && cards()[0].classList.contains('streams-empty') && document.querySelectorAll('#streamGrid video').length === 0);

  // 14. Repeated create/remove cycles do not accumulate listeners, timers or nodes
  enterRoom(); syncRoomMembers(members(luna));
  const cycled = [];
  for (let i = 0; i < 25; i++) {
    const call = new FakeCall('p-luna', lunaMeta); await handleCall(call); call.emit('stream', makeStream({fps: 5}));
    cycled.push(tile('p-luna')); renderStreams(); call.close();
  }
  check('14. 25 ciclos de criar/remover não acumulam listeners, timers nem nós', state.streamTiles.size === 0 && activeListeners() === 0 && cycled.every(item => item.noFrameTimer === null && item.mediaAbort === null && item.video.srcObject === null) && document.querySelectorAll('#streamGrid video').length === 0, `listeners ativos=${activeListeners()}`);
  disconnectRoom(false);
  const stoppedOnPurpose = silent.getVideoTracks();
  check('16. Nenhuma operação visual encerrou tracks de mídia indevidamente', tracks.filter(track => !stoppedOnPurpose.includes(track)).every(track => track.readyState === 'live'), `${tracks.length} tracks sintéticas`);
  } catch (error) {
    check('Roteiro interrompido por exceção', false, error.message);
  }
  EventTarget.prototype.addEventListener = addEventListener;
  return results;
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({show: false, webPreferences: {partition: 'streams-fixture', contextIsolation: true, nodeIntegration: false, backgroundThrottling: false}});
  const rendererDir = createFixtureRenderer();
  const fixture = path.join(rendererDir, '.streams-smoke.html');
  const stubFile = path.join(rendererDir, '.streams-stubs.js');
  try {
    const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8')
      .replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/, '')
      .replace('<script src="firebase-client.bundle.js"></script>', '<script src=".streams-stubs.js"></script>');
    fs.writeFileSync(stubFile, stubs, 'utf8');
    fs.writeFileSync(fixture, html, 'utf8');
    await window.loadFile(fixture);
    const results = await window.webContents.executeJavaScript(`(${scenarios.toString()})()`);
    for (const {name, ok, detail} of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    const failed = results.filter(result => !result.ok);
    assert.equal(failed.length, 0, `${failed.length} stream scenario(s) failed.`);
    console.log(`stream tiles passed: ${results.length} scenarios with synthetic streams, a WebRTC loopback and fake PeerJS calls.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const file of [fixture, stubFile]) { try { fs.unlinkSync(file); } catch {} }
    window.destroy();
    app.exit(process.exitCode||0);
  }
});
