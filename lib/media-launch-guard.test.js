const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createMediaLaunchGuard } = require('./media-launch-guard');

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-launch-'));
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const manifest = { categories: { thumb: { items: [{ id: 'item', variants: [{ id: 'v1' }, { id: 'v2' }] }, { id: 'other' }] } }, jobs: [] };
  const guard = createMediaLaunchGuard(() => manifest);
  return { root, manifest, guard, options: { projectPath: root, kind: 'thumb', itemId: 'item' } };
}

test('simultaneous launch and equivalent project paths create only one provider task', async t => {
  const { guard, options, root } = setup(t);
  let finish, calls = 0;
  const first = guard(options, () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const duplicate = await guard({ ...options, projectPath: root + path.sep + '.' }, () => { calls++; });
  assert.equal(duplicate.code, 'MEDIA_BUSY');
  assert.equal(calls, 1);
  finish({ success: true });
  assert.equal((await first).success, true);
  await guard(options, () => { calls++; });
  assert.equal(calls, 2);
});

test('persisted remote and local jobs block relaunch after a fresh guard is created', async t => {
  const { options, manifest } = setup(t);
  for (const status of ['starting', 'running', 'retry_wait', 'download_wait', 'downloading']) {
    manifest.jobs = [{ id: 'existing', kind: 'thumb', itemId: 'item', status }];
    const guard = createMediaLaunchGuard(() => JSON.parse(JSON.stringify(manifest)));
    const result = await guard(options, () => assert.fail('must not contact provider'));
    assert.equal(result.code, 'MEDIA_BUSY');
    assert.deepEqual(result.jobIds, ['existing']);
  }
});

test('different elements and variants remain independent and terminal jobs allow explicit retry', async t => {
  const { guard, options, manifest } = setup(t);
  manifest.jobs = [{ id: 'j', kind: 'thumb', itemId: 'item', variantId: 'v1', status: 'running' }];
  assert.equal(await guard(options, () => 'parent'), 'parent');
  assert.equal(await guard({ ...options, variantId: 'v2' }, () => 'variant'), 'variant');
  assert.equal(await guard({ ...options, itemId: 'other' }, () => 'other'), 'other');
  for (const status of ['done', 'failed', 'partial', 'cancelled']) {
    manifest.jobs[0].status = status;
    assert.equal(await guard({ ...options, variantId: 'v1' }, () => 'retry'), 'retry');
  }
});

test('failed launches release the lock and missing elements never reach providers', async t => {
  const { guard, options } = setup(t);
  await assert.rejects(guard(options, () => { throw new Error('launch failed'); }), /launch failed/);
  assert.equal(await guard(options, () => 'retried'), 'retried');
  for (const input of [{ itemId: 'missing' }, { variantId: 'missing' }]) {
    assert.equal((await guard({ ...options, ...input }, () => assert.fail('must not launch'))).code, 'MEDIA_NOT_FOUND');
  }
});

test('actual media-generate IPC prevents duplicate launches for all three providers', async t => {
  const { root } = setup(t);
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const source = main.slice(main.indexOf("ipcMain.handle('media-generate'"), main.indexOf('const activeBlenderRenders'));
  for (const [kind, provider] of [['thumb', 'generateMediaWithCodex'], ['model2img', 'generateMediaWithBlender'], ['img2model', 'generateMediaWithTripo']]) {
    let handler, finish, calls = 0;
    const manifest = { categories: { [kind]: { items: [{ id: 'item' }] } }, jobs: [] };
    vm.runInNewContext(source, {
      ipcMain: { handle: (_, fn) => { handler = fn; } }, fs,
      MEDIA_KINDS: { [kind]: { folder: 'images' } }, ensureMediaFolder: () => root,
      guardMediaLaunch: createMediaLaunchGuard(() => manifest),
      [provider]: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
    });
    const options = { projectPath: root, kind, itemId: 'item', provider: 'tripo', tripoApproved: true };
    const first = handler({}, options);
    assert.equal((await handler({}, options)).code, 'MEDIA_BUSY');
    assert.equal(calls, 1);
    finish({ success: true });
    assert.equal((await first).success, true);
  }
});
