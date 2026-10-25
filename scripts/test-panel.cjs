const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {app,BrowserWindow}=require('electron');

// This fixture has no Firebase SDK, real room, or PeerJS connection.
const stubs=`window.__panelTest={sends:[],sendQueue:[],deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}};
window.focoCloud={isConfigured:()=>true,onAuthChanged:()=>()=>{},sendRoomChat:async(room,message)=>{const t=window.__panelTest;t.sends.push({room,message});if(t.sendQueue.length)await t.sendQueue.shift();return 'fake-id';},deleteRoomChatMessage:async()=>{},exitRoom:async()=>{},updateRoomMember:async()=>{},cleanCode:value=>String(value||'')};
window.focoDesktop={listSources:async()=>[],resolveProcess:async()=>0,startAudioCapture:async()=>true,stopAudioCapture:async()=>true,setFullscreen:async()=>true,getAppVersion:async()=>'test',writeClipboard:async()=>true,getUpdateStatus:async()=>({state:'unavailable'}),checkForUpdates:async()=>({}),getPendingInvite:async()=>'',onInvite:()=>()=>{},onAudioChunk:()=>()=>{},onUpdateStatus:()=>()=>{},platform:'win32'};
window.Peer=function(){throw new Error('PeerJS is disabled in panel tests.');};`;

