export function createP2P(ports) {
  const { state, cloud, p2pContext, sameP2PSession, currentP2P, sameRoomIdentity,
    renderPeople, renderStreams, setRoomStatus, toast, qualityProfiles } = ports;
const P2P_AUTH_WAIT_MS=4000;
const P2P_VERIFY_MS=5000;
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
  if(!found||publishing&&found.member.canStream===false||localPublishing&&state.ownMember?.canStream===false||typeof cloud()?.verifyRoomPeer!=='function')return null;
  let timeoutId;
  try{
    const result=await Promise.race([Promise.all([
      cloud().verifyRoomPeer(context.room,found.uid,peerId),
      localPublishing?cloud().verifyRoomPeer(context.room,context.userId,context.peer.id):Promise.resolve(null)
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
  const profile=qualityProfiles[state.localQualityProfile]||qualityProfiles['720p60'];
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

function mediaConnectionState(call){return call?.peerConnection?.connectionState;}
function observeMediaConnection(call,handler,signal){call?.peerConnection?.addEventListener?.('connectionstatechange',handler,{signal});}
async function readStreamQuality(streamId,stream){
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
  if(!samples.length)return null;
  return {width:Math.max(...samples.map(s=>s.width||0)),height:Math.max(...samples.map(s=>s.height||0)),fps:Math.round(Math.max(...samples.map(s=>s.fps||0))),bitrate:samples.reduce((sum,s)=>sum+(s.bitrate||0),0),rtt:Math.max(...samples.map(s=>s.rtt||0)),reason:samples.find(s=>s.reason&&s.reason!=='none')?.reason||'none'};
}

  return { memberForPeer, revokePeer, authorizePeer, sendToAll, handleData,
    ensureDataConnection, ensureCall, watchMediaConnection, configureCallQuality,
    handleCall, removeRemoteStream, mediaConnectionState, observeMediaConnection, readStreamQuality };
}
