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

test('checkpoint restores project files, removes later files and preserves excluded folders', t => {
  const f = fixture(t);
  const checkpoint = createProjectCheckpoint({ ...f, label: 'Avant agents', reason: 'before-agents' });
  assert.equal(checkpoint.files, 2);
  assert.equal(listProjectCheckpoints(f).length, 1);
  fs.writeFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'broken');
  fs.writeFileSync(path.join(f.projectPath, 'new-file.txt'), 'later');
  fs.writeFileSync(path.join(f.projectPath, 'node_modules', 'dependency.js'), 'new dependency state');
  const result = restoreProjectCheckpoint({ ...f, checkpointId: checkpoint.id });
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'src', 'main.ts'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(f.projectPath, 'new-file.txt')), false);
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'models', 'scene.blend'), 'utf8'), 'blend-data');
  assert.equal(fs.readFileSync(path.join(f.projectPath, 'node_modules', 'dependency.js'), 'utf8'), 'new dependency state');
  assert.equal(result.safety.reason, 'pre-restore');
  assert.equal(listProjectCheckpoints(f).length, 2);
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
