import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, setPersistence, indexedDBLocalPersistence, browserLocalPersistence, signOut } from 'firebase/auth';
import { getDatabase, ref } from 'firebase/database';

export function createCloudContext() {
let app=null,auth=null,db=null,configured=false,persistenceReady=Promise.resolve();
const configKey='foco.firebase.config';
const defaultConfig={apiKey:'AIzaSyDTZTuCYZBWjzQG6hQObowyHcfbs8QD6t8',authDomain:'foco-d32ea.firebaseapp.com',databaseURL:'https://foco-d32ea-default-rtdb.firebaseio.com',projectId:'foco-d32ea',appId:'1:101460499598:web:3b6a56b7d12bf64c81bddf'};
const cleanCode=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10);
function normalizeUsername(value){return String(value||'').trim().toLowerCase();}
function validateConfig(c){return c&&typeof c.apiKey==='string'&&c.apiKey.length>10&&typeof c.projectId==='string'&&c.projectId.length>2&&typeof c.appId==='string'&&c.appId.length>5&&typeof c.databaseURL==='string'&&c.databaseURL.startsWith('https://')&&typeof c.authDomain==='string';}
function init(config){
  if(!validateConfig(config))throw new Error('Configuração do Firebase incompleta.');
  app=getApps().find(x=>x.name==='foco')||initializeApp(config,'foco');auth=getAuth(app);db=getDatabase(app);
  configured=true;persistenceReady=setPersistence(auth,indexedDBLocalPersistence).catch(error=>{console.warn('Persistência de sessão por IndexedDB:',error);return setPersistence(auth,browserLocalPersistence).catch(fallback=>console.warn('Persistência de sessão local:',fallback));});
  return true;
}
async function configure(config){if(!validateConfig(config))throw new Error('Preencha os dados do projeto Firebase.');localStorage.setItem(configKey,JSON.stringify(config));if(app){await deleteApp(app);app=null;auth=null;db=null;configured=false;}return init(config);}
async function resetConfig(){if(auth?.currentUser)await signOut(auth);if(app)await deleteApp(app);app=null;auth=null;db=null;configured=false;persistenceReady=Promise.resolve();localStorage.removeItem(configKey);}
function tryStoredConfig(){try{init(defaultConfig);}catch(error){console.error('Configuração padrão do Firebase inválida:',error);}}
tryStoredConfig();
function requireReady(){if(!configured||!auth||!db)throw new Error('O serviço online ainda não foi configurado.');}
function requireUser(){requireReady();if(!auth.currentUser)throw new Error('Entre na sua conta primeiro.');return auth.currentUser;}
function profilePath(uid){return ref(db,`profiles/${uid}`);}
function roomPath(code){return ref(db,`rooms/${cleanCode(code)}`);}
function memberPath(code,uid){return ref(db,`roomMembers/${cleanCode(code)}/${uid}`);}
function seatPath(code,slot){return ref(db,`roomSeats/${cleanCode(code)}/${slot}`);}
// A seat belongs to a UID, not a PeerJS attempt. Serialize this client's operations on
// the same room so an old exit cannot remove a newer join by this process.
const roomOperationQueues=new Map();
function inRoomOrder(code,uid,operation){
  const key=`${uid}:${cleanCode(code)}`,previous=roomOperationQueues.get(key)||Promise.resolve();
  const current=previous.catch(()=>{}).then(operation);
  roomOperationQueues.set(key,current);
  current.then(()=>{if(roomOperationQueues.get(key)===current)roomOperationQueues.delete(key);},()=>{if(roomOperationQueues.get(key)===current)roomOperationQueues.delete(key);});
  return current;
}
function sameFirebaseUser(uid){return auth?.currentUser?.uid===uid;}
return {
  get auth(){ return auth; }, get db(){ return db; },
  get configured(){ return configured; }, get persistenceReady(){ return persistenceReady; },
  configure, resetConfig, cleanCode, normalizeUsername, requireReady, requireUser,
  profilePath, roomPath, memberPath, seatPath, inRoomOrder, sameFirebaseUser
};
}
