const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');

// The renderer is loaded with inert bridges. No Firebase, PeerJS, desktop capture or WASAPI call is real.
const stubs = `window.__shareTest={sources:[],listQueue:[],captureQueue:[],memberWriteQueue:[],listCalls:0,captureCalls:0,audioStarts:0,audioStops:0,processResolves:0,processFailure:false,audioContexts:0,worklets:0,audioFailure:false,memberWrites:[],streams:[],deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}};
window.focoDesktop={listSources:()=>{const t=window.__shareTest;t.listCalls++;return t.listQueue.length?t.listQueue.shift():Promise.resolve(t.sources);},resolveProcess:async()=>{const t=window.__shareTest;t.processResolves++;if(t.processFailure)throw Error('Falha ao localizar aplicativo de áudio.');return 1234;},startAudioCapture:async()=>{const t=window.__shareTest;t.audioStarts++;if(t.audioFailure)throw new Error('Falha ao capturar áudio.');return true;},stopAudioCapture:async()=>{window.__shareTest.audioStops++;return true;},setFullscreen:async active=>Boolean(active),getAppVersion:async()=>'test',writeClipboard:async()=>true,getUpdateStatus:async()=>({state:'unavailable',reason:'development'}),checkForUpdates:async()=>({}),getPendingInvite:async()=>'',onInvite:()=>()=>{},onAudioChunk:()=>()=>{},onUpdateStatus:()=>()=>{},platform:'win32'};
window.focoCloud={isConfigured:()=>true,onAuthChanged:()=>()=>{},exitRoom:async()=>{},updateRoomMember:async(room,value)=>{const t=window.__shareTest;t.memberWrites.push({room,value});if(t.memberWriteQueue.length)await t.memberWriteQueue.shift();},cleanCode:value=>String(value||'').toUpperCase()};
window.Peer=function(){throw new Error('PeerJS is disabled in share tests.');};`;

