const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isSyncableScript,
  scriptClassForPath,
  buildStudioSyncCode,
  buildStudioDeleteCode,
  mcpToolResultError,
} = require('./file-sync');

test('reconnaît Lua, Luau et les sources TypeScript', () => {
  assert.equal(isSyncableScript('ServerScriptService/main.lua'), true);
  assert.equal(isSyncableScript('StarterGui/menu.client.luau'), true);
  assert.equal(isSyncableScript('shared.ts'), true);
  assert.equal(isSyncableScript('readme.md'), false);
});

test('déduit le bon type Roblox depuis le service ou le suffixe', () => {
  assert.equal(scriptClassForPath('StarterGui/Menu.lua'), 'LocalScript');
  assert.equal(scriptClassForPath('ReplicatedStorage/Combat.server.lua'), 'Script');
  assert.equal(scriptClassForPath('ReplicatedStorage/Util.lua'), 'ModuleScript');
});

test('génère une mise à jour editor-safe sans exécuter le script utilisateur', () => {
  const source = 'local value = "\\n"\nreturn value';
  const plan = buildStudioSyncCode('src/StarterGui/NightfallController.client.lua', source);
  assert.equal(plan.scriptName, 'NightfallController.client');
  assert.equal(plan.scriptClass, 'LocalScript');
  assert.match(plan.code, /ScriptEditorService/);
  assert.match(plan.code, /UpdateSourceAsync/);
  assert.match(plan.code, /ForgeSyncOK/);
  assert.match(plan.code, /ForgeSyncSource/);
  assert.doesNotMatch(plan.code, /\nlocal value = "\\\\n"\nreturn value$/);
});

test('ne supprime dans Studio que les scripts créés par la synchronisation Forge', () => {
  const plan = buildStudioDeleteCode('ServerScriptService/Systems/Combat.server.luau');
  assert.equal(plan.relativePath, 'ServerScriptService/Systems/Combat.server.luau');
  assert.match(plan.code, /GetAttribute\("ForgeSyncSource"\)/);
  assert.match(plan.code, /target:Destroy\(\)/);
  assert.match(plan.code, /ForgeSyncAlreadyRemoved/);
});

test('détecte les erreurs renvoyées dans le contenu MCP', () => {
  assert.match(mcpToolResultError({ content: [{ text: '{"success":false,"error":"Studio absent"}' }] }), /Studio absent/);
  assert.equal(mcpToolResultError({ content: [{ text: '{"success":true}' }] }), null);
});

test('le canal MCP de synchronisation peut réellement terminer son initialisation', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const start = main.indexOf('async function syncMcpInitialize');
  const end = main.indexOf('async function syncMcpCallTool', start);
  const initialize = main.slice(start, end);
  assert.match(initialize, /syncMcpSend\('initialize',[\s\S]*true\)/);
  assert.match(initialize, /syncMcpReady = true/);
});

test('les modifications restent en file et sont retentées si Studio est indisponible', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /const pendingScriptSyncs = new Map\(\)/);
  assert.match(main, /scheduleFileSyncRetry\(\)/);
  assert.match(main, /reconcileSourceScripts\(srcPath, true\)/);
  assert.match(main, /enqueueScriptDelete\(key\)/);
  assert.doesNotMatch(main.slice(main.indexOf('async function syncScriptToStudio')), /isStudioConnected\(\)/);
});

test('compile TypeScript par lot puis publie seulement les sorties modifiées', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /scheduleTypeScriptBuild\(projectPath\)/);
  assert.match(main, /collectCompiledScripts\(projectPath\)/);
  assert.match(main, /changedCompiledScripts\(knownCompiledSignatures, compiled\)/);
  assert.match(main, /if \(!compiled\.has\(filename\)\) enqueueScriptDelete\(filename\)/);
  assert.match(main, /phase: 'compile-error'/);
});