async function scenarios(){
  const results=[],check=(name,ok,detail='')=>results.push({name,ok:!!ok,detail:String(detail)}),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(predicate,timeout=2500)=>{const start=Date.now();while(Date.now()-start<timeout){if(predicate())return true;await sleep(20);}return predicate();};
  const t=window.__panelTest,now=Date.now(),message=(id,uid,text,minute=0,extra={})=>({id,uid,nickname:uid==='me'?'Eu':'Luna',kind:'text',text,createdAt:now+minute*60000,...extra});
  const thumb=()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=20;canvas.getContext('2d').fillRect(0,0,32,20);return canvas.toDataURL('image/webp');};
  document.querySelector('#startupScreen').classList.add('is-done');hideAuthGate();document.body.classList.remove('no-room');
  window.focoI18n.setLanguage('pt-BR');
  state.user={uid:'me'};state.profile={...state.profile,nickname:'Eu',role:'owner'};state.nickname='Eu';state.activeRoom='SYNTHETIC';state.roomConnected=true;state.peer={id:'peer-me',open:true};state.currentRoomData={ownerUid:'me'};state.isHost=true;
  localStorage.setItem('foco.panelOpen','true');applyShellLayout();setPanelTab('chat');
  try{
    state.chatLoaded=false;renderRoomChat();check('Chat inicial mostra skeleton sem histórico inventado',$('#chatMessages').getAttribute('aria-busy')==='true'&&!!$('#chatMessages .chat-skeleton')&&!$('#chatMessages .chat-empty'));
    state.chatLoaded=true;state.chatMessages=[];renderRoomChat();check('Snapshot vazio confirmado mostra estado vazio',$('#chatMessages').getAttribute('aria-busy')===null&&!!$('#chatMessages .chat-empty'));
    const base=[message('a','luna','Primeira mensagem'),message('b','luna','Segunda mensagem',1),message('c','luna','Depois de uma pausa',9),message('d','me','Eu <script>alert(1)</script> 😀\nhttps://example.com/projeto',10),message('e','luna','Imagem anexa',11,{kind:'image',media:thumb()})];
    state.chatMessages=base;state.chatSeenIds=new Set(base.map(item=>item.id));renderRoomChat();
    const rows=()=>[...document.querySelectorAll('#chatMessages [data-chat-id]')];
    check('Todas as mensagens reais são exibidas',rows().length===5);
    check('Mensagens próximas do mesmo autor são agrupadas',rows()[1].classList.contains('grouped')&&!rows()[1].querySelector('.chat-message-top'));
    check('Intervalo longo inicia novo grupo',!rows()[2].classList.contains('grouped')&&!!rows()[2].querySelector('.chat-message-top'));
    check('Mensagem própria tem tratamento discreto e remoção',rows()[3].classList.contains('own')&&!!rows()[3].querySelector('[data-chat-delete]'));
    check('HTML de usuário é escapado',!$('#chatMessages script')&&rows()[3].textContent.includes('<script>alert(1)</script>'));
    check('Unicode, quebra de linha e link HTTPS continuam legíveis',rows()[3].textContent.includes('😀')&&!!rows()[3].querySelector('br')&&rows()[3].querySelector('a')?.getAttribute('href')==='https://example.com/projeto');
    check('Anexo existente é preservado com miniatura',!!rows()[4].querySelector('.chat-media-thumb img'));
    const first=rows()[0],second=rows()[1];renderRoomChat();check('Snapshot idêntico preserva nós das mensagens',rows()[0]===first&&rows()[1]===second);
    state.chatMessages=[{...base[0],text:'Primeira mensagem editada'},...base.slice(1)];renderRoomChat();check('Alteração reconstrói apenas a mensagem modificada',rows()[0]!==first&&rows()[1]===second);
    const many=Array.from({length:43},(_,index)=>message(`m${index}`,index%4?'luna':'me',`Mensagem ${index} com texto longo para ocupar a largura do painel e testar a rolagem.`,index));
    state.chatMessages=many;state.chatSeenIds=new Set(many.map(item=>item.id));renderRoomChat();$('#chatMessages').scrollTop=0;await sleep(30);
    const oldTop=$('#chatMessages').scrollTop;state.chatMessages=[...many,message('new','luna','Chegou agora',44)];renderRoomChat();
    check('Nova mensagem não desloca leitura do histórico',Math.abs($('#chatMessages').scrollTop-oldTop)<3,`scroll=${oldTop}→${$('#chatMessages').scrollTop}`);
    check('Mensagem nova de outra pessoa gera um único não lido',$('#chatUnread').textContent==='1'&&!$('#chatUnread').hidden&&!$('#chatJump').hidden);
    renderRoomChat();check('Snapshot repetido não duplica não lidos',$('#chatUnread').textContent==='1');
    $('#chatJump').click();await sleep(30);check('Ação de retorno leva ao fim e marca como lida',chatAtBottom()&&$('#chatUnread').hidden&&$('#chatJump').hidden);
    setPanelTab('people');state.chatMessages=[...state.chatMessages,message('hidden','luna','Enquanto Pessoas está aberta',45)];renderRoomChat();check('Aba Pessoas mantém novo chat como não lido',$('#chatUnread').textContent==='1'&&!$('#chatUnread').hidden);
    setPanelOpen(false);state.chatMessages=[...state.chatMessages,message('own','me','Minha mensagem',46)];renderRoomChat();check('Mensagem própria não aumenta contagem com painel fechado',$('#chatUnread').textContent==='1'&&!$('#panelUnread').hidden);setPanelOpen(true);
    setPanelTab('chat');state.chatMessages=base;state.chatSeenIds=new Set(base.map(item=>item.id));renderRoomChat();
    const input=$('#chatInput');input.value='Mensagem para envio';input.dispatchEvent(new Event('input',{bubbles:true}));state.lastChatSentAt=0;
    const pending=t.deferred();t.sendQueue.push(pending.promise);$('#chatSendButton').click();$('#chatSendButton').click();await until(()=>t.sends.length===1);
    check('Envio pendente bloqueia clique duplicado e informa progresso',t.sends.length===1&&state.chatSending&&$('#chatSendStatus').dataset.kind==='pending');
    pending.resolve();await until(()=>!state.chatSending);check('Envio confirmado limpa composer e informa sucesso',input.value===''&&$('#chatSendStatus').dataset.kind==='success');
    state.lastChatSentAt=0;input.value='Teste de teclado';input.dispatchEvent(new Event('input',{bubbles:true}));const beforeKeys=t.sends.length;
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));
    check('Shift+Enter e composição IME não enviam',t.sends.length===beforeKeys);
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await until(()=>t.sends.length>beforeKeys);check('Enter envia uma vez',t.sends.length===beforeKeys+1&&t.sends.at(-1).message.text==='Teste de teclado');
    state.lastChatSentAt=0;input.value='';state.chatMedia={kind:'image',data:thumb(),name:'imagem.webp'};updateChatAttachment();$('#chatSendButton').click();await until(()=>t.sends.length===beforeKeys+2);
    check('Anexo existente é enviado sem texto obrigatório',t.sends.at(-1).message.kind==='image'&&t.sends.at(-1).message.media.startsWith('data:image/webp'));
    state.chatMedia=null;updateChatAttachment();
    state.lastChatSentAt=0;input.value='Texto preservado após falha';input.dispatchEvent(new Event('input',{bubbles:true}));const failed=t.deferred(),beforeFailure=t.sends.length;t.sendQueue.push(failed.promise);$('#chatSendButton').click();await until(()=>t.sends.length>beforeFailure);failed.reject(new Error('network'));await until(()=>!state.chatSending);
    check('Falha de envio preserva texto e informa erro no composer',input.value==='Texto preservado após falha'&&$('#chatSendStatus').dataset.kind==='error');
    $('#chatSendButton').click();await until(()=>t.sends.length>beforeFailure+1);check('Falha permite nova tentativa sem clique duplicado',t.sends.length===beforeFailure+2);
    setPanelTab('people');state.membersLoaded=false;renderPeople();check('Pessoas carrega skeleton sem contagem inventada',!!$('#peopleList .person-skeleton')&&$('#onlineCount').textContent==='');
    state.membersLoaded=true;state.ownMember={uid:'me',nickname:'Eu',role:'owner',online:true};state.members=new Map([['luna',{uid:'luna',peerId:'peer-luna',nickname:'Luna',role:'moderator',online:true,streaming:true}],['jo',{uid:'jo',peerId:'peer-jo',nickname:'João com um nome muito longo para o painel',role:'member',online:true}],['unknown',{uid:'unknown',peerId:'peer-unknown',nickname:'Presença desconhecida',role:'member'}]]);
    renderPeople();check('Lista compacta usa dados reais de participantes e papéis',document.querySelectorAll('#peopleList .person-chip').length===4&&$('#peopleList').textContent.includes('Moderador')&&$('#peopleList').textContent.includes('Dono da sala'));
    check('Presença desconhecida não recebe indicador online',$('#onlineCount').textContent==='3'&&!([...document.querySelectorAll('.person-chip')].find(row=>row.dataset.personUid==='unknown')?.querySelector('.person-online')));
    const ownRow=[...document.querySelectorAll('.person-chip')].find(row=>row.dataset.personUid==='me');renderPeople();check('Snapshot idêntico preserva linha de participante',document.querySelector('[data-person-uid="me"]')===ownRow);
    state.members.set('jo',{...state.members.get('jo'),nickname:'João atualizado'});renderPeople();check('Mudança de perfil atualiza apenas a linha alterada',document.querySelector('[data-person-uid="me"]')===ownRow&&$('#peopleList').textContent.includes('João atualizado'));
    const stream=document.createElement('canvas');stream.width=640;stream.height=360;stream.getContext('2d').fillRect(0,0,640,360);const media=stream.captureStream(5);state.streams.set('peer-luna',{stream:media,name:'Luna',uid:'luna',local:false});renderStreams();renderPeople();const video=state.streamTiles.get('peer-luna').video;
    check('Participante transmitindo tem ação para focar',!!document.querySelector('[data-person-focus="peer-luna"]')&&$('#peopleList').textContent.includes('Transmitindo'));
    document.querySelector('[data-person-focus="peer-luna"]').click();check('Focar pela lista reutiliza o Stage e preserva vídeo',state.focusedId==='peer-luna'&&state.streamTiles.get('peer-luna').video===video);
    if(!WIDE_PANEL_QUERY.matches)check('Em janela estreita, focar revela o Stage',!isPanelOpen());setPanelOpen(true);setPanelTab('people');
    let trigger=document.querySelector('[data-person-menu="luna"]');trigger.click();check('Menu contextual de moderação abre para dono',state.openPersonMenu==='luna'&&!document.querySelector('[data-person-menu-content="luna"]').hidden);
    state.members.set('luna',{...state.members.get('luna'),nickname:'Luna atualizada'});renderPeople();trigger=document.querySelector('[data-person-menu="luna"]');
    check('Atualização de perfil mantém menu aberto e foco acessível',state.openPersonMenu==='luna'&&!document.querySelector('[data-person-menu-content="luna"]').hidden&&document.activeElement?.matches('[data-person-manage="luna"]'));
    document.querySelector('#peopleList').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check('Esc fecha menu e devolve foco',state.openPersonMenu===null&&document.activeElement===trigger);
    state.isHost=false;state.profile.role='member';renderPeople();check('Usuário sem permissão não vê ações administrativas',!document.querySelector('[data-person-menu="luna"]'));
    state.membersError='failed';renderPeople();check('Erro de presença conserva nomes mas retira confirmação online',$('#peopleList').textContent.includes('Luna')&&$('#onlineCount').textContent===''&&!document.querySelector('.person-online')&&!$('#peopleLoadStatus').hidden);
    state.membersError='';state.chatError='failed';renderRoomChat();check('Erro de chat preserva histórico confirmado',$('#chatMessages [data-chat-id]')&&!$('#chatLoadStatus').hidden);
    window.focoCloud.watchRoomChat=async(_room,callback)=>{t.chatCallback=callback;return()=>{};};
    $('#chatLoadStatus [data-retry-chat]').click();await until(()=>!!t.chatCallback);t.chatCallback(base);check('Tentar novamente recupera o chat sem apagar o histórico',!state.chatError&&$('#chatMessages [data-chat-id]'));
    const staleChat=t.chatCallback;state.chatError='failed';renderRoomChat();$('#chatLoadStatus [data-retry-chat]').click();await until(()=>t.chatCallback!==staleChat);t.chatCallback(base);staleChat([message('stale','luna','Resposta antiga')]);check('Resposta atrasada de assinatura antiga não substitui chat atual',!state.chatMessages.some(item=>item.id==='stale'));
    state.membersError='failed';renderPeople();window.focoCloud.watchMemberList=async(_room,callback)=>{t.membersCallback=callback;return()=>{};};
    $('#peopleLoadStatus [data-retry-members]').click();await until(()=>!!t.membersCallback);t.membersCallback({me:{uid:'me',peerId:'peer-me',nickname:'Eu',role:'owner',online:true}});
    check('Tentar novamente recupera presença com contagem confirmada',!state.membersError&&$('#onlineCount').textContent==='1');
    const staleMembers=t.membersCallback;state.membersError='failed';renderPeople();$('#peopleLoadStatus [data-retry-members]').click();await until(()=>t.membersCallback!==staleMembers);t.membersCallback({me:{uid:'me',peerId:'peer-me',nickname:'Eu',role:'owner',online:true}});staleMembers({me:{uid:'me',peerId:'peer-me',nickname:'Eu',role:'owner',online:true},ghost:{uid:'ghost',peerId:'p-ghost',nickname:'Fantasma',online:true}});check('Resposta antiga de presença não cria participante fantasma',!state.members.has('ghost'));
    const nodeBeforeLanguage=$('#chatMessages [data-chat-id]');for(const [locale,word] of [['en-US','People'],['es-ES','Personas'],['fr-FR','Personnes'],['pt-BR','Pessoas']]){window.focoI18n.setLanguage(locale);await sleep(25);check(`Tradução do painel: ${locale}`,$('#peopleTab').firstChild.nodeValue.trim()===word&&!!$('#chatMessages [data-chat-id]'));}
    check('Troca de idioma não remove histórico',!!nodeBeforeLanguage&&!!$('#chatMessages [data-chat-id]'));
    document.documentElement.classList.add('reduce-motion');const reduced=getComputedStyle(document.querySelector('.person-chip')).transitionDuration;check('Preferência interna reduz transições',reduced.split(',').every(part=>parseFloat(part)<.01));document.documentElement.classList.remove('reduce-motion');
    state.streams.clear();renderStreams();media.getTracks().forEach(track=>track.stop());disconnectRoom(false);showNoRoom();
    check('Saída da sala limpa chat, presença, menus e não lidas',!state.activeRoom&&!state.chatMessages.length&&!state.members.size&&!state.openPersonMenu&&$('#chatUnread').hidden&&!$('#chatMessages [data-chat-id]')&&!$('#peopleList .person-chip'));
  }catch(error){check('Roteiro interrompido por exceção',false,error.stack||error.message);}
  state.activeRoom=null;state.user=null;return results;
}

