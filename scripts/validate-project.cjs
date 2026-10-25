const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('renderer/index.html');
const app = read('renderer/app.js');
const styles = read('renderer/styles.css') + read('renderer/updates.css');
const main = read('electron/main.cjs');
const preload = read('electron/preload.cjs');
const cloud = read('renderer/firebase-client.js');
const i18n = read('renderer/i18n.js');
const packageJson = JSON.parse(read('package.json'));
const rules = JSON.parse(read('firebase/database.rules.json'));
const bundle = path.join(root, 'renderer/firebase-client.bundle.js');

if (!fs.existsSync(bundle)) throw new Error('Firebase renderer bundle is missing; run pnpm run bundle:firebase.');
if (!packageJson.build.protocols?.some(protocol => protocol.schemes?.includes('foco'))) throw new Error('The Windows build does not register foco:// invitations.');
if (!html.includes('https://*.googleapis.com') || !html.includes('https://*.firebasedatabase.app')) throw new Error('Content Security Policy blocks Firebase requests.');
if (html.includes('id="activityButton"') || html.includes('id="activityDialog"')) throw new Error('The removed activity navigation is still present.');
if (!html.includes('id="profilePalette"') || !html.includes('id="profilePreviewAvatar"') || !app.includes('function updateProfilePreview')) throw new Error('The live profile color preview is incomplete.');
if (!app.includes('data-profile-color') || !app.includes('function setProfileColor')) throw new Error('Profile color choices are not wired to the live preview.');
if (!app.includes("class=\"owner-crown\"") || !styles.includes('.owner-crown')) throw new Error('Room owner crown marker is missing.');
if (html.includes('id="uiSoundsEnabled"') || app.includes('playUiSound')) throw new Error('The removed UI sound preference is still present.');
if (!html.includes('id="reduceMotionEnabled"')) throw new Error('Reduced-motion preference is missing.');
if (!preload.includes('writeClipboard') || !main.includes("foco:clipboard-write")) throw new Error('The native clipboard bridge is missing.');
if (html.includes('id="copyDiagnosticsButton"') || app.includes('function buildDiagnostics')) throw new Error('The removed diagnostics panel is still present.');
if (!html.includes('id="rotateRoomCodeButton"') || !app.includes('function rotateRoomCode') || !app.includes('state.rotatingRoom')) throw new Error('Owner-only room code rotation is incomplete.');
if (!app.includes('foco://join/${room.code}') || !app.includes('copyRoomCode')) throw new Error('The room code/link copy actions are incomplete.');
if (!packageJson.devDependencies?.firebase || packageJson.dependencies?.firebase) throw new Error('Firebase is bundled at build time and should not ship as a runtime dependency.');
if (!packageJson.build.electronLanguages?.includes('pt-BR') || !packageJson.build.electronLanguages?.includes('en-US')) throw new Error('Windows package locale filtering is not configured.');
if (!main.includes("app.isPackaged ? null : require('./dev-tools.cjs')") || !packageJson.build.files?.includes('!electron/dev-tools.cjs')) throw new Error('Development tooling must load only in unpackaged runs and stay out of distributed builds.');
if (!preload.includes("process.argv.includes('--foco-dev-tools')")) throw new Error('Preload development live reload must stay behind the unpackaged-only argument.');
const tokens = read('renderer/tokens.css');
const overlayHeight = Number(/titleBarOverlay:\s*\{[^}]*height:\s*(\d+)/.exec(main)?.[1]), cssTitlebar = Number(/--titlebar-height:\s*(\d+)px/.exec(tokens)?.[1]);
if (!overlayHeight || overlayHeight !== cssTitlebar) throw new Error(`titleBarOverlay height (${overlayHeight}) and --titlebar-height (${cssTitlebar}) must match.`);
if (!main.includes('createRendererMatcher(rendererFile)') || !main.includes('isRendererUrl(event.senderFrame.url)') || !main.includes('if (!isRendererUrl(url)) event.preventDefault()')) throw new Error('IPC calls and navigation must both be checked against the renderer file.');
if (!html.includes('id="confirmDialog"') || !app.includes('function confirmRoomSwitch')) throw new Error('Switching rooms while sharing must ask for confirmation.');
if (!app.includes('peer.reconnect()') || !app.includes('function watchMediaConnection')) throw new Error('Automatic signaling/media recovery is incomplete.');
if (!html.includes('id="appLanguage"') || !i18n.includes("'fr-FR'") || !i18n.includes("'es-ES'") || !i18n.includes("'en-US'")) throw new Error('App language selector or translations are missing.');
if (!html.includes('id="chatMessages"') || !html.includes('id="chatInput"') || !app.includes('function sendChatMessage')) throw new Error('The room chat UI is incomplete.');
if (!cloud.includes('function watchRoomChat') || !cloud.includes('function sendRoomChat') || !rules.rules.roomChats) throw new Error('Room chat realtime API or Firebase security rules are missing.');
const chatRules = rules.rules.roomChats;
const chatRoomRules = chatRules['$code'];
if (!chatRoomRules?.['.read']?.includes("roomMembers") || chatRoomRules['.indexOn']?.[0] !== 'createdAt' || !chatRoomRules['$messageId']?.['.write']?.includes('auth.uid') || !chatRoomRules['$messageId']?.['.validate']?.includes('220000')) throw new Error('Room chat Firebase membership, ownership, indexing, or media-size restrictions are incomplete.');
if (!app.includes('function makeChatAvatar') || !cloud.includes('photo:/^data:image\\/jpeg;base64') || !chatRoomRules['$messageId']['.validate'].includes("child('photo')")) throw new Error('Chat message profile avatars or their Firebase validation are incomplete.');
if (!cloud.includes('maxMembers:50') || !cloud.includes('slot<=50') || !chatRoomRules['$messageId']['.validate'].includes("child('photo').val().length <= 16000")) throw new Error('The fixed 50-person room capacity or compact chat avatars are incomplete.');
if (html.includes('id="roomLimitSelect"') || app.includes('setRoomLimit')) throw new Error('The adjustable room capacity control must remain removed.');
const seatWrite = rules.rules.roomSeats?.['$code']?.['$slot']?.['.write'] || '';
if (!seatWrite.includes("$slot === '50'") || seatWrite.includes("$slot === '51'")) throw new Error('Firebase room seat rules do not enforce the fixed 50-person capacity.');
if (!seatWrite.includes('roomBans') || !rules.rules.roomMembers?.['$code']?.['$uid']?.['.write']?.includes('roomBans')) throw new Error('Firebase room rules do not enforce room bans for seat and membership writes.');

const ids = [...app.matchAll(/\$\('#([^']+)'\)/g)].map(match => match[1]);
const missingIds = [...new Set(ids)].filter(id => !html.includes(`id="${id}"`));
if (missingIds.length) throw new Error(`Missing renderer element IDs: ${missingIds.join(', ')}`);

function checkRuleExpressions(value, location = 'rules') {
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if (key.startsWith('.') && typeof child === 'string') {
      let depth = 0;
      let quote = '';
      for (let i = 0; i < child.length; i++) {
        const char = child[i];
        if (quote) {
          if (char === quote && child[i - 1] !== '\\') quote = '';
          continue;
        }
        if (char === "'" || char === '"') quote = char;
        else if (char === '(') depth++;
        else if (char === ')' && --depth < 0) throw new Error(`Unbalanced parentheses in ${childLocation}`);
      }
      if (quote || depth !== 0) throw new Error(`Malformed expression in ${childLocation}`);
    } else if (child && typeof child === 'object') checkRuleExpressions(child, childLocation);
  }
}

checkRuleExpressions(rules);
console.log(`Project checks passed: ${new Set(ids).size} renderer selectors, Firebase CSP, invitation protocol, bundle and RTDB rules JSON.`);
