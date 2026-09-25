const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createAgentActivityStore, resourcesOverlap } = require('./agent-activity');

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

test('reporter CLI uses the injected agent identity and releases claims', t => {
  const { filePath, store } = fixture(t);
  const cli = path.join(__dirname, 'agent-reporter-cli.js');
  const env = { ...process.env, FORGE_AGENT_ACTIVITY_FILE: filePath, FORGE_AGENT_ID: 'codex-1', FORGE_AGENT_NAME: 'Codex' };
  let result = spawnSync(process.execPath, [cli, 'claim', '--task', 'Corriger le HUD', '--resource', 'src/ui'], { env });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(store.list()[0].task, 'Corriger le HUD');
  result = spawnSync(process.execPath, [cli, 'release'], { env });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(store.list()[0].resources, []);
  assert.equal(store.list()[0].status, 'done');
});
