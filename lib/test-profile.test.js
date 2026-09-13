const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

test('le démarrage configure le stockage et les projets de test avant les autres modules', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ForgeValidation_Startup_'));
  try {
    const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    const prefix = main.slice(0, main.indexOf("const { spawn, execFile }"));
    const paths = {};
    vm.runInNewContext(prefix, {
      require: name => name === 'electron' ? { app: { setPath: (key, value) => { paths[key] = value; } } } : require(name),
      process: { env: { FORGE_TEST_PROFILE: dir } }
    });
    assert.equal(paths.userData, path.join(dir, 'AppData', 'Roaming', 'Forge'));
    assert.equal(paths.documents, path.join(dir, 'Documents'));
    assert.equal(fs.existsSync(paths.userData), true);
    assert.equal(fs.existsSync(paths.documents), true);
    const normalCalls = [];
    vm.runInNewContext(prefix, {
      require: name => name === 'electron' ? { app: { setPath: (...args) => normalCalls.push(args) } } : require(name),
      process: { env: {} }
    });
    assert.deepEqual(normalCalls, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
