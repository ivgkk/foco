const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const source = path.resolve(__dirname, '..', 'renderer');
const assetSource = path.resolve(__dirname, '..', 'assets');
const tempRoot = path.resolve(os.tmpdir());

function removeFixture(workspace) {
  const resolved = path.resolve(workspace);
  if (!resolved.startsWith(tempRoot + path.sep) || !path.basename(resolved).startsWith('foco-fixture-')) {
    throw new Error('Refusing to remove a fixture outside the temporary directory.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function createFixtureRenderer() {
  const workspace = fs.mkdtempSync(path.join(tempRoot, 'foco-fixture-'));
  const renderer = path.join(workspace, 'renderer');
  try {
    fs.cpSync(source, renderer, {
      recursive: true,
      filter: file => file === source || !path.relative(source, file).split(path.sep).some(part => part.startsWith('.'))
    });
    fs.cpSync(assetSource, path.join(workspace, 'assets'), { recursive: true });
  } catch (error) {
    removeFixture(workspace);
    throw error;
  }
  process.once('exit', () => removeFixture(workspace));
  return renderer;
}

module.exports = { createFixtureRenderer };
