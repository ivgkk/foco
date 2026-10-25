const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createFixtureRenderer } = require('./fixture-renderer.cjs');
const {app, BrowserWindow} = require('electron');

// The real renderer runs against a private, nonpersistent Electron partition. Firebase,
// PeerJS and desktop capture are local fakes. No signaling server or real account is used.
const stubs = `window.focoDesktop={listSources:async()=>[],resolveProcess:async()=>1,startAudioCapture:async()=>true,stopAudioCapture:async()=>true,setFullscreen:async()=>true,getAppVersion:async()=>'test',writeClipboard:async()=>true,getUpdateStatus:async()=>({state:'unavailable'}),checkForUpdates:async()=>({}),getPendingInvite:async()=>'',onInvite:()=>()=>{},onAudioChunk:()=>()=>{},onUpdateStatus:()=>()=>{},platform:'win32'};
window.focoCloud={isConfigured:()=>true,onAuthChanged:()=>()=>{},exitRoom:async()=>{},updateRoomMember:async()=>{},verifyRoomPeer:async()=>null,cleanCode:value=>String(value||'').toUpperCase()};
window.Peer=function(){throw new Error('Network PeerJS is forbidden in P2P authorization tests.');};`;

async function scenarios() {
  const results=[];
  const check=(name,ok,detail='')=>results.push({name,ok:Boolean(ok),detail:String(detail)});
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  class FakeCall {
    constructor(peer,metadata={}){this.peer=peer;this.metadata=metadata;this.handlers={};this.answers=0;this.closed=false;this.peerConnection=Object.assign(new EventTarget(),{connectionState:'new',getSenders:()=>[]});}
    on(type,handler){(this.handlers[type]||=[]).push(handler);}
    emit(type,...args){for(const handler of this.handlers[type]||[])handler(...args);}
    answer(){this.answers++;}
    close(){if(this.closed)return;this.closed=true;this.emit('close');}
  }
  class FakeConn {
    constructor(peer){this.peer=peer;this.handlers={};this.closed=false;this.open=true;this.sent=[];}
    on(type,handler){(this.handlers[type]||=[]).push(handler);}
    emit(type,...args){for(const handler of this.handlers[type]||[])handler(...args);}
    send(message){this.sent.push(message);}
    close(){if(this.closed)return;this.closed=true;this.open=false;this.emit('close');}
  }
  const calls=[];const records=new Map();let gate=null;
  window.focoCloud.verifyRoomPeer=async(room,uid,peerId)=>{
    if(gate)await gate;
    const value=records.get(`${room}:${uid}`);
    return value?.peerId===peerId&&value.online!==false?{uid,peerId,canStream:value.canStream!==false}:null;
  };
  const own={uid:'me',peerId:'p-me',nickname:'Me',online:true,role:'owner',canStream:true};
  const good={uid:'u-good',peerId:'p-good',nickname:'Good',online:true,canStream:true,streaming:true};
  const other={uid:'u-other',peerId:'p-other',nickname:'Other',online:true,canStream:true,streaming:true};
  const raw=(...members)=>Object.fromEntries([[own.uid,{...own}],...members.map(m=>[m.uid,{...m}])]);
  const reset=(room='ROOM1',members=[good,other])=>{
    gate=null;disconnectRoom(false);calls.length=0;records.clear();
    state.user={uid:'me'};state.profile={...state.profile,nickname:'Me'};
    state.activeRoom=room;state.currentRoomData={code:room,ownerUid:'me'};state.roomConnected=true;
    state.peer={id:'p-me',open:true,destroyed:false,call(id,stream,options){const call=new FakeCall(id,options?.metadata);calls.push({id,stream,call});return call;},connect(id){return new FakeConn(id);},destroy(){this.destroyed=true;}};
    state.ownMember={...own};state.membersLoaded=true;state.members=new Map(members.map(m=>[m.uid,{...m}]));
    records.set(`${room}:me`,{...own});for(const m of members)records.set(`${room}:${m.uid}`,{...m});
    state.localStream=new MediaStream();state.localSource={type:'window',name:'Fixture'};
    document.body.classList.remove('no-room');
  };
  const conn=peer=>new FakeConn(peer);
  try {
    reset();
    check('01 membro autorizado recebe chamada',!!await ensureCall('p-good')&&calls.length===1);
    check('02 peer desconhecido não chega a peer.call',!await ensureCall('p-unknown')&&calls.length===1);
    syncRoomMembers(raw(other));
    check('03 membro removido não recebe nova chamada',!await ensureCall('p-good')&&calls.length===1);
    reset();
    const wrongRoom=conn('p-good');handleData(wrongRoom);wrongRoom.emit('data',{type:'retry-stream',roomId:'ROOM2'});await sleep(20);
    check('04 comando de outra sala é rejeitado',wrongRoom.closed&&calls.length===0);
    reset();records.delete('ROOM1:u-good');
    check('05 presença local obsoleta não basta para enviar mídia',!await ensureCall('p-good')&&calls.length===0);
    reset();const spoofUid=conn('p-good');handleData(spoofUid);spoofUid.emit('data',{type:'retry-stream',userId:'u-other'});await sleep(20);
    check('06 userId declarado por peer não muda identidade',spoofUid.closed&&calls.length===0);
    reset();const spoofRoom=conn('p-good');handleData(spoofRoom);spoofRoom.emit('data',{type:'publisher-stop',roomId:'ROOM2',peerId:'p-good'});await sleep(20);
    check('07 roomId declarado não muda a sala',spoofRoom.closed);
    reset();const spoofPeer=conn('p-good');handleData(spoofPeer);spoofPeer.emit('data',{type:'publisher-stop',peerId:'p-other'});await sleep(20);
    check('08 peerId declarado não muda o dono do stream',spoofPeer.closed);
    reset();const old=await ensureCall('p-good');const retry=conn('p-good');handleData(retry);retry.emit('data',{type:'retry-stream'});await sleep(30);
    check('09 retry legítimo substitui chamada após autorização',old.closed&&calls.length===2&&state.calls.get('p-good')===calls[1].call);
    records.delete('ROOM1:u-good');retry.emit('data',{type:'retry-stream'});await sleep(30);
    check('10 retry após expulsão não cria chamada',retry.closed&&calls.length===2);
    reset();const beforeSwitch=conn('p-good');handleData(beforeSwitch);disconnectRoom(false);beforeSwitch.emit('data',{type:'retry-stream'});await sleep(20);
    check('11 retry após sair da sala não cria chamada',calls.length===0);
    reset();state.streams.set('p-good',{stream:new MediaStream(),name:'Good',appName:'Fixture',ownerId:'p-good',uid:'u-good'});const stop=conn('p-good');handleData(stop);stop.emit('data',{type:'publisher-stop',peerId:'p-good'});await sleep(30);
    check('12 publisher-stop próprio remove apenas seu stream',!state.streams.has('p-good')&&!stop.closed);
    reset();state.streams.set('p-other',{stream:new MediaStream(),name:'Other',appName:'Fixture',ownerId:'p-other',uid:'u-other'});const forged=conn('p-good');handleData(forged);forged.emit('data',{type:'publisher-stop',peerId:'p-other'});await sleep(30);
    check('13 publisher-stop falsificado preserva outro stream',state.streams.has('p-other')&&forged.closed);
    reset();const unknown=conn('p-good');handleData(unknown);unknown.emit('data',{type:'erase-everything'});await sleep(20);
    check('14 tipo desconhecido não produz chamada',calls.length===0);
    unknown.emit('data',[]);unknown.emit('data','retry-stream');unknown.emit('data',{type:7});await sleep(20);
    check('15 payload inválido não produz chamada',calls.length===0);
    unknown.emit('data',null);unknown.emit('data',undefined);await sleep(20);
    check('16 payload ausente não produz chamada',calls.length===0);
    reset();const repeated=conn('p-good');handleData(repeated);repeated.emit('data',{type:'retry-stream'});repeated.emit('data',{type:'retry-stream'});await sleep(30);
    check('17 solicitações repetidas não criam chamadas duplicadas',calls.length===1);
    reset();const first=conn('p-good'),second=conn('p-good');handleData(first);handleData(second);await sleep(20);
    check('18 conexão duplicada fecha a antiga',first.closed&&!second.closed&&state.dataConnections.get('p-good')===second);
    reset();const revoked=await ensureCall('p-good');syncRoomMembers(raw(other));
    check('19 revogação fecha chamada ativa',revoked.closed&&!state.calls.has('p-good'));
    reset();let release;gate=new Promise(resolve=>{release=resolve;});const pending=ensureCall('p-good');await sleep(10);syncRoomMembers(raw(other));release();await pending;
    check('20 revogação durante verificação não envia mídia',!calls.some(item=>item.id==='p-good'));
    reset();const stale=conn('p-good');handleData(stale);disconnectRoom(false);reset('ROOM2');stale.emit('data',{type:'retry-stream'});await sleep(20);
    check('21 conexão antiga não atua após nova sessão',calls.length===0&&stale.closed);
    reset();const prior=await ensureCall('p-good');records.delete('ROOM1:u-good');records.set('ROOM1:u-good',{...good,peerId:'p-new'});syncRoomMembers(raw({...good,peerId:'p-new'},other));const changed=await ensureCall('p-new');
    check('22 troca legítima de Peer ID revoga ID antigo e aceita novo',prior.closed&&!!changed&&calls.some(item=>item.id==='p-new')&&calls.filter(item=>item.id==='p-good').length===1);
    reset();state.membersLoaded=false;state.ownMember=null;state.members.clear();const early=conn('p-good');handleData(early);early.emit('data',{type:'retry-stream'});await sleep(20);const before=calls.length;syncRoomMembers(raw(good,other));await sleep(100);
    check('23 conexão antes do snapshot aguarda sem acesso antecipado',before===0&&!early.closed&&state.dataConnections.get('p-good')===early);
    reset();let finish;gate=new Promise(resolve=>{finish=resolve;});const leaving=ensureCall('p-good');await sleep(10);disconnectRoom(false);finish();await leaving;
    check('24 saída durante autorização não envia mídia',calls.length===0);
    reset();state.localStream=null;
    check('25 sem transmissão local não envia mídia',!await ensureCall('p-good')&&calls.length===0);
    reset();const stillWatching=await ensureCall('p-other');const removedCall=await ensureCall('p-good');syncRoomMembers(raw(other));
    check('26 espectadores autorizados continuam após revogação de outro',!!stillWatching&&!stillWatching.closed&&removedCall.closed&&state.calls.get('p-other')===stillWatching);
    reset();const stranger=conn('p-stranger');handleData(stranger);stranger.emit('data',{type:'retry-stream'});await sleep(20);
    check('27 peer rejeitado não chega a peer.call',stranger.closed&&calls.length===0);
    reset();syncRoomMembers(raw(other));const afterRevoke=conn('p-good');handleData(afterRevoke);for(let i=0;i<3;i++)afterRevoke.emit('data',{type:'retry-stream'});await sleep(20);
    check('28 nenhum envio novo após revogação repetida',!calls.some(item=>item.id==='p-good'));
    reset();const cleanup=conn('p-good');handleData(cleanup);const active=await ensureCall('p-good');disconnectRoom(false);cleanup.emit('data',{type:'retry-stream'});await sleep(20);
    check('29 saída limpa conexões e invalida listeners antigos',cleanup.closed&&active.closed&&state.dataConnections.size===0&&state.calls.size===0&&calls.length===1);
    reset();const a=await ensureCall('p-other');const b=conn('p-good');handleData(b);b.emit('data',{type:'publisher-stop',peerId:'p-other'});await sleep(20);
    check('30 comando falso não interfere em transmissão legítima',state.calls.get('p-other')===a&&!a.closed);
    reset();const incomingUnknown=new FakeCall('p-stranger',{userId:'x'});await handleCall(incomingUnknown);
    check('31 chamada recebida desconhecida não é respondida',incomingUnknown.closed&&incomingUnknown.answers===0);
    reset();const incomingSpoof=new FakeCall('p-good',{userId:'u-other',ownerId:'p-good'});await handleCall(incomingSpoof);
    check('32 chamada recebida com UID falso não é respondida',incomingSpoof.closed&&incomingSpoof.answers===0);
    reset();records.set('ROOM1:u-good',{...good,canStream:false});const cannotPublish=new FakeCall('p-good',{userId:'u-good',ownerId:'p-good'});await handleCall(cannotPublish);
    check('33 permissão de transmissão revogada bloqueia chamada recebida',cannotPublish.closed&&cannotPublish.answers===0);
    reset();const incomingGood=new FakeCall('p-good',{userId:'u-good',ownerId:'p-good',roomId:'ROOM1'});await handleCall(incomingGood);
    check('34 chamada recebida autorizada é respondida',incomingGood.answers===1&&!incomingGood.closed);
    reset();state.members.set('u-duplicate',{...other,peerId:'p-good'});
    check('35 Peer ID duplicado no snapshot não concede mídia',!await ensureCall('p-good')&&calls.length===0);
    reset();records.set('ROOM1:u-good',{...good,canStream:false});const deniedStart=conn('p-good');handleData(deniedStart);deniedStart.emit('data',{type:'publisher-start',peerId:'p-good'});await sleep(20);
    check('36 publisher-start sem permissão não anuncia transmissão',deniedStart.closed&&calls.length===0);
    reset();state.membersLoaded=false;state.ownMember=null;state.members.clear();const timedOut=conn('p-good');handleData(timedOut);await sleep(4200);
    check('37 conexão sem snapshot fecha após espera limitada',timedOut.closed&&calls.length===0);
    reset();records.set('ROOM1:me',{...own,canStream:false});
    check('38 permissão local revogada impede envio a espectador válido',!await ensureCall('p-good')&&calls.length===0);
    disconnectRoom(false);
  }catch(error){check('Roteiro interrompido por exceção',false,error.stack||error.message);}
  return results;
}