async function scenarios() {
  const results=[];
  const check=(name,ok,detail='')=>results.push({name,ok:Boolean(ok),detail:String(detail)});
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(predicate,timeout=3000)=>{const start=Date.now();while(Date.now()-start<timeout){if(predicate())return true;await sleep(20);}return predicate();};
  const t=window.__shareTest;
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const context=canvas.getContext('2d');context.fillStyle='#7254b5';context.fillRect(0,0,640,360);
  const makeStream=()=>{const stream=canvas.captureStream(5);t.streams.push(stream);return stream;};
  const thumb=(color,label)=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,320,180);x.fillStyle='white';x.font='bold 25px sans-serif';x.fillText(label,18,45);return c.toDataURL('image/png');};
  const screen={id:'screen:1:0',type:'screen',name:'Tela 1',thumbnail:thumb('#534b8e','TELA 1')};
  const windowA={id:'window:11:0',type:'window',name:'Editor de código — projeto Foco',thumbnail:thumb('#315c76','EDITOR')};
  const windowB={id:'window:12:0',type:'window',name:'Planilha de orçamento trimestral com um nome muito longo',thumbnail:thumb('#46705b','PLANILHA')};
  t.sources=[screen,windowA,windowB];
  const RealAudioContext=window.AudioContext;
  window.AudioContext=class extends RealAudioContext{constructor(...args){super(...args);t.audioContexts++;Object.defineProperty(this,'audioWorklet',{value:{addModule:async()=>{}}});}};
  window.AudioWorkletNode=class{constructor(){t.worklets++;this.port={postMessage(){}};}connect(){}};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{t.captureCalls++;return t.captureQueue.length?t.captureQueue.shift():Promise.resolve(makeStream());}}});
  document.querySelector('#startupScreen').classList.add('is-done');document.querySelector('#authGate').hidden=true;document.body.classList.remove('no-room');
  state.user={uid:'fixture-user'};state.profile={...state.profile,nickname:'Eu'};state.nickname='Eu';state.activeRoom='fixture-only';state.roomConnected=true;state.canStream=true;state.peer={id:'fixture-peer',open:true};state.members.clear();state.currentRoomData={ownerUid:'fixture-user'};
  $('#shareButton').disabled=false;
  const remote=makeStream();state.streams.set('remote-peer',{stream:remote,name:'Luna',uid:'remote-user',local:false,appName:'Editor',sourceType:'Janela'});renderStreams();
  const remoteVideo=state.streamTiles.get('remote-peer').video;
  const sourceButton=id=>[...document.querySelectorAll('#sourceOptions [data-source-id]')].find(button=>button.dataset.sourceId===id);
  const open=async()=>{$('#shareButton').click();return until(()=>!sharePicker.loading);};
  const close=()=>{cancelSharePicker();};
  const selectWindow=async()=>{setShareTab('window');sourceButton(windowA.id).click();};
  try {
    const pending=t.deferred();t.listQueue.push(pending.promise);$('#shareButton').click();
    check('Diálogo abre antes de listar fontes, com skeleton e início desabilitado', $('#shareDialog').open&&sharePicker.loading&&$('#sourceOptions .source-skeleton')&&$('#startShareButton').disabled&&t.captureCalls===0);
    document.documentElement.classList.add('reduce-motion');
    check('Preferência interna de movimento reduzido interrompe o skeleton',getComputedStyle($('#sourceOptions .skeleton') ,'::after').animationIterationCount==='1');
    document.documentElement.classList.remove('reduce-motion');
    pending.resolve(t.sources);await until(()=>!sharePicker.loading);await sleep(30);
    check('Fontes reais aparecem em abas separadas', document.querySelectorAll('#sourceOptions .source-option').length===1&&$('#screenSourceCount').textContent==='1'&&$('#windowSourceCount').textContent==='2',`cards=${document.querySelectorAll('#sourceOptions .source-option').length} telas=${$('#screenSourceCount').textContent} janelas=${$('#windowSourceCount').textContent}`);
    $('#shareScreensTab').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    check('Seta direita navega entre abas e mantém foco na aba ativa',sharePicker.tab==='window'&&document.activeElement===$('#shareWindowsTab'));
    check('Aba Janelas expõe nomes longos e miniaturas',!!sourceButton(windowB.id)&&sourceButton(windowB.id).querySelector('.source-thumb')!==null);
    sourceButton(windowA.id).focus();sourceButton(windowA.id).click();
    check('Seleção por teclado preserva foco visível no cartão',document.activeElement===sourceButton(windowA.id));
    check('Seleção é indicada e não inicia captura',sharePicker.selectedId===windowA.id&&sourceButton(windowA.id).getAttribute('aria-pressed')==='true'&&t.captureCalls===0&&$('#audioSourceSelect').value===windowA.id&&!$('#startShareButton').disabled);
    sourceButton(windowB.id).click();
    check('Trocar seleção atualiza a fonte de áudio padrão',sharePicker.selectedId===windowB.id&&$('#audioSourceSelect').value===windowB.id&&t.captureCalls===0);
    $('#shareQuality').value='480p30';$('#shareQuality').dispatchEvent(new Event('change',{bubbles:true}));
    check('Qualidade pode ser ajustada antes da confirmação sem alterar a preferência salva',localStorage.getItem('foco.quality')!=='480p30'&&$('#shareQuality').value==='480p30');
    close();check('Cancelar fecha sem captura ou anúncio',!$('#shareDialog').open&&t.captureCalls===0&&t.memberWrites.length===0&&state.localStream===null);
    const stale=t.deferred();t.listQueue.push(stale.promise);$('#shareButton').click();close();t.sources=[screen,windowA];await open();stale.resolve([screen,windowB]);await sleep(40);
    check('Resposta antiga não substitui a listagem da nova abertura',sharePicker.sources.some(s=>s.id===windowA.id)&&!sharePicker.sources.some(s=>s.id===windowB.id));close();
    t.listQueue.push(Promise.reject(new Error('IPC unavailable')));await open();
    check('Falha de listagem mantém erro e ação de atualizar',!!$('#sourceOptions .source-error')&&$('#shareStatus').dataset.kind==='error'&&$('#startShareButton').disabled);
    t.sources=[screen,windowA,windowB];$('#refreshSourcesButton').click();await until(()=>!sharePicker.loading);
    check('Atualizar recupera as fontes',!!sourceButton(screen.id)&&!$('#sourceOptions .source-error'));close();
    await open();await selectWindow();t.listQueue.push(Promise.resolve([screen,windowB]));$('#startShareButton').click();await until(()=>!shareAttempt);
    check('Fonte removida antes do início bloqueia a captura',t.captureCalls===0&&$('#shareStatus').dataset.kind==='error'&&!sharePicker.selectedId&&$('#startShareButton').disabled);close();
    await open();await selectWindow();t.audioFailure=true;$('#startShareButton').click();await until(()=>!shareAttempt);
    check('Falha de áudio limpa captura e mostra erro no diálogo',state.localStream===null&&t.audioStarts===1&&t.audioStops>=1&&t.streams.at(-1).getTracks().every(track=>track.readyState==='ended')&&$('#shareStatus').dataset.kind==='error');t.audioFailure=false;close();
    await open();await selectWindow();const rejectedWrite=t.deferred();t.memberWriteQueue.push(rejectedWrite.promise);$('#startShareButton').click();await until(()=>t.memberWrites.some(item=>item.value.streaming===true));
    check('Confirmação remota pendente não informa sucesso local',state.localStream===null&&$('#shareDialog').open&&!!shareAttempt&&t.streams.at(-1).getTracks().some(track=>track.readyState==='live'));
    rejectedWrite.reject(new Error('Não foi possível confirmar a transmissão na sala.'));await until(()=>!shareAttempt);
    check('Falha de anúncio mantém o seletor aberto e libera captura',state.localStream===null&&$('#shareDialog').open&&$('#shareStatus').dataset.kind==='error'&&t.streams.at(-1).getTracks().every(track=>track.readyState==='ended'));close();
    await open();await selectWindow();const delayedWrite=t.deferred();t.memberWriteQueue.push(delayedWrite.promise);$('#startShareButton').click();await until(()=>t.memberWrites.filter(item=>item.value.streaming===true).length>=2);close();delayedWrite.resolve();await until(()=>!shareAttempt);
    check('Cancelar durante anúncio confirmado desfaz estado remoto sem sucesso local',t.memberWrites.at(-1)?.value.streaming===false&&state.localStream===null&&!$('#shareDialog').open);
    await open();await selectWindow();const disconnectedCapture=t.deferred(),beforeDisconnectedCapture=t.captureCalls,writesBeforeDisconnect=t.memberWrites.length;t.captureQueue.push(disconnectedCapture.promise);$('#startShareButton').click();await until(()=>t.captureCalls>beforeDisconnectedCapture);state.peer.disconnected=true;const disconnectedStream=makeStream();disconnectedCapture.resolve(disconnectedStream);await until(()=>!shareAttempt);
    check('Perda da conexão durante preparo bloqueia anúncio e mostra erro',state.localStream===null&&t.memberWrites.length===writesBeforeDisconnect&&disconnectedStream.getTracks().every(track=>track.readyState==='ended')&&$('#shareStatus').dataset.kind==='error'&&$('#startShareButton').disabled);
    state.peer.disconnected=false;$('#shareButton').disabled=false;updateShareControls();check('Reconexão reabilita confirmação sem perder seleção',!$('#startShareButton').disabled&&sharePicker.selectedId===windowA.id);close();
    await open();await selectWindow();const capturePending=t.deferred(),writesBeforeCapture=t.memberWrites.length,capturesBeforePending=t.captureCalls;t.captureQueue.push(capturePending.promise);$('#startShareButton').click();await until(()=>t.captureCalls>capturesBeforePending);close();const lateStream=makeStream();capturePending.resolve(lateStream);await until(()=>lateStream.getTracks().every(track=>track.readyState==='ended')&&!shareAttempt);
    check('Cancelar durante getUserMedia encerra o resultado atrasado sem anunciar',lateStream.getTracks().every(track=>track.readyState==='ended')&&state.localStream===null&&t.memberWrites.length===writesBeforeCapture);
    await open();await selectWindow();const beforeCapture=t.captureCalls;$('#startShareButton').click();$('#startShareButton').click();await until(()=>!!state.localStream);
    check('Confirmar uma vez cria apenas uma captura local',t.captureCalls===beforeCapture+1&&state.localStream&&state.streams.has('fixture-peer')&&!$('#shareDialog').open);
    check('Stage remoto e seu vídeo permanecem estáveis',state.streamTiles.get('remote-peer').video===remoteVideo&&remoteVideo.srcObject===remote);
    check('Sucesso local só é anunciado após captura, áudio e atualização da sala',t.audioStarts===4&&t.memberWrites.at(-1)?.value.streaming===true&&$('#shareButton').classList.contains('sharing'));
    check('Modo com áudio conserva track e controle de volume',state.localStream.getAudioTracks().length===1&&state.streamTiles.get('fixture-peer')?.volume.parentElement.hidden===false);
    stopSharing(false);
    check('Parar encerra tracks locais e preserva stream remoto',!state.streams.has('fixture-peer')&&state.streamTiles.get('remote-peer').video===remoteVideo&&remote.getTracks().every(track=>track.readyState==='live')&&!$('#shareButton').classList.contains('sharing'));
    t.sources=[screen];await open();sourceButton(screen.id).click();
    const beforeSilent={audio:t.audioStarts,stop:t.audioStops,process:t.processResolves,context:t.audioContexts,worklet:t.worklets};
    check('Sem aplicativos de áudio mantém vídeo disponível',$('#audioSourceSelect').value==='none'&&!$('#startShareButton').disabled&&/somente vídeo/.test($('#shareAudioHint').textContent));
    $('#startShareButton').click();await until(()=>!!state.localStream);
    const screenOnly=state.localStream;
    check('Monitor sem áudio cria MediaStream só de vídeo',screenOnly.getVideoTracks().length===1&&screenOnly.getAudioTracks().length===0&&state.streams.get('fixture-peer')?.stream===screenOnly);
    check('Modo sem áudio não cria WASAPI nem AudioWorklet',t.audioStarts===beforeSilent.audio&&t.processResolves===beforeSilent.process&&t.audioContexts===beforeSilent.context&&t.worklets===beforeSilent.worklet);
    check('Stage local omite controle de áudio',state.streamTiles.get('fixture-peer')?.volume.parentElement.hidden===true);
    stopSharing(false);
    check('Parar vídeo puro encerra track sem parar WASAPI',screenOnly.getTracks().every(track=>track.readyState==='ended')&&t.audioStops===beforeSilent.stop);
    t.sources=[screen,windowA];await open();await selectWindow();$('#audioSourceSelect').value='none';$('#audioSourceSelect').dispatchEvent(new Event('change',{bubbles:true}));
    check('Janela aceita escolha explícita Sem áudio',$('#audioSourceSelect').value==='none'&&!$('#startShareButton').disabled);
    setShareTab('screen');sourceButton(screen.id).click();setShareTab('window');sourceButton(windowA.id).click();
    check('Escolha explícita Sem áudio persiste ao trocar a fonte de vídeo',$('#audioSourceSelect').value==='none'&&!$('#startShareButton').disabled);
    $('#startShareButton').click();await until(()=>!!state.localStream);
    const windowOnly=state.localStream;
    check('Janela sem áudio compartilha vídeo sem captura de processo',windowOnly.getVideoTracks().length===1&&windowOnly.getAudioTracks().length===0&&t.processResolves===beforeSilent.process&&t.audioStarts===beforeSilent.audio);
    stopSharing(false);
    check('Troca de sessões preserva limpeza de vídeo puro',windowOnly.getTracks().every(track=>track.readyState==='ended')&&remoteVideo.srcObject===remote);
    await open();await selectWindow();$('#audioSourceSelect').value='none';$('#audioSourceSelect').dispatchEvent(new Event('change',{bubbles:true}));
    const cancelOnly=t.deferred(),capturesBeforeCancel=t.captureCalls,writesBeforeCancel=t.memberWrites.length;t.captureQueue.push(cancelOnly.promise);$('#startShareButton').click();await until(()=>t.captureCalls>capturesBeforeCancel);close();const cancelledOnly=makeStream();cancelOnly.resolve(cancelledOnly);await until(()=>!shareAttempt);
    check('Cancelar vídeo puro durante preparo não anuncia nem deixa track',state.localStream===null&&t.memberWrites.length===writesBeforeCancel&&cancelledOnly.getTracks().every(track=>track.readyState==='ended')&&t.audioStarts===beforeSilent.audio);
    t.sources=[screen,windowA,windowB];
    await open();await selectWindow();t.processFailure=true;const capturesBeforeProcessFailure=t.captureCalls;$('#startShareButton').click();await until(()=>!shareAttempt);
    check('Falha ao resolver áudio mantém miniaturas e bloqueia captura daquele aplicativo',t.captureCalls===capturesBeforeProcessFailure&&!!sourceButton(windowA.id)&&$('#shareStatus').dataset.kind==='error');
    $('#audioSourceSelect').value='none';$('#audioSourceSelect').dispatchEvent(new Event('change',{bubbles:true}));$('#startShareButton').click();await until(()=>!!state.localStream);
    check('Após falha de áudio, Sem áudio inicia vídeo sem resolver processo',state.localStream.getAudioTracks().length===0&&t.audioStarts===beforeSilent.audio);stopSharing(false);t.processFailure=false;
    await open();sourceButton(screen.id).click();$('#audioSourceSelect').value=windowA.id;$('#audioSourceSelect').dispatchEvent(new Event('change',{bubbles:true}));t.sources=[screen];$('#refreshSourcesButton').click();await until(()=>!sharePicker.loading);
    check('Aplicativo de áudio removido impede início com seleção inválida',sharePicker.selectedId===screen.id&&$('#audioSourceSelect').value===''&&$('#startShareButton').disabled&&$('#shareAudioHint').textContent.includes('não está disponível'));close();
    t.sources=[screen,windowA,windowB];
    await open();setShareTab('window');sourceButton(windowA.id).click();window.focoI18n.setLanguage('en-US');await sleep(40);
    check('Seletor traduzido em inglês sem perder seleção',sharePicker.selectedId===windowA.id&&$('#startShareButton').textContent.includes('Start sharing')&&$('#shareScreensTab').textContent.includes('Displays'));
    window.focoI18n.setLanguage('es-ES');await sleep(40);check('Seletor traduzido em espanhol',$('#startShareButton').textContent.includes('Iniciar transmisión'));
    window.focoI18n.setLanguage('fr-FR');await sleep(40);check('Seletor traduzido em francês',$('#startShareButton').textContent.includes('Démarrer le partage'));
    window.focoI18n.setLanguage('pt-BR');close();
  } catch(error) {check('Roteiro interrompido por exceção',false,error.stack||error.message);}
  state.streams.clear();renderStreams();t.streams.forEach(stream=>stream.getTracks().forEach(track=>track.stop()));state.activeRoom=null;state.user=null;
  return results;
}

