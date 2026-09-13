const test = require('node:test');
const assert = require('node:assert/strict');
const { createPtyMessageSender } = require('./pty-message');

test('messages go only to their agent and preserve spaces, Unicode and pasted newlines', async () => {
  const writes = { a: [], b: [] };
  const sessions = new Map(Object.keys(writes).map(id => [id, { pty: { write: text => writes[id].push(text) } }]));
  const send = createPtyMessageSender(id => sessions.get(id), async () => {});
  assert.equal((await send('b', '  Crée un arbre 🌳\r\n\tavec des feuilles  ', true)).success, true);
  assert.deepEqual(writes.a, []);
  assert.deepEqual(writes.b, ['\x1b[200~  Crée un arbre 🌳\n\tavec des feuilles  \x1b[201~', '\r']);
  await send('a', 'Bonjour  Codex', false);
  assert.deepEqual(writes.a, ['Bonjour  Codex', '\r']);
});

test('parallel agents work while duplicate sends to the same agent are blocked', async () => {
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const a = { pty: { write() {} } }, b = { pty: { write() {} } };
  const send = createPtyMessageSender(id => id === 'a' ? a : b, () => barrier);
  const first = send('a', 'Premier', true), other = send('b', 'Autre', true);
  assert.match((await send('a', 'Doublon', true)).error, /déjà en cours/);
  release();
  assert.deepEqual(await Promise.all([first, other]), [{ success: true }, { success: true }]);
});

test('an exited or replaced session never receives a delayed submit', async () => {
  const writes = [];
  let entry = { pty: { write: text => writes.push(text) } };
  const send = createPtyMessageSender(() => entry, async () => { entry = null; });
  assert.match((await send('a', 'Bonjour', true)).error, /session a changé/);
  assert.equal(writes.length, 1);
  assert.match((await send('a', 'Bonjour', true)).error, /arrêté/);
});

test('unsupported multiline and control sequences cannot become extra terminal commands', async () => {
  const writes = [];
  const entry = { pty: { write: text => writes.push(text) } };
  const send = createPtyMessageSender(() => entry, async () => {});
  for (const [text, bracketed] of [['a\nb', false], ['a\tb', false], ['\x1b[201~bad', true], ['  ', true]]) {
    assert.ok((await send('a', text, bracketed)).error);
  }
  assert.deepEqual(writes, []);
});
