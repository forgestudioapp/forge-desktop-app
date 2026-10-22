const test = require('node:test');
const assert = require('node:assert/strict');
const { hasUsableAccessToken, canRestoreSession, mergeRefreshedSession } = require('./forge-session');

test('an expired Forge session remains restorable when it has a refresh token', () => {
  const session = { access_token: 'old', refresh_token: 'refresh', expires_at: 1, user: { id: 'u1' } };
  assert.equal(hasUsableAccessToken(session, 100000), false);
  assert.equal(canRestoreSession(session), true);
});

test('refresh response keeps identity and rotated credentials safely', () => {
  const previous = { access_token: 'old', refresh_token: 'old-refresh', user: { id: 'u1', email: 'a@example.com' } };
  const merged = mergeRefreshedSession(previous, { access_token: 'new', refresh_token: 'new-refresh', expires_in: 3600 }, 100000);
  assert.equal(merged.access_token, 'new');
  assert.equal(merged.refresh_token, 'new-refresh');
  assert.equal(merged.user.id, 'u1');
  assert.equal(merged.expires_at, 3700);
});

test('refresh response may omit a replacement refresh token', () => {
  const merged = mergeRefreshedSession({ refresh_token: 'keep', user: { id: 'u1' } }, { access_token: 'new' });
  assert.equal(merged.refresh_token, 'keep');
  assert.equal(merged.user.id, 'u1');
});
