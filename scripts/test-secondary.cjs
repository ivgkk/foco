const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');

// This fixture replaces Firebase, PeerJS and desktop APIs before app.js loads.
const stubs = `(() => {
  const calls = []; let profile = null;
  const listeners = {};
  window.__cloud = {calls, listeners, setProfile(value) { profile = value; }, loginGate: null, registerGate: null, saveGate: null, error: null};
  const record = (name, ...args) => { calls.push({name, args}); if (window.__cloud.error === name) throw Object.assign(new Error('Mock failure: ' + name), {code: 'auth/network-request-failed'}); };
  window.focoCloud = {
    isConfigured: () => true, cleanCode: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
    onAuthChanged: callback => { listeners.auth = callback; return () => {}; },
    getProfile: async () => profile, watchUserRooms: async callback => { listeners.rooms = callback; return () => {}; },
    login: async (...args) => { record('login', ...args); if (window.__cloud.loginGate) await window.__cloud.loginGate; },
    register: async (...args) => { record('register', ...args); if (window.__cloud.registerGate) await window.__cloud.registerGate; },
    saveProfile: async value => { record('saveProfile', value); if (window.__cloud.saveGate) await window.__cloud.saveGate; return {...profile, ...value}; },
    syncProfileToRooms: async value => record('syncProfileToRooms', value),
    makeRoom: async name => { record('makeRoom', name); return {id: 'NEWR00M', code: 'NEWR00M', name, ownerUid: 'me'}; },
    findRoom: async code => { record('findRoom', code); return {id: code, code, name: 'Sala encontrada', ownerUid: 'other'}; },
    markRoomDeleted: async code => record('markRoomDeleted', code),
    removeMember: async (code, uid) => record('removeMember', code, uid),
    setStreamPermission: async (code, uid, allowed) => record('setStreamPermission', code, uid, allowed),
    setMemberRole: async (code, uid, role) => record('setMemberRole', code, uid, role),
    transferRoom: async (code, uid) => record('transferRoom', code, uid),
    exitRoom: async code => record('exitRoom', code), logout: async () => record('logout')
  };
  window.Peer = class { constructor() { this.open = false; this.destroyed = false; this.handlers = {}; } on(name, cb) { this.handlers[name] = cb; } destroy() { this.destroyed = true; } };
  window.focoDesktop = {setFullscreen: async () => {}, getAppVersion: async () => 'test', getUpdateStatus: () => new Promise(() => {}), onUpdateStatus: () => () => {}, getPendingInvite: async () => '', onInvite: () => () => {}, writeClipboard: async () => true, platform: 'win32'};
})();`;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const dir = path.join(__dirname, '..', 'renderer');
  const fixture = path.join(dir, '.secondary-fixture.html');
  const stubFile = path.join(dir, '.secondary-stubs.js');
  const output = path.join(__dirname, '..', 'artifacts', 'secondary-phase7');
  const win = new BrowserWindow({show: false, width: 1280, height: 800, useContentSize: true, webPreferences: {partition: 'secondary-phase7', contextIsolation: true, nodeIntegration: false, backgroundThrottling: false}});
  const run = code => win.webContents.executeJavaScript(code);
  const evaluate = fn => run(`(${fn.toString()})()`);
  const checks = [];
  const check = (name, ok, detail = '') => { checks.push({name, ok: Boolean(ok), detail}); assert(ok, `${name}${detail ? ': ' + detail : ''}`); console.log('PASS  ' + name); };
  const capture = async name => { await delay(120); fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const resize = async (width, height) => { win.setContentSize(width, height); for(let i=0;i<60;i++){ if(await run(`innerWidth===${width}&&innerHeight===${height}`))break; await delay(40); } };
  const screenshot = async (name, width, height, setup) => { await resize(width,height); if(setup)await run(setup); await capture(`${name}-${width}x${height}`); const geometry=await run('({body:document.body.scrollWidth,viewport:innerWidth,dialog:document.querySelector("dialog[open]")?.getBoundingClientRect().toJSON()})'); check(`${name} sem overflow em ${width}×${height}`,geometry.body<=geometry.viewport+1&&(!geometry.dialog||geometry.dialog.left>=0&&geometry.dialog.right<=geometry.viewport+1),JSON.stringify(geometry)); };
  const mark = async () => { await delay(50); return await run('window.__cloud.calls.map(item => item.name)'); };
  try {
    fs.mkdirSync(output,{recursive:true});
    const html=fs.readFileSync(path.join(dir,'index.html'),'utf8').replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/,'').replace('<script src="firebase-client.bundle.js"></script>','<script src=".secondary-stubs.js"></script>');
    fs.writeFileSync(fixture,html);fs.writeFileSync(stubFile,stubs);
    await win.loadFile(fixture);win.show();
    check('Startup aguarda resposta real de autenticação',await run('!document.querySelector("#startupScreen").classList.contains("is-done")'));
    await capture('startup-1280x800');
    await run('window.__cloud.listeners.auth(null)');await delay(60);
    check('Sem sessão: startup fecha sem esperar atualização e auth mantém shell inert',await run('document.querySelector("#startupScreen").classList.contains("is-done")&&!document.querySelector("#authGate").hidden&&document.querySelector(".app-shell").inert'));
    check('Foco inicial no login',await run('document.activeElement.id==="loginEmail"'));
    check('Shift+Tab e Tab circulam dentro do auth gate',await run('document.querySelector("#loginTab").focus();document.querySelector("#loginTab").dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",shiftKey:true,bubbles:true,cancelable:true}));const last=document.activeElement===document.querySelector("#loginForm [type=submit]");document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true}));last&&document.activeElement.id==="loginTab"'));
    await run('document.querySelector("#loginEmail").focus()');
    await capture('login-1280x800');
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await delay(30);
    check('Tab permanece no auth gate',await run('document.querySelector("#authGate").contains(document.activeElement)'));
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay(30);
    check('Esc não contorna autenticação',await run('!document.querySelector("#authGate").hidden&&document.querySelector(".app-shell").inert'));
    await run('document.querySelector("#registerTab").click()');
    check('Cadastro alterna conteúdo, aria-selected e foco',await run('document.querySelector("#loginForm").hidden&&!document.querySelector("#registerForm").hidden&&document.querySelector("#registerTab").getAttribute("aria-selected")==="true"&&document.activeElement.id==="registerEmail"'));
    await capture('register-1280x800');await screenshot('register-layout',980,720);
    check('Cadastro cabe na altura de 720px',await run('document.querySelector("#authGate").scrollHeight<=document.querySelector("#authGate").clientHeight+1'));
    await resize(1280,800);
    await run('document.querySelector("#registerEmail").value="test@example.com";document.querySelector("#registerUsername").value="tester";document.querySelector("#registerNickname").value="Teste";document.querySelector("#registerPassword").value="password123";window.__cloud.error="register";document.querySelector("#registerForm").requestSubmit()');await delay(70);
    check('Erro de cadastro inline preserva valores',await run('document.querySelector("#authError").textContent.includes("internet")&&document.querySelector("#registerEmail").value==="test@example.com"'));
    await capture('auth-error-1280x800');
    await run('window.__cloud.error=null;let resolve;window.__cloud.registerGate=new Promise(r=>resolve=r);window.__cloud.releaseRegister=resolve;document.querySelector("#registerForm").requestSubmit();document.querySelector("#registerForm").requestSubmit()');await delay(30);
    check('Cadastro bloqueia envio repetido e anuncia loading',await run('window.__cloud.calls.filter(c=>c.name==="register").length===2&&document.querySelector("#registerForm").getAttribute("aria-busy")==="true"&&document.querySelector("#registerForm [type=submit]").disabled'));
    await capture('auth-loading-1280x800');await run('window.__cloud.releaseRegister()');await delay(30);
    await run('document.querySelector("#loginTab").click();document.querySelector("#loginEmail").value="test@example.com";document.querySelector("#loginPassword").value="password123";document.querySelector("#loginForm").requestSubmit()');await delay(60);
    check('Login usa mock sem credencial real',await run('window.__cloud.calls.some(c=>c.name==="login")'));
    await run('window.__cloud.setProfile({username:"teste",nickname:"Teste",status:"Disponível",color:"#9b83ff",photo:"",showActivity:true,activity:""});window.__cloud.listeners.auth({uid:"me"})');await delay(70);
    check('Sessão existente libera shell e restaura foco lógico',await run('document.querySelector("#authGate").hidden&&!document.querySelector(".app-shell").inert&&document.activeElement.id==="roomSearch"'));
    await run('document.querySelector("#profileButton").click()');
    check('Perfil abre com dados atuais e preview',await run('document.querySelector("#profileDialog").open&&document.querySelector("#nicknameInput").value==="Teste"&&document.querySelector("#profilePreviewName").textContent==="Teste"'));
    await capture('profile-1280x800');
    await run('window.__cloud.error="saveProfile";document.querySelector("#nicknameInput").value="Outro nome";document.querySelector("#profileForm").requestSubmit()');await delay(60);
    check('Falha de perfil fica inline e preserva edição',await run('document.querySelector("#profileFormStatus").textContent.includes("internet")&&document.querySelector("#nicknameInput").value==="Outro nome"&&document.querySelector("#profileDialog").open'));
    await run('window.__cloud.error=null;document.querySelector("#profileForm").requestSubmit()');await delay(60);
    check('Perfil só confirma após salvar e sincronizar',await run('!document.querySelector("#profileDialog").open&&document.querySelector("#profileName").textContent==="Outro nome"&&window.__cloud.calls.some(c=>c.name==="syncProfileToRooms")'));
    await run('localStorage.setItem("foco.reduceMotion","false");document.documentElement.classList.remove("reduce-motion");document.querySelector("#settingsButton").click();document.querySelector("#defaultQuality").value="480p30";document.querySelector("#defaultQuality").dispatchEvent(new Event("change"));document.querySelector("#reduceMotionEnabled").click()');
    check('Preferências persistem imediatamente e redução de movimento aplica classe',await run('localStorage.getItem("foco.quality")==="480p30"&&localStorage.getItem("foco.reduceMotion")==="true"&&document.documentElement.classList.contains("reduce-motion")'));
    await capture('settings-1280x800');await run('document.querySelector("#settingsDialog").close()');
    await run('window.connectRoom=async room=>{window.__cloud.connected=room};document.querySelector("#createRoom").click();document.querySelector("#roomInput").value="Sala teste";document.querySelector("#roomForm").requestSubmit()');await delay(70);
    check('Criar sala aciona apenas mock e conclui após resposta',await run('window.__cloud.calls.some(c=>c.name==="makeRoom")&&window.__cloud.connected?.name==="Sala teste"&&!document.querySelector("#roomDialog").open'));
    await run('document.querySelector("#joinRoom").click();document.querySelector("#roomInput").value="bad";document.querySelector("#roomForm").requestSubmit()');await delay(30);
    check('Código inválido mostra erro inline sem consulta',await run('document.querySelector("#roomFormStatus").textContent.includes("válido")&&!window.__cloud.calls.some(c=>c.name==="findRoom")'));
    await capture('join-error-1280x800');
    await run('document.querySelector("#roomInput").value="K7M4PQ2A";document.querySelector("#roomForm").requestSubmit()');await delay(60);
    check('Entrada por código usa mock e fecha após sucesso',await run('window.__cloud.calls.some(c=>c.name==="findRoom")&&!document.querySelector("#roomDialog").open'));
    await run('state.rooms=[{id:"ROOM1234",code:"ROOM1234",name:"Sala pessoal",ownerUid:"me"}];state.activeRoom="ROOM1234";state.isHost=true;state.user={uid:"me"};state.peer={id:"fixture-peer",destroy(){}};state.roomAttempt={code:"ROOM1234",peer:state.peer,userId:"me",authGeneration:state.authGeneration,generation:state.p2pGeneration,openVersion:1};state.roomConnected=true;document.querySelector("#manageRoomButton").click()');
    check('Gerenciamento respeita dono e mostra ações',await run('document.querySelector("#roomManageDialog").open&&!document.querySelector("#deleteRoomButton").hidden'));
    await capture('manage-1280x800');
    await run('document.querySelector("#deleteRoomButton").click()');await delay(30);
    check('Excluir aguarda confirmação e foca cancelar',await run('document.querySelector("#confirmDialog").open&&document.activeElement.id==="confirmCancel"&&!window.__cloud.calls.some(c=>c.name==="markRoomDeleted")'));
    await capture('confirm-1280x800');
    await run('document.querySelector("#confirmCancel").click()');await delay(30);
    check('Cancelar não exclui',await run('!window.__cloud.calls.some(c=>c.name==="markRoomDeleted")'));
    await run('document.querySelector("#deleteRoomButton").click()');await delay(20);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay(30);
    check('Esc em confirmação cancela',await run('!document.querySelector("#confirmDialog").open&&!window.__cloud.calls.some(c=>c.name==="markRoomDeleted")'));
    await run('document.querySelector("#deleteRoomButton").click()');await delay(20);await run('document.querySelector("#confirmDialog").click()');await delay(30);
    check('Clique externo em confirmação cancela',await run('!document.querySelector("#confirmDialog").open&&!window.__cloud.calls.some(c=>c.name==="markRoomDeleted")'));
    await run('document.querySelector("#deleteRoomButton").click();document.querySelector("#deleteRoomButton").click()');await delay(30);
    check('Ação destrutiva não abre duas confirmações',await run('document.querySelectorAll("#confirmDialog[open]").length===1&&!window.__cloud.calls.some(c=>c.name==="markRoomDeleted")'));
    await run('document.querySelector("#confirmAccept").click()');await delay(60);
    check('Excluir executa uma única vez após confirmação',await run('window.__cloud.calls.filter(c=>c.name==="markRoomDeleted").length===1'));
    await run('state.rooms=[{id:"ROOM1234",code:"ROOM1234",name:"Sala pessoal",ownerUid:"me"}];state.activeRoom="ROOM1234";state.isHost=true;state.user={uid:"me"};state.members=new Map([["me",{uid:"me",nickname:"Eu",online:true}],["other",{uid:"other",nickname:"Outra pessoa",online:true,role:"member",canStream:true}]]);renderRoomModeration()');
    check('Gerenciar permissões mostra apenas ações de terceiros',await run('!document.querySelector("[data-room-action][data-uid=me]")&&!!document.querySelector("[data-room-action=permission][data-uid=other]")'));
    await run('document.querySelector("[data-room-action=permission][data-uid=other]").click()');await delay(20);
    check('Permissão não muda antes de confirmar',await run('document.querySelector("#confirmDialog").open&&!window.__cloud.calls.some(c=>c.name==="setStreamPermission")'));
    await run('document.querySelector("#confirmCancel").click()');await delay(20);
    check('Cancelar permissão não chama serviço',await run('!window.__cloud.calls.some(c=>c.name==="setStreamPermission")'));
    await run('document.querySelector("[data-room-action=permission][data-uid=other]").click()');await delay(20);await run('state.user={uid:"intruso"};document.querySelector("#confirmAccept").click()');await delay(30);
    check('Permissão é revalidada após confirmar',await run('!window.__cloud.calls.some(c=>c.name==="setStreamPermission")'));
    await run('state.user={uid:"me"};renderRoomModeration();document.querySelector("[data-room-action=permission][data-uid=other]").click()');await delay(20);await run('document.querySelector("#confirmAccept").click()');await delay(30);
    check('Permissão confirmada é executada uma vez',await run('window.__cloud.calls.filter(c=>c.name==="setStreamPermission").length===1'));
    await run('state.isHost=false;state.user={uid:"intruso"};state.profile.role="member";renderRoomModeration()');
    check('Membro sem moderação não recebe ações administrativas',await run('!document.querySelector("[data-room-action]")'));
    await run('state.user={uid:"me"};state.isHost=true;state.profile.role="owner";renderRoomModeration()');
    await run('state.roomConnected=true;document.body.classList.remove("no-room");setPanelOpen(true);setPanelTab("chat");updateChatControls();document.querySelector("#chatEmojiButton").click()');
    check('Popover de emoji abre com foco e aria-expanded',await run('!document.querySelector("#chatEmojiPicker").hidden&&document.querySelector("#chatEmojiButton").getAttribute("aria-expanded")==="true"&&document.activeElement.closest("#chatEmojiPicker")'));
    await run('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}))');
    check('Esc fecha popover e devolve foco',await run('document.querySelector("#chatEmojiPicker").hidden&&document.activeElement.id==="chatEmojiButton"&&document.querySelector("#chatEmojiButton").getAttribute("aria-expanded")==="false"'));
    await run('document.querySelector("#chatEmojiButton").click();document.querySelector("#roomName").click()');
    check('Clique externo fecha popover',await run('document.querySelector("#chatEmojiPicker").hidden'));
    for(const [locale,label] of [['pt-BR','Excluir sala?'],['en-US','Delete room?'],['es-ES','¿Eliminar sala?'],['fr-FR','Supprimer le salon ?']]){
      await run(`window.focoI18n.setLanguage(${JSON.stringify(locale)});showConfirmDialog({title:'Excluir sala?',message:'A sala será excluída e o código deixará de funcionar.',confirm:'Excluir sala',cancel:'Cancelar'})` .replace('showConfirmDialog','void showConfirmDialog'));await delay(30);
      check(`Confirmação traduzida em ${locale}`,await run(`document.querySelector('#confirmTitle').textContent===${JSON.stringify(label)}`));
      await capture(`confirm-${locale}`);await run('settleConfirm(false)');
    }
    await run('window.focoI18n.setLanguage("pt-BR")');
    for(const [width,height] of [[980,720],[1280,800],[1440,960],[1920,1032]]){
      await screenshot('login-layout',width,height,'showAuthGate();dismissStartupScreen("auth")');
      await run('hideAuthGate()');
    }
    await screenshot('profile-layout',980,720,'openProfile()');await run('document.querySelector("#profileDialog").close()');
    await screenshot('settings-layout',1440,960,'openSettings()');await run('document.querySelector("#settingsDialog").close()');
    await screenshot('create-layout',1920,1032,'showRoomDialog(false)');await run('document.querySelector("#roomDialog").close()');
    await screenshot('join-layout',980,720,'showRoomDialog(true)');await run('document.querySelector("#roomDialog").close()');
    await screenshot('manage-layout',1440,960,'openRoomManagement()');await run('document.querySelector("#roomManageDialog").close()');
    await resize(1280,800);
    for(const locale of ['pt-BR','en-US','es-ES','fr-FR']){
      await run(`window.focoI18n.setLanguage(${JSON.stringify(locale)});showAuthGate()`);await capture(`login-${locale}`);await run('hideAuthGate()');
    }
    await run('window.focoI18n.setLanguage("pt-BR")');
    win.maximize();await delay(200);await capture('shell-maximized');
    check('Fixture usa apenas serviços simulados e não chama logout',!((await mark()).includes('logout'))&&await run('typeof window.focoCloud.login==="function"&&!!window.__cloud'));
    console.log(`secondary passed: ${checks.length} isolated scenarios; screenshots in ${output}`);
  } catch(error) { console.error(error); process.exitCode=1; }
  finally { try{fs.unlinkSync(fixture)}catch{}try{fs.unlinkSync(stubFile)}catch{}win.destroy();app.exit(process.exitCode||0); }
});
