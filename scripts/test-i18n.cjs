const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {app, BrowserWindow} = require('electron');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({show:false, webPreferences:{contextIsolation:true, nodeIntegration:false}});
  const rendererDir=path.join(__dirname,'..','renderer');
  const fixture=path.join(rendererDir,'.i18n-smoke.html');
  try {
    const html=fs.readFileSync(path.join(rendererDir,'index.html'),'utf8').replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/,'').replace(/\s*<script src="firebase-client\.bundle\.js"><\/script>/,'').replace(/\s*<script src="app\.js"><\/script>/,'').replace('</body>','<script src="i18n.js"></script></body>');
    fs.writeFileSync(fixture,html,'utf8');
    await window.loadFile(fixture);
    const result = await window.webContents.executeJavaScript(`(async()=>{
      const wait=()=>new Promise(resolve=>setTimeout(resolve,25));
      const checks=[];
      window.focoI18n.setLanguage('en-US'); await wait();
      checks.push(document.querySelector('#settingsDialog h2').textContent==='Settings');
      checks.push(document.querySelector('#settingsDialog label[for="appLanguage"]').textContent==='LANGUAGE');
      checks.push(document.querySelector('#shareLabel').textContent==='Share screen');
      checks.push(document.querySelector('#manageRoomButton').title==='Manage room');
      checks.push(document.querySelector('#homeCreateRoom').textContent.includes('Create room'));
      checks.push(document.querySelector('#appLanguage').value==='en-US');
      checks.push(window.focoI18n.translate('2 participantes')==='2 participants');
      checks.push(document.querySelector('#chatInput').placeholder==='Write a message…');
      checks.push(document.querySelector('#chatMessages .chat-empty').textContent==='No messages yet.');
      document.querySelector('#chatMessages').innerHTML='<span>Chat da sala</span><span data-no-translate>Salas</span>'; await wait();
      checks.push(document.querySelector('#chatMessages span:first-child').textContent==='Room chat');
      checks.push(document.querySelector('#chatMessages span:last-child').textContent==='Salas');
      window.focoI18n.setLanguage('es-ES'); await wait();
      checks.push(document.querySelector('#settingsDialog h2').textContent==='Configuración');
      checks.push(window.focoI18n.translate('2 participantes')==='2 participantes');
      checks.push(document.querySelector('.chat-heading h3').textContent==='Chat de la sala');
      window.focoI18n.setLanguage('fr-FR'); await wait();
      checks.push(document.querySelector('#settingsDialog h2').textContent==='Paramètres');
      checks.push(window.focoI18n.translate('2 participantes')==='2 participants');
      window.focoI18n.setLanguage('pt-BR'); await wait();
      checks.push(document.querySelector('#settingsDialog h2').textContent==='Configurações');
      checks.push(localStorage.getItem('foco.language')==='pt-BR');
      return {checks,homeCreate:document.querySelector('#homeCreateRoom').textContent};
    })()`);
    assert.equal(result.checks.every(Boolean), true, `Language smoke checks failed: ${JSON.stringify(result)}`);
    console.log(`i18n smoke passed: ${result.checks.length} assertions across pt-BR, en-US, es-ES and fr-FR.`);
  } catch (error) {
    console.error(error);
    process.exitCode=1;
  } finally {
    try{fs.unlinkSync(fixture);}catch{}
    window.destroy();
    app.quit();
  }
});
