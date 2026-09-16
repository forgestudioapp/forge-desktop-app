const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { trackEvent, getJobMetrics, getAggregatedMetrics, loadMetrics, saveMetrics } = require('./media-metrics');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-'));
  fs.mkdirSync(path.join(dir, '.forge-media'), { recursive: true });
  return dir;
}

describe('media-metrics', () => {
  it('tracks start and poll events', () => {
    const dir = tmpProject();
    trackEvent(dir, 'job1', 'start', { method: 'codex', kind: 'thumb' });
    trackEvent(dir, 'job1', 'poll');
    trackEvent(dir, 'job1', 'poll');
    const m = getJobMetrics(dir, 'job1');
    assert.equal(m.polls, 2);
    assert.equal(m.method, 'codex');
    assert.equal(m.kind, 'thumb');
    assert.equal(m.errors, 0);
  });

  it('tracks errors and retries', () => {
    const dir = tmpProject();
    trackEvent(dir, 'job2', 'start', { method: 'tripo', kind: 'img2model' });
    trackEvent(dir, 'job2', 'error', { message: 'timeout' });
    trackEvent(dir, 'job2', 'retry');
    const m = getJobMetrics(dir, 'job2');
    assert.equal(m.errors, 1);
    assert.equal(m.retries, 1);
  });

  it('tracks consumption', () => {
    const dir = tmpProject();
    trackEvent(dir, 'job3', 'start', { method: 'tripo' });
    trackEvent(dir, 'job3', 'consumption', { consumption: { credits: 5 } });
    const m = getJobMetrics(dir, 'job3');
    assert.deepEqual(m.consumption, { credits: 5 });
  });

  it('aggregates metrics across jobs', () => {
    const dir = tmpProject();
    trackEvent(dir, 'j1', 'start', { method: 'codex' });
    trackEvent(dir, 'j1', 'poll');
    trackEvent(dir, 'j1', 'done', { status: 'done' });
    trackEvent(dir, 'j2', 'start', { method: 'tripo' });
    trackEvent(dir, 'j2', 'error', { message: 'fail' });
    const agg = getAggregatedMetrics(dir);
    assert.equal(agg.totalJobs, 2);
    assert.equal(agg.totalPolls, 1);
    assert.equal(agg.totalErrors, 1);
    assert.ok(agg.byMethod.codex);
    assert.ok(agg.byMethod.tripo);
  });

  it('returns null for unknown job', () => {
    const dir = tmpProject();
    assert.equal(getJobMetrics(dir, 'nonexistent'), null);
  });

  it('preserves a completed zero duration after a fresh process reads the project', () => {
    const dir = tmpProject();
    saveMetrics(dir, { instant: { startedAt: 1, durationMs: 0, status: 'done', events: [] } });
    const { execFileSync } = require('child_process');
    const output = execFileSync(process.execPath, ['-e',
      'const m=require(process.argv[1]); process.stdout.write(JSON.stringify(m.getJobMetrics(process.argv[2], "instant")))',
      require.resolve('./media-metrics'), dir], { encoding: 'utf8' });
    assert.equal(JSON.parse(output).durationMs, 0);
    trackEvent(dir, 'instant', 'done');
    assert.equal(getJobMetrics(dir, 'instant').durationMs, 0);
  });

  it('averages only finished jobs and selects recent jobs by timestamp', () => {
    const dir = tmpProject();
    saveMetrics(dir, {
      newest: { startedAt: 300, status: 'running', durationMs: null, method: 'blender' },
      completed: { startedAt: 200, status: 'done', durationMs: 2000, method: 'blender' },
      oldest: { startedAt: 100, status: 'done', durationMs: 9000, method: 'blender' }
    });
    const result = getAggregatedMetrics(dir, 2);
    assert.equal(result.totalJobs, 2);
    assert.equal(result.avgDurationMs, 2000);
    assert.equal(result.byMethod.blender.avgDuration, 2000);
    assert.equal(result.byMethod.blender.completedJobs, 1);
    assert.equal(getAggregatedMetrics(dir, 0).totalJobs, 0);
  });

  it('ignores invalid consumption and download values without converting metadata to credits', () => {
    const dir = tmpProject();
    trackEvent(dir, 'job', 'start', { method: 'blender' });
    for (const bytes of ['50', -1, NaN, 12]) trackEvent(dir, 'job', 'download', { bytes });
    trackEvent(dir, 'job', 'consumption', { consumption: { credits: 'unavailable', bad: -5, provider: 'blender', blender_local: 2 } });
    assert.equal(getJobMetrics(dir, 'job').downloadBytes, 12);
    assert.deepEqual(getAggregatedMetrics(dir).totalConsumption, { blender_local: 2 });
    assert.equal(fs.readdirSync(path.join(dir, '.forge-media')).filter(name => name.endsWith('.tmp')).length, 0);
  });

  it('starting a new run clears the old terminal duration and status', () => {
    const dir = tmpProject();
    trackEvent(dir, 'job', 'start'); trackEvent(dir, 'job', 'done'); trackEvent(dir, 'job', 'start');
    assert.equal(getJobMetrics(dir, 'job').status, 'running');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.forge-media', 'metrics.json'))).job.durationMs, null);
  });

  for (const raw of ['null', '[]', '42', '{"job":']) {
    it(`preserves the original invalid journal before recovering ${JSON.stringify(raw)}`, t => {
      t.mock.method(console, 'warn', () => {});
      const dir = tmpProject();
      const folder = path.join(dir, '.forge-media');
      const target = path.join(folder, 'metrics.json');
      fs.writeFileSync(target, raw);
      assert.deepEqual(loadMetrics(dir), {});
      assert.equal(getJobMetrics(dir, 'job'), null);
      assert.equal(getAggregatedMetrics(dir).totalJobs, 0);
      assert.equal(fs.readFileSync(target, 'utf8'), raw, 'reading does not replace the invalid journal');

      assert.equal(trackEvent(dir, 'job', 'poll'), true);
      assert.equal(getJobMetrics(dir, 'job').polls, 1);
      assert.equal(getAggregatedMetrics(dir).totalConsumption, null);
      const backups = fs.readdirSync(folder).filter(name => name.endsWith('.corrupt'));
      assert.equal(backups.length, 1);
      assert.equal(fs.readFileSync(path.join(folder, backups[0]), 'utf8'), raw);
      assert.equal(fs.readdirSync(folder).some(name => name.endsWith('.tmp')), false);
    });
  }

  it('recovers valid jobs in a partly malformed journal without losing their history', t => {
    t.mock.method(console, 'warn', () => {});
    const dir = tmpProject();
    const target = path.join(dir, '.forge-media', 'metrics.json');
    const raw = JSON.stringify({ good: { polls: 4, startedAt: 1, events: [] }, invalid: null, invalidList: [] });
    fs.writeFileSync(target, raw);
    assert.equal(getAggregatedMetrics(dir).totalJobs, 1);
    assert.equal(trackEvent(dir, 'good', 'poll'), true);
    assert.equal(getJobMetrics(dir, 'good').polls, 5);
    assert.equal(getJobMetrics(dir, 'invalid'), null);
    const backup = fs.readdirSync(path.dirname(target)).find(name => name.endsWith('.corrupt'));
    assert.equal(fs.readFileSync(path.join(path.dirname(target), backup), 'utf8'), raw);
  });

  it('normalizes incomplete jobs and never invents elapsed time for an already finished job', () => {
    const dir = tmpProject();
    saveMetrics(dir, {
      incomplete: { polls: '3', apiCalls: -1, errors: 1.8, retries: null, events: null, consumption: [], method: {} },
      finished: { startedAt: 1, status: 'done' },
    });
    const before = getJobMetrics(dir, 'incomplete');
    assert.equal(before.polls, 0);
    assert.equal(before.errors, 1);
    assert.equal(before.durationMs, null);
    assert.equal(before.consumption, null);
    assert.equal(before.method, null);
    assert.equal(getJobMetrics(dir, 'finished').durationMs, null);
    assert.equal(trackEvent(dir, 'incomplete', 'error', { message: 123 }), true);
    assert.equal(getJobMetrics(dir, 'incomplete').errors, 2);
    assert.equal(trackEvent(dir, 'incomplete', 'poll', null), true);
    assert.equal(getJobMetrics(dir, 'incomplete').polls, 1);
    assert.equal(getAggregatedMetrics(dir).totalConsumption, null);
  });

  it('supports job and method names that collide with object prototype properties', () => {
    const dir = tmpProject();
    assert.equal(trackEvent(dir, '__proto__', 'start', { method: '__proto__' }), true);
    assert.equal(trackEvent(dir, '__proto__', 'poll'), true);
    assert.equal(trackEvent(dir, 'constructor', 'start', { method: 'constructor' }), true);
    assert.equal(getJobMetrics(dir, '__proto__').polls, 1);
    assert.equal(getAggregatedMetrics(dir).byMethod.__proto__.jobs, 1);
    assert.equal(getAggregatedMetrics(dir).byMethod.constructor.jobs, 1);
    assert.equal(Object.prototype.polls, undefined);
  });

  it('keeps an unreadable journal untouched and returns without interrupting the caller', t => {
    t.mock.method(console, 'warn', () => {});
    const dir = tmpProject();
    const target = path.join(dir, '.forge-media', 'metrics.json');
    const raw = '{"job":{"polls":7}}';
    fs.writeFileSync(target, raw);
    const read = fs.readFileSync;
    t.mock.method(fs, 'readFileSync', function (file, ...args) {
      if (file === target) throw Object.assign(new Error('locked journal'), { code: 'EACCES' });
      return read.call(this, file, ...args);
    });
    assert.deepEqual(loadMetrics(dir), {});
    assert.equal(trackEvent(dir, 'job', 'poll'), false);
    assert.equal(saveMetrics(dir, { replacement: {} }), false);
    assert.equal(read(target, 'utf8'), raw);
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ['metrics.json']);
  });

  for (const operation of ['mkdirSync', 'writeFileSync', 'renameSync']) {
    it(`leaves prior metrics intact when ${operation} fails and cleans temporary files`, t => {
      t.mock.method(console, 'warn', () => {});
      const dir = tmpProject();
      const folder = path.join(dir, '.forge-media');
      const target = path.join(folder, 'metrics.json');
      const raw = '{"job":{"polls":7}}';
      fs.writeFileSync(target, raw);
      const original = fs[operation];
      t.mock.method(fs, operation, function (...args) {
        // Simulate a partial write, not just failure before any bytes reach disk.
        if (operation === 'writeFileSync') original.call(this, args[0], 'partial');
        throw Object.assign(new Error('simulated disk failure'), { code: 'EIO' });
      });
      assert.equal(trackEvent(dir, 'job', 'poll'), false);
      assert.equal(saveMetrics(dir, { replacement: {} }), false);
      assert.equal(fs.readFileSync(target, 'utf8'), raw);
      assert.deepEqual(fs.readdirSync(folder), ['metrics.json']);
    });
  }

  it('abandons recovery if preserving the corrupt journal fails', t => {
    t.mock.method(console, 'warn', () => {});
    const dir = tmpProject();
    const target = path.join(dir, '.forge-media', 'metrics.json');
    const raw = '{broken';
    fs.writeFileSync(target, raw);
    t.mock.method(fs, 'copyFileSync', () => { throw Object.assign(new Error('backup denied'), { code: 'EACCES' }); });
    assert.equal(trackEvent(dir, 'job', 'poll'), false);
    assert.equal(saveMetrics(dir, { replacement: {} }), false);
    assert.equal(fs.readFileSync(target, 'utf8'), raw);
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ['metrics.json']);
  });

  it('rejects malformed replacement data before changing a valid journal', t => {
    t.mock.method(console, 'warn', () => {});
    const dir = tmpProject();
    const target = path.join(dir, '.forge-media', 'metrics.json');
    const raw = '{"job":{"polls":7}}';
    fs.writeFileSync(target, raw);
    for (const invalid of [null, [], { job: null }, { job: [] }]) assert.equal(saveMetrics(dir, invalid), false);
    assert.equal(fs.readFileSync(target, 'utf8'), raw);
  });
});
