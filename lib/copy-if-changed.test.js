const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { copyFileIfChanged } = require('./copy-if-changed');

test('does not touch an identical installed plugin and replaces a changed one', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-plugin-copy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source.rbxmx');
  const destination = path.join(root, 'plugins', 'ForgePlugin.rbxmx');
  fs.writeFileSync(source, 'version-one');
  assert.equal(copyFileIfChanged(source, destination).changed, true);
  const firstTime = fs.statSync(destination).mtimeMs;
  assert.equal(copyFileIfChanged(source, destination).changed, false);
  assert.equal(fs.statSync(destination).mtimeMs, firstTime);
  fs.writeFileSync(source, 'version-two');
  assert.equal(copyFileIfChanged(source, destination).changed, true);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'version-two');
});
