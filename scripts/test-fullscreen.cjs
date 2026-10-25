const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createFixtureRenderer } = require('./fixture-renderer.cjs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');

const stubs = `window.focoDesktop={listSources:async()=>[],resolveProcess:async()=>1,startAudioCapture:async()=>true,stopAudioCapture:async()=>true,getAppVersion:async()=>'test',writeClipboard:async()=>true,getUpdateStatus:async()=>({state:'unavailable'}),checkForUpdates:async()=>({}),getPendingInvite:async()=>'',onInvite:()=>()=>{},onAudioChunk:()=>()=>{},onUpdateStatus:()=>()=>{},platform:'win32'};
window.focoCloud={isConfigured:()=>true,onAuthChanged:()=>()=>{},exitRoom:async()=>{},updateRoomMember:async()=>{}};
window.Peer=function(){throw Error('PeerJS disabled in fullscreen fixture');};`;

function fixture(count) {
  window.fixtureTimers?.forEach(clearInterval);window.fixtureTimers=[];
  window.fixtureStreams?.forEach(stream=>stream.getTracks().forEach(track=>track.stop()));
  state.streams.clear();renderStreams();
  window.fixtureStreams=[];
  state.user={uid:'fixture-user'};state.activeRoom='fixture-room';state.roomConnected=true;
  state.peer={id:'fixture-local',open:true,destroy(){this.destroyed=true;}};
  document.querySelector('#startupScreen').classList.add('is-done');
  document.querySelector('#authGate').hidden=true;document.querySelector('.app-shell').inert=false;document.body.classList.remove('no-room');
  for(let i=0;i<count;i++){
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const stream=canvas.captureStream(5);window.fixtureStreams.push(stream);
    const ctx=canvas.getContext('2d'),paint=()=>{ctx.fillStyle=['#345f82','#76508b','#346b5c'][i%3];ctx.fillRect(0,0,640,360);ctx.strokeStyle='#f5f5ff';ctx.lineWidth=8;ctx.strokeRect(18,18,604,324);ctx.fillStyle='#fff';ctx.font='bold 54px sans-serif';ctx.fillText('STREAM '+(i+1),40,100);};
    paint();window.fixtureTimers.push(setInterval(paint,200));
    state.streams.set('fixture-'+i,{stream,name:'Pessoa '+i,uid:'u'+i,local:false,appName:'Fixture',sourceType:'Janela'});
  }
  state.focusedId=null;renderStreams();setDisplayMode('focus');
  return true;
}
function snapshot(){
  const cards=[...document.querySelectorAll('#streamGrid .stream-card')];
  return {fullscreen:document.fullscreenElement?.dataset.stream||null,theater:state.theaterId,
    cards:cards.map(card=>({id:card.dataset.stream,focused:card.classList.contains('is-focused'),expanded:card.classList.contains('expanded'),
      rect:{width:card.getBoundingClientRect().width,height:card.getBoundingClientRect().height},
      video:card.querySelector('video')})),
    active:document.activeElement?.className||'',body:document.body.classList.contains('theater-active')};
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(win,expression,timeout=3000){const started=Date.now();while(Date.now()-started<timeout){if(await win.webContents.executeJavaScript(expression))return true;await sleep(30);}return false;}

app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:true,width:1280,height:800,webPreferences:{partition:'foco-fullscreen-fixture',contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const dir=createFixtureRenderer(),fixtureFile=path.join(dir,'.fullscreen-smoke.html'),stubFile=path.join(dir,'.fullscreen-stubs.js');
  const output=path.join(__dirname,'..','artifacts','phase-8b-lot-4');
  try{
    const html=fs.readFileSync(path.join(dir,'index.html'),'utf8')
      .replace(/\s*<script src="\.\.\/node_modules\/peerjs\/dist\/peerjs\.min\.js"><\/script>/,'')
      .replace('<script src="firebase-client.bundle.js"></script>','<script src=".fullscreen-stubs.js"></script>');
    fs.writeFileSync(stubFile,stubs);fs.writeFileSync(fixtureFile,html);
    await win.loadFile(fixtureFile);win.setContentSize(1280,800);win.focus();
    fs.mkdirSync(output,{recursive:true});
    await win.webContents.executeJavaScript(`(${fixture.toString()})(2)`);
    await win.webContents.executeJavaScript(`setPanelOpen(false);updateStageGeometry()`);
    await sleep(100);
    let result=await win.webContents.executeJavaScript(`(${snapshot.toString()})()`);
    assert.equal(result.cards.length,2);
    assert(result.cards[0].rect.width>result.cards[1].rect.width*1.7,'focused pair must be larger');
    await sleep(250);fs.writeFileSync(path.join(output,'focus-two-wide.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.body.classList.remove('no-room');setPanelOpen(true);updateStageGeometry()`);
    await sleep(150);
    result=await win.webContents.executeJavaScript(`(${snapshot.toString()})()`);
    assert(result.cards[0].rect.height>result.cards[1].rect.height*1.7,`focused pair must be larger with panel open: ${JSON.stringify(result.cards.map(card=>card.rect))}`);
    fs.writeFileSync(path.join(output,'focus-two-panel-open.png'),(await win.webContents.capturePage()).toPNG());
    const identity=await win.webContents.executeJavaScript(`window.__video=state.streamTiles.get('fixture-0').video;window.__stream=window.__video.srcObject;playbackPrefs('fixture-0').volume=42;playbackPrefs('fixture-0').muted=true;applyPlayback(state.streamTiles.get('fixture-0'));true`);
    assert(identity);
    await win.webContents.executeJavaScript(`state.streamTiles.get('fixture-1').card.click()`);
    result=await win.webContents.executeJavaScript(`(${snapshot.toString()})()`);
    assert(result.cards[1].focused&&result.cards[1].rect.height>result.cards[0].rect.height*1.7,'click must move focus');
    await win.webContents.executeJavaScript(`state.streamTiles.get('fixture-1').expand.click()`);
    assert(await win.webContents.executeJavaScript(`state.expandedId==='fixture-1'&&state.streamTiles.get('fixture-1').card.getBoundingClientRect().height>state.streamTiles.get('fixture-0').card.getBoundingClientRect().height*2`),'expand must dominate');
    await win.webContents.executeJavaScript(`state.streamTiles.get('fixture-1').fullscreen.focus()`);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
    assert(await until(win,`document.fullscreenElement?.dataset.stream==='fixture-1'`),'button must enter DOM fullscreen');
    assert(win.isFullScreen(),'Electron window must enter native fullscreen');
    await sleep(250);fs.writeFileSync(path.join(output,'stream-fullscreen.png'),(await win.webContents.capturePage()).toPNG());
    assert(await win.webContents.executeJavaScript(`state.theaterId==='fixture-1'&&document.body.classList.contains('theater-active')&&state.streamTiles.get('fixture-1').fullscreen.getAttribute('aria-pressed')==='true'`));
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
    assert(await until(win,`!document.fullscreenElement`),'Esc must leave fullscreen');
    assert(await until(win,`document.activeElement===state.streamTiles.get('fixture-1').fullscreen`),`focus must return after Windows fullscreen transition: ${JSON.stringify(await win.webContents.executeJavaScript(`({active:document.activeElement?.className,returnFocus:fullscreenReturnFocus?.className,theater:state.theaterId,connected:state.streamTiles.get('fixture-1').fullscreen.isConnected})`))}`);
    const restored=await win.webContents.executeJavaScript(`({theater:state.theaterId,expanded:state.expandedId,focused:document.activeElement===state.streamTiles.get('fixture-1').fullscreen,active:document.activeElement?.outerHTML?.slice(0,100)})`);
    assert(!restored.theater&&restored.expanded==='fixture-1'&&restored.focused,`state, layout and focus must restore: ${JSON.stringify(restored)}`);
    await win.webContents.executeJavaScript(`state.streamTiles.get('fixture-1').card.focus()`);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'F'});
    assert(await until(win,`document.fullscreenElement?.dataset.stream==='fixture-1'`),'F must enter fullscreen');
    await win.webContents.executeJavaScript(`document.exitFullscreen()`);
    assert(await until(win,`!state.theaterId`),'fullscreenchange must sync external exit');
    assert(await win.webContents.executeJavaScript(`window.__video===state.streamTiles.get('fixture-0').video&&window.__stream===window.__video.srcObject&&window.__video.volume===.42&&window.__video.muted`),'video and playback settings must persist');
    await win.webContents.executeJavaScript(`setDisplayMode('grid');setDisplayMode('focus');document.querySelector('#panelToggle').click();document.querySelector('#panelToggle').click();`);
    assert(await win.webContents.executeJavaScript(`window.__video===state.streamTiles.get('fixture-0').video&&window.__stream===window.__video.srcObject`));
    await win.webContents.executeJavaScript(`document.body.classList.add('panel-open');document.querySelector('#chatInput').disabled=false;document.querySelector('#chatInput').focus()`);
    assert(await win.webContents.executeJavaScript(`document.activeElement===document.querySelector('#chatInput')`),'chat input must receive focus');
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'F'});await sleep(100);
    assert.equal(await win.webContents.executeJavaScript(`document.fullscreenElement`),null,'input must block shortcut');
    await win.webContents.executeJavaScript(`document.querySelector('#settingsDialog').showModal();`);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'F'});await sleep(100);
    assert.equal(await win.webContents.executeJavaScript(`document.fullscreenElement`),null,'dialog must block shortcut');
    await win.webContents.executeJavaScript(`document.querySelector('#settingsDialog').close();`);
    await win.webContents.executeJavaScript(`window.__request=Element.prototype.requestFullscreen;Element.prototype.requestFullscreen=function(){return Promise.reject(Error('fixture rejection'));};state.streamTiles.get('fixture-0').fullscreen.click();`);
    await sleep(100);
    assert(await win.webContents.executeJavaScript(`!state.theaterId&&!document.body.classList.contains('theater-active')`),'rejection must leave clean state');
    await win.webContents.executeJavaScript(`Element.prototype.requestFullscreen=window.__request;const card=state.streamTiles.get('fixture-0').card;card.remove();setTheaterMode(card);`);
    assert.equal(await win.webContents.executeJavaScript(`document.fullscreenElement`),null,'detached card must be ignored');
    for(const count of [1,3,6]){
      await win.webContents.executeJavaScript(`(${fixture.toString()})(${count})`);
      assert.equal((await win.webContents.executeJavaScript(`(${snapshot.toString()})()`)).cards.length,count);
      if(count===1){
        const expandedLocal=await win.webContents.executeJavaScript(`(()=>{state.streams.get('fixture-0').local=true;renderStreams();const localCard=state.streamTiles.get('fixture-0').card;state.streamTiles.get('fixture-0').expand.click();return localCard.getBoundingClientRect().height>document.querySelector('#streamGrid').getBoundingClientRect().height*.9;})()`);
        assert(expandedLocal,'single local preview must be able to expand');
      }
    }
    await win.webContents.executeJavaScript(`state.streamTiles.get('fixture-0').fullscreen.click()`);
    assert(await until(win,`!!document.fullscreenElement`));
    await win.webContents.executeJavaScript(`state.streams.delete('fixture-0');renderStreams()`);
    assert(await until(win,`!document.fullscreenElement&&!state.theaterId`),'closed stream must leave fullscreen');
    {const started=Date.now();while(win.isFullScreen()&&Date.now()-started<3000)await sleep(30);}
    assert(!win.isFullScreen(),'window must leave native fullscreen after stream closes');
    await win.webContents.executeJavaScript(`state.streamTiles.get('fixture-1').fullscreen.focus()`);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
    assert(await until(win,`!!document.fullscreenElement`));
    await win.webContents.executeJavaScript(`disconnectRoom(false,{remote:false})`);
    assert(await until(win,`!document.fullscreenElement&&!state.theaterId`),'room switch must leave fullscreen');
    await win.webContents.executeJavaScript(`(${fixture.toString()})(1)`);
    win.maximize();await sleep(150);
    await win.webContents.executeJavaScript(`state.streamTiles.get('fixture-0').card.focus()`);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'F'});
    assert(await until(win,`!!document.fullscreenElement`),'maximized window must enter fullscreen');
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
    assert(await until(win,`!document.fullscreenElement`),'maximized window must leave fullscreen');
    assert(win.isMaximized(),'maximized state must be restored');
    console.log('PASS fullscreen, focus, layout, keyboard, DOM identity and cleanup fixture');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{try{await win.webContents.executeJavaScript(`window.fixtureTimers?.forEach(clearInterval);window.fixtureStreams?.forEach(stream=>stream.getTracks().forEach(track=>track.stop()))`);}catch{}
    for(const file of [fixtureFile,stubFile])try{fs.unlinkSync(file);}catch{}
    win.destroy();app.exit(process.exitCode||0);}
});
