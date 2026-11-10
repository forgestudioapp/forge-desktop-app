const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { add, read, remove, compose } = require('./places-manifest');
const { PlaceReservations } = require('./place-reservations');
const { buildStudioBatchCode } = require('./file-sync');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-two-places-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  add(root, { placeId: '101', gameId: '77', placeName: 'Lobby' }, 'lobby');
  add(root, { placeId: '202', gameId: '77', placeName: 'Égypte' }, 'Égypte');
  const put = (name, text) => { const target = path.join(root, ...name.split('/')); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); };
  put('src/ReplicatedStorage/Common.luau', 'return "shared"');
  put('src/places/101/ServerScriptService/Lobby.server.luau', 'print("lobby")');
  put('src/places/202/ServerScriptService/Egypt.server.luau', 'print("egypt")');
  return { root, put };
}
test('temporary two-place project fixture composes shared and place-specific code without touching the other place', t => {
  const { root, put } = fixture(t);
  const lobby = compose(root, read(root), '101');
  const egypt = compose(root, read(root), '202');
  assert.equal(lobby.get('ReplicatedStorage/Common.luau'), 'return "shared"');
  assert.equal(egypt.get('ReplicatedStorage/Common.luau'), 'return "shared"');
  assert.ok(lobby.has('ServerScriptService/Lobby.server.luau'));
  assert.ok(!lobby.has('ServerScriptService/Egypt.server.luau'));
  put('src/places/202/ServerScriptService/Egypt.server.luau', 'print("changed")');
  assert.deepEqual([...compose(root, read(root), '101')], [...lobby]);
  assert.notDeepEqual([...compose(root, read(root), '202')], [...egypt]);
});
test('Studio batch refuses a wrong PlaceId before applying scripts', t => {
  const { root } = fixture(t);
  const code = buildStudioBatchCode([...compose(root, read(root), '101')].map(([filename, source]) => ({ filename, source })), '101', 'a'.repeat(20), 'b'.repeat(20));
  assert.ok(code.indexOf('game.PlaceId') < code.indexOf('local jobs'));
  assert.match(code, /PlaceId différent, synchronisation bloquée/);
});
test('two agents reserve different places; same-place contention and disconnect release', t => {
  const { root } = fixture(t);
  const leases = new PlaceReservations(path.join(root, 'leases.json'));
  const a = leases.acquire('101', 'agent-a', 'Agent A');
  const b = leases.acquire('202', 'agent-b', 'Agent B');
  assert.equal(leases.owner('202').token, b.token);
  assert.throws(() => leases.acquire('101', 'agent-c', 'Agent C'), /Agent A/);
  leases.release('101', a.token);
  assert.equal(leases.acquire('101', 'agent-c', 'Agent C').agentId, 'agent-c');
  assert.equal(leases.owner('202').agentId, 'agent-b');
});
test('removing a link preserves code and excludes it from composition', t => {
  const { root } = fixture(t);
  remove(root, '202');
  assert.equal(read(root).places.length, 1);
  assert.throws(() => compose(root, read(root), '202'), /absent/);
  assert.equal(fs.readFileSync(path.join(root, 'src/places/202/ServerScriptService/Egypt.server.luau'), 'utf8'), 'print("egypt")');
});
test('rejects another universe and shared-specific collisions', t => {
  const { root, put } = fixture(t);
  assert.throws(() => add(root, { placeId: '303', gameId: '88', placeName: 'Pirates' }), /expérience/);
  put('src/places/101/ReplicatedStorage/Common.luau', 'return "different"');
  assert.throws(() => compose(root, read(root), '101'), /Conflit/);
});