function visualCase(kind,locale='pt-BR'){
  document.querySelector('#startupScreen').classList.add('is-done');hideAuthGate();document.body.classList.remove('no-room');
  state.user={uid:'me'};state.profile={...state.profile,nickname:'Eu',role:'owner'};state.activeRoom='PREVIEW';state.roomConnected=true;state.peer={id:'peer-me',open:true};state.currentRoomData={ownerUid:'me'};state.isHost=true;
  $('#roomName').textContent='Sala de prévia';$('#chatSendStatus').hidden=true;
  state.ownMember={uid:'me',nickname:'Eu',role:'owner',online:true};state.membersLoaded=kind!=='people-loading';state.membersError='';state.members=new Map(Array.from({length:kind==='many-people'?19:kind==='people-loading'?0:4},(_,i)=>[`u${i}`,{uid:`u${i}`,peerId:`p${i}`,nickname:['Luna','João Almeida','Camille Dubois','Nome de participante bastante comprido'][i%4],role:i===0?'moderator':'member',online:true,streaming:i===0}]));
  state.chatLoaded=kind!=='loading';state.chatError='';state.chatMessages=kind==='empty'||kind==='loading'?[]:Array.from({length:kind==='many'||kind==='unread'?35:kind==='image'?6:8},(_,i)=>({id:`v${i}`,uid:i%4===0?'me':'luna',nickname:i%4===0?'Eu':'Luna',kind:kind==='image'&&i===3?'image':'text',text:kind==='long'&&i===4?'Uma mensagem longa com detalhes do projeto '.repeat(11):['Conseguiu ver minha tela?','Estou abrindo o projeto agora.','Sim, está aparecendo normalmente.','A apresentação ficou pronta ✨'][i%4],media:kind==='image'&&i===3?(()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.fillStyle='#735bad';x.fillRect(0,0,320,180);return c.toDataURL('image/webp');})():'',createdAt:Date.now()+i*60000}));
  state.chatSeenIds=new Set(kind==='unread'?state.chatMessages.slice(0,-3).map(m=>m.id):state.chatMessages.map(m=>m.id));state.openPersonMenu=null;state.chatMedia=null;$('#chatInput').value=kind==='composer'?'Mensagem com várias linhas\nSegunda linha\nTerceira linha':'';resizeChatInput();updateChatAttachment();
  localStorage.setItem('foco.panelOpen','true');localStorage.removeItem('foco.sidebarCollapsed');if(kind==='sidebar-collapsed')localStorage.setItem('foco.sidebarCollapsed','true');applyShellLayout();if(kind==='panel-closed')setPanelOpen(false);setPanelTab(kind.startsWith('people')||kind==='many-people'||kind==='menu'?'people':'chat');renderPeople();renderRoomChat();
  if(kind==='unread'){$('#chatMessages').scrollTop=0;updateChatUnread();}
  if(kind==='menu')document.querySelector('[data-person-menu="u0"]')?.click();
  if(window.focoI18n.getLanguage()!==locale)window.focoI18n.setLanguage(locale);
  document.querySelector('#toast').classList.remove('show');
}

