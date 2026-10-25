const path = require('node:path');
const { fileURLToPath } = require('node:url');

// Decides whether a frame or navigation URL is Foco's own renderer page. Only file: URLs that
// resolve to exactly that file match; there is no prefix or directory matching. Windows paths
// are compared case-insensitively because "c:\app\index.html" and "C:\App\index.html" name the
// same file there (launching from a lowercase "c:" cwd used to reject every IPC call).
function createRendererMatcher(rendererFile, platform = process.platform) {
  const windows = platform === 'win32';
  const paths = windows ? path.win32 : path.posix;
  const key = file => {
    const resolved = paths.resolve(file);
    return windows ? resolved.toLowerCase() : resolved;
  };
  const expected = key(rendererFile);
  return url => {
    if (typeof url !== 'string' || !url.toLowerCase().startsWith('file:')) return false;
    try { return key(fileURLToPath(url, { windows })) === expected; }
    catch { return false; }
  };
}

module.exports = { createRendererMatcher };