function prepareVisualCase(name,locale='pt-BR'){
  document.querySelector('#startupScreen').classList.add('is-done');document.querySelector('#authGate').hidden=true;document.body.classList.remove('no-room');
  state.user={uid:'fixture-user'};state.profile={...state.profile,nickname:'Eu'};state.nickname='Eu';state.activeRoom='fixture-only';state.roomConnected=true;state.canStream=true;state.peer={id:'fixture-peer',open:true};
  $('#shareButton').disabled=false;$('#roomName').textContent='Sala de prévia';
  const thumbnail=(color,label)=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,320,180);ctx.fillStyle='white';ctx.font='bold 28px sans-serif';ctx.fillText(label,18,50);return canvas.toDataURL('image/png');};
  const screens=[{id:'screen:1:0',type:'screen',name:'Tela 1 · 1920×1080',thumbnail:thumbnail('#6a5bac','TELA 1')},{id:'screen:2:0',type:'screen',name:'Tela 2 · 2560×1440',thumbnail:thumbnail('#4d7991','TELA 2')}];
  const windows=[{id:'window:11:0',type:'window',name:'Editor de código — projeto Foco',thumbnail:thumbnail('#4a6289','EDITOR')},{id:'window:12:0',type:'window',name:'Planilha de orçamento trimestral com um nome muito longo',thumbnail:thumbnail('#52755f','PLANILHA')},{id:'window:13:0',type:'window',name:'Navegador · documentação',thumbnail:thumbnail('#997151','NAVEGADOR')},{id:'window:14:0',type:'window',name:'Apresentação',thumbnail:thumbnail('#8b606f','SLIDES')},{id:'window:15:0',type:'window',name:'Terminal',thumbnail:thumbnail('#46566b','TERMINAL')},{id:'window:16:0',type:'window',name:'Reunião',thumbnail:thumbnail('#6a728d','REUNIÃO')},{id:'window:17:0',type:'window',name:'Janela sem imagem',thumbnail:null}];
  const dialog=$('#shareDialog');if(!dialog.open)dialog.showModal();sharePicker.generation++;sharePicker.error='';sharePicker.selectedId=null;sharePicker.loading=false;shareAttempt=null;
  sharePicker.sources=name==='loading'||name==='error'||name==='empty'?[]:name==='no-apps'?[screens[0]]:name==='few'?[screens[0],windows[0]]:name==='no-preview'?[screens[0],{...windows[6],type:'window'}]:[...screens,...windows];
  if(name==='loading')sharePicker.loading=true;
  if(name==='error')sharePicker.error='failed';
  const tab=['many','selected','preparing','no-preview'].includes(name)?'window':'screen';
  sharePicker.tab=tab;
  if(['selected','preparing'].includes(name))sharePicker.selectedId=windows[0].id;
  if(name==='no-preview')sharePicker.selectedId=windows[6].id;
  if(['no-audio','no-apps'].includes(name))sharePicker.selectedId=screens[0].id;
  populateShareAudio(['no-audio','no-apps'].includes(name)?'none':sharePicker.selectedId);setShareTab(tab);
  if(name==='error')setShareStatus('Não foi possível carregar as fontes. Tente atualizar a lista.','error');
  else if(name==='preparing'){shareAttempt={cancelled:false,room:'fixture-only',peer:state.peer};setShareStatus('Preparando transmissão…');updateShareControls();}
  else setShareStatus();
  if(window.focoI18n.getLanguage()!==locale)window.focoI18n.setLanguage(locale);
  document.querySelector('#toast').classList.remove('show');
}

