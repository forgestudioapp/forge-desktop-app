'use strict';
const verifyPython = require('./verify-python-runtime.cjs');
const verifyNode = require('./verify-node-runtime.cjs');
module.exports = function verifyPackagedRuntimes(context) {
  const platform = context?.electronPlatformName || process.platform;
  const arch = context?.arch ?? process.arch;
  verifyNode(platform, arch);
  if (platform === 'win32') verifyPython(context);
};
