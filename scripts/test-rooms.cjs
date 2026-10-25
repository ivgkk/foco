const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {app,BrowserWindow}=require('electron');

// A private Electron partition with inert bridges. No Firebase account or network is used.
const stubs=`window.__roomsTest={watchers:[],profile:{username:'fixture',nickname:'Pessoa',status:'Disponível',color:'#9b83ff',photo:'',showActivity:true,activity:''}};
window.focoDesktop={listSources:async()=>[],resolveProcess:async()=>1,startAudioCapture:async()=>true,stopAudioCapture:async()=>true,setFullscreen:async()=>false,getAppVersion:async()=>'test',writeClipboard:async()=>true,getUpdateStatus:async()=>({state:'unavailable',reason:'development'}),checkForUpdates:async()=>({}),getPendingInvite:async()=>'',onInvite:()=>()=>{},onAudioChunk:()=>()=>{},onUpdateStatus:()=>()=>{},platform:'win32'};
window.focoCloud={isConfigured:()=>true,onAuthChanged:()=>()=>{},getProfile:async()=>window.__roomsTest.profile,watchUserRooms:async(callback,onError)=>{const watcher={callback,onError,active:true,unsubscribed:0};window.__roomsTest.watchers.push(watcher);return()=>{watcher.active=false;watcher.unsubscribed++;};},cleanCode:value=>String(value||'').toUpperCase()};
window.Peer=function(){throw Error('PeerJS disabled in room-list tests');};`;

async function scenarios(){
  const t=window.__roomsTest,results=[],check=(name,ok)=>results.push({name,ok:Boolean(ok)});
  const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
  const a={code:'ROOMA1',name:'Sala Alfa',ownerUid:'u1'},b={code:'ROOMB2',name:'Sala Beta',ownerUid:'u1'};
  const current=()=>t.watchers.at(-1);
  const text=()=>document.querySelector('#roomList').textContent;
  try{
    await activateUser({uid:'u1'},++state.authGeneration);
    check('01 primeira resposta pendente mostra skeleton sem salas inventadas',state.roomsLoading&&!state.roomsLoaded&&!!document.querySelector('#roomList .skeleton-group')&&!text().includes('Nenhuma sala ainda'));
    state.roomsSlow=true;renderRooms();check('02 demora informa atraso sem afirmar erro',text().includes('demorando')&&!state.roomsError);state.roomsSlow=false;
    const first=current();first.onError(Error('permission denied'));await wait();
    check('03 erro inicial substitui skeleton por mensagem e retry',state.roomsError&&!state.roomsLoading&&!document.querySelector('#roomList .skeleton-group')&&!!document.querySelector('#roomList .room-list-retry'));
    document.querySelector('#roomList .room-list-retry').click();await wait();const second=current();
    check('04 retry cancela observador anterior e inicia apenas um novo',first.unsubscribed>0&&t.watchers.length===2&&state.roomsLoading&&!state.roomsError);
    startUserRoomsWatch(state.authGeneration,'u1',{retry:true});await wait();
    check('05 retry repetido não duplica observador',t.watchers.length===2);
    first.callback([a]);first.onError(Error('stale'));second.callback([]);await wait();
    check('06 resultado vazio só aparece após resposta válida',state.roomsLoaded&&!state.roomsLoading&&!state.roomsError&&state.rooms.length===0&&text().includes('Nenhuma sala ainda'));
    second.callback([a,b]);await wait();
    check('07 lista carregada mantém salas reais',state.rooms.length===2&&document.querySelectorAll('#roomList [data-room]').length===2);
    document.querySelector('#roomSearch').value='inexistente';renderRooms('inexistente');
    check('08 busca sem resultado difere de lista vazia',text().includes('Nenhuma sala encontrada')&&!text().includes('Nenhuma sala ainda'));
    document.querySelector('#roomSearch').value='';renderRooms();second.onError(Error('network lost'));await wait();
    check('09 falha posterior preserva salas e avisa que podem estar antigas',state.rooms.length===2&&document.querySelectorAll('#roomList [data-room]').length===2&&text().includes('desatualizada')&&!!document.querySelector('#roomList .room-list-retry'));
    const staleButton=document.querySelector('#roomList .room-list-retry');staleButton.click();await wait();const third=current();
    check('10 atualização mantém dados enquanto espera',state.roomsLoading&&state.rooms.length===2&&text().includes('Atualizando lista')&&document.querySelectorAll('#roomList [data-room]').length===2);
    second.callback([]);second.onError(Error('old error'));third.callback([b]);await wait();
    check('11 snapshot e erro antigos não apagam resposta recente',state.rooms.length===1&&state.rooms[0].code==='ROOMB2'&&!state.roomsError);
    third.onError(Error('failed again'));await wait();
    check('12 falha repetida mantém retry e último dado',state.roomsError&&state.rooms[0].code==='ROOMB2'&&!!document.querySelector('#roomList .room-list-retry'));
    document.querySelector('#roomList .room-list-retry').click();await wait();const fourth=current();
    await activateUser({uid:'u2'},++state.authGeneration);const accountB=current();
    fourth.callback([a]);fourth.onError(Error('old account'));accountB.callback([{code:'ROOMC3',name:'Sala de B',ownerUid:'u2'}]);await wait();
    check('13 troca de conta cancela retry anterior e descarta dados privados',fourth.unsubscribed>0&&state.user.uid==='u2'&&state.rooms.length===1&&state.rooms[0].code==='ROOMC3');
    accountB.onError(Error('offline'));document.querySelector('#roomList .room-list-retry').click();await wait();const logoutWatch=current();
    await activateUser(null,++state.authGeneration);logoutWatch.callback([a]);logoutWatch.onError(Error('logout'));
    check('14 logout invalida retry e limpa lista',logoutWatch.unsubscribed>0&&state.user===null&&state.rooms.length===0&&!state.roomsError&&!state.roomsLoading);
    check('15 nenhum observador permanece ativo',t.watchers.every(w=>!w.active));
  }catch(error){results.push({name:'Roteiro interrompido',ok:false,detail:error.stack||error.message});}
  return results;
}