function shareGeometry(){
  const dialog=$('#shareDialog').getBoundingClientRect(),source=$('#sourceOptions');
  return {viewport:{width:innerWidth,height:innerHeight},dialog:{x:dialog.x,y:dialog.y,width:dialog.width,height:dialog.height},sourceScroll:source.scrollHeight>source.clientHeight,sourceHeight:source.clientHeight,
    documentOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,
    selected:document.querySelectorAll('#sourceOptions [aria-pressed="true"]').length,loading:sharePicker.loading,error:!!sharePicker.error,audio:$('#audioSourceSelect').value,startDisabled:$('#startShareButton').disabled};
}

app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{partition:'share-fixture',contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const dir=path.join(__dirname,'..','renderer'),fixture=path.join(dir,'.share-smoke.html'),stubFile=path.join(dir,'.share-stubs.js');
  try{
    const html=fs.readFileSync(path.join(dir,'index.html'),'utf8').replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/,'').replace('<script src="firebase-client.bundle.js"></script>','<script src=".share-stubs.js"></script>');
    fs.writeFileSync(stubFile,stubs,'utf8');fs.writeFileSync(fixture,html,'utf8');await win.loadFile(fixture);
    const results=await win.webContents.executeJavaScript(`(${scenarios.toString()})()`);
    for(const {name,ok,detail} of results)console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?' — '+detail:''}`);
    assert.equal(results.filter(result=>!result.ok).length,0,'Share selector scenario failed.');
    console.log(`share selector passed: ${results.length} isolated scenarios.`);
    win.show();
    const output=path.join(__dirname,'..','artifacts','share-phase5');fs.mkdirSync(output,{recursive:true});
    const visualCases=[['loading',980,720],['few',980,720],['selected',980,720],['many',980,720],['error',980,720],['empty',980,720],['no-audio',980,720],['no-apps',980,720],
      ['few',1280,800],['many',1280,800],['selected',1280,800],['preparing',1280,800],['no-preview',1280,800],
      ['no-audio',1280,800],['no-apps',1280,800],['selected',1440,960],['many',1440,960],['no-audio',1440,960],['selected',1920,1032],['no-audio',1920,1032],
      ['no-audio',1280,800,'en-US'],['no-audio',1280,800,'es-ES'],['no-audio',1280,800,'fr-FR']];
    const geometry=[];
    for(const [name,width,height,locale='pt-BR'] of visualCases){
      win.setContentSize(width,height);
      await win.webContents.executeJavaScript(`(${prepareVisualCase.toString()})(${JSON.stringify(name)},${JSON.stringify(locale)})`);
      await new Promise(resolve=>setTimeout(resolve,280));
      const measured=await win.webContents.executeJavaScript(`(${shareGeometry.toString()})()`);
      assert.equal(measured.documentOverflow,false,`${name} document overflow`);
      assert(measured.dialog.x>=0&&measured.dialog.y>=0&&measured.dialog.x+measured.dialog.width<=width+1&&measured.dialog.y+measured.dialog.height<=height+1,`${name} dialog clipped`);
      if(name==='many')assert(measured.sourceScroll,`${name} should scroll internally`);
      if(name==='selected')assert.equal(measured.selected,1,'selected source missing');
      if(['no-audio','no-apps'].includes(name)){assert.equal(measured.audio,'none',`${name} audio selection`);assert.equal(measured.startDisabled,false,`${name} start is disabled`);}
      const file=`${name}-${width}x${height}${locale==='pt-BR'?'':'-'+locale}.png`;
      fs.writeFileSync(path.join(output,file),(await win.webContents.capturePage()).toPNG());
      geometry.push({file,...measured});console.log(`PASS  ${file}  dialog ${Math.round(measured.dialog.width)}×${Math.round(measured.dialog.height)}`);
    }
    fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(geometry,null,2));
    console.log(`share visual captures: ${geometry.length} synthetic states in ${output}`);
  }catch(error){console.error(error);process.exitCode=1;}
  finally{for(const file of [fixture,stubFile]){try{fs.unlinkSync(file);}catch{}}win.destroy();app.exit(process.exitCode||0);}
});
