const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configureBundledNode } = require('./bundled-node');

test('bundled Node takes precedence and keeps global agent installs inside Forge data', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-node-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nodeDir = path.join(root, 'runtimes', 'node-win-x64');
  fs.mkdirSync(nodeDir, { recursive: true });
  fs.writeFileSync(path.join(nodeDir, 'node.exe'), 'fixture');
  const env = { Path: 'C:\\Windows;C:\\Node', PYTHONPATH: 'unchanged', npm_config_prefix: 'outside' };
  const command = configureBundledNode({ resourcesDir: root, userDataDir: path.join(root, 'data'), env, platform: 'win32' });
  assert.equal(command, path.join(nodeDir, 'node.exe'));
  assert.equal(env.Path, undefined);
  assert.ok(env.PATH.startsWith(nodeDir + ';' + path.join(root, 'data', 'agent-tools')));
  assert.equal(env.NPM_CONFIG_PREFIX, path.join(root, 'data', 'agent-tools'));
  assert.equal(env.PYTHONPATH, 'unchanged');
});

test('without a verified local runtime the process uses the normal Node command', () => {
  assert.equal(configureBundledNode({ resourcesDir: 'missing', userDataDir: 'unused', env: {}, platform: 'win32' }), 'node');
  assert.equal(configureBundledNode({ resourcesDir: 'missing', userDataDir: 'unused', env: {}, platform: 'darwin' }), 'node');
});
