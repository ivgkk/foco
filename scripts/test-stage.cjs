const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');

// Isolated visual fixture: no Firebase listeners, room writes, PeerJS or real capture.
const stubs = `window.focoDesktop={listSources:async()=>[],resolveProcess:async()=>1,startAudioCapture:async()=>true,stopAudioCapture:async()=>true,setFullscreen:async active=>Boolean(active),getAppVersion:async()=>'test',writeClipboard:async()=>true,getUpdateStatus:async()=>({state:'unavailable',reason:'development'}),checkForUpdates:async()=>({}),getPendingInvite:async()=>'',onInvite:()=>()=>{},onAudioChunk:()=>()=>{},onUpdateStatus:()=>()=>{},platform:'win32'};
window.focoCloud={isConfigured:()=>true,onAuthChanged:()=>()=>{},exitRoom:async()=>{},updateRoomMember:async()=>{},cleanCode:value=>String(value||'').toUpperCase()};
window.Peer=function(){throw new Error('PeerJS is disabled in the stage fixture.');};`;

function setupFixture() {
  document.querySelector('#startupScreen').classList.add('is-done');
  document.querySelector('#authGate').hidden = true;
  document.body.classList.remove('no-room', 'panel-open');
  state.user = {uid: 'fixture-user'};
  state.activeRoom = 'fixture-only';
  state.roomConnected = true;
  state.roomsLoaded = true;
  state.membersLoaded = true;
  state.chatLoaded = true;
  state.peer = {id: 'fixture-local', open: true};
  state.currentRoomData = {ownerUid: 'fixture-user'};
  state.profile.nickname = 'Você';
  document.querySelector('#roomName').textContent = 'Sala de prévia';
  document.querySelector('#shareButton').disabled = false;
  document.querySelector('#inviteButton').disabled = false;
  const colors = ['#866ce2', '#247fa0', '#b96b63', '#54835f', '#b98535', '#605db5'];
  window.fixtureStreams = Array.from({length: 6}, (_, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = i % 3 === 1 ? 640 : 960;
    canvas.height = i % 3 === 1 ? 480 : 540;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colors[i]; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 58px sans-serif';
    ctx.fillText(['DESIGN', 'CÓDIGO', 'PLANILHA', 'PAINEL', 'APRESENTAÇÃO', 'MONITOR'][i], 52, 100);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 12; ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
    return canvas.captureStream(5);
  });
  renderStreams();
}

function setFixtureCase(name) {
  state.streams.clear();
  state.members.clear();
  renderStreams();
  state.focusedId = null;
  state.localFocusChosen = false;
  const counts = {empty: 0, pending: 0, one: 1, two: 2, three: 3, six: 6, grid: 6, local: 1, mirror: 1, mixed: 2, failed: 1};
  const count = counts[name];
  for (let i = 0; i < count; i++) {
    const local = (name === 'local' || name === 'mirror') || (name === 'mixed' && i === 0);
    const id = local ? 'fixture-local' : `fixture-${i}`;
    state.streams.set(id, {
      stream: window.fixtureStreams[i], name: local ? 'Você' : ['Luna', 'Caio', 'Bia', 'Dani', 'Noah', 'Iris'][i],
      uid: local ? 'fixture-user' : `fixture-u${i}`, local, color: '#866ce2',
      appName: name === 'mirror' ? 'Foco' : ['Figma', 'VS Code', 'Planilha', 'Dashboard', 'Slides', 'Monitor'][i],
      sourceName: name === 'mirror' ? 'Foco' : 'Janela de exemplo', sourceType: 'Janela', quality: '1280×720 · 30 FPS'
    });
  }
  if (name === 'pending') state.members.set('fixture-pending', {peerId: 'fixture-pending', nickname: 'Luna', streaming: true, online: true, color: '#866ce2'});
  renderStreams();
  setDisplayMode(name === 'grid' ? 'grid' : 'focus');
  if (name === 'failed') setTileFailure(state.streamTiles.get('fixture-0'), 'Ainda não chegou imagem. Peça para compartilhar novamente.', false);
  return {count: document.querySelector('#streamGrid').dataset.count, localOnly: document.querySelector('#streamGrid').dataset.localOnly};
}

