const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { trackEvent, getJobMetrics, getAggregatedMetrics } = require('./media-metrics');

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
});
