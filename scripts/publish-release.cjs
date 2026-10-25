const { spawnSync } = require('node:child_process');
const { version } = require('../package.json');

const owner = process.env.FOCO_UPDATE_OWNER?.trim() || 'ivgkk';
const repo = process.env.FOCO_UPDATE_REPO?.trim() || 'foco-updates';
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('Configure GH_TOKEN ou GITHUB_TOKEN no ambiente local de publicação. Não coloque tokens no projeto.');
  process.exit(2);
}

async function githubRequest(endpoint, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'Foco-release-publisher',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${data.message || 'falha sem detalhes'}`);
  return data;
}

async function ensureDraftRelease() {
  // The one-off release override is only for completing a recently published release.
  if (process.env.FOCO_RELEASE_TYPE?.trim() === 'release') return;

  const tag = `v${version}`;
  const matches = [];
  for (let page = 1; page <= 10; page++) {
    const releases = await githubRequest(`/repos/${owner}/${repo}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases)) throw new Error('A resposta do GitHub para releases era inválida.');
    matches.push(...releases.filter(release => release.tag_name === tag || release.tag_name === version));
    if (releases.length < 100) break;
  }
  const draft = matches.find(release => release.draft);
  if (draft) {
    console.log(`Reutilizando o rascunho ${draft.tag_name} para evitar releases duplicados.`);
    return;
  }
  if (matches.some(release => !release.draft)) {
    throw new Error(`A versão ${version} já foi publicada. Incremente package.json antes de criar outro release.`);
  }

  const repository = await githubRequest(`/repos/${owner}/${repo}`);
  const created = await githubRequest(`/repos/${owner}/${repo}/releases`, 'POST', {
    tag_name: tag,
    target_commitish: repository.default_branch,
    name: version,
    draft: true,
    prerelease: false
  });
  console.log(`Rascunho ${created.tag_name} criado antes do build para concentrar todos os arquivos no mesmo release.`);
}

async function publish() {
  try {
    await ensureDraftRelease();
  } catch (error) {
    console.error(`Não foi possível preparar o rascunho: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const builder = require.resolve('electron-builder/out/cli/cli.js');
  const result = spawnSync(process.execPath, [builder, '--config', 'electron-builder.config.cjs', '--win', 'nsis', '--publish', 'always'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

publish().catch(error => {
  console.error(`A publicação falhou: ${error.message}`);
  process.exitCode = 1;
});
