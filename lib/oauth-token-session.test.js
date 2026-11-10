const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenExpiresAt, shouldRefreshToken, mergeRotatedToken } = require('./oauth-token-session');

test('expiring OAuth tokens are refreshed before their deadline', () => {
  const token = { obtained_at: 1000, expires_in: 900, refresh_token: 'refresh' };
  assert.equal(tokenExpiresAt(token), 901000);
  assert.equal(shouldRefreshToken(token, 850000, 60000), true);
  assert.equal(shouldRefreshToken(token, 800000, 60000), false);
});

test('legacy GitHub tokens without an acquisition time wait for remote verification', () => {
  assert.equal(shouldRefreshToken({ expires_in: 28800, refresh_token: 'refresh' }, 999999), false);
});

test('rotated credentials preserve omitted refresh and scope metadata', () => {
  const previous = { access_token: 'old', refresh_token: 'keep', scope: 'repo', requested_scope: 'repo' };
  const next = mergeRotatedToken(previous, { access_token: 'new', expires_in: 28800 }, 1234);
  assert.equal(next.access_token, 'new');
  assert.equal(next.refresh_token, 'keep');
  assert.equal(next.scope, 'repo');
  assert.equal(next.requested_scope, 'repo');
  assert.equal(next.obtained_at, 1234);
});
