const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const workspace = fs.readFileSync(path.join(root, 'workspace.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

function functionSource(name, nextName) {
  const start = workspace.indexOf(`function ${name}`);
  const end = workspace.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} doit exister`);
  assert.notEqual(end, -1, `${nextName} doit suivre ${name}`);
  return workspace.slice(start, end);
}

test('la sélection prépare les panneaux sans démarrer leur PTY', () => {
  const createPanel = functionSource('createPanel', 'initPty');
  assert.doesNotMatch(createPanel, /initPty\s*\(/);
  assert.match(createPanel, /agent-ready/);
});

test('le bouton Start démarre tous les agents en attente', () => {
  const updateStartButton = functionSource('updateStartButton', 'setReadyOverlayVisible');
  const startPendingAgents = functionSource('startPendingAgents', 'createPanel');
  assert.match(startPendingAgents, /!a\.sessionId\s*&&\s*!a\.starting/);
  assert.match(startPendingAgents, /Promise\.all/);
  assert.match(workspace, /data-i18n="start_agents">Start</);
  assert.doesNotMatch(updateStartButton, /disabled\s*=\s*!activeProject/);
});

test('après le premier Start, tout nouvel agent démarre automatiquement', () => {
  const createAgent = functionSource('createAgent', 'startAgentAutomatically');
  const startPendingAgents = functionSource('startPendingAgents', 'createPanel');
  assert.match(createAgent, /workspaceStarted/);
  assert.match(createAgent, /startAgentAutomatically\(a\)/);
  assert.match(startPendingAgents, /workspaceStarted=true/);
  assert.match(startPendingAgents, /sessionStorage\.setItem\('forge-agents-started','1'\)/);
});

test('un PTY indisponible ne fait plus apparaître un terminal externe', () => {
  const start = main.indexOf("ipcMain.handle('pty-create'");
  const end = main.indexOf("ipcMain.handle('pty-input'", start);
  const ptyCreate = main.slice(start, end);
  assert.match(ptyCreate, /Terminal intégré indisponible/);
  assert.doesNotMatch(ptyCreate, /start', 'cmd\.exe/);
});

test('le PTY lance directement le CLI sans afficher les commandes de préparation', () => {
  const start = main.indexOf("ipcMain.handle('pty-create'");
  const end = main.indexOf("ipcMain.handle('pty-input'", start);
  const ptyCreate = main.slice(start, end);
  assert.match(ptyCreate, /\['\/d', '\/q', '\/c', launchCmd\]/);
  assert.match(ptyCreate, /FORGE_ASSETS_DIR: assetsDir/);
  assert.doesNotMatch(ptyCreate, /envInject/);
  assert.doesNotMatch(ptyCreate, /ptyProcess\.write/);
});

test('Codex ne tente pas une mise à jour npm pendant son lancement dans Forge', () => {
  assert.match(main, /codex --config check_for_update_on_startup=false --dangerously-bypass-approvals-and-sandbox/);
});

test('la cloche sait afficher une notification image', () => {
  const assetTypeLabel = functionSource('assetTypeLabel', 'buildNotifThumb');
  assert.match(assetTypeLabel, /type==='image'/);
  assert.match(assetTypeLabel, /t\('type_image'\)/);
  assert.doesNotMatch(assetTypeLabel, /function assetTypeLabel\(t\)/);
});

test('la fin de Codex finalise les médias même sans rester sur la page Visuels', () => {
  assert.match(main, /finalizeCodexMediaSession\(sess\.projectPath, sessionId\)/);
  assert.match(main, /function finalizeCodexMediaSession/);
  assert.match(main, /notifyCodexMediaJobOnce/);
});
