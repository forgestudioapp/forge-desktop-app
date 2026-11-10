const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { selection, writeProjectTemplate, RECOMMENDED_MODULES } = require('./project-template');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ForgeTemplate_'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const exists = (root, relative) => fs.existsSync(path.join(root, relative));

for (const language of ['lua', 'typescript']) {
  test(`${language}: empty, base and complete projects install only selected systems`, t => {
    const empty = fixture(t), base = fixture(t), complete = fixture(t);
    const a = writeProjectTemplate(empty, { language, preset: 'empty' });
    assert.deepEqual(a.modules, []);
    assert.equal(a.files.length, 0);
    assert.equal(exists(empty, 'src/ServerScriptService/ForgeModules/Currency.server.lua'), false);
    assert.equal(exists(empty, 'tests/smoke.cjs'), false);
    const b = writeProjectTemplate(base, { language, preset: 'base' });
    assert.deepEqual(b.modules, ['config', 'network', 'notifications', 'ui', 'tests']);
    assert.equal(exists(base, 'tests/smoke.cjs'), true);
    assert.equal(exists(base, 'src/ServerScriptService/ForgeModules/Purchases.server.lua'), false);
    assert.equal(exists(base, 'src/ServerScriptService/ForgeAdmin.server.lua'), false);
    const c = writeProjectTemplate(complete, { language, preset: 'complete' });
    assert.equal(c.modules.length, 9);
    assert.equal(exists(complete, 'src/ServerScriptService/ForgeModules/Purchases.server.lua'), true);
    assert.equal(exists(complete, 'src/ServerScriptService/ForgeAdmin.server.lua'), true);
    assert.equal(exists(complete, 'src/StarterPlayer/StarterPlayerScripts/ForgeAdmin.client.lua'), false);
    assert.match(fs.readFileSync(path.join(complete, 'src/ReplicatedStorage/ForgeAdmin/Commands.lua'), 'utf8'), /name = "ping"/);
    assert.match(fs.readFileSync(path.join(complete, 'src/ServerScriptService/ForgeModules/Purchases.server.lua'), 'utf8'), /NotProcessedYet/);
    assert.match(fs.readFileSync(path.join(complete, 'src/ServerScriptService/ForgeModules/SecureNetwork.' + (language === 'typescript' ? 'ts' : 'lua')), 'utf8'), /1024/);
    assert.match(fs.readFileSync(path.join(complete, 'src/ServerScriptService/ForgeModules/Currency.' + (language === 'typescript' ? 'ts' : 'lua')), 'utf8'), /100000/);
    require('node:child_process').execFileSync(process.execPath, ['tests/smoke.cjs'], { cwd: complete });
  });
}

test('custom selection stays independent and invalid modules are rejected before writing', t => {
  const root = fixture(t);
  assert.deepEqual(selection('complete', ['currency', 'currency']), ['currency']);
  const manifest = writeProjectTemplate(root, { language: 'lua', preset: 'empty', modules: ['currency'] });
  assert.deepEqual(manifest.modules, ['currency']);
  assert.equal(exists(root, 'src/ServerScriptService/ForgeModules/Currency.lua'), true);
  assert.equal(exists(root, 'src/ServerScriptService/ForgeModules/PlayerData.server.lua'), false);
  const other = fixture(t);
  assert.throws(() => writeProjectTemplate(other, { modules: ['unknown'] }), /inconnu/);
  assert.equal(exists(other, '.forge/template.json'), false);
});

test('TypeScript template declares only compiler dependencies', () => {
  const pkg = require('../templates/typescript/package.json');
  assert.deepEqual(pkg.dependencies, {});
  assert.equal(pkg.devDependencies['roblox-ts'], '3.0.0');
});
test('recommended TypeScript project has generic core systems without currency or purchases', t => {
  const root = fixture(t);
  const manifest = writeProjectTemplate(root, { language: 'typescript', preset: 'recommended' });
  assert.deepEqual(manifest.modules, [...RECOMMENDED_MODULES]);
  for (const name of ['Config.ts','PlayerData.server.ts','SecureNetwork.ts','Notifications.ts']) {
    assert.ok(manifest.files.some(file => file.endsWith('/'+name)), name);
  }
  assert.equal(exists(root, 'src/ServerScriptService/ForgeModules/Currency.ts'), false);
  assert.equal(exists(root, 'src/ServerScriptService/ForgeModules/Purchases.server.lua'), false);
  assert.equal(exists(root, 'src/ServerScriptService/ForgeAdmin.server.lua'), true);
  const data = fs.readFileSync(path.join(root, 'src/ServerScriptService/ForgeModules/PlayerData.server.ts'), 'utf8');
  assert.doesNotMatch(data, /ForgeCoins|ProductId/);
});
