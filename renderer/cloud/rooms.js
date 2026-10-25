import { ref, get, set, update, remove, runTransaction, onValue, onDisconnect } from 'firebase/database';

export function createRoomsClient(ctx) {
const { cleanCode, requireUser, roomPath, memberPath, seatPath, inRoomOrder, sameFirebaseUser } = ctx;
async function findUserSeat(code,uid){const snap=await get(ref(ctx.db,`roomSeats/${cleanCode(code)}`));if(!snap.exists())return 0;for(const [slot,owner] of Object.entries(snap.val()))if(owner===uid)return Number(slot)||0;return 0;}
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
function joinRoom(code,profile,peerId){const uid=requireUser().uid;return inRoomOrder(code,uid,()=>joinRoomNow(code,profile,peerId,uid));}
async function joinRoomNow(code,profile,peerId,uid){
  const user=requireUser();if(user.uid!==uid)throw new Error('Sessão alterada durante a entrada na sala.');
  const normalized=cleanCode(code),target=roomPath(normalized),roomSnap=await get(target);
  if(!sameFirebaseUser(uid))throw new Error('Sessão alterada durante a entrada na sala.');
  if(!roomSnap.exists()||roomSnap.val()?.deleted)throw new Error('Sala não encontrada ou excluída. Confira o código.');
  const room=roomSnap.val(),ban=await get(ref(ctx.db,`roomBans/${normalized}/${user.uid}`));if(!sameFirebaseUser(uid))throw new Error('Sessão alterada durante a entrada na sala.');if(ban.exists())throw new Error('Você não pode entrar nesta sala.');
  const member=memberPath(normalized,user.uid),existingSnap=await get(member),existing=existingSnap.exists()?existingSnap.val():null;
  if(!sameFirebaseUser(uid))throw new Error('Sessão alterada durante a entrada na sala.');
  const role=user.uid===room.ownerUid?'owner':(existing?.role||'member');
  let seat=await findUserSeat(normalized,user.uid);
  if(!seat){for(let slot=1;slot<=50;slot++){if(!sameFirebaseUser(uid))throw new Error('Sessão alterada durante a entrada na sala.');const reservation=await runTransaction(seatPath(normalized,slot),current=>current===null?user.uid:undefined);if(reservation.committed&&reservation.snapshot.val()===user.uid){seat=slot;break;}}}
  if(!seat)throw new Error('Esta sala atingiu o limite de 50 pessoas.');
  const seatRef=seatPath(normalized,seat),canStream=existing?.canStream!==false;
  try{if(!sameFirebaseUser(uid))throw new Error('Sessão alterada durante a entrada na sala.');await onDisconnect(seatRef).remove();await onDisconnect(member).remove();if(!sameFirebaseUser(uid))throw new Error('Sessão alterada durante a entrada na sala.');await set(member,profileForRoom(profile,user.uid,peerId,role,canStream));if(!sameFirebaseUser(uid))throw new Error('Sessão alterada durante a entrada na sala.');await set(ref(ctx.db,`userRooms/${user.uid}/${normalized}`),{code:normalized,name:room.name,ownerUid:room.ownerUid,joinedAt:Date.now()});}
  catch(error){if(!sameFirebaseUser(uid)){console.warn('A conta mudou durante a entrada; preservando limpeza onDisconnect da conta anterior.');throw error;}try{await onDisconnect(seatRef).cancel();}catch{}try{await onDisconnect(member).cancel();}catch{}try{await remove(member);}catch{}try{await remove(seatRef);}catch(cleanupError){console.warn('Não foi possível liberar a vaga após erro:',cleanupError);}if(error?.code==='PERMISSION_DENIED'||String(error?.message).includes('PERMISSION_DENIED'))throw new Error('Não foi possível entrar. Confira as regras atualizadas do Firebase e se a sala ainda tem vaga (máximo 50 pessoas).');throw error;}
  return {...room,id:normalized,host:user.uid===room.ownerUid,canStream,role};
}
async function watchMemberList(code,callback,onError){const unsubscribe=onValue(ref(ctx.db,`roomMembers/${cleanCode(code)}`),snap=>callback(snap.exists()?snap.val():{}),error=>{console.error('Lista de participantes:',error);onError?.(error);});return unsubscribe;}
// Check the current Firebase record before a PeerJS operation can grant media access.
// The renderer must also recheck its room and PeerJS generation after this async read.
async function verifyRoomPeer(code,uid,peerId){
  requireUser();
  const normalized=cleanCode(code);
  if(!normalized||typeof uid!=='string'||!uid||typeof peerId!=='string'||!peerId)return null;
  const room=await get(roomPath(normalized));
  if(!room.exists()||room.val()?.deleted)return null;
  const member=await get(memberPath(normalized,uid));
  if(!member.exists())return null;
  const value=member.val();
  return value?.uid===uid&&value.peerId===peerId&&value.online===true?{uid,peerId,canStream:value.canStream!==false}:null;
}
async function watchRoom(code,callback){return onValue(roomPath(code),snap=>callback(snap.exists()?{...snap.val(),id:cleanCode(code)}:null),error=>console.error('Sala:',error));}
async function watchUserRooms(callback,onError){const user=requireUser();let version=0,active=true;const unsubscribe=onValue(ref(ctx.db,`userRooms/${user.uid}`),async snap=>{const current=++version,entries=snap.exists()?Object.values(snap.val()).filter(Boolean):[];const visible=[];for(const entry of entries){try{const room=await get(roomPath(entry.code));if(room.exists()&&!room.val()?.deleted)visible.push({...entry,...room.val()});}catch(error){if(!active||current!==version||!sameFirebaseUser(user.uid))return;version++;console.warn('Não foi possível atualizar uma sala:',error);onError?.(error);return;}if(!active||current!==version||!sameFirebaseUser(user.uid))return;}if(active&&current===version&&sameFirebaseUser(user.uid))callback(visible);},error=>{if(active&&sameFirebaseUser(user.uid)){version++;console.error('Suas salas:',error);onError?.(error);}});return()=>{active=false;version++;unsubscribe();};}
function updateRoomMember(code,values,expectedPeerId){const uid=requireUser().uid;return inRoomOrder(code,uid,async()=>{if(!sameFirebaseUser(uid))return false;const target=memberPath(code,uid),snap=await get(target);if(!snap.exists())throw new Error('Você não está nesta sala.');if(!sameFirebaseUser(uid))return false;if(expectedPeerId){if(snap.val()?.peerId!==expectedPeerId)return false;const result=await runTransaction(target,current=>current?.peerId===expectedPeerId?{...current,...values,lastSeen:Date.now()}:undefined);return result.committed;}await update(target,{...values,lastSeen:Date.now()});return true;});}
function exitRoom(code,expectedPeerId){const uid=requireUser().uid;return inRoomOrder(code,uid,()=>exitRoomNow(code,uid,expectedPeerId));}
async function exitRoomNow(code,uid,expectedPeerId){
  if(!sameFirebaseUser(uid))return false;
  const member=memberPath(code,uid),slot=await findUserSeat(code,uid),seat=slot?seatPath(code,slot):null;
  if(!sameFirebaseUser(uid))return false;
  if(expectedPeerId){const result=await runTransaction(member,current=>current?.peerId===expectedPeerId?null:undefined);if(!result.committed)return false;}
  else await remove(member);
  try{await onDisconnect(member).cancel();if(seat)await onDisconnect(seat).cancel();}catch{}
  if(seat&&sameFirebaseUser(uid))await remove(seat);
  return true;
}
async function markRoomDeleted(code){const user=requireUser();const room=await get(roomPath(code));if(!room.exists()||room.val().ownerUid!==user.uid)throw new Error('Somente o dono pode excluir esta sala.');await update(roomPath(code),{deleted:true,deletedAt:Date.now()});}
async function setMemberRole(code,uid,role){const user=requireUser(),room=await get(roomPath(code));if(!room.exists()||room.val().ownerUid!==user.uid)throw new Error('Somente o dono pode alterar cargos.');await update(memberPath(code,uid),{role});}
async function removeMember(code,uid){const user=requireUser(),room=await get(roomPath(code));if(!room.exists())throw new Error('Sala não encontrada.');const my=await get(memberPath(code,user.uid));if(room.val().ownerUid!==user.uid&&my.val()?.role!=='moderator')throw new Error('Você não tem permissão para moderar.');if(uid===room.val().ownerUid)throw new Error('Transfira a propriedade antes de remover o dono.');await set(ref(ctx.db,`roomBans/${cleanCode(code)}/${uid}`),true);await remove(memberPath(code,uid));const slot=await findUserSeat(code,uid);if(slot)await remove(seatPath(code,slot));}
async function transferRoom(code,uid){const user=requireUser(),room=await get(roomPath(code));if(!room.exists()||room.val().ownerUid!==user.uid)throw new Error('Somente o dono pode transferir a sala.');await update(roomPath(code),{ownerUid:uid,updatedAt:Date.now()});await update(ref(ctx.db),{[`roomMembers/${cleanCode(code)}/${user.uid}/role`]:'moderator',[`roomMembers/${cleanCode(code)}/${uid}/role`]:'owner'});}
async function setStreamPermission(code,uid,allowed){const user=requireUser(),room=await get(roomPath(code)),me=await get(memberPath(code,user.uid));if(!room.exists()||room.val().ownerUid!==user.uid&&me.val()?.role!=='moderator')throw new Error('Você não tem permissão para alterar transmissões.');await update(memberPath(code,uid),{canStream:Boolean(allowed)});}
async function syncProfileToRooms(profile){const user=requireUser(),rooms=await get(ref(ctx.db,`userRooms/${user.uid}`));if(!rooms.exists())return;const updates={};for(const item of Object.values(rooms.val())){const member=(await get(memberPath(item.code,user.uid))).val();if(!member)continue;for(const key of ['username','nickname','status','color','photo','showActivity','activity'])updates[`roomMembers/${item.code}/${user.uid}/${key}`]=key==='activity'&&!profile.showActivity?'':profile[key];}if(Object.keys(updates).length)await update(ref(ctx.db),updates);}
return { makeRoom, findRoom, joinRoom, watchMemberList, verifyRoomPeer, watchRoom,
  watchUserRooms, updateRoomMember, exitRoom, markRoomDeleted, setMemberRole,
  removeMember, transferRoom, setStreamPermission, syncProfileToRooms };
}
