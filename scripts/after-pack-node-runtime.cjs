'use strict';
const fs = require('node:fs');
const path = require('node:path');

// electron-builder filters nested node_modules from extraResources. Restore npm
// before signing so the portable Node runtime can install TypeScript packages.
module.exports = async function afterPackNodeRuntime(context) {
  if (context.electronPlatformName !== 'win32') return;
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'runtimes', 'node-win-x64', 'node_modules', 'npm');
  const destination = path.join(context.appOutDir, 'resources', 'runtimes', 'node-win-x64', 'node_modules', 'npm');
  for (const file of ['bin/npm-cli.js', 'bin/npm-prefix.js', 'package.json']) {
    if (!fs.statSync(path.join(source, file)).isFile()) throw new Error(`npm portable incomplet : ${file}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
  if (!fs.existsSync(path.join(destination, 'bin', 'npm-cli.js'))) throw new Error('npm absent du paquet Windows.');
};
