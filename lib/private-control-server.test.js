const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrivateControlServer, constantTimeTokenMatch } = require('./private-control-server');

const TOKEN = 'a'.repeat(64);

test('constantTimeTokenMatch compare uniquement des jetons identiques', () => {
  assert.equal(constantTimeTokenMatch(TOKEN, TOKEN), true);
  assert.equal(constantTimeTokenMatch(TOKEN, TOKEN.slice(1)), false);
  assert.equal(constantTimeTokenMatch(TOKEN, 'b'.repeat(64)), false);
});

test('le serveur privé exige le jeton, refuse Origin et route le JSON', async t => {
  const control = createPrivateControlServer({
    token: TOKEN,
    port: 0,
    handlers: {
      'POST /v1/echo': body => ({ received: body.value }),
    },
    logger: { warn() {} },
  });
  const address = await control.start();
  t.after(() => control.close());
  const endpoint = `http://127.0.0.1:${address.port}/v1/echo`;

  const missing = await fetch(endpoint, { method: 'POST', body: '{}' });
  assert.equal(missing.status, 401);

  const browser = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'https://example.com' },
    body: '{}',
  });
  assert.equal(browser.status, 403);

  const accepted = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'ok' }),
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { received: 'ok' });
});
