const test = require('node:test');
const assert = require('node:assert/strict');
const { restoreWithSyncPaused } = require('./checkpoint-restore-flow');

test('open synchronized project pauses syncing for restoration and resumes it', async () => {
  const calls = [];
  await restoreWithSyncPaused({ isSyncing: true, stopSync: () => calls.push('stop'), restore: async () => { calls.push('restore'); return true; }, startSync: () => calls.push('start') });
  assert.deepEqual(calls, ['stop', 'restore', 'start']);
});

test('sync resumes even when restoration fails', async () => {
  const calls = [];
  await assert.rejects(restoreWithSyncPaused({ isSyncing: true, stopSync: () => calls.push('stop'), restore: async () => { calls.push('restore'); throw new Error('failure'); }, startSync: () => calls.push('start') }), /failure/);
  assert.deepEqual(calls, ['stop', 'restore', 'start']);
});
