const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function sources(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return sources(relative);
    return entry.isFile() && /\.(?:js|cjs)$/.test(entry.name) && !entry.name.endsWith('.bundle.js') ? [relative] : [];
  });
}

function run(file, args = []) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} failed with exit code ${result.status}.`);
}

for (const file of ['electron-builder.config.cjs', ...sources('electron'), ...sources('renderer'), ...sources('scripts')]) {
  run('--check', [file]);
}
for (const file of ['scripts/test-ipc-origin.cjs', 'scripts/validate-project.cjs', 'scripts/check-firebase-bundle.cjs']) {
  run(file);
}
run('scripts/build-app.cjs', ['--check']);
run('scripts/test-cloud-contract.cjs');
console.log('Project syntax, contracts and bundles passed.');
