'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncCapabilityBroker } = require('./sync-capability-broker');

test('Forge verifies only its own sync capability without returning it', async () => {
  const secret = 'a'.repeat(64);
  const broker = createSyncCapabilityBroker(secret, 0);
  const address = await broker.start();
  try {
    const verify = capability => fetch(`http://127.0.0.1:${address.port}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capability }),
      signal: AbortSignal.timeout(2000),
    });
    const accepted = await verify(secret);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { accepted: true });
    const rejected = await verify('b'.repeat(64));
    assert.equal(rejected.status, 403);
    assert.deepEqual(await rejected.json(), { accepted: false });
  } finally { await broker.close(); }
});
