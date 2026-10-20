const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeStarterExample } = require('./project-examples');

test('starter examples are isolated, explicit and verifiable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-example-'));
  try {
    const result = writeStarterExample(root, 'script');
    assert.equal(result.created, true);
    assert.deepEqual(result.files.sort(), [
      '.forge-examples/script/README.md', '.forge-examples/script/after.lua',
      '.forge-examples/script/before.lua', '.forge-examples/script/verify.lua',
    ]);
    assert.match(fs.readFileSync(path.join(root, '.forge-examples/script/README.md'), 'utf8'), /Premier résultat/);
    assert.equal(fs.existsSync(path.join(root, 'src')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('unknown examples are rejected and an empty choice writes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-example-'));
  try {
    assert.equal(writeStarterExample(root, '').created, false);
    assert.throws(() => writeStarterExample(root, '../escape'), /inconnu/);
    assert.equal(fs.existsSync(path.join(root, '.forge-examples')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
