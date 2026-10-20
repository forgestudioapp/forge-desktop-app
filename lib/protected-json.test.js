const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProtectedJsonStore } = require('./protected-json');

function fakeStorage(options = {}) {
  return {
    isEncryptionAvailable: () => options.available !== false,
    getSelectedStorageBackend: () => options.backend || 'dpapi',
    encryptString: value => Buffer.from(`protected:${value}`),
    decryptString: buffer => {
      const value = buffer.toString();
      if (options.failDecrypt || !value.startsWith('protected:')) throw new Error('decrypt');
      return value.slice('protected:'.length);
    },
  };
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-protected-json-'));
  return { directory, file: path.join(directory, 'session.json') };
}

test('writes encrypted versioned JSON without plaintext tokens', () => {
  const { file } = fixture();
  const store = createProtectedJsonStore(file, fakeStorage());
  store.write({ access_token: 'secret-token', user: { id: 'user-1' } });
  const raw = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(raw, /secret-token/);
  assert.deepEqual(store.read(), { access_token: 'secret-token', user: { id: 'user-1' } });
});

test('migrates legacy plaintext atomically on first read', () => {
  const { file } = fixture();
  fs.writeFileSync(file, JSON.stringify({ refresh_token: 'legacy-secret' }));
  const store = createProtectedJsonStore(file, fakeStorage());
  assert.equal(store.read().refresh_token, 'legacy-secret');
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /legacy-secret/);
  assert.equal(store.status().protected, true);
});

test('never overwrites plaintext when system encryption is unavailable', () => {
  const { file } = fixture();
  const legacy = JSON.stringify({ access_token: 'keep-me' });
  fs.writeFileSync(file, legacy);
  const store = createProtectedJsonStore(file, fakeStorage({ available: false }));
  assert.throws(() => store.read(), /chiffrement système/i);
  assert.equal(fs.readFileSync(file, 'utf8'), legacy);
  assert.throws(() => store.write({ access_token: 'new' }), /ne sera pas enregistrée en clair/i);
  assert.equal(fs.readFileSync(file, 'utf8'), legacy);
});

test('preserves an unreadable encrypted session for explicit recovery', () => {
  const { file } = fixture();
  fs.writeFileSync(file, JSON.stringify({ version: 1, protection: 'electron-safe-storage', payload: 'AAAA' }));
  const before = fs.readFileSync(file, 'utf8');
  const store = createProtectedJsonStore(file, fakeStorage({ failDecrypt: true }));
  assert.throws(() => store.read(), /conservé/i);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(store.status().stored, true);
  assert.equal(store.status().readable, false);
});
