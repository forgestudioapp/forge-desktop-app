const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildAdminScripts, normalizeUserId, writeAdminScaffold } = require('./admin-scaffold');

test('normalise uniquement les identifiants Roblox valides', () => {
  assert.equal(normalizeUserId('123456'), 123456);
  assert.equal(normalizeUserId(0), 0);
  assert.equal(normalizeUserId('abc'), 0);
});

test('cree un panneau F2 vide et protege par l identifiant Roblox', () => {
  const scripts = buildAdminScripts(987654321);
  assert.match(scripts.server, /ADMIN_USER_ID = 987654321/);
  assert.match(scripts.server, /player\.UserId == ADMIN_USER_ID/);
  assert.match(scripts.client, /Enum\.KeyCode\.F2/);
  assert.match(scripts.commands, /aucune commande n'est imposee par defaut/i);
  assert.doesNotMatch(scripts.commands, /^Commands\.register\s*\(\s*{/m);
});

test('installe les trois scripts dans un nouveau projet Forge', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-admin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const result = writeAdminScaffold(dir, 42);
  assert.deepEqual(result, { adminUserId: 42, files: 3 });
  assert.equal(fs.existsSync(path.join(dir, 'src', 'ReplicatedStorage', 'ForgeAdmin', 'Commands.lua')), true);
  assert.equal(fs.existsSync(path.join(dir, 'src', 'ServerScriptService', 'ForgeAdmin.server.lua')), true);
  assert.equal(fs.existsSync(path.join(dir, 'src', 'StarterPlayer', 'StarterPlayerScripts', 'ForgeAdmin.client.lua')), true);
});

test('utilise le createur utilisateur de la place si Roblox n est pas encore connecte', () => {
  const scripts = buildAdminScripts(undefined);
  assert.match(scripts.server, /ADMIN_USER_ID = 0/);
  assert.match(scripts.server, /game\.CreatorType == Enum\.CreatorType\.User/);
  assert.match(scripts.server, /player\.UserId == game\.CreatorId/);
});
