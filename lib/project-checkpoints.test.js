const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const {
  createProjectCheckpoint,
  listProjectCheckpoints,
  restoreProjectCheckpoint,
  deleteProjectCheckpoint,
  pruneAutomaticProjectCheckpoints,
  planProjectCheckpointRestore,
} = require('./project-checkpoints');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ForgeCheckpoint_'));
  const projectPath = path.join(root, 'project');
  const storageRoot = path.join(root, 'storage');
  fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'models'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(projectPath, 'src', 'main.ts'), 'original');
  fs.writeFileSync(path.join(projectPath, 'models', 'scene.blend'), 'blend-data');
  fs.writeFileSync(path.join(projectPath, 'node_modules', 'dependency.js'), 'keep-current');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { projectPath, storageRoot };
}

function runWorker(action, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'project-checkpoint-worker.js'), { workerData: { action, options } });
    worker.once('message', message => message.success ? resolve(message.result) : reject(new Error(message.error)));
    worker.once('error', reject);
  });
}

test('checkpoint restores project files, preserves later files and excluded folders', t => {
  const f = fixture(t);
  const checkpoint = createProjectCheckpoint({ ...f, label: 'Avant agents', reason: 'before-agents' });
  assert.equal(checkpoint.files, 2);
  assert.equal(listProjectCheckpoints(f).length, 1);
  fs.writeFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'broken');
  fs.writeFileSync(path.join(f.projectPath, 'new-file.txt'), 'later');
  fs.writeFileSync(path.join(f.projectPath, 'node_modules', 'dependency.js'), 'new dependency state');
  const result = restoreProjectCheckpoint({ ...f, checkpointId: checkpoint.id });
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(f.projectPath, 'new-file.txt')), true);
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'models', 'scene.blend'), 'utf8'), 'blend-data');
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'node_modules', 'dependency.js'), 'utf8'), 'new dependency state');
  assert.equal(result.safety.reason, 'pre-restore');
  assert.equal(listProjectCheckpoints(f).length, 2);
});

test('code version restores a modified script and keeps new files and media', t => {
  const f = fixture(t);
  const before = createProjectCheckpoint({ ...f, label: 'Before', reason: 'agent-before', kind: 'code', agent: 'Codex', objective: 'Modify script', placeId: '123', lastValidBuildId: 'valid-1' });
  assert.equal(before.agent, 'Codex');
  assert.equal(before.objective, 'Modify script');
  assert.equal(before.placeId, '123');
  assert.equal(before.lastValidBuildId, 'valid-1');
  fs.writeFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'changed');
  fs.writeFileSync(path.join(f.projectPath, 'src', 'new.lua'), 'print(1)');
  fs.rmSync(path.join(f.projectPath, 'models', 'scene.blend'));
  const after = createProjectCheckpoint({ ...f, label: 'After', reason: 'agent-after', kind: 'code', beforeEntries: before.entries, beforeCheckpointId: before.id });
  assert.deepEqual(after.affectedFiles, ['src/main.ts', 'src/new.lua']);
  const plan = planProjectCheckpointRestore({ ...f, checkpointId: before.id });
  assert.deepEqual(plan.restored, ['src/main.ts']);
  assert.deepEqual(plan.kept, ['src/new.lua']);
  const result = restoreProjectCheckpoint({ ...f, checkpointId: before.id });
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(f.projectPath, 'src', 'new.lua')), true);
  assert.equal(fs.existsSync(path.join(f.projectPath, 'models', 'scene.blend')), false);
  restoreProjectCheckpoint({ ...f, checkpointId: result.safety.id });
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8'), 'changed');
});

test('deleted script is recovered and recent script is deleted only by explicit choice', t => {
  const f = fixture(t);
  const version = createProjectCheckpoint({ ...f, kind: 'code' });
  fs.rmSync(path.join(f.projectPath, 'src', 'main.ts'));
  fs.writeFileSync(path.join(f.projectPath, 'src', 'recent.lua'), 'new');
  restoreProjectCheckpoint({ ...f, checkpointId: version.id, deletePaths: ['src/recent.lua'] });
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(f.projectPath, 'src', 'recent.lua')), false);
});

test('missing media blocks archive restoration without changing the project', t => {
  const f = fixture(t);
  const version = createProjectCheckpoint({ ...f, kind: 'archive' });
  const root = require('./project-checkpoints').checkpointRoot(f.storageRoot, f.projectPath);
  fs.rmSync(path.join(root, version.id, 'files', 'models', 'scene.blend'));
  fs.writeFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'current');
  assert.throws(() => restoreProjectCheckpoint({ ...f, checkpointId: version.id }), /manquant/);
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8'), 'current');
});

test('restoration error rolls back project files', t => {
  const f = fixture(t);
  const version = createProjectCheckpoint({ ...f, kind: 'code' });
  fs.writeFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'current');
  assert.throws(() => restoreProjectCheckpoint({ ...f, checkpointId: version.id, failAfter: 1 }), /interrompue/);
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8'), 'current');
});

test('automatic retention never deletes manual restore points', t => {
  const f = fixture(t);
  const manual = createProjectCheckpoint({ ...f, label: 'Manuel', reason: 'manual' });
  for (let index = 0; index < 4; index++) {
    createProjectCheckpoint({ ...f, label: `Auto ${index}`, reason: 'before-agents' });
  }
  const removed = pruneAutomaticProjectCheckpoints({ ...f, keep: 2 });
  assert.equal(removed.length, 2);
  const remaining = listProjectCheckpoints(f);
  assert.equal(remaining.filter(item => item.reason === 'before-agents').length, 2);
  assert.ok(remaining.some(item => item.id === manual.id));
});

test('checkpoint labels are sanitized and deletion is scoped to the project', t => {
  const a = fixture(t);
  const bPath = path.join(path.dirname(a.projectPath), 'other');
  fs.mkdirSync(bPath);
  fs.writeFileSync(path.join(bPath, 'file.txt'), 'other');
  const checkpoint = createProjectCheckpoint({ ...a, label: '  Test\u0000 label  ' });
  assert.equal(checkpoint.label, 'Test  label');
  assert.throws(() => deleteProjectCheckpoint({ projectPath: bPath, storageRoot: a.storageRoot, checkpointId: checkpoint.id }), /introuvable/);
  assert.equal(deleteProjectCheckpoint({ ...a, checkpointId: checkpoint.id }).id, checkpoint.id);
  assert.deepEqual(listProjectCheckpoints(a), []);
});

test('a damaged checkpoint is rejected before the current project changes', t => {
  const f = fixture(t);
  const checkpoint = createProjectCheckpoint({ ...f, label: 'Intègre' });
  const before = fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8');
  const root = require('./project-checkpoints').checkpointRoot(f.storageRoot, f.projectPath);
  fs.writeFileSync(path.join(root, checkpoint.id, 'files', 'src', 'main.ts'), 'corrupted');
  assert.throws(() => restoreProjectCheckpoint({ ...f, checkpointId: checkpoint.id }), /endommagé/);
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8'), before);
  assert.equal(listProjectCheckpoints(f).length, 1);
});

test('background worker creates and restores without using the Electron main thread', async t => {
  const f = fixture(t);
  const checkpoint = await runWorker('create', { ...f, label: 'Worker', reason: 'before-agents' });
  fs.writeFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'changed');
  const restored = await runWorker('restore', { ...f, checkpointId: checkpoint.id });
  assert.equal(restored.restored.id, checkpoint.id);
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8'), 'original');
});
