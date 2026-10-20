'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function archName(value) {
  if (value === 1 || value === 'x64') return 'x64';
  if (value === 3 || value === 'arm64') return 'arm64';
  return process.arch;
}
function verifyNodeRuntime(platform = process.platform, arch = process.arch) {
  const suffix = platform === 'win32' ? 'win-x64' : platform === 'darwin' ? `darwin-${archName(arch)}` : null;
  if (!suffix) return;
  const runtime = path.join(root, 'runtimes', 'node-' + suffix);
  const manifestPath = path.join(runtime, 'integrity.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Runtime Node ${suffix} absent. Lance la préparation des runtimes.`);
  const inventory = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const [file, expected] of Object.entries(inventory)) {
    if (hash(path.join(runtime, file)) !== expected) throw new Error('Runtime Node incomplet ou modifié : ' + file);
  }
  console.log(`Runtime Node ${suffix} vérifié (${Object.keys(inventory).length} fichiers).`);
}
module.exports = verifyNodeRuntime;
if (require.main === module) {
  const platformArg = process.argv.find(value => value.startsWith('--platform='))?.split('=')[1] || process.platform;
  const archArg = process.argv.find(value => value.startsWith('--arch='))?.split('=')[1] || process.arch;
  verifyNodeRuntime(platformArg, archArg);
}
