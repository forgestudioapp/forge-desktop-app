const test = require('node:test');
const assert = require('node:assert/strict');
const { waitForFirstProjectSync } = require('./first-project-sync');

test('first synchronization waits for a confirmed build', async () => {
  const states = [{ phase: 'scanning' }, { phase: 'syncing' }, { phase: 'synced', lastValidBuildId: 'abc', lastSyncedAt: 'now' }];
  const result = await waitForFirstProjectSync(async () => states.shift(), { timeoutMs: 100, delay: async () => {} });
  assert.deepEqual(result, { status: 'confirmed', buildId: 'abc', at: 'now' });
});
test('validation error is surfaced with its file', async () => {
  const result = await waitForFirstProjectSync(async () => ({ phase: 'compile-error', error: 'syntax', errorFile: 'src/main.ts' }));
  assert.deepEqual(result, { status: 'error', stage: 'validation', error: 'syntax', file: 'src/main.ts' });
});
test('a bridge error stops first-sync waiting immediately', async () => {
  const result = await waitForFirstProjectSync(async () => ({ phase: 'error', error: 'Capacité indisponible' }), { delay: () => { throw new Error('should not poll again'); } });
  assert.deepEqual(result, { status: 'error', stage: 'sync', error: 'Capacité indisponible', file: null });
});
test('offline Studio remains pending rather than reporting a successful sync', async () => {
  let time = 0;
  const result = await waitForFirstProjectSync(async () => ({ phase: 'waiting-studio', error: 'Studio fermé' }), { timeoutMs: 10, now: () => time, delay: async () => { time = 10; } });
  assert.equal(result.status, 'waiting-studio');
});
