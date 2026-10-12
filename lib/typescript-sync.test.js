const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { collectCompiledScripts, changedCompiledScripts } = require('./typescript-sync');

test('inventorie récursivement les sorties Roblox TS et ignore les autres fichiers', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-ts-sync-'));
  try {
    fs.mkdirSync(path.join(project, 'out', 'ServerScriptService'), { recursive: true });
    fs.mkdirSync(path.join(project, 'out', 'ReplicatedStorage'), { recursive: true });
    fs.writeFileSync(path.join(project, 'out', 'ServerScriptService', 'main.server.luau'), 'print("v1")');
    fs.writeFileSync(path.join(project, 'out', 'ReplicatedStorage', 'util.lua'), 'return {}');
    fs.writeFileSync(path.join(project, 'out', 'metadata.json'), '{}');
    const scripts = collectCompiledScripts(project);
    assert.deepEqual([...scripts.keys()].sort(), ['ReplicatedStorage/util.lua', 'ServerScriptService/main.server.luau']);
    assert.equal(scripts.get('ServerScriptService/main.server.luau').source, 'print("v1")');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('ne sélectionne que les sorties ajoutées ou dont le contenu a changé', () => {
  const current = new Map([
    ['same.luau', { source: 'same', hash: 'one' }],
    ['changed.luau', { source: 'new', hash: 'two' }],
    ['added.luau', { source: 'added', hash: 'three' }],
  ]);
  const previous = new Map([['same.luau', 'one'], ['changed.luau', 'old']]);
  assert.deepEqual(changedCompiledScripts(previous, current).map(([name]) => name), ['changed.luau', 'added.luau']);
});
