const packageConfig = require('./package.json').build;
if (process.env.FOCO_OUTPUT_DIR?.trim()) packageConfig.directories.output = process.env.FOCO_OUTPUT_DIR.trim();
if (process.env.FOCO_PORTABLE_BUILD === 'true') packageConfig.win.artifactName = 'Foco-Portable-${version}.${ext}';

const owner = process.env.FOCO_UPDATE_OWNER?.trim() || 'ivgkk';
const repo = process.env.FOCO_UPDATE_REPO?.trim() || 'foco-updates';
if (owner && repo) {
  // New versions use drafts so assets upload before publication. A recent published
  // release can be completed explicitly with FOCO_RELEASE_TYPE=release.
  const releaseType = process.env.FOCO_RELEASE_TYPE?.trim() === 'release' ? 'release' : 'draft';
  packageConfig.publish = [{ provider: 'github', owner, repo, releaseType }];
} else {
  delete packageConfig.publish;
}

module.exports = packageConfig;
