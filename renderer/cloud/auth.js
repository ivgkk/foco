import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser, onAuthStateChanged } from 'firebase/auth';
import { ref, get, set, update, remove, runTransaction } from 'firebase/database';

export function createAuthClient(ctx) {
const { normalizeUsername, requireReady, requireUser, profilePath } = ctx;
function safeProfile(data={}){return {username:String(data.username||''),nickname:String(data.nickname||data.username||'Jogador').slice(0,24),status:String(data.status||'Disponível').slice(0,48),color:/^#[0-9a-f]{6}$/i.test(data.color||'')?data.color:'#9b83ff',photo:String(data.photo||''),showActivity:data.showActivity!==false,activity:String(data.activity||'').slice(0,80)};}
async function register({email,password,username,nickname}){
  requireReady();const uname=normalizeUsername(username);
  if(!/^[a-z0-9._]{3,24}$/.test(uname))throw new Error('O username deve ter de 3 a 24 caracteres: letras, números, ponto ou sublinhado.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim()))throw new Error('Digite um endereço de email válido.');
  if(String(password||'').length<8)throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  await ctx.persistenceReady;const credential=await createUserWithEmailAndPassword(ctx.auth,String(email).trim(),password),user=credential.user;let usernameClaimed=false;
  try{
    const claim=await runTransaction(ref(ctx.db,`usernames/${uname}`),current=>current===null?{uid:user.uid,username:uname}:undefined);
    if(!claim.committed)throw new Error('Esse username já está em uso.');usernameClaimed=true;
    await set(profilePath(user.uid),{...safeProfile({username:uname,nickname:nickname||uname}),email:user.email,createdAt:Date.now(),updatedAt:Date.now()});
  }catch(error){try{if(usernameClaimed)await remove(ref(ctx.db,`usernames/${uname}`));await deleteUser(user);}catch(cleanupError){console.warn('Falha na limpeza de cadastro incompleto:',cleanupError);}throw error;}
  return user;
}
async function login(email,password){requireReady();await ctx.persistenceReady;return (await signInWithEmailAndPassword(ctx.auth,String(email).trim(),password)).user;}
async function logout(){requireReady();return signOut(ctx.auth);}
function observeAuth(callback){requireReady();return onAuthStateChanged(ctx.auth,callback);}
async function getProfile(uid=requireUser().uid){requireReady();const snap=await get(profilePath(uid));return snap.exists()?safeProfile(snap.val()):null;}
async function saveProfile(values){const user=requireUser();const current=await getProfile(user.uid);if(!current)throw new Error('Perfil não encontrado.');const next=safeProfile({...current,...values,username:current.username});await update(profilePath(user.uid),{...next,updatedAt:Date.now()});return next;}
function getCurrentUser(){requireReady();return ctx.auth?.currentUser||null;}
return { register, login, logout, observeAuth, getProfile, saveProfile, getCurrentUser };
}
