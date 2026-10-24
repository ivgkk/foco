import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, setPersistence, indexedDBLocalPersistence, browserLocalPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, get, set, update, remove, push, query, orderByChild, endAt, limitToFirst, limitToLast, runTransaction, onValue, onDisconnect } from 'firebase/database';

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
async function findUserSeat(code,uid){const snap=await get(ref(db,`roomSeats/${cleanCode(code)}`));if(!snap.exists())return 0;for(const [slot,owner] of Object.entries(snap.val()))if(owner===uid)return Number(slot)||0;return 0;}
function safeProfile(data={}){return {username:String(data.username||''),nickname:String(data.nickname||data.username||'Jogador').slice(0,24),status:String(data.status||'Disponível').slice(0,48),color:/^#[0-9a-f]{6}$/i.test(data.color||'')?data.color:'#9b83ff',photo:String(data.photo||''),showActivity:data.showActivity!==false,activity:String(data.activity||'').slice(0,80)};}
async function register({email,password,username,nickname}){
  requireReady();const uname=normalizeUsername(username);
  if(!/^[a-z0-9._]{3,24}$/.test(uname))throw new Error('O username deve ter de 3 a 24 caracteres: letras, números, ponto ou sublinhado.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim()))throw new Error('Digite um endereço de email válido.');
  if(String(password||'').length<8)throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  await persistenceReady;const credential=await createUserWithEmailAndPassword(auth,String(email).trim(),password),user=credential.user;let usernameClaimed=false;
  try{
    const claim=await runTransaction(ref(db,`usernames/${uname}`),current=>current===null?{uid:user.uid,username:uname}:undefined);
    if(!claim.committed)throw new Error('Esse username já está em uso.');usernameClaimed=true;
    await set(profilePath(user.uid),{...safeProfile({username:uname,nickname:nickname||uname}),email:user.email,createdAt:Date.now(),updatedAt:Date.now()});
  }catch(error){try{if(usernameClaimed)await remove(ref(db,`usernames/${uname}`));await deleteUser(user);}catch(cleanupError){console.warn('Falha na limpeza de cadastro incompleto:',cleanupError);}throw error;}
  return user;
}
async function login(email,password){requireReady();await persistenceReady;return (await signInWithEmailAndPassword(auth,String(email).trim(),password)).user;}
async function logout(){requireReady();return signOut(auth);}
function observeAuth(callback){requireReady();return onAuthStateChanged(auth,callback);}
async function getProfile(uid=requireUser().uid){requireReady();const snap=await get(profilePath(uid));return snap.exists()?safeProfile(snap.val()):null;}
async function saveProfile(values){const user=requireUser();const current=await getProfile(user.uid);if(!current)throw new Error('Perfil não encontrado.');const next=safeProfile({...current,...values,username:current.username});await update(profilePath(user.uid),{...next,updatedAt:Date.now()});return next;}
function profileForRoom(profile,uid,peerId,role='member',canStream=true){return {uid,peerId,username:profile.username,nickname:profile.nickname,status:profile.status,color:profile.color,photo:profile.photo,showActivity:profile.showActivity,activity:profile.showActivity?profile.activity:'',role,canStream,online:true,lastSeen:Date.now(),streaming:false};}
async function makeRoom(name){
  const user=requireUser();const normalized=String(name||'').trim().slice(0,32);if(!normalized)throw new Error('Digite um nome para a sala.');
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt=0;attempt<8;attempt++){
    const bytes=crypto.getRandomValues(new Uint8Array(8)),code=Array.from(bytes,b=>alphabet[b%alphabet.length]).join(''),target=roomPath(code);
    const tx=await runTransaction(target,old=>old===null?{code,name:normalized,ownerUid:user.uid,createdAt:Date.now(),updatedAt:Date.now(),maxMembers:50,deleted:false}:undefined);
    if(!tx.committed)continue;
    return {...tx.snapshot.val(),id:code,host:true};
  }
  throw new Error('Não consegui gerar um código único. Tente novamente.');
}
async function findRoom(code){const normalized=cleanCode(code);if(normalized.length<6)throw new Error('Digite um código válido.');const snap=await get(roomPath(normalized));if(!snap.exists()||snap.val()?.deleted)throw new Error('Sala não encontrada ou excluída. Confira o código.');return {...snap.val(),id:normalized,host:false};}
async function joinRoom(code,profile,peerId){
  const user=requireUser(),normalized=cleanCode(code),target=roomPath(normalized),roomSnap=await get(target);
  if(!roomSnap.exists()||roomSnap.val()?.deleted)throw new Error('Sala não encontrada ou excluída. Confira o código.');
  const room=roomSnap.val(),ban=await get(ref(db,`roomBans/${normalized}/${user.uid}`));if(ban.exists())throw new Error('Você não pode entrar nesta sala.');
  const member=memberPath(normalized,user.uid),existingSnap=await get(member),existing=existingSnap.exists()?existingSnap.val():null;
  const role=user.uid===room.ownerUid?'owner':(existing?.role||'member');
  let seat=await findUserSeat(normalized,user.uid);
  if(!seat){for(let slot=1;slot<=50;slot++){const reservation=await runTransaction(seatPath(normalized,slot),current=>current===null?user.uid:undefined);if(reservation.committed&&reservation.snapshot.val()===user.uid){seat=slot;break;}}}
  if(!seat)throw new Error('Esta sala atingiu o limite de 50 pessoas.');
  const seatRef=seatPath(normalized,seat),canStream=existing?.canStream!==false;
  try{await onDisconnect(seatRef).remove();await onDisconnect(member).remove();await set(member,profileForRoom(profile,user.uid,peerId,role,canStream));await set(ref(db,`userRooms/${user.uid}/${normalized}`),{code:normalized,name:room.name,ownerUid:room.ownerUid,joinedAt:Date.now()});}
  catch(error){try{await onDisconnect(seatRef).cancel();}catch{}try{await onDisconnect(member).cancel();}catch{}try{await remove(member);}catch{}try{await remove(seatRef);}catch(cleanupError){console.warn('Não foi possível liberar a vaga após erro:',cleanupError);}if(error?.code==='PERMISSION_DENIED'||String(error?.message).includes('PERMISSION_DENIED'))throw new Error('Não foi possível entrar. Confira as regras atualizadas do Firebase e se a sala ainda tem vaga (máximo 50 pessoas).');throw error;}
  return {...room,id:normalized,host:user.uid===room.ownerUid,canStream,role};
}
async function watchMemberList(code,callback){const unsubscribe=onValue(ref(db,`roomMembers/${cleanCode(code)}`),snap=>callback(snap.exists()?snap.val():{}),error=>console.error('Lista de participantes:',error));return unsubscribe;}
async function watchRoomChat(code,callback){const user=requireUser(),normalized=cleanCode(code),membership=await get(memberPath(normalized,user.uid));if(!membership.exists())throw new Error('Você não está nesta sala.');const chatRef=ref(db,`roomChats/${normalized}`),retention=30*24*60*60*1000;try{const stale=await get(query(chatRef,orderByChild('createdAt'),endAt(Date.now()-retention),limitToFirst(100)));if(stale.exists()){const deletions={};for(const id of Object.keys(stale.val()))deletions[`roomChats/${normalized}/${id}`]=null;await update(ref(db),deletions);}}catch(error){console.warn('Limpeza de mensagens antigas:',error);}const messages=query(chatRef,orderByChild('createdAt'),limitToLast(50));return onValue(messages,snap=>{const items=snap.exists()?Object.entries(snap.val()).map(([id,value])=>({id,...value})):[];callback(items.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id)));},error=>console.error('Chat da sala:',error));}
async function sendRoomChat(code,message){const user=requireUser(),normalized=cleanCode(code),membership=await get(memberPath(normalized,user.uid));if(!membership.exists())throw new Error('Você não está nesta sala.');const member=membership.val(),target=push(ref(db,`roomChats/${normalized}`)),photo=String(message.photo||'');const safe={uid:user.uid,nickname:String(member.nickname||member.username||'Jogador').slice(0,24),color:/^#[0-9a-f]{6}$/i.test(member.color||'')?member.color:'#9b83ff',photo:/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/i.test(photo)&&photo.length<=16000?photo:'',kind:message.kind==='gif'?'gif':message.kind==='image'?'image':'text',text:String(message.text||'').slice(0,1200),media:String(message.media||''),createdAt:Date.now()};await set(target,safe);return target.key;}
async function deleteRoomChatMessage(code,messageId){const user=requireUser(),target=ref(db,`roomChats/${cleanCode(code)}/${messageId}`),snap=await get(target);if(!snap.exists())return;if(snap.val().uid!==user.uid)throw new Error('Você só pode excluir suas próprias mensagens.');await remove(target);}
async function watchRoom(code,callback){return onValue(roomPath(code),snap=>callback(snap.exists()?{...snap.val(),id:cleanCode(code)}:null),error=>console.error('Sala:',error));}
async function watchUserRooms(callback){const user=requireUser();return onValue(ref(db,`userRooms/${user.uid}`),async snap=>{const entries=snap.exists()?Object.values(snap.val()).filter(Boolean):[];const visible=[];for(const entry of entries){try{const room=await get(roomPath(entry.code));if(room.exists()&&!room.val()?.deleted)visible.push({...entry,...room.val()});}catch(error){console.warn('Não foi possível atualizar uma sala:',error);visible.push(entry);}}callback(visible);},error=>console.error('Suas salas:',error));}
async function updateRoomMember(code,values){const user=requireUser();const target=memberPath(code,user.uid);const snap=await get(target);if(!snap.exists())throw new Error('Você não está nesta sala.');await update(target,{...values,lastSeen:Date.now()});}
async function exitRoom(code){const user=requireUser(),member=memberPath(code,user.uid),slot=await findUserSeat(code,user.uid),seat=slot?seatPath(code,slot):null;try{await onDisconnect(member).cancel();if(seat)await onDisconnect(seat).cancel();}catch{}await remove(member);if(seat)await remove(seat);}
async function markRoomDeleted(code){const user=requireUser();const room=await get(roomPath(code));if(!room.exists()||room.val().ownerUid!==user.uid)throw new Error('Somente o dono pode excluir esta sala.');await update(roomPath(code),{deleted:true,deletedAt:Date.now()});}
async function setMemberRole(code,uid,role){const user=requireUser(),room=await get(roomPath(code));if(!room.exists()||room.val().ownerUid!==user.uid)throw new Error('Somente o dono pode alterar cargos.');await update(memberPath(code,uid),{role});}
async function removeMember(code,uid){const user=requireUser(),room=await get(roomPath(code));if(!room.exists())throw new Error('Sala não encontrada.');const my=await get(memberPath(code,user.uid));if(room.val().ownerUid!==user.uid&&my.val()?.role!=='moderator')throw new Error('Você não tem permissão para moderar.');if(uid===room.val().ownerUid)throw new Error('Transfira a propriedade antes de remover o dono.');await set(ref(db,`roomBans/${cleanCode(code)}/${uid}`),true);await remove(memberPath(code,uid));const slot=await findUserSeat(code,uid);if(slot)await remove(seatPath(code,slot));}
async function transferRoom(code,uid){const user=requireUser(),room=await get(roomPath(code));if(!room.exists()||room.val().ownerUid!==user.uid)throw new Error('Somente o dono pode transferir a sala.');await update(roomPath(code),{ownerUid:uid,updatedAt:Date.now()});await update(ref(db),{[`roomMembers/${cleanCode(code)}/${user.uid}/role`]:'moderator',[`roomMembers/${cleanCode(code)}/${uid}/role`]:'owner'});}
async function setStreamPermission(code,uid,allowed){const user=requireUser(),room=await get(roomPath(code)),me=await get(memberPath(code,user.uid));if(!room.exists()||room.val().ownerUid!==user.uid&&me.val()?.role!=='moderator')throw new Error('Você não tem permissão para alterar transmissões.');await update(memberPath(code,uid),{canStream:Boolean(allowed)});}
async function syncProfileToRooms(profile){const user=requireUser(),rooms=await get(ref(db,`userRooms/${user.uid}`));if(!rooms.exists())return;const updates={};for(const item of Object.values(rooms.val())){const member=(await get(memberPath(item.code,user.uid))).val();if(!member)continue;for(const key of ['username','nickname','status','color','photo','showActivity','activity'])updates[`roomMembers/${item.code}/${user.uid}/${key}`]=key==='activity'&&!profile.showActivity?'':profile[key];}if(Object.keys(updates).length)await update(ref(db),updates);}
function getCurrentUser(){requireReady();return auth?.currentUser||null;}
window.focoCloud={configure,resetConfig,isConfigured:()=>configured,auth,onAuthChanged:observeAuth,register,login,logout,getProfile,saveProfile,makeRoom,findRoom,joinRoom,watchMemberList,watchRoom,watchRoomChat,sendRoomChat,deleteRoomChatMessage,watchUserRooms,updateRoomMember,exitRoom,markRoomDeleted,setMemberRole,removeMember,transferRoom,setStreamPermission,syncProfileToRooms,getCurrentUser,cleanCode};
