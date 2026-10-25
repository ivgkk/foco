const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const sdkExports = {
  'firebase/app': ['initializeApp', 'getApps', 'deleteApp'],
  'firebase/auth': ['getAuth', 'setPersistence', 'indexedDBLocalPersistence', 'browserLocalPersistence', 'createUserWithEmailAndPassword', 'signInWithEmailAndPassword', 'signOut', 'deleteUser', 'onAuthStateChanged'],
  'firebase/database': ['getDatabase', 'ref', 'get', 'set', 'update', 'remove', 'push', 'query', 'orderByChild', 'endAt', 'limitToFirst', 'limitToLast', 'runTransaction', 'onValue', 'onDisconnect']
};

const records = new Map();
const writes = [];
const auth = { currentUser: { uid: 'u1', email: 'u1@example.test' } };
const snapshot = value => ({ exists: () => value !== undefined && value !== null, val: () => value });
const read = key => {
  if (records.has(key)) return records.get(key);
  const children = [...records].filter(([name]) => name.startsWith(key + '/'));
  return children.length ? Object.fromEntries(children.map(([name, value]) => [name.slice(key.length + 1), value])) : undefined;
};
const sdk = {
  initializeApp: config => ({ name: 'foco', options: config }), getApps: () => [], deleteApp: async () => {},
  getAuth: () => auth, setPersistence: async () => {}, indexedDBLocalPersistence: {}, browserLocalPersistence: {},
  createUserWithEmailAndPassword: async () => ({ user: auth.currentUser }), signInWithEmailAndPassword: async () => ({ user: auth.currentUser }),
  signOut: async () => {}, deleteUser: async () => {}, onAuthStateChanged: () => () => {},
  getDatabase: () => ({}), ref: (_db, key = '') => ({ key }), get: async target => snapshot(read(target.key)),
  set: async (target, value) => { records.set(target.key, value); writes.push(['set', target.key]); },
  update: async (target, value) => { for (const [key, item] of Object.entries(value)) records.set(target.key ? `${target.key}/${key}` : key, item); writes.push(['update', target.key]); },
  remove: async target => { records.delete(target.key); writes.push(['remove', target.key]); },
  push: target => ({ key: `${target.key}/message-1` }),
  query: target => target, orderByChild: () => ({}), endAt: () => ({}), limitToFirst: () => ({}), limitToLast: () => ({}),
  runTransaction: async (target, change) => {
    const next = change(read(target.key) ?? null);
    if (next === undefined) return { committed: false, snapshot: snapshot(read(target.key)) };
    if (next === null) records.delete(target.key); else records.set(target.key, next);
    writes.push(['transaction', target.key]);
    return { committed: true, snapshot: snapshot(next) };
  },
  onValue: (_target, _callback) => () => {},
  onDisconnect: target => ({ remove: async () => { writes.push(['onDisconnect.remove', target.key]); }, cancel: async () => { writes.push(['onDisconnect.cancel', target.key]); } })
};

async function run() {
  const result = await esbuild.build({
    absWorkingDir: root, entryPoints: ['renderer/firebase-client.js'], bundle: true,
    format: 'iife', write: false, logLevel: 'silent',
    plugins: [{ name: 'offline-firebase', setup(build) {
      build.onResolve({ filter: /^firebase\// }, args => ({ path: args.path, namespace: 'offline-firebase' }));
      build.onLoad({ filter: /.*/, namespace: 'offline-firebase' }, args => ({
        contents: sdkExports[args.path].map(name => `export const ${name} = globalThis.__sdk.${name};`).join('\n'),
        loader: 'js'
      }));
    } }]
  });
  const page = { focoCloud: null };
  const context = { window: page, __sdk: sdk, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    crypto: require('node:crypto').webcrypto, console, Date, Promise, setTimeout, clearTimeout };
  vm.runInNewContext(result.outputFiles[0].text, context, { filename: 'offline-firebase.bundle.js' });
  const cloud = page.focoCloud;
  assert(cloud?.isConfigured());
  assert.deepEqual(Object.keys(cloud), [
    'configure','resetConfig','isConfigured','auth','onAuthChanged','register','login','logout','getProfile','saveProfile',
    'makeRoom','findRoom','joinRoom','watchMemberList','verifyRoomPeer','watchRoom','watchRoomChat','sendRoomChat',
    'deleteRoomChatMessage','watchUserRooms','updateRoomMember','exitRoom','markRoomDeleted','setMemberRole',
    'removeMember','transferRoom','setStreamPermission','syncProfileToRooms','getCurrentUser','cleanCode'
  ]);
  records.set('rooms/ROOM01', { code: 'ROOM01', name: 'Fixture', ownerUid: 'u1', deleted: false });
  assert.equal((await cloud.findRoom('room01')).code, 'ROOM01');
  const joined = await cloud.joinRoom('ROOM01', { username: 'u1', nickname: 'Fixture', status: '', color: '#9b83ff', photo: '', showActivity: true, activity: '' }, 'peer-1');
  assert.equal(joined.role, 'owner');
  assert.equal(records.get('roomMembers/ROOM01/u1').peerId, 'peer-1');
  assert.equal(read('roomSeats/ROOM01')['1'], 'u1');
  assert.equal((await cloud.verifyRoomPeer('ROOM01', 'u1', 'peer-1')).peerId, 'peer-1');
  assert.equal(await cloud.exitRoom('ROOM01', 'old-peer'), false);
  assert.equal(records.get('roomMembers/ROOM01/u1').peerId, 'peer-1');
  assert.equal(await cloud.exitRoom('ROOM01', 'peer-1'), true);
  assert.equal(records.has('roomMembers/ROOM01/u1'), false);
  assert.equal(records.has('roomSeats/ROOM01/1'), false);
  assert(writes.some(([kind, key]) => kind === 'onDisconnect.remove' && key === 'roomMembers/ROOM01/u1'));
  console.log('Cloud facade, join, peer authorization and conditional exit passed with offline Firebase SDK mocks.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
