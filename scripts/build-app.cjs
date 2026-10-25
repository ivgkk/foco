const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'renderer', 'app.js');
const outputPath = path.join(root, 'renderer', 'app.bundle.js');

function fixtureBindings(source) {
  const declarations = [...source.matchAll(/^(async function|function|const|let)\s+([A-Za-z_$][\w$]*)/gm)];
  const seen = new Set();
  const properties = declarations.filter(([, , name]) => !seen.has(name) && seen.add(name)).map(([, kind, name]) => {
    const setter = kind === 'const' ? '' : `,set(value){${name}=value;}`;
    return `Object.defineProperty(window,${JSON.stringify(name)},{configurable:true,get(){return ${name};}${setter}});`;
  });
  if (source.includes('const capture = createCapture(')) {
    properties.push("Object.defineProperty(window,'shareAttempt',{configurable:true,get(){return capture.attempt;},set(value){capture.setFixtureAttempt(value);}});");
  }
  if (source.includes('const stage = createStage(')) {
    properties.push("Object.defineProperty(window,'fullscreenReturnFocus',{configurable:true,get(){return stage.fullscreenReturnFocus;}});");
  }
  if (source.includes('WIDE_PANEL_QUERY=matchMedia(')) {
    properties.push("Object.defineProperty(window,'WIDE_PANEL_QUERY',{configurable:true,get(){return WIDE_PANEL_QUERY;}});");
  }
  return `\nif (/-(?:smoke|fixture)\\.html$/.test(location.pathname)) {\n${properties.join('\n')}\n}\n`;
}

async function buildApp(checkOnly = false) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const result = await esbuild.build({
    stdin: { contents: source + fixtureBindings(source), resolveDir: path.dirname(sourcePath), sourcefile: 'app.js', loader: 'js' },
    bundle: true, format: 'iife', target: 'chrome134', outfile: outputPath, write: false, logLevel: 'silent'
  });
  const contents = result.outputFiles.find(file => path.resolve(file.path) === outputPath)?.contents;
  if (!contents) throw new Error('App bundle was not produced.');
  if (checkOnly) {
    if (!fs.existsSync(outputPath) || !fs.readFileSync(outputPath).equals(contents)) {
      throw new Error('App bundle differs from source. Run npm run bundle:app.');
    }
    console.log('App bundle matches source and build settings.');
  } else {
    fs.writeFileSync(outputPath, contents);
    console.log(`App bundle written: ${path.relative(root, outputPath)} (${contents.length} bytes).`);
  }
}

if (require.main === module) buildApp(process.argv.includes('--check')).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildApp };
