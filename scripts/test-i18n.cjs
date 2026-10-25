const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createFixtureRenderer } = require('./fixture-renderer.cjs');
const {app, BrowserWindow} = require('electron');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({show:false, webPreferences:{partition:'i18n-fixture',contextIsolation:true, nodeIntegration:false, backgroundThrottling:false}});
  const rendererDir=createFixtureRenderer();
  const fixture=path.join(rendererDir,'.i18n-smoke.html');
  try {
    const html=fs.readFileSync(path.join(rendererDir,'index.html'),'utf8').replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/,'').replace(/\s*<script src="firebase-client\.bundle\.js"><\/script>/,'').replace(/\s*<script src="app\.bundle\.js"><\/script>/,'').replace('</body>','<script src="i18n.js"></script></body>');
    fs.writeFileSync(fixture,html,'utf8');
    await window.loadFile(fixture);
    const result = await window.webContents.executeJavaScript(`(async()=>{
      const wait=()=>new Promise(resolve=>setTimeout(resolve,25));
      const checks=[];
      window.focoI18n.setLanguage('en-US'); await wait();
      checks.push(document.querySelector('#settingsDialog h2').textContent==='Settings');
      checks.push(document.querySelector('#settingsDialog label[for="appLanguage"]').textContent==='Language');
      checks.push(document.querySelector('#shareLabel').textContent==='Share screen');
      checks.push(document.querySelector('#manageRoomButton').title==='Manage room');
      checks.push(document.querySelector('#homeCreateRoom').textContent.includes('Create room'));
      checks.push(document.querySelector('#appLanguage').value==='en-US');
      checks.push(window.focoI18n.translate('2 participantes')==='2 participants');
      checks.push(document.querySelector('#chatInput').placeholder==='Write a message…');
      checks.push(document.querySelector('#chatMessages .chat-empty').textContent==='No messages yet.');
      checks.push(document.querySelector('#listViewButton').getAttribute('aria-label')==='Focus view');
      checks.push(window.focoI18n.translate('Ninguém está transmitindo ainda')==='No one is sharing yet');
      checks.push(window.focoI18n.translate('AO VIVO')==='LIVE');
      checks.push(window.focoI18n.translate('Luna está transmitindo')==='Luna is sharing');
      checks.push(window.focoI18n.translate('Membro')==='Member');
      checks.push(window.focoI18n.translate('Novas mensagens')==='New messages');
      document.querySelector('#chatMessages').innerHTML='<span>Chat da sala</span><span data-no-translate>Salas</span>';
      for(let attempt=0;attempt<20&&document.querySelector('#chatMessages span:first-child').textContent!=='Room chat';attempt++)await wait();
      checks.push(document.querySelector('#chatMessages span:first-child').textContent==='Room chat');
      checks.push(document.querySelector('#chatMessages span:last-child').textContent==='Salas');
      window.focoI18n.setLanguage('es-ES'); await wait();
      checks.push(document.querySelector('#settingsDialog h2').textContent==='Configuración');
      checks.push(window.focoI18n.translate('2 participantes')==='2 participantes');
      checks.push(document.querySelector('#peopleTab').textContent==='Personas');
      checks.push(window.focoI18n.translate('Visualização em foco')==='Vista de enfoque');
      checks.push(window.focoI18n.translate('Compartilhando a janela do Foco')==='Compartiendo la ventana de Foco');
      checks.push(window.focoI18n.translate('Luna está transmitindo')==='Luna está transmitiendo');
      checks.push(window.focoI18n.translate('Moderador')==='Moderador');
      window.focoI18n.setLanguage('fr-FR'); await wait();
      checks.push(document.querySelector('#settingsDialog h2').textContent==='Paramètres');
      checks.push(window.focoI18n.translate('2 participantes')==='2 participants');
      checks.push(window.focoI18n.translate('Vídeo pausado')==='Vidéo en pause');
      checks.push(window.focoI18n.translate('Silenciar áudio')==='Couper le son');
      checks.push(window.focoI18n.translate('Luna está transmitindo')==='Luna partage son écran');
      checks.push(window.focoI18n.translate('Gerenciar participante')==='Gérer le participant');
      window.focoI18n.setLanguage('pt-BR'); await wait();
      checks.push(document.querySelector('#settingsDialog h2').textContent==='Configurações');
      checks.push(localStorage.getItem('foco.language')==='pt-BR');
      return {checks,chatLine:document.querySelector('#chatMessages span:first-child')?.textContent,homeCreate:document.querySelector('#homeCreateRoom').textContent};
    })()`);
    assert.equal(result.checks.every(Boolean), true, `Language smoke checks failed: ${JSON.stringify(result)}`);
    console.log(`i18n smoke passed: ${result.checks.length} assertions across pt-BR, en-US, es-ES and fr-FR.`);
  } catch (error) {
    console.error(error);
    process.exitCode=1;
  } finally {
    try{fs.unlinkSync(fixture);}catch{}
    window.destroy();
    app.exit(process.exitCode||0);
  }
});
