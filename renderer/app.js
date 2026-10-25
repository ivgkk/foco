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
  localSource: null, audioContext: null, audioWorklet: null, audioDestination: null,
  localQuality: null, localQualityProfile: null, qualityTimers:new Map(),
  removeAudioListener: null, streams: new Map(), playbackPrefs:new Map(),streamTiles:new Map(),pendingTiles:new Map(),roomsLoaded:false,roomsSlow:false,roomsLoading:false,roomsError:false,roomsWatchVersion:0,membersLoaded:false,chatLoaded:false,chatSeenAt:0,panelTab:'chat',roomStatus:{text:'',good:false}, streamQualityMetrics:new Map(),qualitySamples:new Map(),recoveryAttempts:new Map(), displayMode:'focus', focusedId:null, theaterId:null,expandedId:null
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
let peerReconnectTimer=null;
let peerReconnectAttempts=0;
const $ = selector => document.querySelector(selector);
const icon = (name, extra = '') => `<svg class="icon${extra ? ' ' + extra : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
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
  window.focoDesktop.setFullscreen(false).catch(()=>{});
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
  const attempt=state.roomAttempt,peerId=state.peer?.id;
  state.roomConnected=false;await cloudCall(()=>window.focoCloud.exitRoom(room.code,peerId));
  if(!roomAttemptCurrent(attempt))return;
  disconnectRoom(false,{remote:false});state.activeRoom=null;
  $('#roomManageDialog').close();showNoRoom();toast('Você saiu da sala.');
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
function latestMessageAt(messages){return (messages||[]).reduce((latest,message)=>Math.max(latest,Number(message.createdAt)||0),0);}
function chatAtBottom(){const root=$('#chatMessages');return root.scrollHeight-root.scrollTop-root.clientHeight<48;}
function chatVisible(){return Boolean(state.activeRoom)&&isPanelOpen()&&state.panelTab==='chat'&&!$('#chatPane').hidden;}
function updateChatUnread(){
  const messages=state.chatMessages||[];
  if(state.chatLoaded&&chatVisible()&&chatAtBottom()){
    for(const message of messages)state.chatSeenIds.add(message.id);
    state.chatSeenAt=latestMessageAt(messages);
  }
  const unread=state.chatLoaded?messages.filter(message=>message.uid!==state.user?.uid&&!state.chatSeenIds.has(message.id)).length:0;
  const badge=$('#chatUnread');badge.hidden=!unread;badge.textContent=unread>9?'9+':String(unread);
  $('#panelUnread').hidden=!unread||isPanelOpen();
  const jump=$('#chatJump');jump.hidden=!unread||!chatVisible()||chatAtBottom();$('#chatJumpCount').textContent=unread>9?'9+':String(unread);
  const announcement=unread&&chatVisible()&&!chatAtBottom()?tr('Novas mensagens recebidas.'):'';if($('#chatAnnouncement').textContent!==announcement)$('#chatAnnouncement').textContent=announcement;
}
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
function roomInitial(name){return (Array.from(String(name||'').trim())[0]||'#').toUpperCase();}
function renderRooms(filter='') {
  const list=$('#roomList');
  const notice=(message,retry=false)=>`<div class="room-list-notice" role="status">${icon('alert-circle','icon-sm')}<span>${tr(message)}</span>${retry?`<button type="button" class="room-list-retry">${tr('Tentar novamente')}</button>`:''}</div>`;
  if(state.roomsError&&!state.roomsLoaded){list.removeAttribute('aria-busy');list.innerHTML=notice('Não foi possível carregar suas salas.',true);return;}
  if(!state.roomsLoaded){
    // The real list has not answered yet: show its shape, never a guessed "no rooms".
    list.setAttribute('aria-busy','true');
    list.innerHTML='<div class="skeleton-group">'+[62,46,70,54].map(width=>`<div class="room-skeleton" aria-hidden="true"><span class="skeleton skeleton-icon"></span><span class="skeleton skeleton-line" style="width:${width}%"></span></div>`).join('')+'</div><span class="sr-only">Carregando salas…</span>'+(state.roomsSlow?'<div class="empty-rooms" role="status">A lista de salas está demorando para responder.</div>':'');
    return;
  }
  if(state.roomsLoading)list.setAttribute('aria-busy','true');else list.removeAttribute('aria-busy');
  const q=filter.toLowerCase();
  const rooms=state.rooms.filter(r=>r.name.toLowerCase().includes(q)||r.code.toLowerCase().includes(q)).map(r=>`<button class="room-item ${r.id===state.activeRoom?'active':''}" data-room="${esc(r.id)}" title="${esc(r.name)}"${r.id===state.activeRoom?' aria-current="true"':''}><span class="room-hash">${icon('hash','icon-sm')}</span><span class="room-initial" aria-hidden="true">${esc(roomInitial(r.name))}</span><span data-no-translate>${esc(r.name)}</span>${r.id===state.activeRoom&&state.peer?'<span class="room-live">ATIVA</span>':''}</button>`).join('') || `<div class="empty-rooms">${state.rooms.length?'Nenhuma sala encontrada':'Nenhuma sala ainda'}</div>`;
  list.innerHTML=(state.roomsError?notice('Não foi possível atualizar salas. A lista pode estar desatualizada.',true):state.roomsLoading?notice('Atualizando lista de salas…'):'' )+rooms;
  document.querySelectorAll('[data-room]').forEach(button=>button.onclick=async()=>{const room=state.rooms.find(r=>r.id===button.dataset.room);if(!room||room.id===state.activeRoom)return;if(await confirmRoomSwitch(room.id))connectRoom(room);});
}
function renderPeople() {
  const list=$('#peopleList');
  $('#peopleLoadStatus').hidden=!state.membersError;$('#peopleLoadStatus').innerHTML=state.membersError?`<span>${tr('Não foi possível atualizar participantes. Presença indisponível.')}</span><button type="button" data-retry-members${state.membersRetrying?' disabled':''}>${tr(state.membersRetrying?'Atualizando…':'Tentar novamente')}</button>`:'';
  if(!state.user||!state.activeRoom){list.removeAttribute('aria-busy');list.replaceChildren();$('#onlineCount').textContent='';$('#memberCount').textContent='';$('#peopleTabCount').hidden=true;return;}
  if(!state.membersLoaded){
    if(state.membersError){list.removeAttribute('aria-busy');list.replaceChildren();$('#onlineCount').textContent='';$('#memberCount').textContent='';$('#peopleTabCount').hidden=true;return;}
    // Presence has not answered yet: no guessed count, only the shape of the list.
    list.setAttribute('aria-busy','true');
    list.innerHTML='<div class="skeleton-group">'+[58,72,44].map(width=>`<div class="person-skeleton" aria-hidden="true"><span class="skeleton"></span><span><span class="skeleton skeleton-line" style="width:${width}%"></span><span class="skeleton skeleton-line" style="width:${width-22}%"></span></span></div>`).join('')+'</div><span class="sr-only">Carregando participantes…</span>';
    $('#onlineCount').textContent='';$('#memberCount').textContent='';$('#peopleTabCount').hidden=true;return;
  }
  list.removeAttribute('aria-busy');
  list.querySelector('.skeleton-group')?.remove();list.querySelector('.sr-only')?.remove();
  const own=state.ownMember?{...state.profile,...state.ownMember,uid:state.user.uid,publishing:!!state.localStream}:null;
  const members=[...(own?[own]:[]),...state.members.values()].filter(m=>m.online!==false).sort((a,b)=>Number(b.uid===state.user.uid)-Number(a.uid===state.user.uid)||Number(!!(b.streaming||b.publishing))-Number(!!(a.streaming||a.publishing))||(a.nickname||a.name||'').localeCompare(b.nickname||b.name||''));
  const existing=new Map([...list.querySelectorAll('.person-chip[data-person-uid]')].map(row=>[row.dataset.personUid,row]));
  if(!members.length){list.innerHTML='<div class="people-empty">'+tr('Nenhum participante disponível.')+'</div>';}
  else {list.querySelector('.people-empty')?.remove();for(let index=0;index<members.length;index++){
    const m=members[index],self=m.uid===state.user.uid,owner=m.role==='owner'||m.uid===state.currentRoomData?.ownerUid,role=owner?'Dono da sala':m.role==='moderator'?'Moderador':'Membro';
    const live=Boolean(m.publishing||m.streaming||state.streams.get(m.peerId)?.stream),canFocus=live&&Boolean(state.streamTiles.get(m.peerId)),canManage=!self&&(state.isHost||state.profile.role==='moderator');
    const name=m.nickname||m.name||m.username||'Participante',photo=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(m.photo||'')?m.photo:'',color=/^#[0-9a-f]{6}$/i.test(m.color||'')?m.color:avatarColor(m.uid||m.peerId);
    const signature=JSON.stringify([name,photo,color,role,m.online,live,canFocus,canManage,m.status,m.showActivity,m.activity,!!state.membersError,window.focoI18n?.getLanguage()]);
    let row=existing.get(m.uid);if(!row||row._signature!==signature){const wrapper=document.createElement('div');wrapper.innerHTML=`<div class="person-chip ${live?'is-sharing':''}" data-person-uid="${esc(m.uid)}"><span class="person-avatar" style="background:${photo?`center/cover url('${esc(photo)}')`:esc(color)}">${photo?'':esc(name.slice(0,1).toUpperCase())}</span><span class="person-details"><strong><span data-no-translate>${esc(name)}</span>${self?`<span class="person-you">${tr('você')}</span>`:''}</strong><small class="person-meta"><span>${tr(role)}</span>${!state.membersError&&m.online===true?`<span class="person-online">${tr('Online')}</span>`:''}${live?`<span class="person-live">${icon('monitor-up','icon-sm')}${tr('Transmitindo')}</span>`:''}</small></span>${canFocus?`<button type="button" class="person-focus" data-person-focus="${esc(m.peerId)}" title="${tr('Focar transmissão')}" aria-label="${tr('Focar transmissão')}">${icon('monitor','icon-sm')}</button>`:''}${canManage?`<button type="button" class="person-more" data-person-menu="${esc(m.uid)}" aria-label="${tr('Ações para participante')}" aria-expanded="false">${icon('more','icon-sm')}</button><div class="person-menu" data-person-menu-content="${esc(m.uid)}" hidden><button type="button" data-person-manage="${esc(m.uid)}">${tr('Gerenciar participante')}</button></div>`:''}</div>`;const next=wrapper.firstElementChild,wasOpen=state.openPersonMenu===m.uid,restoreFocus=wasOpen&&row?.contains(document.activeElement);next._signature=signature;if(row)row.replaceWith(next);row=next;if(wasOpen){const menu=next.querySelector("[data-person-menu-content]"),trigger=next.querySelector("[data-person-menu]");if(menu&&trigger){menu.hidden=false;trigger.setAttribute("aria-expanded","true");if(restoreFocus)menu.querySelector("button")?.focus();}else state.openPersonMenu=null;}}
    if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);existing.delete(m.uid);
  }}
  for(const row of existing.values())row.remove();
  const confirmed=members.filter(m=>m.online===true).length;$('#onlineCount').textContent=state.membersError?'':String(confirmed);$('#memberCount').textContent=state.membersError?tr('Presença indisponível'):tr(`${confirmed} participante${confirmed===1?'':'s'}`);$('#peopleTabCount').hidden=!!state.membersError;if(!state.membersError)$('#peopleTabCount').textContent=String(confirmed);
}
function closePersonMenu(restoreFocus=false){
  const uid=state.openPersonMenu;if(!uid)return;
  const trigger=[...$('#peopleList').querySelectorAll('[data-person-menu]')].find(node=>node.dataset.personMenu===uid);
  const menu=[...$('#peopleList').querySelectorAll('[data-person-menu-content]')].find(node=>node.dataset.personMenuContent===uid);
  if(menu)menu.hidden=true;if(trigger){trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger.focus();}state.openPersonMenu=null;
}
function updateChatControls(){const enabled=Boolean(state.roomConnected&&state.user&&!state.chatSending);$('#chatInput').disabled=!enabled;$('#chatAttachButton').disabled=!enabled;$('#chatEmojiButton').disabled=!enabled;$('#chatSendButton').disabled=!enabled||(!$('#chatInput').value.trim()&&!state.chatMedia);$('#chatSendButton').setAttribute('aria-busy',String(state.chatSending));}
function chatTextHtml(value){return String(value||'').split(/(https:\/\/[^\s<>"']+)/g).map(part=>part.startsWith('https://')?`<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`:esc(part)).join('').replace(/\n/g,'<br>');}
function chatMessageNode(message,grouped){
  const own=message.uid===state.user?.uid,color=/^#[0-9a-f]{6}$/i.test(message.color||'')?message.color:'#9b83ff',name=message.nickname||'Jogador',photo=/^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(message.photo||'')?message.photo:'',initial=esc(name.trim().slice(0,1).toUpperCase());
  const rawTime=Number(message.createdAt),date=new Date(Number.isFinite(rawTime)&&rawTime>0&&rawTime<=8.64e15?rawTime:Date.now()),time=date.toLocaleTimeString(window.focoI18n?.locale()||'pt-BR',{hour:'2-digit',minute:'2-digit'}),fullTime=date.toLocaleString(window.focoI18n?.locale()||'pt-BR');
  const validMedia=/^data:image\/(?:webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(message.media||'');
  const avatar=photo?`<img class="chat-message-avatar" src="${esc(photo)}" alt="" loading="lazy">`:`<span class="chat-message-avatar chat-message-avatar-fallback" style="--message-accent:${esc(color)}">${initial}</span>`;
  const media=validMedia?`<button class="chat-media-thumb" type="button" data-chat-media="${esc(message.id)}" aria-label="${tr(message.kind==='gif'?'GIF animado':'Imagem')}"><img loading="lazy" src="${esc(message.media)}" alt="${tr(message.kind==='gif'?'GIF animado':'Imagem enviada')}">${message.kind==='gif'?'<span class="chat-gif-badge">GIF</span>':''}</button>`:'';
  const wrapper=document.createElement('div');wrapper.innerHTML=`<article class="chat-message ${own?'own':''} ${grouped?'grouped':''}" data-chat-id="${esc(message.id)}"><div class="chat-message-rail">${grouped?'':avatar}</div><div class="chat-message-body">${grouped?'':`<div class="chat-message-top"><strong style="--message-accent:${esc(color)}" data-no-translate>${esc(name)}</strong><time datetime="${date.toISOString()}" title="${esc(fullTime)}">${esc(time)}</time></div>`}${message.text?`<div class="chat-message-text">${chatTextHtml(message.text)}</div>`:''}${media}${message.kind!=='text'&&!validMedia?'<div class="chat-message-text">Anexo indisponível.</div>':''}</div>${own?`<button type="button" class="chat-delete" data-chat-delete="${esc(message.id)}" title="${tr('Remover mensagem')}" aria-label="${tr('Remover mensagem')}">${icon('x','icon-sm')}</button>`:''}</article>`;
  return wrapper.firstElementChild;
}
function renderRoomChat(){
  const root=$('#chatMessages');if(!root)return;
  $('#chatLoadStatus').hidden=!state.chatError;$('#chatLoadStatus').innerHTML=state.chatError?`<span>${tr('Não foi possível atualizar o chat.')}</span><button type="button" data-retry-chat${state.chatRetrying?' disabled':''}>${tr(state.chatRetrying?'Atualizando…':'Tentar novamente')}</button>`:'';
  if(!state.activeRoom){root.removeAttribute('aria-busy');root.innerHTML='<div class="chat-empty">Entre em uma sala para ver as mensagens.</div>';updateChatControls();updateChatUnread();return;}
  if(!state.chatLoaded){
    if(state.chatError){root.removeAttribute('aria-busy');root.replaceChildren();updateChatControls();return;}
    root.setAttribute('aria-busy','true');
    if(!root.querySelector('.chat-skeleton'))root.innerHTML='<div class="chat-skeleton skeleton-group" aria-hidden="true">'+[70,52,84].map(width=>`<div class="chat-skeleton-row"><span class="skeleton"></span><span><span class="skeleton skeleton-line" style="width:${width-40}%"></span><span class="skeleton skeleton-line" style="width:${width}%"></span></span></div>`).join('')+'</div><span class="sr-only">Carregando mensagens…</span>';
    updateChatControls();return;
  }
  root.removeAttribute('aria-busy');
  const items=state.chatMessages||[];if(!items.length){if(!root.querySelector('.chat-empty'))root.innerHTML='<div class="chat-empty">Nenhuma mensagem ainda.</div>';updateChatControls();updateChatUnread();return;}
  const pinned=chatAtBottom()||state.chatForceBottom,rootTop=root.getBoundingClientRect().top,anchor=!pinned?[...root.querySelectorAll('[data-chat-id]')].find(node=>node.getBoundingClientRect().bottom>rootTop+2):null,anchorId=anchor?.dataset.chatId,anchorOffset=anchor?.getBoundingClientRect().top-rootTop;
  let timeline=root.querySelector('.chat-timeline');if(!timeline){timeline=document.createElement('div');timeline.className='chat-timeline';root.replaceChildren(timeline);}
  const existing=new Map([...timeline.children].map(node=>[node.dataset.chatId,node]));
  for(let index=0;index<items.length;index++){
    const message=items[index],previous=items[index-1],stamp=Number(message.createdAt)||0,priorStamp=Number(previous?.createdAt)||0;
    const grouped=Boolean(previous&&previous.uid===message.uid&&stamp>=priorStamp&&stamp-priorStamp<=5*60*1000&&new Date(stamp).toDateString()===new Date(priorStamp).toDateString());
    const signature=JSON.stringify([message.uid,message.nickname,message.color,message.photo,message.kind,message.text,message.createdAt,grouped,window.focoI18n?.getLanguage()]);
    let node=existing.get(message.id);if(!node||node._signature!==signature||node._media!==message.media){const next=chatMessageNode(message,grouped);next._signature=signature;next._media=message.media;if(node)node.replaceWith(next);node=next;}
    if(timeline.children[index]!==node)timeline.insertBefore(node,timeline.children[index]||null);existing.delete(message.id);
  }
  for(const node of existing.values())node.remove();
  if(pinned)root.scrollTop=root.scrollHeight;
  else if(anchorId){const kept=[...timeline.children].find(node=>node.dataset.chatId===anchorId);if(kept)root.scrollTop+=kept.getBoundingClientRect().top-rootTop-anchorOffset;}
  state.chatForceBottom=false;updateChatControls();updateChatUnread();
}
function updateChatAttachment(){const holder=$('#chatAttachmentPreview');if(!state.chatMedia){holder.hidden=true;holder.innerHTML='';updateChatControls();return;}holder.hidden=false;holder.innerHTML=`<img src="${esc(state.chatMedia.data)}" alt="Prévia do anexo"><span>${esc(state.chatMedia.name)}</span><button type="button" class="chat-remove-attachment" id="chatRemoveAttachment" title="Remover anexo" aria-label="Remover anexo">${icon('x','icon-sm')}</button>`;holder.querySelector('#chatRemoveAttachment').onclick=()=>{state.chatMedia=null;$('#chatFileInput').value='';updateChatAttachment();};updateChatControls();}
function fileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error||new Error('file'));reader.onload=()=>resolve(String(reader.result||''));reader.readAsDataURL(file);});}
async function prepareChatImage(file){if(!file||!/^image\/(png|jpeg|webp|gif)$/i.test(file.type))throw new Error('Escolha uma imagem PNG, JPG, WebP ou GIF.');if(file.size>8*1024*1024)throw new Error('Envie imagens de até 8 MB; o Foco reduz antes de enviar.');if(file.type==='image/gif'){const data=await fileAsDataUrl(file);if(file.size>160*1024||data.length>220000)throw new Error('O arquivo precisa ter até 160 KB.');return{kind:'gif',data,name:file.name};}
  const bitmap=await createImageBitmap(file);let width=bitmap.width,height=bitmap.height,scale=Math.min(1,1280/Math.max(width,height));width=Math.max(1,Math.round(width*scale));height=Math.max(1,Math.round(height*scale));const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');for(let attempt=0;attempt<8;attempt++){canvas.width=width;canvas.height=height;ctx.clearRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);for(const quality of [.82,.72,.62,.52,.42]){const data=canvas.toDataURL('image/webp',quality);if(data.length<=220000){bitmap.close();return{kind:'image',data,name:file.name};}}width=Math.max(1,Math.round(width*.82));height=Math.max(1,Math.round(height*.82));}bitmap.close();throw new Error('A imagem ficou grande demais após a compressão.');}
function resizeChatInput(){const input=$('#chatInput');input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,116)}px`;}
function closeChatEmojiPicker(restoreFocus=false){$('#chatEmojiPicker').hidden=true;$('#chatEmojiButton').setAttribute('aria-expanded','false');if(restoreFocus)$('#chatEmojiButton').focus();}
function openChatEmojiPicker(){const panel=$('#chatEmojiPicker');const open=panel.hidden;if(!open){closeChatEmojiPicker(true);return;}panel.hidden=false;$('#chatEmojiButton').setAttribute('aria-expanded','true');panel.innerHTML=['😀','😂','🥹','😍','😎','🥳','🔥','💀','👏','❤️','👍','👀','😭','🎮','✨','✅'].map(emoji=>`<button type="button" class="chat-emoji" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('');panel.querySelector('button')?.focus();panel.onclick=event=>{const button=event.target.closest('[data-emoji]');if(!button)return;const input=$('#chatInput'),start=input.selectionStart,end=input.selectionEnd;input.setRangeText(button.dataset.emoji,start,end,'end');closeChatEmojiPicker();input.focus();resizeChatInput();updateChatControls();};}
$('#chatEmojiPicker').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeChatEmojiPicker(true);}});
async function sendChatMessage(){
  if(state.chatSending||!state.roomConnected||!state.activeRoom)return;
  const text=$('#chatInput').value.trim(),attachment=state.chatMedia,room=state.activeRoom;
  if(!text&&!attachment)return;
  if(Date.now()-state.lastChatSentAt<650)return;
  const operation={room,generation:state.p2pGeneration,userId:state.user?.uid};
  const current=()=>state.chatSendOperation===operation&&state.activeRoom===room&&state.p2pGeneration===operation.generation&&state.user?.uid===operation.userId;
  state.chatSendOperation=operation;state.chatSending=true;state.lastChatSentAt=Date.now();$('#chatSendStatus').hidden=false;$('#chatSendStatus').dataset.kind='pending';$('#chatSendStatus').textContent=tr('Enviando mensagem…');updateChatControls();
  try{
    const photo=await makeChatAvatar(state.profile?.photo||'');if(!current())return;
    await window.focoCloud.sendRoomChat(room,{kind:attachment?.kind||'text',text,media:attachment?.data||'',photo});
    if(!current())return;
    $('#chatInput').value='';$('#chatFileInput').value='';state.chatMedia=null;closeChatEmojiPicker();state.chatForceBottom=true;updateChatAttachment();resizeChatInput();
    const successToken=String(Date.now());$('#chatSendStatus').dataset.kind='success';$('#chatSendStatus').dataset.messageToken=successToken;$('#chatSendStatus').textContent=tr('Mensagem enviada.');setTimeout(()=>{if(state.activeRoom===room&&state.p2pGeneration===operation.generation&&$('#chatSendStatus').dataset.kind==='success'&&$('#chatSendStatus').dataset.messageToken===successToken)$('#chatSendStatus').hidden=true;},2200);
    $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;updateChatUnread();
  }catch(error){if(!current())return;state.lastChatSentAt=0;console.error('Envio do chat:',error);$('#chatSendStatus').dataset.kind='error';$('#chatSendStatus').textContent=tr(error?.code==='PERMISSION_DENIED'?'Publique as regras atualizadas do chat Firebase.':'Não foi possível enviar a mensagem.');}
  finally{if(state.chatSendOperation===operation){state.chatSendOperation=null;state.chatSending=false;updateChatControls();}}
}
async function makeChatAvatar(source){if(!source||!/^data:image\//i.test(source))return'';try{const image=await new Promise((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=reject;element.src=source;});const canvas=document.createElement('canvas'),scale=Math.min(1,40/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const thumbnail=canvas.toDataURL('image/jpeg',.55);return thumbnail.length<=16000?thumbnail:'';}catch{return'';}}
function avatarColor(seed='') { let n=0; for(const c of seed)n=(n*31+c.charCodeAt(0))>>>0; const hues=[182,215,270,320,25,145]; const hue=hues[n%hues.length]; return `linear-gradient(135deg,hsl(${hue} 55% 65%),hsl(${hue+35} 50% 40%))`; }
async function setTheaterMode(card) {
  const entering=state.theaterId!==card.dataset.stream;
  state.expandedId=null;document.querySelectorAll('.stream-card.expanded').forEach(item=>item.classList.remove('expanded'));
  document.querySelectorAll('.stream-card.theater').forEach(item=>item.classList.remove('theater'));
  state.theaterId=entering?card.dataset.stream:null;
  document.body.classList.toggle('theater-active',entering);
  if(entering)card.classList.add('theater');
  refreshStreamTiles();
  try { await window.focoDesktop.setFullscreen(entering); }
  catch(error) { console.warn('Native fullscreen failed:',error);toast('Não foi possível alternar para tela cheia.'); }
}
function setExpandedMode(card) {
  if(state.theaterId===card.dataset.stream){state.theaterId=null;document.body.classList.remove('theater-active');card.classList.remove('theater');window.focoDesktop.setFullscreen(false).catch(()=>{});}
  const entering=state.expandedId!==card.dataset.stream;
  document.querySelectorAll('.stream-card.expanded').forEach(item=>item.classList.remove('expanded'));
  state.expandedId=entering?card.dataset.stream:null;
  if(entering)card.classList.add('expanded');
  refreshStreamTiles();
}

// Stream tiles are reconciled by stream id (the publisher's peer id). A tile and its <video>
// live exactly as long as the entry in state.streams, so presence, profile and quality updates
// only touch metadata. Tiles never stop tracks: the media layer (calls, stopSharing) owns them.
const NO_FRAME_TIMEOUT_MS=5000;
const STATUS_TEXT={waiting:'Conectando ao vídeo…',stalled:'Aguardando vídeo',paused:'Vídeo pausado',ended:'Transmissão encerrada'};
// The i18n observer translates nodes when they are inserted, so each setter remembers the
// Portuguese source it last wrote and only rewrites when that source actually changes.
function setText(el,value){if(el.__source===value)return;el.__source=value;el.textContent=value;}
function setHTML(el,value){if(el.__source===value)return;el.__source=value;el.innerHTML=value;}
function setAttr(el,name,value){const sources=el.__attrs||(el.__attrs={});if(sources[name]===value)return;sources[name]=value;el.setAttribute(name,value);}
function setStyle(el,value){if(el.__style===value)return;el.__style=value;el.setAttribute('style',value);}
function playbackPrefs(id,entry=state.streams.get(id)){
  // Keyed by participant so a reconnecting publisher keeps the viewer's volume within the room.
  const key=entry?.uid||id;
  if(!state.playbackPrefs.has(key))state.playbackPrefs.set(key,{volume:75,muted:false});
  return state.playbackPrefs.get(key);
}
function qualityLabel(id,entry){const m=state.streamQualityMetrics.get(id);return m?.width&&m?.height?`${m.width}×${m.height}${m.fps?` · ${m.fps} FPS`:''}`:entry?.quality||'Qualidade indisponível';}
function qualityTitle(id){const m=state.streamQualityMetrics.get(id);if(!m)return 'Bitrate ajustado automaticamente conforme a conexão';return `Bitrate automático${m.bitrate?`: ${(m.bitrate/1_000_000).toFixed(1)} Mbps`:''}${m.rtt?` · latência ${Math.round(m.rtt)} ms`:''}${m.reason&&m.reason!=='none'?` · limite: ${m.reason==='cpu'?'desempenho do PC':m.reason==='bandwidth'?'rede':'codificador'}`:''}`;}
function closeStreamMenus(except){
  for(const tile of state.streamTiles.values())if(tile.menu!==except&&!tile.menu.hidden){tile.menu.hidden=true;tile.more.setAttribute('aria-expanded','false');}
}
function focusStream(id){
  if(!state.streams.has(id))return;
  state.focusedId=id;
  state.localFocusChosen=!!state.streams.get(id)?.local;
  state.displayMode='focus';
  setDisplayMode('focus');
}
function stageIds(){return [...state.streams.entries()].sort((a,b)=>Number(a[1].local)-Number(b[1].local)).map(([id])=>id);}
function cycleStage(direction){
  const ids=stageIds();if(ids.length<2)return;
  const index=ids.indexOf(state.focusedId);
  focusStream(ids[(index+direction+ids.length)%ids.length]);
  state.streamTiles.get(state.focusedId)?.card.focus();
}
function createStreamTile(id,entry){
  const card=document.createElement('article');card.className='stream-card';card.dataset.stream=id;card.tabIndex=0;
  card.innerHTML=`<div class="stream-visual"><video autoplay playsinline></video><div class="visual-shade"></div><div class="stream-status" role="status" hidden></div><span class="live-badge"><i></i> AO VIVO</span><span class="quality-badge"></span><button class="stream-expand">${icon('maximize-2','icon-sm')}<span></span></button><button class="stream-fullscreen" title="Tela cheia">${icon('fullscreen','icon-sm')}<span></span></button><div class="stream-volume" title="Volume da transmissão">${icon('volume','icon-sm')}<input type="range" min="0" max="100"><span></span></div><div class="local-mirror-cover" hidden>${icon('monitor')}<strong>Compartilhando a janela do Foco</strong><small>Prévia oculta para evitar espelhamento.</small></div></div><div class="stream-meta"><span class="person-avatar"></span><div class="stream-info"><strong></strong><small></small></div><div class="stream-actions">${entry.local?'<button type="button" class="stage-stop button button-danger">'+icon('square','icon-sm')+'<span>Parar transmissão</span></button>':''}<button class="card-more" title="Mais opções" aria-expanded="false">${icon('more')}</button><div class="stream-menu" role="menu" hidden><button type="button" role="menuitem" data-action="expand">${icon('maximize-2')}<span></span></button><button type="button" role="menuitem" data-action="fullscreen">${icon('fullscreen')}<span></span></button>${entry.local?'<button type="button" role="menuitem" data-action="stop" class="danger">'+icon('square')+'<span>Parar transmissão</span></button>':'<button type="button" role="menuitem" data-action="mute">'+icon('volume-x')+'<span></span></button><button type="button" role="menuitem" data-action="kick" class="danger" hidden>'+icon('user-x')+'<span>Expulsar e bloquear</span></button>'}</div></div></div>`;
  const $in=selector=>card.querySelector(selector);
  const tile={id,card,local:!!entry.local,video:$in('video'),status:$in('.stream-status'),quality:$in('.quality-badge'),expand:$in('.stream-expand'),fullscreen:$in('.stream-fullscreen'),volume:$in('.stream-volume input'),volumeLabel:$in('.stream-volume span'),avatar:$in('.person-avatar'),name:$in('.stream-info strong'),info:$in('.stream-info small'),more:$in('.card-more'),menu:$in('.stream-menu'),stream:null,call:null,mediaAbort:null,noFrameTimer:null,frameRequest:null,firstFrame:false,failure:null,mediaState:''};
  if(tile.local)tile.video.muted=true;
  card.addEventListener('click',e=>{
    if(e.target.closest('input,button,.stream-menu'))return;
    closeStreamMenus();
    // A click is a user gesture, so it can also resume a video the browser refused to start.
    if(tile.stream&&tile.video.paused)tile.video.play().catch(()=>{});
    focusStream(id);
  });
  card.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===card){e.preventDefault();focusStream(id);}});
  $in('.stage-stop')?.addEventListener('click',e=>{e.stopPropagation();stopSharing();});
  tile.fullscreen.addEventListener('click',e=>{e.stopPropagation();setTheaterMode(card);});
  tile.expand.addEventListener('click',e=>{e.stopPropagation();setExpandedMode(card);});
  $in('.stream-visual').addEventListener('dblclick',e=>{if(!e.target.closest('button,input'))setTheaterMode(card);});
  tile.volume.addEventListener('input',e=>{
    const level=Math.min(100,Math.max(0,Math.round(Number(e.target.value))||0));
    playbackPrefs(id).volume=level;applyPlayback(tile);
  });
  tile.more.addEventListener('click',e=>{
    e.stopPropagation();closeStreamMenus(tile.menu);
    tile.menu.hidden=!tile.menu.hidden;tile.more.setAttribute('aria-expanded',String(!tile.menu.hidden));
    if(!tile.menu.hidden)tile.menu.querySelector('button:not([hidden])')?.focus();
  });
  tile.menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();tile.menu.hidden=true;tile.more.setAttribute('aria-expanded','false');tile.more.focus();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const items=[...tile.menu.querySelectorAll('button:not([hidden])')];if(!items.length)return;
    event.preventDefault();const index=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();
  });
  tile.menu.addEventListener('click',e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;
    if(!action)return;
    e.stopPropagation();tile.menu.hidden=true;tile.more.setAttribute('aria-expanded','false');
    const current=state.streams.get(id);if(!current)return;
    if(action==='fullscreen')setTheaterMode(card);
    if(action==='expand')setExpandedMode(card);
    if(action==='mute'){const prefs=playbackPrefs(id);prefs.muted=!prefs.muted;applyPlayback(tile);}
    if(action==='stop'&&current.local)stopSharing();
    if(action==='kick'&&!current.local&&state.isHost){
      const room=currentRoom(),ownerId=current.ownerId;
      if(room)confirmedRoomAction(`kick:${room.code}:${ownerId}`,{title:'Remover participante?',message:`${current.name} · ${tr('Esta pessoa será expulsa e bloqueada nesta sala.')}`,confirm:'Expulsar e bloquear',cancel:'Cancelar'},()=>currentRoom()?.code===room.code&&state.user?.uid===room.ownerUid&&state.streams.get(id)?.ownerId===ownerId,()=>kickMember(ownerId));
    }
  });
  return tile;
}
function applyPlayback(tile){
  const prefs=playbackPrefs(tile.id);
  tile.video.volume=prefs.volume/100;tile.video.muted=tile.local||prefs.muted;
  if(Number(tile.volume.value)!==prefs.volume)tile.volume.value=String(prefs.volume);
  setText(tile.volumeLabel,prefs.volume+'%');
  const mute=tile.menu.querySelector('[data-action="mute"] span');if(mute)setText(mute,prefs.muted?'Ativar áudio':'Silenciar áudio');
}
// Real media signals only: first decoded frame, element playback, track mute/ended and the
// call's ICE connection state. Nothing here is inferred from presence announcements.
function tileMediaState(tile){
  if(tile.failure)return 'failed';
  const tracks=tile.stream?.getVideoTracks()||[];
  if(tracks.length&&tracks.every(track=>track.readyState==='ended'))return 'ended';
  if(!tile.firstFrame)return 'waiting';
  const connection=tile.call?.peerConnection?.connectionState;
  if(tracks.some(track=>track.muted)||connection==='disconnected'||connection==='failed')return 'stalled';
  return tile.video.paused?'paused':'live';
}
function refreshTileMediaState(tile){
  const next=tileMediaState(tile);if(next===tile.mediaState)return;
  tile.mediaState=next;tile.card.dataset.mediaState=next;
  const text=STATUS_TEXT[next];tile.status.hidden=!text;if(text)setText(tile.status,text);
}
function setTileFailure(tile,message,recoverable=false){
  if(tile.failure&&!tile.failure.recoverable)return;
  tile.failure={message,recoverable};tile.card.querySelector('.stream-error')?.remove();showStreamError(tile.card,message);refreshTileMediaState(tile);
}
function stopTileMediaWatch(tile){
  tile.mediaAbort?.abort();tile.mediaAbort=null;
  clearTimeout(tile.noFrameTimer);tile.noFrameTimer=null;
  if(tile.frameRequest!==null){tile.video.cancelVideoFrameCallback?.(tile.frameRequest);tile.frameRequest=null;}
}
function attachTileMedia(tile,entry){
  stopTileMediaWatch(tile);
  const stream=entry.stream,video=tile.video,controller=new AbortController(),signal=controller.signal;
  tile.mediaAbort=controller;tile.stream=stream;tile.call=entry.call||null;tile.firstFrame=false;tile.failure=null;
  tile.card.querySelector('.stream-error')?.remove();
  applyPlayback(tile);video.srcObject=stream;
  const isCurrent=()=>tile.stream===stream&&!signal.aborted;
  const onFirstFrame=()=>{
    tile.frameRequest=null;if(!isCurrent()||tile.firstFrame)return;
    tile.firstFrame=true;clearTimeout(tile.noFrameTimer);tile.noFrameTimer=null;
    if(tile.failure?.recoverable){tile.failure=null;tile.card.querySelector('.stream-error')?.remove();}
    refreshTileMediaState(tile);
  };
  if(video.requestVideoFrameCallback)tile.frameRequest=video.requestVideoFrameCallback(onFirstFrame);
  video.addEventListener('loadeddata',()=>{if(video.videoWidth)onFirstFrame();},{signal});
  video.addEventListener('loadedmetadata',()=>video.play().catch(error=>{if(!isCurrent())return;console.warn('Reprodução da transmissão:',error);setTileFailure(tile,'O navegador não conseguiu iniciar o vídeo. Clique na transmissão para tentar novamente.',true);}),{signal});
  for(const type of ['playing','pause'])video.addEventListener(type,()=>{if(type==='playing'&&tile.failure?.recoverable&&tile.firstFrame){tile.failure=null;tile.card.querySelector('.stream-error')?.remove();}refreshTileMediaState(tile);},{signal});
  video.addEventListener('error',()=>{if(isCurrent())setTileFailure(tile,'Não foi possível decodificar o vídeo recebido. Peça para iniciar a transmissão novamente.');},{signal});
  for(const track of stream.getVideoTracks())for(const type of ['mute','unmute','ended'])track.addEventListener(type,()=>refreshTileMediaState(tile),{signal});
  tile.call?.peerConnection?.addEventListener?.('connectionstatechange',()=>refreshTileMediaState(tile),{signal});
  video.play().catch(error=>{if(!entry.local)console.warn('Autoplay remoto:',error);});
  if(!entry.local&&stream.getVideoTracks().length)tile.noFrameTimer=setTimeout(()=>{tile.noFrameTimer=null;if(isCurrent()&&!tile.firstFrame)setTileFailure(tile,'A transmissão está conectada, mas ainda não chegou imagem. Peça para compartilhar novamente.',true);},NO_FRAME_TIMEOUT_MS);
  if(entry.mediaIssue)setTileFailure(tile,entry.mediaIssue);
  refreshTileMediaState(tile);
}
function updateStreamTile(tile,entry){
  const id=tile.id,expanded=state.expandedId===id,theater=state.theaterId===id;
  const focused=state.focusedId===id;
  tile.card.classList.toggle('is-focused',focused);tile.card.classList.toggle('is-local',tile.local);tile.card.classList.toggle('expanded',expanded);tile.card.classList.toggle('theater',theater);
  tile.card.style.order=focused?'-1':'';
  setAttr(tile.card,'aria-label',`${entry.name} · ${entry.appName||'Compartilhamento'}`);
  setAttr(tile.card,'aria-current',focused?'true':'false');
  setText(tile.quality,qualityLabel(id,entry));setAttr(tile.quality,'title',qualityTitle(id));
  const expandTitle=expanded?'Voltar ao tamanho normal':'Ampliar transmissão';
  setAttr(tile.expand,'title',tr(expandTitle));setAttr(tile.expand,'aria-label',tr(expandTitle));setText(tile.expand.querySelector('span'),expanded?'Voltar':'Ampliar');
  setAttr(tile.fullscreen,'aria-label',`${tr(theater?'Sair da tela cheia':'Abrir em tela cheia')} · ${entry.name}`);setText(tile.fullscreen.querySelector('span'),theater?'Sair da tela cheia':'Tela cheia');
  setAttr(tile.volume,'aria-label',`${tr('Volume da transmissão')} · ${entry.name}`);setAttr(tile.more,'aria-label',`${tr('Mais opções')} · ${entry.name}`);
  const hasAudio=!!entry.stream?.getAudioTracks().length;
  tile.volume.parentElement.hidden=!hasAudio;
  const muteAction=tile.menu.querySelector('[data-action="mute"]');if(muteAction)muteAction.hidden=!hasAudio;
  const owner=entry.local?state.isHost:entry.uid===state.currentRoomData?.ownerUid;
  const safeColor=/^#[0-9a-f]{6}$/i.test(entry.color||'')?entry.color:avatarColor(id);
  setStyle(tile.avatar,entry.photo?`background:center/cover url('${esc(entry.photo)}')`:`background:${safeColor}`);setText(tile.avatar,entry.photo?'':entry.name.slice(0,1).toUpperCase());
  setHTML(tile.name,`${esc(entry.name)}${entry.local?' (você)':''}${owner?'<span class="owner-crown" role="img" title="Dono da sala" aria-label="Dono da sala">'+icon('crown','icon-sm')+'</span>':''}`);
  setText(tile.info,`${entry.appName||'Compartilhamento'} · ${entry.sourceType||'TELA'}`);
  const mirror=tile.card.querySelector('.local-mirror-cover');if(mirror)mirror.hidden=!(entry.local&&entry.sourceType==='Janela'&&/\bfoco\b/i.test(entry.sourceName||''));
  setText(tile.menu.querySelector('[data-action="expand"] span'),expanded?'Voltar ao tamanho normal':'Ampliar');
  setText(tile.menu.querySelector('[data-action="fullscreen"] span'),theater?'Sair da tela cheia':'Abrir em tela cheia');
  const kick=tile.menu.querySelector('[data-action="kick"]');if(kick)kick.hidden=!state.isHost;
  applyPlayback(tile);
}
function destroyStreamTile(tile){
  stopTileMediaWatch(tile);
  // Detach only: the tracks belong to the call or to the local capture and are stopped there.
  tile.video.pause();tile.video.srcObject=null;tile.stream=null;tile.call=null;
  tile.card.remove();state.streamTiles.delete(tile.id);
}
function refreshStreamTiles(){for(const [id,tile] of state.streamTiles){const entry=state.streams.get(id);if(entry)updateStreamTile(tile,entry);}}
function updatePendingTile(uid,member){
  let card=state.pendingTiles.get(uid);
  if(!card){
    card=document.createElement('article');card.className='stream-card pending-stream';card.dataset.pendingUid=uid;
    card.innerHTML=`<div class="stream-visual"><div class="pending-stream-message">${icon('loader','icon-spin')}<strong></strong><small>Conectando ao vídeo…</small><button type="button" class="manage-small" data-retry-uid="${esc(uid)}">Tentar reconectar vídeo</button></div></div><div class="stream-meta"><span class="person-avatar"></span><div class="stream-info"><strong></strong><small></small></div></div>`;
    card.querySelector('[data-retry-uid]').addEventListener('click',()=>{const m=state.members.get(uid);if(!m)return;const connection=state.dataConnections.get(m.peerId);if(connection?.open){connection.send({type:'retry-stream'});toast('Pedido de reconexão enviado.');}else{ensureDataConnection(uid,m.peerId);toast('Reconectando ao participante…');}});
    state.pendingTiles.set(uid,card);
  }
  // Announced by presence only, or a call already arrived and its media is being negotiated.
  card.dataset.mediaState=state.incomingCalls.has(member.peerId)?'connecting':'announced';
  const name=member.nickname||member.username;
  setText(card.querySelector('.pending-stream-message strong'),tr(`${name} está transmitindo`));
  setStyle(card.querySelector('.person-avatar'),member.photo?`background:center/cover url('${esc(member.photo)}')`:`background:${esc(member.color||avatarColor(uid))}`);
  setText(card.querySelector('.person-avatar'),member.photo?'':(member.nickname||'?').slice(0,1).toUpperCase());
  setText(card.querySelector('.stream-info strong'),name);setText(card.querySelector('.stream-info small'),`${tr('Aguardando vídeo')} · ${member.status||tr('Online')}`);
  return card;
}
let streamsEmptyState=null;
function updateStageGeometry(){
  const stage=$('#stage'),grid=$('#streamGrid'),width=stage.clientWidth,height=Math.max(0,stage.clientHeight-44);
  if(!width||!height)return;
  grid.dataset.orientation=width>=height*1.35?'wide':'tall';
  const count=Number(grid.dataset.count)||0;
  let best=1,bestArea=0;
  for(let cols=1;cols<=Math.min(count,5);cols++){
    const rows=Math.ceil(count/cols),cellWidth=(width-8*(cols-1))/cols,videoHeight=(height-8*(rows-1))/rows-44;
    if(videoHeight<=0)continue;
    const fittedWidth=Math.min(cellWidth,videoHeight*16/9),fittedHeight=Math.min(videoHeight,cellWidth*9/16);
    const area=fittedWidth*fittedHeight;
    if(area>bestArea){bestArea=area;best=cols;}
  }
  grid.style.setProperty('--grid-cols',String(best));
}
function renderStreams() {
  const entries=[...state.streams.entries()];
  if(!entries.length)state.localFocusChosen=false;
  if(!state.focusedId||!state.streams.has(state.focusedId))state.focusedId=stageIds()[0]||null;
  if(state.streams.get(state.focusedId)?.local&&!state.localFocusChosen){
    const remote=stageIds().find(id=>!state.streams.get(id)?.local);if(remote)state.focusedId=remote;
  }
  if(state.theaterId&&!state.streams.has(state.theaterId)) {
    state.theaterId=null;document.body.classList.remove('theater-active');window.focoDesktop.setFullscreen(false).catch(()=>{});
  }
  if(state.expandedId&&!state.streams.has(state.expandedId)){
    state.expandedId=null;
  }
  for(const tile of [...state.streamTiles.values()]){const entry=state.streams.get(tile.id);if(!entry||!!entry.local!==tile.local)destroyStreamTile(tile);}
  const nodes=[];
  for(const [id,entry] of entries){
    let tile=state.streamTiles.get(id);
    if(!tile){tile=createStreamTile(id,entry);state.streamTiles.set(id,tile);}
    if(tile.stream!==entry.stream||tile.call!==(entry.call||null))attachTileMedia(tile,entry);
    updateStreamTile(tile,entry);nodes.push(tile.card);
  }
  const pending=[...state.members.entries()].filter(([uid,member])=>member.streaming&&!entries.some(([,stream])=>stream.uid===uid||stream.ownerId===member.peerId));
  const pendingIds=new Set(pending.map(([uid])=>uid));
  for(const [uid,card] of state.pendingTiles)if(!pendingIds.has(uid)){card.remove();state.pendingTiles.delete(uid);}
  for(const [uid,member] of pending)nodes.push(updatePendingTile(uid,member));
  if(!nodes.length){
    if(!streamsEmptyState){streamsEmptyState=document.createElement('div');streamsEmptyState.className='streams-empty';streamsEmptyState.innerHTML=icon('monitor')+'<strong>Ninguém está transmitindo ainda</strong><small>Quando alguém compartilhar a tela, ela aparece aqui.</small><div class="empty-actions"><button type="button" class="button button-primary" id="stageShare">'+icon('monitor-up','icon-sm')+'<span>Compartilhar tela</span></button><button type="button" class="button button-quiet" id="stageInvite">'+icon('link','icon-sm')+'<span>Copiar link de convite</span></button></div>';streamsEmptyState.querySelector('#stageShare').onclick=()=>$('#shareButton').click();streamsEmptyState.querySelector('#stageInvite').onclick=()=>$('#inviteButton').click();}
    streamsEmptyState.querySelector('#stageShare').disabled=!state.canStream||!state.peer?.open;
    nodes.push(streamsEmptyState);
  }
  // Place nodes in order, moving only those out of position. A move happens within one task,
  // so a playing <video> keeps playing; untouched tiles are not moved at all.
  const grid=$('#streamGrid');
  for(const child of [...grid.children])if(!nodes.includes(child))child.remove();
  nodes.forEach((node,index)=>{if(grid.children[index]!==node)grid.insertBefore(node,grid.children[index]||null);});
  grid.classList.toggle('grid-view',state.displayMode==='grid');
  grid.dataset.count=String(nodes[0]===streamsEmptyState?0:nodes.length);
  grid.dataset.localOnly=String(entries.length===1&&!!entries[0][1].local&&pending.length===0);
  grid.style.setProperty('--strip-cols',String(Math.min(Math.max(nodes.length-1,1),5)));
  $('#streamCount').textContent=entries.length+pending.length;
  updateStageGeometry();
}
async function sampleStreamQuality(streamId,stream){
  const calls=stream.local?[...state.calls.values()]:[...state.incomingCalls.values()].filter(call=>call.peer===streamId||call.metadata?.ownerId===streamId);
  const samples=[];
  for(const call of calls){
    const pc=call.peerConnection;if(!pc||pc.connectionState==='closed')continue;
    try{
      const report=await pc.getStats();let bytes=0,width=0,height=0,fps=0,reason='none',rtt=0,mediaFound=false;
      for(const item of report.values()){
        const videoStat=(item.type==='outbound-rtp'||item.type==='inbound-rtp')&&(item.kind==='video'||item.mediaType==='video');
        if(videoStat){mediaFound=true;const byteValue=Number(stream.local?item.bytesSent:item.bytesReceived)||0;bytes+=byteValue;width=Math.max(width,Number(item.frameWidth)||0);height=Math.max(height,Number(item.frameHeight)||0);fps=Math.max(fps,Number(item.framesPerSecond)||0);if(item.qualityLimitationReason)reason=item.qualityLimitationReason;
          const sampleKey=`${streamId}:${call.peer}:${item.id}`,previous=state.qualitySamples.get(sampleKey);if(previous&&item.timestamp>previous.timestamp&&byteValue>=previous.bytes){const rate=(byteValue-previous.bytes)*8/((item.timestamp-previous.timestamp)/1000);samples.push({bitrate:rate,width:Number(item.frameWidth)||0,height:Number(item.frameHeight)||0,fps:Number(item.framesPerSecond)||0,reason:item.qualityLimitationReason||'none'});}state.qualitySamples.set(sampleKey,{bytes:byteValue,timestamp:item.timestamp});}
        if(item.type==='candidate-pair'&&item.state==='succeeded'&&item.nominated)rtt=Math.max(rtt,(Number(item.currentRoundTripTime)||0)*1000);
      }
      if(mediaFound)samples.push({width,height,fps,reason,rtt});
    }catch(error){console.debug('Estatísticas de transmissão indisponíveis:',error);}
  }
  if(!samples.length)return;
  const metric={width:Math.max(...samples.map(s=>s.width||0)),height:Math.max(...samples.map(s=>s.height||0)),fps:Math.round(Math.max(...samples.map(s=>s.fps||0))),bitrate:samples.reduce((sum,s)=>sum+(s.bitrate||0),0),rtt:Math.max(...samples.map(s=>s.rtt||0)),reason:samples.find(s=>s.reason&&s.reason!=='none')?.reason||'none'};
  // Stats are async: ignore results for a stream that was removed or replaced meanwhile.
  if(state.streams.get(streamId)!==stream)return;
  state.streamQualityMetrics.set(streamId,metric);
  const tile=state.streamTiles.get(streamId);if(tile){setText(tile.quality,qualityLabel(streamId,stream));setAttr(tile.quality,'title',qualityTitle(streamId));}
}
function refreshStreamQuality(){for(const [id,stream] of state.streams)sampleStreamQuality(id,stream);}
function showStreamError(card,message){if(!card||card.querySelector('.stream-error'))return;const panel=document.createElement('div');panel.className='stream-error';panel.setAttribute('role','status');panel.textContent=tr(message);card.querySelector('.stream-visual')?.append(panel);}
const P2P_AUTH_WAIT_MS=4000;
const P2P_VERIFY_MS=5000;
function p2pContext(peer=state.peer){return {peer,room:state.activeRoom,userId:state.user?.uid,generation:state.p2pGeneration};}
function sameRoomIdentity(context){return !!(context.peer&&state.peer===context.peer&&state.activeRoom===context.room&&state.user?.uid===context.userId&&state.p2pGeneration===context.generation);}
function sameP2PSession(context){return sameRoomIdentity(context)&&state.roomConnected;}
function currentP2P(context){return sameP2PSession(context)&&state.ownMember?.peerId===context.peer.id;}
function memberForPeer(peerId){let found=null;for(const [uid,member] of state.members)if(member.peerId===peerId&&member.online!==false){if(found)return null;found={uid,member};}return found;}
function revokePeer(peerId){
  const outgoing=state.calls.get(peerId),incoming=state.incomingCalls.get(peerId),playing=state.streams.get(peerId)?.call,conn=state.dataConnections.get(peerId);
  if(outgoing){state.calls.delete(peerId);outgoing.close();}
  if(incoming){state.incomingCalls.delete(peerId);incoming.close();}
  if(playing&&playing!==incoming)playing.close();
  if(conn){state.dataConnections.delete(peerId);conn.close();}
  state.pendingOutgoingCalls.delete(peerId);state.lastRetryAt.delete(peerId);
  removeRemoteStream(peerId);
}
async function authorizePeer(peerId,context,{publishing=false,localPublishing=false}={}){
  if(typeof peerId!=='string'||!peerId||peerId===context.peer?.id||!sameP2PSession(context))return null;
  const deadline=Date.now()+P2P_AUTH_WAIT_MS;
  while(!state.membersLoaded&&sameP2PSession(context)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  if(!state.membersLoaded||!currentP2P(context))return null;
  const found=memberForPeer(peerId);
  if(!found||publishing&&found.member.canStream===false||localPublishing&&state.ownMember?.canStream===false||typeof window.focoCloud?.verifyRoomPeer!=='function')return null;
  let timeoutId;
  try{
    const result=await Promise.race([Promise.all([
      window.focoCloud.verifyRoomPeer(context.room,found.uid,peerId),
      localPublishing?window.focoCloud.verifyRoomPeer(context.room,context.userId,context.peer.id):Promise.resolve(null)
    ]),new Promise(resolve=>{timeoutId=setTimeout(()=>resolve(null),P2P_VERIFY_MS);})]);
    if(!result)return null;
    const [verified,localVerified]=result;
    const latest=memberForPeer(peerId);
    return currentP2P(context)&&latest?.uid===found.uid&&latest.member===found.member&&verified?.uid===found.uid&&verified.peerId===peerId&&(!publishing||verified.canStream!==false&&latest.member.canStream!==false)&&(!localPublishing||localVerified?.uid===context.userId&&localVerified.peerId===context.peer.id&&localVerified.canStream!==false&&state.ownMember?.canStream!==false)?latest:null;
  }catch(error){console.warn('Autorização P2P indisponível:',error);return null;}
  finally{clearTimeout(timeoutId);}
}
function sendToAll(message) { for(const [peerId,conn] of state.dataConnections) if(conn.open&&memberForPeer(peerId)) conn.send(message); }
function handleData(conn,peer=state.peer) {
  const context=p2pContext(peer);
  if(!conn||typeof conn.peer!=='string'||!conn.peer||!context.room||!context.peer){conn?.close?.();return;}
  const previous=state.dataConnections.get(conn.peer);
  if(previous&&previous!==conn)previous.close();
  state.dataConnections.set(conn.peer,conn);
  // An early connection may precede the first membership snapshot. It has no privileges while pending.
  authorizePeer(conn.peer,context).then(member=>{if(!member&&state.dataConnections.get(conn.peer)===conn){state.dataConnections.delete(conn.peer);conn.close();}});
  conn.on('data',async message=>{
    if(state.dataConnections.get(conn.peer)!==conn||!sameP2PSession(context))return;
    if(!message||typeof message!=='object'||Array.isArray(message)||typeof message.type!=='string')return;
    if(!['hello','retry-stream','publisher-start','publisher-stop'].includes(message.type))return;
    if(message.peerId!==undefined&&message.peerId!==conn.peer||message.roomId!==undefined&&message.roomId!==context.room){conn.close();return;}
    const member=await authorizePeer(conn.peer,context,{publishing:message.type==='publisher-start'});
    if(!member||state.dataConnections.get(conn.peer)!==conn){if(state.dataConnections.get(conn.peer)===conn)conn.close();return;}
    if(message.userId!==undefined&&message.userId!==member.uid){conn.close();return;}
    if(message.type==='hello'){if(state.isHost)toast(`${member.member.nickname||member.member.name} entrou na sala`);return;}
    if(message.type==='retry-stream'){if(state.localStream)await ensureCall(conn.peer,state.localStream,{replace:true,context});return;}
    if(message.type==='publisher-start'){member.member.streaming=true;renderPeople();toast(`${member.member.nickname||member.member.name} começou a transmitir`);return;}
    const current=state.streams.get(conn.peer);
    if(current&&!current.local)removeRemoteStream(conn.peer);
    member.member.streaming=false;renderPeople();
  });
  conn.on('close',()=>{if(state.dataConnections.get(conn.peer)===conn){state.dataConnections.delete(conn.peer);renderPeople();}});
}
function ensureDataConnection(uid,peerId) {
  if(!state.peer||!uid||!peerId||uid===state.user?.uid||peerId===state.peer.id||state.dataConnections.has(peerId))return;
  if(state.user.uid.localeCompare(uid)>0)return;
  const conn=state.peer.connect(peerId,{reliable:true,metadata:{name:state.nickname,userId:state.user.uid}});
  handleData(conn);conn.on('open',()=>{if(state.dataConnections.get(peerId)===conn)conn.send({type:'hello'});});
}
function ensureCall(peerId,stream=state.localStream,{replace=false,context=p2pContext()}={}){
  if(!stream||state.localStream!==stream||!currentP2P(context)||!memberForPeer(peerId))return Promise.resolve(null);
  if(state.pendingOutgoingCalls.has(peerId))return state.pendingOutgoingCalls.get(peerId);
  if(!replace&&state.calls.has(peerId))return Promise.resolve(state.calls.get(peerId));
  if(replace){const last=state.lastRetryAt.get(peerId)||0;if(Date.now()-last<1000)return Promise.resolve(state.calls.get(peerId)||null);state.lastRetryAt.set(peerId,Date.now());}
  const operation=(async()=>{
    const member=await authorizePeer(peerId,context,{localPublishing:true});
    if(!member||state.localStream!==stream||!currentP2P(context))return null;
    if(replace){const old=state.calls.get(peerId);if(old){state.calls.delete(peerId);old.close();}}
    else if(state.calls.has(peerId))return state.calls.get(peerId);
    if(!memberForPeer(peerId)||!currentP2P(context)||state.localStream!==stream)return null;
    let call;
    try{call=context.peer.call(peerId,stream,{metadata:{name:state.nickname,userId:state.user?.uid,roomId:context.room,appName:state.localSource?.audioName||state.localSource?.name||'Aplicativo',sourceType:state.localSource?.type==='screen'?'Tela inteira':'Janela',quality:state.localQuality,hasAudio:stream.getAudioTracks().length>0,ownerId:context.peer.id}});}
    catch(error){console.warn('Não foi possível iniciar chamada P2P:',error);return null;}
    if(!call)return null;
    state.calls.set(peerId,call);watchMediaConnection(call);configureCallQuality();call.on('close',()=>{if(state.calls.get(peerId)===call){state.calls.delete(peerId);configureCallQuality();}});call.on('error',err=>{if(!currentP2P(context)||state.calls.get(peerId)!==call)return;console.error('Falha na chamada de vídeo:',err);toast('Falha ao conectar o vídeo. Tentando recuperar a transmissão.');});
    return call;
  })();
  state.pendingOutgoingCalls.set(peerId,operation);
  operation.finally(()=>{if(state.pendingOutgoingCalls.get(peerId)===operation)state.pendingOutgoingCalls.delete(peerId);});
  return operation;
}
function watchMediaConnection(call){
  const context=p2pContext();
  const connection=call.peerConnection;if(!connection)return;
  connection.addEventListener('connectionstatechange',()=>{
    if(!currentP2P(context)||!memberForPeer(call.peer)||state.calls.get(call.peer)!==call&&state.incomingCalls.get(call.peer)!==call)return;
    if(connection.connectionState==='connected'){state.recoveryAttempts.delete(call.peer);setRoomStatus('Vídeo conectado · P2P',true);return;}
    if(connection.connectionState==='disconnected'){setRoomStatus('Vídeo instável · aguardando rede');return;}
    if(connection.connectionState!=='failed')return;
    setRoomStatus('Vídeo interrompido · tentando recuperar');toast('A conexão de vídeo caiu. O Foco vai tentar reconectar.');
    const attempts=state.recoveryAttempts.get(call.peer)||0;if(attempts>=2)return;state.recoveryAttempts.set(call.peer,attempts+1);
    const timer=setTimeout(()=>{state.recoveryTimers.delete(timer);if(!currentP2P(context)||state.incomingCalls.get(call.peer)!==call&&state.calls.get(call.peer)!==call)return;const member=memberForPeer(call.peer)?.member;const connection=state.dataConnections.get(call.peer);if(member?.streaming&&connection?.open&&!state.streams.has(call.peer))connection.send({type:'retry-stream'});},1800);
    state.recoveryTimers.add(timer);
  });
}
function configureCallQuality(){
  const profile=QUALITY_PROFILES[state.localQualityProfile]||QUALITY_PROFILES['720p60'];
  const calls=[...state.calls.values()].filter(call=>call.peerConnection&&call.peerConnection.connectionState!=='closed');
  const perPeerCeiling=Math.max(500_000,Math.floor(profile.aggregateBitrate/Math.max(1,calls.length)));
  for(const call of calls){
    const previous=state.qualityTimers.get(call);if(previous)clearInterval(previous);
    let tries=0;const timer=setInterval(async()=>{
      tries++;const sender=call.peerConnection?.getSenders().find(item=>item.track?.kind==='video');
      if(!sender){if(tries>=30){clearInterval(timer);state.qualityTimers.delete(call);}return;}
      try{
        const params=sender.getParameters();if(!params.encodings?.length){if(tries>=30){clearInterval(timer);state.qualityTimers.delete(call);}return;}
        params.encodings[0].maxBitrate=perPeerCeiling;params.encodings[0].maxFramerate=profile.fps;
        params.encodings[0].priority='high';params.degradationPreference='maintain-resolution';
        await sender.setParameters(params);clearInterval(timer);state.qualityTimers.delete(call);
      }catch(error){if(tries>=30){clearInterval(timer);state.qualityTimers.delete(call);}else console.debug('Ajuste automático de qualidade pendente:',error);}
    },350);
    state.qualityTimers.set(call,timer);
  }
}
async function handleCall(call,peer=state.peer) {
  const context=p2pContext(peer);
  if(!call||typeof call.peer!=='string'||!call.peer){call?.close?.();return;}
  const previous=state.incomingCalls.get(call.peer);
  state.incomingCalls.set(call.peer,call);
  const member=await authorizePeer(call.peer,context,{publishing:true});
  const meta=call.metadata;
  if(!member||state.incomingCalls.get(call.peer)!==call||meta&&typeof meta==='object'&&(
    meta.userId!==undefined&&meta.userId!==member.uid||meta.ownerId!==undefined&&meta.ownerId!==call.peer||meta.roomId!==undefined&&meta.roomId!==context.room
  )){if(state.incomingCalls.get(call.peer)===call){if(previous&&!previous.closed)state.incomingCalls.set(call.peer,previous);else state.incomingCalls.delete(call.peer);}call.close();return;}
  try{call.answer();}catch(error){console.error('Não foi possível responder à chamada:',error);toast('Não foi possível aceitar a transmissão recebida.');call.close();return;}
  const connection=call.peerConnection;watchMediaConnection(call);
  call.on('stream',stream=>{
    if(state.incomingCalls.get(call.peer)!==call||!currentP2P(context)||memberForPeer(call.peer)?.uid!==member.uid)return;
    if(!stream?.getVideoTracks?.().length){call.close();state.incomingCalls.delete(call.peer);const active=memberForPeer(call.peer);if(active)active.member.streaming=true;renderStreams();toast(`${active?.member.nickname||'Participante'} conectou sem enviar vídeo. O Foco vai solicitar uma nova tentativa.`);const data=state.dataConnections.get(call.peer);if(data?.open)data.send({type:'retry-stream'});return;}
    const profile=memberForPeer(call.peer)?.member||{};state.streams.set(call.peer,{stream,name:profile.nickname||'Participante',appName:typeof meta?.appName==='string'?meta.appName.slice(0,80):'Compartilhamento',sourceType:typeof meta?.sourceType==='string'?meta.sourceType.slice(0,40):'TELA',ownerId:call.peer,uid:member.uid,quality:typeof meta?.quality==='string'?meta.quality.slice(0,40):'Conexão direta',photo:profile.photo||'',color:profile.color,call});
    profile.streaming=true;renderStreams();renderPeople();if(previous&&previous!==call)previous.close();
  });
  call.on('close',()=>{
    if(state.incomingCalls.get(call.peer)===call)state.incomingCalls.delete(call.peer);
    if(!sameRoomIdentity(context))return;
    // A late close from a replaced call must not remove the media of its replacement.
    const id=call.peer,current=state.streams.get(id);
    if(current?.call&&current.call!==call)return;
    removeRemoteStream(id);
  });
  call.on('error',err=>{if(!currentP2P(context)||state.incomingCalls.get(call.peer)!==call)return;console.error('Falha na mídia recebida:',err);toast('O vídeo do participante não conectou. Tente iniciar a transmissão novamente.');});
}
function removeRemoteStream(peerId) { state.streams.delete(peerId);state.streamQualityMetrics.delete(peerId);for(const key of state.qualitySamples.keys())if(key.startsWith(`${peerId}:`))state.qualitySamples.delete(key);renderStreams(); }
function syncRoomMembers(rawMembers){
  const own=rawMembers?.[state.user?.uid];
  if(state.roomAttempt?.revalidating&&(!own||own.online===false||own.peerId!==state.peer?.id)){state.membersLoaded=true;state.ownMember=null;renderPeople();return;}
  if((state.roomConnected||state.roomAttempt?.joinedOnce)&&(!own||own.online===false)){toast('Você foi removido ou bloqueado nesta sala.');disconnectRoom(false);showNoRoom();return;}
  state.membersLoaded=true;state.membersError='';state.ownMember=own||null;
  if(state.roomAttempt?.revalidating&&state.roomAttempt.firebaseRejoined&&own?.peerId===state.peer?.id)confirmRestoredRoom(state.roomAttempt);
  if(own){state.canStream=own.canStream!==false;state.profile.role=own.role||'member';if(!state.canStream&&state.localStream)stopSharing();$('#shareButton').disabled=!state.canStream;}
  const previous=state.members,active=Object.entries(rawMembers||{}).filter(([uid,member])=>uid!==state.user?.uid&&member?.online!==false&&member?.peerId).map(([uid,member])=>[uid,{...member,peerId:member.peerId,name:member.nickname||member.username||'Participante',publishing:!!member.streaming}]);
  const next=new Map(active);for(const [uid,member] of previous)if(next.get(uid)?.peerId!==member.peerId)revokePeer(member.peerId);
  for(const [,member] of active)if(member.canStream===false){const incoming=state.incomingCalls.get(member.peerId);if(incoming){state.incomingCalls.delete(member.peerId);incoming.close();}if(state.streams.has(member.peerId))removeRemoteStream(member.peerId);}
  state.members=next;for(const [id,stream] of state.streams){if(stream.local)continue;const member=active.map(([,item])=>item).find(item=>item.peerId===id);if(member){stream.name=member.nickname||member.username||stream.name;stream.uid=member.uid;stream.photo=member.photo||'';stream.color=member.color;}}renderPeople();renderStreams();if($('#roomManageDialog')?.open)renderRoomModeration();
  for(const [uid,member] of active){ensureDataConnection(uid,member.peerId);if(state.localStream)ensureCall(member.peerId,state.localStream);}
}
async function watchPanelMembers(code){
  if(state.membersRetrying)return;const peer=state.peer,version=++state.membersWatchVersion;state.membersRetrying=true;renderPeople();
  try{
    state.membersWatch?.();
    const unsubscribe=await window.focoCloud.watchMemberList(code,members=>{if(state.activeRoom===code&&state.peer===peer&&state.membersWatchVersion===version){state.membersRetrying=false;syncRoomMembers(members);}},()=>{if(state.activeRoom===code&&state.peer===peer&&state.membersWatchVersion===version){state.membersRetrying=false;state.membersError='failed';renderPeople();}});
    if(state.activeRoom!==code||state.peer!==peer||state.membersWatchVersion!==version){unsubscribe();return;}
    state.membersWatch=unsubscribe;state.roomListeners.push(unsubscribe);
  }catch(error){if(state.activeRoom===code&&state.peer===peer&&state.membersWatchVersion===version){console.warn('Lista de participantes:',error);state.membersRetrying=false;state.membersError='failed';}}
  finally{if(state.activeRoom===code&&state.peer===peer&&state.membersWatchVersion===version)renderPeople();}
}
async function watchPanelChat(code){
  if(state.chatRetrying)return;const peer=state.peer,version=++state.chatWatchVersion;state.chatRetrying=true;renderRoomChat();
  try{
    state.chatWatch?.();
    const unsubscribe=await window.focoCloud.watchRoomChat(code,messages=>{if(state.activeRoom!==code||state.peer!==peer||state.chatWatchVersion!==version)return;if(!state.chatLoaded){state.chatLoaded=true;state.chatSeenAt=latestMessageAt(messages);state.chatSeenIds=new Set(messages.map(message=>message.id));}else{const ids=new Set(messages.map(message=>message.id));for(const id of state.chatSeenIds)if(!ids.has(id))state.chatSeenIds.delete(id);}state.chatRetrying=false;state.chatError='';state.chatMessages=messages;renderRoomChat();},()=>{if(state.activeRoom===code&&state.peer===peer&&state.chatWatchVersion===version){state.chatRetrying=false;state.chatError='failed';renderRoomChat();}});
    if(state.activeRoom!==code||state.peer!==peer||state.chatWatchVersion!==version){unsubscribe();return;}
    state.chatWatch=unsubscribe;state.roomListeners.push(unsubscribe);
  }catch(error){if(state.activeRoom===code&&state.peer===peer&&state.chatWatchVersion===version){console.warn('Chat da sala:',error);state.chatRetrying=false;state.chatError='failed';}}
  finally{if(state.activeRoom===code&&state.peer===peer&&state.chatWatchVersion===version)renderRoomChat();}
}
function roomAttemptCurrent(attempt){return !!(attempt&&state.roomAttempt===attempt&&state.peer===attempt.peer&&state.activeRoom===attempt.code&&state.user?.uid===attempt.userId&&state.authGeneration===attempt.authGeneration&&state.p2pGeneration===attempt.generation);}
async function compensateStaleJoin(attempt,peerId){
  // A newer attempt with the same Peer ID may own this record. Never remove it.
  if(state.user?.uid!==attempt.userId||state.activeRoom===attempt.code&&state.peer?.id===peerId)return;
  try{await window.focoCloud.exitRoom(attempt.code,peerId);}catch(error){console.warn('Não foi possível limpar presença de entrada obsoleta:',error);}
}
async function watchCurrentRoom(attempt){
  const {code}=attempt;
  const unsubscribe=await window.focoCloud.watchRoom(code,updated=>{
    if(!roomAttemptCurrent(attempt))return;
    if(!updated||updated.deleted){if(state.rotatingRoom)return;toast('Esta sala foi excluída.');state.rooms=state.rooms.filter(item=>item.id!==code);persistRooms();disconnectRoom();showNoRoom();return;}
    state.currentRoomData=updated;state.isHost=updated.ownerUid===state.user?.uid;
    if(state.isHost)state.profile.role='owner';else if(state.profile.role==='owner')state.profile.role='member';
    renderPeople();const index=state.rooms.findIndex(item=>item.id===code);
    if(index>=0){state.rooms[index]={...state.rooms[index],...updated,id:code,host:state.isHost};renderRooms($('#roomSearch').value);}
    $('#roomName').textContent=updated.name;$('#copyRoomCode').innerHTML=`${esc(code)} ${icon('copy','icon-sm')}`;$('#copyRoomCode').disabled=false;
    $('#deleteRoomButton').hidden=!state.isHost;$('#rotateRoomCodeButton').hidden=!state.isHost;
    if($('#roomManageDialog')?.open)renderRoomModeration();
  });
  if(!roomAttemptCurrent(attempt)){unsubscribe();return;}
  state.roomListeners.push(unsubscribe);
}
function confirmRestoredRoom(attempt){
  if(!roomAttemptCurrent(attempt)||!attempt.firebaseRejoined||state.ownMember?.peerId!==attempt.peer.id)return;
  clearTimeout(attempt.presenceTimer);attempt.presenceTimer=null;attempt.revalidating=false;
  state.roomConnected=true;$('#shareButton').disabled=!state.canStream;$('#inviteButton').disabled=false;
  if($('#shareDialog').open)updateShareControls();updateChatControls();renderPeople();
  setRoomStatus('Conexão restaurada · P2P',true);toast('Conexão com a sala restaurada.');
}
async function finishRoomJoin(attempt,peerId,openVersion,reconnecting){
  const {code,peer}=attempt;
  const waitTimer=reconnecting?setTimeout(()=>{if(roomAttemptCurrent(attempt)&&attempt.openVersion===openVersion&&!state.roomConnected)setRoomStatus('Sem confirmação da sala · verifique a conexão ou entre novamente');},12000):null;
  if(waitTimer)attempt.joinWaitTimer=waitTimer;
  try{
    const joined=await cloudCall(()=>window.focoCloud.joinRoom(code,state.profile,peerId));
    if(!roomAttemptCurrent(attempt)||attempt.openVersion!==openVersion||peer.disconnected){await compensateStaleJoin(attempt,peerId);return;}
    state.currentRoomData={...joined,code,id:code};state.isHost=joined.ownerUid===state.user.uid;
    state.profile.role=joined.role;state.canStream=joined.canStream!==false;attempt.joinedOnce=true;attempt.rejoinFailures=0;
    if(reconnecting){
      attempt.firebaseRejoined=true;
      if(state.ownMember?.peerId===peerId)confirmRestoredRoom(attempt);
      else{
        setRoomStatus('Entrada confirmada · aguardando presença');
        clearTimeout(attempt.presenceTimer);
        attempt.presenceTimer=setTimeout(()=>{attempt.presenceTimer=null;if(roomAttemptCurrent(attempt)&&attempt.revalidating){setRoomStatus('Presença não confirmada · saia e entre novamente');}},5000);
      }
      return;
    }
    state.roomConnected=true;
    if(!reconnecting){
      const index=state.rooms.findIndex(room=>room.id===code);
      if(index>=0)state.rooms[index]={...joined,id:code};else state.rooms.unshift({...joined,id:code});
      persistRooms();renderRooms($('#roomSearch').value);
      await watchPanelMembers(code);if(!roomAttemptCurrent(attempt)||attempt.openVersion!==openVersion)return;
      await watchPanelChat(code);if(!roomAttemptCurrent(attempt)||attempt.openVersion!==openVersion)return;
      await watchCurrentRoom(attempt);if(!roomAttemptCurrent(attempt)||attempt.openVersion!==openVersion)return;
    }
    $('#shareButton').disabled=!state.canStream;$('#inviteButton').disabled=false;
    if($('#shareDialog').open)updateShareControls();updateChatControls();renderPeople();
    setRoomStatus('Conectado · P2P',true);
    toast(`Sala ${joined.name} pronta · código ${code}`);
  }catch(error){
    if(!roomAttemptCurrent(attempt)||attempt.openVersion!==openVersion)return;
    console.warn(reconnecting?'Reentrada na sala:':'Entrada na sala:',error);
    if(!reconnecting){setRoomStatus('Falha ao entrar');toast(mapAuthError(error));disconnectRoom(false);showNoRoom();return;}
    state.roomConnected=false;$('#shareButton').disabled=true;updateChatControls();if($('#shareDialog').open)updateShareControls();
    if(++attempt.rejoinFailures<=2){
      const delay=1000*2**attempt.rejoinFailures;
      setRoomStatus(`Falha de reentrada · tentando novamente em ${delay/1000} s`);
      attempt.rejoinTimer=setTimeout(()=>{attempt.rejoinTimer=null;if(roomAttemptCurrent(attempt)&&attempt.openVersion===openVersion&&peer.open&&!peer.disconnected)finishRoomJoin(attempt,peerId,openVersion,true);},delay);
    }else setRoomStatus('Falha ao restaurar a sala · saia e entre novamente');
  }finally{clearTimeout(waitTimer);if(attempt.joinWaitTimer===waitTimer)attempt.joinWaitTimer=null;}
}
async function connectRoom(room) {
  if(!state.user){showAuthGate('Entre na sua conta para usar as salas.');return;}
  if(!window.focoCloud?.isConfigured()){showAuthGate('O serviço online não está configurado neste computador.');return;}
  const code=String(room.code||room.id).toUpperCase();disconnectRoom(false);state.chatMessages=[];state.chatMedia=null;state.lastChatSentAt=0;state.membersLoaded=false;state.ownMember=null;state.membersError='';state.chatLoaded=false;state.chatSeenAt=0;state.chatSeenIds.clear();state.chatError='';state.openPersonMenu=null;document.body.classList.remove('no-room');
  state.activeRoom=code;state.currentRoomData={...room,code,id:code};state.isHost=room.ownerUid===state.user.uid;
  $('#roomName').textContent=room.name;$('#copyRoomCode').innerHTML=`${esc(code)} ${icon('copy','icon-sm')}`;$('#copyRoomCode').disabled=false;
  renderRooms($('#roomSearch').value);setRoomStatus('Conectando à sala…');state.members=new Map();renderPeople();renderRoomChat();
  // Keep PeerJS's built-in STUN/TURN configuration. Replacing it with STUN-only
  // servers was preventing media calls across some NAT/firewall combinations.
  const peer=new Peer(undefined,{debug:0});state.peer=peer;peerReconnectAttempts=0;
  const attempt={code,peer,userId:state.user.uid,authGeneration:state.authGeneration,generation:state.p2pGeneration,openVersion:0,joinedOnce:false,revalidating:false,firebaseRejoined:false,rejoinFailures:0,rejoinTimer:null,presenceTimer:null,joinWaitTimer:null};
  state.roomAttempt=attempt;
  peer.on('open',id=>{
    if(!roomAttemptCurrent(attempt))return;
    clearTimeout(peerReconnectTimer);peerReconnectTimer=null;peerReconnectAttempts=0;
    clearTimeout(attempt.rejoinTimer);attempt.rejoinTimer=null;clearTimeout(attempt.presenceTimer);attempt.presenceTimer=null;clearTimeout(attempt.joinWaitTimer);attempt.joinWaitTimer=null;
    const version=++attempt.openVersion,reconnecting=attempt.joinedOnce;
    attempt.revalidating=reconnecting;attempt.firebaseRejoined=false;
    state.roomConnected=false;$('#shareButton').disabled=true;updateChatControls();
    if($('#shareDialog').open)updateShareControls();
    setRoomStatus(reconnecting?'PeerJS reconectado · revalidando sala':'Conectando à sala…');
    finishRoomJoin(attempt,id,version,reconnecting);
  });
  peer.on('connection',conn=>handleData(conn,peer));peer.on('call',call=>handleCall(call,peer));
  peer.on('error',error=>{if(!roomAttemptCurrent(attempt))return;console.error('PeerJS:',error);if(['network','socket-error','socket-closed','server-error'].includes(error.type)){setRoomStatus('Conexão instável · tentando recuperar');}else if(error.type==='peer-unavailable'){toast('Um participante se desconectou. Atualizando a lista…');}else{setRoomStatus('Falha na conexão da sala');toast(`Conexão ponto a ponto: ${error.type||error.message}`);}});
  peer.on('disconnected',()=>{
    if(!roomAttemptCurrent(attempt)||peer.destroyed)return;
    attempt.openVersion++;attempt.revalidating=attempt.joinedOnce;attempt.firebaseRejoined=false;
    clearTimeout(attempt.rejoinTimer);attempt.rejoinTimer=null;clearTimeout(attempt.presenceTimer);attempt.presenceTimer=null;clearTimeout(attempt.joinWaitTimer);attempt.joinWaitTimer=null;
    state.roomConnected=false;$('#shareButton').disabled=true;updateChatControls();
    if($('#shareDialog').open)updateShareControls();
    clearTimeout(peerReconnectTimer);peerReconnectAttempts++;
    const delay=Math.min(1000*2**Math.min(peerReconnectAttempts,5),30000);
    setRoomStatus(`Reconectando à sala · nova tentativa em ${Math.ceil(delay/1000)} s`);
    peerReconnectTimer=setTimeout(()=>{if(!roomAttemptCurrent(attempt)||peer.destroyed||!peer.disconnected)return;try{peer.reconnect();}catch(error){console.warn('Reconexão da sinalização:',error);}},delay);
  });
  peer.on('close',()=>{if(!roomAttemptCurrent(attempt))return;disconnectRoom(false);showNoRoom();});
}
function disconnectRoom(clear=true,{remote=true}={}) {
  state.p2pGeneration++;
  const attempt=state.roomAttempt;state.roomAttempt=null;
  if(attempt){attempt.openVersion++;clearTimeout(attempt.rejoinTimer);attempt.rejoinTimer=null;clearTimeout(attempt.presenceTimer);attempt.presenceTimer=null;clearTimeout(attempt.joinWaitTimer);attempt.joinWaitTimer=null;}
  cancelSharePicker();
  clearTimeout(peerReconnectTimer);peerReconnectTimer=null;peerReconnectAttempts=0;
  for(const timer of state.recoveryTimers)clearTimeout(timer);state.recoveryTimers.clear();state.recoveryAttempts.clear();
  const code=state.activeRoom,peerId=state.peer?.id;
  state.roomConnected=false;
  state.theaterId=null;state.expandedId=null;document.body.classList.remove('theater-active');window.focoDesktop.setFullscreen(false).catch(()=>{});
  stopSharing(false,{remote});
  if(remote&&code&&peerId&&state.user)window.focoCloud?.exitRoom(code,peerId).catch(()=>{});
  state.roomListeners.splice(0).forEach(unsubscribe=>{try{unsubscribe();}catch{}});state.chatWatch=null;state.membersWatch=null;state.chatWatchVersion++;state.membersWatchVersion++;state.chatRetrying=false;state.membersRetrying=false;
  for(const call of state.calls.values())call.close();state.calls.clear();
  for(const call of state.incomingCalls.values())call.close();state.incomingCalls.clear();
  for(const conn of state.dataConnections.values())conn.close();state.dataConnections.clear();
  state.pendingOutgoingCalls.clear();state.lastRetryAt.clear();state.membersLoaded=false;state.ownMember=null;
  if(state.peer){try{state.peer.destroy();}catch{}state.peer=null;}
  state.membersLoaded=false;state.chatLoaded=false;
  state.members.clear();state.streams.clear();state.playbackPrefs.clear();state.chatMessages=[];state.chatMedia=null;state.chatSendOperation=null;state.chatSending=false;$('#chatSendStatus').hidden=true;state.chatSeenIds.clear();state.chatError='';state.membersError='';state.ownMember=null;state.openPersonMenu=null;state.isHost=false;state.canStream=true;
  // Destroy the left room's tiles now instead of leaving them until the next room's first snapshot.
  renderStreams();
  if(clear){setRoomStatus('Desconectado');renderPeople();renderRoomChat();}
}
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
let shareAttempt=null;
function withShareTimeout(promise,ms,message){let timer;return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
function setShareStatus(message='',kind='info'){
  const status=$('#shareStatus');status.hidden=!message;status.dataset.kind=kind;status.textContent=message?tr(message):'';
}
function shareAudioSources(){return sharePicker.sources.filter(s=>s.type==='window'&&!/^Developer Tools/i.test(s.name));}
function selectedShareSource(){return sharePicker.sources.find(s=>s.id===sharePicker.selectedId)||null;}
function sharePeerReady(){return !!state.peer?.open&&!state.peer.disconnected&&!state.peer.destroyed;}
function updateShareControls(){
  const selected=selectedShareSource(),audioId=$('#audioSourceSelect').value,audio=shareAudioSources().find(s=>s.id===audioId),validAudio=audioId==='none'||!!audio;
  const busy=!!shareAttempt,loading=sharePicker.loading;
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
  sharePicker.generation++;if(shareAttempt)shareAttempt.cancelled=true;
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
function shareCancelled(){const error=new Error('Share attempt cancelled');error.cancelled=true;return error;}
async function startSharing(){
  if(shareAttempt||state.localStream)return;
  const source=selectedShareSource(),audioId=$('#audioSourceSelect').value,audioSource=shareAudioSources().find(s=>s.id===audioId),withAudio=audioId!=='none';
  if(!source){setShareStatus('Selecione uma tela ou janela válida.','error');return;}
  if(withAudio&&!audioSource){setShareStatus('Selecione um aplicativo de áudio válido ou Sem áudio.','error');return;}
  const qualityProfile=$('#shareQuality').value,profile=QUALITY_PROFILES[qualityProfile]||QUALITY_PROFILES['720p60'];
  const op={cancelled:false,room:state.activeRoom,peer:state.peer};shareAttempt=op;$('#shareButton').disabled=true;updateShareControls();
  const current=()=>shareAttempt===op&&!op.cancelled&&$('#shareDialog').open&&state.activeRoom===op.room&&state.peer===op.peer&&op.peer?.open&&!op.peer.disconnected&&!op.peer.destroyed&&state.roomConnected&&state.canStream&&!state.localStream;
  const ensureCurrent=()=>{if(!current()){if(shareAttempt===op&&!op.cancelled&&$('#shareDialog').open&&state.activeRoom===op.room&&state.peer===op.peer&&!sharePeerReady())throw new Error('Conexão com a sala perdida. Aguarde a reconexão e tente novamente.');throw shareCancelled();}};
  let acquiredStream=null,acquiredContext=null,removeListener=null,audioRequested=false,announced=false,committed=false;
  try{
    setShareStatus('Verificando fontes…');
    const available=await withShareTimeout(window.focoDesktop.listSources(),10000,'A lista de fontes demorou para responder.');ensureCurrent();
    const confirmedSource=Array.isArray(available)?available.find(s=>s.id===source.id&&s.type===source.type):null;
    const confirmedAudio=withAudio&&Array.isArray(available)?available.find(s=>s.id===audioSource.id&&s.type==='window'):null;
    if(!confirmedSource||withAudio&&!confirmedAudio){
      sharePicker.sources=Array.isArray(available)?available:[];
      if(!confirmedSource)sharePicker.selectedId=null;
      populateShareAudio(withAudio?audioSource.id:'none');renderShareSources();
      throw new Error(!confirmedSource?'A fonte selecionada não está mais disponível. Escolha outra fonte.':'O aplicativo de áudio selecionado não está disponível.');
    }
    let pid=null;
    if(withAudio){setShareStatus('Preparando captura de áudio…');pid=await window.focoDesktop.resolveProcess(audioSource.id);ensureCurrent();}
    setShareStatus('Solicitando captura de tela…');
    let captureTimedOut=false;
    const capturePromise=navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:source.id,maxWidth:profile.width,maxHeight:profile.height,maxFrameRate:profile.fps}}});
    capturePromise.then(stream=>{if(captureTimedOut)stream.getTracks().forEach(track=>track.stop());},()=>{});
    try{acquiredStream=await withShareTimeout(capturePromise,20000,'A captura demorou para responder. Tente novamente.');}
    catch(error){captureTimedOut=true;throw error;}
    ensureCurrent();
    const track=acquiredStream.getVideoTracks()[0];if(!track)throw new Error('A fonte não forneceu vídeo. Escolha outra fonte.');track.contentHint='motion';
    let worklet=null,destination=null;
    if(withAudio){
      acquiredContext=new AudioContext({sampleRate:48000});await acquiredContext.audioWorklet.addModule(new URL('audio-worklet.js',window.location.href).href);ensureCurrent();
      worklet=new AudioWorkletNode(acquiredContext,'pcm-loopback-player',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
      destination=acquiredContext.createMediaStreamDestination();worklet.connect(destination);await acquiredContext.resume();ensureCurrent();
      const audioTrack=destination.stream.getAudioTracks()[0];if(!audioTrack)throw new Error('Não foi possível preparar o áudio do aplicativo. Tente novamente.');acquiredStream.addTrack(audioTrack);
      removeListener=window.focoDesktop.onAudioChunk(chunk=>{if(!worklet.port)return;const bytes=chunk instanceof Uint8Array?chunk:new Uint8Array(chunk);const aligned=bytes.byteLength-(bytes.byteLength%2);const pcm=new Int16Array(aligned/2);const view=new DataView(bytes.buffer,bytes.byteOffset,aligned);for(let i=0;i<pcm.length;i++)pcm[i]=view.getInt16(i*2,true);worklet.port.postMessage(pcm,[pcm.buffer]);});
      setShareStatus('Iniciando áudio do aplicativo…');audioRequested=true;
      await window.focoDesktop.startAudioCapture(pid);ensureCurrent();
    }
    setShareStatus('Confirmando transmissão na sala…');
    await window.focoCloud.updateRoomMember(op.room,{streaming:true},op.peer.id);announced=true;ensureCurrent();
    const settings=track.getSettings(),actualQuality=settings.width&&settings.height?`${settings.width}×${settings.height} · ${Math.round(settings.frameRate||profile.fps)} FPS`:profile.label;
    const entry={stream:acquiredStream,name:state.nickname,uid:state.user?.uid,photo:state.profile.photo,color:state.profile.color,appName:confirmedAudio?.name||confirmedSource.name,sourceName:confirmedSource.name,sourceType:confirmedSource.type==='screen'?'Tela inteira':'Janela',local:true,quality:actualQuality};
    state.localStream=acquiredStream;state.localSource={id:confirmedSource.id,name:confirmedSource.name,type:confirmedSource.type,audioSourceId:confirmedAudio?.id||null,audioName:confirmedAudio?.name||null};state.localQuality=actualQuality;state.localQualityProfile=qualityProfile;state.removeAudioListener=removeListener;state.audioContext=acquiredContext;state.audioWorklet=worklet;state.audioDestination=destination;
    state.streams.set(op.peer.id,entry);committed=true;
    for(const member of state.members.values())ensureCall(member.peerId,acquiredStream);
    configureCallQuality();sendToAll({type:'publisher-start',peerId:op.peer.id,name:state.nickname});
    localStorage.setItem('foco.quality',qualityProfile);
    $('#shareLabel').textContent='Parar transmissão';$('#shareButton').classList.add('sharing');renderStreams();renderPeople();
    shareAttempt=null;$('#shareDialog').close();toast(withAudio?`Transmitindo ${confirmedSource.name} com áudio do aplicativo`:'Transmitindo somente vídeo');
  }catch(error){
    if(committed&&state.localStream===acquiredStream)stopSharing(false);
    else{if(removeListener)removeListener();acquiredStream?.getTracks().forEach(track=>track.stop());if(acquiredContext)await acquiredContext.close().catch(()=>{});if(audioRequested)await window.focoDesktop.stopAudioCapture().catch(()=>{});}
    if(announced&&!committed)await window.focoCloud.updateRoomMember(op.room,{streaming:false},op.peer.id).catch(()=>{});
    if(!error.cancelled&&$('#shareDialog').open){console.warn('Falha ao compartilhar:',error);setShareStatus(error.name==='NotAllowedError'?'Permissão de captura negada. Confira as permissões do sistema.':error.message||'Não foi possível iniciar a transmissão.','error');}
  }finally{if(shareAttempt===op)shareAttempt=null;$('#shareButton').disabled=!state.canStream||!sharePeerReady();updateShareControls();}
}
function stopSharing(showMessage=true,{remote=true}={}) {
  if(!state.localStream)return;
  if(remote&&state.activeRoom)window.focoCloud?.updateRoomMember(state.activeRoom,{streaming:false},state.peer?.id).catch(()=>{});
  const id=state.peer?.id;for(const call of state.calls.values())call.close();state.calls.clear();
  state.localStream.getTracks().forEach(track=>track.stop());state.localStream=null;
  if(state.removeAudioListener){state.removeAudioListener();state.removeAudioListener=null;}
  if(state.audioContext||state.removeAudioListener)window.focoDesktop.stopAudioCapture().catch(()=>{});
  if(state.audioContext){state.audioContext.close().catch(()=>{});state.audioContext=null;}
  state.audioWorklet=null;state.audioDestination=null;state.streams.delete(id);sendToAll({type:'publisher-stop',peerId:id});
  for(const timer of state.qualityTimers.values())clearInterval(timer);state.qualityTimers.clear();state.streamQualityMetrics.delete(id);for(const key of state.qualitySamples.keys())if(key.startsWith(`${id}:`))state.qualitySamples.delete(key);
  state.localSource=null;state.localQuality=null;state.localQualityProfile=null;
  $('#shareLabel').textContent='Compartilhar tela';$('#shareButton').classList.remove('sharing');renderStreams();renderPeople();if(showMessage)toast('Transmissão encerrada.');
}
async function kickMember(peerId){const target=[...state.members.entries()].find(([,member])=>member.peerId===peerId);if(!target)return;try{await window.focoCloud.removeMember(state.activeRoom,target[0]);toast('Participante expulso e bloqueado.');}catch(error){toast(mapAuthError(error));}}
async function compressAvatar(file){
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=data;});
  const canvas=document.createElement('canvas'),scale=Math.min(1,256/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.78);
}
async function enterCode(code){const clean=window.focoCloud.cleanCode(code),generation=state.authGeneration,uid=state.user?.uid;if(!await confirmRoomSwitch(clean)||state.authGeneration!==generation||state.user?.uid!==uid)return;const room=await cloudCall(()=>window.focoCloud.findRoom(clean));if(state.authGeneration!==generation||state.user?.uid!==uid)return;await connectRoom(room);}
function authCurrent(generation,uid){return state.authGeneration===generation&&state.user?.uid===uid;}
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
async function activateUser(user,generation=++state.authGeneration){
  if(!user){stopUserRoomsWatch();if(state.user)disconnectRoom(false,{remote:false});state.user=null;state.rooms=[];state.roomsLoaded=false;state.roomsError=false;clearAccountPresentation();renderRooms();showNoRoom();showAuthGate();dismissStartupScreen('auth');return;}
  const previousUid=state.user?.uid;
  if(previousUid&&previousUid!==user.uid){stopUserRoomsWatch();disconnectRoom(false,{remote:false});state.rooms=[];state.roomsLoaded=false;state.roomsError=false;clearAccountPresentation();showNoRoom();showAuthGate('Preparando sua conta…');}
  state.user=user;let profile=null;
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
  if(unsubscribeAuth)unsubscribeAuth();unsubscribeAuth=window.focoCloud.onAuthChanged(user=>{if(user?.uid&&state.user?.uid===user.uid&&state.roomAttempt?.joinedOnce)return;const generation=++state.authGeneration;activateUser(user,generation).catch(error=>{if(state.authGeneration!==generation)return;console.error('Sessão:',error);showAuthGate(mapAuthError(error));dismissStartupScreen('auth');});});
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
$('#shareDialog').addEventListener('close',()=>{sharePicker.generation++;if(shareAttempt)shareAttempt.cancelled=true;$('#shareButton').focus();});
$('#refreshSourcesButton').onclick=()=>listSources(true);
$('#shareScreensTab').onclick=()=>setShareTab('screen');$('#shareWindowsTab').onclick=()=>setShareTab('window');
$('.share-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setShareTab(event.key==='Home'?'screen':event.key==='End'?'window':sharePicker.tab==='screen'?'window':'screen',true);});
$('#sourceOptions').addEventListener('click',event=>{const button=event.target.closest('[data-source-id]');if(!button||shareAttempt||sharePicker.loading)return;const source=sharePicker.sources.find(item=>item.id===button.dataset.sourceId);if(!source)return;const restoreFocus=document.activeElement===button;sharePicker.selectedId=source.id;populateShareAudio(!sharePicker.audioExplicit&&source.type==='window'?source.id:$('#audioSourceSelect').value);setShareStatus();renderShareSources();if(restoreFocus)[...$('#sourceOptions').querySelectorAll('[data-source-id]')].find(item=>item.dataset.sourceId===source.id)?.focus();});
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
    if(state.theaterId){const card=state.streamTiles.get(state.theaterId)?.card;if(card)setTheaterMode(card);return;}
    if(state.expandedId){const card=state.streamTiles.get(state.expandedId)?.card;if(card)setExpandedMode(card);return;}
    return;
  }
  if(event.altKey||event.ctrlKey||event.metaKey||event.repeat||!state.activeRoom||!state.focusedId||event.target.closest('input,textarea,select,[contenteditable="true"],.stream-menu,.panel-tabs')||!(event.target.closest('#stage')||event.target===document.body))return;
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