function prepareVisual(name,locale){
  document.querySelector('#startupScreen').classList.add('is-done');document.querySelector('#authGate').hidden=true;document.body.classList.remove('no-room');
  localStorage.setItem('foco.sidebarCollapsed','false');applyShellLayout();
  state.user={uid:'fixture-user'};state.rooms=[{code:'ROOMA1',id:'ROOMA1',name:'Sala Alfa',ownerUid:'fixture-user'},{code:'ROOMB2',id:'ROOMB2',name:'Sala Beta',ownerUid:'fixture-user'}];
  state.roomsLoaded=!['loading','error'].includes(name);state.roomsLoading=['loading','retry'].includes(name);state.roomsError=['error','stale'].includes(name);state.roomsSlow=false;
  if(name==='empty')state.rooms=[];
  if(name==='retry')state.roomsLoaded=true;
  document.querySelector('#roomSearch').value='';renderRooms();window.focoI18n.setLanguage(locale);document.querySelector('#toast').classList.remove('show');
}

app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{partition:'rooms-lot3-fixture',contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const renderer=path.join(__dirname,'..','renderer'),fixture=path.join(renderer,'.rooms-smoke.html'),stubFile=path.join(renderer,'.rooms-stubs.js');
  try{
    const html=fs.readFileSync(path.join(renderer,'index.html'),'utf8').replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/,'').replace('<script src="firebase-client.bundle.js"></script>','<script src=".rooms-stubs.js"></script>');
    fs.writeFileSync(stubFile,stubs,'utf8');fs.writeFileSync(fixture,html,'utf8');await win.loadFile(fixture);
    const results=await win.webContents.executeJavaScript(`(${scenarios.toString()})()`);
    for(const row of results)console.log(`${row.ok?'PASS':'FAIL'}  ${row.name}${row.detail?' — '+row.detail:''}`);
    assert.equal(results.filter(row=>!row.ok).length,0,'Room-list recovery scenarios failed');
    win.show();
    const out=path.join(__dirname,'..','artifacts','rooms-lot3');fs.mkdirSync(out,{recursive:true});
    const visuals=[];for(const [width,height] of [[980,720],[1280,800],[1440,960],[1920,1032]])for(const name of ['loading','error','retry','empty','stale'])visuals.push([width,height,name,'pt-BR']);
    for(const locale of ['en-US','es-ES','fr-FR'])visuals.push([1280,800,'error',locale],[1280,800,'stale',locale]);
    for(const [width,height,name,locale] of visuals){
      win.setContentSize(width,height);await win.webContents.executeJavaScript(`(${prepareVisual.toString()})(${JSON.stringify(name)},${JSON.stringify(locale)})`);await new Promise(resolve=>setTimeout(resolve,100));
      const geometry=await win.webContents.executeJavaScript(`({overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,retry:!!document.querySelector('#roomList .room-list-retry'),busy:document.querySelector('#roomList').getAttribute('aria-busy'),roomCount:document.querySelectorAll('#roomList [data-room]').length})`);
      assert.equal(geometry.overflow,false,`${name} overflows at ${width}x${height} ${locale}`);
      if(['error','stale'].includes(name))assert.equal(geometry.retry,true,`${name} has no retry`);
      if(['stale','retry'].includes(name))assert.equal(geometry.roomCount,2,`${name} lost previously loaded rooms`);
      const file=`${name}-${width}x${height}-${locale}.png`;await win.webContents.capturePage().then(image=>fs.writeFileSync(path.join(out,file),image.toPNG()));
      console.log(`PASS  ${file}`);
    }
    console.log(`room list passed: ${results.length} isolated scenarios, ${visuals.length} captures.`);
  }catch(error){console.error(error);process.exitCode=1;}
  finally{try{fs.rmSync(fixture,{force:true});fs.rmSync(stubFile,{force:true});}catch{}win.destroy();app.quit();}
}).catch(error=>{console.error(error);process.exitCode=1;app.quit();});
