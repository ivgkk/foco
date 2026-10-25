export function createRoomUi(ports) {
  const { state, $, document, esc, icon, tr, confirmRoomSwitch, connectRoom, avatarColor } = ports;
function roomInitial(name){return (Array.from(String(name||'').trim())[0]||'#').toUpperCase();}
function renderRooms(filter='') {
  const list=$('#roomList');
  const notice=(message,retry=false)=>`<div class="room-list-notice" role="status">${icon('alert-circle','icon-sm')}<span>${tr(message)}</span>${retry?`<button type="button" class="room-list-retry">${tr('Tentar novamente')}</button>`:''}</div>`;
  if(state.roomsError&&!state.roomsLoaded){list.removeAttribute('aria-busy');list.innerHTML=notice('Não foi possível carregar suas salas.',true);return;}
  if(!state.roomsLoaded){
    // The real list has not answered yet: show its shape, never a guessed "no rooms".
    list.setAttribute('aria-busy','true');
    list.innerHTML='<div class="skeleton-group">'+[62,46,70,54].map(width=>`<div class="room-skeleton" aria-hidden="true"><span class="skeleton skeleton-icon"></span><span class="skeleton skeleton-line" style="width:${width}%"></span></div>`).join('')+'</div><span class="sr-only">Carregando salas…</span>'+(state.roomsSlow?'<div class="empty-rooms" role="status">A lista de salas está demorando para responder.</div>':'');
    return;
  }
  if(state.roomsLoading)list.setAttribute('aria-busy','true');else list.removeAttribute('aria-busy');
  const q=filter.toLowerCase();
  const rooms=state.rooms.filter(r=>r.name.toLowerCase().includes(q)||r.code.toLowerCase().includes(q)).map(r=>`<button class="room-item ${r.id===state.activeRoom?'active':''}" data-room="${esc(r.id)}" title="${esc(r.name)}"${r.id===state.activeRoom?' aria-current="true"':''}><span class="room-hash">${icon('hash','icon-sm')}</span><span class="room-initial" aria-hidden="true">${esc(roomInitial(r.name))}</span><span data-no-translate>${esc(r.name)}</span>${r.id===state.activeRoom&&state.peer?'<span class="room-live">ATIVA</span>':''}</button>`).join('') || `<div class="empty-rooms">${state.rooms.length?'Nenhuma sala encontrada':'Nenhuma sala ainda'}</div>`;
  list.innerHTML=(state.roomsError?notice('Não foi possível atualizar salas. A lista pode estar desatualizada.',true):state.roomsLoading?notice('Atualizando lista de salas…'):'' )+rooms;
  document.querySelectorAll('[data-room]').forEach(button=>button.onclick=async()=>{const room=state.rooms.find(r=>r.id===button.dataset.room);if(!room||room.id===state.activeRoom)return;if(await confirmRoomSwitch(room.id))connectRoom(room);});
}
function renderPeople() {
  const list=$('#peopleList');
  $('#peopleLoadStatus').hidden=!state.membersError;$('#peopleLoadStatus').innerHTML=state.membersError?`<span>${tr('Não foi possível atualizar participantes. Presença indisponível.')}</span><button type="button" data-retry-members${state.membersRetrying?' disabled':''}>${tr(state.membersRetrying?'Atualizando…':'Tentar novamente')}</button>`:'';
  if(!state.user||!state.activeRoom){list.removeAttribute('aria-busy');list.replaceChildren();$('#onlineCount').textContent='';$('#memberCount').textContent='';$('#peopleTabCount').hidden=true;return;}
  if(!state.membersLoaded){
    if(state.membersError){list.removeAttribute('aria-busy');list.replaceChildren();$('#onlineCount').textContent='';$('#memberCount').textContent='';$('#peopleTabCount').hidden=true;return;}
    // Presence has not answered yet: no guessed count, only the shape of the list.
    list.setAttribute('aria-busy','true');
    list.innerHTML='<div class="skeleton-group">'+[58,72,44].map(width=>`<div class="person-skeleton" aria-hidden="true"><span class="skeleton"></span><span><span class="skeleton skeleton-line" style="width:${width}%"></span><span class="skeleton skeleton-line" style="width:${width-22}%"></span></span></div>`).join('')+'</div><span class="sr-only">Carregando participantes…</span>';
    $('#onlineCount').textContent='';$('#memberCount').textContent='';$('#peopleTabCount').hidden=true;return;
  }
  list.removeAttribute('aria-busy');
  list.querySelector('.skeleton-group')?.remove();list.querySelector('.sr-only')?.remove();
  const own=state.ownMember?{...state.profile,...state.ownMember,uid:state.user.uid,publishing:!!state.localStream}:null;
  const members=[...(own?[own]:[]),...state.members.values()].filter(m=>m.online!==false).sort((a,b)=>Number(b.uid===state.user.uid)-Number(a.uid===state.user.uid)||Number(!!(b.streaming||b.publishing))-Number(!!(a.streaming||a.publishing))||(a.nickname||a.name||'').localeCompare(b.nickname||b.name||''));
  const existing=new Map([...list.querySelectorAll('.person-chip[data-person-uid]')].map(row=>[row.dataset.personUid,row]));
  if(!members.length){list.innerHTML='<div class="people-empty">'+tr('Nenhum participante disponível.')+'</div>';}
  else {list.querySelector('.people-empty')?.remove();for(let index=0;index<members.length;index++){
    const m=members[index],self=m.uid===state.user.uid,owner=m.role==='owner'||m.uid===state.currentRoomData?.ownerUid,role=owner?'Dono da sala':m.role==='moderator'?'Moderador':'Membro';
    const live=Boolean(m.publishing||m.streaming||state.streams.get(m.peerId)?.stream),canFocus=live&&Boolean(state.streamTiles.get(m.peerId)),canManage=!self&&(state.isHost||state.profile.role==='moderator');
    const name=m.nickname||m.name||m.username||'Participante',photo=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(m.photo||'')?m.photo:'',color=/^#[0-9a-f]{6}$/i.test(m.color||'')?m.color:avatarColor(m.uid||m.peerId);
    const signature=JSON.stringify([name,photo,color,role,m.online,live,canFocus,canManage,m.status,m.showActivity,m.activity,!!state.membersError,window.focoI18n?.getLanguage()]);
    let row=existing.get(m.uid);if(!row||row._signature!==signature){const wrapper=document.createElement('div');wrapper.innerHTML=`<div class="person-chip ${live?'is-sharing':''}" data-person-uid="${esc(m.uid)}"><span class="person-avatar" style="background:${photo?`center/cover url('${esc(photo)}')`:esc(color)}">${photo?'':esc(name.slice(0,1).toUpperCase())}</span><span class="person-details"><strong><span data-no-translate>${esc(name)}</span>${self?`<span class="person-you">${tr('você')}</span>`:''}</strong><small class="person-meta"><span>${tr(role)}</span>${!state.membersError&&m.online===true?`<span class="person-online">${tr('Online')}</span>`:''}${live?`<span class="person-live">${icon('monitor-up','icon-sm')}${tr('Transmitindo')}</span>`:''}</small></span>${canFocus?`<button type="button" class="person-focus" data-person-focus="${esc(m.peerId)}" title="${tr('Focar transmissão')}" aria-label="${tr('Focar transmissão')}">${icon('monitor','icon-sm')}</button>`:''}${canManage?`<button type="button" class="person-more" data-person-menu="${esc(m.uid)}" aria-label="${tr('Ações para participante')}" aria-expanded="false">${icon('more','icon-sm')}</button><div class="person-menu" data-person-menu-content="${esc(m.uid)}" hidden><button type="button" data-person-manage="${esc(m.uid)}">${tr('Gerenciar participante')}</button></div>`:''}</div>`;const next=wrapper.firstElementChild,wasOpen=state.openPersonMenu===m.uid,restoreFocus=wasOpen&&row?.contains(document.activeElement);next._signature=signature;if(row)row.replaceWith(next);row=next;if(wasOpen){const menu=next.querySelector("[data-person-menu-content]"),trigger=next.querySelector("[data-person-menu]");if(menu&&trigger){menu.hidden=false;trigger.setAttribute("aria-expanded","true");if(restoreFocus)menu.querySelector("button")?.focus();}else state.openPersonMenu=null;}}
    if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);existing.delete(m.uid);
  }}
  for(const row of existing.values())row.remove();
  const confirmed=members.filter(m=>m.online===true).length;$('#onlineCount').textContent=state.membersError?'':String(confirmed);$('#memberCount').textContent=state.membersError?tr('Presença indisponível'):tr(`${confirmed} participante${confirmed===1?'':'s'}`);$('#peopleTabCount').hidden=!!state.membersError;if(!state.membersError)$('#peopleTabCount').textContent=String(confirmed);
}
function closePersonMenu(restoreFocus=false){
  const uid=state.openPersonMenu;if(!uid)return;
  const trigger=[...$('#peopleList').querySelectorAll('[data-person-menu]')].find(node=>node.dataset.personMenu===uid);
  const menu=[...$('#peopleList').querySelectorAll('[data-person-menu-content]')].find(node=>node.dataset.personMenuContent===uid);
  if(menu)menu.hidden=true;if(trigger){trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger.focus();}state.openPersonMenu=null;
}

  return { roomInitial, renderRooms, renderPeople, closePersonMenu };
}
