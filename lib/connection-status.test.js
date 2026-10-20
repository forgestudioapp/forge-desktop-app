const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyRemoteSession } = require('./connection-status');

test('remote session states distinguish valid, expired and offline', async () => {
  const check = status => verifyRemoteSession(async () => ({ ok: status === 200, status }), 'https://service.test/me', {}, 'Service');
  assert.deepEqual(await check(200), { connected: true, state: 'valid' });
  assert.deepEqual(await check(401), { connected: false, state: 'expired' });
  assert.deepEqual(await check(403), { connected: false, state: 'expired' });
  assert.deepEqual(await check(500), { connected: false, state: 'offline', error: 'Service HTTP 500' });
  assert.deepEqual(await verifyRemoteSession(async () => { throw new Error('C:\\Users\\name\\secret'); }, 'x', {}, 'Service'), {
    connected: false,
    state: 'offline',
    error: 'Service est momentanément injoignable.'
  });
});
