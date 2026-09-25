const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function verify(context) {
  if (context && context.electronPlatformName !== 'win32') return;
  if (context && context.arch !== 1) throw new Error('The bundled Python runtime requires a Windows x64 build.');
  const runtime = path.join(root, 'runtimes/python-win-x64-u2net');
  if (!fs.existsSync(path.join(runtime, 'integrity.json'))) throw new Error('Run npm run runtime:prepare before packaging Forge.');
  const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'runtime.json')));
  if (manifest.requirementsSha256 !== hash(path.join(__dirname, 'rembg-win-x64.lock'))) throw new Error('Python dependency lock changed: rebuild the runtime.');
  if (hash(path.join(runtime, 'remove-background.py')) !== hash(path.join(__dirname, 'remove-background.py'))) throw new Error('Background-removal runner changed: rebuild the runtime.');
  const inventory = JSON.parse(fs.readFileSync(path.join(runtime, 'integrity.json')));
  for (const [file, expected] of Object.entries(inventory)) {
    if (hash(path.join(runtime, file)) !== expected) throw new Error('Incomplete or modified runtime: ' + file);
  }
  const nodeRuntime = path.join(root, 'runtimes/node-win-x64');
  const nodeInventory = JSON.parse(fs.readFileSync(path.join(nodeRuntime, 'integrity.json')));
  for (const [file, expected] of Object.entries(nodeInventory)) {
    if (hash(path.join(nodeRuntime, file)) !== expected) throw new Error('Incomplete Node runtime: ' + file);
  }
  console.log('Private Python and Node runtimes verified (' + Object.keys(inventory).length + ' files).');
}
module.exports = verify;
if (require.main === module) verify();
