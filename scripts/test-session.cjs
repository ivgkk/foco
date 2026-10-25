const assert=require('node:assert/strict');
const fs=require('node:fs');
const { createFixtureRenderer } = require('./fixture-renderer.cjs');
const path=require('node:path');
const {app,BrowserWindow}=require('electron');

// Run the real renderer and the actual ordering helpers from firebase-client.js against
// controllable local promises. The fixture has no Firebase SDK, credentials or network PeerJS.
const cloudSource=file=>fs.readFileSync(path.join(__dirname,'..','renderer','cloud',file),'utf8');
const between=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const orderedSource=between(cloudSource('context.js'),'function inRoomOrder(', 'function sameFirebaseUser(');
const roomsSource=between(cloudSource('rooms.js'),'async function watchUserRooms(', 'function updateRoomMember(');
const exitSource=between(cloudSource('rooms.js'),'async function exitRoomNow(', 'async function markRoomDeleted(');
assert.ok(orderedSource.startsWith('function inRoomOrder(')&&roomsSource.startsWith('async function watchUserRooms(')&&exitSource.startsWith('async function exitRoomNow('));
const stubs=`window.focoDesktop={listSources:async()=>[],resolveProcess:async()=>1,startAudioCapture:async()=>true,stopAudioCapture:async()=>true,setFullscreen:async()=>true,getAppVersion:async()=>'test',writeClipboard:async()=>true,getUpdateStatus:async()=>({state:'unavailable'}),checkForUpdates:async()=>({}),getPendingInvite:async()=>'',onInvite:()=>()=>{},onAudioChunk:()=>()=>{},onUpdateStatus:()=>()=>{},platform:'win32'};
window.__sessionTest={rooms:{ROOMA1:{code:'ROOMA1',name:'Sala A',ownerUid:'u1'},ROOMB2:{code:'ROOMB2',name:'Sala B',ownerUid:'u1'}},joins:[],exits:[],presence:new Map(),gates:new Map(),listeners:new Map(),unsubscribed:[],profiles:{u1:{username:'u1',nickname:'Conta A',color:'#9b83ff',photo:''},u2:{username:'u2',nickname:'Conta B',color:'#9b83ff',photo:''}},profileGates:new Map(),sourceReads:new Map(),sourceResults:[],sourceAuthUid:'source-user'};
const test=window.__sessionTest;
const roomQueue=new Map();
function orderedRoom(code,operation){const prior=roomQueue.get(code)||Promise.resolve(),current=prior.catch(()=>{}).then(operation);roomQueue.set(code,current);current.finally(()=>{if(roomQueue.get(code)===current)roomQueue.delete(code);}).catch(()=>{});return current;}
const watch=(key,callback)=>{test.listeners.set(key,callback);return()=>{test.unsubscribed.push(key);if(test.listeners.get(key)===callback)test.listeners.delete(key);};};
window.focoCloud={isConfigured:()=>true,cleanCode:value=>String(value||'').toUpperCase(),onAuthChanged:callback=>{test.authCallback=callback;return()=>{};},getProfile:async uid=>{const gate=test.profileGates.get(uid);if(gate)await gate;return test.profiles[uid];},watchUserRooms:async callback=>watch('userRooms',callback),joinRoom:(code,_profile,peerId)=>{const uid=window.state?.user?.uid||'u1';test.joins.push({code,uid,peerId});const gates=test.gates.get(code)||[],gate=gates.shift();return orderedRoom(code,async()=>{if(gate)await gate;test.presence.set(code,{uid,peerId});return {...test.rooms[code],id:code,role:'owner',canStream:true};});},exitRoom:(code,peerId)=>{test.exits.push({code,peerId});return orderedRoom(code,async()=>{if(test.presence.get(code)?.peerId===peerId)test.presence.delete(code);return true;});},watchMemberList:async(code,callback)=>watch('members:'+code,callback),watchRoomChat:async(code,callback)=>watch('chat:'+code,callback),watchRoom:async(code,callback)=>watch('room:'+code,callback),updateRoomMember:async()=>{},verifyRoomPeer:async(_room,uid,peerId)=>({uid,peerId,canStream:true}),logout:async()=>{test.authCallback?.(null);},findRoom:async code=>test.rooms[code]};
window.Peer=class{constructor(){this.id='p-'+(test.peers?.length||0);this.handlers={};this.open=false;this.disconnected=false;this.destroyed=false;(test.peers||=[]).push(this);}on(type,handler){(this.handlers[type]||=[]).push(handler);}emit(type,...args){for(const handler of this.handlers[type]||[])handler(...args);}openNow(){this.open=true;this.disconnected=false;this.emit('open',this.id);}disconnectNow(){this.open=false;this.disconnected=true;this.emit('disconnected');}reconnect(){this.openNow();}destroy(){this.destroyed=true;this.open=false;this.emit('close');}call(){test.mediaCalls=(test.mediaCalls||0)+1;return null;}connect(id){return{peer:id,on(){},send(){},close(){}};}};
const roomOperationQueues=new Map(),cleanCode=value=>String(value||'').toUpperCase();
${orderedSource}
const db={},ctx={db},requireUser=()=>({uid:test.sourceAuthUid}),sameFirebaseUser=uid=>test.sourceAuthUid===uid,ref=(_db,key)=>({key}),roomPath=code=>({key:'rooms/'+code});
const onValue=(_ref,callback)=>{test.sourceCallback=callback;return()=>{test.sourceUnsubscribed=true;};};
const get=async target=>{const item=test.sourceReads.get(target.key);if(!item)throw Error('Missing source read '+target.key);return item;};
${roomsSource}
const memberPath=(code,uid)=>({key:'member:'+code+':'+uid}),seatPath=(code,slot)=>({key:'seat:'+code+':'+slot});
const findUserSeat=async()=>test.cleanupSeat?1:0,runTransaction=async(_target,callback)=>{const next=callback(test.cleanupRecord);if(next===undefined)return{committed:false};test.cleanupRecord=next;return{committed:true};};
const onDisconnect=()=>({cancel:async()=>{}}),remove=async target=>{(test.cleanupRemovals||=[]).push(target.key);if(target.key.startsWith('seat:'))test.cleanupSeat=false;else test.cleanupRecord=null;};
${exitSource}
window.__source={watchUserRooms,inRoomOrder,exitRoomNow};`;

