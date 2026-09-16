const test = require('node:test');
const assert = require('node:assert/strict');
const { createPtyOutputRelay } = require('./pty-output-relay');

function fixture() {
  const data = new Set(), exits = new Set();
  const subscribe = (set, fn) => { set.add(fn); return { dispose: () => set.delete(fn) }; };
  return { data, exits, pty: { onData: fn => subscribe(data, fn), onExit: fn => subscribe(exits, fn) } };
}
const renderer = () => ({ messages: [], isDestroyed: () => false, send(...args) { this.messages.push(args); } });

test('twenty returns to the workspace still deliver each PTY chunk exactly once', () => {
  const { pty, data, exits } = fixture(), sender = renderer();
  const relay = createPtyOutputRelay(pty, 'session', sender, () => {});
  for (let i = 0; i < 20; i++) relay.setSender(sender);
  assert.equal(data.size, 1); assert.equal(exits.size, 1);
  for (const listener of data) listener('response');
  assert.deepEqual(sender.messages, [['pty-data', { sessionId: 'session', data: 'response' }]]);
});

test('new renderer takes over without leaking output to the old page', () => {
  const { pty, data } = fixture(), old = renderer(), current = renderer();
  const relay = createPtyOutputRelay(pty, 'session', old, () => {});
  relay.setSender(current);
  for (const listener of data) listener('new response');
  assert.equal(old.messages.length, 0); assert.equal(current.messages.length, 1);
});

test('exit is delivered once, removes subscriptions and refuses reconnection', () => {
  const { pty, data, exits } = fixture(), sender = renderer(); let count = 0;
  const relay = createPtyOutputRelay(pty, 'session', sender, () => count++);
  for (const listener of [...exits]) listener({ exitCode: 0, signal: 0 });
  assert.equal(count, 1); assert.equal(sender.messages.length, 1);
  assert.equal(data.size, 0); assert.equal(exits.size, 0);
  assert.equal(relay.setSender(renderer()), false);
});

test('renderer closing during send does not crash the PTY callback', () => {
  const { pty, data } = fixture();
  const relay = createPtyOutputRelay(pty, 'session', { isDestroyed: () => false, send() { throw new Error('closed'); } }, () => {});
  for (const listener of data) assert.doesNotThrow(() => listener('chunk'));
  const current = renderer(); relay.setSender(current);
  for (const listener of data) listener('next');
  assert.equal(current.messages.length, 1);
});
