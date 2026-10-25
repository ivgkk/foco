import { createRoomFlow } from './app/rooms.js';
import { createRoomUi } from './app/ui.js';
import { createChat } from './app/chat.js';
import { createStage } from './app/stage.js';
import { createP2P } from './app/p2p.js';
import { createCapture } from './app/capture.js';
import { createRoomSession } from './app/session.js';
function validRooms(items) {
  return Array.isArray(items) ? items.filter(r=>r&&typeof r.id==='string'&&typeof r.name==='string'&&typeof r.code==='string').map(r=>({...r,hostId:typeof r.hostId==='string'?r.hostId:`foco${r.code.toLowerCase()}`,host:Boolean(r.host)})) : [];
}
const state = {
  rooms: [], activeRoom: null,
  peer: null, hostId: null, isHost: false, nickname: localStorage.getItem('foco.nickname') || 'Jogador', user:null,
  profile:{username:'',nickname:'Jogador',status:'Disponível',color:'#9b83ff',photo:'',showActivity:true,activity:''},
  canStream:true,roomConnected:false,rotatingRoom:false,roomListeners:[],roomPeerIds:new Map(),pendingInvite:'',
  members: new Map(), dataConnections: new Map(), calls: new Map(), incomingCalls:new Map(), localStream: null,
  p2pGeneration:0,authGeneration:0,roomAttempt:null,pendingOutgoingCalls:new Map(),lastRetryAt:new Map(),recoveryTimers:new Set(),
  chatMessages:[],chatMedia:null,lastChatSentAt:0,chatSending:false,chatSendOperation:null,chatSeenIds:new Set(),chatForceBottom:false,chatError:'',membersError:'',chatRetrying:false,membersRetrying:false,chatWatch:null,membersWatch:null,chatWatchVersion:0,membersWatchVersion:0,ownMember:null,openPersonMenu:null,
  localSource: null,
  localQuality: null, localQualityProfile: null, qualityTimers:new Map(),
  streams: new Map(), playbackPrefs:new Map(),streamTiles:new Map(),pendingTiles:new Map(),roomsLoaded:false,roomsSlow:false,roomsLoading:false,roomsError:false,roomsWatchVersion:0,membersLoaded:false,chatLoaded:false,chatSeenAt:0,panelTab:'chat',roomStatus:{text:'',good:false}, streamQualityMetrics:new Map(),qualitySamples:new Map(),recoveryAttempts:new Map(), displayMode:'focus', focusedId:null, theaterId:null,expandedId:null
};
const QUALITY_PROFILES={
  '1080p60':{width:1920,height:1080,fps:60,label:'1080p · 60 FPS',aggregateBitrate:16_000_000},
  '720p60':{width:1280,height:720,fps:60,label:'720p · 60 FPS',aggregateBitrate:9_000_000},
  '720p30':{width:1280,height:720,fps:30,label:'720p · 30 FPS',aggregateBitrate:6_000_000},
  '480p30':{width:854,height:480,fps:30,label:'480p · 30 FPS',aggregateBitrate:3_000_000}
};
let toastTimer;
let unsubscribeUserRooms=null;
let unsubscribeAuth=null;
let appVersion='—';
let startupDismissed=false;
let startupAuthTimer=null;
let lastRenderedUpdateState='';
const $ = selector => document.querySelector(selector);
const icon = (name, extra = '') => `<svg class="icon${extra ? ' ' + extra : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const roomSession = createRoomSession({
  state, $, document, cloud: () => window.focoCloud,
  createPeer: () => new Peer(undefined,{debug:0}),
  showAuthGate, renderRooms, setRoomStatus, renderPeople, renderRoomChat, esc, icon,
  handleData, handleCall, updateChatControls, updateShareControls, finishRoomJoin,
  suspendP2PForRevalidation, toast, cancelSharePicker, stopSharing, renderStreams, showNoRoom
});
const p2p = createP2P({
  state, cloud: () => window.focoCloud, p2pContext, sameP2PSession, currentP2P,
  sameRoomIdentity, renderPeople, renderStreams, setRoomStatus, toast,
  qualityProfiles: QUALITY_PROFILES
});
const roomFlow = createRoomFlow({
  state, $, cloudCall, toast, disconnectRoom, showNoRoom, renderPeople, stopSharing,
  renderStreams, renderRoomModeration, ensureDataConnection, ensureCall, renderRoomChat,
  latestMessageAt, persistRooms, renderRooms, esc, icon, setRoomStatus,
  updateShareControls, updateChatControls, mapAuthError, revokePeer, removeRemoteStream,
  roomAttemptCurrent
});
function toast(message) { const el=$('#toast'); el.textContent=window.focoI18n?.translate(message)||message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3200); }
function updateStatusLabel(status) {
  const version=status?.version?` ${status.version}`:'';
  if(!status||status.state==='starting'||status.state==='checking')return 'Verificando atualizações…';
  if(status.state==='current')return status.latestVersion&&status.latestVersion!==appVersion?`Foco atualizado. Versão mais recente: ${status.latestVersion}.`:'Você está na versão mais recente.';
  if(status.state==='available')return `Atualização${version} disponível. Iniciando download…`;
  if(status.state==='downloading')return `Baixando atualização${version} · ${status.percent||0}%.`;
  if(status.state==='ready')return `Versão${version} baixada. Será instalada ao fechar o Foco.`;
  if(status.state==='error')return 'Não foi possível verificar agora. Tente novamente mais tarde.';
  if(status.state==='unavailable'&&status.reason==='not-configured')return 'Atualizações automáticas não estão configuradas nesta instalação.';
  return 'A verificação de atualizações fica disponível na versão instalada.';
}
// Authentication is the only startup gate. Updates continue in the background.
const startupReady={auth:false};
function dismissStartupScreen(part) {
  if(part)startupReady[part]=true;
  if(startupDismissed||!startupReady.auth)return;
  startupDismissed=true;clearTimeout(startupAuthTimer);$('#startupScreen').classList.add('is-done');
  $('#startupScreen').inert=true;
  if(!$('#authGate').hidden)focusAuthGate();
  else $('#roomSearch').focus();
}
function renderUpdateStatus(status) {
  if(!status)return;
  const previous=lastRenderedUpdateState;
  lastRenderedUpdateState=status.state||'';
  $('#updateStatusText').textContent=updateStatusLabel(status);
  $('#appVersionLabel').textContent=`Foco · Versão ${appVersion}`;
  const checking=status.state==='checking'||status.state==='starting';
  const inProgress=status.state==='downloading';
  const ready=status.state==='ready';
  const unavailable=status.state==='unavailable';
  $('#checkUpdatesButton').disabled=checking||inProgress||ready||unavailable;
  $('#checkUpdatesButton').textContent=checking?'Verificando…':inProgress?'Baixando…':ready?'Atualização pronta':'Verificar atualizações';
  $('#startupVersion').textContent=`Versão ${appVersion}`;
  if(status.state==='available'&&previous!=='available')toast(`Atualização ${status.version||''} disponível; baixando em segundo plano.`);
  if(status.state==='ready'&&previous!=='ready')toast(`Atualização ${status.version||''} pronta; será instalada ao fechar o Foco.`);
}
async function initializeUpdateUi() {
  window.focoDesktop.onUpdateStatus?.(renderUpdateStatus);
  try {
    appVersion=await window.focoDesktop.getAppVersion();
    $('#appVersionLabel').textContent=`Foco · Versão ${appVersion}`;
    $('#startupVersion').textContent=`Versão ${appVersion}`;
    let timer;
    try{renderUpdateStatus(await Promise.race([window.focoDesktop.getUpdateStatus(),new Promise(resolve=>{timer=setTimeout(()=>resolve({state:'error'}),8000);})]));}
    finally{clearTimeout(timer);}
  } catch(error) {
    console.warn('Não foi possível carregar o estado das atualizações:',error);
    $('#updateStatusText').textContent='Não foi possível consultar as atualizações.';
  }
}
function persistRooms() { localStorage.setItem('foco.rooms', JSON.stringify(state.rooms)); }
function randomCode() { const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const bytes=crypto.getRandomValues(new Uint8Array(8)); return Array.from(bytes,b=>alphabet[b%alphabet.length]).join(''); }
function currentRoom() { return state.rooms.find(room=>room.id===state.activeRoom); }
function showNoRoom() {
  state.roomListeners.splice(0).forEach(unsubscribe=>{try{unsubscribe();}catch{}});state.chatWatch=null;state.membersWatch=null;state.chatWatchVersion++;state.membersWatchVersion++;state.chatRetrying=false;state.membersRetrying=false;
  state.activeRoom=null;state.chatMessages=[];state.chatMedia=null;state.chatSendOperation=null;state.chatSending=false;$('#chatSendStatus').hidden=true;state.chatSeenIds.clear();state.chatError='';state.membersError='';state.ownMember=null;state.openPersonMenu=null;state.theaterId=null;state.expandedId=null;state.focusedId=null;state.localFocusChosen=false;document.body.classList.remove('theater-active');document.body.classList.add('no-room');
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  $('#roomName').textContent=tr('Início'); // Room names are user content and never translated.
  $('#copyRoomCode').innerHTML=icon('copy','icon-sm');$('#copyRoomCode').disabled=true;
  $('#shareLabel').textContent='Compartilhar tela';$('#shareButton').classList.remove('sharing');$('#shareButton').disabled=true;$('#inviteButton').disabled=true;
  state.membersLoaded=false;state.chatLoaded=false;
  setRoomStatus('Crie ou entre em uma sala');renderRooms($('#roomSearch').value);renderPeople();renderStreams();renderRoomChat();
}
function openSettings() { $('#appLanguage').value=window.focoI18n?.getLanguage()||'pt-BR';$('#defaultQuality').value=localStorage.getItem('foco.quality')||'720p60';$('#reduceMotionEnabled').checked=localStorage.getItem('foco.reduceMotion')==='true';$('#appVersionLabel').textContent=`Foco · Versão ${appVersion}`;$('#settingsDialog').showModal(); }
function focusAuthGate(){
  if(!startupDismissed||$('#authGate').hidden)return;
  $('#authGate').inert=false;
  const target=!$('#backendSetup').hidden ? $('#firebaseApiKey') : $('#authForms').hidden ? $('#authTitle') : $('#loginForm').hidden ? $('#registerEmail') : $('#loginEmail');
  target.focus();
}
function showAuthGate(message='') { $('#authGate').hidden=false;$('.app-shell').inert=true;$('#authError').textContent=tr(message);focusAuthGate(); }
function hideAuthGate(){ $('#authGate').hidden=true;$('#authGate').inert=true;$('.app-shell').inert=false;$('#authError').textContent='';if(startupDismissed)$('#roomSearch').focus(); }
function setAuthMode(mode){const login=mode==='login';$('#loginForm').hidden=!login;$('#registerForm').hidden=login;$('#loginTab').classList.toggle('active',login);$('#registerTab').classList.toggle('active',!login);$('#loginTab').setAttribute('aria-selected',String(login));$('#registerTab').setAttribute('aria-selected',String(!login));$('#authTitle').textContent=tr(login?'Entre na sua conta':'Crie sua conta');$('#authDescription').textContent=tr(login?'Use seu email e senha para abrir seu perfil e suas salas.':'Seu username é único e não poderá ser alterado.');$('#authError').textContent='';(login?$('#loginEmail'):$('#registerEmail')).focus();}
function mapAuthError(error){const code=error?.code||'';const known={'auth/email-already-in-use':'Esse email já está cadastrado.','auth/invalid-email':'O email informado não é válido.','auth/weak-password':'A senha precisa ter pelo menos 8 caracteres.','auth/invalid-credential':'Email ou senha incorretos.','auth/user-not-found':'Email ou senha incorretos.','auth/wrong-password':'Email ou senha incorretos.','auth/operation-not-allowed':'Ative Email/Senha em Authentication no Firebase Console.','auth/invalid-api-key':'API key do Firebase inválida. Confira a configuração.','auth/network-request-failed':'Não foi possível conectar ao serviço online. Confira sua internet.','auth/too-many-requests':'Muitas tentativas. Aguarde um pouco e tente novamente.','PERMISSION_DENIED':'As regras do Realtime Database estão ausentes ou não correspondem à configuração.','database/permission-denied':'As regras do Realtime Database estão ausentes ou não correspondem à configuração.'};return known[code]||error?.message||'Não foi possível concluir a operação.';}
function setSignedInProfile(profile){state.profile={...state.profile,...profile};state.nickname=state.profile.nickname;localStorage.setItem('foco.nickname',state.nickname);const avatar=$('#profileAvatar');avatar.textContent=state.profile.photo?'':state.nickname.slice(0,1).toUpperCase();avatar.style.background=state.profile.photo?`center/cover url("${state.profile.photo}")`:state.profile.color;$('#profileName').textContent=state.nickname;$('#profileStatusLabel').textContent=state.profile.status||'';updateProfilePreview();}
function updateProfilePreview(){
  const color=$('#profileColor')?.value||state.profile.color||'#9b83ff',hex=$('#profileColorHex'),name=$('#nicknameInput')?.value.trim()||state.profile.nickname||'Seu apelido',status=$('#profileStatus')?.value.trim()||'Disponível',avatar=$('#profilePreviewAvatar');
  if(hex&&hex.value.toLowerCase()!==color.toLowerCase())hex.value=color;
  document.querySelectorAll('.color-swatch').forEach(button=>{const selected=button.dataset.profileColor.toLowerCase()===color.toLowerCase();button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  const custom=document.querySelector('#profilePalette .custom-color-swatch'),isPreset=[...document.querySelectorAll('.color-swatch')].some(button=>button.dataset.profileColor.toLowerCase()===color.toLowerCase());if(custom){custom.classList.toggle('selected',!isPreset);custom.style.setProperty('--swatch-color',color);}
  $('#profilePreviewName').textContent=name;$('#profilePreviewStatus').textContent=status;
  if(avatar){avatar.style.background=state.pendingPhoto?`center/cover url("${state.pendingPhoto}")`:state.profile.photo?`center/cover url("${state.profile.photo}")`:color;avatar.textContent=state.pendingPhoto||state.profile.photo?'':name.slice(0,1).toUpperCase();}
  $('#profileLivePreview')?.style.setProperty('--profile-accent',color);
}
function setProfileColor(value){if(!/^#[0-9a-f]{6}$/i.test(value))return;$('#profileColor').value=value;$('#profileColorHex').value=value;updateProfilePreview();}
function openProfile() { state.pendingPhoto=undefined;$('#profileUsername').value=state.profile.username||'';$('#nicknameInput').value=state.profile.nickname||state.nickname;$('#profileStatus').value=state.profile.status||'';$('#profileActivity').value=state.profile.activity||'';$('#profileColor').value=state.profile.color||'#9b83ff';$('#profileColorHex').value=state.profile.color||'#9b83ff';$('#showActivity').checked=state.profile.showActivity!==false;$('#profilePhoto').value='';$('#profilePhotoPreview').innerHTML=state.profile.photo?`<img src="${esc(state.profile.photo)}" alt="Foto de perfil"><span>Foto atual</span>`:'Sem foto selecionada';setProfileFormStatus();updateProfilePreview();$('#profileDialog').showModal();$('#nicknameInput').focus();}
function setProfileFormStatus(message='',kind='error'){const status=$('#profileFormStatus');status.hidden=!message;status.dataset.kind=kind;status.textContent=tr(message);}
function openRoomManagement() {
  const room=currentRoom();if(!room){toast('Entre em uma sala para gerenciá-la.');return;}
  $('#manageRoomTitle').textContent=room.name;
  state.isHost=state.user?.uid===room.ownerUid;
  $('#manageRoomDescription').textContent=state.isHost?'A sala continua disponível mesmo quando você está offline.':'Você pode sair desta sala e voltar a entrar com o código.';
  $('#deleteRoomButton').hidden=!state.isHost;$('#rotateRoomCodeButton').hidden=!state.isHost;renderRoomModeration();
  $('#roomManageDialog').showModal();
}
async function rotateRoomCode(){
  const old=currentRoom();if(!old||!state.isHost)return;
  await confirmedRoomAction(`rotate:${old.code}`,{title:'Gerar novo código?',message:'A sala atual será encerrada para todos. O código e os convites antigos deixarão de funcionar.',confirm:'Gerar novo código',cancel:'Cancelar'},()=>currentRoom()?.code===old.code&&state.user?.uid===old.ownerUid,async()=>{
  let replacement=null;const attempt=state.roomAttempt;
  try{
    replacement=await window.focoCloud.makeRoom(old.name);
    if(!roomAttemptCurrent(attempt)){await window.focoCloud.markRoomDeleted(replacement.code).catch(()=>{});return;}
    state.rotatingRoom=true;
    await window.focoCloud.markRoomDeleted(old.code);
    if(!roomAttemptCurrent(attempt)){state.rotatingRoom=false;await window.focoCloud.markRoomDeleted(replacement.code).catch(()=>{});return;}
    disconnectRoom(false);state.activeRoom=null;state.rotatingRoom=false;
    state.rooms=state.rooms.filter(room=>room.code!==old.code);persistRooms();renderRooms($('#roomSearch').value);$('#roomManageDialog').close();
    await connectRoom(replacement);
    const replacementAttempt=state.roomAttempt;if(!roomAttemptCurrent(replacementAttempt))return;
    const connected=await waitForRoomReady(replacement.code,12000);
    if(!roomAttemptCurrent(replacementAttempt))return;
    if(!connected&&!state.rooms.some(room=>room.code===replacement.code)){state.rooms.unshift({...replacement,id:replacement.code});persistRooms();renderRooms($('#roomSearch').value);}
    await copyText(`foco://join/${replacement.code}`);if(roomAttemptCurrent(replacementAttempt))toast(`${connected?'Sala recriada':'Sala recriada · conexão pendente'} · código ${replacement.code} · convite copiado.`);
  }catch(error){state.rotatingRoom=false;if(replacement&&state.activeRoom!==replacement.code)await window.focoCloud.markRoomDeleted(replacement.code).catch(()=>{});throw error;}
  });
}
async function waitForRoomReady(code,timeout){const attempt=state.roomAttempt,started=Date.now();while(Date.now()-started<timeout){if(!roomAttemptCurrent(attempt)||attempt.code!==code)return false;if(state.roomConnected)return true;await new Promise(resolve=>setTimeout(resolve,150));}return roomAttemptCurrent(attempt)&&state.roomConnected&&attempt.code===code;}
function renderRoomModeration(){
  const room=currentRoom(),container=$('#roomMembersManage');if(!container)return;
  if(!room){container.innerHTML='';return;}
  const canModerate=state.isHost||state.profile.role==='moderator';
  const people=[...state.members.entries()].map(([uid,m])=>({uid,...m})).filter(m=>m.online!==false);
  container.innerHTML=people.length?'<div class="manage-section-title">PESSOAS NESTA SALA</div>'+people.map(m=>`<div class="manage-person"><span class="manage-person-name"><span data-no-translate>${esc(m.nickname||m.name||m.username)}</span> <small>${tr(m.role==='moderator'?'Moderador':m.role==='owner'?'Dono da sala':'Membro')}</small></span>${canModerate&&m.uid!==state.user?.uid?`<button type="button" class="manage-small" data-room-action="permission" data-uid="${esc(m.uid)}" data-allowed="${m.canStream===false?'false':'true'}">${m.canStream===false?'Permitir transmitir':'Bloquear transmissão'}</button>${state.isHost?`<button type="button" class="manage-small" data-room-action="role" data-uid="${esc(m.uid)}" data-role="${m.role==='moderator'?'member':'moderator'}">${m.role==='moderator'?'Remover moderação':'Tornar moderador'}</button><button type="button" class="manage-small" data-room-action="transfer" data-uid="${esc(m.uid)}">Transferir dono</button>`:''}<button type="button" class="manage-small danger" data-room-action="ban" data-uid="${esc(m.uid)}">Expulsar e bloquear</button>`:''}</div>`).join(''):'<div class="manage-section-title">Só você está nesta sala.</div>';
  container.onclick=async event=>{const button=event.target.closest('[data-room-action]');if(!button||button.disabled)return;const uid=button.dataset.uid,action=button.dataset.roomAction,member=state.members.get(uid);if(!member)return;
    const ownerOnly=action==='transfer'||action==='role';
    const allowed=()=>currentRoom()?.code===room.code&&uid!==state.user?.uid&&state.members.has(uid)&&(ownerOnly?state.user?.uid===room.ownerUid:(state.user?.uid===room.ownerUid||state.profile.role==='moderator'));
    const copy={ban:['Expulsar e bloquear?','Esta pessoa será removida da sala e não poderá voltar com o convite.','Expulsar e bloquear'],transfer:['Transferir propriedade?','Você deixará de ser dono desta sala. A outra pessoa poderá gerenciá-la.','Transferir dono'],role:['Alterar cargo?','As permissões de moderação desta pessoa serão alteradas.','Alterar cargo'],permission:['Alterar transmissão?','A permissão desta pessoa para transmitir será alterada.','Alterar permissão']}[action];if(!copy)return;
    await confirmedRoomAction(`${action}:${room.code}:${uid}`,{title:copy[0],message:copy[1],confirm:copy[2],cancel:'Cancelar'},allowed,async()=>{button.disabled=true;try{if(action==='ban')await window.focoCloud.removeMember(room.code,uid);if(action==='permission')await window.focoCloud.setStreamPermission(room.code,uid,button.dataset.allowed==='false');if(action==='role')await window.focoCloud.setMemberRole(room.code,uid,button.dataset.role);if(action==='transfer')await window.focoCloud.transferRoom(room.code,uid);toast('Permissões atualizadas.');renderRoomModeration();}finally{button.disabled=false;}});
  };
}
async function leaveCurrentRoom() {
  const room=currentRoom();if(!room)return;
  const peerId=state.peer?.id;
  disconnectRoom(false,{remote:false});state.activeRoom=null;
  $('#roomManageDialog').close();showNoRoom();toast('Você saiu da sala.');
  try{await cloudCall(()=>window.focoCloud.exitRoom(room.code,peerId));}
  catch(error){toast('A presença não pôde ser atualizada. Verifique sua conexão.');}
}
async function deleteCurrentRoom() {
  const room=currentRoom();if(!room||!state.isHost)return;
  await confirmedRoomAction(`delete:${room.code}`,{title:'Excluir sala?',message:`${tr('A sala será excluída e o código deixará de funcionar.')} “${room.name}”`,confirm:'Excluir sala',cancel:'Cancelar'},()=>currentRoom()?.code===room.code&&state.user?.uid===room.ownerUid,async()=>{const attempt=state.roomAttempt;await cloudCall(()=>window.focoCloud.markRoomDeleted(room.code));if(!roomAttemptCurrent(attempt))return;disconnectRoom(false);state.rooms=state.rooms.filter(item=>item.id!==room.id);persistRooms();state.activeRoom=null;
  $('#roomManageDialog').close();showNoRoom();toast('Sala excluída.');});
}
async function cloudCall(callback){try{return await callback();}catch(error){console.error('Serviço online:',error);throw error;}}
function setDisplayMode(mode) {
  state.displayMode=mode==='grid'?'grid':'focus';
  $('#gridViewButton').classList.toggle('active',state.displayMode==='grid');$('#listViewButton').classList.toggle('active',state.displayMode==='focus');
  $('#gridViewButton').setAttribute('aria-pressed',String(state.displayMode==='grid'));$('#listViewButton').setAttribute('aria-pressed',String(state.displayMode==='focus'));
  $('#streamGrid').classList.toggle('grid-view',state.displayMode==='grid');
  refreshStreamTiles();
}
// ---------- Shell: sidebar, side panel and room-switch guard ----------
const tr=text=>window.focoI18n?.translate(text)||text;
const WIDE_SIDEBAR_QUERY=matchMedia('(min-width: 1100px)'),WIDE_PANEL_QUERY=matchMedia('(min-width: 1280px)');
const ROOMS_SLOW_MS=10000;
let roomsSlowTimer=null;
function storedFlag(key){const value=localStorage.getItem(key);return value==='true'?true:value==='false'?false:null;}
// An explicit choice is remembered; until the user makes one, each region follows the window width.
function isSidebarCollapsed(){return storedFlag('foco.sidebarCollapsed')??!WIDE_SIDEBAR_QUERY.matches;}
function isPanelOpen(){return storedFlag('foco.panelOpen')??WIDE_PANEL_QUERY.matches;}
function applyShellLayout(){
  const collapsed=isSidebarCollapsed(),open=isPanelOpen();
  document.body.classList.toggle('sidebar-collapsed',collapsed);document.body.classList.toggle('panel-open',open);
  // Dynamic labels are set already translated: the i18n observer only translates inserted nodes.
  const sidebarLabel=tr(collapsed?'Expandir barra lateral':'Recolher barra lateral'),panelLabel=tr(open?'Ocultar painel':'Mostrar painel');
  const sidebarToggle=$('#sidebarToggle'),panelToggle=$('#panelToggle');
  sidebarToggle.title=sidebarLabel;sidebarToggle.setAttribute('aria-label',sidebarLabel);sidebarToggle.setAttribute('aria-expanded',String(!collapsed));
  panelToggle.title=panelLabel;panelToggle.setAttribute('aria-label',panelLabel);panelToggle.setAttribute('aria-expanded',String(open));
  updateChatUnread();
}
function toggleSidebar(){localStorage.setItem('foco.sidebarCollapsed',String(!isSidebarCollapsed()));applyShellLayout();}
function setPanelOpen(open){localStorage.setItem('foco.panelOpen',String(Boolean(open)));applyShellLayout();}
function setPanelTab(tab){
  closePersonMenu();
  state.panelTab=tab==='people'?'people':'chat';
  for(const [name,button,pane] of [['chat',$('#chatTab'),$('#chatPane')],['people',$('#peopleTab'),$('#peoplePane')]]){
    const active=state.panelTab===name;
    button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;pane.hidden=!active;
  }
  updateChatUnread();
}
function latestMessageAt(...args){return chat.latestMessageAt(...args);}
function chatAtBottom(...args){return chat.chatAtBottom(...args);}
function chatVisible(...args){return chat.chatVisible(...args);}
function updateChatUnread(...args){return chat.updateChatUnread(...args);}
let confirmResolver=null;
function showConfirmDialog({title,message,confirm,cancel}){
  if(confirmResolver)return Promise.resolve(false);
  $('#confirmTitle').textContent=tr(title);$('#confirmMessage').textContent=tr(message);$('#confirmAccept').textContent=tr(confirm);$('#confirmCancel').textContent=tr(cancel||'Cancelar');
  return new Promise(resolve=>{confirmResolver=resolve;$('#confirmDialog').showModal();$('#confirmCancel').focus();});
}
function settleConfirm(result){
  const resolve=confirmResolver;confirmResolver=null;
  if($('#confirmDialog').open)$('#confirmDialog').close();
  resolve?.(result);
}
const pendingRoomActions=new Set();
async function confirmedRoomAction(key,details,allowed,operation){
  if(pendingRoomActions.has(key)||!allowed())return false;
  pendingRoomActions.add(key);
  try{
    if(!await showConfirmDialog(details)||!allowed())return false;
    await operation();return true;
  }catch(error){toast(mapAuthError(error));return false;}
  finally{pendingRoomActions.delete(key);}
}
// Joining another room tears down the current Peer, which ends the local transmission.
async function confirmRoomSwitch(targetCode){
  if(!state.localStream||!state.activeRoom||targetCode===state.activeRoom)return true;
  return showConfirmDialog({title:'Trocar de sala?',message:'Você está transmitindo. Entrar em outra sala vai encerrar sua transmissão atual.',confirm:'Encerrar e trocar',cancel:'Continuar transmitindo'});
}
// "connected" is only ever set after PeerJS opens and the room join succeeds (connectRoom).
function setRoomStatus(text, good=false) {
  state.roomStatus={text,good};
  const kind=good?'connected':/falha|interrompido/i.test(text)?'error':/instável|reconect|recuperar/i.test(text)?'warning':'pending';
  $('#connectionStatus').dataset.state=kind;$('#connectionStatusLabel').textContent=text;$('#connectionStatus').title=tr(text);
}
const roomUi = createRoomUi({ state, $, document, esc, icon, tr,
  confirmRoomSwitch, connectRoom, avatarColor });
