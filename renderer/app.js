function validRooms(items) {
  return Array.isArray(items) ? items.filter(r=>r&&typeof r.id==='string'&&typeof r.name==='string'&&typeof r.code==='string').map(r=>({...r,hostId:typeof r.hostId==='string'?r.hostId:`foco${r.code.toLowerCase()}`,host:Boolean(r.host)})) : [];
}
const state = {
  rooms: [], activeRoom: null,
  peer: null, hostId: null, isHost: false, nickname: localStorage.getItem('foco.nickname') || 'Jogador', user:null,
  profile:{username:'',nickname:'Jogador',status:'Disponível',color:'#9b83ff',photo:'',showActivity:true,activity:''},
  canStream:true,roomConnected:false,rotatingRoom:false,roomListeners:[],roomPeerIds:new Map(),pendingInvite:'',
  members: new Map(), dataConnections: new Map(), calls: new Map(), incomingCalls:new Map(), localStream: null,
  chatMessages:[],chatMedia:null,lastChatSentAt:0,
  localSource: null, audioContext: null, audioWorklet: null, audioDestination: null,
  localQuality: null, localQualityProfile: null, qualityTimers:new Map(),
  removeAudioListener: null, streams: new Map(), streamVolumes:new Map(), streamQualityMetrics:new Map(),qualitySamples:new Map(),recoveryAttempts:new Map(), selected: new Set(), displayMode:'grid', theaterId:null,expandedId:null
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
let startupStartedAt=Date.now();
let startupDismissTimer=null;
let startupFallbackTimer=null;
let lastRenderedUpdateState='';
let peerReconnectTimer=null;
let peerReconnectAttempts=0;
const $ = selector => document.querySelector(selector);
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
function dismissStartupScreen() {
  if(startupDismissTimer)return;
  const remaining=Math.max(0,900-(Date.now()-startupStartedAt));
  startupDismissTimer=setTimeout(()=>$('#startupScreen')?.classList.add('is-done'),remaining);
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
  if(checking)$('#startupMessage').textContent='Verificando atualizações…';
  else $('#startupMessage').textContent=updateStatusLabel(status);
  if(['current','available','downloading','ready','error','unavailable'].includes(status.state))dismissStartupScreen();
  if(status.state==='available'&&previous!=='available')toast(`Atualização ${status.version||''} disponível; baixando em segundo plano.`);
  if(status.state==='ready'&&previous!=='ready')toast(`Atualização ${status.version||''} pronta; será instalada ao fechar o Foco.`);
}
async function initializeUpdateUi() {
  window.focoDesktop.onUpdateStatus?.(renderUpdateStatus);
  startupFallbackTimer=setTimeout(()=>{
    $('#startupMessage').textContent='A verificação está demorando. Você pode continuar sem aguardar.';
    $('#startupContinue').hidden=false;
  },9000);
  try {
    appVersion=await window.focoDesktop.getAppVersion();
    $('#appVersionLabel').textContent=`Foco · Versão ${appVersion}`;
    $('#startupVersion').textContent=`Versão ${appVersion}`;
    renderUpdateStatus(await window.focoDesktop.getUpdateStatus());
  } catch(error) {
    console.warn('Não foi possível carregar o estado das atualizações:',error);
    $('#updateStatusText').textContent='Não foi possível consultar as atualizações.';
    $('#startupMessage').textContent='Você pode continuar usando o Foco.';
    dismissStartupScreen();
  }
}
function persistRooms() { localStorage.setItem('foco.rooms', JSON.stringify(state.rooms)); }
function randomCode() { const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const bytes=crypto.getRandomValues(new Uint8Array(8)); return Array.from(bytes,b=>alphabet[b%alphabet.length]).join(''); }
function currentRoom() { return state.rooms.find(room=>room.id===state.activeRoom); }
function showNoRoom() {
  state.roomListeners.splice(0).forEach(unsubscribe=>{try{unsubscribe();}catch{}});
  state.activeRoom=null;state.chatMessages=[];state.chatMedia=null;state.theaterId=null;state.expandedId=null;document.body.classList.remove('theater-active');document.body.classList.add('no-room');
  window.focoDesktop.setFullscreen(false).catch(()=>{});
  $('#roomName').textContent='Início';$('#welcomeTitle').textContent='Compartilhe com sua galera';$('#copyRoomCode').innerHTML='CÓDIGO indisponível <span>⧉</span>';$('#copyRoomCode').disabled=true;
  $('#shareLabel').textContent='Compartilhar tela';$('#shareButton').classList.remove('sharing');$('#shareButton').disabled=true;$('#inviteButton').disabled=true;
  $('#onlineCount').textContent='0 online';$('#memberCount').textContent='0 participantes';
  setRoomStatus('Crie ou entre em uma sala');renderRooms($('#roomSearch').value);renderPeople();renderStreams();renderRoomChat();
}
function openSettings() { $('#appLanguage').value=window.focoI18n?.getLanguage()||'pt-BR';$('#defaultQuality').value=localStorage.getItem('foco.quality')||'720p60';$('#reduceMotionEnabled').checked=localStorage.getItem('foco.reduceMotion')==='true';$('#appVersionLabel').textContent=`Foco · Versão ${appVersion}`;$('#settingsDialog').showModal(); }
function showAuthGate(message='') { $('#authGate').hidden=false;$('#authError').textContent=message; }
function setAuthMode(mode){const login=mode==='login';$('#loginForm').hidden=!login;$('#registerForm').hidden=login;$('#loginTab').classList.toggle('active',login);$('#registerTab').classList.toggle('active',!login);$('#authTitle').textContent=login?'Entre na sua conta':'Crie sua conta';$('#authDescription').textContent=login?'Use seu email e senha para abrir seu perfil e suas salas.':'Seu username é único e não poderá ser alterado.';$('#authError').textContent='';}
function mapAuthError(error){const code=error?.code||'';const known={'auth/email-already-in-use':'Esse email já está cadastrado.','auth/invalid-email':'O email informado não é válido.','auth/weak-password':'A senha precisa ter pelo menos 8 caracteres.','auth/invalid-credential':'Email ou senha incorretos.','auth/user-not-found':'Email ou senha incorretos.','auth/wrong-password':'Email ou senha incorretos.','auth/operation-not-allowed':'Ative Email/Senha em Authentication no Firebase Console.','auth/invalid-api-key':'API key do Firebase inválida. Confira a configuração.','auth/network-request-failed':'Não foi possível conectar ao serviço online. Confira sua internet.','auth/too-many-requests':'Muitas tentativas. Aguarde um pouco e tente novamente.','PERMISSION_DENIED':'As regras do Realtime Database estão ausentes ou não correspondem à configuração.','database/permission-denied':'As regras do Realtime Database estão ausentes ou não correspondem à configuração.'};return known[code]||error?.message||'Não foi possível concluir a operação.';}
function setSignedInProfile(profile){state.profile={...state.profile,...profile};state.nickname=state.profile.nickname;localStorage.setItem('foco.nickname',state.nickname);$('#profileButton').textContent=state.nickname.slice(0,1).toUpperCase();$('#profileButtonTop').textContent=state.nickname.slice(0,1).toUpperCase();$('#profileButton').style.background=state.profile.photo?`center/cover url("${state.profile.photo}")`:state.profile.color;$('#profileButtonTop').style.background=state.profile.photo?`center/cover url("${state.profile.photo}")`:state.profile.color;updateProfilePreview();}
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
function openProfile() { state.pendingPhoto=undefined;$('#profileUsername').value=state.profile.username||'';$('#nicknameInput').value=state.profile.nickname||state.nickname;$('#profileStatus').value=state.profile.status||'';$('#profileActivity').value=state.profile.activity||'';$('#profileColor').value=state.profile.color||'#9b83ff';$('#profileColorHex').value=state.profile.color||'#9b83ff';$('#showActivity').checked=state.profile.showActivity!==false;$('#profilePhoto').value='';$('#profilePhotoPreview').innerHTML=state.profile.photo?`<img src="${esc(state.profile.photo)}" alt="Foto de perfil"><span>Foto atual</span>`:'Sem foto selecionada';updateProfilePreview();$('#profileDialog').showModal();$('#nicknameInput').focus();}
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
  if(!confirm('Gerar um novo código vai encerrar esta sala para todos. O código e os convites antigos deixarão de funcionar; depois, envie o novo convite para a galera. Continuar?'))return;
  let replacement=null;
  try{
    replacement=await window.focoCloud.makeRoom(old.name);
    state.rotatingRoom=true;
    await window.focoCloud.markRoomDeleted(old.code);
    disconnectRoom(false);state.activeRoom=null;state.rotatingRoom=false;
    state.rooms=state.rooms.filter(room=>room.code!==old.code);persistRooms();renderRooms($('#roomSearch').value);$('#roomManageDialog').close();
    await connectRoom(replacement);
    const connected=await waitForRoomReady(replacement.code,12000);
    if(!connected&&!state.rooms.some(room=>room.code===replacement.code)){state.rooms.unshift({...replacement,id:replacement.code});persistRooms();renderRooms($('#roomSearch').value);}
    await copyText(`foco://join/${replacement.code}`);toast(`${connected?'Sala recriada':'Sala recriada · conexão pendente'} · código ${replacement.code} · convite copiado.`);
  }catch(error){state.rotatingRoom=false;if(replacement&&state.activeRoom!==replacement.code)await window.focoCloud.markRoomDeleted(replacement.code).catch(()=>{});toast(mapAuthError(error));}
}
async function waitForRoomReady(code,timeout){const started=Date.now();while(Date.now()-started<timeout){if(state.activeRoom!==code)return false;if(state.roomConnected)return true;await new Promise(resolve=>setTimeout(resolve,150));}return state.roomConnected&&state.activeRoom===code;}
function renderRoomModeration(){
  const room=currentRoom(),container=$('#roomMembersManage');if(!container)return;
  if(!room){container.innerHTML='';return;}
  const canModerate=state.isHost||state.profile.role==='moderator';
  const people=[...state.members.entries()].map(([uid,m])=>({uid,...m})).filter(m=>m.online!==false);
  container.innerHTML=people.length?'<div class="manage-section-title">PESSOAS NESTA SALA</div>'+people.map(m=>`<div class="manage-person"><span class="manage-person-name">${esc(m.nickname||m.name||m.username)} <small>${esc(m.role||'member')}</small></span>${canModerate?`<button type="button" class="manage-small" data-room-action="permission" data-uid="${esc(m.uid)}" data-allowed="${m.canStream===false?'false':'true'}">${m.canStream===false?'Permitir transmitir':'Bloquear transmissão'}</button>${state.isHost?`<button type="button" class="manage-small" data-room-action="role" data-uid="${esc(m.uid)}" data-role="${m.role==='moderator'?'member':'moderator'}">${m.role==='moderator'?'Remover moderação':'Tornar moderador'}</button><button type="button" class="manage-small" data-room-action="transfer" data-uid="${esc(m.uid)}">Transferir dono</button>`:''}<button type="button" class="manage-small danger" data-room-action="ban" data-uid="${esc(m.uid)}">Expulsar e bloquear</button>`:''}</div>`).join(''):'<div class="manage-section-title">Só você está nesta sala.</div>';
  container.onclick=async event=>{const button=event.target.closest('[data-room-action]');if(!button)return;const uid=button.dataset.uid,action=button.dataset.roomAction;if(!confirm(action==='ban'?'Expulsar e bloquear esta pessoa nesta sala?':action==='transfer'?'Transferir a propriedade desta sala para esta pessoa?':action==='role'?'Alterar o cargo desta pessoa?':'Alterar a permissão de transmissão?'))return;
    try{if(action==='ban')await window.focoCloud.removeMember(room.code,uid);if(action==='permission')await window.focoCloud.setStreamPermission(room.code,uid,button.dataset.allowed==='false');if(action==='role')await window.focoCloud.setMemberRole(room.code,uid,button.dataset.role);if(action==='transfer')await window.focoCloud.transferRoom(room.code,uid);toast('Permissões atualizadas.');renderRoomModeration();}catch(error){toast(mapAuthError(error));}
  };
}
async function leaveCurrentRoom() {
  const room=currentRoom();if(!room)return;
  state.roomConnected=false;await cloudCall(()=>window.focoCloud.exitRoom(room.code));disconnectRoom(false);state.activeRoom=null;
  $('#roomManageDialog').close();showNoRoom();toast('Você saiu da sala.');
}
async function deleteCurrentRoom() {
  const room=currentRoom();if(!room||!state.isHost)return;
  if(!confirm('Excluir a sala “'+room.name+'”? O código deixará de funcionar.'))return;
  try{await cloudCall(()=>window.focoCloud.markRoomDeleted(room.code));disconnectRoom(false);state.rooms=state.rooms.filter(item=>item.id!==room.id);persistRooms();state.activeRoom=null;
  $('#roomManageDialog').close();showNoRoom();toast('Sala excluída.');}catch(error){toast(mapAuthError(error));}
}
async function cloudCall(callback){try{return await callback();}catch(error){console.error('Serviço online:',error);throw error;}}
function setDisplayMode(mode) {
  state.displayMode=mode;$('#gridViewButton').classList.toggle('active',mode==='grid');$('#listViewButton').classList.toggle('active',mode==='list');
  $('#gridViewButton').setAttribute('aria-pressed',String(mode==='grid'));$('#listViewButton').setAttribute('aria-pressed',String(mode==='list'));
  $('#streamGrid').classList.toggle('list-view',mode==='list');
}
function setRoomStatus(text, good=false) { const color=good?'#52d29d':/falha|instável|reconect/i.test(text)?'#eba765':'#7b7b87';const footer=$('.sidebar-footer');if(footer)footer.innerHTML=`<span class="status-dot" style="background:${color}"></span><span>${esc(text)}</span>`;const status=$('#connectionStatusLabel'),dot=$('#connectionStatusDot');if(status){status.textContent=text;status.title=text;}if(dot)dot.style.background=color; }
function renderRooms(filter='') {
  const q=filter.toLowerCase();
  $('#roomList').innerHTML=state.rooms.filter(r=>r.name.toLowerCase().includes(q)||r.code.toLowerCase().includes(q)).map(r=>`<button class="room-item ${r.id===state.activeRoom?'active':''}" data-room="${esc(r.id)}"><span class="room-hash">#</span><span data-no-translate>${esc(r.name)}</span>${r.id===state.activeRoom&&state.peer?'<span class="room-live">ATIVA</span>':''}</button>`).join('') || '<div class="empty-rooms">Nenhuma sala encontrada</div>';
  document.querySelectorAll('[data-room]').forEach(button=>button.onclick=()=>{const room=state.rooms.find(r=>r.id===button.dataset.room); if(room) connectRoom(room);});
}
function renderPeople() {
  if(!state.user){$('#peopleList').innerHTML='';$('#onlineCount').textContent='0 online';$('#memberCount').textContent='0 participantes';return;}
  const members=[{...state.profile,uid:state.user?.uid,peerId:state.peer?.id,name:state.profile.nickname||state.nickname,publishing:!!state.localStream,online:true},...state.members.values()].filter(m=>m.online!==false);
  $('#peopleList').innerHTML=members.map(m=>{const owner=m.uid===state.user?.uid?state.isHost:(m.role==='owner'||m.uid===state.currentRoomData?.ownerUid);const color=/^#[0-9a-f]{6}$/i.test(m.color||'')?m.color:avatarColor(m.uid||m.peerId);const accent=/^#[0-9a-f]{6}$/i.test(m.color||'')?m.color:'#8c75df';return `<div class="person-chip" style="--member-accent:${esc(accent)}"><span class="person-avatar" style="background:${m.photo?`center/cover url('${esc(m.photo)}')`:esc(color)}">${m.photo?'':esc((m.nickname||m.name||'?').slice(0,1).toUpperCase())}</span><span class="person-details"><strong><span data-no-translate>${esc(m.nickname||m.name||'Participante')}${m.uid===state.user?.uid?' (você)':''}</span>${owner?'<span class="owner-crown" title="Dono da sala" aria-label="Dono da sala">♛</span>':''}</strong><small data-no-translate>${esc([m.status|| (m.publishing||m.streaming?'Transmitindo':'Online'),m.showActivity!==false?m.activity:''].filter(Boolean).join(' · '))}</small></span><i class="person-presence"></i></div>`;}).join('');
  $('#onlineCount').textContent=`${members.length} online`; $('#memberCount').textContent=`${members.length} participante${members.length===1?'':'s'}`;
}
function updateChatControls(){const enabled=Boolean(state.roomConnected&&state.user);$('#chatInput').disabled=!enabled;$('#chatAttachButton').disabled=!enabled;$('#chatEmojiButton').disabled=!enabled;$('#chatSendButton').disabled=!enabled||(!$('#chatInput').value.trim()&&!state.chatMedia);$('#chatRoomName').textContent=state.activeRoom?($('#roomName').textContent||'Mensagens desta sala'):window.focoI18n?.translate('Mensagens desta sala')||'Mensagens desta sala';}
function renderRoomChat(){
  const root=$('#chatMessages');if(!root)return;
  if(!state.activeRoom){root.innerHTML='<div class="chat-empty">Entre em uma sala para ver as mensagens.</div>';updateChatControls();return;}
  const items=state.chatMessages||[];
  root.innerHTML=items.length?items.map(message=>{const own=message.uid===state.user?.uid,color=/^#[0-9a-f]{6}$/i.test(message.color||'')?message.color:'#9b83ff',name=esc(message.nickname||'Jogador'),photo=/^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(message.photo||'')?message.photo:'',initial=esc((message.nickname||'J').trim().slice(0,1).toUpperCase()),text=esc(message.text||'').replace(/\n/g,'<br>'),time=new Date(message.createdAt||Date.now()).toLocaleTimeString(window.focoI18n?.locale()||'pt-BR',{hour:'2-digit',minute:'2-digit'}),validMedia=/^data:image\/(?:webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(message.media||'');const avatar=photo?`<img class="chat-message-avatar" src="${esc(photo)}" alt="" loading="lazy">`:`<span class="chat-message-avatar chat-message-avatar-fallback" style="--message-accent:${esc(color)}">${initial}</span>`,media=validMedia?`<button class="chat-media-thumb" type="button" data-chat-media="${esc(message.id)}" aria-label="${message.kind==='gif'?'GIF animado':'Imagem'}"><img loading="lazy" src="${esc(message.media)}" alt="${message.kind==='gif'?'GIF animado':'Imagem enviada'}">${message.kind==='gif'?'<span class="chat-gif-badge">GIF</span>':''}</button>`:'';return `<article class="chat-message ${own?'own':''}"><div class="chat-message-top">${avatar}<strong style="--message-accent:${esc(color)}">${name}</strong><time>${esc(time)}</time>${own?`<button type="button" class="chat-delete" data-chat-delete="${esc(message.id)}" title="Remover mensagem" aria-label="Remover mensagem">×</button>`:''}</div>${text?`<div class="chat-message-text">${text}</div>`:''}${media}${message.kind!=='text'&&!validMedia?'<div class="chat-message-text">Anexo indisponível.</div>':''}</article>`;}).join(''):'<div class="chat-empty">Nenhuma mensagem ainda.</div>';
  root.scrollTop=root.scrollHeight;updateChatControls();
}
function updateChatAttachment(){const holder=$('#chatAttachmentPreview');if(!state.chatMedia){holder.hidden=true;holder.innerHTML='';updateChatControls();return;}holder.hidden=false;holder.innerHTML=`<img src="${esc(state.chatMedia.data)}" alt="Prévia do anexo"><span>${esc(state.chatMedia.name)}</span><button type="button" class="chat-remove-attachment" id="chatRemoveAttachment" title="Remover anexo" aria-label="Remover anexo">×</button>`;holder.querySelector('#chatRemoveAttachment').onclick=()=>{state.chatMedia=null;$('#chatFileInput').value='';updateChatAttachment();};updateChatControls();}
function fileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error||new Error('file'));reader.onload=()=>resolve(String(reader.result||''));reader.readAsDataURL(file);});}
async function prepareChatImage(file){if(!file||!/^image\/(png|jpeg|webp|gif)$/i.test(file.type))throw new Error('Escolha uma imagem PNG, JPG, WebP ou GIF.');if(file.size>8*1024*1024)throw new Error('Envie imagens de até 8 MB; o Foco reduz antes de enviar.');if(file.type==='image/gif'){const data=await fileAsDataUrl(file);if(file.size>160*1024||data.length>220000)throw new Error('O arquivo precisa ter até 160 KB.');return{kind:'gif',data,name:file.name};}
  const bitmap=await createImageBitmap(file);let width=bitmap.width,height=bitmap.height,scale=Math.min(1,1280/Math.max(width,height));width=Math.max(1,Math.round(width*scale));height=Math.max(1,Math.round(height*scale));const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');for(let attempt=0;attempt<8;attempt++){canvas.width=width;canvas.height=height;ctx.clearRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);for(const quality of [.82,.72,.62,.52,.42]){const data=canvas.toDataURL('image/webp',quality);if(data.length<=220000){bitmap.close();return{kind:'image',data,name:file.name};}}width=Math.max(1,Math.round(width*.82));height=Math.max(1,Math.round(height*.82));}bitmap.close();throw new Error('A imagem ficou grande demais após a compressão.');}
function openChatEmojiPicker(){const panel=$('#chatEmojiPicker');const open=panel.hidden;panel.hidden=!open;if(!open)return;panel.innerHTML=['😀','😂','🥹','😍','😎','🥳','🔥','💀','👏','❤️','👍','👀','😭','🎮','✨','✅'].map(emoji=>`<button type="button" class="chat-emoji" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('');panel.onclick=event=>{const button=event.target.closest('[data-emoji]');if(!button)return;const input=$('#chatInput'),start=input.selectionStart,end=input.selectionEnd;input.setRangeText(button.dataset.emoji,start,end,'end');input.focus();panel.hidden=true;updateChatControls();};}
async function sendChatMessage(){if(!state.roomConnected||!state.activeRoom)return;const text=$('#chatInput').value.trim();if(!text&&!state.chatMedia){toast('Escreva uma mensagem ou anexe uma imagem.');return;}if(Date.now()-state.lastChatSentAt<650){toast('Aguarde um instante antes de enviar outra mensagem.');return;}const attachment=state.chatMedia;state.lastChatSentAt=Date.now();$('#chatSendButton').disabled=true;try{await window.focoCloud.sendRoomChat(state.activeRoom,{kind:attachment?.kind||'text',text,media:attachment?.data||'',photo:await makeChatAvatar(state.profile?.photo||'')});$('#chatInput').value='';$('#chatFileInput').value='';state.chatMedia=null;$('#chatEmojiPicker').hidden=true;updateChatAttachment();}catch(error){console.error('Envio do chat:',error);toast(error?.code==='PERMISSION_DENIED'?'Publique as regras atualizadas do chat Firebase.':'Não foi possível enviar a mensagem.');updateChatControls();}}
async function makeChatAvatar(source){if(!source||!/^data:image\//i.test(source))return'';try{const image=await new Promise((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=reject;element.src=source;});const canvas=document.createElement('canvas'),scale=Math.min(1,40/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const thumbnail=canvas.toDataURL('image/jpeg',.55);return thumbnail.length<=16000?thumbnail:'';}catch{return'';}}
function avatarColor(seed='') { let n=0; for(const c of seed)n=(n*31+c.charCodeAt(0))>>>0; const hues=[182,215,270,320,25,145]; const hue=hues[n%hues.length]; return `linear-gradient(135deg,hsl(${hue} 55% 65%),hsl(${hue+35} 50% 40%))`; }
async function setTheaterMode(card) {
  const entering=state.theaterId!==card.dataset.stream;
  state.expandedId=null;document.querySelectorAll('.stream-card.expanded').forEach(item=>item.classList.remove('expanded'));
  document.querySelectorAll('.stream-card.theater').forEach(item=>item.classList.remove('theater'));
  state.theaterId=entering?card.dataset.stream:null;
  document.body.classList.toggle('theater-active',entering);
  if(entering)card.classList.add('theater');
  try { await window.focoDesktop.setFullscreen(entering); }
  catch(error) { console.warn('Native fullscreen failed:',error);toast('Não foi possível alternar para tela cheia.'); }
}
function setExpandedMode(card) {
  if(state.theaterId===card.dataset.stream){state.theaterId=null;document.body.classList.remove('theater-active');card.classList.remove('theater');window.focoDesktop.setFullscreen(false).catch(()=>{});}
  const entering=state.expandedId!==card.dataset.stream;
  document.querySelectorAll('.stream-card.expanded').forEach(item=>item.classList.remove('expanded'));
  state.expandedId=entering?card.dataset.stream:null;
  if(entering)card.classList.add('expanded');
  const button=card.querySelector('.stream-expand');
  if(button){button.title=entering?'Voltar ao tamanho normal':'Ampliar transmissão';button.setAttribute('aria-label',button.title);button.querySelector('span').textContent=entering?'Voltar ao tamanho normal':'Ampliar';}
}
function renderStreams() {
  const entries=[...state.streams.entries()];
  if(state.theaterId&&!state.streams.has(state.theaterId)) {
    state.theaterId=null;document.body.classList.remove('theater-active');window.focoDesktop.setFullscreen(false).catch(()=>{});
  }
  if(state.expandedId&&!state.streams.has(state.expandedId)){
    state.expandedId=null;
  }
  const pending=[...state.members.entries()].filter(([uid,member])=>member.streaming&&!entries.some(([,stream])=>stream.uid===uid||stream.ownerId===member.peerId));
  if(!entries.length&&!pending.length) {
    $('#streamGrid').innerHTML='<div class="streams-empty"><span>▣</span><strong>Ninguém está transmitindo ainda</strong><small>Quando alguém compartilhar a tela, ela aparece aqui.</small></div>';
  } else {
    const streamCards=entries.map(([id,s])=>{const volume=state.streamVolumes.has(id)?state.streamVolumes.get(id):75;const metrics=state.streamQualityMetrics.get(id);const qualityText=metrics?.width&&metrics?.height?`${metrics.width}×${metrics.height}${metrics.fps?` · ${metrics.fps} FPS`:''}`:s.quality||'Ao vivo';const qualityTitle=metrics?`Bitrate automático${metrics.bitrate?`: ${(metrics.bitrate/1_000_000).toFixed(1)} Mbps`:''}${metrics.rtt?` · latência ${Math.round(metrics.rtt)} ms`:''}${metrics.reason&&metrics.reason!=='none'?` · limite: ${metrics.reason==='cpu'?'desempenho do PC':metrics.reason==='bandwidth'?'rede':'codificador'}`:''}`:'Bitrate ajustado automaticamente conforme a conexão';const expanded=state.expandedId===id;const owner=s.local?state.isHost:s.uid===state.currentRoomData?.ownerUid;const safeColor=/^#[0-9a-f]{6}$/i.test(s.color||'')?s.color:avatarColor(id);return `<article class="stream-card ${state.selected.has(id)?'selected':''} ${state.theaterId===id?'theater':''} ${expanded?'expanded':''}" data-stream="${esc(id)}" tabindex="0"><div class="stream-visual"><video autoplay playsinline ${s.local?'muted':''}></video><div class="visual-shade"></div><span class="live-badge"><i></i> AO VIVO</span><span class="quality-badge" title="${esc(qualityTitle)}">${esc(qualityText)}</span><button class="stream-expand" title="${expanded?'Voltar ao tamanho normal':'Ampliar transmissão'}" aria-label="${expanded?'Voltar ao tamanho normal':'Ampliar transmissão'}">⛶ <span>${expanded?'Voltar':'Ampliar'}</span></button><button class="stream-fullscreen" title="Tela cheia" aria-label="Abrir ${esc(s.name)} em tela cheia">⛶ <span>${state.theaterId===id?'Sair da tela cheia':'Tela cheia'}</span></button><div class="stream-volume" title="Volume da transmissão">♫ <input aria-label="Volume de ${esc(s.name)}" type="range" min="0" max="100" value="${volume}"><span>${volume}%</span></div></div><div class="stream-meta"><span class="person-avatar" style="${s.photo?`background:center/cover url('${esc(s.photo)}')`:`background:${safeColor}`} ">${s.photo?'':esc(s.name.slice(0,1).toUpperCase())}</span><div class="stream-info"><strong>${esc(s.name)}${s.local?' (você)':''}${owner?'<span class="owner-crown" title="Dono da sala" aria-label="Dono da sala">♛</span>':''}</strong><small>${esc(s.appName||'Compartilhamento')} · ${esc(s.sourceType||'TELA')}</small></div><div class="stream-actions"><button class="card-more" title="Mais opções" aria-label="Mais opções de ${esc(s.name)}" aria-expanded="false">•••</button><div class="stream-menu" role="menu" hidden><button type="button" role="menuitem" data-action="expand">⛶ <span>${expanded?'Voltar ao tamanho normal':'Ampliar'}</span></button><button type="button" role="menuitem" data-action="fullscreen">⛶ <span>${state.theaterId===id?'Sair da tela cheia':'Abrir em tela cheia'}</span></button>${s.local?'':'<button type="button" role="menuitem" data-action="mute">♫ <span>Silenciar áudio</span></button>'}${s.local?'<button type="button" role="menuitem" data-action="stop" class="danger">■ <span>Parar transmissão</span></button>':''}${!s.local&&state.isHost?'<button type="button" role="menuitem" data-action="kick" class="danger">× <span>Expulsar e bloquear</span></button>':''}</div></div></div></article>`;}).join('');
    const pendingCards=pending.map(([uid,m])=>`<article class="stream-card pending-stream"><div class="stream-visual"><div class="pending-stream-message"><span>◌</span><strong>${esc(m.nickname||m.username)} está transmitindo</strong><small>Conectando ao vídeo…</small><button type="button" class="manage-small" data-retry-uid="${esc(uid)}">Tentar reconectar vídeo</button></div></div><div class="stream-meta"><span class="person-avatar" style="${m.photo?`background:center/cover url('${esc(m.photo)}')`:`background:${esc(m.color||avatarColor(uid))}`} ">${m.photo?'':esc((m.nickname||'?').slice(0,1).toUpperCase())}</span><div class="stream-info"><strong>${esc(m.nickname||m.username)}</strong><small>Aguardando vídeo · ${esc(m.status||'Online')}</small></div></div></article>`).join('');
    $('#streamGrid').innerHTML=streamCards+pendingCards;
  }
  $('#streamGrid').classList.toggle('list-view',state.displayMode==='list');
  document.querySelectorAll('[data-retry-uid]').forEach(button=>button.onclick=()=>{const m=state.members.get(button.dataset.retryUid);if(!m)return;const connection=state.dataConnections.get(m.peerId);if(connection?.open){connection.send({type:'retry-stream'});toast('Pedido de reconexão enviado.');}else{ensureDataConnection(button.dataset.retryUid,m.peerId);toast('Reconectando ao participante…');}});
  for(const card of document.querySelectorAll('[data-stream]')) {
    const id=card.dataset.stream, entry=state.streams.get(id), video=card.querySelector('video');
    if(entry?.stream) {
      video.srcObject=entry.stream;video.volume=(state.streamVolumes.has(id)?state.streamVolumes.get(id):75)/100;
      if(entry.mediaIssue)showStreamError(card,entry.mediaIssue);
      video.onloadedmetadata=()=>video.play().catch(error=>{console.warn('Reprodução da transmissão:',error);showStreamError(card,'O navegador não conseguiu iniciar o vídeo. Clique na transmissão para tentar novamente.');});
      video.onerror=()=>showStreamError(card,'Não foi possível decodificar o vídeo recebido. Peça para iniciar a transmissão novamente.');
      video.play().catch(error=>{if(!entry.local)console.warn('Autoplay remoto:',error);});
      if(!entry.local&&entry.stream.getVideoTracks().length){setTimeout(()=>{if(document.contains(card)&&!video.videoWidth)showStreamError(card,'A transmissão está conectada, mas ainda não chegou imagem. Peça para compartilhar novamente.');},5000);}
    }
    card.onclick=e=>{
      if(e.target.closest('input,button,.stream-menu'))return;
      document.querySelectorAll('.stream-menu:not([hidden])').forEach(menu=>menu.hidden=true);
      if(state.selected.has(id))state.selected.delete(id);else state.selected.add(id);
      card.classList.toggle('selected',state.selected.has(id));
    };
    card.querySelector('.stream-fullscreen').onclick=e=>{e.stopPropagation();setTheaterMode(card);};
    card.querySelector('.stream-expand').onclick=e=>{e.stopPropagation();setExpandedMode(card);};
    card.querySelector('.stream-visual').ondblclick=e=>{if(!e.target.closest('button,input'))setTheaterMode(card);};
    const slider=card.querySelector('.stream-volume');
    slider.querySelector('input').oninput=e=>{const level=Number(e.target.value);state.streamVolumes.set(id,level);video.volume=level/100;slider.querySelector('span').textContent=level+'%';};
    const more=card.querySelector('.card-more'), menu=card.querySelector('.stream-menu');
    more.onclick=e=>{
      e.stopPropagation();
      document.querySelectorAll('.stream-menu:not([hidden])').forEach(openMenu=>{if(openMenu!==menu)openMenu.hidden=true;});
      menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));
    };
    menu.onclick=e=>{
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(!action)return;
      e.stopPropagation();menu.hidden=true;more.setAttribute('aria-expanded','false');
      if(action==='fullscreen')setTheaterMode(card);
      if(action==='expand')setExpandedMode(card);
      if(action==='mute'){video.muted=!video.muted;menu.querySelector('[data-action="mute"] span').textContent=video.muted?'Ativar áudio':'Silenciar áudio';}
      if(action==='stop'&&entry.local)stopSharing();
      if(action==='kick'&&!entry.local&&state.isHost&&confirm(`Remover ${entry.name} da sala?`))kickMember(entry.ownerId);
    };
  }
  $('#streamCount').textContent=entries.length+pending.length;
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
  state.streamQualityMetrics.set(streamId,metric);
  const badge=document.querySelector(`[data-stream="${CSS.escape(streamId)}"] .quality-badge`);if(badge){if(metric.width&&metric.height)badge.textContent=`${metric.width}×${metric.height}${metric.fps?` · ${metric.fps} FPS`:''}`;badge.title=`Bitrate automático${metric.bitrate?`: ${(metric.bitrate/1_000_000).toFixed(1)} Mbps`:''}${metric.rtt?` · latência ${Math.round(metric.rtt)} ms`:''}${metric.reason!=='none'?` · limite: ${metric.reason==='cpu'?'desempenho do PC':metric.reason==='bandwidth'?'rede':'codificador'}`:''}`;}
}
function refreshStreamQuality(){for(const [id,stream] of state.streams)sampleStreamQuality(id,stream);}
function showStreamError(card,message){if(!card||card.querySelector('.stream-error'))return;const panel=document.createElement('div');panel.className='stream-error';panel.setAttribute('role','status');panel.textContent=message;card.querySelector('.stream-visual')?.append(panel);}
function sendToAll(message) { for(const conn of state.dataConnections.values()) if(conn.open) conn.send(message); }
function handleData(conn) {
  state.dataConnections.set(conn.peer,conn);
  conn.on('data',message=>{
    if(!message||typeof message!=='object')return;
    if(message.type==='hello'&&state.isHost){const member=[...state.members.values()].find(m=>m.peerId===conn.peer);if(member)toast(`${member.nickname||member.name} entrou na sala`);}
    if(message.type==='retry-stream'&&state.localStream){state.calls.get(conn.peer)?.close();state.calls.delete(conn.peer);ensureCall(conn.peer,state.localStream);}
    if(message.type==='publisher-start') {const m=[...state.members.values()].find(item=>item.peerId===message.peerId);if(m)m.streaming=true;renderPeople();toast(`${message.name} começou a transmitir`);}
    if(message.type==='publisher-stop') {removeRemoteStream(message.peerId);const m=[...state.members.values()].find(item=>item.peerId===message.peerId);if(m)m.streaming=false;renderPeople();}
  });
  conn.on('close',()=>{state.dataConnections.delete(conn.peer);renderPeople();});
}
function ensureDataConnection(uid,peerId) {
  if(!state.peer||!uid||!peerId||uid===state.user?.uid||peerId===state.peer.id||state.dataConnections.has(peerId))return;
  if(state.user.uid.localeCompare(uid)>0)return;
  const conn=state.peer.connect(peerId,{reliable:true,metadata:{name:state.nickname,userId:state.user.uid}});
  handleData(conn);conn.on('open',()=>conn.send({type:'hello',name:state.nickname}));
}
function handleInboundMessage(peerId,message) {
  if(!message||typeof message!=='object')return;
  if(message.type==='rename'&&state.isHost){const m=[...state.members.values()].find(member=>member.peerId===peerId);if(m)toast('Perfil atualizado por '+(m.nickname||m.name)+'.');}
  if(message.type==='publisher-start'){const m=[...state.members.values()].find(member=>member.peerId===peerId);if(m)m.streaming=true;renderPeople();toast(`${message.name} começou a transmitir`);}
  if(message.type==='publisher-stop'){removeRemoteStream(peerId);const m=[...state.members.values()].find(member=>member.peerId===peerId);if(m)m.streaming=false;renderPeople();}
}
function ensureCall(peerId, stream=state.localStream) {
  if(!stream||!peerId||peerId===state.peer?.id||state.calls.has(peerId))return;
  const call=state.peer.call(peerId,stream,{metadata:{name:state.nickname,userId:state.user?.uid,appName:state.localSource?.audioName||state.localSource?.name||'Aplicativo',sourceType:state.localSource?.type==='screen'?'Tela inteira':'Janela',quality:state.localQuality,ownerId:state.peer.id}});
  if(!call)return;
  state.calls.set(peerId,call);watchMediaConnection(call);configureCallQuality();call.on('close',()=>{state.calls.delete(peerId);configureCallQuality();});call.on('error',err=>{console.error('Falha na chamada de vídeo:',err);toast('Falha ao conectar o vídeo. Tentando recuperar a transmissão.');});
}
function watchMediaConnection(call){
  const connection=call.peerConnection;if(!connection)return;
  connection.addEventListener('connectionstatechange',()=>{
    if(connection.connectionState==='connected'){state.recoveryAttempts.delete(call.peer);setRoomStatus('Vídeo conectado · P2P',true);return;}
    if(connection.connectionState==='disconnected'){setRoomStatus('Vídeo instável · aguardando rede');return;}
    if(connection.connectionState!=='failed')return;
    setRoomStatus('Vídeo interrompido · tentando recuperar');toast('A conexão de vídeo caiu. O Foco vai tentar reconectar.');
    const attempts=state.recoveryAttempts.get(call.peer)||0;if(attempts>=2)return;state.recoveryAttempts.set(call.peer,attempts+1);
    setTimeout(()=>{const member=[...state.members.values()].find(item=>item.peerId===call.peer);const connection=state.dataConnections.get(call.peer);if(member?.streaming&&connection?.open&&!state.streams.has(call.peer))connection.send({type:'retry-stream'});},1800);
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
function handleCall(call) {
  state.incomingCalls.set(call.peer,call);
  try{call.answer();}catch(error){console.error('Não foi possível responder à chamada:',error);toast('Não foi possível aceitar a transmissão recebida.');return;}
  const connection=call.peerConnection;watchMediaConnection(call);
  call.on('stream',stream=>{
    const meta=call.metadata||{};const member=[...state.members.values()].find(m=>m.peerId===call.peer);const id=member?.peerId||meta.ownerId||call.peer;
    if(!stream.getVideoTracks().length){call.close();state.incomingCalls.delete(call.peer);const member=[...state.members.values()].find(item=>item.peerId===call.peer);if(member)member.streaming=true;renderStreams();toast(`${meta.name||'Participante'} conectou sem enviar vídeo. O Foco vai solicitar uma nova tentativa.`);const data=state.dataConnections.get(call.peer);if(data?.open)data.send({type:'retry-stream'});return;}
    const profile=member||{};state.streams.set(id,{stream,name:meta.name||profile.nickname||'Participante',appName:meta.appName||'Compartilhamento',sourceType:meta.sourceType||'TELA',ownerId:id,uid:profile.uid||meta.userId,quality:meta.quality||'Conexão direta',photo:profile.photo||'',color:profile.color});
    if(member)member.streaming=true;renderStreams();renderPeople();
  });
  call.on('close',()=>{state.incomingCalls.delete(call.peer);removeRemoteStream(call.metadata?.ownerId||call.peer);});
  call.on('error',err=>{console.error('Falha na mídia recebida:',err);toast('O vídeo do participante não conectou. Tente iniciar a transmissão novamente.');});
}
function removeRemoteStream(peerId) { state.streams.delete(peerId);state.streamQualityMetrics.delete(peerId);for(const key of state.qualitySamples.keys())if(key.startsWith(`${peerId}:`))state.qualitySamples.delete(key);renderStreams(); }
function syncRoomMembers(rawMembers){
  const own=rawMembers?.[state.user?.uid];
  if(state.roomConnected&&!own){toast('Você foi removido ou bloqueado nesta sala.');disconnectRoom(false);showNoRoom();return;}
  if(own){state.canStream=own.canStream!==false;state.profile.role=own.role||'member';if(!state.canStream&&state.localStream)stopSharing();$('#shareButton').disabled=!state.canStream;}
  const previous=state.members,active=Object.entries(rawMembers||{}).filter(([uid,member])=>uid!==state.user?.uid&&member?.online!==false&&member?.peerId).map(([uid,member])=>[uid,{...member,peerId:member.peerId,name:member.nickname||member.username||'Participante',publishing:!!member.streaming}]);
  const next=new Map(active);for(const [uid,member] of previous)if(!next.has(uid)){state.calls.get(member.peerId)?.close();state.incomingCalls.get(member.peerId)?.close();state.dataConnections.get(member.peerId)?.close();removeRemoteStream(member.peerId);}
  state.members=next;for(const [id,stream] of state.streams){if(stream.local)continue;const member=active.map(([,item])=>item).find(item=>item.peerId===id);if(member){stream.name=member.nickname||member.username||stream.name;stream.uid=member.uid;stream.photo=member.photo||'';stream.color=member.color;}}renderPeople();renderStreams();if($('#roomManageDialog')?.open)renderRoomModeration();
  for(const [uid,member] of active){ensureDataConnection(uid,member.peerId);if(state.localStream)ensureCall(member.peerId,state.localStream);}
}
async function connectRoom(room) {
  if(!state.user){showAuthGate('Entre na sua conta para usar as salas.');return;}
  if(!window.focoCloud?.isConfigured()){showAuthGate('O serviço online não está configurado neste computador.');return;}
  const code=String(room.code||room.id).toUpperCase();disconnectRoom(false);state.chatMessages=[];state.chatMedia=null;document.body.classList.remove('no-room');
  state.activeRoom=code;state.currentRoomData={...room,code,id:code};state.isHost=room.ownerUid===state.user.uid;
  $('#roomName').textContent=room.name;$('#welcomeTitle').textContent=room.name;$('#copyRoomCode').innerHTML=`CÓDIGO ${esc(code)} <span>⧉</span>`;$('#copyRoomCode').disabled=false;
  renderRooms($('#roomSearch').value);setRoomStatus('Conectando à sala…');state.members=new Map();renderPeople();renderRoomChat();
  // Keep PeerJS's built-in STUN/TURN configuration. Replacing it with STUN-only
  // servers was preventing media calls across some NAT/firewall combinations.
  const peer=new Peer(undefined,{debug:0});state.peer=peer;peerReconnectAttempts=0;
  peer.on('open',async id=>{
    if(state.roomConnected){clearTimeout(peerReconnectTimer);peerReconnectTimer=null;peerReconnectAttempts=0;setRoomStatus('Conexão restaurada · P2P',true);try{const joined=await window.focoCloud.joinRoom(code,state.profile,id);state.currentRoomData={...joined,code,id:code};state.isHost=joined.ownerUid===state.user?.uid;state.canStream=joined.canStream!==false;$('#shareButton').disabled=!state.canStream;renderPeople();toast('Conexão com a sala restaurada.');}catch(error){console.warn('Não foi possível restaurar a presença na sala:',error);setRoomStatus('Sala aberta · sinalização instável');}return;}
    try{
      const joined=await cloudCall(()=>window.focoCloud.joinRoom(code,state.profile,id));state.currentRoomData={...joined,code,id:code};state.isHost=joined.ownerUid===state.user.uid;
      const index=state.rooms.findIndex(r=>r.id===code);if(index>=0)state.rooms[index]={...joined,id:code};else state.rooms.unshift({...joined,id:code});persistRooms();renderRooms($('#roomSearch').value);
      state.profile.role=joined.role;state.canStream=joined.canStream!==false;state.roomConnected=true;
      state.roomListeners.push(await window.focoCloud.watchMemberList(code,syncRoomMembers));
      state.roomListeners.push(await window.focoCloud.watchRoomChat(code,messages=>{state.chatMessages=messages;renderRoomChat();}));
      state.roomListeners.push(await window.focoCloud.watchRoom(code,updated=>{if(!updated||updated.deleted){if(state.rotatingRoom)return;toast('Esta sala foi excluída.');state.rooms=state.rooms.filter(item=>item.id!==code);persistRooms();disconnectRoom();showNoRoom();return;}state.currentRoomData=updated;state.isHost=updated.ownerUid===state.user?.uid;if(state.isHost)state.profile.role='owner';else if(state.profile.role==='owner')state.profile.role='member';renderPeople();const index=state.rooms.findIndex(item=>item.id===code);if(index>=0){state.rooms[index]={...state.rooms[index],...updated,id:code,host:state.isHost};renderRooms($('#roomSearch').value);}$('#roomName').textContent=updated.name;$('#welcomeTitle').textContent=updated.name;$('#copyRoomCode').innerHTML=`CÓDIGO ${esc(code)} <span>⧉</span>`;$('#copyRoomCode').disabled=false;$('#deleteRoomButton').hidden=!state.isHost;$('#rotateRoomCodeButton').hidden=!state.isHost;if($('#roomManageDialog')?.open)renderRoomModeration();}));
      setRoomStatus('Conectado · P2P',true);$('#shareButton').disabled=!state.canStream;$('#inviteButton').disabled=false;toast(`Sala ${joined.name} pronta · código ${code}`);renderPeople();
    }catch(error){console.error('Entrada na sala:',error);setRoomStatus('Falha ao entrar');toast(mapAuthError(error));disconnectRoom(false);showNoRoom();}
  });
  peer.on('connection',conn=>handleData(conn));peer.on('call',handleCall);
  peer.on('error',error=>{console.error('PeerJS:',error);if(['network','socket-error','socket-closed','server-error'].includes(error.type)){setRoomStatus('Conexão instável · tentando recuperar');}else if(error.type==='peer-unavailable'){toast('Um participante se desconectou. Atualizando a lista…');}else{setRoomStatus('Falha na conexão da sala');toast(`Conexão ponto a ponto: ${error.type||error.message}`);}});
  peer.on('disconnected',()=>{
    if(state.peer!==peer||peer.destroyed||!state.activeRoom)return;
    clearTimeout(peerReconnectTimer);peerReconnectAttempts++;
    const delay=Math.min(1000*2**Math.min(peerReconnectAttempts,5),30000);
    setRoomStatus(`Reconectando à sala · nova tentativa em ${Math.ceil(delay/1000)} s`);
    peerReconnectTimer=setTimeout(()=>{if(state.peer!==peer||peer.destroyed||!peer.disconnected)return;try{peer.reconnect();}catch(error){console.warn('Reconexão da sinalização:',error);}},delay);
  });
}
function disconnectRoom(clear=true) {
  clearTimeout(peerReconnectTimer);peerReconnectTimer=null;peerReconnectAttempts=0;
  const code=state.activeRoom;
  state.roomConnected=false;
  state.theaterId=null;state.expandedId=null;document.body.classList.remove('theater-active');window.focoDesktop.setFullscreen(false).catch(()=>{});
  if(state.localStream)window.focoCloud?.updateRoomMember(code,{streaming:false}).catch(()=>{});
  if(code&&state.user)window.focoCloud?.exitRoom(code).catch(()=>{});
  stopSharing(false);
  state.roomListeners.splice(0).forEach(unsubscribe=>{try{unsubscribe();}catch{}});
  for(const call of state.calls.values())call.close();state.calls.clear();
  for(const call of state.incomingCalls.values())call.close();state.incomingCalls.clear();
  for(const conn of state.dataConnections.values())conn.close();state.dataConnections.clear();
  if(state.peer){try{state.peer.destroy();}catch{}state.peer=null;}
  state.members.clear();state.streams.clear();state.chatMessages=[];state.chatMedia=null;state.selected.clear();state.isHost=false;state.canStream=true;
  if(clear){setRoomStatus('Desconectado');renderPeople();renderStreams();renderRoomChat();}
}
async function makeNewRoom(name) {
  try{const room=await cloudCall(()=>window.focoCloud.makeRoom(name));await connectRoom(room);}catch(error){toast(mapAuthError(error));}
}
function showRoomDialog(join=false) {
  const d=$('#roomDialog');$('#dialogEyebrow').textContent=join?'ENTRAR EM UMA SALA':'NOVA SALA';$('#dialogTitle').textContent=join?'Encontre sua galera':'Crie seu espaço';$('#dialogDescription').textContent=join?'Digite o código da sala. Ela continua disponível mesmo quando o dono está offline.':'Uma sala persistente para compartilhar telas com sua galera.';$('#roomFieldLabel').textContent=join?'Código da sala':'Nome da sala';$('#roomInput').placeholder=join?'Ex.: K7M4PQ2A':'Ex.: Squad da noite';$('#dialogSubmit').textContent=join?'Entrar na sala':'Criar sala';$('#roomInput').value='';d.dataset.mode=join?'join':'create';d.showModal();setTimeout(()=>$('#roomInput').focus(),100);
}
async function submitRoomForm(event) {
  event.preventDefault();const value=$('#roomInput').value.trim();if(!value)return;
  if($('#roomDialog').dataset.mode==='join'){
    const code=window.focoCloud.cleanCode(value);if(code.length<6){toast('Digite um código de sala válido.');return;}
    try{const room=await cloudCall(()=>window.focoCloud.findRoom(code));$('#roomDialog').close();await connectRoom(room);}
    catch(error){toast(mapAuthError(error));}
  }else{const name=value.slice(0,32);$('#roomDialog').close();await makeNewRoom(name);}
}
async function listSources() {
  const sources=await window.focoDesktop.listSources();
  const appSources=sources.filter(s=>s.type==='window'&&!/^Developer Tools/i.test(s.name));
  $('#audioSourceSelect').innerHTML='<option value="">Escolha o aplicativo para o áudio…</option>'+appSources.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  $('#audioSourceSelect').disabled=!appSources.length;
  $('#sourceOptions').innerHTML=sources.map(s=>`<button type="button" class="source-option" data-source-id="${esc(s.id)}" data-source-name="${esc(s.name)}" data-source-type="${s.type}"><img class="source-thumb" src="${s.thumbnail}" alt=""><span><strong>${esc(s.name)}</strong><small>${s.type==='screen'?'Monitor':'Janela / aplicativo'}</small></span><span class="source-arrow">›</span></button>`).join('')||'<div class="source-empty">Nenhuma tela ou janela encontrada.</div>';
  document.querySelectorAll('[data-source-id]').forEach(button=>button.onclick=()=>{
    const source={id:button.dataset.sourceId,name:button.dataset.sourceName,type:button.dataset.sourceType};
    const audioSelect=$('#audioSourceSelect');
    if(source.type==='window')audioSelect.value=source.id;
    else if(!audioSelect.value&&appSources.length)audioSelect.value=appSources[0].id;
    const audioSource=sources.find(item=>item.id===audioSelect.value);
    if(!audioSource){toast('Escolha o aplicativo que fornecerá o áudio.');return;}
    startSharing({...source,audioSourceId:audioSource.id,audioName:audioSource.name});
  });
}
async function startSharing(source) {
  const button=$('#shareButton');button.disabled=true;
  let acquiredStream=null, acquiredContext=null, removeListener=null;
  try {
    const qualityProfile=$('#shareQuality').value;
    const profile=QUALITY_PROFILES[qualityProfile]||QUALITY_PROFILES['720p60'];
    const pid=await window.focoDesktop.resolveProcess(source.audioSourceId);
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:source.id,maxWidth:profile.width,maxHeight:profile.height,maxFrameRate:profile.fps}}});
    acquiredStream=stream;
    const track=stream.getVideoTracks()[0];track.contentHint='motion';
    const ctx=new AudioContext({sampleRate:48000});acquiredContext=ctx;await ctx.audioWorklet.addModule(new URL('audio-worklet.js',window.location.href).href);
    const worklet=new AudioWorkletNode(ctx,'pcm-loopback-player',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    const destination=ctx.createMediaStreamDestination();worklet.connect(destination);await ctx.resume();
    const audioTrack=destination.stream.getAudioTracks()[0];if(audioTrack)stream.addTrack(audioTrack);
    removeListener=window.focoDesktop.onAudioChunk(chunk=>{if(!worklet.port) return;const bytes=chunk instanceof Uint8Array?chunk:new Uint8Array(chunk);const aligned=bytes.byteLength-(bytes.byteLength%2);const pcm=new Int16Array(aligned/2);const view=new DataView(bytes.buffer,bytes.byteOffset,aligned);for(let i=0;i<pcm.length;i++)pcm[i]=view.getInt16(i*2,true);worklet.port.postMessage(pcm,[pcm.buffer]);});
    await window.focoDesktop.startAudioCapture(pid);
    const settings=track.getSettings();const actualQuality=settings.width&&settings.height?`${settings.width}×${settings.height} · ${Math.round(settings.frameRate||profile.fps)} FPS`:profile.label;
    state.localStream=stream;state.localSource=source;state.localQuality=actualQuality;state.localQualityProfile=qualityProfile;state.removeAudioListener=removeListener;state.audioContext=ctx;state.audioWorklet=worklet;state.audioDestination=destination;
    state.streams.set(state.peer.id,{stream,name:state.nickname,uid:state.user?.uid,photo:state.profile.photo,color:state.profile.color,appName:source.audioName||source.name,sourceType:source.type==='screen'?'Tela inteira':'Janela',local:true,quality:actualQuality});
    window.focoCloud.updateRoomMember(state.activeRoom,{streaming:true}).catch(error=>console.warn('Status da transmissão:',error));
    for(const member of state.members.values())ensureCall(member.peerId,stream);
    configureCallQuality();
    sendToAll({type:'publisher-start',peerId:state.peer.id,name:state.nickname});
    $('#shareDialog').close();$('#shareLabel').textContent='Parar transmissão';$('#shareButton').classList.add('sharing');renderStreams();renderPeople();toast(`Transmitindo ${source.name} com áudio do aplicativo`);
  } catch(error) {console.error('Share failed:',error);toast(`Não foi possível iniciar: ${error.message||error}`);if(removeListener)removeListener();if(acquiredStream)acquiredStream.getTracks().forEach(track=>track.stop());if(acquiredContext)acquiredContext.close().catch(()=>{});try{await window.focoDesktop.stopAudioCapture();}catch{} }
  finally {button.disabled=false;}
}
function stopSharing(showMessage=true) {
  if(!state.localStream)return;
  if(state.activeRoom)window.focoCloud?.updateRoomMember(state.activeRoom,{streaming:false}).catch(()=>{});
  const id=state.peer?.id;for(const call of state.calls.values())call.close();state.calls.clear();
  state.localStream.getTracks().forEach(track=>track.stop());state.localStream=null;
  if(state.removeAudioListener){state.removeAudioListener();state.removeAudioListener=null;}
  window.focoDesktop.stopAudioCapture().catch(()=>{});
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
async function enterCode(code){const clean=window.focoCloud.cleanCode(code);const room=await cloudCall(()=>window.focoCloud.findRoom(clean));await connectRoom(room);}
async function activateUser(user){
  if(!user){if(unsubscribeUserRooms){unsubscribeUserRooms();unsubscribeUserRooms=null;}if(state.user)disconnectRoom(false);state.user=null;state.rooms=[];renderRooms();showNoRoom();showAuthGate();return;}
  state.user=user;let profile=null;for(let attempt=0;attempt<12&&!profile;attempt++){try{profile=await window.focoCloud.getProfile(user.uid);}catch(error){throw error;}if(!profile)await new Promise(resolve=>setTimeout(resolve,250));}
  if(!profile){showAuthGate('Seu perfil ainda está sendo criado. Feche e abra o app para tentar novamente.');return;}
  state.profile=profile;setSignedInProfile(profile);$('#authGate').hidden=true;$('#authError').textContent='';
  if(unsubscribeUserRooms){unsubscribeUserRooms();unsubscribeUserRooms=null;}
  unsubscribeUserRooms=await window.focoCloud.watchUserRooms(rooms=>{state.rooms=rooms.filter(room=>room&&!room.deleted).map(room=>({...room,id:room.code,code:room.code,host:room.ownerUid===state.user?.uid}));persistRooms();renderRooms($('#roomSearch').value);});
  if(state.pendingInvite){const code=state.pendingInvite;state.pendingInvite='';try{await enterCode(code);}catch(error){toast(mapAuthError(error));}}
}
function initCloudAuth(){
  if(!window.focoCloud?.isConfigured()){showAuthGate('Não foi possível carregar a configuração online do Foco. Reinstale a versão atualizada do app.');$('#backendSetup').hidden=true;$('#authForms').hidden=true;setRoomStatus('Falha na configuração online');return;}
  $('#backendSetup').hidden=true;$('#authForms').hidden=false;showAuthGate();
  if(unsubscribeAuth)unsubscribeAuth();unsubscribeAuth=window.focoCloud.onAuthChanged(user=>activateUser(user).catch(error=>{console.error('Sessão:',error);showAuthGate(mapAuthError(error));}));
}
$('#firebaseConfigForm').onsubmit=async event=>{event.preventDefault();const config={apiKey:$('#firebaseApiKey').value.trim(),authDomain:$('#firebaseAuthDomain').value.trim(),databaseURL:$('#firebaseDatabaseURL').value.trim(),projectId:$('#firebaseProjectId').value.trim(),appId:$('#firebaseAppId').value.trim()};$('#authError').textContent='Conectando ao serviço…';try{if(unsubscribeAuth){unsubscribeAuth();unsubscribeAuth=null;}await window.focoCloud.configure(config);$('#backendSetup').hidden=true;$('#authForms').hidden=false;initCloudAuth();}catch(error){$('#authError').textContent=mapAuthError(error);}};
$('#loginTab').onclick=()=>setAuthMode('login');$('#registerTab').onclick=()=>setAuthMode('register');
$('#loginForm').onsubmit=async event=>{event.preventDefault();$('#authError').textContent='Conectando…';try{await window.focoCloud.login($('#loginEmail').value,$('#loginPassword').value);}catch(error){$('#authError').textContent=mapAuthError(error);}};
$('#registerForm').onsubmit=async event=>{event.preventDefault();$('#authError').textContent='Criando sua conta…';try{await window.focoCloud.register({email:$('#registerEmail').value,password:$('#registerPassword').value,username:$('#registerUsername').value,nickname:$('#registerNickname').value});}catch(error){$('#authError').textContent=mapAuthError(error);}};
$('#logoutButton').onclick=async()=>{if(state.activeRoom)await window.focoCloud.exitRoom(state.activeRoom).catch(()=>{});disconnectRoom(false);$('#profileDialog').close();await window.focoCloud.logout();};
$('#createRoom').onclick=()=>showRoomDialog(false);$('#joinRoom').onclick=()=>showRoomDialog(true);$('#roomForm').onsubmit=submitRoomForm;
$('#homeCreateRoom').onclick=()=>showRoomDialog(false);$('#homeJoinRoom').onclick=()=>showRoomDialog(true);
$('#shareButton').onclick=()=>{if(state.localStream)stopSharing();else if(!state.canStream)toast('O dono da sala não permitiu que seu perfil transmita.');else if(!state.peer||!state.peer.open)toast('Entre em uma sala antes de transmitir.');else{listSources().then(()=>$('#shareDialog').showModal()).catch(e=>toast(`Falha ao buscar telas: ${e.message}`));}};
async function copyText(value){try{if(window.focoDesktop?.writeClipboard){await window.focoDesktop.writeClipboard(value);return true;}await navigator.clipboard.writeText(value);return true;}catch{return false;}}
$('#inviteButton').onclick=async()=>{const room=currentRoom();if(!room){toast('Entre em uma sala primeiro.');return;}const link=`foco://join/${room.code}`;if(await copyText(link))toast('Link de convite copiado.');else toast(`Não foi possível copiar. Link: ${link}`);};
$('#copyRoomCode').onclick=async()=>{const room=currentRoom();if(!room){toast('Entre em uma sala para copiar o código.');return;}if(await copyText(room.code))toast(`Código ${room.code} copiado.`);else toast(`Não foi possível copiar. Código: ${room.code}`);};
$('#roomSearch').oninput=e=>renderRooms(e.target.value);
$('#roomsNav').onclick=()=>{$('#roomsNav').classList.add('active');if(!currentRoom())toast('Crie uma sala ou entre com um código.');};
$('#profileButton').onclick=openProfile;$('#profileButtonTop').onclick=openProfile;
$('#settingsButton').onclick=openSettings;$('#manageRoomButton').onclick=openRoomManagement;
document.addEventListener('click',event=>{const close=event.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close)?.close();});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();}));
$('#profilePhoto').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>8*1024*1024){toast('Escolha uma imagem de até 8 MB.');event.target.value='';return;}try{state.pendingPhoto=await compressAvatar(file);$('#profilePhotoPreview').innerHTML=`<img src="${state.pendingPhoto}" alt="Prévia da foto"><span>Prévia da foto</span>`;updateProfilePreview();}catch{toast('Não foi possível carregar esta imagem.');}};
$('#profileForm').onsubmit=async event=>{event.preventDefault();const nickname=$('#nicknameInput').value.trim();if(!nickname){toast('Digite um apelido.');return;}const profile={nickname:nickname.slice(0,24),status:$('#profileStatus').value.trim().slice(0,48)||'Disponível',activity:$('#profileActivity').value.trim().slice(0,80),color:$('#profileColor').value,showActivity:$('#showActivity').checked,photo:state.pendingPhoto??state.profile.photo};try{state.profile=await cloudCall(()=>window.focoCloud.saveProfile(profile));state.pendingPhoto=undefined;setSignedInProfile(state.profile);await window.focoCloud.syncProfileToRooms(state.profile);renderPeople();$('#profileDialog').close();toast('Perfil atualizado.');}catch(error){toast(mapAuthError(error));}};
$('#defaultQuality').onchange=event=>{localStorage.setItem('foco.quality',event.target.value);$('#shareQuality').value=event.target.value;toast('Qualidade padrão atualizada.');};
$('#shareQuality').onchange=event=>localStorage.setItem('foco.quality',event.target.value);
$('#appLanguage').onchange=event=>window.focoI18n?.setLanguage(event.target.value);
window.addEventListener('foco-language-change',()=>{renderRoomChat();toast('Idioma alterado.');});
$('#chatInput').oninput=updateChatControls;
$('#chatInput').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMessage();}};
$('#chatSendButton').onclick=sendChatMessage;
$('#chatAttachButton').onclick=()=>$('#chatFileInput').click();
$('#chatEmojiButton').onclick=openChatEmojiPicker;
$('#chatFileInput').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{state.chatMedia=await prepareChatImage(file);updateChatAttachment();toast('Imagem pronta para enviar.');}catch(error){state.chatMedia=null;event.target.value='';toast(error.message==='file'?'Não foi possível abrir esta imagem.':error.message);}};
$('#chatMessages').onclick=async event=>{const image=event.target.closest('[data-chat-media]');if(image){image.classList.toggle('zoomed');return;}const removeButton=event.target.closest('[data-chat-delete]');if(!removeButton)return;try{await window.focoCloud.deleteRoomChatMessage(state.activeRoom,removeButton.dataset.chatDelete);toast('Mensagem removida.');}catch(error){toast(error.message||'Não foi possível remover a mensagem.');}};
document.addEventListener('click',event=>{if(!event.target.closest('.chat-composer'))$('#chatEmojiPicker').hidden=true;});
$('#checkUpdatesButton').onclick=async()=>{try{await window.focoDesktop.checkForUpdates();}catch(error){console.warn('Falha na verificação de atualizações:',error);renderUpdateStatus({state:'error'});}};
$('#startupContinue').onclick=()=>{$('#startupScreen').classList.add('is-done');clearTimeout(startupFallbackTimer);};
$('#gridViewButton').onclick=()=>setDisplayMode('grid');$('#listViewButton').onclick=()=>setDisplayMode('list');
$('#leaveRoomButton').onclick=leaveCurrentRoom;$('#deleteRoomButton').onclick=deleteCurrentRoom;$('#rotateRoomCodeButton').onclick=rotateRoomCode;
$('#reduceMotionEnabled').onchange=event=>{localStorage.setItem('foco.reduceMotion',String(event.target.checked));document.documentElement.classList.toggle('reduce-motion',event.target.checked);};
$('#nicknameInput').oninput=updateProfilePreview;$('#profileStatus').oninput=updateProfilePreview;
$('#profilePalette').onclick=event=>{const swatch=event.target.closest('[data-profile-color]');if(swatch)setProfileColor(swatch.dataset.profileColor);};
$('#profileColor').oninput=event=>setProfileColor(event.target.value);
$('#profileColorHex').oninput=event=>{const value=event.target.value.trim();if(/^#[0-9a-f]{6}$/i.test(value))setProfileColor(value);};
$('#profileColorHex').onblur=event=>{if(!/^#[0-9a-f]{6}$/i.test(event.target.value.trim()))event.target.value=$('#profileColor').value;};
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;if(state.expandedId){const card=document.querySelector('[data-stream="'+CSS.escape(state.expandedId)+'"]');if(card)setExpandedMode(card);return;}if(state.theaterId){const card=document.querySelector('[data-stream="'+CSS.escape(state.theaterId)+'"]');if(card)setTheaterMode(card);else{state.theaterId=null;document.body.classList.remove('theater-active');window.focoDesktop.setFullscreen(false).catch(()=>{});}}});
window.addEventListener('beforeunload',()=>{if(state.activeRoom&&state.user)window.focoCloud.exitRoom(state.activeRoom).catch(()=>{});disconnectRoom(false);});
$('#shareQuality').value=localStorage.getItem('foco.quality')||'720p60';
setDisplayMode('grid');renderRooms();showNoRoom();renderPeople();renderStreams();setInterval(refreshStreamQuality,2500);initCloudAuth();
initializeUpdateUi();
window.focoDesktop.getPendingInvite?.().then(code=>{if(code)state.pendingInvite=code;}).catch(()=>{});
window.focoDesktop.onInvite?.(code=>{if(state.user)enterCode(code).catch(error=>toast(mapAuthError(error)));else{state.pendingInvite=code;showAuthGate('Entre ou crie uma conta para abrir o convite.');}});
