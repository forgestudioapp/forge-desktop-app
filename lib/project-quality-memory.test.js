const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MAX_CONTENT, readProjectQualityMemory, writeProjectQualityMemory } = require('./project-quality-memory');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-quality-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('stores one free project-specific brief and reads it without the generated heading', t => {
  const root = fixture(t);
  const saved = writeProjectQualityMemory(root, 'Palette sombre\r\nPas de templates GUI.');
  assert.equal(saved.content, 'Palette sombre\nPas de templates GUI.');
  assert.match(fs.readFileSync(path.join(root, '.forge-context', 'project-quality.md'), 'utf8'), /^# Mémoire de qualité du projet/);
  assert.equal(readProjectQualityMemory(root).content, saved.content);
});

test('empty content removes the memory and oversized content is rejected', t => {
  const root = fixture(t);
  writeProjectQualityMemory(root, 'À conserver');
  assert.equal(writeProjectQualityMemory(root, '  ').deleted, true);
  assert.equal(readProjectQualityMemory(root).content, '');
  assert.throws(() => writeProjectQualityMemory(root, 'x'.repeat(MAX_CONTENT + 1)), /limitée/);
});

test('never writes through a linked context directory', t => {
  const root = fixture(t);
  const project = path.join(root, 'project');
  const external = path.join(root, 'external');
  fs.mkdirSync(project);fs.mkdirSync(external);
  fs.symlinkSync(external, path.join(project, '.forge-context'), 'junction');
  assert.throws(() => writeProjectQualityMemory(project, 'Secret'), /non sûr/);
  assert.deepEqual(fs.readdirSync(external), []);
});