function roomInitial(...args){return roomUi.roomInitial(...args);}
function renderRooms(...args){return roomUi.renderRooms(...args);}
function renderPeople(...args){return roomUi.renderPeople(...args);}
function closePersonMenu(...args){return roomUi.closePersonMenu(...args);}
const chat = createChat({ state, $, document, tr, esc, icon, isPanelOpen, avatarColor,
  cloud: () => window.focoCloud });
function updateChatControls(...args){return chat.updateChatControls(...args);}
function chatTextHtml(...args){return chat.chatTextHtml(...args);}
function chatMessageNode(...args){return chat.chatMessageNode(...args);}
function renderRoomChat(...args){return chat.renderRoomChat(...args);}
function updateChatAttachment(...args){return chat.updateChatAttachment(...args);}
function fileAsDataUrl(...args){return chat.fileAsDataUrl(...args);}
function prepareChatImage(...args){return chat.prepareChatImage(...args);}
function resizeChatInput(...args){return chat.resizeChatInput(...args);}
function closeChatEmojiPicker(...args){return chat.closeChatEmojiPicker(...args);}
function openChatEmojiPicker(...args){return chat.openChatEmojiPicker(...args);}
function sendChatMessage(...args){return chat.sendChatMessage(...args);}
function makeChatAvatar(...args){return chat.makeChatAvatar(...args);}
function avatarColor(seed='') { let n=0; for(const c of seed)n=(n*31+c.charCodeAt(0))>>>0; const hues=[182,215,270,320,25,145]; const hue=hues[n%hues.length]; return `linear-gradient(135deg,hsl(${hue} 55% 65%),hsl(${hue+35} 50% 40%))`; }
const stage = createStage({
  state, $, document, icon, esc, tr, toast, stopSharing, setDisplayMode,
  currentRoom, confirmedRoomAction, kickMember, avatarColor, ensureDataConnection,
  mediaConnectionState: p2p.mediaConnectionState,
  observeMediaConnection: p2p.observeMediaConnection,
  readStreamQuality: p2p.readStreamQuality
});
function syncFullscreenState(...args){return stage.syncFullscreenState(...args);}
function setTheaterMode(...args){return stage.setTheaterMode(...args);}
function setExpandedMode(...args){return stage.setExpandedMode(...args);}
function setText(...args){return stage.setText(...args);}
function setHTML(...args){return stage.setHTML(...args);}
function setAttr(...args){return stage.setAttr(...args);}
function setStyle(...args){return stage.setStyle(...args);}
function playbackPrefs(...args){return stage.playbackPrefs(...args);}
function qualityLabel(...args){return stage.qualityLabel(...args);}
function qualityTitle(...args){return stage.qualityTitle(...args);}
function closeStreamMenus(...args){return stage.closeStreamMenus(...args);}
function focusStream(...args){return stage.focusStream(...args);}
function stageIds(...args){return stage.stageIds(...args);}
function cycleStage(...args){return stage.cycleStage(...args);}
function createStreamTile(...args){return stage.createStreamTile(...args);}
function applyPlayback(...args){return stage.applyPlayback(...args);}
function tileMediaState(...args){return stage.tileMediaState(...args);}
function refreshTileMediaState(...args){return stage.refreshTileMediaState(...args);}
function setTileFailure(...args){return stage.setTileFailure(...args);}
function stopTileMediaWatch(...args){return stage.stopTileMediaWatch(...args);}
function attachTileMedia(...args){return stage.attachTileMedia(...args);}
function updateStreamTile(...args){return stage.updateStreamTile(...args);}
function destroyStreamTile(...args){return stage.destroyStreamTile(...args);}
function refreshStreamTiles(...args){return stage.refreshStreamTiles(...args);}
function updatePendingTile(...args){return stage.updatePendingTile(...args);}
function updateStageGeometry(...args){return stage.updateStageGeometry(...args);}
function renderStreams(...args){return stage.renderStreams(...args);}
function sampleStreamQuality(...args){return stage.sampleStreamQuality(...args);}
function refreshStreamQuality(...args){return stage.refreshStreamQuality(...args);}
function showStreamError(...args){return stage.showStreamError(...args);}
function p2pContext(peer=state.peer){return roomSession.p2pContext(peer);}
function sameRoomIdentity(context){return roomSession.sameRoomIdentity(context);}
function sameP2PSession(context){return roomSession.sameP2PSession(context);}
function currentP2P(context){return roomSession.currentP2P(context);}
function memberForPeer(peerId){return p2p.memberForPeer(peerId);}
function revokePeer(peerId){return p2p.revokePeer(peerId);}
async function authorizePeer(peerId,context,options){return p2p.authorizePeer(peerId,context,options);}
function sendToAll(message){return p2p.sendToAll(message);}
function handleData(conn,peer=state.peer){return p2p.handleData(conn,peer);}
function ensureDataConnection(uid,peerId){return p2p.ensureDataConnection(uid,peerId);}
function ensureCall(peerId,stream=state.localStream,options){return p2p.ensureCall(peerId,stream,options);}
function watchMediaConnection(call){return p2p.watchMediaConnection(call);}
function configureCallQuality(){return p2p.configureCallQuality();}
async function handleCall(call,peer=state.peer){return p2p.handleCall(call,peer);}
function removeRemoteStream(peerId){return p2p.removeRemoteStream(peerId);}
function syncRoomMembers(rawMembers){return roomFlow.syncRoomMembers(rawMembers);}
async function watchPanelMembers(code){return roomFlow.watchPanelMembers(code);}
async function watchPanelChat(code){return roomFlow.watchPanelChat(code);}
async function compensateStaleJoin(attempt,peerId){return roomFlow.compensateStaleJoin(attempt,peerId);}
async function watchCurrentRoom(attempt){return roomFlow.watchCurrentRoom(attempt);}
function confirmRestoredRoom(attempt){return roomFlow.confirmRestoredRoom(attempt);}
function suspendP2PForRevalidation(){return roomFlow.suspendP2PForRevalidation();}
async function finishRoomJoin(attempt,peerId,openVersion,reconnecting){return roomFlow.finishRoomJoin(attempt,peerId,openVersion,reconnecting);}
function roomAttemptCurrent(attempt){return roomSession.roomAttemptCurrent(attempt);}
async function connectRoom(room){return roomSession.connectRoom(room);}
function disconnectRoom(clear=true,{remote=true}={}){return roomSession.disconnectRoom(clear,{remote});}
function showRoomDialog(join=false) {
  const d=$('#roomDialog');$('#dialogEyebrow').textContent=tr(join?'ENTRAR EM UMA SALA':'NOVA SALA');$('#dialogTitle').textContent=tr(join?'Encontre sua galera':'Crie seu espaço');$('#dialogDescription').textContent=tr(join?'Digite o código da sala. Ela continua disponível mesmo quando o dono está offline.':'Uma sala persistente para compartilhar telas com sua galera.');$('#roomFieldLabel').textContent=tr(join?'Código da sala':'Nome da sala');$('#roomInput').placeholder=tr(join?'Ex.: K7M4PQ2A':'Ex.: Squad da noite');$('#dialogSubmit').textContent=tr(join?'Entrar na sala':'Criar sala');$('#roomInput').value='';$('#roomInput').removeAttribute('aria-invalid');setRoomFormStatus();d.dataset.mode=join?'join':'create';d.showModal();$('#roomInput').focus();
}
let roomSubmitting=false;
function setRoomFormStatus(message='',kind='error'){const status=$('#roomFormStatus');status.hidden=!message;status.dataset.kind=kind;status.textContent=tr(message);$('#roomInput').setAttribute('aria-invalid',String(kind==='error'&&!!message));}
async function submitRoomForm(event) {
  event.preventDefault();if(roomSubmitting)return;const value=$('#roomInput').value.trim();if(!value)return;
  const generation=state.authGeneration,uid=state.user?.uid;
  const joining=$('#roomDialog').dataset.mode==='join',code=joining?window.focoCloud.cleanCode(value):null;
  if(joining&&code.length<6){setRoomFormStatus('Digite um código de sala válido.');return;}
  roomSubmitting=true;$('#dialogSubmit').disabled=true;$('#roomForm').setAttribute('aria-busy','true');setRoomFormStatus(joining?'Buscando sala…':'Criando sala…','info');
  try{
    if(!await confirmRoomSwitch(code)){setRoomFormStatus();return;}
    if(!authCurrent(generation,uid))return;
    const room=await cloudCall(()=>joining?window.focoCloud.findRoom(code):window.focoCloud.makeRoom(value.slice(0,32)));
    if(!authCurrent(generation,uid))return;
    $('#roomDialog').close();await connectRoom(room);
  }catch(error){if(authCurrent(generation,uid)){if($('#roomDialog').open)setRoomFormStatus(mapAuthError(error));else toast(mapAuthError(error));}}
  finally{roomSubmitting=false;$('#dialogSubmit').disabled=false;$('#roomForm').removeAttribute('aria-busy');}
}
const sharePicker={generation:0,sources:[],selectedId:null,tab:'screen',loading:false,error:'',audioExplicit:false};
const capture = createCapture({
  state, $, desktop: () => window.focoDesktop, cloud: () => window.focoCloud,
  sharePicker, selectedShareSource, shareAudioSources, populateShareAudio,
  renderShareSources, sharePeerReady, setShareStatus, updateShareControls,
  withShareTimeout, qualityProfiles: QUALITY_PROFILES, ensureCall,
  configureCallQuality, sendToAll, renderStreams, renderPeople, toast
});
function withShareTimeout(promise,ms,message){let timer;return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
function setShareStatus(message='',kind='info'){
  const status=$('#shareStatus');status.hidden=!message;status.dataset.kind=kind;status.textContent=message?tr(message):'';
}
function shareAudioSources(){return sharePicker.sources.filter(s=>s.type==='window'&&!/^Developer Tools/i.test(s.name));}
function selectedShareSource(){return sharePicker.sources.find(s=>s.id===sharePicker.selectedId)||null;}
function sharePeerReady(){return !!state.peer?.open&&!state.peer.disconnected&&!state.peer.destroyed;}
function updateShareControls(){
  const selected=selectedShareSource(),audioId=$('#audioSourceSelect').value,audio=shareAudioSources().find(s=>s.id===audioId),validAudio=audioId==='none'||!!audio;
  const busy=!!capture.attempt,loading=sharePicker.loading;
  $('#startShareButton').disabled=busy||loading||!selected||!validAudio||!state.canStream||!sharePeerReady()||!state.activeRoom||!!state.localStream;
  $('#startShareButton').querySelector('span').textContent=busy?'Preparando transmissão…':'Iniciar transmissão';
  $('#refreshSourcesButton').disabled=busy||loading;
  $('#shareQuality').disabled=busy;
  $('#audioSourceSelect').disabled=busy;
  for(const tab of [$('#shareScreensTab'),$('#shareWindowsTab')])tab.disabled=busy;
  if(audioId==='none')$('#shareAudioHint').textContent=shareAudioSources().length?'A transmissão terá somente vídeo.':'Nenhum aplicativo de áudio disponível. Você pode transmitir somente vídeo.';
  else if(audio)$('#shareAudioHint').textContent='O áudio será capturado do aplicativo selecionado.';
  else $('#shareAudioHint').textContent='O aplicativo de áudio selecionado não está disponível.';
}
function renderShareSources(){
  const root=$('#sourceOptions'),sources=sharePicker.sources.filter(s=>s.type===sharePicker.tab);
  root.setAttribute('aria-busy',String(sharePicker.loading));
  root.setAttribute('aria-labelledby',sharePicker.tab==='screen'?'shareScreensTab':'shareWindowsTab');
  $('#screenSourceCount').hidden=sharePicker.loading;$('#windowSourceCount').hidden=sharePicker.loading;
  $('#screenSourceCount').textContent=String(sharePicker.sources.filter(s=>s.type==='screen').length);
  $('#windowSourceCount').textContent=String(sharePicker.sources.filter(s=>s.type==='window').length);
  $('#shareSourceHint').textContent=sharePicker.tab==='screen'?'Selecione uma tela':'Selecione uma janela';
  if(sharePicker.loading&&!sharePicker.sources.length){root.innerHTML=Array.from({length:3},()=>'<div class="source-skeleton" aria-hidden="true"><span class="skeleton skeleton-preview"></span><span class="skeleton skeleton-line"></span></div>').join('')+'<span class="sr-only">Carregando fontes…</span>';}
  else if(sharePicker.error){root.innerHTML=`<div class="source-error">${icon('alert-circle')}<strong>Não foi possível carregar as fontes</strong><small>Tente atualizar a lista.</small></div>`;}
  else if(!sources.length){root.innerHTML=`<div class="source-empty">${icon(sharePicker.tab==='screen'?'monitor':'app-window')}<strong>${sharePicker.tab==='screen'?'Nenhuma tela disponível':'Nenhuma janela disponível'}</strong></div>`;}
  else root.innerHTML=sources.map(s=>{
    const preview=typeof s.thumbnail==='string'&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(s.thumbnail)?`<img class="source-thumb" src="${esc(s.thumbnail)}" alt="">`:`<span class="source-no-preview">${icon('monitor')}<small>Prévia indisponível</small></span>`;
    return `<button type="button" class="source-option" data-source-id="${esc(s.id)}" aria-pressed="${s.id===sharePicker.selectedId}" title="${esc(s.name)}"><span class="source-preview">${preview}</span><span class="source-option-copy">${icon(s.type==='screen'?'monitor':'app-window','icon-sm')}<strong data-no-translate>${esc(s.name)}</strong>${s.id===sharePicker.selectedId?icon('check','icon-sm'):''}</span></button>`;
  }).join('');
  updateShareControls();
}
function setShareTab(tab,focus=false){
  const next=tab==='window'?'window':'screen';
  if(next!==sharePicker.tab&&selectedShareSource()?.type!==next)sharePicker.selectedId=null;
  sharePicker.tab=next;
  for(const [type,button] of [['screen',$('#shareScreensTab')],['window',$('#shareWindowsTab')]]){
    const active=type===sharePicker.tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  }
  renderShareSources();if(focus)$(sharePicker.tab==='screen'?'#shareScreensTab':'#shareWindowsTab').focus();
}
function populateShareAudio(preferred=''){
  const options=shareAudioSources();
  $('#audioSourceSelect').innerHTML='<option value="none">Sem áudio</option>'+options.map(s=>`<option value="${esc(s.id)}" data-no-translate>${esc(s.name)}</option>`).join('');
  const choice=preferred===''||preferred==='none'?'none':options.find(s=>s.id===preferred)?.id||'';
  if(choice==='')$('#audioSourceSelect').insertAdjacentHTML('afterbegin','<option value="">Aplicativo de áudio indisponível</option>');
  $('#audioSourceSelect').value=choice;
  updateShareControls();
}
async function listSources(refresh=false){
  const generation=++sharePicker.generation,previousSelection=sharePicker.selectedId,previousAudio=$('#audioSourceSelect').value;
  sharePicker.loading=true;sharePicker.error='';if(!refresh)sharePicker.sources=[];
  setShareStatus(refresh?'Atualizando fontes…':'');renderShareSources();
  try{
    const sources=await withShareTimeout(window.focoDesktop.listSources(),10000,'A lista de fontes demorou para responder.');
    if(generation!==sharePicker.generation||!$('#shareDialog').open)return;
    if(!Array.isArray(sources))throw new Error('invalid sources');
    sharePicker.sources=sources.filter(s=>s&&typeof s.id==='string'&&typeof s.name==='string'&&(s.type==='screen'||s.type==='window'));
    sharePicker.selectedId=sharePicker.sources.some(s=>s.id===previousSelection)?previousSelection:null;
    populateShareAudio(previousAudio);
    if(previousSelection&&!sharePicker.selectedId)setShareStatus('A fonte selecionada não está mais disponível. Escolha outra fonte.','error');
    else setShareStatus();
  }catch(error){
    if(generation!==sharePicker.generation||!$('#shareDialog').open)return;
    console.warn('Listagem de fontes:',error);sharePicker.sources=[];sharePicker.selectedId=null;sharePicker.error='failed';populateShareAudio();setShareStatus('Não foi possível carregar as fontes. Tente atualizar a lista.','error');
  }finally{if(generation===sharePicker.generation){sharePicker.loading=false;renderShareSources();}}
}
function cancelSharePicker(close=true){
  sharePicker.generation++;capture.cancelAttempt();
  if(close&&$('#shareDialog').open)$('#shareDialog').close();
}
function openShareDialog(){
  if(state.localStream||!state.activeRoom||!sharePeerReady()||!state.canStream)return;
  const dialog=$('#shareDialog');if(dialog.open)return;
  sharePicker.sources=[];sharePicker.selectedId=null;sharePicker.tab='screen';sharePicker.loading=true;sharePicker.error='';sharePicker.audioExplicit=false;
  $('#shareQuality').value=localStorage.getItem('foco.quality')||'720p60';
  $('#audioSourceSelect').innerHTML='<option value="none">Sem áudio</option>';$('#audioSourceSelect').value='none';
  setShareStatus();dialog.showModal();setShareTab('screen');$('#shareScreensTab').focus();
  listSources();
}
async function startSharing(){return capture.startSharing();}
function stopSharing(showMessage=true,{remote=true}={}){return capture.stopSharing(showMessage,{remote});}
async function kickMember(peerId){const target=[...state.members.entries()].find(([,member])=>member.peerId===peerId);if(!target)return;try{await window.focoCloud.removeMember(state.activeRoom,target[0]);toast('Participante expulso e bloqueado.');}catch(error){toast(mapAuthError(error));}}
async function compressAvatar(file){
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=data;});
  const canvas=document.createElement('canvas'),scale=Math.min(1,256/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.78);
}
async function enterCode(code){const clean=window.focoCloud.cleanCode(code),generation=state.authGeneration,uid=state.user?.uid;if(!await confirmRoomSwitch(clean)||state.authGeneration!==generation||state.user?.uid!==uid)return;const room=await cloudCall(()=>window.focoCloud.findRoom(clean));if(state.authGeneration!==generation||state.user?.uid!==uid)return;await connectRoom(room);}
function authCurrent(generation,uid){return roomSession.authCurrent(generation,uid);}
function stopUserRoomsWatch(){
  state.roomsWatchVersion++;clearTimeout(roomsSlowTimer);roomsSlowTimer=null;
  if(unsubscribeUserRooms){unsubscribeUserRooms();unsubscribeUserRooms=null;}
  state.roomsLoading=false;state.roomsSlow=false;
}
async function startUserRoomsWatch(generation,uid,{retry=false}={}){
  if(!authCurrent(generation,uid)||retry&&state.roomsLoading)return;
  stopUserRoomsWatch();
  const version=state.roomsWatchVersion;
  state.roomsLoading=true;state.roomsError=false;renderRooms($('#roomSearch').value);
  roomsSlowTimer=setTimeout(()=>{if(!authCurrent(generation,uid)||version!==state.roomsWatchVersion||!state.roomsLoading)return;state.roomsSlow=true;renderRooms($('#roomSearch').value);},ROOMS_SLOW_MS);
  let unsubscribe=null,failed=false;
  const current=()=>authCurrent(generation,uid)&&version===state.roomsWatchVersion;
  const onError=error=>{
    if(!current())return;
    console.warn('Lista de salas:',error);failed=true;state.roomsLoading=false;state.roomsError=true;state.roomsSlow=false;clearTimeout(roomsSlowTimer);roomsSlowTimer=null;
    if(unsubscribe){unsubscribe();if(unsubscribeUserRooms===unsubscribe)unsubscribeUserRooms=null;}
    renderRooms($('#roomSearch').value);
    if(retry)document.querySelector('#roomList .room-list-retry')?.focus();
  };
  try{
    unsubscribe=await window.focoCloud.watchUserRooms(rooms=>{
      if(!current())return;
      state.roomsLoaded=true;state.roomsLoading=false;state.roomsError=false;state.roomsSlow=false;clearTimeout(roomsSlowTimer);roomsSlowTimer=null;
      state.rooms=rooms.filter(room=>room&&!room.deleted).map(room=>({...room,id:room.code,code:room.code,host:room.ownerUid===uid}));
      persistRooms();renderRooms($('#roomSearch').value);
    },onError);
    if(!current()||failed){unsubscribe?.();return;}
    unsubscribeUserRooms=unsubscribe;
  }catch(error){onError(error);}
}
function clearAccountPresentation(){
  state.profile={username:'',nickname:'Jogador',status:'Disponível',color:'#9b83ff',photo:'',showActivity:true,activity:''};
  state.nickname='Jogador';state.pendingPhoto=undefined;localStorage.removeItem('foco.nickname');
  $('#profileName').textContent='';$('#profileStatusLabel').textContent='';$('#profileAvatar').textContent='';$('#profileAvatar').style.background='';
  if($('#profileDialog').open)$('#profileDialog').close();
}
async function activateUser(user,generation=roomSession.advanceAuth()){
  if(!user){stopUserRoomsWatch();if(state.user)disconnectRoom(false,{remote:false});roomSession.setUser(null);state.rooms=[];state.roomsLoaded=false;state.roomsError=false;clearAccountPresentation();renderRooms();showNoRoom();showAuthGate();dismissStartupScreen('auth');return;}
  const previousUid=state.user?.uid;
  if(previousUid&&previousUid!==user.uid){stopUserRoomsWatch();disconnectRoom(false,{remote:false});state.rooms=[];state.roomsLoaded=false;state.roomsError=false;clearAccountPresentation();showNoRoom();showAuthGate('Preparando sua conta…');}
  roomSession.setUser(user);let profile=null;
  for(let attempt=0;attempt<12&&!profile;attempt++){
    try{profile=await window.focoCloud.getProfile(user.uid);}catch(error){if(!authCurrent(generation,user.uid))return;throw error;}
    if(!authCurrent(generation,user.uid))return;
    if(!profile)await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!authCurrent(generation,user.uid))return;
  if(!profile){showAuthGate('Seu perfil ainda está sendo criado. Feche e abra o app para tentar novamente.');dismissStartupScreen('auth');return;}
  state.profile=profile;setSignedInProfile(profile);hideAuthGate();dismissStartupScreen('auth');
  if(previousUid!==user.uid){state.rooms=[];state.roomsLoaded=false;}
  await startUserRoomsWatch(generation,user.uid);
  if(!authCurrent(generation,user.uid))return;
  if(state.pendingInvite){const code=state.pendingInvite;state.pendingInvite='';try{await enterCode(code);}catch(error){if(authCurrent(generation,user.uid))toast(mapAuthError(error));}}
}
function initCloudAuth(){
  if(!window.focoCloud?.isConfigured()){showAuthGate('Não foi possível carregar a configuração online do Foco. Reinstale a versão atualizada do app.');$('#backendSetup').hidden=true;$('#authForms').hidden=true;setRoomStatus('Falha na configuração online');dismissStartupScreen('auth');return;}
  // The sign-in form appears only once Firebase reports that there is no session.
  $('#backendSetup').hidden=true;$('#authForms').hidden=false;
  if(unsubscribeAuth)unsubscribeAuth();unsubscribeAuth=window.focoCloud.onAuthChanged(user=>{if(user?.uid&&state.user?.uid===user.uid&&state.roomAttempt?.joinedOnce)return;const generation=roomSession.advanceAuth();activateUser(user,generation).catch(error=>{if(state.authGeneration!==generation)return;console.error('Sessão:',error);showAuthGate(mapAuthError(error));dismissStartupScreen('auth');});});
}
let authSubmitting=false;
async function submitAuth(form,label,operation){
  if(authSubmitting)return;authSubmitting=true;
  const button=form.querySelector('[type="submit"]'),original=button.textContent;
  button.disabled=true;form.setAttribute('aria-busy','true');button.textContent=tr(label);$('#authError').textContent='';
  try{await operation();}catch(error){$('#authError').textContent=tr(mapAuthError(error));if(/email/i.test(error?.code||''))form.querySelector('input[type="email"]')?.setAttribute('aria-invalid','true');}
  finally{authSubmitting=false;button.disabled=false;form.removeAttribute('aria-busy');button.textContent=tr(original);}
}
$('#firebaseConfigForm').onsubmit=event=>{event.preventDefault();const config={apiKey:$('#firebaseApiKey').value.trim(),authDomain:$('#firebaseAuthDomain').value.trim(),databaseURL:$('#firebaseDatabaseURL').value.trim(),projectId:$('#firebaseProjectId').value.trim(),appId:$('#firebaseAppId').value.trim()};submitAuth($('#firebaseConfigForm'),'Conectando…',async()=>{if(unsubscribeAuth){unsubscribeAuth();unsubscribeAuth=null;}await window.focoCloud.configure(config);$('#backendSetup').hidden=true;$('#authForms').hidden=false;initCloudAuth();});};
$('#loginTab').onclick=()=>setAuthMode('login');$('#registerTab').onclick=()=>setAuthMode('register');
$('.auth-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setAuthMode(event.key==='Home'?'login':event.key==='End'?'register':$('#loginForm').hidden?'login':'register');});
$('#loginForm').onsubmit=event=>{event.preventDefault();submitAuth($('#loginForm'),'Conectando…',()=>window.focoCloud.login($('#loginEmail').value,$('#loginPassword').value));};
$('#registerForm').onsubmit=event=>{event.preventDefault();submitAuth($('#registerForm'),'Criando sua conta…',()=>window.focoCloud.register({email:$('#registerEmail').value,password:$('#registerPassword').value,username:$('#registerUsername').value,nickname:$('#registerNickname').value}));};
$('#authGate').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();return;}
  if(event.key!=='Tab')return;
  const controls=[...$('#authGate').querySelectorAll('button,input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&!el.hidden&&!el.closest('[hidden]')&&el.tabIndex>=0);
  if(!controls.length){event.preventDefault();return;}
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
document.addEventListener('focusin',event=>{if(startupDismissed&&!$('#authGate').hidden&&!$('#authGate').contains(event.target))focusAuthGate();});
$('#authGate').addEventListener('input',event=>event.target.removeAttribute('aria-invalid'));
$('#logoutButton').onclick=async()=>{const code=state.activeRoom,peerId=state.peer?.id;disconnectRoom(false,{remote:false});state.activeRoom=null;$('#profileDialog').close();if(code&&peerId)await window.focoCloud.exitRoom(code,peerId).catch(()=>{});await window.focoCloud.logout();};
$('#createRoom').onclick=()=>showRoomDialog(false);$('#joinRoom').onclick=()=>showRoomDialog(true);$('#roomForm').onsubmit=submitRoomForm;
$('#homeCreateRoom').onclick=()=>showRoomDialog(false);$('#homeJoinRoom').onclick=()=>showRoomDialog(true);
$('#shareButton').onclick=()=>{if(state.localStream)stopSharing();else if(!state.canStream)toast('O dono da sala não permitiu que seu perfil transmita.');else if(!state.peer||!state.peer.open)toast('Entre em uma sala antes de transmitir.');else openShareDialog();};
$('#shareForm').onsubmit=event=>{event.preventDefault();startSharing();};
$('#cancelShareButton').onclick=()=>cancelSharePicker();
$('#shareDialog').addEventListener('close',()=>{sharePicker.generation++;capture.cancelAttempt();$('#shareButton').focus();});
$('#refreshSourcesButton').onclick=()=>listSources(true);
$('#shareScreensTab').onclick=()=>setShareTab('screen');$('#shareWindowsTab').onclick=()=>setShareTab('window');
$('.share-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setShareTab(event.key==='Home'?'screen':event.key==='End'?'window':sharePicker.tab==='screen'?'window':'screen',true);});
$('#sourceOptions').addEventListener('click',event=>{const button=event.target.closest('[data-source-id]');if(!button||capture.attempt||sharePicker.loading)return;const source=sharePicker.sources.find(item=>item.id===button.dataset.sourceId);if(!source)return;const restoreFocus=document.activeElement===button;sharePicker.selectedId=source.id;populateShareAudio(!sharePicker.audioExplicit&&source.type==='window'?source.id:$('#audioSourceSelect').value);setShareStatus();renderShareSources();if(restoreFocus)[...$('#sourceOptions').querySelectorAll('[data-source-id]')].find(item=>item.dataset.sourceId===source.id)?.focus();});
$('#audioSourceSelect').onchange=()=>{sharePicker.audioExplicit=true;setShareStatus();updateShareControls();};
async function copyText(value){try{if(window.focoDesktop?.writeClipboard){await window.focoDesktop.writeClipboard(value);return true;}await navigator.clipboard.writeText(value);return true;}catch{return false;}}
$('#inviteButton').onclick=async()=>{const room=currentRoom();if(!room){toast('Entre em uma sala primeiro.');return;}const link=`foco://join/${room.code}`;if(await copyText(link))toast('Link de convite copiado.');else toast(`Não foi possível copiar. Link: ${link}`);};
$('#copyRoomCode').onclick=async()=>{const room=currentRoom();if(!room){toast('Entre em uma sala para copiar o código.');return;}if(await copyText(room.code))toast(`Código ${room.code} copiado.`);else toast(`Não foi possível copiar. Código: ${room.code}`);};
$('#roomSearch').oninput=e=>renderRooms(e.target.value);
$('#roomList').addEventListener('click',event=>{if(event.target.closest('.room-list-retry')&&state.user&&!state.roomsLoading)startUserRoomsWatch(state.authGeneration,state.user.uid,{retry:true});});
$('#profileButton').onclick=openProfile;
$('#sidebarToggle').onclick=toggleSidebar;$('#panelToggle').onclick=()=>setPanelOpen(!isPanelOpen());
$('#participantsButton').onclick=()=>{setPanelOpen(true);setPanelTab('people');};
$('#chatTab').onclick=()=>setPanelTab('chat');$('#peopleTab').onclick=()=>setPanelTab('people');
$('#peopleList').addEventListener('click',event=>{
  const focus=event.target.closest('[data-person-focus]');if(focus){const id=focus.dataset.personFocus;if(state.streamTiles.has(id)){focusStream(id);if(!WIDE_PANEL_QUERY.matches)setPanelOpen(false);state.streamTiles.get(id)?.card.focus();}return;}
  const menuButton=event.target.closest('[data-person-menu]');if(menuButton){const uid=menuButton.dataset.personMenu,opened=state.openPersonMenu===uid;closePersonMenu();if(!opened){const menu=menuButton.parentElement.querySelector('[data-person-menu-content]');if(menu){menu.hidden=false;menuButton.setAttribute('aria-expanded','true');state.openPersonMenu=uid;menu.querySelector('button')?.focus();}}return;}
  const manage=event.target.closest('[data-person-manage]');if(manage){const uid=manage.dataset.personManage;if(!(state.isHost||state.profile.role==='moderator')||uid===state.user?.uid)return;closePersonMenu();openRoomManagement();const target=[...$('#roomMembersManage').querySelectorAll('[data-uid]')].find(button=>button.dataset.uid===uid);target?.scrollIntoView({block:'nearest'});target?.focus();}
});
$('#peopleList').addEventListener('keydown',event=>{if(event.key==='Escape'&&state.openPersonMenu){event.preventDefault();closePersonMenu(true);}});
document.querySelector('.panel-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setPanelTab(event.key==='Home'?'chat':event.key==='End'?'people':state.panelTab==='chat'?'people':'chat');$(state.panelTab==='chat'?'#chatTab':'#peopleTab').focus();});
for(const query of [WIDE_SIDEBAR_QUERY,WIDE_PANEL_QUERY])query.addEventListener('change',applyShellLayout);
$('#confirmAccept').onclick=()=>settleConfirm(true);$('#confirmCancel').onclick=()=>settleConfirm(false);
// Escape, a backdrop click or any other close answers "no".
$('#confirmDialog').addEventListener('close',()=>settleConfirm(false));
$('#settingsButton').onclick=openSettings;$('#manageRoomButton').onclick=openRoomManagement;
document.addEventListener('click',event=>{const close=event.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close)?.close();});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();}));
$('#profilePhoto').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>8*1024*1024){toast('Escolha uma imagem de até 8 MB.');event.target.value='';return;}try{state.pendingPhoto=await compressAvatar(file);$('#profilePhotoPreview').innerHTML=`<img src="${state.pendingPhoto}" alt="Prévia da foto"><span>Prévia da foto</span>`;updateProfilePreview();}catch{toast('Não foi possível carregar esta imagem.');}};
let profileSubmitting=false;
$('#profileForm').onsubmit=async event=>{event.preventDefault();if(profileSubmitting)return;const nickname=$('#nicknameInput').value.trim();if(!nickname){setProfileFormStatus('Digite um apelido.');$('#nicknameInput').setAttribute('aria-invalid','true');return;}const generation=state.authGeneration,uid=state.user?.uid;const profile={nickname:nickname.slice(0,24),status:$('#profileStatus').value.trim().slice(0,48)||'Disponível',activity:$('#profileActivity').value.trim().slice(0,80),color:$('#profileColor').value,showActivity:$('#showActivity').checked,photo:state.pendingPhoto??state.profile.photo};profileSubmitting=true;const button=$('#profileForm').querySelector('[type="submit"]');button.disabled=true;button.textContent=tr('Salvando…');$('#profileForm').setAttribute('aria-busy','true');setProfileFormStatus('Salvando perfil…','info');try{const saved=await cloudCall(()=>window.focoCloud.saveProfile(profile));if(!authCurrent(generation,uid))return;state.profile=saved;state.pendingPhoto=undefined;setSignedInProfile(saved);renderPeople();await window.focoCloud.syncProfileToRooms(saved);if(!authCurrent(generation,uid))return;$('#profileDialog').close();toast('Perfil atualizado.');}catch(error){if(authCurrent(generation,uid))setProfileFormStatus(mapAuthError(error));}finally{profileSubmitting=false;button.disabled=false;button.textContent=tr('Salvar');$('#profileForm').removeAttribute('aria-busy');}};
$('#nicknameInput').addEventListener('input',()=>$('#nicknameInput').removeAttribute('aria-invalid'));
$('#defaultQuality').onchange=event=>{localStorage.setItem('foco.quality',event.target.value);$('#shareQuality').value=event.target.value;toast('Qualidade padrão atualizada.');};
$('#shareQuality').onchange=updateShareControls;
$('#appLanguage').onchange=event=>window.focoI18n?.setLanguage(event.target.value);
window.addEventListener('foco-language-change',()=>{applyShellLayout();if(!state.activeRoom)$('#roomName').textContent=tr('Início');renderPeople();renderStreams();for(const tile of state.streamTiles.values())if(tile.failure){const panel=tile.card.querySelector('.stream-error');if(panel)panel.textContent=tr(tile.failure.message);}if(state.roomStatus.text)setRoomStatus(state.roomStatus.text,state.roomStatus.good);renderRoomChat();toast('Idioma alterado.');});
$('#chatInput').oninput=()=>{resizeChatInput();updateChatControls();if($('#chatSendStatus').dataset.kind==='error')$('#chatSendStatus').hidden=true;};
$('#chatInput').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();sendChatMessage();}};
$('#chatSendButton').onclick=sendChatMessage;
$('#chatMessages').addEventListener('scroll',()=>{if(!chatAtBottom())state.chatForceBottom=false;updateChatUnread();},{passive:true});
$('#chatJump').onclick=()=>{$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;updateChatUnread();$('#chatMessages').focus();};
$('#chatLoadStatus').onclick=event=>{if(event.target.closest('[data-retry-chat]')&&state.activeRoom)watchPanelChat(state.activeRoom);};
$('#peopleLoadStatus').onclick=event=>{if(event.target.closest('[data-retry-members]')&&state.activeRoom)watchPanelMembers(state.activeRoom);};
$('#chatAttachButton').onclick=()=>$('#chatFileInput').click();
$('#chatEmojiButton').onclick=openChatEmojiPicker;
$('#chatFileInput').onchange=async event=>{const file=event.target.files?.[0],room=state.activeRoom,generation=state.p2pGeneration;if(!file||!room)return;try{const media=await prepareChatImage(file);if(room!==state.activeRoom||generation!==state.p2pGeneration)return;state.chatMedia=media;updateChatAttachment();toast('Imagem pronta para enviar.');}catch(error){if(room!==state.activeRoom||generation!==state.p2pGeneration)return;state.chatMedia=null;event.target.value='';toast(error.message==='file'?'Não foi possível abrir esta imagem.':error.message);}};
$('#chatMessages').onclick=async event=>{const image=event.target.closest('[data-chat-media]');if(image){image.classList.toggle('zoomed');return;}const removeButton=event.target.closest('[data-chat-delete]');if(!removeButton)return;try{await window.focoCloud.deleteRoomChatMessage(state.activeRoom,removeButton.dataset.chatDelete);toast('Mensagem removida.');}catch(error){toast(error.message||'Não foi possível remover a mensagem.');}};
document.addEventListener('click',event=>{if(!event.target.closest('#chatEmojiButton,#chatEmojiPicker'))closeChatEmojiPicker();if(!event.target.closest('#peopleList'))closePersonMenu();});
$('#checkUpdatesButton').onclick=async()=>{try{await window.focoDesktop.checkForUpdates();}catch(error){console.warn('Falha na verificação de atualizações:',error);renderUpdateStatus({state:'error'});}};
document.addEventListener('click',event=>{if(!event.target.closest('.stream-actions'))closeStreamMenus();});
$('#gridViewButton').onclick=()=>setDisplayMode('grid');$('#listViewButton').onclick=()=>setDisplayMode('focus');
$('#leaveRoomButton').onclick=leaveCurrentRoom;$('#deleteRoomButton').onclick=deleteCurrentRoom;$('#rotateRoomCodeButton').onclick=rotateRoomCode;
$('#reduceMotionEnabled').onchange=event=>{localStorage.setItem('foco.reduceMotion',String(event.target.checked));document.documentElement.classList.toggle('reduce-motion',event.target.checked);};
$('#nicknameInput').oninput=updateProfilePreview;$('#profileStatus').oninput=updateProfilePreview;
$('#profilePalette').onclick=event=>{const swatch=event.target.closest('[data-profile-color]');if(swatch)setProfileColor(swatch.dataset.profileColor);};
$('#profileColor').oninput=event=>setProfileColor(event.target.value);
$('#profileColorHex').oninput=event=>{const value=event.target.value.trim();if(/^#[0-9a-f]{6}$/i.test(value))setProfileColor(value);};
$('#profileColorHex').onblur=event=>{if(!/^#[0-9a-f]{6}$/i.test(event.target.value.trim()))event.target.value=$('#profileColor').value;};
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]'))return;
  if(event.key==='Escape'){
    if(document.fullscreenElement){event.preventDefault();document.exitFullscreen().catch(()=>{});return;}
    if(state.expandedId){const card=state.streamTiles.get(state.expandedId)?.card;if(card)setExpandedMode(card);return;}
    return;
  }
  if(event.altKey||event.ctrlKey||event.metaKey||event.repeat||!state.activeRoom||!state.focusedId||event.target.closest('input,textarea,select,[contenteditable="true"],.stream-menu,[role="menu"],[role="listbox"],[aria-haspopup="true"],.panel-tabs')||!(event.target.closest('#stage')||event.target===document.body))return;
  const tile=state.streamTiles.get(state.focusedId);if(!tile)return;
  const key=event.key.toLowerCase();
  if(key==='f'){event.preventDefault();setTheaterMode(tile.card);}
  else if(key==='m'&&!tile.local&&tile.stream?.getAudioTracks().length){event.preventDefault();const prefs=playbackPrefs(tile.id);prefs.muted=!prefs.muted;applyPlayback(tile);}
  else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();cycleStage(event.key==='ArrowRight'?1:-1);}
});
window.addEventListener('beforeunload',()=>{cancelSharePicker();disconnectRoom(false);});
$('#shareQuality').value=localStorage.getItem('foco.quality')||'720p60';
document.documentElement.classList.toggle('reduce-motion',localStorage.getItem('foco.reduceMotion')==='true');
const stageObserver=new ResizeObserver(()=>updateStageGeometry());stageObserver.observe($('#stage'));
applyShellLayout();setPanelTab('chat');setDisplayMode('focus');renderRooms();showNoRoom();renderPeople();renderStreams();setInterval(refreshStreamQuality,2500);
startupAuthTimer=setTimeout(()=>{if(!startupReady.auth){$('#startupMessage').textContent=tr('A verificação da sessão está demorando. Confira sua conexão.');$('#startupScreen').classList.add('is-slow');}},12000);
initCloudAuth();
initializeUpdateUi();
window.focoDesktop.getPendingInvite?.().then(code=>{if(code)state.pendingInvite=code;}).catch(()=>{});
window.focoDesktop.onInvite?.(code=>{if(state.user)enterCode(code).catch(error=>toast(mapAuthError(error)));else{state.pendingInvite=code;showAuthGate('Entre ou crie uma conta para abrir o convite.');}});
