const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'renderer', 'firebase-client.bundle.js');

async function buildFirebase(checkOnly = false) {
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['renderer/firebase-client.js'],
    bundle: true,
    format: 'iife',
    globalName: 'FocoCloudSDK',
    target: 'chrome134',
    outfile: 'renderer/firebase-client.bundle.js',
    write: false,
    logLevel: 'silent'
  });
  const contents = result.outputFiles.find(file => path.resolve(file.path) === output)?.contents;
  if (!contents) throw new Error('Firebase bundle was not produced.');
  if (checkOnly) {
    if (!fs.existsSync(output) || !fs.readFileSync(output).equals(contents)) {
      throw new Error('Firebase bundle differs from source. Run npm run bundle:firebase.');
    }
    console.log('Firebase bundle matches source and build settings.');
  } else {
    fs.writeFileSync(output, contents);
    console.log(`Firebase bundle written: ${path.relative(root, output)} (${contents.length} bytes).`);
  }
}

if (require.main === module) buildFirebase(process.argv.includes('--check')).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildFirebase };
