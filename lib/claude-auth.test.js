const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAuthStatus, getClaudeAuthStatus } = require('./claude-auth');
test('Claude auth status distinguishes connected, disconnected and unavailable without leaking identity', () => {
  assert.deepEqual(parseAuthStatus('{"loggedIn":true,"email":"private@example.com","token":"secret"}'), {state:'connected'});
  assert.deepEqual(parseAuthStatus('{"loggedIn":false}'), {state:'disconnected'});
  for (const value of ['not JSON', '{}', '{"loggedIn":"true"}']) assert.deepEqual(parseAuthStatus(value), {state:'unknown'});
});
test('a disconnected CLI exit is valid; timeout is not reported as disconnected', async () => {
  assert.deepEqual(await getClaudeAuthStatus((_cmd,_args,_opts,done)=>done({code:1}, '{"loggedIn":false}')), {state:'disconnected'});
  assert.deepEqual(await getClaudeAuthStatus((_cmd,_args,_opts,done)=>done({killed:true}, '')), {state:'unknown'});
});
