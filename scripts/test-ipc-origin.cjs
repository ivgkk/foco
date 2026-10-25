const assert = require('node:assert/strict');
const { createRendererMatcher } = require('../electron/trusted-origin.cjs');

// The IPC origin check must accept only Foco's renderer file. Windows rules are exercised with
// path.win32 semantics, so these assertions hold on any host OS.
const cases = [];
const expect = (platform, rendererFile, url, trusted, label) => cases.push({ platform, rendererFile, url, trusted, label });

const winFile = 'C:\\VSCode\\projects\\foco\\renderer\\index.html';
const winLower = 'c:\\VSCode\\projects\\foco\\renderer\\index.html';
expect('win32', winFile, 'file:///C:/VSCode/projects/foco/renderer/index.html', true, 'same path');
expect('win32', winLower, 'file:///C:/VSCode/projects/foco/renderer/index.html', true, 'lowercase drive letter in the app path (the reported bug)');
expect('win32', winFile, 'file:///c:/vscode/PROJECTS/foco/Renderer/INDEX.html', true, 'case differences anywhere in the path');
expect('win32', winFile, 'file:///C:/VSCode/projects/foco/electron/../renderer/index.html', true, 'dot segments resolving to the same file');
expect('win32', winFile, 'file:///C:/VSCode/projects/foco/renderer/index.html?dev=1#top', true, 'query and hash do not change the file');
expect('win32', winFile, 'file:///C:/VSCode/projects/foco%20copy/renderer/index.html', false, 'sibling folder sharing a prefix');
expect('win32', winFile, 'file:///C:/VSCode/projects/foco/renderer/index.html.evil', false, 'longer file name sharing the prefix');
expect('win32', winFile, 'file:///C:/VSCode/projects/foco/renderer/other.html', false, 'other file in the renderer folder');
expect('win32', winFile, 'file:///C:/VSCode/projects/foco/renderer/sub/index.html', false, 'same name in a subfolder');
expect('win32', winFile, 'file:///D:/VSCode/projects/foco/renderer/index.html', false, 'same path on another drive');
expect('win32', winFile, 'file://attacker/share/VSCode/projects/foco/renderer/index.html', false, 'UNC host');
expect('win32', winFile, 'https://example.com/C:/VSCode/projects/foco/renderer/index.html', false, 'https origin');
expect('win32', winFile, 'http://localhost/renderer/index.html', false, 'http origin');
expect('win32', winFile, 'devtools://devtools/bundled/devtools_app.html', false, 'devtools page');
expect('win32', winFile, 'about:blank', false, 'about:blank');
expect('win32', winFile, '', false, 'empty url');
expect('win32', winFile, undefined, false, 'missing url');
// The URL standard treats %2e%2e as "..", so this still names the renderer file itself...
expect('win32', winFile, 'file:///C:/VSCode/projects/foco/renderer/%2e%2e/renderer/index.html', true, 'encoded dot segments that resolve to the renderer file');
// ...and encoded dots that lead anywhere else are rejected.
expect('win32', winFile, 'file:///C:/VSCode/projects/foco/renderer/%2e%2e/other/index.html', false, 'encoded dot segments leading to another file');
expect('win32', winFile, 'file:///C:/VSCode/projects/foco/renderer/index.html%00.evil', false, 'encoded NUL suffix');
const posixFile = '/home/foco/app/renderer/index.html';
expect('linux', posixFile, 'file:///home/foco/app/renderer/index.html', true, 'posix same path');
expect('linux', posixFile, 'file:///home/foco/App/renderer/index.html', false, 'posix paths stay case-sensitive');
expect('linux', posixFile, 'file:///home/foco/app/renderer/index.html.evil', false, 'posix prefix');
expect('darwin', posixFile, 'file:///home/foco/app/renderer/../renderer/index.html', true, 'posix dot segments');

let failures = 0;
for (const { platform, rendererFile, url, trusted, label } of cases) {
  const actual = createRendererMatcher(rendererFile, platform)(url);
  const ok = actual === trusted;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${platform}] ${trusted ? 'aceita' : 'recusa'}: ${label}`);
}
assert.equal(failures, 0, `${failures} IPC origin case(s) failed.`);
console.log(`ipc origin passed: ${cases.length} cases (${cases.filter(c => c.trusted).length} trusted, ${cases.filter(c => !c.trusted).length} rejected).`);
