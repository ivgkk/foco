export function createStage(ports) {
  const { state, $, document, icon, esc, tr, toast, stopSharing, setDisplayMode,
    currentRoom, confirmedRoomAction, kickMember, avatarColor, ensureDataConnection,
    mediaConnectionState, observeMediaConnection, readStreamQuality } = ports;
let fullscreenReturnFocus=null;
function syncFullscreenState(){
  const card=document.fullscreenElement;
  const id=card?.classList?.contains('stream-card')?card.dataset.stream:null;
  state.theaterId=id&&state.streamTiles.get(id)?.card===card&&state.streams.has(id)?id:null;
  document.body.classList.toggle('theater-active',!!state.theaterId);
  refreshStreamTiles();
  if(state.theaterId){state.streamTiles.get(state.theaterId)?.fullscreen.focus();return;}
  const target=fullscreenReturnFocus?.isConnected?fullscreenReturnFocus:state.streamTiles.get(state.focusedId)?.card||$('#listViewButton');
  fullscreenReturnFocus=null;
  target?.focus();
  // Windows can move focus to the window itself after the DOM fullscreen event.
  setTimeout(()=>{if(!document.fullscreenElement&&target?.isConnected)target.focus();},80);
}
async function setTheaterMode(card) {
  const id=card?.dataset.stream;
  if(!id||!card.isConnected||state.streamTiles.get(id)?.card!==card||!state.streams.has(id))return;
  try {
    if(document.fullscreenElement===card){await document.exitFullscreen();return;}
    if(!document.fullscreenElement){const active=document.activeElement;fullscreenReturnFocus=active?.closest?.('.stream-menu')?card.querySelector('.card-more'):card.contains(active)?active:card.querySelector('.stream-fullscreen');}
    await card.requestFullscreen();
    if(!card.isConnected||state.streamTiles.get(id)?.card!==card||!state.streams.has(id))await document.exitFullscreen();
  } catch(error) {
    console.warn('Fullscreen failed:',error);
    if(!document.fullscreenElement){fullscreenReturnFocus=null;syncFullscreenState();}
    toast('Não foi possível alternar para tela cheia.');
  }
}
document.addEventListener('fullscreenchange',syncFullscreenState);
function setExpandedMode(card) {
  if(document.fullscreenElement===card)document.exitFullscreen().catch(()=>{});
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
  const connection=mediaConnectionState(tile.call);
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
  observeMediaConnection(tile.call,()=>refreshTileMediaState(tile),signal);
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
  setAttr(tile.fullscreen,'aria-label',`${tr(theater?'Sair da tela cheia':'Abrir em tela cheia')} · ${entry.name}`);setAttr(tile.fullscreen,'aria-pressed',String(theater));setText(tile.fullscreen.querySelector('span'),theater?'Sair da tela cheia':'Tela cheia');
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
  if(state.theaterId&&!state.streams.has(state.theaterId)&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});
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
  const metric=await readStreamQuality(streamId,stream);
  if(!metric)return;
  // Stats are async: ignore results for a stream that was removed or replaced meanwhile.
  if(state.streams.get(streamId)!==stream)return;
  state.streamQualityMetrics.set(streamId,metric);
  const tile=state.streamTiles.get(streamId);if(tile){setText(tile.quality,qualityLabel(streamId,stream));setAttr(tile.quality,'title',qualityTitle(streamId));}
}
function refreshStreamQuality(){for(const [id,stream] of state.streams)sampleStreamQuality(id,stream);}
function showStreamError(card,message){if(!card||card.querySelector('.stream-error'))return;const panel=document.createElement('div');panel.className='stream-error';panel.setAttribute('role','status');panel.textContent=tr(message);card.querySelector('.stream-visual')?.append(panel);}

  return { syncFullscreenState, setTheaterMode, setExpandedMode, setText, setHTML, setAttr, setStyle, playbackPrefs, qualityLabel, qualityTitle, closeStreamMenus, focusStream, stageIds, cycleStage, createStreamTile, applyPlayback, tileMediaState, refreshTileMediaState, setTileFailure, stopTileMediaWatch, attachTileMedia, updateStreamTile, destroyStreamTile, refreshStreamTiles, updatePendingTile, updateStageGeometry, renderStreams, sampleStreamQuality, refreshStreamQuality, showStreamError, get fullscreenReturnFocus(){ return fullscreenReturnFocus; } };
}
