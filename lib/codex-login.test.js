'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createPtyOutputRelay } = require('./pty-output-relay');
const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

function fixture(available = true) {
  const handlers = new Map(), calls = [];
  let killed = 0, exit;
  const sender = new EventEmitter(); sender.isDestroyed = () => false; sender.send = () => {};
  const pty = { kill: () => { killed += 1; exit?.({ exitCode: 0 }); }, onData: () => ({ dispose() {} }), onExit: fn => { exit = fn; return { dispose() {} }; } };
  const source = main.slice(main.indexOf('const PTYS = new Map();'), main.indexOf("ipcMain.handle('pty-create'"));
  vm.runInNewContext(source, {
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    spawnPty: available ? (...args) => { calls.push(args); return pty; } : null,
    process, os: require('node:os'), createPtyOutputRelay,
  });
  return { run: () => handlers.get('codex-login')({ sender }), sender, calls, killed: () => killed };
}

test('Codex login runs inside Forge and deduplicates one renderer session', async () => {
  const f = fixture();
  const first = await f.run(), second = await f.run();
  assert.equal(first.sessionId, second.sessionId);
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0][1].join(' ').includes('codex login'));
  f.sender.emit('did-start-navigation');
  assert.equal(f.killed(), 1);
});

test('Codex login reports a missing integrated terminal', async () => {
  const f = fixture(false);
  assert.match((await f.run()).error, /indisponible/);
});
