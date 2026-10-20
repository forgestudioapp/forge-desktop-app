const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

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

test('les clics rapides de création sont mis en file au lieu d’être perdus', () => {
  const createAgent = functionSource('createAgent', 'startAgentAutomatically');
  assert.match(createAgent, /createAgentQueue/);
  assert.match(createAgent, /createAgentPanel/);
  assert.match(createAgent, /mountAgentPanel\(a\)/);
  assert.doesNotMatch(createAgent, /createAgentLock|setTimeout\([^)]*300/);
});

test('la grille ignore les agents dont le panneau n’a pas été rendu', () => {
  const renderedAgents = functionSource('renderedAgents', 'updateCount');
  const applyGridLayout = functionSource('applyGridLayout', 'genId');
  const saveAgentState = functionSource('saveAgentState', 'loadProject');
  assert.match(renderedAgents, /a\.element&&a\.element\.isConnected/);
  assert.match(applyGridLayout, /const rendered=renderedAgents\(\)/);
  assert.match(applyGridLayout, /const visible=rendered\.filter/);
  assert.doesNotMatch(applyGridLayout, /agents\.filter\(function\(a\)\{return !a\._fullscreen/);
  assert.match(saveAgentState, /agents\.filter\(function\(a\)\{return !a\._closed&&a\.element&&a\.element\.isConnected;\}\)\.map/);
});

test('trois panneaux visibles et un agent fantôme remplissent la grille sans case vide', () => {
  const elements = Array.from({ length: 3 }, () => ({ isConnected: true, style: {} }));
  const context = vm.createContext({
    agents: elements.map(element => ({ element, _closed: false, _fullscreen: false })).concat([{ element: null, _closed: false, _fullscreen: false }]),
    agentGrid: { style: {} }
  });
  vm.runInContext(functionSource('renderedAgents', 'updateCount') + functionSource('applyGridLayout', 'genId'), context);
  context.applyGridLayout();
  assert.equal(context.agentGrid.style.gridTemplateColumns, '1fr 1fr');
  assert.equal(context.agentGrid.style.gridTemplateRows, '1fr 1fr');
  assert.equal(elements[2].style.gridColumn, '1 / -1');
});

test('une création de panneau en erreur retire immédiatement l’agent fantôme', () => {
  const discard = functionSource('discardAgentPanel', 'mountAgentPanel');
  const mount = functionSource('mountAgentPanel', 'createAgent');
  assert.match(discard, /agents\.splice\(index,1\)/);
  assert.match(discard, /agent\.element\.remove\(\)/);
  assert.match(mount, /discardAgentPanel\(agent\);updateCount\(\);throw error/);
  assert.match(workspace, /try\{\s*if\(!await mountAgentPanel\(a\)\)continue;/);
});

test('le bouton Start démarre tous les agents en attente', () => {
  const updateStartButton = functionSource('updateStartButton', 'setReadyOverlayVisible');
  const startPendingAgents = functionSource('startPendingAgents', 'createPanel');
  assert.match(startPendingAgents, /!a\.sessionId\s*&&\s*!a\.starting/);
  assert.match(startPendingAgents, /Promise\.all/);
  assert.match(workspace, /data-i18n="start_agents">Start</);
  assert.doesNotMatch(updateStartButton, /disabled\s*=\s*!activeProject/);
});

test('un agent bloqué ne bloque pas les relances et les démarrages sont bornés', () => {
  const updateStartButton = functionSource('updateStartButton', 'setReadyOverlayVisible');
  const initPty = functionSource('initPty', 'toggleFullscreen');
  assert.match(workspace, /AGENT_START_CONCURRENCY=2/);
  assert.match(workspace, /activeAgentStarts<AGENT_START_CONCURRENCY/);
  assert.doesNotMatch(updateStartButton, /pending===0\|\|starting/);
  assert.match(initPty, /Promise\.race/);
  assert.match(initPty, /22000/);
  assert.match(workspace, /ready-launch-/);
});

test('après le premier Start, tout nouvel agent démarre automatiquement', () => {
  const createAgent = functionSource('createAgent', 'startAgentAutomatically');
  const startPendingAgents = functionSource('startPendingAgents', 'createPanel');
  assert.match(createAgent, /workspaceStarted/);
  assert.match(createAgent, /startAgentAutomatically\(a\)/);
  assert.match(startPendingAgents, /workspaceStarted=true/);
  assert.match(startPendingAgents, /sessionStorage\.setItem\('forge-agents-started:'\+stateProjectKey,'1'\)/);
});

test('un PTY indisponible ne fait plus apparaître un terminal externe', () => {
  const start = main.indexOf("ipcMain.handle('pty-create'");
  const end = main.indexOf("ipcMain.handle('pty-input'", start);
  const ptyCreate = main.slice(start, end);
  assert.match(ptyCreate, /Terminal intégré indisponible/);
  assert.doesNotMatch(ptyCreate, /start', 'cmd\.exe/);
  assert.doesNotMatch(ptyCreate, /createExecAgentFallback|compatibilityMode/);
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

test('Claude Code et Codex transmettent le compte Roblox OAuth à leur MCP', () => {
  assert.match(main, /forge_roblox: \{ command: forgeNodeCommand, args: \[mcpServerPath\], env: getAgentMcpEnv\(projectPath\) \}/);
  assert.match(main, /ensureCodexMcpEntryAsync\(getMcpServerPath\(\)\)/);
  assert.match(main, /new Worker\(path\.join\(__dirname, 'lib', 'codex-mcp-worker\.js'\)/);
  assert.match(main, /ptyEnv = \{[\s\S]*\.\.\.getRobloxMcpEnv\(\)/);
  assert.match(main, /env: \{ \.\.\.process\.env, \.\.\.getRobloxMcpEnv\(\), \.\.\.getProjectAgentEnv\(projectPath\), FORCE_COLOR/);
  assert.doesNotMatch(main, /ensureAgyMcpEntry|resolveAgyCommand/);
});

test('la fin du processus demande une vérification au lieu de déclarer le travail terminé', () => {
  const finishAgentProcess = functionSource('finishAgentProcess', 'refreshAgentActivity');
  assert.match(finishAgentProcess, /status:succeeded\?'needs-review':'failed'/);
  assert.match(finishAgentProcess, /resources:\[\]/);
  assert.doesNotMatch(finishAgentProcess, /status:'done'/);
  assert.match(workspace, /getFileSyncStatus/);
  assert.match(workspace, /sync_compile_error/);
});

test('le contrat de fin conserve les preuves et attend une validation humaine', () => {
  const activity = fs.readFileSync(path.join(root, 'lib', 'agent-activity.js'), 'utf8');
  const reporter = fs.readFileSync(path.join(root, 'lib', 'agent-reporter-cli.js'), 'utf8');
  const prompt = fs.readFileSync(path.join(root, 'forge-system-prompt.md'), 'utf8');
  assert.match(reporter, /action === 'complete'/);
  assert.match(reporter, /--test/);
  assert.match(reporter, /--file/);
  assert.match(reporter, /--object/);
  assert.match(activity, /validatedAt/);
  assert.match(workspace, /validateAgentResult/);
  assert.match(workspace, /status:'validated'/);
  assert.match(prompt, /Le résultat reste « à vérifier » jusqu’à validation humaine/);
});

test('la cloche sait afficher une notification image', () => {
  const assetTypeLabel = functionSource('assetTypeLabel', 'buildNotifThumb');
  assert.match(assetTypeLabel, /type==='image'/);
  assert.match(assetTypeLabel, /t\('type_image'\)/);
  assert.doesNotMatch(assetTypeLabel, /function assetTypeLabel\(t\)/);
});

test('la cloche regroupe le modèle et son aperçu dans une seule carte', () => {
  const buildNotifThumb = functionSource('buildNotifThumb', 'renderNotifList');
  const pushStart = workspace.indexOf('function pushNotification');
  const pushEnd = workspace.indexOf('// Listen for IPC notifications', pushStart);
  const pushNotification = workspace.slice(pushStart, pushEnd);
  assert.match(buildNotifThumb, /notif\.previewPath/);
  assert.match(pushNotification, /existingIndex/);
  assert.match(pushNotification, /notifications\[existingIndex\]=notif/);
});

test('un fichier livré reste à vérifier jusqu’à une validation persistée', () => {
  assert.match(workspace, /technically_complete:'Livré · à vérifier'/);
  assert.match(workspace, /validateNotification\(asset\.id,result\.dest\|\|asset\.filePath\)/);
  assert.match(workspace, /asset\.resultState='validated'/);
  assert.match(main, /ipcMain\.handle\('notifications-validate'/);
  assert.match(main, /resultState: failed \? 'failed' : 'technically_complete'/);
});

test('les actions média montrent leur fournisseur et leur mode de coût avant envoi', () => {
  const thumbnail = fs.readFileSync(path.join(__dirname, '..', 'thumbnail.html'), 'utf8');
  assert.match(thumbnail, /providerDisclosure/);
  assert.match(thumbnail, /ForgeProviderDisclosure\.sentence\('codex'/);
  assert.match(workspace, /ForgeProviderDisclosure\.sentence\(isImage\?'tripo':'blender'/);
});

test('Blender livre un seul FBX avec un aperçu auxiliaire', () => {
  const prompt = fs.readFileSync(path.join(__dirname, '..', 'forge-system-prompt.md'), 'utf8');
  const blender = prompt.slice(prompt.indexOf('### Blender'), prompt.indexOf('## 15.'));
  assert.match(blender, /exactement un modèle final en FBX/);
  assert.match(blender, /<nom-du-modèle>-preview\.png/);
  assert.match(blender, /ne l'annonce pas comme un second asset/);
  assert.match(blender, /Ne génère pas de copie GLB/);
});

test('la fin de Codex finalise les médias même sans rester sur la page Visuels', () => {
  assert.match(main, /finalizeCodexMediaSession\(sess\.projectPath, sessionId\)/);
  assert.match(main, /function finalizeCodexMediaSession/);
  assert.match(main, /notifyCodexMediaJobOnce/);
});