async function scenarios(){
  const t=window.__sessionTest,results=[];
  const check=(name,ok,detail='')=>results.push({name,ok:Boolean(ok),detail:String(detail)});
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(fn,limit=1200)=>{const end=Date.now()+limit;while(Date.now()<end){if(fn())return true;await sleep(10);}return !!fn();};
  const gate=()=>{let release,reject;const promise=new Promise((yes,no)=>{release=yes;reject=no;});return{promise,release,reject};};
  const pending=(code,g)=>{const list=t.gates.get(code)||[];list.push(g.promise);t.gates.set(code,list);};
  const reset=()=>{disconnectRoom(false,{remote:false});showNoRoom();state.authGeneration++;state.user={uid:'u1'};state.profile={...state.profile,...t.profiles.u1};state.rooms=Object.values(t.rooms).map(room=>({...room,id:room.code}));t.gates.clear();t.joins.length=0;t.exits.length=0;t.presence.clear();t.listeners.clear();t.unsubscribed.length=0;};
  const open=async code=>{await connectRoom(t.rooms[code]);const peer=t.peers.at(-1);peer.openNow();await until(()=>t.joins.some(item=>item.peerId===peer.id));return peer;};
  const own=peer=>({u1:{uid:'u1',peerId:peer.id,online:true,role:'owner',canStream:true}});
  const mediaCall=room=>({peer:'p-remote',metadata:{userId:'remote',ownerId:'p-remote',roomId:room,name:'Remote'},handlers:{},peerConnection:Object.assign(new EventTarget(),{connectionState:'connected',getStats:async()=>new Map()}),answer(){this.answered=true;},on(type,handler){(this.handlers[type]||=[]).push(handler);},emit(type,...args){for(const handler of this.handlers[type]||[])handler(...args);},close(){if(this.closed)return;this.closed=true;this.emit('close');}});
  const videoStream=()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;return canvas.captureStream(5);};
  const status=()=>document.querySelector('#connectionStatusLabel').textContent.trim();
  try{
    reset();const aGate=gate(),bGate=gate();pending('ROOMA1',aGate);pending('ROOMB2',bGate);
    const oldA=await open('ROOMA1'),b=await open('ROOMB2');bGate.release();await until(()=>state.roomConnected&&state.activeRoom==='ROOMB2');aGate.release();await sleep(80);
    check('01 entrada A atrasada não troca a interface de B',state.activeRoom==='ROOMB2'&&state.peer===b&&document.querySelector('#roomName').textContent==='Sala B');
    check('02 presença A obsoleta é compensada',!t.presence.has('ROOMA1')&&t.presence.get('ROOMB2')?.peerId===b.id);
    check('03 listeners A não substituem B',!t.listeners.has('members:ROOMA1')&&t.listeners.has('members:ROOMB2'));
    oldA.emit('error',{type:'network'});check('04 erro PeerJS antigo não muda status B',status()==='Conectado · P2P');
    reset();const exitGate=gate();pending('ROOMA1',exitGate);await open('ROOMA1');disconnectRoom(false);showNoRoom();exitGate.release();await sleep(70);
    check('05 entrada antiga após saída não restaura sala',state.activeRoom===null&&!state.roomConnected);
    check('06 entrada antiga após saída não deixa presença',!t.presence.has('ROOMA1'));
    reset();const fail=gate();pending('ROOMA1',fail);await open('ROOMA1');const winning=await open('ROOMB2');await until(()=>state.activeRoom==='ROOMB2'&&state.roomConnected);fail.reject(Error('old failure'));await sleep(40);
    check('07 erro de entrada antiga não desconecta B',state.peer===winning&&state.activeRoom==='ROOMB2'&&state.roomConnected);
    reset();const firstA=gate();pending('ROOMA1',firstA);const a1=await open('ROOMA1');await open('ROOMB2');const a2=await open('ROOMA1');firstA.release();await until(()=>state.roomConnected&&state.peer===a2,1800);await sleep(40);
    check('08 A → B → A mantém a última tentativa A',state.peer===a2&&state.activeRoom==='ROOMA1'&&state.roomConnected);
    check('09 cleanup antigo preserva presença A nova',t.presence.get('ROOMA1')?.peerId===a2.id&&a1.id!==a2.id);
    reset();const logoutGate=gate();pending('ROOMA1',logoutGate);await open('ROOMA1');const logoutPromise=document.querySelector('#logoutButton').onclick();await sleep(20);logoutGate.release();await logoutPromise;await sleep(40);
    check('10 logout durante join invalida interface',state.user===null&&state.activeRoom===null);
    check('11 logout aguarda cleanup remoto ordenado',!t.presence.has('ROOMA1'));
    reset();const profileA=gate(),profileB=gate();t.profileGates.set('u1',profileA.promise);t.profileGates.set('u2',profileB.promise);
    const loadA=activateUser({uid:'u1'},++state.authGeneration);const loadB=activateUser({uid:'u2'},++state.authGeneration);profileB.release();await loadB;profileA.release();await loadA;
    check('12 perfil A tardio não substitui perfil B',state.user?.uid==='u2'&&state.profile.nickname==='Conta B');
    t.profileGates.clear();await activateUser({uid:'u1'},++state.authGeneration);const oldRooms=t.listeners.get('userRooms');
    await activateUser({uid:'u2'},++state.authGeneration);const currentRooms=t.listeners.get('userRooms');
    check('13 observador de salas A é cancelado na troca de conta',oldRooms!==currentRooms&&t.unsubscribed.includes('userRooms')&&state.user?.uid==='u2');
    currentRooms?.([{code:'ROOMB2',name:'Sala B',ownerUid:'u2'}]);oldRooms?.([{code:'ROOMA1',name:'Sala A',ownerUid:'u1'}]);
    check('14 callback antigo da lista não contamina conta B',state.rooms.length===1&&state.rooms[0].code==='ROOMB2'&&state.user?.uid==='u2');
    await activateUser(null,++state.authGeneration);
    check('15 logout descarta perfil e lista privada',state.user===null&&state.rooms.length===0&&document.querySelector('#authGate').hidden===false);
    reset();const connected=await open('ROOMA1');await until(()=>t.listeners.has('room:ROOMA1'));t.listeners.get('members:ROOMA1')?.(own(connected));
    const oldMembers=t.listeners.get('members:ROOMA1'),oldChat=t.listeners.get('chat:ROOMA1'),oldRoom=t.listeners.get('room:ROOMA1');await open('ROOMB2');const roomNow=state.activeRoom;
    oldMembers?.({u1:{uid:'u1',peerId:'forged',online:true}});oldChat?.([{id:'old',text:'old'}]);oldRoom?.({...t.rooms.ROOMA1,name:'Old'});
    check('16 callback antigo de presença não altera B',state.activeRoom===roomNow&&state.ownMember?.peerId!=='forged');
    check('17 callback antigo de chat não altera B',!state.chatMessages.some(item=>item.id==='old'));
    check('18 callback antigo de sala não altera B',document.querySelector('#roomName').textContent==='Sala B');
    check('19 listeners antigos são cancelados na troca',t.unsubscribed.includes('members:ROOMA1')&&t.unsubscribed.includes('chat:ROOMA1')&&t.unsubscribed.includes('room:ROOMA1'));
    reset();const reconnectPeer=await open('ROOMA1');await until(()=>t.listeners.has('room:ROOMA1'));t.listeners.get('members:ROOMA1')?.({...own(reconnectPeer),remote:{uid:'remote',peerId:'p-remote',online:true,streaming:true}});
    const oldIncoming=mediaCall('ROOMA1');await handleCall(oldIncoming);oldIncoming.emit('stream',videoStream());
    const oldOutgoing=mediaCall('ROOMA1'),oldData={open:true,close(){this.closed=true;}};state.calls.set('p-remote',oldOutgoing);state.dataConnections.set('p-remote',oldData);
    state.localStream=videoStream();const localCapture=state.localStream,callsBeforeDrop=t.mediaCalls||0;
    reconnectPeer.disconnectNow();
    check('20a perda de sinalização fecha chamadas e dados sem parar captura local',oldIncoming.closed&&oldOutgoing.closed&&oldData.closed&&!state.streams.has('p-remote')&&state.localStream===localCapture&&state.calls.size===0&&state.incomingCalls.size===0&&state.dataConnections.size===0);
    const reconnectGate=gate();pending('ROOMA1',reconnectGate);reconnectPeer.openNow();await sleep(20);
    check('20 PeerJS reconectado ainda não mostra sucesso',!state.roomConnected&&/revalidando/.test(status())&&document.querySelector('#shareButton').disabled);
    check('20b mídia não retorna antes da revalidação',t.mediaCalls===callsBeforeDrop||!t.mediaCalls&&callsBeforeDrop===0);
    reconnectGate.release();await until(()=>state.roomConnected);check('21 reentrada Firebase confirma restauração',state.roomConnected&&/restaurada/.test(status()));
    check('21a mídia local tenta reconectar após autorização',t.mediaCalls>callsBeforeDrop);
    oldIncoming.emit('stream',videoStream());oldIncoming.emit('close');
    check('21b callback antigo não ressuscita stream após reconexão',!state.streams.has('p-remote'));
    reconnectPeer.disconnectNow();state.ownMember=null;const presenceGate=gate();pending('ROOMA1',presenceGate);reconnectPeer.openNow();presenceGate.release();await sleep(40);
    check('22 join concluído aguarda snapshot próprio',!state.roomConnected&&/aguardando presença/.test(status()));
    t.listeners.get('members:ROOMA1')?.(own(reconnectPeer));await sleep(20);
    check('23 snapshot próprio conclui reconexão',state.roomConnected&&/restaurada/.test(status()));
    reconnectPeer.disconnectNow();const failure=gate();pending('ROOMA1',failure);reconnectPeer.openNow();failure.reject(Error('network'));await sleep(30);
    check('24 falha de reentrada não anuncia sucesso',!state.roomConnected&&/tentando novamente/.test(status()));
    reset();const stalePeer=await open('ROOMA1');await until(()=>t.listeners.has('room:ROOMA1'));t.listeners.get('members:ROOMA1')?.(own(stalePeer));stalePeer.disconnectNow();const slow=gate();pending('ROOMA1',slow);stalePeer.openNow();const newer=await open('ROOMB2');await until(()=>state.roomConnected&&state.peer===newer);slow.release();await sleep(60);
    check('25 rejoin tardio não altera nova sala',state.peer===newer&&state.activeRoom==='ROOMB2'&&state.roomConnected);
    stalePeer.emit('close');check('26 fechamento antigo não encerra nova sala',state.peer===newer&&state.roomConnected);
    reset();const timerPeer=await open('ROOMA1');await until(()=>t.listeners.has('room:ROOMA1'));t.listeners.get('members:ROOMA1')?.({...own(timerPeer),remote:{uid:'remote',peerId:'p-remote',online:true,streaming:true}});
    const fakeCall={peer:'p-remote',peerConnection:Object.assign(new EventTarget(),{connectionState:'failed'}),on(){},close(){}};state.incomingCalls.set('p-remote',fakeCall);watchMediaConnection(fakeCall);fakeCall.peerConnection.dispatchEvent(new Event('connectionstatechange'));
    check('27 recuperação cria timer rastreado',state.recoveryTimers.size>0);
    disconnectRoom(false);const timersCleared=state.recoveryTimers.size===0&&state.recoveryAttempts.size===0;disconnectRoom(false);
    check('28 cleanup idempotente limpa timers e tentativas',timersCleared&&state.recoveryTimers.size===0&&state.recoveryAttempts.size===0);
    check('29 cleanup repetido não mantém listeners',!t.listeners.has('members:ROOMA1')&&!t.listeners.has('chat:ROOMA1'));
    reset();const mediaA=await open('ROOMA1');await until(()=>t.listeners.has('members:ROOMA1'));t.listeners.get('members:ROOMA1')({...own(mediaA),remote:{uid:'remote',peerId:'p-remote',online:true,streaming:true}});
    const oldMedia=mediaCall('ROOMA1');await handleCall(oldMedia);oldMedia.emit('stream',videoStream());const hadOld=state.streams.get('p-remote')?.call===oldMedia;
    const mediaB=await open('ROOMB2');await until(()=>t.listeners.has('members:ROOMB2'));t.listeners.get('members:ROOMB2')({...own(mediaB),remote:{uid:'remote',peerId:'p-remote',online:true,streaming:true}});
    check('30 stream antigo é removido na troca de sala',hadOld&&!state.streams.has('p-remote'));
    const currentMedia=mediaCall('ROOMB2'),currentStream=videoStream();await handleCall(currentMedia);currentMedia.emit('stream',currentStream);const videoNode=state.streamTiles.get('p-remote')?.video;
    oldMedia.emit('stream',videoStream());oldMedia.emit('close');
    check('31 stream e close antigos não removem mídia atual',state.streams.get('p-remote')?.call===currentMedia&&state.streams.get('p-remote')?.stream===currentStream);
    check('32 vídeo atual mantém o mesmo elemento',!!videoNode&&state.streamTiles.get('p-remote')?.video===videoNode);
    reset();const queueGate=gate(),events=[];const first=window.__source.inRoomOrder('SAME','u1',async()=>{await queueGate.promise;events.push('old');});const second=window.__source.inRoomOrder('SAME','u1',async()=>events.push('new'));const independent=window.__source.inRoomOrder('OTHER','u1',async()=>events.push('other'));await independent;
    check('33 salas distintas não bloqueiam uma à outra',events.join(',')==='other');queueGate.release();await Promise.all([first,second]);
    check('34 operações da mesma sala mantêm ordem',events.join(',')==='other,old,new');
    const readA=gate(),readB=gate();t.sourceReads.set('rooms/A',readA.promise);t.sourceReads.set('rooms/B',readB.promise);t.sourceResults=[];t.sourceAuthUid='source-user';const stop=await window.__source.watchUserRooms(value=>t.sourceResults.push(value));
    const snap=code=>({exists:()=>true,val:()=>({[code]:{code,name:code}})});const aLoad=t.sourceCallback(snap('A')),bLoad=t.sourceCallback(snap('B'));
    readB.release({exists:()=>true,val:()=>({name:'B',code:'B'})});await bLoad;readA.release({exists:()=>true,val:()=>({name:'A',code:'A'})});await aLoad;
    check('35 snapshot antigo não sobrescreve novo',t.sourceResults.length===1&&t.sourceResults[0][0].code==='B');
    stop();t.sourceCallback(snap('B'));await sleep(10);
    check('36 unsubscribe invalida callback antigo',t.sourceResults.length===1&&t.sourceUnsubscribed===true);
    const never=gate();t.sourceReads.set('rooms/A',never.promise);t.sourceResults=[];const stop2=await window.__source.watchUserRooms(value=>t.sourceResults.push(value));const slowRead=t.sourceCallback(snap('A'));t.sourceAuthUid='other-user';never.release({exists:()=>true,val:()=>({code:'A'})});await slowRead;
    check('37 mudança de usuário descarta leitura antiga',t.sourceResults.length===0);stop2();
    t.sourceAuthUid='source-user';const oldError=gate(),fresh=gate();t.sourceReads.set('rooms/A',oldError.promise);t.sourceReads.set('rooms/B',fresh.promise);t.sourceResults=[];const stop3=await window.__source.watchUserRooms(value=>t.sourceResults.push(value));const outdated=t.sourceCallback(snap('A')),recent=t.sourceCallback(snap('B'));fresh.release({exists:()=>true,val:()=>({code:'B'})});await recent;oldError.reject(Error('old read failed'));await outdated;
    check('38 erro de snapshot antigo não apaga resultado novo',t.sourceResults.length===1&&t.sourceResults[0][0].code==='B');stop3();
    const currentError=gate(),roomErrors=[];t.sourceReads.set('rooms/A',currentError.promise);const stop4=await window.__source.watchUserRooms(()=>{},error=>roomErrors.push(error.message));const failedRead=t.sourceCallback(snap('A'));currentError.reject(Error('current read failed'));await failedRead;
    check('38a erro da leitura atual chega ao estado recuperável',roomErrors.length===1&&roomErrors[0]==='current read failed');stop4();
    t.cleanupRecord={peerId:'new'},t.cleanupSeat=true,t.cleanupRemovals=[];await window.__source.exitRoomNow('SAME','source-user','old');
    check('39 exitRoom real preserva registro e assento novos',t.cleanupRecord?.peerId==='new'&&t.cleanupSeat&&t.cleanupRemovals.length===0);
    t.cleanupRecord={peerId:'old'},t.cleanupSeat=true,t.cleanupRemovals=[];await window.__source.exitRoomNow('SAME','source-user','old');
    check('40 exitRoom real remove só o Peer ID esperado',t.cleanupRecord===null&&!t.cleanupSeat&&t.cleanupRemovals.some(item=>item.startsWith('seat:')));
    reset();const repeatPeer=await open('ROOMA1');await until(()=>t.listeners.has('members:ROOMA1'));t.listeners.get('members:ROOMA1')(own(repeatPeer));repeatPeer.disconnectNow();const firstRejoin=gate(),secondRejoin=gate();pending('ROOMA1',firstRejoin);pending('ROOMA1',secondRejoin);repeatPeer.openNow();repeatPeer.openNow();firstRejoin.release();await sleep(30);
    check('41 primeira reconexão obsoleta não anuncia sucesso',!state.roomConnected&&!/restaurada/.test(status()));
    secondRejoin.release();await until(()=>state.roomConnected);
    check('42 segunda reconexão confirma sessão atual',state.roomConnected&&/restaurada/.test(status())&&t.presence.get('ROOMA1')?.peerId===repeatPeer.id);
    reset();const waitingPeer=await open('ROOMA1');await until(()=>t.listeners.has('room:ROOMA1'));t.listeners.get('members:ROOMA1')(own(waitingPeer));waitingPeer.disconnectNow();
    const hungJoin=gate();pending('ROOMA1',hungJoin);const originalSetTimeout=window.setTimeout;
    window.setTimeout=(callback,delay,...args)=>originalSetTimeout(callback,delay===12000?30:delay,...args);
    try{waitingPeer.openNow();}finally{window.setTimeout=originalSetTimeout;}
    await sleep(55);
    check('43 reentrada pendente informa espera sem declarar sucesso',!state.roomConnected&&/Sem confirmação da sala/.test(status()));
    hungJoin.release();await until(()=>state.roomConnected);
    check('44 confirmação tardia ainda restaura a sala atual',state.roomConnected&&/restaurada/.test(status()));
  }catch(error){check('Roteiro interrompido por exceção',false,error.stack||error.message);}
  return results;
}

app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const window=new BrowserWindow({show:false,webPreferences:{partition:'session-fixture',contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const rendererDir=createFixtureRenderer(),fixture=path.join(rendererDir,'.session-smoke.html'),stubFile=path.join(rendererDir,'.session-stubs.js');
  try{
    const html=fs.readFileSync(path.join(rendererDir,'index.html'),'utf8').replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/,'').replace('<script src="firebase-client.bundle.js"></script>','<script src=".session-stubs.js"></script>');
    fs.writeFileSync(stubFile,stubs,'utf8');fs.writeFileSync(fixture,html,'utf8');await window.loadFile(fixture);
    const results=await window.webContents.executeJavaScript(`(${scenarios.toString()})()`);
    for(const {name,ok,detail} of results)console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?' — '+detail:''}`);
    assert.equal(results.filter(item=>!item.ok).length,0,'Session concurrency scenarios failed.');
    console.log(`session integrity passed: ${results.length} controlled concurrency scenarios.`);
  }catch(error){console.error(error);process.exitCode=1;}
  finally{for(const file of [fixture,stubFile]){try{fs.unlinkSync(file);}catch{}}window.destroy();app.exit(process.exitCode||0);}
});
