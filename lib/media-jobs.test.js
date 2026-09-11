const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { retainJobs, advanceRemoteJob, mergePolledJobs } = require('./media-jobs');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('history keeps every active job and only trims completed history', () => {
  const active = Array.from({ length: 70 }, (_, id) => ({ id, status: 'pending' }));
  const completed = Array.from({ length: 60 }, (_, id) => ({ id: 'done-' + id, status: 'done' }));
  const retained = retainJobs([...active, ...completed]);
  assert.equal(retained.length, 120);
  assert.deepEqual(retained.slice(0, 70), active);
  assert.equal(retained[70].id, 'done-10');
});

test('network errors back off and recover using the same task, including after serialization', async () => {
  let clock = 1000, calls = 0;
  const ids = [];
  const deps = { now: () => clock, poll: async id => {
    ids.push(id); calls++;
    if (calls === 1) throw new Error('offline');
    return { status: 'success', output: { model: 'https://example.test/asset.glb' } };
  }, download: async () => 'conversions/asset.glb' };
  let job = await advanceRemoteJob({ id: 'paid-task', kind: 'img2model', status: 'pending' }, deps);
  assert.equal(job.status, 'retry_wait');
  assert.equal(job.finishedAt, null);
  job = JSON.parse(JSON.stringify(job));
  await advanceRemoteJob(job, deps);
  assert.equal(calls, 1);
  clock = job.nextAttemptAt;
  job = await advanceRemoteJob(job, deps);
  assert.equal(job.status, 'done');
  assert.equal(job.saved, 'conversions/asset.glb');
  assert.deepEqual(ids, ['paid-task', 'paid-task']);
});

test('remote success is not local completion until the file is retrieved', async () => {
  let clock = 0, available = false;
  const deps = { now: () => clock, poll: async () => ({ status: 'success', output: { model: 'https://example.test/asset.glb' } }),
    download: async () => { if (!available) throw new Error('download interrupted'); return 'asset.glb'; } };
  let job = await advanceRemoteJob({ id: 'task', kind: 'img2model', status: 'pending' }, deps);
  assert.equal(job.status, 'download_wait');
  assert.equal(job.remoteStatus, 'success');
  assert.equal(job.finishedAt, null);
  clock = job.nextAttemptAt;
  available = true;
  job = await advanceRemoteJob(job, deps);
  assert.equal(job.status, 'done');
});

test('missing result remains retryable, explicit provider failure is terminal', async () => {
  const download = async () => { throw new Error('must not download'); };
  const source = { id: 'task', kind: 'img2model', status: 'pending' };
  const missing = await advanceRemoteJob(source, { poll: async () => ({ status: 'success', output: {} }), download });
  assert.equal(missing.status, 'download_wait');
  const failed = await advanceRemoteJob(source, { poll: async () => ({ status: 'failed' }), download });
  assert.equal(failed.status, 'failed');
  assert.ok(failed.finishedAt);
});

test('poll merge preserves new and deleted jobs and user edits to items', () => {
  const entry = { name: 'User renamed this', files: ['existing.png'] };
  const latest = { jobs: [{ id: 'old', itemId: 'item', kind: 'img2model', status: 'running' },
    { id: 'new', status: 'pending' }] };
  const merged = mergePolledJobs(latest, [{ id: 'old', itemId: 'item', kind: 'img2model', status: 'done', saved: 'asset.glb' },
    { id: 'deleted', status: 'done' }], (_, kind, id) => id === 'item' ? entry : null);
  assert.deepEqual(merged.jobs.map(j => j.id), ['old', 'new']);
  assert.equal(entry.name, 'User renamed this');
  assert.deepEqual(entry.files, ['existing.png', 'asset.glb']);
  assert.equal(entry.status, 'done');
});

test('actual poll coordinator shares one request between page and background', async () => {
  const start = main.indexOf('const mediaPolls = new Map();');
  const end = main.indexOf('async function tripoCreateTask(', start);
  let release, calls = 0;
  const context = vm.createContext({ canonicalExistingPath: p => p, app: { on() {} }, ipcMain: { handle() {} },
    pollMediaJobsNow: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  vm.runInContext(main.slice(start, end), context);
  const a = context.pollMediaJobs('project'), b = context.pollMediaJobs('project');
  assert.equal(a, b);
  assert.equal(calls, 1);
  release({ done: true, jobs: [] });
  await a;
});

test('actual background scheduler stops when remote jobs complete without a page', async () => {
  const start = main.indexOf('const mediaPolls = new Map();');
  const end = main.indexOf('async function tripoCreateTask(', start);
  let callback, schedules = 0, active = true;
  const context = vm.createContext({ canonicalExistingPath: p => p, app: { on() {} }, ipcMain: { handle() {} },
    fs: { existsSync: () => true }, isActiveJob: job => job.status === 'pending',
    loadMediaManifest: () => ({ jobs: [{ id: 'task', method: 'tripo', status: active ? 'pending' : 'done' }] }),
    setTimeout: fn => { callback = fn; schedules++; return { unref() {} }; },
    pollMediaJobsNow: async () => { active = false; return { done: true }; } });
  vm.runInContext(main.slice(start, end), context);
  context.scheduleMediaTracking('project');
  context.scheduleMediaTracking('project');
  assert.equal(schedules, 1);
  await callback();
  assert.equal(schedules, 1);
});

function downloadFixture(t, fetch) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-download-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const start = main.indexOf('async function downloadMediaToProject(');
  const end = main.indexOf('// Suppression d', start);
  const download = vm.runInNewContext(`(${main.slice(start, end).trim()})`, {
    URL, fs, path, require, fetch, AbortController, setTimeout, clearTimeout,
    ensureMediaFolder: () => root, MEDIA_KINDS: { img2model: { folder: 'conversions' } },
  });
  return { root, download: (url, id = 'task') => download(url, root, 'img2model', {}, id) };
}
test('actual downloader uses exclusive complete files and reuses them on retry', async t => {
  let calls = 0;
  const { root, download } = downloadFixture(t, async () => { calls++; return new Response('complete model', { headers: { 'content-length': '14' } }); });
  const first = await download('https://example.test/asset.glb?token=old');
  const second = await download('https://example.test/asset.glb?token=new');
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(fs.readFileSync(path.join(root, first), 'utf8'), 'complete model');
  assert.equal(fs.readdirSync(root).length, 1);
});
test('empty and truncated downloads leave no final or temporary file', async t => {
  for (const body of ['', 'partial']) {
    const { root, download } = downloadFixture(t, async () => new Response(body, { headers: { 'content-length': '100' } }));
    await assert.rejects(download('https://example.test/asset.glb'), /incomplet|vide/);
    assert.deepEqual(fs.readdirSync(root), []);
  }
});
