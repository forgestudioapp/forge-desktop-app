const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBackgroundRemoval } = require('./background-removal');

function fixture(t, execute) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-rembg-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'models'));
  for (const file of ['python.exe', 'remove-background.py', 'models/u2netp.onnx', "l'image & été.png"]) fs.writeFileSync(path.join(root, file), 'test');
  return { root, service: createBackgroundRemoval({ runtimeDir: root, cacheDir: path.join(root, 'cache'), platform: 'win32', arch: 'x64', execute }) };
}
test('private runtime uses isolated executable and argument array, never a shell or global rembg', async t => {
  const calls = [];
  const { root, service } = fixture(t, (exe, args, options, done) => {
    calls.push({ exe, args, options });
    if (args.at(-1) !== '--check') fs.writeFileSync(args.at(-1), 'PNG');
    done(null, '{}', '');
  });
  const source = path.join(root, "l'image & été.png");
  assert.equal((await service.remove(source)).success, true);
  assert.equal(calls[1].exe, path.join(root, 'python.exe'));
  assert.deepEqual(calls[1].args.slice(0, 2), ['-I', '-B']);
  assert.equal(calls[1].args.at(-2), source);
  assert.equal(calls[1].options.shell, false);
  assert.equal(fs.readFileSync(source, 'utf8'), 'test');
});
test('missing runtime never falls back to installing or running system Python', async () => {
  const service = createBackgroundRemoval({ runtimeDir: 'missing-runtime', cacheDir: 'unused', platform: 'win32', arch: 'x64', execute: () => assert.fail('must not execute') });
  assert.equal((await service.status()).installed, false);
});
test('failure never reports an old output as success and next request remains usable', async t => {
  let fail = true;
  const { root, service } = fixture(t, (exe, args, options, done) => {
    if (args.at(-1) === '--check') return done(null, '{}', '');
    if (fail) return done(new Error('failed'), '', 'bad image');
    fs.writeFileSync(args.at(-1), 'new'); done(null, '{}', '');
  });
  const source = path.join(root, "l'image & été.png");
  fs.writeFileSync(path.join(root, "l'image & été_nobg.png"), 'old');
  assert.equal((await service.remove(source)).success, false);
  fail = false;
  assert.equal((await service.remove(source)).success, true);
});
test('concurrent cutouts are serialized and share a health check', async t => {
  let active = 0, max = 0, checks = 0;
  const { root, service } = fixture(t, (exe, args, options, done) => {
    if (args.at(-1) === '--check') { checks++; return done(null, '{}', ''); }
    max = Math.max(max, ++active);
    setTimeout(() => { fs.writeFileSync(args.at(-1), 'PNG'); active--; done(null, '{}', ''); }, 10);
  });
  const results = await Promise.all([1, 2].map(() => service.remove(path.join(root, "l'image & été.png"))));
  assert.ok(results.every(r => r.success)); assert.equal(max, 1); assert.equal(checks, 1);
});