function geometry() {
  const stage = document.querySelector('#streamGrid');
  const cards = [...stage.querySelectorAll('.stream-card')];
  const rect = element => {const r = element.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height};};
  return {viewport: {width: innerWidth, height: innerHeight}, stage: rect(stage), orientation: stage.dataset.orientation,
    documentOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
    cards: cards.map(card => ({id: card.dataset.stream, focused: card.classList.contains('is-focused'), rect: rect(card), visual: rect(card.querySelector('.stream-visual'))}))};
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({show: true, width: 1280, height: 800, webPreferences: {partition: 'stage-fixture', contextIsolation: true, nodeIntegration: false, backgroundThrottling: false}});
  const dir = path.join(__dirname, '..', 'renderer');
  const fixture = path.join(dir, '.stage-smoke.html');
  const stubFile = path.join(dir, '.stage-stubs.js');
  const output = path.join(__dirname, '..', 'artifacts', 'stage-phase4');
  try {
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
      .replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/, '')
      .replace('<script src="firebase-client.bundle.js"></script>', '<script src=".stage-stubs.js"></script>');
    fs.writeFileSync(stubFile, stubs, 'utf8'); fs.writeFileSync(fixture, html, 'utf8');
    await win.loadFile(fixture);
    await win.webContents.executeJavaScript(`(${setupFixture.toString()})()`);
    fs.mkdirSync(output, {recursive: true});
    const cases = [
      ['empty', 980, 720], ['one', 980, 720], ['two', 980, 720], ['three', 980, 720],
      ['empty', 1280, 800], ['one', 1280, 800], ['two', 1280, 800], ['three', 1280, 800],
      ['one', 1440, 960], ['six', 1440, 960], ['grid', 1440, 960],
      ['one', 1920, 1032], ['two', 1920, 1032], ['three', 1920, 1032],
      ['local', 1280, 800], ['mirror', 1280, 800], ['mixed', 1280, 800], ['pending', 1280, 800],
      ['one', 1280, 800, 'pt-BR', 'panel-closed'], ['one', 1280, 800, 'pt-BR', 'sidebar-collapsed'],
      ['three', 1280, 800, 'en-US'], ['three', 1280, 800, 'es-ES'], ['three', 1280, 800, 'fr-FR'],
      ['failed', 1280, 800]
    ];
    const results = [];
    for (const [name, width, height, locale = 'pt-BR', layout = 'default'] of cases) {
      win.setContentSize(width, height);
      await win.webContents.executeJavaScript(`(${setFixtureCase.toString()})(${JSON.stringify(name)})`);
      await win.webContents.executeJavaScript(`if(window.focoI18n.getLanguage()!==${JSON.stringify(locale)})window.focoI18n.setLanguage(${JSON.stringify(locale)});applyShellLayout();document.body.classList.toggle('panel-open',${layout === 'panel-closed' ? 'false' : 'document.body.classList.contains("panel-open")'});document.body.classList.toggle('sidebar-collapsed',${layout === 'sidebar-collapsed' ? 'true' : 'document.body.classList.contains("sidebar-collapsed")'});document.querySelector('#toast').classList.remove('show');`);
      await new Promise(resolve => setTimeout(resolve, 400));
      const measured = await win.webContents.executeJavaScript(`(${geometry.toString()})()`);
      assert.equal(measured.documentOverflow, false, `${name} ${width}×${height} overflows the document`);
      for (const card of measured.cards) {
        assert(card.rect.width > 100 && card.rect.height > 90, `${name} has an unusable card`);
        assert(card.rect.x >= 0 && card.rect.y >= 0 && card.rect.x + card.rect.width <= width + 1 && card.rect.y + card.rect.height <= height + 1, `${name} has a clipped card`);
      }
      if (name === 'one') assert(measured.cards[0].rect.width >= measured.stage.width * .9 && measured.cards[0].visual.height >= measured.stage.height * .7, 'single stream must dominate the stage');
      if (name === 'two' || name === 'mixed') {
        const [first, second] = measured.cards;
        if (measured.orientation === 'wide') assert(Math.abs(first.rect.y - second.rect.y) < 2 && Math.abs(first.rect.x - second.rect.x) > 100, 'wide pair must be side by side');
        else assert(Math.abs(first.rect.x - second.rect.x) < 2 && Math.abs(first.rect.y - second.rect.y) > 100, 'tall pair must be stacked');
        if (name === 'mixed') assert(second.focused && second.rect.y < first.rect.y, 'remote stream must appear above local preview');
      }
      if (name === 'three') assert(measured.cards.filter(card => card.focused).length === 1 && measured.cards.find(card => card.focused).rect.height >= measured.stage.height * .6, 'focused stream must dominate filmstrip');
      if (name === 'grid' && width === 1440) assert(Math.abs(measured.cards[0].rect.y - measured.cards[1].rect.y) < 2 && measured.cards[2].rect.y > measured.cards[0].rect.y, 'six-stream grid must use two columns');
      if (name === 'local') assert(measured.cards[0].rect.height < measured.stage.height * .8, 'local preview must be compact');
      const file = `${name}-${width}x${height}${locale === 'pt-BR' ? '' : '-' + locale}${layout === 'default' ? '' : '-' + layout}.png`;
      fs.writeFileSync(path.join(output, file), (await win.webContents.capturePage()).toPNG());
      results.push({file, ...measured});
      console.log(`PASS  ${file}  stage ${Math.round(measured.stage.width)}×${Math.round(measured.stage.height)}  ${measured.orientation}`);
    }
    win.maximize();
    await win.webContents.executeJavaScript(`(${setFixtureCase.toString()})('one');window.focoI18n.setLanguage('pt-BR');applyShellLayout();document.querySelector('#toast').classList.remove('show');`);
    await new Promise(resolve => setTimeout(resolve, 400));
    const maximized = await win.webContents.executeJavaScript(`(${geometry.toString()})()`);
    assert.equal(maximized.documentOverflow, false, 'maximized window overflows');
    fs.writeFileSync(path.join(output, 'one-maximized.png'), (await win.webContents.capturePage()).toPNG());
    results.push({file: 'one-maximized.png', ...maximized});
    console.log(`PASS  one-maximized.png  stage ${Math.round(maximized.stage.width)}×${Math.round(maximized.stage.height)}`);
    fs.writeFileSync(path.join(output, 'geometry.json'), JSON.stringify(results, null, 2));
    console.log(`stage captures: ${results.length} synthetic cases in ${output}`);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    try {await win.webContents.executeJavaScript(`window.fixtureStreams?.forEach(stream=>stream.getTracks().forEach(track=>track.stop()));state.streams.clear();renderStreams();`);} catch {}
    for (const file of [fixture, stubFile]) {try {fs.unlinkSync(file);} catch {}}
    win.destroy(); app.quit();
  }
});
