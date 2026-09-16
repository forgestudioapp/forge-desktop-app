const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLicenseClient } = require('./license-client');
const response = (body, ok = true) => ({ ok, json: async () => body });

test('signup validates fresh server state and passes the key in the auth transaction', async () => {
  const calls = [];
  const client = createLicenseClient({ url: 'https://example.test', anonKey: 'public-test-key', request: async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return response(url.includes('/rpc/') ? [{ valid: true, license_plan: 'pro' }]
      : { access_token: 'test-session', user: { id: 'user', identities: [{}] } });
  } });
  const result = await client.authenticate('signup', ' buyer@example.test ', 'password', '  test-key  ');
  assert.equal(result.success, true);
  assert.match(calls[0].url, /verify_license_for_signup$/);
  assert.deepEqual(calls[1].body, { email: 'buyer@example.test', password: 'password', data: { forge_license_key: 'TEST-KEY' } });
  assert.equal(calls.length, 2); // No separate, non-atomic consume call.
});

test('claimed, revoked and absent keys never cause an auth signup request', async () => {
  for (const rows of [[], [{ valid: false, license_status: 'claimed' }], [{ valid: false, license_status: 'revoked' }]]) {
    let requests = 0;
    const client = createLicenseClient({ url: '', anonKey: '', request: async url => {
      requests++; assert.match(url, /verify_license_for_signup$/); return response(rows);
    } });
    assert.ok((await client.authenticate('signup', 'a@example.test', 'password', 'KEY')).error);
    assert.equal(requests, 1);
  }
});

test('email confirmation and duplicate accounts never produce a false logged-in session', async () => {
  for (const [data, expected] of [[{ id: 'new', identities: [{}] }, 'confirmationRequired'], [{ user: { id: 'old', identities: [] } }, 'error']]) {
    const client = createLicenseClient({ url: '', anonKey: '', request: async url => response(url.includes('/rpc/') ? [{ valid: true }] : data) });
    const result = await client.authenticate('signup', 'a@example.test', 'password', 'KEY');
    assert.ok(result[expected]); assert.equal(result.session, undefined);
  }
});

test('sign-in requires a real session and does not consume a key', async () => {
  const client = createLicenseClient({ url: '', anonKey: '', request: async url => {
    assert.match(url, /token\?grant_type=password$/); return response({ user: { id: 'x' } });
  } });
  assert.ok((await client.authenticate('signin', 'a@example.test', 'password')).error);
});

test('recovery uses the public auth endpoint without a license or password', async () => {
  const client = createLicenseClient({ url: '', anonKey: '', request: async (url, opts) => {
    assert.match(url, /\/recover$/); assert.deepEqual(JSON.parse(opts.body), { email: 'a@example.test' }); return response({});
  } });
  assert.deepEqual(await client.authenticate('recover', 'a@example.test'), { success: true });
});

test('service failures never return a successful validation or leak server internals', async () => {
  const client = createLicenseClient({ url: '', anonKey: '', request: async () => response({ message: 'private detail' }, false) });
  const result = await client.authenticate('signup', 'a@example.test', 'password', 'KEY');
  assert.ok(result.error); assert.doesNotMatch(result.error, /private detail/);
});
