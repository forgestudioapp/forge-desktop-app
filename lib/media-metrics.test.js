const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { trackEvent, getJobMetrics, getAggregatedMetrics, saveMetrics } = require('./media-metrics');

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
});