function geometry(){const panel=$('#sidePanel').getBoundingClientRect(),chat=$('#chatMessages');return{viewport:[innerWidth,innerHeight],panel:{x:panel.x,y:panel.y,width:panel.width,height:panel.height},pageOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,panelOverflow:$('#sidePanel').scrollWidth>$('#sidePanel').clientWidth,chatOverflow:chat.scrollWidth>chat.clientWidth};}

app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{partition:'panel-fixture',contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const dir=path.join(__dirname,'..','renderer'),fixture=path.join(dir,'.panel-smoke.html'),stub=path.join(dir,'.panel-stubs.js');
  try{
    const html=fs.readFileSync(path.join(dir,'index.html'),'utf8').replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/,'').replace('<script src="firebase-client.bundle.js"></script>','<script src=".panel-stubs.js"></script>');
    fs.writeFileSync(stub,stubs);fs.writeFileSync(fixture,html);await win.loadFile(fixture);
    const results=await win.webContents.executeJavaScript(`(${scenarios.toString()})()`);
    for(const result of results)console.log(`${result.ok?'PASS':'FAIL'}  ${result.name}${result.detail?' — '+result.detail:''}`);
    assert.equal(results.filter(result=>!result.ok).length,0,'Panel scenario failed');console.log(`panel passed: ${results.length} isolated scenarios.`);
    win.show();const output=path.join(__dirname,'..','artifacts','panel-phase6');fs.mkdirSync(output,{recursive:true});
    const cases=[['loading',980,720],['empty',980,720],['long',980,720],['many',980,720],['people-loading',980,720],['many-people',980,720],['image',1280,800],['composer',1280,800],['unread',1280,800],['people',1280,800],['menu',1280,800],['panel-closed',1280,800],['sidebar-collapsed',1280,800],['many',1440,960],['many-people',1440,960],['many',1920,1032],['people',1280,800,'en-US'],['people',1280,800,'es-ES'],['people',1280,800,'fr-FR']];
    const measures=[];for(const [kind,width,height,locale='pt-BR'] of cases){win.setContentSize(width,height);await win.webContents.executeJavaScript(`(${visualCase.toString()})(${JSON.stringify(kind)},${JSON.stringify(locale)})`);await new Promise(resolve=>setTimeout(resolve,220));const size=await win.webContents.executeJavaScript(`(${geometry.toString()})()`);assert(!size.pageOverflow&&!size.panelOverflow&&!size.chatOverflow,`${kind} overflow at ${width}x${height}: ${JSON.stringify(size)}`);const file=`${kind}-${width}x${height}${locale==='pt-BR'?'':'-'+locale}.png`;fs.writeFileSync(path.join(output,file),(await win.webContents.capturePage()).toPNG());measures.push({file,...size});console.log(`PASS  ${file}`);}
    win.maximize();await win.webContents.executeJavaScript(`(${visualCase.toString()})('many')`);await new Promise(resolve=>setTimeout(resolve,220));const maximized=await win.webContents.executeJavaScript(`(${geometry.toString()})()`);assert(!maximized.pageOverflow&&!maximized.panelOverflow&&!maximized.chatOverflow,`maximized overflow: ${JSON.stringify(maximized)}`);fs.writeFileSync(path.join(output,'many-maximized.png'),(await win.webContents.capturePage()).toPNG());measures.push({file:'many-maximized.png',...maximized});console.log('PASS  many-maximized.png');
    fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(measures,null,2));console.log(`panel visual captures: ${measures.length} synthetic states.`);
  }catch(error){console.error(error);process.exitCode=1;}
  finally{for(const file of [fixture,stub])try{fs.unlinkSync(file);}catch{}win.destroy();app.exit(process.exitCode||0);}
});
