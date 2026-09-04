const fs = require('fs');
const path = require('path');

function canonicalExistingPath(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;

  try {
    const resolved = path.resolve(candidate);
    return fs.realpathSync.native
      ? fs.realpathSync.native(resolved)
      : fs.realpathSync(resolved);
  } catch (e) {
    return null;
  }
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isExistingDirectoryWithinRoots(targetPath, allowedRoots) {
  const target = canonicalExistingPath(targetPath);
  if (!target) return false;

  try {
    if (!fs.statSync(target).isDirectory()) return false;
  } catch (e) {
    return false;
  }

  return (allowedRoots || []).some(rootPath => {
    const root = canonicalExistingPath(rootPath);
    return root ? isPathInside(root, target) : false;
  });
}

module.exports = {
  canonicalExistingPath,
  isPathInside,
  isExistingDirectoryWithinRoots,
};
