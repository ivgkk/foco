export function createCapture(ports) {
  const { state, $, desktop, cloud, sharePicker, selectedShareSource, shareAudioSources,
    populateShareAudio, renderShareSources, sharePeerReady, setShareStatus,
    updateShareControls, withShareTimeout, qualityProfiles, ensureCall,
    configureCallQuality, sendToAll, renderStreams, renderPeople, toast } = ports;
  let shareAttempt = null;
  let activeAudio = null;
function shareCancelled(){const error=new Error('Share attempt cancelled');error.cancelled=true;return error;}
async function startSharing(){
  if(shareAttempt||state.localStream)return;
  const source=selectedShareSource(),audioId=$('#audioSourceSelect').value,audioSource=shareAudioSources().find(s=>s.id===audioId),withAudio=audioId!=='none';
  if(!source){setShareStatus('Selecione uma tela ou janela válida.','error');return;}
  if(withAudio&&!audioSource){setShareStatus('Selecione um aplicativo de áudio válido ou Sem áudio.','error');return;}
  const qualityProfile=$('#shareQuality').value,profile=qualityProfiles[qualityProfile]||qualityProfiles['720p60'];
  const op={cancelled:false,room:state.activeRoom,peer:state.peer,audioToken:crypto.randomUUID()};shareAttempt=op;$('#shareButton').disabled=true;updateShareControls();
  const current=()=>shareAttempt===op&&!op.cancelled&&$('#shareDialog').open&&state.activeRoom===op.room&&state.peer===op.peer&&op.peer?.open&&!op.peer.disconnected&&!op.peer.destroyed&&state.roomConnected&&state.canStream&&!state.localStream;
  const ensureCurrent=()=>{if(!current()){if(shareAttempt===op&&!op.cancelled&&$('#shareDialog').open&&state.activeRoom===op.room&&state.peer===op.peer&&!sharePeerReady())throw new Error('Conexão com a sala perdida. Aguarde a reconexão e tente novamente.');throw shareCancelled();}};
  let acquiredStream=null,acquiredContext=null,removeListener=null,audioRequested=false,announced=false,committed=false;
  try{
    setShareStatus('Verificando fontes…');
    const available=await withShareTimeout(desktop().listSources(),10000,'A lista de fontes demorou para responder.');ensureCurrent();
    const confirmedSource=Array.isArray(available)?available.find(s=>s.id===source.id&&s.type===source.type):null;
    const confirmedAudio=withAudio&&Array.isArray(available)?available.find(s=>s.id===audioSource.id&&s.type==='window'):null;
    if(!confirmedSource||withAudio&&!confirmedAudio){
      sharePicker.sources=Array.isArray(available)?available:[];
      if(!confirmedSource)sharePicker.selectedId=null;
      populateShareAudio(withAudio?audioSource.id:'none');renderShareSources();
      throw new Error(!confirmedSource?'A fonte selecionada não está mais disponível. Escolha outra fonte.':'O aplicativo de áudio selecionado não está disponível.');
    }
    let pid=null;
    if(withAudio){setShareStatus('Preparando captura de áudio…');pid=await desktop().resolveProcess(audioSource.id);ensureCurrent();}
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
      removeListener=desktop().onAudioChunk(chunk=>{if(!worklet.port)return;const bytes=chunk instanceof Uint8Array?chunk:new Uint8Array(chunk);const aligned=bytes.byteLength-(bytes.byteLength%2);const pcm=new Int16Array(aligned/2);const view=new DataView(bytes.buffer,bytes.byteOffset,aligned);for(let i=0;i<pcm.length;i++)pcm[i]=view.getInt16(i*2,true);worklet.port.postMessage(pcm,[pcm.buffer]);});
      setShareStatus('Iniciando áudio do aplicativo…');audioRequested=true;
      await desktop().startAudioCapture(pid,op.audioToken);ensureCurrent();
    }
    setShareStatus('Confirmando transmissão na sala…');
    if(track.readyState==='ended')throw new Error('A fonte de vídeo foi encerrada antes de iniciar a transmissão.');
    await cloud().updateRoomMember(op.room,{streaming:true},op.peer.id);announced=true;ensureCurrent();
    if(track.readyState==='ended')throw new Error('A fonte de vídeo foi encerrada antes de iniciar a transmissão.');
    const settings=track.getSettings(),actualQuality=settings.width&&settings.height?`${settings.width}×${settings.height} · ${Math.round(settings.frameRate||profile.fps)} FPS`:profile.label;
    const entry={stream:acquiredStream,name:state.nickname,uid:state.user?.uid,photo:state.profile.photo,color:state.profile.color,appName:confirmedAudio?.name||confirmedSource.name,sourceName:confirmedSource.name,sourceType:confirmedSource.type==='screen'?'Tela inteira':'Janela',local:true,quality:actualQuality};
    state.localStream=acquiredStream;state.localSource={id:confirmedSource.id,name:confirmedSource.name,type:confirmedSource.type,audioSourceId:confirmedAudio?.id||null,audioName:confirmedAudio?.name||null};state.localQuality=actualQuality;state.localQualityProfile=qualityProfile;
    activeAudio={removeListener,context:acquiredContext,worklet,destination,token:audioRequested?op.audioToken:null};
    state.streams.set(op.peer.id,entry);committed=true;
    track.addEventListener('ended',()=>{if(state.localStream===acquiredStream)stopSharing();},{once:true});
    for(const member of state.members.values())ensureCall(member.peerId,acquiredStream);
    configureCallQuality();sendToAll({type:'publisher-start',peerId:op.peer.id,name:state.nickname});
    localStorage.setItem('foco.quality',qualityProfile);
    $('#shareLabel').textContent='Parar transmissão';$('#shareButton').classList.add('sharing');renderStreams();renderPeople();
    shareAttempt=null;$('#shareDialog').close();toast(withAudio?`Transmitindo ${confirmedSource.name} com áudio do aplicativo`:'Transmitindo somente vídeo');
  }catch(error){
    if(committed&&state.localStream===acquiredStream)stopSharing(false);
    else{if(removeListener)removeListener();acquiredStream?.getTracks().forEach(track=>track.stop());if(acquiredContext)await acquiredContext.close().catch(()=>{});if(audioRequested)await desktop().stopAudioCapture(op.audioToken).catch(()=>{});}
    if(announced&&!committed)await cloud().updateRoomMember(op.room,{streaming:false},op.peer.id).catch(()=>{});
    if(!error.cancelled&&$('#shareDialog').open){console.warn('Falha ao compartilhar:',error);setShareStatus(error.name==='NotAllowedError'?'Permissão de captura negada. Confira as permissões do sistema.':error.message||'Não foi possível iniciar a transmissão.','error');}
  }finally{if(shareAttempt===op)shareAttempt=null;$('#shareButton').disabled=!state.canStream||!sharePeerReady();updateShareControls();}
}
function stopSharing(showMessage=true,{remote=true}={}) {
  if(!state.localStream)return;
  if(remote&&state.activeRoom)cloud()?.updateRoomMember(state.activeRoom,{streaming:false},state.peer?.id).catch(()=>{});
  const id=state.peer?.id;for(const call of state.calls.values())call.close();state.calls.clear();
  state.localStream.getTracks().forEach(track=>track.stop());state.localStream=null;
  const audio=activeAudio;activeAudio=null;
  audio?.removeListener?.();
  if(audio?.token)desktop().stopAudioCapture(audio.token).catch(()=>{});
  if(audio?.context)audio.context.close().catch(()=>{});
  state.streams.delete(id);sendToAll({type:'publisher-stop',peerId:id});
  for(const timer of state.qualityTimers.values())clearInterval(timer);state.qualityTimers.clear();state.streamQualityMetrics.delete(id);for(const key of state.qualitySamples.keys())if(key.startsWith(`${id}:`))state.qualitySamples.delete(key);
  state.localSource=null;state.localQuality=null;state.localQualityProfile=null;
  $('#shareLabel').textContent='Compartilhar tela';$('#shareButton').classList.remove('sharing');renderStreams();renderPeople();if(showMessage)toast('Transmissão encerrada.');
}

  return {
    get attempt(){ return shareAttempt; },
    cancelAttempt(){ if (shareAttempt) shareAttempt.cancelled = true; },
    setFixtureAttempt(value){ if (/-(?:smoke|fixture)\.html$/.test(location.pathname)) shareAttempt = value; },
    startSharing, stopSharing
  };
}
