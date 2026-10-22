'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCodexAuthStatus, getCodexAuthStatus } = require('./codex-auth');

test('Codex auth status recognizes connected, disconnected and unknown output', () => {
  assert.deepEqual(parseCodexAuthStatus('Logged in using ChatGPT'), { state: 'connected' });
  assert.deepEqual(parseCodexAuthStatus('Not logged in'), { state: 'disconnected' });
  assert.deepEqual(parseCodexAuthStatus('unexpected output'), { state: 'unknown' });
});

test('Codex auth status reads stdout or stderr and treats timeout as unknown', async () => {
  assert.deepEqual(await getCodexAuthStatus((_cmd, _args, _opts, done) => done(null, '', 'Logged in using ChatGPT')), { state: 'connected' });
  assert.deepEqual(await getCodexAuthStatus((_cmd, _args, _opts, done) => done({ killed: true }, '', '')), { state: 'unknown' });
});