app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const window=new BrowserWindow({show:false,webPreferences:{partition:'p2p-auth-fixture',contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const rendererDir=createFixtureRenderer();
  const fixture=path.join(rendererDir,'.p2p-auth-smoke.html'),stubFile=path.join(rendererDir,'.p2p-auth-stubs.js');
  try{
    const html=fs.readFileSync(path.join(rendererDir,'index.html'),'utf8')
      .replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/,'')
      .replace('<script src="firebase-client.bundle.js"></script>','<script src=".p2p-auth-stubs.js"></script>');
    fs.writeFileSync(stubFile,stubs,'utf8');fs.writeFileSync(fixture,html,'utf8');
    await window.loadFile(fixture);
    const results=await window.webContents.executeJavaScript(`(${scenarios.toString()})()`);
    for(const {name,ok,detail} of results)console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?' — '+detail:''}`);
    assert.equal(results.filter(result=>!result.ok).length,0,'P2P authorization scenarios failed.');
    console.log(`P2P authorization passed: ${results.length} adversarial scenarios with local fakes.`);
  }catch(error){console.error(error);process.exitCode=1;}
  finally{for(const file of [fixture,stubFile]){try{fs.unlinkSync(file);}catch{}}window.destroy();app.exit(process.exitCode||0);}
});
