const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {pathToFileURL} = require('node:url');

const handlers = new Map(), appEvents = new Map(), captures = [], sent = [];
class FakeCapture {
  constructor(){this.stops=0;captures.push(this);}
  start(pid,includeTree,callback){this.pid=pid;this.includeTree=includeTree;this.callback=callback;if(FakeCapture.failStart)throw Error('native start failed');}
  stop(){this.stops++;}
}
const app={isPackaged:false,commandLine:{appendSwitch(){}},getVersion:()=> 'test',setAsDefaultProtocolClient(){},requestSingleInstanceLock:()=>false,quit(){},on:(name,callback)=>appEvents.set(name,callback)};
const ipcMain={handle:(name,callback)=>handlers.set(name,callback),on(){}};
const source={id:'window:11:0',name:'Fixture',thumbnail:{toDataURL:()=>''},appIcon:null};
const electron={app,BrowserWindow:{},Menu:{},desktopCapturer:{getSources:async()=>[source]},ipcMain,session:{},shell:{},clipboard:{}};
let holdResolver=false;const children=[];
const spawn=()=>{
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.killed=false;child.kill=()=>{child.killed=true;child.emit('close',1);return true;};children.push(child);
  if(!holdResolver)queueMicrotask(()=>{child.stdout.emit('data','1234\n');child.emit('close',0);});return child;
};
const electronDir=path.join(__dirname,'..','electron');
const sourceCode=fs.readFileSync(path.join(electronDir,'main.cjs'),'utf8');
const customRequire=name=>{
  if(name==='electron')return electron;
  if(name==='loopback-capture')return {LoopbackCapture:FakeCapture};
  if(name==='electron-updater')return {autoUpdater:{}};
  if(name==='node:child_process')return {spawn};
  if(name==='./dev-tools.cjs')return null;
  if(name==='./trusted-origin.cjs')return require(path.join(electronDir,'trusted-origin.cjs'));
  return require(name);
};
vm.runInNewContext(sourceCode,{require:customRequire,__dirname:electronDir,process,console,URL,Uint8Array,setTimeout,clearTimeout,queueMicrotask});
const sender={id:7,isDestroyed:()=>false,send:(...args)=>sent.push(args)};
const event={sender,senderFrame:{url:pathToFileURL(path.join(electronDir,'..','renderer','index.html')).href}};
const tokenA='00000000-0000-4000-8000-000000000001',tokenB='00000000-0000-4000-8000-000000000002';

(async()=>{
  await handlers.get('foco:list-sources')(event);
  assert.equal(await handlers.get('foco:resolve-process')(event,source.id),1234);
  await handlers.get('foco:start-audio')(event,1234,tokenA);
  assert.equal(captures[0].pid,1234);
  captures[0].callback(Buffer.from([1,2]));assert.equal(sent.length,1);
  await handlers.get('foco:start-audio')(event,1234,tokenB);
  assert.equal(captures[0].stops,1,'replacement stops previous capture');
  captures[0].callback(Buffer.from([3,4]));assert.equal(sent.length,1,'late native chunks are ignored');
  await handlers.get('foco:stop-audio')(event,tokenA);
  assert.equal(captures[1].stops,0,'old cleanup preserves new capture');
  await handlers.get('foco:stop-audio')({...event,sender:{...sender,id:8}},tokenB);
  assert.equal(captures[1].stops,0,'another renderer cannot stop capture');
  await handlers.get('foco:stop-audio')(event,tokenB);
  await handlers.get('foco:stop-audio')(event,tokenB);
  assert.equal(captures[1].stops,1,'duplicate cleanup stops once');
  FakeCapture.failStart=true;
  await assert.rejects(handlers.get('foco:start-audio')(event,1234,tokenA),/native start failed/);
  assert.equal(captures[2].stops,1,'failed native start releases partial capture');
  FakeCapture.failStart=false;
  await handlers.get('foco:start-audio')(event,1234,tokenB);
  appEvents.get('before-quit')();
  assert.equal(captures[3].stops,1,'app quit stops capture');
  holdResolver=true;
  const pending=handlers.get('foco:resolve-process')(event,source.id);
  appEvents.get('before-quit')();
  await assert.rejects(pending);
  assert(children.at(-1).killed,'app quit kills only its pending resolver child');
  console.log('PASS audio IPC ownership, late callback, duplicate stop, failed start, app quit and resolver cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
