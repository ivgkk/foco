export function createRoomSession(ports) {
  const { state, $, document, cloud, createPeer, showAuthGate, renderRooms,
    setRoomStatus, renderPeople, renderRoomChat, esc, icon, handleData, handleCall,
    updateChatControls, updateShareControls, finishRoomJoin, suspendP2PForRevalidation,
    toast, cancelSharePicker, stopSharing, renderStreams, showNoRoom } = ports;
  let peerReconnectTimer = null;
  let peerReconnectAttempts = 0;
function advanceAuth(){return ++state.authGeneration;}
function setUser(user){state.user=user;}
function p2pContext(peer=state.peer){return {peer,room:state.activeRoom,userId:state.user?.uid,generation:state.p2pGeneration,openVersion:state.roomAttempt?.openVersion};}
function sameRoomIdentity(context){return !!(context.peer&&state.peer===context.peer&&state.activeRoom===context.room&&state.user?.uid===context.userId&&state.p2pGeneration===context.generation&&state.roomAttempt?.openVersion===context.openVersion);}
function sameP2PSession(context){return sameRoomIdentity(context)&&state.roomConnected;}
function currentP2P(context){return sameP2PSession(context)&&state.ownMember?.peerId===context.peer.id;}
function roomAttemptCurrent(attempt){return !!(attempt&&state.roomAttempt===attempt&&state.peer===attempt.peer&&state.activeRoom===attempt.code&&state.user?.uid===attempt.userId&&state.authGeneration===attempt.authGeneration&&state.p2pGeneration===attempt.generation);}
async function connectRoom(room) {
  if(!state.user){showAuthGate('Entre na sua conta para usar as salas.');return;}
  if(!cloud()?.isConfigured()){showAuthGate('O serviço online não está configurado neste computador.');return;}
  const code=String(room.code||room.id).toUpperCase();disconnectRoom(false);state.chatMessages=[];state.chatMedia=null;state.lastChatSentAt=0;state.membersLoaded=false;state.ownMember=null;state.membersError='';state.chatLoaded=false;state.chatSeenAt=0;state.chatSeenIds.clear();state.chatError='';state.openPersonMenu=null;document.body.classList.remove('no-room');
  state.activeRoom=code;state.currentRoomData={...room,code,id:code};state.isHost=room.ownerUid===state.user.uid;
  $('#roomName').textContent=room.name;$('#copyRoomCode').innerHTML=`${esc(code)} ${icon('copy','icon-sm')}`;$('#copyRoomCode').disabled=false;
  renderRooms($('#roomSearch').value);setRoomStatus('Conectando à sala…');state.members=new Map();renderPeople();renderRoomChat();
  // Keep PeerJS's built-in STUN/TURN configuration. Replacing it with STUN-only
  // servers was preventing media calls across some NAT/firewall combinations.
  const peer=createPeer();state.peer=peer;peerReconnectAttempts=0;
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
    suspendP2PForRevalidation();
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
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  state.theaterId=null;state.expandedId=null;document.body.classList.remove('theater-active');
  stopSharing(false,{remote});
  if(remote&&code&&peerId&&state.user)cloud()?.exitRoom(code,peerId).catch(()=>{});
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
function authCurrent(generation,uid){return state.authGeneration===generation&&state.user?.uid===uid;}

  return { p2pContext, sameRoomIdentity, sameP2PSession, currentP2P,
    roomAttemptCurrent, authCurrent, advanceAuth, setUser, connectRoom, disconnectRoom };
}
