'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAgentUsageStore, codexUsageEvent, claudeUsageEvent, createStructuredUsageParser } = require('./agent-usage');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-usage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return createAgentUsageStore(path.join(dir, 'usage.json'));
}

test('unmeasured provider sessions stay explicitly unavailable', t => {
  const store = fixture(t);
  store.begin('s1', { provider: 'codex', project: '/game', task: 'Prompt content must not be stored' });
  store.finish('s1', 'failed');
  assert.deepEqual(store.summary({ project: '/game' }).totals, null);
  assert.equal(store.summary({ project: '/game' }).availability, 'unavailable');
  assert.equal(store.summary({ project: '/game' }).bySession[0].task, undefined);
});

test('JSONL parser ignores ordinary output and extracts complete native events once', () => {
  const events = [];
  const parser = createStructuredUsageParser('codex', event => events.push(event));
  parser.push('progress\n{"type":"turn.completed","id":"turn-1","usage":{"input_tokens":8,');
  parser.push('"cached_input_tokens":3,"output_tokens":2}}\n');
  parser.flush();
  assert.deepEqual(events, [{ eventId: 'turn-1', model: undefined, cumulative: false, absolute: false, usage: { input: 8, output: 2, cacheRead: 3, cacheWrite: null } }]);
});

test('cumulative events are deduplicated and converted to deltas', t => {
  const store = fixture(t);
  store.begin('s1', { provider: 'codex', project: '/game' });
  store.record('s1', { eventId: 'a', cumulative: true, usage: { input: 100, output: 20, cacheRead: 60 } });
  store.record('s1', { eventId: 'a', cumulative: true, usage: { input: 100, output: 20, cacheRead: 60 } });
  store.record('s1', { eventId: 'b', cumulative: true, usage: { input: 150, output: 35, cacheRead: 90 } });
  store.finish('s1', 'accepted');
  assert.deepEqual(store.summary().totals, { input: 150, output: 35, cacheRead: 90, cacheWrite: 0 });
});

test('native Codex and Claude shapes are normalized without prompt contents', () => {
  assert.deepEqual(codexUsageEvent({ method: 'thread/tokenUsage/updated', params: { turnId: 't1', model: 'gpt', tokenUsage: { inputTokens: 4, outputTokens: 2, cacheRead: 3 } } }), {
    eventId: 't1', model: 'gpt', cumulative: false, absolute: true, usage: { input: 4, output: 2, cacheRead: 3, cacheWrite: null },
  });
  assert.deepEqual(claudeUsageEvent({ type: 'result', id: 'r1', model: 'claude', usage: { input_tokens: 5, output_tokens: 1, cache_creation_input_tokens: 2 } }), {
    eventId: 'r1', model: 'claude', cumulative: false, absolute: true, usage: { input: 5, output: 1, cacheRead: null, cacheWrite: 2 },
  });
});

test('nested provider totals and repeated cumulative updates are measured once', t => {
  const store = fixture(t);
  store.begin('s1', { provider: 'codex', project: '/game' });
  const first = codexUsageEvent({ method: 'thread/tokenUsage/updated', params: { turnId: 't1', tokenUsage: { total: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 40 } } } });
  const second = codexUsageEvent({ method: 'thread/tokenUsage/updated', params: { turnId: 't1', tokenUsage: { total: { inputTokens: 150, outputTokens: 35, cachedInputTokens: 60 } } } });
  store.record('s1', first);
  store.record('s1', first);
  store.record('s1', second);
  assert.deepEqual(store.summary().totals, { input: 150, output: 35, cacheRead: 60, cacheWrite: 0 });
});

test('Claude assistant usage is read and final totals reconcile without double counting', t => {
  const store = fixture(t);
  store.begin('s1', { provider: 'claude', project: '/game' });
  store.record('s1', claudeUsageEvent({ type: 'assistant', message: { id: 'm1', model: 'claude', usage: { input_tokens: 60, output_tokens: 10, cache_read_input_tokens: 25 } } }));
  store.record('s1', claudeUsageEvent({ type: 'result', id: 'r1', usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 40 } }));
  assert.deepEqual(store.summary().totals, { input: 100, output: 20, cacheRead: 40, cacheWrite: 0 });
});
