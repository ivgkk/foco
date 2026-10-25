(() => {
  // renderer/app/rooms.js
  function createRoomFlow(ports) {
    const { state: state2, $: $2, cloudCall: cloudCall2, toast: toast2, disconnectRoom: disconnectRoom2, showNoRoom: showNoRoom2, renderPeople: renderPeople2, stopSharing: stopSharing2, renderStreams: renderStreams2, renderRoomModeration: renderRoomModeration2, ensureDataConnection: ensureDataConnection2, ensureCall: ensureCall2, renderRoomChat: renderRoomChat2, latestMessageAt: latestMessageAt2, persistRooms: persistRooms2, renderRooms: renderRooms2, esc: esc2, icon: icon2, setRoomStatus: setRoomStatus2, updateShareControls: updateShareControls2, updateChatControls: updateChatControls2, mapAuthError: mapAuthError2, revokePeer: revokePeer2, removeRemoteStream: removeRemoteStream2, roomAttemptCurrent: roomAttemptCurrent2 } = ports;
    function syncRoomMembers2(rawMembers) {
      const own = rawMembers?.[state2.user?.uid];
      if (state2.roomAttempt?.revalidating && (!own || own.online === false || own.peerId !== state2.peer?.id)) {
        state2.membersLoaded = true;
        state2.ownMember = null;
        renderPeople2();
        return;
      }
      if ((state2.roomConnected || state2.roomAttempt?.joinedOnce) && (!own || own.online === false)) {
        toast2("Voc\xEA foi removido ou bloqueado nesta sala.");
        disconnectRoom2(false);
        showNoRoom2();
        return;
      }
      state2.membersLoaded = true;
      state2.membersError = "";
      state2.ownMember = own || null;
      if (state2.roomAttempt?.revalidating && state2.roomAttempt.firebaseRejoined && own?.peerId === state2.peer?.id) confirmRestoredRoom2(state2.roomAttempt);
      if (own) {
        state2.canStream = own.canStream !== false;
        state2.profile.role = own.role || "member";
        if (!state2.canStream && state2.localStream) stopSharing2();
        $2("#shareButton").disabled = !state2.canStream;
      }
      const previous = state2.members, active = Object.entries(rawMembers || {}).filter(([uid, member]) => uid !== state2.user?.uid && member?.online !== false && member?.peerId).map(([uid, member]) => [uid, { ...member, peerId: member.peerId, name: member.nickname || member.username || "Participante", publishing: !!member.streaming }]);
      const next = new Map(active);
      for (const [uid, member] of previous) if (next.get(uid)?.peerId !== member.peerId) revokePeer2(member.peerId);
      for (const [, member] of active) if (member.canStream === false) {
        const incoming = state2.incomingCalls.get(member.peerId);
        if (incoming) {
          state2.incomingCalls.delete(member.peerId);
          incoming.close();
        }
        if (state2.streams.has(member.peerId)) removeRemoteStream2(member.peerId);
      }
      state2.members = next;
      for (const [id, stream] of state2.streams) {
        if (stream.local) continue;
        const member = active.map(([, item]) => item).find((item) => item.peerId === id);
        if (member) {
          stream.name = member.nickname || member.username || stream.name;
          stream.uid = member.uid;
          stream.photo = member.photo || "";
          stream.color = member.color;
        }
      }
      renderPeople2();
      renderStreams2();
      if ($2("#roomManageDialog")?.open) renderRoomModeration2();
      for (const [uid, member] of active) {
        ensureDataConnection2(uid, member.peerId);
        if (state2.localStream) ensureCall2(member.peerId, state2.localStream);
      }
    }
    async function watchPanelMembers2(code) {
      if (state2.membersRetrying) return;
      const peer = state2.peer, version = ++state2.membersWatchVersion;
      state2.membersRetrying = true;
      renderPeople2();
      try {
        state2.membersWatch?.();
        const unsubscribe = await window.focoCloud.watchMemberList(code, (members) => {
          if (state2.activeRoom === code && state2.peer === peer && state2.membersWatchVersion === version) {
            state2.membersRetrying = false;
            syncRoomMembers2(members);
          }
        }, () => {
          if (state2.activeRoom === code && state2.peer === peer && state2.membersWatchVersion === version) {
            state2.membersRetrying = false;
            state2.membersError = "failed";
            renderPeople2();
          }
        });
        if (state2.activeRoom !== code || state2.peer !== peer || state2.membersWatchVersion !== version) {
          unsubscribe();
          return;
        }
        state2.membersWatch = unsubscribe;
        state2.roomListeners.push(unsubscribe);
      } catch (error) {
        if (state2.activeRoom === code && state2.peer === peer && state2.membersWatchVersion === version) {
          console.warn("Lista de participantes:", error);
          state2.membersRetrying = false;
          state2.membersError = "failed";
        }
      } finally {
        if (state2.activeRoom === code && state2.peer === peer && state2.membersWatchVersion === version) renderPeople2();
      }
    }
    async function watchPanelChat2(code) {
      if (state2.chatRetrying) return;
      const peer = state2.peer, version = ++state2.chatWatchVersion;
      state2.chatRetrying = true;
      renderRoomChat2();
      try {
        state2.chatWatch?.();
        const unsubscribe = await window.focoCloud.watchRoomChat(code, (messages) => {
          if (state2.activeRoom !== code || state2.peer !== peer || state2.chatWatchVersion !== version) return;
          if (!state2.chatLoaded) {
            state2.chatLoaded = true;
            state2.chatSeenAt = latestMessageAt2(messages);
            state2.chatSeenIds = new Set(messages.map((message) => message.id));
          } else {
            const ids = new Set(messages.map((message) => message.id));
            for (const id of state2.chatSeenIds) if (!ids.has(id)) state2.chatSeenIds.delete(id);
          }
          state2.chatRetrying = false;
          state2.chatError = "";
          state2.chatMessages = messages;
          renderRoomChat2();
        }, () => {
          if (state2.activeRoom === code && state2.peer === peer && state2.chatWatchVersion === version) {
            state2.chatRetrying = false;
            state2.chatError = "failed";
            renderRoomChat2();
          }
        });
        if (state2.activeRoom !== code || state2.peer !== peer || state2.chatWatchVersion !== version) {
          unsubscribe();
          return;
        }
        state2.chatWatch = unsubscribe;
        state2.roomListeners.push(unsubscribe);
      } catch (error) {
        if (state2.activeRoom === code && state2.peer === peer && state2.chatWatchVersion === version) {
          console.warn("Chat da sala:", error);
          state2.chatRetrying = false;
          state2.chatError = "failed";
        }
      } finally {
        if (state2.activeRoom === code && state2.peer === peer && state2.chatWatchVersion === version) renderRoomChat2();
      }
    }
    async function compensateStaleJoin2(attempt, peerId) {
      if (state2.user?.uid !== attempt.userId || state2.activeRoom === attempt.code && state2.peer?.id === peerId) return;
      try {
        await window.focoCloud.exitRoom(attempt.code, peerId);
      } catch (error) {
        console.warn("N\xE3o foi poss\xEDvel limpar presen\xE7a de entrada obsoleta:", error);
      }
    }
    async function watchCurrentRoom2(attempt) {
      const { code } = attempt;
      const unsubscribe = await window.focoCloud.watchRoom(code, (updated) => {
        if (!roomAttemptCurrent2(attempt)) return;
        if (!updated || updated.deleted) {
          if (state2.rotatingRoom) return;
          toast2("Esta sala foi exclu\xEDda.");
          state2.rooms = state2.rooms.filter((item) => item.id !== code);
          persistRooms2();
          disconnectRoom2();
          showNoRoom2();
          return;
        }
        state2.currentRoomData = updated;
        state2.isHost = updated.ownerUid === state2.user?.uid;
        if (state2.isHost) state2.profile.role = "owner";
        else if (state2.profile.role === "owner") state2.profile.role = "member";
        renderPeople2();
        const index = state2.rooms.findIndex((item) => item.id === code);
        if (index >= 0) {
          state2.rooms[index] = { ...state2.rooms[index], ...updated, id: code, host: state2.isHost };
          renderRooms2($2("#roomSearch").value);
        }
        $2("#roomName").textContent = updated.name;
        $2("#copyRoomCode").innerHTML = `${esc2(code)} ${icon2("copy", "icon-sm")}`;
        $2("#copyRoomCode").disabled = false;
        $2("#deleteRoomButton").hidden = !state2.isHost;
        $2("#rotateRoomCodeButton").hidden = !state2.isHost;
        if ($2("#roomManageDialog")?.open) renderRoomModeration2();
      });
      if (!roomAttemptCurrent2(attempt)) {
        unsubscribe();
        return;
      }
      state2.roomListeners.push(unsubscribe);
    }
    function confirmRestoredRoom2(attempt) {
      if (!roomAttemptCurrent2(attempt) || !attempt.firebaseRejoined || state2.ownMember?.peerId !== attempt.peer.id) return;
      clearTimeout(attempt.presenceTimer);
      attempt.presenceTimer = null;
      attempt.revalidating = false;
      state2.roomConnected = true;
      $2("#shareButton").disabled = !state2.canStream;
      $2("#inviteButton").disabled = false;
      for (const [uid, member] of state2.members) {
        ensureDataConnection2(uid, member.peerId);
        if (state2.localStream) ensureCall2(member.peerId, state2.localStream);
      }
      if ($2("#shareDialog").open) updateShareControls2();
      updateChatControls2();
      renderPeople2();
      setRoomStatus2("Conex\xE3o restaurada \xB7 P2P", true);
      toast2("Conex\xE3o com a sala restaurada.");
    }
    function suspendP2PForRevalidation2() {
      for (const timer of state2.recoveryTimers) clearTimeout(timer);
      state2.recoveryTimers.clear();
      state2.recoveryAttempts.clear();
      for (const timer of state2.qualityTimers.values()) clearInterval(timer);
      state2.qualityTimers.clear();
      for (const call of state2.calls.values()) call.close();
      state2.calls.clear();
      for (const call of state2.incomingCalls.values()) call.close();
      state2.incomingCalls.clear();
      for (const conn of state2.dataConnections.values()) conn.close();
      state2.dataConnections.clear();
      state2.pendingOutgoingCalls.clear();
      state2.lastRetryAt.clear();
      for (const [id, stream] of [...state2.streams]) if (!stream.local) removeRemoteStream2(id);
    }
    async function finishRoomJoin2(attempt, peerId, openVersion, reconnecting) {
      const { code, peer } = attempt;
      const waitTimer = reconnecting ? setTimeout(() => {
        if (roomAttemptCurrent2(attempt) && attempt.openVersion === openVersion && !state2.roomConnected) setRoomStatus2("Sem confirma\xE7\xE3o da sala \xB7 verifique a conex\xE3o ou entre novamente");
      }, 12e3) : null;
      if (waitTimer) attempt.joinWaitTimer = waitTimer;
      try {
        const joined = await cloudCall2(() => window.focoCloud.joinRoom(code, state2.profile, peerId));
        if (!roomAttemptCurrent2(attempt) || attempt.openVersion !== openVersion || peer.disconnected) {
          await compensateStaleJoin2(attempt, peerId);
          return;
        }
        state2.currentRoomData = { ...joined, code, id: code };
        state2.isHost = joined.ownerUid === state2.user.uid;
        state2.profile.role = joined.role;
        state2.canStream = joined.canStream !== false;
        attempt.joinedOnce = true;
        attempt.rejoinFailures = 0;
        if (reconnecting) {
          attempt.firebaseRejoined = true;
          if (state2.ownMember?.peerId === peerId) confirmRestoredRoom2(attempt);
          else {
            setRoomStatus2("Entrada confirmada \xB7 aguardando presen\xE7a");
            clearTimeout(attempt.presenceTimer);
            attempt.presenceTimer = setTimeout(() => {
              attempt.presenceTimer = null;
              if (roomAttemptCurrent2(attempt) && attempt.revalidating) {
                setRoomStatus2("Presen\xE7a n\xE3o confirmada \xB7 saia e entre novamente");
              }
            }, 5e3);
          }
          return;
        }
        state2.roomConnected = true;
        if (!reconnecting) {
          const index = state2.rooms.findIndex((room) => room.id === code);
          if (index >= 0) state2.rooms[index] = { ...joined, id: code };
          else state2.rooms.unshift({ ...joined, id: code });
          persistRooms2();
          renderRooms2($2("#roomSearch").value);
          await watchPanelMembers2(code);
          if (!roomAttemptCurrent2(attempt) || attempt.openVersion !== openVersion) return;
          await watchPanelChat2(code);
          if (!roomAttemptCurrent2(attempt) || attempt.openVersion !== openVersion) return;
          await watchCurrentRoom2(attempt);
          if (!roomAttemptCurrent2(attempt) || attempt.openVersion !== openVersion) return;
        }
        $2("#shareButton").disabled = !state2.canStream;
        $2("#inviteButton").disabled = false;
        if ($2("#shareDialog").open) updateShareControls2();
        updateChatControls2();
        renderPeople2();
        setRoomStatus2("Conectado \xB7 P2P", true);
        toast2(`Sala ${joined.name} pronta \xB7 c\xF3digo ${code}`);
      } catch (error) {
        if (!roomAttemptCurrent2(attempt) || attempt.openVersion !== openVersion) return;
        console.warn(reconnecting ? "Reentrada na sala:" : "Entrada na sala:", error);
        if (!reconnecting) {
          setRoomStatus2("Falha ao entrar");
          toast2(mapAuthError2(error));
          disconnectRoom2(false);
          showNoRoom2();
          return;
        }
        state2.roomConnected = false;
        $2("#shareButton").disabled = true;
        updateChatControls2();
        if ($2("#shareDialog").open) updateShareControls2();
        if (++attempt.rejoinFailures <= 2) {
          const delay = 1e3 * 2 ** attempt.rejoinFailures;
          setRoomStatus2(`Falha de reentrada \xB7 tentando novamente em ${delay / 1e3} s`);
          attempt.rejoinTimer = setTimeout(() => {
            attempt.rejoinTimer = null;
            if (roomAttemptCurrent2(attempt) && attempt.openVersion === openVersion && peer.open && !peer.disconnected) finishRoomJoin2(attempt, peerId, openVersion, true);
          }, delay);
        } else setRoomStatus2("Falha ao restaurar a sala \xB7 saia e entre novamente");
      } finally {
        clearTimeout(waitTimer);
        if (attempt.joinWaitTimer === waitTimer) attempt.joinWaitTimer = null;
      }
    }
    return { syncRoomMembers: syncRoomMembers2, watchPanelMembers: watchPanelMembers2, watchPanelChat: watchPanelChat2, compensateStaleJoin: compensateStaleJoin2, watchCurrentRoom: watchCurrentRoom2, confirmRestoredRoom: confirmRestoredRoom2, suspendP2PForRevalidation: suspendP2PForRevalidation2, finishRoomJoin: finishRoomJoin2 };
  }

  // renderer/app/ui.js
  function createRoomUi(ports) {
    const { state: state2, $: $2, document: document2, esc: esc2, icon: icon2, tr: tr2, confirmRoomSwitch: confirmRoomSwitch2, connectRoom: connectRoom2, avatarColor: avatarColor2 } = ports;
    function roomInitial2(name) {
      return (Array.from(String(name || "").trim())[0] || "#").toUpperCase();
    }
    function renderRooms2(filter = "") {
      const list = $2("#roomList");
      const notice = (message, retry = false) => `<div class="room-list-notice" role="status">${icon2("alert-circle", "icon-sm")}<span>${tr2(message)}</span>${retry ? `<button type="button" class="room-list-retry">${tr2("Tentar novamente")}</button>` : ""}</div>`;
      if (state2.roomsError && !state2.roomsLoaded) {
        list.removeAttribute("aria-busy");
        list.innerHTML = notice("N\xE3o foi poss\xEDvel carregar suas salas.", true);
        return;
      }
      if (!state2.roomsLoaded) {
        list.setAttribute("aria-busy", "true");
        list.innerHTML = '<div class="skeleton-group">' + [62, 46, 70, 54].map((width) => `<div class="room-skeleton" aria-hidden="true"><span class="skeleton skeleton-icon"></span><span class="skeleton skeleton-line" style="width:${width}%"></span></div>`).join("") + '</div><span class="sr-only">Carregando salas\u2026</span>' + (state2.roomsSlow ? '<div class="empty-rooms" role="status">A lista de salas est\xE1 demorando para responder.</div>' : "");
        return;
      }
      if (state2.roomsLoading) list.setAttribute("aria-busy", "true");
      else list.removeAttribute("aria-busy");
      const q = filter.toLowerCase();
      const rooms = state2.rooms.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)).map((r) => `<button class="room-item ${r.id === state2.activeRoom ? "active" : ""}" data-room="${esc2(r.id)}" title="${esc2(r.name)}"${r.id === state2.activeRoom ? ' aria-current="true"' : ""}><span class="room-hash">${icon2("hash", "icon-sm")}</span><span class="room-initial" aria-hidden="true">${esc2(roomInitial2(r.name))}</span><span data-no-translate>${esc2(r.name)}</span>${r.id === state2.activeRoom && state2.peer ? '<span class="room-live">ATIVA</span>' : ""}</button>`).join("") || `<div class="empty-rooms">${state2.rooms.length ? "Nenhuma sala encontrada" : "Nenhuma sala ainda"}</div>`;
      list.innerHTML = (state2.roomsError ? notice("N\xE3o foi poss\xEDvel atualizar salas. A lista pode estar desatualizada.", true) : state2.roomsLoading ? notice("Atualizando lista de salas\u2026") : "") + rooms;
      document2.querySelectorAll("[data-room]").forEach((button) => button.onclick = async () => {
        const room = state2.rooms.find((r) => r.id === button.dataset.room);
        if (!room || room.id === state2.activeRoom) return;
        if (await confirmRoomSwitch2(room.id)) connectRoom2(room);
      });
    }
    function renderPeople2() {
      const list = $2("#peopleList");
      $2("#peopleLoadStatus").hidden = !state2.membersError;
      $2("#peopleLoadStatus").innerHTML = state2.membersError ? `<span>${tr2("N\xE3o foi poss\xEDvel atualizar participantes. Presen\xE7a indispon\xEDvel.")}</span><button type="button" data-retry-members${state2.membersRetrying ? " disabled" : ""}>${tr2(state2.membersRetrying ? "Atualizando\u2026" : "Tentar novamente")}</button>` : "";
      if (!state2.user || !state2.activeRoom) {
        list.removeAttribute("aria-busy");
        list.replaceChildren();
        $2("#onlineCount").textContent = "";
        $2("#memberCount").textContent = "";
        $2("#peopleTabCount").hidden = true;
        return;
      }
      if (!state2.membersLoaded) {
        if (state2.membersError) {
          list.removeAttribute("aria-busy");
          list.replaceChildren();
          $2("#onlineCount").textContent = "";
          $2("#memberCount").textContent = "";
          $2("#peopleTabCount").hidden = true;
          return;
        }
        list.setAttribute("aria-busy", "true");
        list.innerHTML = '<div class="skeleton-group">' + [58, 72, 44].map((width) => `<div class="person-skeleton" aria-hidden="true"><span class="skeleton"></span><span><span class="skeleton skeleton-line" style="width:${width}%"></span><span class="skeleton skeleton-line" style="width:${width - 22}%"></span></span></div>`).join("") + '</div><span class="sr-only">Carregando participantes\u2026</span>';
        $2("#onlineCount").textContent = "";
        $2("#memberCount").textContent = "";
        $2("#peopleTabCount").hidden = true;
        return;
      }
      list.removeAttribute("aria-busy");
      list.querySelector(".skeleton-group")?.remove();
      list.querySelector(".sr-only")?.remove();
      const own = state2.ownMember ? { ...state2.profile, ...state2.ownMember, uid: state2.user.uid, publishing: !!state2.localStream } : null;
      const members = [...own ? [own] : [], ...state2.members.values()].filter((m) => m.online !== false).sort((a, b) => Number(b.uid === state2.user.uid) - Number(a.uid === state2.user.uid) || Number(!!(b.streaming || b.publishing)) - Number(!!(a.streaming || a.publishing)) || (a.nickname || a.name || "").localeCompare(b.nickname || b.name || ""));
      const existing = new Map([...list.querySelectorAll(".person-chip[data-person-uid]")].map((row) => [row.dataset.personUid, row]));
      if (!members.length) {
        list.innerHTML = '<div class="people-empty">' + tr2("Nenhum participante dispon\xEDvel.") + "</div>";
      } else {
        list.querySelector(".people-empty")?.remove();
        for (let index = 0; index < members.length; index++) {
          const m = members[index], self = m.uid === state2.user.uid, owner = m.role === "owner" || m.uid === state2.currentRoomData?.ownerUid, role = owner ? "Dono da sala" : m.role === "moderator" ? "Moderador" : "Membro";
          const live = Boolean(m.publishing || m.streaming || state2.streams.get(m.peerId)?.stream), canFocus = live && Boolean(state2.streamTiles.get(m.peerId)), canManage = !self && (state2.isHost || state2.profile.role === "moderator");
          const name = m.nickname || m.name || m.username || "Participante", photo = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(m.photo || "") ? m.photo : "", color = /^#[0-9a-f]{6}$/i.test(m.color || "") ? m.color : avatarColor2(m.uid || m.peerId);
          const signature = JSON.stringify([name, photo, color, role, m.online, live, canFocus, canManage, m.status, m.showActivity, m.activity, !!state2.membersError, window.focoI18n?.getLanguage()]);
          let row = existing.get(m.uid);
          if (!row || row._signature !== signature) {
            const wrapper = document2.createElement("div");
            wrapper.innerHTML = `<div class="person-chip ${live ? "is-sharing" : ""}" data-person-uid="${esc2(m.uid)}"><span class="person-avatar" style="background:${photo ? `center/cover url('${esc2(photo)}')` : esc2(color)}">${photo ? "" : esc2(name.slice(0, 1).toUpperCase())}</span><span class="person-details"><strong><span data-no-translate>${esc2(name)}</span>${self ? `<span class="person-you">${tr2("voc\xEA")}</span>` : ""}</strong><small class="person-meta"><span>${tr2(role)}</span>${!state2.membersError && m.online === true ? `<span class="person-online">${tr2("Online")}</span>` : ""}${live ? `<span class="person-live">${icon2("monitor-up", "icon-sm")}${tr2("Transmitindo")}</span>` : ""}</small></span>${canFocus ? `<button type="button" class="person-focus" data-person-focus="${esc2(m.peerId)}" title="${tr2("Focar transmiss\xE3o")}" aria-label="${tr2("Focar transmiss\xE3o")}">${icon2("monitor", "icon-sm")}</button>` : ""}${canManage ? `<button type="button" class="person-more" data-person-menu="${esc2(m.uid)}" aria-label="${tr2("A\xE7\xF5es para participante")}" aria-expanded="false">${icon2("more", "icon-sm")}</button><div class="person-menu" data-person-menu-content="${esc2(m.uid)}" hidden><button type="button" data-person-manage="${esc2(m.uid)}">${tr2("Gerenciar participante")}</button></div>` : ""}</div>`;
            const next = wrapper.firstElementChild, wasOpen = state2.openPersonMenu === m.uid, restoreFocus = wasOpen && row?.contains(document2.activeElement);
            next._signature = signature;
            if (row) row.replaceWith(next);
            row = next;
            if (wasOpen) {
              const menu = next.querySelector("[data-person-menu-content]"), trigger = next.querySelector("[data-person-menu]");
              if (menu && trigger) {
                menu.hidden = false;
                trigger.setAttribute("aria-expanded", "true");
                if (restoreFocus) menu.querySelector("button")?.focus();
              } else state2.openPersonMenu = null;
            }
          }
          if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
          existing.delete(m.uid);
        }
      }
      for (const row of existing.values()) row.remove();
      const confirmed = members.filter((m) => m.online === true).length;
      $2("#onlineCount").textContent = state2.membersError ? "" : String(confirmed);
      $2("#memberCount").textContent = state2.membersError ? tr2("Presen\xE7a indispon\xEDvel") : tr2(`${confirmed} participante${confirmed === 1 ? "" : "s"}`);
      $2("#peopleTabCount").hidden = !!state2.membersError;
      if (!state2.membersError) $2("#peopleTabCount").textContent = String(confirmed);
    }
    function closePersonMenu2(restoreFocus = false) {
      const uid = state2.openPersonMenu;
      if (!uid) return;
      const trigger = [...$2("#peopleList").querySelectorAll("[data-person-menu]")].find((node) => node.dataset.personMenu === uid);
      const menu = [...$2("#peopleList").querySelectorAll("[data-person-menu-content]")].find((node) => node.dataset.personMenuContent === uid);
      if (menu) menu.hidden = true;
      if (trigger) {
        trigger.setAttribute("aria-expanded", "false");
        if (restoreFocus) trigger.focus();
      }
      state2.openPersonMenu = null;
    }
    return { roomInitial: roomInitial2, renderRooms: renderRooms2, renderPeople: renderPeople2, closePersonMenu: closePersonMenu2 };
  }

  // renderer/app/chat.js
  function createChat(ports) {
    const { state: state2, $: $2, document: document2, tr: tr2, esc: esc2, icon: icon2, isPanelOpen: isPanelOpen2, avatarColor: avatarColor2, cloud } = ports;
    function latestMessageAt2(messages) {
      return (messages || []).reduce((latest, message) => Math.max(latest, Number(message.createdAt) || 0), 0);
    }
    function chatAtBottom2() {
      const root = $2("#chatMessages");
      return root.scrollHeight - root.scrollTop - root.clientHeight < 48;
    }
    function chatVisible2() {
      return Boolean(state2.activeRoom) && isPanelOpen2() && state2.panelTab === "chat" && !$2("#chatPane").hidden;
    }
    function updateChatUnread2() {
      const messages = state2.chatMessages || [];
      if (state2.chatLoaded && chatVisible2() && chatAtBottom2()) {
        for (const message of messages) state2.chatSeenIds.add(message.id);
        state2.chatSeenAt = latestMessageAt2(messages);
      }
      const unread = state2.chatLoaded ? messages.filter((message) => message.uid !== state2.user?.uid && !state2.chatSeenIds.has(message.id)).length : 0;
      const badge = $2("#chatUnread");
      badge.hidden = !unread;
      badge.textContent = unread > 9 ? "9+" : String(unread);
      $2("#panelUnread").hidden = !unread || isPanelOpen2();
      const jump = $2("#chatJump");
      jump.hidden = !unread || !chatVisible2() || chatAtBottom2();
      $2("#chatJumpCount").textContent = unread > 9 ? "9+" : String(unread);
      const announcement = unread && chatVisible2() && !chatAtBottom2() ? tr2("Novas mensagens recebidas.") : "";
      if ($2("#chatAnnouncement").textContent !== announcement) $2("#chatAnnouncement").textContent = announcement;
    }
    function updateChatControls2() {
      const enabled = Boolean(state2.roomConnected && state2.user && !state2.chatSending);
      $2("#chatInput").disabled = !enabled;
      $2("#chatAttachButton").disabled = !enabled;
      $2("#chatEmojiButton").disabled = !enabled;
      $2("#chatSendButton").disabled = !enabled || !$2("#chatInput").value.trim() && !state2.chatMedia;
      $2("#chatSendButton").setAttribute("aria-busy", String(state2.chatSending));
    }
    function chatTextHtml2(value) {
      return String(value || "").split(/(https:\/\/[^\s<>"']+)/g).map((part) => part.startsWith("https://") ? `<a href="${esc2(part)}" target="_blank" rel="noopener noreferrer">${esc2(part)}</a>` : esc2(part)).join("").replace(/\n/g, "<br>");
    }
    function chatMessageNode2(message, grouped) {
      const own = message.uid === state2.user?.uid, color = /^#[0-9a-f]{6}$/i.test(message.color || "") ? message.color : "#9b83ff", name = message.nickname || "Jogador", photo = /^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(message.photo || "") ? message.photo : "", initial = esc2(name.trim().slice(0, 1).toUpperCase());
      const rawTime = Number(message.createdAt), date = new Date(Number.isFinite(rawTime) && rawTime > 0 && rawTime <= 864e13 ? rawTime : Date.now()), time = date.toLocaleTimeString(window.focoI18n?.locale() || "pt-BR", { hour: "2-digit", minute: "2-digit" }), fullTime = date.toLocaleString(window.focoI18n?.locale() || "pt-BR");
      const validMedia = /^data:image\/(?:webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(message.media || "");
      const avatar = photo ? `<img class="chat-message-avatar" src="${esc2(photo)}" alt="" loading="lazy">` : `<span class="chat-message-avatar chat-message-avatar-fallback" style="--message-accent:${esc2(color)}">${initial}</span>`;
      const media = validMedia ? `<button class="chat-media-thumb" type="button" data-chat-media="${esc2(message.id)}" aria-label="${tr2(message.kind === "gif" ? "GIF animado" : "Imagem")}"><img loading="lazy" src="${esc2(message.media)}" alt="${tr2(message.kind === "gif" ? "GIF animado" : "Imagem enviada")}">${message.kind === "gif" ? '<span class="chat-gif-badge">GIF</span>' : ""}</button>` : "";
      const wrapper = document2.createElement("div");
      wrapper.innerHTML = `<article class="chat-message ${own ? "own" : ""} ${grouped ? "grouped" : ""}" data-chat-id="${esc2(message.id)}"><div class="chat-message-rail">${grouped ? "" : avatar}</div><div class="chat-message-body">${grouped ? "" : `<div class="chat-message-top"><strong style="--message-accent:${esc2(color)}" data-no-translate>${esc2(name)}</strong><time datetime="${date.toISOString()}" title="${esc2(fullTime)}">${esc2(time)}</time></div>`}${message.text ? `<div class="chat-message-text">${chatTextHtml2(message.text)}</div>` : ""}${media}${message.kind !== "text" && !validMedia ? '<div class="chat-message-text">Anexo indispon\xEDvel.</div>' : ""}</div>${own ? `<button type="button" class="chat-delete" data-chat-delete="${esc2(message.id)}" title="${tr2("Remover mensagem")}" aria-label="${tr2("Remover mensagem")}">${icon2("x", "icon-sm")}</button>` : ""}</article>`;
      return wrapper.firstElementChild;
    }
    function renderRoomChat2() {
      const root = $2("#chatMessages");
      if (!root) return;
      $2("#chatLoadStatus").hidden = !state2.chatError;
      $2("#chatLoadStatus").innerHTML = state2.chatError ? `<span>${tr2("N\xE3o foi poss\xEDvel atualizar o chat.")}</span><button type="button" data-retry-chat${state2.chatRetrying ? " disabled" : ""}>${tr2(state2.chatRetrying ? "Atualizando\u2026" : "Tentar novamente")}</button>` : "";
      if (!state2.activeRoom) {
        root.removeAttribute("aria-busy");
        root.innerHTML = '<div class="chat-empty">Entre em uma sala para ver as mensagens.</div>';
        updateChatControls2();
        updateChatUnread2();
        return;
      }
      if (!state2.chatLoaded) {
        if (state2.chatError) {
          root.removeAttribute("aria-busy");
          root.replaceChildren();
          updateChatControls2();
          return;
        }
        root.setAttribute("aria-busy", "true");
        if (!root.querySelector(".chat-skeleton")) root.innerHTML = '<div class="chat-skeleton skeleton-group" aria-hidden="true">' + [70, 52, 84].map((width) => `<div class="chat-skeleton-row"><span class="skeleton"></span><span><span class="skeleton skeleton-line" style="width:${width - 40}%"></span><span class="skeleton skeleton-line" style="width:${width}%"></span></span></div>`).join("") + '</div><span class="sr-only">Carregando mensagens\u2026</span>';
        updateChatControls2();
        return;
      }
      root.removeAttribute("aria-busy");
      const items = state2.chatMessages || [];
      if (!items.length) {
        if (!root.querySelector(".chat-empty")) root.innerHTML = '<div class="chat-empty">Nenhuma mensagem ainda.</div>';
        updateChatControls2();
        updateChatUnread2();
        return;
      }
      const pinned = chatAtBottom2() || state2.chatForceBottom, rootTop = root.getBoundingClientRect().top, anchor = !pinned ? [...root.querySelectorAll("[data-chat-id]")].find((node) => node.getBoundingClientRect().bottom > rootTop + 2) : null, anchorId = anchor?.dataset.chatId, anchorOffset = anchor?.getBoundingClientRect().top - rootTop;
      let timeline = root.querySelector(".chat-timeline");
      if (!timeline) {
        timeline = document2.createElement("div");
        timeline.className = "chat-timeline";
        root.replaceChildren(timeline);
      }
      const existing = new Map([...timeline.children].map((node) => [node.dataset.chatId, node]));
      for (let index = 0; index < items.length; index++) {
        const message = items[index], previous = items[index - 1], stamp = Number(message.createdAt) || 0, priorStamp = Number(previous?.createdAt) || 0;
        const grouped = Boolean(previous && previous.uid === message.uid && stamp >= priorStamp && stamp - priorStamp <= 5 * 60 * 1e3 && new Date(stamp).toDateString() === new Date(priorStamp).toDateString());
        const signature = JSON.stringify([message.uid, message.nickname, message.color, message.photo, message.kind, message.text, message.createdAt, grouped, window.focoI18n?.getLanguage()]);
        let node = existing.get(message.id);
        if (!node || node._signature !== signature || node._media !== message.media) {
          const next = chatMessageNode2(message, grouped);
          next._signature = signature;
          next._media = message.media;
          if (node) node.replaceWith(next);
          node = next;
        }
        if (timeline.children[index] !== node) timeline.insertBefore(node, timeline.children[index] || null);
        existing.delete(message.id);
      }
      for (const node of existing.values()) node.remove();
      if (pinned) root.scrollTop = root.scrollHeight;
      else if (anchorId) {
        const kept = [...timeline.children].find((node) => node.dataset.chatId === anchorId);
        if (kept) root.scrollTop += kept.getBoundingClientRect().top - rootTop - anchorOffset;
      }
      state2.chatForceBottom = false;
      updateChatControls2();
      updateChatUnread2();
    }
    function updateChatAttachment2() {
      const holder = $2("#chatAttachmentPreview");
      if (!state2.chatMedia) {
        holder.hidden = true;
        holder.innerHTML = "";
        updateChatControls2();
        return;
      }
      holder.hidden = false;
      holder.innerHTML = `<img src="${esc2(state2.chatMedia.data)}" alt="Pr\xE9via do anexo"><span>${esc2(state2.chatMedia.name)}</span><button type="button" class="chat-remove-attachment" id="chatRemoveAttachment" title="Remover anexo" aria-label="Remover anexo">${icon2("x", "icon-sm")}</button>`;
      holder.querySelector("#chatRemoveAttachment").onclick = () => {
        state2.chatMedia = null;
        $2("#chatFileInput").value = "";
        updateChatAttachment2();
      };
      updateChatControls2();
    }
    function fileAsDataUrl2(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error("file"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
    }
    async function prepareChatImage2(file) {
      if (!file || !/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) throw new Error("Escolha uma imagem PNG, JPG, WebP ou GIF.");
      if (file.size > 8 * 1024 * 1024) throw new Error("Envie imagens de at\xE9 8 MB; o Foco reduz antes de enviar.");
      if (file.type === "image/gif") {
        const data = await fileAsDataUrl2(file);
        if (file.size > 160 * 1024 || data.length > 22e4) throw new Error("O arquivo precisa ter at\xE9 160 KB.");
        return { kind: "gif", data, name: file.name };
      }
      const bitmap = await createImageBitmap(file);
      let width = bitmap.width, height = bitmap.height, scale = Math.min(1, 1280 / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document2.createElement("canvas"), ctx = canvas.getContext("2d");
      for (let attempt = 0; attempt < 8; attempt++) {
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
          const data = canvas.toDataURL("image/webp", quality);
          if (data.length <= 22e4) {
            bitmap.close();
            return { kind: "image", data, name: file.name };
          }
        }
        width = Math.max(1, Math.round(width * 0.82));
        height = Math.max(1, Math.round(height * 0.82));
      }
      bitmap.close();
      throw new Error("A imagem ficou grande demais ap\xF3s a compress\xE3o.");
    }
    function resizeChatInput2() {
      const input = $2("#chatInput");
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 116)}px`;
    }
    function closeChatEmojiPicker2(restoreFocus = false) {
      $2("#chatEmojiPicker").hidden = true;
      $2("#chatEmojiButton").setAttribute("aria-expanded", "false");
      if (restoreFocus) $2("#chatEmojiButton").focus();
    }
    function openChatEmojiPicker2() {
      const panel = $2("#chatEmojiPicker");
      const open = panel.hidden;
      if (!open) {
        closeChatEmojiPicker2(true);
        return;
      }
      panel.hidden = false;
      $2("#chatEmojiButton").setAttribute("aria-expanded", "true");
      panel.innerHTML = ["\u{1F600}", "\u{1F602}", "\u{1F979}", "\u{1F60D}", "\u{1F60E}", "\u{1F973}", "\u{1F525}", "\u{1F480}", "\u{1F44F}", "\u2764\uFE0F", "\u{1F44D}", "\u{1F440}", "\u{1F62D}", "\u{1F3AE}", "\u2728", "\u2705"].map((emoji) => `<button type="button" class="chat-emoji" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join("");
      panel.querySelector("button")?.focus();
      panel.onclick = (event) => {
        const button = event.target.closest("[data-emoji]");
        if (!button) return;
        const input = $2("#chatInput"), start = input.selectionStart, end = input.selectionEnd;
        input.setRangeText(button.dataset.emoji, start, end, "end");
        closeChatEmojiPicker2();
        input.focus();
        resizeChatInput2();
        updateChatControls2();
      };
    }
    $2("#chatEmojiPicker").addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeChatEmojiPicker2(true);
      }
    });
    async function sendChatMessage2() {
      if (state2.chatSending || !state2.roomConnected || !state2.activeRoom) return;
      const text = $2("#chatInput").value.trim(), attachment = state2.chatMedia, room = state2.activeRoom;
      if (!text && !attachment) return;
      if (Date.now() - state2.lastChatSentAt < 650) return;
      const operation = { room, generation: state2.p2pGeneration, userId: state2.user?.uid };
      const current = () => state2.chatSendOperation === operation && state2.activeRoom === room && state2.p2pGeneration === operation.generation && state2.user?.uid === operation.userId;
      state2.chatSendOperation = operation;
      state2.chatSending = true;
      state2.lastChatSentAt = Date.now();
      $2("#chatSendStatus").hidden = false;
      $2("#chatSendStatus").dataset.kind = "pending";
      $2("#chatSendStatus").textContent = tr2("Enviando mensagem\u2026");
      updateChatControls2();
      try {
        const photo = await makeChatAvatar2(state2.profile?.photo || "");
        if (!current()) return;
        await cloud().sendRoomChat(room, { kind: attachment?.kind || "text", text, media: attachment?.data || "", photo });
        if (!current()) return;
        $2("#chatInput").value = "";
        $2("#chatFileInput").value = "";
        state2.chatMedia = null;
        closeChatEmojiPicker2();
        state2.chatForceBottom = true;
        updateChatAttachment2();
        resizeChatInput2();
        const successToken = String(Date.now());
        $2("#chatSendStatus").dataset.kind = "success";
        $2("#chatSendStatus").dataset.messageToken = successToken;
        $2("#chatSendStatus").textContent = tr2("Mensagem enviada.");
        setTimeout(() => {
          if (state2.activeRoom === room && state2.p2pGeneration === operation.generation && $2("#chatSendStatus").dataset.kind === "success" && $2("#chatSendStatus").dataset.messageToken === successToken) $2("#chatSendStatus").hidden = true;
        }, 2200);
        $2("#chatMessages").scrollTop = $2("#chatMessages").scrollHeight;
        updateChatUnread2();
      } catch (error) {
        if (!current()) return;
        state2.lastChatSentAt = 0;
        console.error("Envio do chat:", error);
        $2("#chatSendStatus").dataset.kind = "error";
        $2("#chatSendStatus").textContent = tr2(error?.code === "PERMISSION_DENIED" ? "Publique as regras atualizadas do chat Firebase." : "N\xE3o foi poss\xEDvel enviar a mensagem.");
      } finally {
        if (state2.chatSendOperation === operation) {
          state2.chatSendOperation = null;
          state2.chatSending = false;
          updateChatControls2();
        }
      }
    }
    async function makeChatAvatar2(source) {
      if (!source || !/^data:image\//i.test(source)) return "";
      try {
        const image = await new Promise((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = reject;
          element.src = source;
        });
        const canvas = document2.createElement("canvas"), scale = Math.min(1, 40 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        const thumbnail = canvas.toDataURL("image/jpeg", 0.55);
        return thumbnail.length <= 16e3 ? thumbnail : "";
      } catch {
        return "";
      }
    }
    return { latestMessageAt: latestMessageAt2, chatAtBottom: chatAtBottom2, chatVisible: chatVisible2, updateChatUnread: updateChatUnread2, updateChatControls: updateChatControls2, chatTextHtml: chatTextHtml2, chatMessageNode: chatMessageNode2, renderRoomChat: renderRoomChat2, updateChatAttachment: updateChatAttachment2, fileAsDataUrl: fileAsDataUrl2, prepareChatImage: prepareChatImage2, resizeChatInput: resizeChatInput2, closeChatEmojiPicker: closeChatEmojiPicker2, openChatEmojiPicker: openChatEmojiPicker2, sendChatMessage: sendChatMessage2, makeChatAvatar: makeChatAvatar2 };
  }

  // renderer/app/stage.js
  function createStage(ports) {
    const {
      state: state2,
      $: $2,
      document: document2,
      icon: icon2,
      esc: esc2,
      tr: tr2,
      toast: toast2,
      stopSharing: stopSharing2,
      setDisplayMode: setDisplayMode2,
      currentRoom: currentRoom2,
      confirmedRoomAction: confirmedRoomAction2,
      kickMember: kickMember2,
      avatarColor: avatarColor2,
      ensureDataConnection: ensureDataConnection2,
      mediaConnectionState,
      observeMediaConnection,
      readStreamQuality
    } = ports;
    let fullscreenReturnFocus = null;
    function syncFullscreenState2() {
      const card = document2.fullscreenElement;
      const id = card?.classList?.contains("stream-card") ? card.dataset.stream : null;
      state2.theaterId = id && state2.streamTiles.get(id)?.card === card && state2.streams.has(id) ? id : null;
      document2.body.classList.toggle("theater-active", !!state2.theaterId);
      refreshStreamTiles2();
      if (state2.theaterId) {
        state2.streamTiles.get(state2.theaterId)?.fullscreen.focus();
        return;
      }
      const target = fullscreenReturnFocus?.isConnected ? fullscreenReturnFocus : state2.streamTiles.get(state2.focusedId)?.card || $2("#listViewButton");
      fullscreenReturnFocus = null;
      target?.focus();
      setTimeout(() => {
        if (!document2.fullscreenElement && target?.isConnected) target.focus();
      }, 80);
    }
    async function setTheaterMode2(card) {
      const id = card?.dataset.stream;
      if (!id || !card.isConnected || state2.streamTiles.get(id)?.card !== card || !state2.streams.has(id)) return;
      try {
        if (document2.fullscreenElement === card) {
          await document2.exitFullscreen();
          return;
        }
        if (!document2.fullscreenElement) {
          const active = document2.activeElement;
          fullscreenReturnFocus = active?.closest?.(".stream-menu") ? card.querySelector(".card-more") : card.contains(active) ? active : card.querySelector(".stream-fullscreen");
        }
        await card.requestFullscreen();
        if (!card.isConnected || state2.streamTiles.get(id)?.card !== card || !state2.streams.has(id)) await document2.exitFullscreen();
      } catch (error) {
        console.warn("Fullscreen failed:", error);
        if (!document2.fullscreenElement) {
          fullscreenReturnFocus = null;
          syncFullscreenState2();
        }
        toast2("N\xE3o foi poss\xEDvel alternar para tela cheia.");
      }
    }
    document2.addEventListener("fullscreenchange", syncFullscreenState2);
    function setExpandedMode2(card) {
      if (document2.fullscreenElement === card) document2.exitFullscreen().catch(() => {
      });
      const entering = state2.expandedId !== card.dataset.stream;
      document2.querySelectorAll(".stream-card.expanded").forEach((item) => item.classList.remove("expanded"));
      state2.expandedId = entering ? card.dataset.stream : null;
      if (entering) card.classList.add("expanded");
      refreshStreamTiles2();
    }
    const NO_FRAME_TIMEOUT_MS = 5e3;
    const STATUS_TEXT = { waiting: "Conectando ao v\xEDdeo\u2026", stalled: "Aguardando v\xEDdeo", paused: "V\xEDdeo pausado", ended: "Transmiss\xE3o encerrada" };
    function setText2(el, value) {
      if (el.__source === value) return;
      el.__source = value;
      el.textContent = value;
    }
    function setHTML2(el, value) {
      if (el.__source === value) return;
      el.__source = value;
      el.innerHTML = value;
    }
    function setAttr2(el, name, value) {
      const sources = el.__attrs || (el.__attrs = {});
      if (sources[name] === value) return;
      sources[name] = value;
      el.setAttribute(name, value);
    }
    function setStyle2(el, value) {
      if (el.__style === value) return;
      el.__style = value;
      el.setAttribute("style", value);
    }
    function playbackPrefs2(id, entry = state2.streams.get(id)) {
      const key = entry?.uid || id;
      if (!state2.playbackPrefs.has(key)) state2.playbackPrefs.set(key, { volume: 75, muted: false });
      return state2.playbackPrefs.get(key);
    }
    function qualityLabel2(id, entry) {
      const m = state2.streamQualityMetrics.get(id);
      return m?.width && m?.height ? `${m.width}\xD7${m.height}${m.fps ? ` \xB7 ${m.fps} FPS` : ""}` : entry?.quality || "Qualidade indispon\xEDvel";
    }
    function qualityTitle2(id) {
      const m = state2.streamQualityMetrics.get(id);
      if (!m) return "Bitrate ajustado automaticamente conforme a conex\xE3o";
      return `Bitrate autom\xE1tico${m.bitrate ? `: ${(m.bitrate / 1e6).toFixed(1)} Mbps` : ""}${m.rtt ? ` \xB7 lat\xEAncia ${Math.round(m.rtt)} ms` : ""}${m.reason && m.reason !== "none" ? ` \xB7 limite: ${m.reason === "cpu" ? "desempenho do PC" : m.reason === "bandwidth" ? "rede" : "codificador"}` : ""}`;
    }
    function closeStreamMenus2(except) {
      for (const tile of state2.streamTiles.values()) if (tile.menu !== except && !tile.menu.hidden) {
        tile.menu.hidden = true;
        tile.more.setAttribute("aria-expanded", "false");
      }
    }
    function focusStream2(id) {
      if (!state2.streams.has(id)) return;
      state2.focusedId = id;
      state2.localFocusChosen = !!state2.streams.get(id)?.local;
      state2.displayMode = "focus";
      setDisplayMode2("focus");
    }
    function stageIds2() {
      return [...state2.streams.entries()].sort((a, b) => Number(a[1].local) - Number(b[1].local)).map(([id]) => id);
    }
    function cycleStage2(direction) {
      const ids = stageIds2();
      if (ids.length < 2) return;
      const index = ids.indexOf(state2.focusedId);
      focusStream2(ids[(index + direction + ids.length) % ids.length]);
      state2.streamTiles.get(state2.focusedId)?.card.focus();
    }
    function createStreamTile2(id, entry) {
      const card = document2.createElement("article");
      card.className = "stream-card";
      card.dataset.stream = id;
      card.tabIndex = 0;
      card.innerHTML = `<div class="stream-visual"><video autoplay playsinline></video><div class="visual-shade"></div><div class="stream-status" role="status" hidden></div><span class="live-badge"><i></i> AO VIVO</span><span class="quality-badge"></span><button class="stream-expand">${icon2("maximize-2", "icon-sm")}<span></span></button><button class="stream-fullscreen" title="Tela cheia">${icon2("fullscreen", "icon-sm")}<span></span></button><div class="stream-volume" title="Volume da transmiss\xE3o">${icon2("volume", "icon-sm")}<input type="range" min="0" max="100"><span></span></div><div class="local-mirror-cover" hidden>${icon2("monitor")}<strong>Compartilhando a janela do Foco</strong><small>Pr\xE9via oculta para evitar espelhamento.</small></div></div><div class="stream-meta"><span class="person-avatar"></span><div class="stream-info"><strong></strong><small></small></div><div class="stream-actions">${entry.local ? '<button type="button" class="stage-stop button button-danger">' + icon2("square", "icon-sm") + "<span>Parar transmiss\xE3o</span></button>" : ""}<button class="card-more" title="Mais op\xE7\xF5es" aria-expanded="false">${icon2("more")}</button><div class="stream-menu" role="menu" hidden><button type="button" role="menuitem" data-action="expand">${icon2("maximize-2")}<span></span></button><button type="button" role="menuitem" data-action="fullscreen">${icon2("fullscreen")}<span></span></button>${entry.local ? '<button type="button" role="menuitem" data-action="stop" class="danger">' + icon2("square") + "<span>Parar transmiss\xE3o</span></button>" : '<button type="button" role="menuitem" data-action="mute">' + icon2("volume-x") + '<span></span></button><button type="button" role="menuitem" data-action="kick" class="danger" hidden>' + icon2("user-x") + "<span>Expulsar e bloquear</span></button>"}</div></div></div>`;
      const $in = (selector) => card.querySelector(selector);
      const tile = { id, card, local: !!entry.local, video: $in("video"), status: $in(".stream-status"), quality: $in(".quality-badge"), expand: $in(".stream-expand"), fullscreen: $in(".stream-fullscreen"), volume: $in(".stream-volume input"), volumeLabel: $in(".stream-volume span"), avatar: $in(".person-avatar"), name: $in(".stream-info strong"), info: $in(".stream-info small"), more: $in(".card-more"), menu: $in(".stream-menu"), stream: null, call: null, mediaAbort: null, noFrameTimer: null, frameRequest: null, firstFrame: false, failure: null, mediaState: "" };
      if (tile.local) tile.video.muted = true;
      card.addEventListener("click", (e) => {
        if (e.target.closest("input,button,.stream-menu")) return;
        closeStreamMenus2();
        if (tile.stream && tile.video.paused) tile.video.play().catch(() => {
        });
        focusStream2(id);
      });
      card.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === card) {
          e.preventDefault();
          focusStream2(id);
        }
      });
      $in(".stage-stop")?.addEventListener("click", (e) => {
        e.stopPropagation();
        stopSharing2();
      });
      tile.fullscreen.addEventListener("click", (e) => {
        e.stopPropagation();
        setTheaterMode2(card);
      });
      tile.expand.addEventListener("click", (e) => {
        e.stopPropagation();
        setExpandedMode2(card);
      });
      $in(".stream-visual").addEventListener("dblclick", (e) => {
        if (!e.target.closest("button,input")) setTheaterMode2(card);
      });
      tile.volume.addEventListener("input", (e) => {
        const level = Math.min(100, Math.max(0, Math.round(Number(e.target.value)) || 0));
        playbackPrefs2(id).volume = level;
        applyPlayback2(tile);
      });
      tile.more.addEventListener("click", (e) => {
        e.stopPropagation();
        closeStreamMenus2(tile.menu);
        tile.menu.hidden = !tile.menu.hidden;
        tile.more.setAttribute("aria-expanded", String(!tile.menu.hidden));
        if (!tile.menu.hidden) tile.menu.querySelector("button:not([hidden])")?.focus();
      });
      tile.menu.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          tile.menu.hidden = true;
          tile.more.setAttribute("aria-expanded", "false");
          tile.more.focus();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const items = [...tile.menu.querySelectorAll("button:not([hidden])")];
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document2.activeElement), next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      });
      tile.menu.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]")?.dataset.action;
        if (!action) return;
        e.stopPropagation();
        tile.menu.hidden = true;
        tile.more.setAttribute("aria-expanded", "false");
        const current = state2.streams.get(id);
        if (!current) return;
        if (action === "fullscreen") setTheaterMode2(card);
        if (action === "expand") setExpandedMode2(card);
        if (action === "mute") {
          const prefs = playbackPrefs2(id);
          prefs.muted = !prefs.muted;
          applyPlayback2(tile);
        }
        if (action === "stop" && current.local) stopSharing2();
        if (action === "kick" && !current.local && state2.isHost) {
          const room = currentRoom2(), ownerId = current.ownerId;
          if (room) confirmedRoomAction2(`kick:${room.code}:${ownerId}`, { title: "Remover participante?", message: `${current.name} \xB7 ${tr2("Esta pessoa ser\xE1 expulsa e bloqueada nesta sala.")}`, confirm: "Expulsar e bloquear", cancel: "Cancelar" }, () => currentRoom2()?.code === room.code && state2.user?.uid === room.ownerUid && state2.streams.get(id)?.ownerId === ownerId, () => kickMember2(ownerId));
        }
      });
      return tile;
    }
    function applyPlayback2(tile) {
      const prefs = playbackPrefs2(tile.id);
      tile.video.volume = prefs.volume / 100;
      tile.video.muted = tile.local || prefs.muted;
      if (Number(tile.volume.value) !== prefs.volume) tile.volume.value = String(prefs.volume);
      setText2(tile.volumeLabel, prefs.volume + "%");
      const mute = tile.menu.querySelector('[data-action="mute"] span');
      if (mute) setText2(mute, prefs.muted ? "Ativar \xE1udio" : "Silenciar \xE1udio");
    }
    function tileMediaState2(tile) {
      if (tile.failure) return "failed";
      const tracks = tile.stream?.getVideoTracks() || [];
      if (tracks.length && tracks.every((track) => track.readyState === "ended")) return "ended";
      if (!tile.firstFrame) return "waiting";
      const connection = mediaConnectionState(tile.call);
      if (tracks.some((track) => track.muted) || connection === "disconnected" || connection === "failed") return "stalled";
      return tile.video.paused ? "paused" : "live";
    }
    function refreshTileMediaState2(tile) {
      const next = tileMediaState2(tile);
      if (next === tile.mediaState) return;
      tile.mediaState = next;
      tile.card.dataset.mediaState = next;
      const text = STATUS_TEXT[next];
      tile.status.hidden = !text;
      if (text) setText2(tile.status, text);
    }
    function setTileFailure2(tile, message, recoverable = false) {
      if (tile.failure && !tile.failure.recoverable) return;
      tile.failure = { message, recoverable };
      tile.card.querySelector(".stream-error")?.remove();
      showStreamError2(tile.card, message);
      refreshTileMediaState2(tile);
    }
    function stopTileMediaWatch2(tile) {
      tile.mediaAbort?.abort();
      tile.mediaAbort = null;
      clearTimeout(tile.noFrameTimer);
      tile.noFrameTimer = null;
      if (tile.frameRequest !== null) {
        tile.video.cancelVideoFrameCallback?.(tile.frameRequest);
        tile.frameRequest = null;
      }
    }
    function attachTileMedia2(tile, entry) {
      stopTileMediaWatch2(tile);
      const stream = entry.stream, video = tile.video, controller = new AbortController(), signal = controller.signal;
      tile.mediaAbort = controller;
      tile.stream = stream;
      tile.call = entry.call || null;
      tile.firstFrame = false;
      tile.failure = null;
      tile.card.querySelector(".stream-error")?.remove();
      applyPlayback2(tile);
      video.srcObject = stream;
      const isCurrent = () => tile.stream === stream && !signal.aborted;
      const onFirstFrame = () => {
        tile.frameRequest = null;
        if (!isCurrent() || tile.firstFrame) return;
        tile.firstFrame = true;
        clearTimeout(tile.noFrameTimer);
        tile.noFrameTimer = null;
        if (tile.failure?.recoverable) {
          tile.failure = null;
          tile.card.querySelector(".stream-error")?.remove();
        }
        refreshTileMediaState2(tile);
      };
      if (video.requestVideoFrameCallback) tile.frameRequest = video.requestVideoFrameCallback(onFirstFrame);
      video.addEventListener("loadeddata", () => {
        if (video.videoWidth) onFirstFrame();
      }, { signal });
      video.addEventListener("loadedmetadata", () => video.play().catch((error) => {
        if (!isCurrent()) return;
        console.warn("Reprodu\xE7\xE3o da transmiss\xE3o:", error);
        setTileFailure2(tile, "O navegador n\xE3o conseguiu iniciar o v\xEDdeo. Clique na transmiss\xE3o para tentar novamente.", true);
      }), { signal });
      for (const type of ["playing", "pause"]) video.addEventListener(type, () => {
        if (type === "playing" && tile.failure?.recoverable && tile.firstFrame) {
          tile.failure = null;
          tile.card.querySelector(".stream-error")?.remove();
        }
        refreshTileMediaState2(tile);
      }, { signal });
      video.addEventListener("error", () => {
        if (isCurrent()) setTileFailure2(tile, "N\xE3o foi poss\xEDvel decodificar o v\xEDdeo recebido. Pe\xE7a para iniciar a transmiss\xE3o novamente.");
      }, { signal });
      for (const track of stream.getVideoTracks()) for (const type of ["mute", "unmute", "ended"]) track.addEventListener(type, () => refreshTileMediaState2(tile), { signal });
      observeMediaConnection(tile.call, () => refreshTileMediaState2(tile), signal);
      video.play().catch((error) => {
        if (!entry.local) console.warn("Autoplay remoto:", error);
      });
      if (!entry.local && stream.getVideoTracks().length) tile.noFrameTimer = setTimeout(() => {
        tile.noFrameTimer = null;
        if (isCurrent() && !tile.firstFrame) setTileFailure2(tile, "A transmiss\xE3o est\xE1 conectada, mas ainda n\xE3o chegou imagem. Pe\xE7a para compartilhar novamente.", true);
      }, NO_FRAME_TIMEOUT_MS);
      if (entry.mediaIssue) setTileFailure2(tile, entry.mediaIssue);
      refreshTileMediaState2(tile);
    }
    function updateStreamTile2(tile, entry) {
      const id = tile.id, expanded = state2.expandedId === id, theater = state2.theaterId === id;
      const focused = state2.focusedId === id;
      tile.card.classList.toggle("is-focused", focused);
      tile.card.classList.toggle("is-local", tile.local);
      tile.card.classList.toggle("expanded", expanded);
      tile.card.classList.toggle("theater", theater);
      tile.card.style.order = focused ? "-1" : "";
      setAttr2(tile.card, "aria-label", `${entry.name} \xB7 ${entry.appName || "Compartilhamento"}`);
      setAttr2(tile.card, "aria-current", focused ? "true" : "false");
      setText2(tile.quality, qualityLabel2(id, entry));
      setAttr2(tile.quality, "title", qualityTitle2(id));
      const expandTitle = expanded ? "Voltar ao tamanho normal" : "Ampliar transmiss\xE3o";
      setAttr2(tile.expand, "title", tr2(expandTitle));
      setAttr2(tile.expand, "aria-label", tr2(expandTitle));
      setText2(tile.expand.querySelector("span"), expanded ? "Voltar" : "Ampliar");
      setAttr2(tile.fullscreen, "aria-label", `${tr2(theater ? "Sair da tela cheia" : "Abrir em tela cheia")} \xB7 ${entry.name}`);
      setAttr2(tile.fullscreen, "aria-pressed", String(theater));
      setText2(tile.fullscreen.querySelector("span"), theater ? "Sair da tela cheia" : "Tela cheia");
      setAttr2(tile.volume, "aria-label", `${tr2("Volume da transmiss\xE3o")} \xB7 ${entry.name}`);
      setAttr2(tile.more, "aria-label", `${tr2("Mais op\xE7\xF5es")} \xB7 ${entry.name}`);
      const hasAudio = !!entry.stream?.getAudioTracks().length;
      tile.volume.parentElement.hidden = !hasAudio;
      const muteAction = tile.menu.querySelector('[data-action="mute"]');
      if (muteAction) muteAction.hidden = !hasAudio;
      const owner = entry.local ? state2.isHost : entry.uid === state2.currentRoomData?.ownerUid;
      const safeColor = /^#[0-9a-f]{6}$/i.test(entry.color || "") ? entry.color : avatarColor2(id);
      setStyle2(tile.avatar, entry.photo ? `background:center/cover url('${esc2(entry.photo)}')` : `background:${safeColor}`);
      setText2(tile.avatar, entry.photo ? "" : entry.name.slice(0, 1).toUpperCase());
      setHTML2(tile.name, `${esc2(entry.name)}${entry.local ? " (voc\xEA)" : ""}${owner ? '<span class="owner-crown" role="img" title="Dono da sala" aria-label="Dono da sala">' + icon2("crown", "icon-sm") + "</span>" : ""}`);
      setText2(tile.info, `${entry.appName || "Compartilhamento"} \xB7 ${entry.sourceType || "TELA"}`);
      const mirror = tile.card.querySelector(".local-mirror-cover");
      if (mirror) mirror.hidden = !(entry.local && entry.sourceType === "Janela" && /\bfoco\b/i.test(entry.sourceName || ""));
      setText2(tile.menu.querySelector('[data-action="expand"] span'), expanded ? "Voltar ao tamanho normal" : "Ampliar");
      setText2(tile.menu.querySelector('[data-action="fullscreen"] span'), theater ? "Sair da tela cheia" : "Abrir em tela cheia");
      const kick = tile.menu.querySelector('[data-action="kick"]');
      if (kick) kick.hidden = !state2.isHost;
      applyPlayback2(tile);
    }
    function destroyStreamTile2(tile) {
      stopTileMediaWatch2(tile);
      tile.video.pause();
      tile.video.srcObject = null;
      tile.stream = null;
      tile.call = null;
      tile.card.remove();
      state2.streamTiles.delete(tile.id);
    }
    function refreshStreamTiles2() {
      for (const [id, tile] of state2.streamTiles) {
        const entry = state2.streams.get(id);
        if (entry) updateStreamTile2(tile, entry);
      }
    }
    function updatePendingTile2(uid, member) {
      let card = state2.pendingTiles.get(uid);
      if (!card) {
        card = document2.createElement("article");
        card.className = "stream-card pending-stream";
        card.dataset.pendingUid = uid;
        card.innerHTML = `<div class="stream-visual"><div class="pending-stream-message">${icon2("loader", "icon-spin")}<strong></strong><small>Conectando ao v\xEDdeo\u2026</small><button type="button" class="manage-small" data-retry-uid="${esc2(uid)}">Tentar reconectar v\xEDdeo</button></div></div><div class="stream-meta"><span class="person-avatar"></span><div class="stream-info"><strong></strong><small></small></div></div>`;
        card.querySelector("[data-retry-uid]").addEventListener("click", () => {
          const m = state2.members.get(uid);
          if (!m) return;
          const connection = state2.dataConnections.get(m.peerId);
          if (connection?.open) {
            connection.send({ type: "retry-stream" });
            toast2("Pedido de reconex\xE3o enviado.");
          } else {
            ensureDataConnection2(uid, m.peerId);
            toast2("Reconectando ao participante\u2026");
          }
        });
        state2.pendingTiles.set(uid, card);
      }
      card.dataset.mediaState = state2.incomingCalls.has(member.peerId) ? "connecting" : "announced";
      const name = member.nickname || member.username;
      setText2(card.querySelector(".pending-stream-message strong"), tr2(`${name} est\xE1 transmitindo`));
      setStyle2(card.querySelector(".person-avatar"), member.photo ? `background:center/cover url('${esc2(member.photo)}')` : `background:${esc2(member.color || avatarColor2(uid))}`);
      setText2(card.querySelector(".person-avatar"), member.photo ? "" : (member.nickname || "?").slice(0, 1).toUpperCase());
      setText2(card.querySelector(".stream-info strong"), name);
      setText2(card.querySelector(".stream-info small"), `${tr2("Aguardando v\xEDdeo")} \xB7 ${member.status || tr2("Online")}`);
      return card;
    }
    let streamsEmptyState = null;
    function updateStageGeometry2() {
      const stage2 = $2("#stage"), grid = $2("#streamGrid"), width = stage2.clientWidth, height = Math.max(0, stage2.clientHeight - 44);
      if (!width || !height) return;
      grid.dataset.orientation = width >= height * 1.35 ? "wide" : "tall";
      const count = Number(grid.dataset.count) || 0;
      let best = 1, bestArea = 0;
      for (let cols = 1; cols <= Math.min(count, 5); cols++) {
        const rows = Math.ceil(count / cols), cellWidth = (width - 8 * (cols - 1)) / cols, videoHeight = (height - 8 * (rows - 1)) / rows - 44;
        if (videoHeight <= 0) continue;
        const fittedWidth = Math.min(cellWidth, videoHeight * 16 / 9), fittedHeight = Math.min(videoHeight, cellWidth * 9 / 16);
        const area = fittedWidth * fittedHeight;
        if (area > bestArea) {
          bestArea = area;
          best = cols;
        }
      }
      grid.style.setProperty("--grid-cols", String(best));
    }
    function renderStreams2() {
      const entries = [...state2.streams.entries()];
      if (!entries.length) state2.localFocusChosen = false;
      if (!state2.focusedId || !state2.streams.has(state2.focusedId)) state2.focusedId = stageIds2()[0] || null;
      if (state2.streams.get(state2.focusedId)?.local && !state2.localFocusChosen) {
        const remote = stageIds2().find((id) => !state2.streams.get(id)?.local);
        if (remote) state2.focusedId = remote;
      }
      if (state2.theaterId && !state2.streams.has(state2.theaterId) && document2.fullscreenElement) document2.exitFullscreen().catch(() => {
      });
      if (state2.expandedId && !state2.streams.has(state2.expandedId)) {
        state2.expandedId = null;
      }
      for (const tile of [...state2.streamTiles.values()]) {
        const entry = state2.streams.get(tile.id);
        if (!entry || !!entry.local !== tile.local) destroyStreamTile2(tile);
      }
      const nodes = [];
      for (const [id, entry] of entries) {
        let tile = state2.streamTiles.get(id);
        if (!tile) {
          tile = createStreamTile2(id, entry);
          state2.streamTiles.set(id, tile);
        }
        if (tile.stream !== entry.stream || tile.call !== (entry.call || null)) attachTileMedia2(tile, entry);
        updateStreamTile2(tile, entry);
        nodes.push(tile.card);
      }
      const pending = [...state2.members.entries()].filter(([uid, member]) => member.streaming && !entries.some(([, stream]) => stream.uid === uid || stream.ownerId === member.peerId));
      const pendingIds = new Set(pending.map(([uid]) => uid));
      for (const [uid, card] of state2.pendingTiles) if (!pendingIds.has(uid)) {
        card.remove();
        state2.pendingTiles.delete(uid);
      }
      for (const [uid, member] of pending) nodes.push(updatePendingTile2(uid, member));
      if (!nodes.length) {
        if (!streamsEmptyState) {
          streamsEmptyState = document2.createElement("div");
          streamsEmptyState.className = "streams-empty";
          streamsEmptyState.innerHTML = icon2("monitor") + '<strong>Ningu\xE9m est\xE1 transmitindo ainda</strong><small>Quando algu\xE9m compartilhar a tela, ela aparece aqui.</small><div class="empty-actions"><button type="button" class="button button-primary" id="stageShare">' + icon2("monitor-up", "icon-sm") + '<span>Compartilhar tela</span></button><button type="button" class="button button-quiet" id="stageInvite">' + icon2("link", "icon-sm") + "<span>Copiar link de convite</span></button></div>";
          streamsEmptyState.querySelector("#stageShare").onclick = () => $2("#shareButton").click();
          streamsEmptyState.querySelector("#stageInvite").onclick = () => $2("#inviteButton").click();
        }
        streamsEmptyState.querySelector("#stageShare").disabled = !state2.canStream || !state2.peer?.open;
        nodes.push(streamsEmptyState);
      }
      const grid = $2("#streamGrid");
      for (const child of [...grid.children]) if (!nodes.includes(child)) child.remove();
      nodes.forEach((node, index) => {
        if (grid.children[index] !== node) grid.insertBefore(node, grid.children[index] || null);
      });
      grid.classList.toggle("grid-view", state2.displayMode === "grid");
      grid.dataset.count = String(nodes[0] === streamsEmptyState ? 0 : nodes.length);
      grid.dataset.localOnly = String(entries.length === 1 && !!entries[0][1].local && pending.length === 0);
      grid.style.setProperty("--strip-cols", String(Math.min(Math.max(nodes.length - 1, 1), 5)));
      $2("#streamCount").textContent = entries.length + pending.length;
      updateStageGeometry2();
    }
    async function sampleStreamQuality2(streamId, stream) {
      const metric = await readStreamQuality(streamId, stream);
      if (!metric) return;
      if (state2.streams.get(streamId) !== stream) return;
      state2.streamQualityMetrics.set(streamId, metric);
      const tile = state2.streamTiles.get(streamId);
      if (tile) {
        setText2(tile.quality, qualityLabel2(streamId, stream));
        setAttr2(tile.quality, "title", qualityTitle2(streamId));
      }
    }
    function refreshStreamQuality2() {
      for (const [id, stream] of state2.streams) sampleStreamQuality2(id, stream);
    }
    function showStreamError2(card, message) {
      if (!card || card.querySelector(".stream-error")) return;
      const panel = document2.createElement("div");
      panel.className = "stream-error";
      panel.setAttribute("role", "status");
      panel.textContent = tr2(message);
      card.querySelector(".stream-visual")?.append(panel);
    }
    return { syncFullscreenState: syncFullscreenState2, setTheaterMode: setTheaterMode2, setExpandedMode: setExpandedMode2, setText: setText2, setHTML: setHTML2, setAttr: setAttr2, setStyle: setStyle2, playbackPrefs: playbackPrefs2, qualityLabel: qualityLabel2, qualityTitle: qualityTitle2, closeStreamMenus: closeStreamMenus2, focusStream: focusStream2, stageIds: stageIds2, cycleStage: cycleStage2, createStreamTile: createStreamTile2, applyPlayback: applyPlayback2, tileMediaState: tileMediaState2, refreshTileMediaState: refreshTileMediaState2, setTileFailure: setTileFailure2, stopTileMediaWatch: stopTileMediaWatch2, attachTileMedia: attachTileMedia2, updateStreamTile: updateStreamTile2, destroyStreamTile: destroyStreamTile2, refreshStreamTiles: refreshStreamTiles2, updatePendingTile: updatePendingTile2, updateStageGeometry: updateStageGeometry2, renderStreams: renderStreams2, sampleStreamQuality: sampleStreamQuality2, refreshStreamQuality: refreshStreamQuality2, showStreamError: showStreamError2, get fullscreenReturnFocus() {
      return fullscreenReturnFocus;
    } };
  }

  // renderer/app/p2p.js
  function createP2P(ports) {
    const {
      state: state2,
      cloud,
      p2pContext: p2pContext2,
      sameP2PSession: sameP2PSession2,
      currentP2P: currentP2P2,
      sameRoomIdentity: sameRoomIdentity2,
      renderPeople: renderPeople2,
      renderStreams: renderStreams2,
      setRoomStatus: setRoomStatus2,
      toast: toast2,
      qualityProfiles
    } = ports;
    const P2P_AUTH_WAIT_MS = 4e3;
    const P2P_VERIFY_MS = 5e3;
    function memberForPeer2(peerId) {
      let found = null;
      for (const [uid, member] of state2.members) if (member.peerId === peerId && member.online !== false) {
        if (found) return null;
        found = { uid, member };
      }
      return found;
    }
    function revokePeer2(peerId) {
      const outgoing = state2.calls.get(peerId), incoming = state2.incomingCalls.get(peerId), playing = state2.streams.get(peerId)?.call, conn = state2.dataConnections.get(peerId);
      if (outgoing) {
        state2.calls.delete(peerId);
        outgoing.close();
      }
      if (incoming) {
        state2.incomingCalls.delete(peerId);
        incoming.close();
      }
      if (playing && playing !== incoming) playing.close();
      if (conn) {
        state2.dataConnections.delete(peerId);
        conn.close();
      }
      state2.pendingOutgoingCalls.delete(peerId);
      state2.lastRetryAt.delete(peerId);
      removeRemoteStream2(peerId);
    }
    async function authorizePeer2(peerId, context, { publishing = false, localPublishing = false } = {}) {
      if (typeof peerId !== "string" || !peerId || peerId === context.peer?.id || !sameP2PSession2(context)) return null;
      const deadline = Date.now() + P2P_AUTH_WAIT_MS;
      while (!state2.membersLoaded && sameP2PSession2(context) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
      if (!state2.membersLoaded || !currentP2P2(context)) return null;
      const found = memberForPeer2(peerId);
      if (!found || publishing && found.member.canStream === false || localPublishing && state2.ownMember?.canStream === false || typeof cloud()?.verifyRoomPeer !== "function") return null;
      let timeoutId;
      try {
        const result = await Promise.race([Promise.all([
          cloud().verifyRoomPeer(context.room, found.uid, peerId),
          localPublishing ? cloud().verifyRoomPeer(context.room, context.userId, context.peer.id) : Promise.resolve(null)
        ]), new Promise((resolve) => {
          timeoutId = setTimeout(() => resolve(null), P2P_VERIFY_MS);
        })]);
        if (!result) return null;
        const [verified, localVerified] = result;
        const latest = memberForPeer2(peerId);
        return currentP2P2(context) && latest?.uid === found.uid && latest.member === found.member && verified?.uid === found.uid && verified.peerId === peerId && (!publishing || verified.canStream !== false && latest.member.canStream !== false) && (!localPublishing || localVerified?.uid === context.userId && localVerified.peerId === context.peer.id && localVerified.canStream !== false && state2.ownMember?.canStream !== false) ? latest : null;
      } catch (error) {
        console.warn("Autoriza\xE7\xE3o P2P indispon\xEDvel:", error);
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    function sendToAll2(message) {
      for (const [peerId, conn] of state2.dataConnections) if (conn.open && memberForPeer2(peerId)) conn.send(message);
    }
    function handleData2(conn, peer = state2.peer) {
      const context = p2pContext2(peer);
      if (!conn || typeof conn.peer !== "string" || !conn.peer || !context.room || !context.peer) {
        conn?.close?.();
        return;
      }
      const previous = state2.dataConnections.get(conn.peer);
      if (previous && previous !== conn) previous.close();
      state2.dataConnections.set(conn.peer, conn);
      authorizePeer2(conn.peer, context).then((member) => {
        if (!member && state2.dataConnections.get(conn.peer) === conn) {
          state2.dataConnections.delete(conn.peer);
          conn.close();
        }
      });
      conn.on("data", async (message) => {
        if (state2.dataConnections.get(conn.peer) !== conn || !sameP2PSession2(context)) return;
        if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") return;
        if (!["hello", "retry-stream", "publisher-start", "publisher-stop"].includes(message.type)) return;
        if (message.peerId !== void 0 && message.peerId !== conn.peer || message.roomId !== void 0 && message.roomId !== context.room) {
          conn.close();
          return;
        }
        const member = await authorizePeer2(conn.peer, context, { publishing: message.type === "publisher-start" });
        if (!member || state2.dataConnections.get(conn.peer) !== conn) {
          if (state2.dataConnections.get(conn.peer) === conn) conn.close();
          return;
        }
        if (message.userId !== void 0 && message.userId !== member.uid) {
          conn.close();
          return;
        }
        if (message.type === "hello") {
          if (state2.isHost) toast2(`${member.member.nickname || member.member.name} entrou na sala`);
          return;
        }
        if (message.type === "retry-stream") {
          if (state2.localStream) await ensureCall2(conn.peer, state2.localStream, { replace: true, context });
          return;
        }
        if (message.type === "publisher-start") {
          member.member.streaming = true;
          renderPeople2();
          toast2(`${member.member.nickname || member.member.name} come\xE7ou a transmitir`);
          return;
        }
        const current = state2.streams.get(conn.peer);
        if (current && !current.local) removeRemoteStream2(conn.peer);
        member.member.streaming = false;
        renderPeople2();
      });
      conn.on("close", () => {
        if (state2.dataConnections.get(conn.peer) === conn) {
          state2.dataConnections.delete(conn.peer);
          renderPeople2();
        }
      });
    }
    function ensureDataConnection2(uid, peerId) {
      if (!state2.peer || !uid || !peerId || uid === state2.user?.uid || peerId === state2.peer.id || state2.dataConnections.has(peerId)) return;
      if (state2.user.uid.localeCompare(uid) > 0) return;
      const conn = state2.peer.connect(peerId, { reliable: true, metadata: { name: state2.nickname, userId: state2.user.uid } });
      handleData2(conn);
      conn.on("open", () => {
        if (state2.dataConnections.get(peerId) === conn) conn.send({ type: "hello" });
      });
    }
    function ensureCall2(peerId, stream = state2.localStream, { replace = false, context = p2pContext2() } = {}) {
      if (!stream || state2.localStream !== stream || !currentP2P2(context) || !memberForPeer2(peerId)) return Promise.resolve(null);
      if (state2.pendingOutgoingCalls.has(peerId)) return state2.pendingOutgoingCalls.get(peerId);
      if (!replace && state2.calls.has(peerId)) return Promise.resolve(state2.calls.get(peerId));
      if (replace) {
        const last = state2.lastRetryAt.get(peerId) || 0;
        if (Date.now() - last < 1e3) return Promise.resolve(state2.calls.get(peerId) || null);
        state2.lastRetryAt.set(peerId, Date.now());
      }
      const operation = (async () => {
        const member = await authorizePeer2(peerId, context, { localPublishing: true });
        if (!member || state2.localStream !== stream || !currentP2P2(context)) return null;
        if (replace) {
          const old = state2.calls.get(peerId);
          if (old) {
            state2.calls.delete(peerId);
            old.close();
          }
        } else if (state2.calls.has(peerId)) return state2.calls.get(peerId);
        if (!memberForPeer2(peerId) || !currentP2P2(context) || state2.localStream !== stream) return null;
        let call;
        try {
          call = context.peer.call(peerId, stream, { metadata: { name: state2.nickname, userId: state2.user?.uid, roomId: context.room, appName: state2.localSource?.audioName || state2.localSource?.name || "Aplicativo", sourceType: state2.localSource?.type === "screen" ? "Tela inteira" : "Janela", quality: state2.localQuality, hasAudio: stream.getAudioTracks().length > 0, ownerId: context.peer.id } });
        } catch (error) {
          console.warn("N\xE3o foi poss\xEDvel iniciar chamada P2P:", error);
          return null;
        }
        if (!call) return null;
        state2.calls.set(peerId, call);
        watchMediaConnection2(call);
        configureCallQuality2();
        call.on("close", () => {
          if (state2.calls.get(peerId) === call) {
            state2.calls.delete(peerId);
            configureCallQuality2();
          }
        });
        call.on("error", (err) => {
          if (!currentP2P2(context) || state2.calls.get(peerId) !== call) return;
          console.error("Falha na chamada de v\xEDdeo:", err);
          toast2("Falha ao conectar o v\xEDdeo. Tentando recuperar a transmiss\xE3o.");
        });
        return call;
      })();
      state2.pendingOutgoingCalls.set(peerId, operation);
      operation.finally(() => {
        if (state2.pendingOutgoingCalls.get(peerId) === operation) state2.pendingOutgoingCalls.delete(peerId);
      });
      return operation;
    }
    function watchMediaConnection2(call) {
      const context = p2pContext2();
      const connection = call.peerConnection;
      if (!connection) return;
      connection.addEventListener("connectionstatechange", () => {
        if (!currentP2P2(context) || !memberForPeer2(call.peer) || state2.calls.get(call.peer) !== call && state2.incomingCalls.get(call.peer) !== call) return;
        if (connection.connectionState === "connected") {
          state2.recoveryAttempts.delete(call.peer);
          setRoomStatus2("V\xEDdeo conectado \xB7 P2P", true);
          return;
        }
        if (connection.connectionState === "disconnected") {
          setRoomStatus2("V\xEDdeo inst\xE1vel \xB7 aguardando rede");
          return;
        }
        if (connection.connectionState !== "failed") return;
        setRoomStatus2("V\xEDdeo interrompido \xB7 tentando recuperar");
        toast2("A conex\xE3o de v\xEDdeo caiu. O Foco vai tentar reconectar.");
        const attempts = state2.recoveryAttempts.get(call.peer) || 0;
        if (attempts >= 2) return;
        state2.recoveryAttempts.set(call.peer, attempts + 1);
        const timer = setTimeout(() => {
          state2.recoveryTimers.delete(timer);
          if (!currentP2P2(context) || state2.incomingCalls.get(call.peer) !== call && state2.calls.get(call.peer) !== call) return;
          const member = memberForPeer2(call.peer)?.member;
          const connection2 = state2.dataConnections.get(call.peer);
          if (member?.streaming && connection2?.open && !state2.streams.has(call.peer)) connection2.send({ type: "retry-stream" });
        }, 1800);
        state2.recoveryTimers.add(timer);
      });
    }
    function configureCallQuality2() {
      const profile = qualityProfiles[state2.localQualityProfile] || qualityProfiles["720p60"];
      const calls = [...state2.calls.values()].filter((call) => call.peerConnection && call.peerConnection.connectionState !== "closed");
      const perPeerCeiling = Math.max(5e5, Math.floor(profile.aggregateBitrate / Math.max(1, calls.length)));
      for (const call of calls) {
        const previous = state2.qualityTimers.get(call);
        if (previous) clearInterval(previous);
        let tries = 0;
        const timer = setInterval(async () => {
          tries++;
          const sender = call.peerConnection?.getSenders().find((item) => item.track?.kind === "video");
          if (!sender) {
            if (tries >= 30) {
              clearInterval(timer);
              state2.qualityTimers.delete(call);
            }
            return;
          }
          try {
            const params = sender.getParameters();
            if (!params.encodings?.length) {
              if (tries >= 30) {
                clearInterval(timer);
                state2.qualityTimers.delete(call);
              }
              return;
            }
            params.encodings[0].maxBitrate = perPeerCeiling;
            params.encodings[0].maxFramerate = profile.fps;
            params.encodings[0].priority = "high";
            params.degradationPreference = "maintain-resolution";
            await sender.setParameters(params);
            clearInterval(timer);
            state2.qualityTimers.delete(call);
          } catch (error) {
            if (tries >= 30) {
              clearInterval(timer);
              state2.qualityTimers.delete(call);
            } else console.debug("Ajuste autom\xE1tico de qualidade pendente:", error);
          }
        }, 350);
        state2.qualityTimers.set(call, timer);
      }
    }
    async function handleCall2(call, peer = state2.peer) {
      const context = p2pContext2(peer);
      if (!call || typeof call.peer !== "string" || !call.peer) {
        call?.close?.();
        return;
      }
      const previous = state2.incomingCalls.get(call.peer);
      state2.incomingCalls.set(call.peer, call);
      const member = await authorizePeer2(call.peer, context, { publishing: true });
      const meta = call.metadata;
      if (!member || state2.incomingCalls.get(call.peer) !== call || meta && typeof meta === "object" && (meta.userId !== void 0 && meta.userId !== member.uid || meta.ownerId !== void 0 && meta.ownerId !== call.peer || meta.roomId !== void 0 && meta.roomId !== context.room)) {
        if (state2.incomingCalls.get(call.peer) === call) {
          if (previous && !previous.closed) state2.incomingCalls.set(call.peer, previous);
          else state2.incomingCalls.delete(call.peer);
        }
        call.close();
        return;
      }
      try {
        call.answer();
      } catch (error) {
        console.error("N\xE3o foi poss\xEDvel responder \xE0 chamada:", error);
        toast2("N\xE3o foi poss\xEDvel aceitar a transmiss\xE3o recebida.");
        call.close();
        return;
      }
      const connection = call.peerConnection;
      watchMediaConnection2(call);
      call.on("stream", (stream) => {
        if (state2.incomingCalls.get(call.peer) !== call || !currentP2P2(context) || memberForPeer2(call.peer)?.uid !== member.uid) return;
        if (!stream?.getVideoTracks?.().length) {
          call.close();
          state2.incomingCalls.delete(call.peer);
          const active = memberForPeer2(call.peer);
          if (active) active.member.streaming = true;
          renderStreams2();
          toast2(`${active?.member.nickname || "Participante"} conectou sem enviar v\xEDdeo. O Foco vai solicitar uma nova tentativa.`);
          const data = state2.dataConnections.get(call.peer);
          if (data?.open) data.send({ type: "retry-stream" });
          return;
        }
        const profile = memberForPeer2(call.peer)?.member || {};
        state2.streams.set(call.peer, { stream, name: profile.nickname || "Participante", appName: typeof meta?.appName === "string" ? meta.appName.slice(0, 80) : "Compartilhamento", sourceType: typeof meta?.sourceType === "string" ? meta.sourceType.slice(0, 40) : "TELA", ownerId: call.peer, uid: member.uid, quality: typeof meta?.quality === "string" ? meta.quality.slice(0, 40) : "Conex\xE3o direta", photo: profile.photo || "", color: profile.color, call });
        profile.streaming = true;
        renderStreams2();
        renderPeople2();
        if (previous && previous !== call) previous.close();
      });
      call.on("close", () => {
        if (state2.incomingCalls.get(call.peer) === call) state2.incomingCalls.delete(call.peer);
        if (!sameRoomIdentity2(context)) return;
        const id = call.peer, current = state2.streams.get(id);
        if (current?.call && current.call !== call) return;
        removeRemoteStream2(id);
      });
      call.on("error", (err) => {
        if (!currentP2P2(context) || state2.incomingCalls.get(call.peer) !== call) return;
        console.error("Falha na m\xEDdia recebida:", err);
        toast2("O v\xEDdeo do participante n\xE3o conectou. Tente iniciar a transmiss\xE3o novamente.");
      });
    }
    function removeRemoteStream2(peerId) {
      state2.streams.delete(peerId);
      state2.streamQualityMetrics.delete(peerId);
      for (const key of state2.qualitySamples.keys()) if (key.startsWith(`${peerId}:`)) state2.qualitySamples.delete(key);
      renderStreams2();
    }
    function mediaConnectionState(call) {
      return call?.peerConnection?.connectionState;
    }
    function observeMediaConnection(call, handler, signal) {
      call?.peerConnection?.addEventListener?.("connectionstatechange", handler, { signal });
    }
    async function readStreamQuality(streamId, stream) {
      const calls = stream.local ? [...state2.calls.values()] : [...state2.incomingCalls.values()].filter((call) => call.peer === streamId || call.metadata?.ownerId === streamId);
      const samples = [];
      for (const call of calls) {
        const pc = call.peerConnection;
        if (!pc || pc.connectionState === "closed") continue;
        try {
          const report = await pc.getStats();
          let bytes = 0, width = 0, height = 0, fps = 0, reason = "none", rtt = 0, mediaFound = false;
          for (const item of report.values()) {
            const videoStat = (item.type === "outbound-rtp" || item.type === "inbound-rtp") && (item.kind === "video" || item.mediaType === "video");
            if (videoStat) {
              mediaFound = true;
              const byteValue = Number(stream.local ? item.bytesSent : item.bytesReceived) || 0;
              bytes += byteValue;
              width = Math.max(width, Number(item.frameWidth) || 0);
              height = Math.max(height, Number(item.frameHeight) || 0);
              fps = Math.max(fps, Number(item.framesPerSecond) || 0);
              if (item.qualityLimitationReason) reason = item.qualityLimitationReason;
              const sampleKey = `${streamId}:${call.peer}:${item.id}`, previous = state2.qualitySamples.get(sampleKey);
              if (previous && item.timestamp > previous.timestamp && byteValue >= previous.bytes) {
                const rate = (byteValue - previous.bytes) * 8 / ((item.timestamp - previous.timestamp) / 1e3);
                samples.push({ bitrate: rate, width: Number(item.frameWidth) || 0, height: Number(item.frameHeight) || 0, fps: Number(item.framesPerSecond) || 0, reason: item.qualityLimitationReason || "none" });
              }
              state2.qualitySamples.set(sampleKey, { bytes: byteValue, timestamp: item.timestamp });
            }
            if (item.type === "candidate-pair" && item.state === "succeeded" && item.nominated) rtt = Math.max(rtt, (Number(item.currentRoundTripTime) || 0) * 1e3);
          }
          if (mediaFound) samples.push({ width, height, fps, reason, rtt });
        } catch (error) {
          console.debug("Estat\xEDsticas de transmiss\xE3o indispon\xEDveis:", error);
        }
      }
      if (!samples.length) return null;
      return { width: Math.max(...samples.map((s) => s.width || 0)), height: Math.max(...samples.map((s) => s.height || 0)), fps: Math.round(Math.max(...samples.map((s) => s.fps || 0))), bitrate: samples.reduce((sum, s) => sum + (s.bitrate || 0), 0), rtt: Math.max(...samples.map((s) => s.rtt || 0)), reason: samples.find((s) => s.reason && s.reason !== "none")?.reason || "none" };
    }
    return {
      memberForPeer: memberForPeer2,
      revokePeer: revokePeer2,
      authorizePeer: authorizePeer2,
      sendToAll: sendToAll2,
      handleData: handleData2,
      ensureDataConnection: ensureDataConnection2,
      ensureCall: ensureCall2,
      watchMediaConnection: watchMediaConnection2,
      configureCallQuality: configureCallQuality2,
      handleCall: handleCall2,
      removeRemoteStream: removeRemoteStream2,
      mediaConnectionState,
      observeMediaConnection,
      readStreamQuality
    };
  }

  // renderer/app/capture.js
  function createCapture(ports) {
    const {
      state: state2,
      $: $2,
      desktop,
      cloud,
      sharePicker: sharePicker2,
      selectedShareSource: selectedShareSource2,
      shareAudioSources: shareAudioSources2,
      populateShareAudio: populateShareAudio2,
      renderShareSources: renderShareSources2,
      sharePeerReady: sharePeerReady2,
      setShareStatus: setShareStatus2,
      updateShareControls: updateShareControls2,
      withShareTimeout: withShareTimeout2,
      qualityProfiles,
      ensureCall: ensureCall2,
      configureCallQuality: configureCallQuality2,
      sendToAll: sendToAll2,
      renderStreams: renderStreams2,
      renderPeople: renderPeople2,
      toast: toast2
    } = ports;
    let shareAttempt = null;
    let activeAudio = null;
    function shareCancelled() {
      const error = new Error("Share attempt cancelled");
      error.cancelled = true;
      return error;
    }
    async function startSharing2() {
      if (shareAttempt || state2.localStream) return;
      const source = selectedShareSource2(), audioId = $2("#audioSourceSelect").value, audioSource = shareAudioSources2().find((s) => s.id === audioId), withAudio = audioId !== "none";
      if (!source) {
        setShareStatus2("Selecione uma tela ou janela v\xE1lida.", "error");
        return;
      }
      if (withAudio && !audioSource) {
        setShareStatus2("Selecione um aplicativo de \xE1udio v\xE1lido ou Sem \xE1udio.", "error");
        return;
      }
      const qualityProfile = $2("#shareQuality").value, profile = qualityProfiles[qualityProfile] || qualityProfiles["720p60"];
      const op = { cancelled: false, room: state2.activeRoom, peer: state2.peer, audioToken: crypto.randomUUID() };
      shareAttempt = op;
      $2("#shareButton").disabled = true;
      updateShareControls2();
      const current = () => shareAttempt === op && !op.cancelled && $2("#shareDialog").open && state2.activeRoom === op.room && state2.peer === op.peer && op.peer?.open && !op.peer.disconnected && !op.peer.destroyed && state2.roomConnected && state2.canStream && !state2.localStream;
      const ensureCurrent = () => {
        if (!current()) {
          if (shareAttempt === op && !op.cancelled && $2("#shareDialog").open && state2.activeRoom === op.room && state2.peer === op.peer && !sharePeerReady2()) throw new Error("Conex\xE3o com a sala perdida. Aguarde a reconex\xE3o e tente novamente.");
          throw shareCancelled();
        }
      };
      let acquiredStream = null, acquiredContext = null, removeListener = null, audioRequested = false, announced = false, committed = false;
      try {
        setShareStatus2("Verificando fontes\u2026");
        const available = await withShareTimeout2(desktop().listSources(), 1e4, "A lista de fontes demorou para responder.");
        ensureCurrent();
        const confirmedSource = Array.isArray(available) ? available.find((s) => s.id === source.id && s.type === source.type) : null;
        const confirmedAudio = withAudio && Array.isArray(available) ? available.find((s) => s.id === audioSource.id && s.type === "window") : null;
        if (!confirmedSource || withAudio && !confirmedAudio) {
          sharePicker2.sources = Array.isArray(available) ? available : [];
          if (!confirmedSource) sharePicker2.selectedId = null;
          populateShareAudio2(withAudio ? audioSource.id : "none");
          renderShareSources2();
          throw new Error(!confirmedSource ? "A fonte selecionada n\xE3o est\xE1 mais dispon\xEDvel. Escolha outra fonte." : "O aplicativo de \xE1udio selecionado n\xE3o est\xE1 dispon\xEDvel.");
        }
        let pid = null;
        if (withAudio) {
          setShareStatus2("Preparando captura de \xE1udio\u2026");
          pid = await desktop().resolveProcess(audioSource.id);
          ensureCurrent();
        }
        setShareStatus2("Solicitando captura de tela\u2026");
        let captureTimedOut = false;
        const capturePromise = navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: source.id, maxWidth: profile.width, maxHeight: profile.height, maxFrameRate: profile.fps } } });
        capturePromise.then((stream) => {
          if (captureTimedOut) stream.getTracks().forEach((track2) => track2.stop());
        }, () => {
        });
        try {
          acquiredStream = await withShareTimeout2(capturePromise, 2e4, "A captura demorou para responder. Tente novamente.");
        } catch (error) {
          captureTimedOut = true;
          throw error;
        }
        ensureCurrent();
        const track = acquiredStream.getVideoTracks()[0];
        if (!track) throw new Error("A fonte n\xE3o forneceu v\xEDdeo. Escolha outra fonte.");
        track.contentHint = "motion";
        let worklet = null, destination = null;
        if (withAudio) {
          acquiredContext = new AudioContext({ sampleRate: 48e3 });
          await acquiredContext.audioWorklet.addModule(new URL("audio-worklet.js", window.location.href).href);
          ensureCurrent();
          worklet = new AudioWorkletNode(acquiredContext, "pcm-loopback-player", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
          destination = acquiredContext.createMediaStreamDestination();
          worklet.connect(destination);
          await acquiredContext.resume();
          ensureCurrent();
          const audioTrack = destination.stream.getAudioTracks()[0];
          if (!audioTrack) throw new Error("N\xE3o foi poss\xEDvel preparar o \xE1udio do aplicativo. Tente novamente.");
          acquiredStream.addTrack(audioTrack);
          removeListener = desktop().onAudioChunk((chunk) => {
            if (!worklet.port) return;
            const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
            const aligned = bytes.byteLength - bytes.byteLength % 2;
            const pcm = new Int16Array(aligned / 2);
            const view = new DataView(bytes.buffer, bytes.byteOffset, aligned);
            for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(i * 2, true);
            worklet.port.postMessage(pcm, [pcm.buffer]);
          });
          setShareStatus2("Iniciando \xE1udio do aplicativo\u2026");
          audioRequested = true;
          await desktop().startAudioCapture(pid, op.audioToken);
          ensureCurrent();
        }
        setShareStatus2("Confirmando transmiss\xE3o na sala\u2026");
        if (track.readyState === "ended") throw new Error("A fonte de v\xEDdeo foi encerrada antes de iniciar a transmiss\xE3o.");
        await cloud().updateRoomMember(op.room, { streaming: true }, op.peer.id);
        announced = true;
        ensureCurrent();
        if (track.readyState === "ended") throw new Error("A fonte de v\xEDdeo foi encerrada antes de iniciar a transmiss\xE3o.");
        const settings = track.getSettings(), actualQuality = settings.width && settings.height ? `${settings.width}\xD7${settings.height} \xB7 ${Math.round(settings.frameRate || profile.fps)} FPS` : profile.label;
        const entry = { stream: acquiredStream, name: state2.nickname, uid: state2.user?.uid, photo: state2.profile.photo, color: state2.profile.color, appName: confirmedAudio?.name || confirmedSource.name, sourceName: confirmedSource.name, sourceType: confirmedSource.type === "screen" ? "Tela inteira" : "Janela", local: true, quality: actualQuality };
        state2.localStream = acquiredStream;
        state2.localSource = { id: confirmedSource.id, name: confirmedSource.name, type: confirmedSource.type, audioSourceId: confirmedAudio?.id || null, audioName: confirmedAudio?.name || null };
        state2.localQuality = actualQuality;
        state2.localQualityProfile = qualityProfile;
        activeAudio = { removeListener, context: acquiredContext, worklet, destination, token: audioRequested ? op.audioToken : null };
        state2.streams.set(op.peer.id, entry);
        committed = true;
        track.addEventListener("ended", () => {
          if (state2.localStream === acquiredStream) stopSharing2();
        }, { once: true });
        for (const member of state2.members.values()) ensureCall2(member.peerId, acquiredStream);
        configureCallQuality2();
        sendToAll2({ type: "publisher-start", peerId: op.peer.id, name: state2.nickname });
        localStorage.setItem("foco.quality", qualityProfile);
        $2("#shareLabel").textContent = "Parar transmiss\xE3o";
        $2("#shareButton").classList.add("sharing");
        renderStreams2();
        renderPeople2();
        shareAttempt = null;
        $2("#shareDialog").close();
        toast2(withAudio ? `Transmitindo ${confirmedSource.name} com \xE1udio do aplicativo` : "Transmitindo somente v\xEDdeo");
      } catch (error) {
        if (committed && state2.localStream === acquiredStream) stopSharing2(false);
        else {
          if (removeListener) removeListener();
          acquiredStream?.getTracks().forEach((track) => track.stop());
          if (acquiredContext) await acquiredContext.close().catch(() => {
          });
          if (audioRequested) await desktop().stopAudioCapture(op.audioToken).catch(() => {
          });
        }
        if (announced && !committed) await cloud().updateRoomMember(op.room, { streaming: false }, op.peer.id).catch(() => {
        });
        if (!error.cancelled && $2("#shareDialog").open) {
          console.warn("Falha ao compartilhar:", error);
          setShareStatus2(error.name === "NotAllowedError" ? "Permiss\xE3o de captura negada. Confira as permiss\xF5es do sistema." : error.message || "N\xE3o foi poss\xEDvel iniciar a transmiss\xE3o.", "error");
        }
      } finally {
        if (shareAttempt === op) shareAttempt = null;
        $2("#shareButton").disabled = !state2.canStream || !sharePeerReady2();
        updateShareControls2();
      }
    }
    function stopSharing2(showMessage = true, { remote = true } = {}) {
      if (!state2.localStream) return;
      if (remote && state2.activeRoom) cloud()?.updateRoomMember(state2.activeRoom, { streaming: false }, state2.peer?.id).catch(() => {
      });
      const id = state2.peer?.id;
      for (const call of state2.calls.values()) call.close();
      state2.calls.clear();
      state2.localStream.getTracks().forEach((track) => track.stop());
      state2.localStream = null;
      const audio = activeAudio;
      activeAudio = null;
      audio?.removeListener?.();
      if (audio?.token) desktop().stopAudioCapture(audio.token).catch(() => {
      });
      if (audio?.context) audio.context.close().catch(() => {
      });
      state2.streams.delete(id);
      sendToAll2({ type: "publisher-stop", peerId: id });
      for (const timer of state2.qualityTimers.values()) clearInterval(timer);
      state2.qualityTimers.clear();
      state2.streamQualityMetrics.delete(id);
      for (const key of state2.qualitySamples.keys()) if (key.startsWith(`${id}:`)) state2.qualitySamples.delete(key);
      state2.localSource = null;
      state2.localQuality = null;
      state2.localQualityProfile = null;
      $2("#shareLabel").textContent = "Compartilhar tela";
      $2("#shareButton").classList.remove("sharing");
      renderStreams2();
      renderPeople2();
      if (showMessage) toast2("Transmiss\xE3o encerrada.");
    }
    return {
      get attempt() {
        return shareAttempt;
      },
      cancelAttempt() {
        if (shareAttempt) shareAttempt.cancelled = true;
      },
      setFixtureAttempt(value) {
        if (/-(?:smoke|fixture)\.html$/.test(location.pathname)) shareAttempt = value;
      },
      startSharing: startSharing2,
      stopSharing: stopSharing2
    };
  }

  // renderer/app/session.js
  function createRoomSession(ports) {
    const {
      state: state2,
      $: $2,
      document: document2,
      cloud,
      createPeer,
      showAuthGate: showAuthGate2,
      renderRooms: renderRooms2,
      setRoomStatus: setRoomStatus2,
      renderPeople: renderPeople2,
      renderRoomChat: renderRoomChat2,
      esc: esc2,
      icon: icon2,
      handleData: handleData2,
      handleCall: handleCall2,
      updateChatControls: updateChatControls2,
      updateShareControls: updateShareControls2,
      finishRoomJoin: finishRoomJoin2,
      suspendP2PForRevalidation: suspendP2PForRevalidation2,
      toast: toast2,
      cancelSharePicker: cancelSharePicker2,
      stopSharing: stopSharing2,
      renderStreams: renderStreams2,
      showNoRoom: showNoRoom2
    } = ports;
    let peerReconnectTimer = null;
    let peerReconnectAttempts = 0;
    function advanceAuth() {
      return ++state2.authGeneration;
    }
    function setUser(user) {
      state2.user = user;
    }
    function p2pContext2(peer = state2.peer) {
      return { peer, room: state2.activeRoom, userId: state2.user?.uid, generation: state2.p2pGeneration, openVersion: state2.roomAttempt?.openVersion };
    }
    function sameRoomIdentity2(context) {
      return !!(context.peer && state2.peer === context.peer && state2.activeRoom === context.room && state2.user?.uid === context.userId && state2.p2pGeneration === context.generation && state2.roomAttempt?.openVersion === context.openVersion);
    }
    function sameP2PSession2(context) {
      return sameRoomIdentity2(context) && state2.roomConnected;
    }
    function currentP2P2(context) {
      return sameP2PSession2(context) && state2.ownMember?.peerId === context.peer.id;
    }
    function roomAttemptCurrent2(attempt) {
      return !!(attempt && state2.roomAttempt === attempt && state2.peer === attempt.peer && state2.activeRoom === attempt.code && state2.user?.uid === attempt.userId && state2.authGeneration === attempt.authGeneration && state2.p2pGeneration === attempt.generation);
    }
    async function connectRoom2(room) {
      if (!state2.user) {
        showAuthGate2("Entre na sua conta para usar as salas.");
        return;
      }
      if (!cloud()?.isConfigured()) {
        showAuthGate2("O servi\xE7o online n\xE3o est\xE1 configurado neste computador.");
        return;
      }
      const code = String(room.code || room.id).toUpperCase();
      disconnectRoom2(false);
      state2.chatMessages = [];
      state2.chatMedia = null;
      state2.lastChatSentAt = 0;
      state2.membersLoaded = false;
      state2.ownMember = null;
      state2.membersError = "";
      state2.chatLoaded = false;
      state2.chatSeenAt = 0;
      state2.chatSeenIds.clear();
      state2.chatError = "";
      state2.openPersonMenu = null;
      document2.body.classList.remove("no-room");
      state2.activeRoom = code;
      state2.currentRoomData = { ...room, code, id: code };
      state2.isHost = room.ownerUid === state2.user.uid;
      $2("#roomName").textContent = room.name;
      $2("#copyRoomCode").innerHTML = `${esc2(code)} ${icon2("copy", "icon-sm")}`;
      $2("#copyRoomCode").disabled = false;
      renderRooms2($2("#roomSearch").value);
      setRoomStatus2("Conectando \xE0 sala\u2026");
      state2.members = /* @__PURE__ */ new Map();
      renderPeople2();
      renderRoomChat2();
      const peer = createPeer();
      state2.peer = peer;
      peerReconnectAttempts = 0;
      const attempt = { code, peer, userId: state2.user.uid, authGeneration: state2.authGeneration, generation: state2.p2pGeneration, openVersion: 0, joinedOnce: false, revalidating: false, firebaseRejoined: false, rejoinFailures: 0, rejoinTimer: null, presenceTimer: null, joinWaitTimer: null };
      state2.roomAttempt = attempt;
      peer.on("open", (id) => {
        if (!roomAttemptCurrent2(attempt)) return;
        clearTimeout(peerReconnectTimer);
        peerReconnectTimer = null;
        peerReconnectAttempts = 0;
        clearTimeout(attempt.rejoinTimer);
        attempt.rejoinTimer = null;
        clearTimeout(attempt.presenceTimer);
        attempt.presenceTimer = null;
        clearTimeout(attempt.joinWaitTimer);
        attempt.joinWaitTimer = null;
        const version = ++attempt.openVersion, reconnecting = attempt.joinedOnce;
        attempt.revalidating = reconnecting;
        attempt.firebaseRejoined = false;
        state2.roomConnected = false;
        $2("#shareButton").disabled = true;
        updateChatControls2();
        if ($2("#shareDialog").open) updateShareControls2();
        setRoomStatus2(reconnecting ? "PeerJS reconectado \xB7 revalidando sala" : "Conectando \xE0 sala\u2026");
        finishRoomJoin2(attempt, id, version, reconnecting);
      });
      peer.on("connection", (conn) => handleData2(conn, peer));
      peer.on("call", (call) => handleCall2(call, peer));
      peer.on("error", (error) => {
        if (!roomAttemptCurrent2(attempt)) return;
        console.error("PeerJS:", error);
        if (["network", "socket-error", "socket-closed", "server-error"].includes(error.type)) {
          setRoomStatus2("Conex\xE3o inst\xE1vel \xB7 tentando recuperar");
        } else if (error.type === "peer-unavailable") {
          toast2("Um participante se desconectou. Atualizando a lista\u2026");
        } else {
          setRoomStatus2("Falha na conex\xE3o da sala");
          toast2(`Conex\xE3o ponto a ponto: ${error.type || error.message}`);
        }
      });
      peer.on("disconnected", () => {
        if (!roomAttemptCurrent2(attempt) || peer.destroyed) return;
        attempt.openVersion++;
        attempt.revalidating = attempt.joinedOnce;
        attempt.firebaseRejoined = false;
        clearTimeout(attempt.rejoinTimer);
        attempt.rejoinTimer = null;
        clearTimeout(attempt.presenceTimer);
        attempt.presenceTimer = null;
        clearTimeout(attempt.joinWaitTimer);
        attempt.joinWaitTimer = null;
        state2.roomConnected = false;
        $2("#shareButton").disabled = true;
        updateChatControls2();
        suspendP2PForRevalidation2();
        if ($2("#shareDialog").open) updateShareControls2();
        clearTimeout(peerReconnectTimer);
        peerReconnectAttempts++;
        const delay = Math.min(1e3 * 2 ** Math.min(peerReconnectAttempts, 5), 3e4);
        setRoomStatus2(`Reconectando \xE0 sala \xB7 nova tentativa em ${Math.ceil(delay / 1e3)} s`);
        peerReconnectTimer = setTimeout(() => {
          if (!roomAttemptCurrent2(attempt) || peer.destroyed || !peer.disconnected) return;
          try {
            peer.reconnect();
          } catch (error) {
            console.warn("Reconex\xE3o da sinaliza\xE7\xE3o:", error);
          }
        }, delay);
      });
      peer.on("close", () => {
        if (!roomAttemptCurrent2(attempt)) return;
        disconnectRoom2(false);
        showNoRoom2();
      });
    }
    function disconnectRoom2(clear = true, { remote = true } = {}) {
      state2.p2pGeneration++;
      const attempt = state2.roomAttempt;
      state2.roomAttempt = null;
      if (attempt) {
        attempt.openVersion++;
        clearTimeout(attempt.rejoinTimer);
        attempt.rejoinTimer = null;
        clearTimeout(attempt.presenceTimer);
        attempt.presenceTimer = null;
        clearTimeout(attempt.joinWaitTimer);
        attempt.joinWaitTimer = null;
      }
      cancelSharePicker2();
      clearTimeout(peerReconnectTimer);
      peerReconnectTimer = null;
      peerReconnectAttempts = 0;
      for (const timer of state2.recoveryTimers) clearTimeout(timer);
      state2.recoveryTimers.clear();
      state2.recoveryAttempts.clear();
      const code = state2.activeRoom, peerId = state2.peer?.id;
      state2.roomConnected = false;
      if (document2.fullscreenElement) document2.exitFullscreen().catch(() => {
      });
      state2.theaterId = null;
      state2.expandedId = null;
      document2.body.classList.remove("theater-active");
      stopSharing2(false, { remote });
      if (remote && code && peerId && state2.user) cloud()?.exitRoom(code, peerId).catch(() => {
      });
      state2.roomListeners.splice(0).forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
        }
      });
      state2.chatWatch = null;
      state2.membersWatch = null;
      state2.chatWatchVersion++;
      state2.membersWatchVersion++;
      state2.chatRetrying = false;
      state2.membersRetrying = false;
      for (const call of state2.calls.values()) call.close();
      state2.calls.clear();
      for (const call of state2.incomingCalls.values()) call.close();
      state2.incomingCalls.clear();
      for (const conn of state2.dataConnections.values()) conn.close();
      state2.dataConnections.clear();
      state2.pendingOutgoingCalls.clear();
      state2.lastRetryAt.clear();
      state2.membersLoaded = false;
      state2.ownMember = null;
      if (state2.peer) {
        try {
          state2.peer.destroy();
        } catch {
        }
        state2.peer = null;
      }
      state2.membersLoaded = false;
      state2.chatLoaded = false;
      state2.members.clear();
      state2.streams.clear();
      state2.playbackPrefs.clear();
      state2.chatMessages = [];
      state2.chatMedia = null;
      state2.chatSendOperation = null;
      state2.chatSending = false;
      $2("#chatSendStatus").hidden = true;
      state2.chatSeenIds.clear();
      state2.chatError = "";
      state2.membersError = "";
      state2.ownMember = null;
      state2.openPersonMenu = null;
      state2.isHost = false;
      state2.canStream = true;
      renderStreams2();
      if (clear) {
        setRoomStatus2("Desconectado");
        renderPeople2();
        renderRoomChat2();
      }
    }
    function authCurrent2(generation, uid) {
      return state2.authGeneration === generation && state2.user?.uid === uid;
    }
    return {
      p2pContext: p2pContext2,
      sameRoomIdentity: sameRoomIdentity2,
      sameP2PSession: sameP2PSession2,
      currentP2P: currentP2P2,
      roomAttemptCurrent: roomAttemptCurrent2,
      authCurrent: authCurrent2,
      advanceAuth,
      setUser,
      connectRoom: connectRoom2,
      disconnectRoom: disconnectRoom2
    };
  }

  // renderer/app.js
  function validRooms(items) {
    return Array.isArray(items) ? items.filter((r) => r && typeof r.id === "string" && typeof r.name === "string" && typeof r.code === "string").map((r) => ({ ...r, hostId: typeof r.hostId === "string" ? r.hostId : `foco${r.code.toLowerCase()}`, host: Boolean(r.host) })) : [];
  }
  var state = {
    rooms: [],
    activeRoom: null,
    peer: null,
    hostId: null,
    isHost: false,
    nickname: localStorage.getItem("foco.nickname") || "Jogador",
    user: null,
    profile: { username: "", nickname: "Jogador", status: "Dispon\xEDvel", color: "#9b83ff", photo: "", showActivity: true, activity: "" },
    canStream: true,
    roomConnected: false,
    rotatingRoom: false,
    roomListeners: [],
    roomPeerIds: /* @__PURE__ */ new Map(),
    pendingInvite: "",
    members: /* @__PURE__ */ new Map(),
    dataConnections: /* @__PURE__ */ new Map(),
    calls: /* @__PURE__ */ new Map(),
    incomingCalls: /* @__PURE__ */ new Map(),
    localStream: null,
    p2pGeneration: 0,
    authGeneration: 0,
    roomAttempt: null,
    pendingOutgoingCalls: /* @__PURE__ */ new Map(),
    lastRetryAt: /* @__PURE__ */ new Map(),
    recoveryTimers: /* @__PURE__ */ new Set(),
    chatMessages: [],
    chatMedia: null,
    lastChatSentAt: 0,
    chatSending: false,
    chatSendOperation: null,
    chatSeenIds: /* @__PURE__ */ new Set(),
    chatForceBottom: false,
    chatError: "",
    membersError: "",
    chatRetrying: false,
    membersRetrying: false,
    chatWatch: null,
    membersWatch: null,
    chatWatchVersion: 0,
    membersWatchVersion: 0,
    ownMember: null,
    openPersonMenu: null,
    localSource: null,
    localQuality: null,
    localQualityProfile: null,
    qualityTimers: /* @__PURE__ */ new Map(),
    streams: /* @__PURE__ */ new Map(),
    playbackPrefs: /* @__PURE__ */ new Map(),
    streamTiles: /* @__PURE__ */ new Map(),
    pendingTiles: /* @__PURE__ */ new Map(),
    roomsLoaded: false,
    roomsSlow: false,
    roomsLoading: false,
    roomsError: false,
    roomsWatchVersion: 0,
    membersLoaded: false,
    chatLoaded: false,
    chatSeenAt: 0,
    panelTab: "chat",
    roomStatus: { text: "", good: false },
    streamQualityMetrics: /* @__PURE__ */ new Map(),
    qualitySamples: /* @__PURE__ */ new Map(),
    recoveryAttempts: /* @__PURE__ */ new Map(),
    displayMode: "focus",
    focusedId: null,
    theaterId: null,
    expandedId: null
  };
  var QUALITY_PROFILES = {
    "1080p60": { width: 1920, height: 1080, fps: 60, label: "1080p \xB7 60 FPS", aggregateBitrate: 16e6 },
    "720p60": { width: 1280, height: 720, fps: 60, label: "720p \xB7 60 FPS", aggregateBitrate: 9e6 },
    "720p30": { width: 1280, height: 720, fps: 30, label: "720p \xB7 30 FPS", aggregateBitrate: 6e6 },
    "480p30": { width: 854, height: 480, fps: 30, label: "480p \xB7 30 FPS", aggregateBitrate: 3e6 }
  };
  var toastTimer;
  var unsubscribeUserRooms = null;
  var unsubscribeAuth = null;
  var appVersion = "\u2014";
  var startupDismissed = false;
  var startupAuthTimer = null;
  var lastRenderedUpdateState = "";
  var $ = (selector) => document.querySelector(selector);
  var icon = (name, extra = "") => `<svg class="icon${extra ? " " + extra : ""}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
  var esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  var roomSession = createRoomSession({
    state,
    $,
    document,
    cloud: () => window.focoCloud,
    createPeer: () => new Peer(void 0, { debug: 0 }),
    showAuthGate,
    renderRooms,
    setRoomStatus,
    renderPeople,
    renderRoomChat,
    esc,
    icon,
    handleData,
    handleCall,
    updateChatControls,
    updateShareControls,
    finishRoomJoin,
    suspendP2PForRevalidation,
    toast,
    cancelSharePicker,
    stopSharing,
    renderStreams,
    showNoRoom
  });
  var p2p = createP2P({
    state,
    cloud: () => window.focoCloud,
    p2pContext,
    sameP2PSession,
    currentP2P,
    sameRoomIdentity,
    renderPeople,
    renderStreams,
    setRoomStatus,
    toast,
    qualityProfiles: QUALITY_PROFILES
  });
  var roomFlow = createRoomFlow({
    state,
    $,
    cloudCall,
    toast,
    disconnectRoom,
    showNoRoom,
    renderPeople,
    stopSharing,
    renderStreams,
    renderRoomModeration,
    ensureDataConnection,
    ensureCall,
    renderRoomChat,
    latestMessageAt,
    persistRooms,
    renderRooms,
    esc,
    icon,
    setRoomStatus,
    updateShareControls,
    updateChatControls,
    mapAuthError,
    revokePeer,
    removeRemoteStream,
    roomAttemptCurrent
  });
  function toast(message) {
    const el = $("#toast");
    el.textContent = window.focoI18n?.translate(message) || message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }
  function updateStatusLabel(status) {
    const version = status?.version ? ` ${status.version}` : "";
    if (!status || status.state === "starting" || status.state === "checking") return "Verificando atualiza\xE7\xF5es\u2026";
    if (status.state === "current") return status.latestVersion && status.latestVersion !== appVersion ? `Foco atualizado. Vers\xE3o mais recente: ${status.latestVersion}.` : "Voc\xEA est\xE1 na vers\xE3o mais recente.";
    if (status.state === "available") return `Atualiza\xE7\xE3o${version} dispon\xEDvel. Iniciando download\u2026`;
    if (status.state === "downloading") return `Baixando atualiza\xE7\xE3o${version} \xB7 ${status.percent || 0}%.`;
    if (status.state === "ready") return `Vers\xE3o${version} baixada. Ser\xE1 instalada ao fechar o Foco.`;
    if (status.state === "error") return "N\xE3o foi poss\xEDvel verificar agora. Tente novamente mais tarde.";
    if (status.state === "unavailable" && status.reason === "not-configured") return "Atualiza\xE7\xF5es autom\xE1ticas n\xE3o est\xE3o configuradas nesta instala\xE7\xE3o.";
    return "A verifica\xE7\xE3o de atualiza\xE7\xF5es fica dispon\xEDvel na vers\xE3o instalada.";
  }
  var startupReady = { auth: false };
  function dismissStartupScreen(part) {
    if (part) startupReady[part] = true;
    if (startupDismissed || !startupReady.auth) return;
    startupDismissed = true;
    clearTimeout(startupAuthTimer);
    $("#startupScreen").classList.add("is-done");
    $("#startupScreen").inert = true;
    if (!$("#authGate").hidden) focusAuthGate();
    else $("#roomSearch").focus();
  }
  function renderUpdateStatus(status) {
    if (!status) return;
    const previous = lastRenderedUpdateState;
    lastRenderedUpdateState = status.state || "";
    $("#updateStatusText").textContent = updateStatusLabel(status);
    $("#appVersionLabel").textContent = `Foco \xB7 Vers\xE3o ${appVersion}`;
    const checking = status.state === "checking" || status.state === "starting";
    const inProgress = status.state === "downloading";
    const ready = status.state === "ready";
    const unavailable = status.state === "unavailable";
    $("#checkUpdatesButton").disabled = checking || inProgress || ready || unavailable;
    $("#checkUpdatesButton").textContent = checking ? "Verificando\u2026" : inProgress ? "Baixando\u2026" : ready ? "Atualiza\xE7\xE3o pronta" : "Verificar atualiza\xE7\xF5es";
    $("#startupVersion").textContent = `Vers\xE3o ${appVersion}`;
    if (status.state === "available" && previous !== "available") toast(`Atualiza\xE7\xE3o ${status.version || ""} dispon\xEDvel; baixando em segundo plano.`);
    if (status.state === "ready" && previous !== "ready") toast(`Atualiza\xE7\xE3o ${status.version || ""} pronta; ser\xE1 instalada ao fechar o Foco.`);
  }
  async function initializeUpdateUi() {
    window.focoDesktop.onUpdateStatus?.(renderUpdateStatus);
    try {
      appVersion = await window.focoDesktop.getAppVersion();
      $("#appVersionLabel").textContent = `Foco \xB7 Vers\xE3o ${appVersion}`;
      $("#startupVersion").textContent = `Vers\xE3o ${appVersion}`;
      let timer;
      try {
        renderUpdateStatus(await Promise.race([window.focoDesktop.getUpdateStatus(), new Promise((resolve) => {
          timer = setTimeout(() => resolve({ state: "error" }), 8e3);
        })]));
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      console.warn("N\xE3o foi poss\xEDvel carregar o estado das atualiza\xE7\xF5es:", error);
      $("#updateStatusText").textContent = "N\xE3o foi poss\xEDvel consultar as atualiza\xE7\xF5es.";
    }
  }
  function persistRooms() {
    localStorage.setItem("foco.rooms", JSON.stringify(state.rooms));
  }
  function randomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  }
  function currentRoom() {
    return state.rooms.find((room) => room.id === state.activeRoom);
  }
  function showNoRoom() {
    state.roomListeners.splice(0).forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
      }
    });
    state.chatWatch = null;
    state.membersWatch = null;
    state.chatWatchVersion++;
    state.membersWatchVersion++;
    state.chatRetrying = false;
    state.membersRetrying = false;
    state.activeRoom = null;
    state.chatMessages = [];
    state.chatMedia = null;
    state.chatSendOperation = null;
    state.chatSending = false;
    $("#chatSendStatus").hidden = true;
    state.chatSeenIds.clear();
    state.chatError = "";
    state.membersError = "";
    state.ownMember = null;
    state.openPersonMenu = null;
    state.theaterId = null;
    state.expandedId = null;
    state.focusedId = null;
    state.localFocusChosen = false;
    document.body.classList.remove("theater-active");
    document.body.classList.add("no-room");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {
    });
    $("#roomName").textContent = tr("In\xEDcio");
    $("#copyRoomCode").innerHTML = icon("copy", "icon-sm");
    $("#copyRoomCode").disabled = true;
    $("#shareLabel").textContent = "Compartilhar tela";
    $("#shareButton").classList.remove("sharing");
    $("#shareButton").disabled = true;
    $("#inviteButton").disabled = true;
    state.membersLoaded = false;
    state.chatLoaded = false;
    setRoomStatus("Crie ou entre em uma sala");
    renderRooms($("#roomSearch").value);
    renderPeople();
    renderStreams();
    renderRoomChat();
  }
  function openSettings() {
    $("#appLanguage").value = window.focoI18n?.getLanguage() || "pt-BR";
    $("#defaultQuality").value = localStorage.getItem("foco.quality") || "720p60";
    $("#reduceMotionEnabled").checked = localStorage.getItem("foco.reduceMotion") === "true";
    $("#appVersionLabel").textContent = `Foco \xB7 Vers\xE3o ${appVersion}`;
    $("#settingsDialog").showModal();
  }
  function focusAuthGate() {
    if (!startupDismissed || $("#authGate").hidden) return;
    $("#authGate").inert = false;
    const target = !$("#backendSetup").hidden ? $("#firebaseApiKey") : $("#authForms").hidden ? $("#authTitle") : $("#loginForm").hidden ? $("#registerEmail") : $("#loginEmail");
    target.focus();
  }
  function showAuthGate(message = "") {
    $("#authGate").hidden = false;
    $(".app-shell").inert = true;
    $("#authError").textContent = tr(message);
    focusAuthGate();
  }
  function hideAuthGate() {
    $("#authGate").hidden = true;
    $("#authGate").inert = true;
    $(".app-shell").inert = false;
    $("#authError").textContent = "";
    if (startupDismissed) $("#roomSearch").focus();
  }
  function setAuthMode(mode) {
    const login = mode === "login";
    $("#loginForm").hidden = !login;
    $("#registerForm").hidden = login;
    $("#loginTab").classList.toggle("active", login);
    $("#registerTab").classList.toggle("active", !login);
    $("#loginTab").setAttribute("aria-selected", String(login));
    $("#registerTab").setAttribute("aria-selected", String(!login));
    $("#authTitle").textContent = tr(login ? "Entre na sua conta" : "Crie sua conta");
    $("#authDescription").textContent = tr(login ? "Use seu email e senha para abrir seu perfil e suas salas." : "Seu username \xE9 \xFAnico e n\xE3o poder\xE1 ser alterado.");
    $("#authError").textContent = "";
    (login ? $("#loginEmail") : $("#registerEmail")).focus();
  }
  function mapAuthError(error) {
    const code = error?.code || "";
    const known = { "auth/email-already-in-use": "Esse email j\xE1 est\xE1 cadastrado.", "auth/invalid-email": "O email informado n\xE3o \xE9 v\xE1lido.", "auth/weak-password": "A senha precisa ter pelo menos 8 caracteres.", "auth/invalid-credential": "Email ou senha incorretos.", "auth/user-not-found": "Email ou senha incorretos.", "auth/wrong-password": "Email ou senha incorretos.", "auth/operation-not-allowed": "Ative Email/Senha em Authentication no Firebase Console.", "auth/invalid-api-key": "API key do Firebase inv\xE1lida. Confira a configura\xE7\xE3o.", "auth/network-request-failed": "N\xE3o foi poss\xEDvel conectar ao servi\xE7o online. Confira sua internet.", "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.", "PERMISSION_DENIED": "As regras do Realtime Database est\xE3o ausentes ou n\xE3o correspondem \xE0 configura\xE7\xE3o.", "database/permission-denied": "As regras do Realtime Database est\xE3o ausentes ou n\xE3o correspondem \xE0 configura\xE7\xE3o." };
    return known[code] || error?.message || "N\xE3o foi poss\xEDvel concluir a opera\xE7\xE3o.";
  }
  function setSignedInProfile(profile) {
    state.profile = { ...state.profile, ...profile };
    state.nickname = state.profile.nickname;
    localStorage.setItem("foco.nickname", state.nickname);
    const avatar = $("#profileAvatar");
    avatar.textContent = state.profile.photo ? "" : state.nickname.slice(0, 1).toUpperCase();
    avatar.style.background = state.profile.photo ? `center/cover url("${state.profile.photo}")` : state.profile.color;
    $("#profileName").textContent = state.nickname;
    $("#profileStatusLabel").textContent = state.profile.status || "";
    updateProfilePreview();
  }
  function updateProfilePreview() {
    const color = $("#profileColor")?.value || state.profile.color || "#9b83ff", hex = $("#profileColorHex"), name = $("#nicknameInput")?.value.trim() || state.profile.nickname || "Seu apelido", status = $("#profileStatus")?.value.trim() || "Dispon\xEDvel", avatar = $("#profilePreviewAvatar");
    if (hex && hex.value.toLowerCase() !== color.toLowerCase()) hex.value = color;
    document.querySelectorAll(".color-swatch").forEach((button) => {
      const selected = button.dataset.profileColor.toLowerCase() === color.toLowerCase();
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const custom = document.querySelector("#profilePalette .custom-color-swatch"), isPreset = [...document.querySelectorAll(".color-swatch")].some((button) => button.dataset.profileColor.toLowerCase() === color.toLowerCase());
    if (custom) {
      custom.classList.toggle("selected", !isPreset);
      custom.style.setProperty("--swatch-color", color);
    }
    $("#profilePreviewName").textContent = name;
    $("#profilePreviewStatus").textContent = status;
    if (avatar) {
      avatar.style.background = state.pendingPhoto ? `center/cover url("${state.pendingPhoto}")` : state.profile.photo ? `center/cover url("${state.profile.photo}")` : color;
      avatar.textContent = state.pendingPhoto || state.profile.photo ? "" : name.slice(0, 1).toUpperCase();
    }
    $("#profileLivePreview")?.style.setProperty("--profile-accent", color);
  }
  function setProfileColor(value) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    $("#profileColor").value = value;
    $("#profileColorHex").value = value;
    updateProfilePreview();
  }
  function openProfile() {
    state.pendingPhoto = void 0;
    $("#profileUsername").value = state.profile.username || "";
    $("#nicknameInput").value = state.profile.nickname || state.nickname;
    $("#profileStatus").value = state.profile.status || "";
    $("#profileActivity").value = state.profile.activity || "";
    $("#profileColor").value = state.profile.color || "#9b83ff";
    $("#profileColorHex").value = state.profile.color || "#9b83ff";
    $("#showActivity").checked = state.profile.showActivity !== false;
    $("#profilePhoto").value = "";
    $("#profilePhotoPreview").innerHTML = state.profile.photo ? `<img src="${esc(state.profile.photo)}" alt="Foto de perfil"><span>Foto atual</span>` : "Sem foto selecionada";
    setProfileFormStatus();
    updateProfilePreview();
    $("#profileDialog").showModal();
    $("#nicknameInput").focus();
  }
  function setProfileFormStatus(message = "", kind = "error") {
    const status = $("#profileFormStatus");
    status.hidden = !message;
    status.dataset.kind = kind;
    status.textContent = tr(message);
  }
  function openRoomManagement() {
    const room = currentRoom();
    if (!room) {
      toast("Entre em uma sala para gerenci\xE1-la.");
      return;
    }
    $("#manageRoomTitle").textContent = room.name;
    state.isHost = state.user?.uid === room.ownerUid;
    $("#manageRoomDescription").textContent = state.isHost ? "A sala continua dispon\xEDvel mesmo quando voc\xEA est\xE1 offline." : "Voc\xEA pode sair desta sala e voltar a entrar com o c\xF3digo.";
    $("#deleteRoomButton").hidden = !state.isHost;
    $("#rotateRoomCodeButton").hidden = !state.isHost;
    renderRoomModeration();
    $("#roomManageDialog").showModal();
  }
  async function rotateRoomCode() {
    const old = currentRoom();
    if (!old || !state.isHost) return;
    await confirmedRoomAction(`rotate:${old.code}`, { title: "Gerar novo c\xF3digo?", message: "A sala atual ser\xE1 encerrada para todos. O c\xF3digo e os convites antigos deixar\xE3o de funcionar.", confirm: "Gerar novo c\xF3digo", cancel: "Cancelar" }, () => currentRoom()?.code === old.code && state.user?.uid === old.ownerUid, async () => {
      let replacement = null;
      const attempt = state.roomAttempt;
      try {
        replacement = await window.focoCloud.makeRoom(old.name);
        if (!roomAttemptCurrent(attempt)) {
          await window.focoCloud.markRoomDeleted(replacement.code).catch(() => {
          });
          return;
        }
        state.rotatingRoom = true;
        await window.focoCloud.markRoomDeleted(old.code);
        if (!roomAttemptCurrent(attempt)) {
          state.rotatingRoom = false;
          await window.focoCloud.markRoomDeleted(replacement.code).catch(() => {
          });
          return;
        }
        disconnectRoom(false);
        state.activeRoom = null;
        state.rotatingRoom = false;
        state.rooms = state.rooms.filter((room) => room.code !== old.code);
        persistRooms();
        renderRooms($("#roomSearch").value);
        $("#roomManageDialog").close();
        await connectRoom(replacement);
        const replacementAttempt = state.roomAttempt;
        if (!roomAttemptCurrent(replacementAttempt)) return;
        const connected = await waitForRoomReady(replacement.code, 12e3);
        if (!roomAttemptCurrent(replacementAttempt)) return;
        if (!connected && !state.rooms.some((room) => room.code === replacement.code)) {
          state.rooms.unshift({ ...replacement, id: replacement.code });
          persistRooms();
          renderRooms($("#roomSearch").value);
        }
        await copyText(`foco://join/${replacement.code}`);
        if (roomAttemptCurrent(replacementAttempt)) toast(`${connected ? "Sala recriada" : "Sala recriada \xB7 conex\xE3o pendente"} \xB7 c\xF3digo ${replacement.code} \xB7 convite copiado.`);
      } catch (error) {
        state.rotatingRoom = false;
        if (replacement && state.activeRoom !== replacement.code) await window.focoCloud.markRoomDeleted(replacement.code).catch(() => {
        });
        throw error;
      }
    });
  }
  async function waitForRoomReady(code, timeout) {
    const attempt = state.roomAttempt, started = Date.now();
    while (Date.now() - started < timeout) {
      if (!roomAttemptCurrent(attempt) || attempt.code !== code) return false;
      if (state.roomConnected) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return roomAttemptCurrent(attempt) && state.roomConnected && attempt.code === code;
  }
  function renderRoomModeration() {
    const room = currentRoom(), container = $("#roomMembersManage");
    if (!container) return;
    if (!room) {
      container.innerHTML = "";
      return;
    }
    const canModerate = state.isHost || state.profile.role === "moderator";
    const people = [...state.members.entries()].map(([uid, m]) => ({ uid, ...m })).filter((m) => m.online !== false);
    container.innerHTML = people.length ? '<div class="manage-section-title">PESSOAS NESTA SALA</div>' + people.map((m) => `<div class="manage-person"><span class="manage-person-name"><span data-no-translate>${esc(m.nickname || m.name || m.username)}</span> <small>${tr(m.role === "moderator" ? "Moderador" : m.role === "owner" ? "Dono da sala" : "Membro")}</small></span>${canModerate && m.uid !== state.user?.uid ? `<button type="button" class="manage-small" data-room-action="permission" data-uid="${esc(m.uid)}" data-allowed="${m.canStream === false ? "false" : "true"}">${m.canStream === false ? "Permitir transmitir" : "Bloquear transmiss\xE3o"}</button>${state.isHost ? `<button type="button" class="manage-small" data-room-action="role" data-uid="${esc(m.uid)}" data-role="${m.role === "moderator" ? "member" : "moderator"}">${m.role === "moderator" ? "Remover modera\xE7\xE3o" : "Tornar moderador"}</button><button type="button" class="manage-small" data-room-action="transfer" data-uid="${esc(m.uid)}">Transferir dono</button>` : ""}<button type="button" class="manage-small danger" data-room-action="ban" data-uid="${esc(m.uid)}">Expulsar e bloquear</button>` : ""}</div>`).join("") : '<div class="manage-section-title">S\xF3 voc\xEA est\xE1 nesta sala.</div>';
    container.onclick = async (event) => {
      const button = event.target.closest("[data-room-action]");
      if (!button || button.disabled) return;
      const uid = button.dataset.uid, action = button.dataset.roomAction, member = state.members.get(uid);
      if (!member) return;
      const ownerOnly = action === "transfer" || action === "role";
      const allowed = () => currentRoom()?.code === room.code && uid !== state.user?.uid && state.members.has(uid) && (ownerOnly ? state.user?.uid === room.ownerUid : state.user?.uid === room.ownerUid || state.profile.role === "moderator");
      const copy = { ban: ["Expulsar e bloquear?", "Esta pessoa ser\xE1 removida da sala e n\xE3o poder\xE1 voltar com o convite.", "Expulsar e bloquear"], transfer: ["Transferir propriedade?", "Voc\xEA deixar\xE1 de ser dono desta sala. A outra pessoa poder\xE1 gerenci\xE1-la.", "Transferir dono"], role: ["Alterar cargo?", "As permiss\xF5es de modera\xE7\xE3o desta pessoa ser\xE3o alteradas.", "Alterar cargo"], permission: ["Alterar transmiss\xE3o?", "A permiss\xE3o desta pessoa para transmitir ser\xE1 alterada.", "Alterar permiss\xE3o"] }[action];
      if (!copy) return;
      await confirmedRoomAction(`${action}:${room.code}:${uid}`, { title: copy[0], message: copy[1], confirm: copy[2], cancel: "Cancelar" }, allowed, async () => {
        button.disabled = true;
        try {
          if (action === "ban") await window.focoCloud.removeMember(room.code, uid);
          if (action === "permission") await window.focoCloud.setStreamPermission(room.code, uid, button.dataset.allowed === "false");
          if (action === "role") await window.focoCloud.setMemberRole(room.code, uid, button.dataset.role);
          if (action === "transfer") await window.focoCloud.transferRoom(room.code, uid);
          toast("Permiss\xF5es atualizadas.");
          renderRoomModeration();
        } finally {
          button.disabled = false;
        }
      });
    };
  }
  async function leaveCurrentRoom() {
    const room = currentRoom();
    if (!room) return;
    const peerId = state.peer?.id;
    disconnectRoom(false, { remote: false });
    state.activeRoom = null;
    $("#roomManageDialog").close();
    showNoRoom();
    toast("Voc\xEA saiu da sala.");
    try {
      await cloudCall(() => window.focoCloud.exitRoom(room.code, peerId));
    } catch (error) {
      toast("A presen\xE7a n\xE3o p\xF4de ser atualizada. Verifique sua conex\xE3o.");
    }
  }
  async function deleteCurrentRoom() {
    const room = currentRoom();
    if (!room || !state.isHost) return;
    await confirmedRoomAction(`delete:${room.code}`, { title: "Excluir sala?", message: `${tr("A sala ser\xE1 exclu\xEDda e o c\xF3digo deixar\xE1 de funcionar.")} \u201C${room.name}\u201D`, confirm: "Excluir sala", cancel: "Cancelar" }, () => currentRoom()?.code === room.code && state.user?.uid === room.ownerUid, async () => {
      const attempt = state.roomAttempt;
      await cloudCall(() => window.focoCloud.markRoomDeleted(room.code));
      if (!roomAttemptCurrent(attempt)) return;
      disconnectRoom(false);
      state.rooms = state.rooms.filter((item) => item.id !== room.id);
      persistRooms();
      state.activeRoom = null;
      $("#roomManageDialog").close();
      showNoRoom();
      toast("Sala exclu\xEDda.");
    });
  }
  async function cloudCall(callback) {
    try {
      return await callback();
    } catch (error) {
      console.error("Servi\xE7o online:", error);
      throw error;
    }
  }
  function setDisplayMode(mode) {
    state.displayMode = mode === "grid" ? "grid" : "focus";
    $("#gridViewButton").classList.toggle("active", state.displayMode === "grid");
    $("#listViewButton").classList.toggle("active", state.displayMode === "focus");
    $("#gridViewButton").setAttribute("aria-pressed", String(state.displayMode === "grid"));
    $("#listViewButton").setAttribute("aria-pressed", String(state.displayMode === "focus"));
    $("#streamGrid").classList.toggle("grid-view", state.displayMode === "grid");
    refreshStreamTiles();
  }
  var tr = (text) => window.focoI18n?.translate(text) || text;
  var WIDE_SIDEBAR_QUERY = matchMedia("(min-width: 1100px)");
  var WIDE_PANEL_QUERY = matchMedia("(min-width: 1280px)");
  var ROOMS_SLOW_MS = 1e4;
  var roomsSlowTimer = null;
  function storedFlag(key) {
    const value = localStorage.getItem(key);
    return value === "true" ? true : value === "false" ? false : null;
  }
  function isSidebarCollapsed() {
    return storedFlag("foco.sidebarCollapsed") ?? !WIDE_SIDEBAR_QUERY.matches;
  }
  function isPanelOpen() {
    return storedFlag("foco.panelOpen") ?? WIDE_PANEL_QUERY.matches;
  }
  function applyShellLayout() {
    const collapsed = isSidebarCollapsed(), open = isPanelOpen();
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    document.body.classList.toggle("panel-open", open);
    const sidebarLabel = tr(collapsed ? "Expandir barra lateral" : "Recolher barra lateral"), panelLabel = tr(open ? "Ocultar painel" : "Mostrar painel");
    const sidebarToggle = $("#sidebarToggle"), panelToggle = $("#panelToggle");
    sidebarToggle.title = sidebarLabel;
    sidebarToggle.setAttribute("aria-label", sidebarLabel);
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    panelToggle.title = panelLabel;
    panelToggle.setAttribute("aria-label", panelLabel);
    panelToggle.setAttribute("aria-expanded", String(open));
    updateChatUnread();
  }
  function toggleSidebar() {
    localStorage.setItem("foco.sidebarCollapsed", String(!isSidebarCollapsed()));
    applyShellLayout();
  }
  function setPanelOpen(open) {
    localStorage.setItem("foco.panelOpen", String(Boolean(open)));
    applyShellLayout();
  }
  function setPanelTab(tab) {
    closePersonMenu();
    state.panelTab = tab === "people" ? "people" : "chat";
    for (const [name, button, pane] of [["chat", $("#chatTab"), $("#chatPane")], ["people", $("#peopleTab"), $("#peoplePane")]]) {
      const active = state.panelTab === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      pane.hidden = !active;
    }
    updateChatUnread();
  }
  function latestMessageAt(...args) {
    return chat.latestMessageAt(...args);
  }
  function chatAtBottom(...args) {
    return chat.chatAtBottom(...args);
  }
  function chatVisible(...args) {
    return chat.chatVisible(...args);
  }
  function updateChatUnread(...args) {
    return chat.updateChatUnread(...args);
  }
  var confirmResolver = null;
  function showConfirmDialog({ title, message, confirm, cancel }) {
    if (confirmResolver) return Promise.resolve(false);
    $("#confirmTitle").textContent = tr(title);
    $("#confirmMessage").textContent = tr(message);
    $("#confirmAccept").textContent = tr(confirm);
    $("#confirmCancel").textContent = tr(cancel || "Cancelar");
    return new Promise((resolve) => {
      confirmResolver = resolve;
      $("#confirmDialog").showModal();
      $("#confirmCancel").focus();
    });
  }
  function settleConfirm(result) {
    const resolve = confirmResolver;
    confirmResolver = null;
    if ($("#confirmDialog").open) $("#confirmDialog").close();
    resolve?.(result);
  }
  var pendingRoomActions = /* @__PURE__ */ new Set();
  async function confirmedRoomAction(key, details, allowed, operation) {
    if (pendingRoomActions.has(key) || !allowed()) return false;
    pendingRoomActions.add(key);
    try {
      if (!await showConfirmDialog(details) || !allowed()) return false;
      await operation();
      return true;
    } catch (error) {
      toast(mapAuthError(error));
      return false;
    } finally {
      pendingRoomActions.delete(key);
    }
  }
  async function confirmRoomSwitch(targetCode) {
    if (!state.localStream || !state.activeRoom || targetCode === state.activeRoom) return true;
    return showConfirmDialog({ title: "Trocar de sala?", message: "Voc\xEA est\xE1 transmitindo. Entrar em outra sala vai encerrar sua transmiss\xE3o atual.", confirm: "Encerrar e trocar", cancel: "Continuar transmitindo" });
  }
  function setRoomStatus(text, good = false) {
    state.roomStatus = { text, good };
    const kind = good ? "connected" : /falha|interrompido/i.test(text) ? "error" : /instável|reconect|recuperar/i.test(text) ? "warning" : "pending";
    $("#connectionStatus").dataset.state = kind;
    $("#connectionStatusLabel").textContent = text;
    $("#connectionStatus").title = tr(text);
  }
  var roomUi = createRoomUi({
    state,
    $,
    document,
    esc,
    icon,
    tr,
    confirmRoomSwitch,
    connectRoom,
    avatarColor
  });
  function roomInitial(...args) {
    return roomUi.roomInitial(...args);
  }
  function renderRooms(...args) {
    return roomUi.renderRooms(...args);
  }
  function renderPeople(...args) {
    return roomUi.renderPeople(...args);
  }
  function closePersonMenu(...args) {
    return roomUi.closePersonMenu(...args);
  }
  var chat = createChat({
    state,
    $,
    document,
    tr,
    esc,
    icon,
    isPanelOpen,
    avatarColor,
    cloud: () => window.focoCloud
  });
  function updateChatControls(...args) {
    return chat.updateChatControls(...args);
  }
  function chatTextHtml(...args) {
    return chat.chatTextHtml(...args);
  }
  function chatMessageNode(...args) {
    return chat.chatMessageNode(...args);
  }
  function renderRoomChat(...args) {
    return chat.renderRoomChat(...args);
  }
  function updateChatAttachment(...args) {
    return chat.updateChatAttachment(...args);
  }
  function fileAsDataUrl(...args) {
    return chat.fileAsDataUrl(...args);
  }
  function prepareChatImage(...args) {
    return chat.prepareChatImage(...args);
  }
  function resizeChatInput(...args) {
    return chat.resizeChatInput(...args);
  }
  function closeChatEmojiPicker(...args) {
    return chat.closeChatEmojiPicker(...args);
  }
  function openChatEmojiPicker(...args) {
    return chat.openChatEmojiPicker(...args);
  }
  function sendChatMessage(...args) {
    return chat.sendChatMessage(...args);
  }
  function makeChatAvatar(...args) {
    return chat.makeChatAvatar(...args);
  }
  function avatarColor(seed = "") {
    let n = 0;
    for (const c of seed) n = n * 31 + c.charCodeAt(0) >>> 0;
    const hues = [182, 215, 270, 320, 25, 145];
    const hue = hues[n % hues.length];
    return `linear-gradient(135deg,hsl(${hue} 55% 65%),hsl(${hue + 35} 50% 40%))`;
  }
  var stage = createStage({
    state,
    $,
    document,
    icon,
    esc,
    tr,
    toast,
    stopSharing,
    setDisplayMode,
    currentRoom,
    confirmedRoomAction,
    kickMember,
    avatarColor,
    ensureDataConnection,
    mediaConnectionState: p2p.mediaConnectionState,
    observeMediaConnection: p2p.observeMediaConnection,
    readStreamQuality: p2p.readStreamQuality
  });
  function syncFullscreenState(...args) {
    return stage.syncFullscreenState(...args);
  }
  function setTheaterMode(...args) {
    return stage.setTheaterMode(...args);
  }
  function setExpandedMode(...args) {
    return stage.setExpandedMode(...args);
  }
  function setText(...args) {
    return stage.setText(...args);
  }
  function setHTML(...args) {
    return stage.setHTML(...args);
  }
  function setAttr(...args) {
    return stage.setAttr(...args);
  }
  function setStyle(...args) {
    return stage.setStyle(...args);
  }
  function playbackPrefs(...args) {
    return stage.playbackPrefs(...args);
  }
  function qualityLabel(...args) {
    return stage.qualityLabel(...args);
  }
  function qualityTitle(...args) {
    return stage.qualityTitle(...args);
  }
  function closeStreamMenus(...args) {
    return stage.closeStreamMenus(...args);
  }
  function focusStream(...args) {
    return stage.focusStream(...args);
  }
  function stageIds(...args) {
    return stage.stageIds(...args);
  }
  function cycleStage(...args) {
    return stage.cycleStage(...args);
  }
  function createStreamTile(...args) {
    return stage.createStreamTile(...args);
  }
  function applyPlayback(...args) {
    return stage.applyPlayback(...args);
  }
  function tileMediaState(...args) {
    return stage.tileMediaState(...args);
  }
  function refreshTileMediaState(...args) {
    return stage.refreshTileMediaState(...args);
  }
  function setTileFailure(...args) {
    return stage.setTileFailure(...args);
  }
  function stopTileMediaWatch(...args) {
    return stage.stopTileMediaWatch(...args);
  }
  function attachTileMedia(...args) {
    return stage.attachTileMedia(...args);
  }
  function updateStreamTile(...args) {
    return stage.updateStreamTile(...args);
  }
  function destroyStreamTile(...args) {
    return stage.destroyStreamTile(...args);
  }
  function refreshStreamTiles(...args) {
    return stage.refreshStreamTiles(...args);
  }
  function updatePendingTile(...args) {
    return stage.updatePendingTile(...args);
  }
  function updateStageGeometry(...args) {
    return stage.updateStageGeometry(...args);
  }
  function renderStreams(...args) {
    return stage.renderStreams(...args);
  }
  function sampleStreamQuality(...args) {
    return stage.sampleStreamQuality(...args);
  }
  function refreshStreamQuality(...args) {
    return stage.refreshStreamQuality(...args);
  }
  function showStreamError(...args) {
    return stage.showStreamError(...args);
  }
  function p2pContext(peer = state.peer) {
    return roomSession.p2pContext(peer);
  }
  function sameRoomIdentity(context) {
    return roomSession.sameRoomIdentity(context);
  }
  function sameP2PSession(context) {
    return roomSession.sameP2PSession(context);
  }
  function currentP2P(context) {
    return roomSession.currentP2P(context);
  }
  function memberForPeer(peerId) {
    return p2p.memberForPeer(peerId);
  }
  function revokePeer(peerId) {
    return p2p.revokePeer(peerId);
  }
  async function authorizePeer(peerId, context, options) {
    return p2p.authorizePeer(peerId, context, options);
  }
  function sendToAll(message) {
    return p2p.sendToAll(message);
  }
  function handleData(conn, peer = state.peer) {
    return p2p.handleData(conn, peer);
  }
  function ensureDataConnection(uid, peerId) {
    return p2p.ensureDataConnection(uid, peerId);
  }
  function ensureCall(peerId, stream = state.localStream, options) {
    return p2p.ensureCall(peerId, stream, options);
  }
  function watchMediaConnection(call) {
    return p2p.watchMediaConnection(call);
  }
  function configureCallQuality() {
    return p2p.configureCallQuality();
  }
  async function handleCall(call, peer = state.peer) {
    return p2p.handleCall(call, peer);
  }
  function removeRemoteStream(peerId) {
    return p2p.removeRemoteStream(peerId);
  }
  function syncRoomMembers(rawMembers) {
    return roomFlow.syncRoomMembers(rawMembers);
  }
  async function watchPanelMembers(code) {
    return roomFlow.watchPanelMembers(code);
  }
  async function watchPanelChat(code) {
    return roomFlow.watchPanelChat(code);
  }
  async function compensateStaleJoin(attempt, peerId) {
    return roomFlow.compensateStaleJoin(attempt, peerId);
  }
  async function watchCurrentRoom(attempt) {
    return roomFlow.watchCurrentRoom(attempt);
  }
  function confirmRestoredRoom(attempt) {
    return roomFlow.confirmRestoredRoom(attempt);
  }
  function suspendP2PForRevalidation() {
    return roomFlow.suspendP2PForRevalidation();
  }
  async function finishRoomJoin(attempt, peerId, openVersion, reconnecting) {
    return roomFlow.finishRoomJoin(attempt, peerId, openVersion, reconnecting);
  }
  function roomAttemptCurrent(attempt) {
    return roomSession.roomAttemptCurrent(attempt);
  }
  async function connectRoom(room) {
    return roomSession.connectRoom(room);
  }
  function disconnectRoom(clear = true, { remote = true } = {}) {
    return roomSession.disconnectRoom(clear, { remote });
  }
  function showRoomDialog(join = false) {
    const d = $("#roomDialog");
    $("#dialogEyebrow").textContent = tr(join ? "ENTRAR EM UMA SALA" : "NOVA SALA");
    $("#dialogTitle").textContent = tr(join ? "Encontre sua galera" : "Crie seu espa\xE7o");
    $("#dialogDescription").textContent = tr(join ? "Digite o c\xF3digo da sala. Ela continua dispon\xEDvel mesmo quando o dono est\xE1 offline." : "Uma sala persistente para compartilhar telas com sua galera.");
    $("#roomFieldLabel").textContent = tr(join ? "C\xF3digo da sala" : "Nome da sala");
    $("#roomInput").placeholder = tr(join ? "Ex.: K7M4PQ2A" : "Ex.: Squad da noite");
    $("#dialogSubmit").textContent = tr(join ? "Entrar na sala" : "Criar sala");
    $("#roomInput").value = "";
    $("#roomInput").removeAttribute("aria-invalid");
    setRoomFormStatus();
    d.dataset.mode = join ? "join" : "create";
    d.showModal();
    $("#roomInput").focus();
  }
  var roomSubmitting = false;
  function setRoomFormStatus(message = "", kind = "error") {
    const status = $("#roomFormStatus");
    status.hidden = !message;
    status.dataset.kind = kind;
    status.textContent = tr(message);
    $("#roomInput").setAttribute("aria-invalid", String(kind === "error" && !!message));
  }
  async function submitRoomForm(event) {
    event.preventDefault();
    if (roomSubmitting) return;
    const value = $("#roomInput").value.trim();
    if (!value) return;
    const generation = state.authGeneration, uid = state.user?.uid;
    const joining = $("#roomDialog").dataset.mode === "join", code = joining ? window.focoCloud.cleanCode(value) : null;
    if (joining && code.length < 6) {
      setRoomFormStatus("Digite um c\xF3digo de sala v\xE1lido.");
      return;
    }
    roomSubmitting = true;
    $("#dialogSubmit").disabled = true;
    $("#roomForm").setAttribute("aria-busy", "true");
    setRoomFormStatus(joining ? "Buscando sala\u2026" : "Criando sala\u2026", "info");
    try {
      if (!await confirmRoomSwitch(code)) {
        setRoomFormStatus();
        return;
      }
      if (!authCurrent(generation, uid)) return;
      const room = await cloudCall(() => joining ? window.focoCloud.findRoom(code) : window.focoCloud.makeRoom(value.slice(0, 32)));
      if (!authCurrent(generation, uid)) return;
      $("#roomDialog").close();
      await connectRoom(room);
    } catch (error) {
      if (authCurrent(generation, uid)) {
        if ($("#roomDialog").open) setRoomFormStatus(mapAuthError(error));
        else toast(mapAuthError(error));
      }
    } finally {
      roomSubmitting = false;
      $("#dialogSubmit").disabled = false;
      $("#roomForm").removeAttribute("aria-busy");
    }
  }
  var sharePicker = { generation: 0, sources: [], selectedId: null, tab: "screen", loading: false, error: "", audioExplicit: false };
  var capture = createCapture({
    state,
    $,
    desktop: () => window.focoDesktop,
    cloud: () => window.focoCloud,
    sharePicker,
    selectedShareSource,
    shareAudioSources,
    populateShareAudio,
    renderShareSources,
    sharePeerReady,
    setShareStatus,
    updateShareControls,
    withShareTimeout,
    qualityProfiles: QUALITY_PROFILES,
    ensureCall,
    configureCallQuality,
    sendToAll,
    renderStreams,
    renderPeople,
    toast
  });
  function withShareTimeout(promise, ms, message) {
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]).finally(() => clearTimeout(timer));
  }
  function setShareStatus(message = "", kind = "info") {
    const status = $("#shareStatus");
    status.hidden = !message;
    status.dataset.kind = kind;
    status.textContent = message ? tr(message) : "";
  }
  function shareAudioSources() {
    return sharePicker.sources.filter((s) => s.type === "window" && !/^Developer Tools/i.test(s.name));
  }
  function selectedShareSource() {
    return sharePicker.sources.find((s) => s.id === sharePicker.selectedId) || null;
  }
  function sharePeerReady() {
    return !!state.peer?.open && !state.peer.disconnected && !state.peer.destroyed;
  }
  function updateShareControls() {
    const selected = selectedShareSource(), audioId = $("#audioSourceSelect").value, audio = shareAudioSources().find((s) => s.id === audioId), validAudio = audioId === "none" || !!audio;
    const busy = !!capture.attempt, loading = sharePicker.loading;
    $("#startShareButton").disabled = busy || loading || !selected || !validAudio || !state.canStream || !sharePeerReady() || !state.activeRoom || !!state.localStream;
    $("#startShareButton").querySelector("span").textContent = busy ? "Preparando transmiss\xE3o\u2026" : "Iniciar transmiss\xE3o";
    $("#refreshSourcesButton").disabled = busy || loading;
    $("#shareQuality").disabled = busy;
    $("#audioSourceSelect").disabled = busy;
    for (const tab of [$("#shareScreensTab"), $("#shareWindowsTab")]) tab.disabled = busy;
    if (audioId === "none") $("#shareAudioHint").textContent = shareAudioSources().length ? "A transmiss\xE3o ter\xE1 somente v\xEDdeo." : "Nenhum aplicativo de \xE1udio dispon\xEDvel. Voc\xEA pode transmitir somente v\xEDdeo.";
    else if (audio) $("#shareAudioHint").textContent = "O \xE1udio ser\xE1 capturado do aplicativo selecionado.";
    else $("#shareAudioHint").textContent = "O aplicativo de \xE1udio selecionado n\xE3o est\xE1 dispon\xEDvel.";
  }
  function renderShareSources() {
    const root = $("#sourceOptions"), sources = sharePicker.sources.filter((s) => s.type === sharePicker.tab);
    root.setAttribute("aria-busy", String(sharePicker.loading));
    root.setAttribute("aria-labelledby", sharePicker.tab === "screen" ? "shareScreensTab" : "shareWindowsTab");
    $("#screenSourceCount").hidden = sharePicker.loading;
    $("#windowSourceCount").hidden = sharePicker.loading;
    $("#screenSourceCount").textContent = String(sharePicker.sources.filter((s) => s.type === "screen").length);
    $("#windowSourceCount").textContent = String(sharePicker.sources.filter((s) => s.type === "window").length);
    $("#shareSourceHint").textContent = sharePicker.tab === "screen" ? "Selecione uma tela" : "Selecione uma janela";
    if (sharePicker.loading && !sharePicker.sources.length) {
      root.innerHTML = Array.from({ length: 3 }, () => '<div class="source-skeleton" aria-hidden="true"><span class="skeleton skeleton-preview"></span><span class="skeleton skeleton-line"></span></div>').join("") + '<span class="sr-only">Carregando fontes\u2026</span>';
    } else if (sharePicker.error) {
      root.innerHTML = `<div class="source-error">${icon("alert-circle")}<strong>N\xE3o foi poss\xEDvel carregar as fontes</strong><small>Tente atualizar a lista.</small></div>`;
    } else if (!sources.length) {
      root.innerHTML = `<div class="source-empty">${icon(sharePicker.tab === "screen" ? "monitor" : "app-window")}<strong>${sharePicker.tab === "screen" ? "Nenhuma tela dispon\xEDvel" : "Nenhuma janela dispon\xEDvel"}</strong></div>`;
    } else root.innerHTML = sources.map((s) => {
      const preview = typeof s.thumbnail === "string" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(s.thumbnail) ? `<img class="source-thumb" src="${esc(s.thumbnail)}" alt="">` : `<span class="source-no-preview">${icon("monitor")}<small>Pr\xE9via indispon\xEDvel</small></span>`;
      return `<button type="button" class="source-option" data-source-id="${esc(s.id)}" aria-pressed="${s.id === sharePicker.selectedId}" title="${esc(s.name)}"><span class="source-preview">${preview}</span><span class="source-option-copy">${icon(s.type === "screen" ? "monitor" : "app-window", "icon-sm")}<strong data-no-translate>${esc(s.name)}</strong>${s.id === sharePicker.selectedId ? icon("check", "icon-sm") : ""}</span></button>`;
    }).join("");
    updateShareControls();
  }
  function setShareTab(tab, focus = false) {
    const next = tab === "window" ? "window" : "screen";
    if (next !== sharePicker.tab && selectedShareSource()?.type !== next) sharePicker.selectedId = null;
    sharePicker.tab = next;
    for (const [type, button] of [["screen", $("#shareScreensTab")], ["window", $("#shareWindowsTab")]]) {
      const active = type === sharePicker.tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    renderShareSources();
    if (focus) $(sharePicker.tab === "screen" ? "#shareScreensTab" : "#shareWindowsTab").focus();
  }
  function populateShareAudio(preferred = "") {
    const options = shareAudioSources();
    $("#audioSourceSelect").innerHTML = '<option value="none">Sem \xE1udio</option>' + options.map((s) => `<option value="${esc(s.id)}" data-no-translate>${esc(s.name)}</option>`).join("");
    const choice = preferred === "" || preferred === "none" ? "none" : options.find((s) => s.id === preferred)?.id || "";
    if (choice === "") $("#audioSourceSelect").insertAdjacentHTML("afterbegin", '<option value="">Aplicativo de \xE1udio indispon\xEDvel</option>');
    $("#audioSourceSelect").value = choice;
    updateShareControls();
  }
  async function listSources(refresh = false) {
    const generation = ++sharePicker.generation, previousSelection = sharePicker.selectedId, previousAudio = $("#audioSourceSelect").value;
    sharePicker.loading = true;
    sharePicker.error = "";
    if (!refresh) sharePicker.sources = [];
    setShareStatus(refresh ? "Atualizando fontes\u2026" : "");
    renderShareSources();
    try {
      const sources = await withShareTimeout(window.focoDesktop.listSources(), 1e4, "A lista de fontes demorou para responder.");
      if (generation !== sharePicker.generation || !$("#shareDialog").open) return;
      if (!Array.isArray(sources)) throw new Error("invalid sources");
      sharePicker.sources = sources.filter((s) => s && typeof s.id === "string" && typeof s.name === "string" && (s.type === "screen" || s.type === "window"));
      sharePicker.selectedId = sharePicker.sources.some((s) => s.id === previousSelection) ? previousSelection : null;
      populateShareAudio(previousAudio);
      if (previousSelection && !sharePicker.selectedId) setShareStatus("A fonte selecionada n\xE3o est\xE1 mais dispon\xEDvel. Escolha outra fonte.", "error");
      else setShareStatus();
    } catch (error) {
      if (generation !== sharePicker.generation || !$("#shareDialog").open) return;
      console.warn("Listagem de fontes:", error);
      sharePicker.sources = [];
      sharePicker.selectedId = null;
      sharePicker.error = "failed";
      populateShareAudio();
      setShareStatus("N\xE3o foi poss\xEDvel carregar as fontes. Tente atualizar a lista.", "error");
    } finally {
      if (generation === sharePicker.generation) {
        sharePicker.loading = false;
        renderShareSources();
      }
    }
  }
  function cancelSharePicker(close = true) {
    sharePicker.generation++;
    capture.cancelAttempt();
    if (close && $("#shareDialog").open) $("#shareDialog").close();
  }
  function openShareDialog() {
    if (state.localStream || !state.activeRoom || !sharePeerReady() || !state.canStream) return;
    const dialog = $("#shareDialog");
    if (dialog.open) return;
    sharePicker.sources = [];
    sharePicker.selectedId = null;
    sharePicker.tab = "screen";
    sharePicker.loading = true;
    sharePicker.error = "";
    sharePicker.audioExplicit = false;
    $("#shareQuality").value = localStorage.getItem("foco.quality") || "720p60";
    $("#audioSourceSelect").innerHTML = '<option value="none">Sem \xE1udio</option>';
    $("#audioSourceSelect").value = "none";
    setShareStatus();
    dialog.showModal();
    setShareTab("screen");
    $("#shareScreensTab").focus();
    listSources();
  }
  async function startSharing() {
    return capture.startSharing();
  }
  function stopSharing(showMessage = true, { remote = true } = {}) {
    return capture.stopSharing(showMessage, { remote });
  }
  async function kickMember(peerId) {
    const target = [...state.members.entries()].find(([, member]) => member.peerId === peerId);
    if (!target) return;
    try {
      await window.focoCloud.removeMember(state.activeRoom, target[0]);
      toast("Participante expulso e bloqueado.");
    } catch (error) {
      toast(mapAuthError(error));
    }
  }
  async function compressAvatar(file) {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = data;
    });
    const canvas = document.createElement("canvas"), scale = Math.min(1, 256 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  }
  async function enterCode(code) {
    const clean = window.focoCloud.cleanCode(code), generation = state.authGeneration, uid = state.user?.uid;
    if (!await confirmRoomSwitch(clean) || state.authGeneration !== generation || state.user?.uid !== uid) return;
    const room = await cloudCall(() => window.focoCloud.findRoom(clean));
    if (state.authGeneration !== generation || state.user?.uid !== uid) return;
    await connectRoom(room);
  }
  function authCurrent(generation, uid) {
    return roomSession.authCurrent(generation, uid);
  }
  function stopUserRoomsWatch() {
    state.roomsWatchVersion++;
    clearTimeout(roomsSlowTimer);
    roomsSlowTimer = null;
    if (unsubscribeUserRooms) {
      unsubscribeUserRooms();
      unsubscribeUserRooms = null;
    }
    state.roomsLoading = false;
    state.roomsSlow = false;
  }
  async function startUserRoomsWatch(generation, uid, { retry = false } = {}) {
    if (!authCurrent(generation, uid) || retry && state.roomsLoading) return;
    stopUserRoomsWatch();
    const version = state.roomsWatchVersion;
    state.roomsLoading = true;
    state.roomsError = false;
    renderRooms($("#roomSearch").value);
    roomsSlowTimer = setTimeout(() => {
      if (!authCurrent(generation, uid) || version !== state.roomsWatchVersion || !state.roomsLoading) return;
      state.roomsSlow = true;
      renderRooms($("#roomSearch").value);
    }, ROOMS_SLOW_MS);
    let unsubscribe = null, failed = false;
    const current = () => authCurrent(generation, uid) && version === state.roomsWatchVersion;
    const onError = (error) => {
      if (!current()) return;
      console.warn("Lista de salas:", error);
      failed = true;
      state.roomsLoading = false;
      state.roomsError = true;
      state.roomsSlow = false;
      clearTimeout(roomsSlowTimer);
      roomsSlowTimer = null;
      if (unsubscribe) {
        unsubscribe();
        if (unsubscribeUserRooms === unsubscribe) unsubscribeUserRooms = null;
      }
      renderRooms($("#roomSearch").value);
      if (retry) document.querySelector("#roomList .room-list-retry")?.focus();
    };
    try {
      unsubscribe = await window.focoCloud.watchUserRooms((rooms) => {
        if (!current()) return;
        state.roomsLoaded = true;
        state.roomsLoading = false;
        state.roomsError = false;
        state.roomsSlow = false;
        clearTimeout(roomsSlowTimer);
        roomsSlowTimer = null;
        state.rooms = rooms.filter((room) => room && !room.deleted).map((room) => ({ ...room, id: room.code, code: room.code, host: room.ownerUid === uid }));
        persistRooms();
        renderRooms($("#roomSearch").value);
      }, onError);
      if (!current() || failed) {
        unsubscribe?.();
        return;
      }
      unsubscribeUserRooms = unsubscribe;
    } catch (error) {
      onError(error);
    }
  }
  function clearAccountPresentation() {
    state.profile = { username: "", nickname: "Jogador", status: "Dispon\xEDvel", color: "#9b83ff", photo: "", showActivity: true, activity: "" };
    state.nickname = "Jogador";
    state.pendingPhoto = void 0;
    localStorage.removeItem("foco.nickname");
    $("#profileName").textContent = "";
    $("#profileStatusLabel").textContent = "";
    $("#profileAvatar").textContent = "";
    $("#profileAvatar").style.background = "";
    if ($("#profileDialog").open) $("#profileDialog").close();
  }
  async function activateUser(user, generation = roomSession.advanceAuth()) {
    if (!user) {
      stopUserRoomsWatch();
      if (state.user) disconnectRoom(false, { remote: false });
      roomSession.setUser(null);
      state.rooms = [];
      state.roomsLoaded = false;
      state.roomsError = false;
      clearAccountPresentation();
      renderRooms();
      showNoRoom();
      showAuthGate();
      dismissStartupScreen("auth");
      return;
    }
    const previousUid = state.user?.uid;
    if (previousUid && previousUid !== user.uid) {
      stopUserRoomsWatch();
      disconnectRoom(false, { remote: false });
      state.rooms = [];
      state.roomsLoaded = false;
      state.roomsError = false;
      clearAccountPresentation();
      showNoRoom();
      showAuthGate("Preparando sua conta\u2026");
    }
    roomSession.setUser(user);
    let profile = null;
    for (let attempt = 0; attempt < 12 && !profile; attempt++) {
      try {
        profile = await window.focoCloud.getProfile(user.uid);
      } catch (error) {
        if (!authCurrent(generation, user.uid)) return;
        throw error;
      }
      if (!authCurrent(generation, user.uid)) return;
      if (!profile) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!authCurrent(generation, user.uid)) return;
    if (!profile) {
      showAuthGate("Seu perfil ainda est\xE1 sendo criado. Feche e abra o app para tentar novamente.");
      dismissStartupScreen("auth");
      return;
    }
    state.profile = profile;
    setSignedInProfile(profile);
    hideAuthGate();
    dismissStartupScreen("auth");
    if (previousUid !== user.uid) {
      state.rooms = [];
      state.roomsLoaded = false;
    }
    await startUserRoomsWatch(generation, user.uid);
    if (!authCurrent(generation, user.uid)) return;
    if (state.pendingInvite) {
      const code = state.pendingInvite;
      state.pendingInvite = "";
      try {
        await enterCode(code);
      } catch (error) {
        if (authCurrent(generation, user.uid)) toast(mapAuthError(error));
      }
    }
  }
  function initCloudAuth() {
    if (!window.focoCloud?.isConfigured()) {
      showAuthGate("N\xE3o foi poss\xEDvel carregar a configura\xE7\xE3o online do Foco. Reinstale a vers\xE3o atualizada do app.");
      $("#backendSetup").hidden = true;
      $("#authForms").hidden = true;
      setRoomStatus("Falha na configura\xE7\xE3o online");
      dismissStartupScreen("auth");
      return;
    }
    $("#backendSetup").hidden = true;
    $("#authForms").hidden = false;
    if (unsubscribeAuth) unsubscribeAuth();
    unsubscribeAuth = window.focoCloud.onAuthChanged((user) => {
      if (user?.uid && state.user?.uid === user.uid && state.roomAttempt?.joinedOnce) return;
      const generation = roomSession.advanceAuth();
      activateUser(user, generation).catch((error) => {
        if (state.authGeneration !== generation) return;
        console.error("Sess\xE3o:", error);
        showAuthGate(mapAuthError(error));
        dismissStartupScreen("auth");
      });
    });
  }
  var authSubmitting = false;
  async function submitAuth(form, label, operation) {
    if (authSubmitting) return;
    authSubmitting = true;
    const button = form.querySelector('[type="submit"]'), original = button.textContent;
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    button.textContent = tr(label);
    $("#authError").textContent = "";
    try {
      await operation();
    } catch (error) {
      $("#authError").textContent = tr(mapAuthError(error));
      if (/email/i.test(error?.code || "")) form.querySelector('input[type="email"]')?.setAttribute("aria-invalid", "true");
    } finally {
      authSubmitting = false;
      button.disabled = false;
      form.removeAttribute("aria-busy");
      button.textContent = tr(original);
    }
  }
  $("#firebaseConfigForm").onsubmit = (event) => {
    event.preventDefault();
    const config = { apiKey: $("#firebaseApiKey").value.trim(), authDomain: $("#firebaseAuthDomain").value.trim(), databaseURL: $("#firebaseDatabaseURL").value.trim(), projectId: $("#firebaseProjectId").value.trim(), appId: $("#firebaseAppId").value.trim() };
    submitAuth($("#firebaseConfigForm"), "Conectando\u2026", async () => {
      if (unsubscribeAuth) {
        unsubscribeAuth();
        unsubscribeAuth = null;
      }
      await window.focoCloud.configure(config);
      $("#backendSetup").hidden = true;
      $("#authForms").hidden = false;
      initCloudAuth();
    });
  };
  $("#loginTab").onclick = () => setAuthMode("login");
  $("#registerTab").onclick = () => setAuthMode("register");
  $(".auth-tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setAuthMode(event.key === "Home" ? "login" : event.key === "End" ? "register" : $("#loginForm").hidden ? "login" : "register");
  });
  $("#loginForm").onsubmit = (event) => {
    event.preventDefault();
    submitAuth($("#loginForm"), "Conectando\u2026", () => window.focoCloud.login($("#loginEmail").value, $("#loginPassword").value));
  };
  $("#registerForm").onsubmit = (event) => {
    event.preventDefault();
    submitAuth($("#registerForm"), "Criando sua conta\u2026", () => window.focoCloud.register({ email: $("#registerEmail").value, password: $("#registerPassword").value, username: $("#registerUsername").value, nickname: $("#registerNickname").value }));
  };
  $("#authGate").addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...$("#authGate").querySelectorAll("button,input,select,textarea,[tabindex]")].filter((el) => !el.disabled && !el.hidden && !el.closest("[hidden]") && el.tabIndex >= 0);
    if (!controls.length) {
      event.preventDefault();
      return;
    }
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener("focusin", (event) => {
    if (startupDismissed && !$("#authGate").hidden && !$("#authGate").contains(event.target)) focusAuthGate();
  });
  $("#authGate").addEventListener("input", (event) => event.target.removeAttribute("aria-invalid"));
  $("#logoutButton").onclick = async () => {
    const code = state.activeRoom, peerId = state.peer?.id;
    disconnectRoom(false, { remote: false });
    state.activeRoom = null;
    $("#profileDialog").close();
    if (code && peerId) await window.focoCloud.exitRoom(code, peerId).catch(() => {
    });
    await window.focoCloud.logout();
  };
  $("#createRoom").onclick = () => showRoomDialog(false);
  $("#joinRoom").onclick = () => showRoomDialog(true);
  $("#roomForm").onsubmit = submitRoomForm;
  $("#homeCreateRoom").onclick = () => showRoomDialog(false);
  $("#homeJoinRoom").onclick = () => showRoomDialog(true);
  $("#shareButton").onclick = () => {
    if (state.localStream) stopSharing();
    else if (!state.canStream) toast("O dono da sala n\xE3o permitiu que seu perfil transmita.");
    else if (!state.peer || !state.peer.open) toast("Entre em uma sala antes de transmitir.");
    else openShareDialog();
  };
  $("#shareForm").onsubmit = (event) => {
    event.preventDefault();
    startSharing();
  };
  $("#cancelShareButton").onclick = () => cancelSharePicker();
  $("#shareDialog").addEventListener("close", () => {
    sharePicker.generation++;
    capture.cancelAttempt();
    $("#shareButton").focus();
  });
  $("#refreshSourcesButton").onclick = () => listSources(true);
  $("#shareScreensTab").onclick = () => setShareTab("screen");
  $("#shareWindowsTab").onclick = () => setShareTab("window");
  $(".share-tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setShareTab(event.key === "Home" ? "screen" : event.key === "End" ? "window" : sharePicker.tab === "screen" ? "window" : "screen", true);
  });
  $("#sourceOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-source-id]");
    if (!button || capture.attempt || sharePicker.loading) return;
    const source = sharePicker.sources.find((item) => item.id === button.dataset.sourceId);
    if (!source) return;
    const restoreFocus = document.activeElement === button;
    sharePicker.selectedId = source.id;
    populateShareAudio(!sharePicker.audioExplicit && source.type === "window" ? source.id : $("#audioSourceSelect").value);
    setShareStatus();
    renderShareSources();
    if (restoreFocus) [...$("#sourceOptions").querySelectorAll("[data-source-id]")].find((item) => item.dataset.sourceId === source.id)?.focus();
  });
  $("#audioSourceSelect").onchange = () => {
    sharePicker.audioExplicit = true;
    setShareStatus();
    updateShareControls();
  };
  async function copyText(value) {
    try {
      if (window.focoDesktop?.writeClipboard) {
        await window.focoDesktop.writeClipboard(value);
        return true;
      }
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }
  $("#inviteButton").onclick = async () => {
    const room = currentRoom();
    if (!room) {
      toast("Entre em uma sala primeiro.");
      return;
    }
    const link = `foco://join/${room.code}`;
    if (await copyText(link)) toast("Link de convite copiado.");
    else toast(`N\xE3o foi poss\xEDvel copiar. Link: ${link}`);
  };
  $("#copyRoomCode").onclick = async () => {
    const room = currentRoom();
    if (!room) {
      toast("Entre em uma sala para copiar o c\xF3digo.");
      return;
    }
    if (await copyText(room.code)) toast(`C\xF3digo ${room.code} copiado.`);
    else toast(`N\xE3o foi poss\xEDvel copiar. C\xF3digo: ${room.code}`);
  };
  $("#roomSearch").oninput = (e) => renderRooms(e.target.value);
  $("#roomList").addEventListener("click", (event) => {
    if (event.target.closest(".room-list-retry") && state.user && !state.roomsLoading) startUserRoomsWatch(state.authGeneration, state.user.uid, { retry: true });
  });
  $("#profileButton").onclick = openProfile;
  $("#sidebarToggle").onclick = toggleSidebar;
  $("#panelToggle").onclick = () => setPanelOpen(!isPanelOpen());
  $("#participantsButton").onclick = () => {
    setPanelOpen(true);
    setPanelTab("people");
  };
  $("#chatTab").onclick = () => setPanelTab("chat");
  $("#peopleTab").onclick = () => setPanelTab("people");
  $("#peopleList").addEventListener("click", (event) => {
    const focus = event.target.closest("[data-person-focus]");
    if (focus) {
      const id = focus.dataset.personFocus;
      if (state.streamTiles.has(id)) {
        focusStream(id);
        if (!WIDE_PANEL_QUERY.matches) setPanelOpen(false);
        state.streamTiles.get(id)?.card.focus();
      }
      return;
    }
    const menuButton = event.target.closest("[data-person-menu]");
    if (menuButton) {
      const uid = menuButton.dataset.personMenu, opened = state.openPersonMenu === uid;
      closePersonMenu();
      if (!opened) {
        const menu = menuButton.parentElement.querySelector("[data-person-menu-content]");
        if (menu) {
          menu.hidden = false;
          menuButton.setAttribute("aria-expanded", "true");
          state.openPersonMenu = uid;
          menu.querySelector("button")?.focus();
        }
      }
      return;
    }
    const manage = event.target.closest("[data-person-manage]");
    if (manage) {
      const uid = manage.dataset.personManage;
      if (!(state.isHost || state.profile.role === "moderator") || uid === state.user?.uid) return;
      closePersonMenu();
      openRoomManagement();
      const target = [...$("#roomMembersManage").querySelectorAll("[data-uid]")].find((button) => button.dataset.uid === uid);
      target?.scrollIntoView({ block: "nearest" });
      target?.focus();
    }
  });
  $("#peopleList").addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.openPersonMenu) {
      event.preventDefault();
      closePersonMenu(true);
    }
  });
  document.querySelector(".panel-tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setPanelTab(event.key === "Home" ? "chat" : event.key === "End" ? "people" : state.panelTab === "chat" ? "people" : "chat");
    $(state.panelTab === "chat" ? "#chatTab" : "#peopleTab").focus();
  });
  for (const query of [WIDE_SIDEBAR_QUERY, WIDE_PANEL_QUERY]) query.addEventListener("change", applyShellLayout);
  $("#confirmAccept").onclick = () => settleConfirm(true);
  $("#confirmCancel").onclick = () => settleConfirm(false);
  $("#confirmDialog").addEventListener("close", () => settleConfirm(false));
  $("#settingsButton").onclick = openSettings;
  $("#manageRoomButton").onclick = openRoomManagement;
  document.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close]");
    if (close) document.getElementById(close.dataset.close)?.close();
  });
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));
  $("#profilePhoto").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast("Escolha uma imagem de at\xE9 8 MB.");
      event.target.value = "";
      return;
    }
    try {
      state.pendingPhoto = await compressAvatar(file);
      $("#profilePhotoPreview").innerHTML = `<img src="${state.pendingPhoto}" alt="Pr\xE9via da foto"><span>Pr\xE9via da foto</span>`;
      updateProfilePreview();
    } catch {
      toast("N\xE3o foi poss\xEDvel carregar esta imagem.");
    }
  };
  var profileSubmitting = false;
  $("#profileForm").onsubmit = async (event) => {
    event.preventDefault();
    if (profileSubmitting) return;
    const nickname = $("#nicknameInput").value.trim();
    if (!nickname) {
      setProfileFormStatus("Digite um apelido.");
      $("#nicknameInput").setAttribute("aria-invalid", "true");
      return;
    }
    const generation = state.authGeneration, uid = state.user?.uid;
    const profile = { nickname: nickname.slice(0, 24), status: $("#profileStatus").value.trim().slice(0, 48) || "Dispon\xEDvel", activity: $("#profileActivity").value.trim().slice(0, 80), color: $("#profileColor").value, showActivity: $("#showActivity").checked, photo: state.pendingPhoto ?? state.profile.photo };
    profileSubmitting = true;
    const button = $("#profileForm").querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = tr("Salvando\u2026");
    $("#profileForm").setAttribute("aria-busy", "true");
    setProfileFormStatus("Salvando perfil\u2026", "info");
    try {
      const saved = await cloudCall(() => window.focoCloud.saveProfile(profile));
      if (!authCurrent(generation, uid)) return;
      state.profile = saved;
      state.pendingPhoto = void 0;
      setSignedInProfile(saved);
      renderPeople();
      await window.focoCloud.syncProfileToRooms(saved);
      if (!authCurrent(generation, uid)) return;
      $("#profileDialog").close();
      toast("Perfil atualizado.");
    } catch (error) {
      if (authCurrent(generation, uid)) setProfileFormStatus(mapAuthError(error));
    } finally {
      profileSubmitting = false;
      button.disabled = false;
      button.textContent = tr("Salvar");
      $("#profileForm").removeAttribute("aria-busy");
    }
  };
  $("#nicknameInput").addEventListener("input", () => $("#nicknameInput").removeAttribute("aria-invalid"));
  $("#defaultQuality").onchange = (event) => {
    localStorage.setItem("foco.quality", event.target.value);
    $("#shareQuality").value = event.target.value;
    toast("Qualidade padr\xE3o atualizada.");
  };
  $("#shareQuality").onchange = updateShareControls;
  $("#appLanguage").onchange = (event) => window.focoI18n?.setLanguage(event.target.value);
  window.addEventListener("foco-language-change", () => {
    applyShellLayout();
    if (!state.activeRoom) $("#roomName").textContent = tr("In\xEDcio");
    renderPeople();
    renderStreams();
    for (const tile of state.streamTiles.values()) if (tile.failure) {
      const panel = tile.card.querySelector(".stream-error");
      if (panel) panel.textContent = tr(tile.failure.message);
    }
    if (state.roomStatus.text) setRoomStatus(state.roomStatus.text, state.roomStatus.good);
    renderRoomChat();
    toast("Idioma alterado.");
  });
  $("#chatInput").oninput = () => {
    resizeChatInput();
    updateChatControls();
    if ($("#chatSendStatus").dataset.kind === "error") $("#chatSendStatus").hidden = true;
  };
  $("#chatInput").onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      sendChatMessage();
    }
  };
  $("#chatSendButton").onclick = sendChatMessage;
  $("#chatMessages").addEventListener("scroll", () => {
    if (!chatAtBottom()) state.chatForceBottom = false;
    updateChatUnread();
  }, { passive: true });
  $("#chatJump").onclick = () => {
    $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
    updateChatUnread();
    $("#chatMessages").focus();
  };
  $("#chatLoadStatus").onclick = (event) => {
    if (event.target.closest("[data-retry-chat]") && state.activeRoom) watchPanelChat(state.activeRoom);
  };
  $("#peopleLoadStatus").onclick = (event) => {
    if (event.target.closest("[data-retry-members]") && state.activeRoom) watchPanelMembers(state.activeRoom);
  };
  $("#chatAttachButton").onclick = () => $("#chatFileInput").click();
  $("#chatEmojiButton").onclick = openChatEmojiPicker;
  $("#chatFileInput").onchange = async (event) => {
    const file = event.target.files?.[0], room = state.activeRoom, generation = state.p2pGeneration;
    if (!file || !room) return;
    try {
      const media = await prepareChatImage(file);
      if (room !== state.activeRoom || generation !== state.p2pGeneration) return;
      state.chatMedia = media;
      updateChatAttachment();
      toast("Imagem pronta para enviar.");
    } catch (error) {
      if (room !== state.activeRoom || generation !== state.p2pGeneration) return;
      state.chatMedia = null;
      event.target.value = "";
      toast(error.message === "file" ? "N\xE3o foi poss\xEDvel abrir esta imagem." : error.message);
    }
  };
  $("#chatMessages").onclick = async (event) => {
    const image = event.target.closest("[data-chat-media]");
    if (image) {
      image.classList.toggle("zoomed");
      return;
    }
    const removeButton = event.target.closest("[data-chat-delete]");
    if (!removeButton) return;
    try {
      await window.focoCloud.deleteRoomChatMessage(state.activeRoom, removeButton.dataset.chatDelete);
      toast("Mensagem removida.");
    } catch (error) {
      toast(error.message || "N\xE3o foi poss\xEDvel remover a mensagem.");
    }
  };
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#chatEmojiButton,#chatEmojiPicker")) closeChatEmojiPicker();
    if (!event.target.closest("#peopleList")) closePersonMenu();
  });
  $("#checkUpdatesButton").onclick = async () => {
    try {
      await window.focoDesktop.checkForUpdates();
    } catch (error) {
      console.warn("Falha na verifica\xE7\xE3o de atualiza\xE7\xF5es:", error);
      renderUpdateStatus({ state: "error" });
    }
  };
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".stream-actions")) closeStreamMenus();
  });
  $("#gridViewButton").onclick = () => setDisplayMode("grid");
  $("#listViewButton").onclick = () => setDisplayMode("focus");
  $("#leaveRoomButton").onclick = leaveCurrentRoom;
  $("#deleteRoomButton").onclick = deleteCurrentRoom;
  $("#rotateRoomCodeButton").onclick = rotateRoomCode;
  $("#reduceMotionEnabled").onchange = (event) => {
    localStorage.setItem("foco.reduceMotion", String(event.target.checked));
    document.documentElement.classList.toggle("reduce-motion", event.target.checked);
  };
  $("#nicknameInput").oninput = updateProfilePreview;
  $("#profileStatus").oninput = updateProfilePreview;
  $("#profilePalette").onclick = (event) => {
    const swatch = event.target.closest("[data-profile-color]");
    if (swatch) setProfileColor(swatch.dataset.profileColor);
  };
  $("#profileColor").oninput = (event) => setProfileColor(event.target.value);
  $("#profileColorHex").oninput = (event) => {
    const value = event.target.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) setProfileColor(value);
  };
  $("#profileColorHex").onblur = (event) => {
    if (!/^#[0-9a-f]{6}$/i.test(event.target.value.trim())) event.target.value = $("#profileColor").value;
  };
  document.addEventListener("keydown", (event) => {
    if (document.querySelector("dialog[open]")) return;
    if (event.key === "Escape") {
      if (document.fullscreenElement) {
        event.preventDefault();
        document.exitFullscreen().catch(() => {
        });
        return;
      }
      if (state.expandedId) {
        const card = state.streamTiles.get(state.expandedId)?.card;
        if (card) setExpandedMode(card);
        return;
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || !state.activeRoom || !state.focusedId || event.target.closest('input,textarea,select,[contenteditable="true"],.stream-menu,[role="menu"],[role="listbox"],[aria-haspopup="true"],.panel-tabs') || !(event.target.closest("#stage") || event.target === document.body)) return;
    const tile = state.streamTiles.get(state.focusedId);
    if (!tile) return;
    const key = event.key.toLowerCase();
    if (key === "f") {
      event.preventDefault();
      setTheaterMode(tile.card);
    } else if (key === "m" && !tile.local && tile.stream?.getAudioTracks().length) {
      event.preventDefault();
      const prefs = playbackPrefs(tile.id);
      prefs.muted = !prefs.muted;
      applyPlayback(tile);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      cycleStage(event.key === "ArrowRight" ? 1 : -1);
    }
  });
  window.addEventListener("beforeunload", () => {
    cancelSharePicker();
    disconnectRoom(false);
  });
  $("#shareQuality").value = localStorage.getItem("foco.quality") || "720p60";
  document.documentElement.classList.toggle("reduce-motion", localStorage.getItem("foco.reduceMotion") === "true");
  var stageObserver = new ResizeObserver(() => updateStageGeometry());
  stageObserver.observe($("#stage"));
  applyShellLayout();
  setPanelTab("chat");
  setDisplayMode("focus");
  renderRooms();
  showNoRoom();
  renderPeople();
  renderStreams();
  setInterval(refreshStreamQuality, 2500);
  startupAuthTimer = setTimeout(() => {
    if (!startupReady.auth) {
      $("#startupMessage").textContent = tr("A verifica\xE7\xE3o da sess\xE3o est\xE1 demorando. Confira sua conex\xE3o.");
      $("#startupScreen").classList.add("is-slow");
    }
  }, 12e3);
  initCloudAuth();
  initializeUpdateUi();
  window.focoDesktop.getPendingInvite?.().then((code) => {
    if (code) state.pendingInvite = code;
  }).catch(() => {
  });
  window.focoDesktop.onInvite?.((code) => {
    if (state.user) enterCode(code).catch((error) => toast(mapAuthError(error)));
    else {
      state.pendingInvite = code;
      showAuthGate("Entre ou crie uma conta para abrir o convite.");
    }
  });
  if (/-(?:smoke|fixture)\.html$/.test(location.pathname)) {
    Object.defineProperty(window, "validRooms", { configurable: true, get() {
      return validRooms;
    }, set(value) {
      validRooms = value;
    } });
    Object.defineProperty(window, "state", { configurable: true, get() {
      return state;
    } });
    Object.defineProperty(window, "QUALITY_PROFILES", { configurable: true, get() {
      return QUALITY_PROFILES;
    } });
    Object.defineProperty(window, "toastTimer", { configurable: true, get() {
      return toastTimer;
    }, set(value) {
      toastTimer = value;
    } });
    Object.defineProperty(window, "unsubscribeUserRooms", { configurable: true, get() {
      return unsubscribeUserRooms;
    }, set(value) {
      unsubscribeUserRooms = value;
    } });
    Object.defineProperty(window, "unsubscribeAuth", { configurable: true, get() {
      return unsubscribeAuth;
    }, set(value) {
      unsubscribeAuth = value;
    } });
    Object.defineProperty(window, "appVersion", { configurable: true, get() {
      return appVersion;
    }, set(value) {
      appVersion = value;
    } });
    Object.defineProperty(window, "startupDismissed", { configurable: true, get() {
      return startupDismissed;
    }, set(value) {
      startupDismissed = value;
    } });
    Object.defineProperty(window, "startupAuthTimer", { configurable: true, get() {
      return startupAuthTimer;
    }, set(value) {
      startupAuthTimer = value;
    } });
    Object.defineProperty(window, "lastRenderedUpdateState", { configurable: true, get() {
      return lastRenderedUpdateState;
    }, set(value) {
      lastRenderedUpdateState = value;
    } });
    Object.defineProperty(window, "$", { configurable: true, get() {
      return $;
    } });
    Object.defineProperty(window, "icon", { configurable: true, get() {
      return icon;
    } });
    Object.defineProperty(window, "esc", { configurable: true, get() {
      return esc;
    } });
    Object.defineProperty(window, "roomSession", { configurable: true, get() {
      return roomSession;
    } });
    Object.defineProperty(window, "p2p", { configurable: true, get() {
      return p2p;
    } });
    Object.defineProperty(window, "roomFlow", { configurable: true, get() {
      return roomFlow;
    } });
    Object.defineProperty(window, "toast", { configurable: true, get() {
      return toast;
    }, set(value) {
      toast = value;
    } });
    Object.defineProperty(window, "updateStatusLabel", { configurable: true, get() {
      return updateStatusLabel;
    }, set(value) {
      updateStatusLabel = value;
    } });
    Object.defineProperty(window, "startupReady", { configurable: true, get() {
      return startupReady;
    } });
    Object.defineProperty(window, "dismissStartupScreen", { configurable: true, get() {
      return dismissStartupScreen;
    }, set(value) {
      dismissStartupScreen = value;
    } });
    Object.defineProperty(window, "renderUpdateStatus", { configurable: true, get() {
      return renderUpdateStatus;
    }, set(value) {
      renderUpdateStatus = value;
    } });
    Object.defineProperty(window, "initializeUpdateUi", { configurable: true, get() {
      return initializeUpdateUi;
    }, set(value) {
      initializeUpdateUi = value;
    } });
    Object.defineProperty(window, "persistRooms", { configurable: true, get() {
      return persistRooms;
    }, set(value) {
      persistRooms = value;
    } });
    Object.defineProperty(window, "randomCode", { configurable: true, get() {
      return randomCode;
    }, set(value) {
      randomCode = value;
    } });
    Object.defineProperty(window, "currentRoom", { configurable: true, get() {
      return currentRoom;
    }, set(value) {
      currentRoom = value;
    } });
    Object.defineProperty(window, "showNoRoom", { configurable: true, get() {
      return showNoRoom;
    }, set(value) {
      showNoRoom = value;
    } });
    Object.defineProperty(window, "openSettings", { configurable: true, get() {
      return openSettings;
    }, set(value) {
      openSettings = value;
    } });
    Object.defineProperty(window, "focusAuthGate", { configurable: true, get() {
      return focusAuthGate;
    }, set(value) {
      focusAuthGate = value;
    } });
    Object.defineProperty(window, "showAuthGate", { configurable: true, get() {
      return showAuthGate;
    }, set(value) {
      showAuthGate = value;
    } });
    Object.defineProperty(window, "hideAuthGate", { configurable: true, get() {
      return hideAuthGate;
    }, set(value) {
      hideAuthGate = value;
    } });
    Object.defineProperty(window, "setAuthMode", { configurable: true, get() {
      return setAuthMode;
    }, set(value) {
      setAuthMode = value;
    } });
    Object.defineProperty(window, "mapAuthError", { configurable: true, get() {
      return mapAuthError;
    }, set(value) {
      mapAuthError = value;
    } });
    Object.defineProperty(window, "setSignedInProfile", { configurable: true, get() {
      return setSignedInProfile;
    }, set(value) {
      setSignedInProfile = value;
    } });
    Object.defineProperty(window, "updateProfilePreview", { configurable: true, get() {
      return updateProfilePreview;
    }, set(value) {
      updateProfilePreview = value;
    } });
    Object.defineProperty(window, "setProfileColor", { configurable: true, get() {
      return setProfileColor;
    }, set(value) {
      setProfileColor = value;
    } });
    Object.defineProperty(window, "openProfile", { configurable: true, get() {
      return openProfile;
    }, set(value) {
      openProfile = value;
    } });
    Object.defineProperty(window, "setProfileFormStatus", { configurable: true, get() {
      return setProfileFormStatus;
    }, set(value) {
      setProfileFormStatus = value;
    } });
    Object.defineProperty(window, "openRoomManagement", { configurable: true, get() {
      return openRoomManagement;
    }, set(value) {
      openRoomManagement = value;
    } });
    Object.defineProperty(window, "rotateRoomCode", { configurable: true, get() {
      return rotateRoomCode;
    }, set(value) {
      rotateRoomCode = value;
    } });
    Object.defineProperty(window, "waitForRoomReady", { configurable: true, get() {
      return waitForRoomReady;
    }, set(value) {
      waitForRoomReady = value;
    } });
    Object.defineProperty(window, "renderRoomModeration", { configurable: true, get() {
      return renderRoomModeration;
    }, set(value) {
      renderRoomModeration = value;
    } });
    Object.defineProperty(window, "leaveCurrentRoom", { configurable: true, get() {
      return leaveCurrentRoom;
    }, set(value) {
      leaveCurrentRoom = value;
    } });
    Object.defineProperty(window, "deleteCurrentRoom", { configurable: true, get() {
      return deleteCurrentRoom;
    }, set(value) {
      deleteCurrentRoom = value;
    } });
    Object.defineProperty(window, "cloudCall", { configurable: true, get() {
      return cloudCall;
    }, set(value) {
      cloudCall = value;
    } });
    Object.defineProperty(window, "setDisplayMode", { configurable: true, get() {
      return setDisplayMode;
    }, set(value) {
      setDisplayMode = value;
    } });
    Object.defineProperty(window, "tr", { configurable: true, get() {
      return tr;
    } });
    Object.defineProperty(window, "WIDE_SIDEBAR_QUERY", { configurable: true, get() {
      return WIDE_SIDEBAR_QUERY;
    } });
    Object.defineProperty(window, "ROOMS_SLOW_MS", { configurable: true, get() {
      return ROOMS_SLOW_MS;
    } });
    Object.defineProperty(window, "roomsSlowTimer", { configurable: true, get() {
      return roomsSlowTimer;
    }, set(value) {
      roomsSlowTimer = value;
    } });
    Object.defineProperty(window, "storedFlag", { configurable: true, get() {
      return storedFlag;
    }, set(value) {
      storedFlag = value;
    } });
    Object.defineProperty(window, "isSidebarCollapsed", { configurable: true, get() {
      return isSidebarCollapsed;
    }, set(value) {
      isSidebarCollapsed = value;
    } });
    Object.defineProperty(window, "isPanelOpen", { configurable: true, get() {
      return isPanelOpen;
    }, set(value) {
      isPanelOpen = value;
    } });
    Object.defineProperty(window, "applyShellLayout", { configurable: true, get() {
      return applyShellLayout;
    }, set(value) {
      applyShellLayout = value;
    } });
    Object.defineProperty(window, "toggleSidebar", { configurable: true, get() {
      return toggleSidebar;
    }, set(value) {
      toggleSidebar = value;
    } });
    Object.defineProperty(window, "setPanelOpen", { configurable: true, get() {
      return setPanelOpen;
    }, set(value) {
      setPanelOpen = value;
    } });
    Object.defineProperty(window, "setPanelTab", { configurable: true, get() {
      return setPanelTab;
    }, set(value) {
      setPanelTab = value;
    } });
    Object.defineProperty(window, "latestMessageAt", { configurable: true, get() {
      return latestMessageAt;
    }, set(value) {
      latestMessageAt = value;
    } });
    Object.defineProperty(window, "chatAtBottom", { configurable: true, get() {
      return chatAtBottom;
    }, set(value) {
      chatAtBottom = value;
    } });
    Object.defineProperty(window, "chatVisible", { configurable: true, get() {
      return chatVisible;
    }, set(value) {
      chatVisible = value;
    } });
    Object.defineProperty(window, "updateChatUnread", { configurable: true, get() {
      return updateChatUnread;
    }, set(value) {
      updateChatUnread = value;
    } });
    Object.defineProperty(window, "confirmResolver", { configurable: true, get() {
      return confirmResolver;
    }, set(value) {
      confirmResolver = value;
    } });
    Object.defineProperty(window, "showConfirmDialog", { configurable: true, get() {
      return showConfirmDialog;
    }, set(value) {
      showConfirmDialog = value;
    } });
    Object.defineProperty(window, "settleConfirm", { configurable: true, get() {
      return settleConfirm;
    }, set(value) {
      settleConfirm = value;
    } });
    Object.defineProperty(window, "pendingRoomActions", { configurable: true, get() {
      return pendingRoomActions;
    } });
    Object.defineProperty(window, "confirmedRoomAction", { configurable: true, get() {
      return confirmedRoomAction;
    }, set(value) {
      confirmedRoomAction = value;
    } });
    Object.defineProperty(window, "confirmRoomSwitch", { configurable: true, get() {
      return confirmRoomSwitch;
    }, set(value) {
      confirmRoomSwitch = value;
    } });
    Object.defineProperty(window, "setRoomStatus", { configurable: true, get() {
      return setRoomStatus;
    }, set(value) {
      setRoomStatus = value;
    } });
    Object.defineProperty(window, "roomUi", { configurable: true, get() {
      return roomUi;
    } });
    Object.defineProperty(window, "roomInitial", { configurable: true, get() {
      return roomInitial;
    }, set(value) {
      roomInitial = value;
    } });
    Object.defineProperty(window, "renderRooms", { configurable: true, get() {
      return renderRooms;
    }, set(value) {
      renderRooms = value;
    } });
    Object.defineProperty(window, "renderPeople", { configurable: true, get() {
      return renderPeople;
    }, set(value) {
      renderPeople = value;
    } });
    Object.defineProperty(window, "closePersonMenu", { configurable: true, get() {
      return closePersonMenu;
    }, set(value) {
      closePersonMenu = value;
    } });
    Object.defineProperty(window, "chat", { configurable: true, get() {
      return chat;
    } });
    Object.defineProperty(window, "updateChatControls", { configurable: true, get() {
      return updateChatControls;
    }, set(value) {
      updateChatControls = value;
    } });
    Object.defineProperty(window, "chatTextHtml", { configurable: true, get() {
      return chatTextHtml;
    }, set(value) {
      chatTextHtml = value;
    } });
    Object.defineProperty(window, "chatMessageNode", { configurable: true, get() {
      return chatMessageNode;
    }, set(value) {
      chatMessageNode = value;
    } });
    Object.defineProperty(window, "renderRoomChat", { configurable: true, get() {
      return renderRoomChat;
    }, set(value) {
      renderRoomChat = value;
    } });
    Object.defineProperty(window, "updateChatAttachment", { configurable: true, get() {
      return updateChatAttachment;
    }, set(value) {
      updateChatAttachment = value;
    } });
    Object.defineProperty(window, "fileAsDataUrl", { configurable: true, get() {
      return fileAsDataUrl;
    }, set(value) {
      fileAsDataUrl = value;
    } });
    Object.defineProperty(window, "prepareChatImage", { configurable: true, get() {
      return prepareChatImage;
    }, set(value) {
      prepareChatImage = value;
    } });
    Object.defineProperty(window, "resizeChatInput", { configurable: true, get() {
      return resizeChatInput;
    }, set(value) {
      resizeChatInput = value;
    } });
    Object.defineProperty(window, "closeChatEmojiPicker", { configurable: true, get() {
      return closeChatEmojiPicker;
    }, set(value) {
      closeChatEmojiPicker = value;
    } });
    Object.defineProperty(window, "openChatEmojiPicker", { configurable: true, get() {
      return openChatEmojiPicker;
    }, set(value) {
      openChatEmojiPicker = value;
    } });
    Object.defineProperty(window, "sendChatMessage", { configurable: true, get() {
      return sendChatMessage;
    }, set(value) {
      sendChatMessage = value;
    } });
    Object.defineProperty(window, "makeChatAvatar", { configurable: true, get() {
      return makeChatAvatar;
    }, set(value) {
      makeChatAvatar = value;
    } });
    Object.defineProperty(window, "avatarColor", { configurable: true, get() {
      return avatarColor;
    }, set(value) {
      avatarColor = value;
    } });
    Object.defineProperty(window, "stage", { configurable: true, get() {
      return stage;
    } });
    Object.defineProperty(window, "syncFullscreenState", { configurable: true, get() {
      return syncFullscreenState;
    }, set(value) {
      syncFullscreenState = value;
    } });
    Object.defineProperty(window, "setTheaterMode", { configurable: true, get() {
      return setTheaterMode;
    }, set(value) {
      setTheaterMode = value;
    } });
    Object.defineProperty(window, "setExpandedMode", { configurable: true, get() {
      return setExpandedMode;
    }, set(value) {
      setExpandedMode = value;
    } });
    Object.defineProperty(window, "setText", { configurable: true, get() {
      return setText;
    }, set(value) {
      setText = value;
    } });
    Object.defineProperty(window, "setHTML", { configurable: true, get() {
      return setHTML;
    }, set(value) {
      setHTML = value;
    } });
    Object.defineProperty(window, "setAttr", { configurable: true, get() {
      return setAttr;
    }, set(value) {
      setAttr = value;
    } });
    Object.defineProperty(window, "setStyle", { configurable: true, get() {
      return setStyle;
    }, set(value) {
      setStyle = value;
    } });
    Object.defineProperty(window, "playbackPrefs", { configurable: true, get() {
      return playbackPrefs;
    }, set(value) {
      playbackPrefs = value;
    } });
    Object.defineProperty(window, "qualityLabel", { configurable: true, get() {
      return qualityLabel;
    }, set(value) {
      qualityLabel = value;
    } });
    Object.defineProperty(window, "qualityTitle", { configurable: true, get() {
      return qualityTitle;
    }, set(value) {
      qualityTitle = value;
    } });
    Object.defineProperty(window, "closeStreamMenus", { configurable: true, get() {
      return closeStreamMenus;
    }, set(value) {
      closeStreamMenus = value;
    } });
    Object.defineProperty(window, "focusStream", { configurable: true, get() {
      return focusStream;
    }, set(value) {
      focusStream = value;
    } });
    Object.defineProperty(window, "stageIds", { configurable: true, get() {
      return stageIds;
    }, set(value) {
      stageIds = value;
    } });
    Object.defineProperty(window, "cycleStage", { configurable: true, get() {
      return cycleStage;
    }, set(value) {
      cycleStage = value;
    } });
    Object.defineProperty(window, "createStreamTile", { configurable: true, get() {
      return createStreamTile;
    }, set(value) {
      createStreamTile = value;
    } });
    Object.defineProperty(window, "applyPlayback", { configurable: true, get() {
      return applyPlayback;
    }, set(value) {
      applyPlayback = value;
    } });
    Object.defineProperty(window, "tileMediaState", { configurable: true, get() {
      return tileMediaState;
    }, set(value) {
      tileMediaState = value;
    } });
    Object.defineProperty(window, "refreshTileMediaState", { configurable: true, get() {
      return refreshTileMediaState;
    }, set(value) {
      refreshTileMediaState = value;
    } });
    Object.defineProperty(window, "setTileFailure", { configurable: true, get() {
      return setTileFailure;
    }, set(value) {
      setTileFailure = value;
    } });
    Object.defineProperty(window, "stopTileMediaWatch", { configurable: true, get() {
      return stopTileMediaWatch;
    }, set(value) {
      stopTileMediaWatch = value;
    } });
    Object.defineProperty(window, "attachTileMedia", { configurable: true, get() {
      return attachTileMedia;
    }, set(value) {
      attachTileMedia = value;
    } });
    Object.defineProperty(window, "updateStreamTile", { configurable: true, get() {
      return updateStreamTile;
    }, set(value) {
      updateStreamTile = value;
    } });
    Object.defineProperty(window, "destroyStreamTile", { configurable: true, get() {
      return destroyStreamTile;
    }, set(value) {
      destroyStreamTile = value;
    } });
    Object.defineProperty(window, "refreshStreamTiles", { configurable: true, get() {
      return refreshStreamTiles;
    }, set(value) {
      refreshStreamTiles = value;
    } });
    Object.defineProperty(window, "updatePendingTile", { configurable: true, get() {
      return updatePendingTile;
    }, set(value) {
      updatePendingTile = value;
    } });
    Object.defineProperty(window, "updateStageGeometry", { configurable: true, get() {
      return updateStageGeometry;
    }, set(value) {
      updateStageGeometry = value;
    } });
    Object.defineProperty(window, "renderStreams", { configurable: true, get() {
      return renderStreams;
    }, set(value) {
      renderStreams = value;
    } });
    Object.defineProperty(window, "sampleStreamQuality", { configurable: true, get() {
      return sampleStreamQuality;
    }, set(value) {
      sampleStreamQuality = value;
    } });
    Object.defineProperty(window, "refreshStreamQuality", { configurable: true, get() {
      return refreshStreamQuality;
    }, set(value) {
      refreshStreamQuality = value;
    } });
    Object.defineProperty(window, "showStreamError", { configurable: true, get() {
      return showStreamError;
    }, set(value) {
      showStreamError = value;
    } });
    Object.defineProperty(window, "p2pContext", { configurable: true, get() {
      return p2pContext;
    }, set(value) {
      p2pContext = value;
    } });
    Object.defineProperty(window, "sameRoomIdentity", { configurable: true, get() {
      return sameRoomIdentity;
    }, set(value) {
      sameRoomIdentity = value;
    } });
    Object.defineProperty(window, "sameP2PSession", { configurable: true, get() {
      return sameP2PSession;
    }, set(value) {
      sameP2PSession = value;
    } });
    Object.defineProperty(window, "currentP2P", { configurable: true, get() {
      return currentP2P;
    }, set(value) {
      currentP2P = value;
    } });
    Object.defineProperty(window, "memberForPeer", { configurable: true, get() {
      return memberForPeer;
    }, set(value) {
      memberForPeer = value;
    } });
    Object.defineProperty(window, "revokePeer", { configurable: true, get() {
      return revokePeer;
    }, set(value) {
      revokePeer = value;
    } });
    Object.defineProperty(window, "authorizePeer", { configurable: true, get() {
      return authorizePeer;
    }, set(value) {
      authorizePeer = value;
    } });
    Object.defineProperty(window, "sendToAll", { configurable: true, get() {
      return sendToAll;
    }, set(value) {
      sendToAll = value;
    } });
    Object.defineProperty(window, "handleData", { configurable: true, get() {
      return handleData;
    }, set(value) {
      handleData = value;
    } });
    Object.defineProperty(window, "ensureDataConnection", { configurable: true, get() {
      return ensureDataConnection;
    }, set(value) {
      ensureDataConnection = value;
    } });
    Object.defineProperty(window, "ensureCall", { configurable: true, get() {
      return ensureCall;
    }, set(value) {
      ensureCall = value;
    } });
    Object.defineProperty(window, "watchMediaConnection", { configurable: true, get() {
      return watchMediaConnection;
    }, set(value) {
      watchMediaConnection = value;
    } });
    Object.defineProperty(window, "configureCallQuality", { configurable: true, get() {
      return configureCallQuality;
    }, set(value) {
      configureCallQuality = value;
    } });
    Object.defineProperty(window, "handleCall", { configurable: true, get() {
      return handleCall;
    }, set(value) {
      handleCall = value;
    } });
    Object.defineProperty(window, "removeRemoteStream", { configurable: true, get() {
      return removeRemoteStream;
    }, set(value) {
      removeRemoteStream = value;
    } });
    Object.defineProperty(window, "syncRoomMembers", { configurable: true, get() {
      return syncRoomMembers;
    }, set(value) {
      syncRoomMembers = value;
    } });
    Object.defineProperty(window, "watchPanelMembers", { configurable: true, get() {
      return watchPanelMembers;
    }, set(value) {
      watchPanelMembers = value;
    } });
    Object.defineProperty(window, "watchPanelChat", { configurable: true, get() {
      return watchPanelChat;
    }, set(value) {
      watchPanelChat = value;
    } });
    Object.defineProperty(window, "compensateStaleJoin", { configurable: true, get() {
      return compensateStaleJoin;
    }, set(value) {
      compensateStaleJoin = value;
    } });
    Object.defineProperty(window, "watchCurrentRoom", { configurable: true, get() {
      return watchCurrentRoom;
    }, set(value) {
      watchCurrentRoom = value;
    } });
    Object.defineProperty(window, "confirmRestoredRoom", { configurable: true, get() {
      return confirmRestoredRoom;
    }, set(value) {
      confirmRestoredRoom = value;
    } });
    Object.defineProperty(window, "suspendP2PForRevalidation", { configurable: true, get() {
      return suspendP2PForRevalidation;
    }, set(value) {
      suspendP2PForRevalidation = value;
    } });
    Object.defineProperty(window, "finishRoomJoin", { configurable: true, get() {
      return finishRoomJoin;
    }, set(value) {
      finishRoomJoin = value;
    } });
    Object.defineProperty(window, "roomAttemptCurrent", { configurable: true, get() {
      return roomAttemptCurrent;
    }, set(value) {
      roomAttemptCurrent = value;
    } });
    Object.defineProperty(window, "connectRoom", { configurable: true, get() {
      return connectRoom;
    }, set(value) {
      connectRoom = value;
    } });
    Object.defineProperty(window, "disconnectRoom", { configurable: true, get() {
      return disconnectRoom;
    }, set(value) {
      disconnectRoom = value;
    } });
    Object.defineProperty(window, "showRoomDialog", { configurable: true, get() {
      return showRoomDialog;
    }, set(value) {
      showRoomDialog = value;
    } });
    Object.defineProperty(window, "roomSubmitting", { configurable: true, get() {
      return roomSubmitting;
    }, set(value) {
      roomSubmitting = value;
    } });
    Object.defineProperty(window, "setRoomFormStatus", { configurable: true, get() {
      return setRoomFormStatus;
    }, set(value) {
      setRoomFormStatus = value;
    } });
    Object.defineProperty(window, "submitRoomForm", { configurable: true, get() {
      return submitRoomForm;
    }, set(value) {
      submitRoomForm = value;
    } });
    Object.defineProperty(window, "sharePicker", { configurable: true, get() {
      return sharePicker;
    } });
    Object.defineProperty(window, "capture", { configurable: true, get() {
      return capture;
    } });
    Object.defineProperty(window, "withShareTimeout", { configurable: true, get() {
      return withShareTimeout;
    }, set(value) {
      withShareTimeout = value;
    } });
    Object.defineProperty(window, "setShareStatus", { configurable: true, get() {
      return setShareStatus;
    }, set(value) {
      setShareStatus = value;
    } });
    Object.defineProperty(window, "shareAudioSources", { configurable: true, get() {
      return shareAudioSources;
    }, set(value) {
      shareAudioSources = value;
    } });
    Object.defineProperty(window, "selectedShareSource", { configurable: true, get() {
      return selectedShareSource;
    }, set(value) {
      selectedShareSource = value;
    } });
    Object.defineProperty(window, "sharePeerReady", { configurable: true, get() {
      return sharePeerReady;
    }, set(value) {
      sharePeerReady = value;
    } });
    Object.defineProperty(window, "updateShareControls", { configurable: true, get() {
      return updateShareControls;
    }, set(value) {
      updateShareControls = value;
    } });
    Object.defineProperty(window, "renderShareSources", { configurable: true, get() {
      return renderShareSources;
    }, set(value) {
      renderShareSources = value;
    } });
    Object.defineProperty(window, "setShareTab", { configurable: true, get() {
      return setShareTab;
    }, set(value) {
      setShareTab = value;
    } });
    Object.defineProperty(window, "populateShareAudio", { configurable: true, get() {
      return populateShareAudio;
    }, set(value) {
      populateShareAudio = value;
    } });
    Object.defineProperty(window, "listSources", { configurable: true, get() {
      return listSources;
    }, set(value) {
      listSources = value;
    } });
    Object.defineProperty(window, "cancelSharePicker", { configurable: true, get() {
      return cancelSharePicker;
    }, set(value) {
      cancelSharePicker = value;
    } });
    Object.defineProperty(window, "openShareDialog", { configurable: true, get() {
      return openShareDialog;
    }, set(value) {
      openShareDialog = value;
    } });
    Object.defineProperty(window, "startSharing", { configurable: true, get() {
      return startSharing;
    }, set(value) {
      startSharing = value;
    } });
    Object.defineProperty(window, "stopSharing", { configurable: true, get() {
      return stopSharing;
    }, set(value) {
      stopSharing = value;
    } });
    Object.defineProperty(window, "kickMember", { configurable: true, get() {
      return kickMember;
    }, set(value) {
      kickMember = value;
    } });
    Object.defineProperty(window, "compressAvatar", { configurable: true, get() {
      return compressAvatar;
    }, set(value) {
      compressAvatar = value;
    } });
    Object.defineProperty(window, "enterCode", { configurable: true, get() {
      return enterCode;
    }, set(value) {
      enterCode = value;
    } });
    Object.defineProperty(window, "authCurrent", { configurable: true, get() {
      return authCurrent;
    }, set(value) {
      authCurrent = value;
    } });
    Object.defineProperty(window, "stopUserRoomsWatch", { configurable: true, get() {
      return stopUserRoomsWatch;
    }, set(value) {
      stopUserRoomsWatch = value;
    } });
    Object.defineProperty(window, "startUserRoomsWatch", { configurable: true, get() {
      return startUserRoomsWatch;
    }, set(value) {
      startUserRoomsWatch = value;
    } });
    Object.defineProperty(window, "clearAccountPresentation", { configurable: true, get() {
      return clearAccountPresentation;
    }, set(value) {
      clearAccountPresentation = value;
    } });
    Object.defineProperty(window, "activateUser", { configurable: true, get() {
      return activateUser;
    }, set(value) {
      activateUser = value;
    } });
    Object.defineProperty(window, "initCloudAuth", { configurable: true, get() {
      return initCloudAuth;
    }, set(value) {
      initCloudAuth = value;
    } });
    Object.defineProperty(window, "authSubmitting", { configurable: true, get() {
      return authSubmitting;
    }, set(value) {
      authSubmitting = value;
    } });
    Object.defineProperty(window, "submitAuth", { configurable: true, get() {
      return submitAuth;
    }, set(value) {
      submitAuth = value;
    } });
    Object.defineProperty(window, "copyText", { configurable: true, get() {
      return copyText;
    }, set(value) {
      copyText = value;
    } });
    Object.defineProperty(window, "profileSubmitting", { configurable: true, get() {
      return profileSubmitting;
    }, set(value) {
      profileSubmitting = value;
    } });
    Object.defineProperty(window, "stageObserver", { configurable: true, get() {
      return stageObserver;
    } });
    Object.defineProperty(window, "shareAttempt", { configurable: true, get() {
      return capture.attempt;
    }, set(value) {
      capture.setFixtureAttempt(value);
    } });
    Object.defineProperty(window, "fullscreenReturnFocus", { configurable: true, get() {
      return stage.fullscreenReturnFocus;
    } });
    Object.defineProperty(window, "WIDE_PANEL_QUERY", { configurable: true, get() {
      return WIDE_PANEL_QUERY;
    } });
  }
})();
