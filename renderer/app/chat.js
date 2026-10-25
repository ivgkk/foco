export function createChat(ports) {
  const { state, $, document, tr, esc, icon, isPanelOpen, avatarColor, cloud } = ports;
function latestMessageAt(messages){return (messages||[]).reduce((latest,message)=>Math.max(latest,Number(message.createdAt)||0),0);}
function chatAtBottom(){const root=$('#chatMessages');return root.scrollHeight-root.scrollTop-root.clientHeight<48;}
function chatVisible(){return Boolean(state.activeRoom)&&isPanelOpen()&&state.panelTab==='chat'&&!$('#chatPane').hidden;}
function updateChatUnread(){
  const messages=state.chatMessages||[];
  if(state.chatLoaded&&chatVisible()&&chatAtBottom()){
    for(const message of messages)state.chatSeenIds.add(message.id);
    state.chatSeenAt=latestMessageAt(messages);
  }
  const unread=state.chatLoaded?messages.filter(message=>message.uid!==state.user?.uid&&!state.chatSeenIds.has(message.id)).length:0;
  const badge=$('#chatUnread');badge.hidden=!unread;badge.textContent=unread>9?'9+':String(unread);
  $('#panelUnread').hidden=!unread||isPanelOpen();
  const jump=$('#chatJump');jump.hidden=!unread||!chatVisible()||chatAtBottom();$('#chatJumpCount').textContent=unread>9?'9+':String(unread);
  const announcement=unread&&chatVisible()&&!chatAtBottom()?tr('Novas mensagens recebidas.'):'';if($('#chatAnnouncement').textContent!==announcement)$('#chatAnnouncement').textContent=announcement;
}
function updateChatControls(){const enabled=Boolean(state.roomConnected&&state.user&&!state.chatSending);$('#chatInput').disabled=!enabled;$('#chatAttachButton').disabled=!enabled;$('#chatEmojiButton').disabled=!enabled;$('#chatSendButton').disabled=!enabled||(!$('#chatInput').value.trim()&&!state.chatMedia);$('#chatSendButton').setAttribute('aria-busy',String(state.chatSending));}
function chatTextHtml(value){return String(value||'').split(/(https:\/\/[^\s<>"']+)/g).map(part=>part.startsWith('https://')?`<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`:esc(part)).join('').replace(/\n/g,'<br>');}
function chatMessageNode(message,grouped){
  const own=message.uid===state.user?.uid,color=/^#[0-9a-f]{6}$/i.test(message.color||'')?message.color:'#9b83ff',name=message.nickname||'Jogador',photo=/^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(message.photo||'')?message.photo:'',initial=esc(name.trim().slice(0,1).toUpperCase());
  const rawTime=Number(message.createdAt),date=new Date(Number.isFinite(rawTime)&&rawTime>0&&rawTime<=8.64e15?rawTime:Date.now()),time=date.toLocaleTimeString(window.focoI18n?.locale()||'pt-BR',{hour:'2-digit',minute:'2-digit'}),fullTime=date.toLocaleString(window.focoI18n?.locale()||'pt-BR');
  const validMedia=/^data:image\/(?:webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(message.media||'');
  const avatar=photo?`<img class="chat-message-avatar" src="${esc(photo)}" alt="" loading="lazy">`:`<span class="chat-message-avatar chat-message-avatar-fallback" style="--message-accent:${esc(color)}">${initial}</span>`;
  const media=validMedia?`<button class="chat-media-thumb" type="button" data-chat-media="${esc(message.id)}" aria-label="${tr(message.kind==='gif'?'GIF animado':'Imagem')}"><img loading="lazy" src="${esc(message.media)}" alt="${tr(message.kind==='gif'?'GIF animado':'Imagem enviada')}">${message.kind==='gif'?'<span class="chat-gif-badge">GIF</span>':''}</button>`:'';
  const wrapper=document.createElement('div');wrapper.innerHTML=`<article class="chat-message ${own?'own':''} ${grouped?'grouped':''}" data-chat-id="${esc(message.id)}"><div class="chat-message-rail">${grouped?'':avatar}</div><div class="chat-message-body">${grouped?'':`<div class="chat-message-top"><strong style="--message-accent:${esc(color)}" data-no-translate>${esc(name)}</strong><time datetime="${date.toISOString()}" title="${esc(fullTime)}">${esc(time)}</time></div>`}${message.text?`<div class="chat-message-text">${chatTextHtml(message.text)}</div>`:''}${media}${message.kind!=='text'&&!validMedia?'<div class="chat-message-text">Anexo indisponível.</div>':''}</div>${own?`<button type="button" class="chat-delete" data-chat-delete="${esc(message.id)}" title="${tr('Remover mensagem')}" aria-label="${tr('Remover mensagem')}">${icon('x','icon-sm')}</button>`:''}</article>`;
  return wrapper.firstElementChild;
}
function renderRoomChat(){
  const root=$('#chatMessages');if(!root)return;
  $('#chatLoadStatus').hidden=!state.chatError;$('#chatLoadStatus').innerHTML=state.chatError?`<span>${tr('Não foi possível atualizar o chat.')}</span><button type="button" data-retry-chat${state.chatRetrying?' disabled':''}>${tr(state.chatRetrying?'Atualizando…':'Tentar novamente')}</button>`:'';
  if(!state.activeRoom){root.removeAttribute('aria-busy');root.innerHTML='<div class="chat-empty">Entre em uma sala para ver as mensagens.</div>';updateChatControls();updateChatUnread();return;}
  if(!state.chatLoaded){
    if(state.chatError){root.removeAttribute('aria-busy');root.replaceChildren();updateChatControls();return;}
    root.setAttribute('aria-busy','true');
    if(!root.querySelector('.chat-skeleton'))root.innerHTML='<div class="chat-skeleton skeleton-group" aria-hidden="true">'+[70,52,84].map(width=>`<div class="chat-skeleton-row"><span class="skeleton"></span><span><span class="skeleton skeleton-line" style="width:${width-40}%"></span><span class="skeleton skeleton-line" style="width:${width}%"></span></span></div>`).join('')+'</div><span class="sr-only">Carregando mensagens…</span>';
    updateChatControls();return;
  }
  root.removeAttribute('aria-busy');
  const items=state.chatMessages||[];if(!items.length){if(!root.querySelector('.chat-empty'))root.innerHTML='<div class="chat-empty">Nenhuma mensagem ainda.</div>';updateChatControls();updateChatUnread();return;}
  const pinned=chatAtBottom()||state.chatForceBottom,rootTop=root.getBoundingClientRect().top,anchor=!pinned?[...root.querySelectorAll('[data-chat-id]')].find(node=>node.getBoundingClientRect().bottom>rootTop+2):null,anchorId=anchor?.dataset.chatId,anchorOffset=anchor?.getBoundingClientRect().top-rootTop;
  let timeline=root.querySelector('.chat-timeline');if(!timeline){timeline=document.createElement('div');timeline.className='chat-timeline';root.replaceChildren(timeline);}
  const existing=new Map([...timeline.children].map(node=>[node.dataset.chatId,node]));
  for(let index=0;index<items.length;index++){
    const message=items[index],previous=items[index-1],stamp=Number(message.createdAt)||0,priorStamp=Number(previous?.createdAt)||0;
    const grouped=Boolean(previous&&previous.uid===message.uid&&stamp>=priorStamp&&stamp-priorStamp<=5*60*1000&&new Date(stamp).toDateString()===new Date(priorStamp).toDateString());
    const signature=JSON.stringify([message.uid,message.nickname,message.color,message.photo,message.kind,message.text,message.createdAt,grouped,window.focoI18n?.getLanguage()]);
    let node=existing.get(message.id);if(!node||node._signature!==signature||node._media!==message.media){const next=chatMessageNode(message,grouped);next._signature=signature;next._media=message.media;if(node)node.replaceWith(next);node=next;}
    if(timeline.children[index]!==node)timeline.insertBefore(node,timeline.children[index]||null);existing.delete(message.id);
  }
  for(const node of existing.values())node.remove();
  if(pinned)root.scrollTop=root.scrollHeight;
  else if(anchorId){const kept=[...timeline.children].find(node=>node.dataset.chatId===anchorId);if(kept)root.scrollTop+=kept.getBoundingClientRect().top-rootTop-anchorOffset;}
  state.chatForceBottom=false;updateChatControls();updateChatUnread();
}
function updateChatAttachment(){const holder=$('#chatAttachmentPreview');if(!state.chatMedia){holder.hidden=true;holder.innerHTML='';updateChatControls();return;}holder.hidden=false;holder.innerHTML=`<img src="${esc(state.chatMedia.data)}" alt="Prévia do anexo"><span>${esc(state.chatMedia.name)}</span><button type="button" class="chat-remove-attachment" id="chatRemoveAttachment" title="Remover anexo" aria-label="Remover anexo">${icon('x','icon-sm')}</button>`;holder.querySelector('#chatRemoveAttachment').onclick=()=>{state.chatMedia=null;$('#chatFileInput').value='';updateChatAttachment();};updateChatControls();}
function fileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error||new Error('file'));reader.onload=()=>resolve(String(reader.result||''));reader.readAsDataURL(file);});}
async function prepareChatImage(file){if(!file||!/^image\/(png|jpeg|webp|gif)$/i.test(file.type))throw new Error('Escolha uma imagem PNG, JPG, WebP ou GIF.');if(file.size>8*1024*1024)throw new Error('Envie imagens de até 8 MB; o Foco reduz antes de enviar.');if(file.type==='image/gif'){const data=await fileAsDataUrl(file);if(file.size>160*1024||data.length>220000)throw new Error('O arquivo precisa ter até 160 KB.');return{kind:'gif',data,name:file.name};}
  const bitmap=await createImageBitmap(file);let width=bitmap.width,height=bitmap.height,scale=Math.min(1,1280/Math.max(width,height));width=Math.max(1,Math.round(width*scale));height=Math.max(1,Math.round(height*scale));const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');for(let attempt=0;attempt<8;attempt++){canvas.width=width;canvas.height=height;ctx.clearRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);for(const quality of [.82,.72,.62,.52,.42]){const data=canvas.toDataURL('image/webp',quality);if(data.length<=220000){bitmap.close();return{kind:'image',data,name:file.name};}}width=Math.max(1,Math.round(width*.82));height=Math.max(1,Math.round(height*.82));}bitmap.close();throw new Error('A imagem ficou grande demais após a compressão.');}
function resizeChatInput(){const input=$('#chatInput');input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,116)}px`;}
function closeChatEmojiPicker(restoreFocus=false){$('#chatEmojiPicker').hidden=true;$('#chatEmojiButton').setAttribute('aria-expanded','false');if(restoreFocus)$('#chatEmojiButton').focus();}
function openChatEmojiPicker(){const panel=$('#chatEmojiPicker');const open=panel.hidden;if(!open){closeChatEmojiPicker(true);return;}panel.hidden=false;$('#chatEmojiButton').setAttribute('aria-expanded','true');panel.innerHTML=['😀','😂','🥹','😍','😎','🥳','🔥','💀','👏','❤️','👍','👀','😭','🎮','✨','✅'].map(emoji=>`<button type="button" class="chat-emoji" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('');panel.querySelector('button')?.focus();panel.onclick=event=>{const button=event.target.closest('[data-emoji]');if(!button)return;const input=$('#chatInput'),start=input.selectionStart,end=input.selectionEnd;input.setRangeText(button.dataset.emoji,start,end,'end');closeChatEmojiPicker();input.focus();resizeChatInput();updateChatControls();};}
$('#chatEmojiPicker').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeChatEmojiPicker(true);}});
async function sendChatMessage(){
  if(state.chatSending||!state.roomConnected||!state.activeRoom)return;
  const text=$('#chatInput').value.trim(),attachment=state.chatMedia,room=state.activeRoom;
  if(!text&&!attachment)return;
  if(Date.now()-state.lastChatSentAt<650)return;
  const operation={room,generation:state.p2pGeneration,userId:state.user?.uid};
  const current=()=>state.chatSendOperation===operation&&state.activeRoom===room&&state.p2pGeneration===operation.generation&&state.user?.uid===operation.userId;
  state.chatSendOperation=operation;state.chatSending=true;state.lastChatSentAt=Date.now();$('#chatSendStatus').hidden=false;$('#chatSendStatus').dataset.kind='pending';$('#chatSendStatus').textContent=tr('Enviando mensagem…');updateChatControls();
  try{
    const photo=await makeChatAvatar(state.profile?.photo||'');if(!current())return;
    await cloud().sendRoomChat(room,{kind:attachment?.kind||'text',text,media:attachment?.data||'',photo});
    if(!current())return;
    $('#chatInput').value='';$('#chatFileInput').value='';state.chatMedia=null;closeChatEmojiPicker();state.chatForceBottom=true;updateChatAttachment();resizeChatInput();
    const successToken=String(Date.now());$('#chatSendStatus').dataset.kind='success';$('#chatSendStatus').dataset.messageToken=successToken;$('#chatSendStatus').textContent=tr('Mensagem enviada.');setTimeout(()=>{if(state.activeRoom===room&&state.p2pGeneration===operation.generation&&$('#chatSendStatus').dataset.kind==='success'&&$('#chatSendStatus').dataset.messageToken===successToken)$('#chatSendStatus').hidden=true;},2200);
    $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;updateChatUnread();
  }catch(error){if(!current())return;state.lastChatSentAt=0;console.error('Envio do chat:',error);$('#chatSendStatus').dataset.kind='error';$('#chatSendStatus').textContent=tr(error?.code==='PERMISSION_DENIED'?'Publique as regras atualizadas do chat Firebase.':'Não foi possível enviar a mensagem.');}
  finally{if(state.chatSendOperation===operation){state.chatSendOperation=null;state.chatSending=false;updateChatControls();}}
}
async function makeChatAvatar(source){if(!source||!/^data:image\//i.test(source))return'';try{const image=await new Promise((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=reject;element.src=source;});const canvas=document.createElement('canvas'),scale=Math.min(1,40/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const thumbnail=canvas.toDataURL('image/jpeg',.55);return thumbnail.length<=16000?thumbnail:'';}catch{return'';}}

  return { latestMessageAt, chatAtBottom, chatVisible, updateChatUnread, updateChatControls, chatTextHtml, chatMessageNode, renderRoomChat, updateChatAttachment, fileAsDataUrl, prepareChatImage, resizeChatInput, closeChatEmojiPicker, openChatEmojiPicker, sendChatMessage, makeChatAvatar };
}
