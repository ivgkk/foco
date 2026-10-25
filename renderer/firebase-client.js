import { createCloudContext } from './cloud/context.js';
import { createAuthClient } from './cloud/auth.js';
import { createRoomsClient } from './cloud/rooms.js';
import { createChatClient } from './cloud/chat.js';

const context = createCloudContext();
const account = createAuthClient(context);
const rooms = createRoomsClient(context);
const chat = createChatClient(context);

window.focoCloud = {
  configure: context.configure, resetConfig: context.resetConfig,
  isConfigured: () => context.configured, auth: context.auth,
  onAuthChanged: account.observeAuth, register: account.register, login: account.login,
  logout: account.logout, getProfile: account.getProfile, saveProfile: account.saveProfile,
  makeRoom: rooms.makeRoom, findRoom: rooms.findRoom, joinRoom: rooms.joinRoom,
  watchMemberList: rooms.watchMemberList, verifyRoomPeer: rooms.verifyRoomPeer,
  watchRoom: rooms.watchRoom, watchRoomChat: chat.watchRoomChat,
  sendRoomChat: chat.sendRoomChat, deleteRoomChatMessage: chat.deleteRoomChatMessage,
  watchUserRooms: rooms.watchUserRooms, updateRoomMember: rooms.updateRoomMember,
  exitRoom: rooms.exitRoom, markRoomDeleted: rooms.markRoomDeleted,
  setMemberRole: rooms.setMemberRole, removeMember: rooms.removeMember,
  transferRoom: rooms.transferRoom, setStreamPermission: rooms.setStreamPermission,
  syncProfileToRooms: rooms.syncProfileToRooms, getCurrentUser: account.getCurrentUser,
  cleanCode: context.cleanCode
};
