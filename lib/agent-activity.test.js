const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createAgentActivityStore, hasEvidence, resourcesOverlap } = require('./agent-activity');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ForgeActivity_'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'activity.json');
  return { filePath, store: createAgentActivityStore(filePath) };
}

test('overlap detects the same file and parent folders without partial-name false positives', () => {
  assert.equal(resourcesOverlap('src/ui', 'src/ui/menu.ts'), true);
  assert.equal(resourcesOverlap('src/ui.ts', 'src/ui-old.ts'), false);
});

test('activity lists tasks, resources and symmetric conflicts', t => {
  const { store } = fixture(t);
  store.update('a', { name: 'Map', task: 'Construire la ville', status: 'working', resources: ['src/map', 'game.Workspace.City'] });
  store.update('b', { name: 'GUI', task: 'Créer le HUD', status: 'working', resources: ['src/ui', 'src/map/buildings.ts'] });
  const list = store.list();
  assert.equal(list.length, 2);
  assert.equal(list.find(item => item.id === 'a').conflicts[0].agentId, 'b');
  assert.equal(list.find(item => item.id === 'b').conflicts[0].agentId, 'a');
  store.update('b', { resources: [], status: 'done' });
  assert.equal(store.list().every(item => item.conflicts.length === 0), true);
});

test('activity preserves a declared test, blocker and last update evidence', t => {
  const { store } = fixture(t);
  store.update('a', { task: 'Publier', test: 'npm test', blocker: 'Jeton absent', status: 'blocked' });
  const item = store.list()[0];
  assert.equal(item.test, 'npm test');
  assert.equal(item.blocker, 'Jeton absent');
  assert.equal(item.status, 'blocked');
  assert.match(item.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('reporter CLI uses the injected agent identity and releases claims', t => {
  const { filePath, store } = fixture(t);
  const cli = path.join(__dirname, 'agent-reporter-cli.js');
  const env = { ...process.env, FORGE_AGENT_ACTIVITY_FILE: filePath, FORGE_AGENT_ID: 'codex-1', FORGE_AGENT_NAME: 'Codex' };
  let result = spawnSync(process.execPath, [cli, 'claim', '--task', 'Corriger le HUD', '--resource', 'src/ui'], { env });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(store.list()[0].task, 'Corriger le HUD');
  result = spawnSync(process.execPath, [cli, 'test', '--test', 'npm test'], { env });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(store.list()[0].status, 'testing');
  assert.equal(store.list()[0].test, 'npm test');
  result = spawnSync(process.execPath, [cli, 'block', '--reason', 'Studio fermé'], { env });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(store.list()[0].status, 'blocked');
  assert.equal(store.list()[0].blocker, 'Studio fermé');
  result = spawnSync(process.execPath, [cli, 'complete', '--test', 'npm test · 12 réussis', '--file', 'src/ui.ts', '--studio', 'Aucune erreur'], { env });
  assert.equal(result.status, 0, result.stderr.toString());
  let completed = store.list()[0];
  assert.deepEqual(completed.resources, []);
  assert.equal(completed.status, 'needs-review');
  assert.equal(completed.evidence.files[0], 'src/ui.ts');
  assert.equal(completed.evidence.studio, 'Aucune erreur');
  assert.equal(hasEvidence(completed.evidence), true);
  result = spawnSync(process.execPath, [cli, 'release'], { env });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(store.list()[0].status, 'idle');
});

test('completion requires test and delivered file evidence, then human validation is timestamped', t => {
  const { filePath, store } = fixture(t);
  const cli = path.join(__dirname, 'agent-reporter-cli.js');
  const env = { ...process.env, FORGE_AGENT_ACTIVITY_FILE: filePath, FORGE_AGENT_ID: 'codex-2', FORGE_AGENT_NAME: 'Codex' };
  let result = spawnSync(process.execPath, [cli, 'complete', '--file', 'src/main.ts'], { env });
  assert.notEqual(result.status, 0);
  result = spawnSync(process.execPath, [cli, 'complete', '--test', 'npm test'], { env });
  assert.notEqual(result.status, 0);
  store.update('codex-2', { task: 'Livrer', status: 'working' });
  store.update('codex-2', { status: 'needs-review', evidence: { tests: ['npm test'], files: ['src/main.ts'], visual: 'capture.png' } });
  assert.equal(store.list()[0].validatedAt, null);
  store.update('codex-2', { status: 'validated' });
  assert.match(store.list()[0].validatedAt, /^\d{4}-\d{2}-\d{2}T/);
  store.update('codex-2', { task: 'Nouvelle tâche', status: 'working' });
  assert.equal(hasEvidence(store.list()[0].evidence), false);
  assert.equal(store.list()[0].validatedAt, null);
});
