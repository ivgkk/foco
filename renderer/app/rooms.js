export function createRoomFlow(ports) {
  const { state, $, cloudCall, toast, disconnectRoom, showNoRoom, renderPeople, stopSharing, renderStreams, renderRoomModeration, ensureDataConnection, ensureCall, renderRoomChat, latestMessageAt, persistRooms, renderRooms, esc, icon, setRoomStatus, updateShareControls, updateChatControls, mapAuthError, revokePeer, removeRemoteStream, roomAttemptCurrent } = ports;
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
  for(const [uid,member] of state.members){ensureDataConnection(uid,member.peerId);if(state.localStream)ensureCall(member.peerId,state.localStream);}
  if($('#shareDialog').open)updateShareControls();updateChatControls();renderPeople();
  setRoomStatus('Conexão restaurada · P2P',true);toast('Conexão com a sala restaurada.');
}
function suspendP2PForRevalidation(){
  for(const timer of state.recoveryTimers)clearTimeout(timer);state.recoveryTimers.clear();state.recoveryAttempts.clear();
  for(const timer of state.qualityTimers.values())clearInterval(timer);state.qualityTimers.clear();
  for(const call of state.calls.values())call.close();state.calls.clear();
  for(const call of state.incomingCalls.values())call.close();state.incomingCalls.clear();
  for(const conn of state.dataConnections.values())conn.close();state.dataConnections.clear();
  state.pendingOutgoingCalls.clear();state.lastRetryAt.clear();
  for(const [id,stream] of [...state.streams])if(!stream.local)removeRemoteStream(id);
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

  return { syncRoomMembers, watchPanelMembers, watchPanelChat, compensateStaleJoin, watchCurrentRoom, confirmRestoredRoom, suspendP2PForRevalidation, finishRoomJoin };
}
